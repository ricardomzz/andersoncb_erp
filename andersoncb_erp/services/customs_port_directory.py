from __future__ import annotations

from typing import Any
from xml.etree import ElementTree as ET

import frappe
from frappe.utils import now_datetime

from andersoncb_erp.integrations.lds import LDSClient, find_text

CUSTOMS_PORT_FIELDS = (
    "code",
    "port_name",
    "city",
    "state",
    "region",
    "airport_iata_code",
    "port_of_unlading",
    "lds_id",
    "raw_payload_xml",
)


def get_lds_client(settings=None) -> LDSClient:
    settings = settings or frappe.get_single("LDS Settings")
    return LDSClient.from_settings(settings)


def parse_customs_port_xml(xml_text: str) -> dict[str, Any]:
    root = ET.fromstring(xml_text)
    return normalize_customs_port_data(
        {
            "code": find_text(root, "Code"),
            "port_name": find_text(root, "Name"),
            "city": find_text(root, "City"),
            "state": find_text(root, "State"),
            "region": find_text(root, "Region"),
            "airport_iata_code": find_text(root, "AirportIATACode"),
            "port_of_unlading": _as_check(find_text(root, "PortOfUnlading")),
            "lds_id": find_text(root, "Id"),
            "raw_payload_xml": xml_text,
        }
    ) or {}


def normalize_customs_port_data(data: dict[str, Any] | None) -> dict[str, Any] | None:
    if not data:
        return None
    normalized = {field: _clean(data.get(field)) for field in CUSTOMS_PORT_FIELDS}
    normalized["code"] = normalized.get("code")
    normalized["port_name"] = normalized.get("port_name") or normalized.get("code")
    if not normalized.get("code"):
        return None
    return normalized


def upsert_customs_port(data: dict[str, Any] | None, synced_on=None):
    normalized = normalize_customs_port_data(data)
    if not normalized:
        return None

    doc = frappe.get_doc("Customs Port", normalized["code"]) if frappe.db.exists("Customs Port", normalized["code"]) else frappe.new_doc("Customs Port")
    for fieldname, value in normalized.items():
        if value in (None, ""):
            continue
        setattr(doc, fieldname, value)

    stamp = synced_on or now_datetime()
    doc.source_active = 1
    doc.last_seen_in_source_on = stamp
    doc.last_synced_on = stamp

    if doc.is_new():
        doc.insert(ignore_permissions=True)
    else:
        doc.save(ignore_permissions=True)
    return doc


def ensure_customs_port(code: str, settings=None):
    code = _clean(code)
    if not code:
        return None
    existing = frappe.db.exists("Customs Port", code)
    if existing:
        return frappe.get_doc("Customs Port", existing)

    client = get_lds_client(settings=settings)
    xml_text = client.fetch_customs_port_by_code_xml(code)
    return upsert_customs_port(parse_customs_port_xml(xml_text))


def backfill_customs_ports_from_entries(settings=None) -> dict[str, int]:
    created = 0
    skipped = 0
    codes = _distinct_port_codes()

    for xml_text in _raw_entry_payloads():
        for data in extract_customs_ports_from_entry_xml(xml_text):
            if frappe.db.exists("Customs Port", data["code"]):
                continue
            if upsert_customs_port(data):
                created += 1

    missing_codes = [code for code in codes if not frappe.db.exists("Customs Port", code)]
    if missing_codes:
        client = get_lds_client(settings=settings)
        for code in missing_codes:
            try:
                xml_text = client.fetch_customs_port_by_code_xml(code)
                if upsert_customs_port(parse_customs_port_xml(xml_text)):
                    created += 1
            except Exception:
                skipped += 1
    return {"created": created, "skipped": skipped, "total": len(codes)}


def extract_customs_ports_from_entry_xml(xml_text: str) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_text)
    results: dict[str, dict[str, Any]] = {}
    for element in root.iter():
        if _localname(element.tag) not in {"PortOfEntry", "PortOfUnlading"}:
            continue
        data = normalize_customs_port_data(
            {
                "code": find_text(element, "Code"),
                "port_name": find_text(element, "Name"),
                "city": find_text(element, "City"),
                "state": find_text(element, "State"),
                "region": find_text(element, "Region"),
                "airport_iata_code": find_text(element, "AirportIATACode"),
                "port_of_unlading": _as_check(find_text(element, "PortOfUnlading")),
                "lds_id": find_text(element, "Id"),
                "raw_payload_xml": ET.tostring(element, encoding="unicode"),
            }
        )
        if data and data["code"] not in results:
            results[data["code"]] = data
    return list(results.values())


def search_customs_ports_local(txt: str, page_len: int = 20) -> list[list[str]]:
    txt = (txt or "").strip()
    filters = {}
    or_filters = []
    if txt:
        or_filters = [
            ["Customs Port", "name", "like", f"%{txt}%"],
            ["Customs Port", "port_name", "like", f"%{txt}%"],
            ["Customs Port", "city", "like", f"%{txt}%"],
            ["Customs Port", "state", "like", f"%{txt}%"],
        ]

    rows = frappe.get_all(
        "Customs Port",
        fields=["name", "port_name", "city", "state"],
        filters=filters,
        or_filters=or_filters or None,
        order_by="name asc",
        limit=page_len,
    )
    return [[row.name, row.port_name or row.name, f"{row.city or ''} {row.state or ''}".strip()] for row in rows]


def _distinct_port_codes() -> list[str]:
    rows = frappe.db.sql(
        """
        select distinct code from (
            select port_of_entry as code from `tabCustoms Entry`
            union
            select port_of_unlading as code from `tabCustoms Entry`
            union
            select port_of_entry as code from `tabEntry Shipment`
            union
            select port_of_unlading as code from `tabEntry Shipment`
        ) ports
        where code is not null and code != ''
        order by code
        """,
        as_dict=True,
    )
    return [row.code for row in rows if row.code]


def _clean(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _as_check(value: Any) -> int:
    normalized = _clean(value)
    if normalized is None:
        return 0
    return 1 if str(normalized).lower() in {"1", "true", "yes"} else 0


def _raw_entry_payloads() -> list[str]:
    return [row.raw_payload_xml for row in frappe.get_all("Customs Entry", fields=["raw_payload_xml"], filters={"raw_payload_xml": ["is", "set"]}, limit=0) if row.raw_payload_xml]


def _localname(tag: str) -> str:
    return tag.split("}", 1)[-1]

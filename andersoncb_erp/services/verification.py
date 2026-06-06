from __future__ import annotations

from typing import Any

import frappe

from andersoncb_erp.services.mapping import parse_entry_xml
from andersoncb_erp.services.master_data import resolve_master_links
from andersoncb_erp.services.sync import get_client

HEADER_FIELDS = (
    "entry_number",
    "filer_code",
    "entry_type",
    "client_ref",
    "entry_date",
    "estimated_entry_date",
    "port_of_entry",
    "port_of_unlading",
    "transport_mode",
    "conveyance_name",
    "trip_identifier",
    "payment_type",
    "bond_type",
    "surety_code",
    "bond_number",
    "house_bill",
    "master_bill",
    "importer_name",
    "importer_number",
)

SHIPMENT_FIELDS = (
    "shipment_no",
    "mode",
    "port_of_entry",
    "port_of_unlading",
    "date_of_arrival",
    "date_of_import",
    "date_of_export",
)

INVOICE_FIELDS = (
    "shipment_no",
    "invoice_number",
    "invoice_date",
    "currency",
    "invoice_amount",
    "vendor_name",
)

ARTICLE_FIELDS = (
    "shipment_no",
    "invoice_number",
    "article_line_no",
    "description",
    "line_item_identifier",
    "country_of_origin",
    "country_of_export",
    "gross_weight",
    "entered_value",
    "harbor_maintenance_fee",
    "merchandise_processing_fee",
)

TARIFF_FIELDS = (
    "shipment_no",
    "invoice_number",
    "article_line_no",
    "line_no",
    "hs_code",
    "description",
    "quantity",
    "uom",
    "entered_value",
    "duty_amount",
    "country_of_origin",
)


def verify_customs_entry_roundtrip(name: str) -> dict[str, Any]:
    doc = frappe.get_doc("Customs Entry", name)
    if not doc.lds_id and not doc.entry_number:
        frappe.throw("Customs Entry must have an LDS id or entry number before it can be verified against LDS.")

    client = get_client()
    if doc.lds_id:
        entry_xml = client.fetch_entry_detail_xml_by_id(doc.lds_id)
    else:
        entry_xml = client.fetch_entry_detail_xml(doc.entry_number, doc.filer_code)

    lds_mapped = parse_entry_xml(entry_xml)
    expected = build_erp_snapshot(doc)
    actual = build_mapped_snapshot(lds_mapped)
    differences = compare_snapshots(expected, actual)

    return {
        "ok": not differences,
        "entry_name": doc.name,
        "entry_number": doc.entry_number,
        "lds_id": doc.lds_id,
        "differences": differences,
        "expected": expected,
        "actual": actual,
    }


def build_erp_snapshot(doc) -> dict[str, Any]:
    return {
        "header": {field: normalize_value(get_value(doc, field)) for field in HEADER_FIELDS},
        "shipments": sorted_rows([normalize_row(row, SHIPMENT_FIELDS) for row in (doc.get("shipments") or [])], shipment_key),
        "invoices": sorted_rows([normalize_row(row, INVOICE_FIELDS) for row in (doc.get("invoices") or [])], invoice_key),
        "articles": sorted_rows([normalize_row(row, ARTICLE_FIELDS) for row in (doc.get("articles") or [])], article_key),
        "tariffs": sorted_rows([normalize_row(row, TARIFF_FIELDS) for row in (doc.get("tariff_lines") or [])], tariff_key),
    }


def build_mapped_snapshot(mapped: dict[str, Any]) -> dict[str, Any]:
    return {
        "header": {field: normalize_value(mapped.get(field)) for field in HEADER_FIELDS},
        "shipments": sorted_rows([normalize_mapping_row(row, SHIPMENT_FIELDS) for row in (mapped.get("shipments") or [])], shipment_key),
        "invoices": sorted_rows([normalize_mapping_row(row, INVOICE_FIELDS) for row in (mapped.get("invoices") or [])], invoice_key),
        "articles": sorted_rows([normalize_mapping_row(row, ARTICLE_FIELDS) for row in (mapped.get("articles") or [])], article_key),
        "tariffs": sorted_rows([normalize_mapping_row(row, TARIFF_FIELDS) for row in (mapped.get("tariff_lines") or [])], tariff_key),
    }


def compare_snapshots(expected: dict[str, Any], actual: dict[str, Any]) -> list[dict[str, Any]]:
    differences: list[dict[str, Any]] = []

    for field, expected_value in expected["header"].items():
        actual_value = actual["header"].get(field)
        if expected_value != actual_value:
            differences.append({
                "section": "header",
                "field": field,
                "expected": expected_value,
                "actual": actual_value,
            })

    compare_row_section("shipments", expected["shipments"], actual["shipments"], shipment_key, differences)
    compare_row_section("invoices", expected["invoices"], actual["invoices"], invoice_key, differences)
    compare_row_section("articles", expected["articles"], actual["articles"], article_key, differences)
    compare_row_section("tariffs", expected["tariffs"], actual["tariffs"], tariff_key, differences)
    return differences


def compare_row_section(section: str, expected_rows: list[dict[str, Any]], actual_rows: list[dict[str, Any]], key_fn, differences: list[dict[str, Any]]):
    expected_map = {key_fn(row): row for row in expected_rows}
    actual_map = {key_fn(row): row for row in actual_rows}

    for key, expected_row in expected_map.items():
        if key not in actual_map:
            differences.append({"section": section, "key": key, "expected": expected_row, "actual": None, "kind": "missing_in_lds"})
            continue
        actual_row = actual_map[key]
        for field, expected_value in expected_row.items():
            actual_value = actual_row.get(field)
            if field in ("entered_value", "duty_amount", "harbor_maintenance_fee", "merchandise_processing_fee") and expected_value in (0, 0.0, None) and actual_value in (0, 0.0, None):
                continue
            if expected_value != actual_value:
                differences.append({
                    "section": section,
                    "key": key,
                    "field": field,
                    "expected": expected_value,
                    "actual": actual_value,
                    "kind": "value_mismatch",
                })

    for key, actual_row in actual_map.items():
        if key not in expected_map:
            differences.append({"section": section, "key": key, "expected": None, "actual": actual_row, "kind": "unexpected_in_lds"})


def normalize_row(row, fields: tuple[str, ...]) -> dict[str, Any]:
    return {field: normalize_value(get_value(row, field)) for field in fields}


def normalize_mapping_row(row: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    return {field: normalize_value(row.get(field)) for field in fields}


def get_value(row, fieldname: str):
    if isinstance(row, dict):
        return row.get(fieldname)
    if hasattr(row, fieldname):
        return getattr(row, fieldname)
    getter = getattr(row, "get", None)
    if callable(getter):
        return getter(fieldname)
    return None


def normalize_value(value: Any):
    if value in (None, ""):
        return None
    if isinstance(value, float):
        return round(value, 4)
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return round(float(text), 4)
    except (TypeError, ValueError):
        return text


def sorted_rows(rows: list[dict[str, Any]], key_fn):
    return sorted(rows, key=key_fn)


def shipment_key(row: dict[str, Any]):
    return (row.get("shipment_no") or "",)


def invoice_key(row: dict[str, Any]):
    return (row.get("shipment_no") or "", row.get("invoice_number") or "")


def article_key(row: dict[str, Any]):
    return (
        row.get("shipment_no") or "",
        row.get("invoice_number") or "",
        row.get("article_line_no") or "",
        row.get("line_item_identifier") or "",
        row.get("description") or "",
    )


def tariff_key(row: dict[str, Any]):
    return (
        row.get("shipment_no") or "",
        row.get("invoice_number") or "",
        row.get("article_line_no") or "",
        row.get("line_no") or "",
        row.get("hs_code") or "",
    )

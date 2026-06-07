from __future__ import annotations

from typing import Any
from xml.etree import ElementTree as ET

import frappe

from andersoncb_erp.integrations.lds import LDSClient, find_text


def get_lds_client(settings=None) -> LDSClient:
    settings = settings or frappe.get_single("LDS Settings")
    return LDSClient.from_settings(settings)


def search_harmonized_tariffs(txt: str, page_len: int = 10) -> list[dict[str, str]]:
    txt = (txt or "").strip()
    if not txt:
        return []

    rows = _search_local_tariffs(txt, page_len=page_len)
    seen_codes = {row["code"] for row in rows if row.get("code")}

    # If the operator typed a full code we do not already know locally,
    # try the currently-connected LDS environment as an authoritative fallback.
    if _looks_like_hs_code(txt) and txt not in seen_codes and len(rows) < page_len:
        fetched = _fetch_tariff_by_code(txt)
        if fetched:
            rows.insert(0, fetched)

    return rows[:page_len]


def _search_local_tariffs(txt: str, page_len: int) -> list[dict[str, str]]:
    pattern = f"%{txt}%"
    rows = frappe.db.sql(
        """
        select
            hs_code as code,
            max(coalesce(description, '')) as description
        from `tabEntry Tariff Line`
        where coalesce(hs_code, '') != ''
          and (
            hs_code like %(pattern)s
            or coalesce(description, '') like %(pattern)s
          )
        group by hs_code
        order by
            case when hs_code = %(exact)s then 0 else 1 end,
            hs_code asc
        limit %(limit)s
        """,
        {"pattern": pattern, "exact": txt, "limit": int(page_len)},
        as_dict=True,
    )
    return [
        {
            "code": (row.code or "").strip(),
            "description": (row.description or "").strip(),
        }
        for row in rows
        if (row.code or "").strip()
    ]


def _fetch_tariff_by_code(code: str) -> dict[str, str] | None:
    try:
        xml_text = get_lds_client().fetch_harmonized_tariff_by_code_xml(code)
    except Exception:
        return None

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return None

    normalized_code = _clean(find_text(root, "Code")) or code
    description = (
        _clean(find_text(root, "Description"))
        or _clean(find_text(root, "Name"))
        or _clean(find_text(root, "Text"))
        or ""
    )
    if not normalized_code:
        return None
    return {"code": normalized_code, "description": description}


def _clean(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _looks_like_hs_code(value: str) -> bool:
    compact = "".join(ch for ch in value if ch.isalnum())
    return bool(compact) and compact.isdigit() and len(compact) >= 6

from __future__ import annotations

from typing import Any

import frappe

from andersoncb_erp.services.dotnet_possible_values import get_authoritative_possible_values


REFERENCE_DOCTYPES = {
    "Customs Entry Type": "customs_entry.entry_type",
    "Transportation Mode": "customs_entry.transport_mode",
    "Payment Type": "customs_entry.payment_type",
    "Bond Type": "customs_entry.bond_type",
}


def sync_business_code_reference_data() -> dict[str, int]:
    values = get_authoritative_possible_values()
    created = 0
    updated = 0

    for doctype, mapping_key in REFERENCE_DOCTYPES.items():
        for item in values.get(mapping_key, []):
            code = (item.get("code") or "").strip()
            if not code:
                continue
            label = (item.get("label") or code).strip()
            description = (item.get("description") or "").strip() or None

            if frappe.db.exists(doctype, code):
                doc = frappe.get_doc(doctype, code)
                changed = False
                if doc.label != label:
                    doc.label = label
                    changed = True
                if (doc.description or None) != description:
                    doc.description = description
                    changed = True
                if changed:
                    doc.save(ignore_permissions=True)
                    updated += 1
            else:
                doc = frappe.new_doc(doctype)
                doc.code = code
                doc.label = label
                doc.description = description
                doc.insert(ignore_permissions=True)
                created += 1

    return {"created": created, "updated": updated}


def get_reference_options(doctype: str) -> list[dict[str, Any]]:
    rows = frappe.get_all(doctype, fields=["name", "code", "label", "description"], order_by="code asc", limit=0)
    return [
        {
            "code": row.code or row.name,
            "label": row.label or row.code or row.name,
            "description": row.description,
        }
        for row in rows
    ]

from __future__ import annotations

import frappe

from andersoncb_erp.services.mapping import parse_entry_xml
from andersoncb_erp.services.sync import derive_entry_status, derive_liquidation_status, derive_psc_status


FIELDS_TO_COPY = (
    "entry_date",
    "estimated_entry_date",
    "filing_date",
    "preliminary_statement_print_date",
    "arrival_date",
    "port_of_entry",
    "port_of_unlading",
    "conveyance_name",
    "trip_identifier",
    "payment_type",
    "bond_type",
    "surety_code",
    "importer_lds_id",
    "creator_lds_id",
    "created_by",
    "bond_number",
)

SHIPMENT_FIELDS_TO_COPY = (
    "destination",
    "port_of_entry",
    "port_of_unlading",
    "arrival_date",
    "date_of_arrival",
    "date_of_import",
    "date_of_export",
)


def execute():
    rows = frappe.get_all(
        "Customs Entry",
        filters={"raw_payload_xml": ["is", "set"]},
        fields=["name", "source_active", "raw_payload_xml"],
        limit_page_length=0,
    )
    for row in rows:
        mapped = parse_entry_xml(row.raw_payload_xml)
        updates = {
            "status": derive_entry_status(mapped, source_active=row.source_active),
            "psc_status": derive_psc_status(mapped),
            "liquidation_status": derive_liquidation_status(mapped),
        }
        for fieldname in FIELDS_TO_COPY:
            updates[fieldname] = mapped.get(fieldname)
        frappe.db.set_value("Customs Entry", row.name, updates, update_modified=False)

        doc = frappe.get_doc("Customs Entry", row.name)
        mapped_shipments = mapped.get("shipments") or []
        existing_shipments = doc.get("shipments") or []
        if len(existing_shipments) != len(mapped_shipments):
            doc.set("shipments", mapped_shipments)
            if doc.docstatus == 1:
                doc.flags.ignore_validate_update_after_submit = True
            doc.save(ignore_permissions=True)
            continue

        for existing_row, mapped_row in zip(existing_shipments, mapped_shipments):
            shipment_updates = {}
            for fieldname in SHIPMENT_FIELDS_TO_COPY:
                shipment_updates[fieldname] = mapped_row.get(fieldname)
            frappe.db.set_value(existing_row.doctype, existing_row.name, shipment_updates, update_modified=False)

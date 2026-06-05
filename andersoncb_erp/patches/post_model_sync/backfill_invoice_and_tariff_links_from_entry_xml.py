import time

import frappe

from andersoncb_erp.services.mapping import parse_entry_xml


MAX_ATTEMPTS = 5


def execute():
    names = frappe.get_all(
        "Customs Entry",
        filters={"raw_payload_xml": ["is", "set"]},
        pluck="name",
        limit=0,
    )
    for name in names:
        _backfill_with_retry(name)


def _backfill_with_retry(name: str):
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            doc = frappe.get_doc("Customs Entry", name)
            mapped = parse_entry_xml(doc.raw_payload_xml)
            doc.set("invoices", mapped.get("invoices") or [])
            doc.set("tariff_lines", mapped.get("tariff_lines") or [])
            if doc.docstatus == 1:
                doc.flags.ignore_validate_update_after_submit = True
            doc.save(ignore_permissions=True)
            frappe.db.commit()
            return
        except frappe.QueryDeadlockError:
            frappe.db.rollback()
            if attempt >= MAX_ATTEMPTS:
                raise
            time.sleep(0.1 * attempt)

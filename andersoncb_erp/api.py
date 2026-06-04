import frappe

from andersoncb_erp.services.submission import create_draft_from_entry, submit_entry_to_lds
from andersoncb_erp.services.sync import (
    refresh_customs_entry,
    run_initial_full_sync,
    run_rolling_window_sync,
)


@frappe.whitelist()
def run_initial_sync():
    return run_initial_full_sync()


@frappe.whitelist()
def run_rolling_sync():
    return run_rolling_window_sync(triggered_by_scheduler=False)


@frappe.whitelist()
def refresh_entry(name: str):
    return refresh_customs_entry(name)


@frappe.whitelist()
def create_entry_draft(source_name: str):
    return create_draft_from_entry(source_name)


@frappe.whitelist()
def submit_entry(name: str):
    return submit_entry_to_lds(name)


@frappe.whitelist()
def repair_failed_draft(name: str):
    doc = frappe.get_doc("Customs Entry", name)
    doc.check_permission("write")
    if doc.lds_id:
        frappe.throw("Only unsynced failed drafts can be repaired.")
    frappe.db.set_value("Customs Entry", doc.name, {"docstatus": 0, "status": "Draft"}, update_modified=False)
    for child_field in ("shipments", "invoices", "fees", "events", "tariff_lines", "references"):
        for row in doc.get(child_field) or []:
            frappe.db.set_value(row.doctype, row.name, "docstatus", 0, update_modified=False)
    frappe.db.commit()
    return {"ok": True, "name": doc.name}

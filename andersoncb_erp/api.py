import frappe

from andersoncb_erp.services.customs_port_directory import ensure_customs_port, search_customs_ports_local
from andersoncb_erp.services.harmonized_tariff_directory import search_harmonized_tariffs as search_harmonized_tariffs_local
from andersoncb_erp.services.dotnet_possible_values import get_authoritative_possible_values
from andersoncb_erp.services.party_submission import submit_carrier_to_lds, submit_importer_profile_to_lds
from andersoncb_erp.services.purge import purge_lds_synced_data
from andersoncb_erp.services.submission import create_draft_from_entry, submit_entry_to_lds
from andersoncb_erp.services.verification import verify_customs_entry_roundtrip
from andersoncb_erp.services.ui_test_case_catalog import get_test_case, load_execution_prep_snapshot, load_test_case_catalog
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
def submit_importer_profile(name: str):
    return submit_importer_profile_to_lds(name)


@frappe.whitelist()
def submit_carrier(name: str):
    return submit_carrier_to_lds(name)


@frappe.whitelist()
def repair_failed_draft(name: str):
    doc = frappe.get_doc("Customs Entry", name)
    doc.check_permission("write")
    if doc.lds_id:
        frappe.throw("Only unsynced failed drafts can be repaired.")
    frappe.db.set_value("Customs Entry", doc.name, {"docstatus": 0, "status": "Draft"}, update_modified=False)
    for child_field in ("shipments", "invoices", "articles", "fees", "events", "tariff_lines", "references"):
        for row in doc.get(child_field) or []:
            frappe.db.set_value(row.doctype, row.name, "docstatus", 0, update_modified=False)
    frappe.db.commit()
    return {"ok": True, "name": doc.name}


@frappe.whitelist()
def purge_lds_data():
    return purge_lds_synced_data()

@frappe.whitelist()
def get_business_code_mappings():
    return get_authoritative_possible_values()

@frappe.whitelist()
def search_customs_ports(doctype, txt, searchfield, start, page_len, filters=None):
    rows = search_customs_ports_local(txt, page_len=int(page_len or 20))
    if not rows and txt:
        try:
            ensure_customs_port(txt)
        except Exception:
            pass
        rows = search_customs_ports_local(txt, page_len=int(page_len or 20))
    return rows



@frappe.whitelist()
def search_harmonized_tariffs(txt: str, page_len: int = 10):
    return search_harmonized_tariffs_local(txt, page_len=int(page_len or 10))


@frappe.whitelist()
def verify_entry_roundtrip(name: str):
    return verify_customs_entry_roundtrip(name)


@frappe.whitelist()
def get_customs_entry_test_cases():
    return load_test_case_catalog()


@frappe.whitelist()
def get_customs_entry_test_case(case_id: str):
    return get_test_case(case_id)


@frappe.whitelist()
def get_customs_entry_execution_prep():
    return load_execution_prep_snapshot()

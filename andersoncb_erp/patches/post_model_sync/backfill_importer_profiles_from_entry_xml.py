import time

import frappe

from andersoncb_erp.services.sync import relink_master_data_from_existing_entry


MAX_ATTEMPTS = 5


def execute():
    names = frappe.get_all(
        "Customs Entry",
        filters={"raw_payload_xml": ["is", "set"]},
        pluck="name",
        limit=0,
    )
    for name in names:
        _relink_with_retry(name)


def _relink_with_retry(name: str):
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            relink_master_data_from_existing_entry(frappe.get_doc("Customs Entry", name))
            frappe.db.commit()
            return
        except frappe.QueryDeadlockError:
            frappe.db.rollback()
            if attempt >= MAX_ATTEMPTS:
                raise
            time.sleep(0.1 * attempt)

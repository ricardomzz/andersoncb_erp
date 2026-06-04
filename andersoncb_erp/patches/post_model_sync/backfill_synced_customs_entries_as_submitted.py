from __future__ import annotations

import frappe


def execute():
    names = frappe.get_all(
        "Customs Entry",
        filters={"docstatus": 0, "lds_id": ["is", "set"]},
        pluck="name",
    )
    for name in names:
        frappe.db.set_value("Customs Entry", name, "docstatus", 1, update_modified=False)

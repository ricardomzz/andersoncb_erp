from __future__ import annotations

import frappe

from andersoncb_erp.services.sync import relink_master_data_from_existing_entry


def execute():
    names = frappe.get_all('Customs Entry', fields=['name'], filters={'raw_payload_xml': ['is', 'set']}, pluck='name')
    for name in names:
        doc = frappe.get_doc('Customs Entry', name)
        relink_master_data_from_existing_entry(doc)

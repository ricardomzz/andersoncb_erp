from __future__ import annotations

import frappe
from frappe.model.document import Document

from andersoncb_erp.services.dis_submission import process_dis_document_submission
from andersoncb_erp.services.submission import (
    generate_draft_entry_number,
    is_draft_placeholder_entry_number,
    persist_submission_failure,
    process_lds_submission,
)


class CustomsEntry(Document):
    def autoname(self):
        if self.entry_number and not is_draft_placeholder_entry_number(self.entry_number):
            self.name = self.entry_number
            return

        if not self.entry_number or not is_draft_placeholder_entry_number(self.entry_number):
            self.entry_number = generate_draft_entry_number()
        self.name = self.entry_number

    def validate(self):
        if self.docstatus == 0 and not self.lds_id:
            self.status = 'Draft'
            self.source_active = 0
        elif self.docstatus == 0 and not self.status:
            self.status = 'Draft'

        if self.docstatus == 0 and (not self.entry_number or is_draft_placeholder_entry_number(self.entry_number)):
            self.entry_number = self.entry_number or generate_draft_entry_number()
            if not self.name or is_draft_placeholder_entry_number(self.name):
                self.name = self.entry_number

        self._sync_linked_party_display_fields()

    def before_submit(self):
        if getattr(self.flags, 'skip_lds_submission', False):
            return

        try:
            process_lds_submission(self)
            process_dis_document_submission(self)
        except frappe.ValidationError as exc:
            persist_submission_failure(self, str(exc), payload=getattr(self, 'lds_last_submission_payload', None))
            raise

    def on_submit(self):
        if self.entry_number and self.name != self.entry_number and not is_draft_placeholder_entry_number(self.entry_number):
            frappe.rename_doc(
                self.doctype,
                self.name,
                self.entry_number,
                force=True,
                show_alert=False,
            )

    def _sync_linked_party_display_fields(self):
        if self.importer_profile:
            profile = frappe.get_cached_doc('Importer Profile', self.importer_profile)
            self.importer_name = profile.display_name
            self.importer_number = profile.importer_code or profile.cbp_number or profile.irs_number

        for row in self.get('shipments') or []:
            if row.carrier_profile:
                carrier = frappe.get_cached_doc('Carrier', row.carrier_profile)
                row.carrier = carrier.display_name

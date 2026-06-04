from __future__ import annotations

import frappe
from frappe.model.document import Document

from andersoncb_erp.services.party_submission import (
    persist_party_submission_failure,
    process_importer_profile_submission,
)


class ImporterProfile(Document):
    def validate(self):
        if self.docstatus == 0 and not self.lds_id:
            self.status = 'Draft'
            self.source_active = 0
        elif self.docstatus == 1 and not self.status:
            self.status = 'Submitted'

    def before_submit(self):
        if getattr(self.flags, 'skip_lds_submission', False):
            return
        try:
            process_importer_profile_submission(self)
        except frappe.ValidationError as exc:
            persist_party_submission_failure(self, str(exc), payload=getattr(self, 'lds_last_submission_payload', None))
            raise

from __future__ import annotations

from frappe.model.document import Document


class LDSSettings(Document):
	def validate(self):
		self.sync_frequency_minutes = int(self.sync_frequency_minutes or 15)
		self.rolling_window_days = int(self.rolling_window_days or 90)
		self.page_size = int(self.page_size or 100)
		if self.sync_frequency_minutes <= 0:
			self.sync_frequency_minutes = 15
		if self.rolling_window_days <= 0:
			self.rolling_window_days = 90
		if self.page_size <= 0:
			self.page_size = 100

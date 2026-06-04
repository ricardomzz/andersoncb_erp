from frappe import _


def get_data():
	return [
		{
			"label": _("Setup"),
			"items": [
				{"type": "doctype", "name": "LDS Settings", "label": _("LDS Settings")},
			],
		},
		{
			"label": _("Operations"),
			"items": [
				{"type": "doctype", "name": "Customs Entry", "label": _("Customs Entries")},
			],
		},
	]

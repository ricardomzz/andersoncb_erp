from frappe import _


def get_data():
	return [
		{
			"label": _("Setup"),
			"items": [
				{"type": "doctype", "name": "LDS Settings", "label": _("LDS Settings")},
				{"type": "doctype", "name": "Importer Profile", "label": _("Importer Profiles")},
				{"type": "doctype", "name": "Carrier", "label": _("Carriers")},
			],
		},
		{
			"label": _("Operations"),
			"items": [
				{"type": "doctype", "name": "Customs Entry", "label": _("Customs Entries")},
			],
		},
	]

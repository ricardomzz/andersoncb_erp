from __future__ import annotations

import frappe

ENTRY_CHILD_FIELDS = ("shipments", "invoices", "articles", "fees", "events", "tariff_lines", "references")


def purge_lds_synced_data() -> dict[str, int]:
	frappe.only_for("System Manager")

	entry_names = _get_names("Customs Entry", {"lds_id": ["is", "set"]})
	importer_names = _get_names("Importer Profile", {"lds_id": ["is", "set"]})
	carrier_names = _get_names("Carrier", {"lds_id": ["is", "set"]})

	if importer_names:
		_clear_importer_links(importer_names, set(entry_names))
	if carrier_names:
		_clear_carrier_links(carrier_names, set(entry_names))

	deleted_entries = _delete_docs("Customs Entry", entry_names)
	deleted_importers = _delete_docs("Importer Profile", importer_names)
	deleted_carriers = _delete_docs("Carrier", carrier_names)

	frappe.db.commit()

	return {
		"deleted_customs_entries": deleted_entries,
		"deleted_importer_profiles": deleted_importers,
		"deleted_carriers": deleted_carriers,
	}


def _get_names(doctype: str, filters: dict) -> list[str]:
	return frappe.get_all(doctype, filters=filters, pluck="name")



def _clear_importer_links(importer_names: list[str], deleted_entry_names: set[str]) -> None:
	rows = frappe.get_all(
		"Customs Entry",
		filters={"importer_profile": ["in", importer_names]},
		fields=["name", "docstatus"],
	)
	for row in rows:
		if row.name in deleted_entry_names:
			continue
		updates = {"importer_profile": None}
		frappe.db.set_value("Customs Entry", row.name, updates, update_modified=False)



def _clear_carrier_links(carrier_names: list[str], deleted_entry_names: set[str]) -> None:
	rows = frappe.get_all(
		"Entry Shipment",
		filters={"carrier_profile": ["in", carrier_names]},
		fields=["name", "parent"],
	)
	for row in rows:
		if row.parent in deleted_entry_names:
			continue
		frappe.db.set_value("Entry Shipment", row.name, {"carrier_profile": None}, update_modified=False)



def _delete_docs(doctype: str, names: list[str]) -> int:
	deleted = 0
	for name in names:
		if not frappe.db.exists(doctype, name):
			continue
		_unlock_if_submitted(doctype, name)
		frappe.delete_doc(doctype, name, ignore_permissions=True, force=1, delete_permanently=True)
		deleted += 1
	return deleted



def _unlock_if_submitted(doctype: str, name: str) -> None:
	if frappe.db.get_value(doctype, name, 'docstatus') != 1:
		return
	frappe.db.set_value(doctype, name, {'docstatus': 0}, update_modified=False)

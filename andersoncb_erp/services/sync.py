from __future__ import annotations

from datetime import timedelta
from typing import Any
from xml.etree import ElementTree as ET

import frappe
from frappe.utils import add_to_date, now_datetime

from andersoncb_erp.integrations.lds import LDSClient
from andersoncb_erp.services.mapping import parse_entry_xml
from andersoncb_erp.services.master_data import resolve_master_links
from andersoncb_erp.services.party_sync import sync_carriers, sync_importer_profiles
from andersoncb_erp.services.schema import ensure_large_money_columns

STATUS_IDLE = "Idle"
STATUS_RUNNING = "Running"
STATUS_SUCCEEDED = "Succeeded"
STATUS_FAILED = "Failed"

CHILD_TABLE_FIELDS = ("shipments", "invoices", "articles", "fees", "events", "tariff_lines", "references")


def normalize_source_status(value: str | None) -> str | None:
	if not value:
		return None
	text = str(value).strip()
	if not text:
		return None
	return " ".join(part.capitalize() for part in text.replace("_", " ").split())


def has_true_xml_flag(raw_payload_xml: str | None, tag_name: str) -> bool:
	raw_text = raw_payload_xml or ""
	if not raw_text:
		return False
	try:
		root = ET.fromstring(raw_text)
	except ET.ParseError:
		return False
	for element in root.iter():
		if localname(element.tag) != tag_name:
			continue
		text = (element.text or '').strip().lower()
		if text == 'true':
			return True
	return False


def localname(tag: str) -> str:
	return tag.split('}', 1)[-1]



def derive_entry_status(data: dict[str, Any], source_active: int | bool | None = None) -> str:
	active_flag = data.get("source_active") if source_active is None else source_active
	if active_flag in (0, False, "0"):
		return "Archived"

	explicit_status = normalize_source_status(data.get("status"))
	if explicit_status in {"Imported", "Entered", "Filed", "Released", "Archived"}:
		return explicit_status

	if data.get("release_date"):
		return "Released"
	if data.get("filing_date") or data.get("preliminary_statement_print_date"):
		return "Filed"
	if data.get("entry_date") or data.get("estimated_entry_date"):
		return "Entered"
	return "Imported"


def derive_psc_status(data: dict[str, Any]) -> str:
	if data.get("psc_accelerated_liquidation_flag") or has_true_xml_flag(data.get("raw_payload_xml"), "PostSummaryCorrectionAcceleratedLiquidation"):
		return "PSC Accelerated Liquidation"
	if data.get("psc_flag") or has_true_xml_flag(data.get("raw_payload_xml"), "PostSummaryCorrection"):
		return "PSC"
	return "None"



def derive_liquidation_status(data: dict[str, Any]) -> str:
	if data.get("liquidation_date"):
		return "Liquidated"
	return "Not Liquidated"


def get_client(settings=None) -> LDSClient:
	settings = settings or frappe.get_single("LDS Settings")
	return LDSClient.from_settings(settings)


def run_initial_full_sync() -> dict[str, Any]:
	ensure_large_money_columns()
	settings = frappe.get_single("LDS Settings")
	return _run_sync(settings=settings, mode="full")


def run_rolling_window_sync(triggered_by_scheduler: bool = True) -> dict[str, Any] | None:
	ensure_large_money_columns()
	settings = frappe.get_single("LDS Settings")
	if triggered_by_scheduler and not should_run_scheduled_sync(settings, now_datetime()):
		return None
	return _run_sync(settings=settings, mode="rolling")


def run_scheduled_rolling_sync() -> dict[str, Any] | None:
	return run_rolling_window_sync(triggered_by_scheduler=True)


def refresh_customs_entry(name: str):
	settings = frappe.get_single("LDS Settings")
	entry = frappe.get_doc("Customs Entry", name)
	client = get_client(settings)
	if entry.lds_id:
		entry_xml = client.fetch_entry_detail_xml_by_id(entry.lds_id)
	else:
		entry_xml = client.fetch_entry_detail_xml(entry.entry_number, filer_code=entry.filer_code or settings.default_filer_code)
	return _upsert_customs_entry_xml(entry_xml, fallback_filer_code=entry.filer_code or settings.default_filer_code)


def should_run_scheduled_sync(settings, current_time) -> bool:
	if not int(settings.sync_enabled or 0):
		return False
	last_finished = settings.last_window_sync_finished_on or settings.last_window_sync_started_on
	if not last_finished:
		return True
	frequency = int(settings.sync_frequency_minutes or 15)
	due_at = last_finished + timedelta(minutes=frequency)
	return current_time >= due_at


def archive_entry_numbers_for_scope(records: list[dict[str, Any]], seen_entry_numbers: set[str]) -> list[str]:
	to_archive = []
	for record in records:
		entry_number = record.get("entry_number")
		if entry_number and entry_number not in seen_entry_numbers:
			to_archive.append(entry_number)
	return to_archive


def _run_sync(settings, mode: str) -> dict[str, Any]:
	client = get_client(settings)
	started_on = now_datetime()
	processed = 0
	archived = 0
	seen_entry_numbers: set[str] = set()
	_run_status_update(settings, mode, STATUS_RUNNING, started_on=started_on, error=None)
	try:
		page_size = int(settings.page_size or 100)
		rolling_window_days = int(settings.rolling_window_days or 90) if mode == "rolling" else None
		importers_synced = sync_importer_profiles(settings=settings, client=client, page_size=page_size)
		carriers_synced = sync_carriers(settings=settings, client=client, page_size=page_size)
		for summary in client.iter_entry_summaries(page_size=page_size, rolling_window_days=rolling_window_days):
			doc = _upsert_customs_entry_xml(summary.raw_xml, fallback_filer_code=summary.filer_code or settings.default_filer_code)
			seen_entry_numbers.add(doc.entry_number)
			processed += 1
		archived = _archive_missing_entries(mode=mode, seen_entry_numbers=seen_entry_numbers, rolling_window_days=rolling_window_days)
		finished_on = now_datetime()
		_run_status_update(settings, mode, STATUS_SUCCEEDED, finished_on=finished_on, successful_on=finished_on, error=None)
		return {"mode": mode, "processed": processed, "archived": archived, "importers_synced": importers_synced, "carriers_synced": carriers_synced}
	except Exception as exc:
		finished_on = now_datetime()
		_run_status_update(settings, mode, STATUS_FAILED, finished_on=finished_on, error=str(exc))
		frappe.log_error(title="Customs Entries Sync Failed", message=frappe.get_traceback())
		raise


def _run_status_update(settings, mode: str, status: str, started_on=None, finished_on=None, successful_on=None, error=None):
	if mode == "full":
		if started_on is not None:
			settings.last_full_sync_started_on = started_on
		if finished_on is not None:
			settings.last_full_sync_finished_on = finished_on
		if successful_on is not None:
			settings.last_full_sync_finished_on = successful_on
		settings.last_full_sync_status = status
		settings.last_full_sync_error = error
	else:
		if started_on is not None:
			settings.last_window_sync_started_on = started_on
		if finished_on is not None:
			settings.last_window_sync_finished_on = finished_on
		if successful_on is not None:
			settings.last_window_sync_finished_on = successful_on
		settings.last_window_sync_status = status
		settings.last_window_sync_error = error
	settings.save(ignore_permissions=True)


def _upsert_customs_entry_xml(entry_xml: str, fallback_filer_code: str | None = None):
	mapped = parse_entry_xml(entry_xml)
	if fallback_filer_code and not mapped.get('filer_code'):
		mapped['filer_code'] = fallback_filer_code
	mapped = resolve_master_links(mapped, synced_on=now_datetime(), create_missing=True)
	mapped['status'] = derive_entry_status(mapped, source_active=1)
	mapped['psc_status'] = derive_psc_status(mapped)
	mapped['liquidation_status'] = derive_liquidation_status(mapped)
	entry_number = mapped['entry_number']
	existing_name = frappe.db.exists('Customs Entry', {'entry_number': entry_number})
	doc = frappe.get_doc('Customs Entry', existing_name) if existing_name else frappe.new_doc('Customs Entry')
	for fieldname, value in mapped.items():
		if fieldname in CHILD_TABLE_FIELDS:
			continue
		setattr(doc, fieldname, value)
	doc.archived_on = None
	doc.last_seen_in_source_on = now_datetime()
	doc.last_synced_on = now_datetime()
	for child_field in CHILD_TABLE_FIELDS:
		doc.set(child_field, mapped[child_field])
	if existing_name:
		if doc.docstatus == 1:
			doc.flags.ignore_validate_update_after_submit = True
		doc.save(ignore_permissions=True)
	else:
		doc.insert(ignore_permissions=True)
	if doc.docstatus == 0:
		frappe.db.set_value('Customs Entry', doc.name, 'docstatus', 1, update_modified=False)
		doc.docstatus = 1
	return doc


def relink_master_data_from_existing_entry(doc):
	if not doc.raw_payload_xml:
		return doc
	mapped = parse_entry_xml(doc.raw_payload_xml)
	mapped = resolve_master_links(mapped, synced_on=doc.last_synced_on or doc.modified, create_missing=True)
	entry_updates = {}
	if mapped.get('importer_profile') and doc.importer_profile != mapped.get('importer_profile'):
		entry_updates['importer_profile'] = mapped.get('importer_profile')
	if mapped.get('importer_name') and doc.importer_name != mapped.get('importer_name'):
		entry_updates['importer_name'] = mapped.get('importer_name')
	if mapped.get('importer_number') and doc.importer_number != mapped.get('importer_number'):
		entry_updates['importer_number'] = mapped.get('importer_number')
	if entry_updates:
		frappe.db.set_value('Customs Entry', doc.name, entry_updates, update_modified=False)
	for existing_row, mapped_row in zip(doc.get('shipments') or [], mapped.get('shipments') or []):
		updates = {}
		carrier_profile = mapped_row.get('carrier_profile')
		carrier_name = mapped_row.get('carrier')
		if carrier_profile and existing_row.carrier_profile != carrier_profile:
			updates['carrier_profile'] = carrier_profile
		if carrier_name and existing_row.carrier != carrier_name:
			updates['carrier'] = carrier_name
		if updates:
			frappe.db.set_value(existing_row.doctype, existing_row.name, updates, update_modified=False)
	frappe.db.commit()
	return doc


def _archive_missing_entries(mode: str, seen_entry_numbers: set[str], rolling_window_days: int | None) -> int:
	filters = {'source_active': 1}
	if mode == 'rolling':
		filters['entry_date'] = ['>=', add_to_date(now_datetime().date(), days=-int(rolling_window_days or 90))]
	records = frappe.get_all('Customs Entry', filters=filters, fields=['name', 'entry_number'])
	to_archive = archive_entry_numbers_for_scope(records, seen_entry_numbers)
	for entry_number in to_archive:
		name = frappe.db.get_value('Customs Entry', {'entry_number': entry_number}, 'name')
		if not name:
			continue
		doc = frappe.get_doc('Customs Entry', name)
		doc.source_active = 0
		doc.archived_on = now_datetime()
		doc.status = derive_entry_status({
			'status': doc.status,
			'entry_date': doc.entry_date,
			'estimated_entry_date': getattr(doc, 'estimated_entry_date', None),
			'filing_date': doc.filing_date,
			'preliminary_statement_print_date': getattr(doc, 'preliminary_statement_print_date', None),
			'release_date': doc.release_date,
			'raw_payload_xml': doc.raw_payload_xml,
		}, source_active=0)
		doc.psc_status = derive_psc_status({
			'psc_status': getattr(doc, 'psc_status', None),
			'raw_payload_xml': doc.raw_payload_xml,
		})
		doc.liquidation_status = derive_liquidation_status({
			'liquidation_date': doc.liquidation_date,
			'raw_payload_xml': doc.raw_payload_xml,
		})
		doc.save(ignore_permissions=True)
	return len(to_archive)

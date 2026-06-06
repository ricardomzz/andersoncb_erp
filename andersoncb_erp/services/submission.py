from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import re
from time import sleep
from typing import Any
from uuid import uuid4
from xml.etree import ElementTree as ET

import frappe
from frappe import _
from frappe.exceptions import QueryDeadlockError
from frappe.utils import now_datetime

from andersoncb_erp.integrations.lds import LDSClientError, LDSValidationError, XSI_NS
from andersoncb_erp.services.dotnet_serializer import (
	DotNetSerializerUnavailable,
	build_customs_entry_repair_xml,
)
from andersoncb_erp.services.mapping import parse_entry_xml
from andersoncb_erp.services.master_data import parse_carrier_xml, parse_importer_profile_xml, resolve_master_links
from andersoncb_erp.services.sync import (
	CHILD_TABLE_FIELDS as SYNC_CHILD_TABLE_FIELDS,
	derive_entry_status,
	derive_liquidation_status,
	get_client,
)

DOCUMENTS_NS = "http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents"
DIRECTORIES_NS = "http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Directories"
SERIALIZATION_NS = "http://schemas.microsoft.com/2003/10/Serialization/"

ET.register_namespace("a", DOCUMENTS_NS)
ET.register_namespace("b", DIRECTORIES_NS)
ET.register_namespace("i", XSI_NS)
ET.register_namespace("z", SERIALIZATION_NS)

CHILD_TABLE_FIELDS = ("shipments", "invoices", "articles", "fees", "events", "tariff_lines", "references")
DRAFT_ENTRY_NUMBER_RE = re.compile(r"^TMP[A-Z0-9]{5}$")
FALLBACK_ENTRY_NUMBER_FLOOR = 3005004

ENTRY_FIELD_ORDER = (
	"EntityGuid",
	"Id",
	"RowVersion",
	"Creator",
	"Creator_Id",
	"Date",
	"InProcess",
	"IsMarkedForDelete",
	"IsNotActual",
	"Number",
	"ResponsiblePerson",
	"ResponsiblePerson_Id",
	"UserRemark",
	"UserRemarkType",
	"AdditionalSTBBondAmount",
	"AdditionalSTBBondNumber",
	"AdditionalSTBSuretyCode",
	"BondAmount",
	"BondNumber",
	"BondType",
	"BondWaiverReasonCode",
	"BondedWarehouse",
	"BondedWarehouse_Id",
	"BrokerImporterFileNumber",
	"BrokerOrOtherAgencyInfo",
	"BrokerReferenceNumber",
	"CBPTeamNumber",
	"CancellationRequestReasonCode",
	"CargoReleaseCancellationEstimatedEntryValue",
	"Carrier",
	"Carrier_Id",
	"ClientRef",
	"ConsolidatedReleaseEntries",
	"ConveyanceName",
	"CustomerInvoiceItems",
	"DateOfArrival",
	"DateOfImport",
	"DateOfRelease",
	"DeferredTaxPayment",
	"DesignatedNotifyParty4811",
	"DesignatedNotifyParty4811_Id",
	"DutiableMailFee",
	"ElectedExamSite",
	"ElectedExamSite_Id",
	"EntryFilerCode",
	"EntryNumber",
	"EntryType",
	"EstimatedEntryDate",
	"FinalWarehouseWithdrawalIndicator",
	"ForeignTradeZone",
	"ForeignTradeZone_Id",
	"GeneralOrderNumber",
	"Importer",
	"Importer_Id",
	"LastStatuses",
	"LiquidationDate",
	"LiquidationReasonsOrSuspensions",
	"LiveEntryIndicator",
	"Location",
	"Location_Id",
	"ManualEntrySurcharge",
	"MissingDocumentCode1",
	"MissingDocumentCode2",
	"NonAMS",
	"OriginatingWarehouseEntryFilerCode",
	"OriginatingWarehouseEntryNumber",
	"PGADataIncluded",
	"PaymentType",
	"PortOfEntry",
	"PortOfEntry_Id",
	"PortOfUnlading",
	"PortOfUnlading_Id",
	"PostSummaryCorrection",
	"PostSummaryCorrectionAcceleratedLiquidation",
	"PostSummaryCorrectionFilingExplanationText",
	"PostSummaryCorrectionHeaderReasonCode1",
	"PostSummaryCorrectionHeaderReasonCode2",
	"PostSummaryCorrectionHeaderReasonCode3",
	"PostSummaryCorrectionHeaderReasonCode4",
	"PostSummaryCorrectionHeaderReasonCode5",
	"PreliminaryStatementMonthDate",
	"PreliminaryStatementPrintDate",
	"ReconciliationIssueCode",
	"ReplacementNumber",
	"SelfCertification",
	"ShipmentUsageTypeCode",
	"Shipments",
	"SplitShipmentReleaseElection",
	"StatementDailyEntries",
	"SuretyCode",
	"Tag",
	"TradeAgreementReconciliationIndicator",
	"TransportationMode",
	"TripIdentifier",
	"UsStateOfDestination",
)
SHIPMENT_FIELD_ORDER = (
	"EntityGuid",
	"Id",
	"RowVersion",
	"Creator",
	"Creator_Id",
	"Date",
	"InProcess",
	"IsMarkedForDelete",
	"IsNotActual",
	"Number",
	"ResponsiblePerson",
	"ResponsiblePerson_Id",
	"UserRemark",
	"UserRemarkType",
	"Agent",
	"Agent_Id",
	"BookingConsolidationNumber",
	"BookingGrossWeightKg",
	"BookingLoads",
	"BookingNumber",
	"BookingVolumeM",
	"BookingVolumetricWeightKg",
	"BreakBulk",
	"BreakBulk_Id",
	"Buyer",
	"Buyer_Id",
	"Carrier",
	"Carrier_Id",
	"Charges",
	"ClientRef",
	"Consignee",
	"Consignee_Id",
	"Consolidator",
	"Consolidator_Id",
	"CustomsEntry",
	"CustomsEntry_Id",
	"DateOfArrival",
	"DateOfCargoReady",
	"DateOfExport",
	"DateOfImport",
	"Description",
	"Direction",
	"HouseBillIssuer",
	"HouseBillIssuer_Id",
	"HouseBillNumber",
	"Importer",
	"ImporterSecurityFiling",
	"ImporterSecurityFiling_Id",
	"Importer_Id",
	"InBondDate",
	"InBondForeignPort",
	"InBondForeignPort_Id",
	"InBondLocation",
	"InBondLocation_Id",
	"InBondNumber",
	"InBondPort",
	"InBondPort_Id",
	"Incoterms",
	"Invoices",
	"IsRegularBill",
	"IsSplit",
	"JobBreakBulk",
	"JobCustomsEntry",
	"JobDeliveryOrder",
	"JobISF",
	"LastStatuses",
	"Loads",
	"MasterBillIssuer",
	"MasterBillIssuer_Id",
	"MasterBillNumber",
	"Notify",
	"Notify_Id",
	"PreBooking",
	"PurchaseOrders",
	"Quantity",
	"QuantityUnit",
	"Seller",
	"Seller_Id",
	"ShipTo",
	"ShipTo_Id",
	"ShippingSchedule",
	"ShippingSchedule_Id",
	"StuffingLocation",
	"StuffingLocation_Id",
	"SubHouseBillNumber",
	"Tag",
	"TrackingVessel",
	"TrackingVessel_Id",
	"Tracking_ConveyanceName",
	"Tracking_TimeOfImport",
	"Tracking_TimeOfImportIsActual",
	"Tracking_TimeOfUpdate",
	"TransportationMode",
)
ENTRY_FIELD_RANK = {fieldname: index for index, fieldname in enumerate(ENTRY_FIELD_ORDER)}
SHIPMENT_FIELD_RANK = {fieldname: index for index, fieldname in enumerate(SHIPMENT_FIELD_ORDER)}
INVOICE_FIELD_ORDER = (
	'EntityGuid',
	'Id',
	'RowVersion',
	'Line',
	'Articles',
	'Description',
	'InvoiceMMV',
	'InvoiceMMVCurrency',
	'InvoiceMMVCurrencyRate',
	'InvoiceNonDutiable',
	'InvoiceNonDutiableCurrency',
	'InvoiceNonDutiableCurrencyRate',
	'InvoiceNumber',
	'InvoiceOther',
	'InvoiceOtherCurrency',
	'InvoiceOtherCurrencyRate',
	'InvoiceValue',
	'InvoiceValueCurrency',
	'InvoiceValueCurrencyRate',
	'Seller',
	'Seller_Id',
	'Shipment',
	'Shipment_Id',
	'ShipTo',
	'ShipTo_Id',
)
ARTICLE_FIELD_ORDER = (
	'EntityGuid',
	'Id',
	'RowVersion',
	'Line',
	'ArticleChargeUSD',
	'CountryOfExport',
	'CountryOfOrigin',
	'Description',
	'GrossWeight',
	'HarborMaintenanceFee',
	'Invoice',
	'Invoice_Id',
	'LineItemIdentifier',
	'Manufacturer',
	'Manufacturer_Id',
	'MerchandiseProcessingFee',
	'RelatedPartyIndicator',
	'Tariffs',
)
TARIFF_FIELD_ORDER = (
	'EntityGuid',
	'Id',
	'RowVersion',
	'Line',
	'HarmonizedTariff',
	'HarmonizedTariff_Id',
	'ManualInputDuty',
	'PGA',
	'PrivilegedForeignStatusHarmonizedTariff',
	'PrivilegedForeignStatusHarmonizedTariff_Id',
	'Quantity1',
	'Quantity2',
	'Quantity3',
	'SanctionDisclaimIndicator',
	'Sanctions',
	'ShipmentArticle',
	'ShipmentArticle_Id',
	'Tariff',
	'Tariff_Id',
	'TariffValue',
	'UnitOfMeasure1',
	'UnitOfMeasure2',
	'UnitOfMeasure3',
	'UserFeeAccountingClassCode',
	'UserFeeAmount',
	'DutyAmount',
	'DutyRates',
	'TariffMMV',
	'TariffNonDutiable',
	'TariffOther',
)
INVOICE_FIELD_RANK = {fieldname: index for index, fieldname in enumerate(INVOICE_FIELD_ORDER)}
ARTICLE_FIELD_RANK = {fieldname: index for index, fieldname in enumerate(ARTICLE_FIELD_ORDER)}
TARIFF_FIELD_RANK = {fieldname: index for index, fieldname in enumerate(TARIFF_FIELD_ORDER)}


@dataclass
class LocalValidationIssue:
	fieldname: str
	message: str


def is_draft_placeholder_entry_number(value: str | None) -> bool:
	text = (value or "").strip().upper()
	return bool(DRAFT_ENTRY_NUMBER_RE.fullmatch(text))


def _entry_number_exists(value: str) -> bool:
	return bool(frappe.db.exists("Customs Entry", {"entry_number": value}))


def validate_customs_entry_for_submission(doc) -> list[LocalValidationIssue]:
	issues: list[LocalValidationIssue] = []
	required_fields = (
		("entry_number", "Entry Number is required."),
		("filer_code", "Filer Code is required."),
		("entry_type", "Entry Type is required."),
		("entry_date", "Entry Date is required."),
		("port_of_entry", "Port of Entry is required."),
		("importer_profile", "Importer Profile is required."),
	)
	for fieldname, message in required_fields:
		value = getattr(doc, fieldname, None)
		if fieldname == "entry_number" and is_draft_placeholder_entry_number(value):
			continue
		if not value:
			issues.append(LocalValidationIssue(fieldname, message))

	entry_number = (getattr(doc, "entry_number", "") or "").strip()
	if entry_number and not is_draft_placeholder_entry_number(entry_number) and len(entry_number) > 8:
		issues.append(LocalValidationIssue("entry_number", "Entry Number must be 8 characters or fewer for LDS submission."))

	broker_reference = (getattr(doc, "broker_reference", "") or "").strip()
	if broker_reference and len(broker_reference) > 9:
		issues.append(LocalValidationIssue("broker_reference", "Broker Reference must be 9 characters or fewer for LDS submission."))

	if getattr(doc, 'importer_profile', None):
		profile = frappe.get_cached_doc('Importer Profile', doc.importer_profile)
		if not (profile.importer_code or profile.cbp_number or profile.irs_number):
			issues.append(LocalValidationIssue('importer_profile', 'Importer Profile must have an importer code, CBP number, or IRS number.'))
		if not profile.display_name:
			issues.append(LocalValidationIssue('importer_profile', 'Importer Profile must have a display name.'))

	for row in getattr(doc, "shipments", []) or []:
		if not getattr(row, "shipment_no", None):
			issues.append(LocalValidationIssue("shipments", "Each shipment row must have a Shipment No."))
			break
		if not getattr(row, 'carrier_profile', None):
			issues.append(LocalValidationIssue('shipments', 'Each shipment row must have a Carrier Profile.'))
			break
		carrier = frappe.get_cached_doc('Carrier', row.carrier_profile)
		if not (carrier.display_name or carrier.carrier_code):
			issues.append(LocalValidationIssue('shipments', 'Each shipment carrier must have a display name or carrier code.'))
			break

	for row in getattr(doc, "invoices", []) or []:
		if not getattr(row, "invoice_number", None):
			issues.append(LocalValidationIssue("invoices", "Each invoice row must have an Invoice Number."))
			break

	for row in getattr(doc, "articles", []) or []:
		line_item_identifier = (getattr(row, "line_item_identifier", None) or "").strip()
		if line_item_identifier and len(line_item_identifier) > 3:
			issues.append(LocalValidationIssue("articles", "Each article Line Item Identifier must be 3 characters or fewer for LDS."))
			break

	for row in getattr(doc, "shipments", []) or []:
		mode = str(getattr(row, "mode", None) or getattr(doc, "transport_mode", None) or "").strip()
		if mode == '40' and getattr(row, 'carrier_profile', None):
			carrier = frappe.get_cached_doc('Carrier', row.carrier_profile)
			carrier_type = (getattr(carrier, 'carrier_type', None) or '').strip().lower()
			airway_bill_prefix = (getattr(carrier, 'airway_bill_prefix', None) or '').strip()
			if carrier_type != 'air':
				issues.append(LocalValidationIssue('shipments', 'Air shipments require a carrier with Carrier Type set to Air.'))
				break
			if not airway_bill_prefix:
				issues.append(LocalValidationIssue('shipments', 'Air shipments require the carrier to have an Airway Bill Prefix.'))
				break

	return issues


def format_local_validation_issues(issues: list[LocalValidationIssue]) -> str:
	return "\n".join(f"- {issue.message}" for issue in issues)


def _normalize_optional_article_money_fields(doc) -> None:
	for row in getattr(doc, 'articles', []) or []:
		for fieldname in ('harbor_maintenance_fee', 'merchandise_processing_fee'):
			value = getattr(row, fieldname, None)
			if value in (None, ''):
				continue
			try:
				number = float(value)
			except (TypeError, ValueError):
				continue
			if number == 0:
				setattr(row, fieldname, None)


def build_submission_entity_xml(doc) -> str:
	template_root = _build_entry_submission_template_root(doc)
	entity = _build_save_entity_from_root(template_root)
	entity.set(f'{{{SERIALIZATION_NS}}}Id', 'i1')
	reference_state = [1]

	internal_number, entry_number = _allocate_submission_numbers(template_root, doc)
	include_directory_objects = bool(getattr(doc, 'lds_id', None))
	if internal_number is not None:
		_set_text(entity, "Number", internal_number, None)
	if entry_number:
		_set_text(entity, "EntryNumber", entry_number, DOCUMENTS_NS)
	broker_reference = _determine_submission_broker_reference(doc, entry_number)
	_set_text(entity, "EntryFilerCode", doc.filer_code, DOCUMENTS_NS)
	_set_text(entity, "EntryType", doc.entry_type, DOCUMENTS_NS)
	_set_text(entity, "Date", _as_datetime_text(doc.entry_date), None)
	entry_transport_mode = _single_shared_shipment_value(doc.shipments or [], 'mode') or doc.transport_mode
	if len(set(_shipment_values(doc.shipments or [], 'mode'))) > 1:
		entry_transport_mode = None
	_set_text(entity, "TransportationMode", entry_transport_mode, DOCUMENTS_NS)
	_set_text(entity, "PaymentType", getattr(doc, "payment_type", None), DOCUMENTS_NS)
	_set_text(entity, "ConveyanceName", getattr(doc, "conveyance_name", None), DOCUMENTS_NS)
	_set_text(entity, "TripIdentifier", getattr(doc, "trip_identifier", None), DOCUMENTS_NS)
	_set_text(entity, "BrokerReferenceNumber", broker_reference, DOCUMENTS_NS)
	_set_text(entity, "SuretyCode", getattr(doc, "surety_code", None) or doc.bond_number, DOCUMENTS_NS)
	_set_text(entity, "ClientRef", doc.client_ref, DOCUMENTS_NS)
	_set_entry_arrival_fields(entity, doc.shipments or [])
	entry_port_of_entry = _single_shared_shipment_value(doc.shipments or [], 'port_of_entry') or doc.port_of_entry
	entry_port_of_unlading = _single_shared_shipment_value(doc.shipments or [], 'port_of_unlading') or getattr(doc, "port_of_unlading", None) or doc.port_of_entry
	if len(set(_shipment_values(doc.shipments or [], 'port_of_entry'))) > 1:
		entry_port_of_entry = None
	if len(set(_shipment_values(doc.shipments or [], 'port_of_unlading'))) > 1:
		entry_port_of_unlading = None
	_set_port_of_entry(entity, entry_port_of_entry)
	_set_port_of_unlading(entity, entry_port_of_unlading)
	_set_importer_from_profile(entity, doc.importer_profile, include_object=include_directory_objects)
	_set_entry_carrier(entity, doc.shipments or [], include_object=include_directory_objects)
	_set_shipments(
		entity,
		doc.shipments or [],
		importer_profile_name=getattr(doc, 'importer_profile', None),
		house_bill=getattr(doc, 'house_bill', None),
		master_bill=getattr(doc, 'master_bill', None),
		invoices=doc.invoices or [],
		articles=doc.articles or [],
		tariff_lines=doc.tariff_lines or [],
		reference_state=reference_state,
		include_directory_objects=include_directory_objects,
		entry_ref_id=_node_reference_id(entity),
	)
	_reorder_children(entity, ENTRY_FIELD_RANK)

	entity_xml = ET.tostring(entity, encoding="unicode")
	if internal_number and entry_number and broker_reference:
		try:
			serializer_root = ET.fromstring(entity_xml)
			serializer_root.tag = f"{{{DOCUMENTS_NS}}}CustomsEntry"
			return build_customs_entry_repair_xml(
				ET.tostring(serializer_root, encoding="unicode"),
				number=internal_number,
				entry_number=entry_number,
				broker_reference=broker_reference,
				bond_type=getattr(doc, "bond_type", None) or "9",
				consolidated_release_entries="",
			)
		except DotNetSerializerUnavailable:
			pass

	return entity_xml


def process_lds_submission(doc) -> None:
	issues = validate_customs_entry_for_submission(doc)
	if issues:
		message = _("Local validation failed before LDS submission:") + "\n" + format_local_validation_issues(issues)
		doc.status = "Draft"
		doc.lds_submission_errors = message
		raise frappe.ValidationError(message)

	_normalize_optional_article_money_fields(doc)
	entity_xml = build_submission_entity_xml(doc)
	doc.last_lds_submission_on = now_datetime()
	doc.lds_last_submission_payload = entity_xml

	submitted_entry_number = _extract_submission_entry_number(entity_xml)
	client = get_client()
	try:
		saved_xml = client.save_entry_xml(entity_xml)
		initial_root = None
		try:
			initial_root = ET.fromstring(saved_xml)
		except ET.ParseError:
			initial_root = None
		if initial_root is not None:
			initial_id = _extract_root_id(initial_root)
			if initial_id and hasattr(client, 'fetch_entry_detail_xml_by_id'):
				try:
					saved_xml = client.fetch_entry_detail_xml_by_id(initial_id)
				except LDSClientError:
					saved_xml = _hydrate_saved_entry_xml(saved_xml, submitted_entry_number, doc.filer_code)
			else:
				saved_xml = _hydrate_saved_entry_xml(saved_xml, submitted_entry_number, doc.filer_code)
		else:
			saved_xml = _hydrate_saved_entry_xml(saved_xml, submitted_entry_number, doc.filer_code)
		saved_xml = _repair_saved_entry_numbering_if_needed(doc, saved_xml)
	except LDSValidationError as exc:
		message = format_lds_validation_error(exc)
		doc.status = "Draft"
		doc.lds_submission_errors = message
		raise frappe.ValidationError(message)
	except LDSClientError as exc:
		recovered_xml = _recover_from_zero_number_duplicate(doc, entity_xml, submitted_entry_number, exc)
		if recovered_xml is not None:
			saved_xml = recovered_xml
		else:
			message = _("LDS submission failed: {0}").format(str(exc))
			doc.status = "Draft"
			doc.lds_submission_errors = message
			raise frappe.ValidationError(message)

	mapped = resolve_master_links(parse_entry_xml(saved_xml), synced_on=now_datetime(), create_missing=False)
	mapped["status"] = derive_entry_status(mapped, source_active=1)
	mapped["liquidation_status"] = derive_liquidation_status(mapped)
	resolved_entry_number = str(mapped.get('entry_number') or '').strip()
	if not mapped.get('lds_id') or not resolved_entry_number.isdigit() or len(resolved_entry_number) != 8:
		message = _('LDS submission failed: saved entry did not return a valid LDS id and final entry number.')
		doc.status = 'Draft'
		doc.lds_submission_errors = message
		raise frappe.ValidationError(message)

	for fieldname, value in mapped.items():
		if fieldname in SYNC_CHILD_TABLE_FIELDS:
			continue
		setattr(doc, fieldname, value)

	for child_field in SYNC_CHILD_TABLE_FIELDS:
		doc.set(child_field, mapped.get(child_field) or [])

	doc.source_active = 1
	doc.archived_on = None
	doc.last_seen_in_source_on = now_datetime()
	doc.last_synced_on = now_datetime()
	doc.lds_submission_errors = None


def persist_submission_failure(doc, message: str, payload: str | None = None) -> None:
	if payload is not None:
		doc.lds_last_submission_payload = payload
	if not doc.last_lds_submission_on:
		doc.last_lds_submission_on = now_datetime()
	doc.status = "Draft"
	doc.lds_submission_errors = message
	doc.docstatus = 0

	if not doc.name or doc.is_new():
		return

	values = {
		"status": doc.status,
		"docstatus": 0,
		"last_lds_submission_on": doc.last_lds_submission_on,
		"lds_submission_errors": doc.lds_submission_errors,
		"lds_last_submission_payload": doc.lds_last_submission_payload,
	}
	last_exc = None
	for attempt in range(1, 6):
		try:
			frappe.db.set_value(doc.doctype, doc.name, values, update_modified=False)
			frappe.db.commit()
			return
		except (QueryDeadlockError, frappe.TimestampMismatchError) as exc:
			last_exc = exc
			frappe.db.rollback()
			if attempt >= 5:
				break
			sleep(0.4 * attempt)
	if last_exc is not None:
		raise last_exc


def submit_entry_to_lds(name: str) -> dict[str, str | bool]:
	doc = frappe.get_doc("Customs Entry", name)
	doc.check_permission("submit")
	if doc.docstatus != 0:
		return {"ok": False, "error": _("Only draft Customs Entries can be submitted to LDS.")}

	try:
		process_lds_submission(doc)
	except frappe.ValidationError as exc:
		persist_submission_failure(doc, str(exc), payload=getattr(doc, "lds_last_submission_payload", None))
		return {"ok": False, "error": str(exc)}

	doc = _reload_with_submission_state(doc)
	doc.flags.skip_lds_submission = True
	_save_with_deadlock_retry(doc)
	_submit_with_deadlock_retry(doc)
	final_name = doc.name
	if getattr(doc, 'entry_number', None) and frappe.db.exists(doc.doctype, doc.entry_number):
		final_name = doc.entry_number
	elif getattr(doc, 'lds_id', None):
		matched = frappe.db.get_value(doc.doctype, {'lds_id': doc.lds_id}, 'name')
		if matched:
			final_name = matched
	return {"ok": True, "name": final_name}


def format_lds_validation_error(exc: LDSValidationError) -> str:
	if not exc.details:
		return _("LDS validation failed: {0}").format(str(exc))
	lines = [_("LDS validation failed:")]
	for detail in exc.details:
		prefix = f"[{detail.property_name}] " if detail.property_name else ""
		lines.append(f"- {prefix}{detail.error_message}")
	return "\n".join(lines)


def _reload_with_submission_state(doc):
	fresh_doc = frappe.get_doc(doc.doctype, doc.name)
	system_fields = {
		"name",
		"owner",
		"creation",
		"modified",
		"modified_by",
		"docstatus",
		"parent",
		"parentfield",
		"parenttype",
		"idx",
	}

	for df in fresh_doc.meta.fields:
		if df.fieldtype == "Table":
			rows = []
			for row in doc.get(df.fieldname) or []:
				row_data = row.as_dict() if hasattr(row, "as_dict") else dict(row)
				rows.append({k: v for k, v in row_data.items() if k not in system_fields})
			fresh_doc.set(df.fieldname, rows)
			continue
		fresh_doc.set(df.fieldname, doc.get(df.fieldname))

	return fresh_doc


def _save_with_deadlock_retry(doc, attempts: int = 3, delay_seconds: float = 0.25) -> None:
	last_exc = None
	for attempt in range(1, attempts + 1):
		try:
			if getattr(doc, 'name', None) and not getattr(doc, '__islocal', False):
				latest_modified = frappe.db.get_value(doc.doctype, doc.name, 'modified')
				doc.modified = latest_modified
				doc._original_modified = latest_modified
			doc.save()
			return
		except (QueryDeadlockError, frappe.TimestampMismatchError) as exc:
			last_exc = exc
			frappe.db.rollback()
			if attempt >= attempts:
				break
			sleep(delay_seconds * attempt)
			# Keep the already-mapped in-memory submission state intact across retries.
			doc.flags.skip_lds_submission = True
	raise last_exc


def _submit_with_deadlock_retry(doc, attempts: int = 3, delay_seconds: float = 0.25) -> None:
	last_exc = None
	for attempt in range(1, attempts + 1):
		try:
			if getattr(doc, 'name', None) and not getattr(doc, '__islocal', False):
				latest_modified = frappe.db.get_value(doc.doctype, doc.name, 'modified')
				doc.modified = latest_modified
				doc._original_modified = latest_modified
			doc.submit()
			return
		except QueryDeadlockError as exc:
			last_exc = exc
			frappe.db.rollback()
			if attempt >= attempts:
				break
			sleep(delay_seconds * attempt)
			doc.flags.skip_lds_submission = True
	raise last_exc


def _hydrate_saved_entry_xml(saved_xml: str, entry_number: str | None, filer_code: str | None) -> str:
	try:
		root = ET.fromstring(saved_xml)
	except ET.ParseError:
		return saved_xml
	entity_id = _extract_root_id(root)
	client = get_client()
	if entity_id and hasattr(client, 'fetch_entry_detail_xml_by_id'):
		try:
			return client.fetch_entry_detail_xml_by_id(entity_id)
		except LDSClientError:
			pass
	if not entry_number:
		return saved_xml
	try:
		summary_xml = client.fetch_entry_detail_xml(entry_number, filer_code)
	except LDSClientError:
		return saved_xml
	try:
		summary_root = ET.fromstring(summary_xml)
	except ET.ParseError:
		return summary_xml
	summary_id = _extract_root_id(summary_root)
	if summary_id and hasattr(client, 'fetch_entry_detail_xml_by_id'):
		try:
			return client.fetch_entry_detail_xml_by_id(summary_id)
		except LDSClientError:
			pass
	return summary_xml


def _extract_submission_entry_number(entity_xml: str) -> str | None:
	try:
		root = ET.fromstring(entity_xml)
	except ET.ParseError:
		return None
	node = _find_child(root, 'EntryNumber')
	if node is None or not node.text:
		return None
	return node.text.strip()


def _extract_submission_number(entity_xml: str) -> str | None:
	try:
		root = ET.fromstring(entity_xml)
	except ET.ParseError:
		return None
	node = _find_child(root, 'Number')
	if node is None or not node.text:
		return None
	return node.text.strip()


def _repair_saved_entry_numbering_if_needed(doc, saved_xml: str) -> str:
	if getattr(doc, 'lds_id', None):
		return saved_xml
	try:
		root = ET.fromstring(saved_xml)
	except ET.ParseError:
		return saved_xml
	if _extract_root_number(root) not in (None, '', '0'):
		return saved_xml
	client = get_client()
	if not hasattr(client, 'calculate_entry_number_for_entry'):
		return saved_xml
	entity_id = _extract_root_id(root)
	if not entity_id or not getattr(doc, 'filer_code', None):
		return saved_xml

	entity = _build_save_entity_from_root(root)
	internal_number = _determine_repair_internal_number(doc, entity)
	entry_number = client.calculate_entry_number_for_entry(
		internal_number,
		doc.filer_code,
		entity_id,
		adjust_sequence=True,
	)
	repaired_xml = _build_repair_payload(saved_xml, entity, internal_number, entry_number)
	saved_xml = client.save_entry_xml(repaired_xml)
	return _hydrate_saved_entry_xml(saved_xml, entry_number, doc.filer_code)




def _recover_from_zero_number_duplicate(doc, entity_xml: str, submitted_entry_number: str | None, exc: LDSClientError) -> str | None:
	if not _is_zero_number_duplicate_error(exc):
		return None
	client = get_client()
	try:
		zero_xml = client.fetch_entry_detail_xml_by_internal_number(0)
	except LDSClientError:
		return None

	zero_entry_number = _extract_submission_entry_number(zero_xml)
	repaired_zero_xml = _repair_saved_entry_numbering_if_needed(doc, zero_xml)
	if zero_entry_number and submitted_entry_number and zero_entry_number == submitted_entry_number:
		return repaired_zero_xml

	try:
		retried_xml = client.save_entry_xml(entity_xml)
		retried_xml = _hydrate_saved_entry_xml(retried_xml, submitted_entry_number, doc.filer_code)
		return _repair_saved_entry_numbering_if_needed(doc, retried_xml)
	except LDSClientError as retry_exc:
		if not _is_zero_number_duplicate_error(retry_exc):
			return None
		try:
			zero_xml = client.fetch_entry_detail_xml_by_internal_number(0)
		except LDSClientError:
			return None
		zero_entry_number = _extract_submission_entry_number(zero_xml)
		if zero_entry_number and submitted_entry_number and zero_entry_number == submitted_entry_number:
			return _repair_saved_entry_numbering_if_needed(doc, zero_xml)
		return None


def _build_repair_payload(saved_xml: str, root: ET.Element, internal_number: str, entry_number: str) -> str:
	bond_type = _extract_root_text(root, 'BondType') or '9'
	consolidated_release_entries = _extract_root_text(root, 'ConsolidatedReleaseEntries')
	try:
		return build_customs_entry_repair_xml(
			saved_xml,
			number=internal_number,
			entry_number=entry_number,
			broker_reference=entry_number,
			bond_type=bond_type,
			consolidated_release_entries='' if consolidated_release_entries is None else consolidated_release_entries,
		)
	except DotNetSerializerUnavailable:
		entity = _build_save_entity_from_root(root)
		_set_text(entity, 'Number', internal_number, None)
		_set_text(entity, 'EntryNumber', entry_number, DOCUMENTS_NS)
		_set_text(entity, 'BrokerReferenceNumber', entry_number, DOCUMENTS_NS)
		_set_text(entity, 'BondType', bond_type, DOCUMENTS_NS)
		_set_text(entity, 'ConsolidatedReleaseEntries', '' if consolidated_release_entries is None else consolidated_release_entries, DOCUMENTS_NS)
		_reorder_children(entity, ENTRY_FIELD_RANK)
		return ET.tostring(entity, encoding='unicode')


def _is_zero_number_duplicate_error(exc: LDSClientError) -> bool:
	message = str(exc)
	return 'IX_Number' in message and '(0)' in message


def _extract_root_number(root: ET.Element) -> str | None:
	node = _find_direct_child(root, 'Number')
	if node is None or not node.text:
		return None
	return node.text.strip()


def _extract_root_id(root: ET.Element) -> int | None:
	node = _find_direct_child(root, 'Id') or _find_child(root, 'Id')
	if node is None or not node.text:
		return None
	try:
		return int(node.text.strip())
	except (TypeError, ValueError):
		return None


def _determine_repair_internal_number(doc, root: ET.Element) -> str:
	entry_number = _find_direct_child(root, 'EntryNumber')
	if entry_number is not None and entry_number.text:
		text = entry_number.text.strip()
		if len(text) == 8 and text.isdigit():
			return text[:7]
	return str(_derive_local_entry_number_seed(doc))


def _build_save_entity_from_root(root: ET.Element) -> ET.Element:
	entity = ET.Element('entity')
	for attr_name, value in root.attrib.items():
		if attr_name == f'{{{XSI_NS}}}type':
			continue
		entity.set(attr_name, value)
	for child in list(root):
		entity.append(deepcopy(child))
	return entity


def _build_entry_submission_template_root(doc) -> ET.Element:
	try:
		return _parse_new_entry_template_root()
	except LDSClientError as exc:
		if 'Index was outside the bounds of the array' not in str(exc):
			raise
		return _build_local_new_entry_template_root(doc)


def _allocate_submission_numbers(template_root: ET.Element, doc) -> tuple[str | None, str | None]:
	if getattr(doc, 'lds_id', None):
		internal_number = _extract_template_number(template_root)
		return internal_number, getattr(doc, 'entry_number', None)

	client = get_client()
	base_candidate = _derive_local_entry_number_seed(doc)
	template_number = _extract_template_number(template_root)
	if template_number and str(template_number).isdigit():
		base_candidate = max(base_candidate, int(template_number))

	if getattr(doc, 'filer_code', None) and hasattr(client, 'calculate_entry_number'):
		for candidate in range(base_candidate, base_candidate + 200):
			try:
				entry_number = client.calculate_entry_number(str(candidate), doc.filer_code, check_unique=True, adjust_sequence=True)
				return str(candidate), entry_number
			except LDSClientError as exc:
				message = str(exc)
				if 'Such number already in database' in message or 'already exists' in message:
					continue
				raise

	internal_number = str(base_candidate)
	return internal_number, _determine_submission_entry_number(template_root, doc, internal_number)


def _determine_submission_entry_number(template_root: ET.Element, doc, internal_number: str | None = None) -> str | None:
	if getattr(doc, 'lds_id', None):
		return getattr(doc, 'entry_number', None)
	if internal_number and getattr(doc, 'filer_code', None):
		client = get_client()
		if hasattr(client, 'calculate_entry_number'):
			return client.calculate_entry_number(internal_number, doc.filer_code, check_unique=True, adjust_sequence=True)
	entry_number = getattr(doc, 'entry_number', None)
	if entry_number and not is_draft_placeholder_entry_number(entry_number):
		return entry_number
	return None


def _determine_submission_broker_reference(doc, entry_number: str | None) -> str | None:
	if getattr(doc, 'lds_id', None):
		return getattr(doc, 'broker_reference', None)
	if entry_number:
		return entry_number
	return getattr(doc, 'broker_reference', None)


def _extract_template_number(template_root: ET.Element) -> str | None:
	node = _find_direct_child(template_root, 'Number')
	if node is None or not node.text:
		return None
	return node.text.strip()


def _extract_template_id(template_root: ET.Element) -> int | None:
	node = _find_direct_child(template_root, 'Id')
	if node is None or not node.text:
		return None
	try:
		return int(node.text.strip())
	except (TypeError, ValueError):
		return None


@frappe.whitelist()
def get_new_entry_template_xml() -> str:
	return get_client().new_entry_xml()


def _parse_new_entry_template_root() -> ET.Element:
	return _strip_serialization_attributes(ET.fromstring(get_client().new_entry_xml()))


def _build_local_new_entry_template_root(doc) -> ET.Element:
	root = ET.Element('template')
	ET.SubElement(root, 'EntityGuid').text = str(uuid4())
	ET.SubElement(root, 'Date').text = _as_datetime_text(getattr(doc, 'entry_date', None)) or _as_datetime_text(now_datetime())
	ET.SubElement(root, 'Number').text = str(_derive_local_entry_number_seed(doc))
	return root


def _derive_local_entry_number_seed(doc) -> int:
	try:
		entry_numbers = frappe.get_all('Customs Entry', filters={'filer_code': getattr(doc, 'filer_code', None)}, pluck='entry_number', limit_page_length=0)
	except Exception:
		entry_numbers = []
	bases = []
	for value in entry_numbers:
		text = (value or '').strip()
		if len(text) == 8 and text.isdigit():
			bases.append(int(text[:7]))
	try:
		stored_seed = int(frappe.defaults.get_global_default('andersoncb_erp_entry_number_seed') or FALLBACK_ENTRY_NUMBER_FLOOR)
	except Exception:
		stored_seed = FALLBACK_ENTRY_NUMBER_FLOOR
	floor = max(FALLBACK_ENTRY_NUMBER_FLOOR, stored_seed)
	seed = max([floor, *bases]) + 1
	try:
		frappe.defaults.set_global_default('andersoncb_erp_entry_number_seed', str(seed))
	except Exception:
		pass
	return seed


def _build_new_shipment_template_root() -> ET.Element:
	root = ET.Element(f'{{{DOCUMENTS_NS}}}Shipment')
	ET.SubElement(root, 'EntityGuid').text = str(uuid4())
	ET.SubElement(root, 'Date').text = _as_datetime_text(now_datetime())
	return root


def _strip_serialization_attributes(element: ET.Element) -> ET.Element:
	for node in element.iter():
		for attr_name in list(node.attrib):
			if attr_name.startswith(f'{{{SERIALIZATION_NS}}}'):
				del node.attrib[attr_name]
	return element


def _parse_template_root(raw_payload_xml: str | None) -> ET.Element | None:
	if not raw_payload_xml:
		return None
	try:
		return _strip_serialization_attributes(ET.fromstring(raw_payload_xml))
	except ET.ParseError:
		return None


def _set_text(parent: ET.Element, local_name: str, value: Any, namespace: str | None) -> None:
	element = _find_child(parent, local_name)
	if value in (None, ""):
		if element is not None:
			parent.remove(element)
		return
	if element is None:
		if namespace:
			element = ET.SubElement(parent, f"{{{namespace}}}{local_name}")
		else:
			element = ET.SubElement(parent, local_name)
	element.text = str(value)


def _replace_child(parent: ET.Element, local_name: str, replacement: ET.Element):
	existing = _find_child(parent, local_name)
	if existing is not None:
		parent.remove(existing)
	parent.append(replacement)


def _remove_child(parent: ET.Element, local_name: str) -> None:
	existing = _find_child(parent, local_name)
	if existing is not None:
		parent.remove(existing)


def _shipment_arrival_datetime_text(row) -> str | None:
	return _as_datetime_text(
		getattr(row, 'date_of_arrival', None)
		or getattr(row, 'arrival_date', None)
		or getattr(row, 'date_of_import', None)
	)


def _shipment_values(rows, fieldname: str) -> list[str]:
	values = []
	for row in rows or []:
		value = getattr(row, fieldname, None)
		if value in (None, ''):
			continue
		text = str(value).strip()
		if text:
			values.append(text)
	return values


def _single_shared_shipment_value(rows, fieldname: str) -> str | None:
	unique = list(dict.fromkeys(_shipment_values(rows, fieldname)))
	if len(unique) == 1:
		return unique[0]
	return None


def _set_entry_arrival_fields(parent: ET.Element, shipments) -> None:
	arrival = None
	for row in shipments:
		arrival = _shipment_arrival_datetime_text(row)
		if arrival:
			break
	_set_text(parent, 'DateOfArrival', arrival, DOCUMENTS_NS)
	_set_text(parent, 'DateOfImport', arrival, DOCUMENTS_NS)
	_set_text(parent, 'EstimatedEntryDate', arrival, DOCUMENTS_NS)



def _set_port_of_unlading(parent: ET.Element, port_code: str | None) -> None:
	port = _find_child(parent, 'PortOfUnlading')
	if port is not None:
		parent.remove(port)
	port_id = _resolve_port_id(port_code)
	_set_text(parent, 'PortOfUnlading_Id', port_id, DOCUMENTS_NS)


def _set_port_of_entry(parent: ET.Element, port_code: str | None) -> None:
	port = _find_child(parent, 'PortOfEntry')
	if port is not None:
		parent.remove(port)
	port_id = _resolve_port_id(port_code)
	_set_text(parent, 'PortOfEntry_Id', port_id, DOCUMENTS_NS)


def _resolve_runtime_importer(profile) -> dict[str, str | None]:
	resolved = {
		'lds_id': getattr(profile, 'lds_id', None),
		'code': getattr(profile, 'importer_code', None) or getattr(profile, 'cbp_number', None) or getattr(profile, 'irs_number', None),
		'name': getattr(profile, 'display_name', None),
		'raw_payload_xml': getattr(profile, 'raw_payload_xml', None),
	}
	importer_code = getattr(profile, 'importer_code', None)
	if not importer_code:
		return resolved
	client = get_client()
	if not hasattr(client, 'fetch_importer_contact_by_code_xml'):
		return resolved
	try:
		fetched_xml = client.fetch_importer_contact_by_code_xml(importer_code)
		fetched = parse_importer_profile_xml(fetched_xml)
	except (LDSClientError, ET.ParseError):
		return resolved
	if fetched:
		resolved.update({
			'lds_id': fetched.get('lds_id') or resolved.get('lds_id'),
			'code': fetched.get('importer_code') or resolved.get('code'),
			'name': fetched.get('display_name') or resolved.get('name'),
			'raw_payload_xml': fetched.get('raw_payload_xml') or resolved.get('raw_payload_xml'),
		})
	return resolved


def _resolve_runtime_carrier(carrier) -> dict[str, str | None]:
	resolved = {
		'lds_id': getattr(carrier, 'lds_id', None),
		'code': getattr(carrier, 'carrier_code', None),
		'name': getattr(carrier, 'display_name', None),
		'raw_payload_xml': getattr(carrier, 'raw_payload_xml', None),
	}
	carrier_code = getattr(carrier, 'carrier_code', None)
	if not carrier_code:
		return resolved
	client = get_client()
	if not hasattr(client, 'fetch_carrier_by_code_xml'):
		return resolved
	try:
		fetched_xml = client.fetch_carrier_by_code_xml(carrier_code)
		fetched = parse_carrier_xml(fetched_xml)
	except (LDSClientError, ET.ParseError):
		return resolved
	if fetched:
		resolved.update({
			'lds_id': fetched.get('lds_id') or resolved.get('lds_id'),
			'code': fetched.get('carrier_code') or resolved.get('code'),
			'name': fetched.get('display_name') or resolved.get('name'),
			'raw_payload_xml': fetched.get('raw_payload_xml') or resolved.get('raw_payload_xml'),
		})
	return resolved


def _set_importer_from_profile(parent: ET.Element, importer_profile_name: str | None, include_object: bool = True) -> None:
	if not importer_profile_name:
		return
	profile = frappe.get_cached_doc('Importer Profile', importer_profile_name)
	resolved = _resolve_runtime_importer(profile)
	if include_object:
		importer = _build_directory_entity(
			local_name='Importer',
			raw_payload_xml=resolved.get('raw_payload_xml'),
			lds_id=resolved.get('lds_id'),
			code=resolved.get('code'),
			name=resolved.get('name'),
		)
		if importer is not None:
			_replace_child(parent, 'Importer', importer)
	else:
		_remove_child(parent, 'Importer')
	_set_text(parent, 'Importer_Id', resolved.get('lds_id'), DOCUMENTS_NS)


def _set_shipments(parent: ET.Element, shipments, importer_profile_name: str | None = None, house_bill: str | None = None, master_bill: str | None = None, invoices=None, articles=None, tariff_lines=None, reference_state=None, include_directory_objects: bool = True, entry_ref_id: str | None = None) -> None:
	if not shipments:
		_remove_child(parent, 'Shipments')
		return
	container = _find_child(parent, 'Shipments')
	existing_shipments = []
	if container is not None:
		existing_shipments = [child for child in list(container) if child.tag.split('}', 1)[-1] == 'Shipment']

	shipment_count = len(shipments)
	header_house_bill = house_bill if shipment_count == 1 else None
	header_master_bill = master_bill if shipment_count == 1 else None

	if container is not None and existing_shipments and len(existing_shipments) == shipment_count:
		for shipment, row in zip(existing_shipments, shipments):
			_apply_shipment_row(shipment, row, importer_profile_name, house_bill=header_house_bill, master_bill=header_master_bill, invoices=invoices or [], articles=articles or [], tariff_lines=tariff_lines or [], reference_state=reference_state, include_directory_objects=include_directory_objects, entry_ref_id=entry_ref_id)
		return

	if container is not None:
		parent.remove(container)
	container = ET.SubElement(parent, f'{{{DOCUMENTS_NS}}}Shipments')
	for row in shipments:
		shipment = _build_new_shipment_template_root()
		_assign_reference_id(shipment, reference_state)
		container.append(shipment)
		_apply_shipment_row(shipment, row, importer_profile_name, house_bill=header_house_bill, master_bill=header_master_bill, invoices=invoices or [], articles=articles or [], tariff_lines=tariff_lines or [], reference_state=reference_state, include_directory_objects=include_directory_objects, entry_ref_id=entry_ref_id)



def _apply_shipment_row(shipment: ET.Element, row, importer_profile_name: str | None = None, house_bill: str | None = None, master_bill: str | None = None, invoices=None, articles=None, tariff_lines=None, reference_state=None, include_directory_objects: bool = True, entry_ref_id: str | None = None) -> None:
	shipment_no = getattr(row, 'shipment_no', None)
	_set_text(shipment, 'Number', shipment_no, None)
	_set_text(shipment, 'TransportationMode', getattr(row, 'mode', None), DOCUMENTS_NS)
	arrival = _shipment_arrival_datetime_text(row)
	_set_text(shipment, 'DateOfImport', arrival, DOCUMENTS_NS)
	_set_text(shipment, 'DateOfArrival', arrival, DOCUMENTS_NS)
	_set_text(shipment, 'DateOfExport', _as_datetime_text(getattr(row, 'date_of_export', None)), DOCUMENTS_NS)
	_set_text(shipment, 'Direction', 'IM', DOCUMENTS_NS)
	_set_text(shipment, 'HouseBillNumber', house_bill, DOCUMENTS_NS)
	_set_text(shipment, 'MasterBillNumber', getattr(row, 'master_bill', None) or master_bill, DOCUMENTS_NS)
	_set_text(shipment, 'ClientRef', getattr(row, 'client_ref', None), DOCUMENTS_NS)
	if importer_profile_name:
		profile = frappe.get_cached_doc('Importer Profile', importer_profile_name)
		resolved_importer = _resolve_runtime_importer(profile)
		importer_id = resolved_importer.get('lds_id')
		_set_text(shipment, 'Importer_Id', importer_id, DOCUMENTS_NS)
		_set_text(shipment, 'Buyer_Id', importer_id, DOCUMENTS_NS)
		_set_text(shipment, 'Consignee_Id', importer_id, DOCUMENTS_NS)
		_set_text(shipment, 'ShipTo_Id', importer_id, DOCUMENTS_NS)
		_set_text(shipment, 'Seller_Id', importer_id, DOCUMENTS_NS)
		_set_text(shipment, 'Consolidator_Id', importer_id, DOCUMENTS_NS)
		_set_text(shipment, 'StuffingLocation_Id', importer_id, DOCUMENTS_NS)
	if entry_ref_id:
		_set_reference_child(shipment, 'CustomsEntry', entry_ref_id, DOCUMENTS_NS)
		_set_text(shipment, 'CustomsEntry_Id', 0, DOCUMENTS_NS)
	_set_carrier_on_shipment(shipment, getattr(row, 'carrier_profile', None), include_object=include_directory_objects)
	if house_bill and getattr(row, 'carrier_profile', None):
		carrier = frappe.get_cached_doc('Carrier', row.carrier_profile)
		resolved_carrier = _resolve_runtime_carrier(carrier)
		_set_text(shipment, 'HouseBillIssuer_Id', resolved_carrier.get('lds_id'), DOCUMENTS_NS)
	_set_shipment_invoices(shipment, shipment_no, invoices or [], articles or [], tariff_lines or [], reference_state=reference_state)
	_reorder_children(shipment, SHIPMENT_FIELD_RANK)



def _set_carrier_on_shipment(shipment: ET.Element, carrier_profile_name: str | None, include_object: bool = True) -> None:
	existing_carrier = _find_child(shipment, 'Carrier')
	if existing_carrier is not None:
		shipment.remove(existing_carrier)
	if not carrier_profile_name:
		return
	carrier = frappe.get_cached_doc('Carrier', carrier_profile_name)
	resolved = _resolve_runtime_carrier(carrier)
	if include_object:
		carrier_node = _build_directory_entity(
			local_name='Carrier',
			raw_payload_xml=resolved.get('raw_payload_xml'),
			lds_id=resolved.get('lds_id'),
			code=resolved.get('code'),
			name=resolved.get('name'),
		)
		if carrier_node is not None:
			_replace_child(shipment, 'Carrier', carrier_node)
	_set_text(shipment, 'Carrier_Id', resolved.get('lds_id'), DOCUMENTS_NS)



def _set_shipment_invoices(shipment: ET.Element, shipment_no: str | None, invoices, articles, tariff_lines, reference_state=None) -> None:
	matching_invoices = [row for row in invoices if (getattr(row, 'shipment_no', None) or shipment_no) == shipment_no]
	if not matching_invoices:
		_remove_child(shipment, 'Invoices')
		return
	container = _find_child(shipment, 'Invoices')
	if container is not None:
		shipment.remove(container)
	container = ET.SubElement(shipment, f'{{{DOCUMENTS_NS}}}Invoices')
	for index, row in enumerate(matching_invoices, start=1):
		invoice = ET.SubElement(container, f'{{{DOCUMENTS_NS}}}ShipmentInvoice')
		ET.SubElement(invoice, 'EntityGuid').text = str(uuid4())
		_assign_reference_id(invoice, reference_state)
		_apply_invoice_row(invoice, shipment, shipment_no, row, articles, tariff_lines, line_no=index, reference_state=reference_state)



def _apply_invoice_row(invoice: ET.Element, shipment: ET.Element, shipment_no: str | None, row, articles, tariff_lines, line_no: int = 1, reference_state=None) -> None:
	invoice_number = getattr(row, 'invoice_number', None)
	_set_text(invoice, 'Line', line_no, None)
	_set_text(invoice, 'InvoiceNumber', invoice_number, DOCUMENTS_NS)
	_set_text(invoice, 'InvoiceValueCurrency', getattr(row, 'currency', None), DOCUMENTS_NS)
	_set_text(invoice, 'InvoiceValue', getattr(row, 'invoice_amount', None), DOCUMENTS_NS)
	_set_text(invoice, 'Description', getattr(row, 'vendor_name', None), DOCUMENTS_NS)
	shipment_ref_id = _node_reference_id(shipment)
	if shipment_ref_id:
		_set_reference_child(invoice, 'Shipment', shipment_ref_id, DOCUMENTS_NS)
	_set_invoice_articles(invoice, shipment_no, invoice_number, articles, tariff_lines, reference_state=reference_state)
	_reorder_children(invoice, INVOICE_FIELD_RANK)



def _set_invoice_articles(invoice: ET.Element, shipment_no: str | None, invoice_number: str | None, articles, tariff_lines, reference_state=None) -> None:
	matching_articles = [row for row in articles if (getattr(row, 'shipment_no', None) or shipment_no) == shipment_no and (getattr(row, 'invoice_number', None) or invoice_number) == invoice_number]
	if not matching_articles:
		_remove_child(invoice, 'Articles')
		return
	container = _find_child(invoice, 'Articles')
	if container is not None:
		invoice.remove(container)
	container = ET.SubElement(invoice, f'{{{DOCUMENTS_NS}}}Articles')
	for row in matching_articles:
		article = ET.SubElement(container, f'{{{DOCUMENTS_NS}}}ShipmentArticle')
		ET.SubElement(article, 'EntityGuid').text = str(uuid4())
		_assign_reference_id(article, reference_state)
		_apply_article_row(article, invoice, shipment_no, invoice_number, row, tariff_lines, reference_state=reference_state)



def _apply_article_row(article: ET.Element, invoice: ET.Element, shipment_no: str | None, invoice_number: str | None, row, tariff_lines, reference_state=None) -> None:
	article_line_no = getattr(row, 'article_line_no', None)
	_set_text(article, 'Line', article_line_no, None)
	_set_text(article, 'Description', getattr(row, 'description', None), DOCUMENTS_NS)
	_set_text(article, 'LineItemIdentifier', getattr(row, 'line_item_identifier', None), DOCUMENTS_NS)
	_set_text(article, 'CountryOfOrigin', getattr(row, 'country_of_origin', None), DOCUMENTS_NS)
	_set_text(article, 'CountryOfExport', getattr(row, 'country_of_export', None), DOCUMENTS_NS)
	_set_text(article, 'RelatedPartyIndicator', getattr(row, 'related_party_indicator', None) or 'N', DOCUMENTS_NS)
	_set_text(article, 'GrossWeight', getattr(row, 'gross_weight', None), DOCUMENTS_NS)
	_set_text(article, 'ArticleChargeUSD', getattr(row, 'entered_value', None), DOCUMENTS_NS)
	_set_text(article, 'HarborMaintenanceFee', getattr(row, 'harbor_maintenance_fee', None), DOCUMENTS_NS)
	_set_text(article, 'MerchandiseProcessingFee', getattr(row, 'merchandise_processing_fee', None), DOCUMENTS_NS)
	_set_text(article, 'Manufacturer_Id', getattr(row, 'manufacturer_lds_id', None), DOCUMENTS_NS)
	invoice_ref_id = _node_reference_id(invoice)
	if invoice_ref_id:
		_set_reference_child(article, 'Invoice', invoice_ref_id, DOCUMENTS_NS)
	_set_article_tariffs(article, shipment_no, invoice_number, article_line_no, tariff_lines, reference_state=reference_state)
	_reorder_children(article, ARTICLE_FIELD_RANK)



def _set_article_tariffs(article: ET.Element, shipment_no: str | None, invoice_number: str | None, article_line_no: str | None, tariff_lines, reference_state=None) -> None:
	matching_tariffs = [row for row in tariff_lines if (getattr(row, 'shipment_no', None) or shipment_no) == shipment_no and (getattr(row, 'invoice_number', None) or invoice_number) == invoice_number and (getattr(row, 'article_line_no', None) or article_line_no) == article_line_no]
	if not matching_tariffs:
		_remove_child(article, 'Tariffs')
		return
	container = _find_child(article, 'Tariffs')
	if container is not None:
		article.remove(container)
	container = ET.SubElement(article, f'{{{DOCUMENTS_NS}}}Tariffs')
	for row in matching_tariffs:
		tariff = ET.SubElement(container, f'{{{DOCUMENTS_NS}}}ShipmentArticleTariff')
		ET.SubElement(tariff, 'EntityGuid').text = str(uuid4())
		_assign_reference_id(tariff, reference_state)
		_apply_tariff_row(tariff, article, row)



def _apply_tariff_row(tariff: ET.Element, article: ET.Element, row) -> None:
	_set_text(tariff, 'Line', getattr(row, 'line_no', None), None)
	article_ref_id = _node_reference_id(article)
	if article_ref_id:
		_set_reference_child(tariff, 'ShipmentArticle', article_ref_id, DOCUMENTS_NS)
	_set_text(tariff, 'HarmonizedTariff_Id', _resolve_harmonized_tariff_id(getattr(row, 'hs_code', None)), DOCUMENTS_NS)
	_set_text(tariff, 'TariffValue', getattr(row, 'entered_value', None), DOCUMENTS_NS)
	_set_text(tariff, 'UnitOfMeasure1', getattr(row, 'uom', None), DOCUMENTS_NS)
	_set_text(tariff, 'Quantity1', getattr(row, 'quantity', None), DOCUMENTS_NS)
	_reorder_children(tariff, TARIFF_FIELD_RANK)



def _resolve_harmonized_tariff_id(hs_code: str | None) -> str | None:
	if not hs_code:
		return None
	client = get_client()
	if not hasattr(client, 'fetch_harmonized_tariff_by_code_xml'):
		return None
	try:
		xml = client.fetch_harmonized_tariff_by_code_xml(hs_code)
		root = _strip_serialization_attributes(ET.fromstring(xml))
	except (LDSClientError, ET.ParseError):
		return None
	return _extract_id_from_directory_entity(root)


def _build_directory_entity(local_name: str, raw_payload_xml: str | None, lds_id: str | None, code: str | None, name: str | None) -> ET.Element | None:
	root = None
	if raw_payload_xml:
		try:
			root = _strip_serialization_attributes(ET.fromstring(raw_payload_xml))
			root = _unwrap_directory_entity_root(root)
		except ET.ParseError:
			root = None
	if root is None:
		if not any([lds_id, code, name]):
			return None
		root = ET.Element(f'{{{DOCUMENTS_NS}}}{local_name}')
	else:
		root.tag = f'{{{DOCUMENTS_NS}}}{local_name}'
	if lds_id:
		_set_text(root, 'Id', lds_id, DOCUMENTS_NS)
	if code:
		_set_text(root, 'Code', code, DOCUMENTS_NS)
	if name:
		_set_text(root, 'Name', name, DOCUMENTS_NS)
	return root


def _set_consignee(parent: ET.Element, consignee_name: str | None) -> None:
	if not consignee_name:
		return
	consignee = _find_child(parent, "Consignee")
	if consignee is None:
		consignee = ET.SubElement(parent, f"{{{DOCUMENTS_NS}}}Consignee")
	name = _find_direct_child(consignee, "Name")
	if name is None:
		name = ET.SubElement(consignee, "Name")
	name.text = consignee_name


def _set_entry_carrier(parent: ET.Element, shipments, include_object: bool = True) -> None:
	resolved_carriers = []
	for row in shipments:
		carrier_profile = getattr(row, 'carrier_profile', None)
		if not carrier_profile:
			continue
		carrier = frappe.get_cached_doc('Carrier', carrier_profile)
		resolved = _resolve_runtime_carrier(carrier)
		carrier_id = resolved.get('lds_id')
		if not carrier_id:
			continue
		resolved_carriers.append(resolved)

	unique_ids = list(dict.fromkeys(str(item.get('lds_id')) for item in resolved_carriers if item.get('lds_id')))
	if len(unique_ids) != 1:
		_remove_child(parent, 'Carrier')
		_remove_child(parent, 'Carrier_Id')
		return

	selected = next((item for item in resolved_carriers if str(item.get('lds_id')) == unique_ids[0]), None) or {}
	carrier_id = selected.get('lds_id')
	carrier_name = selected.get('name')
	carrier_raw_payload = selected.get('raw_payload_xml')
	if include_object:
		carrier = _build_directory_entity(
			local_name='Carrier',
			raw_payload_xml=carrier_raw_payload,
			lds_id=carrier_id,
			code=None,
			name=carrier_name,
		)
		if carrier is not None:
			_replace_child(parent, 'Carrier', carrier)
	else:
		_remove_child(parent, 'Carrier')
	_set_text(parent, 'Carrier_Id', carrier_id, DOCUMENTS_NS)


def _unwrap_directory_entity_root(root: ET.Element) -> ET.Element:
	if _find_direct_child(root, 'Id') is not None or _find_direct_child(root, 'EntityGuid') is not None:
		return root
	children = list(root)
	if len(children) == 1 and (_find_direct_child(children[0], 'Id') is not None or _find_direct_child(children[0], 'EntityGuid') is not None):
		return children[0]
	return root


def _resolve_port_id(port_code: str | None) -> str | None:
	if not port_code:
		return None
	client = get_client()
	if not hasattr(client, 'fetch_customs_port_by_code_xml'):
		return None
	try:
		root = _strip_serialization_attributes(ET.fromstring(client.fetch_customs_port_by_code_xml(port_code)))
	except (LDSClientError, ET.ParseError):
		return None
	return _extract_id_from_directory_entity(root)


def _find_child(parent: ET.Element, local_name: str) -> ET.Element | None:
	for child in list(parent):
		if child.tag.split("}", 1)[-1] == local_name:
			return child
	return None


def _find_direct_child(parent: ET.Element, local_name: str) -> ET.Element | None:
	for child in list(parent):
		if child.tag.split("}", 1)[-1] == local_name:
			return child
	return None


def _extract_id_from_directory_entity(root: ET.Element) -> str | None:
	id_node = _find_direct_child(root, 'Id')
	if id_node is None or not id_node.text:
		return None
	return id_node.text.strip()

def _node_reference_id(node: ET.Element) -> str | None:
	return node.attrib.get(f'{{{SERIALIZATION_NS}}}Id')


def _set_reference_child(parent: ET.Element, local_name: str, ref_id: str, namespace: str | None) -> None:
	existing = _find_child(parent, local_name)
	if existing is not None:
		parent.remove(existing)
	tag = local_name if namespace is None else f'{{{namespace}}}{local_name}'
	element = ET.SubElement(parent, tag)
	element.set(f'{{{SERIALIZATION_NS}}}Ref', ref_id)


def _extract_root_text(root: ET.Element, local_name: str) -> str | None:
	node = _find_direct_child(root, local_name)
	if node is None or node.text is None:
		return None
	return node.text


def _assign_reference_id(node: ET.Element, reference_state: list[int] | None) -> None:
	if reference_state is None:
		return
	reference_state[0] += 1
	node.set(f'{{{SERIALIZATION_NS}}}Id', f'i{reference_state[0]}')


def _reorder_children(parent: ET.Element, rank: dict[str, int]) -> None:
	children = list(parent)
	children.sort(key=lambda child: rank.get(child.tag.split("}", 1)[-1], len(rank) + 100))
	parent[:] = children


def _as_datetime_text(value: Any) -> str | None:
	if not value:
		return None
	if hasattr(value, 'isoformat'):
		text = value.isoformat()
	else:
		text = str(value)
	if len(text) == 10:
		return f"{text}T00:00:00"
	return text.replace(' ', 'T')


@frappe.whitelist()
def generate_draft_entry_number() -> str:
	while True:
		value = "TMP" + uuid4().hex[:5].upper()
		if not _entry_number_exists(value):
			return value



def create_draft_from_entry(source_name: str) -> str:
	source = frappe.get_doc("Customs Entry", source_name)
	draft = frappe.new_doc("Customs Entry")
	fields_to_copy = [
		"filer_code",
		"entry_date",
		"entry_type",
		"port_of_entry",
		"transport_mode",
		"importer_profile",
		"importer_name",
		"client_ref",
		"importer_number",
		"consignee_name",
		"broker_reference",
		"bond_number",
		"house_bill",
		"master_bill",
		"total_entered_value",
		"currency",
	]
	for fieldname in fields_to_copy:
		draft.set(fieldname, source.get(fieldname))

	draft.entry_number = generate_draft_entry_number()
	draft.lds_id = None
	draft.status = "Draft"
	draft.psc_status = None
	draft.liquidation_status = None
	draft.filing_date = None
	draft.preliminary_statement_print_date = None
	draft.release_date = None
	draft.liquidation_date = None
	draft.created_by = None
	draft.creator_lds_id = None
	draft.source_active = 0
	draft.archived_on = None
	draft.last_seen_in_source_on = None
	draft.last_synced_on = None
	draft.lds_submission_errors = None
	draft.last_lds_submission_on = None
	draft.lds_last_submission_payload = None
	draft.raw_payload_xml = None

	for child_field in CHILD_TABLE_FIELDS:
		draft.set(child_field, [])
		for row in source.get(child_field) or []:
			draft.append(child_field, row.as_dict(no_default_fields=True))

	draft.insert(ignore_permissions=True)
	return draft.name

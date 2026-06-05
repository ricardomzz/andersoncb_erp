from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import re
from typing import Any
from uuid import uuid4
from xml.etree import ElementTree as ET

import frappe
from frappe import _
from frappe.utils import now_datetime

from andersoncb_erp.integrations.lds import LDSClientError, LDSValidationError, XSI_NS
from andersoncb_erp.services.mapping import parse_entry_xml
from andersoncb_erp.services.master_data import resolve_master_links
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

CHILD_TABLE_FIELDS = ("shipments", "invoices", "fees", "events", "tariff_lines", "references")
DRAFT_ENTRY_NUMBER_RE = re.compile(r"^TMP[A-Z0-9]{5}$")

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

	if getattr(doc, 'importer_profile', None):
		profile = frappe.get_cached_doc('Importer Profile', doc.importer_profile)
		if profile.docstatus != 1 or not profile.lds_id:
			issues.append(LocalValidationIssue('importer_profile', 'Importer Profile must be submitted to LDS before it can be used on a Customs Entry.'))
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
		if carrier.docstatus != 1 or not carrier.lds_id:
			issues.append(LocalValidationIssue('shipments', 'Each shipment carrier must be submitted to LDS before it can be used on a Customs Entry.'))
			break
		if not (carrier.display_name or carrier.carrier_code):
			issues.append(LocalValidationIssue('shipments', 'Each shipment carrier must have a display name or carrier code.'))
			break

	for row in getattr(doc, "invoices", []) or []:
		if not getattr(row, "invoice_number", None):
			issues.append(LocalValidationIssue("invoices", "Each invoice row must have an Invoice Number."))
			break

	return issues


def format_local_validation_issues(issues: list[LocalValidationIssue]) -> str:
	return "\n".join(f"- {issue.message}" for issue in issues)


def build_submission_entity_xml(doc) -> str:
	template_root = _build_entry_submission_template_root(doc)
	entity = ET.Element("entity")

	for attr_name, value in template_root.attrib.items():
		if attr_name == "{http://www.w3.org/2001/XMLSchema-instance}type":
			continue
		entity.set(attr_name, value)
	for child in list(template_root):
		entity.append(deepcopy(child))

	entry_number = _determine_submission_entry_number(template_root, doc)
	if entry_number:
		_set_text(entity, "EntryNumber", entry_number, DOCUMENTS_NS)
	broker_reference = _determine_submission_broker_reference(doc, entry_number)
	_set_text(entity, "EntryFilerCode", doc.filer_code, DOCUMENTS_NS)
	_set_text(entity, "EntryType", doc.entry_type, DOCUMENTS_NS)
	_set_text(entity, "Date", _as_datetime_text(doc.entry_date), None)
	_set_text(entity, "TransportationMode", doc.transport_mode, DOCUMENTS_NS)
	_set_text(entity, "BrokerReferenceNumber", broker_reference, DOCUMENTS_NS)
	_set_text(entity, "SuretyCode", doc.bond_number, DOCUMENTS_NS)
	_set_text(entity, "ClientRef", doc.client_ref, DOCUMENTS_NS)
	_set_entry_arrival_fields(entity, doc.shipments or [])
	_set_port_of_entry(entity, doc.port_of_entry)
	_set_port_of_unlading(entity, doc.port_of_entry)
	_set_importer_from_profile(entity, doc.importer_profile)
	_set_entry_carrier(entity, doc.shipments or [])
	if getattr(doc, 'lds_id', None):
		_set_shipments(entity, doc.shipments or [], importer_profile_name=getattr(doc, 'importer_profile', None), house_bill=getattr(doc, 'house_bill', None))
	else:
		_remove_child(entity, 'Shipments')
	_reorder_children(entity, ENTRY_FIELD_RANK)

	return ET.tostring(entity, encoding="unicode")


def process_lds_submission(doc) -> None:
	issues = validate_customs_entry_for_submission(doc)
	if issues:
		message = _("Local validation failed before LDS submission:") + "\n" + format_local_validation_issues(issues)
		doc.status = "Draft"
		doc.lds_submission_errors = message
		raise frappe.ValidationError(message)

	entity_xml = build_submission_entity_xml(doc)
	doc.last_lds_submission_on = now_datetime()
	doc.lds_last_submission_payload = entity_xml

	submitted_entry_number = _extract_submission_entry_number(entity_xml)
	try:
		saved_xml = get_client().save_entry_xml(entity_xml)
		saved_xml = _hydrate_saved_entry_xml(saved_xml, submitted_entry_number, doc.filer_code)
	except LDSValidationError as exc:
		message = format_lds_validation_error(exc)
		doc.status = "Draft"
		doc.lds_submission_errors = message
		raise frappe.ValidationError(message)
	except LDSClientError as exc:
		message = _("LDS submission failed: {0}").format(str(exc))
		doc.status = "Draft"
		doc.lds_submission_errors = message
		raise frappe.ValidationError(message)

	mapped = resolve_master_links(parse_entry_xml(saved_xml), synced_on=now_datetime(), create_missing=False)
	mapped["status"] = derive_entry_status(mapped, source_active=1)
	mapped["liquidation_status"] = derive_liquidation_status(mapped)

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

	frappe.db.set_value(
		doc.doctype,
		doc.name,
		{
			"status": doc.status,
			"docstatus": 0,
			"last_lds_submission_on": doc.last_lds_submission_on,
			"lds_submission_errors": doc.lds_submission_errors,
			"lds_last_submission_payload": doc.lds_last_submission_payload,
		},
		update_modified=False,
	)
	frappe.db.commit()


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

	doc.flags.skip_lds_submission = True
	doc.submit()
	return {"ok": True, "name": doc.name}


def format_lds_validation_error(exc: LDSValidationError) -> str:
	if not exc.details:
		return _("LDS validation failed: {0}").format(str(exc))
	lines = [_("LDS validation failed:")]
	for detail in exc.details:
		prefix = f"[{detail.property_name}] " if detail.property_name else ""
		lines.append(f"- {prefix}{detail.error_message}")
	return "\n".join(lines)


def _hydrate_saved_entry_xml(saved_xml: str, entry_number: str | None, filer_code: str | None) -> str:
	try:
		root = ET.fromstring(saved_xml)
	except ET.ParseError:
		return saved_xml
	if _find_direct_child(root, 'EntryNumber') is not None or _find_direct_child(root, 'Id') is not None and root.attrib.get(f'{{{SERIALIZATION_NS}}}Ref') is None:
		return saved_xml
	if not entry_number:
		return saved_xml
	try:
		return get_client().fetch_entry_detail_xml(entry_number, filer_code)
	except LDSClientError:
		return saved_xml


def _extract_submission_entry_number(entity_xml: str) -> str | None:
	try:
		root = ET.fromstring(entity_xml)
	except ET.ParseError:
		return None
	node = _find_child(root, 'EntryNumber')
	if node is None or not node.text:
		return None
	return node.text.strip()


def _build_entry_submission_template_root(doc) -> ET.Element:
	return _parse_new_entry_template_root()


def _determine_submission_entry_number(template_root: ET.Element, doc) -> str | None:
	if getattr(doc, 'lds_id', None):
		return getattr(doc, 'entry_number', None)
	template_number = _extract_template_number(template_root)
	if template_number and getattr(doc, 'filer_code', None):
		return get_client().calculate_entry_number(template_number, doc.filer_code, check_unique=True, adjust_sequence=False)
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


@frappe.whitelist()
def get_new_entry_template_xml() -> str:
	return get_client().new_entry_xml()


def _parse_new_entry_template_root() -> ET.Element:
	return _strip_serialization_attributes(ET.fromstring(get_client().new_entry_xml()))


def _build_new_shipment_template_root() -> ET.Element:
	client = get_client()
	if not hasattr(client, 'new_shipment_xml'):
		return ET.Element(f'{{{DOCUMENTS_NS}}}Shipment')
	root = ET.fromstring(client.new_shipment_xml())
	root.tag = f'{{{DOCUMENTS_NS}}}Shipment'
	return _strip_serialization_attributes(root)


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


def _set_entry_arrival_fields(parent: ET.Element, shipments) -> None:
	arrival = None
	for row in shipments:
		arrival = _as_datetime_text(getattr(row, 'arrival_date', None))
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


def _set_importer_from_profile(parent: ET.Element, importer_profile_name: str | None) -> None:
	if not importer_profile_name:
		return
	profile = frappe.get_cached_doc('Importer Profile', importer_profile_name)
	importer = _build_directory_entity(
		local_name='Importer',
		raw_payload_xml=profile.raw_payload_xml,
		lds_id=profile.lds_id,
		code=profile.importer_code or profile.cbp_number or profile.irs_number,
		name=profile.display_name,
	)
	if importer is not None:
		_replace_child(parent, 'Importer', importer)
	_set_text(parent, 'Importer_Id', getattr(profile, 'lds_id', None), DOCUMENTS_NS)


def _set_shipments(parent: ET.Element, shipments, importer_profile_name: str | None = None, house_bill: str | None = None) -> None:
	container = _find_child(parent, 'Shipments')
	existing_shipments = []
	if container is not None:
		existing_shipments = [child for child in list(container) if child.tag.split('}', 1)[-1] == 'Shipment']

	if container is not None and existing_shipments and len(existing_shipments) == len(shipments):
		for shipment, row in zip(existing_shipments, shipments):
			_apply_shipment_row(shipment, row, importer_profile_name, house_bill=house_bill)
		return

	if container is not None:
		parent.remove(container)
	container = ET.SubElement(parent, f'{{{DOCUMENTS_NS}}}Shipments')
	for row in shipments:
		shipment = _build_new_shipment_template_root()
		container.append(shipment)
		_apply_shipment_row(shipment, row, importer_profile_name, house_bill=house_bill)


def _apply_shipment_row(shipment: ET.Element, row, importer_profile_name: str | None = None, house_bill: str | None = None) -> None:
	_set_text(shipment, 'Number', getattr(row, 'shipment_no', None), DOCUMENTS_NS)
	_set_text(shipment, 'TransportationMode', getattr(row, 'mode', None), DOCUMENTS_NS)
	arrival = _as_datetime_text(getattr(row, 'arrival_date', None))
	_set_text(shipment, 'DateOfImport', arrival, DOCUMENTS_NS)
	_set_text(shipment, 'DateOfArrival', arrival, DOCUMENTS_NS)
	_set_text(shipment, 'Direction', 'IM', DOCUMENTS_NS)
	_set_text(shipment, 'HouseBillNumber', house_bill, DOCUMENTS_NS)
	if importer_profile_name:
		profile = frappe.get_cached_doc('Importer Profile', importer_profile_name)
		importer_id = getattr(profile, 'lds_id', None)
		_set_text(shipment, 'Importer_Id', importer_id, DOCUMENTS_NS)
		_set_text(shipment, 'Buyer_Id', importer_id, DOCUMENTS_NS)
		_set_text(shipment, 'Consignee_Id', importer_id, DOCUMENTS_NS)
		_set_text(shipment, 'ShipTo_Id', importer_id, DOCUMENTS_NS)
		_set_text(shipment, 'Seller_Id', importer_id, DOCUMENTS_NS)
		_set_text(shipment, 'Consolidator_Id', importer_id, DOCUMENTS_NS)
		_set_text(shipment, 'StuffingLocation_Id', importer_id, DOCUMENTS_NS)
	_set_carrier_on_shipment(shipment, getattr(row, 'carrier_profile', None))
	if house_bill and getattr(row, 'carrier_profile', None):
		carrier = frappe.get_cached_doc('Carrier', row.carrier_profile)
		_set_text(shipment, 'HouseBillIssuer_Id', getattr(carrier, 'lds_id', None), DOCUMENTS_NS)
	_reorder_children(shipment, SHIPMENT_FIELD_RANK)


def _set_carrier_on_shipment(shipment: ET.Element, carrier_profile_name: str | None) -> None:
	existing_carrier = _find_child(shipment, 'Carrier')
	if existing_carrier is not None:
		shipment.remove(existing_carrier)
	if not carrier_profile_name:
		return
	carrier = frappe.get_cached_doc('Carrier', carrier_profile_name)
	_set_text(shipment, 'Carrier_Id', getattr(carrier, 'lds_id', None), DOCUMENTS_NS)


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


def _set_entry_carrier(parent: ET.Element, shipments) -> None:
	carrier_id = None
	carrier_name = None
	carrier_raw_payload = None
	for row in shipments:
		carrier_profile = getattr(row, 'carrier_profile', None)
		if not carrier_profile:
			continue
		carrier = frappe.get_cached_doc('Carrier', carrier_profile)
		carrier_id = getattr(carrier, 'lds_id', None)
		carrier_name = getattr(carrier, 'display_name', None)
		carrier_raw_payload = getattr(carrier, 'raw_payload_xml', None)
		if carrier_id:
			break
	carrier = _build_directory_entity(
		local_name='Carrier',
		raw_payload_xml=carrier_raw_payload,
		lds_id=carrier_id,
		code=None,
		name=carrier_name,
	)
	if carrier is not None:
		_replace_child(parent, 'Carrier', carrier)
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


def _reorder_children(parent: ET.Element, rank: dict[str, int]) -> None:
	children = list(parent)
	children.sort(key=lambda child: rank.get(child.tag.split("}", 1)[-1], len(rank) + 100))
	parent[:] = children


def _as_datetime_text(value: Any) -> str | None:
	if not value:
		return None
	text = str(value)
	if len(text) == 10:
		return f"{text}T00:00:00"
	return text


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
	draft.liquidation_status = None
	draft.filing_date = None
	draft.release_date = None
	draft.liquidation_date = None
	draft.created_by = None
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

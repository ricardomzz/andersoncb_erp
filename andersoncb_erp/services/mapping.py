from __future__ import annotations

from datetime import date, datetime
from typing import Any
from xml.etree import ElementTree as ET


def parse_entry_xml(entry_xml: str) -> dict[str, Any]:
	root = ET.fromstring(entry_xml)
	ref_index = build_ref_index(root)
	importer_profile_data = extract_importer_profile_data(root, ref_index)
	creator_lds_id = child_text(root, 'Creator_Id', ref_index=ref_index) or child_text(root, 'Creator', ref_index=ref_index)
	invoices = map_invoices(root, ref_index)
	currency = child_text(root, 'Currency', ref_index=ref_index) or (invoices[0].get('currency') if invoices else None)
	return {
		'lds_id': child_text(root, 'Id', ref_index=ref_index),
		'filer_code': child_text(root, 'FilerCode', ref_index=ref_index) or child_text(root, 'EntryFilerCode', ref_index=ref_index),
		'entry_number': require_text(root, 'EntryNumber', ref_index=ref_index),
		'source_active': 1,
		'entry_date': to_date_string(child_text(root, 'Date', ref_index=ref_index)),
		'estimated_entry_date': to_date_string(child_text(root, 'EstimatedEntryDate', ref_index=ref_index)),
		'filing_date': to_date_string(child_text(root, 'FilingDate', ref_index=ref_index)),
		'preliminary_statement_print_date': to_date_string(child_text(root, 'PreliminaryStatementPrintDate', ref_index=ref_index)),
		'release_date': to_date_string(child_text(root, 'ReleaseDate', ref_index=ref_index) or child_text(root, 'DateOfRelease', ref_index=ref_index)),
		'liquidation_date': to_date_string(child_text(root, 'LiquidationDate', ref_index=ref_index) or child_text(root, 'Liquidation', ref_index=ref_index)),
		'arrival_date': to_date_string(child_text(root, 'DateOfArrival', ref_index=ref_index) or first_nested_text(root, [('Shipments', 'Shipment', 'DateOfArrival')], ref_index=ref_index) or first_nested_text(root, [('Shipments', 'Shipment', 'DateOfImport')], ref_index=ref_index)),
		'entry_type': child_text(root, 'EntryType', ref_index=ref_index),
		'status': child_text(root, 'Status', ref_index=ref_index) or child_text(root, 'EntryStatus', ref_index=ref_index),
		'psc_flag': to_bool(find_text(root, 'PostSummaryCorrection', ref_index=ref_index)),
		'psc_accelerated_liquidation_flag': to_bool(find_text(root, 'PostSummaryCorrectionAcceleratedLiquidation', ref_index=ref_index)),
		'port_of_entry': first_nested_text(root, [('PortOfEntry', 'Code')], ref_index=ref_index),
		'port_of_unlading': first_nested_text(root, [('PortOfUnlading', 'Code')], ref_index=ref_index),
		'transport_mode': child_text(root, 'TransportationMode', ref_index=ref_index),
		'conveyance_name': child_text(root, 'ConveyanceName', ref_index=ref_index),
		'trip_identifier': child_text(root, 'TripIdentifier', ref_index=ref_index),
		'payment_type': child_text(root, 'PaymentType', ref_index=ref_index),
		'importer_name': importer_profile_data.get('display_name') if importer_profile_data else None,
		'importer_lds_id': (importer_profile_data or {}).get('lds_id') or child_text(root, 'Importer_Id', ref_index=ref_index),
		'client_ref': child_text(root, 'ClientRef', ref_index=ref_index) or first_nested_text(root, [('Shipments', 'Shipment', 'ClientRef')], ref_index=ref_index),
		'created_by': creator_lds_id,
		'creator_lds_id': creator_lds_id,
		'importer_number': _importer_number(importer_profile_data),
		'consignee_name': first_nested_text(root, [('Consignee', 'Name')], ref_index=ref_index) or (importer_profile_data.get('display_name') if importer_profile_data else None),
		'broker_reference': child_text(root, 'BrokerReference', ref_index=ref_index) or child_text(root, 'BrokerReferenceNumber', ref_index=ref_index) or child_text(root, 'ReferenceNumber', ref_index=ref_index),
		'bond_number': child_text(root, 'BondNumber', ref_index=ref_index),
		'bond_type': child_text(root, 'BondType', ref_index=ref_index),
		'surety_code': child_text(root, 'SuretyCode', ref_index=ref_index),
		'house_bill': child_text(root, 'HouseBill', ref_index=ref_index) or first_nested_text(root, [('Shipments', 'Shipment', 'HouseBillNumber')], ref_index=ref_index),
		'master_bill': child_text(root, 'MasterBill', ref_index=ref_index) or first_nested_text(root, [('Shipments', 'Shipment', 'MasterBillNumber')], ref_index=ref_index),
		'total_entered_value': to_float(child_text(root, 'TotalEnteredValue', ref_index=ref_index) or child_text(root, 'EnteredValue', ref_index=ref_index)) or sum_numeric(invoice.get('invoice_amount') for invoice in invoices),
		'currency': currency,
		'raw_payload_xml': entry_xml,
		'importer_profile_data': importer_profile_data,
		'shipments': map_shipments(root, ref_index),
		'invoices': invoices,
		'articles': map_articles(root, ref_index),
		'fees': map_fees(root, ref_index),
		'events': map_events(root, ref_index),
		'tariff_lines': map_tariff_lines(root, ref_index),
		'references': map_references(root, ref_index),
	}


def extract_importer_profile_data(root: ET.Element, ref_index: dict[str, ET.Element]) -> dict[str, Any] | None:
	importer = first_child(root, 'Importer', ref_index=ref_index)
	if importer is None:
		return None
	return {
		'lds_id': child_text(importer, 'Id', ref_index=ref_index),
		'display_name': child_text(importer, 'Name', ref_index=ref_index),
		'importer_code': child_text(importer, 'Code', ref_index=ref_index) or child_text(importer, 'Number', ref_index=ref_index),
		'cbp_number': child_text(importer, 'CBPNumber', ref_index=ref_index),
		'irs_number': child_text(importer, 'IRSNumber', ref_index=ref_index),
		'address_line1': child_text(importer, 'Address1', ref_index=ref_index) or child_text(importer, 'Adress1', ref_index=ref_index),
		'address_line2': child_text(importer, 'Address2', ref_index=ref_index) or child_text(importer, 'Adress2', ref_index=ref_index),
		'city': child_text(importer, 'City', ref_index=ref_index),
		'state': child_text(importer, 'State', ref_index=ref_index),
		'postal_code': child_text(importer, 'ZIP', ref_index=ref_index),
		'country': child_text(importer, 'Country', ref_index=ref_index),
		'contact_name': child_text(importer, 'ContactPersonName', ref_index=ref_index),
		'email': child_text(importer, 'Email', ref_index=ref_index),
		'phone': child_text(importer, 'Phone', ref_index=ref_index),
		'raw_payload_xml': ET.tostring(importer, encoding='unicode'),
	}


def extract_carrier_profile_data(shipment: ET.Element, ref_index: dict[str, ET.Element]) -> dict[str, Any] | None:
	carrier = first_child(shipment, 'Carrier', ref_index=ref_index)
	carrier_id = child_text(shipment, 'Carrier_Id', ref_index=ref_index)
	carrier_code = child_text(shipment, 'CarrierCode', ref_index=ref_index)
	carrier_name = None
	raw_payload_xml = None
	if carrier is not None:
		carrier_name = child_text(carrier, 'Name', ref_index=ref_index)
		carrier_code = carrier_code or child_text(carrier, 'Code', ref_index=ref_index)
		raw_payload_xml = ET.tostring(carrier, encoding='unicode')
	if not any([carrier_id, carrier_code, carrier_name, raw_payload_xml]):
		return None
	return {
		'lds_id': carrier_id,
		'carrier_code': carrier_code,
		'display_name': carrier_name,
		'raw_payload_xml': raw_payload_xml,
	}


def _importer_number(importer_profile_data: dict[str, Any] | None) -> str | None:
	if not importer_profile_data:
		return None
	return importer_profile_data.get('importer_code') or importer_profile_data.get('cbp_number') or importer_profile_data.get('irs_number')


def require_text(element: ET.Element, tag_name: str, ref_index: dict[str, ET.Element] | None = None) -> str:
	value = child_text(element, tag_name, ref_index=ref_index) or find_text(element, tag_name, ref_index=ref_index)
	if not value:
		raise ValueError(f'LDS entry XML is missing required field: {tag_name}.')
	return value


def build_ref_index(root: ET.Element) -> dict[str, ET.Element]:
	index: dict[str, ET.Element] = {}
	for element in root.iter():
		identifier = attr_value(element, 'Id')
		if identifier:
			index[identifier] = element
	return index


def attr_value(element: ET.Element, local_attr_name: str) -> str | None:
	for attr_name, value in element.attrib.items():
		if localname(attr_name) == local_attr_name and value:
			return value
	return None


def resolve_element(element: ET.Element, ref_index: dict[str, ET.Element] | None = None) -> ET.Element:
	if not ref_index:
		return element
	ref = attr_value(element, 'Ref')
	return ref_index.get(ref, element) if ref else element


def text_of(element: ET.Element | None) -> str | None:
	if element is None:
		return None
	text = (element.text or '').strip()
	return text or None


def child_text(element: ET.Element, tag_name: str, ref_index: dict[str, ET.Element] | None = None) -> str | None:
	return text_of(first_child(element, tag_name, ref_index=ref_index))


def find_text(element: ET.Element, tag_name: str, ref_index: dict[str, ET.Element] | None = None) -> str | None:
	for child in element.iter():
		resolved = resolve_element(child, ref_index)
		if localname(resolved.tag) == tag_name:
			text = text_of(resolved)
			if text:
				return text
	return None


def direct_children(element: ET.Element, tag_name: str, ref_index: dict[str, ET.Element] | None = None) -> list[ET.Element]:
	children = []
	for child in list(element):
		resolved = resolve_element(child, ref_index)
		if localname(resolved.tag) == tag_name:
			children.append(resolved)
	return children


def first_child(element: ET.Element, tag_name: str, ref_index: dict[str, ET.Element] | None = None) -> ET.Element | None:
	for child in list(element):
		resolved = resolve_element(child, ref_index)
		if localname(resolved.tag) == tag_name:
			return resolved
	return None


def collection_children(element: ET.Element, container_name: str, item_name: str, ref_index: dict[str, ET.Element] | None = None) -> list[ET.Element]:
	container = first_child(element, container_name, ref_index=ref_index)
	if container is not None:
		items = direct_children(container, item_name, ref_index=ref_index)
		if items:
			return items
	return descendants(element, item_name, ref_index=ref_index)


def first_nested_text(element: ET.Element, paths: list[tuple[str, ...]], ref_index: dict[str, ET.Element] | None = None) -> str | None:
	for path in paths:
		current = element
		for tag_name in path:
			current = first_child(current, tag_name, ref_index=ref_index) if current is not None else None
			if current is None:
				break
		text = text_of(current)
		if text:
			return text
	return None


def descendants(element: ET.Element, tag_name: str, ref_index: dict[str, ET.Element] | None = None) -> list[ET.Element]:
	items = []
	for child in element.iter():
		resolved = resolve_element(child, ref_index)
		if localname(resolved.tag) == tag_name:
			items.append(resolved)
	return dedupe_elements(items)


def dedupe_elements(elements: list[ET.Element]) -> list[ET.Element]:
	seen = set()
	result = []
	for element in elements:
		marker = id(element)
		if marker in seen:
			continue
		seen.add(marker)
		result.append(element)
	return result


def to_bool(value: Any) -> bool:
	if isinstance(value, bool):
		return value
	text = str(value or '').strip().lower()
	return text == 'true'


def to_float(value: Any) -> float | None:
	if value in (None, ''):
		return None
	try:
		return float(value)
	except (TypeError, ValueError):
		return None


def sum_numeric(values) -> float | None:
	total = 0.0
	has_value = False
	for value in values:
		number = to_float(value)
		if number is None:
			continue
		has_value = True
		total += number
	return total if has_value else None


def to_date_string(value: Any) -> str | None:
	if value in (None, ''):
		return None
	if isinstance(value, date):
		return value.isoformat()
	if isinstance(value, datetime):
		return value.date().isoformat()
	text = str(value).strip()
	return text[:10] if text else None


def to_datetime_string(value: Any) -> str | None:
	if value in (None, ''):
		return None
	if isinstance(value, datetime):
		return value.isoformat(sep=' ')
	return str(value)


def map_shipments(root: ET.Element, ref_index: dict[str, ET.Element]) -> list[dict[str, Any]]:
	rows = []
	for shipment in collection_children(root, 'Shipments', 'Shipment', ref_index=ref_index):
		carrier_data = extract_carrier_profile_data(shipment, ref_index)
		shipment_port_of_entry = first_nested_text(shipment, [('PortOfEntry', 'Code')], ref_index=ref_index) or first_nested_text(root, [('PortOfEntry', 'Code')], ref_index=ref_index)
		shipment_port_of_unlading = first_nested_text(shipment, [('PortOfUnlading', 'Code')], ref_index=ref_index) or first_nested_text(root, [('PortOfUnlading', 'Code')], ref_index=ref_index)
		date_of_arrival = to_date_string(child_text(shipment, 'ArrivalDate', ref_index=ref_index) or child_text(shipment, 'DateOfArrival', ref_index=ref_index))
		date_of_import = to_date_string(child_text(shipment, 'DateOfImport', ref_index=ref_index))
		date_of_export = to_date_string(child_text(shipment, 'DateOfExport', ref_index=ref_index))
		rows.append({
			'shipment_no': child_text(shipment, 'ShipmentNo', ref_index=ref_index) or child_text(shipment, 'ShipmentNumber', ref_index=ref_index) or child_text(shipment, 'Number', ref_index=ref_index) or child_text(shipment, 'Id', ref_index=ref_index),
			'mode': child_text(shipment, 'TransportationMode', ref_index=ref_index) or child_text(root, 'TransportationMode', ref_index=ref_index),
			'carrier': (carrier_data or {}).get('display_name') or first_nested_text(shipment, [('Carrier', 'Name')], ref_index=ref_index),
			'carrier_data': carrier_data,
			'voyage_or_flight': first_nested_text(shipment, [('BookingLoads', 'ShipmentLoad', 'Name'), ('Loads', 'ShipmentLoad', 'Name'), ('BookingLoads', 'Name'), ('Loads', 'Name')], ref_index=ref_index) or child_text(root, 'TripIdentifier', ref_index=ref_index),
			'origin': first_nested_text(shipment, [('ForeignPort', 'Code'), ('ForeignPortOfLading', 'Code')], ref_index=ref_index) or child_text(shipment, 'CountryOfExport', ref_index=ref_index),
			'destination': shipment_port_of_unlading or shipment_port_of_entry,
			'port_of_entry': shipment_port_of_entry,
			'port_of_unlading': shipment_port_of_unlading,
			'arrival_date': date_of_arrival,
			'date_of_arrival': date_of_arrival,
			'date_of_import': date_of_import,
			'date_of_export': date_of_export,
		})
	return dedupe_rows(rows, 'shipment_no')


def map_invoices(root: ET.Element, ref_index: dict[str, ET.Element]) -> list[dict[str, Any]]:
	rows = []
	for shipment in collection_children(root, 'Shipments', 'Shipment', ref_index=ref_index):
		shipment_no = child_text(shipment, 'ShipmentNo', ref_index=ref_index) or child_text(shipment, 'ShipmentNumber', ref_index=ref_index) or child_text(shipment, 'Number', ref_index=ref_index) or child_text(shipment, 'Id', ref_index=ref_index)
		for invoice in collection_children(shipment, 'Invoices', 'ShipmentInvoice', ref_index=ref_index):
			rows.append({
				'invoice_number': child_text(invoice, 'InvoiceNumber', ref_index=ref_index) or child_text(invoice, 'InvoiceNo', ref_index=ref_index) or child_text(invoice, 'Number', ref_index=ref_index) or child_text(invoice, 'Line', ref_index=ref_index) or child_text(invoice, 'Id', ref_index=ref_index),
				'shipment_no': shipment_no,
				'invoice_date': to_date_string(child_text(invoice, 'Date', ref_index=ref_index) or child_text(invoice, 'InvoiceDate', ref_index=ref_index)),
				'currency': child_text(invoice, 'InvoiceValueCurrency', ref_index=ref_index) or child_text(invoice, 'Currency', ref_index=ref_index),
				'invoice_amount': to_float(child_text(invoice, 'InvoiceValue', ref_index=ref_index) or child_text(invoice, 'InvoiceAmount', ref_index=ref_index)),
				'vendor_name': first_nested_text(invoice, [('Seller', 'Name')], ref_index=ref_index),
			})
	return dedupe_invoice_rows(rows)



def map_articles(root: ET.Element, ref_index: dict[str, ET.Element]) -> list[dict[str, Any]]:
	rows = []
	for shipment in collection_children(root, 'Shipments', 'Shipment', ref_index=ref_index):
		shipment_no = child_text(shipment, 'ShipmentNo', ref_index=ref_index) or child_text(shipment, 'ShipmentNumber', ref_index=ref_index) or child_text(shipment, 'Number', ref_index=ref_index) or child_text(shipment, 'Id', ref_index=ref_index)
		for invoice in collection_children(shipment, 'Invoices', 'ShipmentInvoice', ref_index=ref_index):
			invoice_number = child_text(invoice, 'InvoiceNumber', ref_index=ref_index) or child_text(invoice, 'InvoiceNo', ref_index=ref_index) or child_text(invoice, 'Number', ref_index=ref_index) or child_text(invoice, 'Line', ref_index=ref_index) or child_text(invoice, 'Id', ref_index=ref_index)
			for article in collection_children(invoice, 'Articles', 'ShipmentArticle', ref_index=ref_index):
				rows.append({
					'article_line_no': child_text(article, 'Line', ref_index=ref_index),
					'description': child_text(article, 'Description', ref_index=ref_index) or child_text(invoice, 'Description', ref_index=ref_index),
					'invoice_number': invoice_number,
					'shipment_no': shipment_no,
					'line_item_identifier': child_text(article, 'LineItemIdentifier', ref_index=ref_index),
					'country_of_origin': child_text(article, 'CountryOfOrigin', ref_index=ref_index),
					'country_of_export': child_text(article, 'CountryOfExport', ref_index=ref_index),
					'manufacturer_lds_id': child_text(article, 'Manufacturer_Id', ref_index=ref_index),
					'related_party_indicator': child_text(article, 'RelatedPartyIndicator', ref_index=ref_index),
					'gross_weight': to_float(child_text(article, 'GrossWeight', ref_index=ref_index)),
					'entered_value': to_float(child_text(article, 'ArticleChargeUSD', ref_index=ref_index) or child_text(article, 'EnteredValue', ref_index=ref_index)),
					'harbor_maintenance_fee': to_float(child_text(article, 'HarborMaintenanceFee', ref_index=ref_index)),
					'merchandise_processing_fee': to_float(child_text(article, 'MerchandiseProcessingFee', ref_index=ref_index)),
				})
	return dedupe_article_rows(rows)

def map_fees(root: ET.Element, ref_index: dict[str, ET.Element]) -> list[dict[str, Any]]:
	rows = []
	default_currency = child_text(root, 'Currency', ref_index=ref_index)
	for fee in collection_children(root, 'StatementDailyEntries', 'StatementDailyEntry', ref_index=ref_index):
		rows.append({
			'fee_type': child_text(fee, 'Name', ref_index=ref_index) or child_text(fee, 'FeeType', ref_index=ref_index),
			'amount': to_float(child_text(fee, 'TotalAmountDue', ref_index=ref_index) or child_text(fee, 'Amount', ref_index=ref_index)),
			'currency': child_text(fee, 'Currency', ref_index=ref_index) or default_currency,
			'description': child_text(fee, 'Description', ref_index=ref_index),
		})

	for shipment in collection_children(root, 'Shipments', 'Shipment', ref_index=ref_index):
		shipment_no = child_text(shipment, 'ShipmentNo', ref_index=ref_index) or child_text(shipment, 'ShipmentNumber', ref_index=ref_index) or child_text(shipment, 'Number', ref_index=ref_index) or child_text(shipment, 'Id', ref_index=ref_index)
		for invoice in collection_children(shipment, 'Invoices', 'ShipmentInvoice', ref_index=ref_index):
			invoice_number = child_text(invoice, 'InvoiceNumber', ref_index=ref_index) or child_text(invoice, 'InvoiceNo', ref_index=ref_index) or child_text(invoice, 'Number', ref_index=ref_index) or child_text(invoice, 'Line', ref_index=ref_index) or child_text(invoice, 'Id', ref_index=ref_index)
			invoice_currency = child_text(invoice, 'InvoiceValueCurrency', ref_index=ref_index) or child_text(invoice, 'Currency', ref_index=ref_index) or default_currency
			for article in collection_children(invoice, 'Articles', 'ShipmentArticle', ref_index=ref_index):
				article_line_no = child_text(article, 'Line', ref_index=ref_index)
				for fee_type, field_name in (('HMF', 'HarborMaintenanceFee'), ('MPF', 'MerchandiseProcessingFee')):
					amount = to_float(child_text(article, field_name, ref_index=ref_index))
					if amount is None:
						continue
					rows.append({
						'fee_type': fee_type,
						'amount': amount,
						'currency': invoice_currency,
						'description': child_text(article, 'Description', ref_index=ref_index),
						'shipment_no': shipment_no,
						'invoice_number': invoice_number,
						'article_line_no': article_line_no,
					})
	return dedupe_fee_rows(rows)


def map_events(root: ET.Element, ref_index: dict[str, ET.Element]) -> list[dict[str, Any]]:
	rows = []
	for event in descendants(root, 'EntityEvent', ref_index=ref_index):
		rows.append({
			'event_code': child_text(event, 'Code', ref_index=ref_index) or child_text(event, 'EventCode', ref_index=ref_index) or child_text(event, 'Id', ref_index=ref_index),
			'event_name': child_text(event, 'Name', ref_index=ref_index) or child_text(event, 'EventName', ref_index=ref_index),
			'event_timestamp': to_datetime_string(child_text(event, 'Time', ref_index=ref_index) or child_text(event, 'EventTimestamp', ref_index=ref_index)),
			'details': child_text(event, 'Description', ref_index=ref_index) or child_text(event, 'Details', ref_index=ref_index),
		})
	return dedupe_rows(rows, 'event_code')


def map_tariff_lines(root: ET.Element, ref_index: dict[str, ET.Element]) -> list[dict[str, Any]]:
	rows = []
	for shipment in collection_children(root, 'Shipments', 'Shipment', ref_index=ref_index):
		shipment_no = child_text(shipment, 'ShipmentNo', ref_index=ref_index) or child_text(shipment, 'ShipmentNumber', ref_index=ref_index) or child_text(shipment, 'Number', ref_index=ref_index) or child_text(shipment, 'Id', ref_index=ref_index)
		for invoice in collection_children(shipment, 'Invoices', 'ShipmentInvoice', ref_index=ref_index):
			invoice_number = child_text(invoice, 'InvoiceNumber', ref_index=ref_index) or child_text(invoice, 'InvoiceNo', ref_index=ref_index) or child_text(invoice, 'Number', ref_index=ref_index) or child_text(invoice, 'Line', ref_index=ref_index) or child_text(invoice, 'Id', ref_index=ref_index)
			for article in collection_children(invoice, 'Articles', 'ShipmentArticle', ref_index=ref_index):
				article_line_no = child_text(article, 'Line', ref_index=ref_index)
				article_country_of_origin = child_text(article, 'CountryOfOrigin', ref_index=ref_index)
				for tariff in collection_children(article, 'Tariffs', 'ShipmentArticleTariff', ref_index=ref_index):
					rows.append({
						'line_no': child_text(tariff, 'Line', ref_index=ref_index),
						'article_line_no': article_line_no,
						'shipment_no': shipment_no,
						'invoice_number': invoice_number,
						'hs_code': first_nested_text(tariff, [('HarmonizedTariff', 'Code')], ref_index=ref_index),
						'description': first_nested_text(tariff, [('HarmonizedTariff', 'Name')], ref_index=ref_index),
						'quantity': to_float(child_text(tariff, 'Quantity1', ref_index=ref_index) or child_text(tariff, 'NumberOfReportingUnits', ref_index=ref_index) or child_text(tariff, 'Quantity', ref_index=ref_index) or first_nested_text(tariff, [('HarmonizedTariff', 'NumberOfReportingUnits')], ref_index=ref_index)),
						'uom': child_text(tariff, 'UnitOfMeasure1', ref_index=ref_index) or first_nested_text(tariff, [('HarmonizedTariff', 'Unit1')], ref_index=ref_index),
						'entered_value': to_float(child_text(tariff, 'TariffValue', ref_index=ref_index) or child_text(tariff, 'EnteredValue', ref_index=ref_index)),
						'duty_amount': to_float(child_text(tariff, 'DutyAmount', ref_index=ref_index)),
						'country_of_origin': article_country_of_origin or child_text(tariff, 'CountryOfOrigin', ref_index=ref_index) or first_nested_text(tariff, [('HarmonizedTariff', 'CountryOfOriginEditCode')], ref_index=ref_index),
					})
	return dedupe_tariff_rows(rows)


def map_references(root: ET.Element, ref_index: dict[str, ET.Element]) -> list[dict[str, Any]]:
	rows = []
	for ref in descendants(root, 'Reference', ref_index=ref_index):
		rows.append({
			'reference_type': child_text(ref, 'ReferenceType', ref_index=ref_index) or child_text(ref, 'Type', ref_index=ref_index),
			'reference_value': child_text(ref, 'ReferenceValue', ref_index=ref_index) or child_text(ref, 'Value', ref_index=ref_index),
			'description': child_text(ref, 'Description', ref_index=ref_index),
		})
	return dedupe_rows(rows, 'reference_value')



def dedupe_invoice_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
	seen = set()
	result = []
	for row in rows:
		marker = (row.get('shipment_no'), row.get('invoice_number'))
		if marker in seen:
			continue
		seen.add(marker)
		result.append(row)
	return result


def dedupe_article_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
	seen = set()
	result = []
	for row in rows:
		marker = (
			row.get('shipment_no'),
			row.get('invoice_number'),
			row.get('article_line_no'),
			row.get('line_item_identifier'),
			row.get('description'),
		)
		if marker in seen:
			continue
		seen.add(marker)
		result.append(row)
	return result

def dedupe_tariff_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
	seen = set()
	result = []
	for row in rows:
		marker = (row.get('shipment_no'), row.get('invoice_number'), row.get('article_line_no'), row.get('line_no'), row.get('hs_code'))
		if marker in seen:
			continue
		seen.add(marker)
		result.append(row)
	return result


def dedupe_fee_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
	seen = set()
	result = []
	for row in rows:
		marker = (
			row.get('fee_type'),
			row.get('shipment_no'),
			row.get('invoice_number'),
			row.get('article_line_no'),
			row.get('amount'),
		)
		if marker in seen:
			continue
		seen.add(marker)
		result.append(row)
	return result


def dedupe_rows(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
	seen = set()
	result = []
	for row in rows:
		value = row.get(key)
		marker = value or id(row)
		if marker in seen:
			continue
		seen.add(marker)
		result.append(row)
	return result


def localname(tag: str) -> str:
	return tag.split('}', 1)[-1]

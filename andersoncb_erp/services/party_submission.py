from __future__ import annotations

from copy import deepcopy
import re
from typing import Any
from uuid import uuid4
from xml.etree import ElementTree as ET

import frappe
from frappe import _
from frappe.utils import now_datetime

from andersoncb_erp.integrations.lds import LDSClientError, LDSValidationError
from andersoncb_erp.services.master_data import parse_carrier_xml, parse_importer_profile_xml
from andersoncb_erp.services.party_sync import get_party_client
from andersoncb_erp.services.submission import format_lds_validation_error

DIRECTORIES_NS = "http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Directories"
SERIALIZATION_NS = "http://schemas.microsoft.com/2003/10/Serialization/"
IMPORTER_IRS_PATTERN = re.compile(r'^\d{2}-\d{7}[A-Za-z0-9]{2}$')
IMPORTER_COLLECTION_FIELDS = (
    'BankAccounts',
    'Bonds',
    'Categories',
    'CommunicationProfiles',
    'DeliveryPoints',
    'TruckerTerminalCongestionSurcharges',
)

ET.register_namespace('a', DIRECTORIES_NS)
ET.register_namespace('z', SERIALIZATION_NS)


def validate_importer_profile_for_submission(doc) -> list[str]:
    issues: list[str] = []
    if not getattr(doc, 'display_name', None):
        issues.append('Display Name is required.')
    if not (getattr(doc, 'importer_code', None) or getattr(doc, 'cbp_number', None) or getattr(doc, 'irs_number', None)):
        issues.append('Importer Profile must have an Importer Code, CBP Number, or IRS Number.')
    if getattr(doc, 'irs_number', None) and not IMPORTER_IRS_PATTERN.match(doc.irs_number):
        issues.append('IRS Number must match the LDS format NN-NNNNNNNXX.')
    return issues


def validate_carrier_for_submission(doc) -> list[str]:
    issues: list[str] = []
    if not getattr(doc, 'display_name', None):
        issues.append('Display Name is required.')
    if not getattr(doc, 'carrier_code', None):
        issues.append('Carrier Code is required.')
    elif len(doc.carrier_code.strip()) > 4:
        issues.append('Carrier Code must be 4 characters or fewer for LDS.')
    return issues


def build_importer_profile_submission_xml(doc) -> str:
    entity = ET.Element('entity')
    template_root = _parse_template_root(getattr(doc, 'raw_payload_xml', None))
    if template_root is not None:
        for attr_name, value in template_root.attrib.items():
            entity.set(attr_name, value)
        for child in list(template_root):
            entity.append(deepcopy(child))

    _set_plain_text(entity, 'EntityGuid', _current_plain_text(entity, 'EntityGuid') or str(uuid4()))
    _set_plain_text(entity, 'Id', getattr(doc, 'lds_id', None))
    _set_plain_text(entity, 'Code', getattr(doc, 'importer_code', None))
    _set_plain_text(entity, 'Name', getattr(doc, 'display_name', None))
    _set_directory_text(entity, 'CBPNumber', getattr(doc, 'cbp_number', None))
    _set_directory_text(entity, 'IRSNumber', getattr(doc, 'irs_number', None))
    _set_directory_text(entity, 'Adress1', getattr(doc, 'address_line1', None))
    _set_directory_text(entity, 'Adress2', getattr(doc, 'address_line2', None))
    _set_directory_text(entity, 'City', getattr(doc, 'city', None))
    _set_directory_text(entity, 'State', getattr(doc, 'state', None))
    _set_directory_text(entity, 'ZIP', getattr(doc, 'postal_code', None))
    _set_directory_text(entity, 'Country', getattr(doc, 'country', None))
    _set_directory_text(entity, 'ContactPersonName', getattr(doc, 'contact_name', None))
    _set_directory_text(entity, 'Email', getattr(doc, 'email', None))
    _set_directory_text(entity, 'Phone', getattr(doc, 'phone', None))
    _set_directory_text(entity, 'RolesIsImporter', 'true')
    for fieldname in IMPORTER_COLLECTION_FIELDS:
        _ensure_directory_element(entity, fieldname)
    return ET.tostring(entity, encoding='unicode')


def build_carrier_submission_xml(doc) -> str:
    entity = ET.Element('entity')
    template_root = _parse_template_root(getattr(doc, 'raw_payload_xml', None))
    if template_root is not None:
        for attr_name, value in template_root.attrib.items():
            entity.set(attr_name, value)
        for child in list(template_root):
            entity.append(deepcopy(child))

    _set_plain_text(entity, 'EntityGuid', _current_plain_text(entity, 'EntityGuid') or str(uuid4()))
    _set_plain_text(entity, 'Id', getattr(doc, 'lds_id', None))
    _set_plain_text(entity, 'Code', getattr(doc, 'carrier_code', None))
    _set_plain_text(entity, 'Name', getattr(doc, 'display_name', None))
    _set_directory_text(entity, 'Type', getattr(doc, 'carrier_type', None))
    _set_directory_text(entity, 'AirwayBillPrefix', getattr(doc, 'airway_bill_prefix', None))
    return ET.tostring(entity, encoding='unicode')


def process_importer_profile_submission(doc) -> None:
    issues = validate_importer_profile_for_submission(doc)
    if issues:
        message = _('Local validation failed before LDS submission:') + '\n' + '\n'.join(f'- {issue}' for issue in issues)
        doc.status = 'Draft'
        doc.lds_submission_errors = message
        raise frappe.ValidationError(message)

    payload = build_importer_profile_submission_xml(doc)
    doc.last_lds_submission_on = now_datetime()
    doc.lds_last_submission_payload = payload
    client = get_party_client()

    try:
        saved_xml = client.save_contact_xml(payload)
    except LDSValidationError as exc:
        message = format_lds_validation_error(exc)
        doc.status = 'Draft'
        doc.lds_submission_errors = message
        raise frappe.ValidationError(message)
    except LDSClientError as exc:
        message = _('LDS submission failed: {0}').format(str(exc))
        doc.status = 'Draft'
        doc.lds_submission_errors = message
        raise frappe.ValidationError(message)

    mapped = parse_importer_profile_xml(saved_xml)
    if not mapped.get('lds_id') and getattr(doc, 'importer_code', None):
        fetched_xml = client.fetch_importer_contact_by_code_xml(doc.importer_code)
        fetched = parse_importer_profile_xml(fetched_xml)
        if fetched:
            mapped.update({fieldname: value for fieldname, value in fetched.items() if value not in (None, '')})
    for fieldname, value in mapped.items():
        if value not in (None, ''):
            setattr(doc, fieldname, value)
    doc.source_active = 1
    doc.last_seen_in_source_on = now_datetime()
    doc.last_synced_on = now_datetime()
    doc.status = 'Submitted'
    doc.lds_submission_errors = None


def process_carrier_submission(doc) -> None:
    issues = validate_carrier_for_submission(doc)
    if issues:
        message = _('Local validation failed before LDS submission:') + '\n' + '\n'.join(f'- {issue}' for issue in issues)
        doc.status = 'Draft'
        doc.lds_submission_errors = message
        raise frappe.ValidationError(message)

    payload = build_carrier_submission_xml(doc)
    doc.last_lds_submission_on = now_datetime()
    doc.lds_last_submission_payload = payload
    client = get_party_client()

    try:
        saved_xml = client.save_carrier_xml(payload)
    except LDSValidationError as exc:
        message = format_lds_validation_error(exc)
        doc.status = 'Draft'
        doc.lds_submission_errors = message
        raise frappe.ValidationError(message)
    except LDSClientError as exc:
        message = _('LDS submission failed: {0}').format(str(exc))
        doc.status = 'Draft'
        doc.lds_submission_errors = message
        raise frappe.ValidationError(message)

    mapped = parse_carrier_xml(saved_xml)
    if not mapped.get('lds_id') and getattr(doc, 'carrier_code', None):
        fetched_xml = client.fetch_carrier_by_code_xml(doc.carrier_code)
        fetched = parse_carrier_xml(fetched_xml)
        if fetched:
            mapped.update({fieldname: value for fieldname, value in fetched.items() if value not in (None, '')})
    for fieldname, value in mapped.items():
        if value not in (None, ''):
            setattr(doc, fieldname, value)
    doc.source_active = 1
    doc.last_seen_in_source_on = now_datetime()
    doc.last_synced_on = now_datetime()
    doc.status = 'Submitted'
    doc.lds_submission_errors = None


def persist_party_submission_failure(doc, message: str, payload: str | None = None) -> None:
    if payload is not None:
        doc.lds_last_submission_payload = payload
    if not doc.last_lds_submission_on:
        doc.last_lds_submission_on = now_datetime()
    doc.status = 'Draft'
    doc.lds_submission_errors = message
    doc.docstatus = 0

    if not doc.name or doc.is_new():
        return

    frappe.db.set_value(
        doc.doctype,
        doc.name,
        {
            'status': doc.status,
            'docstatus': 0,
            'last_lds_submission_on': doc.last_lds_submission_on,
            'lds_submission_errors': doc.lds_submission_errors,
            'lds_last_submission_payload': doc.lds_last_submission_payload,
        },
        update_modified=False,
    )
    frappe.db.commit()


def submit_importer_profile_to_lds(name: str) -> dict[str, str | bool]:
    doc = frappe.get_doc('Importer Profile', name)
    doc.check_permission('submit')
    if doc.docstatus != 0:
        return {'ok': False, 'error': _('Only draft Importer Profiles can be submitted to LDS.')}

    try:
        process_importer_profile_submission(doc)
    except frappe.ValidationError as exc:
        persist_party_submission_failure(doc, str(exc), payload=getattr(doc, 'lds_last_submission_payload', None))
        return {'ok': False, 'error': str(exc)}

    doc.flags.skip_lds_submission = True
    doc.submit()
    return {'ok': True, 'name': doc.name}


def submit_carrier_to_lds(name: str) -> dict[str, str | bool]:
    doc = frappe.get_doc('Carrier', name)
    doc.check_permission('submit')
    if doc.docstatus != 0:
        return {'ok': False, 'error': _('Only draft Carriers can be submitted to LDS.')}

    try:
        process_carrier_submission(doc)
    except frappe.ValidationError as exc:
        persist_party_submission_failure(doc, str(exc), payload=getattr(doc, 'lds_last_submission_payload', None))
        return {'ok': False, 'error': str(exc)}

    doc.flags.skip_lds_submission = True
    doc.submit()
    return {'ok': True, 'name': doc.name}


def _parse_template_root(raw_payload_xml: str | None) -> ET.Element | None:
    if not raw_payload_xml:
        return None
    try:
        return ET.fromstring(raw_payload_xml)
    except ET.ParseError:
        return None


def _set_plain_text(parent: ET.Element, local_name: str, value: Any) -> None:
    _set_text(parent, local_name, value, namespace=None)


def _set_directory_text(parent: ET.Element, local_name: str, value: Any) -> None:
    _set_text(parent, local_name, value, namespace=DIRECTORIES_NS)


def _set_text(parent: ET.Element, local_name: str, value: Any, namespace: str | None) -> None:
    element = _find_child(parent, local_name)
    if value in (None, ''):
        if element is not None:
            parent.remove(element)
        return
    if element is None:
        tag = local_name if namespace is None else f'{{{namespace}}}{local_name}'
        element = ET.SubElement(parent, tag)
    if namespace is None:
        element.set('xmlns', '')
    element.text = str(value)


def _find_child(parent: ET.Element, local_name: str) -> ET.Element | None:
    for child in list(parent):
        if child.tag.split('}', 1)[-1] == local_name:
            return child
    return None


def _current_plain_text(parent: ET.Element, local_name: str) -> str | None:
    child = _find_child(parent, local_name)
    if child is None:
        return None
    text = (child.text or '').strip()
    return text or None


def _ensure_directory_element(parent: ET.Element, local_name: str) -> None:
    if _find_child(parent, local_name) is not None:
        return
    ET.SubElement(parent, f'{{{DIRECTORIES_NS}}}{local_name}')

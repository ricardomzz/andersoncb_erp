from __future__ import annotations

from typing import Any
from xml.etree import ElementTree as ET

import frappe
from frappe.utils import now_datetime

IMPORTER_PROFILE_FIELDS = (
    'display_name',
    'importer_code',
    'cbp_number',
    'irs_number',
    'contact_name',
    'email',
    'phone',
    'address_line1',
    'address_line2',
    'city',
    'state',
    'postal_code',
    'country',
    'lds_id',
    'raw_payload_xml',
)

CARRIER_FIELDS = (
    'display_name',
    'carrier_code',
    'carrier_type',
    'airway_bill_prefix',
    'lds_id',
    'raw_payload_xml',
)


def parse_importer_profile_xml(xml_text: str) -> dict[str, Any]:
    root = ET.fromstring(xml_text)
    return normalize_importer_profile_data({
        'lds_id': _child_text(root, 'Id'),
        'display_name': _child_text(root, 'Name'),
        'importer_code': _child_text(root, 'Code') or _child_text(root, 'Number'),
        'cbp_number': _child_text(root, 'CBPNumber'),
        'irs_number': _child_text(root, 'IRSNumber'),
        'address_line1': _child_text(root, 'Address1') or _child_text(root, 'Adress1'),
        'address_line2': _child_text(root, 'Address2') or _child_text(root, 'Adress2'),
        'city': _child_text(root, 'City'),
        'state': _child_text(root, 'State'),
        'postal_code': _child_text(root, 'ZIP'),
        'country': _child_text(root, 'Country'),
        'contact_name': _child_text(root, 'ContactPersonName'),
        'email': _child_text(root, 'Email'),
        'phone': _child_text(root, 'Phone'),
        'raw_payload_xml': xml_text,
    }) or {}


def parse_carrier_xml(xml_text: str) -> dict[str, Any]:
    root = ET.fromstring(xml_text)
    return normalize_carrier_data({
        'lds_id': _child_text(root, 'Id'),
        'display_name': _child_text(root, 'Name'),
        'carrier_code': _child_text(root, 'Code'),
        'carrier_type': _child_text(root, 'Type'),
        'airway_bill_prefix': _child_text(root, 'AirwayBillPrefix'),
        'raw_payload_xml': xml_text,
    }) or {}


def upsert_importer_profile(data: dict[str, Any] | None, synced_on=None):
    if not data:
        return None
    normalized = normalize_importer_profile_data(data)
    if not normalized:
        return None
    existing_name = _find_existing_importer_profile_name(normalized)
    return _upsert_master('Importer Profile', normalized, ('importer_code', 'cbp_number', 'display_name'), synced_on, existing_name=existing_name)


def upsert_carrier(data: dict[str, Any] | None, synced_on=None):
    if not data:
        return None
    normalized = normalize_carrier_data(data)
    if not normalized:
        existing_name = frappe.db.exists('Carrier', {'lds_id': data.get('lds_id')}) if data.get('lds_id') else None
        return frappe.get_doc('Carrier', existing_name) if existing_name else None
    return _upsert_master('Carrier', normalized, ('carrier_code', 'display_name'), synced_on)


def match_importer_profile(data: dict[str, Any] | None):
    if not data:
        return None
    normalized = normalize_importer_profile_data(data)
    if not normalized:
        return None
    existing_name = _find_existing_importer_profile_name(normalized)
    return frappe.get_doc('Importer Profile', existing_name) if existing_name else None


def match_carrier(data: dict[str, Any] | None):
    if not data:
        return None
    normalized = normalize_carrier_data(data)
    if not normalized:
        existing_name = frappe.db.exists('Carrier', {'lds_id': data.get('lds_id')}) if data.get('lds_id') else None
        return frappe.get_doc('Carrier', existing_name) if existing_name else None
    existing_name = _find_existing_name('Carrier', normalized, ('carrier_code', 'display_name'))
    return frappe.get_doc('Carrier', existing_name) if existing_name else None


def resolve_master_links(mapped: dict[str, Any], synced_on=None, create_missing: bool = True) -> dict[str, Any]:
    importer_doc = upsert_importer_profile(mapped.get('importer_profile_data'), synced_on=synced_on) if create_missing else match_importer_profile(mapped.get('importer_profile_data'))
    if importer_doc:
        mapped['importer_profile'] = importer_doc.name
        mapped['importer_name'] = importer_doc.display_name or mapped.get('importer_name')
        mapped['importer_number'] = (
            importer_doc.importer_code
            or importer_doc.cbp_number
            or importer_doc.irs_number
            or mapped.get('importer_number')
        )

    for row in mapped.get('shipments') or []:
        carrier_data = row.get('carrier_data')
        if not carrier_data and row.get('carrier'):
            carrier_data = {'display_name': row.get('carrier')}
        carrier_doc = upsert_carrier(carrier_data, synced_on=synced_on) if create_missing else match_carrier(carrier_data)
        if carrier_doc:
            row['carrier_profile'] = carrier_doc.name
            row['carrier'] = carrier_doc.display_name or row.get('carrier')
        row.pop('carrier_data', None)

    mapped.pop('importer_profile_data', None)
    return mapped


def normalize_importer_profile_data(data: dict[str, Any] | None) -> dict[str, Any] | None:
    if not data:
        return None
    normalized = {field: _clean(data.get(field)) for field in IMPORTER_PROFILE_FIELDS}
    normalized['display_name'] = (
        normalized.get('display_name')
        or normalized.get('importer_code')
        or normalized.get('cbp_number')
        or normalized.get('irs_number')
    )
    if not normalized.get('display_name'):
        return None
    return normalized


def normalize_carrier_data(data: dict[str, Any] | None) -> dict[str, Any] | None:
    if not data:
        return None
    normalized = {field: _clean(data.get(field)) for field in CARRIER_FIELDS}
    normalized['display_name'] = normalized.get('display_name') or normalized.get('carrier_code')
    if not normalized.get('display_name'):
        return None
    return normalized


def _upsert_master(
    doctype: str,
    data: dict[str, Any],
    identity_fields: tuple[str, ...],
    synced_on=None,
    existing_name: str | None = None,
):
    existing_name = existing_name or _find_existing_name(doctype, data, identity_fields)
    doc = frappe.get_doc(doctype, existing_name) if existing_name else frappe.new_doc(doctype)
    updates: dict[str, Any] = {}

    for fieldname, value in data.items():
        if value in (None, ''):
            continue
        if existing_name and doc.docstatus == 1:
            updates[fieldname] = value
        else:
            setattr(doc, fieldname, value)

    synced_payload = synced_on is not None or data.get('lds_id') or data.get('raw_payload_xml')
    if synced_payload:
        stamp = synced_on or now_datetime()
        for fieldname, value in {
            'source_active': 1,
            'last_seen_in_source_on': stamp,
            'last_synced_on': stamp,
            'status': 'Submitted',
        }.items():
            if existing_name and doc.docstatus == 1:
                updates[fieldname] = value
            elif hasattr(doc, fieldname):
                setattr(doc, fieldname, value)
    elif getattr(doc, 'source_active', None) is None:
        if existing_name and doc.docstatus == 1:
            updates['source_active'] = 0
        else:
            doc.source_active = 0

    if existing_name:
        if doc.docstatus == 1:
            if updates:
                frappe.db.set_value(doctype, doc.name, updates, update_modified=False)
                for fieldname, value in updates.items():
                    setattr(doc, fieldname, value)
        else:
            doc.save(ignore_permissions=True)
    else:
        doc.insert(ignore_permissions=True)

    if synced_payload and doc.docstatus == 0:
        values = {'docstatus': 1}
        if hasattr(doc, 'status'):
            values['status'] = 'Submitted'
            doc.status = 'Submitted'
        frappe.db.set_value(doctype, doc.name, values, update_modified=False)
        doc.docstatus = 1
    return doc


def _find_existing_name(doctype: str, data: dict[str, Any], identity_fields: tuple[str, ...]) -> str | None:
    lds_id = data.get('lds_id')
    if lds_id:
        name = frappe.db.exists(doctype, {'lds_id': lds_id})
        if name:
            return name

    for fieldname in identity_fields:
        value = data.get(fieldname)
        if not value:
            continue
        name = frappe.db.exists(doctype, {fieldname: value})
        if name:
            return name
    return None


def _find_existing_importer_profile_name(data: dict[str, Any]) -> str | None:
    lds_id = data.get('lds_id')
    if lds_id:
        name = frappe.db.exists('Importer Profile', {'lds_id': lds_id})
        if name:
            return name

    importer_code = data.get('importer_code')
    if importer_code:
        name = frappe.db.exists('Importer Profile', {'importer_code': importer_code})
        if name:
            return name

    cbp_number = data.get('cbp_number')
    if cbp_number:
        name = frappe.db.exists('Importer Profile', {'cbp_number': cbp_number})
        if name:
            return name

    display_name = data.get('display_name')
    irs_number = data.get('irs_number')
    if display_name and irs_number:
        name = frappe.db.exists('Importer Profile', {'display_name': display_name, 'irs_number': irs_number})
        if name:
            return name

    if display_name:
        name = frappe.db.exists('Importer Profile', {'display_name': display_name})
        if name:
            return name

    return None


def _child_text(element: ET.Element, tag_name: str) -> str | None:
    for child in element.iter():
        if child.tag.split('}', 1)[-1] == tag_name:
            text = (child.text or '').strip()
            if text:
                return text
    return None


def _clean(value: Any) -> Any:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value

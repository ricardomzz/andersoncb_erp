from types import SimpleNamespace

import pytest

from andersoncb_erp.integrations.lds import LDSClientError
from andersoncb_erp.services import party_submission
from andersoncb_erp.services.party_submission import (
    build_carrier_submission_xml,
    build_importer_profile_submission_xml,
    process_carrier_submission,
    process_importer_profile_submission,
    validate_carrier_for_submission,
    validate_importer_profile_for_submission,
)


class DummyDoc(SimpleNamespace):
    pass


def make_importer(**overrides):
    base = {
        'doctype': 'Importer Profile',
        'name': 'IMP-LOCAL',
        'docstatus': 0,
        'display_name': 'Importer Co',
        'importer_code': 'IMP-1',
        'cbp_number': None,
        'irs_number': None,
        'contact_name': 'Jane',
        'email': 'jane@example.com',
        'phone': '5551234',
        'address_line1': '123 Main',
        'address_line2': None,
        'city': 'Seattle',
        'state': 'WA',
        'postal_code': '98101',
        'country': 'US',
        'lds_id': None,
        'raw_payload_xml': None,
        'status': 'Draft',
        'source_active': 0,
        'last_seen_in_source_on': None,
        'last_synced_on': None,
        'last_lds_submission_on': None,
        'lds_submission_errors': None,
        'lds_last_submission_payload': None,
    }
    base.update(overrides)
    return DummyDoc(**base)


def make_carrier(**overrides):
    base = {
        'doctype': 'Carrier',
        'name': 'CAR-LOCAL',
        'docstatus': 0,
        'display_name': 'Carrier Co',
        'carrier_code': 'CAR1',
        'carrier_type': 'Air',
        'airway_bill_prefix': '000',
        'lds_id': None,
        'raw_payload_xml': None,
        'status': 'Draft',
        'source_active': 0,
        'last_seen_in_source_on': None,
        'last_synced_on': None,
        'last_lds_submission_on': None,
        'lds_submission_errors': None,
        'lds_last_submission_payload': None,
    }
    base.update(overrides)
    return DummyDoc(**base)


def test_validate_importer_profile_for_submission_requires_identity():
    assert validate_importer_profile_for_submission(make_importer(importer_code=None, cbp_number=None, irs_number=None))


def test_validate_importer_profile_for_submission_requires_lds_irs_format():
    issues = validate_importer_profile_for_submission(make_importer(importer_code=None, irs_number='12345'))
    assert 'IRS Number must match the LDS format NN-NNNNNNNXX.' in issues


def test_validate_carrier_for_submission_requires_code():
    assert validate_carrier_for_submission(make_carrier(carrier_code=None))


def test_validate_carrier_for_submission_enforces_code_length():
    issues = validate_carrier_for_submission(make_carrier(carrier_code='TOOLONG'))
    assert 'Carrier Code must be 4 characters or fewer for LDS.' in issues


def test_build_importer_profile_submission_xml_contains_importer_role():
    xml = build_importer_profile_submission_xml(make_importer())
    assert '<Code xmlns="">IMP-1</Code>' in xml
    assert 'RolesIsImporter' in xml
    assert 'Importer Co' in xml
    assert 'BankAccounts' in xml


def test_build_carrier_submission_xml_contains_carrier_fields():
    xml = build_carrier_submission_xml(make_carrier())
    assert '<Code xmlns="">CAR1</Code>' in xml
    assert 'Carrier Co' in xml
    assert 'AirwayBillPrefix' in xml


def test_process_importer_profile_submission_maps_saved_fields(monkeypatch):
    doc = make_importer()

    class FakeClient:
        def save_contact_xml(self, entity_xml):
            return '<Contact><Id>493</Id><Code>IMP-1</Code><Name>Importer Co</Name><IRSNumber>12-345678900</IRSNumber><RolesIsImporter>true</RolesIsImporter></Contact>'

    monkeypatch.setattr(party_submission, 'get_party_client', lambda: FakeClient())
    monkeypatch.setattr(party_submission, 'now_datetime', lambda: '2026-06-04 15:00:00')

    process_importer_profile_submission(doc)

    assert doc.lds_id == '493'
    assert doc.status == 'Submitted'
    assert doc.lds_submission_errors is None


def test_process_carrier_submission_surfaces_errors(monkeypatch):
    doc = make_carrier()

    class FakeClient:
        def save_carrier_xml(self, entity_xml):
            raise LDSClientError('boom')

    monkeypatch.setattr(party_submission, 'get_party_client', lambda: FakeClient())
    monkeypatch.setattr(party_submission, 'now_datetime', lambda: '2026-06-04 15:00:00')
    monkeypatch.setattr(party_submission, '_', lambda message: message)

    with pytest.raises(Exception) as exc:
        process_carrier_submission(doc)

    assert 'LDS submission failed: boom' in str(exc.value)
    assert doc.status == 'Draft'

from types import SimpleNamespace

import pytest

from andersoncb_erp.integrations.lds import LDSClientError
from andersoncb_erp.services import submission
from andersoncb_erp.services.submission import (
    build_submission_entity_xml,
    format_local_validation_issues,
    generate_draft_entry_number,
    is_draft_placeholder_entry_number,
    process_lds_submission,
    validate_customs_entry_for_submission,
)


class DummyDoc(SimpleNamespace):
    def set(self, fieldname, value):
        setattr(self, fieldname, value)


class DummyRow(SimpleNamespace):
    pass


def make_doc(**overrides):
    base = {
        'doctype': 'Customs Entry',
        'name': 'TMPABCDE',
        'docstatus': 0,
        'entry_number': '12345678',
        'filer_code': 'SY1',
        'entry_type': '01',
        'entry_date': '2026-06-04',
        'port_of_entry': '2704',
        'transport_mode': '11',
        'broker_reference': 'REF-1',
        'bond_number': '999',
        'client_ref': 'CLIENT-1',
        'importer_profile': 'IMP-1',
        'importer_name': 'Importer Co',
        'importer_number': 'IMP-1',
        'consignee_name': 'Consignee Co',
        'raw_payload_xml': None,
        'shipments': [DummyRow(shipment_no='7', mode='11', destination='2704', arrival_date='2026-06-03', carrier_profile='CAR-1', carrier='Carrier Co')],
        'invoices': [DummyRow(invoice_number='INV-1')],
        'fees': [],
        'events': [],
        'tariff_lines': [],
        'references': [],
        'lds_id': None,
        'status': 'Draft',
        'liquidation_status': None,
        'source_active': 0,
        'archived_on': None,
        'last_seen_in_source_on': None,
        'last_synced_on': None,
        'last_lds_submission_on': None,
        'lds_submission_errors': None,
        'lds_last_submission_payload': None,
    }
    base.update(overrides)
    return DummyDoc(**base)


def fake_get_cached_doc(doctype, name):
    if doctype == 'Importer Profile':
        return SimpleNamespace(name=name, display_name='Importer Co', importer_code='IMP-1', cbp_number=None, irs_number=None, raw_payload_xml=None, lds_id='493', docstatus=1)
    if doctype == 'Carrier':
        return SimpleNamespace(name=name, display_name='Carrier Co', carrier_code='CAR-1', raw_payload_xml=None, lds_id='1488', docstatus=1)
    raise AssertionError((doctype, name))


def test_validate_customs_entry_for_submission_requires_core_links(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)
    doc = make_doc(importer_profile=None)

    issues = validate_customs_entry_for_submission(doc)

    assert {issue.fieldname for issue in issues} >= {'importer_profile'}
    assert 'Importer Profile is required.' in format_local_validation_issues(issues)


def test_validate_customs_entry_for_submission_requires_carrier_links(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)
    doc = make_doc(shipments=[DummyRow(shipment_no='7', mode='11', destination='2704', arrival_date='2026-06-03', carrier_profile=None, carrier=None)])

    issues = validate_customs_entry_for_submission(doc)

    assert any('Carrier Profile' in issue.message for issue in issues)


def test_validate_customs_entry_for_submission_enforces_entry_number_length(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)
    issues = validate_customs_entry_for_submission(make_doc(entry_number='123456789'))
    assert any('8 characters or fewer' in issue.message for issue in issues)


def test_build_submission_entity_xml_builds_importer_and_carrier_nodes(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)
    xml = build_submission_entity_xml(make_doc())

    assert 'i:type="a:CustomsEntry"' in xml
    assert 'EntryFilerCode' in xml
    assert 'Importer Co' in xml
    assert 'Carrier Co' in xml
    assert 'Carrier_Id' in xml
    assert 'Shipment' in xml


def test_build_submission_entity_xml_omits_placeholder_entry_number(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)
    xml = build_submission_entity_xml(make_doc(entry_number='TMPABC12'))

    assert 'TMPABC12' not in xml
    assert 'EntryFilerCode' in xml


def test_process_lds_submission_populates_mapped_fields(monkeypatch):
    doc = make_doc(entry_number='TMPAB123')

    class FakeClient:
        def save_entry_xml(self, entity_xml):
            return '<CustomsEntry><Id>777</Id><EntryNumber>76543210</EntryNumber><EntryFilerCode>SY1</EntryFilerCode><EntryType>01</EntryType><Date>2026-06-04T00:00:00</Date><PortOfEntry><Code>2704</Code></PortOfEntry><Importer><Code>IMP-1</Code><Name>Importer Co</Name></Importer></CustomsEntry>'

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)
    monkeypatch.setattr(submission, 'now_datetime', lambda: '2026-06-04 14:00:00')
    monkeypatch.setattr(submission, 'resolve_master_links', lambda mapped, synced_on=None, create_missing=True: mapped)
    monkeypatch.setattr(submission, 'parse_entry_xml', lambda xml: {
        'lds_id': '777',
        'entry_number': '76543210',
        'filer_code': 'SY1',
        'entry_type': '01',
        'entry_date': '2026-06-04',
        'port_of_entry': '2704',
        'importer_name': 'Importer Co',
        'importer_number': 'IMP-1',
        'shipments': [],
        'invoices': [],
        'fees': [],
        'events': [],
        'tariff_lines': [],
        'references': [],
    })

    process_lds_submission(doc)

    assert doc.lds_id == '777'
    assert doc.entry_number == '76543210'
    assert doc.status is not None
    assert doc.lds_submission_errors is None


def test_process_lds_submission_surfaces_lds_errors(monkeypatch):
    doc = make_doc(entry_number='TMPAB123')

    class FakeClient:
        def save_entry_xml(self, entity_xml):
            raise LDSClientError('boom')

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)
    monkeypatch.setattr(submission, 'now_datetime', lambda: '2026-06-04 14:00:00')

    with pytest.raises(Exception) as exc:
        process_lds_submission(doc)

    assert 'LDS submission failed: boom' in str(exc.value)
    assert doc.status == 'Draft'
    assert doc.lds_submission_errors == 'LDS submission failed: boom'



def test_validate_customs_entry_for_submission_requires_submitted_master_records(monkeypatch):
    def fake_draft_get_cached_doc(doctype, name):
        if doctype == 'Importer Profile':
            return SimpleNamespace(name=name, display_name='Importer Co', importer_code='IMP-1', cbp_number=None, irs_number=None, raw_payload_xml=None, lds_id=None, docstatus=0)
        if doctype == 'Carrier':
            return SimpleNamespace(name=name, display_name='Carrier Co', carrier_code='CAR-1', raw_payload_xml=None, lds_id=None, docstatus=0)
        raise AssertionError((doctype, name))

    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_draft_get_cached_doc)

    issues = validate_customs_entry_for_submission(make_doc())

    messages = {issue.message for issue in issues}
    assert 'Importer Profile must be submitted to LDS before it can be used on a Customs Entry.' in messages
    assert 'Each shipment carrier must be submitted to LDS before it can be used on a Customs Entry.' in messages

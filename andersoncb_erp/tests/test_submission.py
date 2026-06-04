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
        'importer_name': 'Importer Co',
        'importer_number': 'IMP-1',
        'consignee_name': 'Consignee Co',
        'raw_payload_xml': None,
        'shipments': [],
        'invoices': [],
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


def test_validate_customs_entry_for_submission_requires_core_fields():
    doc = make_doc(entry_number='', filer_code='', importer_name=None, importer_number=None, port_of_entry=None)

    issues = validate_customs_entry_for_submission(doc)

    assert {issue.fieldname for issue in issues} >= {'entry_number', 'filer_code', 'port_of_entry', 'importer_name'}
    assert 'Entry Number is required.' in format_local_validation_issues(issues)


def test_validate_customs_entry_for_submission_enforces_entry_number_length():
    issues = validate_customs_entry_for_submission(make_doc(entry_number='123456789'))
    assert any('8 characters or fewer' in issue.message for issue in issues)


def test_build_submission_entity_xml_builds_minimal_customs_entry_entity():
    xml = build_submission_entity_xml(make_doc())

    assert 'i:type="a:CustomsEntry"' in xml
    assert 'EntryNumber' in xml
    assert '12345678' in xml
    assert 'EntryFilerCode' in xml
    assert 'Importer Co' in xml
    assert '2704' in xml


def test_build_submission_entity_xml_uses_template_payload_when_present():
    template = '<GetResult xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents" xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/" z:Id="i1"><a:EntryNumber>OLD12345</a:EntryNumber><a:Importer><Name xmlns="">Old Importer</Name></a:Importer></GetResult>'
    xml = build_submission_entity_xml(make_doc(raw_payload_xml=template, importer_name='New Importer'))

    assert 'z:Id="i1"' in xml or 'ns' in xml
    assert '12345678' in xml
    assert 'New Importer' in xml


def test_build_submission_entity_xml_omits_placeholder_entry_number():
    xml = build_submission_entity_xml(make_doc(entry_number='TMPABC12'))

    assert 'TMPABC12' not in xml
    assert 'EntryFilerCode' in xml


def test_process_lds_submission_populates_mapped_fields(monkeypatch):
    doc = make_doc(entry_number='TMPAB123')

    class FakeClient:
        def save_entry_xml(self, entity_xml):
            return '<CustomsEntry><Id>777</Id><EntryNumber>76543210</EntryNumber><EntryFilerCode>SY1</EntryFilerCode><EntryType>01</EntryType><Date>2026-06-04T00:00:00</Date><PortOfEntry><Code>2704</Code></PortOfEntry><Importer><Code>IMP-1</Code><Name>Importer Co</Name></Importer></CustomsEntry>'

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    monkeypatch.setattr(submission, 'now_datetime', lambda: '2026-06-04 14:00:00')
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
    monkeypatch.setattr(submission, 'now_datetime', lambda: '2026-06-04 14:00:00')

    with pytest.raises(Exception) as exc:
        process_lds_submission(doc)

    assert 'LDS submission failed: boom' in str(exc.value)
    assert doc.status == 'Draft'
    assert doc.lds_submission_errors == 'LDS submission failed: boom'

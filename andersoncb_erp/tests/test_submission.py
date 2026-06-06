from types import SimpleNamespace
from xml.etree import ElementTree as ET

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


class DummySettings(SimpleNamespace):
    def get(self, key, default=None):
        return getattr(self, key, default)


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
        'invoices': [DummyRow(invoice_number='INV-1', shipment_no='7', invoice_date='2026-06-03', currency='USD', invoice_amount=1250.0, vendor_name='Vendor Co')],
        'articles': [],
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


def fake_get_cached_doc(doctype, name=None):
    if doctype == 'System Settings':
        return DummySettings(time_zone='America/New_York')
    if doctype == 'Importer Profile':
        return SimpleNamespace(name=name, display_name='Importer Co', importer_code='IMP-1', cbp_number=None, irs_number=None, raw_payload_xml=None, lds_id='493', docstatus=1)
    if doctype == 'Carrier':
        return SimpleNamespace(name=name, display_name='Carrier Co', carrier_code='CAR-1', carrier_type='Air', airway_bill_prefix='001', raw_payload_xml='<Carrier><Id>1488</Id><Code>CAR-1</Code><Name>Carrier Co</Name></Carrier>', lds_id='1488', docstatus=1)
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


def test_validate_customs_entry_for_submission_enforces_broker_reference_length(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)
    issues = validate_customs_entry_for_submission(make_doc(broker_reference='1234567890'))
    assert any('9 characters or fewer' in issue.message for issue in issues)


def test_validate_customs_entry_for_submission_enforces_line_item_identifier_length(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)
    doc = make_doc(articles=[DummyRow(line_item_identifier='TOOLONG')])

    issues = validate_customs_entry_for_submission(doc)

    assert any('Line Item Identifier must be 3 characters or fewer' in issue.message for issue in issues)


def test_validate_customs_entry_for_submission_enforces_air_carrier_requirements(monkeypatch):
    def fake_air_cached_doc(doctype, name):
        if doctype == 'Importer Profile':
            return fake_get_cached_doc(doctype, name)
        if doctype == 'Carrier':
            return SimpleNamespace(name=name, display_name='Carrier Co', carrier_code='CAR1', carrier_type='Ocean', airway_bill_prefix=None, raw_payload_xml=None, lds_id='1488', docstatus=1)
        raise AssertionError((doctype, name))

    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_air_cached_doc)
    doc = make_doc(transport_mode='40', shipments=[DummyRow(shipment_no='7', mode='40', destination='2704', arrival_date='2026-06-03', carrier_profile='CAR-1', carrier='Carrier Co')])

    issues = validate_customs_entry_for_submission(doc)

    assert any('Carrier Type set to Air' in issue.message for issue in issues)


def test_build_submission_entity_xml_omits_zero_optional_article_fees(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)

    class FakeClient:
        def new_entry_xml(self):
            return '<NewResult xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/" z:Id="i1"><EntityGuid>guid-1</EntityGuid><Date>2026-06-04T17:37:45</Date><Number>3003990</Number><a:EntryFilerCode xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">SY1</a:EntryFilerCode><a:EntryNumber xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">30039903</a:EntryNumber><a:EntryType xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">01</a:EntryType><a:Shipments xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents"></a:Shipments></NewResult>'

        def fetch_customs_port_by_code_xml(self, code):
            return f'<CustomsPort><Id>6</Id><Code>{code}</Code></CustomsPort>'

        def fetch_harmonized_tariff_by_code_xml(self, code):
            return f'<HarmonizedTariff><Id>77</Id><Code>{code}</Code><Name>Tariff {code}</Name></HarmonizedTariff>'

        def calculate_entry_number(self, number, filer_code, check_unique=True, adjust_sequence=False):
            return '30039903'

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    doc = make_doc(articles=[DummyRow(article_line_no='1', description='Article One', invoice_number='INV-1', shipment_no='7', line_item_identifier='A1', country_of_origin='CN', country_of_export='CN', gross_weight=10.0, entered_value=1250.0, harbor_maintenance_fee=0.0, merchandise_processing_fee=0.0)], tariff_lines=[DummyRow(line_no='1', article_line_no='1', shipment_no='7', invoice_number='INV-1', hs_code='4819200040', quantity=1.0, uom='KG', entered_value=1250.0, country_of_origin='CN')])

    xml = build_submission_entity_xml(doc)

    assert 'HarborMaintenanceFee' not in xml
    assert 'MerchandiseProcessingFee' not in xml


def test_build_submission_entity_xml_builds_importer_and_carrier_nodes(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)

    class FakeClient:
        def new_entry_xml(self):
            return '<NewResult xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/" z:Id="i1"><EntityGuid>guid-1</EntityGuid><Date>2026-06-04T17:37:45</Date><Number>3003990</Number><a:EntryFilerCode xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">SY1</a:EntryFilerCode><a:EntryNumber xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">30039903</a:EntryNumber><a:EntryType xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">01</a:EntryType><a:Shipments xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents"></a:Shipments></NewResult>'

        def fetch_customs_port_by_code_xml(self, code):
            return f'<CustomsPort><Id>6</Id><Code>{code}</Code></CustomsPort>'

        def fetch_harmonized_tariff_by_code_xml(self, code):
            return f'<HarmonizedTariff><Id>77</Id><Code>{code}</Code><Name>Tariff {code}</Name></HarmonizedTariff>'

        def calculate_entry_number(self, number, filer_code, check_unique=True, adjust_sequence=False):
            return '30039903'

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    xml = build_submission_entity_xml(make_doc(
        articles=[DummyRow(article_line_no='1', description='Article One', invoice_number='INV-1', shipment_no='7', line_item_identifier='A1', country_of_origin='CN', country_of_export='CN', gross_weight=10.0, entered_value=1250.0, harbor_maintenance_fee=5.0, merchandise_processing_fee=7.5)],
        tariff_lines=[DummyRow(line_no='1', article_line_no='1', shipment_no='7', invoice_number='INV-1', hs_code='4819200040', quantity=1.0, uom='KG', entered_value=1250.0, country_of_origin='CN')],
    ))

    assert 'i:type="a:CustomsEntry"' not in xml
    assert '<entity' in xml
    assert 'EntryFilerCode' in xml
    assert 'Importer_Id' in xml
    assert 'Carrier_Id' in xml
    assert 'z:Id="i2"' in xml
    assert 'ShipmentInvoice' in xml
    assert 'ShipmentArticle' in xml
    assert 'ShipmentArticleTariff' in xml
    assert 'HarmonizedTariff_Id' in xml
    assert '>77<' in xml
    assert '2026-06-04T00:00:00' in xml


def test_build_submission_entity_xml_uses_calculate_entry_number_for_new_entries(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)

    class FakeClient:
        def new_entry_xml(self):
            return '<NewResult><Id>55</Id><Date>2026-06-04T17:37:45</Date><Number>3003990</Number><a:EntryFilerCode xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">SY1</a:EntryFilerCode><a:EntryNumber xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">30039903</a:EntryNumber></NewResult>'

        def fetch_customs_port_by_code_xml(self, code):
            return f'<CustomsPort><Id>6</Id><Code>{code}</Code></CustomsPort>'

        def calculate_entry_number(self, number, filer_code, check_unique=True, adjust_sequence=False):
            assert str(number) == '3005005'
            assert filer_code == 'SY1'
            assert check_unique is True
            assert adjust_sequence is True
            return '30039903'

        def calculate_entry_number_for_entry(self, *args, **kwargs):
            raise AssertionError('CalculateEntryNumberForEntry should not be used for brand-new entries before LDS assigns an Id')

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    xml = build_submission_entity_xml(make_doc(entry_number='TMPABC12'))

    assert 'EntryNumber>30039903<' in xml


def test_build_submission_entity_xml_sets_internal_number_for_new_entries(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)

    class FakeClient:
        def new_entry_xml(self):
            return '<NewResult><Id>55</Id><Date>2026-06-04T17:37:45</Date><Number>3003990</Number><a:EntryFilerCode xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">SY1</a:EntryFilerCode><a:EntryNumber xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">30039903</a:EntryNumber></NewResult>'

        def fetch_customs_port_by_code_xml(self, code):
            return f'<CustomsPort><Id>6</Id><Code>{code}</Code></CustomsPort>'

        def calculate_entry_number(self, number, filer_code, check_unique=True, adjust_sequence=False):
            return '30039903'

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    xml = build_submission_entity_xml(make_doc(entry_number='TMPABC12'))

    assert '3005005' in xml
    assert xml.index('3005005') < xml.index('EntryNumber>30039903<')


def test_build_submission_entity_xml_sets_broker_reference_to_calculated_entry_number_for_new_entries(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)

    class FakeClient:
        def new_entry_xml(self):
            return '<NewResult><Date>2026-06-04T17:37:45</Date><Number>3003990</Number><a:EntryFilerCode xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">SY1</a:EntryFilerCode><a:EntryNumber xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">30039903</a:EntryNumber></NewResult>'

        def fetch_customs_port_by_code_xml(self, code):
            return f'<CustomsPort><Id>6</Id><Code>{code}</Code></CustomsPort>'

        def calculate_entry_number(self, number, filer_code, check_unique=True, adjust_sequence=False):
            return '30039903'

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    xml = build_submission_entity_xml(make_doc(entry_number='TMPABC12', broker_reference='LOCAL-REF'))

    assert 'BrokerReferenceNumber>30039903<' in xml
    assert 'LOCAL-REF' not in xml


def test_build_submission_entity_xml_omits_placeholder_entry_number(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)

    class FakeClient:
        def new_entry_xml(self):
            return '<NewResult><Date>2026-06-04T17:37:45</Date><a:EntryFilerCode xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">SY1</a:EntryFilerCode><a:EntryNumber xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">30039903</a:EntryNumber></NewResult>'

        def fetch_customs_port_by_code_xml(self, code):
            return f'<CustomsPort><Id>6</Id><Code>{code}</Code></CustomsPort>'

        def calculate_entry_number(self, number, filer_code, check_unique=True, adjust_sequence=False):
            return '30039903'

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    xml = build_submission_entity_xml(make_doc(entry_number='TMPABC12'))

    assert 'TMPABC12' not in xml
    assert 'EntryFilerCode' in xml
    assert '30039903' in xml


def test_process_lds_submission_populates_mapped_fields(monkeypatch):
    doc = make_doc(entry_number='TMPAB123')

    class FakeClient:
        def new_entry_xml(self):
            return '<NewResult><Date>2026-06-04T17:37:45</Date><a:EntryFilerCode xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">SY1</a:EntryFilerCode><a:EntryNumber xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">30039903</a:EntryNumber></NewResult>'

        def fetch_customs_port_by_code_xml(self, code):
            return f'<CustomsPort><Id>6</Id><Code>{code}</Code></CustomsPort>'

        def calculate_entry_number(self, number, filer_code, check_unique=True, adjust_sequence=False):
            return '30039903'

        def save_entry_xml(self, entity_xml):
            return '<CustomsEntry><Id>777</Id><EntryNumber>76543210</EntryNumber><EntryFilerCode>SY1</EntryFilerCode><EntryType>01</EntryType><Date>2026-06-04T00:00:00</Date><PortOfEntry><Code>2704</Code></PortOfEntry><Importer><Code>IMP-1</Code><Name>Importer Co</Name></Importer></CustomsEntry>'

        def fetch_entry_detail_xml(self, entry_number, filer_code=None):
            return '<GetByEntryNumberResult><Id>777</Id><EntryNumber>76543210</EntryNumber></GetByEntryNumberResult>'

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
        'articles': [],
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
        def new_entry_xml(self):
            return '<NewResult><Date>2026-06-04T17:37:45</Date><a:EntryFilerCode xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">SY1</a:EntryFilerCode></NewResult>'

        def fetch_customs_port_by_code_xml(self, code):
            return f'<CustomsPort><Id>6</Id><Code>{code}</Code></CustomsPort>'

        def calculate_entry_number(self, number, filer_code, check_unique=True, adjust_sequence=False):
            return '30039903'

        def save_entry_xml(self, entity_xml):
            raise LDSClientError('boom')

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)
    monkeypatch.setattr(submission, 'now_datetime', lambda: '2026-06-04 14:00:00')
    monkeypatch.setattr(submission, '_', lambda message: message)

    with pytest.raises(Exception) as exc:
        process_lds_submission(doc)

    assert 'LDS submission failed: boom' in str(exc.value)
    assert doc.status == 'Draft'
    assert doc.lds_submission_errors == 'LDS submission failed: boom'




def test_process_lds_submission_repairs_zero_number_rows(monkeypatch):
    doc = make_doc(entry_number='TMPAB123')
    saved_payloads = []

    class FakeClient:
        def new_entry_xml(self):
            return '<NewResult><Id>55</Id><Date>2026-06-04T17:37:45</Date><Number>3003990</Number><a:EntryFilerCode xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">SY1</a:EntryFilerCode><a:EntryNumber xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">30039903</a:EntryNumber></NewResult>'

        def fetch_customs_port_by_code_xml(self, code):
            return f'<CustomsPort><Id>6</Id><Code>{code}</Code></CustomsPort>'

        def calculate_entry_number_for_entry(self, number, filer_code, customs_entry_id, adjust_sequence=True):
            assert str(number) == '3003990'
            assert filer_code == 'SY1'
            assert customs_entry_id in (55, 777)
            return '30039903'

        def save_entry_xml(self, entity_xml):
            saved_payloads.append(entity_xml)
            if len(saved_payloads) == 1:
                return '<CustomsEntry><Id>777</Id><Number>0</Number><EntryNumber>30039903</EntryNumber><EntryFilerCode>SY1</EntryFilerCode><EntryType>01</EntryType><Date>2026-06-04T00:00:00</Date><PortOfEntry><Code>2704</Code></PortOfEntry><Importer><Code>IMP-1</Code><Name>Importer Co</Name></Importer></CustomsEntry>'
            return '<CustomsEntry><Id>777</Id><Number>3003990</Number><EntryNumber>30039903</EntryNumber><EntryFilerCode>SY1</EntryFilerCode><EntryType>01</EntryType><Date>2026-06-04T00:00:00</Date><PortOfEntry><Code>2704</Code></PortOfEntry><Importer><Code>IMP-1</Code><Name>Importer Co</Name></Importer></CustomsEntry>'

        def fetch_entry_detail_xml(self, entry_number, filer_code=None):
            return '<GetByEntryNumberResult><Id>777</Id><EntryNumber>30039903</EntryNumber></GetByEntryNumberResult>'

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)
    monkeypatch.setattr(submission, 'now_datetime', lambda: '2026-06-04 14:00:00')
    monkeypatch.setattr(submission, 'resolve_master_links', lambda mapped, synced_on=None, create_missing=False: mapped)
    monkeypatch.setattr(
        submission,
        'build_customs_entry_repair_xml',
        lambda saved_xml, **kwargs: (
            '<entity xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">'
            '<Number>3003990</Number>'
            '<a:BrokerReferenceNumber>30039903</a:BrokerReferenceNumber>'
            '</entity>'
        ),
    )
    monkeypatch.setattr(submission, 'parse_entry_xml', lambda xml: {
        'lds_id': '777',
        'entry_number': '30039903',
        'filer_code': 'SY1',
        'entry_type': '01',
        'entry_date': '2026-06-04',
        'port_of_entry': '2704',
        'importer_name': 'Importer Co',
        'importer_number': 'IMP-1',
        'shipments': [],
        'invoices': [],
        'articles': [],
        'fees': [],
        'events': [],
        'tariff_lines': [],
        'references': [],
    })

    process_lds_submission(doc)

    assert len(saved_payloads) == 2
    assert '<Number>3003990</Number>' in saved_payloads[1]
    assert 'BrokerReferenceNumber>30039903<' in saved_payloads[1]
    assert doc.lds_id == '777'
def test_build_submission_entity_xml_falls_back_when_new_entry_template_faults(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)
    monkeypatch.setattr(submission.frappe, 'get_all', lambda *args, **kwargs: ['30050041', '30029607'])

    class FakeClient:
        def new_entry_xml(self):
            raise LDSClientError('Index was outside the bounds of the array. {System.IndexOutOfRangeException}')

        def fetch_customs_port_by_code_xml(self, code):
            return f'<CustomsPort><Id>6</Id><Code>{code}</Code></CustomsPort>'

        def calculate_entry_number(self, number, filer_code, check_unique=True, adjust_sequence=False):
            assert str(number) == '3005005'
            assert filer_code == 'SY1'
            assert check_unique is True
            assert adjust_sequence is True
            return '30050058'

        def calculate_entry_number_for_entry(self, *args, **kwargs):
            raise AssertionError('CalculateEntryNumberForEntry should not be used when the fallback template has no LDS id')

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    xml = build_submission_entity_xml(make_doc(entry_number='TMPABC12', broker_reference='LOCAL-REF'))

    assert '3005005' in xml
    assert 'EntryNumber>30050058<' in xml
    assert 'BrokerReferenceNumber>30050058<' in xml
    assert 'LOCAL-REF' not in xml


def test_build_submission_entity_xml_ignores_existing_entry_raw_payload(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)
    doc = make_doc(raw_payload_xml='<a:CustomsEntry xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents"><Date xmlns="">2026-06-03T00:00:00</Date><a:EntryNumber>30010000</a:EntryNumber></a:CustomsEntry>')

    class FakeClient:
        def new_entry_xml(self):
            return '<NewResult><Date>2026-06-04T17:37:45</Date><Number>3003990</Number><a:EntryFilerCode xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">SY1</a:EntryFilerCode><a:EntryNumber xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">30039903</a:EntryNumber></NewResult>'

        def fetch_customs_port_by_code_xml(self, code):
            return f'<CustomsPort><Id>6</Id><Code>{code}</Code></CustomsPort>'

        def calculate_entry_number(self, number, filer_code, check_unique=True, adjust_sequence=False):
            return '30039903'

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())

    xml = build_submission_entity_xml(doc)

    assert '<entity' in xml
    assert '30010000' not in xml
    assert '12345678' not in xml
    assert '30039903' in xml
    assert '<ns0:PortOfEntry>' not in xml and '<PortOfEntry>' not in xml


def test_validate_customs_entry_for_submission_allows_master_records_without_current_env_lds_ids(monkeypatch):
    def fake_draft_get_cached_doc(doctype, name):
        if doctype == 'Importer Profile':
            return SimpleNamespace(name=name, display_name='Importer Co', importer_code='IMP-1', cbp_number=None, irs_number=None, raw_payload_xml=None, lds_id=None, docstatus=0)
        if doctype == 'Carrier':
            return SimpleNamespace(name=name, display_name='Carrier Co', carrier_code='CAR-1', raw_payload_xml=None, lds_id=None, docstatus=0)
        raise AssertionError((doctype, name))

    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_draft_get_cached_doc)

    issues = validate_customs_entry_for_submission(make_doc())

    messages = {issue.message for issue in issues}
    assert 'Importer Profile must have a display name.' not in messages
    assert 'Importer Profile must have an importer code, CBP number, or IRS number.' not in messages
    assert 'Each shipment carrier must have a display name or carrier code.' not in messages




def test_build_submission_entity_xml_uses_runtime_code_lookup_for_env_specific_ids(monkeypatch):
    def fake_env_mixed_get_cached_doc(doctype, name):
        if doctype == 'Importer Profile':
            return SimpleNamespace(name=name, display_name='Importer Co', importer_code='IMP-1', cbp_number=None, irs_number=None, raw_payload_xml='<Contact><Id>493</Id><Code>IMP-1</Code><Name>Importer Co</Name></Contact>', lds_id='493', docstatus=1)
        if doctype == 'Carrier':
            return SimpleNamespace(name=name, display_name='Carrier Co', carrier_code='CAR-1', raw_payload_xml='<Carrier><Id>1488</Id><Code>CAR-1</Code><Name>Carrier Co</Name></Carrier>', lds_id='1488', docstatus=1)
        raise AssertionError((doctype, name))

    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_env_mixed_get_cached_doc)

    class FakeClient:
        def new_entry_xml(self):
            return '<NewResult xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/"><EntityGuid>guid-1</EntityGuid><Date>2026-06-04T17:37:45</Date><Number>3003990</Number><a:EntryFilerCode xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">SY1</a:EntryFilerCode><a:EntryNumber xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">30039903</a:EntryNumber></NewResult>'

        def fetch_customs_port_by_code_xml(self, code):
            return f'<CustomsPort><Id>6</Id><Code>{code}</Code></CustomsPort>'

        def fetch_importer_contact_by_code_xml(self, code):
            assert code == 'IMP-1'
            return '<Contact><Id>704</Id><Code>IMP-1</Code><Name>Importer Co</Name></Contact>'

        def fetch_carrier_by_code_xml(self, code):
            assert code == 'CAR-1'
            return '<Carrier><Id>5121</Id><Code>CAR-1</Code><Name>Carrier Co</Name></Carrier>'

        def calculate_entry_number(self, number, filer_code, check_unique=True, adjust_sequence=False):
            return '30039903'

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    xml = build_submission_entity_xml(make_doc())

    assert 'Importer_Id>704<' in xml
    assert 'Carrier_Id>5121<' in xml
    assert 'PortOfEntry_Id>6<' in xml
    assert '<Id>493</Id>' not in xml
    assert '<Id>1488</Id>' not in xml

def test_build_submission_entity_xml_orders_entry_fields_for_lds_contract(monkeypatch):
    monkeypatch.setattr(submission.frappe, 'get_cached_doc', fake_get_cached_doc)

    class FakeClient:
        def new_entry_xml(self):
            return '<NewResult><Date>2026-06-04T17:37:45</Date><a:EntryFilerCode xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">SY1</a:EntryFilerCode><a:EntryNumber xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">30039903</a:EntryNumber><a:Shipments xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents"></a:Shipments></NewResult>'

        def fetch_customs_port_by_code_xml(self, code):
            return f'<CustomsPort><Id>6</Id><Code>{code}</Code></CustomsPort>'

        def calculate_entry_number(self, number, filer_code, check_unique=True, adjust_sequence=False):
            return '30039903'

        def new_shipment_xml(self):
            return '<NewResult><Date>2026-06-04T17:37:45</Date><a:Invoices xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents" /></NewResult>'

    monkeypatch.setattr(submission, 'get_client', lambda: FakeClient())
    xml = build_submission_entity_xml(make_doc(entry_number='TMPABC12'))

    root = ET.fromstring(xml)
    top_level = [child.tag.split('}', 1)[-1] for child in list(root)]
    assert top_level.index('Carrier_Id') < top_level.index('ClientRef') < top_level.index('EntryType') < top_level.index('Importer_Id') < top_level.index('PortOfEntry_Id') < top_level.index('SuretyCode') < top_level.index('TransportationMode')
    assert 'Consignee><Name>' not in xml




def test_save_with_deadlock_retry_preserves_in_memory_state(monkeypatch):
    monkeypatch.setattr(submission, 'sleep', lambda *_args, **_kwargs: None)

    class FakeDoc:
        def __init__(self):
            self.flags = SimpleNamespace(skip_lds_submission=False)
            self.entry_number = '30059999'
            self.lds_id = '1999'
            self.last_lds_submission_on = '2026-06-05 21:00:00'
            self.reload_calls = 0
            self.save_calls = 0

        def save(self):
            self.save_calls += 1
            if self.save_calls == 1:
                raise submission.QueryDeadlockError('deadlock')

        def reload(self):
            self.reload_calls += 1
            self.entry_number = 'TMPBROKE'
            self.lds_id = None
            self.last_lds_submission_on = None

    rollback_calls = []
    monkeypatch.setattr(submission.frappe, 'db', SimpleNamespace(rollback=lambda: rollback_calls.append(True)))
    doc = FakeDoc()

    submission._save_with_deadlock_retry(doc)

    assert doc.save_calls == 2
    assert doc.reload_calls == 0
    assert doc.flags.skip_lds_submission is True
    assert doc.entry_number == '30059999'
    assert doc.lds_id == '1999'
    assert doc.last_lds_submission_on == '2026-06-05 21:00:00'
    assert rollback_calls == [True]


def test_submit_with_deadlock_retry_preserves_in_memory_state(monkeypatch):
    monkeypatch.setattr(submission, 'sleep', lambda *_args, **_kwargs: None)

    class FakeDoc:
        def __init__(self):
            self.flags = SimpleNamespace(skip_lds_submission=False)
            self.entry_number = '30059999'
            self.lds_id = '1999'
            self.reload_calls = 0
            self.submit_calls = 0

        def submit(self):
            self.submit_calls += 1
            if self.submit_calls == 1:
                raise submission.QueryDeadlockError('deadlock')

        def reload(self):
            self.reload_calls += 1
            self.entry_number = 'TMPBROKE'
            self.lds_id = None

    rollback_calls = []
    monkeypatch.setattr(submission.frappe, 'db', SimpleNamespace(rollback=lambda: rollback_calls.append(True)))
    doc = FakeDoc()

    submission._submit_with_deadlock_retry(doc)

    assert doc.submit_calls == 2
    assert doc.reload_calls == 0
    assert doc.flags.skip_lds_submission is True
    assert doc.entry_number == '30059999'
    assert doc.lds_id == '1999'
    assert rollback_calls == [True]


def test_save_with_deadlock_retry_refreshes_original_modified(monkeypatch):
    monkeypatch.setattr(submission, 'sleep', lambda *_args, **_kwargs: None)

    class FakeDoc:
        def __init__(self):
            self.doctype = 'Customs Entry'
            self.name = 'TMPSTAMP'
            self.__islocal = False
            self.flags = SimpleNamespace(skip_lds_submission=False)
            self._original_modified = 'stale'
            self.save_calls = 0

        def save(self):
            self.save_calls += 1

    lookups = []
    monkeypatch.setattr(submission.frappe, 'db', SimpleNamespace(
        get_value=lambda doctype, name, field: lookups.append((doctype, name, field)) or '2026-06-05 21:30:00',
        rollback=lambda: None,
    ))
    doc = FakeDoc()

    submission._save_with_deadlock_retry(doc)

    assert doc.save_calls == 1
    assert doc._original_modified == '2026-06-05 21:30:00'
    assert lookups == [('Customs Entry', 'TMPSTAMP', 'modified')]

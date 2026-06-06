from types import SimpleNamespace

from andersoncb_erp.services import verification


class DummyRow(SimpleNamespace):
    pass


class DummyDoc(SimpleNamespace):
    def get(self, fieldname):
        return getattr(self, fieldname, None)



def make_doc(**overrides):
    base = {
        'name': 'TMP-VERIFY',
        'doctype': 'Customs Entry',
        'entry_number': '30059991',
        'filer_code': 'SY1',
        'entry_type': '01',
        'client_ref': 'UI-CASE-001',
        'entry_date': '2026-06-05',
        'estimated_entry_date': '2026-06-05',
        'filing_date': None,
        'preliminary_statement_print_date': '2026-06-17',
        'release_date': '2026-06-05',
        'liquidation_date': None,
        'arrival_date': '2026-06-05',
        'port_of_entry': '4601',
        'port_of_unlading': '4601',
        'transport_mode': '11',
        'conveyance_name': 'TEST VESSEL',
        'trip_identifier': 'TV001',
        'payment_type': '2',
        'bond_type': '8',
        'surety_code': '036',
        'bond_number': 'BOND123',
        'house_bill': 'HB-001',
        'master_bill': 'MB-001',
        'importer_name': 'Synthetic Importer LLC',
        'importer_number': 'IMP-ALPHA-01',
        'consignee_name': 'Synthetic Consignee LLC',
        'broker_reference': 'BR-001',
        'total_entered_value': 100.0,
        'currency': 'USD',
        'status': 'Released',
        'psc_status': 'PSC',
        'liquidation_status': 'Not Liquidated',
        'lds_id': '1705',
        'shipments': [DummyRow(shipment_no='S1', mode='11', carrier='Carrier One', voyage_or_flight='TV001', port_of_entry='4601', port_of_unlading='4601', date_of_arrival='2026-06-05', date_of_import='2026-06-05', date_of_export='2026-05-30')],
        'invoices': [DummyRow(shipment_no='S1', invoice_number='INV-001', invoice_date='2026-06-01', currency='USD', invoice_amount=100.0, vendor_name='Vendor One')],
        'articles': [DummyRow(shipment_no='S1', invoice_number='INV-001', article_line_no='1', description='TEST GOODS', line_item_identifier='001', country_of_origin='CN', country_of_export='CN', manufacturer_lds_id='44', related_party_indicator='N', gross_weight=50.0, entered_value=100.0, harbor_maintenance_fee=1.1, merchandise_processing_fee=2.2)],
        'fees': [
            DummyRow(fee_type='MPF', amount=2.2, currency='USD', description='TEST GOODS', shipment_no='S1', invoice_number='INV-001', article_line_no='1'),
            DummyRow(fee_type='HMF', amount=1.1, currency='USD', description='TEST GOODS', shipment_no='S1', invoice_number='INV-001', article_line_no='1'),
        ],
        'tariff_lines': [DummyRow(shipment_no='S1', invoice_number='INV-001', article_line_no='1', line_no='1', hs_code='4819200040', description='OTHR NONCORRGTED PAPR FLDG CTN', quantity=5.0, uom='KG', entered_value=100.0, country_of_origin='CN')],
    }
    base.update(overrides)
    return DummyDoc(**base)



def matching_mapped_payload():
    return {
        'entry_number': '30059991',
        'filer_code': 'SY1',
        'entry_type': '01',
        'client_ref': 'UI-CASE-001',
        'entry_date': '2026-06-05',
        'estimated_entry_date': '2026-06-05',
        'filing_date': None,
        'preliminary_statement_print_date': '2026-06-17',
        'release_date': '2026-06-05',
        'liquidation_date': None,
        'arrival_date': '2026-06-05',
        'port_of_entry': '4601',
        'port_of_unlading': '4601',
        'transport_mode': '11',
        'conveyance_name': 'TEST VESSEL',
        'trip_identifier': 'TV001',
        'payment_type': '2',
        'bond_type': '8',
        'surety_code': '036',
        'bond_number': 'BOND123',
        'house_bill': 'HB-001',
        'master_bill': 'MB-001',
        'importer_name': 'Synthetic Importer LLC',
        'importer_number': 'IMP-ALPHA-01',
        'consignee_name': 'Synthetic Consignee LLC',
        'broker_reference': 'BR-001',
        'total_entered_value': 100.0,
        'currency': 'USD',
        'source_active': 1,
        'status': 'Released',
        'psc_flag': True,
        'liquidation_date': None,
        'shipments': [{'shipment_no': 'S1', 'mode': '11', 'carrier': 'Carrier One', 'voyage_or_flight': 'TV001', 'port_of_entry': '4601', 'port_of_unlading': '4601', 'date_of_arrival': '2026-06-05', 'date_of_import': '2026-06-05', 'date_of_export': '2026-05-30'}],
        'invoices': [{'shipment_no': 'S1', 'invoice_number': 'INV-001', 'invoice_date': '2026-06-01', 'currency': 'USD', 'invoice_amount': 100.0, 'vendor_name': 'Vendor One'}],
        'articles': [{'shipment_no': 'S1', 'invoice_number': 'INV-001', 'article_line_no': '1', 'description': 'TEST GOODS', 'line_item_identifier': '001', 'country_of_origin': 'CN', 'country_of_export': 'CN', 'manufacturer_lds_id': '44', 'related_party_indicator': 'N', 'gross_weight': 50.0, 'entered_value': 100.0, 'harbor_maintenance_fee': 1.1, 'merchandise_processing_fee': 2.2}],
        'fees': [
            {'fee_type': 'MPF', 'amount': 2.2, 'currency': 'USD', 'description': 'TEST GOODS', 'shipment_no': 'S1', 'invoice_number': 'INV-001', 'article_line_no': '1'},
            {'fee_type': 'HMF', 'amount': 1.1, 'currency': 'USD', 'description': 'TEST GOODS', 'shipment_no': 'S1', 'invoice_number': 'INV-001', 'article_line_no': '1'},
        ],
        'tariff_lines': [{'shipment_no': 'S1', 'invoice_number': 'INV-001', 'article_line_no': '1', 'line_no': '1', 'hs_code': '4819200040', 'description': 'OTHR NONCORRGTED PAPR FLDG CTN', 'quantity': 5.0, 'uom': 'KG', 'entered_value': 100.0, 'country_of_origin': 'CN'}],
    }



def test_compare_snapshots_reports_no_differences_for_matching_data():
    doc = make_doc()
    mapped = matching_mapped_payload()

    expected = verification.build_erp_snapshot(doc)
    actual = verification.build_mapped_snapshot(mapped)

    assert verification.compare_snapshots(expected, actual) == []



def test_compare_snapshots_reports_field_mismatch():
    doc = make_doc()
    mapped = matching_mapped_payload()
    mapped['client_ref'] = 'WRONG-REF'
    mapped['shipments'] = []
    mapped['invoices'] = []
    mapped['articles'] = []
    mapped['fees'] = []
    mapped['tariff_lines'] = []

    differences = verification.compare_snapshots(
        verification.build_erp_snapshot(doc),
        verification.build_mapped_snapshot(mapped),
    )

    assert any(diff['section'] == 'header' and diff['field'] == 'client_ref' for diff in differences)



def test_compare_snapshots_reports_newly_covered_business_fields():
    doc = make_doc()
    mapped = matching_mapped_payload()
    mapped['broker_reference'] = 'WRONG-BROKER'
    mapped['shipments'][0]['voyage_or_flight'] = 'WRONG-VOYAGE'
    mapped['articles'][0]['manufacturer_lds_id'] = '99'
    mapped['fees'][0]['amount'] = 9.9

    differences = verification.compare_snapshots(
        verification.build_erp_snapshot(doc),
        verification.build_mapped_snapshot(mapped),
    )

    assert any(diff['section'] == 'header' and diff['field'] == 'broker_reference' for diff in differences)
    assert any(diff['section'] == 'shipments' and diff['field'] == 'voyage_or_flight' for diff in differences)
    assert any(diff['section'] == 'articles' and diff['field'] == 'manufacturer_lds_id' for diff in differences)
    assert any(diff['section'] == 'fees' and diff['field'] == 'amount' for diff in differences)



def test_compare_snapshots_reports_derived_status_mismatch():
    doc = make_doc()
    mapped = matching_mapped_payload()
    mapped['release_date'] = None
    mapped['preliminary_statement_print_date'] = None
    mapped['entry_date'] = None
    mapped['estimated_entry_date'] = None
    mapped['status'] = None
    mapped['psc_flag'] = False

    differences = verification.compare_snapshots(
        verification.build_erp_snapshot(doc),
        verification.build_mapped_snapshot(mapped),
    )

    assert any(diff['section'] == 'status' and diff['field'] == 'status' for diff in differences)
    assert any(diff['section'] == 'status' and diff['field'] == 'psc_status' for diff in differences)



def test_verify_customs_entry_roundtrip_fetches_lds_and_returns_report(monkeypatch):
    doc = make_doc()

    class FakeClient:
        def fetch_entry_detail_xml_by_id(self, entity_id):
            assert entity_id == '1705'
            return '<CustomsEntry><EntryNumber>30059991</EntryNumber><EntryFilerCode>SY1</EntryFilerCode></CustomsEntry>'

    monkeypatch.setattr(verification.frappe, 'get_doc', lambda doctype, name: doc)
    monkeypatch.setattr(verification, 'get_client', lambda: FakeClient())
    monkeypatch.setattr(verification, 'parse_entry_xml', lambda xml: matching_mapped_payload())

    result = verification.verify_customs_entry_roundtrip('TMP-VERIFY')

    assert result['ok'] is True
    assert result['entry_name'] == 'TMP-VERIFY'
    assert result['differences'] == []

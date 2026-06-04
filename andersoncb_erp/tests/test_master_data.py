from types import SimpleNamespace

from andersoncb_erp.services import master_data


def test_resolve_master_links_applies_importer_and_carrier_links(monkeypatch):
    mapped = {
        'importer_profile_data': {'display_name': 'Importer Co', 'importer_code': 'IMP-1'},
        'importer_name': None,
        'importer_number': None,
        'shipments': [
            {'carrier_data': {'display_name': 'Carrier Co', 'carrier_code': 'CAR-1'}, 'carrier': None}
        ],
    }

    monkeypatch.setattr(
        master_data,
        'upsert_importer_profile',
        lambda data, synced_on=None: SimpleNamespace(name='IMP-PROFILE', display_name='Importer Co', importer_code='IMP-1', cbp_number=None, irs_number=None),
    )
    monkeypatch.setattr(
        master_data,
        'upsert_carrier',
        lambda data, synced_on=None: SimpleNamespace(name='CARRIER-1', display_name='Carrier Co'),
    )

    result = master_data.resolve_master_links(mapped, synced_on='2026-06-04 12:00:00')

    assert result['importer_profile'] == 'IMP-PROFILE'
    assert result['importer_name'] == 'Importer Co'
    assert result['importer_number'] == 'IMP-1'
    assert result['shipments'][0]['carrier_profile'] == 'CARRIER-1'
    assert result['shipments'][0]['carrier'] == 'Carrier Co'
    assert 'importer_profile_data' not in result
    assert 'carrier_data' not in result['shipments'][0]



def test_importer_matching_does_not_merge_by_irs_number_alone(monkeypatch):
    exists_calls = []

    def fake_exists(doctype, filters):
        exists_calls.append((doctype, filters))
        if doctype != 'Importer Profile':
            return None
        if filters == {'lds_id': '493'}:
            return None
        if filters == {'importer_code': 'DEMC67'}:
            return None
        if filters == {'display_name': 'Demo Company 2', 'irs_number': '12-345678900'}:
            return None
        if filters == {'display_name': 'Demo Company 2'}:
            return None
        return None

    fake_frappe = SimpleNamespace(
        db=SimpleNamespace(exists=fake_exists),
        get_all=lambda *args, **kwargs: [],
    )
    monkeypatch.setattr(master_data, 'frappe', fake_frappe)

    result = master_data._find_existing_importer_profile_name({
        'lds_id': '493',
        'importer_code': 'DEMC67',
        'display_name': 'Demo Company 2',
        'irs_number': '12-345678900',
    })

    assert result is None
    assert ('Importer Profile', {'display_name': 'Demo Company 2'}) in exists_calls

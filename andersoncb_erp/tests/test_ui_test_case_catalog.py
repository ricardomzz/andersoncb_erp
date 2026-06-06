from andersoncb_erp.services.ui_test_case_catalog import get_test_case, load_execution_prep_snapshot, load_test_case_catalog


def test_load_test_case_catalog_reads_all_core_and_generic_cases():
    cases = load_test_case_catalog()
    assert len(cases) == 75
    assert cases[0]['case_id'] == '01'
    assert cases[0]['case_type'] == 'core'
    assert any(case['case_id'] == 'G25' and case['case_type'] == 'generic' for case in cases)


def test_get_test_case_returns_specific_case():
    case = get_test_case('39')
    assert case is not None
    assert case['focus'] == 'One article with three tariffs'
    assert case['hts_pattern'] == 'HTS-BASE-PAPER-01 + HTS-CH99-A + HTS-CH99-B'


def test_load_execution_prep_snapshot_parses_environment_and_resolution_tables():
    prep = load_execution_prep_snapshot()
    assert prep['endpoint_url'] == 'https://smstest.logisticaldatasolutions.com:8130/brokerservice'
    assert prep['username'] == 'MAZZINI@betatest'
    assert prep['default_filer_code'] == 'SY1'
    assert any(row['symbolic_port'] == 'PORT-EC-SEA-1' and row['candidate_code'] == '4601' for row in prep['symbolic_ports'])
    assert any(row['symbolic_hts'] == 'HTS-BASE-PAPER-01' and row['candidate_code'] == '4819200040' for row in prep['symbolic_hts'])

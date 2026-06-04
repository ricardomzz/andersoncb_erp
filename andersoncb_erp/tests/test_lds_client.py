import pytest

from andersoncb_erp.integrations.lds import LDSEntrySummary, LDSClientError, build_rolling_window_criteria, extract_entry_elements, parse_soap_body, summary_from_entry_element


SOAP_XML = """<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetPageResponse xmlns="http://tempuri.org/"><GetPageResult><Items><a:CustomsEntry xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents" xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/" z:Id="i1"><Id xmlns="">99</Id><EntryFilerCode xmlns="">SY1</EntryFilerCode><EntryNumber xmlns="">30029607</EntryNumber><Date xmlns="">2026-06-01</Date></a:CustomsEntry></Items></GetPageResult></GetPageResponse></soap:Body></soap:Envelope>"""


GET_BY_ENTRY_NUMBER_XML = """<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetByEntryNumberResponse xmlns="http://tempuri.org/"><GetByEntryNumberResult><Id xmlns="">100</Id><EntryFilerCode xmlns="">SY1</EntryFilerCode><EntryNumber xmlns="">30029608</EntryNumber></GetByEntryNumberResult></GetByEntryNumberResponse></soap:Body></soap:Envelope>"""


GET_BY_ID_XML = """<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetResponse xmlns="http://tempuri.org/"><GetResult><Id xmlns="">101</Id><EntryFilerCode xmlns="">SY1</EntryFilerCode><EntryNumber xmlns="">30029609</EntryNumber></GetResult></GetResponse></soap:Body></soap:Envelope>"""


def test_parse_soap_body_and_extract_entry_elements_from_get_page():
    body = parse_soap_body(SOAP_XML)
    entries = extract_entry_elements(body)
    assert len(entries) == 1
    summary = summary_from_entry_element(entries[0])
    assert summary == LDSEntrySummary(entry_number='30029607', filer_code='SY1', entity_id='99', raw_xml=summary.raw_xml)


def test_extract_entry_elements_from_get_by_entry_number_wrapper():
    body = parse_soap_body(GET_BY_ENTRY_NUMBER_XML)
    entries = extract_entry_elements(body)
    assert len(entries) == 1
    summary = summary_from_entry_element(entries[0])
    assert summary.entry_number == '30029608'
    assert summary.filer_code == 'SY1'
    assert summary.entity_id == '100'


def test_extract_entry_elements_from_get_by_id_wrapper():
    body = parse_soap_body(GET_BY_ID_XML)
    entries = extract_entry_elements(body)
    assert len(entries) == 1
    summary = summary_from_entry_element(entries[0])
    assert summary.entry_number == '30029609'
    assert summary.entity_id == '101'


def test_build_rolling_window_criteria_uses_date_field():
    assert build_rolling_window_criteria(90) == '[Date] >= DateTime.Today.AddDays(-90)'


def test_parse_soap_body_rejects_invalid_xml():
    with pytest.raises(LDSClientError, match='valid XML'):
        parse_soap_body('not xml')


VALIDATION_FAULT_XML = """<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:ENTRY_VALIDATION_ERROR</faultcode><faultstring xml:lang="en-US">Entity validation error.</faultstring><detail><EntryValidationFault xmlns="http://schemas.datacontract.org/2004/07/SMS.Broker.Faults"><EntryValidationErrors><EntryValidationErrorDetail><ErrorCode>6000</ErrorCode><ErrorMessage>Importer required!</ErrorMessage><Property>Importer</Property><ValueAsString>null</ValueAsString></EntryValidationErrorDetail></EntryValidationErrors></EntryValidationFault></detail></s:Fault></s:Body></s:Envelope>"""


def test_parse_soap_response_raises_structured_validation_error():
    from andersoncb_erp.integrations.lds import LDSValidationError, parse_soap_response

    with pytest.raises(LDSValidationError) as exc_info:
        parse_soap_response(500, VALIDATION_FAULT_XML)

    assert exc_info.value.details[0].property_name == 'Importer'
    assert exc_info.value.details[0].error_code == '6000'

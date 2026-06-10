import pytest

from andersoncb_erp.integrations.lds import LDSClient, LDSEntrySummary, LDSClientError, build_rolling_window_criteria, extract_entry_elements, parse_soap_binary_response, parse_soap_body, summary_from_entry_element


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
    assert build_rolling_window_criteria(90).startswith('[Date] >= #') and build_rolling_window_criteria(90).endswith('#')


def test_new_entry_xml_uses_documented_source_id_nil_shape(monkeypatch):
    client = LDSClient(endpoint_url='https://example.test/BrokerService', username='user', password='pass')
    captured = {}

    def fake_request(manager_name, soap_action, body):
        captured['manager_name'] = manager_name
        captured['soap_action'] = soap_action
        captured['body'] = body
        return parse_soap_body('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><NewResponse xmlns="http://tempuri.org/"><NewResult><Id xmlns="">1</Id></NewResult></NewResponse></soap:Body></soap:Envelope>')

    monkeypatch.setattr(client, '_request_manager_xml', fake_request)

    xml = client.new_entry_xml()

    assert captured['manager_name'] == 'CustomsEntryManager'
    assert captured['soap_action'] == 'http://tempuri.org/IEntityManagerOf_CustomsEntry/New'
    assert '<sourceId i:nil="true"' in captured['body']
    assert '<Id>1</Id>' in xml


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


def test_calculate_entry_number_for_entry_uses_documented_request_shape(monkeypatch):
    client = LDSClient(endpoint_url='https://example.test/BrokerService', username='user', password='pass')
    captured = {}

    def fake_request(manager_name, soap_action, body):
        captured['manager_name'] = manager_name
        captured['soap_action'] = soap_action
        captured['body'] = body
        return parse_soap_body('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><CalculateEntryNumberForEntryResponse xmlns="http://tempuri.org/"><CalculateEntryNumberForEntryResult>30040521</CalculateEntryNumberForEntryResult></CalculateEntryNumberForEntryResponse></soap:Body></soap:Envelope>')

    monkeypatch.setattr(client, '_request_manager_xml', fake_request)

    value = client.calculate_entry_number_for_entry(3004052, 'SY1', 1670, adjust_sequence=True)

    assert value == '30040521'
    assert captured['manager_name'] == 'CustomsEntryManager'
    assert captured['soap_action'] == 'http://tempuri.org/ICustomsEntryManager/CalculateEntryNumberForEntry'
    assert '<number>3004052</number>' in captured['body']
    assert '<filerCode>SY1</filerCode>' in captured['body']
    assert '<customsEntryId>1670</customsEntryId>' in captured['body']
    assert '<adjustSequence>true</adjustSequence>' in captured['body']


def test_fetch_entry_detail_xml_by_internal_number_uses_document_contract(monkeypatch):
    client = LDSClient(endpoint_url='https://example.test/BrokerService', username='user', password='pass')
    captured = {}

    def fake_request(manager_name, soap_action, body):
        captured['manager_name'] = manager_name
        captured['soap_action'] = soap_action
        captured['body'] = body
        return parse_soap_body('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetByNumberResponse xmlns="http://tempuri.org/"><GetByNumberResult><Id xmlns="">1670</Id><EntryNumber xmlns="">30040521</EntryNumber></GetByNumberResult></GetByNumberResponse></soap:Body></soap:Envelope>')

    monkeypatch.setattr(client, '_request_manager_xml', fake_request)

    xml = client.fetch_entry_detail_xml_by_internal_number(3004052)

    assert '<EntryNumber>30040521</EntryNumber>' in xml
    assert captured['manager_name'] == 'CustomsEntryManager'
    assert captured['soap_action'] == 'http://tempuri.org/IEntityManagerDocumentOf_CustomsEntry/GetByNumber'
    assert '<number>3004052</number>' in captured['body']


def test_set_customs_entry_ready_status_uses_documented_request_shape(monkeypatch):
    client = LDSClient(endpoint_url='https://example.test/BrokerService', username='user', password='pass')
    captured = {}

    def fake_request(manager_name, soap_action, body):
        captured['manager_name'] = manager_name
        captured['soap_action'] = soap_action
        captured['body'] = body
        return parse_soap_body('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><SetDocumentReadyStatusResponse xmlns="http://tempuri.org/"/></soap:Body></soap:Envelope>')

    monkeypatch.setattr(client, '_request_manager_xml', fake_request)

    client.set_customs_entry_ready_status(1670, True)

    assert captured['manager_name'] == 'CustomsEntryManager'
    assert captured['soap_action'] == 'http://tempuri.org/ICustomsEntryManager/SetDocumentReadyStatus'
    assert '<id>1670</id>' in captured['body']
    assert '<ready>true</ready>' in captured['body']


def test_fetch_harmonized_tariff_by_code_uses_directory_contract(monkeypatch):
    client = LDSClient(endpoint_url='https://example.test/BrokerService', username='user', password='pass')
    captured = {}

    def fake_request(manager_name, soap_action, body):
        captured['manager_name'] = manager_name
        captured['soap_action'] = soap_action
        captured['body'] = body
        return parse_soap_body('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetByCodeResponse xmlns="http://tempuri.org/"><GetByCodeResult><Code xmlns="">9403409060</Code><Name xmlns="">CABINETS</Name></GetByCodeResult></GetByCodeResponse></soap:Body></soap:Envelope>')

    monkeypatch.setattr(client, '_request_manager_xml', fake_request)

    xml = client.fetch_harmonized_tariff_by_code_xml('9403409060')

    assert '<Code>9403409060</Code>' in xml
    assert captured['manager_name'] == 'HarmonizedTariffManager'
    assert captured['soap_action'] == 'http://tempuri.org/IEntityManagerDirectoryOf_HarmonizedTariff/GetByCode'
    assert '<code>9403409060</code>' in captured['body']


DIS_INFO_XML = """<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><DISInfoResponse xmlns="http://tempuri.org/"><DISInfoResult><Items><a:DISInfo xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Info"><DISNumber xmlns="">311</DISNumber><DocumentName xmlns="">invoice.pdf</DocumentName><DocumentTrackingID xmlns="">TRACK-1</DocumentTrackingID><DocumentDescription xmlns="">Commercial invoice</DocumentDescription><DocumentReviewStatus xmlns="">Pending</DocumentReviewStatus><SourceLink xmlns="">/EntityFiles/DIS/311</SourceLink></a:DISInfo></Items><HasNext>false</HasNext></DISInfoResult></DISInfoResponse></soap:Body></soap:Envelope>"""


def test_fetch_dis_info_page_uses_lookup_contract(monkeypatch):
    client = LDSClient(endpoint_url='https://example.test/BrokerService', username='user', password='pass')
    captured = {}

    def fake_request(manager_name, soap_action, body):
        captured['manager_name'] = manager_name
        captured['soap_action'] = soap_action
        captured['body'] = body
        return parse_soap_body(DIS_INFO_XML)

    monkeypatch.setattr(client, '_request_manager_xml', fake_request)

    page = client.fetch_dis_info_page("[DISNumber] = '311'", page_size=25, position=5)

    assert captured['manager_name'] == 'SmsLookupManager'
    assert captured['soap_action'] == 'http://tempuri.org/ISmsLookupManager/DISInfo'
    assert '<DISInfo xmlns="http://tempuri.org/">' in captured['body']
    assert '<Criteria xmlns="">[DISNumber] = &apos;311&apos;</Criteria>' in captured['body']
    assert '<PageSize xmlns="">25</PageSize>' in captured['body']
    assert '<Position xmlns="">5</Position>' in captured['body']
    assert len(page.items) == 1
    assert page.items[0].document_name == 'invoice.pdf'
    assert page.items[0].document_description == 'Commercial invoice'
    assert page.items[0].source_link == '/EntityFiles/DIS/311'
    assert page.has_more is False


def test_fetch_entity_file_uses_service_contract(monkeypatch):
    client = LDSClient(endpoint_url='https://example.test/BrokerService', username='user', password='pass')
    captured = {}

    class FakeResponse:
        status_code = 200
        headers = {'Content-Type': 'text/xml; charset=utf-8'}
        content = b'<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetEntityFileResponse xmlns="http://tempuri.org/"><GetEntityFileResult>aGVsbG8=</GetEntityFileResult></GetEntityFileResponse></soap:Body></soap:Envelope>'

    def fake_request(manager_name, soap_action, body):
        captured['manager_name'] = manager_name
        captured['soap_action'] = soap_action
        captured['body'] = body
        return FakeResponse()

    monkeypatch.setattr(client, '_request_manager_response', fake_request)

    payload = client.fetch_entity_file('/EntityFiles/DIS/311', 'invoice.pdf')

    assert payload == b'hello'
    assert captured['manager_name'] == 'SmsServiceManager'
    assert captured['soap_action'] == 'http://tempuri.org/ISmsServiceManager/GetEntityFile'
    assert '<link>/EntityFiles/DIS/311</link>' in captured['body']
    assert '<fileName>invoice.pdf</fileName>' in captured['body']


def test_parse_soap_binary_response_supports_mtom_xop_attachment():
    content_type = 'multipart/related; boundary="uuid:test-boundary"; type="application/xop+xml"; start="<rootpart>"; start-info="text/xml"'
    xml_part = (
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" '
        'xmlns:xop="http://www.w3.org/2004/08/xop/include">'
        '<soap:Body><GetEntityFileResponse xmlns="http://tempuri.org/">'
        '<GetEntityFileResult><xop:Include href="cid:filepart"/></GetEntityFileResult>'
        '</GetEntityFileResponse></soap:Body></soap:Envelope>'
    ).encode('utf-8')
    binary_part = b'PDF-BYTES'
    multipart = (
        b'--uuid:test-boundary\r\n'
        b'Content-Type: application/xop+xml; charset=UTF-8; type="text/xml"\r\n'
        b'Content-Transfer-Encoding: 8bit\r\n'
        b'Content-ID: <rootpart>\r\n\r\n' + xml_part +
        b'\r\n--uuid:test-boundary\r\n'
        b'Content-Type: application/octet-stream\r\n'
        b'Content-Transfer-Encoding: binary\r\n'
        b'Content-ID: <filepart>\r\n\r\n' + binary_part +
        b'\r\n--uuid:test-boundary--\r\n'
    )

    payload = parse_soap_binary_response(200, content_type, multipart)

    assert payload == binary_part

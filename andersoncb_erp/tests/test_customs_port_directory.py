from andersoncb_erp.services.customs_port_directory import extract_customs_ports_from_entry_xml, parse_customs_port_xml


def test_parse_customs_port_xml_extracts_readable_directory_fields():
    xml = """
    <CustomsPort>
        <Id>6</Id>
        <Code>4601</Code>
        <Name>NEW YORK/NEWARK AREA, NEWARK, NEW JERSEY</Name>
        <City>NEWARK</City>
        <State>NJ</State>
        <Region>1</Region>
        <AirportIATACode>EWR</AirportIATACode>
        <PortOfUnlading>true</PortOfUnlading>
    </CustomsPort>
    """

    result = parse_customs_port_xml(xml)

    assert result["code"] == "4601"
    assert result["port_name"] == "NEW YORK/NEWARK AREA, NEWARK, NEW JERSEY"
    assert result["city"] == "NEWARK"
    assert result["state"] == "NJ"
    assert result["region"] == "1"
    assert result["airport_iata_code"] == "EWR"
    assert result["port_of_unlading"] == 1
    assert result["lds_id"] == "6"
    assert result["raw_payload_xml"].strip().startswith("<CustomsPort>")


def test_extract_customs_ports_from_entry_xml_reads_embedded_namespaced_ports():
    xml = """
    <ns0:CustomsEntry xmlns:ns0="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents">
        <ns0:PortOfEntry>
            <Id>850</Id>
            <Code>2704</Code>
            <Name>LOS ANGELES CA</Name>
            <a:City xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Directories">LONG BEACH</a:City>
            <a:State xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Directories">CA</a:State>
            <a:Region xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Directories">7</a:Region>
            <a:PortOfUnlading xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Directories">true</a:PortOfUnlading>
        </ns0:PortOfEntry>
        <ns0:PortOfUnlading>
            <Id>851</Id>
            <Code>4601</Code>
            <Name>NEW YORK/NEWARK AREA</Name>
            <a:City xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Directories">NEWARK</a:City>
            <a:State xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Directories">NJ</a:State>
            <a:Region xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Directories">1</a:Region>
            <a:PortOfUnlading xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Directories">true</a:PortOfUnlading>
        </ns0:PortOfUnlading>
    </ns0:CustomsEntry>
    """

    result = extract_customs_ports_from_entry_xml(xml)

    assert [row["code"] for row in result] == ["2704", "4601"]
    assert result[0]["port_name"] == "LOS ANGELES CA"
    assert result[0]["city"] == "LONG BEACH"
    assert result[1]["port_name"] == "NEW YORK/NEWARK AREA"
    assert result[1]["state"] == "NJ"
    assert result[1]["port_of_unlading"] == 1

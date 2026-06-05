from andersoncb_erp.services.mapping import parse_entry_xml


LDS_STYLE_ENTRY_XML = """<GetResult xmlns:a="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents" xmlns:b="http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Directories" xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/" z:Id="i1">  <Id xmlns="">1</Id>  <Creator_Id xmlns="">17</Creator_Id>  <EntryFilerCode xmlns="">SY1</EntryFilerCode>  <EntryNumber xmlns="">123-4567890-1</EntryNumber>  <Date xmlns="">2026-06-01T00:00:00</Date>  <EstimatedEntryDate xmlns="">2026-06-03T00:00:00</EstimatedEntryDate>  <PreliminaryStatementPrintDate xmlns="">2026-06-02T00:00:00</PreliminaryStatementPrintDate>  <a:DateOfArrival>2026-06-03T00:00:00</a:DateOfArrival>  <a:EntryType>01</a:EntryType>  <a:Status>Released</a:Status>  <a:PostSummaryCorrection>true</a:PostSummaryCorrection>  <a:DateOfRelease>2026-06-04T00:00:00</a:DateOfRelease>  <a:LiquidationDate>2026-12-01T00:00:00</a:LiquidationDate>  <a:TransportationMode>11</a:TransportationMode>  <a:ConveyanceName>Vessel Name</a:ConveyanceName>  <a:TripIdentifier>VY123</a:TripIdentifier>  <a:PaymentType>ACH</a:PaymentType>  <a:BondType>9</a:BondType>  <a:PortOfEntry z:Id="i2"><Code xmlns="">2704</Code><Name xmlns="">Port Newark</Name></a:PortOfEntry>  <a:PortOfUnlading z:Id="i13"><Code xmlns="">2713</Code><Name xmlns="">Elizabeth</Name></a:PortOfUnlading>  <a:Importer z:Id="i3"><Id xmlns="">493</Id><Code xmlns="">IMP-1</Code><Name xmlns="">Importer Co</Name><b:CBPNumber>12-3456789</b:CBPNumber></a:Importer>  <a:Consignee z:Id="i4"><Name xmlns="">Consignee Co</Name></a:Consignee>  <a:BrokerReferenceNumber>REF-1</a:BrokerReferenceNumber>  <a:BondNumber>BOND-1</a:BondNumber>  <a:SuretyCode>999</a:SuretyCode>  <a:Shipments>    <a:Shipment z:Id="i5">      <Number xmlns="">7</Number>      <a:ClientRef>CLIENT-123</a:ClientRef>      <a:TransportationMode>11</a:TransportationMode>      <a:DateOfImport>2026-06-03T00:00:00</a:DateOfImport>      <a:HouseBillNumber>HB-1</a:HouseBillNumber>      <a:PortOfEntry z:Ref="i2"/>      <a:Carrier><Id xmlns="">1488</Id><Code xmlns="">CAR-1</Code><Name xmlns="">Carrier Co</Name></a:Carrier>      <a:BookingLoads><a:ShipmentLoad z:Id="i7"><Name xmlns="">VY123</Name></a:ShipmentLoad></a:BookingLoads>      <a:Invoices>        <a:ShipmentInvoice z:Id="i8">          <Line xmlns="">1</Line>          <InvoiceValueCurrency xmlns="">USD</InvoiceValueCurrency>          <InvoiceValue xmlns="">99.25</InvoiceValue>          <a:Articles>            <a:ShipmentArticle z:Id="i9">              <a:CountryOfOrigin>JP</a:CountryOfOrigin>              <a:Tariffs>                <a:ShipmentArticleTariff z:Id="i10">                  <Line xmlns="">1</Line>                  <a:HarmonizedTariff z:Id="i11">                    <Code xmlns="">1234.56.78</Code>                    <Name xmlns="">Sample HTS</Name>                    <b:Unit1>NO</b:Unit1>                    <b:NumberOfReportingUnits>1</b:NumberOfReportingUnits>                  </a:HarmonizedTariff>                  <a:TariffValue>45.00</a:TariffValue>                  <a:UnitOfMeasure1>NO</a:UnitOfMeasure1>                </a:ShipmentArticleTariff>              </a:Tariffs>            </a:ShipmentArticle>          </a:Articles>        </a:ShipmentInvoice>      </a:Invoices>    </a:Shipment>  </a:Shipments>  <a:StatementDailyEntries><a:StatementDailyEntry z:Id="i12"><Name xmlns="">MPF</Name><TotalAmountDue xmlns="">34.64</TotalAmountDue><Currency xmlns="">USD</Currency></a:StatementDailyEntry></a:StatementDailyEntries></GetResult>"""


def test_parse_entry_xml_maps_lds_datacontract_shape_and_ref_nodes():
    result = parse_entry_xml(LDS_STYLE_ENTRY_XML)

    assert result['lds_id'] == '1'
    assert result['filer_code'] == 'SY1'
    assert result['entry_number'] == '123-4567890-1'
    assert result['entry_type'] == '01'
    assert result['status'] == 'Released'
    assert result['psc_flag'] is True
    assert result['psc_accelerated_liquidation_flag'] is False
    assert result['entry_date'] == '2026-06-01'
    assert result['estimated_entry_date'] == '2026-06-03'
    assert result['filing_date'] is None
    assert result['preliminary_statement_print_date'] == '2026-06-02'
    assert result['release_date'] == '2026-06-04'
    assert result['liquidation_date'] == '2026-12-01'
    assert result['arrival_date'] == '2026-06-03'
    assert result['port_of_entry'] == '2704'
    assert result['port_of_unlading'] == '2713'
    assert result['transport_mode'] == '11'
    assert result['conveyance_name'] == 'Vessel Name'
    assert result['trip_identifier'] == 'VY123'
    assert result['payment_type'] == 'ACH'
    assert result['importer_name'] == 'Importer Co'
    assert result['importer_lds_id'] == '493'
    assert result['client_ref'] == 'CLIENT-123'
    assert result['created_by'] == '17'
    assert result['creator_lds_id'] == '17'
    assert result['importer_number'] == 'IMP-1'
    assert result['consignee_name'] == 'Consignee Co'
    assert result['broker_reference'] == 'REF-1'
    assert result['bond_number'] == 'BOND-1'
    assert result['bond_type'] == '9'
    assert result['surety_code'] == '999'
    assert result['house_bill'] == 'HB-1'
    assert result['total_entered_value'] == 99.25
    assert result['currency'] == 'USD'
    assert result['importer_profile_data']['display_name'] == 'Importer Co'
    assert result['importer_profile_data']['importer_code'] == 'IMP-1'
    assert result['shipments'][0]['shipment_no'] == '7'
    assert result['shipments'][0]['destination'] == '2713'
    assert result['shipments'][0]['port_of_entry'] == '2704'
    assert result['shipments'][0]['port_of_unlading'] == '2713'
    assert result['shipments'][0]['arrival_date'] is None
    assert result['shipments'][0]['date_of_arrival'] is None
    assert result['shipments'][0]['date_of_import'] == '2026-06-03'
    assert result['shipments'][0]['voyage_or_flight'] == 'VY123'
    assert result['shipments'][0]['carrier'] == 'Carrier Co'
    assert result['shipments'][0]['carrier_data']['carrier_code'] == 'CAR-1'
    assert result['invoices'][0]['invoice_amount'] == 99.25
    assert result['fees'][0]['fee_type'] == 'MPF'
    assert result['fees'][0]['amount'] == 34.64
    assert result['tariff_lines'][0]['hs_code'] == '1234.56.78'
    assert result['tariff_lines'][0]['country_of_origin'] == 'JP'
    assert result['raw_payload_xml'].startswith('<GetResult')

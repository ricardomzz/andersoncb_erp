import { test, expect } from '@playwright/test';
import {
  createAndSubmitEntry,
  ensureCarrier,
  ensureImporter,
  loadExecutionPrep,
  login,
  EntryScenario,
} from './customs-entry-runner';

test.describe.configure({ mode: 'serial' });

const importerRegistry = new Map<string, string>();
const carrierRegistry = new Map<string, string>();

type CarrierScenario = Record<string, any> & { carrier_ref: string };
type ShipmentScenario = Record<string, any> & { shipment_ref: string; carrier_ref: string };
type InvoiceScenario = Record<string, any> & { invoice_ref: string; shipment_ref: string };
type ArticleScenario = Record<string, any> & { invoice_ref: string; shipment_ref: string };
type TariffScenario = Record<string, any> & { invoice_ref: string; shipment_ref: string };
type EntryCase = {
  id: string;
  title: string;
  importer: Record<string, any>;
  carriers: CarrierScenario[];
  entry: Record<string, any>;
  shipmentRows: ShipmentScenario[];
  invoiceRows: InvoiceScenario[];
  articleRows: ArticleScenario[];
  tariffRows: TariffScenario[];
};

function buildEntryScenario(scenario: EntryCase, runId: string): EntryScenario {
  const clientRef = `UI-${scenario.id}-${runId}`;
  const bondNumber = `B${scenario.id}${runId}`.slice(0, 9);
  const houseBill = `HB${scenario.id}${runId}`;
  const masterBill = `MB${scenario.id}${runId}`;
  return {
    caseId: scenario.id,
    focus: scenario.title,
    importerKey: scenario.id,
    importerDisplayName: scenario.importer.display_name,
    importerCode: `${scenario.id.replace(/[^A-Z0-9]/g, '').slice(0, 3)}${runId.slice(-4)}`.slice(0, 8),
    carrierKey: scenario.carriers[0]?.carrier_ref || scenario.id,
    carrierDisplayName: scenario.carriers[0]?.display_name || scenario.id,
    carrierCode: scenario.carriers[0]?.carrier_code || scenario.id,
    entryType: scenario.entry.entry_type,
    transportMode: scenario.entry.transport_mode,
    paymentType: scenario.entry.payment_type,
    bondType: scenario.entry.bond_type,
    portOfEntrySymbol: scenario.entry.port_of_entry,
    portOfUnladingSymbol: scenario.entry.port_of_unlading,
    clientRef,
    conveyanceName: scenario.entry.conveyance_name,
    tripIdentifier: scenario.entry.trip_identifier,
    suretyCode: scenario.entry.surety_code,
    bondNumber,
    houseBill,
    masterBill,
    totalEnteredValue: scenario.entry.total_entered_value,
    currency: scenario.entry.currency,
    shipments: scenario.shipmentRows.map((row) => ({
      shipmentNo: row.shipment_ref,
      mode: row.mode,
      carrierName: row.carrier_ref,
      portOfEntry: row.port_of_entry,
      portOfUnlading: row.port_of_unlading,
      dateOfArrival: row.date_of_arrival,
      dateOfImport: row.date_of_import,
      dateOfExport: row.date_of_export,
      voyageOrFlight: row.voyage_or_flight,
      masterBill,
    })),
    invoices: scenario.invoiceRows.map((row) => ({
      invoiceNumber: row.invoice_ref,
      shipmentNo: row.shipment_ref,
      invoiceDate: row.invoice_date,
      currency: row.currency,
      invoiceAmount: row.invoice_amount,
      vendorName: row.vendor_name,
    })),
    articles: scenario.articleRows.map((row) => ({
      articleLineNo: row.article_line_no,
      description: row.description,
      invoiceNumber: row.invoice_ref,
      shipmentNo: row.shipment_ref,
      lineItemIdentifier: row.line_item_identifier,
      countryOfOrigin: row.country_of_origin,
      countryOfExport: row.country_of_export,
      grossWeight: row.gross_weight,
      enteredValue: row.entered_value,
      harborMaintenanceFee: row.harbor_maintenance_fee,
      merchandiseProcessingFee: row.merchandise_processing_fee,
    })),
    tariffs: scenario.tariffRows.map((row) => ({
      lineNo: row.line_no,
      articleLineNo: row.article_line_no,
      shipmentNo: row.shipment_ref,
      invoiceNumber: row.invoice_ref,
      hsCode: row.hs_code,
      quantity: row.quantity,
      uom: row.uom,
      enteredValue: row.entered_value,
      countryOfOrigin: row.country_of_origin,
    })),
  };
}

async function runEntryCase(page, scenario: EntryCase) {
  const runId = String(Date.now()).slice(-6);
  await login(page);
  const prep = await loadExecutionPrep(page);

  const entryScenario = buildEntryScenario(scenario, runId);
  const importerName = await ensureImporter(page, importerRegistry, entryScenario.importerCode, {
    ...scenario.importer,
    display_name: `${scenario.importer.display_name} ${runId}`,
    importer_code: entryScenario.importerCode,
    email: `${scenario.id.toLowerCase()}+${runId}@example.com`,
  });

  const carrierNamesByRef = new Map<string, string>();
  for (const carrier of scenario.carriers) {
    const carrierCodeSeed = (carrier.carrier_code || carrier.carrier_ref).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const carrierCode = `${carrierCodeSeed.slice(0, 2)}${runId.slice(-2)}${carrier.carrier_ref.slice(-1)}`.slice(0, 4);
    const registryKey = `${scenario.id}:${carrier.carrier_ref}:${carrierCode}`;
    const carrierName = await ensureCarrier(page, carrierRegistry, registryKey, {
      ...carrier,
      display_name: `${carrier.display_name} ${runId}`,
      carrier_code: carrierCode,
    });
    carrierNamesByRef.set(carrier.carrier_ref, carrierName);
  }

  const result = await createAndSubmitEntry(page, entryScenario, importerName, carrierNamesByRef, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
}

const CASES: EntryCase[] = [
  {
    id: 'G11',
    title: 'air shipment with short description lines',
    importer: { display_name: 'Importer Generic 11', contact_name: 'Ops User', phone: '5551011', address_line1: '1011 Rapid Air Ct', city: 'San Francisco', state: 'CA', postal_code: '94128', country: 'US' },
    carriers: [{ carrier_ref: 'A', display_name: 'Carrier Air G11', carrier_code: 'GA1', carrier_type: 'Air', airway_bill_prefix: '001' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2801', port_of_unlading: '2801', transport_mode: '40', conveyance_name: 'AIR G11', trip_identifier: 'ARG11', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 3000, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'A', mode: '40', port_of_entry: '2801', port_of_unlading: '2801', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AR-G11' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 3000, vendor_name: 'Vendor G11A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Short lot A', line_item_identifier: 'A11', country_of_origin: 'JP', country_of_export: 'JP', gross_weight: 10, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.9 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Short lot B', line_item_identifier: 'B11', country_of_origin: 'KR', country_of_export: 'KR', gross_weight: 11, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.9 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '3', description: 'Short lot C', line_item_identifier: 'C11', country_of_origin: 'TW', country_of_export: 'TW', gross_weight: 12, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.9 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'JP' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'KR' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '3', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'TW' },
    ],
  },
  {
    id: 'G12',
    title: 'entry with five invoices and one shipment',
    importer: { display_name: 'Importer Generic 12', contact_name: 'Ops User', phone: '5551012', address_line1: '1012 Invoice Stack Rd', city: 'Newark', state: 'NJ', postal_code: '07114', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean G12', carrier_code: 'GO2' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '4601', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'INV5 G12', trip_identifier: 'OCG12', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 10000, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', mode: '11', port_of_entry: '4601', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-G12' }],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2000, vendor_name: 'Vendor G12A' },
      { invoice_ref: 'B', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2000, vendor_name: 'Vendor G12B' },
      { invoice_ref: 'C', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2000, vendor_name: 'Vendor G12C' },
      { invoice_ref: 'D', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2000, vendor_name: 'Vendor G12D' },
      { invoice_ref: 'E', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2000, vendor_name: 'Vendor G12E' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Inv5 lot one', line_item_identifier: 'A12', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 15, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Inv5 lot two', line_item_identifier: 'B12', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 16, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '3', description: 'Inv5 lot three', line_item_identifier: 'C12', country_of_origin: 'ID', country_of_export: 'ID', gross_weight: 17, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '4', description: 'Inv5 lot four', line_item_identifier: 'D12', country_of_origin: 'KH', country_of_export: 'KH', gross_weight: 18, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'C', article_line_no: '5', description: 'Inv5 lot five', line_item_identifier: 'E12', country_of_origin: 'BD', country_of_export: 'BD', gross_weight: 19, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'C', article_line_no: '6', description: 'Inv5 lot six', line_item_identifier: 'F12', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 20, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'D', article_line_no: '7', description: 'Inv5 lot seven', line_item_identifier: 'G12', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 21, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'D', article_line_no: '8', description: 'Inv5 lot eight', line_item_identifier: 'H12', country_of_origin: 'ID', country_of_export: 'ID', gross_weight: 22, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'E', article_line_no: '9', description: 'Inv5 lot nine', line_item_identifier: 'I12', country_of_origin: 'KH', country_of_export: 'KH', gross_weight: 23, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'E', article_line_no: '10', description: 'Inv5 lot ten', line_item_identifier: 'J12', country_of_origin: 'BD', country_of_export: 'BD', gross_weight: 24, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '9403409060', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '3', article_line_no: '3', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'ID' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '4', article_line_no: '4', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'KH' },
      { shipment_ref: 'S1', invoice_ref: 'C', line_no: '5', article_line_no: '5', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'BD' },
      { shipment_ref: 'S1', invoice_ref: 'C', line_no: '6', article_line_no: '6', hs_code: '9403409060', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'D', line_no: '7', article_line_no: '7', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'D', line_no: '8', article_line_no: '8', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'ID' },
      { shipment_ref: 'S1', invoice_ref: 'E', line_no: '9', article_line_no: '9', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'KH' },
      { shipment_ref: 'S1', invoice_ref: 'E', line_no: '10', article_line_no: '10', hs_code: '99030125', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'BD' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '11', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '12', article_line_no: '4', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'KH' },
    ],
  },
  {
    id: 'G13',
    title: 'entry with three shipments and two carriers',
    importer: { display_name: 'Importer Generic 13', contact_name: 'Ops User', phone: '5551013', address_line1: '1013 Split Routing Rd', city: 'Long Beach', state: 'CA', postal_code: '90802', country: 'US' },
    carriers: [
      { carrier_ref: 'O', display_name: 'Carrier Ocean G13', carrier_code: 'GO3' },
      { carrier_ref: 'T', display_name: 'Carrier Truck G13', carrier_code: 'GT3' },
      { carrier_ref: 'A', display_name: 'Carrier Air G13', carrier_code: 'GA3', carrier_type: 'Air', airway_bill_prefix: '001' },
    ],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2704', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'SPLIT G13', trip_identifier: 'MIX13', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 6000, currency: 'USD' },
    shipmentRows: [
      { shipment_ref: 'S1', carrier_ref: 'O', mode: '11', port_of_entry: '2704', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-G13' },
      { shipment_ref: 'S2', carrier_ref: 'T', mode: '30', port_of_entry: '0712', port_of_unlading: '0712', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-G13' },
      { shipment_ref: 'S3', carrier_ref: 'A', mode: '40', port_of_entry: '2801', port_of_unlading: '1108', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AR-G13' },
    ],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2000, vendor_name: 'Vendor G13A' },
      { invoice_ref: 'B', shipment_ref: 'S2', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2000, vendor_name: 'Vendor G13B' },
      { invoice_ref: 'C', shipment_ref: 'S3', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2000, vendor_name: 'Vendor G13C' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Split route lot one', line_item_identifier: 'A13', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 18, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Split route lot two', line_item_identifier: 'B13', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 19, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S2', invoice_ref: 'B', article_line_no: '3', description: 'Split route lot three', line_item_identifier: 'C13', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 20, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S2', invoice_ref: 'B', article_line_no: '4', description: 'Split route lot four', line_item_identifier: 'D13', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 21, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S3', invoice_ref: 'C', article_line_no: '5', description: 'Split route lot five', line_item_identifier: 'E13', country_of_origin: 'JP', country_of_export: 'JP', gross_weight: 22, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S3', invoice_ref: 'C', article_line_no: '6', description: 'Split route lot six', line_item_identifier: 'F13', country_of_origin: 'KR', country_of_export: 'KR', gross_weight: 23, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '9403409060', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S2', invoice_ref: 'B', line_no: '3', article_line_no: '3', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1000, country_of_origin: 'CA' },
      { shipment_ref: 'S2', invoice_ref: 'B', line_no: '4', article_line_no: '4', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CA' },
      { shipment_ref: 'S3', invoice_ref: 'C', line_no: '5', article_line_no: '5', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'JP' },
      { shipment_ref: 'S3', invoice_ref: 'C', line_no: '6', article_line_no: '6', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'KR' },
      { shipment_ref: 'S3', invoice_ref: 'C', line_no: '7', article_line_no: '6', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'KR' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '8', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
    ],
  },
  {
    id: 'G14',
    title: 'high article count with repeated HTS',
    importer: { display_name: 'Importer Generic 14', contact_name: 'Ops User', phone: '5551014', address_line1: '1014 Repeat HTS Blvd', city: 'Long Beach', state: 'CA', postal_code: '90802', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean G14', carrier_code: 'GO4' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2704', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'REPEAT G14', trip_identifier: 'OCG14', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 14000, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', mode: '11', port_of_entry: '2704', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-G14' }],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 7000, vendor_name: 'Vendor G14A' },
      { invoice_ref: 'B', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 7000, vendor_name: 'Vendor G14B' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Repeat HTS lot 1', line_item_identifier: 'A14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 10, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Repeat HTS lot 2', line_item_identifier: 'B14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 11, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '3', description: 'Repeat HTS lot 3', line_item_identifier: 'C14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 12, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '4', description: 'Repeat HTS lot 4', line_item_identifier: 'D14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 13, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '5', description: 'Repeat HTS lot 5', line_item_identifier: 'E14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 14, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '6', description: 'Repeat HTS lot 6', line_item_identifier: 'F14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 15, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '7', description: 'Repeat HTS lot 7', line_item_identifier: 'G14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 16, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '8', description: 'Repeat HTS lot 8', line_item_identifier: 'H14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 17, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '9', description: 'Repeat HTS lot 9', line_item_identifier: 'I14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 18, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '10', description: 'Repeat HTS lot 10', line_item_identifier: 'J14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 19, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '11', description: 'Repeat HTS lot 11', line_item_identifier: 'K14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 20, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '12', description: 'Repeat HTS lot 12', line_item_identifier: 'L14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 21, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '13', description: 'Repeat HTS lot 13', line_item_identifier: 'M14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 22, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '14', description: 'Repeat HTS lot 14', line_item_identifier: 'N14', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 23, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '3', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '4', article_line_no: '4', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '5', article_line_no: '5', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '6', article_line_no: '6', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '7', article_line_no: '7', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '8', article_line_no: '8', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '9', article_line_no: '9', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '10', article_line_no: '10', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '11', article_line_no: '11', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '12', article_line_no: '12', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '13', article_line_no: '13', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '14', article_line_no: '14', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
    ],
  },
  {
    id: 'G15',
    title: 'one article with many tariff overlays',
    importer: { display_name: 'Importer Generic 15', contact_name: 'Ops User', phone: '5551015', address_line1: '1015 Overlay Air Ln', city: 'Philadelphia', state: 'PA', postal_code: '19153', country: 'US' },
    carriers: [{ carrier_ref: 'A', display_name: 'Carrier Air G15', carrier_code: 'GA5', carrier_type: 'Air', airway_bill_prefix: '001' }],
    entry: { filer_code: 'SY1', entry_type: '03', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '1108', port_of_unlading: '1108', transport_mode: '40', conveyance_name: 'OVERLAY G15', trip_identifier: 'ARG15', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 2600, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'A', mode: '40', port_of_entry: '1108', port_of_unlading: '1108', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AR-G15' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2600, vendor_name: 'Vendor G15A' }],
    articleRows: [{ shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Overlay-heavy air lot', line_item_identifier: 'A15', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 14, entered_value: 2600, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.6 }],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '8703230190', quantity: 1, uom: 'NO', entered_value: 2600, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '1', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 2600, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '1', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 2600, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '4', article_line_no: '1', hs_code: '99030125', quantity: 1, uom: 'NO', entered_value: 2600, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '5', article_line_no: '1', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 2600, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '6', article_line_no: '1', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 2600, country_of_origin: 'CN' },
    ],
  },
];

for (const scenario of CASES) {
  test(`${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}

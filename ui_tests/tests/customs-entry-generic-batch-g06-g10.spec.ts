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
    id: 'G06',
    title: 'hazard-adjacent chemical goods surrogate',
    importer: { display_name: 'Importer Generic 06', contact_name: 'Ops User', phone: '5551006', address_line1: '1006 Specialty Chem Rd', city: 'Champlain', state: 'NY', postal_code: '12919', country: 'US' },
    carriers: [{ carrier_ref: 'T', display_name: 'Carrier Truck G06', carrier_code: 'GT6' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '0712', port_of_unlading: '0712', transport_mode: '30', conveyance_name: 'CHEM G06', trip_identifier: 'TRG06', payment_type: '2', bond_type: '9', surety_code: '036', total_entered_value: 2400, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'T', mode: '30', port_of_entry: '0712', port_of_unlading: '0712', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-G06' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2400, vendor_name: 'Vendor G06A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic specialty material lot one', line_item_identifier: 'A61', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 26, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.4 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Synthetic specialty material lot two', line_item_identifier: 'A62', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 27, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.4 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CA' },
    ],
  },
  {
    id: 'G07',
    title: 'warehouse entry with later release planning surrogate',
    importer: { display_name: 'Importer Generic 07', contact_name: 'Ops User', phone: '5551007', address_line1: '1007 Warehouse Way', city: 'Newark', state: 'NJ', postal_code: '07114', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean G07', carrier_code: 'GO7' }],
    entry: { filer_code: 'SY1', entry_type: '21', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '4601', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'WH G07', trip_identifier: 'OCG07', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 3600, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', mode: '11', port_of_entry: '4601', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-G07' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 3600, vendor_name: 'Vendor G07A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic warehouse durable lot one', line_item_identifier: 'A71', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 22, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.2 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Synthetic warehouse durable lot two', line_item_identifier: 'A72', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 23, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.2 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '3', description: 'Synthetic warehouse durable lot three', line_item_identifier: 'A73', country_of_origin: 'ID', country_of_export: 'ID', gross_weight: 24, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.2 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '9403409060', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '3', hs_code: '4404200080', quantity: 1, uom: 'KG', entered_value: 1200, country_of_origin: 'ID' },
    ],
  },
  {
    id: 'G08',
    title: 'multi-buyer consolidated ocean shipment surrogate',
    importer: { display_name: 'Importer Generic 08', contact_name: 'Ops User', phone: '5551008', address_line1: '1008 Consolidation Ave', city: 'Long Beach', state: 'CA', postal_code: '90802', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean G08', carrier_code: 'GO8' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2704', port_of_unlading: '1303', transport_mode: '11', conveyance_name: 'CONSOL G08', trip_identifier: 'OCG08', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 8000, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', mode: '11', port_of_entry: '2704', port_of_unlading: '1303', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-G08' }],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2000, vendor_name: 'Vendor G08A' },
      { invoice_ref: 'B', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2000, vendor_name: 'Vendor G08B' },
      { invoice_ref: 'C', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2000, vendor_name: 'Vendor G08C' },
      { invoice_ref: 'D', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2000, vendor_name: 'Vendor G08D' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic consolidated lot one', line_item_identifier: 'A81', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 18, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Synthetic consolidated lot two', line_item_identifier: 'A82', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 19, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '3', description: 'Synthetic consolidated lot three', line_item_identifier: 'B83', country_of_origin: 'ID', country_of_export: 'ID', gross_weight: 20, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '4', description: 'Synthetic consolidated lot four', line_item_identifier: 'B84', country_of_origin: 'KH', country_of_export: 'KH', gross_weight: 21, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'C', article_line_no: '5', description: 'Synthetic consolidated lot five', line_item_identifier: 'C85', country_of_origin: 'BD', country_of_export: 'BD', gross_weight: 22, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'C', article_line_no: '6', description: 'Synthetic consolidated lot six', line_item_identifier: 'C86', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 23, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'D', article_line_no: '7', description: 'Synthetic consolidated lot seven', line_item_identifier: 'D87', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 24, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'D', article_line_no: '8', description: 'Synthetic consolidated lot eight', line_item_identifier: 'D88', country_of_origin: 'ID', country_of_export: 'ID', gross_weight: 25, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
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
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '9', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '10', article_line_no: '4', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'KH' },
    ],
  },
  {
    id: 'G09',
    title: 'rail move with split invoices by vendor',
    importer: { display_name: 'Importer Generic 09', contact_name: 'Ops User', phone: '5551009', address_line1: '1009 Inland Rail Pkwy', city: 'Rosemont', state: 'IL', postal_code: '60018', country: 'US' },
    carriers: [{ carrier_ref: 'R', display_name: 'Carrier Rail G09', carrier_code: 'GR9' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '3901', port_of_unlading: '4601', transport_mode: '21', conveyance_name: 'RAIL G09', trip_identifier: 'RLG09', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 5000, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'R', mode: '21', port_of_entry: '3901', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'RL-G09' }],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1700, vendor_name: 'Vendor G09A' },
      { invoice_ref: 'B', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1600, vendor_name: 'Vendor G09B' },
      { invoice_ref: 'C', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1700, vendor_name: 'Vendor G09C' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic rail vendor lot one', line_item_identifier: 'A91', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 20, entered_value: 850, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.7 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Synthetic rail vendor lot two', line_item_identifier: 'A92', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 21, entered_value: 850, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.7 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '3', description: 'Synthetic rail vendor lot three', line_item_identifier: 'B93', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 22, entered_value: 800, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.6 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '4', description: 'Synthetic rail vendor lot four', line_item_identifier: 'B94', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 23, entered_value: 800, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.6 },
      { shipment_ref: 'S1', invoice_ref: 'C', article_line_no: '5', description: 'Synthetic rail vendor lot five', line_item_identifier: 'C95', country_of_origin: 'US', country_of_export: 'CA', gross_weight: 24, entered_value: 1700, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.9 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 850, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '9403409060', quantity: 1, uom: 'NO', entered_value: 850, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '3', article_line_no: '3', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 800, country_of_origin: 'MX' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '4', article_line_no: '4', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 800, country_of_origin: 'MX' },
      { shipment_ref: 'S1', invoice_ref: 'C', line_no: '5', article_line_no: '5', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1700, country_of_origin: 'US' },
      { shipment_ref: 'S1', invoice_ref: 'C', line_no: '6', article_line_no: '5', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1700, country_of_origin: 'US' },
    ],
  },
  {
    id: 'G10',
    title: 'border truck shipment with same-day draft creation',
    importer: { display_name: 'Importer Generic 10', contact_name: 'Ops User', phone: '5551010', address_line1: '1010 Same Day Route', city: 'Champlain', state: 'NY', postal_code: '12919', country: 'US' },
    carriers: [{ carrier_ref: 'T', display_name: 'Carrier Truck G10', carrier_code: 'GT0' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '0712', port_of_unlading: '0712', transport_mode: '30', conveyance_name: 'SAMEDAY G10', trip_identifier: 'TRG10', payment_type: '3', bond_type: '9', surety_code: '036', total_entered_value: 2200, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'T', mode: '30', port_of_entry: '0712', port_of_unlading: '0712', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-05', voyage_or_flight: 'TR-G10' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2200, vendor_name: 'Vendor G10A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic same-day border lot one', line_item_identifier: 'A10', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 16, entered_value: 1100, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Synthetic same-day border lot two', line_item_identifier: 'B10', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 17, entered_value: 1100, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1100, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1100, country_of_origin: 'CA' },
    ],
  },
];

for (const scenario of CASES) {
  test(`${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}

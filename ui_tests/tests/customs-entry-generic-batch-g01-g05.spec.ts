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
    id: 'G01',
    title: 'informal low-value e-commerce parcel',
    importer: { display_name: 'Importer Generic 01', contact_name: 'Ops User', phone: '5551001', address_line1: '1001 Parcel Way', city: 'San Francisco', state: 'CA', postal_code: '94128', country: 'US' },
    carriers: [{ carrier_ref: 'A', display_name: 'Carrier Express Air G01', carrier_code: 'GA1', carrier_type: 'Air', airway_bill_prefix: '001' }],
    entry: { filer_code: 'SY1', entry_type: '11', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2801', port_of_unlading: '2801', transport_mode: '40', conveyance_name: 'PARCEL G01', trip_identifier: 'GX01', payment_type: '3', bond_type: '9', surety_code: '036', total_entered_value: 480, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'A', mode: '40', port_of_entry: '2801', port_of_unlading: '2801', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AX-G01' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 480, vendor_name: 'Vendor G01A' }],
    articleRows: [{ shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic e-commerce parcel lot', line_item_identifier: 'G1A', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 8, entered_value: 480, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.1 }],
    tariffRows: [{ shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 480, country_of_origin: 'CN' }],
  },
  {
    id: 'G02',
    title: 'seasonal apparel assortment surrogate',
    importer: { display_name: 'Importer Generic 02', contact_name: 'Ops User', phone: '5551002', address_line1: '1002 Assortment Blvd', city: 'Long Beach', state: 'CA', postal_code: '90802', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean G02', carrier_code: 'GO2' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2704', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'ASSORT G02', trip_identifier: 'OCG02', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 10000, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', mode: '11', port_of_entry: '2704', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-G02' }],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 5000, vendor_name: 'Vendor G02A' },
      { invoice_ref: 'B', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 5000, vendor_name: 'Vendor G02B' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic assortment lot 1', line_item_identifier: 'A21', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 15, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Synthetic assortment lot 2', line_item_identifier: 'A22', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 16, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '3', description: 'Synthetic assortment lot 3', line_item_identifier: 'A23', country_of_origin: 'ID', country_of_export: 'ID', gross_weight: 17, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '4', description: 'Synthetic assortment lot 4', line_item_identifier: 'A24', country_of_origin: 'KH', country_of_export: 'KH', gross_weight: 18, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '5', description: 'Synthetic assortment lot 5', line_item_identifier: 'A25', country_of_origin: 'BD', country_of_export: 'BD', gross_weight: 19, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '6', description: 'Synthetic assortment lot 6', line_item_identifier: 'B26', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 20, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '7', description: 'Synthetic assortment lot 7', line_item_identifier: 'B27', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 21, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '8', description: 'Synthetic assortment lot 8', line_item_identifier: 'B28', country_of_origin: 'ID', country_of_export: 'ID', gross_weight: 22, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '9', description: 'Synthetic assortment lot 9', line_item_identifier: 'B29', country_of_origin: 'KH', country_of_export: 'KH', gross_weight: 23, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '10', description: 'Synthetic assortment lot 10', line_item_identifier: 'C30', country_of_origin: 'BD', country_of_export: 'BD', gross_weight: 24, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '3', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'ID' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '4', article_line_no: '4', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'KH' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '5', article_line_no: '5', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'BD' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '6', article_line_no: '6', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '7', article_line_no: '7', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '8', article_line_no: '8', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'ID' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '9', article_line_no: '9', hs_code: '99030125', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'KH' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '10', article_line_no: '10', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'BD' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '11', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '12', article_line_no: '4', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'KH' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '13', article_line_no: '7', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '14', article_line_no: '9', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'KH' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '15', article_line_no: '10', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'BD' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '16', article_line_no: '5', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'BD' },
    ],
  },
  {
    id: 'G03',
    title: 'refrigerated food import surrogate',
    importer: { display_name: 'Importer Generic 03', contact_name: 'Ops User', phone: '5551003', address_line1: '1003 Fresh Produce Dr', city: 'Baltimore', state: 'MD', postal_code: '21224', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean G03', carrier_code: 'GO3' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '1303', port_of_unlading: '1303', transport_mode: '11', conveyance_name: 'REEFER G03', trip_identifier: 'OCG03', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 3600, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', mode: '11', port_of_entry: '1303', port_of_unlading: '1303', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-G03' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 3600, vendor_name: 'Vendor G03A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic refrigerated food lot one', line_item_identifier: 'A31', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 40, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.5 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Synthetic refrigerated food lot two', line_item_identifier: 'A32', country_of_origin: 'PE', country_of_export: 'PE', gross_weight: 41, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.5 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '3', description: 'Synthetic refrigerated food lot three', line_item_identifier: 'A33', country_of_origin: 'CL', country_of_export: 'CL', gross_weight: 42, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.5 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1200, country_of_origin: 'MX' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1200, country_of_origin: 'PE' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '3', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1200, country_of_origin: 'CL' },
    ],
  },
  {
    id: 'G04',
    title: 'coffee importer with multiple source countries',
    importer: { display_name: 'Importer Generic 04', contact_name: 'Ops User', phone: '5551004', address_line1: '1004 Coffee Trade St', city: 'Newark', state: 'NJ', postal_code: '07114', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean G04', carrier_code: 'GO4' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '4601', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'COFFEE G04', trip_identifier: 'OCG04', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 4200, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', mode: '11', port_of_entry: '4601', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-G04' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 4200, vendor_name: 'Vendor G04A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic arabica coffee lot one', line_item_identifier: 'A41', country_of_origin: 'BR', country_of_export: 'BR', gross_weight: 28, entered_value: 1050, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.1 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Synthetic arabica coffee lot two', line_item_identifier: 'A42', country_of_origin: 'CO', country_of_export: 'CO', gross_weight: 29, entered_value: 1050, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.1 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '3', description: 'Synthetic arabica coffee lot three', line_item_identifier: 'A43', country_of_origin: 'GT', country_of_export: 'GT', gross_weight: 30, entered_value: 1050, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.1 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '4', description: 'Synthetic arabica coffee lot four', line_item_identifier: 'A44', country_of_origin: 'HN', country_of_export: 'HN', gross_weight: 31, entered_value: 1050, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.1 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '0901110025', quantity: 1, uom: 'KG', entered_value: 1050, country_of_origin: 'BR' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '0901110025', quantity: 1, uom: 'KG', entered_value: 1050, country_of_origin: 'CO' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '3', hs_code: '0901110025', quantity: 1, uom: 'KG', entered_value: 1050, country_of_origin: 'GT' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '4', article_line_no: '4', hs_code: '0901110025', quantity: 1, uom: 'KG', entered_value: 1050, country_of_origin: 'HN' },
    ],
  },
  {
    id: 'G05',
    title: 'automotive parts with many overlays surrogate',
    importer: { display_name: 'Importer Generic 05', contact_name: 'Ops User', phone: '5551005', address_line1: '1005 Auto Parts Pkwy', city: 'Champlain', state: 'NY', postal_code: '12919', country: 'US' },
    carriers: [{ carrier_ref: 'T', display_name: 'Carrier Truck G05', carrier_code: 'GT5' }],
    entry: { filer_code: 'SY1', entry_type: '03', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '0712', port_of_unlading: '0712', transport_mode: '30', conveyance_name: 'AUTO G05', trip_identifier: 'TRG05', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 7200, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'T', mode: '30', port_of_entry: '0712', port_of_unlading: '0712', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-G05' }],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 3600, vendor_name: 'Vendor G05A' },
      { invoice_ref: 'B', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 3600, vendor_name: 'Vendor G05B' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic auto parts lot one', line_item_identifier: 'A51', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 35, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.8 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Synthetic auto parts lot two', line_item_identifier: 'A52', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 36, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.8 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '3', description: 'Synthetic auto parts lot three', line_item_identifier: 'A53', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 37, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.8 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '4', description: 'Synthetic auto parts lot four', line_item_identifier: 'B54', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 38, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.8 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '5', description: 'Synthetic auto parts lot five', line_item_identifier: 'B55', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 39, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.8 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '6', description: 'Synthetic auto parts lot six', line_item_identifier: 'B56', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 40, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.8 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '8703230190', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'MX' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '1', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'MX' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '2', hs_code: '8703230190', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'MX' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '4', article_line_no: '2', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'MX' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '5', article_line_no: '3', hs_code: '8703230190', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'MX' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '6', article_line_no: '3', hs_code: '99030125', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'MX' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '7', article_line_no: '3', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'MX' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '8', article_line_no: '4', hs_code: '8703230190', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '9', article_line_no: '4', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '10', article_line_no: '5', hs_code: '8703230190', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '11', article_line_no: '5', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '12', article_line_no: '6', hs_code: '8703230190', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '13', article_line_no: '6', hs_code: '99030125', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '14', article_line_no: '6', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CA' },
    ],
  },
];

for (const scenario of CASES) {
  test(`${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}

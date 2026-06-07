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
    id: 'G16',
    title: 'new broker onboarding scenario',
    importer: { display_name: 'Importer Generic 16', contact_name: 'Ops User', phone: '5551016', address_line1: '1016 Onboarding Way', city: 'Salt Lake City', state: 'UT', postal_code: '84116', country: 'US' },
    carriers: [{ carrier_ref: 'T', display_name: 'Carrier Truck G16', carrier_code: 'GT6' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '3303', port_of_unlading: '3303', transport_mode: '30', conveyance_name: 'GREENFIELD G16', trip_identifier: 'TRG16', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 1800, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'T', mode: '30', port_of_entry: '3303', port_of_unlading: '3303', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-G16' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1800, vendor_name: 'Vendor G16A' }],
    articleRows: [{ shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Greenfield onboarding lot', line_item_identifier: 'A16', country_of_origin: 'US', country_of_export: 'CA', gross_weight: 18, entered_value: 1800, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.8 }],
    tariffRows: [{ shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '8907100000', quantity: 1, uom: 'NO', entered_value: 1800, country_of_origin: 'US' }],
  },
  {
    id: 'G17',
    title: 'same importer across sea rail truck in one batch',
    importer: { display_name: 'Importer Generic 17', contact_name: 'Ops User', phone: '5551017', address_line1: '1017 Cross Mode Blvd', city: 'Newark', state: 'NJ', postal_code: '07114', country: 'US' },
    carriers: [
      { carrier_ref: 'O', display_name: 'Carrier Ocean G17', carrier_code: 'GO7' },
      { carrier_ref: 'R', display_name: 'Carrier Rail G17', carrier_code: 'GR7' },
      { carrier_ref: 'T', display_name: 'Carrier Truck G17', carrier_code: 'GT7' },
    ],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '4601', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'XMODE G17', trip_identifier: 'XM17', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 5400, currency: 'USD' },
    shipmentRows: [
      { shipment_ref: 'S1', carrier_ref: 'O', mode: '11', port_of_entry: '4601', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-G17' },
      { shipment_ref: 'S2', carrier_ref: 'R', mode: '21', port_of_entry: '3901', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'RL-G17' },
      { shipment_ref: 'S3', carrier_ref: 'T', mode: '30', port_of_entry: '0712', port_of_unlading: '0712', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-G17' },
    ],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1800, vendor_name: 'Vendor G17A' },
      { invoice_ref: 'B', shipment_ref: 'S2', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1800, vendor_name: 'Vendor G17B' },
      { invoice_ref: 'C', shipment_ref: 'S3', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1800, vendor_name: 'Vendor G17C' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Cross mode ocean lot', line_item_identifier: 'A17', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 18, entered_value: 1800, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S2', invoice_ref: 'B', article_line_no: '2', description: 'Cross mode rail lot', line_item_identifier: 'B17', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 18, entered_value: 1800, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S3', invoice_ref: 'C', article_line_no: '3', description: 'Cross mode truck lot', line_item_identifier: 'C17', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 18, entered_value: 1800, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1800, country_of_origin: 'VN' },
      { shipment_ref: 'S2', invoice_ref: 'B', line_no: '2', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1800, country_of_origin: 'CA' },
      { shipment_ref: 'S3', invoice_ref: 'C', line_no: '3', article_line_no: '3', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1800, country_of_origin: 'MX' },
    ],
  },
  {
    id: 'G18',
    title: 'same carrier reused for three unrelated importers surrogate',
    importer: { display_name: 'Importer Generic 18', contact_name: 'Ops User', phone: '5551018', address_line1: '1018 Carrier Reuse Rd', city: 'Philadelphia', state: 'PA', postal_code: '19153', country: 'US' },
    carriers: [{ carrier_ref: 'A', display_name: 'Carrier Air G18', carrier_code: 'GA8', carrier_type: 'Air', airway_bill_prefix: '001' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '1108', port_of_unlading: '1108', transport_mode: '40', conveyance_name: 'REUSE G18', trip_identifier: 'ARG18', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 2400, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'A', mode: '40', port_of_entry: '1108', port_of_unlading: '1108', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AR-G18' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2400, vendor_name: 'Vendor G18A' }],
    articleRows: [{ shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Carrier reuse air lot', line_item_identifier: 'A18', country_of_origin: 'JP', country_of_export: 'JP', gross_weight: 14, entered_value: 2400, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.4 }],
    tariffRows: [{ shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 2400, country_of_origin: 'JP' }],
  },
  {
    id: 'G19',
    title: 'commodity with no chapter 99 overlays',
    importer: { display_name: 'Importer Generic 19', contact_name: 'Ops User', phone: '5551019', address_line1: '1019 Base Only Lane', city: 'Baltimore', state: 'MD', postal_code: '21224', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean G19', carrier_code: 'GO9' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '1303', port_of_unlading: '1303', transport_mode: '11', conveyance_name: 'BASEONLY G19', trip_identifier: 'OCG19', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 4000, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', mode: '11', port_of_entry: '1303', port_of_unlading: '1303', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-G19' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 4000, vendor_name: 'Vendor G19A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Base-only lot one', line_item_identifier: 'A19', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 20, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Base-only lot two', line_item_identifier: 'B19', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 21, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '3', description: 'Base-only lot three', line_item_identifier: 'C19', country_of_origin: 'ID', country_of_export: 'ID', gross_weight: 22, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '4', description: 'Base-only lot four', line_item_identifier: 'D19', country_of_origin: 'KH', country_of_export: 'KH', gross_weight: 23, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '9403409060', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '3', hs_code: '4404200080', quantity: 1, uom: 'KG', entered_value: 1000, country_of_origin: 'ID' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '4', article_line_no: '4', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1000, country_of_origin: 'KH' },
    ],
  },
  {
    id: 'G20',
    title: 'commodity where every article has a chapter 99 overlay',
    importer: { display_name: 'Importer Generic 20', contact_name: 'Ops User', phone: '5551020', address_line1: '1020 Overlay Ocean Dr', city: 'Long Beach', state: 'CA', postal_code: '90802', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean G20', carrier_code: 'GA0' }],
    entry: { filer_code: 'SY1', entry_type: '03', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2704', port_of_unlading: '1303', transport_mode: '11', conveyance_name: 'ALLOVERLAY G20', trip_identifier: 'OCG20', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 7200, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', mode: '11', port_of_entry: '2704', port_of_unlading: '1303', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-G20' }],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 3600, vendor_name: 'Vendor G20A' },
      { invoice_ref: 'B', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 3600, vendor_name: 'Vendor G20B' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Overlay-all lot one', line_item_identifier: 'A20', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 16, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.2 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Overlay-all lot two', line_item_identifier: 'B20', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 17, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.2 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '3', description: 'Overlay-all lot three', line_item_identifier: 'C20', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 18, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.2 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '4', description: 'Overlay-all lot four', line_item_identifier: 'D20', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 19, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.2 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '5', description: 'Overlay-all lot five', line_item_identifier: 'E20', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 20, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.2 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '6', description: 'Overlay-all lot six', line_item_identifier: 'F20', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 21, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.2 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '1', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '4', article_line_no: '2', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '5', article_line_no: '3', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '6', article_line_no: '3', hs_code: '99030125', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '7', article_line_no: '4', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '8', article_line_no: '4', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '9', article_line_no: '5', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '10', article_line_no: '5', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '11', article_line_no: '6', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '12', article_line_no: '6', hs_code: '99030125', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
    ],
  },
];

for (const scenario of CASES) {
  test(`${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}

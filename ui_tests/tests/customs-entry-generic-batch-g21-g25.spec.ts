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
    id: 'G21',
    title: 'generic marine inflatable goods case',
    importer: { display_name: 'Importer Generic 21', contact_name: 'Ops User', phone: '5551021', address_line1: '1021 Harbor View Dr', city: 'Houston', state: 'TX', postal_code: '77029', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean G21', carrier_code: 'G21' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '1801', port_of_unlading: '1801', transport_mode: '10', conveyance_name: 'MARINE G21', trip_identifier: 'MG21', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 3200, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', mode: '10', port_of_entry: '1801', port_of_unlading: '1801', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'SEA-G21' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 3200, vendor_name: 'Vendor G21A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Inflatable marine goods', line_item_identifier: 'A21', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 16, entered_value: 1600, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.6 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Marine accessory kit', line_item_identifier: 'B21', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 18, entered_value: 1600, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.6 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '8907100000', quantity: 1, uom: 'NO', entered_value: 1600, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1600, country_of_origin: 'VN' },
    ],
  },
  {
    id: 'G22',
    title: 'generic building materials case',
    importer: { display_name: 'Importer Generic 22', contact_name: 'Ops User', phone: '5551022', address_line1: '1022 Builders Row', city: 'Seattle', state: 'WA', postal_code: '98134', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean G22', carrier_code: 'G22' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2801', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'BUILD G22', trip_identifier: 'BG22', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 9600, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', mode: '11', port_of_entry: '2801', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'SEA-G22' }],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 4800, vendor_name: 'Vendor G22A' },
      { invoice_ref: 'B', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 4800, vendor_name: 'Vendor G22B' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Structural lumber batch', line_item_identifier: 'A22', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 30, entered_value: 2400, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.4 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Deck board bundle', line_item_identifier: 'B22', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 28, entered_value: 2400, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.4 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '3', description: 'Molded plastic trim', line_item_identifier: 'C22', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 20, entered_value: 1600, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.6 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '4', description: 'Composite fitting set', line_item_identifier: 'D22', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 18, entered_value: 1600, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.6 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '5', description: 'Expansion fastener kit', line_item_identifier: 'E22', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 16, entered_value: 1600, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.6 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '4404200080', quantity: 1, uom: 'KG', entered_value: 2400, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '4404200080', quantity: 1, uom: 'KG', entered_value: 2400, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '3', article_line_no: '3', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1600, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '4', article_line_no: '4', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1600, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '5', article_line_no: '5', hs_code: '99030125', quantity: 1, uom: 'NO', entered_value: 1600, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '6', article_line_no: '5', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1600, country_of_origin: 'CN' },
    ],
  },
  {
    id: 'G23',
    title: 'generic agriculture seed grain style case',
    importer: { display_name: 'Importer Generic 23', contact_name: 'Ops User', phone: '5551023', address_line1: '1023 Grain Exchange Ave', city: 'Laredo', state: 'TX', postal_code: '78045', country: 'US' },
    carriers: [{ carrier_ref: 'T', display_name: 'Carrier Truck G23', carrier_code: 'G23' }],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '0712', port_of_unlading: '0712', transport_mode: '30', conveyance_name: 'AGRI G23', trip_identifier: 'AG23', payment_type: '3', bond_type: '9', surety_code: '036', total_entered_value: 4500, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'T', mode: '30', port_of_entry: '0712', port_of_unlading: '0712', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-G23' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 4500, vendor_name: 'Vendor G23A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Coffee seed lots', line_item_identifier: 'A23', country_of_origin: 'BR', country_of_export: 'BR', gross_weight: 40, entered_value: 1500, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.5 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Supplement blend sacks', line_item_identifier: 'B23', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 42, entered_value: 1500, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.5 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '3', description: 'Cured stalk materials', line_item_identifier: 'C23', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 38, entered_value: 1500, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.5 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '0901110025', quantity: 1, uom: 'KG', entered_value: 1500, country_of_origin: 'BR' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1500, country_of_origin: 'MX' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '3', hs_code: '4404200080', quantity: 1, uom: 'KG', entered_value: 1500, country_of_origin: 'MX' },
    ],
  },
  {
    id: 'G24',
    title: 'generic medical regulated consumer goods style case',
    importer: { display_name: 'Importer Generic 24', contact_name: 'Ops User', phone: '5551024', address_line1: '1024 Regulated Goods Pkwy', city: 'Philadelphia', state: 'PA', postal_code: '19153', country: 'US' },
    carriers: [{ carrier_ref: 'A', display_name: 'Carrier Air G24', carrier_code: 'G24', carrier_type: 'Air', airway_bill_prefix: '005' }],
    entry: { filer_code: 'SY1', entry_type: '03', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '1108', port_of_unlading: '1108', transport_mode: '40', conveyance_name: 'MEDAIR G24', trip_identifier: 'MA24', payment_type: '2', bond_type: '9', surety_code: '036', total_entered_value: 5200, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'A', mode: '40', port_of_entry: '1108', port_of_unlading: '1108', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AR-G24' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 5200, vendor_name: 'Vendor G24A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Regulated appliance kit', line_item_identifier: 'A24', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 12, entered_value: 2600, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.6 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Regulated accessory pack', line_item_identifier: 'B24', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 13, entered_value: 2600, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.6 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '4011201015', quantity: 1, uom: 'NO', entered_value: 2600, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '1', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 2600, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '2', hs_code: '4819200040', quantity: 1, uom: 'NO', entered_value: 2600, country_of_origin: 'CN' },
    ],
  },
  {
    id: 'G25',
    title: 'generic branch office operator stress run',
    importer: { display_name: 'Importer Generic 25', contact_name: 'Ops User', phone: '5551025', address_line1: '1025 Branch Ops Center', city: 'Newark', state: 'NJ', postal_code: '07114', country: 'US' },
    carriers: [
      { carrier_ref: 'O', display_name: 'Carrier Ocean G25', carrier_code: 'G25' },
      { carrier_ref: 'T', display_name: 'Carrier Truck G25', carrier_code: 'H25' },
    ],
    entry: { filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '4601', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'BRANCH G25', trip_identifier: 'BO25', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 9600, currency: 'USD' },
    shipmentRows: [
      { shipment_ref: 'S1', carrier_ref: 'O', mode: '11', port_of_entry: '4601', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'SEA-G25' },
      { shipment_ref: 'S2', carrier_ref: 'T', mode: '30', port_of_entry: '3303', port_of_unlading: '3303', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-G25' },
    ],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2400, vendor_name: 'Vendor G25A' },
      { invoice_ref: 'B', shipment_ref: 'S1', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2400, vendor_name: 'Vendor G25B' },
      { invoice_ref: 'C', shipment_ref: 'S2', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2400, vendor_name: 'Vendor G25C' },
      { invoice_ref: 'D', shipment_ref: 'S2', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2400, vendor_name: 'Vendor G25D' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Branch stock ocean lot one', line_item_identifier: 'A25', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 20, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.2 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Branch stock ocean lot two', line_item_identifier: 'B25', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 21, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.2 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '3', description: 'Branch stock ocean lot three', line_item_identifier: 'C25', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 22, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.2 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '4', description: 'Branch stock ocean lot four', line_item_identifier: 'D25', country_of_origin: 'VN', country_of_export: 'VN', gross_weight: 23, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.2 },
      { shipment_ref: 'S2', invoice_ref: 'C', article_line_no: '5', description: 'Branch stock road lot one', line_item_identifier: 'E25', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 24, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.2 },
      { shipment_ref: 'S2', invoice_ref: 'C', article_line_no: '6', description: 'Branch stock road lot two', line_item_identifier: 'F25', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 25, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.2 },
      { shipment_ref: 'S2', invoice_ref: 'D', article_line_no: '7', description: 'Branch stock road lot three', line_item_identifier: 'G25', country_of_origin: 'US', country_of_export: 'CA', gross_weight: 26, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.2 },
      { shipment_ref: 'S2', invoice_ref: 'D', article_line_no: '8', description: 'Branch stock road lot four', line_item_identifier: 'H25', country_of_origin: 'US', country_of_export: 'CA', gross_weight: 27, entered_value: 1200, harbor_maintenance_fee: 0, merchandise_processing_fee: 1.2 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '4819200040', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '1', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '2', hs_code: '9403409060', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '4', article_line_no: '3', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '5', article_line_no: '4', hs_code: '8907100000', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'VN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '6', article_line_no: '4', hs_code: '99030125', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'VN' },
      { shipment_ref: 'S2', invoice_ref: 'C', line_no: '7', article_line_no: '5', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1200, country_of_origin: 'MX' },
      { shipment_ref: 'S2', invoice_ref: 'C', line_no: '8', article_line_no: '5', hs_code: '99030301', quantity: 1, uom: 'KG', entered_value: 1200, country_of_origin: 'MX' },
      { shipment_ref: 'S2', invoice_ref: 'C', line_no: '9', article_line_no: '6', hs_code: '4404200080', quantity: 1, uom: 'KG', entered_value: 1200, country_of_origin: 'MX' },
      { shipment_ref: 'S2', invoice_ref: 'D', line_no: '10', article_line_no: '7', hs_code: '4011201015', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'US' },
      { shipment_ref: 'S2', invoice_ref: 'D', line_no: '11', article_line_no: '8', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'US' },
      { shipment_ref: 'S2', invoice_ref: 'D', line_no: '12', article_line_no: '8', hs_code: '99030125', quantity: 1, uom: 'NO', entered_value: 1200, country_of_origin: 'US' },
    ],
  },
];

for (const scenario of CASES) {
  test(`${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}


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

const suiteRunId = String(Date.now()).slice(-6);
const importerRegistry = new Map<string, string>();
const carrierRegistry = new Map<string, string>();

function scenario01to07(caseId: string): EntryScenario {
  const suffix = `${caseId}-${suiteRunId}`;
  const shared = {
    suretyCode: '036',
    currency: 'USD',
  };
  const cases: Record<string, EntryScenario> = {
    '01': {
      caseId: '01', focus: 'Baseline ocean containerized consumption', importerKey: 'IMP-ALPHA-01', importerDisplayName: `Importer Alpha ${suiteRunId}`, importerCode: `IA${suiteRunId}`,
      carrierKey: 'CAR-OCEAN-01', carrierDisplayName: `Carrier Ocean ${suiteRunId}`, carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
      entryType: '01', transportMode: '11', paymentType: '2', bondType: '8', portOfEntrySymbol: 'PORT-EC-SEA-1', portOfUnladingSymbol: 'PORT-EC-SEA-1',
      clientRef: `UI-CASE-${suiteRunId}`, conveyanceName: 'UI OCEAN 01', tripIdentifier: 'UO101', bondNumber: `B${suiteRunId}`, houseBill: `HB${suiteRunId}`, masterBill: `MB${suiteRunId}`,
      totalEnteredValue: 1250, ...shared,
      shipments: [{ shipmentNo: suiteRunId, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-001' }],
      invoices: [{ invoiceNumber: `INV-${suiteRunId}`, shipmentNo: suiteRunId, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1250, vendorName: 'Vendor Alpha 01' }],
      articles: [{ articleLineNo: '1', description: 'Synthetic paper cartons', invoiceNumber: `INV-${suiteRunId}`, shipmentNo: suiteRunId, lineItemIdentifier: 'A01', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 100, enteredValue: 1250, harborMaintenanceFee: 5, merchandiseProcessingFee: 7.5 }],
      tariffs: [
        { lineNo: '1', articleLineNo: '1', shipmentNo: suiteRunId, invoiceNumber: `INV-${suiteRunId}`, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 1250, countryOfOrigin: 'CN' },
        { lineNo: '2', articleLineNo: '1', shipmentNo: suiteRunId, invoiceNumber: `INV-${suiteRunId}`, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'KG', enteredValue: 1250, countryOfOrigin: 'CN' },
      ],
    },
    '02': {
      caseId: '02', focus: 'Ocean non-containerized consumption', importerKey: 'IMP-ALPHA-01', importerDisplayName: `Importer Alpha ${suiteRunId}`, importerCode: `IA${suiteRunId}`,
      carrierKey: 'CAR-OCEAN-02', carrierDisplayName: `Carrier Ocean Bulk ${suiteRunId}`, carrierCode: Number(`1${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
      entryType: '01', transportMode: '10', paymentType: '2', bondType: '8', portOfEntrySymbol: 'PORT-GULF-1', portOfUnladingSymbol: 'PORT-GULF-1',
      clientRef: `UI-CASE-02-${suiteRunId}`, conveyanceName: 'UI BULK 02', tripIdentifier: 'UB102', bondNumber: `B2${suiteRunId.slice(-5)}`, houseBill: `HB2${suiteRunId}`, masterBill: `MB2${suiteRunId}`,
      totalEnteredValue: 1800, ...shared,
      shipments: [{ shipmentNo: `2${suiteRunId}`, mode: '10', carrierName: 'CAR-OCEAN-02', portOfEntry: 'PORT-GULF-1', portOfUnlading: 'PORT-GULF-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'BULK-02' }],
      invoices: [{ invoiceNumber: `INV-02-${suiteRunId}`, shipmentNo: `2${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1800, vendorName: 'Vendor Bulk 02' }],
      articles: [{ articleLineNo: '1', description: 'Synthetic wood poles', invoiceNumber: `INV-02-${suiteRunId}`, shipmentNo: `2${suiteRunId}`, lineItemIdentifier: 'A02', countryOfOrigin: 'BR', countryOfExport: 'BR', grossWeight: 250, enteredValue: 1800, harborMaintenanceFee: 0, merchandiseProcessingFee: 0 }],
      tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `2${suiteRunId}`, invoiceNumber: `INV-02-${suiteRunId}`, hsCode: 'HTS-BASE-WOOD-01', quantity: 1, uom: 'KG', enteredValue: 1800, countryOfOrigin: 'BR' }],
    },
    '03': {
      caseId: '03', focus: 'Rail containerized consumption', importerKey: 'IMP-BRAVO-01', importerDisplayName: `Importer Bravo ${suiteRunId}`, importerCode: `IB${suiteRunId}`,
      carrierKey: 'CAR-RAIL-01', carrierDisplayName: `Carrier Rail ${suiteRunId}`, carrierCode: Number(`2${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
      entryType: '01', transportMode: '21', paymentType: '2', bondType: '8', portOfEntrySymbol: 'PORT-RAIL-1', portOfUnladingSymbol: 'PORT-EC-SEA-2',
      clientRef: `UI-CASE-03-${suiteRunId}`, conveyanceName: 'UI RAIL 03', tripIdentifier: 'UR203', bondNumber: `B3${suiteRunId.slice(-5)}`, houseBill: `HB3${suiteRunId}`, masterBill: `MB3${suiteRunId}`,
      totalEnteredValue: 2400, ...shared,
      shipments: [{ shipmentNo: `3${suiteRunId}`, mode: '21', carrierName: 'CAR-RAIL-01', portOfEntry: 'PORT-RAIL-1', portOfUnlading: 'PORT-EC-SEA-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-02', voyageOrFlight: 'RAIL-03' }],
      invoices: [{ invoiceNumber: `INV-03-${suiteRunId}`, shipmentNo: `3${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 2400, vendorName: 'Vendor Rail 03' }],
      articles: [
        { articleLineNo: '1', description: 'Synthetic plastic trims', invoiceNumber: `INV-03-${suiteRunId}`, shipmentNo: `3${suiteRunId}`, lineItemIdentifier: 'B31', countryOfOrigin: 'MX', countryOfExport: 'MX', grossWeight: 90, enteredValue: 1200, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.5 },
        { articleLineNo: '2', description: 'Synthetic consumer housings', invoiceNumber: `INV-03-${suiteRunId}`, shipmentNo: `3${suiteRunId}`, lineItemIdentifier: 'B32', countryOfOrigin: 'MX', countryOfExport: 'MX', grossWeight: 110, enteredValue: 1200, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.5 },
      ],
      tariffs: [
        { lineNo: '1', articleLineNo: '1', shipmentNo: `3${suiteRunId}`, invoiceNumber: `INV-03-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'MX' },
        { lineNo: '2', articleLineNo: '2', shipmentNo: `3${suiteRunId}`, invoiceNumber: `INV-03-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'MX' },
      ],
    },
    '04': {
      caseId: '04', focus: 'Truck non-containerized consumption', importerKey: 'IMP-CHARLIE-01', importerDisplayName: `Importer Charlie ${suiteRunId}`, importerCode: `IC${suiteRunId}`,
      carrierKey: 'CAR-TRUCK-01', carrierDisplayName: `Carrier Truck ${suiteRunId}`, carrierCode: Number(`3${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
      entryType: '01', transportMode: '30', paymentType: '2', bondType: '8', portOfEntrySymbol: 'PORT-ROAD-1', portOfUnladingSymbol: 'PORT-ROAD-1',
      clientRef: `UI-CASE-04-${suiteRunId}`, conveyanceName: 'UI TRUCK 04', tripIdentifier: 'UT304', bondNumber: `B4${suiteRunId.slice(-5)}`, houseBill: `HB4${suiteRunId}`, masterBill: `MB4${suiteRunId}`,
      totalEnteredValue: 900, ...shared,
      shipments: [{ shipmentNo: `4${suiteRunId}`, mode: '30', carrierName: 'CAR-TRUCK-01', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-ROAD-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'TRK-04' }],
      invoices: [{ invoiceNumber: `INV-04-${suiteRunId}`, shipmentNo: `4${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 900, vendorName: 'Vendor Truck 04' }],
      articles: [{ articleLineNo: '1', description: 'Synthetic food prep mix', invoiceNumber: `INV-04-${suiteRunId}`, shipmentNo: `4${suiteRunId}`, lineItemIdentifier: 'A04', countryOfOrigin: 'CA', countryOfExport: 'CA', grossWeight: 50, enteredValue: 900, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.5 }],
      tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `4${suiteRunId}`, invoiceNumber: `INV-04-${suiteRunId}`, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 900, countryOfOrigin: 'CA' }],
    },
    '05': {
      caseId: '05', focus: 'Road other consumption', importerKey: 'IMP-CHARLIE-01', importerDisplayName: `Importer Charlie ${suiteRunId}`, importerCode: `IC${suiteRunId}`,
      carrierKey: 'CAR-TRUCK-02', carrierDisplayName: `Carrier Road Other ${suiteRunId}`, carrierCode: Number(`4${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
      entryType: '01', transportMode: '34', paymentType: '2', bondType: '8', portOfEntrySymbol: 'PORT-ROAD-1', portOfUnladingSymbol: 'PORT-AIR-1',
      clientRef: `UI-CASE-05-${suiteRunId}`, conveyanceName: 'UI ROAD 05', tripIdentifier: 'URD05', bondNumber: `B5${suiteRunId.slice(-5)}`, houseBill: `HB5${suiteRunId}`, masterBill: `MB5${suiteRunId}`,
      totalEnteredValue: 980, ...shared,
      shipments: [{ shipmentNo: `5${suiteRunId}`, mode: '34', carrierName: 'CAR-TRUCK-02', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'ROAD-05' }],
      invoices: [{ invoiceNumber: `INV-05-${suiteRunId}`, shipmentNo: `5${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 980, vendorName: 'Vendor Road 05' }],
      articles: [{ articleLineNo: '1', description: 'Synthetic consumer fixture', invoiceNumber: `INV-05-${suiteRunId}`, shipmentNo: `5${suiteRunId}`, lineItemIdentifier: 'A05', countryOfOrigin: 'US', countryOfExport: 'CA', grossWeight: 40, enteredValue: 980, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.25 }],
      tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `5${suiteRunId}`, invoiceNumber: `INV-05-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 980, countryOfOrigin: 'US' }],
    },
    '06': {
      caseId: '06', focus: 'Air consumption', importerKey: 'IMP-DELTA-01', importerDisplayName: `Importer Delta ${suiteRunId}`, importerCode: `ID${suiteRunId}`,
      carrierKey: 'CAR-AIR-01', carrierDisplayName: `Carrier Air ${suiteRunId}`, carrierCode: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
      entryType: '01', transportMode: '40', paymentType: '2', bondType: '8', portOfEntrySymbol: 'PORT-AIR-1', portOfUnladingSymbol: 'PORT-AIR-1',
      clientRef: `UI-CASE-06-${suiteRunId}`, conveyanceName: 'UI AIR 06', tripIdentifier: 'UA406', bondNumber: `B6${suiteRunId.slice(-5)}`, houseBill: `HB6${suiteRunId}`, masterBill: `MB6${suiteRunId}`,
      totalEnteredValue: 3200, ...shared,
      shipments: [{ shipmentNo: `6${suiteRunId}`, mode: '40', carrierName: 'CAR-AIR-01', portOfEntry: 'PORT-AIR-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-06' }],
      invoices: [{ invoiceNumber: `INV-06-${suiteRunId}`, shipmentNo: `6${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 3200, vendorName: 'Vendor Air 06' }],
      articles: [
        { articleLineNo: '1', description: 'Synthetic used auto unit', invoiceNumber: `INV-06-${suiteRunId}`, shipmentNo: `6${suiteRunId}`, lineItemIdentifier: 'C61', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 300, enteredValue: 2000, harborMaintenanceFee: 0, merchandiseProcessingFee: 3.5 },
        { articleLineNo: '2', description: 'Synthetic air accessory pack', invoiceNumber: `INV-06-${suiteRunId}`, shipmentNo: `6${suiteRunId}`, lineItemIdentifier: 'C62', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 70, enteredValue: 1200, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.0 },
      ],
      tariffs: [
        { lineNo: '1', articleLineNo: '1', shipmentNo: `6${suiteRunId}`, invoiceNumber: `INV-06-${suiteRunId}`, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 2000, countryOfOrigin: 'JP' },
        { lineNo: '2', articleLineNo: '1', shipmentNo: `6${suiteRunId}`, invoiceNumber: `INV-06-${suiteRunId}`, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 2000, countryOfOrigin: 'JP' },
        { lineNo: '3', articleLineNo: '2', shipmentNo: `6${suiteRunId}`, invoiceNumber: `INV-06-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'JP' },
      ],
    },
    '07': {
      caseId: '07', focus: 'Hand-carried consumption', importerKey: 'IMP-ECHO-01', importerDisplayName: `Importer Echo ${suiteRunId}`, importerCode: `IE${suiteRunId}`,
      carrierKey: 'CAR-HAND-01', carrierDisplayName: `Carrier Hand ${suiteRunId}`, carrierCode: Number(`6${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
      entryType: '01', transportMode: '60', paymentType: '2', bondType: '8', portOfEntrySymbol: 'PORT-AIR-2', portOfUnladingSymbol: 'PORT-AIR-2',
      clientRef: `UI-CASE-07-${suiteRunId}`, conveyanceName: 'UI HAND 07', tripIdentifier: 'UH607', bondNumber: `B7${suiteRunId.slice(-5)}`, houseBill: `HB7${suiteRunId}`, masterBill: `MB7${suiteRunId}`,
      totalEnteredValue: 450, ...shared,
      shipments: [{ shipmentNo: `7${suiteRunId}`, mode: '60', carrierName: 'CAR-HAND-01', portOfEntry: 'PORT-AIR-2', portOfUnlading: 'PORT-AIR-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'HAND-07' }],
      invoices: [{ invoiceNumber: `INV-07-${suiteRunId}`, shipmentNo: `7${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 450, vendorName: 'Vendor Hand 07' }],
      articles: [{ articleLineNo: '1', description: 'Synthetic hand-carried good', invoiceNumber: `INV-07-${suiteRunId}`, shipmentNo: `7${suiteRunId}`, lineItemIdentifier: 'A07', countryOfOrigin: 'GB', countryOfExport: 'GB', grossWeight: 15, enteredValue: 450, harborMaintenanceFee: 0, merchandiseProcessingFee: 0.75 }],
      tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `7${suiteRunId}`, invoiceNumber: `INV-07-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 450, countryOfOrigin: 'GB' }],
    },
  };
  return cases[caseId];
}

for (const caseId of ['01', '02', '03', '04', '05', '06', '07']) {
  test(`batch A case ${caseId}`, async ({ page }) => {
    const prep = await (async () => {
      await login(page);
      return loadExecutionPrep(page);
    })();
    const scenario = scenario01to07(caseId);
    const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
      display_name: scenario.importerDisplayName,
      importer_code: scenario.importerCode,
      contact_name: 'Ops User',
      email: `${scenario.importerCode.toLowerCase()}@example.com`,
      phone: '5550101',
      address_line1: '101 Harbor Way',
      city: 'Newark',
      state: 'NJ',
      postal_code: '07102',
      country: 'US',
    });
    const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
      display_name: scenario.carrierDisplayName,
      carrier_code: scenario.carrierCode,
      carrier_type: scenario.transportMode === '40' ? 'Air' : undefined,
      airway_bill_prefix: scenario.transportMode === '40' ? '001' : undefined,
    });
    carrierRegistry.set(scenario.carrierKey, carrierName);
    const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
    expect(result.verification.ok).toBeTruthy();
    expect(result.verification.differences).toEqual([]);
  });
}


test('batch A case 08', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '08',
    focus: 'AD/CVD ocean containerized',
    importerKey: 'IMP-FOXTROT-01',
    importerDisplayName: `Importer Foxtrot ${suiteRunId}`,
    importerCode: `IF${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-EC-SEA-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-08-${suiteRunId}`,
    conveyanceName: 'UI OCEAN 08',
    tripIdentifier: 'UO308',
    suretyCode: '036',
    bondNumber: `B8${suiteRunId.slice(-5)}`,
    houseBill: `HB8${suiteRunId}`,
    masterBill: `MB8${suiteRunId}`,
    totalEnteredValue: 2100,
    currency: 'USD',
    shipments: [{ shipmentNo: `8${suiteRunId}`, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-008' }],
    invoices: [{ invoiceNumber: `INV-08-${suiteRunId}`, shipmentNo: `8${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 2100, vendorName: 'Vendor Ocean 08' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic wood cabinet panels', invoiceNumber: `INV-08-${suiteRunId}`, shipmentNo: `8${suiteRunId}`, lineItemIdentifier: 'D81', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 180, enteredValue: 2100, harborMaintenanceFee: 4.5, merchandiseProcessingFee: 6.25 }],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `8${suiteRunId}`, invoiceNumber: `INV-08-${suiteRunId}`, hsCode: 'HTS-BASE-FURNITURE-01', quantity: 1, uom: 'NO', enteredValue: 2100, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '1', shipmentNo: `8${suiteRunId}`, invoiceNumber: `INV-08-${suiteRunId}`, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 2100, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 09', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '09',
    focus: 'AD/CVD ocean non-containerized',
    importerKey: 'IMP-FOXTROT-01',
    importerDisplayName: `Importer Foxtrot ${suiteRunId}`,
    importerCode: `IF${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-02',
    carrierDisplayName: `Carrier Ocean Bulk ${suiteRunId}`,
    carrierCode: Number(`1${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '10',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-GULF-1',
    portOfUnladingSymbol: 'PORT-GULF-1',
    clientRef: `UI-CASE-09-${suiteRunId}`,
    conveyanceName: 'UI BULK 09',
    tripIdentifier: 'UB309',
    suretyCode: '036',
    bondNumber: `B9${suiteRunId.slice(-5)}`,
    houseBill: `HB9${suiteRunId}`,
    masterBill: `MB9${suiteRunId}`,
    totalEnteredValue: 1950,
    currency: 'USD',
    shipments: [{ shipmentNo: `9${suiteRunId}`, mode: '10', carrierName: 'CAR-OCEAN-02', portOfEntry: 'PORT-GULF-1', portOfUnlading: 'PORT-GULF-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'BULK-09' }],
    invoices: [{ invoiceNumber: `INV-09-${suiteRunId}`, shipmentNo: `9${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1950, vendorName: 'Vendor Bulk 09' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic AD/CVD wood items', invoiceNumber: `INV-09-${suiteRunId}`, shipmentNo: `9${suiteRunId}`, lineItemIdentifier: 'D91', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 160, enteredValue: 1950, harborMaintenanceFee: 4.0, merchandiseProcessingFee: 5.75 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `9${suiteRunId}`, invoiceNumber: `INV-09-${suiteRunId}`, hsCode: 'HTS-BASE-WOOD-01', quantity: 1, uom: 'KG', enteredValue: 1950, countryOfOrigin: 'CN' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 10', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '10',
    focus: 'AD/CVD rail',
    importerKey: 'IMP-GOLF-01',
    importerDisplayName: `Importer Golf ${suiteRunId}`,
    importerCode: `IG${suiteRunId}`,
    carrierKey: 'CAR-RAIL-01',
    carrierDisplayName: `Carrier Rail ${suiteRunId}`,
    carrierCode: Number(`2${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '21',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-RAIL-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-2',
    clientRef: `UI-CASE-10-${suiteRunId}`,
    conveyanceName: 'UI RAIL 10',
    tripIdentifier: 'UR310',
    suretyCode: '036',
    bondNumber: `B10${suiteRunId.slice(-4)}`,
    houseBill: `HB10${suiteRunId}`,
    masterBill: `MB10${suiteRunId}`,
    totalEnteredValue: 2600,
    currency: 'USD',
    shipments: [{ shipmentNo: `10${suiteRunId}`, mode: '21', carrierName: 'CAR-RAIL-01', portOfEntry: 'PORT-RAIL-1', portOfUnlading: 'PORT-EC-SEA-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-02', voyageOrFlight: 'RAIL-10' }],
    invoices: [{ invoiceNumber: `INV-10-${suiteRunId}`, shipmentNo: `10${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 2600, vendorName: 'Vendor Rail 10' }],
    articles: [
      { articleLineNo: '1', description: 'Synthetic AD/CVD tire set', invoiceNumber: `INV-10-${suiteRunId}`, shipmentNo: `10${suiteRunId}`, lineItemIdentifier: 'E11', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 140, enteredValue: 1300, harborMaintenanceFee: 0, merchandiseProcessingFee: 3.25 },
      { articleLineNo: '2', description: 'Synthetic AD/CVD wheel set', invoiceNumber: `INV-10-${suiteRunId}`, shipmentNo: `10${suiteRunId}`, lineItemIdentifier: 'E12', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 145, enteredValue: 1300, harborMaintenanceFee: 0, merchandiseProcessingFee: 3.25 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `10${suiteRunId}`, invoiceNumber: `INV-10-${suiteRunId}`, hsCode: 'HTS-BASE-TIRE-01', quantity: 1, uom: 'NO', enteredValue: 1300, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '1', shipmentNo: `10${suiteRunId}`, invoiceNumber: `INV-10-${suiteRunId}`, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1300, countryOfOrigin: 'CN' },
      { lineNo: '3', articleLineNo: '2', shipmentNo: `10${suiteRunId}`, invoiceNumber: `INV-10-${suiteRunId}`, hsCode: 'HTS-BASE-TIRE-01', quantity: 1, uom: 'NO', enteredValue: 1300, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 11', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '11',
    focus: 'AD/CVD truck',
    importerKey: 'IMP-HOTEL-01',
    importerDisplayName: `Importer Hotel ${suiteRunId}`,
    importerCode: `IH${suiteRunId}`,
    carrierKey: 'CAR-TRUCK-01',
    carrierDisplayName: `Carrier Truck ${suiteRunId}`,
    carrierCode: Number(`3${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '30',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-ROAD-1',
    portOfUnladingSymbol: 'PORT-ROAD-1',
    clientRef: `UI-CASE-11-${suiteRunId}`,
    conveyanceName: 'UI TRUCK 11',
    tripIdentifier: 'UT311',
    suretyCode: '036',
    bondNumber: `B11${suiteRunId.slice(-4)}`,
    houseBill: `HB11${suiteRunId}`,
    masterBill: `MB11${suiteRunId}`,
    totalEnteredValue: 2400,
    currency: 'USD',
    shipments: [{ shipmentNo: `11${suiteRunId}`, mode: '30', carrierName: 'CAR-TRUCK-01', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-ROAD-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'TRK-11' }],
    invoices: [
      { invoiceNumber: `INV-11A-${suiteRunId}`, shipmentNo: `11${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1200, vendorName: 'Vendor Truck 11A' },
      { invoiceNumber: `INV-11B-${suiteRunId}`, shipmentNo: `11${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1200, vendorName: 'Vendor Truck 11B' },
    ],
    articles: [
      { articleLineNo: '1', description: 'Synthetic AD/CVD plastic components', invoiceNumber: `INV-11A-${suiteRunId}`, shipmentNo: `11${suiteRunId}`, lineItemIdentifier: 'F11', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 95, enteredValue: 1200, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.5 },
      { articleLineNo: '2', description: 'Synthetic AD/CVD plastic accessories', invoiceNumber: `INV-11B-${suiteRunId}`, shipmentNo: `11${suiteRunId}`, lineItemIdentifier: 'F12', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 90, enteredValue: 1200, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.5 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `11${suiteRunId}`, invoiceNumber: `INV-11A-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '2', shipmentNo: `11${suiteRunId}`, invoiceNumber: `INV-11B-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 12', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '12',
    focus: 'AD/CVD road other',
    importerKey: 'IMP-HOTEL-01',
    importerDisplayName: `Importer Hotel ${suiteRunId}`,
    importerCode: `IH${suiteRunId}`,
    carrierKey: 'CAR-TRUCK-02',
    carrierDisplayName: `Carrier Road Other ${suiteRunId}`,
    carrierCode: Number(`4${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '34',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-ROAD-1',
    portOfUnladingSymbol: 'PORT-AIR-1',
    clientRef: `UI-CASE-12-${suiteRunId}`,
    conveyanceName: 'UI ROAD 12',
    tripIdentifier: 'UR312',
    suretyCode: '036',
    bondNumber: `B12${suiteRunId.slice(-4)}`,
    houseBill: `HB12${suiteRunId}`,
    masterBill: `MB12${suiteRunId}`,
    totalEnteredValue: 1450,
    currency: 'USD',
    shipments: [{ shipmentNo: `12${suiteRunId}`, mode: '34', carrierName: 'CAR-TRUCK-02', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'ROAD-12' }],
    invoices: [{ invoiceNumber: `INV-12-${suiteRunId}`, shipmentNo: `12${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1450, vendorName: 'Vendor Road 12' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic AD/CVD consumer goods', invoiceNumber: `INV-12-${suiteRunId}`, shipmentNo: `12${suiteRunId}`, lineItemIdentifier: 'F21', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 60, enteredValue: 1450, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.25 }],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `12${suiteRunId}`, invoiceNumber: `INV-12-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1450, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '1', shipmentNo: `12${suiteRunId}`, invoiceNumber: `INV-12-${suiteRunId}`, hsCode: 'HTS-CH99-C', quantity: 1, uom: 'NO', enteredValue: 1450, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 13', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '13',
    focus: 'AD/CVD air',
    importerKey: 'IMP-INDIA-01',
    importerDisplayName: `Importer India ${suiteRunId}`,
    importerCode: `II${suiteRunId}`,
    carrierKey: 'CAR-AIR-01',
    carrierDisplayName: `Carrier Air ${suiteRunId}`,
    carrierCode: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '40',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-AIR-1',
    portOfUnladingSymbol: 'PORT-AIR-1',
    clientRef: `UI-CASE-13-${suiteRunId}`,
    conveyanceName: 'UI AIR 13',
    tripIdentifier: 'UA313',
    suretyCode: '036',
    bondNumber: `B13${suiteRunId.slice(-4)}`,
    houseBill: `HB13${suiteRunId}`,
    masterBill: `MB13${suiteRunId}`,
    totalEnteredValue: 3600,
    currency: 'USD',
    shipments: [{ shipmentNo: `13${suiteRunId}`, mode: '40', carrierName: 'CAR-AIR-01', portOfEntry: 'PORT-AIR-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-13' }],
    invoices: [{ invoiceNumber: `INV-13-${suiteRunId}`, shipmentNo: `13${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 3600, vendorName: 'Vendor Air 13' }],
    articles: [
      { articleLineNo: '1', description: 'Synthetic AD/CVD auto article', invoiceNumber: `INV-13-${suiteRunId}`, shipmentNo: `13${suiteRunId}`, lineItemIdentifier: 'G11', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 120, enteredValue: 1400, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.75 },
      { articleLineNo: '2', description: 'Synthetic AD/CVD plastic article', invoiceNumber: `INV-13-${suiteRunId}`, shipmentNo: `13${suiteRunId}`, lineItemIdentifier: 'G12', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 85, enteredValue: 1100, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.25 },
      { articleLineNo: '3', description: 'Synthetic AD/CVD consumer article', invoiceNumber: `INV-13-${suiteRunId}`, shipmentNo: `13${suiteRunId}`, lineItemIdentifier: 'G13', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 75, enteredValue: 1100, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.25 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `13${suiteRunId}`, invoiceNumber: `INV-13-${suiteRunId}`, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 1400, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '1', shipmentNo: `13${suiteRunId}`, invoiceNumber: `INV-13-${suiteRunId}`, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1400, countryOfOrigin: 'CN' },
      { lineNo: '3', articleLineNo: '2', shipmentNo: `13${suiteRunId}`, invoiceNumber: `INV-13-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'CN' },
      { lineNo: '4', articleLineNo: '3', shipmentNo: `13${suiteRunId}`, invoiceNumber: `INV-13-${suiteRunId}`, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
    carrier_type: 'Air',
    airway_bill_prefix: '001',
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 14', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '14',
    focus: 'AD/CVD hand-carried',
    importerKey: 'IMP-JULIET-01',
    importerDisplayName: `Importer Juliet ${suiteRunId}`,
    importerCode: `IJ${suiteRunId}`,
    carrierKey: 'CAR-HAND-01',
    carrierDisplayName: `Carrier Hand ${suiteRunId}`,
    carrierCode: Number(`6${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '60',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-AIR-2',
    portOfUnladingSymbol: 'PORT-AIR-2',
    clientRef: `UI-CASE-14-${suiteRunId}`,
    conveyanceName: 'UI HAND 14',
    tripIdentifier: 'UH314',
    suretyCode: '036',
    bondNumber: `B14${suiteRunId.slice(-4)}`,
    houseBill: `HB14${suiteRunId}`,
    masterBill: `MB14${suiteRunId}`,
    totalEnteredValue: 780,
    currency: 'USD',
    shipments: [{ shipmentNo: `14${suiteRunId}`, mode: '60', carrierName: 'CAR-HAND-01', portOfEntry: 'PORT-AIR-2', portOfUnlading: 'PORT-AIR-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'HAND-14' }],
    invoices: [{ invoiceNumber: `INV-14-${suiteRunId}`, shipmentNo: `14${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 780, vendorName: 'Vendor Hand 14' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic AD/CVD hand-carried consumer item', invoiceNumber: `INV-14-${suiteRunId}`, shipmentNo: `14${suiteRunId}`, lineItemIdentifier: 'G21', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 18, enteredValue: 780, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.0 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `14${suiteRunId}`, invoiceNumber: `INV-14-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 780, countryOfOrigin: 'CN' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 15', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '15',
    focus: 'Informal ocean containerized',
    importerKey: 'IMP-KILO-01',
    importerDisplayName: `Importer Kilo ${suiteRunId}`,
    importerCode: `IK${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '11',
    transportMode: '11',
    paymentType: '3',
    bondType: '9',
    portOfEntrySymbol: 'PORT-EC-SEA-2',
    portOfUnladingSymbol: 'PORT-EC-SEA-2',
    clientRef: `UI-CASE-15-${suiteRunId}`,
    conveyanceName: 'UI OCEAN 15',
    tripIdentifier: 'UO315',
    suretyCode: '036',
    bondNumber: `B15${suiteRunId.slice(-4)}`,
    houseBill: `HB15${suiteRunId}`,
    masterBill: `MB15${suiteRunId}`,
    totalEnteredValue: 820,
    currency: 'USD',
    shipments: [{ shipmentNo: `15${suiteRunId}`, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-2', portOfUnlading: 'PORT-EC-SEA-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-015' }],
    invoices: [{ invoiceNumber: `INV-15-${suiteRunId}`, shipmentNo: `15${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 820, vendorName: 'Vendor Ocean 15' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic informal coffee goods', invoiceNumber: `INV-15-${suiteRunId}`, shipmentNo: `15${suiteRunId}`, lineItemIdentifier: 'H15', countryOfOrigin: 'CO', countryOfExport: 'CO', grossWeight: 55, enteredValue: 820, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.25 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `15${suiteRunId}`, invoiceNumber: `INV-15-${suiteRunId}`, hsCode: 'HTS-BASE-COFFEE-01', quantity: 1, uom: 'KG', enteredValue: 820, countryOfOrigin: 'CO' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 16', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '16',
    focus: 'Informal ocean non-containerized',
    importerKey: 'IMP-KILO-01',
    importerDisplayName: `Importer Kilo ${suiteRunId}`,
    importerCode: `IK${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-02',
    carrierDisplayName: `Carrier Ocean Bulk ${suiteRunId}`,
    carrierCode: Number(`1${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '11',
    transportMode: '10',
    paymentType: '3',
    bondType: '9',
    portOfEntrySymbol: 'PORT-GULF-1',
    portOfUnladingSymbol: 'PORT-GULF-1',
    clientRef: `UI-CASE-16-${suiteRunId}`,
    conveyanceName: 'UI BULK 16',
    tripIdentifier: 'UB316',
    suretyCode: '036',
    bondNumber: `B16${suiteRunId.slice(-4)}`,
    houseBill: `HB16${suiteRunId}`,
    masterBill: `MB16${suiteRunId}`,
    totalEnteredValue: 950,
    currency: 'USD',
    shipments: [{ shipmentNo: `16${suiteRunId}`, mode: '10', carrierName: 'CAR-OCEAN-02', portOfEntry: 'PORT-GULF-1', portOfUnlading: 'PORT-GULF-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'BULK-16' }],
    invoices: [{ invoiceNumber: `INV-16-${suiteRunId}`, shipmentNo: `16${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 950, vendorName: 'Vendor Marine 16' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic informal marine goods', invoiceNumber: `INV-16-${suiteRunId}`, shipmentNo: `16${suiteRunId}`, lineItemIdentifier: 'H16', countryOfOrigin: 'BR', countryOfExport: 'BR', grossWeight: 70, enteredValue: 950, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.5 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `16${suiteRunId}`, invoiceNumber: `INV-16-${suiteRunId}`, hsCode: 'HTS-BASE-MARINE-01', quantity: 1, uom: 'NO', enteredValue: 950, countryOfOrigin: 'BR' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 17', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '17',
    focus: 'Informal rail',
    importerKey: 'IMP-LIMA-01',
    importerDisplayName: `Importer Lima ${suiteRunId}`,
    importerCode: `IL${suiteRunId}`,
    carrierKey: 'CAR-RAIL-01',
    carrierDisplayName: `Carrier Rail ${suiteRunId}`,
    carrierCode: Number(`2${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '11',
    transportMode: '21',
    paymentType: '3',
    bondType: '9',
    portOfEntrySymbol: 'PORT-RAIL-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-17-${suiteRunId}`,
    conveyanceName: 'UI RAIL 17',
    tripIdentifier: 'UR317',
    suretyCode: '036',
    bondNumber: `B17${suiteRunId.slice(-4)}`,
    houseBill: `HB17${suiteRunId}`,
    masterBill: `MB17${suiteRunId}`,
    totalEnteredValue: 1800,
    currency: 'USD',
    shipments: [{ shipmentNo: `17${suiteRunId}`, mode: '21', carrierName: 'CAR-RAIL-01', portOfEntry: 'PORT-RAIL-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-02', voyageOrFlight: 'RAIL-17' }],
    invoices: [{ invoiceNumber: `INV-17-${suiteRunId}`, shipmentNo: `17${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1800, vendorName: 'Vendor Rail 17' }],
    articles: [
      { articleLineNo: '1', description: 'Synthetic informal consumer article', invoiceNumber: `INV-17-${suiteRunId}`, shipmentNo: `17${suiteRunId}`, lineItemIdentifier: 'H17', countryOfOrigin: 'MX', countryOfExport: 'MX', grossWeight: 65, enteredValue: 900, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.25 },
      { articleLineNo: '2', description: 'Synthetic informal plastic article', invoiceNumber: `INV-17-${suiteRunId}`, shipmentNo: `17${suiteRunId}`, lineItemIdentifier: 'H18', countryOfOrigin: 'MX', countryOfExport: 'MX', grossWeight: 70, enteredValue: 900, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.25 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `17${suiteRunId}`, invoiceNumber: `INV-17-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 900, countryOfOrigin: 'MX' },
      { lineNo: '2', articleLineNo: '2', shipmentNo: `17${suiteRunId}`, invoiceNumber: `INV-17-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 900, countryOfOrigin: 'MX' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 18', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '18',
    focus: 'Informal truck',
    importerKey: 'IMP-MIKE-01',
    importerDisplayName: `Importer Mike ${suiteRunId}`,
    importerCode: `IM${suiteRunId}`,
    carrierKey: 'CAR-TRUCK-01',
    carrierDisplayName: `Carrier Truck ${suiteRunId}`,
    carrierCode: Number(`3${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '11',
    transportMode: '30',
    paymentType: '3',
    bondType: '9',
    portOfEntrySymbol: 'PORT-ROAD-1',
    portOfUnladingSymbol: 'PORT-ROAD-1',
    clientRef: `UI-CASE-18-${suiteRunId}`,
    conveyanceName: 'UI TRUCK 18',
    tripIdentifier: 'UT318',
    suretyCode: '036',
    bondNumber: `B18${suiteRunId.slice(-4)}`,
    houseBill: `HB18${suiteRunId}`,
    masterBill: `MB18${suiteRunId}`,
    totalEnteredValue: 640,
    currency: 'USD',
    shipments: [{ shipmentNo: `18${suiteRunId}`, mode: '30', carrierName: 'CAR-TRUCK-01', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-ROAD-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'TRK-18' }],
    invoices: [{ invoiceNumber: `INV-18-${suiteRunId}`, shipmentNo: `18${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 640, vendorName: 'Vendor Truck 18' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic informal food goods', invoiceNumber: `INV-18-${suiteRunId}`, shipmentNo: `18${suiteRunId}`, lineItemIdentifier: 'I18', countryOfOrigin: 'CA', countryOfExport: 'CA', grossWeight: 35, enteredValue: 640, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.0 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `18${suiteRunId}`, invoiceNumber: `INV-18-${suiteRunId}`, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 640, countryOfOrigin: 'CA' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 19', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '19',
    focus: 'Informal road other',
    importerKey: 'IMP-MIKE-01',
    importerDisplayName: `Importer Mike ${suiteRunId}`,
    importerCode: `IM${suiteRunId}`,
    carrierKey: 'CAR-TRUCK-02',
    carrierDisplayName: `Carrier Road Other ${suiteRunId}`,
    carrierCode: Number(`4${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '11',
    transportMode: '34',
    paymentType: '3',
    bondType: '9',
    portOfEntrySymbol: 'PORT-ROAD-1',
    portOfUnladingSymbol: 'PORT-AIR-2',
    clientRef: `UI-CASE-19-${suiteRunId}`,
    conveyanceName: 'UI ROAD 19',
    tripIdentifier: 'UR319',
    suretyCode: '036',
    bondNumber: `B19${suiteRunId.slice(-4)}`,
    houseBill: `HB19${suiteRunId}`,
    masterBill: `MB19${suiteRunId}`,
    totalEnteredValue: 710,
    currency: 'USD',
    shipments: [{ shipmentNo: `19${suiteRunId}`, mode: '34', carrierName: 'CAR-TRUCK-02', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-AIR-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'ROAD-19' }],
    invoices: [{ invoiceNumber: `INV-19-${suiteRunId}`, shipmentNo: `19${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 710, vendorName: 'Vendor Road 19' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic informal consumer goods', invoiceNumber: `INV-19-${suiteRunId}`, shipmentNo: `19${suiteRunId}`, lineItemIdentifier: 'I19', countryOfOrigin: 'GB', countryOfExport: 'GB', grossWeight: 28, enteredValue: 710, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.0 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `19${suiteRunId}`, invoiceNumber: `INV-19-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 710, countryOfOrigin: 'GB' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 20', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '20',
    focus: 'Informal air',
    importerKey: 'IMP-NOVEMBER-01',
    importerDisplayName: `Importer November ${suiteRunId}`,
    importerCode: `IN${suiteRunId}`,
    carrierKey: 'CAR-AIR-01',
    carrierDisplayName: `Carrier Air ${suiteRunId}`,
    carrierCode: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '11',
    transportMode: '40',
    paymentType: '3',
    bondType: '9',
    portOfEntrySymbol: 'PORT-AIR-2',
    portOfUnladingSymbol: 'PORT-AIR-2',
    clientRef: `UI-CASE-20-${suiteRunId}`,
    conveyanceName: 'UI AIR 20',
    tripIdentifier: 'UA320',
    suretyCode: '036',
    bondNumber: `B20${suiteRunId.slice(-4)}`,
    houseBill: `HB20${suiteRunId}`,
    masterBill: `MB20${suiteRunId}`,
    totalEnteredValue: 1320,
    currency: 'USD',
    shipments: [{ shipmentNo: `20${suiteRunId}`, mode: '40', carrierName: 'CAR-AIR-01', portOfEntry: 'PORT-AIR-2', portOfUnlading: 'PORT-AIR-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-20' }],
    invoices: [{ invoiceNumber: `INV-20-${suiteRunId}`, shipmentNo: `20${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1320, vendorName: 'Vendor Air 20' }],
    articles: [
      { articleLineNo: '1', description: 'Synthetic informal consumer kit', invoiceNumber: `INV-20-${suiteRunId}`, shipmentNo: `20${suiteRunId}`, lineItemIdentifier: 'I20', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 42, enteredValue: 660, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.25 },
      { articleLineNo: '2', description: 'Synthetic informal consumer add-on', invoiceNumber: `INV-20-${suiteRunId}`, shipmentNo: `20${suiteRunId}`, lineItemIdentifier: 'I21', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 39, enteredValue: 660, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.25 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `20${suiteRunId}`, invoiceNumber: `INV-20-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 660, countryOfOrigin: 'JP' },
      { lineNo: '2', articleLineNo: '2', shipmentNo: `20${suiteRunId}`, invoiceNumber: `INV-20-${suiteRunId}`, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 660, countryOfOrigin: 'JP' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
    carrier_type: 'Air',
    airway_bill_prefix: '001',
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 21', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '21',
    focus: 'Informal hand-carried',
    importerKey: 'IMP-OSCAR-01',
    importerDisplayName: `Importer Oscar ${suiteRunId}`,
    importerCode: `IO${suiteRunId}`,
    carrierKey: 'CAR-HAND-01',
    carrierDisplayName: `Carrier Hand ${suiteRunId}`,
    carrierCode: Number(`6${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '11',
    transportMode: '60',
    paymentType: '3',
    bondType: '9',
    portOfEntrySymbol: 'PORT-AIR-2',
    portOfUnladingSymbol: 'PORT-AIR-2',
    clientRef: `UI-CASE-21-${suiteRunId}`,
    conveyanceName: 'UI HAND 21',
    tripIdentifier: 'UH321',
    suretyCode: '036',
    bondNumber: `B21${suiteRunId.slice(-4)}`,
    houseBill: `HB21${suiteRunId}`,
    masterBill: `MB21${suiteRunId}`,
    totalEnteredValue: 390,
    currency: 'USD',
    shipments: [{ shipmentNo: `21${suiteRunId}`, mode: '60', carrierName: 'CAR-HAND-01', portOfEntry: 'PORT-AIR-2', portOfUnlading: 'PORT-AIR-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'HAND-21' }],
    invoices: [{ invoiceNumber: `INV-21-${suiteRunId}`, shipmentNo: `21${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 390, vendorName: 'Vendor Hand 21' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic informal passenger item', invoiceNumber: `INV-21-${suiteRunId}`, shipmentNo: `21${suiteRunId}`, lineItemIdentifier: 'I22', countryOfOrigin: 'DE', countryOfExport: 'DE', grossWeight: 10, enteredValue: 390, harborMaintenanceFee: 0, merchandiseProcessingFee: 0.75 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `21${suiteRunId}`, invoiceNumber: `INV-21-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 390, countryOfOrigin: 'DE' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 22', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '22',
    focus: 'Warehouse ocean containerized',
    importerKey: 'IMP-PAPA-01',
    importerDisplayName: `Importer Papa ${suiteRunId}`,
    importerCode: `IP${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '21',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-EC-SEA-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-22-${suiteRunId}`,
    conveyanceName: 'UI OCEAN 22',
    tripIdentifier: 'UO322',
    suretyCode: '036',
    bondNumber: `B22${suiteRunId.slice(-4)}`,
    houseBill: `HB22${suiteRunId}`,
    masterBill: `MB22${suiteRunId}`,
    totalEnteredValue: 1600,
    currency: 'USD',
    shipments: [{ shipmentNo: `22${suiteRunId}`, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-022' }],
    invoices: [{ invoiceNumber: `INV-22-${suiteRunId}`, shipmentNo: `22${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1600, vendorName: 'Vendor Ocean 22' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic warehouse furniture goods', invoiceNumber: `INV-22-${suiteRunId}`, shipmentNo: `22${suiteRunId}`, lineItemIdentifier: 'J22', countryOfOrigin: 'VN', countryOfExport: 'VN', grossWeight: 120, enteredValue: 1600, harborMaintenanceFee: 3.0, merchandiseProcessingFee: 4.0 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `22${suiteRunId}`, invoiceNumber: `INV-22-${suiteRunId}`, hsCode: 'HTS-BASE-FURNITURE-01', quantity: 1, uom: 'NO', enteredValue: 1600, countryOfOrigin: 'VN' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 23', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '23',
    focus: 'Warehouse air',
    importerKey: 'IMP-PAPA-01',
    importerDisplayName: `Importer Papa ${suiteRunId}`,
    importerCode: `IP${suiteRunId}`,
    carrierKey: 'CAR-AIR-01',
    carrierDisplayName: `Carrier Air ${suiteRunId}`,
    carrierCode: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '21',
    transportMode: '40',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-AIR-1',
    portOfUnladingSymbol: 'PORT-AIR-1',
    clientRef: `UI-CASE-23-${suiteRunId}`,
    conveyanceName: 'UI AIR 23',
    tripIdentifier: 'UA323',
    suretyCode: '036',
    bondNumber: `B23${suiteRunId.slice(-4)}`,
    houseBill: `HB23${suiteRunId}`,
    masterBill: `MB23${suiteRunId}`,
    totalEnteredValue: 980,
    currency: 'USD',
    shipments: [{ shipmentNo: `23${suiteRunId}`, mode: '40', carrierName: 'CAR-AIR-01', portOfEntry: 'PORT-AIR-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-23' }],
    invoices: [{ invoiceNumber: `INV-23-${suiteRunId}`, shipmentNo: `23${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 980, vendorName: 'Vendor Air 23' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic warehouse consumer goods', invoiceNumber: `INV-23-${suiteRunId}`, shipmentNo: `23${suiteRunId}`, lineItemIdentifier: 'J23', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 48, enteredValue: 980, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.75 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `23${suiteRunId}`, invoiceNumber: `INV-23-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 980, countryOfOrigin: 'JP' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
    carrier_type: 'Air',
    airway_bill_prefix: '001',
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 24', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '24',
    focus: 'Warehouse truck',
    importerKey: 'IMP-PAPA-01',
    importerDisplayName: `Importer Papa ${suiteRunId}`,
    importerCode: `IP${suiteRunId}`,
    carrierKey: 'CAR-TRUCK-01',
    carrierDisplayName: `Carrier Truck ${suiteRunId}`,
    carrierCode: Number(`3${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '21',
    transportMode: '30',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-ROAD-1',
    portOfUnladingSymbol: 'PORT-ROAD-1',
    clientRef: `UI-CASE-24-${suiteRunId}`,
    conveyanceName: 'UI TRUCK 24',
    tripIdentifier: 'UT324',
    suretyCode: '036',
    bondNumber: `B24${suiteRunId.slice(-4)}`,
    houseBill: `HB24${suiteRunId}`,
    masterBill: `MB24${suiteRunId}`,
    totalEnteredValue: 1120,
    currency: 'USD',
    shipments: [{ shipmentNo: `24${suiteRunId}`, mode: '30', carrierName: 'CAR-TRUCK-01', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-ROAD-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'TRK-24' }],
    invoices: [{ invoiceNumber: `INV-24-${suiteRunId}`, shipmentNo: `24${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1120, vendorName: 'Vendor Truck 24' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic warehouse plastic goods', invoiceNumber: `INV-24-${suiteRunId}`, shipmentNo: `24${suiteRunId}`, lineItemIdentifier: 'J24', countryOfOrigin: 'MX', countryOfExport: 'MX', grossWeight: 72, enteredValue: 1120, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.5 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `24${suiteRunId}`, invoiceNumber: `INV-24-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1120, countryOfOrigin: 'MX' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 25', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '25',
    focus: 'New importer existing carrier',
    importerKey: 'IMP-QUEBEC-NEW-01',
    importerDisplayName: `Importer Quebec ${suiteRunId}`,
    importerCode: `IQ${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-EC-SEA-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-25-${suiteRunId}`,
    conveyanceName: 'UI OCEAN 25',
    tripIdentifier: 'UO325',
    suretyCode: '036',
    bondNumber: `B25${suiteRunId.slice(-4)}`,
    houseBill: `HB25${suiteRunId}`,
    masterBill: `MB25${suiteRunId}`,
    totalEnteredValue: 1180,
    currency: 'USD',
    shipments: [{ shipmentNo: `25${suiteRunId}`, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-025' }],
    invoices: [{ invoiceNumber: `INV-25-${suiteRunId}`, shipmentNo: `25${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1180, vendorName: 'Vendor Ocean 25' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic new-importer paper goods', invoiceNumber: `INV-25-${suiteRunId}`, shipmentNo: `25${suiteRunId}`, lineItemIdentifier: 'K25', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 82, enteredValue: 1180, harborMaintenanceFee: 2.5, merchandiseProcessingFee: 3.5 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `25${suiteRunId}`, invoiceNumber: `INV-25-${suiteRunId}`, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 1180, countryOfOrigin: 'CN' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 26', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '26',
    focus: 'Existing importer new carrier',
    importerKey: 'IMP-ALPHA-01',
    importerDisplayName: `Importer Alpha ${suiteRunId}`,
    importerCode: `IA${suiteRunId}`,
    carrierKey: 'CAR-AIR-NEW-01',
    carrierDisplayName: `Carrier Air New ${suiteRunId}`,
    carrierCode: Number(`7${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '40',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-AIR-1',
    portOfUnladingSymbol: 'PORT-AIR-1',
    clientRef: `UI-CASE-26-${suiteRunId}`,
    conveyanceName: 'UI AIR 26',
    tripIdentifier: 'UA326',
    suretyCode: '036',
    bondNumber: `B26${suiteRunId.slice(-4)}`,
    houseBill: `HB26${suiteRunId}`,
    masterBill: `MB26${suiteRunId}`,
    totalEnteredValue: 990,
    currency: 'USD',
    shipments: [{ shipmentNo: `26${suiteRunId}`, mode: '40', carrierName: 'CAR-AIR-NEW-01', portOfEntry: 'PORT-AIR-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-26' }],
    invoices: [{ invoiceNumber: `INV-26-${suiteRunId}`, shipmentNo: `26${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 990, vendorName: 'Vendor Air 26' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic new-carrier consumer goods', invoiceNumber: `INV-26-${suiteRunId}`, shipmentNo: `26${suiteRunId}`, lineItemIdentifier: 'K26', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 44, enteredValue: 990, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.5 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `26${suiteRunId}`, invoiceNumber: `INV-26-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 990, countryOfOrigin: 'JP' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
    carrier_type: 'Air',
    airway_bill_prefix: '001',
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 27', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '27',
    focus: 'New importer and new carrier',
    importerKey: 'IMP-ROMEO-NEW-01',
    importerDisplayName: `Importer Romeo ${suiteRunId}`,
    importerCode: `IR${suiteRunId}`,
    carrierKey: 'CAR-RAIL-NEW-01',
    carrierDisplayName: `Carrier Rail New ${suiteRunId}`,
    carrierCode: Number(`8${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '21',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-RAIL-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-2',
    clientRef: `UI-CASE-27-${suiteRunId}`,
    conveyanceName: 'UI RAIL 27',
    tripIdentifier: 'UR327',
    suretyCode: '036',
    bondNumber: `B27${suiteRunId.slice(-4)}`,
    houseBill: `HB27${suiteRunId}`,
    masterBill: `MB27${suiteRunId}`,
    totalEnteredValue: 2100,
    currency: 'USD',
    shipments: [{ shipmentNo: `27${suiteRunId}`, mode: '21', carrierName: 'CAR-RAIL-NEW-01', portOfEntry: 'PORT-RAIL-1', portOfUnlading: 'PORT-EC-SEA-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-02', voyageOrFlight: 'RAIL-27' }],
    invoices: [{ invoiceNumber: `INV-27-${suiteRunId}`, shipmentNo: `27${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 2100, vendorName: 'Vendor Rail 27' }],
    articles: [
      { articleLineNo: '1', description: 'Synthetic new-master tire goods', invoiceNumber: `INV-27-${suiteRunId}`, shipmentNo: `27${suiteRunId}`, lineItemIdentifier: 'K27', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 110, enteredValue: 1050, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.0 },
      { articleLineNo: '2', description: 'Synthetic new-master overlay goods', invoiceNumber: `INV-27-${suiteRunId}`, shipmentNo: `27${suiteRunId}`, lineItemIdentifier: 'K28', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 108, enteredValue: 1050, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.0 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `27${suiteRunId}`, invoiceNumber: `INV-27-${suiteRunId}`, hsCode: 'HTS-BASE-TIRE-01', quantity: 1, uom: 'NO', enteredValue: 1050, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '2', shipmentNo: `27${suiteRunId}`, invoiceNumber: `INV-27-${suiteRunId}`, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1050, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 28', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '28',
    focus: 'New port not in local seed',
    importerKey: 'IMP-ALPHA-01',
    importerDisplayName: `Importer Alpha ${suiteRunId}`,
    importerCode: `IA${suiteRunId}`,
    carrierKey: 'CAR-TRUCK-01',
    carrierDisplayName: `Carrier Truck ${suiteRunId}`,
    carrierCode: Number(`3${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '30',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-NEW-1',
    portOfUnladingSymbol: 'PORT-NEW-1',
    clientRef: `UI-CASE-28-${suiteRunId}`,
    conveyanceName: 'UI TRUCK 28',
    tripIdentifier: 'UT328',
    suretyCode: '036',
    bondNumber: `B28${suiteRunId.slice(-4)}`,
    houseBill: `HB28${suiteRunId}`,
    masterBill: `MB28${suiteRunId}`,
    totalEnteredValue: 870,
    currency: 'USD',
    shipments: [{ shipmentNo: `28${suiteRunId}`, mode: '30', carrierName: 'CAR-TRUCK-01', portOfEntry: 'PORT-NEW-1', portOfUnlading: 'PORT-NEW-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'TRK-28' }],
    invoices: [{ invoiceNumber: `INV-28-${suiteRunId}`, shipmentNo: `28${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 870, vendorName: 'Vendor Port 28' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic new-port food goods', invoiceNumber: `INV-28-${suiteRunId}`, shipmentNo: `28${suiteRunId}`, lineItemIdentifier: 'K29', countryOfOrigin: 'CA', countryOfExport: 'CA', grossWeight: 52, enteredValue: 870, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.25 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `28${suiteRunId}`, invoiceNumber: `INV-28-${suiteRunId}`, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 870, countryOfOrigin: 'CA' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 29', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '29',
    focus: 'New HTS not in local seed',
    importerKey: 'IMP-ALPHA-01',
    importerDisplayName: `Importer Alpha ${suiteRunId}`,
    importerCode: `IA${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-EC-SEA-2',
    portOfUnladingSymbol: 'PORT-EC-SEA-2',
    clientRef: `UI-CASE-29-${suiteRunId}`,
    conveyanceName: 'UI OCEAN 29',
    tripIdentifier: 'UO329',
    suretyCode: '036',
    bondNumber: `B29${suiteRunId.slice(-4)}`,
    houseBill: `HB29${suiteRunId}`,
    masterBill: `MB29${suiteRunId}`,
    totalEnteredValue: 1460,
    currency: 'USD',
    shipments: [{ shipmentNo: `29${suiteRunId}`, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-2', portOfUnlading: 'PORT-EC-SEA-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-029' }],
    invoices: [{ invoiceNumber: `INV-29-${suiteRunId}`, shipmentNo: `29${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1460, vendorName: 'Vendor HTS 29' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic new-hts goods', invoiceNumber: `INV-29-${suiteRunId}`, shipmentNo: `29${suiteRunId}`, lineItemIdentifier: 'K30', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 90, enteredValue: 1460, harborMaintenanceFee: 3.0, merchandiseProcessingFee: 4.0 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `29${suiteRunId}`, invoiceNumber: `INV-29-${suiteRunId}`, hsCode: 'HTS-NEW-01', quantity: 1, uom: 'NO', enteredValue: 1460, countryOfOrigin: 'CN' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 30', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '30',
    focus: 'One shipment two invoices',
    importerKey: 'IMP-BRAVO-01',
    importerDisplayName: `Importer Bravo ${suiteRunId}`,
    importerCode: `IB${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-EC-SEA-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-30-${suiteRunId}`,
    conveyanceName: 'UI OCEAN 30',
    tripIdentifier: 'UO330',
    suretyCode: '036',
    bondNumber: `B30${suiteRunId.slice(-4)}`,
    houseBill: `HB30${suiteRunId}`,
    masterBill: `MB30${suiteRunId}`,
    totalEnteredValue: 2400,
    currency: 'USD',
    shipments: [{ shipmentNo: `30${suiteRunId}`, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-030' }],
    invoices: [
      { invoiceNumber: `INV-30A-${suiteRunId}`, shipmentNo: `30${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1200, vendorName: 'Vendor Ocean 30A' },
      { invoiceNumber: `INV-30B-${suiteRunId}`, shipmentNo: `30${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1200, vendorName: 'Vendor Ocean 30B' },
    ],
    articles: [
      { articleLineNo: '1', description: 'Synthetic paper cartons batch A', invoiceNumber: `INV-30A-${suiteRunId}`, shipmentNo: `30${suiteRunId}`, lineItemIdentifier: 'L30', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 90, enteredValue: 1200, harborMaintenanceFee: 2.5, merchandiseProcessingFee: 3.5 },
      { articleLineNo: '2', description: 'Synthetic plastic trims batch B', invoiceNumber: `INV-30B-${suiteRunId}`, shipmentNo: `30${suiteRunId}`, lineItemIdentifier: 'L31', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 88, enteredValue: 1200, harborMaintenanceFee: 2.5, merchandiseProcessingFee: 3.5 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `30${suiteRunId}`, invoiceNumber: `INV-30A-${suiteRunId}`, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 1200, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '2', shipmentNo: `30${suiteRunId}`, invoiceNumber: `INV-30B-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 31', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '31',
    focus: 'One shipment three invoices',
    importerKey: 'IMP-INDIA-01',
    importerDisplayName: `Importer India ${suiteRunId}`,
    importerCode: `II${suiteRunId}`,
    carrierKey: 'CAR-AIR-01',
    carrierDisplayName: `Carrier Air ${suiteRunId}`,
    carrierCode: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '40',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-AIR-1',
    portOfUnladingSymbol: 'PORT-AIR-1',
    clientRef: `UI-CASE-31-${suiteRunId}`,
    conveyanceName: 'UI AIR 31',
    tripIdentifier: 'UA331',
    suretyCode: '036',
    bondNumber: `B31${suiteRunId.slice(-4)}`,
    houseBill: `HB31${suiteRunId}`,
    masterBill: `MB31${suiteRunId}`,
    totalEnteredValue: 3600,
    currency: 'USD',
    shipments: [{ shipmentNo: `31${suiteRunId}`, mode: '40', carrierName: 'CAR-AIR-01', portOfEntry: 'PORT-AIR-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-31' }],
    invoices: [
      { invoiceNumber: `INV-31A-${suiteRunId}`, shipmentNo: `31${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1200, vendorName: 'Vendor Air 31A' },
      { invoiceNumber: `INV-31B-${suiteRunId}`, shipmentNo: `31${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1200, vendorName: 'Vendor Air 31B' },
      { invoiceNumber: `INV-31C-${suiteRunId}`, shipmentNo: `31${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1200, vendorName: 'Vendor Air 31C' },
    ],
    articles: [
      { articleLineNo: '1', description: 'Synthetic air auto article', invoiceNumber: `INV-31A-${suiteRunId}`, shipmentNo: `31${suiteRunId}`, lineItemIdentifier: 'L32', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 60, enteredValue: 1200, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.0 },
      { articleLineNo: '2', description: 'Synthetic air plastic article', invoiceNumber: `INV-31B-${suiteRunId}`, shipmentNo: `31${suiteRunId}`, lineItemIdentifier: 'L33', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 58, enteredValue: 1200, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.0 },
      { articleLineNo: '3', description: 'Synthetic air consumer article', invoiceNumber: `INV-31C-${suiteRunId}`, shipmentNo: `31${suiteRunId}`, lineItemIdentifier: 'L34', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 57, enteredValue: 1200, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.0 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `31${suiteRunId}`, invoiceNumber: `INV-31A-${suiteRunId}`, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '2', shipmentNo: `31${suiteRunId}`, invoiceNumber: `INV-31B-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'CN' },
      { lineNo: '3', articleLineNo: '3', shipmentNo: `31${suiteRunId}`, invoiceNumber: `INV-31C-${suiteRunId}`, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
    carrier_type: 'Air',
    airway_bill_prefix: '001',
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 32', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '32',
    focus: 'Two shipments one invoice each',
    importerKey: 'IMP-CHARLIE-01',
    importerDisplayName: `Importer Charlie ${suiteRunId}`,
    importerCode: `IC${suiteRunId}`,
    carrierKey: 'CAR-TRUCK-01',
    carrierDisplayName: `Carrier Truck ${suiteRunId}`,
    carrierCode: Number(`3${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '30',
    paymentType: '3',
    bondType: '9',
    portOfEntrySymbol: 'PORT-ROAD-1',
    portOfUnladingSymbol: 'PORT-ROAD-1',
    clientRef: `UI-CASE-32-${suiteRunId}`,
    conveyanceName: 'UI TRUCK 32',
    tripIdentifier: 'UT332',
    suretyCode: '036',
    bondNumber: `B32${suiteRunId.slice(-4)}`,
    houseBill: `HB32${suiteRunId}`,
    masterBill: `MB32${suiteRunId}`,
    totalEnteredValue: 1800,
    currency: 'USD',
    shipments: [
      { shipmentNo: `32A${suiteRunId}`, mode: '30', carrierName: 'CAR-TRUCK-01', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-ROAD-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'TRK-32A' },
      { shipmentNo: `32B${suiteRunId}`, mode: '30', carrierName: 'CAR-TRUCK-01', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-ROAD-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'TRK-32B' },
    ],
    invoices: [
      { invoiceNumber: `INV-32A-${suiteRunId}`, shipmentNo: `32A${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 900, vendorName: 'Vendor Truck 32A' },
      { invoiceNumber: `INV-32B-${suiteRunId}`, shipmentNo: `32B${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 900, vendorName: 'Vendor Truck 32B' },
    ],
    articles: [
      { articleLineNo: '1', description: 'Synthetic food article shipment A', invoiceNumber: `INV-32A-${suiteRunId}`, shipmentNo: `32A${suiteRunId}`, lineItemIdentifier: 'L35', countryOfOrigin: 'CA', countryOfExport: 'CA', grossWeight: 42, enteredValue: 900, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.25 },
      { articleLineNo: '2', description: 'Synthetic consumer article shipment B', invoiceNumber: `INV-32B-${suiteRunId}`, shipmentNo: `32B${suiteRunId}`, lineItemIdentifier: 'L36', countryOfOrigin: 'CA', countryOfExport: 'CA', grossWeight: 40, enteredValue: 900, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.25 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `32A${suiteRunId}`, invoiceNumber: `INV-32A-${suiteRunId}`, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 900, countryOfOrigin: 'CA' },
      { lineNo: '2', articleLineNo: '2', shipmentNo: `32B${suiteRunId}`, invoiceNumber: `INV-32B-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 900, countryOfOrigin: 'CA' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  const carrierName = await ensureCarrier(page, carrierRegistry, scenario.carrierKey, {
    display_name: scenario.carrierDisplayName,
    carrier_code: scenario.carrierCode,
  });
  carrierRegistry.set(scenario.carrierKey, carrierName);
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 33', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '33',
    focus: 'Two shipments mixed carriers',
    importerKey: 'IMP-ALPHA-01',
    importerDisplayName: `Importer Alpha ${suiteRunId}`,
    importerCode: `IA${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-EC-SEA-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-33-${suiteRunId}`,
    conveyanceName: 'UI MIXED 33',
    tripIdentifier: 'UM333',
    suretyCode: '036',
    bondNumber: `B33${suiteRunId.slice(-4)}`,
    houseBill: `HB33${suiteRunId}`,
    masterBill: `MB33${suiteRunId}`,
    totalEnteredValue: 3000,
    currency: 'USD',
    shipments: [
      { shipmentNo: `331${suiteRunId}`, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-33A' },
      { shipmentNo: `332${suiteRunId}`, mode: '30', carrierName: 'CAR-TRUCK-01', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-ROAD-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'TRK-33B' },
    ],
    invoices: [
      { invoiceNumber: `INV-33A-${suiteRunId}`, shipmentNo: `331${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1500, vendorName: 'Vendor Mixed 33A' },
      { invoiceNumber: `INV-33B-${suiteRunId}`, shipmentNo: `332${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1500, vendorName: 'Vendor Mixed 33B' },
    ],
    articles: [
      { articleLineNo: '1', description: 'Synthetic ocean shipment article', invoiceNumber: `INV-33A-${suiteRunId}`, shipmentNo: `331${suiteRunId}`, lineItemIdentifier: 'L37', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 95, enteredValue: 1500, harborMaintenanceFee: 3.0, merchandiseProcessingFee: 4.0 },
      { articleLineNo: '2', description: 'Synthetic truck shipment article', invoiceNumber: `INV-33B-${suiteRunId}`, shipmentNo: `332${suiteRunId}`, lineItemIdentifier: 'L38', countryOfOrigin: 'US', countryOfExport: 'CA', grossWeight: 60, enteredValue: 1500, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.75 },
      { articleLineNo: '3', description: 'Synthetic overlay shipment article', invoiceNumber: `INV-33B-${suiteRunId}`, shipmentNo: `332${suiteRunId}`, lineItemIdentifier: 'L39', countryOfOrigin: 'US', countryOfExport: 'CA', grossWeight: 58, enteredValue: 0, harborMaintenanceFee: 0, merchandiseProcessingFee: 0 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `331${suiteRunId}`, invoiceNumber: `INV-33A-${suiteRunId}`, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 1500, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '2', shipmentNo: `332${suiteRunId}`, invoiceNumber: `INV-33B-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1500, countryOfOrigin: 'US' },
      { lineNo: '3', articleLineNo: '3', shipmentNo: `332${suiteRunId}`, invoiceNumber: `INV-33B-${suiteRunId}`, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1500, countryOfOrigin: 'US' },
      { lineNo: '4', articleLineNo: '3', shipmentNo: `332${suiteRunId}`, invoiceNumber: `INV-33B-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1500, countryOfOrigin: 'US' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-OCEAN-01', {
    display_name: `Carrier Ocean ${suiteRunId}`,
    carrier_code: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-TRUCK-01', {
    display_name: `Carrier Truck ${suiteRunId}`,
    carrier_code: Number(`3${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 34', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '34',
    focus: 'Three shipments mixed modes',
    importerKey: 'IMP-ALPHA-01',
    importerDisplayName: `Importer Alpha ${suiteRunId}`,
    importerCode: `IA${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-EC-SEA-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-34-${suiteRunId}`,
    conveyanceName: 'UI MULTI 34',
    tripIdentifier: 'UM334',
    suretyCode: '036',
    bondNumber: `B34${suiteRunId.slice(-4)}`,
    houseBill: `HB34${suiteRunId}`,
    masterBill: `MB34${suiteRunId}`,
    totalEnteredValue: 3600,
    currency: 'USD',
    shipments: [
      { shipmentNo: `341${suiteRunId}`, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-34A' },
      { shipmentNo: `342${suiteRunId}`, mode: '30', carrierName: 'CAR-TRUCK-01', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-ROAD-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'TRK-34B' },
      { shipmentNo: `343${suiteRunId}`, mode: '40', carrierName: 'CAR-AIR-01', portOfEntry: 'PORT-AIR-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-34C' },
    ],
    invoices: [
      { invoiceNumber: `INV-34A-${suiteRunId}`, shipmentNo: `341${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1200, vendorName: 'Vendor Multi 34A' },
      { invoiceNumber: `INV-34B-${suiteRunId}`, shipmentNo: `342${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1200, vendorName: 'Vendor Multi 34B' },
      { invoiceNumber: `INV-34C-${suiteRunId}`, shipmentNo: `343${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1200, vendorName: 'Vendor Multi 34C' },
    ],
    articles: [
      { articleLineNo: '1', description: 'Synthetic ocean mixed article', invoiceNumber: `INV-34A-${suiteRunId}`, shipmentNo: `341${suiteRunId}`, lineItemIdentifier: 'L40', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 92, enteredValue: 1200, harborMaintenanceFee: 2.5, merchandiseProcessingFee: 3.5 },
      { articleLineNo: '2', description: 'Synthetic truck mixed article', invoiceNumber: `INV-34B-${suiteRunId}`, shipmentNo: `342${suiteRunId}`, lineItemIdentifier: 'L41', countryOfOrigin: 'US', countryOfExport: 'CA', grossWeight: 65, enteredValue: 1200, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.5 },
      { articleLineNo: '3', description: 'Synthetic air mixed article', invoiceNumber: `INV-34C-${suiteRunId}`, shipmentNo: `343${suiteRunId}`, lineItemIdentifier: 'L42', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 45, enteredValue: 1200, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.5 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `341${suiteRunId}`, invoiceNumber: `INV-34A-${suiteRunId}`, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 1200, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '2', shipmentNo: `342${suiteRunId}`, invoiceNumber: `INV-34B-${suiteRunId}`, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 1200, countryOfOrigin: 'US' },
      { lineNo: '3', articleLineNo: '3', shipmentNo: `343${suiteRunId}`, invoiceNumber: `INV-34C-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'JP' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-OCEAN-01', {
    display_name: `Carrier Ocean ${suiteRunId}`,
    carrier_code: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-TRUCK-01', {
    display_name: `Carrier Truck ${suiteRunId}`,
    carrier_code: Number(`3${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-AIR-01', {
    display_name: `Carrier Air ${suiteRunId}`,
    carrier_code: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    carrier_type: 'Air',
    airway_bill_prefix: '001',
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 35', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '35',
    focus: 'One invoice four articles',
    importerKey: 'IMP-FOXTROT-01',
    importerDisplayName: `Importer Foxtrot ${suiteRunId}`,
    importerCode: `IF${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-EC-SEA-2',
    portOfUnladingSymbol: 'PORT-EC-SEA-2',
    clientRef: `UI-CASE-35-${suiteRunId}`,
    conveyanceName: 'UI DENSE 35',
    tripIdentifier: 'UD335',
    suretyCode: '036',
    bondNumber: `B35${suiteRunId.slice(-4)}`,
    houseBill: `HB35${suiteRunId}`,
    masterBill: `MB35${suiteRunId}`,
    totalEnteredValue: 4200,
    currency: 'USD',
    shipments: [{ shipmentNo: `35${suiteRunId}`, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-2', portOfUnlading: 'PORT-EC-SEA-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-035' }],
    invoices: [{ invoiceNumber: `INV-35-${suiteRunId}`, shipmentNo: `35${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 4200, vendorName: 'Vendor Dense 35' }],
    articles: [
      { articleLineNo: '1', description: 'Synthetic dense paper article', invoiceNumber: `INV-35-${suiteRunId}`, shipmentNo: `35${suiteRunId}`, lineItemIdentifier: 'M51', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 110, enteredValue: 900, harborMaintenanceFee: 2.0, merchandiseProcessingFee: 2.75 },
      { articleLineNo: '2', description: 'Synthetic dense furniture article', invoiceNumber: `INV-35-${suiteRunId}`, shipmentNo: `35${suiteRunId}`, lineItemIdentifier: 'M52', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 130, enteredValue: 1200, harborMaintenanceFee: 2.5, merchandiseProcessingFee: 3.25 },
      { articleLineNo: '3', description: 'Synthetic dense plastic article', invoiceNumber: `INV-35-${suiteRunId}`, shipmentNo: `35${suiteRunId}`, lineItemIdentifier: 'M53', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 90, enteredValue: 1050, harborMaintenanceFee: 2.25, merchandiseProcessingFee: 3.0 },
      { articleLineNo: '4', description: 'Synthetic dense overlay article', invoiceNumber: `INV-35-${suiteRunId}`, shipmentNo: `35${suiteRunId}`, lineItemIdentifier: 'M54', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 85, enteredValue: 1050, harborMaintenanceFee: 2.25, merchandiseProcessingFee: 3.0 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `35${suiteRunId}`, invoiceNumber: `INV-35-${suiteRunId}`, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 900, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '2', shipmentNo: `35${suiteRunId}`, invoiceNumber: `INV-35-${suiteRunId}`, hsCode: 'HTS-BASE-FURNITURE-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'CN' },
      { lineNo: '3', articleLineNo: '3', shipmentNo: `35${suiteRunId}`, invoiceNumber: `INV-35-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1050, countryOfOrigin: 'CN' },
      { lineNo: '4', articleLineNo: '4', shipmentNo: `35${suiteRunId}`, invoiceNumber: `INV-35-${suiteRunId}`, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 1050, countryOfOrigin: 'CN' },
      { lineNo: '5', articleLineNo: '4', shipmentNo: `35${suiteRunId}`, invoiceNumber: `INV-35-${suiteRunId}`, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'KG', enteredValue: 1050, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-OCEAN-01', {
    display_name: `Carrier Ocean ${suiteRunId}`,
    carrier_code: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 36', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '36',
    focus: 'One invoice seven articles',
    importerKey: 'IMP-DELTA-01',
    importerDisplayName: `Importer Delta ${suiteRunId}`,
    importerCode: `ID${suiteRunId}`,
    carrierKey: 'CAR-AIR-01',
    carrierDisplayName: `Carrier Air ${suiteRunId}`,
    carrierCode: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '40',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-AIR-1',
    portOfUnladingSymbol: 'PORT-AIR-1',
    clientRef: `UI-CASE-36-${suiteRunId}`,
    conveyanceName: 'UI DENSE 36',
    tripIdentifier: 'UD336',
    suretyCode: '036',
    bondNumber: `B36${suiteRunId.slice(-4)}`,
    houseBill: `HB36${suiteRunId}`,
    masterBill: `MB36${suiteRunId}`,
    totalEnteredValue: 7000,
    currency: 'USD',
    shipments: [{ shipmentNo: `36${suiteRunId}`, mode: '40', carrierName: 'CAR-AIR-01', portOfEntry: 'PORT-AIR-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-036' }],
    invoices: [{ invoiceNumber: `INV-36-${suiteRunId}`, shipmentNo: `36${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 7000, vendorName: 'Vendor Dense 36' }],
    articles: [
      { articleLineNo: '1', description: 'Synthetic dense air consumer article 1', invoiceNumber: `INV-36-${suiteRunId}`, shipmentNo: `36${suiteRunId}`, lineItemIdentifier: 'N61', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 20, enteredValue: 900, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.2 },
      { articleLineNo: '2', description: 'Synthetic dense air consumer article 2', invoiceNumber: `INV-36-${suiteRunId}`, shipmentNo: `36${suiteRunId}`, lineItemIdentifier: 'N62', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 22, enteredValue: 950, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.25 },
      { articleLineNo: '3', description: 'Synthetic dense air plastic article 3', invoiceNumber: `INV-36-${suiteRunId}`, shipmentNo: `36${suiteRunId}`, lineItemIdentifier: 'N63', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 25, enteredValue: 1000, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.35 },
      { articleLineNo: '4', description: 'Synthetic dense air auto article 4', invoiceNumber: `INV-36-${suiteRunId}`, shipmentNo: `36${suiteRunId}`, lineItemIdentifier: 'N64', countryOfOrigin: 'KR', countryOfExport: 'KR', grossWeight: 28, enteredValue: 1100, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.45 },
      { articleLineNo: '5', description: 'Synthetic dense air consumer article 5', invoiceNumber: `INV-36-${suiteRunId}`, shipmentNo: `36${suiteRunId}`, lineItemIdentifier: 'N65', countryOfOrigin: 'US', countryOfExport: 'CA', grossWeight: 18, enteredValue: 900, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.2 },
      { articleLineNo: '6', description: 'Synthetic dense air overlay article 6', invoiceNumber: `INV-36-${suiteRunId}`, shipmentNo: `36${suiteRunId}`, lineItemIdentifier: 'N66', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 19, enteredValue: 1050, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.3 },
      { articleLineNo: '7', description: 'Synthetic dense air overlay article 7', invoiceNumber: `INV-36-${suiteRunId}`, shipmentNo: `36${suiteRunId}`, lineItemIdentifier: 'N67', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 21, enteredValue: 1100, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.4 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `36${suiteRunId}`, invoiceNumber: `INV-36-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 900, countryOfOrigin: 'JP' },
      { lineNo: '2', articleLineNo: '2', shipmentNo: `36${suiteRunId}`, invoiceNumber: `INV-36-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 950, countryOfOrigin: 'JP' },
      { lineNo: '3', articleLineNo: '3', shipmentNo: `36${suiteRunId}`, invoiceNumber: `INV-36-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '4', articleLineNo: '4', shipmentNo: `36${suiteRunId}`, invoiceNumber: `INV-36-${suiteRunId}`, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'KR' },
      { lineNo: '5', articleLineNo: '5', shipmentNo: `36${suiteRunId}`, invoiceNumber: `INV-36-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 900, countryOfOrigin: 'US' },
      { lineNo: '6', articleLineNo: '6', shipmentNo: `36${suiteRunId}`, invoiceNumber: `INV-36-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1050, countryOfOrigin: 'CN' },
      { lineNo: '7', articleLineNo: '6', shipmentNo: `36${suiteRunId}`, invoiceNumber: `INV-36-${suiteRunId}`, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1050, countryOfOrigin: 'CN' },
      { lineNo: '8', articleLineNo: '7', shipmentNo: `36${suiteRunId}`, invoiceNumber: `INV-36-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-AIR-01', {
    display_name: `Carrier Air ${suiteRunId}`,
    carrier_code: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    carrier_type: 'Air',
    airway_bill_prefix: '001',
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 39', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const scenario: EntryScenario = {
    caseId: '39',
    focus: 'One article three tariffs',
    importerKey: 'IMP-ALPHA-01',
    importerDisplayName: `Importer Alpha ${suiteRunId}`,
    importerCode: `IA${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-EC-SEA-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-39-${suiteRunId}`,
    conveyanceName: 'UI STACK 39',
    tripIdentifier: 'US339',
    suretyCode: '036',
    bondNumber: `B39${suiteRunId.slice(-4)}`,
    houseBill: `HB39${suiteRunId}`,
    masterBill: `MB39${suiteRunId}`,
    totalEnteredValue: 1800,
    currency: 'USD',
    shipments: [{ shipmentNo: `39${suiteRunId}`, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-039' }],
    invoices: [{ invoiceNumber: `INV-39-${suiteRunId}`, shipmentNo: `39${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1800, vendorName: 'Vendor Stack 39' }],
    articles: [
      { articleLineNo: '1', description: 'Synthetic stacked paper article', invoiceNumber: `INV-39-${suiteRunId}`, shipmentNo: `39${suiteRunId}`, lineItemIdentifier: 'P91', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 140, enteredValue: 1800, harborMaintenanceFee: 3.0, merchandiseProcessingFee: 4.0 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: `39${suiteRunId}`, invoiceNumber: `INV-39-${suiteRunId}`, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 1800, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '1', shipmentNo: `39${suiteRunId}`, invoiceNumber: `INV-39-${suiteRunId}`, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'KG', enteredValue: 1800, countryOfOrigin: 'CN' },
      { lineNo: '3', articleLineNo: '1', shipmentNo: `39${suiteRunId}`, invoiceNumber: `INV-39-${suiteRunId}`, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'KG', enteredValue: 1800, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-OCEAN-01', {
    display_name: `Carrier Ocean ${suiteRunId}`,
    carrier_code: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 37', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `37${suiteRunId}`;
  const invoiceA = `INV-37A-${suiteRunId}`;
  const invoiceB = `INV-37B-${suiteRunId}`;
  const invoiceC = `INV-37C-${suiteRunId}`;
  const scenario: EntryScenario = {
    caseId: '37',
    focus: 'One entry with 12 articles',
    importerKey: 'IMP-ALPHA-01',
    importerDisplayName: `Importer Alpha ${suiteRunId}`,
    importerCode: `IA${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-WC-SEA-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-37-${suiteRunId}`,
    conveyanceName: 'UI DENSE 37',
    tripIdentifier: 'UD337',
    suretyCode: '036',
    bondNumber: `B37${suiteRunId.slice(-4)}`,
    houseBill: `HB37${suiteRunId}`,
    masterBill: `MB37${suiteRunId}`,
    totalEnteredValue: 12000,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-WC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-037' }],
    invoices: [
      { invoiceNumber: invoiceA, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 4000, vendorName: 'Vendor Dense 37A' },
      { invoiceNumber: invoiceB, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 4000, vendorName: 'Vendor Dense 37B' },
      { invoiceNumber: invoiceC, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 4000, vendorName: 'Vendor Dense 37C' },
    ],
    articles: [
      { articleLineNo: '1', description: 'Synthetic article 37-1', invoiceNumber: invoiceA, shipmentNo, lineItemIdentifier: 'Q11', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 55, enteredValue: 800, harborMaintenanceFee: 1.8, merchandiseProcessingFee: 2.4 },
      { articleLineNo: '2', description: 'Synthetic article 37-2', invoiceNumber: invoiceA, shipmentNo, lineItemIdentifier: 'Q12', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 58, enteredValue: 900, harborMaintenanceFee: 1.9, merchandiseProcessingFee: 2.5 },
      { articleLineNo: '3', description: 'Synthetic article 37-3', invoiceNumber: invoiceA, shipmentNo, lineItemIdentifier: 'Q13', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 61, enteredValue: 1100, harborMaintenanceFee: 2.0, merchandiseProcessingFee: 2.6 },
      { articleLineNo: '4', description: 'Synthetic article 37-4', invoiceNumber: invoiceA, shipmentNo, lineItemIdentifier: 'Q14', countryOfOrigin: 'KR', countryOfExport: 'KR', grossWeight: 64, enteredValue: 1200, harborMaintenanceFee: 2.1, merchandiseProcessingFee: 2.7 },
      { articleLineNo: '5', description: 'Synthetic article 37-5', invoiceNumber: invoiceB, shipmentNo, lineItemIdentifier: 'Q15', countryOfOrigin: 'US', countryOfExport: 'CA', grossWeight: 52, enteredValue: 700, harborMaintenanceFee: 1.7, merchandiseProcessingFee: 2.3 },
      { articleLineNo: '6', description: 'Synthetic article 37-6', invoiceNumber: invoiceB, shipmentNo, lineItemIdentifier: 'Q16', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 59, enteredValue: 1000, harborMaintenanceFee: 1.95, merchandiseProcessingFee: 2.55 },
      { articleLineNo: '7', description: 'Synthetic article 37-7', invoiceNumber: invoiceB, shipmentNo, lineItemIdentifier: 'Q17', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 63, enteredValue: 1100, harborMaintenanceFee: 2.05, merchandiseProcessingFee: 2.65 },
      { articleLineNo: '8', description: 'Synthetic article 37-8', invoiceNumber: invoiceB, shipmentNo, lineItemIdentifier: 'Q18', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 66, enteredValue: 1200, harborMaintenanceFee: 2.15, merchandiseProcessingFee: 2.75 },
      { articleLineNo: '9', description: 'Synthetic article 37-9', invoiceNumber: invoiceC, shipmentNo, lineItemIdentifier: 'Q19', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 56, enteredValue: 850, harborMaintenanceFee: 1.85, merchandiseProcessingFee: 2.45 },
      { articleLineNo: '10', description: 'Synthetic article 37-10', invoiceNumber: invoiceC, shipmentNo, lineItemIdentifier: 'R10', countryOfOrigin: 'US', countryOfExport: 'MX', grossWeight: 60, enteredValue: 950, harborMaintenanceFee: 1.95, merchandiseProcessingFee: 2.55 },
      { articleLineNo: '11', description: 'Synthetic article 37-11', invoiceNumber: invoiceC, shipmentNo, lineItemIdentifier: 'R11', countryOfOrigin: 'KR', countryOfExport: 'KR', grossWeight: 67, enteredValue: 1300, harborMaintenanceFee: 2.2, merchandiseProcessingFee: 2.8 },
      { articleLineNo: '12', description: 'Synthetic article 37-12', invoiceNumber: invoiceC, shipmentNo, lineItemIdentifier: 'R12', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 69, enteredValue: 1100, harborMaintenanceFee: 2.05, merchandiseProcessingFee: 2.65 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 800, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '2', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 900, countryOfOrigin: 'CN' },
      { lineNo: '3', articleLineNo: '2', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'KG', enteredValue: 900, countryOfOrigin: 'CN' },
      { lineNo: '4', articleLineNo: '3', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'JP' },
      { lineNo: '5', articleLineNo: '4', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'KR' },
      { lineNo: '6', articleLineNo: '4', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'KR' },
      { lineNo: '7', articleLineNo: '5', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 700, countryOfOrigin: 'US' },
      { lineNo: '8', articleLineNo: '6', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '9', articleLineNo: '7', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'CN' },
      { lineNo: '10', articleLineNo: '7', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'CN' },
      { lineNo: '11', articleLineNo: '8', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'JP' },
      { lineNo: '12', articleLineNo: '9', shipmentNo, invoiceNumber: invoiceC, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 850, countryOfOrigin: 'CN' },
      { lineNo: '13', articleLineNo: '9', shipmentNo, invoiceNumber: invoiceC, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'KG', enteredValue: 850, countryOfOrigin: 'CN' },
      { lineNo: '14', articleLineNo: '10', shipmentNo, invoiceNumber: invoiceC, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 950, countryOfOrigin: 'US' },
      { lineNo: '15', articleLineNo: '11', shipmentNo, invoiceNumber: invoiceC, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 1300, countryOfOrigin: 'KR' },
      { lineNo: '16', articleLineNo: '11', shipmentNo, invoiceNumber: invoiceC, hsCode: 'HTS-CH99-C', quantity: 1, uom: 'NO', enteredValue: 1300, countryOfOrigin: 'KR' },
      { lineNo: '17', articleLineNo: '12', shipmentNo, invoiceNumber: invoiceC, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'CN' },
      { lineNo: '18', articleLineNo: '12', shipmentNo, invoiceNumber: invoiceC, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-OCEAN-01', {
    display_name: `Carrier Ocean ${suiteRunId}`,
    carrier_code: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 38', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `38${suiteRunId}`;
  const invoiceA = `INV-38A-${suiteRunId}`;
  const invoiceB = `INV-38B-${suiteRunId}`;
  const invoiceC = `INV-38C-${suiteRunId}`;
  const invoiceD = `INV-38D-${suiteRunId}`;
  const scenario: EntryScenario = {
    caseId: '38',
    focus: 'One entry with 14 articles',
    importerKey: 'IMP-FOXTROT-01',
    importerDisplayName: `Importer Foxtrot ${suiteRunId}`,
    importerCode: `IF${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-WC-SEA-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-2',
    clientRef: `UI-CASE-38-${suiteRunId}`,
    conveyanceName: 'UI DENSE 38',
    tripIdentifier: 'UD338',
    suretyCode: '036',
    bondNumber: `B38${suiteRunId.slice(-4)}`,
    houseBill: `HB38${suiteRunId}`,
    masterBill: `MB38${suiteRunId}`,
    totalEnteredValue: 15400,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-WC-SEA-1', portOfUnlading: 'PORT-EC-SEA-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-038' }],
    invoices: [
      { invoiceNumber: invoiceA, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 3600, vendorName: 'Vendor Dense 38A' },
      { invoiceNumber: invoiceB, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 3800, vendorName: 'Vendor Dense 38B' },
      { invoiceNumber: invoiceC, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 4000, vendorName: 'Vendor Dense 38C' },
      { invoiceNumber: invoiceD, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 4000, vendorName: 'Vendor Dense 38D' },
    ],
    articles: [
      { articleLineNo: '1', description: 'Synthetic article 38-1', invoiceNumber: invoiceA, shipmentNo, lineItemIdentifier: 'S11', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 48, enteredValue: 700, harborMaintenanceFee: 1.5, merchandiseProcessingFee: 2.1 },
      { articleLineNo: '2', description: 'Synthetic article 38-2', invoiceNumber: invoiceA, shipmentNo, lineItemIdentifier: 'S12', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 52, enteredValue: 850, harborMaintenanceFee: 1.65, merchandiseProcessingFee: 2.25 },
      { articleLineNo: '3', description: 'Synthetic article 38-3', invoiceNumber: invoiceA, shipmentNo, lineItemIdentifier: 'S13', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 56, enteredValue: 1000, harborMaintenanceFee: 1.8, merchandiseProcessingFee: 2.4 },
      { articleLineNo: '4', description: 'Synthetic article 38-4', invoiceNumber: invoiceA, shipmentNo, lineItemIdentifier: 'S14', countryOfOrigin: 'KR', countryOfExport: 'KR', grossWeight: 60, enteredValue: 1050, harborMaintenanceFee: 1.9, merchandiseProcessingFee: 2.5 },
      { articleLineNo: '5', description: 'Synthetic article 38-5', invoiceNumber: invoiceB, shipmentNo, lineItemIdentifier: 'S15', countryOfOrigin: 'US', countryOfExport: 'CA', grossWeight: 54, enteredValue: 800, harborMaintenanceFee: 1.6, merchandiseProcessingFee: 2.2 },
      { articleLineNo: '6', description: 'Synthetic article 38-6', invoiceNumber: invoiceB, shipmentNo, lineItemIdentifier: 'S16', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 58, enteredValue: 950, harborMaintenanceFee: 1.75, merchandiseProcessingFee: 2.35 },
      { articleLineNo: '7', description: 'Synthetic article 38-7', invoiceNumber: invoiceB, shipmentNo, lineItemIdentifier: 'S17', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 62, enteredValue: 1000, harborMaintenanceFee: 1.85, merchandiseProcessingFee: 2.45 },
      { articleLineNo: '8', description: 'Synthetic article 38-8', invoiceNumber: invoiceB, shipmentNo, lineItemIdentifier: 'S18', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 66, enteredValue: 1050, harborMaintenanceFee: 1.95, merchandiseProcessingFee: 2.55 },
      { articleLineNo: '9', description: 'Synthetic article 38-9', invoiceNumber: invoiceC, shipmentNo, lineItemIdentifier: 'S19', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 50, enteredValue: 900, harborMaintenanceFee: 1.7, merchandiseProcessingFee: 2.3 },
      { articleLineNo: '10', description: 'Synthetic article 38-10', invoiceNumber: invoiceC, shipmentNo, lineItemIdentifier: 'T10', countryOfOrigin: 'US', countryOfExport: 'MX', grossWeight: 57, enteredValue: 950, harborMaintenanceFee: 1.75, merchandiseProcessingFee: 2.35 },
      { articleLineNo: '11', description: 'Synthetic article 38-11', invoiceNumber: invoiceC, shipmentNo, lineItemIdentifier: 'T11', countryOfOrigin: 'KR', countryOfExport: 'KR', grossWeight: 64, enteredValue: 1050, harborMaintenanceFee: 1.9, merchandiseProcessingFee: 2.5 },
      { articleLineNo: '12', description: 'Synthetic article 38-12', invoiceNumber: invoiceD, shipmentNo, lineItemIdentifier: 'T12', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 59, enteredValue: 1000, harborMaintenanceFee: 1.8, merchandiseProcessingFee: 2.4 },
      { articleLineNo: '13', description: 'Synthetic article 38-13', invoiceNumber: invoiceD, shipmentNo, lineItemIdentifier: 'T13', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 63, enteredValue: 1100, harborMaintenanceFee: 1.95, merchandiseProcessingFee: 2.55 },
      { articleLineNo: '14', description: 'Synthetic article 38-14', invoiceNumber: invoiceD, shipmentNo, lineItemIdentifier: 'T14', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 68, enteredValue: 1200, harborMaintenanceFee: 2.05, merchandiseProcessingFee: 2.65 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 700, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '2', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 850, countryOfOrigin: 'CN' },
      { lineNo: '3', articleLineNo: '2', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'KG', enteredValue: 850, countryOfOrigin: 'CN' },
      { lineNo: '4', articleLineNo: '3', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'JP' },
      { lineNo: '5', articleLineNo: '4', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 1050, countryOfOrigin: 'KR' },
      { lineNo: '6', articleLineNo: '4', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1050, countryOfOrigin: 'KR' },
      { lineNo: '7', articleLineNo: '5', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 800, countryOfOrigin: 'US' },
      { lineNo: '8', articleLineNo: '6', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 950, countryOfOrigin: 'CN' },
      { lineNo: '9', articleLineNo: '7', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '10', articleLineNo: '7', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '11', articleLineNo: '8', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1050, countryOfOrigin: 'JP' },
      { lineNo: '12', articleLineNo: '9', shipmentNo, invoiceNumber: invoiceC, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 900, countryOfOrigin: 'CN' },
      { lineNo: '13', articleLineNo: '9', shipmentNo, invoiceNumber: invoiceC, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'KG', enteredValue: 900, countryOfOrigin: 'CN' },
      { lineNo: '14', articleLineNo: '10', shipmentNo, invoiceNumber: invoiceC, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 950, countryOfOrigin: 'US' },
      { lineNo: '15', articleLineNo: '11', shipmentNo, invoiceNumber: invoiceC, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 1050, countryOfOrigin: 'KR' },
      { lineNo: '16', articleLineNo: '11', shipmentNo, invoiceNumber: invoiceC, hsCode: 'HTS-CH99-C', quantity: 1, uom: 'NO', enteredValue: 1050, countryOfOrigin: 'KR' },
      { lineNo: '17', articleLineNo: '12', shipmentNo, invoiceNumber: invoiceD, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '18', articleLineNo: '12', shipmentNo, invoiceNumber: invoiceD, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '19', articleLineNo: '13', shipmentNo, invoiceNumber: invoiceD, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'JP' },
      { lineNo: '20', articleLineNo: '14', shipmentNo, invoiceNumber: invoiceD, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 1200, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-OCEAN-01', {
    display_name: `Carrier Ocean ${suiteRunId}`,
    carrier_code: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 40', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `40${suiteRunId}`;
  const invoiceNo = `INV-40-${suiteRunId}`;
  const scenario: EntryScenario = {
    caseId: '40',
    focus: 'One article four tariffs',
    importerKey: 'IMP-BRAVO-01',
    importerDisplayName: `Importer Bravo ${suiteRunId}`,
    importerCode: `IB${suiteRunId}`,
    carrierKey: 'CAR-RAIL-01',
    carrierDisplayName: `Carrier Rail ${suiteRunId}`,
    carrierCode: Number(`2${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '21',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-RAIL-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-40-${suiteRunId}`,
    conveyanceName: 'UI STACK 40',
    tripIdentifier: 'US340',
    suretyCode: '036',
    bondNumber: `B40${suiteRunId.slice(-4)}`,
    houseBill: `HB40${suiteRunId}`,
    masterBill: `MB40${suiteRunId}`,
    totalEnteredValue: 2400,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '21', carrierName: 'CAR-RAIL-01', portOfEntry: 'PORT-RAIL-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-02', voyageOrFlight: 'RAIL-040' }],
    invoices: [{ invoiceNumber: invoiceNo, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 2400, vendorName: 'Vendor Stack 40' }],
    articles: [
      { articleLineNo: '1', description: 'Synthetic stacked tire article', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'U40', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 175, enteredValue: 2400, harborMaintenanceFee: 0, merchandiseProcessingFee: 4.5 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-TIRE-01', quantity: 1, uom: 'NO', enteredValue: 2400, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 2400, countryOfOrigin: 'CN' },
      { lineNo: '3', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 2400, countryOfOrigin: 'CN' },
      { lineNo: '4', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-CH99-C', quantity: 1, uom: 'NO', enteredValue: 2400, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-RAIL-01', {
    display_name: `Carrier Rail ${suiteRunId}`,
    carrier_code: Number(`2${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 41', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `41${suiteRunId}`;
  const invoiceNo = `INV-41-${suiteRunId}`;
  const scenario: EntryScenario = {
    caseId: '41',
    focus: 'Multi-article mixed tariff depths',
    importerKey: 'IMP-DELTA-01',
    importerDisplayName: `Importer Delta ${suiteRunId}`,
    importerCode: `ID${suiteRunId}`,
    carrierKey: 'CAR-AIR-01',
    carrierDisplayName: `Carrier Air ${suiteRunId}`,
    carrierCode: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '40',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-AIR-2',
    portOfUnladingSymbol: 'PORT-AIR-2',
    clientRef: `UI-CASE-41-${suiteRunId}`,
    conveyanceName: 'UI MIX 41',
    tripIdentifier: 'UM341',
    suretyCode: '036',
    bondNumber: `B41${suiteRunId.slice(-4)}`,
    houseBill: `HB41${suiteRunId}`,
    masterBill: `MB41${suiteRunId}`,
    totalEnteredValue: 3600,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '40', carrierName: 'CAR-AIR-01', portOfEntry: 'PORT-AIR-2', portOfUnlading: 'PORT-AIR-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-041' }],
    invoices: [{ invoiceNumber: invoiceNo, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 3600, vendorName: 'Vendor Mix 41' }],
    articles: [
      { articleLineNo: '1', description: 'Synthetic mixed tariff article base only', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'V11', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 25, enteredValue: 1000, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.5 },
      { articleLineNo: '2', description: 'Synthetic mixed tariff article one overlay', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'V12', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 27, enteredValue: 1200, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.7 },
      { articleLineNo: '3', description: 'Synthetic mixed tariff article two overlays', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'V13', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 29, enteredValue: 1400, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.9 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'JP' },
      { lineNo: '2', articleLineNo: '2', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'CN' },
      { lineNo: '3', articleLineNo: '2', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'CN' },
      { lineNo: '4', articleLineNo: '3', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 1400, countryOfOrigin: 'CN' },
      { lineNo: '5', articleLineNo: '3', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1400, countryOfOrigin: 'CN' },
      { lineNo: '6', articleLineNo: '3', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1400, countryOfOrigin: 'CN' },
      { lineNo: '7', articleLineNo: '3', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-CH99-C', quantity: 1, uom: 'NO', enteredValue: 1400, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-AIR-01', {
    display_name: `Carrier Air ${suiteRunId}`,
    carrier_code: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    carrier_type: 'Air',
    airway_bill_prefix: '001',
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 42', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `42${suiteRunId}`;
  const invoiceA = `INV-42A-${suiteRunId}`;
  const invoiceB = `INV-42B-${suiteRunId}`;
  const scenario: EntryScenario = {
    caseId: '42',
    focus: 'High tariff-count stress case',
    importerKey: 'IMP-FOXTROT-01',
    importerDisplayName: `Importer Foxtrot ${suiteRunId}`,
    importerCode: `IF${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-WC-SEA-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-42-${suiteRunId}`,
    conveyanceName: 'UI STACK 42',
    tripIdentifier: 'US342',
    suretyCode: '036',
    bondNumber: `B42${suiteRunId.slice(-4)}`,
    houseBill: `HB42${suiteRunId}`,
    masterBill: `MB42${suiteRunId}`,
    totalEnteredValue: 9600,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-WC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-042' }],
    invoices: [
      { invoiceNumber: invoiceA, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 4800, vendorName: 'Vendor Stack 42A' },
      { invoiceNumber: invoiceB, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 4800, vendorName: 'Vendor Stack 42B' },
    ],
    articles: [
      { articleLineNo: '1', description: 'Synthetic stress article 42-1', invoiceNumber: invoiceA, shipmentNo, lineItemIdentifier: 'W11', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 44, enteredValue: 1000, harborMaintenanceFee: 2.0, merchandiseProcessingFee: 2.6 },
      { articleLineNo: '2', description: 'Synthetic stress article 42-2', invoiceNumber: invoiceA, shipmentNo, lineItemIdentifier: 'W12', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 46, enteredValue: 1100, harborMaintenanceFee: 2.1, merchandiseProcessingFee: 2.7 },
      { articleLineNo: '3', description: 'Synthetic stress article 42-3', invoiceNumber: invoiceA, shipmentNo, lineItemIdentifier: 'W13', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 48, enteredValue: 1200, harborMaintenanceFee: 2.2, merchandiseProcessingFee: 2.8 },
      { articleLineNo: '4', description: 'Synthetic stress article 42-4', invoiceNumber: invoiceA, shipmentNo, lineItemIdentifier: 'W14', countryOfOrigin: 'KR', countryOfExport: 'KR', grossWeight: 50, enteredValue: 1500, harborMaintenanceFee: 2.3, merchandiseProcessingFee: 2.9 },
      { articleLineNo: '5', description: 'Synthetic stress article 42-5', invoiceNumber: invoiceB, shipmentNo, lineItemIdentifier: 'W15', countryOfOrigin: 'US', countryOfExport: 'CA', grossWeight: 45, enteredValue: 900, harborMaintenanceFee: 1.9, merchandiseProcessingFee: 2.5 },
      { articleLineNo: '6', description: 'Synthetic stress article 42-6', invoiceNumber: invoiceB, shipmentNo, lineItemIdentifier: 'W16', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 47, enteredValue: 1000, harborMaintenanceFee: 2.0, merchandiseProcessingFee: 2.6 },
      { articleLineNo: '7', description: 'Synthetic stress article 42-7', invoiceNumber: invoiceB, shipmentNo, lineItemIdentifier: 'W17', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 49, enteredValue: 1200, harborMaintenanceFee: 2.2, merchandiseProcessingFee: 2.8 },
      { articleLineNo: '8', description: 'Synthetic stress article 42-8', invoiceNumber: invoiceB, shipmentNo, lineItemIdentifier: 'W18', countryOfOrigin: 'KR', countryOfExport: 'KR', grossWeight: 51, enteredValue: 1700, harborMaintenanceFee: 2.4, merchandiseProcessingFee: 3.0 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'KG', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '3', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'KG', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '4', articleLineNo: '2', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'CN' },
      { lineNo: '5', articleLineNo: '2', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'CN' },
      { lineNo: '6', articleLineNo: '2', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'CN' },
      { lineNo: '7', articleLineNo: '3', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'JP' },
      { lineNo: '8', articleLineNo: '3', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'JP' },
      { lineNo: '9', articleLineNo: '3', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'JP' },
      { lineNo: '10', articleLineNo: '4', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 1500, countryOfOrigin: 'KR' },
      { lineNo: '11', articleLineNo: '4', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1500, countryOfOrigin: 'KR' },
      { lineNo: '12', articleLineNo: '4', shipmentNo, invoiceNumber: invoiceA, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1500, countryOfOrigin: 'KR' },
      { lineNo: '13', articleLineNo: '5', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 900, countryOfOrigin: 'US' },
      { lineNo: '14', articleLineNo: '5', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'KG', enteredValue: 900, countryOfOrigin: 'US' },
      { lineNo: '15', articleLineNo: '5', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'KG', enteredValue: 900, countryOfOrigin: 'US' },
      { lineNo: '16', articleLineNo: '6', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '17', articleLineNo: '6', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '18', articleLineNo: '6', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '19', articleLineNo: '7', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'CN' },
      { lineNo: '20', articleLineNo: '7', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'CN' },
      { lineNo: '21', articleLineNo: '7', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'CN' },
      { lineNo: '22', articleLineNo: '8', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 1700, countryOfOrigin: 'KR' },
      { lineNo: '23', articleLineNo: '8', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1700, countryOfOrigin: 'KR' },
      { lineNo: '24', articleLineNo: '8', shipmentNo, invoiceNumber: invoiceB, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1700, countryOfOrigin: 'KR' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-OCEAN-01', {
    display_name: `Carrier Ocean ${suiteRunId}`,
    carrier_code: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 43', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `43${suiteRunId}`;
  const invoiceNo = `INV-43-${suiteRunId}`;
  const scenario: EntryScenario = {
    caseId: '43',
    focus: 'Payment type 3 baseline',
    importerKey: 'IMP-ALPHA-01',
    importerDisplayName: `Importer Alpha ${suiteRunId}`,
    importerCode: `IA${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '11',
    paymentType: '3',
    bondType: '8',
    portOfEntrySymbol: 'PORT-EC-SEA-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-43-${suiteRunId}`,
    conveyanceName: 'UI PT3 43',
    tripIdentifier: 'UP343',
    suretyCode: '036',
    bondNumber: `B43${suiteRunId.slice(-4)}`,
    houseBill: `HB43${suiteRunId}`,
    masterBill: `MB43${suiteRunId}`,
    totalEnteredValue: 1300,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-043' }],
    invoices: [{ invoiceNumber: invoiceNo, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1300, vendorName: 'Vendor PT3 43' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic payment type 3 paper article', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'X43', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 72, enteredValue: 1300, harborMaintenanceFee: 2.4, merchandiseProcessingFee: 3.2 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 1300, countryOfOrigin: 'CN' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-OCEAN-01', {
    display_name: `Carrier Ocean ${suiteRunId}`,
    carrier_code: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});

test('batch A case 44', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `44${suiteRunId}`;
  const invoiceNo = `INV-44-${suiteRunId}`;
  const scenario: EntryScenario = {
    caseId: '44',
    focus: 'Single transaction bond baseline',
    importerKey: 'IMP-DELTA-01',
    importerDisplayName: `Importer Delta ${suiteRunId}`,
    importerCode: `ID${suiteRunId}`,
    carrierKey: 'CAR-AIR-01',
    carrierDisplayName: `Carrier Air ${suiteRunId}`,
    carrierCode: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '40',
    paymentType: '2',
    bondType: '9',
    portOfEntrySymbol: 'PORT-AIR-1',
    portOfUnladingSymbol: 'PORT-AIR-1',
    clientRef: `UI-CASE-44-${suiteRunId}`,
    conveyanceName: 'UI BOND 44',
    tripIdentifier: 'UB344',
    suretyCode: '036',
    bondNumber: `B44${suiteRunId.slice(-4)}`,
    houseBill: `HB44${suiteRunId}`,
    masterBill: `MB44${suiteRunId}`,
    totalEnteredValue: 1450,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '40', carrierName: 'CAR-AIR-01', portOfEntry: 'PORT-AIR-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-044' }],
    invoices: [{ invoiceNumber: invoiceNo, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1450, vendorName: 'Vendor Bond 44' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic single-transaction consumer article', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'X44', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 24, enteredValue: 1450, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.85 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1450, countryOfOrigin: 'JP' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-AIR-01', {
    display_name: `Carrier Air ${suiteRunId}`,
    carrier_code: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    carrier_type: 'Air',
    airway_bill_prefix: '001',
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 45', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `45${suiteRunId}`;
  const invoiceNo = `INV-45-${suiteRunId}`;
  const scenario: EntryScenario = {
    caseId: '45',
    focus: 'Payment type 3 plus bond type 9',
    importerKey: 'IMP-HOTEL-01',
    importerDisplayName: `Importer Hotel ${suiteRunId}`,
    importerCode: `IH${suiteRunId}`,
    carrierKey: 'CAR-TRUCK-01',
    carrierDisplayName: `Carrier Truck ${suiteRunId}`,
    carrierCode: Number(`3${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '30',
    paymentType: '3',
    bondType: '9',
    portOfEntrySymbol: 'PORT-ROAD-1',
    portOfUnladingSymbol: 'PORT-ROAD-1',
    clientRef: `UI-CASE-45-${suiteRunId}`,
    conveyanceName: 'UI MIX 45',
    tripIdentifier: 'UM345',
    suretyCode: '036',
    bondNumber: `B45${suiteRunId.slice(-4)}`,
    houseBill: `HB45${suiteRunId}`,
    masterBill: `MB45${suiteRunId}`,
    totalEnteredValue: 2100,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '30', carrierName: 'CAR-TRUCK-01', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-ROAD-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'TRK-045' }],
    invoices: [{ invoiceNumber: invoiceNo, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 2100, vendorName: 'Vendor Mix 45' }],
    articles: [
      { articleLineNo: '1', description: 'Synthetic mixed payment/bond food article', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'Y45', countryOfOrigin: 'US', countryOfExport: 'CA', grossWeight: 88, enteredValue: 1100, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.1 },
      { articleLineNo: '2', description: 'Synthetic mixed payment/bond overlay article', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'Y46', countryOfOrigin: 'US', countryOfExport: 'CA', grossWeight: 90, enteredValue: 1000, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.0 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 1100, countryOfOrigin: 'US' },
      { lineNo: '2', articleLineNo: '2', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 1000, countryOfOrigin: 'US' },
      { lineNo: '3', articleLineNo: '2', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-CH99-C', quantity: 1, uom: 'KG', enteredValue: 1000, countryOfOrigin: 'US' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-TRUCK-01', {
    display_name: `Carrier Truck ${suiteRunId}`,
    carrier_code: Number(`3${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 46', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `46${suiteRunId}`;
  const invoiceNo = `INV-46-${suiteRunId}`;
  const scenario: EntryScenario = {
    caseId: '46',
    focus: 'Port of entry differs from unlading',
    importerKey: 'IMP-ALPHA-01',
    importerDisplayName: `Importer Alpha ${suiteRunId}`,
    importerCode: `IA${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-WC-SEA-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-46-${suiteRunId}`,
    conveyanceName: 'UI PORT 46',
    tripIdentifier: 'UP346',
    suretyCode: '036',
    bondNumber: `B46${suiteRunId.slice(-4)}`,
    houseBill: `HB46${suiteRunId}`,
    masterBill: `MB46${suiteRunId}`,
    totalEnteredValue: 1750,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-WC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-046' }],
    invoices: [{ invoiceNumber: invoiceNo, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1750, vendorName: 'Vendor Port 46' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic furniture article with distinct ports', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'Z46', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 96, enteredValue: 1750, harborMaintenanceFee: 3.1, merchandiseProcessingFee: 4.1 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-FURNITURE-01', quantity: 1, uom: 'NO', enteredValue: 1750, countryOfOrigin: 'CN' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-OCEAN-01', {
    display_name: `Carrier Ocean ${suiteRunId}`,
    carrier_code: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 47', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `47${suiteRunId}`;
  const invoiceNo = `INV-47-${suiteRunId}`;
  const scenario: EntryScenario = {
    caseId: '47',
    focus: 'Shipment origin/export diversity',
    importerKey: 'IMP-FOXTROT-01',
    importerDisplayName: `Importer Foxtrot ${suiteRunId}`,
    importerCode: `IF${suiteRunId}`,
    carrierKey: 'CAR-OCEAN-01',
    carrierDisplayName: `Carrier Ocean ${suiteRunId}`,
    carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '11',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-WC-SEA-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-2',
    clientRef: `UI-CASE-47-${suiteRunId}`,
    conveyanceName: 'UI ORIGIN 47',
    tripIdentifier: 'UO347',
    suretyCode: '036',
    bondNumber: `B47${suiteRunId.slice(-4)}`,
    houseBill: `HB47${suiteRunId}`,
    masterBill: `MB47${suiteRunId}`,
    totalEnteredValue: 2600,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-WC-SEA-1', portOfUnlading: 'PORT-EC-SEA-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-047' }],
    invoices: [{ invoiceNumber: invoiceNo, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 2600, vendorName: 'Vendor Origin 47' }],
    articles: [
      { articleLineNo: '1', description: 'Synthetic origin/export article one', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'Z47', countryOfOrigin: 'VN', countryOfExport: 'CN', grossWeight: 82, enteredValue: 1300, harborMaintenanceFee: 2.6, merchandiseProcessingFee: 3.4 },
      { articleLineNo: '2', description: 'Synthetic origin/export article two', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'Z48', countryOfOrigin: 'TH', countryOfExport: 'MY', grossWeight: 84, enteredValue: 1300, harborMaintenanceFee: 2.6, merchandiseProcessingFee: 3.4 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-FURNITURE-01', quantity: 1, uom: 'NO', enteredValue: 1300, countryOfOrigin: 'VN' },
      { lineNo: '2', articleLineNo: '2', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-FURNITURE-01', quantity: 1, uom: 'NO', enteredValue: 1300, countryOfOrigin: 'TH' },
      { lineNo: '3', articleLineNo: '2', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1300, countryOfOrigin: 'TH' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-OCEAN-01', {
    display_name: `Carrier Ocean ${suiteRunId}`,
    carrier_code: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 48', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `48${suiteRunId}`;
  const invoiceNo = `INV-48-${suiteRunId}`;
  const scenario: EntryScenario = {
    caseId: '48',
    focus: 'Reuse importer across very different modes',
    importerKey: 'IMP-ALPHA-01',
    importerDisplayName: `Importer Alpha ${suiteRunId}`,
    importerCode: `IA${suiteRunId}`,
    carrierKey: 'CAR-RAIL-01',
    carrierDisplayName: `Carrier Rail ${suiteRunId}`,
    carrierCode: Number(`2${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '21',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-RAIL-1',
    portOfUnladingSymbol: 'PORT-EC-SEA-1',
    clientRef: `UI-CASE-48-${suiteRunId}`,
    conveyanceName: 'UI REUSE 48',
    tripIdentifier: 'UR348',
    suretyCode: '036',
    bondNumber: `B48${suiteRunId.slice(-4)}`,
    houseBill: `HB48${suiteRunId}`,
    masterBill: `MB48${suiteRunId}`,
    totalEnteredValue: 1600,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '21', carrierName: 'CAR-RAIL-01', portOfEntry: 'PORT-RAIL-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-02', voyageOrFlight: 'RAIL-048' }],
    invoices: [{ invoiceNumber: invoiceNo, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1600, vendorName: 'Vendor Reuse 48' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic rail plastic article with reused importer', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'Z81', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 77, enteredValue: 1600, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.2 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1600, countryOfOrigin: 'CN' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-RAIL-01', {
    display_name: `Carrier Rail ${suiteRunId}`,
    carrier_code: Number(`2${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 49', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `49${suiteRunId}`;
  const invoiceNo = `INV-49-${suiteRunId}`;
  const scenario: EntryScenario = {
    caseId: '49',
    focus: 'Reuse carrier across multiple importers',
    importerKey: 'IMP-SIERRA-01',
    importerDisplayName: `Importer Sierra ${suiteRunId}`,
    importerCode: `IS${suiteRunId}`,
    carrierKey: 'CAR-AIR-01',
    carrierDisplayName: `Carrier Air ${suiteRunId}`,
    carrierCode: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '40',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-AIR-2',
    portOfUnladingSymbol: 'PORT-AIR-2',
    clientRef: `UI-CASE-49-${suiteRunId}`,
    conveyanceName: 'UI REUSE 49',
    tripIdentifier: 'UR349',
    suretyCode: '036',
    bondNumber: `B49${suiteRunId.slice(-4)}`,
    houseBill: `HB49${suiteRunId}`,
    masterBill: `MB49${suiteRunId}`,
    totalEnteredValue: 1550,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '40', carrierName: 'CAR-AIR-01', portOfEntry: 'PORT-AIR-2', portOfUnlading: 'PORT-AIR-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-049' }],
    invoices: [{ invoiceNumber: invoiceNo, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1550, vendorName: 'Vendor Reuse 49' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic air consumer article with new importer', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'Z91', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 26, enteredValue: 1550, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.95 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1550, countryOfOrigin: 'JP' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-AIR-01', {
    display_name: `Carrier Air ${suiteRunId}`,
    carrier_code: Number(`5${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    carrier_type: 'Air',
    airway_bill_prefix: '001',
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('batch A case 50', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentOcean = `501${suiteRunId}`;
  const shipmentTruck = `502${suiteRunId}`;
  const shipmentAir = `503${suiteRunId}`;
  const invA1 = `INV-50A1-${suiteRunId}`;
  const invA2 = `INV-50A2-${suiteRunId}`;
  const invB1 = `INV-50B1-${suiteRunId}`;
  const invC1 = `INV-50C1-${suiteRunId}`;
  const invC2 = `INV-50C2-${suiteRunId}`;
  const htsNew = '4404200080';
  const scenario: EntryScenario = {
    caseId: '50',
    focus: 'Full mixed-complexity capstone',
    importerKey: 'IMP-TANGO-01',
    importerDisplayName: `Importer Tango ${suiteRunId}`,
    importerCode: `IT${suiteRunId}`,
    carrierKey: 'CAR-AIR-CAP-01',
    carrierDisplayName: `Carrier Air Cap ${suiteRunId}`,
    carrierCode: Number(`7${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '03',
    transportMode: '11',
    paymentType: '3',
    bondType: '9',
    portOfEntrySymbol: 'PORT-EC-SEA-1',
    portOfUnladingSymbol: 'PORT-NEW-1',
    clientRef: `UI-CASE-50-${suiteRunId}`,
    conveyanceName: 'UI CAPSTONE 50',
    tripIdentifier: 'UC350',
    suretyCode: '036',
    bondNumber: `B50${suiteRunId.slice(-4)}`,
    houseBill: `HB50${suiteRunId}`,
    masterBill: `MB50${suiteRunId}`,
    totalEnteredValue: 14000,
    currency: 'USD',
    shipments: [
      { shipmentNo: shipmentOcean, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-50A' },
      { shipmentNo: shipmentTruck, mode: '30', carrierName: 'CAR-TRUCK-01', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-ROAD-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'TRK-50B' },
      { shipmentNo: shipmentAir, mode: '40', carrierName: 'CAR-AIR-CAP-01', portOfEntry: 'PORT-NEW-1', portOfUnlading: 'PORT-AIR-2', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-50C' },
    ],
    invoices: [
      { invoiceNumber: invA1, shipmentNo: shipmentOcean, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 3000, vendorName: 'Vendor Capstone A1' },
      { invoiceNumber: invA2, shipmentNo: shipmentOcean, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 2500, vendorName: 'Vendor Capstone A2' },
      { invoiceNumber: invB1, shipmentNo: shipmentTruck, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 2500, vendorName: 'Vendor Capstone B1' },
      { invoiceNumber: invC1, shipmentNo: shipmentAir, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 3000, vendorName: 'Vendor Capstone C1' },
      { invoiceNumber: invC2, shipmentNo: shipmentAir, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 3000, vendorName: 'Vendor Capstone C2' },
    ],
    articles: [
      { articleLineNo: '1', description: 'Synthetic capstone article 1', invoiceNumber: invA1, shipmentNo: shipmentOcean, lineItemIdentifier: 'A01', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 48, enteredValue: 800, harborMaintenanceFee: 1.8, merchandiseProcessingFee: 2.4 },
      { articleLineNo: '2', description: 'Synthetic capstone article 2', invoiceNumber: invA1, shipmentNo: shipmentOcean, lineItemIdentifier: 'A02', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 50, enteredValue: 700, harborMaintenanceFee: 1.7, merchandiseProcessingFee: 2.3 },
      { articleLineNo: '3', description: 'Synthetic capstone article 3', invoiceNumber: invA1, shipmentNo: shipmentOcean, lineItemIdentifier: 'A03', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 52, enteredValue: 900, harborMaintenanceFee: 1.9, merchandiseProcessingFee: 2.5 },
      { articleLineNo: '4', description: 'Synthetic capstone article 4', invoiceNumber: invA1, shipmentNo: shipmentOcean, lineItemIdentifier: 'A04', countryOfOrigin: 'KR', countryOfExport: 'KR', grossWeight: 54, enteredValue: 600, harborMaintenanceFee: 1.6, merchandiseProcessingFee: 2.2 },
      { articleLineNo: '5', description: 'Synthetic capstone article 5', invoiceNumber: invA2, shipmentNo: shipmentOcean, lineItemIdentifier: 'A05', countryOfOrigin: 'US', countryOfExport: 'CA', grossWeight: 56, enteredValue: 900, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.3 },
      { articleLineNo: '6', description: 'Synthetic capstone article 6', invoiceNumber: invA2, shipmentNo: shipmentOcean, lineItemIdentifier: 'A06', countryOfOrigin: 'CN', countryOfExport: 'VN', grossWeight: 58, enteredValue: 700, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.1 },
      { articleLineNo: '7', description: 'Synthetic capstone article 7', invoiceNumber: invA2, shipmentNo: shipmentOcean, lineItemIdentifier: 'A07', countryOfOrigin: 'CN', countryOfExport: 'TH', grossWeight: 60, enteredValue: 900, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.3 },
      { articleLineNo: '8', description: 'Synthetic capstone article 8', invoiceNumber: invB1, shipmentNo: shipmentTruck, lineItemIdentifier: 'A08', countryOfOrigin: 'US', countryOfExport: 'MX', grossWeight: 62, enteredValue: 1200, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.5 },
      { articleLineNo: '9', description: 'Synthetic capstone article 9', invoiceNumber: invB1, shipmentNo: shipmentTruck, lineItemIdentifier: 'A09', countryOfOrigin: 'US', countryOfExport: 'CA', grossWeight: 64, enteredValue: 1300, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.6 },
      { articleLineNo: '10', description: 'Synthetic capstone article 10', invoiceNumber: invC1, shipmentNo: shipmentAir, lineItemIdentifier: 'A10', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 28, enteredValue: 1000, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.6 },
      { articleLineNo: '11', description: 'Synthetic capstone article 11', invoiceNumber: invC1, shipmentNo: shipmentAir, lineItemIdentifier: 'A11', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 30, enteredValue: 1000, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.6 },
      { articleLineNo: '12', description: 'Synthetic capstone article 12', invoiceNumber: invC1, shipmentNo: shipmentAir, lineItemIdentifier: 'A12', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 32, enteredValue: 1000, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.6 },
      { articleLineNo: '13', description: 'Synthetic capstone article 13', invoiceNumber: invC2, shipmentNo: shipmentAir, lineItemIdentifier: 'A13', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 34, enteredValue: 1400, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.8 },
      { articleLineNo: '14', description: 'Synthetic capstone article 14', invoiceNumber: invC2, shipmentNo: shipmentAir, lineItemIdentifier: 'A14', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 36, enteredValue: 1600, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.9 },
    ],
    tariffs: [
      { lineNo: '1', articleLineNo: '1', shipmentNo: shipmentOcean, invoiceNumber: invA1, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 800, countryOfOrigin: 'CN' },
      { lineNo: '2', articleLineNo: '1', shipmentNo: shipmentOcean, invoiceNumber: invA1, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'KG', enteredValue: 800, countryOfOrigin: 'CN' },
      { lineNo: '3', articleLineNo: '2', shipmentNo: shipmentOcean, invoiceNumber: invA1, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 700, countryOfOrigin: 'CN' },
      { lineNo: '4', articleLineNo: '3', shipmentNo: shipmentOcean, invoiceNumber: invA1, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 900, countryOfOrigin: 'JP' },
      { lineNo: '5', articleLineNo: '3', shipmentNo: shipmentOcean, invoiceNumber: invA1, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 900, countryOfOrigin: 'JP' },
      { lineNo: '6', articleLineNo: '4', shipmentNo: shipmentOcean, invoiceNumber: invA1, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 600, countryOfOrigin: 'KR' },
      { lineNo: '7', articleLineNo: '5', shipmentNo: shipmentOcean, invoiceNumber: invA2, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 900, countryOfOrigin: 'US' },
      { lineNo: '8', articleLineNo: '5', shipmentNo: shipmentOcean, invoiceNumber: invA2, hsCode: 'HTS-CH99-C', quantity: 1, uom: 'KG', enteredValue: 900, countryOfOrigin: 'US' },
      { lineNo: '9', articleLineNo: '6', shipmentNo: shipmentOcean, invoiceNumber: invA2, hsCode: htsNew, quantity: 1, uom: 'KG', enteredValue: 700, countryOfOrigin: 'CN' },
      { lineNo: '10', articleLineNo: '7', shipmentNo: shipmentOcean, invoiceNumber: invA2, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 900, countryOfOrigin: 'CN' },
      { lineNo: '11', articleLineNo: '7', shipmentNo: shipmentOcean, invoiceNumber: invA2, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 900, countryOfOrigin: 'CN' },
      { lineNo: '12', articleLineNo: '8', shipmentNo: shipmentTruck, invoiceNumber: invB1, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 1200, countryOfOrigin: 'US' },
      { lineNo: '13', articleLineNo: '9', shipmentNo: shipmentTruck, invoiceNumber: invB1, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 1300, countryOfOrigin: 'US' },
      { lineNo: '14', articleLineNo: '9', shipmentNo: shipmentTruck, invoiceNumber: invB1, hsCode: 'HTS-CH99-C', quantity: 1, uom: 'KG', enteredValue: 1300, countryOfOrigin: 'US' },
      { lineNo: '15', articleLineNo: '10', shipmentNo: shipmentAir, invoiceNumber: invC1, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'JP' },
      { lineNo: '16', articleLineNo: '10', shipmentNo: shipmentAir, invoiceNumber: invC1, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'JP' },
      { lineNo: '17', articleLineNo: '11', shipmentNo: shipmentAir, invoiceNumber: invC1, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '18', articleLineNo: '11', shipmentNo: shipmentAir, invoiceNumber: invC1, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '19', articleLineNo: '12', shipmentNo: shipmentAir, invoiceNumber: invC1, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'CN' },
      { lineNo: '20', articleLineNo: '13', shipmentNo: shipmentAir, invoiceNumber: invC2, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1400, countryOfOrigin: 'CN' },
      { lineNo: '21', articleLineNo: '13', shipmentNo: shipmentAir, invoiceNumber: invC2, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1400, countryOfOrigin: 'CN' },
      { lineNo: '22', articleLineNo: '14', shipmentNo: shipmentAir, invoiceNumber: invC2, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 1600, countryOfOrigin: 'CN' },
      { lineNo: '23', articleLineNo: '14', shipmentNo: shipmentAir, invoiceNumber: invC2, hsCode: 'HTS-CH99-A', quantity: 1, uom: 'NO', enteredValue: 1600, countryOfOrigin: 'CN' },
      { lineNo: '24', articleLineNo: '14', shipmentNo: shipmentAir, invoiceNumber: invC2, hsCode: 'HTS-CH99-B', quantity: 1, uom: 'NO', enteredValue: 1600, countryOfOrigin: 'CN' },
    ],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-OCEAN-01', {
    display_name: `Carrier Ocean ${suiteRunId}`,
    carrier_code: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-TRUCK-01', {
    display_name: `Carrier Truck ${suiteRunId}`,
    carrier_code: Number(`3${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-AIR-CAP-01', {
    display_name: `Carrier Air Cap ${suiteRunId}`,
    carrier_code: Number(`7${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    carrier_type: 'Air',
    airway_bill_prefix: '001',
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('generic case G01', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `601${suiteRunId}`;
  const invoiceNo = `INV-G01-${suiteRunId}`;
  const scenario: EntryScenario = {
    caseId: 'G01',
    focus: 'Informal low-value e-commerce parcel',
    importerKey: 'IMP-ECOM-01',
    importerDisplayName: `Importer Ecom ${suiteRunId}`,
    importerCode: `IE${suiteRunId}`,
    carrierKey: 'CAR-AIR-EXP-01',
    carrierDisplayName: `Carrier Air Express ${suiteRunId}`,
    carrierCode: Number(`8${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '11',
    transportMode: '40',
    paymentType: '3',
    bondType: '9',
    portOfEntrySymbol: 'PORT-AIR-1',
    portOfUnladingSymbol: 'PORT-AIR-1',
    clientRef: `UI-G01-${suiteRunId}`,
    conveyanceName: 'UI PARCEL G01',
    tripIdentifier: 'UG001',
    suretyCode: '036',
    bondNumber: `BG1${suiteRunId.slice(-4)}`,
    houseBill: `HBG1${suiteRunId}`,
    masterBill: `MBG1${suiteRunId}`,
    totalEnteredValue: 240,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '40', carrierName: 'CAR-AIR-EXP-01', portOfEntry: 'PORT-AIR-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-G01' }],
    invoices: [{ invoiceNumber: invoiceNo, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 240, vendorName: 'Vendor Parcel G01' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic parcel consumer article', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'G01', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 4, enteredValue: 240, harborMaintenanceFee: 0, merchandiseProcessingFee: 0.45 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 240, countryOfOrigin: 'CN' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-AIR-EXP-01', {
    display_name: `Carrier Air Express ${suiteRunId}`,
    carrier_code: Number(`8${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    carrier_type: 'Air',
    airway_bill_prefix: '002',
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('generic case G16', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const shipmentNo = `616${suiteRunId}`;
  const invoiceNo = `INV-G16-${suiteRunId}`;
  const htsNew = '4404200080';
  const scenario: EntryScenario = {
    caseId: 'G16',
    focus: 'New broker onboarding scenario',
    importerKey: 'IMP-ONBOARD-16',
    importerDisplayName: `Importer Onboard ${suiteRunId}`,
    importerCode: `IO${suiteRunId}`,
    carrierKey: 'CAR-TRUCK-NEW-16',
    carrierDisplayName: `Carrier Truck New ${suiteRunId}`,
    carrierCode: Number(`9${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    entryType: '01',
    transportMode: '30',
    paymentType: '2',
    bondType: '8',
    portOfEntrySymbol: 'PORT-NEW-1',
    portOfUnladingSymbol: 'PORT-NEW-1',
    clientRef: `UI-G16-${suiteRunId}`,
    conveyanceName: 'UI ONBOARD G16',
    tripIdentifier: 'UG016',
    suretyCode: '036',
    bondNumber: `BG16${suiteRunId.slice(-4)}`,
    houseBill: `HBG16${suiteRunId}`,
    masterBill: `MBG16${suiteRunId}`,
    totalEnteredValue: 980,
    currency: 'USD',
    shipments: [{ shipmentNo, mode: '30', carrierName: 'CAR-TRUCK-NEW-16', portOfEntry: 'PORT-NEW-1', portOfUnlading: 'PORT-NEW-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'TRK-G16' }],
    invoices: [{ invoiceNumber: invoiceNo, shipmentNo, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 980, vendorName: 'Vendor G16' }],
    articles: [{ articleLineNo: '1', description: 'Synthetic onboarding article', invoiceNumber: invoiceNo, shipmentNo, lineItemIdentifier: 'G16', countryOfOrigin: 'CA', countryOfExport: 'CA', grossWeight: 40, enteredValue: 980, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.6 }],
    tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo, invoiceNumber: invoiceNo, hsCode: htsNew, quantity: 1, uom: 'KG', enteredValue: 980, countryOfOrigin: 'CA' }],
  };
  const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
    display_name: scenario.importerDisplayName,
    importer_code: scenario.importerCode,
    contact_name: 'Ops User',
    email: `${scenario.importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Salt Lake City',
    state: 'UT',
    postal_code: '84111',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-TRUCK-NEW-16', {
    display_name: `Carrier Truck New ${suiteRunId}`,
    carrier_code: Number(`9${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
  expect(result.verification.ok).toBeTruthy();
  expect(result.verification.differences).toEqual([]);
});


test('generic case G17', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  const importerDisplayName = `Importer MultiMode ${suiteRunId}`;
  const importerCode = `IM${suiteRunId}`;
  const importerKey = 'IMP-MULTIMODE-17';
  const importerName = await ensureImporter(page, importerRegistry, importerKey, {
    display_name: importerDisplayName,
    importer_code: importerCode,
    contact_name: 'Ops User',
    email: `${importerCode.toLowerCase()}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-OCEAN-01', {
    display_name: `Carrier Ocean ${suiteRunId}`,
    carrier_code: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-RAIL-01', {
    display_name: `Carrier Rail ${suiteRunId}`,
    carrier_code: Number(`2${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });
  await ensureCarrier(page, carrierRegistry, 'CAR-TRUCK-01', {
    display_name: `Carrier Truck ${suiteRunId}`,
    carrier_code: Number(`3${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
  });

  const scenarios: EntryScenario[] = [
    {
      caseId: 'G17A', focus: 'Same importer sea mode reuse', importerKey, importerDisplayName, importerCode,
      carrierKey: 'CAR-OCEAN-01', carrierDisplayName: `Carrier Ocean ${suiteRunId}`, carrierCode: Number(suiteRunId).toString(36).toUpperCase().padStart(4, '0').slice(-4),
      entryType: '01', transportMode: '11', paymentType: '2', bondType: '8', portOfEntrySymbol: 'PORT-EC-SEA-1', portOfUnladingSymbol: 'PORT-EC-SEA-1',
      clientRef: `UI-G17A-${suiteRunId}`, conveyanceName: 'UI G17 SEA', tripIdentifier: 'UG17A', suretyCode: '036', bondNumber: `BG17A${suiteRunId.slice(-3)}`, houseBill: `HBG17A${suiteRunId}`, masterBill: `MBG17A${suiteRunId}`,
      totalEnteredValue: 1100, currency: 'USD',
      shipments: [{ shipmentNo: `717${suiteRunId}`, mode: '11', carrierName: 'CAR-OCEAN-01', portOfEntry: 'PORT-EC-SEA-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-01', voyageOrFlight: 'VOY-G17A' }],
      invoices: [{ invoiceNumber: `INV-G17A-${suiteRunId}`, shipmentNo: `717${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1100, vendorName: 'Vendor G17A' }],
      articles: [{ articleLineNo: '1', description: 'Generic G17 ocean article', invoiceNumber: `INV-G17A-${suiteRunId}`, shipmentNo: `717${suiteRunId}`, lineItemIdentifier: 'G7A', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 45, enteredValue: 1100, harborMaintenanceFee: 2.0, merchandiseProcessingFee: 2.6 }],
      tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `717${suiteRunId}`, invoiceNumber: `INV-G17A-${suiteRunId}`, hsCode: 'HTS-BASE-PAPER-01', quantity: 1, uom: 'KG', enteredValue: 1100, countryOfOrigin: 'CN' }],
    },
    {
      caseId: 'G17B', focus: 'Same importer rail mode reuse', importerKey, importerDisplayName, importerCode,
      carrierKey: 'CAR-RAIL-01', carrierDisplayName: `Carrier Rail ${suiteRunId}`, carrierCode: Number(`2${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
      entryType: '01', transportMode: '21', paymentType: '2', bondType: '8', portOfEntrySymbol: 'PORT-RAIL-1', portOfUnladingSymbol: 'PORT-EC-SEA-1',
      clientRef: `UI-G17B-${suiteRunId}`, conveyanceName: 'UI G17 RAIL', tripIdentifier: 'UG17B', suretyCode: '036', bondNumber: `BG17B${suiteRunId.slice(-3)}`, houseBill: `HBG17B${suiteRunId}`, masterBill: `MBG17B${suiteRunId}`,
      totalEnteredValue: 1200, currency: 'USD',
      shipments: [{ shipmentNo: `718${suiteRunId}`, mode: '21', carrierName: 'CAR-RAIL-01', portOfEntry: 'PORT-RAIL-1', portOfUnlading: 'PORT-EC-SEA-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-02', voyageOrFlight: 'RAIL-G17B' }],
      invoices: [{ invoiceNumber: `INV-G17B-${suiteRunId}`, shipmentNo: `718${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1200, vendorName: 'Vendor G17B' }],
      articles: [{ articleLineNo: '1', description: 'Generic G17 rail article', invoiceNumber: `INV-G17B-${suiteRunId}`, shipmentNo: `718${suiteRunId}`, lineItemIdentifier: 'G7B', countryOfOrigin: 'MX', countryOfExport: 'MX', grossWeight: 48, enteredValue: 1200, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.4 }],
      tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `718${suiteRunId}`, invoiceNumber: `INV-G17B-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1200, countryOfOrigin: 'MX' }],
    },
    {
      caseId: 'G17C', focus: 'Same importer truck mode reuse', importerKey, importerDisplayName, importerCode,
      carrierKey: 'CAR-TRUCK-01', carrierDisplayName: `Carrier Truck ${suiteRunId}`, carrierCode: Number(`3${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
      entryType: '01', transportMode: '30', paymentType: '2', bondType: '8', portOfEntrySymbol: 'PORT-ROAD-1', portOfUnladingSymbol: 'PORT-ROAD-1',
      clientRef: `UI-G17C-${suiteRunId}`, conveyanceName: 'UI G17 TRUCK', tripIdentifier: 'UG17C', suretyCode: '036', bondNumber: `BG17C${suiteRunId.slice(-3)}`, houseBill: `HBG17C${suiteRunId}`, masterBill: `MBG17C${suiteRunId}`,
      totalEnteredValue: 1300, currency: 'USD',
      shipments: [{ shipmentNo: `719${suiteRunId}`, mode: '30', carrierName: 'CAR-TRUCK-01', portOfEntry: 'PORT-ROAD-1', portOfUnlading: 'PORT-ROAD-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-04', voyageOrFlight: 'TRK-G17C' }],
      invoices: [{ invoiceNumber: `INV-G17C-${suiteRunId}`, shipmentNo: `719${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1300, vendorName: 'Vendor G17C' }],
      articles: [{ articleLineNo: '1', description: 'Generic G17 truck article', invoiceNumber: `INV-G17C-${suiteRunId}`, shipmentNo: `719${suiteRunId}`, lineItemIdentifier: 'G7C', countryOfOrigin: 'CA', countryOfExport: 'CA', grossWeight: 50, enteredValue: 1300, harborMaintenanceFee: 0, merchandiseProcessingFee: 2.5 }],
      tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `719${suiteRunId}`, invoiceNumber: `INV-G17C-${suiteRunId}`, hsCode: 'HTS-BASE-FOOD-01', quantity: 1, uom: 'KG', enteredValue: 1300, countryOfOrigin: 'CA' }],
    },
  ];

  for (const scenario of scenarios) {
    const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
    expect(result.verification.ok).toBeTruthy();
    expect(result.verification.differences).toEqual([]);
  }
});


test('generic case G18', async ({ page }) => {
  const prep = await (async () => {
    await login(page);
    return loadExecutionPrep(page);
  })();
  await ensureCarrier(page, carrierRegistry, 'CAR-AIR-SHARED-18', {
    display_name: `Carrier Air Shared ${suiteRunId}`,
    carrier_code: Number(`6${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
    carrier_type: 'Air',
    airway_bill_prefix: '003',
  });

  const scenarios: EntryScenario[] = [
    {
      caseId: 'G18A', focus: 'Shared carrier importer one', importerKey: 'IMP-G18-01', importerDisplayName: `Importer G18 One ${suiteRunId}`, importerCode: `I1${suiteRunId}`,
      carrierKey: 'CAR-AIR-SHARED-18', carrierDisplayName: `Carrier Air Shared ${suiteRunId}`, carrierCode: Number(`6${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
      entryType: '01', transportMode: '40', paymentType: '2', bondType: '8', portOfEntrySymbol: 'PORT-AIR-1', portOfUnladingSymbol: 'PORT-AIR-1',
      clientRef: `UI-G18A-${suiteRunId}`, conveyanceName: 'UI G18 AIR A', tripIdentifier: 'UG18A', suretyCode: '036', bondNumber: `BG18A${suiteRunId.slice(-3)}`, houseBill: `HBG18A${suiteRunId}`, masterBill: `MBG18A${suiteRunId}`,
      totalEnteredValue: 900, currency: 'USD',
      shipments: [{ shipmentNo: `818${suiteRunId}`, mode: '40', carrierName: 'CAR-AIR-SHARED-18', portOfEntry: 'PORT-AIR-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-G18A' }],
      invoices: [{ invoiceNumber: `INV-G18A-${suiteRunId}`, shipmentNo: `818${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 900, vendorName: 'Vendor G18A' }],
      articles: [{ articleLineNo: '1', description: 'Generic G18 importer one article', invoiceNumber: `INV-G18A-${suiteRunId}`, shipmentNo: `818${suiteRunId}`, lineItemIdentifier: 'H81', countryOfOrigin: 'JP', countryOfExport: 'JP', grossWeight: 18, enteredValue: 900, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.3 }],
      tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `818${suiteRunId}`, invoiceNumber: `INV-G18A-${suiteRunId}`, hsCode: 'HTS-BASE-CONSUMER-01', quantity: 1, uom: 'NO', enteredValue: 900, countryOfOrigin: 'JP' }],
    },
    {
      caseId: 'G18B', focus: 'Shared carrier importer two', importerKey: 'IMP-G18-02', importerDisplayName: `Importer G18 Two ${suiteRunId}`, importerCode: `I2${suiteRunId}`,
      carrierKey: 'CAR-AIR-SHARED-18', carrierDisplayName: `Carrier Air Shared ${suiteRunId}`, carrierCode: Number(`6${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
      entryType: '01', transportMode: '40', paymentType: '2', bondType: '8', portOfEntrySymbol: 'PORT-AIR-1', portOfUnladingSymbol: 'PORT-AIR-1',
      clientRef: `UI-G18B-${suiteRunId}`, conveyanceName: 'UI G18 AIR B', tripIdentifier: 'UG18B', suretyCode: '036', bondNumber: `BG18B${suiteRunId.slice(-3)}`, houseBill: `HBG18B${suiteRunId}`, masterBill: `MBG18B${suiteRunId}`,
      totalEnteredValue: 1000, currency: 'USD',
      shipments: [{ shipmentNo: `819${suiteRunId}`, mode: '40', carrierName: 'CAR-AIR-SHARED-18', portOfEntry: 'PORT-AIR-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-G18B' }],
      invoices: [{ invoiceNumber: `INV-G18B-${suiteRunId}`, shipmentNo: `819${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1000, vendorName: 'Vendor G18B' }],
      articles: [{ articleLineNo: '1', description: 'Generic G18 importer two article', invoiceNumber: `INV-G18B-${suiteRunId}`, shipmentNo: `819${suiteRunId}`, lineItemIdentifier: 'H82', countryOfOrigin: 'CN', countryOfExport: 'CN', grossWeight: 19, enteredValue: 1000, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.35 }],
      tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `819${suiteRunId}`, invoiceNumber: `INV-G18B-${suiteRunId}`, hsCode: 'HTS-BASE-PLASTIC-01', quantity: 1, uom: 'NO', enteredValue: 1000, countryOfOrigin: 'CN' }],
    },
    {
      caseId: 'G18C', focus: 'Shared carrier importer three', importerKey: 'IMP-G18-03', importerDisplayName: `Importer G18 Three ${suiteRunId}`, importerCode: `I3${suiteRunId}`,
      carrierKey: 'CAR-AIR-SHARED-18', carrierDisplayName: `Carrier Air Shared ${suiteRunId}`, carrierCode: Number(`6${suiteRunId}`).toString(36).toUpperCase().padStart(4, '0').slice(-4),
      entryType: '01', transportMode: '40', paymentType: '2', bondType: '8', portOfEntrySymbol: 'PORT-AIR-1', portOfUnladingSymbol: 'PORT-AIR-1',
      clientRef: `UI-G18C-${suiteRunId}`, conveyanceName: 'UI G18 AIR C', tripIdentifier: 'UG18C', suretyCode: '036', bondNumber: `BG18C${suiteRunId.slice(-3)}`, houseBill: `HBG18C${suiteRunId}`, masterBill: `MBG18C${suiteRunId}`,
      totalEnteredValue: 1100, currency: 'USD',
      shipments: [{ shipmentNo: `820${suiteRunId}`, mode: '40', carrierName: 'CAR-AIR-SHARED-18', portOfEntry: 'PORT-AIR-1', portOfUnlading: 'PORT-AIR-1', dateOfArrival: '2026-06-05', dateOfImport: '2026-06-05', dateOfExport: '2026-06-03', voyageOrFlight: 'AIR-G18C' }],
      invoices: [{ invoiceNumber: `INV-G18C-${suiteRunId}`, shipmentNo: `820${suiteRunId}`, invoiceDate: '2026-06-05', currency: 'USD', invoiceAmount: 1100, vendorName: 'Vendor G18C' }],
      articles: [{ articleLineNo: '1', description: 'Generic G18 importer three article', invoiceNumber: `INV-G18C-${suiteRunId}`, shipmentNo: `820${suiteRunId}`, lineItemIdentifier: 'H83', countryOfOrigin: 'KR', countryOfExport: 'KR', grossWeight: 20, enteredValue: 1100, harborMaintenanceFee: 0, merchandiseProcessingFee: 1.4 }],
      tariffs: [{ lineNo: '1', articleLineNo: '1', shipmentNo: `820${suiteRunId}`, invoiceNumber: `INV-G18C-${suiteRunId}`, hsCode: 'HTS-BASE-AUTO-01', quantity: 1, uom: 'NO', enteredValue: 1100, countryOfOrigin: 'KR' }],
    },
  ];

  for (const scenario of scenarios) {
    const importerName = await ensureImporter(page, importerRegistry, scenario.importerKey, {
      display_name: scenario.importerDisplayName,
      importer_code: scenario.importerCode,
      contact_name: 'Ops User',
      email: `${scenario.importerCode.toLowerCase()}@example.com`,
      phone: '5550101',
      address_line1: '101 Harbor Way',
      city: 'Newark',
      state: 'NJ',
      postal_code: '07102',
      country: 'US',
    });
    const result = await createAndSubmitEntry(page, scenario, importerName, carrierRegistry, prep);
    expect(result.verification.ok).toBeTruthy();
    expect(result.verification.differences).toEqual([]);
  }
});

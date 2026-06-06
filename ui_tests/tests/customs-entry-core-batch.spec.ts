import { expect, test } from '@playwright/test';

const loginEmail = process.env.UI_LOGIN_EMAIL;
const loginPassword = process.env.UI_LOGIN_PASSWORD;

async function login(page) {
  if (!loginEmail || !loginPassword) {
    throw new Error('UI_LOGIN_EMAIL and UI_LOGIN_PASSWORD are required.');
  }

  await page.goto('/app');
  if (page.url().includes('/login')) {
    await page.locator('#login_email').fill(loginEmail);
    await page.locator('#login_password').fill(loginPassword);
    await page.getByRole('button', { name: /login/i }).click();
  }
  await expect(page).toHaveURL(/\/app($|\/)/);
  await page.waitForFunction(() => Boolean((window as any).frappe?.call));
}

async function waitForForm(page, doctype: string) {
  await page.waitForFunction(
    (expected) => Boolean((window as any).cur_frm) && (window as any).cur_frm.doctype === expected,
    doctype,
  );
}

async function setFormValues(page, values: Record<string, any>) {
  await page.evaluate(async (payload) => {
    await (window as any).cur_frm.set_value(payload);
  }, values);
}

async function addChildRow(page, fieldname: string, childtype: string, values: Record<string, any>) {
  await page.evaluate(({ fieldname, childtype, values }) => {
    const frm = (window as any).cur_frm;
    const row = (window as any).frappe.model.add_child(frm.doc, childtype, fieldname);
    Object.assign(row, values);
    frm.refresh_field(fieldname);
  }, { fieldname, childtype, values });
}

async function saveDraft(page) {
  const result = await page.evaluate(async () => {
    const frm = (window as any).cur_frm;
    try {
      const response = await (window as any).frappe.call({
        method: 'frappe.desk.form.save.savedocs',
        args: {
          doc: JSON.stringify(frm.doc),
          action: 'Save',
        },
      });
      return { ok: true, response };
    } catch (error: any) {
      const serialized = (() => {
        try {
          return JSON.stringify(error);
        } catch {
          return String(error);
        }
      })();
      return { ok: false, error: error?.message || serialized || String(error) };
    }
  });
  if (!result?.ok) {
    throw new Error(result?.error || 'Save failed');
  }
  await page.waitForLoadState('networkidle');
  await page.reload({ waitUntil: 'networkidle' });
}

async function submitDoc(page) {
  const context = await page.evaluate(() => ({
    doctype: (window as any).cur_frm.doctype as string,
  }));
  const routeByDoctype: Record<string, string> = {
    'Importer Profile': 'importer-profile',
    Carrier: 'carrier',
    'Customs Entry': 'customs-entry',
  };
  const result = await page.evaluate(async () => {
    const frm = (window as any).cur_frm;
    const methodByDoctype: Record<string, string> = {
      'Importer Profile': 'andersoncb_erp.api.submit_importer_profile',
      Carrier: 'andersoncb_erp.api.submit_carrier',
      'Customs Entry': 'andersoncb_erp.api.submit_entry',
    };
    const method = methodByDoctype[frm.doctype];
    if (!method) {
      throw new Error(`No submit RPC mapping for ${frm.doctype}`);
    }
    try {
      const response = await (window as any).frappe.call({
        method,
        args: { name: frm.doc.name },
      });
      return { ok: true, result: response.message };
    } catch (error: any) {
      const serialized = (() => {
        try {
          return JSON.stringify(error);
        } catch {
          return String(error);
        }
      })();
      return { ok: false, error: error?.message || serialized || String(error) };
    }
  });
  if (!result?.ok || !result?.result?.ok) {
    throw new Error(result?.error || result?.result?.error || 'Submit failed');
  }
  await page.waitForLoadState('networkidle');
  const finalName = result?.result?.name;
  const route = routeByDoctype[context.doctype];
  if (finalName && route) {
    await page.goto(`/app/${route}/${finalName}`, { waitUntil: 'networkidle' });
  } else {
    await page.reload({ waitUntil: 'networkidle' });
  }
  await page.waitForFunction(() => Boolean((window as any).cur_frm) && (window as any).cur_frm.doc.docstatus === 1);
}

async function currentDocName(page) {
  await page.waitForFunction(() => Boolean((window as any).cur_frm?.doc?.name));
  return await page.evaluate(() => (window as any).cur_frm.doc.name as string);
}

async function currentEntryNumber(page) {
  await page.waitForFunction(() => Boolean((window as any).cur_frm?.doc));
  return await page.evaluate(() => ((window as any).cur_frm.doc.entry_number || (window as any).cur_frm.doc.name) as string);
}

async function getExistingDocName(page, doctype: string, fieldname: string, value: string) {
  return await page.evaluate(async ({ doctype, fieldname, value }) => {
    const response = await (window as any).frappe.call({
      method: 'frappe.client.get_list',
      args: {
        doctype,
        filters: [[doctype, fieldname, '=', value]],
        fields: ['name'],
        limit_page_length: 1,
      },
    });
    return response.message?.[0]?.name || null;
  }, { doctype, fieldname, value });
}

async function ensureImporterProfile(page, profile: Record<string, any>) {
  const existing = await getExistingDocName(page, 'Importer Profile', 'importer_code', profile.importer_code);
  if (existing) {
    return existing;
  }
  await page.goto('/app/importer-profile/new-importer-profile-1');
  await waitForForm(page, 'Importer Profile');
  await setFormValues(page, profile);
  await saveDraft(page);
  const importerName = await currentDocName(page);
  await submitDoc(page);
  return importerName;
}

async function ensureCarrier(page, carrier: Record<string, any>) {
  const existing = await getExistingDocName(page, 'Carrier', 'carrier_code', carrier.carrier_code);
  if (existing) {
    return existing;
  }
  await page.goto('/app/carrier/new-carrier-1');
  await waitForForm(page, 'Carrier');
  await setFormValues(page, carrier);
  await saveDraft(page);
  const carrierName = await currentDocName(page);
  await submitDoc(page);
  return carrierName;
}

type EntryCase = {
  id: string;
  title: string;
  importer: Record<string, any>;
  carrier: Record<string, any>;
  entry: Record<string, any>;
  shipment: Record<string, any>;
  invoice: Record<string, any>;
  articleRows: Record<string, any>[];
  tariffRows: Record<string, any>[];
};

async function runEntryCase(page, scenario: EntryCase) {
  const runId = String(Date.now()).slice(-6);
  const shipmentNo = `${scenario.id}${runId}`;
  const invoiceNumber = `INV-${scenario.id}-${runId}`;
  const clientRef = `UI-CASE-${scenario.id}-${runId}`;
  const bondNumber = `B${scenario.id}${runId}`.slice(0, 9);
  const houseBill = `HB${scenario.id}${runId}`;
  const masterBill = `MB${scenario.id}${runId}`;
  const draftEntryNumber = `TMP${scenario.id}${runId.slice(-3)}`;
  const carrierCodeSeed = (scenario.carrier.carrier_code || scenario.id).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const carrierCode = `${carrierCodeSeed.slice(0, 2)}${runId.slice(-2)}`.slice(0, 4);

  await login(page);

  const importerName = await ensureImporterProfile(page, scenario.importer);
  const carrierName = await ensureCarrier(page, {
    ...scenario.carrier,
    display_name: `${scenario.carrier.display_name} ${runId}`,
    carrier_code: carrierCode,
  });

  await page.goto('/app/customs-entry/new-customs-entry-1');
  await waitForForm(page, 'Customs Entry');
  await setFormValues(page, {
    ...scenario.entry,
    entry_number: draftEntryNumber,
    client_ref: clientRef,
    bond_number: bondNumber,
    house_bill: houseBill,
    master_bill: masterBill,
    importer_profile: importerName,
  });

  await addChildRow(page, 'shipments', 'Entry Shipment', {
    ...scenario.shipment,
    shipment_no: shipmentNo,
    carrier_profile: carrierName,
  });

  await addChildRow(page, 'invoices', 'Entry Invoice', {
    ...scenario.invoice,
    shipment_no: shipmentNo,
    invoice_number: invoiceNumber,
  });
  for (const row of scenario.articleRows) {
    await addChildRow(page, 'articles', 'Entry Article', {
      ...row,
      shipment_no: shipmentNo,
      invoice_number: invoiceNumber,
    });
  }
  for (const row of scenario.tariffRows) {
    await addChildRow(page, 'tariff_lines', 'Entry Tariff Line', {
      ...row,
      shipment_no: shipmentNo,
      invoice_number: invoiceNumber,
    });
  }

  await saveDraft(page);
  await submitDoc(page);

  const finalName = await currentDocName(page);
  const finalEntryNumber = await currentEntryNumber(page);
  expect(finalEntryNumber).toMatch(/^\d{8}$/);

  const verification = await page.evaluate(async (name) => {
    const response = await (window as any).frappe.call({
      method: 'andersoncb_erp.api.verify_entry_roundtrip',
      args: { name },
    });
    return response.message;
  }, finalName);

  expect(verification.ok).toBeTruthy();
  expect(verification.differences).toEqual([]);
}

const CASES: EntryCase[] = [
  {
    id: '02',
    title: 'ocean non-containerized consumption',
    importer: {
      display_name: 'Importer Alpha Reuse 02',
      importer_code: 'IMPALP02',
      contact_name: 'Ops User',
      email: 'impalp02@example.com',
      phone: '5550202',
      address_line1: '202 Gulf Avenue',
      city: 'Tampa',
      state: 'FL',
      postal_code: '33602',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Ocean 02',
      carrier_code: 'OC02',
    },
    entry: {
      entry_number: 'TMPC02A',
      filer_code: 'SY1',
      entry_type: '01',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      client_ref: 'UI-CASE-002',
      port_of_entry: '1801',
      port_of_unlading: '1801',
      transport_mode: '10',
      conveyance_name: 'GULF BULKER 02',
      trip_identifier: 'GB02',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      bond_number: 'BCASE002',
      house_bill: 'HBCASE002',
      master_bill: 'MBCASE002',
      total_entered_value: 2400,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200002',
      mode: '10',
      port_of_entry: '1801',
      port_of_unlading: '1801',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-02',
      voyage_or_flight: 'GB-02',
    },
    invoice: {
      invoice_number: 'INV-002-A',
      shipment_no: '200002',
      invoice_date: '2026-06-05',
      currency: 'USD',
      invoice_amount: 2400,
      vendor_name: 'Vendor Wood 02',
    },
    articleRows: [
      {
        article_line_no: '1',
        description: 'Synthetic wood stakes',
        invoice_number: 'INV-002-A',
        shipment_no: '200002',
        line_item_identifier: 'W02',
        country_of_origin: 'CA',
        country_of_export: 'CA',
        gross_weight: 80,
        entered_value: 2400,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 5.5,
      },
    ],
    tariffRows: [
      {
        line_no: '1',
        article_line_no: '1',
        shipment_no: '200002',
        invoice_number: 'INV-002-A',
        hs_code: '4404200080',
        quantity: 1,
        uom: 'KG',
        entered_value: 2400,
        country_of_origin: 'CA',
      },
    ],
  },
  {
    id: '03',
    title: 'rail containerized consumption',
    importer: {
      display_name: 'Importer Bravo 03',
      importer_code: 'IMPBRV03',
      contact_name: 'Ops User',
      email: 'impbrv03@example.com',
      phone: '5550303',
      address_line1: '303 Rail Plaza',
      city: 'Chicago',
      state: 'IL',
      postal_code: '60606',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Rail 03',
      carrier_code: 'RL03',
    },
    entry: {
      entry_number: 'TMPC03A',
      filer_code: 'SY1',
      entry_type: '01',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      client_ref: 'UI-CASE-003',
      port_of_entry: '3901',
      port_of_unlading: '1303',
      transport_mode: '21',
      conveyance_name: 'RAIL LINK 03',
      trip_identifier: 'RL03',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      bond_number: 'BCASE003',
      house_bill: 'HBCASE003',
      master_bill: 'MBCASE003',
      total_entered_value: 3100,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200003',
      mode: '21',
      port_of_entry: '3901',
      port_of_unlading: '1303',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-03',
      voyage_or_flight: 'RL-03',
    },
    invoice: {
      invoice_number: 'INV-003-A',
      shipment_no: '200003',
      invoice_date: '2026-06-05',
      currency: 'USD',
      invoice_amount: 3100,
      vendor_name: 'Vendor Mixed 03',
    },
    articleRows: [
      {
        article_line_no: '1',
        description: 'Synthetic plastic bins',
        invoice_number: 'INV-003-A',
        shipment_no: '200003',
        line_item_identifier: 'P03',
        country_of_origin: 'MX',
        country_of_export: 'MX',
        gross_weight: 55,
        entered_value: 1500,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 3.25,
      },
      {
        article_line_no: '2',
        description: 'Synthetic consumer organizers',
        invoice_number: 'INV-003-A',
        shipment_no: '200003',
        line_item_identifier: 'C03',
        country_of_origin: 'MX',
        country_of_export: 'MX',
        gross_weight: 65,
        entered_value: 1600,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 3.75,
      },
    ],
    tariffRows: [
      {
        line_no: '1',
        article_line_no: '1',
        shipment_no: '200003',
        invoice_number: 'INV-003-A',
        hs_code: '3925900000',
        quantity: 1,
        uom: 'KG',
        entered_value: 1500,
        country_of_origin: 'MX',
      },
      {
        line_no: '2',
        article_line_no: '2',
        shipment_no: '200003',
        invoice_number: 'INV-003-A',
        hs_code: '3925900000',
        quantity: 1,
        uom: 'KG',
        entered_value: 1600,
        country_of_origin: 'MX',
      },
    ],
  },
  {
    id: '04',
    title: 'truck non-containerized consumption',
    importer: {
      display_name: 'Importer Charlie 04',
      importer_code: 'IMPCHL04',
      contact_name: 'Ops User',
      email: 'impchl04@example.com',
      phone: '5550404',
      address_line1: '404 Border Route',
      city: 'Plattsburgh',
      state: 'NY',
      postal_code: '12901',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Truck 04',
      carrier_code: 'TR04',
    },
    entry: {
      entry_number: 'TMPC04A',
      filer_code: 'SY1',
      entry_type: '01',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      client_ref: 'UI-CASE-004',
      port_of_entry: '0712',
      port_of_unlading: '0712',
      transport_mode: '30',
      conveyance_name: 'BORDER TRUCK 04',
      trip_identifier: 'TR04',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      bond_number: 'BCASE004',
      house_bill: 'HBCASE004',
      master_bill: 'MBCASE004',
      total_entered_value: 1800,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200004',
      mode: '30',
      port_of_entry: '0712',
      port_of_unlading: '0712',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-04',
      voyage_or_flight: 'TR-04',
    },
    invoice: {
      invoice_number: 'INV-004-A',
      shipment_no: '200004',
      invoice_date: '2026-06-05',
      currency: 'USD',
      invoice_amount: 1800,
      vendor_name: 'Vendor Foods 04',
    },
    articleRows: [
      {
        article_line_no: '1',
        description: 'Synthetic beverage concentrate',
        invoice_number: 'INV-004-A',
        shipment_no: '200004',
        line_item_identifier: 'F04',
        country_of_origin: 'CA',
        country_of_export: 'CA',
        gross_weight: 40,
        entered_value: 1800,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 4.5,
      },
    ],
    tariffRows: [
      {
        line_no: '1',
        article_line_no: '1',
        shipment_no: '200004',
        invoice_number: 'INV-004-A',
        hs_code: '2106909998',
        quantity: 1,
        uom: 'KG',
        entered_value: 1800,
        country_of_origin: 'CA',
      },
    ],
  },
  {
    id: '05',
    title: 'road other consumption',
    importer: {
      display_name: 'Importer Charlie 04',
      importer_code: 'IMPCHL04',
      contact_name: 'Ops User',
      email: 'impchl04@example.com',
      phone: '5550404',
      address_line1: '404 Border Route',
      city: 'Plattsburgh',
      state: 'NY',
      postal_code: '12901',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Road 05',
      carrier_code: 'RD05',
    },
    entry: {
      entry_number: 'TMPC05A',
      filer_code: 'SY1',
      entry_type: '01',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      client_ref: 'UI-CASE-005',
      port_of_entry: '0712',
      port_of_unlading: '2801',
      transport_mode: '34',
      conveyance_name: 'ROAD OTHER 05',
      trip_identifier: 'RD05',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      bond_number: 'BCASE005',
      house_bill: 'HBCASE005',
      master_bill: 'MBCASE005',
      total_entered_value: 2600,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200005',
      mode: '34',
      port_of_entry: '0712',
      port_of_unlading: '2801',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-04',
      voyage_or_flight: 'RD-05',
    },
    invoice: {
      invoice_number: 'INV-005-A',
      shipment_no: '200005',
      invoice_date: '2026-06-05',
      currency: 'USD',
      invoice_amount: 2600,
      vendor_name: 'Vendor Consumer 05',
    },
    articleRows: [
      {
        article_line_no: '1',
        description: 'Synthetic household organizers',
        invoice_number: 'INV-005-A',
        shipment_no: '200005',
        line_item_identifier: 'R05',
        country_of_origin: 'MX',
        country_of_export: 'MX',
        gross_weight: 70,
        entered_value: 2600,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 6.0,
      },
    ],
    tariffRows: [
      {
        line_no: '1',
        article_line_no: '1',
        shipment_no: '200005',
        invoice_number: 'INV-005-A',
        hs_code: '3925900000',
        quantity: 1,
        uom: 'NO',
        entered_value: 2600,
        country_of_origin: 'MX',
      },
    ],
  },
  {
    id: '06',
    title: 'air consumption with chapter 99 overlay',
    importer: {
      display_name: 'Importer Delta 06',
      importer_code: 'IMPDLT06',
      contact_name: 'Ops User',
      email: 'impdlt06@example.com',
      phone: '5550606',
      address_line1: '606 Air Cargo Way',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94128',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Air 06',
      carrier_code: 'AR06',
      carrier_type: 'Air',
      airway_bill_prefix: '001',
    },
    entry: {
      entry_number: 'TMPC06A',
      filer_code: 'SY1',
      entry_type: '01',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      client_ref: 'UI-CASE-006',
      port_of_entry: '2801',
      port_of_unlading: '2801',
      transport_mode: '40',
      conveyance_name: 'SKY FREIGHT 06',
      trip_identifier: 'AR06',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      bond_number: 'BCASE006',
      house_bill: 'HBCASE006',
      master_bill: 'MBCASE006',
      total_entered_value: 5400,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200006',
      mode: '40',
      port_of_entry: '2801',
      port_of_unlading: '2801',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-04',
      voyage_or_flight: 'AR-06',
    },
    invoice: {
      invoice_number: 'INV-006-A',
      shipment_no: '200006',
      invoice_date: '2026-06-05',
      currency: 'USD',
      invoice_amount: 5400,
      vendor_name: 'Vendor Auto 06',
    },
    articleRows: [
      {
        article_line_no: '1',
        description: 'Synthetic used vehicle assembly',
        invoice_number: 'INV-006-A',
        shipment_no: '200006',
        line_item_identifier: 'A06',
        country_of_origin: 'CN',
        country_of_export: 'CN',
        gross_weight: 120,
        entered_value: 3600,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 8.5,
      },
      {
        article_line_no: '2',
        description: 'Synthetic replacement vehicle trim',
        invoice_number: 'INV-006-A',
        shipment_no: '200006',
        line_item_identifier: 'B06',
        country_of_origin: 'CN',
        country_of_export: 'CN',
        gross_weight: 60,
        entered_value: 1800,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 4.0,
      },
    ],
    tariffRows: [
      {
        line_no: '1',
        article_line_no: '1',
        shipment_no: '200006',
        invoice_number: 'INV-006-A',
        hs_code: '8703230190',
        quantity: 1,
        uom: 'NO',
        entered_value: 3600,
        country_of_origin: 'CN',
      },
      {
        line_no: '2',
        article_line_no: '1',
        shipment_no: '200006',
        invoice_number: 'INV-006-A',
        hs_code: '99030301',
        quantity: 1,
        uom: 'NO',
        entered_value: 3600,
        country_of_origin: 'CN',
      },
      {
        line_no: '3',
        article_line_no: '2',
        shipment_no: '200006',
        invoice_number: 'INV-006-A',
        hs_code: '8703230190',
        quantity: 1,
        uom: 'NO',
        entered_value: 1800,
        country_of_origin: 'CN',
      },
    ],
  },
];

for (const scenario of CASES) {
  test(`case ${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}

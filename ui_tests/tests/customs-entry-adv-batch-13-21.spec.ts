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

type InvoiceScenario = Record<string, any> & { invoice_ref: string };
type ArticleScenario = Record<string, any> & { invoice_ref?: string };
type TariffScenario = Record<string, any> & { invoice_ref?: string };

type EntryCase = {
  id: string;
  title: string;
  importer: Record<string, any>;
  carrier: Record<string, any>;
  entry: Record<string, any>;
  shipment: Record<string, any>;
  invoiceRows: InvoiceScenario[];
  articleRows: ArticleScenario[];
  tariffRows: TariffScenario[];
};

async function runEntryCase(page, scenario: EntryCase) {
  const runId = String(Date.now()).slice(-6);
  const shipmentNo = `${scenario.id}${runId}`;
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

  const invoiceNumberByRef = new Map<string, string>();
  scenario.invoiceRows.forEach((invoice, index) => {
    invoiceNumberByRef.set(invoice.invoice_ref, `INV-${scenario.id}-${runId}-${index + 1}`);
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

  for (const invoice of scenario.invoiceRows) {
    await addChildRow(page, 'invoices', 'Entry Invoice', {
      ...invoice,
      shipment_no: shipmentNo,
      invoice_number: invoiceNumberByRef.get(invoice.invoice_ref),
    });
  }

  for (const row of scenario.articleRows) {
    const invoiceRef = row.invoice_ref || scenario.invoiceRows[0].invoice_ref;
    await addChildRow(page, 'articles', 'Entry Article', {
      ...row,
      shipment_no: shipmentNo,
      invoice_number: invoiceNumberByRef.get(invoiceRef),
    });
  }

  for (const row of scenario.tariffRows) {
    const invoiceRef = row.invoice_ref || scenario.invoiceRows[0].invoice_ref;
    await addChildRow(page, 'tariff_lines', 'Entry Tariff Line', {
      ...row,
      shipment_no: shipmentNo,
      invoice_number: invoiceNumberByRef.get(invoiceRef),
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
    id: '13',
    title: 'ad cvd air',
    importer: {
      display_name: 'Importer India 13',
      importer_code: 'IMPIND13',
      contact_name: 'Ops User',
      email: 'impind13@example.com',
      phone: '5551313',
      address_line1: '1313 Air Cargo Blvd',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94128',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Air 13',
      carrier_code: 'AR13',
      carrier_type: 'Air',
      airway_bill_prefix: '001',
    },
    entry: {
      entry_number: 'TMPC13A',
      filer_code: 'SY1',
      entry_type: '03',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '2801',
      port_of_unlading: '2801',
      transport_mode: '40',
      conveyance_name: 'AIR AD13',
      trip_identifier: 'AR13',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      total_entered_value: 6900,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200013',
      mode: '40',
      port_of_entry: '2801',
      port_of_unlading: '2801',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-04',
      voyage_or_flight: 'AR-13',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-013-A',
        shipment_no: '200013',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 6900,
        vendor_name: 'Vendor Mixed 13',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic used vehicle unit',
        line_item_identifier: 'A13',
        country_of_origin: 'CN',
        country_of_export: 'CN',
        gross_weight: 120,
        entered_value: 2600,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 6.0,
      },
      {
        invoice_ref: 'A',
        article_line_no: '2',
        description: 'Synthetic molded trim kit',
        line_item_identifier: 'B13',
        country_of_origin: 'CN',
        country_of_export: 'CN',
        gross_weight: 70,
        entered_value: 2100,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 4.75,
      },
      {
        invoice_ref: 'A',
        article_line_no: '3',
        description: 'Synthetic molded fastener set',
        line_item_identifier: 'C13',
        country_of_origin: 'CN',
        country_of_export: 'CN',
        gross_weight: 50,
        entered_value: 2200,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 5.0,
      },
    ],
    tariffRows: [
      {
        invoice_ref: 'A',
        line_no: '1',
        article_line_no: '1',
        hs_code: '8703230190',
        quantity: 1,
        uom: 'NO',
        entered_value: 2600,
        country_of_origin: 'CN',
      },
      {
        invoice_ref: 'A',
        line_no: '2',
        article_line_no: '1',
        hs_code: '99038803',
        quantity: 1,
        uom: 'NO',
        entered_value: 2600,
        country_of_origin: 'CN',
      },
      {
        invoice_ref: 'A',
        line_no: '3',
        article_line_no: '2',
        hs_code: '3925900000',
        quantity: 1,
        uom: 'NO',
        entered_value: 2100,
        country_of_origin: 'CN',
      },
      {
        invoice_ref: 'A',
        line_no: '4',
        article_line_no: '3',
        hs_code: '3925900000',
        quantity: 1,
        uom: 'NO',
        entered_value: 2200,
        country_of_origin: 'CN',
      },
    ],
  },
  {
    id: '14',
    title: 'ad cvd hand-carried',
    importer: {
      display_name: 'Importer Juliet 14',
      importer_code: 'IMPJUL14',
      contact_name: 'Ops User',
      email: 'impjul14@example.com',
      phone: '5551414',
      address_line1: '1414 Passenger Plaza',
      city: 'Philadelphia',
      state: 'PA',
      postal_code: '19153',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Hand 14',
      carrier_code: 'HD14',
    },
    entry: {
      entry_number: 'TMPC14A',
      filer_code: 'SY1',
      entry_type: '03',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '1108',
      port_of_unlading: '1108',
      transport_mode: '60',
      conveyance_name: 'HAND AD14',
      trip_identifier: 'HD14',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      total_entered_value: 1300,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200014',
      mode: '60',
      port_of_entry: '1108',
      port_of_unlading: '1108',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-04',
      voyage_or_flight: 'HD-14',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-014-A',
        shipment_no: '200014',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 1300,
        vendor_name: 'Vendor Hand 14',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic portable consumer item',
        line_item_identifier: 'J14',
        country_of_origin: 'US',
        country_of_export: 'US',
        gross_weight: 18,
        entered_value: 1300,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 2.75,
      },
    ],
    tariffRows: [
      {
        invoice_ref: 'A',
        line_no: '1',
        article_line_no: '1',
        hs_code: '3925900000',
        quantity: 1,
        uom: 'NO',
        entered_value: 1300,
        country_of_origin: 'US',
      },
    ],
  },
  {
    id: '15',
    title: 'informal ocean containerized',
    importer: {
      display_name: 'Importer Kilo 15',
      importer_code: 'IMPKIL15',
      contact_name: 'Ops User',
      email: 'impkil15@example.com',
      phone: '5551515',
      address_line1: '1515 Seaport Way',
      city: 'Baltimore',
      state: 'MD',
      postal_code: '21224',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Ocean 15',
      carrier_code: 'OC15',
    },
    entry: {
      entry_number: 'TMPC15A',
      filer_code: 'SY1',
      entry_type: '11',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '1303',
      port_of_unlading: '1303',
      transport_mode: '11',
      conveyance_name: 'COFFEE SEA 15',
      trip_identifier: 'OC15',
      payment_type: '3',
      bond_type: '9',
      surety_code: '036',
      total_entered_value: 1750,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200015',
      mode: '11',
      port_of_entry: '1303',
      port_of_unlading: '1303',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-03',
      voyage_or_flight: 'OC-15',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-015-A',
        shipment_no: '200015',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 1750,
        vendor_name: 'Vendor Coffee 15',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic arabica coffee lot',
        line_item_identifier: 'K15',
        country_of_origin: 'BR',
        country_of_export: 'BR',
        gross_weight: 95,
        entered_value: 1750,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 3.5,
      },
    ],
    tariffRows: [
      {
        invoice_ref: 'A',
        line_no: '1',
        article_line_no: '1',
        hs_code: '0901110025',
        quantity: 1,
        uom: 'KG',
        entered_value: 1750,
        country_of_origin: 'BR',
      },
    ],
  },
  {
    id: '16',
    title: 'informal ocean non-containerized',
    importer: {
      display_name: 'Importer Kilo 15',
      importer_code: 'IMPKIL15',
      contact_name: 'Ops User',
      email: 'impkil15@example.com',
      phone: '5551515',
      address_line1: '1515 Seaport Way',
      city: 'Baltimore',
      state: 'MD',
      postal_code: '21224',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Marine 16',
      carrier_code: 'OM16',
    },
    entry: {
      entry_number: 'TMPC16A',
      filer_code: 'SY1',
      entry_type: '11',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '1801',
      port_of_unlading: '1801',
      transport_mode: '10',
      conveyance_name: 'MARINE 16',
      trip_identifier: 'OM16',
      payment_type: '3',
      bond_type: '9',
      surety_code: '036',
      total_entered_value: 1950,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200016',
      mode: '10',
      port_of_entry: '1801',
      port_of_unlading: '1801',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-03',
      voyage_or_flight: 'OM-16',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-016-A',
        shipment_no: '200016',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 1950,
        vendor_name: 'Vendor Marine 16',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic inflatable raft unit',
        line_item_identifier: 'M16',
        country_of_origin: 'CA',
        country_of_export: 'CA',
        gross_weight: 48,
        entered_value: 1950,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 4.0,
      },
    ],
    tariffRows: [
      {
        invoice_ref: 'A',
        line_no: '1',
        article_line_no: '1',
        hs_code: '8907100000',
        quantity: 1,
        uom: 'NO',
        entered_value: 1950,
        country_of_origin: 'CA',
      },
    ],
  },
  {
    id: '17',
    title: 'informal rail',
    importer: {
      display_name: 'Importer Lima 17',
      importer_code: 'IMPLIM17',
      contact_name: 'Ops User',
      email: 'implim17@example.com',
      phone: '5551717',
      address_line1: '1717 Rail Exchange',
      city: 'Rosemont',
      state: 'IL',
      postal_code: '60018',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Rail 17',
      carrier_code: 'RL17',
    },
    entry: {
      entry_number: 'TMPC17A',
      filer_code: 'SY1',
      entry_type: '11',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '3901',
      port_of_unlading: '4601',
      transport_mode: '21',
      conveyance_name: 'INFORMAL RAIL 17',
      trip_identifier: 'RL17',
      payment_type: '3',
      bond_type: '9',
      surety_code: '036',
      total_entered_value: 3400,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200017',
      mode: '21',
      port_of_entry: '3901',
      port_of_unlading: '4601',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-03',
      voyage_or_flight: 'RL-17',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-017-A',
        shipment_no: '200017',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 3400,
        vendor_name: 'Vendor Mixed 17',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic plastic organizer rail lot',
        line_item_identifier: 'L17',
        country_of_origin: 'MX',
        country_of_export: 'MX',
        gross_weight: 52,
        entered_value: 1600,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 3.5,
      },
      {
        invoice_ref: 'A',
        article_line_no: '2',
        description: 'Synthetic consumer rail lot',
        line_item_identifier: 'N17',
        country_of_origin: 'MX',
        country_of_export: 'MX',
        gross_weight: 58,
        entered_value: 1800,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 4.0,
      },
    ],
    tariffRows: [
      {
        invoice_ref: 'A',
        line_no: '1',
        article_line_no: '1',
        hs_code: '3925900000',
        quantity: 1,
        uom: 'NO',
        entered_value: 1600,
        country_of_origin: 'MX',
      },
      {
        invoice_ref: 'A',
        line_no: '2',
        article_line_no: '2',
        hs_code: '3925900000',
        quantity: 1,
        uom: 'NO',
        entered_value: 1800,
        country_of_origin: 'MX',
      },
    ],
  },
  {
    id: '18',
    title: 'informal truck',
    importer: {
      display_name: 'Importer Mike 18',
      importer_code: 'IMPMIK18',
      contact_name: 'Ops User',
      email: 'impmik18@example.com',
      phone: '5551818',
      address_line1: '1818 Inland Route',
      city: 'Champlain',
      state: 'NY',
      postal_code: '12919',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Truck 18',
      carrier_code: 'TR18',
    },
    entry: {
      entry_number: 'TMPC18A',
      filer_code: 'SY1',
      entry_type: '11',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '0712',
      port_of_unlading: '0712',
      transport_mode: '30',
      conveyance_name: 'INFORMAL TRUCK 18',
      trip_identifier: 'TR18',
      payment_type: '3',
      bond_type: '9',
      surety_code: '036',
      total_entered_value: 1400,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200018',
      mode: '30',
      port_of_entry: '0712',
      port_of_unlading: '0712',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-04',
      voyage_or_flight: 'TR-18',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-018-A',
        shipment_no: '200018',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 1400,
        vendor_name: 'Vendor Food 18',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic food prep lot',
        line_item_identifier: 'M18',
        country_of_origin: 'CA',
        country_of_export: 'CA',
        gross_weight: 42,
        entered_value: 1400,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 3.0,
      },
    ],
    tariffRows: [
      {
        invoice_ref: 'A',
        line_no: '1',
        article_line_no: '1',
        hs_code: '2106909998',
        quantity: 1,
        uom: 'KG',
        entered_value: 1400,
        country_of_origin: 'CA',
      },
    ],
  },
  {
    id: '19',
    title: 'informal road other',
    importer: {
      display_name: 'Importer Mike 18',
      importer_code: 'IMPMIK18',
      contact_name: 'Ops User',
      email: 'impmik18@example.com',
      phone: '5551818',
      address_line1: '1818 Inland Route',
      city: 'Champlain',
      state: 'NY',
      postal_code: '12919',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Road 19',
      carrier_code: 'RD19',
    },
    entry: {
      entry_number: 'TMPC19A',
      filer_code: 'SY1',
      entry_type: '11',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '0712',
      port_of_unlading: '1108',
      transport_mode: '34',
      conveyance_name: 'INFORMAL ROAD 19',
      trip_identifier: 'RD19',
      payment_type: '3',
      bond_type: '9',
      surety_code: '036',
      total_entered_value: 1600,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200019',
      mode: '34',
      port_of_entry: '0712',
      port_of_unlading: '1108',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-04',
      voyage_or_flight: 'RD-19',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-019-A',
        shipment_no: '200019',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 1600,
        vendor_name: 'Vendor Consumer 19',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic consumer road-other lot',
        line_item_identifier: 'R19',
        country_of_origin: 'MX',
        country_of_export: 'MX',
        gross_weight: 38,
        entered_value: 1600,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 3.25,
      },
    ],
    tariffRows: [
      {
        invoice_ref: 'A',
        line_no: '1',
        article_line_no: '1',
        hs_code: '3925900000',
        quantity: 1,
        uom: 'NO',
        entered_value: 1600,
        country_of_origin: 'MX',
      },
    ],
  },
  {
    id: '20',
    title: 'informal air',
    importer: {
      display_name: 'Importer November 20',
      importer_code: 'IMPNOV20',
      contact_name: 'Ops User',
      email: 'impnov20@example.com',
      phone: '5552020',
      address_line1: '2020 Air Hub Road',
      city: 'Philadelphia',
      state: 'PA',
      postal_code: '19153',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Air 20',
      carrier_code: 'AR20',
      carrier_type: 'Air',
      airway_bill_prefix: '001',
    },
    entry: {
      entry_number: 'TMPC20A',
      filer_code: 'SY1',
      entry_type: '11',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '1108',
      port_of_unlading: '1108',
      transport_mode: '40',
      conveyance_name: 'INFORMAL AIR 20',
      trip_identifier: 'AR20',
      payment_type: '3',
      bond_type: '9',
      surety_code: '036',
      total_entered_value: 2400,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200020',
      mode: '40',
      port_of_entry: '1108',
      port_of_unlading: '1108',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-04',
      voyage_or_flight: 'AR-20',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-020-A',
        shipment_no: '200020',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 2400,
        vendor_name: 'Vendor Consumer 20',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic consumer air lot one',
        line_item_identifier: 'N20',
        country_of_origin: 'CN',
        country_of_export: 'CN',
        gross_weight: 30,
        entered_value: 1200,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 2.75,
      },
      {
        invoice_ref: 'A',
        article_line_no: '2',
        description: 'Synthetic consumer air lot two',
        line_item_identifier: 'O20',
        country_of_origin: 'CN',
        country_of_export: 'CN',
        gross_weight: 32,
        entered_value: 1200,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 2.75,
      },
    ],
    tariffRows: [
      {
        invoice_ref: 'A',
        line_no: '1',
        article_line_no: '1',
        hs_code: '3925900000',
        quantity: 1,
        uom: 'NO',
        entered_value: 1200,
        country_of_origin: 'CN',
      },
      {
        invoice_ref: 'A',
        line_no: '2',
        article_line_no: '2',
        hs_code: '99038803',
        quantity: 1,
        uom: 'NO',
        entered_value: 1200,
        country_of_origin: 'CN',
      },
    ],
  },
  {
    id: '21',
    title: 'informal hand-carried',
    importer: {
      display_name: 'Importer Oscar 21',
      importer_code: 'IMPOSC21',
      contact_name: 'Ops User',
      email: 'imposc21@example.com',
      phone: '5552121',
      address_line1: '2121 Passenger Hall',
      city: 'Philadelphia',
      state: 'PA',
      postal_code: '19153',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Hand 21',
      carrier_code: 'HD21',
    },
    entry: {
      entry_number: 'TMPC21A',
      filer_code: 'SY1',
      entry_type: '11',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '1108',
      port_of_unlading: '1108',
      transport_mode: '60',
      conveyance_name: 'INFORMAL HAND 21',
      trip_identifier: 'HD21',
      payment_type: '3',
      bond_type: '9',
      surety_code: '036',
      total_entered_value: 900,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200021',
      mode: '60',
      port_of_entry: '1108',
      port_of_unlading: '1108',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-04',
      voyage_or_flight: 'HD-21',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-021-A',
        shipment_no: '200021',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 900,
        vendor_name: 'Vendor Hand 21',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic hand-carried consumer lot',
        line_item_identifier: 'O21',
        country_of_origin: 'US',
        country_of_export: 'US',
        gross_weight: 12,
        entered_value: 900,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 1.9,
      },
    ],
    tariffRows: [
      {
        invoice_ref: 'A',
        line_no: '1',
        article_line_no: '1',
        hs_code: '3925900000',
        quantity: 1,
        uom: 'NO',
        entered_value: 900,
        country_of_origin: 'US',
      },
    ],
  },
];

for (const scenario of CASES) {
  test(`case ${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}

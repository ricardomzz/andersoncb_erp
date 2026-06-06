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
    id: '22',
    title: 'warehouse ocean containerized',
    importer: {
      display_name: 'Importer Papa 22',
      importer_code: 'IMPPAP22',
      contact_name: 'Ops User',
      email: 'imppap22@example.com',
      phone: '5552222',
      address_line1: '2222 Warehouse Pier',
      city: 'Newark',
      state: 'NJ',
      postal_code: '07114',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Ocean 22',
      carrier_code: 'OC22',
    },
    entry: {
      entry_number: 'TMPC22A',
      filer_code: 'SY1',
      entry_type: '21',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '4601',
      port_of_unlading: '4601',
      transport_mode: '11',
      conveyance_name: 'WARE SEA 22',
      trip_identifier: 'OC22',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      total_entered_value: 4100,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200022',
      mode: '11',
      port_of_entry: '4601',
      port_of_unlading: '4601',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-03',
      voyage_or_flight: 'OC-22',
    },
    invoiceRows: [{ invoice_ref: 'A', invoice_number: 'INV-022-A', shipment_no: '200022', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 4100, vendor_name: 'Vendor Warehouse 22' }],
    articleRows: [{ invoice_ref: 'A', article_line_no: '1', description: 'Synthetic wood cabinet warehouse lot', line_item_identifier: 'P22', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 88, entered_value: 4100, harbor_maintenance_fee: 0, merchandise_processing_fee: 8.5 }],
    tariffRows: [{ invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '9403409060', quantity: 1, uom: 'NO', entered_value: 4100, country_of_origin: 'CN' }],
  },
  {
    id: '23',
    title: 'warehouse air',
    importer: { display_name: 'Importer Papa 22', importer_code: 'IMPPAP22', contact_name: 'Ops User', email: 'imppap22@example.com', phone: '5552222', address_line1: '2222 Warehouse Pier', city: 'Newark', state: 'NJ', postal_code: '07114', country: 'US' },
    carrier: { display_name: 'Carrier Air 23', carrier_code: 'AR23', carrier_type: 'Air', airway_bill_prefix: '001' },
    entry: { entry_number: 'TMPC23A', filer_code: 'SY1', entry_type: '21', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2801', port_of_unlading: '2801', transport_mode: '40', conveyance_name: 'WARE AIR 23', trip_identifier: 'AR23', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 1800, currency: 'USD' },
    shipment: { shipment_no: '200023', mode: '40', port_of_entry: '2801', port_of_unlading: '2801', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AR-23' },
    invoiceRows: [{ invoice_ref: 'A', invoice_number: 'INV-023-A', shipment_no: '200023', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1800, vendor_name: 'Vendor Air 23' }],
    articleRows: [{ invoice_ref: 'A', article_line_no: '1', description: 'Synthetic warehouse consumer air lot', line_item_identifier: 'P23', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 25, entered_value: 1800, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.8 }],
    tariffRows: [{ invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1800, country_of_origin: 'CN' }],
  },
  {
    id: '24',
    title: 'warehouse truck',
    importer: { display_name: 'Importer Papa 22', importer_code: 'IMPPAP22', contact_name: 'Ops User', email: 'imppap22@example.com', phone: '5552222', address_line1: '2222 Warehouse Pier', city: 'Newark', state: 'NJ', postal_code: '07114', country: 'US' },
    carrier: { display_name: 'Carrier Truck 24', carrier_code: 'TR24' },
    entry: { entry_number: 'TMPC24A', filer_code: 'SY1', entry_type: '21', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '0712', port_of_unlading: '0712', transport_mode: '30', conveyance_name: 'WARE TRUCK 24', trip_identifier: 'TR24', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 2200, currency: 'USD' },
    shipment: { shipment_no: '200024', mode: '30', port_of_entry: '0712', port_of_unlading: '0712', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-24' },
    invoiceRows: [{ invoice_ref: 'A', invoice_number: 'INV-024-A', shipment_no: '200024', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2200, vendor_name: 'Vendor Truck 24' }],
    articleRows: [{ invoice_ref: 'A', article_line_no: '1', description: 'Synthetic warehouse plastic lot', line_item_identifier: 'P24', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 47, entered_value: 2200, harbor_maintenance_fee: 0, merchandise_processing_fee: 4.4 }],
    tariffRows: [{ invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 2200, country_of_origin: 'MX' }],
  },
  {
    id: '25',
    title: 'new importer existing carrier',
    importer: { display_name: 'Importer Quebec 25', importer_code: 'IMPQUE25', contact_name: 'Ops User', email: 'impque25@example.com', phone: '5552525', address_line1: '2525 New Party Lane', city: 'Newark', state: 'NJ', postal_code: '07114', country: 'US' },
    carrier: { display_name: 'Carrier Ocean 25', carrier_code: 'OC25' },
    entry: { entry_number: 'TMPC25A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '4601', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'NEW IMP 25', trip_identifier: 'OC25', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 2500, currency: 'USD' },
    shipment: { shipment_no: '200025', mode: '11', port_of_entry: '4601', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-25' },
    invoiceRows: [{ invoice_ref: 'A', invoice_number: 'INV-025-A', shipment_no: '200025', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2500, vendor_name: 'Vendor Paper 25' }],
    articleRows: [{ invoice_ref: 'A', article_line_no: '1', description: 'Synthetic paper folding carton lot', line_item_identifier: 'Q25', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 55, entered_value: 2500, harbor_maintenance_fee: 0, merchandise_processing_fee: 5.2 }],
    tariffRows: [{ invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '4819200040', quantity: 1, uom: 'KG', entered_value: 2500, country_of_origin: 'CA' }],
  },
  {
    id: '26',
    title: 'existing importer new air carrier',
    importer: { display_name: 'Importer Alpha 26', importer_code: 'IMPALP26', contact_name: 'Ops User', email: 'impalp26@example.com', phone: '5552626', address_line1: '2626 Reuse Party Road', city: 'San Francisco', state: 'CA', postal_code: '94128', country: 'US' },
    carrier: { display_name: 'Carrier Air New 26', carrier_code: 'AN26', carrier_type: 'Air', airway_bill_prefix: '001' },
    entry: { entry_number: 'TMPC26A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2801', port_of_unlading: '2801', transport_mode: '40', conveyance_name: 'NEW AIR 26', trip_identifier: 'AR26', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 2100, currency: 'USD' },
    shipment: { shipment_no: '200026', mode: '40', port_of_entry: '2801', port_of_unlading: '2801', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AR-26' },
    invoiceRows: [{ invoice_ref: 'A', invoice_number: 'INV-026-A', shipment_no: '200026', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2100, vendor_name: 'Vendor Consumer 26' }],
    articleRows: [{ invoice_ref: 'A', article_line_no: '1', description: 'Synthetic consumer air new-carrier lot', line_item_identifier: 'A26', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 28, entered_value: 2100, harbor_maintenance_fee: 0, merchandise_processing_fee: 4.1 }],
    tariffRows: [{ invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 2100, country_of_origin: 'CN' }],
  },
  {
    id: '27',
    title: 'new importer and new rail carrier',
    importer: { display_name: 'Importer Romeo 27', importer_code: 'IMPROM27', contact_name: 'Ops User', email: 'improm27@example.com', phone: '5552727', address_line1: '2727 New Party Center', city: 'Rosemont', state: 'IL', postal_code: '60018', country: 'US' },
    carrier: { display_name: 'Carrier Rail New 27', carrier_code: 'RN27' },
    entry: { entry_number: 'TMPC27A', filer_code: 'SY1', entry_type: '03', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '3901', port_of_unlading: '1303', transport_mode: '21', conveyance_name: 'NEW RAIL 27', trip_identifier: 'RN27', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 4800, currency: 'USD' },
    shipment: { shipment_no: '200027', mode: '21', port_of_entry: '3901', port_of_unlading: '1303', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'RN-27' },
    invoiceRows: [{ invoice_ref: 'A', invoice_number: 'INV-027-A', shipment_no: '200027', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 4800, vendor_name: 'Vendor Tire 27' }],
    articleRows: [
      { invoice_ref: 'A', article_line_no: '1', description: 'Synthetic tire lot one', line_item_identifier: 'R27', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 76, entered_value: 2400, harbor_maintenance_fee: 0, merchandise_processing_fee: 5.2 },
      { invoice_ref: 'A', article_line_no: '2', description: 'Synthetic tire lot two', line_item_identifier: 'S27', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 77, entered_value: 2400, harbor_maintenance_fee: 0, merchandise_processing_fee: 5.2 }
    ],
    tariffRows: [
      { invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '4011201015', quantity: 1, uom: 'NO', entered_value: 2400, country_of_origin: 'CN' },
      { invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 2400, country_of_origin: 'CN' }
    ],
  },
  {
    id: '28',
    title: 'new port not in local seed',
    importer: { display_name: 'Importer Alpha 28', importer_code: 'IMPALP28', contact_name: 'Ops User', email: 'impalp28@example.com', phone: '5552828', address_line1: '2828 New Port Road', city: 'Salt Lake City', state: 'UT', postal_code: '84116', country: 'US' },
    carrier: { display_name: 'Carrier Truck 28', carrier_code: 'TR28' },
    entry: { entry_number: 'TMPC28A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '3303', port_of_unlading: '3303', transport_mode: '30', conveyance_name: 'NEW PORT 28', trip_identifier: 'TR28', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 1700, currency: 'USD' },
    shipment: { shipment_no: '200028', mode: '30', port_of_entry: '3303', port_of_unlading: '3303', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-28' },
    invoiceRows: [{ invoice_ref: 'A', invoice_number: 'INV-028-A', shipment_no: '200028', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1700, vendor_name: 'Vendor Food 28' }],
    articleRows: [{ invoice_ref: 'A', article_line_no: '1', description: 'Synthetic beverage prep new-port lot', line_item_identifier: 'N28', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 40, entered_value: 1700, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.4 }],
    tariffRows: [{ invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1700, country_of_origin: 'CA' }],
  },
  {
    id: '29',
    title: 'new hts not in local seed',
    importer: { display_name: 'Importer Alpha 29', importer_code: 'IMPALP29', contact_name: 'Ops User', email: 'impalp29@example.com', phone: '5552929', address_line1: '2929 New Tariff Lane', city: 'Baltimore', state: 'MD', postal_code: '21224', country: 'US' },
    carrier: { display_name: 'Carrier Ocean 29', carrier_code: 'OC29' },
    entry: { entry_number: 'TMPC29A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '1303', port_of_unlading: '1303', transport_mode: '11', conveyance_name: 'NEW HTS 29', trip_identifier: 'OC29', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 2600, currency: 'USD' },
    shipment: { shipment_no: '200029', mode: '11', port_of_entry: '1303', port_of_unlading: '1303', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-29' },
    invoiceRows: [{ invoice_ref: 'A', invoice_number: 'INV-029-A', shipment_no: '200029', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2600, vendor_name: 'Vendor New HTS 29' }],
    articleRows: [{ invoice_ref: 'A', article_line_no: '1', description: 'Synthetic carton lot new-hts', line_item_identifier: 'H29', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 62, entered_value: 2600, harbor_maintenance_fee: 0, merchandise_processing_fee: 5.1 }],
    tariffRows: [{ invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '4819200040', quantity: 1, uom: 'KG', entered_value: 2600, country_of_origin: 'CA' }],
  },
  {
    id: '30',
    title: 'one shipment two invoices',
    importer: { display_name: 'Importer Bravo 30', importer_code: 'IMPBRV30', contact_name: 'Ops User', email: 'impbrv30@example.com', phone: '5553030', address_line1: '3030 Invoice Link Road', city: 'Newark', state: 'NJ', postal_code: '07114', country: 'US' },
    carrier: { display_name: 'Carrier Ocean 30', carrier_code: 'OC30' },
    entry: { entry_number: 'TMPC30A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '4601', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'MULTI INV 30', trip_identifier: 'OC30', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 3900, currency: 'USD' },
    shipment: { shipment_no: '200030', mode: '11', port_of_entry: '4601', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-30' },
    invoiceRows: [
      { invoice_ref: 'A', invoice_number: 'INV-030-A', shipment_no: '200030', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1800, vendor_name: 'Vendor Paper 30A' },
      { invoice_ref: 'B', invoice_number: 'INV-030-B', shipment_no: '200030', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2100, vendor_name: 'Vendor Plastic 30B' }
    ],
    articleRows: [
      { invoice_ref: 'A', article_line_no: '1', description: 'Synthetic paper carton lot A', line_item_identifier: 'A30', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 40, entered_value: 1800, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.7 },
      { invoice_ref: 'B', article_line_no: '2', description: 'Synthetic plastic organizer lot B', line_item_identifier: 'B30', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 46, entered_value: 2100, harbor_maintenance_fee: 0, merchandise_processing_fee: 4.3 }
    ],
    tariffRows: [
      { invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '4819200040', quantity: 1, uom: 'KG', entered_value: 1800, country_of_origin: 'CA' },
      { invoice_ref: 'B', line_no: '2', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 2100, country_of_origin: 'MX' }
    ],
  },
];

for (const scenario of CASES) {
  test(`case ${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}

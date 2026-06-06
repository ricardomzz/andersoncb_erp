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
        args: { doc: JSON.stringify(frm.doc), action: 'Save' },
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
  if (!result?.ok) throw new Error(result?.error || 'Save failed');
  await page.waitForLoadState('networkidle');
  await page.reload({ waitUntil: 'networkidle' });
}

async function submitDoc(page) {
  const context = await page.evaluate(() => ({ doctype: (window as any).cur_frm.doctype as string }));
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
    if (!method) throw new Error(`No submit RPC mapping for ${frm.doctype}`);
    try {
      const response = await (window as any).frappe.call({ method, args: { name: frm.doc.name } });
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
      args: { doctype, filters: [[doctype, fieldname, '=', value]], fields: ['name'], limit_page_length: 1 },
    });
    return response.message?.[0]?.name || null;
  }, { doctype, fieldname, value });
}

async function ensureImporterProfile(page, profile: Record<string, any>) {
  const existing = await getExistingDocName(page, 'Importer Profile', 'importer_code', profile.importer_code);
  if (existing) return existing;
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
  if (existing) return existing;
  await page.goto('/app/carrier/new-carrier-1');
  await waitForForm(page, 'Carrier');
  await setFormValues(page, carrier);
  await saveDraft(page);
  const carrierName = await currentDocName(page);
  await submitDoc(page);
  return carrierName;
}

type ShipmentScenario = Record<string, any> & { shipment_ref: string; carrier_ref: string };
type InvoiceScenario = Record<string, any> & { invoice_ref: string; shipment_ref: string };
type ArticleScenario = Record<string, any> & { invoice_ref: string; shipment_ref: string };
type TariffScenario = Record<string, any> & { invoice_ref: string; shipment_ref: string };
type CarrierScenario = Record<string, any> & { carrier_ref: string };

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

async function runEntryCase(page, scenario: EntryCase) {
  const runId = String(Date.now()).slice(-6);
  const clientRef = `UI-CASE-${scenario.id}-${runId}`;
  const bondNumber = `B${scenario.id}${runId}`.slice(0, 9);
  const houseBill = `HB${scenario.id}${runId}`;
  const masterBill = `MB${scenario.id}${runId}`;
  const draftEntryNumber = `TMP${scenario.id}${runId.slice(-3)}`;

  await login(page);

  const importerName = await ensureImporterProfile(page, scenario.importer);

  const carrierNameByRef = new Map<string, string>();
  for (const carrier of scenario.carriers) {
    const carrierCodeSeed = (carrier.carrier_code || carrier.carrier_ref).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const carrierCode = `${carrierCodeSeed.slice(0, 2)}${runId.slice(-2)}${carrier.carrier_ref.slice(-1)}`.slice(0, 4);
    const carrierName = await ensureCarrier(page, {
      ...carrier,
      display_name: `${carrier.display_name} ${runId}`,
      carrier_code: carrierCode,
    });
    carrierNameByRef.set(carrier.carrier_ref, carrierName);
  }

  const shipmentNoByRef = new Map<string, string>();
  scenario.shipmentRows.forEach((shipment, index) => {
    shipmentNoByRef.set(shipment.shipment_ref, `${scenario.id}${runId}${index + 1}`);
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

  for (const shipment of scenario.shipmentRows) {
    await addChildRow(page, 'shipments', 'Entry Shipment', {
      ...shipment,
      shipment_no: shipmentNoByRef.get(shipment.shipment_ref),
      carrier_profile: carrierNameByRef.get(shipment.carrier_ref),
    });
  }

  for (const invoice of scenario.invoiceRows) {
    await addChildRow(page, 'invoices', 'Entry Invoice', {
      ...invoice,
      shipment_no: shipmentNoByRef.get(invoice.shipment_ref),
      invoice_number: invoiceNumberByRef.get(invoice.invoice_ref),
    });
  }

  for (const article of scenario.articleRows) {
    await addChildRow(page, 'articles', 'Entry Article', {
      ...article,
      shipment_no: shipmentNoByRef.get(article.shipment_ref),
      invoice_number: invoiceNumberByRef.get(article.invoice_ref),
    });
  }

  for (const tariff of scenario.tariffRows) {
    await addChildRow(page, 'tariff_lines', 'Entry Tariff Line', {
      ...tariff,
      shipment_no: shipmentNoByRef.get(tariff.shipment_ref),
      invoice_number: invoiceNumberByRef.get(tariff.invoice_ref),
    });
  }

  await saveDraft(page);
  await submitDoc(page);

  const finalName = await currentDocName(page);
  const finalEntryNumber = await currentEntryNumber(page);
  expect(finalEntryNumber).toMatch(/^\d{8}$/);

  const verification = await page.evaluate(async (name) => {
    const response = await (window as any).frappe.call({ method: 'andersoncb_erp.api.verify_entry_roundtrip', args: { name } });
    return response.message;
  }, finalName);

  expect(verification.ok).toBeTruthy();
  expect(verification.differences).toEqual([]);
}

const CASES: EntryCase[] = [
  {
    id: '31',
    title: 'one shipment three invoices',
    importer: { display_name: 'Importer India 31', importer_code: 'IMPIND31', contact_name: 'Ops User', email: 'impind31@example.com', phone: '5553131', address_line1: '3131 Invoice Tower', city: 'San Francisco', state: 'CA', postal_code: '94128', country: 'US' },
    carriers: [{ carrier_ref: 'A', display_name: 'Carrier Air 31', carrier_code: 'AR31', carrier_type: 'Air', airway_bill_prefix: '001' }],
    entry: { entry_number: 'TMPC31A', filer_code: 'SY1', entry_type: '03', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2801', port_of_unlading: '2801', transport_mode: '40', conveyance_name: 'AIR INV31', trip_identifier: 'AR31', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 5400, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'A', shipment_no: '200031', mode: '40', port_of_entry: '2801', port_of_unlading: '2801', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AR-31' }],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-031-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1800, vendor_name: 'Vendor 31A' },
      { invoice_ref: 'B', shipment_ref: 'S1', invoice_number: 'INV-031-B', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1800, vendor_name: 'Vendor 31B' },
      { invoice_ref: 'C', shipment_ref: 'S1', invoice_number: 'INV-031-C', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1800, vendor_name: 'Vendor 31C' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic air item lot A', line_item_identifier: 'A31', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 30, entered_value: 1800, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.9 },
      { shipment_ref: 'S1', invoice_ref: 'B', article_line_no: '2', description: 'Synthetic air item lot B', line_item_identifier: 'B31', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 30, entered_value: 1800, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.9 },
      { shipment_ref: 'S1', invoice_ref: 'C', article_line_no: '3', description: 'Synthetic air item lot C', line_item_identifier: 'C31', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 30, entered_value: 1800, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.9 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '8703230190', quantity: 1, uom: 'NO', entered_value: 1800, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'B', line_no: '2', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1800, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'C', line_no: '3', article_line_no: '3', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1800, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'C', line_no: '4', article_line_no: '3', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1800, country_of_origin: 'CN' },
    ],
  },
  {
    id: '32',
    title: 'two shipments one invoice each',
    importer: { display_name: 'Importer Charlie 32', importer_code: 'IMPCHL32', contact_name: 'Ops User', email: 'impchl32@example.com', phone: '5553232', address_line1: '3232 Border Route', city: 'Champlain', state: 'NY', postal_code: '12919', country: 'US' },
    carriers: [{ carrier_ref: 'A', display_name: 'Carrier Truck 32', carrier_code: 'TR32' }],
    entry: { entry_number: 'TMPC32A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '0712', port_of_unlading: '0712', transport_mode: '30', conveyance_name: 'TRUCK DUAL 32', trip_identifier: 'TR32', payment_type: '3', bond_type: '9', surety_code: '036', total_entered_value: 3200, currency: 'USD' },
    shipmentRows: [
      { shipment_ref: 'S1', carrier_ref: 'A', shipment_no: '2000321', mode: '30', port_of_entry: '0712', port_of_unlading: '0712', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-321' },
      { shipment_ref: 'S2', carrier_ref: 'A', shipment_no: '2000322', mode: '30', port_of_entry: '0712', port_of_unlading: '0712', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-322' },
    ],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-032-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1500, vendor_name: 'Vendor 32A' },
      { invoice_ref: 'B', shipment_ref: 'S2', invoice_number: 'INV-032-B', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1700, vendor_name: 'Vendor 32B' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic food truck lot', line_item_identifier: 'A32', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 35, entered_value: 1500, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.1 },
      { shipment_ref: 'S2', invoice_ref: 'B', article_line_no: '2', description: 'Synthetic consumer truck lot', line_item_identifier: 'B32', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 37, entered_value: 1700, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.5 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1500, country_of_origin: 'CA' },
      { shipment_ref: 'S2', invoice_ref: 'B', line_no: '2', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1700, country_of_origin: 'MX' },
    ],
  },
  {
    id: '33',
    title: 'two shipments mixed carriers',
    importer: { display_name: 'Importer Mixed 33', importer_code: 'IMPMIX33', contact_name: 'Ops User', email: 'impmix33@example.com', phone: '5553333', address_line1: '3333 Split Carrier Way', city: 'Newark', state: 'NJ', postal_code: '07114', country: 'US' },
    carriers: [
      { carrier_ref: 'O', display_name: 'Carrier Ocean 33', carrier_code: 'OC33' },
      { carrier_ref: 'T', display_name: 'Carrier Truck 33', carrier_code: 'TR33' },
    ],
    entry: { entry_number: 'TMPC33A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '4601', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'MIX SHIP 33', trip_identifier: 'MX33', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 5100, currency: 'USD' },
    shipmentRows: [
      { shipment_ref: 'S1', carrier_ref: 'O', shipment_no: '2000331', mode: '11', port_of_entry: '4601', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-331' },
      { shipment_ref: 'S2', carrier_ref: 'T', shipment_no: '2000332', mode: '30', port_of_entry: '0712', port_of_unlading: '0712', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-332' },
    ],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-033-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2100, vendor_name: 'Vendor 33A' },
      { invoice_ref: 'B', shipment_ref: 'S2', invoice_number: 'INV-033-B', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 3000, vendor_name: 'Vendor 33B' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic paper sea lot', line_item_identifier: 'A33', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 42, entered_value: 2100, harbor_maintenance_fee: 0, merchandise_processing_fee: 4.2 },
      { shipment_ref: 'S2', invoice_ref: 'B', article_line_no: '2', description: 'Synthetic food truck lot', line_item_identifier: 'B33', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 51, entered_value: 1500, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.2 },
      { shipment_ref: 'S2', invoice_ref: 'B', article_line_no: '3', description: 'Synthetic consumer truck lot', line_item_identifier: 'C33', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 52, entered_value: 1500, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.2 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '4819200040', quantity: 1, uom: 'KG', entered_value: 2100, country_of_origin: 'CA' },
      { shipment_ref: 'S2', invoice_ref: 'B', line_no: '2', article_line_no: '2', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1500, country_of_origin: 'CA' },
      { shipment_ref: 'S2', invoice_ref: 'B', line_no: '3', article_line_no: '3', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1500, country_of_origin: 'MX' },
      { shipment_ref: 'S2', invoice_ref: 'B', line_no: '4', article_line_no: '3', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1500, country_of_origin: 'MX' },
    ],
  },
  {
    id: '34',
    title: 'three shipments one entry',
    importer: { display_name: 'Importer Alpha 34', importer_code: 'IMPALP34', contact_name: 'Ops User', email: 'impalp34@example.com', phone: '5553434', address_line1: '3434 Multi Ship Rd', city: 'Newark', state: 'NJ', postal_code: '07114', country: 'US' },
    carriers: [
      { carrier_ref: 'O', display_name: 'Carrier Ocean 34', carrier_code: 'OC34' },
      { carrier_ref: 'T', display_name: 'Carrier Truck 34', carrier_code: 'TR34' },
      { carrier_ref: 'A', display_name: 'Carrier Air 34', carrier_code: 'AR34', carrier_type: 'Air', airway_bill_prefix: '001' },
    ],
    entry: { entry_number: 'TMPC34A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '4601', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'TRI SHIP 34', trip_identifier: 'TS34', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 6900, currency: 'USD' },
    shipmentRows: [
      { shipment_ref: 'S1', carrier_ref: 'O', shipment_no: '2000341', mode: '11', port_of_entry: '4601', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-341' },
      { shipment_ref: 'S2', carrier_ref: 'T', shipment_no: '2000342', mode: '30', port_of_entry: '0712', port_of_unlading: '0712', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-342' },
      { shipment_ref: 'S3', carrier_ref: 'A', shipment_no: '2000343', mode: '40', port_of_entry: '2801', port_of_unlading: '2801', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AR-343' },
    ],
    invoiceRows: [
      { invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-034-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2300, vendor_name: 'Vendor 34A' },
      { invoice_ref: 'B', shipment_ref: 'S2', invoice_number: 'INV-034-B', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2100, vendor_name: 'Vendor 34B' },
      { invoice_ref: 'C', shipment_ref: 'S3', invoice_number: 'INV-034-C', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2500, vendor_name: 'Vendor 34C' },
    ],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic paper shipment', line_item_identifier: 'A34', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 40, entered_value: 2300, harbor_maintenance_fee: 0, merchandise_processing_fee: 4.4 },
      { shipment_ref: 'S2', invoice_ref: 'B', article_line_no: '2', description: 'Synthetic food shipment', line_item_identifier: 'B34', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 45, entered_value: 2100, harbor_maintenance_fee: 0, merchandise_processing_fee: 4.0 },
      { shipment_ref: 'S3', invoice_ref: 'C', article_line_no: '3', description: 'Synthetic consumer air shipment', line_item_identifier: 'C34', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 38, entered_value: 2500, harbor_maintenance_fee: 0, merchandise_processing_fee: 4.8 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '4819200040', quantity: 1, uom: 'KG', entered_value: 2300, country_of_origin: 'CA' },
      { shipment_ref: 'S2', invoice_ref: 'B', line_no: '2', article_line_no: '2', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 2100, country_of_origin: 'CA' },
      { shipment_ref: 'S3', invoice_ref: 'C', line_no: '3', article_line_no: '3', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 2500, country_of_origin: 'CN' },
    ],
  },
  {
    id: '35',
    title: 'one invoice four articles',
    importer: { display_name: 'Importer Foxtrot 35', importer_code: 'IMPFOX35', contact_name: 'Ops User', email: 'impfox35@example.com', phone: '5553535', address_line1: '3535 Article Row', city: 'Baltimore', state: 'MD', postal_code: '21224', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean 35', carrier_code: 'OC35' }],
    entry: { entry_number: 'TMPC35A', filer_code: 'SY1', entry_type: '03', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '1303', port_of_unlading: '1303', transport_mode: '11', conveyance_name: 'ART FOUR 35', trip_identifier: 'OC35', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 5200, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', shipment_no: '200035', mode: '11', port_of_entry: '1303', port_of_unlading: '1303', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-35' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-035-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 5200, vendor_name: 'Vendor 35A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic furniture lot one', line_item_identifier: 'A35', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 48, entered_value: 1300, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.7 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Synthetic wood lot two', line_item_identifier: 'B35', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 49, entered_value: 1300, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.7 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '3', description: 'Synthetic paper lot three', line_item_identifier: 'C35', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 50, entered_value: 1300, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.7 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '4', description: 'Synthetic plastic lot four', line_item_identifier: 'D35', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 51, entered_value: 1300, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.7 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '9403409060', quantity: 1, uom: 'NO', entered_value: 1300, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '4404200080', quantity: 1, uom: 'KG', entered_value: 1300, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '3', hs_code: '4819200040', quantity: 1, uom: 'KG', entered_value: 1300, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '4', article_line_no: '4', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1300, country_of_origin: 'MX' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '5', article_line_no: '4', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1300, country_of_origin: 'MX' },
    ],
  },
  {
    id: '36',
    title: 'one invoice seven articles',
    importer: { display_name: 'Importer Delta 36', importer_code: 'IMPDEL36', contact_name: 'Ops User', email: 'impdel36@example.com', phone: '5553636', address_line1: '3636 Article Stack', city: 'San Francisco', state: 'CA', postal_code: '94128', country: 'US' },
    carriers: [{ carrier_ref: 'A', display_name: 'Carrier Air 36', carrier_code: 'AR36', carrier_type: 'Air', airway_bill_prefix: '001' }],
    entry: { entry_number: 'TMPC36A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2801', port_of_unlading: '2801', transport_mode: '40', conveyance_name: 'ART SEVEN 36', trip_identifier: 'AR36', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 7000, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'A', shipment_no: '200036', mode: '40', port_of_entry: '2801', port_of_unlading: '2801', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AR-36' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-036-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 7000, vendor_name: 'Vendor 36A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic mixed lot 1', line_item_identifier: 'A36', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 20, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Synthetic mixed lot 2', line_item_identifier: 'B36', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 20, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '3', description: 'Synthetic mixed lot 3', line_item_identifier: 'C36', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 20, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '4', description: 'Synthetic mixed lot 4', line_item_identifier: 'D36', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 20, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '5', description: 'Synthetic mixed lot 5', line_item_identifier: 'E36', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 20, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '6', description: 'Synthetic mixed lot 6', line_item_identifier: 'F36', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 20, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '7', description: 'Synthetic mixed lot 7', line_item_identifier: 'G36', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 20, entered_value: 1000, harbor_maintenance_fee: 0, merchandise_processing_fee: 2.0 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '8703230190', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '3', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '4', article_line_no: '3', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '5', article_line_no: '4', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '6', article_line_no: '5', hs_code: '4819200040', quantity: 1, uom: 'KG', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '7', article_line_no: '6', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1000, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '8', article_line_no: '7', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1000, country_of_origin: 'CN' },
    ],
  },
];

for (const scenario of CASES) {
  test(`case ${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}

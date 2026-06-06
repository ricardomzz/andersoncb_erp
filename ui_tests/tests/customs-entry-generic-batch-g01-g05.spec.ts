import { expect, test } from '@playwright/test';

const loginEmail = process.env.UI_LOGIN_EMAIL;
const loginPassword = process.env.UI_LOGIN_PASSWORD;

async function login(page) {
  if (!loginEmail || !loginPassword) throw new Error('UI_LOGIN_EMAIL and UI_LOGIN_PASSWORD are required.');
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
  await page.waitForFunction((expected) => Boolean((window as any).cur_frm) && (window as any).cur_frm.doctype === expected, doctype);
}

async function setFormValues(page, values: Record<string, any>) {
  await page.evaluate(async (payload) => { await (window as any).cur_frm.set_value(payload); }, values);
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
      const response = await (window as any).frappe.call({ method: 'frappe.desk.form.save.savedocs', args: { doc: JSON.stringify(frm.doc), action: 'Save' } });
      return { ok: true, response };
    } catch (error: any) {
      const serialized = (() => { try { return JSON.stringify(error); } catch { return String(error); } })();
      return { ok: false, error: error?.message || serialized || String(error) };
    }
  });
  if (!result?.ok) throw new Error(result?.error || 'Save failed');
  await page.waitForLoadState('networkidle');
  await page.reload({ waitUntil: 'networkidle' });
}

async function submitDoc(page) {
  const context = await page.evaluate(() => ({ doctype: (window as any).cur_frm.doctype as string }));
  const routeByDoctype: Record<string, string> = { 'Importer Profile': 'importer-profile', Carrier: 'carrier', 'Customs Entry': 'customs-entry' };
  const result = await page.evaluate(async () => {
    const frm = (window as any).cur_frm;
    const methodByDoctype: Record<string, string> = { 'Importer Profile': 'andersoncb_erp.api.submit_importer_profile', Carrier: 'andersoncb_erp.api.submit_carrier', 'Customs Entry': 'andersoncb_erp.api.submit_entry' };
    const method = methodByDoctype[frm.doctype];
    if (!method) throw new Error(`No submit RPC mapping for ${frm.doctype}`);
    try {
      const response = await (window as any).frappe.call({ method, args: { name: frm.doc.name } });
      return { ok: true, result: response.message };
    } catch (error: any) {
      const serialized = (() => { try { return JSON.stringify(error); } catch { return String(error); } })();
      return { ok: false, error: error?.message || serialized || String(error) };
    }
  });
  if (!result?.ok || !result?.result?.ok) throw new Error(result?.error || result?.result?.error || 'Submit failed');
  await page.waitForLoadState('networkidle');
  const finalName = result?.result?.name;
  const route = routeByDoctype[context.doctype];
  if (finalName && route) await page.goto(`/app/${route}/${finalName}`, { waitUntil: 'networkidle' });
  else await page.reload({ waitUntil: 'networkidle' });
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
    const response = await (window as any).frappe.call({ method: 'frappe.client.get_list', args: { doctype, filters: [[doctype, fieldname, '=', value]], fields: ['name'], limit_page_length: 1 } });
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

type CarrierScenario = Record<string, any> & { carrier_ref: string };
type ShipmentScenario = Record<string, any> & { shipment_ref: string; carrier_ref: string };
type InvoiceScenario = Record<string, any> & { invoice_ref: string; shipment_ref: string };
type ArticleScenario = Record<string, any> & { invoice_ref: string; shipment_ref: string };
type TariffScenario = Record<string, any> & { invoice_ref: string; shipment_ref: string };
type EntryCase = { id: string; title: string; importer: Record<string, any>; carriers: CarrierScenario[]; entry: Record<string, any>; shipmentRows: ShipmentScenario[]; invoiceRows: InvoiceScenario[]; articleRows: ArticleScenario[]; tariffRows: TariffScenario[]; };

async function runEntryCase(page, scenario: EntryCase) {
  const runId = String(Date.now()).slice(-6);
  const clientRef = `UI-${scenario.id}-${runId}`;
  const bondNumber = `B${scenario.id}${runId}`.slice(0, 9);
  const houseBill = `HB${scenario.id}${runId}`;
  const masterBill = `MB${scenario.id}${runId}`;
  const draftEntryNumber = `TMP${scenario.id.replace('G', '').slice(-2)}${runId.slice(-3)}`;

  await login(page);

  const importerCode = `${scenario.id.replace(/[^A-Z0-9]/g, '').slice(0, 3)}${runId.slice(-4)}`.slice(0, 8);
  const importerName = await ensureImporterProfile(page, {
    ...scenario.importer,
    display_name: `${scenario.importer.display_name} ${runId}`,
    importer_code: importerCode,
    email: `${scenario.id.toLowerCase()}+${runId}@example.com`,
  });

  const carrierNameByRef = new Map<string, string>();
  for (const carrier of scenario.carriers) {
    const carrierCodeSeed = (carrier.carrier_code || carrier.carrier_ref).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const carrierCode = `${carrierCodeSeed.slice(0, 2)}${runId.slice(-2)}${carrier.carrier_ref.slice(-1)}`.slice(0, 4);
    const carrierName = await ensureCarrier(page, { ...carrier, display_name: `${carrier.display_name} ${runId}`, carrier_code: carrierCode });
    carrierNameByRef.set(carrier.carrier_ref, carrierName);
  }

  const shipmentNoByRef = new Map<string, string>();
  scenario.shipmentRows.forEach((shipment, index) => shipmentNoByRef.set(shipment.shipment_ref, `${scenario.id.replace('G', '9')}${runId}${index + 1}`));
  const invoiceNumberByRef = new Map<string, string>();
  scenario.invoiceRows.forEach((invoice, index) => invoiceNumberByRef.set(invoice.invoice_ref, `INV-${scenario.id}-${runId}-${index + 1}`));

  await page.goto('/app/customs-entry/new-customs-entry-1');
  await waitForForm(page, 'Customs Entry');
  await setFormValues(page, { ...scenario.entry, entry_number: draftEntryNumber, client_ref: clientRef, bond_number: bondNumber, house_bill: houseBill, master_bill: masterBill, importer_profile: importerName });

  for (const shipment of scenario.shipmentRows) {
    await addChildRow(page, 'shipments', 'Entry Shipment', { ...shipment, shipment_no: shipmentNoByRef.get(shipment.shipment_ref), carrier_profile: carrierNameByRef.get(shipment.carrier_ref) });
  }
  for (const invoice of scenario.invoiceRows) {
    await addChildRow(page, 'invoices', 'Entry Invoice', { ...invoice, shipment_no: shipmentNoByRef.get(invoice.shipment_ref), invoice_number: invoiceNumberByRef.get(invoice.invoice_ref) });
  }
  for (const article of scenario.articleRows) {
    await addChildRow(page, 'articles', 'Entry Article', { ...article, shipment_no: shipmentNoByRef.get(article.shipment_ref), invoice_number: invoiceNumberByRef.get(article.invoice_ref) });
  }
  for (const tariff of scenario.tariffRows) {
    await addChildRow(page, 'tariff_lines', 'Entry Tariff Line', { ...tariff, shipment_no: shipmentNoByRef.get(tariff.shipment_ref), invoice_number: invoiceNumberByRef.get(tariff.invoice_ref) });
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

test.describe.configure({ mode: 'serial' });
for (const scenario of CASES) {
  test(`${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}

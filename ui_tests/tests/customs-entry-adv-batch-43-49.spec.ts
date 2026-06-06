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
    const carrierName = await ensureCarrier(page, { ...carrier, display_name: `${carrier.display_name} ${runId}`, carrier_code: carrierCode });
    carrierNameByRef.set(carrier.carrier_ref, carrierName);
  }

  const shipmentNoByRef = new Map<string, string>();
  scenario.shipmentRows.forEach((shipment, index) => shipmentNoByRef.set(shipment.shipment_ref, `${scenario.id}${runId}${index + 1}`));
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
    id: '43',
    title: 'payment type 3 baseline',
    importer: { display_name: 'Importer Alpha 43', importer_code: 'IMPALP43', contact_name: 'Ops User', email: 'impalp43@example.com', phone: '5554343', address_line1: '4343 Daily Importer Way', city: 'Newark', state: 'NJ', postal_code: '07114', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean 43', carrier_code: 'OC43' }],
    entry: { entry_number: 'TMPC43A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '4601', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'PAY3 43', trip_identifier: 'OC43', payment_type: '3', bond_type: '8', surety_code: '036', total_entered_value: 1800, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', shipment_no: '200043', mode: '11', port_of_entry: '4601', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-43' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-043-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1800, vendor_name: 'Vendor 43A' }],
    articleRows: [{ shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic paper daily importer lot', line_item_identifier: 'A43', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 38, entered_value: 1800, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.6 }],
    tariffRows: [{ shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '4819200040', quantity: 1, uom: 'KG', entered_value: 1800, country_of_origin: 'CA' }],
  },
  {
    id: '44',
    title: 'single transaction bond baseline',
    importer: { display_name: 'Importer Delta 44', importer_code: 'IMPDEL44', contact_name: 'Ops User', email: 'impdel44@example.com', phone: '5554444', address_line1: '4444 Bond Lane', city: 'San Francisco', state: 'CA', postal_code: '94128', country: 'US' },
    carriers: [{ carrier_ref: 'A', display_name: 'Carrier Air 44', carrier_code: 'AR44', carrier_type: 'Air', airway_bill_prefix: '001' }],
    entry: { entry_number: 'TMPC44A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2801', port_of_unlading: '2801', transport_mode: '40', conveyance_name: 'BOND9 44', trip_identifier: 'AR44', payment_type: '2', bond_type: '9', surety_code: '036', total_entered_value: 2000, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'A', shipment_no: '200044', mode: '40', port_of_entry: '2801', port_of_unlading: '2801', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AR-44' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-044-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2000, vendor_name: 'Vendor 44A' }],
    articleRows: [{ shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic consumer bond lot', line_item_identifier: 'A44', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 30, entered_value: 2000, harbor_maintenance_fee: 0, merchandise_processing_fee: 4.0 }],
    tariffRows: [{ shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 2000, country_of_origin: 'CN' }],
  },
  {
    id: '45',
    title: 'payment type 3 plus bond type 9',
    importer: { display_name: 'Importer Hotel 45', importer_code: 'IMPHOT45', contact_name: 'Ops User', email: 'imphot45@example.com', phone: '5554545', address_line1: '4545 Combo Route', city: 'Champlain', state: 'NY', postal_code: '12919', country: 'US' },
    carriers: [{ carrier_ref: 'T', display_name: 'Carrier Truck 45', carrier_code: 'TR45' }],
    entry: { entry_number: 'TMPC45A', filer_code: 'SY1', entry_type: '03', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '0712', port_of_unlading: '0712', transport_mode: '30', conveyance_name: 'COMBO 45', trip_identifier: 'TR45', payment_type: '3', bond_type: '9', surety_code: '036', total_entered_value: 3200, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'T', shipment_no: '200045', mode: '30', port_of_entry: '0712', port_of_unlading: '0712', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'TR-45' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-045-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 3200, vendor_name: 'Vendor 45A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic food combo lot one', line_item_identifier: 'A45', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 44, entered_value: 1600, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.5 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Synthetic food combo lot two', line_item_identifier: 'B45', country_of_origin: 'CA', country_of_export: 'CA', gross_weight: 45, entered_value: 1600, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.5 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '2106909998', quantity: 1, uom: 'KG', entered_value: 1600, country_of_origin: 'CA' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '99030125', quantity: 1, uom: 'NO', entered_value: 1600, country_of_origin: 'CA' },
    ],
  },
  {
    id: '46',
    title: 'port of entry differs from unlading',
    importer: { display_name: 'Importer Port 46', importer_code: 'IMPPRT46', contact_name: 'Ops User', email: 'impprt46@example.com', phone: '5554646', address_line1: '4646 Port Split Way', city: 'Long Beach', state: 'CA', postal_code: '90802', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean 46', carrier_code: 'OC46' }],
    entry: { entry_number: 'TMPC46A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2704', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'PORTDIFF 46', trip_identifier: 'OC46', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 2600, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', shipment_no: '200046', mode: '11', port_of_entry: '2704', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-46' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-046-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2600, vendor_name: 'Vendor 46A' }],
    articleRows: [{ shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic furniture split-port lot', line_item_identifier: 'A46', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 55, entered_value: 2600, harbor_maintenance_fee: 0, merchandise_processing_fee: 5.0 }],
    tariffRows: [{ shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '9403409060', quantity: 1, uom: 'NO', entered_value: 2600, country_of_origin: 'CN' }],
  },
  {
    id: '47',
    title: 'shipment origin export diversity',
    importer: { display_name: 'Importer Origin 47', importer_code: 'IMPORG47', contact_name: 'Ops User', email: 'imporg47@example.com', phone: '5554747', address_line1: '4747 Origin Lane', city: 'Long Beach', state: 'CA', postal_code: '90802', country: 'US' },
    carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean 47', carrier_code: 'OC47' }],
    entry: { entry_number: 'TMPC47A', filer_code: 'SY1', entry_type: '03', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2704', port_of_unlading: '1303', transport_mode: '11', conveyance_name: 'ORIGEXP 47', trip_identifier: 'OC47', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 3600, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', shipment_no: '200047', mode: '11', port_of_entry: '2704', port_of_unlading: '1303', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-47' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-047-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 3600, vendor_name: 'Vendor 47A' }],
    articleRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic origin combo lot one', line_item_identifier: 'A47', country_of_origin: 'CN', country_of_export: 'VN', gross_weight: 60, entered_value: 1800, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.8 },
      { shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '2', description: 'Synthetic origin combo lot two', line_item_identifier: 'B47', country_of_origin: 'MX', country_of_export: 'CA', gross_weight: 62, entered_value: 1800, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.8 },
    ],
    tariffRows: [
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1800, country_of_origin: 'CN' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1800, country_of_origin: 'MX' },
      { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '2', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 1800, country_of_origin: 'MX' },
    ],
  },
  {
    id: '48',
    title: 'reuse importer across different modes',
    importer: { display_name: 'Importer Alpha 48', importer_code: 'IMPALP48', contact_name: 'Ops User', email: 'impalp48@example.com', phone: '5554848', address_line1: '4848 Reuse Mode Road', city: 'Rosemont', state: 'IL', postal_code: '60018', country: 'US' },
    carriers: [{ carrier_ref: 'R', display_name: 'Carrier Rail 48', carrier_code: 'RL48' }],
    entry: { entry_number: 'TMPC48A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '3901', port_of_unlading: '4601', transport_mode: '21', conveyance_name: 'REUSEIMP 48', trip_identifier: 'RL48', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 2100, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'R', shipment_no: '200048', mode: '21', port_of_entry: '3901', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'RL-48' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-048-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2100, vendor_name: 'Vendor 48A' }],
    articleRows: [{ shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic importer reuse rail lot', line_item_identifier: 'A48', country_of_origin: 'MX', country_of_export: 'MX', gross_weight: 42, entered_value: 2100, harbor_maintenance_fee: 0, merchandise_processing_fee: 4.2 }],
    tariffRows: [{ shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 2100, country_of_origin: 'MX' }],
  },
  {
    id: '49',
    title: 'reuse carrier across multiple importers',
    importer: { display_name: 'Importer Sierra 49', importer_code: 'IMPSIE49', contact_name: 'Ops User', email: 'impsie49@example.com', phone: '5554949', address_line1: '4949 Reuse Carrier Ave', city: 'Philadelphia', state: 'PA', postal_code: '19153', country: 'US' },
    carriers: [{ carrier_ref: 'A', display_name: 'Carrier Air 49', carrier_code: 'AR49', carrier_type: 'Air', airway_bill_prefix: '001' }],
    entry: { entry_number: 'TMPC49A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '1108', port_of_unlading: '1108', transport_mode: '40', conveyance_name: 'REUSECAR 49', trip_identifier: 'AR49', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 1900, currency: 'USD' },
    shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'A', shipment_no: '200049', mode: '40', port_of_entry: '1108', port_of_unlading: '1108', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AR-49' }],
    invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-049-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1900, vendor_name: 'Vendor 49A' }],
    articleRows: [{ shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic carrier reuse air lot', line_item_identifier: 'A49', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 29, entered_value: 1900, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.9 }],
    tariffRows: [{ shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1900, country_of_origin: 'CN' }],
  },
];

for (const scenario of CASES) {
  test(`case ${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}

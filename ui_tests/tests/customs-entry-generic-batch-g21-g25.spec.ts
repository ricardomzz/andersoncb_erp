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

test.describe.configure({ mode: 'serial' });
for (const scenario of CASES) {
  test(`${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}


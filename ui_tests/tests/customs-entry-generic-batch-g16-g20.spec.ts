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

test.describe.configure({ mode: 'serial' });
for (const scenario of CASES) {
  test(`${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}

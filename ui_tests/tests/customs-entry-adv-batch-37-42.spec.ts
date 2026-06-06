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

function buildArticleRows(count: number, shipmentRef: string, invoiceRefs: string[], baseDescriptions: string[], values: number[]) {
  return Array.from({ length: count }, (_, i) => ({
    shipment_ref: shipmentRef,
    invoice_ref: invoiceRefs[i % invoiceRefs.length],
    article_line_no: String(i + 1),
    description: `${baseDescriptions[i % baseDescriptions.length]} ${i + 1}`,
    line_item_identifier: `${String.fromCharCode(65 + (i % 26))}${(i + 1) % 10}`,
    country_of_origin: i % 3 === 0 ? 'CN' : i % 3 === 1 ? 'CA' : 'MX',
    country_of_export: i % 3 === 0 ? 'CN' : i % 3 === 1 ? 'CA' : 'MX',
    gross_weight: 20 + i,
    entered_value: values[i],
    harbor_maintenance_fee: 0,
    merchandise_processing_fee: 2.0 + ((i % 4) * 0.5),
  }));
}

const CASES: EntryCase[] = (() => {
  const case37Values = Array.from({ length: 12 }, () => 600);
  const case37Articles = buildArticleRows(12, 'S1', ['A', 'B', 'C'], ['Synthetic broad commodity lot'], case37Values);
  const case37Tariffs: TariffScenario[] = [];
  case37Articles.forEach((article, idx) => {
    case37Tariffs.push({ shipment_ref: 'S1', invoice_ref: article.invoice_ref, line_no: String(case37Tariffs.length + 1), article_line_no: article.article_line_no, hs_code: idx % 3 === 0 ? '4819200040' : idx % 3 === 1 ? '3925900000' : '2106909998', quantity: 1, uom: idx % 3 === 2 ? 'KG' : 'NO', entered_value: article.entered_value, country_of_origin: article.country_of_origin });
    if (idx < 6) case37Tariffs.push({ shipment_ref: 'S1', invoice_ref: article.invoice_ref, line_no: String(case37Tariffs.length + 1), article_line_no: article.article_line_no, hs_code: idx % 2 === 0 ? '99038803' : '99030301', quantity: 1, uom: 'NO', entered_value: article.entered_value, country_of_origin: article.country_of_origin });
  });

  const case38Values = Array.from({ length: 14 }, () => 500);
  const case38Articles = buildArticleRows(14, 'S1', ['A', 'B', 'C', 'D'], ['Synthetic heavy commodity lot'], case38Values);
  const case38Tariffs: TariffScenario[] = [];
  case38Articles.forEach((article, idx) => {
    case38Tariffs.push({ shipment_ref: 'S1', invoice_ref: article.invoice_ref, line_no: String(case38Tariffs.length + 1), article_line_no: article.article_line_no, hs_code: idx % 4 === 0 ? '9403409060' : idx % 4 === 1 ? '4404200080' : idx % 4 === 2 ? '3925900000' : '4819200040', quantity: 1, uom: idx % 4 === 1 || idx % 4 === 3 ? 'KG' : 'NO', entered_value: article.entered_value, country_of_origin: article.country_of_origin });
    if (idx < 6) case38Tariffs.push({ shipment_ref: 'S1', invoice_ref: article.invoice_ref, line_no: String(case38Tariffs.length + 1), article_line_no: article.article_line_no, hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: article.entered_value, country_of_origin: article.country_of_origin });
  });

  const case41Values = [900, 1100, 1300];
  const case41Articles = buildArticleRows(3, 'S1', ['A'], ['Synthetic mixed tariff depth lot'], case41Values);
  const case41Tariffs: TariffScenario[] = [
    { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 900, country_of_origin: case41Articles[0].country_of_origin },
    { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '2', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1100, country_of_origin: case41Articles[1].country_of_origin },
    { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '2', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1100, country_of_origin: case41Articles[1].country_of_origin },
    { shipment_ref: 'S1', invoice_ref: 'A', line_no: '4', article_line_no: '3', hs_code: '3925900000', quantity: 1, uom: 'NO', entered_value: 1300, country_of_origin: case41Articles[2].country_of_origin },
    { shipment_ref: 'S1', invoice_ref: 'A', line_no: '5', article_line_no: '3', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1300, country_of_origin: case41Articles[2].country_of_origin },
    { shipment_ref: 'S1', invoice_ref: 'A', line_no: '6', article_line_no: '3', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 1300, country_of_origin: case41Articles[2].country_of_origin },
    { shipment_ref: 'S1', invoice_ref: 'A', line_no: '7', article_line_no: '3', hs_code: '99030125', quantity: 1, uom: 'NO', entered_value: 1300, country_of_origin: case41Articles[2].country_of_origin },
  ];

  const case42Values = Array.from({ length: 8 }, () => 600);
  const case42Articles = buildArticleRows(8, 'S1', ['A', 'B'], ['Synthetic stress tariff lot'], case42Values);
  const case42Tariffs: TariffScenario[] = [];
  case42Articles.forEach((article, idx) => {
    case42Tariffs.push({ shipment_ref: 'S1', invoice_ref: article.invoice_ref, line_no: String(case42Tariffs.length + 1), article_line_no: article.article_line_no, hs_code: idx % 2 === 0 ? '4819200040' : '3925900000', quantity: 1, uom: idx % 2 === 0 ? 'KG' : 'NO', entered_value: article.entered_value, country_of_origin: article.country_of_origin });
    case42Tariffs.push({ shipment_ref: 'S1', invoice_ref: article.invoice_ref, line_no: String(case42Tariffs.length + 1), article_line_no: article.article_line_no, hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: article.entered_value, country_of_origin: article.country_of_origin });
    case42Tariffs.push({ shipment_ref: 'S1', invoice_ref: article.invoice_ref, line_no: String(case42Tariffs.length + 1), article_line_no: article.article_line_no, hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: article.entered_value, country_of_origin: article.country_of_origin });
  });

  return [
    {
      id: '37',
      title: 'one entry twelve articles',
      importer: { display_name: 'Importer Volume 37', importer_code: 'IMPVOL37', contact_name: 'Ops User', email: 'impvol37@example.com', phone: '5553737', address_line1: '3737 Volume Row', city: 'Long Beach', state: 'CA', postal_code: '90802', country: 'US' },
      carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean 37', carrier_code: 'OC37' }],
      entry: { entry_number: 'TMPC37A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2704', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'VOL 37', trip_identifier: 'OC37', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 7200, currency: 'USD' },
      shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', shipment_no: '200037', mode: '11', port_of_entry: '2704', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-37' }],
      invoiceRows: [
        { invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-037-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2400, vendor_name: 'Vendor 37A' },
        { invoice_ref: 'B', shipment_ref: 'S1', invoice_number: 'INV-037-B', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2400, vendor_name: 'Vendor 37B' },
        { invoice_ref: 'C', shipment_ref: 'S1', invoice_number: 'INV-037-C', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2400, vendor_name: 'Vendor 37C' },
      ],
      articleRows: case37Articles,
      tariffRows: case37Tariffs,
    },
    {
      id: '38',
      title: 'one entry fourteen articles',
      importer: { display_name: 'Importer Volume 38', importer_code: 'IMPVOL38', contact_name: 'Ops User', email: 'impvol38@example.com', phone: '5553838', address_line1: '3838 Volume Road', city: 'Long Beach', state: 'CA', postal_code: '90802', country: 'US' },
      carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean 38', carrier_code: 'OC38' }],
      entry: { entry_number: 'TMPC38A', filer_code: 'SY1', entry_type: '03', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2704', port_of_unlading: '1303', transport_mode: '11', conveyance_name: 'VOL 38', trip_identifier: 'OC38', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 7000, currency: 'USD' },
      shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', shipment_no: '200038', mode: '11', port_of_entry: '2704', port_of_unlading: '1303', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-38' }],
      invoiceRows: [
        { invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-038-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1750, vendor_name: 'Vendor 38A' },
        { invoice_ref: 'B', shipment_ref: 'S1', invoice_number: 'INV-038-B', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1750, vendor_name: 'Vendor 38B' },
        { invoice_ref: 'C', shipment_ref: 'S1', invoice_number: 'INV-038-C', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1750, vendor_name: 'Vendor 38C' },
        { invoice_ref: 'D', shipment_ref: 'S1', invoice_number: 'INV-038-D', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1750, vendor_name: 'Vendor 38D' },
      ],
      articleRows: case38Articles,
      tariffRows: case38Tariffs,
    },
    {
      id: '39',
      title: 'one article three tariffs',
      importer: { display_name: 'Importer Tariff 39', importer_code: 'IMPTAR39', contact_name: 'Ops User', email: 'imptar39@example.com', phone: '5553939', address_line1: '3939 Tariff Lane', city: 'Newark', state: 'NJ', postal_code: '07114', country: 'US' },
      carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean 39', carrier_code: 'OC39' }],
      entry: { entry_number: 'TMPC39A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '4601', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'TAR 39', trip_identifier: 'OC39', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 1900, currency: 'USD' },
      shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', shipment_no: '200039', mode: '11', port_of_entry: '4601', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-39' }],
      invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-039-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 1900, vendor_name: 'Vendor 39A' }],
      articleRows: [{ shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic paper layered tariff lot', line_item_identifier: 'A39', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 40, entered_value: 1900, harbor_maintenance_fee: 0, merchandise_processing_fee: 3.8 }],
      tariffRows: [
        { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '4819200040', quantity: 1, uom: 'KG', entered_value: 1900, country_of_origin: 'CN' },
        { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '1', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 1900, country_of_origin: 'CN' },
        { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '1', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 1900, country_of_origin: 'CN' },
      ],
    },
    {
      id: '40',
      title: 'one article four tariffs',
      importer: { display_name: 'Importer Tariff 40', importer_code: 'IMPTAR40', contact_name: 'Ops User', email: 'imptar40@example.com', phone: '5554040', address_line1: '4040 Tariff Circle', city: 'Rosemont', state: 'IL', postal_code: '60018', country: 'US' },
      carriers: [{ carrier_ref: 'R', display_name: 'Carrier Rail 40', carrier_code: 'RL40' }],
      entry: { entry_number: 'TMPC40A', filer_code: 'SY1', entry_type: '03', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '3901', port_of_unlading: '4601', transport_mode: '21', conveyance_name: 'TAR 40', trip_identifier: 'RL40', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 2200, currency: 'USD' },
      shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'R', shipment_no: '200040', mode: '21', port_of_entry: '3901', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'RL-40' }],
      invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-040-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2200, vendor_name: 'Vendor 40A' }],
      articleRows: [{ shipment_ref: 'S1', invoice_ref: 'A', article_line_no: '1', description: 'Synthetic tire layered tariff lot', line_item_identifier: 'A40', country_of_origin: 'CN', country_of_export: 'CN', gross_weight: 44, entered_value: 2200, harbor_maintenance_fee: 0, merchandise_processing_fee: 4.2 }],
      tariffRows: [
        { shipment_ref: 'S1', invoice_ref: 'A', line_no: '1', article_line_no: '1', hs_code: '4011201015', quantity: 1, uom: 'NO', entered_value: 2200, country_of_origin: 'CN' },
        { shipment_ref: 'S1', invoice_ref: 'A', line_no: '2', article_line_no: '1', hs_code: '99038803', quantity: 1, uom: 'NO', entered_value: 2200, country_of_origin: 'CN' },
        { shipment_ref: 'S1', invoice_ref: 'A', line_no: '3', article_line_no: '1', hs_code: '99030301', quantity: 1, uom: 'NO', entered_value: 2200, country_of_origin: 'CN' },
        { shipment_ref: 'S1', invoice_ref: 'A', line_no: '4', article_line_no: '1', hs_code: '99030125', quantity: 1, uom: 'NO', entered_value: 2200, country_of_origin: 'CN' },
      ],
    },
    {
      id: '41',
      title: 'multi article mixed tariff depths',
      importer: { display_name: 'Importer Depth 41', importer_code: 'IMPDEP41', contact_name: 'Ops User', email: 'impdep41@example.com', phone: '5554141', address_line1: '4141 Depth Drive', city: 'Philadelphia', state: 'PA', postal_code: '19153', country: 'US' },
      carriers: [{ carrier_ref: 'A', display_name: 'Carrier Air 41', carrier_code: 'AR41', carrier_type: 'Air', airway_bill_prefix: '001' }],
      entry: { entry_number: 'TMPC41A', filer_code: 'SY1', entry_type: '01', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '1108', port_of_unlading: '1108', transport_mode: '40', conveyance_name: 'DEPTH 41', trip_identifier: 'AR41', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 3300, currency: 'USD' },
      shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'A', shipment_no: '200041', mode: '40', port_of_entry: '1108', port_of_unlading: '1108', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-04', voyage_or_flight: 'AR-41' }],
      invoiceRows: [{ invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-041-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 3300, vendor_name: 'Vendor 41A' }],
      articleRows: case41Articles,
      tariffRows: case41Tariffs,
    },
    {
      id: '42',
      title: 'high tariff-count stress case',
      importer: { display_name: 'Importer Stress 42', importer_code: 'IMPSTR42', contact_name: 'Ops User', email: 'impstr42@example.com', phone: '5554242', address_line1: '4242 Stress Road', city: 'Long Beach', state: 'CA', postal_code: '90802', country: 'US' },
      carriers: [{ carrier_ref: 'O', display_name: 'Carrier Ocean 42', carrier_code: 'OC42' }],
      entry: { entry_number: 'TMPC42A', filer_code: 'SY1', entry_type: '03', entry_date: '2026-06-05', estimated_entry_date: '2026-06-05', port_of_entry: '2704', port_of_unlading: '4601', transport_mode: '11', conveyance_name: 'STRESS 42', trip_identifier: 'OC42', payment_type: '2', bond_type: '8', surety_code: '036', total_entered_value: 4800, currency: 'USD' },
      shipmentRows: [{ shipment_ref: 'S1', carrier_ref: 'O', shipment_no: '200042', mode: '11', port_of_entry: '2704', port_of_unlading: '4601', date_of_arrival: '2026-06-05', date_of_import: '2026-06-05', date_of_export: '2026-06-03', voyage_or_flight: 'OC-42' }],
      invoiceRows: [
        { invoice_ref: 'A', shipment_ref: 'S1', invoice_number: 'INV-042-A', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2400, vendor_name: 'Vendor 42A' },
        { invoice_ref: 'B', shipment_ref: 'S1', invoice_number: 'INV-042-B', invoice_date: '2026-06-05', currency: 'USD', invoice_amount: 2400, vendor_name: 'Vendor 42B' },
      ],
      articleRows: case42Articles,
      tariffRows: case42Tariffs,
    },
  ];
})();

for (const scenario of CASES) {
  test(`case ${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}

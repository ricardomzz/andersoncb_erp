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

async function currentEntryNumber(page) {
  await page.waitForFunction(() => Boolean((window as any).cur_frm?.doc));
  return await page.evaluate(() => ((window as any).cur_frm.doc.entry_number || (window as any).cur_frm.doc.name) as string);
}

async function currentDocName(page) {
  await page.waitForFunction(() => Boolean((window as any).cur_frm?.doc?.name));
  return await page.evaluate(() => (window as any).cur_frm.doc.name as string);
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
  const result = await page.evaluate(async () => {
    try {
      const response = await (window as any).frappe.call({ method: 'andersoncb_erp.api.submit_carrier', args: { name: (window as any).cur_frm.doc.name } });
      return { ok: true, result: response.message };
    } catch (error: any) {
      const serialized = (() => { try { return JSON.stringify(error); } catch { return String(error); } })();
      return { ok: false, error: error?.message || serialized || String(error) };
    }
  });
  if (!result?.ok || !result?.result?.ok) throw new Error(result?.error || result?.result?.error || 'Carrier submit failed');
  return carrierName;
}

test('case 50 full mixed-complexity capstone', async ({ page }) => {
  const runId = String(Date.now()).slice(-6);
  const clientRef = `UI-CASE-50-${runId}`;
  const bondNumber = `B50${runId}`.slice(0, 9);
  const houseBill = `HB50${runId}`;
  const masterBill = `MB50${runId}`;
  const draftEntryNumber = `TMP50${runId.slice(-3)}`;

  await login(page);

  const importerCode = `IC${runId}`.slice(0, 8).toUpperCase();
  const importerName = await ensureImporterProfile(page, {
    display_name: `Importer Capstone 50 ${runId}`,
    importer_code: importerCode,
    contact_name: 'Ops User',
    email: `impcap50+${runId}@example.com`,
    phone: '5555050',
    address_line1: '5050 Capstone Way',
    city: 'Salt Lake City',
    state: 'UT',
    postal_code: '84116',
    country: 'US',
  });

  const carrierDefs = [
    { ref: 'O', display_name: 'Carrier Ocean 50', carrier_code: 'OC50' },
    { ref: 'T', display_name: 'Carrier Truck 50', carrier_code: 'TR50' },
    { ref: 'A', display_name: 'Carrier Air 50', carrier_code: 'AR50', carrier_type: 'Air', airway_bill_prefix: '001' },
  ];
  const carrierNameByRef = new Map<string, string>();
  for (const carrier of carrierDefs) {
    const carrierCode = `${carrier.carrier_code.slice(0, 2)}${runId.slice(-2)}${carrier.ref}`.slice(0, 4);
    const name = await ensureCarrier(page, { ...carrier, display_name: `${carrier.display_name} ${runId}`, carrier_code: carrierCode });
    carrierNameByRef.set(carrier.ref, name);
  }

  const shipmentNoByRef = new Map([
    ['S1', `50${runId}1`],
    ['S2', `50${runId}2`],
    ['S3', `50${runId}3`],
  ]);
  const invoiceRefs = ['A', 'B', 'C', 'D', 'E'];
  const invoiceNumberByRef = new Map(invoiceRefs.map((ref, idx) => [ref, `INV-50-${runId}-${idx + 1}`]));

  await page.goto('/app/customs-entry/new-customs-entry-1');
  await waitForForm(page, 'Customs Entry');
  await setFormValues(page, {
    entry_number: draftEntryNumber,
    filer_code: 'SY1',
    entry_type: '03',
    entry_date: '2026-06-05',
    estimated_entry_date: '2026-06-05',
    client_ref: clientRef,
    port_of_entry: '3303',
    port_of_unlading: '4601',
    transport_mode: '11',
    conveyance_name: 'CAPSTONE 50',
    trip_identifier: 'CP50',
    payment_type: '3',
    bond_type: '9',
    surety_code: '036',
    bond_number: bondNumber,
    house_bill: houseBill,
    master_bill: masterBill,
    total_entered_value: 8400,
    currency: 'USD',
    importer_profile: importerName,
  });

  const shipments = [
    { ref: 'S1', carrier: 'O', mode: '11', port_of_entry: '2704', port_of_unlading: '4601', date_of_export: '2026-06-03', voyage_or_flight: 'OC-501' },
    { ref: 'S2', carrier: 'T', mode: '30', port_of_entry: '0712', port_of_unlading: '3303', date_of_export: '2026-06-04', voyage_or_flight: 'TR-502' },
    { ref: 'S3', carrier: 'A', mode: '40', port_of_entry: '2801', port_of_unlading: '1108', date_of_export: '2026-06-04', voyage_or_flight: 'AR-503' },
  ];
  for (const shipment of shipments) {
    await addChildRow(page, 'shipments', 'Entry Shipment', {
      shipment_no: shipmentNoByRef.get(shipment.ref),
      mode: shipment.mode,
      carrier_profile: carrierNameByRef.get(shipment.carrier),
      port_of_entry: shipment.port_of_entry,
      port_of_unlading: shipment.port_of_unlading,
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: shipment.date_of_export,
      voyage_or_flight: shipment.voyage_or_flight,
    });
  }

  const invoices = [
    { ref: 'A', shipment: 'S1', amount: 1800, vendor: 'Vendor 50A' },
    { ref: 'B', shipment: 'S1', amount: 1500, vendor: 'Vendor 50B' },
    { ref: 'C', shipment: 'S2', amount: 1600, vendor: 'Vendor 50C' },
    { ref: 'D', shipment: 'S2', amount: 1700, vendor: 'Vendor 50D' },
    { ref: 'E', shipment: 'S3', amount: 1800, vendor: 'Vendor 50E' },
  ];
  for (const invoice of invoices) {
    await addChildRow(page, 'invoices', 'Entry Invoice', {
      shipment_no: shipmentNoByRef.get(invoice.shipment),
      invoice_number: invoiceNumberByRef.get(invoice.ref),
      invoice_date: '2026-06-05',
      currency: 'USD',
      invoice_amount: invoice.amount,
      vendor_name: invoice.vendor,
    });
  }

  const articleDefs = [
    ['A','S1','CN','CN',600,'Synthetic paper cap lot 1','A1'],
    ['A','S1','CA','CA',600,'Synthetic paper cap lot 2','B2'],
    ['B','S1','CN','VN',600,'Synthetic furniture cap lot 3','C3'],
    ['B','S1','MX','CA',600,'Synthetic plastic cap lot 4','D4'],
    ['C','S2','CA','CA',600,'Synthetic food cap lot 5','E5'],
    ['C','S2','CN','CN',600,'Synthetic auto cap lot 6','F6'],
    ['D','S2','MX','MX',600,'Synthetic consumer cap lot 7','G7'],
    ['D','S2','CN','CN',600,'Synthetic tire cap lot 8','H8'],
    ['E','S3','CN','CN',600,'Synthetic air cap lot 9','I9'],
    ['E','S3','CA','CA',600,'Synthetic wood cap lot 10','J0'],
    ['E','S3','MX','MX',600,'Synthetic consumer cap lot 11','K1'],
    ['E','S3','CN','VN',600,'Synthetic mixed cap lot 12','L2'],
    ['E','S3','CA','CA',600,'Synthetic mixed cap lot 13','M3'],
    ['E','S3','CN','CN',600,'Synthetic new hts cap lot 14','N4'],
  ] as const;
  for (let i = 0; i < articleDefs.length; i++) {
    const [invoiceRef, shipmentRef, origin, exportCountry, value, description, lineId] = articleDefs[i];
    await addChildRow(page, 'articles', 'Entry Article', {
      shipment_no: shipmentNoByRef.get(shipmentRef),
      invoice_number: invoiceNumberByRef.get(invoiceRef),
      article_line_no: String(i + 1),
      description,
      line_item_identifier: lineId,
      country_of_origin: origin,
      country_of_export: exportCountry,
      gross_weight: 25 + i,
      entered_value: value,
      harbor_maintenance_fee: 0,
      merchandise_processing_fee: 2.5 + ((i % 4) * 0.4),
    });
  }

  const tariffRows: Array<{article:number; hs:string; invoice:string; shipment:string; uom:string}> = [];
  for (let i = 1; i <= 14; i++) {
    const invoice = i <= 2 ? 'A' : i <= 4 ? 'B' : i <= 6 ? 'C' : i <= 8 ? 'D' : 'E';
    const shipment = i <= 4 ? 'S1' : i <= 8 ? 'S2' : 'S3';
    const baseCodes = ['4819200040','9403409060','3925900000','2106909998','8703230190','4011201015','3925900000','4404200080'];
    const base = baseCodes[(i - 1) % baseCodes.length];
    tariffRows.push({ article: i, hs: base, invoice, shipment, uom: ['4819200040','2106909998','4404200080'].includes(base) ? 'KG' : 'NO' });
  }
  const extraOverlays = [1,2,3,4,5,6,7,8,9,10];
  for (const article of extraOverlays) {
    const invoice = article <= 2 ? 'A' : article <= 4 ? 'B' : article <= 6 ? 'C' : article <= 8 ? 'D' : 'E';
    const shipment = article <= 4 ? 'S1' : article <= 8 ? 'S2' : 'S3';
    tariffRows.push({ article, hs: article % 3 === 0 ? '99030125' : article % 2 === 0 ? '99030301' : '99038803', invoice, shipment, uom: 'NO' });
  }
  for (let idx = 0; idx < tariffRows.length; idx++) {
    const row = tariffRows[idx];
    await addChildRow(page, 'tariff_lines', 'Entry Tariff Line', {
      shipment_no: shipmentNoByRef.get(row.shipment),
      invoice_number: invoiceNumberByRef.get(row.invoice),
      line_no: String(idx + 1),
      article_line_no: String(row.article),
      hs_code: row.hs,
      quantity: 1,
      uom: row.uom,
      entered_value: 600,
      country_of_origin: articleDefs[row.article - 1][2],
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
});

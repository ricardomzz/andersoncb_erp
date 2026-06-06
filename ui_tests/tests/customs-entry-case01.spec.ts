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
    "Importer Profile": "importer-profile",
    Carrier: "carrier",
    "Customs Entry": "customs-entry",
  };
  const result = await page.evaluate(async () => {
    const frm = (window as any).cur_frm;
    const methodByDoctype: Record<string, string> = {
      "Importer Profile": "andersoncb_erp.api.submit_importer_profile",
      Carrier: "andersoncb_erp.api.submit_carrier",
      "Customs Entry": "andersoncb_erp.api.submit_entry",
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
    throw new Error(result?.error || result?.result?.error || "Submit failed");
  }
  await page.waitForLoadState("networkidle");
  const finalName = result?.result?.name;
  const route = routeByDoctype[context.doctype];
  if (finalName && route) {
    await page.goto(`/app/${route}/${finalName}`, { waitUntil: "networkidle" });
  } else {
    await page.reload({ waitUntil: "networkidle" });
  }
  await page.waitForFunction(() => Boolean((window as any).cur_frm) && (window as any).cur_frm.doc.docstatus === 1);
}

async function currentDocName(page) {
  return await page.evaluate(() => (window as any).cur_frm.doc.name as string);
}

async function currentEntryNumber(page) {
  return await page.evaluate(() => ((window as any).cur_frm.doc.entry_number || (window as any).cur_frm.doc.name) as string);
}

test('case 01 baseline ocean containerized consumption', async ({ page }) => {
  const runId = String(Date.now()).slice(-6);
  const importer = {
    display_name: `Importer Alpha ${runId}`,
    importer_code: `IA${runId}`,
    contact_name: 'Ops User',
    email: `alpha${runId}@example.com`,
    phone: '5550101',
    address_line1: '101 Harbor Way',
    city: 'Newark',
    state: 'NJ',
    postal_code: '07102',
    country: 'US',
  };
  const carrierCode = Number(runId).toString(36).toUpperCase().padStart(4, "0").slice(-4);
  const carrier = {
    display_name: `Carrier Ocean ${runId}`,
    carrier_code: carrierCode,
  };
  const shipmentNo = runId;

  await login(page);

  await page.goto('/app/importer-profile/new-importer-profile-1');
  await waitForForm(page, 'Importer Profile');
  await setFormValues(page, importer);
  await saveDraft(page);
  const importerName = await currentDocName(page);
  await submitDoc(page);

  await page.goto('/app/carrier/new-carrier-1');
  await waitForForm(page, 'Carrier');
  await setFormValues(page, carrier);
  await saveDraft(page);
  const carrierName = await currentDocName(page);
  await submitDoc(page);

  await page.goto('/app/customs-entry/new-customs-entry-1');
  await waitForForm(page, 'Customs Entry');
  await setFormValues(page, {
    entry_number: `TMP${runId.slice(-5)}`,
    filer_code: 'SY1',
    entry_type: '01',
    entry_date: '2026-06-05',
    estimated_entry_date: '2026-06-05',
    client_ref: `UI-CASE-${runId}`,
    importer_profile: importerName,
    port_of_entry: '4601',
    port_of_unlading: '4601',
    transport_mode: '11',
    conveyance_name: 'UI OCEAN 01',
    trip_identifier: 'UO101',
    payment_type: '2',
    bond_type: '8',
    surety_code: '036',
    bond_number: `B${runId.slice(-7)}`,
    house_bill: `HB${runId}`,
    master_bill: `MB${runId}`,
    total_entered_value: 1250,
    currency: 'USD',
  });
  await addChildRow(page, 'shipments', 'Entry Shipment', {
    shipment_no: shipmentNo,
    mode: '11',
    carrier_profile: carrierName,
    port_of_entry: '4601',
    port_of_unlading: '4601',
    date_of_arrival: '2026-06-05',
    date_of_import: '2026-06-05',
    date_of_export: '2026-06-01',
    voyage_or_flight: 'VOY-001',
  });
  await addChildRow(page, 'invoices', 'Entry Invoice', {
    invoice_number: `INV-${runId}`,
    shipment_no: shipmentNo,
    invoice_date: '2026-06-05',
    currency: 'USD',
    invoice_amount: 1250,
    vendor_name: 'Vendor Alpha 01',
  });
  await addChildRow(page, 'articles', 'Entry Article', {
    article_line_no: '1',
    description: 'Synthetic paper cartons',
    invoice_number: `INV-${runId}`,
    shipment_no: shipmentNo,
    line_item_identifier: 'A01',
    country_of_origin: 'CN',
    country_of_export: 'CN',
    gross_weight: 100,
    entered_value: 1250,
    harbor_maintenance_fee: 5,
    merchandise_processing_fee: 7.5,
  });
  await addChildRow(page, 'tariff_lines', 'Entry Tariff Line', {
    line_no: '1',
    article_line_no: '1',
    shipment_no: shipmentNo,
    invoice_number: `INV-${runId}`,
    hs_code: '4819200040',
    quantity: 1,
    uom: 'KG',
    entered_value: 1250,
    country_of_origin: 'CN',
  });
  await addChildRow(page, 'tariff_lines', 'Entry Tariff Line', {
    line_no: '2',
    article_line_no: '1',
    shipment_no: shipmentNo,
    invoice_number: `INV-${runId}`,
    hs_code: '99038803',
    quantity: 1,
    uom: 'KG',
    entered_value: 1250,
    country_of_origin: 'CN',
  });

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
});

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
    id: '07',
    title: 'hand-carried consumption',
    importer: {
      display_name: 'Importer Echo 07',
      importer_code: 'IMPECH07',
      contact_name: 'Ops User',
      email: 'impech07@example.com',
      phone: '5550707',
      address_line1: '707 Passenger Way',
      city: 'Philadelphia',
      state: 'PA',
      postal_code: '19153',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Hand 07',
      carrier_code: 'HD07',
    },
    entry: {
      entry_number: 'TMPC07A',
      filer_code: 'SY1',
      entry_type: '01',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '1108',
      port_of_unlading: '1108',
      transport_mode: '60',
      conveyance_name: 'HAND CARRY 07',
      trip_identifier: 'HD07',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      total_entered_value: 950,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200007',
      mode: '60',
      port_of_entry: '1108',
      port_of_unlading: '1108',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-04',
      voyage_or_flight: 'HD-07',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-007-A',
        shipment_no: '200007',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 950,
        vendor_name: 'Vendor Hand 07',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic passenger consumer goods',
        line_item_identifier: 'H07',
        country_of_origin: 'US',
        country_of_export: 'US',
        gross_weight: 15,
        entered_value: 950,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 2.0,
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
        entered_value: 950,
        country_of_origin: 'US',
      },
    ],
  },
  {
    id: '08',
    title: 'ad cvd ocean containerized',
    importer: {
      display_name: 'Importer Foxtrot 08',
      importer_code: 'IMPFOX08',
      contact_name: 'Ops User',
      email: 'impfox08@example.com',
      phone: '5550808',
      address_line1: '808 Harbor Lane',
      city: 'Newark',
      state: 'NJ',
      postal_code: '07114',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Ocean 08',
      carrier_code: 'OC08',
    },
    entry: {
      entry_number: 'TMPC08A',
      filer_code: 'SY1',
      entry_type: '03',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '4601',
      port_of_unlading: '4601',
      transport_mode: '11',
      conveyance_name: 'ATLANTIC BOX 08',
      trip_identifier: 'OC08',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      total_entered_value: 4200,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200008',
      mode: '11',
      port_of_entry: '4601',
      port_of_unlading: '4601',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-03',
      voyage_or_flight: 'OC-08',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-008-A',
        shipment_no: '200008',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 4200,
        vendor_name: 'Vendor Furniture 08',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic wood cabinet set',
        line_item_identifier: 'F08',
        country_of_origin: 'CN',
        country_of_export: 'CN',
        gross_weight: 90,
        entered_value: 4200,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 9.5,
      },
    ],
    tariffRows: [
      {
        invoice_ref: 'A',
        line_no: '1',
        article_line_no: '1',
        hs_code: '9403409060',
        quantity: 1,
        uom: 'NO',
        entered_value: 4200,
        country_of_origin: 'CN',
      },
      {
        invoice_ref: 'A',
        line_no: '2',
        article_line_no: '1',
        hs_code: '99038803',
        quantity: 1,
        uom: 'NO',
        entered_value: 4200,
        country_of_origin: 'CN',
      },
    ],
  },
  {
    id: '09',
    title: 'ad cvd ocean non-containerized',
    importer: {
      display_name: 'Importer Foxtrot 08',
      importer_code: 'IMPFOX08',
      contact_name: 'Ops User',
      email: 'impfox08@example.com',
      phone: '5550808',
      address_line1: '808 Harbor Lane',
      city: 'Newark',
      state: 'NJ',
      postal_code: '07114',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Ocean Bulk 09',
      carrier_code: 'OB09',
    },
    entry: {
      entry_number: 'TMPC09A',
      filer_code: 'SY1',
      entry_type: '03',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '1801',
      port_of_unlading: '1801',
      transport_mode: '10',
      conveyance_name: 'GULF WOOD 09',
      trip_identifier: 'OB09',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      total_entered_value: 2800,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200009',
      mode: '10',
      port_of_entry: '1801',
      port_of_unlading: '1801',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-02',
      voyage_or_flight: 'OB-09',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-009-A',
        shipment_no: '200009',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 2800,
        vendor_name: 'Vendor Wood 09',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic wood poles',
        line_item_identifier: 'W09',
        country_of_origin: 'CA',
        country_of_export: 'CA',
        gross_weight: 110,
        entered_value: 2800,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 6.25,
      },
    ],
    tariffRows: [
      {
        invoice_ref: 'A',
        line_no: '1',
        article_line_no: '1',
        hs_code: '4404200080',
        quantity: 1,
        uom: 'KG',
        entered_value: 2800,
        country_of_origin: 'CA',
      },
    ],
  },
  {
    id: '10',
    title: 'ad cvd rail',
    importer: {
      display_name: 'Importer Golf 10',
      importer_code: 'IMPGOL10',
      contact_name: 'Ops User',
      email: 'impgol10@example.com',
      phone: '5551010',
      address_line1: '1010 Rail Yard',
      city: 'Rosemont',
      state: 'IL',
      postal_code: '60018',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Rail 10',
      carrier_code: 'RL10',
    },
    entry: {
      entry_number: 'TMPC10A',
      filer_code: 'SY1',
      entry_type: '03',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '3901',
      port_of_unlading: '1303',
      transport_mode: '21',
      conveyance_name: 'RAIL TIRE 10',
      trip_identifier: 'RL10',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      total_entered_value: 5200,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200010',
      mode: '21',
      port_of_entry: '3901',
      port_of_unlading: '1303',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-03',
      voyage_or_flight: 'RL-10',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-010-A',
        shipment_no: '200010',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 5200,
        vendor_name: 'Vendor Tire 10',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic radial truck tire set one',
        line_item_identifier: 'T10',
        country_of_origin: 'CN',
        country_of_export: 'CN',
        gross_weight: 80,
        entered_value: 2600,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 5.75,
      },
      {
        invoice_ref: 'A',
        article_line_no: '2',
        description: 'Synthetic radial truck tire set two',
        line_item_identifier: 'U10',
        country_of_origin: 'CN',
        country_of_export: 'CN',
        gross_weight: 85,
        entered_value: 2600,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 5.75,
      },
    ],
    tariffRows: [
      {
        invoice_ref: 'A',
        line_no: '1',
        article_line_no: '1',
        hs_code: '4011201015',
        quantity: 1,
        uom: 'NO',
        entered_value: 2600,
        country_of_origin: 'CN',
      },
      {
        invoice_ref: 'A',
        line_no: '2',
        article_line_no: '1',
        hs_code: '99030301',
        quantity: 1,
        uom: 'NO',
        entered_value: 2600,
        country_of_origin: 'CN',
      },
      {
        invoice_ref: 'A',
        line_no: '3',
        article_line_no: '2',
        hs_code: '4011201015',
        quantity: 1,
        uom: 'NO',
        entered_value: 2600,
        country_of_origin: 'CN',
      },
    ],
  },
  {
    id: '11',
    title: 'ad cvd truck two invoices',
    importer: {
      display_name: 'Importer Hotel 11',
      importer_code: 'IMPHOT11',
      contact_name: 'Ops User',
      email: 'imphot11@example.com',
      phone: '5551111',
      address_line1: '1111 Border Market',
      city: 'Champlain',
      state: 'NY',
      postal_code: '12919',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Truck 11',
      carrier_code: 'TR11',
    },
    entry: {
      entry_number: 'TMPC11A',
      filer_code: 'SY1',
      entry_type: '03',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '0712',
      port_of_unlading: '0712',
      transport_mode: '30',
      conveyance_name: 'TRUCK PLASTIC 11',
      trip_identifier: 'TR11',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      total_entered_value: 4600,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200011',
      mode: '30',
      port_of_entry: '0712',
      port_of_unlading: '0712',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-04',
      voyage_or_flight: 'TR-11',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-011-A',
        shipment_no: '200011',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 2100,
        vendor_name: 'Vendor Plastic 11A',
      },
      {
        invoice_ref: 'B',
        invoice_number: 'INV-011-B',
        shipment_no: '200011',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 2500,
        vendor_name: 'Vendor Plastic 11B',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic plastic home item lot A',
        line_item_identifier: 'A11',
        country_of_origin: 'MX',
        country_of_export: 'MX',
        gross_weight: 45,
        entered_value: 2100,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 4.25,
      },
      {
        invoice_ref: 'B',
        article_line_no: '2',
        description: 'Synthetic plastic home item lot B',
        line_item_identifier: 'B11',
        country_of_origin: 'MX',
        country_of_export: 'MX',
        gross_weight: 50,
        entered_value: 2500,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 5.0,
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
        entered_value: 2100,
        country_of_origin: 'MX',
      },
      {
        invoice_ref: 'B',
        line_no: '2',
        article_line_no: '2',
        hs_code: '3925900000',
        quantity: 1,
        uom: 'NO',
        entered_value: 2500,
        country_of_origin: 'MX',
      },
    ],
  },
  {
    id: '12',
    title: 'ad cvd road other with chapter 99 c',
    importer: {
      display_name: 'Importer Hotel 11',
      importer_code: 'IMPHOT11',
      contact_name: 'Ops User',
      email: 'imphot11@example.com',
      phone: '5551111',
      address_line1: '1111 Border Market',
      city: 'Champlain',
      state: 'NY',
      postal_code: '12919',
      country: 'US',
    },
    carrier: {
      display_name: 'Carrier Road 12',
      carrier_code: 'RD12',
    },
    entry: {
      entry_number: 'TMPC12A',
      filer_code: 'SY1',
      entry_type: '03',
      entry_date: '2026-06-05',
      estimated_entry_date: '2026-06-05',
      port_of_entry: '0712',
      port_of_unlading: '2801',
      transport_mode: '34',
      conveyance_name: 'ROAD CH99 12',
      trip_identifier: 'RD12',
      payment_type: '2',
      bond_type: '8',
      surety_code: '036',
      total_entered_value: 3300,
      currency: 'USD',
    },
    shipment: {
      shipment_no: '200012',
      mode: '34',
      port_of_entry: '0712',
      port_of_unlading: '2801',
      date_of_arrival: '2026-06-05',
      date_of_import: '2026-06-05',
      date_of_export: '2026-06-04',
      voyage_or_flight: 'RD-12',
    },
    invoiceRows: [
      {
        invoice_ref: 'A',
        invoice_number: 'INV-012-A',
        shipment_no: '200012',
        invoice_date: '2026-06-05',
        currency: 'USD',
        invoice_amount: 3300,
        vendor_name: 'Vendor Consumer 12',
      },
    ],
    articleRows: [
      {
        invoice_ref: 'A',
        article_line_no: '1',
        description: 'Synthetic consumer goods road lot',
        line_item_identifier: 'R12',
        country_of_origin: 'CN',
        country_of_export: 'CN',
        gross_weight: 60,
        entered_value: 3300,
        harbor_maintenance_fee: 0,
        merchandise_processing_fee: 7.25,
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
        entered_value: 3300,
        country_of_origin: 'CN',
      },
      {
        invoice_ref: 'A',
        line_no: '2',
        article_line_no: '1',
        hs_code: '99030125',
        quantity: 1,
        uom: 'NO',
        entered_value: 3300,
        country_of_origin: 'CN',
      },
    ],
  },
];

for (const scenario of CASES) {
  test(`case ${scenario.id} ${scenario.title}`, async ({ page }) => {
    await runEntryCase(page, scenario);
  });
}

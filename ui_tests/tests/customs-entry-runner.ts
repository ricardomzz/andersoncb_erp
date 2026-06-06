import { expect, Page } from '@playwright/test';

export type ShipmentInput = {
  shipmentNo: string;
  mode: string;
  carrierName: string;
  portOfEntry: string;
  portOfUnlading: string;
  dateOfArrival: string;
  dateOfImport: string;
  dateOfExport: string;
  voyageOrFlight?: string;
  masterBill?: string;
};

export type InvoiceInput = {
  invoiceNumber: string;
  shipmentNo: string;
  invoiceDate?: string;
  currency: string;
  invoiceAmount: number;
  vendorName?: string;
};

export type ArticleInput = {
  articleLineNo: string;
  description: string;
  invoiceNumber: string;
  shipmentNo: string;
  lineItemIdentifier?: string;
  countryOfOrigin?: string;
  countryOfExport?: string;
  grossWeight?: number;
  enteredValue?: number;
  harborMaintenanceFee?: number;
  merchandiseProcessingFee?: number;
};

export type TariffInput = {
  lineNo: string;
  articleLineNo: string;
  shipmentNo: string;
  invoiceNumber: string;
  hsCode: string;
  quantity?: number;
  uom?: string;
  enteredValue?: number;
  countryOfOrigin?: string;
};

export type EntryScenario = {
  caseId: string;
  focus: string;
  importerKey: string;
  importerDisplayName: string;
  importerCode: string;
  carrierKey: string;
  carrierDisplayName: string;
  carrierCode: string;
  entryType: string;
  transportMode: string;
  paymentType: string;
  bondType: string;
  portOfEntrySymbol: string;
  portOfUnladingSymbol: string;
  clientRef: string;
  conveyanceName: string;
  tripIdentifier: string;
  suretyCode: string;
  bondNumber: string;
  houseBill: string;
  masterBill: string;
  totalEnteredValue: number;
  currency: string;
  shipments: ShipmentInput[];
  invoices: InvoiceInput[];
  articles: ArticleInput[];
  tariffs: TariffInput[];
};

const loginEmail = process.env.UI_LOGIN_EMAIL;
const loginPassword = process.env.UI_LOGIN_PASSWORD;

export async function login(page: Page) {
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

export async function waitForForm(page: Page, doctype: string) {
  await page.waitForFunction(
    (expected) => Boolean((window as any).cur_frm) && (window as any).cur_frm.doctype === expected,
    doctype,
  );
}

export async function setFormValues(page: Page, values: Record<string, any>) {
  await page.evaluate(async (payload) => {
    await (window as any).cur_frm.set_value(payload);
  }, values);
}

export async function addChildRow(page: Page, fieldname: string, childtype: string, values: Record<string, any>) {
  await page.evaluate(({ fieldname, childtype, values }) => {
    const frm = (window as any).cur_frm;
    const row = (window as any).frappe.model.add_child(frm.doc, childtype, fieldname);
    Object.assign(row, values);
    frm.refresh_field(fieldname);
  }, { fieldname, childtype, values });
}

export async function saveDraft(page: Page) {
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

export async function submitDoc(page: Page) {
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
  try {
    await page.waitForFunction(() => Boolean((window as any).cur_frm) && (window as any).cur_frm.doc.docstatus === 1, undefined, { timeout: 15000 });
  } catch (error) {
    const docstatus = await page.evaluate(async ({ doctype, name }) => {
      const response = await (window as any).frappe.call({
        method: 'frappe.client.get_value',
        args: { doctype, name, fieldname: 'docstatus' },
      });
      return response.message?.docstatus;
    }, { doctype: context.doctype, name: finalName });
    if (docstatus !== 1) {
      throw error;
    }
  }
}

export async function currentDocName(page: Page) {
  return await page.evaluate(() => (window as any).cur_frm.doc.name as string);
}

export async function currentEntryNumber(page: Page) {
  return await page.evaluate(() => ((window as any).cur_frm.doc.entry_number || (window as any).cur_frm.doc.name) as string);
}

export async function loadExecutionPrep(page: Page) {
  const response = await page.evaluate(async () => {
    const r = await (window as any).frappe.call({ method: 'andersoncb_erp.api.get_customs_entry_execution_prep' });
    return r.message;
  });
  const portMap = new Map<string, string>();
  const htsMap = new Map<string, string>();
  for (const row of response.symbolic_ports || []) {
    portMap.set(row.symbolic_port, row.candidate_code);
  }
  for (const row of response.symbolic_hts || []) {
    htsMap.set(row.symbolic_hts, row.candidate_code);
  }
  return { raw: response, portMap, htsMap };
}

export async function ensureImporter(page: Page, registry: Map<string, string>, key: string, values: Record<string, any>) {
  if (registry.has(key)) {
    return registry.get(key)!;
  }
  await page.goto('/app/importer-profile/new-importer-profile-1');
  await waitForForm(page, 'Importer Profile');
  await setFormValues(page, values);
  await saveDraft(page);
  const importerName = await currentDocName(page);
  await submitDoc(page);
  registry.set(key, importerName);
  return importerName;
}

export async function ensureCarrier(page: Page, registry: Map<string, string>, key: string, values: Record<string, any>) {
  if (registry.has(key)) {
    return registry.get(key)!;
  }
  await page.goto('/app/carrier/new-carrier-1');
  await waitForForm(page, 'Carrier');
  await setFormValues(page, values);
  await saveDraft(page);
  const carrierName = await currentDocName(page);
  await submitDoc(page);
  registry.set(key, carrierName);
  return carrierName;
}

export async function createAndSubmitEntry(page: Page, scenario: EntryScenario, importerName: string, carrierNamesByKey: Map<string, string>, prep: Awaited<ReturnType<typeof loadExecutionPrep>>) {
  await page.goto('/app/customs-entry/new-customs-entry-1');
  await waitForForm(page, 'Customs Entry');
  await setFormValues(page, {
    entry_number: `TMP${scenario.clientRef.replace(/[^0-9]/g, '').slice(-5).padStart(5, '0')}`,
    filer_code: 'SY1',
    entry_type: scenario.entryType,
    entry_date: '2026-06-05',
    estimated_entry_date: '2026-06-05',
    client_ref: scenario.clientRef,
    importer_profile: importerName,
    port_of_entry: prep.portMap.get(scenario.portOfEntrySymbol),
    port_of_unlading: prep.portMap.get(scenario.portOfUnladingSymbol),
    transport_mode: scenario.transportMode,
    conveyance_name: scenario.conveyanceName,
    trip_identifier: scenario.tripIdentifier,
    payment_type: scenario.paymentType,
    bond_type: scenario.bondType,
    surety_code: scenario.suretyCode,
    bond_number: scenario.bondNumber,
    house_bill: scenario.houseBill,
    master_bill: scenario.masterBill,
    total_entered_value: scenario.totalEnteredValue,
    currency: scenario.currency,
  });

  for (const shipment of scenario.shipments) {
    await addChildRow(page, 'shipments', 'Entry Shipment', {
      shipment_no: shipment.shipmentNo,
      mode: shipment.mode,
      carrier_profile: carrierNamesByKey.get(shipment.carrierName),
      port_of_entry: prep.portMap.get(shipment.portOfEntry),
      port_of_unlading: prep.portMap.get(shipment.portOfUnlading),
      date_of_arrival: shipment.dateOfArrival,
      date_of_import: shipment.dateOfImport,
      date_of_export: shipment.dateOfExport,
      voyage_or_flight: shipment.voyageOrFlight,
      master_bill: shipment.masterBill,
    });
  }

  for (const invoice of scenario.invoices) {
    await addChildRow(page, 'invoices', 'Entry Invoice', {
      invoice_number: invoice.invoiceNumber,
      shipment_no: invoice.shipmentNo,
      invoice_date: invoice.invoiceDate,
      currency: invoice.currency,
      invoice_amount: invoice.invoiceAmount,
      vendor_name: invoice.vendorName,
    });
  }

  for (const article of scenario.articles) {
    await addChildRow(page, 'articles', 'Entry Article', {
      article_line_no: article.articleLineNo,
      description: article.description,
      invoice_number: article.invoiceNumber,
      shipment_no: article.shipmentNo,
      line_item_identifier: article.lineItemIdentifier,
      country_of_origin: article.countryOfOrigin,
      country_of_export: article.countryOfExport,
      gross_weight: article.grossWeight,
      entered_value: article.enteredValue,
      harbor_maintenance_fee: article.harborMaintenanceFee && article.harborMaintenanceFee > 0 ? article.harborMaintenanceFee : undefined,
      merchandise_processing_fee: article.merchandiseProcessingFee && article.merchandiseProcessingFee > 0 ? article.merchandiseProcessingFee : undefined,
    });
  }

  for (const tariff of scenario.tariffs) {
    await addChildRow(page, 'tariff_lines', 'Entry Tariff Line', {
      line_no: tariff.lineNo,
      article_line_no: tariff.articleLineNo,
      shipment_no: tariff.shipmentNo,
      invoice_number: tariff.invoiceNumber,
      hs_code: prep.htsMap.get(tariff.hsCode) || tariff.hsCode,
      quantity: tariff.quantity,
      uom: tariff.uom,
      entered_value: tariff.enteredValue,
      country_of_origin: tariff.countryOfOrigin,
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
  return { finalName, finalEntryNumber, verification };
}

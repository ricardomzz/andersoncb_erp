import { expect, Page } from '@playwright/test';

const GUIDED_WORKSPACE_SELECTOR = '.customs-entry-guided-workspace';

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
  try {
    await submitDoc(page);
  } catch (error: any) {
    const message = String(error?.message || error || '');
    const duplicateCode = message.includes('dbo.Carriers') && message.includes('IX_Code');
    if (!duplicateCode) {
      throw error;
    }
  }
  registry.set(key, carrierName);
  return carrierName;
}

async function expectGuidedWorkspace(page: Page) {
  await expect(page.locator(GUIDED_WORKSPACE_SELECTOR)).toBeVisible({ timeout: 10000 });
}

async function clickGuidedAction(page: Page, action: string, textFilter?: string) {
  await expectGuidedWorkspace(page);
  let locator = page.locator(`${GUIDED_WORKSPACE_SELECTOR} [data-action="${action}"]`);
  if (textFilter) {
    locator = locator.filter({ hasText: textFilter });
  }
  await expect(locator.first()).toBeVisible({ timeout: 10000 });
  await locator.first().click();
}

async function waitForOpenGrid(page: Page, fieldname: string) {
  await page.waitForFunction(
    (expected) => {
      const frm = (window as any).cur_frm;
      const row = frm?.open_grid_row?.();
      return Boolean(row) && row.grid?.df?.fieldname === expected;
    },
    fieldname,
  );
}

async function setOpenGridValues(page: Page, values: Record<string, any>) {
  await page.evaluate(async (payload) => {
    const frm = (window as any).cur_frm;
    const row = frm?.open_grid_row?.();
    if (!row?.doc) {
      throw new Error('No open grid row');
    }
    for (const [fieldname, value] of Object.entries(payload)) {
      if (value === undefined || value === null || value === '') continue;
      await (window as any).frappe.model.set_value(row.doc.doctype, row.doc.name, fieldname, value);
    }
    frm.refresh_field(row.grid.df.fieldname);
  }, values);
}

async function getOpenGridDoc(page: Page) {
  return await page.evaluate(() => {
    const row = (window as any).cur_frm?.open_grid_row?.();
    if (!row?.doc) {
      return null;
    }
    return JSON.parse(JSON.stringify(row.doc));
  });
}

async function closeOpenGrid(page: Page) {
  await page.evaluate(() => {
    (window as any).frappe.ui.form.close_grid_form();
  });
  await page.waitForFunction(() => !(window as any).cur_frm?.open_grid_row?.());
  await page.waitForFunction(() => !document.querySelector('.modal.show'));
}

async function selectShipmentContext(page: Page, shipmentNo: string) {
  await clickGuidedAction(page, 'select-shipment', `Shipment ${shipmentNo}`);
}

async function selectInvoiceContext(page: Page, invoiceNumber: string) {
  await clickGuidedAction(page, 'select-invoice', invoiceNumber);
}

async function selectArticleContext(page: Page, articleLineNo: string, description: string) {
  const match = description ? `Article ${articleLineNo} · ${description}` : `Article ${articleLineNo}`;
  await clickGuidedAction(page, 'select-article', match);
}

export async function createAndSubmitEntry(page: Page, scenario: EntryScenario, importerName: string, carrierNamesByKey: Map<string, string>, prep: Awaited<ReturnType<typeof loadExecutionPrep>>) {
  const shipmentNoByRef = new Map<string, string>();
  const invoiceNoByRef = new Map<string, string>();
  const articleLineNoByRef = new Map<string, string>();
  const resolvePort = (value?: string) => (value ? prep.portMap.get(value) || value : value);
  const uniqueRunToken = String(Date.now()).slice(-7);

  await page.goto('/app/customs-entry/new-customs-entry-1');
  await waitForForm(page, 'Customs Entry');
  await expectGuidedWorkspace(page);
  await setFormValues(page, {
    entry_number: `TMP${scenario.clientRef.replace(/[^0-9]/g, '').slice(-5).padStart(5, '0')}`,
    filer_code: 'SY1',
    entry_type: scenario.entryType,
    entry_date: '2026-06-05',
    estimated_entry_date: '2026-06-05',
    client_ref: scenario.clientRef,
    importer_profile: importerName,
    port_of_entry: resolvePort(scenario.portOfEntrySymbol),
    port_of_unlading: resolvePort(scenario.portOfUnladingSymbol),
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

  for (const [index, shipment] of scenario.shipments.entries()) {
    const generatedShipmentNo = `${uniqueRunToken}${index + 1}`;
    await clickGuidedAction(page, 'add-shipment');
    await waitForOpenGrid(page, 'shipments');
    await setOpenGridValues(page, {
      shipment_no: generatedShipmentNo,
      mode: shipment.mode,
      carrier_profile: carrierNamesByKey.get(shipment.carrierName),
      port_of_entry: resolvePort(shipment.portOfEntry),
      port_of_unlading: resolvePort(shipment.portOfUnlading),
      date_of_arrival: shipment.dateOfArrival,
      date_of_import: shipment.dateOfImport,
      date_of_export: shipment.dateOfExport,
      voyage_or_flight: shipment.voyageOrFlight,
    });
    const openDoc = await getOpenGridDoc(page);
    shipmentNoByRef.set(shipment.shipmentNo, openDoc?.shipment_no || generatedShipmentNo);
    await closeOpenGrid(page);
  }

  for (const invoice of scenario.invoices) {
    const shipmentNo = shipmentNoByRef.get(invoice.shipmentNo) || invoice.shipmentNo;
    await selectShipmentContext(page, shipmentNo);
    await clickGuidedAction(page, 'add-invoice');
    await waitForOpenGrid(page, 'invoices');
    await setOpenGridValues(page, {
      invoice_number: invoice.invoiceNumber,
      invoice_date: invoice.invoiceDate,
      currency: invoice.currency,
      invoice_amount: invoice.invoiceAmount,
      vendor_name: invoice.vendorName,
    });
    const openDoc = await getOpenGridDoc(page);
    invoiceNoByRef.set(invoice.invoiceNumber, openDoc?.invoice_number || invoice.invoiceNumber);
    await closeOpenGrid(page);
  }

  for (const article of scenario.articles) {
    const shipmentNo = shipmentNoByRef.get(article.shipmentNo) || article.shipmentNo;
    const invoiceNumber = invoiceNoByRef.get(article.invoiceNumber) || article.invoiceNumber;
    await selectShipmentContext(page, shipmentNo);
    await selectInvoiceContext(page, invoiceNumber);
    await clickGuidedAction(page, 'add-article');
    await waitForOpenGrid(page, 'articles');
    await setOpenGridValues(page, {
      description: article.description,
      line_item_identifier: article.lineItemIdentifier,
      country_of_origin: article.countryOfOrigin,
      country_of_export: article.countryOfExport,
      gross_weight: article.grossWeight,
      entered_value: article.enteredValue,
      harbor_maintenance_fee: article.harborMaintenanceFee && article.harborMaintenanceFee > 0 ? article.harborMaintenanceFee : undefined,
      merchandise_processing_fee: article.merchandiseProcessingFee && article.merchandiseProcessingFee > 0 ? article.merchandiseProcessingFee : undefined,
    });
    const openDoc = await getOpenGridDoc(page);
    articleLineNoByRef.set(article.articleLineNo, openDoc?.article_line_no || article.articleLineNo);
    await closeOpenGrid(page);
  }

  for (const tariff of scenario.tariffs) {
    const shipmentNo = shipmentNoByRef.get(tariff.shipmentNo) || tariff.shipmentNo;
    const invoiceNumber = invoiceNoByRef.get(tariff.invoiceNumber) || tariff.invoiceNumber;
    const articleLineNo = articleLineNoByRef.get(tariff.articleLineNo) || tariff.articleLineNo;
    const articleScenario = scenario.articles.find((row) => row.articleLineNo === tariff.articleLineNo);
    await selectShipmentContext(page, shipmentNo);
    await selectInvoiceContext(page, invoiceNumber);
    await selectArticleContext(page, articleLineNo, articleScenario?.description || '');
    await clickGuidedAction(page, 'add-tariff');
    await waitForOpenGrid(page, 'tariff_lines');
    await setOpenGridValues(page, {
      hs_code: prep.htsMap.get(tariff.hsCode) || tariff.hsCode,
      quantity: tariff.quantity,
      uom: tariff.uom,
      entered_value: tariff.enteredValue,
      country_of_origin: tariff.countryOfOrigin,
    });
    await closeOpenGrid(page);
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

const MASTER_RETURN_REQUEST_KEY = "andersoncb_erp.customs_entry.master_return_request";
const MASTER_RETURN_RESULT_KEY = "andersoncb_erp.customs_entry.master_return_result";
const BILL_PATTERN = /^[A-Z0-9 ]+$/;
const GUIDED_WORKSPACE_CLASS = "customs-entry-guided-workspace";
const RAW_RELATIONSHIP_SECTIONS = [
    "shipment_section",
    "commercial_section",
    "articles_section",
    "classification_section",
];
const ENTRY_TYPE_GUIDANCE = {
    "03": {
        color: "orange",
        message: __("AD/CVD entry: make sure each article has the correct tariff overlay rows before submit."),
    },
    "11": {
        color: "blue",
        message: __("Informal entry: confirm the lower-value shipment still has shipment, invoice, article, and tariff linkage filled in correctly."),
    },
    "21": {
        color: "blue",
        message: __("Warehouse entry: review the shipment and tariff structure carefully. This entry type uses the same form, but operators usually file it less often."),
    },
};

function normalizeText(value) {
    return (value || "").toString().trim();
}

function escapeHtml(value) {
    return frappe.utils.escape_html(normalizeText(value));
}

function readStoredJson(key) {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn(`Failed reading ${key}`, error);
        return null;
    }
}

function writeStoredJson(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
}

function removeStoredJson(key) {
    window.localStorage.removeItem(key);
}

function uniqueNonEmpty(values) {
    return [...new Set((values || []).map(normalizeText).filter(Boolean))];
}

function formatMoney(amount, currency) {
    if (amount === undefined || amount === null || amount === "") {
        return "";
    }
    const numeric = Number(amount);
    if (Number.isNaN(numeric)) {
        return `${normalizeText(currency)} ${amount}`.trim();
    }
    return `${normalizeText(currency)} ${format_number(numeric, null, 2)}`.trim();
}

function ensureGuidedStyles() {
    if (document.getElementById("customs-entry-guided-workspace-style")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "customs-entry-guided-workspace-style";
    style.textContent = `
        .${GUIDED_WORKSPACE_CLASS} {
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
            background: var(--fg-color);
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-topbar {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            align-items: center;
            margin-bottom: 14px;
            flex-wrap: wrap;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-title h4 {
            margin: 0 0 4px 0;
            font-size: 16px;
            font-weight: 600;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-title p {
            margin: 0;
            color: var(--text-muted);
            font-size: 12px;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-context {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 10px;
            margin-bottom: 16px;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-context-card,
        .${GUIDED_WORKSPACE_CLASS} .cegw-panel {
            border: 1px solid var(--border-color);
            border-radius: 10px;
            background: var(--control-bg);
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-context-card {
            padding: 12px;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-context-label {
            display: block;
            margin-bottom: 4px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--text-muted);
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-context-value {
            font-size: 13px;
            font-weight: 600;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-layout {
            display: grid;
            grid-template-columns: 1.1fr 1.1fr 1.4fr;
            gap: 12px;
            align-items: start;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-layout-bottom {
            margin-top: 12px;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-panel {
            padding: 12px;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-panel.is-wide {
            min-height: 280px;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 8px;
            margin-bottom: 10px;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-panel-header h5 {
            margin: 0 0 4px 0;
            font-size: 14px;
            font-weight: 600;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-panel-header p {
            margin: 0;
            color: var(--text-muted);
            font-size: 12px;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-item-shell {
            display: flex;
            gap: 8px;
            align-items: stretch;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-item {
            width: 100%;
            text-align: left;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 10px;
            background: var(--fg-color);
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-item.is-active {
            border-color: var(--primary-color);
            box-shadow: 0 0 0 1px var(--primary-color);
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-item-main {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            align-items: flex-start;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-item-title {
            font-weight: 600;
            margin-bottom: 3px;
            font-size: 13px;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-item-meta,
        .${GUIDED_WORKSPACE_CLASS} .cegw-item-submeta {
            color: var(--text-muted);
            font-size: 12px;
            line-height: 1.35;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-item-actions {
            display: flex;
            gap: 4px;
            flex-shrink: 0;
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-empty {
            border: 1px dashed var(--border-color);
            border-radius: 8px;
            padding: 12px;
            color: var(--text-muted);
            font-size: 12px;
            background: var(--fg-color);
        }
        .${GUIDED_WORKSPACE_CLASS} .cegw-footer-note {
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--border-color);
            color: var(--text-muted);
            font-size: 12px;
        }
        @media (max-width: 1080px) {
            .${GUIDED_WORKSPACE_CLASS} .cegw-layout {
                grid-template-columns: 1fr;
            }
        }
    `;
    document.head.appendChild(style);
}

function queueGuidedWorkspaceRefresh(frm) {
    if (!frm || frm.doc.doctype !== "Customs Entry") {
        return;
    }

    clearTimeout(frm.__guidedWorkspaceTimer);
    frm.__guidedWorkspaceTimer = window.setTimeout(() => {
        if (frm.events?.render_guided_workspace) {
            frm.events.render_guided_workspace(frm);
        }
    }, 80);
}

function setPortQueries(frm) {
    const query = () => ({ query: "andersoncb_erp.api.search_customs_ports" });
    frm.set_query("port_of_entry", query);
    frm.set_query("port_of_unlading", query);
    frm.set_query("port_of_entry", "shipments", query);
    frm.set_query("port_of_unlading", "shipments", query);
}

function setCarrierQuery(frm) {
    frm.set_query("carrier_profile", "shipments", (doc, cdt, cdn) => {
        const row = locals[cdt][cdn] || {};
        const mode = normalizeText(row.mode || doc.transport_mode);
        if (mode === "40") {
            return { filters: { carrier_type: "Air" } };
        }
        return {};
    });
}

function applyFieldHelp(frm) {
    frm.set_df_property(
        "house_bill",
        "description",
        __("Letters, digits, and spaces only. LDS rejects punctuation."),
    );
    frm.set_df_property(
        "master_bill",
        "description",
        __("Letters, digits, and spaces only. LDS rejects punctuation."),
    );
    frm.set_df_property(
        "broker_reference",
        "description",
        __("If left blank, the final submit flow will align this with the final entry number."),
    );

    const invoiceGrid = frm.fields_dict.invoices?.grid;
    if (invoiceGrid) {
        invoiceGrid.update_docfield_property(
            "shipment_no",
            "description",
            __("Usually filled automatically from the selected shipment in the guided draft workspace."),
        );
    }

    const articleGrid = frm.fields_dict.articles?.grid;
    if (articleGrid) {
        articleGrid.update_docfield_property(
            "shipment_no",
            "description",
            __("Usually filled automatically from the selected shipment in the guided draft workspace."),
        );
        articleGrid.update_docfield_property(
            "invoice_number",
            "description",
            __("Usually filled automatically from the selected invoice in the guided draft workspace."),
        );
        articleGrid.update_docfield_property(
            "line_item_identifier",
            "description",
            __("Maximum 3 characters in LDS."),
        );
    }

    const tariffGrid = frm.fields_dict.tariff_lines?.grid;
    if (tariffGrid) {
        tariffGrid.update_docfield_property(
            "shipment_no",
            "description",
            __("Usually filled automatically from the selected article in the guided draft workspace."),
        );
        tariffGrid.update_docfield_property(
            "invoice_number",
            "description",
            __("Usually filled automatically from the selected article in the guided draft workspace."),
        );
        tariffGrid.update_docfield_property(
            "article_line_no",
            "description",
            __("Usually filled automatically from the selected article in the guided draft workspace."),
        );
        tariffGrid.update_docfield_property(
            "hs_code",
            "description",
            __("Type to search local HTS history. Exact new codes will also try the active LDS environment."),
        );
    }
}

function applySafeLinkDefaults(frm) {
    const shipments = frm.doc.shipments || [];
    const invoices = frm.doc.invoices || [];
    const articles = frm.doc.articles || [];
    const tariffLines = frm.doc.tariff_lines || [];

    const shipmentNos = uniqueNonEmpty(shipments.map((row) => row.shipment_no));
    const invoiceNumbers = uniqueNonEmpty(invoices.map((row) => row.invoice_number));
    const articleLineNos = uniqueNonEmpty(articles.map((row) => row.article_line_no));

    const onlyShipmentNo = shipmentNos[0];
    const onlyInvoiceNumber = invoiceNumbers[0];
    const onlyArticleLineNo = articleLineNos[0];

    if (shipmentNos.length === 1) {
        for (const row of invoices) {
            if (!normalizeText(row.shipment_no)) row.shipment_no = onlyShipmentNo;
        }
        for (const row of articles) {
            if (!normalizeText(row.shipment_no)) row.shipment_no = onlyShipmentNo;
        }
        for (const row of tariffLines) {
            if (!normalizeText(row.shipment_no)) row.shipment_no = onlyShipmentNo;
        }
    }

    if (invoiceNumbers.length === 1) {
        for (const row of articles) {
            if (!normalizeText(row.invoice_number)) row.invoice_number = onlyInvoiceNumber;
        }
        for (const row of tariffLines) {
            if (!normalizeText(row.invoice_number)) row.invoice_number = onlyInvoiceNumber;
        }
    }

    if (articleLineNos.length === 1) {
        for (const row of tariffLines) {
            if (!normalizeText(row.article_line_no)) row.article_line_no = onlyArticleLineNo;
        }
    }

    frm.refresh_fields(["invoices", "articles", "tariff_lines"]);
}

function collectClientValidationIssues(frm) {
    const issues = [];
    const shipments = frm.doc.shipments || [];
    const invoices = frm.doc.invoices || [];
    const articles = frm.doc.articles || [];
    const tariffLines = frm.doc.tariff_lines || [];

    const shipmentNos = uniqueNonEmpty(shipments.map((row) => row.shipment_no));
    const invoiceNumbers = uniqueNonEmpty(invoices.map((row) => row.invoice_number));
    const articleKeys = new Set(
        articles.map((row) => [normalizeText(row.shipment_no), normalizeText(row.invoice_number), normalizeText(row.article_line_no)].join("::")),
    );

    for (const fieldname of ["house_bill", "master_bill"]) {
        const value = normalizeText(frm.doc[fieldname]);
        if (value && !BILL_PATTERN.test(value.toUpperCase())) {
            issues.push(__("{0} can only contain letters, digits, and spaces for LDS.", [frappe.meta.get_label(frm.doc.doctype, fieldname, frm.doc.name)]));
        }
    }

    if (!normalizeText(frm.doc.importer_profile)) {
        issues.push(__("Importer Profile is required before LDS submit."));
    }

    if (!shipments.length) issues.push(__("Add at least one shipment before LDS submit."));
    if (!invoices.length) issues.push(__("Add at least one invoice before LDS submit."));
    if (!articles.length) issues.push(__("Add at least one article before LDS submit."));
    if (!tariffLines.length) issues.push(__("Add at least one tariff line before LDS submit."));

    for (const row of shipments) {
        const mode = normalizeText(row.mode || frm.doc.transport_mode);
        if (mode === "40" && !normalizeText(row.carrier_profile)) {
            issues.push(__("Air shipments require a carrier profile selected on the shipment row."));
            break;
        }
    }

    for (const row of invoices) {
        const shipmentNo = normalizeText(row.shipment_no);
        if (shipmentNos.length > 1 && !shipmentNo) {
            issues.push(__("Each invoice needs a Shipment No when the entry has more than one shipment."));
            break;
        }
        if (shipmentNo && !shipmentNos.includes(shipmentNo)) {
            issues.push(__("Invoice {0} references Shipment No {1}, but that shipment does not exist on the entry.", [normalizeText(row.invoice_number) || "(blank)", shipmentNo]));
            break;
        }
    }

    for (const row of articles) {
        const lineItemIdentifier = normalizeText(row.line_item_identifier);
        const shipmentNo = normalizeText(row.shipment_no);
        const invoiceNumber = normalizeText(row.invoice_number);
        if (lineItemIdentifier && lineItemIdentifier.length > 3) {
            issues.push(__("Article Line Item Identifier must be 3 characters or fewer for LDS."));
            break;
        }
        if (shipmentNos.length > 1 && !shipmentNo) {
            issues.push(__("Each article needs a Shipment No when the entry has more than one shipment."));
            break;
        }
        if (invoiceNumbers.length > 1 && !invoiceNumber) {
            issues.push(__("Each article needs an Invoice Number when the entry has more than one invoice."));
            break;
        }
        if (shipmentNo && !shipmentNos.includes(shipmentNo)) {
            issues.push(__("Article line {0} references Shipment No {1}, but that shipment does not exist on the entry.", [normalizeText(row.article_line_no) || "(blank)", shipmentNo]));
            break;
        }
        if (invoiceNumber && !invoiceNumbers.includes(invoiceNumber)) {
            issues.push(__("Article line {0} references Invoice {1}, but that invoice does not exist on the entry.", [normalizeText(row.article_line_no) || "(blank)", invoiceNumber]));
            break;
        }
    }

    for (const row of tariffLines) {
        const shipmentNo = normalizeText(row.shipment_no);
        const invoiceNumber = normalizeText(row.invoice_number);
        const articleLineNo = normalizeText(row.article_line_no);
        if (shipmentNos.length > 1 && !shipmentNo) {
            issues.push(__("Each tariff line needs a Shipment No when the entry has more than one shipment."));
            break;
        }
        if (invoiceNumbers.length > 1 && !invoiceNumber) {
            issues.push(__("Each tariff line needs an Invoice Number when the entry has more than one invoice."));
            break;
        }
        if (uniqueNonEmpty(articles.map((article) => article.article_line_no)).length > 1 && !articleLineNo) {
            issues.push(__("Each tariff line needs an Article Line No when the entry has more than one article."));
            break;
        }
        if (shipmentNo && !shipmentNos.includes(shipmentNo)) {
            issues.push(__("Tariff line {0} references Shipment No {1}, but that shipment does not exist on the entry.", [normalizeText(row.line_no) || "(blank)", shipmentNo]));
            break;
        }
        if (invoiceNumber && !invoiceNumbers.includes(invoiceNumber)) {
            issues.push(__("Tariff line {0} references Invoice {1}, but that invoice does not exist on the entry.", [normalizeText(row.line_no) || "(blank)", invoiceNumber]));
            break;
        }
        if ([shipmentNo, invoiceNumber, articleLineNo].some(Boolean)) {
            const key = [shipmentNo, invoiceNumber, articleLineNo].join("::");
            if (!articleKeys.has(key)) {
                issues.push(__("Tariff line {0} does not match any article by Shipment No / Invoice Number / Article Line No.", [normalizeText(row.line_no) || "(blank)"]));
                break;
            }
        }
    }

    return issues;
}

function showValidationSummary(frm) {
    const issues = collectClientValidationIssues(frm);
    if (!issues.length) {
        frappe.show_alert({ message: __("Draft validation passed."), indicator: "green" });
        return true;
    }

    frappe.msgprint({
        title: __("Draft Validation"),
        indicator: "orange",
        message: `<ul><li>${issues.join("</li><li>")}</li></ul>`,
    });
    return false;
}

function setEntryGuidance(frm) {
    const messages = [];
    const issues = collectClientValidationIssues(frm);
    const entryType = normalizeText(frm.doc.entry_type);
    const hint = ENTRY_TYPE_GUIDANCE[entryType];
    let color = hint?.color || "blue";

    if (hint) {
        messages.push(hint.message);
    }
    if (!normalizeText(frm.doc.importer_profile) && frm.doc.docstatus === 0) {
        color = "orange";
        messages.push(__("Create or select an Importer Profile before submit."));
    }
    if ((frm.doc.invoices || []).length > 1 || (frm.doc.shipments || []).length > 1) {
        messages.push(__("The guided workspace keeps shipment, invoice, article, and tariff relationships aligned for you. Use the advanced tables only for troubleshooting."));
    }
    if (issues.length) {
        color = "orange";
        messages.push(__("Run Draft Validation before submit to catch known LDS failures locally."));
    }

    frm.set_intro(messages.join("<br>"), messages.length ? color : "blue");
}

function buildImporterRouteOptions(frm) {
    return {
        display_name: normalizeText(frm.doc.importer_name) || undefined,
        importer_code: normalizeText(frm.doc.importer_number) || undefined,
    };
}

function buildCarrierRouteOptions(frm) {
    const modes = uniqueNonEmpty((frm.doc.shipments || []).map((row) => row.mode || frm.doc.transport_mode));
    const routeOptions = {};
    if (modes.length === 1 && modes[0] === "40") {
        routeOptions.carrier_type = "Air";
    }
    return routeOptions;
}

async function openLinkedMasterCreate(frm, options) {
    if (frm.is_new() || frm.is_dirty()) {
        await frm.save();
    }
    writeStoredJson(MASTER_RETURN_REQUEST_KEY, {
        source_doctype: frm.doctype,
        source_name: frm.doc.name,
        target_field: options.target_field,
        target_doctype: options.target_doctype,
    });
    frappe.new_doc(options.target_doctype, options.route_options || {});
}

async function applyReturnedMasterSelection(frm) {
    const payload = readStoredJson(MASTER_RETURN_RESULT_KEY);
    if (!payload) return;
    if (payload.source_doctype !== frm.doctype || payload.source_name !== frm.doc.name) return;
    removeStoredJson(MASTER_RETURN_RESULT_KEY);

    if (payload.target_field === "importer_profile" && payload.created_name) {
        if (frm.doc.importer_profile !== payload.created_name) {
            await frm.set_value("importer_profile", payload.created_name);
        }
        frappe.show_alert({
            message: __("Importer Profile {0} created and linked to this draft.", [payload.created_name]),
            indicator: "green",
        });
        return;
    }

    if (payload.target_field === "carrier_profile" && payload.created_name) {
        const blankShipments = (frm.doc.shipments || []).filter((row) => !normalizeText(row.carrier_profile));
        if (blankShipments.length === 1) {
            const row = blankShipments[0];
            await frappe.model.set_value(row.doctype, row.name, "carrier_profile", payload.created_name);
            frappe.show_alert({
                message: __("Carrier {0} created and assigned to the only blank shipment row.", [payload.created_name]),
                indicator: "green",
            });
            return;
        }
        frappe.msgprint({
            title: __("Carrier Created"),
            indicator: "green",
            message: __("Carrier {0} was created. Select it on the correct shipment row before submit.", [payload.created_name]),
        });
    }
}

async function submitEntryToLDS(frm) {
    applySafeLinkDefaults(frm);
    if (!showValidationSummary(frm)) {
        return;
    }

    if (frm.is_dirty() || frm.is_new()) {
        await frm.save();
    }

    const draftName = frm.doc.name;
    frappe.call({
        method: "andersoncb_erp.api.submit_entry",
        args: { name: frm.doc.name },
        freeze: true,
        freeze_message: __("Submitting customs entry to LDS..."),
        callback: async (r) => {
            const result = r.message || {};
            if (!result.ok) {
                frappe.msgprint({
                    title: __("LDS Submission Failed"),
                    message: result.error || __("LDS rejected the submission."),
                    indicator: "red",
                });
                await frm.reload_doc();
                return;
            }

            const finalName = result.name || draftName;
            if (finalName !== draftName) {
                frappe.show_alert({
                    message: __("Draft {0} submitted as {1}.", [draftName, finalName]),
                    indicator: "green",
                });
            }
            await frappe.set_route("Form", "Customs Entry", finalName);
        },
    });
}

function addEntryActions(frm) {
    if (frm.doc.docstatus !== 0) {
        return;
    }

    frm.add_custom_button(__("Validate Draft"), () => showValidationSummary(frm), __("LDS"));
    frm.add_custom_button(
        __("Create Importer Profile"),
        () => openLinkedMasterCreate(frm, {
            target_field: "importer_profile",
            target_doctype: "Importer Profile",
            route_options: buildImporterRouteOptions(frm),
        }),
        __("Create"),
    );
    frm.add_custom_button(
        __("Create Carrier"),
        () => openLinkedMasterCreate(frm, {
            target_field: "carrier_profile",
            target_doctype: "Carrier",
            route_options: buildCarrierRouteOptions(frm),
        }),
        __("Create"),
    );

    if (!frm.is_new() && !frm.is_dirty()) {
        frm.page.set_primary_action(__("Submit to LDS"), () => submitEntryToLDS(frm), "octicon octicon-check");
    }
}

function getRows(frm, fieldname) {
    return frm.doc[fieldname] || [];
}

function getGuidedState(frm) {
    if (!frm.__guidedState) {
        frm.__guidedState = {
            showAdvanced: false,
            selectedShipment: null,
            selectedInvoice: null,
            selectedArticle: null,
        };
    }

    const state = frm.__guidedState;
    const shipments = getRows(frm, "shipments");
    const invoices = getRows(frm, "invoices");
    const articles = getRows(frm, "articles");

    if (state.selectedShipment && !shipments.find((row) => row.name === state.selectedShipment)) {
        state.selectedShipment = null;
    }
    if (state.selectedInvoice && !invoices.find((row) => row.name === state.selectedInvoice)) {
        state.selectedInvoice = null;
    }
    if (state.selectedArticle && !articles.find((row) => row.name === state.selectedArticle)) {
        state.selectedArticle = null;
    }

    if (!state.selectedShipment && shipments.length) {
        state.selectedShipment = shipments[0].name;
    }

    const selectedInvoice = invoices.find((row) => row.name === state.selectedInvoice) || null;
    const selectedArticle = articles.find((row) => row.name === state.selectedArticle) || null;

    if (selectedInvoice) {
        const invoiceShipment = findShipmentRowByShipmentNo(frm, selectedInvoice.shipment_no);
        if (invoiceShipment) {
            state.selectedShipment = invoiceShipment.name;
        }
    }

    if (selectedArticle) {
        const articleShipment = findShipmentRowByShipmentNo(frm, selectedArticle.shipment_no);
        if (articleShipment) {
            state.selectedShipment = articleShipment.name;
        }
        const articleInvoice = findInvoiceRowByCompositeKey(frm, selectedArticle.shipment_no, selectedArticle.invoice_number);
        if (articleInvoice) {
            state.selectedInvoice = articleInvoice.name;
        }
    }

    const invoicesForShipment = getInvoicesForSelectedShipment(frm, state);
    if (!state.selectedInvoice && invoicesForShipment.length) {
        state.selectedInvoice = invoicesForShipment[0].name;
    }
    if (state.selectedInvoice && !invoicesForShipment.find((row) => row.name === state.selectedInvoice)) {
        state.selectedInvoice = invoicesForShipment[0]?.name || null;
    }

    const articlesForContext = getArticlesForSelectedContext(frm, state);
    if (!state.selectedArticle && articlesForContext.length) {
        state.selectedArticle = articlesForContext[0].name;
    }
    if (state.selectedArticle && !articlesForContext.find((row) => row.name === state.selectedArticle)) {
        state.selectedArticle = articlesForContext[0]?.name || null;
    }

    return state;
}

function findShipmentRowByName(frm, rowName) {
    return getRows(frm, "shipments").find((row) => row.name === rowName) || null;
}

function findShipmentRowByShipmentNo(frm, shipmentNo) {
    shipmentNo = normalizeText(shipmentNo);
    return getRows(frm, "shipments").find((row) => normalizeText(row.shipment_no) === shipmentNo) || null;
}

function findInvoiceRowByName(frm, rowName) {
    return getRows(frm, "invoices").find((row) => row.name === rowName) || null;
}

function findInvoiceRowByCompositeKey(frm, shipmentNo, invoiceNumber) {
    shipmentNo = normalizeText(shipmentNo);
    invoiceNumber = normalizeText(invoiceNumber);
    return getRows(frm, "invoices").find((row) => {
        return normalizeText(row.shipment_no) === shipmentNo && normalizeText(row.invoice_number) === invoiceNumber;
    }) || null;
}

function findArticleRowByName(frm, rowName) {
    return getRows(frm, "articles").find((row) => row.name === rowName) || null;
}

function getSelectedShipmentRow(frm, state = getGuidedState(frm)) {
    return findShipmentRowByName(frm, state.selectedShipment);
}

function getSelectedInvoiceRow(frm, state = getGuidedState(frm)) {
    return findInvoiceRowByName(frm, state.selectedInvoice);
}

function getSelectedArticleRow(frm, state = getGuidedState(frm)) {
    return findArticleRowByName(frm, state.selectedArticle);
}

function getInvoicesForSelectedShipment(frm, state = getGuidedState(frm)) {
    const shipment = getSelectedShipmentRow(frm, state);
    const invoices = getRows(frm, "invoices");
    const shipmentNo = normalizeText(shipment?.shipment_no);
    if (!shipmentNo) {
        return invoices;
    }
    return invoices.filter((row) => normalizeText(row.shipment_no) === shipmentNo);
}

function getArticlesForSelectedContext(frm, state = getGuidedState(frm)) {
    const shipment = getSelectedShipmentRow(frm, state);
    const invoice = getSelectedInvoiceRow(frm, state);
    const shipmentNo = normalizeText(invoice?.shipment_no || shipment?.shipment_no);
    const invoiceNumber = normalizeText(invoice?.invoice_number);
    const articles = getRows(frm, "articles");

    if (shipmentNo && invoiceNumber) {
        return articles.filter((row) => normalizeText(row.shipment_no) === shipmentNo && normalizeText(row.invoice_number) === invoiceNumber);
    }
    if (shipmentNo) {
        return articles.filter((row) => normalizeText(row.shipment_no) === shipmentNo);
    }
    return articles;
}

function getTariffsForSelectedArticle(frm, state = getGuidedState(frm)) {
    const article = getSelectedArticleRow(frm, state);
    const tariffs = getRows(frm, "tariff_lines");
    if (!article) {
        return tariffs;
    }
    const shipmentNo = normalizeText(article.shipment_no);
    const invoiceNumber = normalizeText(article.invoice_number);
    const articleLineNo = normalizeText(article.article_line_no);
    return tariffs.filter((row) => {
        return normalizeText(row.shipment_no) === shipmentNo
            && normalizeText(row.invoice_number) === invoiceNumber
            && normalizeText(row.article_line_no) === articleLineNo;
    });
}

function nextNumericIdentifier(values) {
    const numericValues = (values || [])
        .map((value) => normalizeText(value))
        .filter((value) => /^\d+$/.test(value))
        .map((value) => parseInt(value, 10));
    const nextValue = numericValues.length ? Math.max(...numericValues) + 1 : 1;
    return String(nextValue);
}

function nextShipmentNo(frm) {
    return nextNumericIdentifier(getRows(frm, "shipments").map((row) => row.shipment_no));
}

function nextArticleLineNo(frm) {
    return nextNumericIdentifier(getRows(frm, "articles").map((row) => row.article_line_no));
}

function nextTariffLineNo(frm) {
    return nextNumericIdentifier(getRows(frm, "tariff_lines").map((row) => row.line_no));
}

async function ensureBusinessCodeMappings(frm) {
    if (frm.__businessCodeMappings) {
        return frm.__businessCodeMappings;
    }

    try {
        const response = await frappe.call({ method: "andersoncb_erp.api.get_business_code_mappings" });
        frm.__businessCodeMappings = response.message || {};
    } catch (error) {
        console.warn("Unable to load business code mappings", error);
        frm.__businessCodeMappings = {};
    }
    return frm.__businessCodeMappings;
}

function getPossibleValueLabel(frm, key, code) {
    code = normalizeText(code);
    if (!code) {
        return "";
    }
    const values = frm.__businessCodeMappings?.[key] || [];
    const match = values.find((row) => normalizeText(row.code) === code);
    return match?.label || code;
}

function summarizeShipment(frm, row) {
    const shipmentNo = normalizeText(row.shipment_no) || __("New shipment");
    const modeLabel = getPossibleValueLabel(frm, "entry_shipment.mode", row.mode || frm.doc.transport_mode);
    const carrier = normalizeText(row.carrier) || normalizeText(row.carrier_profile);
    const date = normalizeText(row.date_of_arrival || row.arrival_date || row.date_of_import);
    const title = __("Shipment {0}", [shipmentNo]);
    const meta = [modeLabel, carrier].filter(Boolean).join(" · ");
    const submeta = [normalizeText(row.port_of_entry), normalizeText(row.port_of_unlading), date].filter(Boolean).join(" · ");
    return { title, meta, submeta };
}

function summarizeInvoice(row) {
    const title = normalizeText(row.invoice_number) || __("New invoice");
    const meta = [normalizeText(row.vendor_name), formatMoney(row.invoice_amount, row.currency)].filter(Boolean).join(" · ");
    const submeta = [__("Shipment {0}", [normalizeText(row.shipment_no) || "?"]), normalizeText(row.invoice_date)].filter(Boolean).join(" · ");
    return { title, meta, submeta };
}

function summarizeArticle(row) {
    const lineNo = normalizeText(row.article_line_no) || __("New article");
    const title = [__("Article {0}", [lineNo]), normalizeText(row.description)].filter(Boolean).join(" · ");
    const meta = [normalizeText(row.invoice_number), formatMoney(row.entered_value, "")].filter(Boolean).join(" · ");
    const submeta = [__("Shipment {0}", [normalizeText(row.shipment_no) || "?"]), normalizeText(row.country_of_origin)].filter(Boolean).join(" · ");
    return { title, meta, submeta };
}

function summarizeTariff(row) {
    const title = [normalizeText(row.hs_code) || __("New tariff"), normalizeText(row.description)].filter(Boolean).join(" · ");
    const meta = [normalizeText(row.quantity) ? `${row.quantity} ${normalizeText(row.uom)}`.trim() : "", formatMoney(row.entered_value, "")].filter(Boolean).join(" · ");
    const submeta = [__("Article {0}", [normalizeText(row.article_line_no) || "?"]), normalizeText(row.country_of_origin)].filter(Boolean).join(" · ");
    return { title, meta, submeta };
}

function renderListItem({ title, meta, submeta, active, selectAction, editAction, name }) {
    return `
        <div class="cegw-item-shell">
            <button type="button" class="cegw-item ${active ? "is-active" : ""}" data-action="${selectAction}" data-name="${escapeHtml(name)}">
                <div class="cegw-item-main">
                    <div>
                        <div class="cegw-item-title">${escapeHtml(title)}</div>
                        ${meta ? `<div class="cegw-item-meta">${escapeHtml(meta)}</div>` : ""}
                        ${submeta ? `<div class="cegw-item-submeta">${escapeHtml(submeta)}</div>` : ""}
                    </div>
                </div>
            </button>
            <div class="cegw-item-actions">
                <button type="button" class="btn btn-xs btn-secondary" data-action="${editAction}" data-name="${escapeHtml(name)}">${__("Edit")}</button>
            </div>
        </div>
    `;
}

function getSectionAnchor(frm, fieldname) {
    const wrapper = frm.fields_dict[fieldname]?.wrapper;
    if (!wrapper) {
        return $();
    }
    const $wrapper = $(wrapper);
    return $wrapper.closest(".form-section").length ? $wrapper.closest(".form-section") : $wrapper;
}

function ensureWorkspaceShell(frm) {
    ensureGuidedStyles();
    const headerSection = getSectionAnchor(frm, "header_section");
    const shipmentSection = getSectionAnchor(frm, "shipment_section");
    const shipmentGrid = getSectionAnchor(frm, "shipments");
    const anchor = headerSection.length ? headerSection : (shipmentSection.length ? shipmentSection : shipmentGrid);
    if (!anchor.length) {
        return null;
    }

    let workspace = $(frm.wrapper).find(`.${GUIDED_WORKSPACE_CLASS}`);
    if (!workspace.length) {
        workspace = $(`<div class="${GUIDED_WORKSPACE_CLASS}"></div>`);
        anchor.before(workspace);
    }
    return workspace;
}

function setRawRelationshipSectionsVisible(frm, visible) {
    for (const fieldname of RAW_RELATIONSHIP_SECTIONS) {
        const section = getSectionAnchor(frm, fieldname);
        if (section.length) {
            section.toggle(visible);
        }
    }
}

function hideGuidedWorkspace(frm) {
    $(frm.wrapper).find(`.${GUIDED_WORKSPACE_CLASS}`).remove();
    setRawRelationshipSectionsVisible(frm, true);
}

function renderEmptyState(message, actionLabel, action) {
    return `
        <div class="cegw-empty">
            <div>${escapeHtml(message)}</div>
            ${action ? `<div style="margin-top: 8px;"><button type="button" class="btn btn-xs btn-secondary" data-action="${action}">${escapeHtml(actionLabel)}</button></div>` : ""}
        </div>
    `;
}

function renderShipmentPanel(frm, state) {
    const shipments = getRows(frm, "shipments");
    const body = shipments.length
        ? shipments.map((row) => {
            const summary = summarizeShipment(frm, row);
            return renderListItem({
                ...summary,
                active: row.name === state.selectedShipment,
                selectAction: "select-shipment",
                editAction: "edit-shipment",
                name: row.name,
            });
        }).join("")
        : renderEmptyState(
            __("Create a shipment first. Everything else in the guided flow builds from shipment context."),
            __("Add Shipment"),
            "add-shipment",
        );

    return `
        <section class="cegw-panel">
            <div class="cegw-panel-header">
                <div>
                    <h5>${__("1. Shipments")}</h5>
                    <p>${__("Create the movement first. The workspace keeps invoices and articles linked to the selected shipment.")}</p>
                </div>
                <button type="button" class="btn btn-xs btn-primary" data-action="add-shipment">${__("Add Shipment")}</button>
            </div>
            <div class="cegw-list">${body}</div>
        </section>
    `;
}

function renderInvoicePanel(frm, state) {
    const shipment = getSelectedShipmentRow(frm, state);
    const invoices = getInvoicesForSelectedShipment(frm, state);
    const addLabel = shipment
        ? __("Add Invoice for Shipment {0}", [normalizeText(shipment.shipment_no) || shipment.idx || 1])
        : __("Add Invoice");
    const body = shipment
        ? (
            invoices.length
                ? invoices.map((row) => {
                    const summary = summarizeInvoice(row);
                    return renderListItem({
                        ...summary,
                        active: row.name === state.selectedInvoice,
                        selectAction: "select-invoice",
                        editAction: "edit-invoice",
                        name: row.name,
                    });
                }).join("")
                : renderEmptyState(
                    __("Create an invoice for the selected shipment before adding articles."),
                    addLabel,
                    "add-invoice",
                )
        )
        : renderEmptyState(__("Create or select a shipment first."));

    return `
        <section class="cegw-panel">
            <div class="cegw-panel-header">
                <div>
                    <h5>${__("2. Invoices")}</h5>
                    <p>${__("Invoices belong to the selected shipment. Users should not have to remember shipment numbers manually.")}</p>
                </div>
                <button type="button" class="btn btn-xs btn-primary" data-action="add-invoice">${escapeHtml(addLabel)}</button>
            </div>
            <div class="cegw-list">${body}</div>
        </section>
    `;
}

function renderArticlePanel(frm, state) {
    const shipment = getSelectedShipmentRow(frm, state);
    const invoice = getSelectedInvoiceRow(frm, state);
    const articles = getArticlesForSelectedContext(frm, state);
    const addLabel = invoice
        ? __("Add Article for Invoice {0}", [normalizeText(invoice.invoice_number) || __("(fill invoice number first)")])
        : __("Add Article");
    let body = "";

    if (!shipment) {
        body = renderEmptyState(__("Create or select a shipment first."));
    } else if (!invoice) {
        body = renderEmptyState(__("Create or select an invoice before adding articles."));
    } else if (!normalizeText(invoice.invoice_number)) {
        body = renderEmptyState(__("Enter the invoice number on the selected invoice before adding articles."), __("Edit Invoice"), "edit-selected-invoice");
    } else if (!articles.length) {
        body = renderEmptyState(__("Create an article for the selected shipment and invoice."), addLabel, "add-article");
    } else {
        body = articles.map((row) => {
            const summary = summarizeArticle(row);
            return renderListItem({
                ...summary,
                active: row.name === state.selectedArticle,
                selectAction: "select-article",
                editAction: "edit-article",
                name: row.name,
            });
        }).join("");
    }

    return `
        <section class="cegw-panel is-wide">
            <div class="cegw-panel-header">
                <div>
                    <h5>${__("3. Articles")}</h5>
                    <p>${__("This is the main work surface. Each article automatically carries shipment and invoice context.")}</p>
                </div>
                <button type="button" class="btn btn-xs btn-primary" data-action="add-article">${escapeHtml(addLabel)}</button>
            </div>
            <div class="cegw-list">${body}</div>
        </section>
    `;
}

function renderTariffPanel(frm, state) {
    const article = getSelectedArticleRow(frm, state);
    const tariffs = getTariffsForSelectedArticle(frm, state);
    const addLabel = article
        ? __("Add Tariff for Article {0}", [normalizeText(article.article_line_no) || article.idx || 1])
        : __("Add Tariff");
    let body = "";

    if (!article) {
        body = renderEmptyState(__("Create or select an article before adding tariffs."));
    } else if (!normalizeText(article.article_line_no)) {
        body = renderEmptyState(__("The selected article needs an Article Line No before tariffs can attach to it."), __("Edit Article"), "edit-selected-article");
    } else if (!tariffs.length) {
        body = renderEmptyState(__("Add the HTS and any overlay tariff rows for the selected article."), addLabel, "add-tariff");
    } else {
        body = tariffs.map((row) => {
            const summary = summarizeTariff(row);
            return renderListItem({
                ...summary,
                active: false,
                selectAction: "noop",
                editAction: "edit-tariff",
                name: row.name,
            });
        }).join("");
    }

    return `
        <section class="cegw-panel cegw-layout-bottom">
            <div class="cegw-panel-header">
                <div>
                    <h5>${__("4. Tariffs")}</h5>
                    <p>${__("Tariffs attach to the selected article. The workspace carries the article, invoice, and shipment linkage automatically.")}</p>
                </div>
                <button type="button" class="btn btn-xs btn-primary" data-action="add-tariff">${escapeHtml(addLabel)}</button>
            </div>
            <div class="cegw-list">${body}</div>
            <div class="cegw-footer-note">
                ${__("Advanced / Raw Relationships lets power users inspect or override the underlying child tables directly when troubleshooting." )}
            </div>
        </section>
    `;
}

function renderContextSummary(frm, state) {
    const shipment = getSelectedShipmentRow(frm, state);
    const invoice = getSelectedInvoiceRow(frm, state);
    const article = getSelectedArticleRow(frm, state);
    const shipmentSummary = shipment ? summarizeShipment(frm, shipment) : { title: __("No shipment selected") };
    const invoiceSummary = invoice ? summarizeInvoice(invoice) : { title: __("No invoice selected") };
    const articleSummary = article ? summarizeArticle(article) : { title: __("No article selected") };

    return `
        <div class="cegw-context">
            <div class="cegw-context-card">
                <span class="cegw-context-label">${__("Current Shipment")}</span>
                <div class="cegw-context-value">${escapeHtml(shipmentSummary.title)}</div>
                ${shipmentSummary.meta ? `<div class="cegw-item-meta">${escapeHtml(shipmentSummary.meta)}</div>` : ""}
            </div>
            <div class="cegw-context-card">
                <span class="cegw-context-label">${__("Current Invoice")}</span>
                <div class="cegw-context-value">${escapeHtml(invoiceSummary.title)}</div>
                ${invoiceSummary.meta ? `<div class="cegw-item-meta">${escapeHtml(invoiceSummary.meta)}</div>` : ""}
            </div>
            <div class="cegw-context-card">
                <span class="cegw-context-label">${__("Current Article")}</span>
                <div class="cegw-context-value">${escapeHtml(articleSummary.title)}</div>
                ${articleSummary.meta ? `<div class="cegw-item-meta">${escapeHtml(articleSummary.meta)}</div>` : ""}
            </div>
        </div>
    `;
}

function bindWorkspaceEvents(frm, workspace) {
    workspace.off("click.guided").on("click.guided", "[data-action]", async (event) => {
        const action = $(event.currentTarget).attr("data-action");
        const rowName = $(event.currentTarget).attr("data-name");
        if (!action || action === "noop") {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        await handleWorkspaceAction(frm, action, rowName);
    });
}

async function handleWorkspaceAction(frm, action, rowName) {
    const state = getGuidedState(frm);

    if (action === "toggle-advanced") {
        state.showAdvanced = !state.showAdvanced;
        frm.events.render_guided_workspace(frm);
        return;
    }

    if (action === "select-shipment") {
        state.selectedShipment = rowName;
        state.selectedInvoice = null;
        state.selectedArticle = null;
        frm.events.render_guided_workspace(frm);
        return;
    }

    if (action === "select-invoice") {
        state.selectedInvoice = rowName;
        state.selectedArticle = null;
        const invoice = findInvoiceRowByName(frm, rowName);
        const shipment = findShipmentRowByShipmentNo(frm, invoice?.shipment_no);
        if (shipment) {
            state.selectedShipment = shipment.name;
        }
        frm.events.render_guided_workspace(frm);
        return;
    }

    if (action === "select-article") {
        state.selectedArticle = rowName;
        const article = findArticleRowByName(frm, rowName);
        const shipment = findShipmentRowByShipmentNo(frm, article?.shipment_no);
        const invoice = findInvoiceRowByCompositeKey(frm, article?.shipment_no, article?.invoice_number);
        if (shipment) {
            state.selectedShipment = shipment.name;
        }
        if (invoice) {
            state.selectedInvoice = invoice.name;
        }
        frm.events.render_guided_workspace(frm);
        return;
    }

    if (action === "edit-selected-invoice") {
        const invoice = getSelectedInvoiceRow(frm, state);
        if (invoice) {
            openChildRow(frm, "invoices", invoice.name);
        }
        return;
    }

    if (action === "edit-selected-article") {
        const article = getSelectedArticleRow(frm, state);
        if (article) {
            openChildRow(frm, "articles", article.name);
        }
        return;
    }

    if (action === "edit-shipment") {
        openChildRow(frm, "shipments", rowName);
        return;
    }
    if (action === "edit-invoice") {
        openChildRow(frm, "invoices", rowName);
        return;
    }
    if (action === "edit-article") {
        openChildRow(frm, "articles", rowName);
        return;
    }
    if (action === "edit-tariff") {
        openChildRow(frm, "tariff_lines", rowName);
        return;
    }

    if (action === "add-shipment") {
        const row = frm.add_child("shipments", {
            shipment_no: nextShipmentNo(frm),
            mode: normalizeText(frm.doc.transport_mode),
            port_of_entry: frm.doc.port_of_entry || undefined,
            port_of_unlading: frm.doc.port_of_unlading || undefined,
            date_of_arrival: frm.doc.arrival_date || undefined,
        });
        frm.dirty();
        state.selectedShipment = row.name;
        state.selectedInvoice = null;
        state.selectedArticle = null;
        frm.refresh_field("shipments");
        frm.events.render_guided_workspace(frm);
        openChildRow(frm, "shipments", row.name);
        return;
    }

    if (action === "add-invoice") {
        const shipment = getSelectedShipmentRow(frm, state) || getRows(frm, "shipments")[0];
        if (!shipment) {
            frappe.msgprint({ title: __("Create Shipment First"), message: __("Create a shipment before adding an invoice."), indicator: "orange" });
            return;
        }
        const row = frm.add_child("invoices", {
            shipment_no: normalizeText(shipment.shipment_no),
            currency: frm.doc.currency || undefined,
        });
        frm.dirty();
        state.selectedShipment = shipment.name;
        state.selectedInvoice = row.name;
        state.selectedArticle = null;
        frm.refresh_field("invoices");
        frm.events.render_guided_workspace(frm);
        openChildRow(frm, "invoices", row.name);
        return;
    }

    if (action === "add-article") {
        const shipment = getSelectedShipmentRow(frm, state) || getRows(frm, "shipments")[0];
        const invoice = getSelectedInvoiceRow(frm, state) || getInvoicesForSelectedShipment(frm, state)[0];
        if (!shipment) {
            frappe.msgprint({ title: __("Create Shipment First"), message: __("Create a shipment before adding an article."), indicator: "orange" });
            return;
        }
        if (!invoice) {
            frappe.msgprint({ title: __("Create Invoice First"), message: __("Create an invoice for the selected shipment before adding an article."), indicator: "orange" });
            return;
        }
        if (!normalizeText(invoice.invoice_number)) {
            frappe.msgprint({ title: __("Finish Invoice First"), message: __("Enter the invoice number on the selected invoice before adding an article."), indicator: "orange" });
            openChildRow(frm, "invoices", invoice.name);
            return;
        }
        const row = frm.add_child("articles", {
            article_line_no: nextArticleLineNo(frm),
            shipment_no: normalizeText(invoice.shipment_no || shipment.shipment_no),
            invoice_number: normalizeText(invoice.invoice_number),
            country_of_origin: undefined,
            country_of_export: undefined,
        });
        frm.dirty();
        state.selectedShipment = shipment.name;
        state.selectedInvoice = invoice.name;
        state.selectedArticle = row.name;
        frm.refresh_field("articles");
        frm.events.render_guided_workspace(frm);
        openChildRow(frm, "articles", row.name);
        return;
    }

    if (action === "add-tariff") {
        const article = getSelectedArticleRow(frm, state);
        if (!article) {
            frappe.msgprint({ title: __("Create Article First"), message: __("Create or select an article before adding a tariff line."), indicator: "orange" });
            return;
        }
        if (!normalizeText(article.article_line_no)) {
            frappe.msgprint({ title: __("Finish Article First"), message: __("The selected article needs an Article Line No before tariffs can be added."), indicator: "orange" });
            openChildRow(frm, "articles", article.name);
            return;
        }
        const row = frm.add_child("tariff_lines", {
            line_no: nextTariffLineNo(frm),
            shipment_no: normalizeText(article.shipment_no),
            invoice_number: normalizeText(article.invoice_number),
            article_line_no: normalizeText(article.article_line_no),
            country_of_origin: normalizeText(article.country_of_origin) || undefined,
        });
        frm.dirty();
        frm.refresh_field("tariff_lines");
        frm.events.render_guided_workspace(frm);
        openChildRow(frm, "tariff_lines", row.name);
    }
}

function openChildRow(frm, fieldname, rowName) {
    const state = getGuidedState(frm);
    state.showAdvanced = true;
    setRawRelationshipSectionsVisible(frm, true);
    frm.refresh_field(fieldname);
    const grid = frm.fields_dict[fieldname]?.grid;
    const gridRow = grid?.grid_rows_by_docname?.[rowName];
    if (!gridRow) {
        return;
    }
    gridRow.toggle_view(true);
    const wrapper = gridRow.wrapper?.get?.(0) || gridRow.row?.get?.(0);
    if (wrapper?.scrollIntoView) {
        wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function renderGuidedWorkspace(frm) {
    if (frm.doc.docstatus !== 0) {
        hideGuidedWorkspace(frm);
        return;
    }

    const workspace = ensureWorkspaceShell(frm);
    if (!workspace?.length) {
        return;
    }

    const state = getGuidedState(frm);
    setRawRelationshipSectionsVisible(frm, !!state.showAdvanced);

    const advancedLabel = state.showAdvanced ? __("Hide Advanced / Raw Relationships") : __("Show Advanced / Raw Relationships");
    const html = `
        <div class="cegw-topbar">
            <div class="cegw-title">
                <h4>${__("Guided Draft Workspace")}</h4>
                <p>${__("Create shipments, invoices, articles, and tariffs in business order. The workspace carries relationship fields behind the scenes.")}</p>
            </div>
            <div class="cegw-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-advanced">${escapeHtml(advancedLabel)}</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-shipment">${__("Add Shipment")}</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-invoice">${__("Add Invoice")}</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-article">${__("Add Article")}</button>
                <button type="button" class="btn btn-primary btn-sm" data-action="add-tariff">${__("Add Tariff")}</button>
            </div>
        </div>
        ${renderContextSummary(frm, state)}
        <div class="cegw-layout">
            ${renderShipmentPanel(frm, state)}
            ${renderInvoicePanel(frm, state)}
            ${renderArticlePanel(frm, state)}
        </div>
        ${renderTariffPanel(frm, state)}
    `;

    workspace.html(html);
    bindWorkspaceEvents(frm, workspace);
}

function attachHsCodeAutocomplete(frm, cdn) {
    const gridRow = frm.fields_dict.tariff_lines?.grid?.grid_rows_by_docname?.[cdn];
    const control = gridRow?.grid_form?.fields_dict?.hs_code;
    const input = control?.$input?.get?.(0);
    if (!input || input.dataset.htsAutocompleteBound === "1") {
        return;
    }

    input.dataset.htsAutocompleteBound = "1";
    const datalistId = `hts-code-suggestions-${cdn}`;
    let datalist = document.getElementById(datalistId);
    if (!datalist) {
        datalist = document.createElement("datalist");
        datalist.id = datalistId;
        document.body.appendChild(datalist);
    }
    input.setAttribute("list", datalistId);

    let lastResults = {};
    const fetchSuggestions = frappe.utils.debounce(async () => {
        const term = normalizeText(input.value);
        if (term.length < 3) {
            datalist.innerHTML = "";
            lastResults = {};
            return;
        }

        try {
            const response = await frappe.call({
                method: "andersoncb_erp.api.search_harmonized_tariffs",
                args: { txt: term, page_len: 8 },
            });
            const rows = response.message || [];
            lastResults = {};
            datalist.innerHTML = rows.map((row) => {
                const code = normalizeText(row.code);
                const description = normalizeText(row.description);
                lastResults[code] = row;
                return `<option value="${escapeHtml(code)}" label="${escapeHtml(description)}"></option>`;
            }).join("");
        } catch (error) {
            console.warn("Unable to search HTS suggestions", error);
        }
    }, 250);

    input.addEventListener("input", fetchSuggestions);
    input.addEventListener("change", () => {
        const selected = lastResults[normalizeText(input.value)];
        if (!selected) {
            return;
        }
        const descriptionField = gridRow.grid_form?.fields_dict?.description;
        if (descriptionField && !normalizeText(descriptionField.get_value?.() || descriptionField.value)) {
            descriptionField.set_value(selected.description || "");
        }
    });
}

frappe.ui.form.on("Customs Entry", {
    setup(frm) {
        setPortQueries(frm);
        setCarrierQuery(frm);
    },
    async refresh(frm) {
        setPortQueries(frm);
        setCarrierQuery(frm);
        applyFieldHelp(frm);
        await ensureBusinessCodeMappings(frm);
        await applyReturnedMasterSelection(frm);
        setEntryGuidance(frm);
        addEntryActions(frm);
        frm.events.render_guided_workspace(frm);
    },
    validate(frm) {
        applySafeLinkDefaults(frm);
    },
    entry_type(frm) {
        setEntryGuidance(frm);
        queueGuidedWorkspaceRefresh(frm);
    },
    transport_mode(frm) {
        setEntryGuidance(frm);
        queueGuidedWorkspaceRefresh(frm);
    },
    importer_profile(frm) {
        setEntryGuidance(frm);
        queueGuidedWorkspaceRefresh(frm);
    },
    shipments_add(frm) {
        queueGuidedWorkspaceRefresh(frm);
    },
    shipments_remove(frm) {
        queueGuidedWorkspaceRefresh(frm);
    },
    invoices_add(frm) {
        queueGuidedWorkspaceRefresh(frm);
    },
    invoices_remove(frm) {
        queueGuidedWorkspaceRefresh(frm);
    },
    articles_add(frm) {
        queueGuidedWorkspaceRefresh(frm);
    },
    articles_remove(frm) {
        queueGuidedWorkspaceRefresh(frm);
    },
    tariff_lines_add(frm) {
        queueGuidedWorkspaceRefresh(frm);
    },
    tariff_lines_remove(frm) {
        queueGuidedWorkspaceRefresh(frm);
    },
    render_guided_workspace(frm) {
        renderGuidedWorkspace(frm);
    },
});

function buildChildRefreshHandlers(fieldnames) {
    const handlers = {
        form_render(frm) {
            queueGuidedWorkspaceRefresh(frm);
        },
    };
    for (const fieldname of fieldnames) {
        handlers[fieldname] = function (frm) {
            queueGuidedWorkspaceRefresh(frm);
        };
    }
    return handlers;
}

frappe.ui.form.on("Entry Shipment", buildChildRefreshHandlers([
    "shipment_no",
    "mode",
    "carrier_profile",
    "voyage_or_flight",
    "port_of_entry",
    "port_of_unlading",
    "date_of_arrival",
    "date_of_import",
    "date_of_export",
]));

frappe.ui.form.on("Entry Invoice", buildChildRefreshHandlers([
    "invoice_number",
    "shipment_no",
    "invoice_date",
    "currency",
    "invoice_amount",
    "vendor_name",
]));

frappe.ui.form.on("Entry Article", buildChildRefreshHandlers([
    "article_line_no",
    "description",
    "invoice_number",
    "shipment_no",
    "line_item_identifier",
    "country_of_origin",
    "country_of_export",
    "entered_value",
]));

const tariffHandlers = buildChildRefreshHandlers([
    "line_no",
    "article_line_no",
    "shipment_no",
    "invoice_number",
    "hs_code",
    "description",
    "quantity",
    "uom",
    "entered_value",
    "country_of_origin",
]);
const originalTariffFormRender = tariffHandlers.form_render;
tariffHandlers.form_render = function (frm, cdt, cdn) {
    originalTariffFormRender(frm, cdt, cdn);
    attachHsCodeAutocomplete(frm, cdn);
};
frappe.ui.form.on("Entry Tariff Line", tariffHandlers);

const MASTER_RETURN_REQUEST_KEY = "andersoncb_erp.customs_entry.master_return_request";
const MASTER_RETURN_RESULT_KEY = "andersoncb_erp.customs_entry.master_return_result";
const BILL_PATTERN = /^[A-Z0-9 ]+$/;
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
            __("Required when the entry has more than one shipment."),
        );
    }

    const articleGrid = frm.fields_dict.articles?.grid;
    if (articleGrid) {
        articleGrid.update_docfield_property(
            "shipment_no",
            "description",
            __("Required when the entry has more than one shipment."),
        );
        articleGrid.update_docfield_property(
            "invoice_number",
            "description",
            __("Required when the entry has more than one invoice."),
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
            __("Required when the entry has more than one shipment."),
        );
        tariffGrid.update_docfield_property(
            "invoice_number",
            "description",
            __("Required when the entry has more than one invoice."),
        );
        tariffGrid.update_docfield_property(
            "article_line_no",
            "description",
            __("Required when the entry has more than one article."),
        );
        tariffGrid.update_docfield_property(
            "hs_code",
            "description",
            __("Use the authoritative HTS code. Add overlay rows separately for Chapter 99 tariffs."),
        );
    }
}

function uniqueNonEmpty(values) {
    return [...new Set((values || []).map(normalizeText).filter(Boolean))];
}

function applySafeLinkDefaults(frm) {
    const shipments = frm.doc.shipments || [];
    const invoices = frm.doc.invoices || [];
    const articles = frm.doc.articles || [];
    const tariffLines = frm.doc.tariff_lines || [];

    const onlyShipmentNo = uniqueNonEmpty(shipments.map((row) => row.shipment_no))[0];
    const onlyInvoiceNumber = uniqueNonEmpty(invoices.map((row) => row.invoice_number))[0];
    const onlyArticleLineNo = uniqueNonEmpty(articles.map((row) => row.article_line_no))[0];

    if (uniqueNonEmpty(shipments.map((row) => row.shipment_no)).length === 1) {
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

    if (uniqueNonEmpty(invoices.map((row) => row.invoice_number)).length === 1) {
        for (const row of articles) {
            if (!normalizeText(row.invoice_number)) row.invoice_number = onlyInvoiceNumber;
        }
        for (const row of tariffLines) {
            if (!normalizeText(row.invoice_number)) row.invoice_number = onlyInvoiceNumber;
        }
    }

    if (uniqueNonEmpty(articles.map((row) => row.article_line_no)).length === 1) {
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
        messages.push(__("Keep shipment, invoice, article, and tariff references aligned. The LDS verifier compares that linkage exactly."));
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

frappe.ui.form.on("Customs Entry", {
    setup(frm) {
        setPortQueries(frm);
        setCarrierQuery(frm);
    },
    async refresh(frm) {
        setPortQueries(frm);
        setCarrierQuery(frm);
        applyFieldHelp(frm);
        await applyReturnedMasterSelection(frm);
        setEntryGuidance(frm);
        addEntryActions(frm);
    },
    validate(frm) {
        applySafeLinkDefaults(frm);
    },
    entry_type(frm) {
        setEntryGuidance(frm);
    },
    transport_mode(frm) {
        setEntryGuidance(frm);
    },
});

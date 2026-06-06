const MASTER_RETURN_REQUEST_KEY = "andersoncb_erp.customs_entry.master_return_request";
const MASTER_RETURN_RESULT_KEY = "andersoncb_erp.customs_entry.master_return_result";

function getPendingMasterReturn(targetDoctype) {
    try {
        const raw = window.localStorage.getItem(MASTER_RETURN_REQUEST_KEY);
        if (!raw) return null;
        const payload = JSON.parse(raw);
        if (payload.target_doctype !== targetDoctype) {
            return null;
        }
        return payload;
    } catch (error) {
        console.warn("Failed to read pending master return payload", error);
        return null;
    }
}

function completeMasterReturn(targetDoctype, createdName) {
    const pending = getPendingMasterReturn(targetDoctype);
    if (!pending) {
        return false;
    }
    window.localStorage.removeItem(MASTER_RETURN_REQUEST_KEY);
    window.localStorage.setItem(
        MASTER_RETURN_RESULT_KEY,
        JSON.stringify({
            ...pending,
            created_name: createdName,
        }),
    );
    frappe.set_route("Form", pending.source_doctype, pending.source_name);
    return true;
}

async function submitImporterProfileToLDS(frm) {
    if (frm.is_dirty()) {
        await frm.save();
    }

    frappe.call({
        method: "andersoncb_erp.api.submit_importer_profile",
        args: { name: frm.doc.name },
        freeze: true,
        freeze_message: __("Submitting importer profile to LDS..."),
        callback: async (r) => {
            const result = r.message || {};
            if (!result.ok) {
                frappe.msgprint({
                    title: __("LDS Submission Failed"),
                    message: result.error || __("LDS rejected the submission."),
                    indicator: "red",
                });
                frm.reload_doc();
                return;
            }
            if (completeMasterReturn("Importer Profile", frm.doc.name)) {
                return;
            }
            await frm.reload_doc();
        },
    });
}

frappe.ui.form.on("Importer Profile", {
    refresh(frm) {
        if (!frm.is_new() && frm.doc.docstatus === 0 && !frm.is_dirty()) {
            frm.page.set_primary_action(__("Submit"), () => submitImporterProfileToLDS(frm), "octicon octicon-check");
        }
    },
});

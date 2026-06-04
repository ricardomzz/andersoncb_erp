async function submitCarrierToLDS(frm) {
	if (frm.is_dirty()) {
		await frm.save();
	}

	frappe.call({
		method: "andersoncb_erp.api.submit_carrier",
		args: { name: frm.doc.name },
		freeze: true,
		freeze_message: __("Submitting carrier to LDS..."),
		callback: (r) => {
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
			frm.reload_doc();
		},
	});
}

frappe.ui.form.on("Carrier", {
	refresh(frm) {
		if (!frm.is_new() && frm.doc.docstatus === 0 && !frm.is_dirty()) {
			frm.page.set_primary_action(__("Submit"), () => submitCarrierToLDS(frm), "octicon octicon-check");
		}
	},
});

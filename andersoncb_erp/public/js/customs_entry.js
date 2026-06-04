async function submitEntryToLDS(frm) {
	if (frm.is_dirty()) {
		await frm.save();
	}

	frappe.call({
		method: "andersoncb_erp.api.submit_entry",
		args: { name: frm.doc.name },
		freeze: true,
		freeze_message: __("Submitting entry to LDS..."),
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
			if (result.name && result.name !== frm.doc.name) {
				frappe.set_route("Form", "Customs Entry", result.name);
				return;
			}
			frm.reload_doc();
		},
	});
}

frappe.ui.form.on("Customs Entry", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Refresh From LDS"), () => {
				frappe.call({
					method: "andersoncb_erp.api.refresh_entry",
					args: { name: frm.doc.name },
					freeze: true,
					freeze_message: __("Refreshing entry from LDS..."),
					callback: () => frm.reload_doc(),
				});
			});

			frm.add_custom_button(__("Create Draft From Entry"), () => {
				frappe.call({
					method: "andersoncb_erp.api.create_entry_draft",
					args: { source_name: frm.doc.name },
					freeze: true,
					freeze_message: __("Creating draft copy..."),
					callback: (r) => {
						if (r.message) {
							frappe.set_route("Form", "Customs Entry", r.message);
						}
					},
				});
			});
		}

		if (!frm.is_new() && frm.doc.docstatus === 0 && !frm.is_dirty()) {
			frm.page.set_primary_action(__("Submit"), () => submitEntryToLDS(frm), "octicon octicon-check");
		}
	},
});

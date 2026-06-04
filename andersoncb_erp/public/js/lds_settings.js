frappe.ui.form.on("LDS Settings", {
	refresh(frm) {
		frm.add_custom_button(__("Run Initial Full Sync"), () => {
			frappe.call({
				method: "andersoncb_erp.api.run_initial_sync",
				freeze: true,
				freeze_message: __("Running initial full sync..."),
				callback: () => frm.reload_doc(),
			});
		});

		frm.add_custom_button(__("Run Rolling Sync"), () => {
			frappe.call({
				method: "andersoncb_erp.api.run_rolling_sync",
				freeze: true,
				freeze_message: __("Running rolling sync..."),
				callback: () => frm.reload_doc(),
			});
		});
	},
});

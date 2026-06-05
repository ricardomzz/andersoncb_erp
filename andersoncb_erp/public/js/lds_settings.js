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

		frm.add_custom_button(__("Purge LDS Data"), () => {
			frappe.confirm(
				__("This will permanently remove LDS-synced Customs Entries, Importer Profiles, and Carriers from ERPNext. Local drafts will remain, but any links they had to synced parties will be cleared. Continue?"),
				() => {
					frappe.call({
						method: "andersoncb_erp.api.purge_lds_data",
						freeze: true,
						freeze_message: __("Purging LDS-synced data..."),
						callback: (r) => {
							const result = r.message || {};
							frappe.msgprint({
								title: __("LDS Data Purged"),
								indicator: "orange",
								message: __(
									"Deleted {0} Customs Entries, {1} Importer Profiles, and {2} Carriers.",
									[
										result.deleted_customs_entries || 0,
										result.deleted_importer_profiles || 0,
										result.deleted_carriers || 0,
									]
								),
							});
							frm.reload_doc();
						},
					});
				}
			);
		});
	},
});

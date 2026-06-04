app_name = "andersoncb_erp"
app_title = "AndersonCB ERP"
app_publisher = "AndersonCB"
app_description = "Initial ERPNext app for LDS-backed customs entry synchronization"
app_email = "support@andersoncb.com"
app_license = "mit"

doctype_js = {
    "LDS Settings": "public/js/lds_settings.js",
    "Customs Entry": "public/js/customs_entry.js",
}

doctype_list_js = {
    "Customs Entry": "public/js/customs_entry_list.js",
}

scheduler_events = {
    "all": ["andersoncb_erp.services.sync.run_scheduled_rolling_sync"],
}


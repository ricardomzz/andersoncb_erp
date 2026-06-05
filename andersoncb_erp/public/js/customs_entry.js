function setPortQueries(frm) {
    const query = () => ({ query: "andersoncb_erp.api.search_customs_ports" });
    frm.set_query("port_of_entry", query);
    frm.set_query("port_of_unlading", query);
    frm.set_query("port_of_entry", "shipments", query);
    frm.set_query("port_of_unlading", "shipments", query);
}

frappe.ui.form.on("Customs Entry", {
    setup(frm) {
        setPortQueries(frm);
    },
    refresh(frm) {
        setPortQueries(frm);
    },
});

const RAW_SECTION_FIELDS = [
	"raw_tables_section",
	"raw_shipments_section",
	"raw_invoices_section",
	"raw_fees_section",
	"raw_tariffs_section",
	"raw_events_section",
	"raw_references_section",
];

const DETAIL_FIELDS_BY_STATE = {
	draft: [
		"importer_number",
		"consignee_name",
		"broker_reference",
		"bond_number",
		"house_bill",
		"master_bill",
		"entry_type",
		"port_of_entry",
		"transport_mode",
	],
	submitted: [],
};

function ensureNarrativeStyle() {
	if (document.getElementById("customs-entry-narrative-style")) {
		return;
	}

	const style = document.createElement("style");
	style.id = "customs-entry-narrative-style";
	style.textContent = `
		.customs-entry-story {
			display: grid;
			gap: 16px;
		}
		.customs-entry-story + .customs-entry-story {
			margin-top: 12px;
		}
		.customs-entry-alert {
			padding: 12px 14px;
			border-radius: 14px;
			border: 1px solid #f2b8b5;
			background: #fff3f2;
			color: #7b1e1e;
			white-space: pre-wrap;
			line-height: 1.5;
		}
		.customs-entry-panel {
			background: linear-gradient(180deg, #fffdf8 0%, #fff 100%);
			border: 1px solid #eadfcf;
			border-radius: 18px;
			padding: 16px 18px;
			box-shadow: 0 8px 24px rgba(80, 53, 26, 0.06);
		}
		.customs-entry-panel.is-draft {
			border-color: #d4c29c;
			background: linear-gradient(180deg, #fff8eb 0%, #fffefb 100%);
		}
		.customs-entry-panel h4 {
			margin: 0 0 10px;
			font-size: 15px;
			font-weight: 700;
			color: #3f2f1d;
		}
		.customs-entry-meta-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
			gap: 10px;
		}
		.customs-entry-stat-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
			gap: 10px;
		}
		.customs-entry-stat,
		.customs-entry-meta,
		.customs-entry-list-item,
		.customs-entry-event {
			border-radius: 14px;
			border: 1px solid #ece7df;
			background: #ffffff;
			padding: 12px 14px;
		}
		.customs-entry-stat-label,
		.customs-entry-meta-label,
		.customs-entry-list-kicker,
		.customs-entry-event-time {
			font-size: 11px;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: #7c756c;
			margin-bottom: 5px;
		}
		.customs-entry-stat-value,
		.customs-entry-meta-value {
			font-size: 18px;
			font-weight: 700;
			color: #22170d;
		}
		.customs-entry-meta-value {
			font-size: 14px;
			font-weight: 600;
		}
		.customs-entry-pill-row {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			margin-bottom: 10px;
		}
		.customs-entry-pill {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 6px 10px;
			border-radius: 999px;
			font-size: 12px;
			font-weight: 700;
			border: 1px solid transparent;
		}
		.customs-entry-pill::before {
			content: "";
			width: 7px;
			height: 7px;
			border-radius: 999px;
			background: currentColor;
		}
		.customs-entry-pill.blue { background: #edf6ff; color: #125293; border-color: #c9defa; }
		.customs-entry-pill.yellow { background: #fff8df; color: #8b6400; border-color: #f0d997; }
		.customs-entry-pill.orange { background: #fff0e5; color: #9a4e00; border-color: #f4c79f; }
		.customs-entry-pill.green { background: #ecfbef; color: #18663b; border-color: #bee9cb; }
		.customs-entry-pill.gray { background: #f3f4f6; color: #59616a; border-color: #d7dbe1; }
		.customs-entry-pill.purple { background: #f4edff; color: #5f3ba4; border-color: #dac7fb; }
		.customs-entry-list {
			display: grid;
			gap: 10px;
		}
		.customs-entry-list-item.is-emphasis {
			border-color: #d9c19b;
			box-shadow: inset 0 0 0 1px #efe1c8;
		}
		.customs-entry-list-title {
			font-size: 14px;
			font-weight: 700;
			color: #20160d;
			margin-bottom: 8px;
		}
		.customs-entry-mini-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
			gap: 8px 12px;
		}
		.customs-entry-mini {
			font-size: 12px;
			color: #55483d;
		}
		.customs-entry-mini strong {
			display: block;
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: #8a7f75;
			margin-bottom: 3px;
		}
		.customs-entry-event-list {
			display: grid;
			gap: 10px;
		}
		.customs-entry-event-name {
			font-size: 14px;
			font-weight: 700;
			color: #21160d;
			margin-bottom: 3px;
		}
		.customs-entry-event-code {
			font-size: 12px;
			font-weight: 600;
			color: #7a6652;
			margin-bottom: 6px;
		}
		.customs-entry-muted {
			color: #8a8177;
			font-size: 13px;
		}
		.customs-entry-link {
			color: #125293;
			text-decoration: none;
			font-weight: 600;
		}
		.customs-entry-link:hover {
			text-decoration: underline;
		}
	`;
	document.head.appendChild(style);
}

function escapeHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function formatText(value, fallback = "Not provided") {
	if (value === null || value === undefined || value === "") {
		return `<span class="customs-entry-muted">${escapeHtml(fallback)}</span>`;
	}
	return escapeHtml(value);
}

function formatDate(value, type = "Date") {
	if (!value) {
		return `<span class="customs-entry-muted">Not available</span>`;
	}
	try {
		return frappe.format(value, { fieldtype: type }, { only_value: true });
	} catch (error) {
		return escapeHtml(value);
	}
}

function formatMoney(value, currency) {
	if (value === null || value === undefined || value === "") {
		return `<span class="customs-entry-muted">Not available</span>`;
	}
	const amount = Number(value);
	if (Number.isNaN(amount)) {
		return escapeHtml(value);
	}
	const formatted = amount.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	return currency ? `${escapeHtml(currency)} ${formatted}` : formatted;
}

function buildPill(label, tone) {
	return `<span class="customs-entry-pill ${tone}">${escapeHtml(label || "Unknown")}</span>`;
}

function statusTone(status) {
	const normalized = (status || "").toLowerCase();
	if (normalized.includes("not liquidated")) return "gray";
	if (normalized.includes("released") || normalized.includes("paid")) return "green";
	if (normalized.includes("psc") || normalized.includes("accelerated")) return "orange";
	if (normalized.includes("filed") || normalized.includes("unpaid")) return "yellow";
	if (normalized.includes("entered") || normalized.includes("draft")) return "blue";
	if (normalized.includes("liquidated")) return "purple";
	if (normalized.includes("archived") || normalized.includes("cancelled")) return "gray";
	return "gray";
}

function isDraftEntry(doc) {
	return cint(doc.docstatus) === 0;
}

function docLink(doctype, name, label) {
	if (!name) {
		return formatText(label || name);
	}
	return `<a class="customs-entry-link" href="#Form/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}">${escapeHtml(label || name)}</a>`;
}

function renderHtmlField(frm, fieldname, html) {
	const field = frm.get_field(fieldname);
	if (!field || !field.$wrapper) {
		return;
	}
	field.$wrapper.html(html);
}

function statCard(label, value) {
	return `
		<div class="customs-entry-stat">
			<div class="customs-entry-stat-label">${escapeHtml(label)}</div>
			<div class="customs-entry-stat-value">${value}</div>
		</div>
	`;
}

function metaCard(label, value) {
	return `
		<div class="customs-entry-meta">
			<div class="customs-entry-meta-label">${escapeHtml(label)}</div>
			<div class="customs-entry-meta-value">${value}</div>
		</div>
	`;
}

function sumField(rows, fieldname) {
	return (rows || []).reduce((total, row) => total + (Number(row[fieldname]) || 0), 0);
}

function renderOverview(doc) {
	const counts = {
		Shipments: (doc.shipments || []).length,
		Invoices: (doc.invoices || []).length,
		Fees: (doc.fees || []).length,
		Tariffs: (doc.tariff_lines || []).length,
		Events: (doc.events || []).length,
		References: (doc.references || []).length,
	};

	return `
		<div class="customs-entry-story">
			<div class="customs-entry-panel ${isDraftEntry(doc) ? "is-draft" : ""}">
				<div class="customs-entry-pill-row">
					${buildPill(doc.status || (isDraftEntry(doc) ? "Draft" : "Unknown"), statusTone(doc.status || (isDraftEntry(doc) ? "Draft" : "Unknown")))}
					${buildPill(doc.liquidation_status || "Not Liquidated", statusTone(doc.liquidation_status || "Not Liquidated"))}
					${doc.source_active ? buildPill("Source Active", "green") : buildPill("Archived", "gray")}
				</div>
				<h4>Lifecycle Snapshot</h4>
				<div class="customs-entry-meta-grid">
					${metaCard("Entry Date", formatDate(doc.entry_date))}
					${metaCard("Filing Date", formatDate(doc.filing_date))}
					${metaCard("Release Date", formatDate(doc.release_date))}
					${metaCard("Liquidation Date", formatDate(doc.liquidation_date))}
					${metaCard("Entered Value", formatMoney(doc.total_entered_value, doc.currency))}
					${metaCard("Transport Mode", formatText(doc.transport_mode))}
				</div>
			</div>
			<div class="customs-entry-panel">
				<h4>Entry Composition</h4>
				<div class="customs-entry-stat-grid">
					${Object.entries(counts).map(([label, value]) => statCard(label, escapeHtml(value))).join("")}
				</div>
			</div>
		</div>
	`;
}

function renderParties(doc) {
	return `
		<div class="customs-entry-story">
			<div class="customs-entry-panel">
				<h4>Parties</h4>
				<div class="customs-entry-meta-grid">
					${metaCard("Importer Profile", doc.importer_profile ? docLink("Importer Profile", doc.importer_profile, doc.importer_name || doc.importer_profile) : formatText(doc.importer_name))}
					${metaCard("Importer Number", formatText(doc.importer_number))}
					${metaCard("Consignee", formatText(doc.consignee_name))}
					${metaCard("Created By", formatText(doc.created_by))}
				</div>
			</div>
			<div class="customs-entry-panel">
				<h4>References</h4>
				<div class="customs-entry-meta-grid">
					${metaCard("Client Ref", formatText(doc.client_ref))}
					${metaCard("Broker Reference", formatText(doc.broker_reference))}
					${metaCard("Bond Number", formatText(doc.bond_number))}
					${metaCard("House Bill", formatText(doc.house_bill))}
					${metaCard("Master Bill", formatText(doc.master_bill))}
					${metaCard("Port of Entry", formatText(doc.port_of_entry))}
				</div>
			</div>
		</div>
	`;
}

function renderShipments(doc) {
	const shipments = doc.shipments || [];
	if (!shipments.length) {
		return `<div class="customs-entry-panel"><h4>Shipments</h4><div class="customs-entry-muted">No shipment rows are attached to this entry.</div></div>`;
	}

	return `
		<div class="customs-entry-list">
			${shipments.map((shipment) => `
				<div class="customs-entry-list-item ${shipments.length > 1 ? "is-emphasis" : ""}">
					<div class="customs-entry-list-kicker">Shipment ${formatText(shipment.shipment_no, "Unnumbered")}</div>
					<div class="customs-entry-list-title">${formatText(shipment.carrier || shipment.carrier_profile || shipment.mode, "Shipment")}</div>
					<div class="customs-entry-mini-grid">
						<div class="customs-entry-mini"><strong>Mode</strong>${formatText(shipment.mode)}</div>
						<div class="customs-entry-mini"><strong>Carrier</strong>${shipment.carrier_profile ? docLink("Carrier", shipment.carrier_profile, shipment.carrier || shipment.carrier_profile) : formatText(shipment.carrier)}</div>
						<div class="customs-entry-mini"><strong>Voyage / Flight</strong>${formatText(shipment.voyage_or_flight)}</div>
						<div class="customs-entry-mini"><strong>Origin</strong>${formatText(shipment.origin)}</div>
						<div class="customs-entry-mini"><strong>Destination</strong>${formatText(shipment.destination)}</div>
						<div class="customs-entry-mini"><strong>Arrival Date</strong>${formatDate(shipment.arrival_date)}</div>
					</div>
				</div>
			`).join("")}
		</div>
	`;
}

function renderCommercial(doc) {
	const invoices = doc.invoices || [];
	const fees = doc.fees || [];
	const references = doc.references || [];

	return `
		<div class="customs-entry-story">
			<div class="customs-entry-panel">
				<h4>Invoices</h4>
				${invoices.length ? `
					<div class="customs-entry-list">
						${invoices.map((invoice) => `
							<div class="customs-entry-list-item">
								<div class="customs-entry-list-kicker">Invoice ${formatText(invoice.invoice_number, "Unnumbered")}</div>
								<div class="customs-entry-mini-grid">
									<div class="customs-entry-mini"><strong>Date</strong>${formatDate(invoice.invoice_date)}</div>
									<div class="customs-entry-mini"><strong>Vendor</strong>${formatText(invoice.vendor_name)}</div>
									<div class="customs-entry-mini"><strong>Amount</strong>${formatMoney(invoice.invoice_amount, invoice.currency || doc.currency)}</div>
								</div>
							</div>
						`).join("")}
					</div>
				` : `<div class="customs-entry-muted">No invoices are attached.</div>`}
			</div>
			<div class="customs-entry-panel">
				<h4>Fees & Supporting References</h4>
				${fees.length ? `
					<div class="customs-entry-list">
						${fees.map((fee) => `
							<div class="customs-entry-list-item">
								<div class="customs-entry-list-title">${formatText(fee.fee_type, "Fee")}</div>
								<div class="customs-entry-mini-grid">
									<div class="customs-entry-mini"><strong>Amount</strong>${formatMoney(fee.amount, fee.currency || doc.currency)}</div>
									<div class="customs-entry-mini"><strong>Description</strong>${formatText(fee.description)}</div>
								</div>
							</div>
						`).join("")}
					</div>
				` : `<div class="customs-entry-muted">No fee rows are attached.</div>`}
				${references.length ? `
					<div class="customs-entry-list" style="margin-top: 12px;">
						${references.map((reference) => `
							<div class="customs-entry-list-item">
								<div class="customs-entry-list-title">${formatText(reference.reference_type, "Reference")}</div>
								<div class="customs-entry-mini-grid">
									<div class="customs-entry-mini"><strong>Value</strong>${formatText(reference.reference_value)}</div>
									<div class="customs-entry-mini"><strong>Description</strong>${formatText(reference.description)}</div>
								</div>
							</div>
						`).join("")}
					</div>
				` : ""}
			</div>
		</div>
	`;
}

function renderClassification(doc) {
	const lines = doc.tariff_lines || [];
	const totalEntered = sumField(lines, "entered_value");
	const totalDuty = sumField(lines, "duty_amount");

	return `
		<div class="customs-entry-story">
			<div class="customs-entry-panel">
				<h4>Tariff Profile</h4>
				<div class="customs-entry-stat-grid">
					${statCard("Tariff Lines", escapeHtml(lines.length))}
					${statCard("Entered Value", formatMoney(totalEntered, doc.currency))}
					${statCard("Duty", formatMoney(totalDuty, doc.currency))}
				</div>
			</div>
			<div class="customs-entry-panel">
				${lines.length ? `
					<div class="customs-entry-list">
						${lines.map((line) => `
							<div class="customs-entry-list-item">
								<div class="customs-entry-list-kicker">Line ${formatText(line.line_no, "Unnumbered")}</div>
								<div class="customs-entry-list-title">${formatText(line.hs_code, "HS Code Missing")}</div>
								<div class="customs-entry-mini-grid">
									<div class="customs-entry-mini"><strong>Description</strong>${formatText(line.description)}</div>
									<div class="customs-entry-mini"><strong>Quantity / UOM</strong>${formatText(line.quantity)} ${line.uom ? escapeHtml(line.uom) : ""}</div>
									<div class="customs-entry-mini"><strong>Entered Value</strong>${formatMoney(line.entered_value, doc.currency)}</div>
									<div class="customs-entry-mini"><strong>Duty</strong>${formatMoney(line.duty_amount, doc.currency)}</div>
									<div class="customs-entry-mini"><strong>Country of Origin</strong>${formatText(line.country_of_origin)}</div>
								</div>
							</div>
						`).join("")}
					</div>
				` : `<div class="customs-entry-muted">No tariff lines are attached.</div>`}
			</div>
		</div>
	`;
}

function renderTimeline(doc) {
	const events = [...(doc.events || [])].sort((left, right) => {
		const leftValue = left.event_timestamp || "";
		const rightValue = right.event_timestamp || "";
		return leftValue.localeCompare(rightValue);
	});

	if (!events.length) {
		return `<div class="customs-entry-panel"><h4>Entry Timeline</h4><div class="customs-entry-muted">No events are attached to this entry.</div></div>`;
	}

	return `
		<div class="customs-entry-panel">
			<h4>Entry Timeline</h4>
			<div class="customs-entry-event-list">
				${events.map((event) => `
					<div class="customs-entry-event">
						<div class="customs-entry-event-time">${formatDate(event.event_timestamp, "Datetime")}</div>
						<div class="customs-entry-event-name">${formatText(event.event_name, "Unnamed Event")}</div>
						<div class="customs-entry-event-code">${formatText(event.event_code, "No event code")}</div>
						<div class="customs-entry-muted">${formatText(event.details, "No additional details")}</div>
					</div>
				`).join("")}
			</div>
		</div>
	`;
}

function renderSystem(doc) {
	const showError = isDraftEntry(doc) && !!doc.lds_submission_errors;
	return `
		<div class="customs-entry-story">
			${showError ? `<div class="customs-entry-alert">${escapeHtml(doc.lds_submission_errors)}</div>` : ""}
			<div class="customs-entry-panel">
				<h4>LDS & Source State</h4>
				<div class="customs-entry-meta-grid">
					${metaCard("LDS ID", formatText(doc.lds_id))}
					${metaCard("Source Active", doc.source_active ? buildPill("Active", "green") : buildPill("Archived", "gray"))}
					${metaCard("Last Submission", formatDate(doc.last_lds_submission_on, "Datetime"))}
					${metaCard("Last Seen in Source", formatDate(doc.last_seen_in_source_on, "Datetime"))}
					${metaCard("Last Synced", formatDate(doc.last_synced_on, "Datetime"))}
					${metaCard("Archived On", formatDate(doc.archived_on, "Datetime"))}
				</div>
			</div>
		</div>
	`;
}

function updateSectionDisplay(frm) {
	const draft = isDraftEntry(frm.doc);
	const hasErrors = draft && !!frm.doc.lds_submission_errors;

	for (const fieldname of RAW_SECTION_FIELDS) {
		frm.set_df_property(fieldname, "collapsible", 1);
		frm.set_df_property(fieldname, "collapsed", draft ? 0 : 1);
	}

	frm.set_df_property("system_section", "collapsible", 1);
	frm.set_df_property("system_section", "collapsed", hasErrors ? 0 : draft ? 0 : 1);

	frm.toggle_display("lds_submission_errors", hasErrors);
	frm.toggle_display("lds_last_submission_payload", hasErrors);
	frm.toggle_display("raw_payload_xml", hasErrors);

	const visibleFields = draft ? DETAIL_FIELDS_BY_STATE.draft : DETAIL_FIELDS_BY_STATE.submitted;
	for (const fieldname of DETAIL_FIELDS_BY_STATE.draft) {
		frm.toggle_display(fieldname, visibleFields.includes(fieldname));
	}
}

function renderNarrativeSections(frm) {
	ensureNarrativeStyle();
	renderHtmlField(frm, "overview_html", renderOverview(frm.doc));
	renderHtmlField(frm, "parties_html", renderParties(frm.doc));
	renderHtmlField(frm, "shipment_summary_html", renderShipments(frm.doc));
	renderHtmlField(frm, "commercial_summary_html", renderCommercial(frm.doc));
	renderHtmlField(frm, "classification_summary_html", renderClassification(frm.doc));
	renderHtmlField(frm, "timeline_summary_html", renderTimeline(frm.doc));
	renderHtmlField(frm, "system_summary_html", renderSystem(frm.doc));
	updateSectionDisplay(frm);
}

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

function bindEntryActions(frm) {
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

	if (!frm.is_new() && cint(frm.doc.docstatus) === 0 && !frm.is_dirty()) {
		frm.page.set_primary_action(__("Submit"), () => submitEntryToLDS(frm), "octicon octicon-check");
	}
}

frappe.ui.form.on("Customs Entry", {
	refresh(frm) {
		renderNarrativeSections(frm);
		bindEntryActions(frm);
	},
	after_save(frm) {
		renderNarrativeSections(frm);
	},
	importer_profile(frm) {
		renderNarrativeSections(frm);
	},
	client_ref(frm) {
		renderNarrativeSections(frm);
	},
	consignee_name(frm) {
		renderNarrativeSections(frm);
	},
	broker_reference(frm) {
		renderNarrativeSections(frm);
	},
	bond_number(frm) {
		renderNarrativeSections(frm);
	},
	house_bill(frm) {
		renderNarrativeSections(frm);
	},
	master_bill(frm) {
		renderNarrativeSections(frm);
	},
	entry_type(frm) {
		renderNarrativeSections(frm);
	},
	port_of_entry(frm) {
		renderNarrativeSections(frm);
	},
	transport_mode(frm) {
		renderNarrativeSections(frm);
	},
});

function rerenderFromChild(frm) {
	renderNarrativeSections(frm);
}

frappe.ui.form.on("Entry Shipment", {
	shipment_no: rerenderFromChild,
	mode: rerenderFromChild,
	carrier_profile: rerenderFromChild,
	voyage_or_flight: rerenderFromChild,
	origin: rerenderFromChild,
	destination: rerenderFromChild,
	arrival_date: rerenderFromChild,
});

frappe.ui.form.on("Entry Invoice", {
	invoice_number: rerenderFromChild,
	invoice_date: rerenderFromChild,
	currency: rerenderFromChild,
	invoice_amount: rerenderFromChild,
	vendor_name: rerenderFromChild,
});

frappe.ui.form.on("Entry Fee", {
	fee_type: rerenderFromChild,
	amount: rerenderFromChild,
	currency: rerenderFromChild,
	description: rerenderFromChild,
});

frappe.ui.form.on("Entry Tariff Line", {
	line_no: rerenderFromChild,
	hs_code: rerenderFromChild,
	description: rerenderFromChild,
	quantity: rerenderFromChild,
	uom: rerenderFromChild,
	entered_value: rerenderFromChild,
	duty_amount: rerenderFromChild,
	country_of_origin: rerenderFromChild,
});

frappe.ui.form.on("Entry Event", {
	event_code: rerenderFromChild,
	event_name: rerenderFromChild,
	event_timestamp: rerenderFromChild,
	details: rerenderFromChild,
});

frappe.ui.form.on("Entry Reference", {
	reference_type: rerenderFromChild,
	reference_value: rerenderFromChild,
	description: rerenderFromChild,
});

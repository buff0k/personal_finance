// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.ui.form.on("Personal Finance Electricity Cost", {
	setup(frm) {
		frm.set_query("amended_from", () => {
			return {
				filters: {
					docstatus: 1
				}
			};
		});
	},

	refresh(frm) {
		frm.trigger("set_period_preview");
		frm.trigger("set_rate_grid_properties");
	},

	municipality(frm) {
		frm.trigger("set_period_preview");
	},

	effective_date(frm) {
		frm.trigger("set_period_preview");
	},

	set_period_preview(frm) {
		if (!frm.doc.municipality || !frm.doc.effective_date) {
			if (frm.is_new()) {
				frm.set_value("period", "");
			}
			return;
		}

		// Client-side preview only.
		// Server-side Python decides the final unique value:
		// Municipality - 2026
		// Municipality - 2026 - 1
		// Municipality - 2026 - 2
		if (frm.is_new()) {
			const year = frappe.datetime.str_to_obj(frm.doc.effective_date).getFullYear();
			const municipality = String(frm.doc.municipality).trim();

			if (municipality) {
				frm.set_value("period", `${municipality} - ${year}`);
			}
		}
	},

	set_rate_grid_properties(frm) {
		if (!frm.fields_dict.rates || !frm.fields_dict.rates.grid) {
			return;
		}

		frm.fields_dict.rates.grid.update_docfield_property(
			"from_units",
			"description",
			"Starting kWh/unit value for this tranche."
		);

		frm.fields_dict.rates.grid.update_docfield_property(
			"to_units",
			"description",
			"Ending kWh/unit value for this tranche. Leave blank for the final infinite tranche."
		);

		frm.fields_dict.rates.grid.update_docfield_property(
			"unit_cost",
			"description",
			"Cost per kWh/unit for this tranche."
		);
	},

	validate(frm) {
		frm.trigger("validate_rates_client_side");
	},

	validate_rates_client_side(frm) {
		if (!frm.doc.municipality || !String(frm.doc.municipality).trim()) {
			frappe.throw(__("Please enter a Municipality."));
		}

		if (!frm.doc.effective_date) {
			frappe.throw(__("Please enter an Effective Date."));
		}

		if (!frm.doc.rates || !frm.doc.rates.length) {
			frappe.throw(__("Please add at least one electricity rate row."));
		}

		const rows = (frm.doc.rates || [])
			.map((row) => {
				const from_units = cint(row.from_units);

				return {
					name: row.name,
					idx: row.idx,
					from_units: from_units,
					to_units: get_optional_to_units(row.to_units, from_units),
					unit_cost: flt(row.unit_cost)
				};
			})
			.sort((a, b) => a.from_units - b.from_units);

		let previous_to_units = null;
		let previous_row_idx = null;
		let open_ended_found = false;

		rows.forEach((row) => {
			if (row.from_units < 0) {
				frappe.throw(__("Row #{0}: From Units cannot be negative.", [row.idx]));
			}

			if (row.to_units !== null && row.to_units < 0) {
				frappe.throw(__("Row #{0}: To Units cannot be negative.", [row.idx]));
			}

			if (row.to_units !== null && row.to_units < row.from_units) {
				frappe.throw(__("Row #{0}: To Units cannot be less than From Units.", [row.idx]));
			}

			if (row.unit_cost < 0) {
				frappe.throw(__("Row #{0}: Unit Cost cannot be negative.", [row.idx]));
			}

			if (open_ended_found) {
				frappe.throw(__("Row #{0}: No rate rows may appear after an open-ended tranche.", [row.idx]));
			}

			if (previous_to_units !== null && row.from_units < previous_to_units) {
				frappe.throw(__("Row #{0}: This tranche overlaps with row #{1}.", [
					row.idx,
					previous_row_idx
				]));
			}

			if (row.to_units === null) {
				open_ended_found = true;
			}

			previous_to_units = row.to_units;
			previous_row_idx = row.idx;
		});
	}
});

frappe.ui.form.on("Personal Finance Electricity Cost Table", {
	rates_add(frm, cdt, cdn) {
		// Deliberately do nothing here.
		// Auto-sorting on add causes blank new rows to jump upward.
	},

	rates_remove(frm, cdt, cdn) {
		// Deliberately do nothing here.
	},

	from_units(frm, cdt, cdn) {
		// Full validation happens on save.
		// Do not auto-sort while the user is editing.
	},

	to_units(frm, cdt, cdn) {
		// The final tranche may intentionally have no To Units value.
	},

	unit_cost(frm, cdt, cdn) {
		// Full validation happens on save.
	}
});

function get_optional_to_units(value, from_units) {
	// The final/infinite tranche should be allowed:
	// e.g. 600 -> blank.
	//
	// In some Frappe grid/client states, an empty Int field behaves like 0.
	// Since 0 is not a meaningful To Units value for a tranche starting above 0,
	// treat it as blank/open-ended.

	if (value === undefined || value === null || value === "") {
		return null;
	}

	const parsed_value = cint(value);

	if (from_units > 0 && parsed_value === 0) {
		return null;
	}

	return parsed_value;
}
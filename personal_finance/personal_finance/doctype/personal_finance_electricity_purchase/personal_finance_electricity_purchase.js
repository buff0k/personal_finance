// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

const DEFAULT_TAX_RATE = 15.0;

frappe.ui.form.on("Personal Finance Electricity Purchase", {
	setup(frm) {
		frm._electricity_purchase_syncing = false;
		frm._electricity_purchase_rates = [];
		frm._electricity_purchase_month_to_date_units = 0;
		frm._electricity_purchase_auto_cost_rows = {};
		frm._electricity_purchase_loading_context = false;

		frm.set_query("amended_from", () => {
			return {
				filters: {
					docstatus: 1
				}
			};
		});

		frm.set_query("electricity_cost", () => {
			return {
				filters: {
					docstatus: 1
				}
			};
		});
	},

	onload(frm) {
		frm.trigger("set_defaults_for_new_record");
		frm.trigger("load_purchase_calculation_context");
	},

	refresh(frm) {
		frm.trigger("set_defaults_for_new_record");
		frm.trigger("set_grid_field_descriptions");
	},

	set_defaults_for_new_record(frm) {
		if (!frm.is_new()) {
			return;
		}

		if (frm.doc.tax === undefined || frm.doc.tax === null || frm.doc.tax === "") {
			frm.set_value("tax", DEFAULT_TAX_RATE);
		}
	},

	set_grid_field_descriptions(frm) {
		if (!frm.fields_dict.cost_of_units || !frm.fields_dict.cost_of_units.grid) {
			return;
		}

		frm.fields_dict.cost_of_units.grid.update_docfield_property(
			"units",
			"description",
			"Units bought in this tranche."
		);

		frm.fields_dict.cost_of_units.grid.update_docfield_property(
			"cost",
			"description",
			"Unit cost excluding tax. Defaults from the monthly tranche position but can be overridden."
		);

		frm.fields_dict.cost_of_units.grid.update_docfield_property(
			"subtotal",
			"description",
			"Subtotal excluding tax."
		);
	},

	address(frm) {
		frm.trigger("load_purchase_calculation_context");
	},

	purchase_date(frm) {
		frm.trigger("load_purchase_calculation_context");
	},

	electricity_cost(frm) {
		frm.trigger("load_purchase_calculation_context");
	},

	load_purchase_calculation_context(frm) {
		if (frm._electricity_purchase_loading_context) {
			return;
		}

		frm._electricity_purchase_loading_context = true;

		frappe.call({
			method: "personal_finance.personal_finance.doctype.personal_finance_electricity_purchase.personal_finance_electricity_purchase.get_purchase_calculation_context",
			args: {
				electricity_cost: frm.doc.electricity_cost || null,
				address: frm.doc.address || null,
				purchase_date: frm.doc.purchase_date || null,
				exclude_purchase: frm.is_new() ? null : frm.doc.name
			},
			callback(r) {
				const context = r.message || {};

				frm._electricity_purchase_rates = context.rates || [];
				frm._electricity_purchase_month_to_date_units = flt(context.month_to_date_units || 0, 4);

				if (frm.is_new() && !frm.doc.electricity_cost && context.electricity_cost) {
					frm.set_value("electricity_cost", context.electricity_cost);
				}

				if (frm.doc.cost_of_units && frm.doc.cost_of_units.length) {
					frm.trigger("apply_missing_costs_to_rows");
					frm.trigger("recalculate_parent_totals_from_rows");
				} else if (flt(frm.doc.purchase_price_excl) > 0) {
					frm.trigger("allocate_from_purchase_price_excl");
				} else if (flt(frm.doc.purchase_price_incl) > 0) {
					frm.trigger("calculate_excl_from_incl");
					frm.trigger("allocate_from_purchase_price_excl");
				}
			},
			always() {
				frm._electricity_purchase_loading_context = false;
			}
		});
	},

	tax(frm) {
		if (frm._electricity_purchase_syncing) {
			return;
		}

		if (frm.doc.tax === undefined || frm.doc.tax === null || frm.doc.tax === "") {
			return;
		}

		if (flt(frm.doc.tax) < 0) {
			frappe.throw(__("Applicable Tax Rate cannot be negative."));
		}

		if (frm.doc.cost_of_units && frm.doc.cost_of_units.length) {
			frm.trigger("recalculate_parent_totals_from_rows");
			return;
		}

		if (flt(frm.doc.purchase_price_excl) > 0) {
			frm.trigger("calculate_incl_from_excl");
		} else if (flt(frm.doc.purchase_price_incl) > 0) {
			frm.trigger("calculate_excl_from_incl");
		}
	},

	purchase_price_incl(frm) {
		if (frm._electricity_purchase_syncing) {
			return;
		}

		if (!frm.doc.purchase_price_incl) {
			return;
		}

		if (flt(frm.doc.purchase_price_incl) < 0) {
			frappe.throw(__("Purchase Price Incl. cannot be negative."));
		}

		frm.trigger("calculate_excl_from_incl");
		frm.trigger("allocate_from_purchase_price_excl");
	},

	purchase_price_excl(frm) {
		if (frm._electricity_purchase_syncing) {
			return;
		}

		if (!frm.doc.purchase_price_excl) {
			return;
		}

		if (flt(frm.doc.purchase_price_excl) < 0) {
			frappe.throw(__("Purchase Price Excl. cannot be negative."));
		}

		frm.trigger("calculate_incl_from_excl");
		frm.trigger("allocate_from_purchase_price_excl");
	},

	calculate_excl_from_incl(frm) {
		const tax_multiplier = get_tax_multiplier(frm);
		const purchase_price_incl = flt(frm.doc.purchase_price_incl, 4);

		frm._electricity_purchase_syncing = true;
		frm.set_value("purchase_price_excl", round_value(purchase_price_incl / tax_multiplier, 4));
		frm._electricity_purchase_syncing = false;
	},

	calculate_incl_from_excl(frm) {
		const tax_multiplier = get_tax_multiplier(frm);
		const purchase_price_excl = flt(frm.doc.purchase_price_excl, 4);

		frm._electricity_purchase_syncing = true;
		frm.set_value("purchase_price_incl", round_value(purchase_price_excl * tax_multiplier, 4));
		frm._electricity_purchase_syncing = false;
	},

	allocate_from_purchase_price_excl(frm) {
		if (!frm.doc.electricity_cost) {
			frappe.msgprint(__("Please select an Applicable Electricity Cost first."));
			return;
		}

		if (!frm._electricity_purchase_rates || !frm._electricity_purchase_rates.length) {
			frm.trigger("load_purchase_calculation_context");
			return;
		}

		const purchase_price_excl = flt(frm.doc.purchase_price_excl, 4);

		if (purchase_price_excl <= 0) {
			return;
		}

		populate_cost_rows_from_excl_amount(frm, purchase_price_excl);
		frm.trigger("recalculate_parent_totals_from_rows");
	},

	apply_missing_costs_to_rows(frm) {
		(frm.doc.cost_of_units || []).forEach((row) => {
			apply_cost_to_row_if_blank_or_auto(frm, row);
		});

		frm.refresh_field("cost_of_units");
	},

	recalculate_parent_totals_from_rows(frm) {
		const tax_multiplier = get_tax_multiplier(frm);
		let total_excl = 0;

		(frm.doc.cost_of_units || []).forEach((row) => {
			const units = flt(row.units, 4);
			const cost = flt(row.cost, 4);
			const subtotal = round_value(units * cost, 4);

			frappe.model.set_value(row.doctype, row.name, "subtotal", subtotal);
			total_excl += subtotal;
		});

		frm._electricity_purchase_syncing = true;
		frm.set_value("purchase_price_excl", round_value(total_excl, 4));
		frm.set_value("purchase_price_incl", round_value(total_excl * tax_multiplier, 4));
		frm._electricity_purchase_syncing = false;
	},

	validate(frm) {
		if (!frm.doc.address) {
			frappe.throw(__("Please select an Address."));
		}

		if (!frm.doc.purchase_date) {
			frappe.throw(__("Please enter the Date and Time of Purchase."));
		}

		if (!frm.doc.electricity_cost) {
			frappe.throw(__("Please select the Applicable Electricity Cost."));
		}

		if (frm.doc.tax === undefined || frm.doc.tax === null || frm.doc.tax === "") {
			frappe.throw(__("Please enter the Applicable Tax Rate."));
		}

		if (flt(frm.doc.tax) < 0) {
			frappe.throw(__("Applicable Tax Rate cannot be negative."));
		}

		if (flt(frm.doc.purchase_price_incl) < 0) {
			frappe.throw(__("Purchase Price Incl. cannot be negative."));
		}

		if (flt(frm.doc.purchase_price_excl) < 0) {
			frappe.throw(__("Purchase Price Excl. cannot be negative."));
		}

		if (!frm.doc.cost_of_units || !frm.doc.cost_of_units.length) {
			frappe.throw(__("Please add Cost of Units rows."));
		}
	}
});

frappe.ui.form.on("Personal Finance Electricity Purchase Table", {
	units(frm, cdt, cdn) {
		recalculate_purchase_row_and_parent(frm, cdt, cdn, true);
	},

	cost(frm, cdt, cdn) {
		if (frm._electricity_purchase_syncing) {
			return;
		}

		const row = locals[cdt][cdn];

		if (row) {
			frm._electricity_purchase_auto_cost_rows[row.name] = false;
		}

		recalculate_purchase_row_and_parent(frm, cdt, cdn, false);
	},

	subtotal(frm, cdt, cdn) {
		if (frm._electricity_purchase_syncing) {
			return;
		}

		frm.trigger("recalculate_parent_totals_from_rows");
	},

	cost_of_units_add(frm, cdt, cdn) {
		const row = locals[cdt][cdn];

		if (row) {
			apply_cost_to_row_if_blank_or_auto(frm, row);
			frm.refresh_field("cost_of_units");
		}
	},

	cost_of_units_remove(frm, cdt, cdn) {
		frm.trigger("recalculate_parent_totals_from_rows");
	}
});

function recalculate_purchase_row_and_parent(frm, cdt, cdn, allow_cost_autofill) {
	if (frm._electricity_purchase_syncing) {
		return;
	}

	const row = locals[cdt][cdn];

	if (!row) {
		return;
	}

	if (allow_cost_autofill) {
		apply_cost_to_row_if_blank_or_auto(frm, row);
	}

	const units = flt(row.units, 4);
	const cost = flt(row.cost, 4);

	if (units < 0) {
		frappe.throw(__("Units cannot be negative."));
	}

	if (cost < 0) {
		frappe.throw(__("Unit Cost cannot be negative."));
	}

	const subtotal = round_value(units * cost, 4);

	frm._electricity_purchase_syncing = true;
	frappe.model.set_value(cdt, cdn, "subtotal", subtotal);
	frm._electricity_purchase_syncing = false;

	frm.trigger("recalculate_parent_totals_from_rows");
}

function apply_cost_to_row_if_blank_or_auto(frm, row) {
	if (!row) {
		return;
	}

	if (!frm._electricity_purchase_rates || !frm._electricity_purchase_rates.length) {
		if (frm.doc.electricity_cost) {
			frm.trigger("load_purchase_calculation_context");
		}
		return;
	}

	const current_cost = flt(row.cost, 4);
	const is_auto_cost = frm._electricity_purchase_auto_cost_rows[row.name] === true;

	// This is the key override behaviour:
	// if the user has a cost on the row and it was not marked as auto-filled,
	// do not replace it.
	if (current_cost > 0 && !is_auto_cost) {
		return;
	}

	const cumulative_units_before_row = get_cumulative_units_before_row(frm, row);
	const rate = get_rate_for_cumulative_unit_position(
		frm._electricity_purchase_rates,
		cumulative_units_before_row
	);

	if (!rate) {
		return;
	}

	const unit_cost = flt(rate.unit_cost, 4);

	if (unit_cost <= 0) {
		return;
	}

	frm._electricity_purchase_syncing = true;
	frappe.model.set_value(row.doctype, row.name, "cost", unit_cost);
	frm._electricity_purchase_syncing = false;

	frm._electricity_purchase_auto_cost_rows[row.name] = true;
}

function get_cumulative_units_before_row(frm, row) {
	let total = flt(frm._electricity_purchase_month_to_date_units || 0, 4);
	const rows = frm.doc.cost_of_units || [];

	for (let i = 0; i < rows.length; i++) {
		if (rows[i].name === row.name) {
			break;
		}

		total += flt(rows[i].units, 4);
	}

	return round_value(total, 4);
}

function get_rate_for_cumulative_unit_position(rates, cumulative_units_before_row) {
	for (let i = 0; i < rates.length; i++) {
		const remaining = get_remaining_units_in_tranche(
			rates[i],
			cumulative_units_before_row
		);

		if (remaining === null || remaining > 0) {
			return rates[i];
		}
	}

	return null;
}

function populate_cost_rows_from_excl_amount(frm, purchase_price_excl) {
	const rates = frm._electricity_purchase_rates || [];

	if (!rates.length) {
		frappe.msgprint(__("No electricity cost rates were found for the selected Electricity Cost record."));
		return;
	}

	frm.clear_table("cost_of_units");
	frm._electricity_purchase_auto_cost_rows = {};

	let remaining_amount = flt(purchase_price_excl, 4);
	let cumulative_units_before_this_purchase = flt(frm._electricity_purchase_month_to_date_units || 0, 4);

	rates.forEach((rate) => {
		if (remaining_amount <= 0) {
			return;
		}

		const unit_cost = flt(rate.unit_cost, 4);

		if (unit_cost <= 0) {
			frappe.throw(__("Electricity Cost rate must be greater than zero."));
		}

		const available_units = get_remaining_units_in_tranche(
			rate,
			cumulative_units_before_this_purchase
		);

		if (available_units === 0) {
			return;
		}

		const affordable_units = remaining_amount / unit_cost;

		const units = available_units === null
			? affordable_units
			: Math.min(available_units, affordable_units);

		if (units <= 0) {
			return;
		}

		const subtotal = round_value(units * unit_cost, 4);

		const row = frm.add_child("cost_of_units");
		row.units = round_value(units, 2);
		row.cost = unit_cost;
		row.subtotal = subtotal;

		frm._electricity_purchase_auto_cost_rows[row.name] = true;

		remaining_amount = round_value(remaining_amount - subtotal, 4);
		cumulative_units_before_this_purchase = round_value(cumulative_units_before_this_purchase + units, 4);
	});

	frm.refresh_field("cost_of_units");
}

function get_remaining_units_in_tranche(rate, cumulative_units_before_purchase) {
	const capacity = get_tranche_unit_capacity(rate);

	if (capacity === null) {
		return null;
	}

	const from_units = flt(rate.from_units, 4);

	let tranche_start_position = 0;

	if (from_units > 0) {
		tranche_start_position = from_units - 1;
	}

	const tranche_end_position = tranche_start_position + capacity;

	if (cumulative_units_before_purchase >= tranche_end_position) {
		return 0;
	}

	if (cumulative_units_before_purchase <= tranche_start_position) {
		return capacity;
	}

	return round_value(tranche_end_position - cumulative_units_before_purchase, 4);
}

function get_tranche_unit_capacity(rate) {
	if (rate.capacity !== undefined && rate.capacity !== null && rate.capacity !== "") {
		return flt(rate.capacity, 4);
	}

	const from_units = flt(rate.from_units, 4);
	const to_units = rate.to_units;

	if (to_units === undefined || to_units === null || to_units === "") {
		return null;
	}

	const parsed_to_units = flt(to_units, 4);

	if (from_units > 0 && parsed_to_units === 0) {
		return null;
	}

	if (parsed_to_units < from_units) {
		frappe.throw(__("Invalid Electricity Cost tranche: To Units cannot be less than From Units."));
	}

	if (from_units === 0) {
		return round_value(parsed_to_units - from_units, 4);
	}

	return round_value(parsed_to_units - from_units + 1, 4);
}

function get_tax_multiplier(frm) {
	const tax = flt(frm.doc.tax || DEFAULT_TAX_RATE, 4);
	return 1 + (tax / 100);
}

function round_value(value, precision) {
	const multiplier = Math.pow(10, precision);
	return Math.round((flt(value) + Number.EPSILON) * multiplier) / multiplier;
}
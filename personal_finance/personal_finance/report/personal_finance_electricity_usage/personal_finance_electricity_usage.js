// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.query_reports["Personal Finance Electricity Usage"] = {
	filters: [
		{
			fieldname: "address",
			label: __("Address"),
			fieldtype: "Link",
			options: "Address",
			reqd: 1
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date"
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date"
		},
		{
			fieldname: "set_date",
			label: __("Predict Until Date"),
			fieldtype: "Date",
			default: get_next_25th_date()
		}
	],

	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);

		if (!data) {
			return value;
		}

		if (data.row_type === "Message") {
			return `<span style="color: var(--text-muted); font-style: italic;">${value || ""}</span>`;
		}

		if (column.fieldname === "shortfall_units" && flt(data.shortfall_units) > 0) {
			value = `<span style="color: var(--red-600); font-weight: 600;">${value}</span>`;
		}

		if (column.fieldname === "projected_balance_at_set_date" && flt(data.projected_balance_at_set_date) < 0) {
			value = `<span style="color: var(--red-600); font-weight: 600;">${value}</span>`;
		}

		if (column.fieldname === "recommended_purchase_incl" && flt(data.recommended_purchase_incl) > 0) {
			value = `<span style="color: var(--red-600); font-weight: 700;">${value}</span>`;
		}

		if (column.fieldname === "used_kwh" && flt(data.used_kwh) < 0) {
			value = `<span style="color: var(--orange-600); font-weight: 600;">${value}</span>`;
		}

		if (column.fieldname === "row_type" && data.row_type === "Projection") {
			value = `<span style="font-weight: 700;">${value}</span>`;
		}

		return value;
	}
};

function get_next_25th_date() {
	const today = frappe.datetime.str_to_obj(frappe.datetime.get_today());

	let year = today.getFullYear();
	let month = today.getMonth();

	if (today.getDate() > 25) {
		month += 1;
	}

	const next_25th = new Date(year, month, 25);

	return frappe.datetime.obj_to_str(next_25th);
}
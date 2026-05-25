// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.ui.form.on("Personal Finance Electricity Meter Reading", {
	setup(frm) {
		frm.set_query("amended_from", () => {
			return {
				filters: {
					docstatus: 1
				}
			};
		});

		frm.set_query("applicable_electricity_cost", () => {
			return {
				filters: {
					docstatus: 1
				}
			};
		});
	},

	onload(frm) {
		frm.trigger("set_default_applicable_electricity_cost");
	},

	refresh(frm) {
		frm.trigger("set_default_applicable_electricity_cost");
	},

	set_default_applicable_electricity_cost(frm) {
		// Only default this when creating a new record.
		// Once saved, never change it automatically.
		// Also do not override the user's manual selection.
		if (!frm.is_new()) {
			return;
		}

		if (frm.doc.applicable_electricity_cost) {
			return;
		}

		frappe.call({
			method: "personal_finance.personal_finance.doctype.personal_finance_electricity_meter_reading.personal_finance_electricity_meter_reading.get_latest_electricity_cost",
			callback(r) {
				if (!r.message) {
					return;
				}

				// Check again in case the user selected a value while the call was running.
				if (frm.is_new() && !frm.doc.applicable_electricity_cost) {
					frm.set_value("applicable_electricity_cost", r.message);
				}
			}
		});
	},

	validate(frm) {
		if (!frm.doc.address) {
			frappe.throw(__("Please select an Address."));
		}

		if (!frm.doc.reading_datetime) {
			frappe.throw(__("Please enter the Date and Time of Reading."));
		}

		if (frm.doc.reading === undefined || frm.doc.reading === null || frm.doc.reading === "") {
			frappe.throw(__("Please enter the meter Reading."));
		}

		if (flt(frm.doc.reading) < 0) {
			frappe.throw(__("Reading cannot be negative."));
		}

		if (!frm.doc.applicable_electricity_cost) {
			frappe.throw(__("Please select the Applicable Electricity Cost."));
		}
	}
});
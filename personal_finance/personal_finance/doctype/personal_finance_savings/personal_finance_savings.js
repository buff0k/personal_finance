// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.ui.form.on("Personal Finance Savings", {
    onload(frm) {
        frm.trigger("calculate_total_savings");
    },

    refresh(frm) {
        frm.trigger("calculate_total_savings");
    },

    before_save(frm) {
        frm.trigger("calculate_total_savings");
    },

    calculate_total_savings(frm) {
        let total = 0;

        (frm.doc.savings_list || []).forEach((row) => {
            const asset_value = flt(row.asset_value);

            if (asset_value < 0) {
                frappe.model.set_value(
                    row.doctype,
                    row.name,
                    "asset_value",
                    0
                );
            } else {
                total += asset_value;
            }
        });

        frm.set_value("total", total);
    },
});


frappe.ui.form.on("Personal Finance Savings Table", {
    asset_value(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (flt(row.asset_value) < 0) {
            frappe.model.set_value(cdt, cdn, "asset_value", 0);

            frappe.msgprint({
                title: __("Invalid Savings Value"),
                message: __("Savings values cannot be negative. The value has been reset to 0."),
                indicator: "orange",
            });

            return;
        }

        frm.trigger("calculate_total_savings");
    },

    savings_list_add(frm, cdt, cdn) {
        frm.trigger("calculate_total_savings");
    },

    savings_list_remove(frm, cdt, cdn) {
        frm.trigger("calculate_total_savings");
    },
});
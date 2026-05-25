// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.ui.form.on("Personal Finance Debts", {
    onload(frm) {
        frm.trigger("calculate_total_debts");
    },

    refresh(frm) {
        frm.trigger("calculate_total_debts");
    },

    before_save(frm) {
        frm.trigger("calculate_total_debts");
    },

    calculate_total_debts(frm) {
        let total = 0;

        (frm.doc.debts || []).forEach((row) => {
            total += flt(row.current_value);
        });

        frm.set_value("total", total);
    },
});


frappe.ui.form.on("Personal Finance Debt Table", {
    current_value(frm, cdt, cdn) {
        frm.trigger("calculate_total_debts");
    },

    debts_add(frm, cdt, cdn) {
        frm.trigger("calculate_total_debts");
    },

    debts_remove(frm, cdt, cdn) {
        frm.trigger("calculate_total_debts");
    },
});
// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

const PERSONAL_FINANCE_MONTHLY_BUDGET_METHOD =
    "personal_finance.personal_finance.doctype.personal_finance_monthly_budget.personal_finance_monthly_budget";


const PersonalFinanceMonthlyBudgetPayments = {
    make_payment(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (!row) {
            return;
        }

        if (row.payment_made) {
            frappe.msgprint({
                title: __("Payment Already Made"),
                message: __("This payment has already been processed and cannot be processed again."),
                indicator: "orange",
            });
            return;
        }

        if (!row.expense_item) {
            frappe.msgprint({
                title: __("Missing Expense Item"),
                message: __("Please select an Expense Item before making payment."),
                indicator: "orange",
            });
            return;
        }

        const row_idx = row.idx;

        if (frm.is_new() || frm.is_dirty()) {
            frappe.show_alert({
                message: __("Saving budget before processing payment..."),
                indicator: "blue",
            });

            frm.save().then(() => {
                PersonalFinanceMonthlyBudgetPayments.continue_payment(frm, row_idx);
            });

            return;
        }

        PersonalFinanceMonthlyBudgetPayments.continue_payment(frm, row_idx);
    },

    continue_payment(frm, row_idx) {
        const row = (frm.doc.expenses || []).find((expense_row) => {
            return cint(expense_row.idx) === cint(row_idx);
        });

        if (!row) {
            frappe.msgprint({
                title: __("Missing Expense Row"),
                message: __("Could not find the selected expense row after saving."),
                indicator: "red",
            });
            return;
        }

        if (row.payment_made) {
            frappe.msgprint({
                title: __("Payment Already Made"),
                message: __("This payment has already been processed and cannot be processed again."),
                indicator: "orange",
            });
            return;
        }

        frappe.call({
            method: `${PERSONAL_FINANCE_MONTHLY_BUDGET_METHOD}.get_expense_payment_context`,
            args: {
                expense_item: row.expense_item,
            },
            freeze: true,
            freeze_message: __("Checking linked item..."),
            callback(response) {
                const context = response.message || {};

                PersonalFinanceMonthlyBudgetPayments.show_payment_dialog(
                    frm,
                    row,
                    context
                );
            },
        });
    },

    show_payment_dialog(frm, row, context) {
        const is_debt_item = cint(context.is_debt_item);
        const is_savings_item = cint(context.is_savings_item);
        const requires_credit_amount = is_debt_item || is_savings_item;

        let title = __("Process Payment");
        let amount_label = __("Credit Amount");

        if (is_debt_item) {
            title = __("Process Debt Payment");
            amount_label = __("Amount to credit against this debt");
        }

        if (is_savings_item) {
            title = __("Process Savings Payment");
            amount_label = __("Amount to add to this savings item");
        }

        const fields = [
            {
                fieldname: "payment_date",
                fieldtype: "Date",
                label: __("Payment Date"),
                reqd: 1,
                default: frappe.datetime.get_today(),
            },
        ];

        if (requires_credit_amount) {
            fields.push({
                fieldname: "credit_amount",
                fieldtype: "Currency",
                label: amount_label,
                reqd: 1,
                default: flt(row.expense_amount),
            });
        }

        const dialog = new frappe.ui.Dialog({
            title: title,
            fields: fields,
            primary_action_label: __("Process Payment"),
            primary_action(values) {
                if (!values.payment_date) {
                    frappe.msgprint({
                        title: __("Missing Payment Date"),
                        message: __("Please select a payment date."),
                        indicator: "red",
                    });
                    return;
                }

                let credit_amount = 0;

                if (requires_credit_amount) {
                    credit_amount = flt(values.credit_amount);

                    if (credit_amount <= 0) {
                        frappe.msgprint({
                            title: __("Invalid Amount"),
                            message: __("Credit amount must be greater than zero."),
                            indicator: "red",
                        });
                        return;
                    }
                }

                dialog.hide();

                PersonalFinanceMonthlyBudgetPayments.process_payment(frm, row, {
                    payment_date: values.payment_date,
                    credit_amount: credit_amount,
                });
            },
        });

        dialog.show();
    },

    process_payment(frm, row, values) {
        frappe.call({
            method: `${PERSONAL_FINANCE_MONTHLY_BUDGET_METHOD}.process_expense_payment`,
            args: {
                budget_name: frm.doc.name,
                expense_row_name: row.name,
                expense_row_idx: row.idx,
                payment_date: values.payment_date,
                credit_amount: values.credit_amount || 0,
            },
            freeze: true,
            freeze_message: __("Processing payment..."),
            callback(response) {
                const result = response.message || {};

                frappe.show_alert({
                    message: result.message || __("Payment processed."),
                    indicator: "green",
                });

                frm.reload_doc();
            },
        });
    },
};


frappe.ui.form.on("Personal Finance Monthly Budget", {
    setup(frm) {
        frm.month_map = {
            "January": 1,
            "February": 2,
            "March": 3,
            "April": 4,
            "May": 5,
            "June": 6,
            "July": 7,
            "August": 8,
            "September": 9,
            "October": 10,
            "November": 11,
            "December": 12,
        };
    },

    onload(frm) {
        frm.trigger("schedule_total_recalculation");
    },

    refresh(frm) {
        frm.trigger("set_period_field_properties");

        if (frm.is_new() && !frm.__new_budget_defaults_loaded) {
            frm.trigger("load_new_budget_defaults");
        }

        frm.trigger("set_period_preview");
        frm.trigger("schedule_total_recalculation");
    },

    before_save(frm) {
        frm.trigger("schedule_total_recalculation");
    },

    year(frm) {
        frm.trigger("set_period_preview");
    },

    month(frm) {
        frm.trigger("set_period_preview");
    },

    current_bank_balance(frm) {
        frm.trigger("schedule_total_recalculation");
    },

    set_period_field_properties(frm) {
        const readonly_fields = [
            "month_number",
            "period",
            "assets",
            "savings",
            "debts",
            "total_income",
            "gross_payroll_income",
            "nett_payroll_income",
            "nett_income",
            "total_expenses",
            "available_balance",
            "total_assets",
            "total_debts",
        ];

        readonly_fields.forEach((fieldname) => {
            if (frm.fields_dict[fieldname]) {
                frm.set_df_property(fieldname, "read_only", 1);
            }
        });
    },

    load_new_budget_defaults(frm) {
        frm.__new_budget_defaults_loaded = true;

        frappe.call({
            method: `${PERSONAL_FINANCE_MONTHLY_BUDGET_METHOD}.get_new_budget_defaults`,
            callback(response) {
                const defaults = response.message;

                if (!defaults) {
                    return;
                }

                if (!frm.doc.year) {
                    frm.set_value("year", defaults.year);
                }

                if (!frm.doc.month) {
                    frm.set_value("month", defaults.month);
                }

                frm.set_value("month_number", defaults.month_number);
                frm.set_value("period", defaults.period);

                if (!(frm.doc.income || []).length) {
                    frm.trigger("load_income_snapshot", defaults.income || []);
                }

                if (!(frm.doc.expenses || []).length) {
                    frm.trigger("load_expenses_snapshot", defaults.expenses || []);
                }

                if (!(frm.doc.assets || []).length) {
                    frm.trigger("load_assets_snapshot", defaults.assets || []);
                }

                if (!(frm.doc.savings || []).length) {
                    frm.trigger("load_savings_snapshot", defaults.savings || []);
                }

                if (!(frm.doc.debts || []).length) {
                    frm.trigger("load_debts_snapshot", defaults.debts || []);
                }

                frm.trigger("schedule_total_recalculation");
            },
        });
    },

    set_period_preview(frm) {
        if (!frm.doc.year || !frm.doc.month) {
            frm.set_value("month_number", null);
            frm.set_value("period", null);
            return;
        }

        const month_number = frm.month_map[frm.doc.month];

        if (!month_number) {
            frm.set_value("month_number", null);
            frm.set_value("period", null);
            return;
        }

        const year = cint(frm.doc.year);

        frm.set_value("month_number", month_number);
        frm.set_value("period", `${year} - ${frm.doc.month}`);
    },

    schedule_total_recalculation(frm) {
        clearTimeout(frm.__total_recalculation_timer);

        frm.__total_recalculation_timer = setTimeout(() => {
            frm.trigger("calculate_totals");
        }, 250);
    },

    calculate_totals(frm) {
        frappe.call({
            method: `${PERSONAL_FINANCE_MONTHLY_BUDGET_METHOD}.calculate_budget_totals`,
            args: {
                doc: frm.doc,
            },
            callback(response) {
                const totals = response.message;

                if (!totals) {
                    return;
                }

                const fields = [
                    "total_income",
                    "gross_payroll_income",
                    "nett_payroll_income",
                    "nett_income",
                    "total_expenses",
                    "available_balance",
                    "total_assets",
                    "total_debts",
                ];

                fields.forEach((fieldname) => {
                    if (frm.fields_dict[fieldname]) {
                        const new_value = flt(totals[fieldname]);
                        const old_value = flt(frm.doc[fieldname]);

                        if (old_value !== new_value) {
                            frm.doc[fieldname] = new_value;
                            frm.refresh_field(fieldname);
                        }
                    }
                });
            },
        });
    },

    load_income_snapshot(frm, rows) {
        frm.clear_table("income");

        rows.forEach((source_row) => {
            const row = frm.add_child("income");

            row.income_item = source_row.income_item;
            row.income_amount = source_row.income_amount;
            row.income_date = source_row.income_date;
        });

        frm.refresh_field("income");
    },

    load_expenses_snapshot(frm, rows) {
        frm.clear_table("expenses");

        rows.forEach((source_row) => {
            const row = frm.add_child("expenses");

            row.expense_item = source_row.expense_item;
            row.expense_amount = source_row.expense_amount;
            row.payment_date = source_row.payment_date;

            // Do not carry payment completion details into the new month.
            row.payment_actual_date = null;
            row.payment_made = 0;
        });

        frm.refresh_field("expenses");
    },

    load_assets_snapshot(frm, rows) {
        frm.clear_table("assets");

        rows.forEach((source_row) => {
            const row = frm.add_child("assets");

            row.asset_item = source_row.asset_item;
            row.asset_value = source_row.asset_value;
            row.date_asset_aqcuired = source_row.date_asset_aqcuired;
        });

        frm.refresh_field("assets");
    },

    load_savings_snapshot(frm, rows) {
        frm.clear_table("savings");

        rows.forEach((source_row) => {
            const row = frm.add_child("savings");

            row.asset_item = source_row.asset_item;
            row.asset_value = source_row.asset_value;
            row.updated_by = source_row.updated_by;
        });

        frm.refresh_field("savings");
    },

    load_debts_snapshot(frm, rows) {
        frm.clear_table("debts");

        rows.forEach((source_row) => {
            const row = frm.add_child("debts");

            row.debt_item = source_row.debt_item;
            row.current_value = source_row.current_value;
            row.update_budget = source_row.update_budget;
            row.inception_date = source_row.inception_date;
            row.completion_date = source_row.completion_date;
        });

        frm.refresh_field("debts");
    },
});


frappe.ui.form.on("Personal Finance Income Table", {
    income_item(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
    },

    income_amount(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
    },

    income_date(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
    },

    income_add(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
    },

    income_remove(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
    },
});


frappe.ui.form.on("Personal Finance Expense Table", {
    expense_item(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
    },

    expense_amount(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
    },

    payment_date(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
    },

    payment_made(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
    },

    expenses_add(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
    },

    expenses_remove(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
    },

    make_payment(frm, cdt, cdn) {
        PersonalFinanceMonthlyBudgetPayments.make_payment(frm, cdt, cdn);
    },
});
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
        frm.trigger("render_payment_calendar");
    },

    before_save(frm) {
        frm.trigger("schedule_total_recalculation");
    },

    year(frm) {
        frm.trigger("set_period_preview");
        frm.trigger("render_payment_calendar");
    },

    month(frm) {
        frm.trigger("set_period_preview");
        frm.trigger("render_payment_calendar");
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
            "outstanding_expenses",
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
                frm.trigger("render_payment_calendar");
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
                    "outstanding_expenses",
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

                frm.trigger("render_payment_calendar");
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
        frm.trigger("render_payment_calendar");
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

    render_payment_calendar(frm) {
        const field = frm.fields_dict.payment_calendar;

        if (!field || !field.$wrapper) {
            return;
        }

        frm.trigger("add_payment_calendar_styles");

        if (!frm.doc.year || !frm.doc.month_number) {
            field.$wrapper.html(`
                <div class="pf-payment-calendar-empty">
                    ${__("Select a year and month to show the payment calendar.")}
                </div>
            `);
            return;
        }

        const year = cint(frm.doc.year);
        const month_number = cint(frm.doc.month_number);
        const month_name = frm.doc.month || "";
        const days_in_month = new Date(year, month_number, 0).getDate();

        const first_day = new Date(year, month_number - 1, 1);
        const start_offset = (first_day.getDay() + 6) % 7; // Monday-first calendar

        const expenses_by_day = {};
        let month_total = 0;
        let outstanding_total = 0;
        let paid_total = 0;

        (frm.doc.expenses || []).forEach((row) => {
            if (!row.payment_date) {
                return;
            }

            const date_obj = frappe.datetime.str_to_obj(row.payment_date);

            if (!date_obj) {
                return;
            }

            const row_year = date_obj.getFullYear();
            const row_month = date_obj.getMonth() + 1;

            if (row_year !== year || row_month !== month_number) {
                return;
            }

            const day = date_obj.getDate();
            const amount = flt(row.expense_amount);

            if (!expenses_by_day[day]) {
                expenses_by_day[day] = [];
            }

            expenses_by_day[day].push({
                item: row.expense_item || __("Unspecified"),
                amount: amount,
                payment_made: cint(row.payment_made),
                payment_actual_date: row.payment_actual_date,
            });

            month_total += amount;

            if (row.payment_made) {
                paid_total += amount;
            } else {
                outstanding_total += amount;
            }
        });

        let html = `
            <div class="pf-payment-calendar">
                <div class="pf-payment-calendar-header">
                    <div>
                        <div class="pf-payment-calendar-title">${month_name} ${year}</div>
                        <div class="pf-payment-calendar-subtitle">
                            ${__("Expected payments based on the Expenses table")}
                        </div>
                    </div>

                    <div class="pf-payment-calendar-totals">
                        <div><span>${__("Scheduled")}</span><strong>${format_currency(month_total)}</strong></div>
                        <div><span>${__("Paid")}</span><strong>${format_currency(paid_total)}</strong></div>
                        <div><span>${__("Outstanding")}</span><strong>${format_currency(outstanding_total)}</strong></div>
                    </div>
                </div>

                <div class="pf-payment-calendar-grid pf-payment-calendar-weekdays">
                    <div>${__("Mon")}</div>
                    <div>${__("Tue")}</div>
                    <div>${__("Wed")}</div>
                    <div>${__("Thu")}</div>
                    <div>${__("Fri")}</div>
                    <div>${__("Sat")}</div>
                    <div>${__("Sun")}</div>
                </div>

                <div class="pf-payment-calendar-grid">
        `;

        for (let i = 0; i < start_offset; i++) {
            html += `<div class="pf-payment-calendar-day empty"></div>`;
        }

        for (let day = 1; day <= days_in_month; day++) {
            const rows = expenses_by_day[day] || [];
            const day_total = rows.reduce((total, row) => total + flt(row.amount), 0);

            html += `
                <div class="pf-payment-calendar-day ${rows.length ? "has-payments" : ""}">
                    <div class="pf-payment-calendar-day-number">
                        <span>${day}</span>
                        ${
                            rows.length
                                ? `<strong>${format_currency(day_total)}</strong>`
                                : ""
                        }
                    </div>
            `;

            rows.forEach((row) => {
                html += `
                    <div class="pf-payment-calendar-item ${row.payment_made ? "paid" : "unpaid"}">
                        <div class="pf-payment-calendar-item-main">
                            <span class="pf-payment-calendar-item-label">
                                ${frappe.utils.escape_html(row.item)}
                            </span>
                            <span class="pf-payment-calendar-item-amount">
                                ${format_currency(row.amount)}
                            </span>
                        </div>
                        <div class="pf-payment-calendar-item-status">
                            ${row.payment_made ? __("Paid") : __("Outstanding")}
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
        }

        html += `
                </div>
            </div>
        `;

        field.$wrapper.html(html);
    },

    add_payment_calendar_styles(frm) {
        if ($("#personal-finance-payment-calendar-styles").length) {
            return;
        }

        $("<style>")
            .attr("id", "personal-finance-payment-calendar-styles")
            .html(`
                .pf-payment-calendar {
                    margin-top: 12px;
                    background: var(--card-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 14px;
                    padding: 16px;
                    box-shadow: var(--shadow-sm);
                }

                .pf-payment-calendar-header {
                    display: flex;
                    justify-content: space-between;
                    gap: 16px;
                    align-items: flex-start;
                    margin-bottom: 16px;
                    flex-wrap: wrap;
                }

                .pf-payment-calendar-title {
                    font-size: 18px;
                    font-weight: 700;
                }

                .pf-payment-calendar-subtitle {
                    color: var(--text-muted);
                    font-size: 13px;
                    margin-top: 3px;
                }

                .pf-payment-calendar-totals {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                }

                .pf-payment-calendar-totals div {
                    border: 1px solid var(--border-color);
                    background: var(--control-bg);
                    border-radius: 10px;
                    padding: 8px 10px;
                    min-width: 120px;
                }

                .pf-payment-calendar-totals span {
                    display: block;
                    font-size: 11px;
                    color: var(--text-muted);
                    margin-bottom: 2px;
                }

                .pf-payment-calendar-totals strong {
                    font-size: 14px;
                }

                .pf-payment-calendar-grid {
                    display: grid;
                    grid-template-columns: repeat(7, minmax(120px, 1fr));
                    gap: 8px;
                }

                .pf-payment-calendar-weekdays {
                    margin-bottom: 8px;
                }

                .pf-payment-calendar-weekdays div {
                    text-align: center;
                    color: var(--text-muted);
                    font-size: 12px;
                    font-weight: 600;
                }

                .pf-payment-calendar-day {
                    min-height: 112px;
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    padding: 8px;
                    background: var(--control-bg);
                    overflow: hidden;
                }

                .pf-payment-calendar-day.empty {
                    opacity: 0.35;
                    background: transparent;
                }

                .pf-payment-calendar-day.has-payments {
                    background: var(--card-bg);
                }

                .pf-payment-calendar-day-number {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 6px;
                    font-size: 12px;
                    font-weight: 700;
                }

                .pf-payment-calendar-day-number strong {
                    font-size: 11px;
                    color: var(--text-muted);
                    white-space: nowrap;
                }

                .pf-payment-calendar-item {
                    border-radius: 8px;
                    padding: 6px;
                    margin-bottom: 6px;
                    border: 1px solid var(--border-color);
                    background: var(--bg-color);
                }

                .pf-payment-calendar-item.paid {
                    opacity: 0.7;
                }

                .pf-payment-calendar-item.unpaid {
                    border-left: 3px solid var(--orange-500);
                }

                .pf-payment-calendar-item-main {
                    display: flex;
                    justify-content: space-between;
                    gap: 6px;
                    align-items: flex-start;
                }

                .pf-payment-calendar-item-label {
                    font-size: 11px;
                    line-height: 1.25;
                    font-weight: 600;
                    overflow-wrap: anywhere;
                }

                .pf-payment-calendar-item-amount {
                    font-size: 11px;
                    white-space: nowrap;
                    color: var(--text-muted);
                }

                .pf-payment-calendar-item-status {
                    margin-top: 4px;
                    font-size: 10px;
                    color: var(--text-muted);
                }

                .pf-payment-calendar-empty {
                    border: 1px dashed var(--border-color);
                    border-radius: 12px;
                    padding: 18px;
                    color: var(--text-muted);
                    background: var(--control-bg);
                }

                @media (max-width: 1200px) {
                    .pf-payment-calendar-grid {
                        grid-template-columns: repeat(7, minmax(90px, 1fr));
                    }

                    .pf-payment-calendar-day {
                        min-height: 96px;
                    }
                }

                @media (max-width: 900px) {
                    .pf-payment-calendar-grid {
                        display: block;
                    }

                    .pf-payment-calendar-weekdays {
                        display: none;
                    }

                    .pf-payment-calendar-day {
                        margin-bottom: 8px;
                        min-height: auto;
                    }

                    .pf-payment-calendar-day.empty {
                        display: none;
                    }
                }
            `)
            .appendTo("head");
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
        frm.trigger("render_payment_calendar");
    },

    expense_amount(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
        frm.trigger("render_payment_calendar");
    },

    payment_date(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
        frm.trigger("render_payment_calendar");
    },

    payment_actual_date(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
        frm.trigger("render_payment_calendar");
    },

    payment_made(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
        frm.trigger("render_payment_calendar");
    },

    expenses_add(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
        frm.trigger("render_payment_calendar");
    },

    expenses_remove(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
        frm.trigger("render_payment_calendar");
    },

    make_payment(frm, cdt, cdn) {
        PersonalFinanceMonthlyBudgetPayments.make_payment(frm, cdt, cdn);
    },
});
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


const PersonalFinancePaymentRunway = {
    render(frm) {
        const field = frm.fields_dict.payment_calendar;

        if (!field || !field.$wrapper) {
            return;
        }

        this.add_styles();

        const expenses = this.get_expenses(frm);
        const summary = this.get_summary(frm, expenses);
        const grouped = this.group_expenses(expenses, summary.current_balance);

        const html = `
            <div class="pf-runway">
                ${this.get_header_html(summary)}
                ${this.get_runway_bar_html(grouped, summary)}
                ${this.get_payment_pressure_html(grouped, summary)}
                ${this.get_payment_groups_html(grouped)}
            </div>
        `;

        field.$wrapper.html(html);
    },

    get_expenses(frm) {
        const rows = [];

        (frm.doc.expenses || []).forEach((row) => {
            const amount = flt(row.expense_amount);

            if (!amount) {
                return;
            }

            rows.push({
                name: row.name,
                idx: row.idx,
                expense_item: row.expense_item || __("Unspecified"),
                amount: amount,
                payment_date: row.payment_date || null,
                payment_made: cint(row.payment_made),
                payment_actual_date: row.payment_actual_date || null,
            });
        });

        rows.sort((a, b) => {
            if (!a.payment_date && !b.payment_date) {
                return cint(a.idx) - cint(b.idx);
            }

            if (!a.payment_date) {
                return 1;
            }

            if (!b.payment_date) {
                return -1;
            }

            if (a.payment_date === b.payment_date) {
                return cint(a.idx) - cint(b.idx);
            }

            return a.payment_date > b.payment_date ? 1 : -1;
        });

        return rows;
    },

    get_summary(frm, expenses) {
        const current_balance = flt(frm.doc.current_bank_balance);

        const scheduled_total = expenses.reduce((total, row) => {
            return total + flt(row.amount);
        }, 0);

        const paid_total = expenses.reduce((total, row) => {
            return row.payment_made ? total + flt(row.amount) : total;
        }, 0);

        const outstanding_total = expenses.reduce((total, row) => {
            return !row.payment_made ? total + flt(row.amount) : total;
        }, 0);

        const projected_balance = current_balance - outstanding_total;
        const today = frappe.datetime.get_today();

        const overdue_total = expenses.reduce((total, row) => {
            if (!row.payment_made && row.payment_date && row.payment_date < today) {
                return total + flt(row.amount);
            }

            return total;
        }, 0);

        const next_payment = expenses.find((row) => {
            return !row.payment_made && row.payment_date;
        });

        return {
            current_balance: current_balance,
            scheduled_total: scheduled_total,
            paid_total: paid_total,
            outstanding_total: outstanding_total,
            projected_balance: projected_balance,
            overdue_total: overdue_total,
            today: today,
            next_payment_date: next_payment ? next_payment.payment_date : null,
        };
    },

    group_expenses(expenses, starting_balance) {
        const groups_by_date = {};

        expenses.forEach((row) => {
            const key = row.payment_date || "no-date";

            if (!groups_by_date[key]) {
                groups_by_date[key] = {
                    date: row.payment_date,
                    key: key,
                    label: row.payment_date
                        ? frappe.datetime.str_to_user(row.payment_date)
                        : __("No Scheduled Date"),
                    items: [],
                    scheduled_total: 0,
                    paid_total: 0,
                    outstanding_total: 0,
                    projected_balance_after: starting_balance,
                    status: "upcoming",
                };
            }

            groups_by_date[key].items.push(row);
            groups_by_date[key].scheduled_total += flt(row.amount);

            if (row.payment_made) {
                groups_by_date[key].paid_total += flt(row.amount);
            } else {
                groups_by_date[key].outstanding_total += flt(row.amount);
            }
        });

        const groups = Object.values(groups_by_date);

        groups.sort((a, b) => {
            if (a.key === "no-date" && b.key === "no-date") {
                return 0;
            }

            if (a.key === "no-date") {
                return 1;
            }

            if (b.key === "no-date") {
                return -1;
            }

            return a.key > b.key ? 1 : -1;
        });

        let running_balance = flt(starting_balance);
        const today = frappe.datetime.get_today();

        groups.forEach((group) => {
            running_balance -= flt(group.outstanding_total);
            group.projected_balance_after = running_balance;

            if (group.outstanding_total <= 0 && group.paid_total > 0) {
                group.status = "paid";
            } else if (!group.date) {
                group.status = "unscheduled";
            } else if (group.date < today) {
                group.status = "overdue";
            } else if (group.date === today) {
                group.status = "today";
            } else {
                group.status = "upcoming";
            }
        });

        return groups;
    },

    get_header_html(summary) {
        const next_payment_label = summary.next_payment_date
            ? frappe.datetime.str_to_user(summary.next_payment_date)
            : __("None");

        const projected_class = summary.projected_balance < 0
            ? "negative"
            : "positive";

        return `
            <div class="pf-runway-header">
                <div>
                    <div class="pf-runway-title">${__("Payment Runway")}</div>
                    <div class="pf-runway-subtitle">
                        ${__("Projected cash position based on unpaid expenses in this budget")}
                    </div>
                </div>

                <div class="pf-runway-summary-grid">
                    <div class="pf-runway-summary-card">
                        <span>${__("Current Balance")}</span>
                        <strong>${format_currency(summary.current_balance)}</strong>
                    </div>

                    <div class="pf-runway-summary-card">
                        <span>${__("Outstanding")}</span>
                        <strong>${format_currency(summary.outstanding_total)}</strong>
                    </div>

                    <div class="pf-runway-summary-card ${projected_class}">
                        <span>${__("Projected Balance")}</span>
                        <strong>${format_currency(summary.projected_balance)}</strong>
                    </div>

                    <div class="pf-runway-summary-card">
                        <span>${__("Next Payment")}</span>
                        <strong>${next_payment_label}</strong>
                    </div>
                </div>
            </div>
        `;
    },

    get_runway_bar_html(groups, summary) {
        const dated_groups = groups.filter((group) => {
            return group.date && group.outstanding_total > 0;
        });

        if (!dated_groups.length) {
            return `
                <div class="pf-runway-empty">
                    ${__("No outstanding scheduled payments to display.")}
                </div>
            `;
        }

        const first_date = frappe.datetime.str_to_obj(dated_groups[0].date);
        const last_date = frappe.datetime.str_to_obj(dated_groups[dated_groups.length - 1].date);

        let range_days = 1;

        if (first_date && last_date) {
            range_days = Math.max(
                1,
                Math.round((last_date - first_date) / (1000 * 60 * 60 * 24))
            );
        }

        const max_day_total = Math.max(
            ...dated_groups.map((group) => flt(group.outstanding_total)),
            1
        );

        const markers = dated_groups.map((group) => {
            const date_obj = frappe.datetime.str_to_obj(group.date);

            let left = 0;

            if (date_obj && first_date) {
                const offset_days = Math.round((date_obj - first_date) / (1000 * 60 * 60 * 24));
                left = minmax((offset_days / range_days) * 100, 0, 100);
            }

            const size = 14 + Math.min(34, (flt(group.outstanding_total) / max_day_total) * 34);

            return `
                <div
                    class="pf-runway-marker ${group.status}"
                    style="left: ${left}%; width: ${size}px; height: ${size}px;"
                    title="${frappe.utils.escape_html(group.label)} · ${format_currency(group.outstanding_total)}"
                >
                    <span></span>
                </div>
            `;
        }).join("");

        const min_balance = Math.min(
            summary.current_balance,
            summary.projected_balance,
            ...dated_groups.map((item) => item.projected_balance_after)
        );

        const max_balance = Math.max(
            summary.current_balance,
            summary.projected_balance,
            ...dated_groups.map((item) => item.projected_balance_after)
        );

        const spread = Math.max(1, max_balance - min_balance);

        const points = dated_groups.map((group, index) => {
            const x = dated_groups.length === 1
                ? 50
                : (index / (dated_groups.length - 1)) * 100;

            const normalized = ((group.projected_balance_after - min_balance) / spread) * 100;
            const y = 90 - minmax(normalized, 10, 80);

            return `${x},${y}`;
        }).join(" ");

        return `
            <div class="pf-runway-visual">
                <div class="pf-runway-line">
                    ${markers}
                </div>

                <svg class="pf-runway-burndown" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline
                        points="${points}"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        vector-effect="non-scaling-stroke"
                    />
                </svg>

                <div class="pf-runway-axis">
                    <span>${frappe.datetime.str_to_user(dated_groups[0].date)}</span>
                    <span>${frappe.datetime.str_to_user(dated_groups[dated_groups.length - 1].date)}</span>
                </div>
            </div>
        `;
    },

    get_payment_pressure_html(groups, summary) {
        const outstanding_groups = groups.filter((group) => {
            return group.outstanding_total > 0;
        });

        const largest_group = outstanding_groups.length
            ? outstanding_groups.reduce((largest, group) => {
                return flt(group.outstanding_total) > flt(largest.outstanding_total)
                    ? group
                    : largest;
            }, outstanding_groups[0])
            : null;

        const overdue_groups = outstanding_groups.filter((group) => {
            return group.status === "overdue";
        });

        const pressure_items = [];

        if (largest_group) {
            pressure_items.push(`
                <div class="pf-pressure-card">
                    <span>${__("Largest Payment Day")}</span>
                    <strong>${largest_group.label}</strong>
                    <em>${format_currency(largest_group.outstanding_total)}</em>
                </div>
            `);
        }

        pressure_items.push(`
            <div class="pf-pressure-card ${summary.overdue_total > 0 ? "danger" : ""}">
                <span>${__("Overdue")}</span>
                <strong>${format_currency(summary.overdue_total)}</strong>
                <em>${overdue_groups.length} ${__("date(s)")}</em>
            </div>
        `);

        pressure_items.push(`
            <div class="pf-pressure-card ${summary.projected_balance < 0 ? "danger" : "good"}">
                <span>${__("Runway Result")}</span>
                <strong>${summary.projected_balance < 0 ? __("Shortfall") : __("Surplus")}</strong>
                <em>${format_currency(summary.projected_balance)}</em>
            </div>
        `);

        return `
            <div class="pf-pressure-grid">
                ${pressure_items.join("")}
            </div>
        `;
    },

    get_payment_groups_html(groups) {
        const outstanding_groups = groups.filter((group) => {
            return group.outstanding_total > 0;
        });

        const paid_groups = groups.filter((group) => {
            return group.outstanding_total <= 0 && group.paid_total > 0;
        });

        let html = `
            <div class="pf-runway-groups">
                <div class="pf-runway-group-section">
                    <div class="pf-runway-section-title">${__("Outstanding Payment Dates")}</div>
        `;

        if (!outstanding_groups.length) {
            html += `
                <div class="pf-runway-empty compact">
                    ${__("No outstanding payments.")}
                </div>
            `;
        } else {
            outstanding_groups.forEach((group) => {
                html += this.get_payment_group_card_html(group);
            });
        }

        html += `
                </div>

                <div class="pf-runway-group-section">
                    <div class="pf-runway-section-title">${__("Paid Payment Dates")}</div>
        `;

        if (!paid_groups.length) {
            html += `
                <div class="pf-runway-empty compact">
                    ${__("No paid payments yet.")}
                </div>
            `;
        } else {
            paid_groups.forEach((group) => {
                html += this.get_payment_group_card_html(group);
            });
        }

        html += `
                </div>
            </div>
        `;

        return html;
    },

    get_payment_group_card_html(group) {
        const balance_html = group.outstanding_total > 0
            ? `
                <div class="pf-group-projected">
                    <span>${__("Projected after")}</span>
                    <strong>${format_currency(group.projected_balance_after)}</strong>
                </div>
            `
            : "";

        const items_html = group.items.map((row) => {
            const status = row.payment_made ? __("Paid") : __("Outstanding");

            return `
                <div class="pf-group-item ${row.payment_made ? "paid" : "outstanding"}">
                    <div class="pf-group-item-main">
                        <span title="${frappe.utils.escape_html(row.expense_item)}">
                            ${frappe.utils.escape_html(row.expense_item)}
                        </span>
                        <strong>${format_currency(row.amount)}</strong>
                    </div>
                    <div class="pf-group-item-meta">
                        ${status}
                        ${
                            row.payment_actual_date
                                ? ` · ${__("Paid on")} ${frappe.datetime.str_to_user(row.payment_actual_date)}`
                                : ""
                        }
                    </div>
                </div>
            `;
        }).join("");

        return `
            <div class="pf-payment-group-card ${group.status}">
                <div class="pf-payment-group-header">
                    <div>
                        <div class="pf-payment-group-date">${group.label}</div>
                        <div class="pf-payment-group-meta">
                            ${group.items.length} ${__("payment(s)")}
                        </div>
                    </div>

                    <div class="pf-payment-group-total">
                        <span>${group.outstanding_total > 0 ? __("Due") : __("Paid")}</span>
                        <strong>
                            ${format_currency(group.outstanding_total > 0 ? group.outstanding_total : group.paid_total)}
                        </strong>
                    </div>

                    ${balance_html}
                </div>

                <div class="pf-payment-group-items">
                    ${items_html}
                </div>
            </div>
        `;
    },

    add_styles() {
        if ($("#personal-finance-payment-runway-styles").length) {
            return;
        }

        $("<style>")
            .attr("id", "personal-finance-payment-runway-styles")
            .html(`
                .pf-runway {
                    margin-top: 12px;
                    background: var(--card-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    padding: 18px;
                    box-shadow: var(--shadow-sm);
                }

                .pf-runway-header {
                    display: flex;
                    justify-content: space-between;
                    gap: 18px;
                    align-items: flex-start;
                    flex-wrap: wrap;
                    margin-bottom: 18px;
                }

                .pf-runway-title {
                    font-size: 20px;
                    font-weight: 800;
                    line-height: 1.2;
                }

                .pf-runway-subtitle {
                    margin-top: 4px;
                    color: var(--text-muted);
                    font-size: 13px;
                }

                .pf-runway-summary-grid {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(150px, 1fr));
                    gap: 10px;
                    flex: 1;
                    min-width: 520px;
                }

                .pf-runway-summary-card {
                    border: 1px solid var(--border-color);
                    background: var(--control-bg);
                    border-radius: 12px;
                    padding: 10px 12px;
                }

                .pf-runway-summary-card span {
                    display: block;
                    color: var(--text-muted);
                    font-size: 11px;
                    margin-bottom: 4px;
                }

                .pf-runway-summary-card strong {
                    display: block;
                    font-size: 16px;
                    font-weight: 800;
                    white-space: nowrap;
                }

                .pf-runway-summary-card.negative strong {
                    color: var(--red-600);
                }

                .pf-runway-summary-card.positive strong {
                    color: var(--green-600);
                }

                .pf-runway-visual {
                    position: relative;
                    border: 1px solid var(--border-color);
                    background: var(--control-bg);
                    border-radius: 16px;
                    padding: 24px 20px 16px;
                    margin-bottom: 16px;
                    min-height: 148px;
                    overflow: hidden;
                }

                .pf-runway-line {
                    position: relative;
                    height: 48px;
                    margin: 8px 20px 6px;
                    border-top: 4px solid var(--border-color);
                }

                .pf-runway-marker {
                    position: absolute;
                    top: -10px;
                    transform: translateX(-50%);
                    border-radius: 999px;
                    background: var(--blue-500);
                    border: 3px solid var(--card-bg);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .pf-runway-marker span {
                    display: block;
                    width: 35%;
                    height: 35%;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.9);
                }

                .pf-runway-marker.overdue {
                    background: var(--red-500);
                }

                .pf-runway-marker.today {
                    background: var(--orange-500);
                }

                .pf-runway-marker.upcoming {
                    background: var(--blue-500);
                }

                .pf-runway-marker.unscheduled {
                    background: var(--gray-500);
                }

                .pf-runway-burndown {
                    width: 100%;
                    height: 62px;
                    color: var(--orange-500);
                    opacity: 0.95;
                    margin-top: -6px;
                }

                .pf-runway-axis {
                    display: flex;
                    justify-content: space-between;
                    color: var(--text-muted);
                    font-size: 11px;
                    padding: 0 4px;
                }

                .pf-pressure-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 12px;
                    margin-bottom: 18px;
                }

                .pf-pressure-card {
                    border: 1px solid var(--border-color);
                    background: var(--control-bg);
                    border-radius: 12px;
                    padding: 12px;
                }

                .pf-pressure-card span {
                    display: block;
                    font-size: 11px;
                    color: var(--text-muted);
                    margin-bottom: 4px;
                }

                .pf-pressure-card strong {
                    display: block;
                    font-size: 15px;
                    font-weight: 800;
                    margin-bottom: 2px;
                }

                .pf-pressure-card em {
                    display: block;
                    font-size: 12px;
                    color: var(--text-muted);
                    font-style: normal;
                }

                .pf-pressure-card.danger {
                    border-left: 4px solid var(--red-500);
                }

                .pf-pressure-card.good {
                    border-left: 4px solid var(--green-500);
                }

                .pf-runway-groups {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 16px;
                }

                .pf-runway-section-title {
                    font-size: 15px;
                    font-weight: 800;
                    margin-bottom: 10px;
                }

                .pf-payment-group-card {
                    border: 1px solid var(--border-color);
                    background: var(--control-bg);
                    border-radius: 14px;
                    padding: 12px;
                    margin-bottom: 12px;
                }

                .pf-payment-group-card.overdue {
                    border-left: 4px solid var(--red-500);
                }

                .pf-payment-group-card.today {
                    border-left: 4px solid var(--orange-500);
                }

                .pf-payment-group-card.upcoming {
                    border-left: 4px solid var(--blue-500);
                }

                .pf-payment-group-card.paid {
                    opacity: 0.78;
                    border-left: 4px solid var(--green-500);
                }

                .pf-payment-group-card.unscheduled {
                    border-left: 4px solid var(--gray-500);
                }

                .pf-payment-group-header {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) auto auto;
                    gap: 12px;
                    align-items: start;
                    margin-bottom: 10px;
                }

                .pf-payment-group-date {
                    font-weight: 800;
                    font-size: 14px;
                }

                .pf-payment-group-meta {
                    color: var(--text-muted);
                    font-size: 11px;
                    margin-top: 2px;
                }

                .pf-payment-group-total,
                .pf-group-projected {
                    text-align: right;
                }

                .pf-payment-group-total span,
                .pf-group-projected span {
                    display: block;
                    color: var(--text-muted);
                    font-size: 10px;
                    margin-bottom: 2px;
                }

                .pf-payment-group-total strong,
                .pf-group-projected strong {
                    font-size: 13px;
                    white-space: nowrap;
                }

                .pf-payment-group-items {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .pf-group-item {
                    background: var(--card-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    padding: 8px;
                }

                .pf-group-item.outstanding {
                    border-left: 3px solid var(--orange-500);
                }

                .pf-group-item.paid {
                    opacity: 0.75;
                    border-left: 3px solid var(--green-500);
                }

                .pf-group-item-main {
                    display: flex;
                    justify-content: space-between;
                    gap: 10px;
                    align-items: flex-start;
                }

                .pf-group-item-main span {
                    font-size: 12px;
                    font-weight: 700;
                    line-height: 1.25;
                    overflow-wrap: anywhere;
                }

                .pf-group-item-main strong {
                    font-size: 12px;
                    white-space: nowrap;
                }

                .pf-group-item-meta {
                    margin-top: 4px;
                    font-size: 11px;
                    color: var(--text-muted);
                }

                .pf-runway-empty {
                    border: 1px dashed var(--border-color);
                    background: var(--control-bg);
                    border-radius: 14px;
                    padding: 18px;
                    color: var(--text-muted);
                    text-align: center;
                    margin-bottom: 16px;
                }

                .pf-runway-empty.compact {
                    padding: 12px;
                    text-align: left;
                }

                @media (max-width: 1100px) {
                    .pf-runway-summary-grid {
                        grid-template-columns: repeat(2, minmax(150px, 1fr));
                        min-width: 100%;
                    }

                    .pf-runway-groups {
                        grid-template-columns: 1fr;
                    }
                }

                @media (max-width: 720px) {
                    .pf-runway-summary-grid {
                        grid-template-columns: 1fr;
                    }

                    .pf-payment-group-header {
                        grid-template-columns: 1fr;
                    }

                    .pf-payment-group-total,
                    .pf-group-projected {
                        text-align: left;
                    }

                    .pf-group-item-main {
                        display: block;
                    }

                    .pf-group-item-main strong {
                        display: block;
                        margin-top: 4px;
                    }
                }
            `)
            .appendTo("head");
    },
};


function minmax(value, min, max) {
    return Math.min(max, Math.max(min, value));
}


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
        frm.trigger("render_payment_runway");
    },

    before_save(frm) {
        frm.trigger("schedule_total_recalculation");
    },

    year(frm) {
        frm.trigger("set_period_preview");
        frm.trigger("render_payment_runway");
    },

    month(frm) {
        frm.trigger("set_period_preview");
        frm.trigger("render_payment_runway");
    },

    current_bank_balance(frm) {
        frm.trigger("schedule_total_recalculation");
        frm.trigger("render_payment_runway");
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
                frm.trigger("render_payment_runway");
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

                frm.trigger("render_payment_runway");
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

            row.payment_actual_date = null;
            row.payment_made = 0;
        });

        frm.refresh_field("expenses");
        frm.trigger("render_payment_runway");
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

    render_payment_runway(frm) {
        PersonalFinancePaymentRunway.render(frm);
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
        frm.trigger("render_payment_runway");
    },

    expense_amount(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
        frm.trigger("render_payment_runway");
    },

    payment_date(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
        frm.trigger("render_payment_runway");
    },

    payment_actual_date(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
        frm.trigger("render_payment_runway");
    },

    payment_made(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
        frm.trigger("render_payment_runway");
    },

    expenses_add(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
        frm.trigger("render_payment_runway");
    },

    expenses_remove(frm, cdt, cdn) {
        frm.trigger("schedule_total_recalculation");
        frm.trigger("render_payment_runway");
    },

    make_payment(frm, cdt, cdn) {
        PersonalFinanceMonthlyBudgetPayments.make_payment(frm, cdt, cdn);
    },
});
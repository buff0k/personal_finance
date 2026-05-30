// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

const PERSONAL_FINANCE_DASHBOARD_METHOD =
    "personal_finance.personal_finance.page.personal_finance_das.personal_finance_das";


frappe.pages["personal-finance-das"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Personal Finance Dashboard"),
        single_column: true,
    });

    const dashboard = new PersonalFinanceDashboard(page);
    dashboard.make();
};


class PersonalFinanceDashboard {
    constructor(page) {
        this.page = page;
        this.wrapper = $(page.body);
        this.months = 12;
        this.charts = {};
    }

    make() {
        this.add_styles();
        this.make_toolbar();
        this.make_layout();
        this.load();
    }

    make_toolbar() {
        this.page.set_primary_action(__("Refresh"), () => {
            this.load();
        });

        this.page.add_field({
            label: __("Period"),
            fieldtype: "Select",
            fieldname: "period",
            options: [
                { label: __("Last 3 Months"), value: "3" },
                { label: __("Last 6 Months"), value: "6" },
                { label: __("Last 12 Months"), value: "12" },
                { label: __("Last 24 Months"), value: "24" },
            ],
            default: "12",
            change: () => {
                const value = this.page.fields_dict.period.get_value();
                this.months = cint(value || 12);
                this.load();
            },
        });
    }

    make_layout() {
        this.wrapper.html(`
            <div class="pf-dashboard">
                <div class="pf-dashboard-status text-muted">
                    ${__("Loading dashboard...")}
                </div>

                <div class="pf-card-grid">
                    <div class="pf-summary-card">
                        <div class="pf-card-label">${__("Total Assets")}</div>
                        <div class="pf-card-value" data-field="total_assets">-</div>
                    </div>

                    <div class="pf-summary-card">
                        <div class="pf-card-label">${__("Total Savings")}</div>
                        <div class="pf-card-value" data-field="total_savings">-</div>
                    </div>

                    <div class="pf-summary-card">
                        <div class="pf-card-label">${__("Asset Portfolio")}</div>
                        <div class="pf-card-value" data-field="asset_portfolio">-</div>
                    </div>

                    <div class="pf-summary-card">
                        <div class="pf-card-label">${__("Total Debts")}</div>
                        <div class="pf-card-value" data-field="total_debts">-</div>
                    </div>

                    <div class="pf-summary-card">
                        <div class="pf-card-label">${__("Net Worth")}</div>
                        <div class="pf-card-value" data-field="net_worth">-</div>
                    </div>

                    <div class="pf-summary-card">
                        <div class="pf-card-label">${__("Debt to Asset Portfolio")}</div>
                        <div class="pf-card-value" data-field="debt_to_asset_ratio">-</div>
                    </div>

                    <div class="pf-summary-card">
                        <div class="pf-card-label">${__("Latest Budget")}</div>
                        <div class="pf-card-value small" data-field="latest_budget">-</div>
                    </div>
                </div>

                <div class="pf-section">
                    <div class="pf-section-title">${__("Current Position")}</div>

                    <div class="pf-chart-grid">
                        <div class="pf-chart-card">
                            <div class="pf-chart-title">${__("Asset Breakdown")}</div>
                            <div id="pf-asset-breakdown" class="pf-chart"></div>
                        </div>

                        <div class="pf-chart-card">
                            <div class="pf-chart-title">${__("Savings Breakdown")}</div>
                            <div id="pf-savings-breakdown" class="pf-chart"></div>
                        </div>

                        <div class="pf-chart-card">
                            <div class="pf-chart-title">${__("Debt Breakdown")}</div>
                            <div id="pf-debt-breakdown" class="pf-chart"></div>
                        </div>
                    </div>
                </div>

                <div class="pf-section">
                    <div class="pf-section-title">${__("Latest Monthly Budget")}</div>

                    <div class="pf-chart-grid two-column">
                        <div class="pf-chart-card">
                            <div class="pf-chart-title">${__("Income Breakdown")}</div>
                            <div id="pf-income-breakdown" class="pf-chart"></div>
                        </div>

                        <div class="pf-chart-card">
                            <div class="pf-chart-title">${__("Expense Breakdown")}</div>
                            <div id="pf-expense-breakdown" class="pf-chart"></div>
                        </div>
                    </div>
                </div>

                <div class="pf-section">
                    <div class="pf-section-title">${__("Trends")}</div>

                    <div class="pf-wide-chart-card">
                        <div class="pf-chart-title">${__("Income vs Expenses")}</div>
                        <div id="pf-income-expense-trend" class="pf-wide-chart"></div>
                    </div>

                    <div class="pf-wide-chart-card">
                        <div class="pf-chart-title">${__("Income Trend")}</div>
                        <div id="pf-income-trend" class="pf-wide-chart"></div>
                    </div>

                    <div class="pf-wide-chart-card">
                        <div class="pf-chart-title">${__("Available Balance Trend")}</div>
                        <div id="pf-available-balance-trend" class="pf-wide-chart"></div>
                    </div>
                </div>
            </div>
        `);
    }

    load() {
        this.set_status(__("Loading dashboard..."));

        frappe.call({
            method: `${PERSONAL_FINANCE_DASHBOARD_METHOD}.get_dashboard_data`,
            args: {
                months: this.months,
            },
            freeze: false,
            callback: (response) => {
                const data = response.message || {};

                this.data = data;
                this.render(data);
                this.set_status("");
            },
        });
    }

    render(data) {
        this.render_summary(data.summary || {});
        this.render_breakdown_charts(data.breakdowns || {});
        this.render_trend_charts(data.trends || {});
    }

    render_summary(summary) {
        this.set_summary_value("total_assets", this.format_currency(summary.total_assets));
        this.set_summary_value("total_savings", this.format_currency(summary.total_savings));
        this.set_summary_value("asset_portfolio", this.format_currency(summary.asset_portfolio));
        this.set_summary_value("total_debts", this.format_currency(summary.total_debts));
        this.set_summary_value("net_worth", this.format_currency(summary.net_worth));

        this.set_summary_value(
            "debt_to_asset_ratio",
            `${format_number(flt(summary.debt_to_asset_ratio), null, 2)}%`
        );

        const latest_budget = summary.latest_budget;

        if (latest_budget && latest_budget.name) {
            const label = latest_budget.period || latest_budget.name;
            this.set_summary_value(
                "latest_budget",
                `<a href="/app/personal-finance-monthly-budget/${encodeURIComponent(latest_budget.name)}">${frappe.utils.escape_html(label)}</a>`
            );
        } else {
            this.set_summary_value("latest_budget", __("No Budget"));
        }
    }

    set_summary_value(fieldname, value) {
        this.wrapper
            .find(`[data-field="${fieldname}"]`)
            .html(value || "-");
    }

    render_breakdown_charts(breakdowns) {
        this.make_pie_chart(
            "#pf-asset-breakdown",
            breakdowns.assets || [],
            __("No asset data")
        );

        this.make_pie_chart(
            "#pf-savings-breakdown",
            breakdowns.savings || [],
            __("No savings data")
        );

        this.make_pie_chart(
            "#pf-debt-breakdown",
            breakdowns.debts || [],
            __("No debt data")
        );

        this.make_pie_chart(
            "#pf-income-breakdown",
            breakdowns.income || [],
            __("No income data")
        );

        this.make_pie_chart(
            "#pf-expense-breakdown",
            breakdowns.expenses || [],
            __("No expense data")
        );
    }

    render_trend_charts(trends) {
        this.make_axis_chart(
            "#pf-income-expense-trend",
            trends.income_expense || [],
            "period",
            [
                {
                    name: __("Income"),
                    fieldname: "total_income",
                },
                {
                    name: __("Expenses"),
                    fieldname: "total_expenses",
                },
                {
                    name: __("Nett Income"),
                    fieldname: "nett_income",
                },
                {
                    name: __("Outstanding Expenses"),
                    fieldname: "outstanding_expenses",
                },
            ],
            "line",
            __("No income/expense trend data")
        );

        this.make_axis_chart(
            "#pf-income-trend",
            trends.income || [],
            "period",
            [
                {
                    name: __("Total Income"),
                    fieldname: "total_income",
                },
                {
                    name: __("Gross Payroll Income"),
                    fieldname: "gross_payroll_income",
                },
                {
                    name: __("Nett Payroll Income"),
                    fieldname: "nett_payroll_income",
                },
                {
                    name: __("Nett Income"),
                    fieldname: "nett_income",
                },
            ],
            "line",
            __("No income trend data")
        );

        this.make_axis_chart(
            "#pf-available-balance-trend",
            trends.available_balance || [],
            "period",
            [
                {
                    name: __("Current Bank Balance"),
                    fieldname: "current_bank_balance",
                },
                {
                    name: __("Outstanding Expenses"),
                    fieldname: "outstanding_expenses",
                },
                {
                    name: __("Available Balance"),
                    fieldname: "available_balance",
                },
            ],
            "line",
            __("No balance trend data")
        );
    }

    make_pie_chart(selector, rows, empty_message) {
        const container = this.wrapper.find(selector);
        const chart_key = selector.replace("#", "");

        container.empty();

        if (this.charts[chart_key]) {
            delete this.charts[chart_key];
        }

        const clean_rows = this.prepare_pie_rows(rows);

        if (!clean_rows.length) {
            container.html(`<div class="pf-empty">${empty_message}</div>`);
            return;
        }

        const chart_wrapper = $(`
            <div class="pf-pie-wrapper">
                <div class="pf-pie-chart-inner"></div>
                <div class="pf-pie-custom-legend"></div>
            </div>
        `);

        container.append(chart_wrapper);

        const chart_target = chart_wrapper.find(".pf-pie-chart-inner")[0];

        this.charts[chart_key] = new frappe.Chart(chart_target, {
            data: {
                labels: clean_rows.map((row) => this.truncate_label(row.label, 24)),
                datasets: [
                    {
                        values: clean_rows.map((row) => flt(row.value)),
                    },
                ],
            },
            type: "pie",
            height: 250,
            truncateLegends: true,
            colors: this.get_chart_colors(clean_rows.length),
        });

        this.render_pie_legend(chart_wrapper, clean_rows);
    }

    prepare_pie_rows(rows) {
        const combined = {};

        (rows || []).forEach((row) => {
            const label = String(row.label || __("Unspecified")).trim() || __("Unspecified");
            const value = flt(row.value);

            if (!Number.isFinite(value) || value <= 0) {
                return;
            }

            combined[label] = flt(combined[label]) + value;
        });

        return Object.keys(combined)
            .map((label) => {
                return {
                    label: label,
                    value: flt(combined[label]),
                };
            })
            .filter((row) => row.value > 0)
            .sort((a, b) => b.value - a.value);
    }

    render_pie_legend(chart_wrapper, rows) {
        const legend = chart_wrapper.find(".pf-pie-custom-legend");
        const total = rows.reduce((sum, row) => sum + flt(row.value), 0);

        legend.empty();

        rows.forEach((row) => {
            const value = flt(row.value);
            const percentage = total ? (value / total) * 100 : 0;

            legend.append(`
                <div class="pf-pie-legend-row" title="${frappe.utils.escape_html(row.label)}">
                    <div class="pf-pie-legend-label">
                        ${frappe.utils.escape_html(this.truncate_label(row.label, 38))}
                    </div>
                    <div class="pf-pie-legend-value">
                        ${this.format_currency(value)}
                    </div>
                    <div class="pf-pie-legend-percent">
                        ${format_number(percentage, null, 1)}%
                    </div>
                </div>
            `);
        });
    }

    get_chart_colors(required_count) {
        const base_colors = [
            "#7cd6fd",
            "#5e64ff",
            "#743ee2",
            "#ff5858",
            "#ffa00a",
            "#feef72",
            "#28a745",
            "#98d85b",
            "#b554ff",
            "#ff73b3",
            "#6c7680",
            "#36c2cf",
            "#1abc9c",
            "#2ecc71",
            "#3498db",
            "#9b59b6",
            "#34495e",
            "#f1c40f",
            "#e67e22",
            "#e74c3c",
            "#95a5a6",
            "#16a085",
            "#27ae60",
            "#2980b9",
            "#8e44ad",
            "#2c3e50",
            "#f39c12",
            "#d35400",
            "#c0392b",
            "#7f8c8d",
        ];

        const colors = [];

        for (let i = 0; i < required_count; i++) {
            colors.push(base_colors[i % base_colors.length]);
        }

        return colors;
    }

    make_axis_chart(selector, rows, label_field, series, chart_type, empty_message) {
        const container = this.wrapper.find(selector);
        const chart_key = selector.replace("#", "");

        container.empty();

        if (this.charts[chart_key]) {
            delete this.charts[chart_key];
        }

        if (!rows || !rows.length) {
            container.html(`<div class="pf-empty">${empty_message}</div>`);
            return;
        }

        this.charts[chart_key] = new frappe.Chart(container[0], {
            data: {
                labels: rows.map((row) => row[label_field]),
                datasets: series.map((item) => {
                    return {
                        name: item.name,
                        values: rows.map((row) => flt(row[item.fieldname])),
                    };
                }),
            },
            type: chart_type || "line",
            height: 300,
            lineOptions: {
                hideDots: 0,
                heatline: 0,
                regionFill: 1,
            },
            axisOptions: {
                xIsSeries: true,
            },
            tooltipOptions: {
                formatTooltipY: (value) => this.format_currency(value),
            },
        });
    }

    set_status(message) {
        const status = this.wrapper.find(".pf-dashboard-status");

        if (!message) {
            status.hide();
            return;
        }

        status.text(message);
        status.show();
    }

    format_currency(value) {
        return format_currency(flt(value), frappe.defaults.get_default("currency"));
    }

    truncate_label(label, max_length) {
        label = String(label || "");

        if (label.length <= max_length) {
            return label;
        }

        return `${label.slice(0, max_length - 1)}…`;
    }

    add_styles() {
        if ($("#personal-finance-dashboard-styles").length) {
            return;
        }

        $("<style>")
            .attr("id", "personal-finance-dashboard-styles")
            .html(`
                .pf-dashboard {
                    padding: 16px;
                }

                .pf-dashboard-status {
                    margin-bottom: 16px;
                }

                .pf-card-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
                    gap: 16px;
                    margin-bottom: 28px;
                }

                .pf-summary-card {
                    background: var(--card-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 14px;
                    padding: 18px;
                    min-height: 106px;
                    box-shadow: var(--shadow-sm);
                }

                .pf-card-label {
                    color: var(--text-muted);
                    font-size: 13px;
                    margin-bottom: 8px;
                }

                .pf-card-value {
                    font-size: 24px;
                    font-weight: 700;
                    line-height: 1.25;
                }

                .pf-card-value.small {
                    font-size: 16px;
                    font-weight: 600;
                    word-break: break-word;
                }

                .pf-section {
                    margin-top: 28px;
                }

                .pf-section-title {
                    font-size: 18px;
                    font-weight: 700;
                    margin-bottom: 14px;
                }

                .pf-chart-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
                    gap: 16px;
                }

                .pf-chart-grid.two-column {
                    grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
                }

                .pf-chart-card,
                .pf-wide-chart-card {
                    background: var(--card-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 14px;
                    padding: 16px;
                    box-shadow: var(--shadow-sm);
                    margin-bottom: 16px;
                    overflow: hidden;
                }

                .pf-chart-title {
                    font-size: 15px;
                    font-weight: 700;
                    margin-bottom: 12px;
                }

                .pf-chart {
                    min-height: 360px;
                }

                .pf-wide-chart {
                    min-height: 300px;
                }

                .pf-pie-wrapper {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .pf-pie-chart-inner {
                    min-height: 250px;
                }

                .pf-pie-chart-inner .chart-legend {
                    display: none !important;
                }

                .pf-pie-custom-legend {
                    border-top: 1px solid var(--border-color);
                    padding-top: 10px;
                    max-height: 210px;
                    overflow-y: auto;
                }

                .pf-pie-legend-row {
                    display: grid;
                    grid-template-columns: minmax(120px, 1fr) auto auto;
                    gap: 10px;
                    align-items: center;
                    padding: 6px 0;
                    border-bottom: 1px solid var(--border-color);
                    font-size: 12px;
                }

                .pf-pie-legend-row:last-child {
                    border-bottom: none;
                }

                .pf-pie-legend-label {
                    font-weight: 600;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .pf-pie-legend-value {
                    color: var(--text-color);
                    white-space: nowrap;
                    text-align: right;
                    font-variant-numeric: tabular-nums;
                }

                .pf-pie-legend-percent {
                    color: var(--text-muted);
                    white-space: nowrap;
                    text-align: right;
                    font-variant-numeric: tabular-nums;
                    min-width: 48px;
                }

                .pf-empty {
                    color: var(--text-muted);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 220px;
                    border: 1px dashed var(--border-color);
                    border-radius: 10px;
                    background: var(--control-bg);
                }

                @media (max-width: 768px) {
                    .pf-chart-grid,
                    .pf-chart-grid.two-column {
                        grid-template-columns: 1fr;
                    }

                    .pf-pie-legend-row {
                        grid-template-columns: 1fr;
                        gap: 2px;
                    }

                    .pf-pie-legend-value,
                    .pf-pie-legend-percent {
                        text-align: left;
                    }
                }
            `)
            .appendTo("head");
    }
}
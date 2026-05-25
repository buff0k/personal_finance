// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.pages["personal-finance-ele"].on_page_load = function(wrapper) {
	new PersonalFinanceElectricityDashboard(wrapper);
};

class PersonalFinanceElectricityDashboard {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: "Personal Finance Electricity Usage",
			single_column: true
		});

		this.method =
			"personal_finance.personal_finance.page.personal_finance_ele.personal_finance_ele.get_dashboard_data";

		this.charts = {};
		this.make();
	}

	make() {
		this.inject_styles();
		this.make_toolbar();
		this.make_body();
		this.refresh();
	}

	inject_styles() {
		if (document.getElementById("personal-finance-ele-dashboard-style")) {
			return;
		}

		const style = document.createElement("style");
		style.id = "personal-finance-ele-dashboard-style";
		style.innerHTML = `
			.ele-dashboard {
				padding: 16px 4px 32px;
			}

			.ele-hero {
				position: relative;
				overflow: hidden;
				border-radius: 24px;
				padding: 26px;
				margin-bottom: 18px;
				background:
					radial-gradient(circle at top left, rgba(0, 184, 148, 0.25), transparent 28%),
					radial-gradient(circle at bottom right, rgba(9, 132, 227, 0.20), transparent 30%),
					linear-gradient(135deg, var(--bg-color), var(--control-bg));
				border: 1px solid var(--border-color);
				box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
			}

			.ele-hero-title {
				font-size: 28px;
				font-weight: 800;
				letter-spacing: -0.03em;
				margin: 0;
			}

			.ele-hero-subtitle {
				margin-top: 8px;
				color: var(--text-muted);
				max-width: 820px;
				font-size: 14px;
			}

			.ele-grid {
				display: grid;
				gap: 14px;
			}

			.ele-kpi-grid {
				grid-template-columns: repeat(6, minmax(150px, 1fr));
				margin-bottom: 18px;
			}

			.ele-main-grid {
				grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.8fr);
				align-items: stretch;
			}

			.ele-two-grid {
				grid-template-columns: repeat(2, minmax(0, 1fr));
				margin-top: 14px;
			}

			.ele-card {
				background: var(--card-bg);
				border: 1px solid var(--border-color);
				border-radius: 18px;
				padding: 16px;
				box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04);
			}

			.ele-card-title {
				font-size: 13px;
				font-weight: 700;
				color: var(--text-muted);
				text-transform: uppercase;
				letter-spacing: 0.06em;
				margin-bottom: 8px;
			}

			.ele-kpi-value {
				font-size: 26px;
				font-weight: 800;
				letter-spacing: -0.03em;
				line-height: 1.1;
			}

			.ele-kpi-subtitle {
				margin-top: 6px;
				font-size: 12px;
				color: var(--text-muted);
			}

			.ele-good {
				color: var(--green-600);
			}

			.ele-warn {
				color: var(--orange-600);
			}

			.ele-bad {
				color: var(--red-600);
			}

			.ele-chart-card {
				min-height: 370px;
			}

			.ele-chart {
				min-height: 300px;
			}

			.ele-list {
				display: flex;
				flex-direction: column;
				gap: 10px;
			}

			.ele-list-item {
				padding: 12px;
				border-radius: 14px;
				background: var(--control-bg);
				border: 1px solid var(--border-color);
			}

			.ele-list-main {
				display: flex;
				justify-content: space-between;
				gap: 12px;
				align-items: baseline;
			}

			.ele-list-title {
				font-weight: 700;
			}

			.ele-list-meta {
				color: var(--text-muted);
				font-size: 12px;
				margin-top: 4px;
			}

			.ele-pill-row {
				display: flex;
				flex-wrap: wrap;
				gap: 8px;
				margin-top: 14px;
			}

			.ele-pill {
				border-radius: 999px;
				padding: 7px 11px;
				background: var(--control-bg);
				border: 1px solid var(--border-color);
				font-size: 12px;
				color: var(--text-muted);
			}

			.ele-tip {
				display: block;
				text-decoration: none;
				color: inherit;
				padding: 12px;
				border-radius: 14px;
				background: var(--control-bg);
				border: 1px solid var(--border-color);
				transition: transform 0.15s ease, box-shadow 0.15s ease;
			}

			.ele-tip:hover {
				text-decoration: none;
				transform: translateY(-1px);
				box-shadow: 0 8px 18px rgba(0, 0, 0, 0.06);
			}

			.ele-tip-title {
				font-weight: 800;
				margin-bottom: 4px;
			}

			.ele-tip-body {
				color: var(--text-muted);
				font-size: 12px;
				line-height: 1.45;
			}

			.ele-empty {
				padding: 26px;
				border-radius: 18px;
				background: var(--control-bg);
				border: 1px dashed var(--border-color);
				color: var(--text-muted);
				text-align: center;
			}

			.ele-progress-track {
				height: 14px;
				border-radius: 999px;
				background: var(--control-bg);
				overflow: hidden;
				border: 1px solid var(--border-color);
				margin-top: 14px;
			}

			.ele-progress-fill {
				height: 100%;
				border-radius: 999px;
				background: linear-gradient(90deg, var(--green-500), var(--blue-500));
				width: 0%;
				transition: width 0.25s ease;
			}

			@media (max-width: 1200px) {
				.ele-kpi-grid {
					grid-template-columns: repeat(3, minmax(150px, 1fr));
				}

				.ele-main-grid {
					grid-template-columns: 1fr;
				}
			}

			@media (max-width: 760px) {
				.ele-kpi-grid,
				.ele-two-grid {
					grid-template-columns: 1fr;
				}

				.ele-hero-title {
					font-size: 23px;
				}
			}
		`;

		document.head.appendChild(style);
	}

	make_toolbar() {
		this.page.set_primary_action(__("Refresh"), () => this.refresh(), "refresh");

		this.page.add_inner_button(__("Open Usage Report"), () => {
			frappe.set_route("query-report", "Personal Finance Electricity Usage");
		});

		this.address_control = this.make_control({
			fieldname: "address",
			label: __("Address"),
			fieldtype: "Link",
			options: "Address",
			reqd: 1,
			change: () => this.refresh()
		});

		this.from_date_control = this.make_control({
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			change: () => this.refresh()
		});

		this.to_date_control = this.make_control({
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			change: () => this.refresh()
		});

		this.set_date_control = this.make_control({
			fieldname: "set_date",
			label: __("Predict Until"),
			fieldtype: "Date",
			default: this.get_next_25th_date(),
			change: () => this.refresh()
		});
	}

	make_control(df) {
		const field = this.page.add_field(df);

		if (df.default) {
			field.set_value(df.default);
		}

		return field;
	}

	make_body() {
		this.body = $(`<div class="ele-dashboard"></div>`).appendTo(this.page.main);

		this.body.html(`
			<section class="ele-hero">
				<h1 class="ele-hero-title">⚡ Home energy cockpit</h1>
				<div class="ele-hero-subtitle">
					Track your balance, purchases, measured usage, and projected shortfall from your submitted meter readings and electricity purchases.
				</div>
				<div class="ele-pill-row" id="ele-status-pills"></div>
			</section>

			<section class="ele-grid ele-kpi-grid" id="ele-kpis"></section>

			<section class="ele-grid ele-main-grid">
				<div class="ele-card ele-chart-card">
					<div class="ele-card-title">Usage trend</div>
					<div id="ele-usage-chart" class="ele-chart"></div>
				</div>

				<div class="ele-card">
					<div class="ele-card-title">Projection</div>
					<div id="ele-projection"></div>
				</div>
			</section>

			<section class="ele-grid ele-two-grid">
				<div class="ele-card ele-chart-card">
					<div class="ele-card-title">Purchase history</div>
					<div id="ele-purchase-chart" class="ele-chart"></div>
				</div>

				<div class="ele-card">
					<div class="ele-card-title">Energy saving ideas</div>
					<div id="ele-tips" class="ele-list"></div>
				</div>
			</section>

			<section class="ele-grid ele-two-grid">
				<div class="ele-card">
					<div class="ele-card-title">Recent readings</div>
					<div id="ele-recent-readings" class="ele-list"></div>
				</div>

				<div class="ele-card">
					<div class="ele-card-title">Recent purchases</div>
					<div id="ele-recent-purchases" class="ele-list"></div>
				</div>
			</section>
		`);
	}

	refresh() {
		const address = this.address_control.get_value();

		this.set_loading(true);

		frappe.call({
			method: this.method,
			args: {
				address: address || null,
				from_date: this.from_date_control.get_value() || null,
				to_date: this.to_date_control.get_value() || null,
				set_date: this.set_date_control.get_value() || this.get_next_25th_date()
			},
			callback: (r) => {
				const data = r.message || {};
				this.render(data);
			},
			error: () => {
				frappe.msgprint(__("Could not load electricity dashboard data."));
			},
			always: () => {
				this.set_loading(false);
			}
		});
	}

	set_loading(is_loading) {
		if (is_loading) {
			this.body.addClass("opacity-50");
		} else {
			this.body.removeClass("opacity-50");
		}
	}

	render(data) {
		this.data = data || {};

		this.render_status_pills();
		this.render_kpis();
		this.render_projection();
		this.render_usage_chart();
		this.render_purchase_chart();
		this.render_tips();
		this.render_recent_readings();
		this.render_recent_purchases();
	}

	render_status_pills() {
		const filters = this.data.filters || {};
		const stats = this.data.stats || {};
		const message = this.data.message || "";

		const pills = [
			`Address: ${this.escape(filters.address || "Not selected")}`,
			`Readings: ${this.format_number(stats.reading_count || 0, 0)}`,
			`Purchases: ${this.format_number(stats.purchase_count || 0, 0)}`,
			`Prediction: ${this.escape(filters.set_date || "")}`
		];

		if (message) {
			pills.push(this.escape(message));
		}

		this.body.find("#ele-status-pills").html(
			pills.map((pill) => `<span class="ele-pill">${pill}</span>`).join("")
		);
	}

	render_kpis() {
		const stats = this.data.stats || {};

		const projected_balance = flt(stats.projected_balance);
		const shortfall_units = flt(stats.shortfall_units);

		const kpis = [
			{
				title: "Latest balance",
				value: `${this.format_number(stats.latest_balance, 2)} kWh`,
				subtitle: "Latest submitted meter reading",
				class_name: projected_balance >= 0 ? "ele-good" : "ele-warn"
			},
			{
				title: "Average usage",
				value: `${this.format_number(stats.average_kwh_per_day, 2)} kWh/day`,
				subtitle: "Weighted from measured intervals",
				class_name: ""
			},
			{
				title: "Projected balance",
				value: `${this.format_number(projected_balance, 2)} kWh`,
				subtitle: `At ${this.escape(stats.set_date || "")}`,
				class_name: projected_balance >= 0 ? "ele-good" : "ele-bad"
			},
			{
				title: "Shortfall",
				value: `${this.format_number(shortfall_units, 2)} kWh`,
				subtitle: shortfall_units > 0 ? "Top-up likely needed" : "No shortfall projected",
				class_name: shortfall_units > 0 ? "ele-bad" : "ele-good"
			},
			{
				title: "Purchased",
				value: `${this.format_number(stats.total_purchased_units, 2)} kWh`,
				subtitle: "Within selected filter window",
				class_name: ""
			},
			{
				title: "Spend",
				value: this.format_currency(stats.total_purchase_incl),
				subtitle: "Purchase total incl. tax",
				class_name: ""
			}
		];

		this.body.find("#ele-kpis").html(
			kpis.map((kpi) => `
				<div class="ele-card">
					<div class="ele-card-title">${this.escape(kpi.title)}</div>
					<div class="ele-kpi-value ${kpi.class_name}">${kpi.value}</div>
					<div class="ele-kpi-subtitle">${this.escape(kpi.subtitle)}</div>
				</div>
			`).join("")
		);
	}

	render_projection() {
		const projection = this.data.projection || {};
		const latest_balance = flt(projection.latest_balance);
		const projected_usage = flt(projection.projected_usage_to_set_date);
		const projected_balance = flt(projection.projected_balance_at_set_date);
		const shortfall = flt(projection.shortfall_units);

		let usage_percent = 0;

		if (latest_balance > 0) {
			usage_percent = Math.min(100, Math.max(0, projected_usage / latest_balance * 100));
		}

		const balance_class = projected_balance >= 0 ? "ele-good" : "ele-bad";

		this.body.find("#ele-projection").html(`
			<div class="ele-kpi-value ${balance_class}">
				${this.format_number(projected_balance, 2)} kWh
			</div>
			<div class="ele-kpi-subtitle">
				Projected balance at ${this.escape(projection.set_date || "")}
			</div>

			<div class="ele-progress-track">
				<div class="ele-progress-fill" style="width: ${usage_percent}%"></div>
			</div>

			<div class="ele-pill-row">
				<span class="ele-pill">Latest: ${this.format_number(latest_balance, 2)} kWh</span>
				<span class="ele-pill">Projected use: ${this.format_number(projected_usage, 2)} kWh</span>
				<span class="ele-pill">Shortfall: ${this.format_number(shortfall, 2)} kWh</span>
				<span class="ele-pill">Hours left: ${this.format_number(projection.hours_until_set_date, 2)}</span>
			</div>

			<div class="ele-list" style="margin-top: 14px;">
				<div class="ele-list-item">
					<div class="ele-list-main">
						<span class="ele-list-title">Average hourly use</span>
						<strong>${this.format_number(projection.average_kwh_per_hour, 4)} kWh/h</strong>
					</div>
				</div>
				<div class="ele-list-item">
					<div class="ele-list-main">
						<span class="ele-list-title">30-day projection</span>
						<strong>${this.format_number(projection.average_kwh_per_month, 2)} kWh</strong>
					</div>
				</div>
			</div>
		`);
	}

	render_usage_chart() {
		const intervals = this.data.intervals || [];
		const chart_target = "#ele-usage-chart";

		this.body.find(chart_target).empty();

		if (!intervals.length) {
			this.render_empty(chart_target, "Add at least two submitted meter readings to see a usage trend.");
			return;
		}

		const labels = intervals.map((row) => row.to_reading_datetime_display || "");
		const daily_usage = intervals.map((row) => flt(row.kwh_per_day));
		const end_balance = intervals.map((row) => flt(row.end_kwh));

		this.charts.usage = new frappe.Chart(chart_target, {
			title: "",
			data: {
				labels: labels,
				datasets: [
					{
						name: "kWh / Day",
						values: daily_usage
					},
					{
						name: "End kWh",
						values: end_balance
					}
				]
			},
			type: "line",
			height: 300,
			colors: ["#00b894", "#0984e3"],
			axisOptions: {
				xAxisMode: "tick",
				yAxisMode: "tick",
				xIsSeries: true
			},
			lineOptions: {
				regionFill: 1,
				hideDots: 0
			}
		});
	}

	render_purchase_chart() {
		const monthly_purchases = this.data.monthly_purchases || [];
		const chart_target = "#ele-purchase-chart";

		this.body.find(chart_target).empty();

		if (!monthly_purchases.length) {
			this.render_empty(chart_target, "No submitted purchases found yet.");
			return;
		}

		this.charts.purchases = new frappe.Chart(chart_target, {
			title: "",
			data: {
				labels: monthly_purchases.map((row) => row.month),
				datasets: [
					{
						name: "Units",
						values: monthly_purchases.map((row) => flt(row.units))
					},
					{
						name: "Amount Incl.",
						values: monthly_purchases.map((row) => flt(row.amount_incl))
					}
				]
			},
			type: "bar",
			height: 300,
			colors: ["#6c5ce7", "#fdcb6e"]
		});
	}

	render_tips() {
		const tips = this.data.tips || [];

		if (!tips.length) {
			this.body.find("#ele-tips").html(`
				<div class="ele-empty">No tips available yet.</div>
			`);
			return;
		}

		this.body.find("#ele-tips").html(
			tips.map((tip) => `
				<a class="ele-tip" href="${this.escape_attribute(tip.url || "#")}" target="_blank" rel="noopener noreferrer">
					<div class="ele-tip-title">💡 ${this.escape(tip.title || "")}</div>
					<div class="ele-tip-body">${this.escape(tip.body || "")}</div>
				</a>
			`).join("")
		);
	}

	render_recent_readings() {
		const readings = this.data.recent_readings || [];

		if (!readings.length) {
			this.body.find("#ele-recent-readings").html(`
				<div class="ele-empty">No submitted readings found.</div>
			`);
			return;
		}

		this.body.find("#ele-recent-readings").html(
			readings.map((reading) => `
				<div class="ele-list-item">
					<div class="ele-list-main">
						<span class="ele-list-title">${this.escape(reading.reading_datetime_display || "")}</span>
						<strong>${this.format_number(reading.reading, 2)} kWh</strong>
					</div>
					<div class="ele-list-meta">${this.escape(reading.name || "")}</div>
				</div>
			`).join("")
		);
	}

	render_recent_purchases() {
		const purchases = this.data.recent_purchases || [];

		if (!purchases.length) {
			this.body.find("#ele-recent-purchases").html(`
				<div class="ele-empty">No submitted purchases found.</div>
			`);
			return;
		}

		this.body.find("#ele-recent-purchases").html(
			purchases.map((purchase) => `
				<div class="ele-list-item">
					<div class="ele-list-main">
						<span class="ele-list-title">${this.escape(purchase.purchase_date_display || "")}</span>
						<strong>${this.format_currency(purchase.purchase_price_incl)}</strong>
					</div>
					<div class="ele-list-meta">
						${this.format_number(purchase.units, 2)} kWh · ${this.escape(purchase.electricity_cost || "")}
					</div>
				</div>
			`).join("")
		);
	}

	render_empty(selector, message) {
		this.body.find(selector).html(`
			<div class="ele-empty">${this.escape(message)}</div>
		`);
	}

	get_next_25th_date() {
		const today = frappe.datetime.str_to_obj(frappe.datetime.get_today());

		let year = today.getFullYear();
		let month = today.getMonth();

		if (today.getDate() > 25) {
			month += 1;
		}

		const next_25th = new Date(year, month, 25);

		return frappe.datetime.obj_to_str(next_25th);
	}

	format_number(value, precision) {
		return format_number(flt(value || 0), null, precision);
	}

	format_currency(value) {
		return format_currency(flt(value || 0), "ZAR");
	}

	escape(value) {
		if (value === undefined || value === null) {
			return "";
		}

		return String(value)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}

	escape_attribute(value) {
		return this.escape(value).replace(/`/g, "&#096;");
	}
}
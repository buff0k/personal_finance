# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

from datetime import datetime, time

import frappe
from frappe import _
from frappe.utils import add_months, flt, get_datetime, getdate, nowdate


METER_READING_DOCTYPE = "Personal Finance Electricity Meter Reading"
PURCHASE_DOCTYPE = "Personal Finance Electricity Purchase"
PURCHASE_TABLE_DOCTYPE = "Personal Finance Electricity Purchase Table"


def execute(filters: dict | None = None):
	filters = frappe._dict(filters or {})
	normalised_filters = get_normalised_filters(filters)

	columns = get_columns()
	data = get_data(normalised_filters)
	report_summary = get_report_summary(data, normalised_filters)
	chart = get_chart(data)

	return columns, data, None, chart, report_summary


def get_columns() -> list[dict]:
	return [
		{
			"label": _("Type"),
			"fieldname": "row_type",
			"fieldtype": "Data",
			"width": 110,
		},
		{
			"label": _("Message"),
			"fieldname": "message",
			"fieldtype": "Data",
			"width": 260,
		},
		{
			"label": _("From Reading"),
			"fieldname": "from_reading_datetime",
			"fieldtype": "Datetime",
			"width": 170,
		},
		{
			"label": _("To Reading"),
			"fieldname": "to_reading_datetime",
			"fieldtype": "Datetime",
			"width": 170,
		},
		{
			"label": _("Start kWh"),
			"fieldname": "start_kwh",
			"fieldtype": "Float",
			"precision": 2,
			"width": 110,
		},
		{
			"label": _("Purchased kWh"),
			"fieldname": "purchased_kwh",
			"fieldtype": "Float",
			"precision": 2,
			"width": 125,
		},
		{
			"label": _("End kWh"),
			"fieldname": "end_kwh",
			"fieldtype": "Float",
			"precision": 2,
			"width": 110,
		},
		{
			"label": _("Used kWh"),
			"fieldname": "used_kwh",
			"fieldtype": "Float",
			"precision": 2,
			"width": 110,
		},
		{
			"label": _("Hours"),
			"fieldname": "hours",
			"fieldtype": "Float",
			"precision": 2,
			"width": 95,
		},
		{
			"label": _("kWh / Hour"),
			"fieldname": "kwh_per_hour",
			"fieldtype": "Float",
			"precision": 4,
			"width": 115,
		},
		{
			"label": _("kWh / Day"),
			"fieldname": "kwh_per_day",
			"fieldtype": "Float",
			"precision": 2,
			"width": 115,
		},
		{
			"label": _("kWh / Week"),
			"fieldname": "kwh_per_week",
			"fieldtype": "Float",
			"precision": 2,
			"width": 120,
		},
		{
			"label": _("kWh / 30 Day Month"),
			"fieldname": "kwh_per_month",
			"fieldtype": "Float",
			"precision": 2,
			"width": 155,
		},
		{
			"label": _("Prediction Date"),
			"fieldname": "set_date",
			"fieldtype": "Date",
			"width": 125,
		},
		{
			"label": _("Hours Until Prediction Date"),
			"fieldname": "hours_until_set_date",
			"fieldtype": "Float",
			"precision": 2,
			"width": 185,
		},
		{
			"label": _("Projected Usage"),
			"fieldname": "projected_usage_to_set_date",
			"fieldtype": "Float",
			"precision": 2,
			"width": 135,
		},
		{
			"label": _("Projected Balance"),
			"fieldname": "projected_balance_at_set_date",
			"fieldtype": "Float",
			"precision": 2,
			"width": 145,
		},
		{
			"label": _("Shortfall kWh"),
			"fieldname": "shortfall_units",
			"fieldtype": "Float",
			"precision": 2,
			"width": 125,
		},
	]


def get_data(filters) -> list[dict]:
	readings = get_readings(filters)

	if not readings:
		return [
			{
				"row_type": "Message",
				"message": "No submitted meter readings found for this address and filter range.",
			}
		]

	if len(readings) == 1:
		return [
			{
				"row_type": "Message",
				"message": "Only one submitted meter reading found. At least two readings are needed to calculate usage.",
				"to_reading_datetime": readings[0].reading_datetime,
				"end_kwh": readings[0].reading,
			}
		]

	data = []

	for index in range(1, len(readings)):
		previous_reading = readings[index - 1]
		current_reading = readings[index]

		previous_datetime = get_datetime(previous_reading.reading_datetime)
		current_datetime = get_datetime(current_reading.reading_datetime)

		if current_datetime <= previous_datetime:
			continue

		purchased_kwh = get_purchased_units_between(
			address=filters.address,
			from_datetime=previous_datetime,
			to_datetime=current_datetime,
		)

		start_kwh = flt(previous_reading.reading, 2)
		end_kwh = flt(current_reading.reading, 2)

		used_kwh = flt(start_kwh + purchased_kwh - end_kwh, 4)
		hours = flt((current_datetime - previous_datetime).total_seconds() / 3600, 4)

		kwh_per_hour = flt(used_kwh / hours, 6) if hours else 0
		kwh_per_day = flt(kwh_per_hour * 24, 4)
		kwh_per_week = flt(kwh_per_day * 7, 4)
		kwh_per_month = flt(kwh_per_day * 30, 4)

		hours_until_set_date = get_hours_until_set_date(
			current_datetime=current_datetime,
			set_datetime=filters.set_datetime,
		)

		projected_usage_to_set_date = flt(kwh_per_hour * hours_until_set_date, 4)
		projected_balance_at_set_date = flt(end_kwh - projected_usage_to_set_date, 4)
		shortfall_units = flt(max(0, projected_usage_to_set_date - end_kwh), 4)

		data.append(
			{
				"row_type": "Interval",
				"message": "",
				"from_reading_datetime": previous_datetime,
				"to_reading_datetime": current_datetime,
				"start_kwh": start_kwh,
				"purchased_kwh": purchased_kwh,
				"end_kwh": end_kwh,
				"used_kwh": used_kwh,
				"hours": hours,
				"kwh_per_hour": kwh_per_hour,
				"kwh_per_day": kwh_per_day,
				"kwh_per_week": kwh_per_week,
				"kwh_per_month": kwh_per_month,
				"set_date": filters.set_date,
				"hours_until_set_date": hours_until_set_date,
				"projected_usage_to_set_date": projected_usage_to_set_date,
				"projected_balance_at_set_date": projected_balance_at_set_date,
				"shortfall_units": shortfall_units,
			}
		)

	add_projection_row(data, filters)

	return data


def add_projection_row(data: list[dict], filters) -> None:
	if not data:
		return

	interval_rows = [row for row in data if row.get("row_type") == "Interval"]

	if not interval_rows:
		return

	total_used = sum(flt(row.get("used_kwh"), 4) for row in interval_rows)
	total_purchased = sum(flt(row.get("purchased_kwh"), 4) for row in interval_rows)
	total_hours = sum(flt(row.get("hours"), 4) for row in interval_rows)

	if total_hours <= 0:
		return

	latest_row = interval_rows[-1]

	latest_reading_datetime = get_datetime(latest_row.get("to_reading_datetime"))
	latest_balance = flt(latest_row.get("end_kwh"), 4)

	weighted_kwh_per_hour = flt(total_used / total_hours, 6)
	weighted_kwh_per_day = flt(weighted_kwh_per_hour * 24, 4)
	weighted_kwh_per_week = flt(weighted_kwh_per_day * 7, 4)
	weighted_kwh_per_month = flt(weighted_kwh_per_day * 30, 4)

	hours_until_set_date = get_hours_until_set_date(
		current_datetime=latest_reading_datetime,
		set_datetime=filters.set_datetime,
	)

	projected_usage_to_set_date = flt(weighted_kwh_per_hour * hours_until_set_date, 4)
	projected_balance_at_set_date = flt(latest_balance - projected_usage_to_set_date, 4)
	shortfall_units = flt(max(0, projected_usage_to_set_date - latest_balance), 4)

	data.append(
		{
			"row_type": "Projection",
			"message": "Weighted average projection",
			"from_reading_datetime": interval_rows[0].get("from_reading_datetime"),
			"to_reading_datetime": latest_reading_datetime,
			"start_kwh": interval_rows[0].get("start_kwh"),
			"purchased_kwh": total_purchased,
			"end_kwh": latest_balance,
			"used_kwh": total_used,
			"hours": total_hours,
			"kwh_per_hour": weighted_kwh_per_hour,
			"kwh_per_day": weighted_kwh_per_day,
			"kwh_per_week": weighted_kwh_per_week,
			"kwh_per_month": weighted_kwh_per_month,
			"set_date": filters.set_date,
			"hours_until_set_date": hours_until_set_date,
			"projected_usage_to_set_date": projected_usage_to_set_date,
			"projected_balance_at_set_date": projected_balance_at_set_date,
			"shortfall_units": shortfall_units,
		}
	)


def get_report_summary(data: list[dict], filters) -> list[dict]:
	if not data:
		return []

	if data[0].get("row_type") == "Message":
		return [
			{
				"value": data[0].get("message"),
				"label": _("Status"),
				"datatype": "Data",
				"indicator": "Orange",
			}
		]

	projection_row = None

	for row in reversed(data):
		if row.get("row_type") == "Projection":
			projection_row = row
			break

	if not projection_row:
		return []

	shortfall = flt(projection_row.get("shortfall_units"), 2)
	projected_balance = flt(projection_row.get("projected_balance_at_set_date"), 2)

	return [
		{
			"value": flt(projection_row.get("kwh_per_day"), 2),
			"label": _("Average kWh / Day"),
			"datatype": "Float",
			"indicator": "Blue",
		},
		{
			"value": flt(projection_row.get("kwh_per_month"), 2),
			"label": _("Projected 30 Day Usage"),
			"datatype": "Float",
			"indicator": "Blue",
		},
		{
			"value": projected_balance,
			"label": _("Projected Balance on {0}").format(filters.set_date),
			"datatype": "Float",
			"indicator": "Green" if projected_balance >= 0 else "Red",
		},
		{
			"value": shortfall,
			"label": _("Shortfall kWh"),
			"datatype": "Float",
			"indicator": "Red" if shortfall > 0 else "Green",
		},
	]


def get_chart(data: list[dict]) -> dict | None:
	interval_rows = [row for row in data if row.get("row_type") == "Interval"]

	if not interval_rows:
		return None

	labels = [
		str(row.get("to_reading_datetime"))[:16]
		for row in interval_rows
	]

	return {
		"data": {
			"labels": labels,
			"datasets": [
				{
					"name": _("kWh / Day"),
					"values": [
						flt(row.get("kwh_per_day"), 2)
						for row in interval_rows
					],
				},
				{
					"name": _("End kWh"),
					"values": [
						flt(row.get("end_kwh"), 2)
						for row in interval_rows
					],
				},
			],
		},
		"type": "line",
		"height": 280,
	}


def get_readings(filters) -> list:
	reading_filters = {
		"address": filters.address,
		"docstatus": 1,
	}

	if filters.from_datetime and filters.to_datetime:
		reading_filters["reading_datetime"] = ["between", [filters.from_datetime, filters.to_datetime]]
	elif filters.from_datetime:
		reading_filters["reading_datetime"] = [">=", filters.from_datetime]
	elif filters.to_datetime:
		reading_filters["reading_datetime"] = ["<=", filters.to_datetime]

	readings = frappe.get_all(
		METER_READING_DOCTYPE,
		filters=reading_filters,
		fields=["name", "reading_datetime", "reading"],
		order_by="reading_datetime asc, creation asc",
	)

	# If from_date is provided, include the latest prior reading as the opening point.
	# This allows the first interval inside the selected range to be calculated.
	if filters.from_datetime:
		previous_reading = frappe.get_all(
			METER_READING_DOCTYPE,
			filters={
				"address": filters.address,
				"docstatus": 1,
				"reading_datetime": ["<", filters.from_datetime],
			},
			fields=["name", "reading_datetime", "reading"],
			order_by="reading_datetime desc, creation desc",
			limit_page_length=1,
		)

		if previous_reading:
			readings = previous_reading + readings

	return readings


def get_purchased_units_between(address, from_datetime, to_datetime) -> float:
	result = frappe.db.sql(
		f"""
		SELECT
			COALESCE(SUM(child.units), 0) AS purchased_units
		FROM `tab{PURCHASE_DOCTYPE}` parent
		INNER JOIN `tab{PURCHASE_TABLE_DOCTYPE}` child
			ON child.parent = parent.name
			AND child.parenttype = %s
		WHERE
			parent.address = %s
			AND parent.docstatus = 1
			AND parent.purchase_date > %s
			AND parent.purchase_date <= %s
		""",
		(
			PURCHASE_DOCTYPE,
			address,
			from_datetime,
			to_datetime,
		),
		as_dict=True,
	)

	if not result:
		return 0

	return flt(result[0].purchased_units, 4)


def get_hours_until_set_date(current_datetime, set_datetime) -> float:
	if not current_datetime or not set_datetime:
		return 0

	current_datetime = get_datetime(current_datetime)
	set_datetime = get_datetime(set_datetime)

	if set_datetime <= current_datetime:
		return 0

	return flt((set_datetime - current_datetime).total_seconds() / 3600, 4)


def get_normalised_filters(filters) -> frappe._dict:
	if not filters.get("address"):
		frappe.throw(_("Please select an Address."))

	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	set_date = filters.get("set_date") or get_next_25th_date()

	from_datetime = None
	to_datetime = None

	if from_date:
		from_datetime = datetime.combine(getdate(from_date), time.min)

	if to_date:
		to_datetime = datetime.combine(getdate(to_date), time.max)

	if from_datetime and to_datetime and to_datetime < from_datetime:
		frappe.throw(_("To Date cannot be before From Date."))

	set_datetime = datetime.combine(getdate(set_date), time.max)

	return frappe._dict(
		{
			"address": filters.address,
			"from_date": from_date,
			"to_date": to_date,
			"set_date": set_date,
			"from_datetime": from_datetime,
			"to_datetime": to_datetime,
			"set_datetime": set_datetime,
		}
	)


def get_next_25th_date():
	today = getdate(nowdate())

	if today.day <= 25:
		return today.replace(day=25)

	next_month = add_months(today.replace(day=1), 1)

	return next_month.replace(day=25)
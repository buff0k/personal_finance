# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

from datetime import datetime, time

import frappe
from frappe import _
from frappe.utils import (
	add_months,
	flt,
	format_datetime,
	get_datetime,
	get_first_day,
	getdate,
	nowdate,
)


METER_READING_DOCTYPE = "Personal Finance Electricity Meter Reading"
PURCHASE_DOCTYPE = "Personal Finance Electricity Purchase"
PURCHASE_TABLE_DOCTYPE = "Personal Finance Electricity Purchase Table"


@frappe.whitelist()
def get_dashboard_data(address=None, from_date=None, to_date=None, set_date=None):
	"""
	Returns dashboard-ready electricity usage data.

	Filters:
		- address: required for meaningful data
		- from_date: optional; blank means no lower date limit
		- to_date: optional; blank means no upper date limit
		- set_date: optional; defaults to next 25th day of a month
	"""

	filters = get_normalised_filters(
		address=address,
		from_date=from_date,
		to_date=to_date,
		set_date=set_date,
	)

	if not filters.address:
		return get_empty_dashboard_payload(
			message="Select an address to load the electricity dashboard.",
			filters=filters,
		)

	readings = get_readings(filters)
	intervals = get_intervals(filters, readings)
	projection = get_projection(filters, intervals, readings)

	purchase_summary = get_purchase_summary(filters)
	recent_readings = get_recent_readings(filters)
	recent_purchases = get_recent_purchases(filters)
	monthly_purchases = get_monthly_purchase_history(filters)

	return {
		"filters": {
			"address": filters.address,
			"from_date": filters.from_date,
			"to_date": filters.to_date,
			"set_date": filters.set_date,
		},
		"message": get_dashboard_message(readings, intervals),
		"stats": get_stats(
			filters=filters,
			readings=readings,
			intervals=intervals,
			projection=projection,
			purchase_summary=purchase_summary,
		),
		"projection": projection,
		"intervals": intervals,
		"recent_readings": recent_readings,
		"recent_purchases": recent_purchases,
		"monthly_purchases": monthly_purchases,
		"tips": get_energy_saving_tips(projection),
	}


def get_empty_dashboard_payload(message, filters):
	return {
		"filters": {
			"address": filters.address,
			"from_date": filters.from_date,
			"to_date": filters.to_date,
			"set_date": filters.set_date,
		},
		"message": message,
		"stats": {
			"latest_balance": 0,
			"average_kwh_per_day": 0,
			"projected_balance": 0,
			"shortfall_units": 0,
			"total_purchased_units": 0,
			"total_purchase_incl": 0,
			"total_purchase_excl": 0,
			"reading_count": 0,
			"purchase_count": 0,
		},
		"projection": {},
		"intervals": [],
		"recent_readings": [],
		"recent_purchases": [],
		"monthly_purchases": [],
		"tips": get_energy_saving_tips({}),
	}


def get_normalised_filters(address=None, from_date=None, to_date=None, set_date=None):
	if not set_date:
		set_date = get_next_25th_date()

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
			"address": address,
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


def get_readings(filters):
	reading_filters = {
		"address": filters.address,
		"docstatus": 1,
	}

	if filters.from_datetime and filters.to_datetime:
		reading_filters["reading_datetime"] = [
			"between",
			[filters.from_datetime, filters.to_datetime],
		]
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


def get_intervals(filters, readings):
	if len(readings) < 2:
		return []

	intervals = []

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

		intervals.append(
			{
				"from_reading": previous_reading.name,
				"to_reading": current_reading.name,
				"from_reading_datetime": previous_datetime,
				"to_reading_datetime": current_datetime,
				"from_reading_datetime_display": format_datetime(previous_datetime),
				"to_reading_datetime_display": format_datetime(current_datetime),
				"start_kwh": start_kwh,
				"purchased_kwh": flt(purchased_kwh, 2),
				"end_kwh": end_kwh,
				"used_kwh": flt(used_kwh, 2),
				"hours": flt(hours, 2),
				"kwh_per_hour": flt(kwh_per_hour, 4),
				"kwh_per_day": flt(kwh_per_day, 2),
				"kwh_per_week": flt(kwh_per_week, 2),
				"kwh_per_month": flt(kwh_per_month, 2),
			}
		)

	return intervals


def get_projection(filters, intervals, readings):
	if not readings:
		return {}

	latest_reading = readings[-1]
	latest_reading_datetime = get_datetime(latest_reading.reading_datetime)
	latest_balance = flt(latest_reading.reading, 2)

	if not intervals:
		return {
			"latest_reading_datetime": latest_reading_datetime,
			"latest_reading_datetime_display": format_datetime(latest_reading_datetime),
			"latest_balance": latest_balance,
			"average_kwh_per_hour": 0,
			"average_kwh_per_day": 0,
			"average_kwh_per_week": 0,
			"average_kwh_per_month": 0,
			"hours_until_set_date": get_hours_until_set_date(
				latest_reading_datetime,
				filters.set_datetime,
			),
			"projected_usage_to_set_date": 0,
			"projected_balance_at_set_date": latest_balance,
			"shortfall_units": 0,
			"set_date": filters.set_date,
		}

	total_used = sum(flt(row.get("used_kwh"), 4) for row in intervals)
	total_hours = sum(flt(row.get("hours"), 4) for row in intervals)

	average_kwh_per_hour = flt(total_used / total_hours, 6) if total_hours else 0
	average_kwh_per_day = flt(average_kwh_per_hour * 24, 4)
	average_kwh_per_week = flt(average_kwh_per_day * 7, 4)
	average_kwh_per_month = flt(average_kwh_per_day * 30, 4)

	hours_until_set_date = get_hours_until_set_date(
		latest_reading_datetime,
		filters.set_datetime,
	)

	projected_usage_to_set_date = flt(average_kwh_per_hour * hours_until_set_date, 4)
	projected_balance_at_set_date = flt(latest_balance - projected_usage_to_set_date, 4)
	shortfall_units = flt(max(0, projected_usage_to_set_date - latest_balance), 4)

	return {
		"latest_reading_datetime": latest_reading_datetime,
		"latest_reading_datetime_display": format_datetime(latest_reading_datetime),
		"latest_balance": latest_balance,
		"average_kwh_per_hour": flt(average_kwh_per_hour, 4),
		"average_kwh_per_day": flt(average_kwh_per_day, 2),
		"average_kwh_per_week": flt(average_kwh_per_week, 2),
		"average_kwh_per_month": flt(average_kwh_per_month, 2),
		"hours_until_set_date": flt(hours_until_set_date, 2),
		"projected_usage_to_set_date": flt(projected_usage_to_set_date, 2),
		"projected_balance_at_set_date": flt(projected_balance_at_set_date, 2),
		"shortfall_units": flt(shortfall_units, 2),
		"set_date": filters.set_date,
	}


def get_purchased_units_between(address, from_datetime, to_datetime):
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


def get_purchase_summary(filters):
	purchase_filters = get_purchase_filters(filters)

	purchases = frappe.get_all(
		PURCHASE_DOCTYPE,
		filters=purchase_filters,
		fields=[
			"name",
			"purchase_date",
			"purchase_price_incl",
			"purchase_price_excl",
		],
	)

	purchase_names = [purchase.name for purchase in purchases]

	total_units = 0

	if purchase_names:
		unit_result = frappe.db.sql(
			f"""
			SELECT
				COALESCE(SUM(units), 0) AS total_units
			FROM `tab{PURCHASE_TABLE_DOCTYPE}`
			WHERE
				parenttype = %s
				AND parent IN %s
			""",
			(
				PURCHASE_DOCTYPE,
				tuple(purchase_names),
			),
			as_dict=True,
		)

		if unit_result:
			total_units = flt(unit_result[0].total_units, 4)

	total_incl = sum(flt(purchase.purchase_price_incl, 4) for purchase in purchases)
	total_excl = sum(flt(purchase.purchase_price_excl, 4) for purchase in purchases)

	return {
		"purchase_count": len(purchases),
		"total_purchased_units": flt(total_units, 2),
		"total_purchase_incl": flt(total_incl, 2),
		"total_purchase_excl": flt(total_excl, 2),
	}


def get_purchase_filters(filters):
	purchase_filters = {
		"address": filters.address,
		"docstatus": 1,
	}

	if filters.from_datetime and filters.to_datetime:
		purchase_filters["purchase_date"] = [
			"between",
			[filters.from_datetime, filters.to_datetime],
		]
	elif filters.from_datetime:
		purchase_filters["purchase_date"] = [">=", filters.from_datetime]
	elif filters.to_datetime:
		purchase_filters["purchase_date"] = ["<=", filters.to_datetime]

	return purchase_filters


def get_recent_readings(filters):
	reading_filters = {
		"address": filters.address,
		"docstatus": 1,
	}

	readings = frappe.get_all(
		METER_READING_DOCTYPE,
		filters=reading_filters,
		fields=["name", "reading_datetime", "reading"],
		order_by="reading_datetime desc, creation desc",
		limit_page_length=8,
	)

	return [
		{
			"name": reading.name,
			"reading_datetime": reading.reading_datetime,
			"reading_datetime_display": format_datetime(reading.reading_datetime),
			"reading": flt(reading.reading, 2),
		}
		for reading in readings
	]


def get_recent_purchases(filters):
	purchase_filters = {
		"address": filters.address,
		"docstatus": 1,
	}

	purchases = frappe.get_all(
		PURCHASE_DOCTYPE,
		filters=purchase_filters,
		fields=[
			"name",
			"purchase_date",
			"purchase_price_incl",
			"purchase_price_excl",
			"electricity_cost",
		],
		order_by="purchase_date desc, creation desc",
		limit_page_length=8,
	)

	purchase_names = [purchase.name for purchase in purchases]
	units_by_purchase = {}

	if purchase_names:
		unit_rows = frappe.db.sql(
			f"""
			SELECT
				parent,
				COALESCE(SUM(units), 0) AS total_units
			FROM `tab{PURCHASE_TABLE_DOCTYPE}`
			WHERE
				parenttype = %s
				AND parent IN %s
			GROUP BY parent
			""",
			(
				PURCHASE_DOCTYPE,
				tuple(purchase_names),
			),
			as_dict=True,
		)

		units_by_purchase = {
			row.parent: flt(row.total_units, 2)
			for row in unit_rows
		}

	return [
		{
			"name": purchase.name,
			"purchase_date": purchase.purchase_date,
			"purchase_date_display": format_datetime(purchase.purchase_date),
			"purchase_price_incl": flt(purchase.purchase_price_incl, 2),
			"purchase_price_excl": flt(purchase.purchase_price_excl, 2),
			"electricity_cost": purchase.electricity_cost,
			"units": units_by_purchase.get(purchase.name, 0),
		}
		for purchase in purchases
	]


def get_monthly_purchase_history(filters):
	end_date = getdate(nowdate())
	start_date = add_months(get_first_day(end_date), -5)

	rows = frappe.db.sql(
		f"""
		SELECT
			DATE_FORMAT(parent.purchase_date, '%%Y-%%m') AS month_key,
			COALESCE(SUM(child.units), 0) AS units,
			COALESCE(SUM(parent.purchase_price_incl), 0) AS amount_incl
		FROM `tab{PURCHASE_DOCTYPE}` parent
		LEFT JOIN `tab{PURCHASE_TABLE_DOCTYPE}` child
			ON child.parent = parent.name
			AND child.parenttype = %s
		WHERE
			parent.address = %s
			AND parent.docstatus = 1
			AND parent.purchase_date >= %s
		GROUP BY DATE_FORMAT(parent.purchase_date, '%%Y-%%m')
		ORDER BY month_key ASC
		""",
		(
			PURCHASE_DOCTYPE,
			filters.address,
			start_date,
		),
		as_dict=True,
	)

	return [
		{
			"month": row.month_key,
			"units": flt(row.units, 2),
			"amount_incl": flt(row.amount_incl, 2),
		}
		for row in rows
	]


def get_stats(filters, readings, intervals, projection, purchase_summary):
	latest_balance = 0

	if readings:
		latest_balance = flt(readings[-1].reading, 2)

	return {
		"latest_balance": latest_balance,
		"average_kwh_per_day": flt(projection.get("average_kwh_per_day"), 2) if projection else 0,
		"projected_balance": flt(projection.get("projected_balance_at_set_date"), 2) if projection else 0,
		"shortfall_units": flt(projection.get("shortfall_units"), 2) if projection else 0,
		"total_purchased_units": flt(purchase_summary.get("total_purchased_units"), 2),
		"total_purchase_incl": flt(purchase_summary.get("total_purchase_incl"), 2),
		"total_purchase_excl": flt(purchase_summary.get("total_purchase_excl"), 2),
		"reading_count": len(readings),
		"interval_count": len(intervals),
		"purchase_count": purchase_summary.get("purchase_count", 0),
		"set_date": filters.set_date,
	}


def get_dashboard_message(readings, intervals):
	if not readings:
		return "No submitted readings found yet for this address."

	if len(readings) == 1:
		return "Only one submitted reading exists. Add another submitted reading to calculate usage trends."

	if not intervals:
		return "Readings exist, but no valid intervals could be calculated."

	return ""


def get_hours_until_set_date(current_datetime, set_datetime):
	if not current_datetime or not set_datetime:
		return 0

	current_datetime = get_datetime(current_datetime)
	set_datetime = get_datetime(set_datetime)

	if set_datetime <= current_datetime:
		return 0

	return flt((set_datetime - current_datetime).total_seconds() / 3600, 4)


def get_energy_saving_tips(projection):
	average_kwh_per_day = flt(projection.get("average_kwh_per_day"), 2) if projection else 0
	shortfall_units = flt(projection.get("shortfall_units"), 2) if projection else 0

	tips = [
		{
			"title": "Start with the geyser",
			"body": "Geysers are often one of the biggest household loads. Use a timer, reduce unnecessary reheating, and avoid long hot-water windows.",
			"url": "https://www.eskom.co.za/eas/energy-saving-tips/",
		},
		{
			"title": "Move big loads away from peak habits",
			"body": "Run washing machines, dishwashers, pool pumps, and tumble dryers only when genuinely needed, and use eco or cold-water cycles where practical.",
			"url": "https://stateofthenation.gov.za/takechargesa/home-energy-savings",
		},
		{
			"title": "Watch the silent consumers",
			"body": "Chargers, screens, standby devices, old fridges, and always-on electronics can quietly add to your daily base load.",
			"url": "https://www.eskom.co.za/eas/energy-saving-tips/",
		},
	]

	if average_kwh_per_day >= 25:
		tips.insert(
			0,
			{
				"title": "High daily usage detected",
				"body": "Your average daily use is high. Look at geyser timing, pool pump runtime, heating/cooling, tumble drying, and older appliances first.",
				"url": "https://www.eskom.co.za/eas/energy-saving-tips/",
			},
		)

	if shortfall_units > 0:
		tips.insert(
			0,
			{
				"title": "You may run short before the target date",
				"body": "The projection shows a shortfall. Reduce high-load usage or consider buying enough units before the projected balance turns negative.",
				"url": "https://stateofthenation.gov.za/takechargesa/home-energy-savings",
			},
		)

	return tips[:5]
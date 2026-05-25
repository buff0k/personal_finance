# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, format_datetime


class PersonalFinanceElectricityMeterReading(Document):
	def autoname(self):
		"""
		Sets the document name as:

			address - datetime

		Example:

			Home Address - 2026-05-25 18-30-00

		If the same address and datetime already exists, it becomes:

			Home Address - 2026-05-25 18-30-00 - 1
			Home Address - 2026-05-25 18-30-00 - 2
		"""

		if not self.address:
			frappe.throw(_("Address is required before naming this meter reading."))

		if not self.reading_datetime:
			frappe.throw(_("Date and Time of Reading is required before naming this meter reading."))

		base_name = self.get_base_meter_reading_name()
		self.name = self.get_next_available_name(base_name)

	def before_insert(self):
		"""
		Fallback only.

		The JS should populate applicable_electricity_cost when a new form opens.
		This server-side fallback only fills it if it is still blank at insert time.

		It does not override a value the user selected.
		"""

		if not self.applicable_electricity_cost:
			self.applicable_electricity_cost = get_latest_electricity_cost()

	def validate(self):
		self.validate_applicable_electricity_cost()
		self.validate_reading()

	def get_base_meter_reading_name(self):
		address = str(self.address).strip()

		# Use a URL/file friendly datetime string while still being human readable.
		# Avoid ":" because it can be awkward in URLs, file exports, and integrations.
		reading_datetime = format_datetime(
			self.reading_datetime,
			"yyyy-MM-dd HH-mm-ss"
		)

		return f"{address} - {reading_datetime}"

	def get_next_available_name(self, base_name):
		if not frappe.db.exists(self.doctype, base_name):
			return base_name

		counter = 1

		while frappe.db.exists(self.doctype, f"{base_name} - {counter}"):
			counter += 1

		return f"{base_name} - {counter}"

	def validate_applicable_electricity_cost(self):
		if not self.applicable_electricity_cost:
			frappe.throw(_("Applicable Electricity Cost is required."))

		docstatus = frappe.db.get_value(
			"Personal Finance Electricity Cost",
			self.applicable_electricity_cost,
			"docstatus"
		)

		if docstatus is None:
			frappe.throw(
				_("Applicable Electricity Cost {0} does not exist.").format(
					frappe.bold(self.applicable_electricity_cost)
				)
			)

		if docstatus != 1:
			frappe.throw(
				_("Applicable Electricity Cost must be a submitted record.")
			)

	def validate_reading(self):
		if self.reading is None:
			frappe.throw(_("Reading is required."))

		if flt(self.reading) < 0:
			frappe.throw(_("Reading cannot be negative."))


@frappe.whitelist()
def get_latest_electricity_cost():
	"""
	Returns the latest submitted Personal Finance Electricity Cost record only.

	The latest record is determined by:
		1. effective_date descending
		2. creation descending

	Draft and cancelled records are ignored.
	"""

	latest_submitted = frappe.get_all(
		"Personal Finance Electricity Cost",
		filters={
			"docstatus": 1
		},
		fields=["name"],
		order_by="effective_date desc, creation desc",
		limit_page_length=1,
	)

	if latest_submitted:
		return latest_submitted[0].name

	return None
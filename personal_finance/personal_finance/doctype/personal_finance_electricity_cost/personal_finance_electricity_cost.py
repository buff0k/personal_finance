# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, getdate


class PersonalFinanceElectricityCost(Document):
	def before_insert(self):
		self.set_period_from_municipality_and_effective_date()

	def validate(self):
		self.set_period_from_municipality_and_effective_date()
		self.validate_rates()

	def set_period_from_municipality_and_effective_date(self):
		"""
		Sets period from Municipality + Effective Date year.

		Example:
			municipality = Ekurhuleni
			effective_date = 2026-05-25

			period = Ekurhuleni - 2026

		If that already exists, this becomes:
			Ekurhuleni - 2026 - 1
			Ekurhuleni - 2026 - 2
			etc.

		Because the DocType uses autoname = field:period, this must be set
		before insert so Frappe can use it as the document name.
		"""

		if not self.municipality or not self.effective_date:
			return

		year = str(getdate(self.effective_date).year)
		municipality = self.municipality.strip()

		if not municipality:
			return

		# Do not rename existing records automatically.
		if not self.is_new() and self.period:
			return

		base_period = f"{municipality} - {year}"
		self.period = self.get_next_available_period(base_period)

	def get_next_available_period(self, base_period):
		"""
		Returns the next available period value:
			Ekurhuleni - 2026
			Ekurhuleni - 2026 - 1
			Ekurhuleni - 2026 - 2
			...
		"""

		existing_periods = frappe.get_all(
			"Personal Finance Electricity Cost",
			filters={
				"period": ["like", f"{base_period}%"],
				"name": ["!=", self.name or ""],
			},
			pluck="period",
		)

		existing_periods = set(existing_periods or [])

		if base_period not in existing_periods:
			return base_period

		counter = 1
		while f"{base_period} - {counter}" in existing_periods:
			counter += 1

		return f"{base_period} - {counter}"

	def validate_rates(self):
		"""
		Validates electricity rate tranches.

		Expected examples:
			0   -> 50
			50  -> 300
			300 -> 600
			600 -> blank / infinite

		The last tranche may have no To Units value.
		"""

		if not self.rates:
			frappe.throw(_("Please add at least one electricity rate row."))

		normalised_rows = []

		for row in self.rates:
			from_units = cint(row.from_units)
			to_units = self.get_optional_to_units(row.to_units, from_units)
			unit_cost = flt(row.unit_cost)

			if from_units < 0:
				frappe.throw(
					_("Row #{0}: From Units cannot be negative.").format(row.idx)
				)

			if to_units is not None and to_units < 0:
				frappe.throw(
					_("Row #{0}: To Units cannot be negative.").format(row.idx)
				)

			if to_units is not None and to_units < from_units:
				frappe.throw(
					_("Row #{0}: To Units cannot be less than From Units.").format(row.idx)
				)

			if unit_cost < 0:
				frappe.throw(
					_("Row #{0}: Unit Cost cannot be negative.").format(row.idx)
				)

			normalised_rows.append(
				{
					"row": row,
					"from_units": from_units,
					"to_units": to_units,
					"unit_cost": unit_cost,
				}
			)

		# Validate by unit range, but do not force the user-facing grid order.
		normalised_rows.sort(key=lambda item: item["from_units"])

		open_ended_found = False
		previous_to_units = None
		previous_row_idx = None

		for item in normalised_rows:
			row = item["row"]
			from_units = item["from_units"]
			to_units = item["to_units"]

			if open_ended_found:
				frappe.throw(
					_(
						"Row #{0}: No rate rows may appear after an open-ended tranche."
					).format(row.idx)
				)

			if previous_to_units is not None and from_units < previous_to_units:
				frappe.throw(
					_(
						"Row #{0}: This tranche overlaps with row #{1}."
					).format(row.idx, previous_row_idx)
				)

			if to_units is None:
				open_ended_found = True

			previous_to_units = to_units
			previous_row_idx = row.idx

	def get_optional_to_units(self, value, from_units):
		"""
		Returns None when To Units should be treated as blank/open-ended.

		For this DocType, the final row is expected to be something like:
			600 -> blank

		In some client/server paths, blank Int fields can look like 0.
		For rows starting above 0, a To Units value of 0 is treated as blank.
		"""

		if value in (None, ""):
			return None

		value = cint(value)

		if from_units > 0 and value == 0:
			return None

		return value
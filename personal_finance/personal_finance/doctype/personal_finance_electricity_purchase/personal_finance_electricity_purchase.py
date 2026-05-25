# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_months, flt, format_datetime, get_first_day, getdate


DEFAULT_TAX_RATE = 15.0


class PersonalFinanceElectricityPurchase(Document):
	def autoname(self):
		"""
		Sets the document name as:

			address - datetime

		Example:
			Home Address - 2026-05-25 18-30-00
		"""

		if not self.address:
			frappe.throw(_("Address is required before naming this electricity purchase."))

		if not self.purchase_date:
			frappe.throw(_("Date and Time of Purchase is required before naming this electricity purchase."))

		base_name = self.get_base_purchase_name()
		self.name = self.get_next_available_name(base_name)

	def before_insert(self):
		if not self.electricity_cost:
			self.electricity_cost = get_latest_electricity_cost()

		if self.tax in (None, ""):
			self.tax = DEFAULT_TAX_RATE

	def validate(self):
		self.set_missing_defaults()
		self.validate_required_fields()
		self.validate_electricity_cost()
		self.validate_tax()
		self.validate_purchase_prices()
		self.calculate_or_validate_cost_rows()

	def set_missing_defaults(self):
		if not self.electricity_cost:
			self.electricity_cost = get_latest_electricity_cost()

		if self.tax in (None, ""):
			self.tax = DEFAULT_TAX_RATE

	def validate_required_fields(self):
		if not self.address:
			frappe.throw(_("Address is required."))

		if not self.purchase_date:
			frappe.throw(_("Date and Time of Purchase is required."))

	def get_base_purchase_name(self):
		address = str(self.address).strip()

		purchase_datetime = format_datetime(
			self.purchase_date,
			"yyyy-MM-dd HH-mm-ss"
		)

		return f"{address} - {purchase_datetime}"

	def get_next_available_name(self, base_name):
		if not frappe.db.exists(self.doctype, base_name):
			return base_name

		counter = 1

		while frappe.db.exists(self.doctype, f"{base_name} - {counter}"):
			counter += 1

		return f"{base_name} - {counter}"

	def validate_electricity_cost(self):
		if not self.electricity_cost:
			frappe.throw(_("Applicable Electricity Cost is required."))

		docstatus = frappe.db.get_value(
			"Personal Finance Electricity Cost",
			self.electricity_cost,
			"docstatus"
		)

		if docstatus is None:
			frappe.throw(
				_("Applicable Electricity Cost {0} does not exist.").format(
					frappe.bold(self.electricity_cost)
				)
			)

		if docstatus != 1:
			frappe.throw(_("Applicable Electricity Cost must be a submitted record."))

	def validate_tax(self):
		if self.tax in (None, ""):
			frappe.throw(_("Applicable Tax Rate is required."))

		if flt(self.tax) < 0:
			frappe.throw(_("Applicable Tax Rate cannot be negative."))

	def validate_purchase_prices(self):
		if self.purchase_price_incl in (None, "") and self.purchase_price_excl in (None, ""):
			frappe.throw(_("Please enter either Purchase Price Incl. or Purchase Price Excl."))

		if self.purchase_price_incl not in (None, "") and flt(self.purchase_price_incl) < 0:
			frappe.throw(_("Purchase Price Incl. cannot be negative."))

		if self.purchase_price_excl not in (None, "") and flt(self.purchase_price_excl) < 0:
			frappe.throw(_("Purchase Price Excl. cannot be negative."))

	def calculate_or_validate_cost_rows(self):
		"""
		Server-side safety net.

		Client-side JS handles live calculations.

		Important:
			- Existing child rows are treated as the source of truth.
			- User-overridden row costs are not replaced.
			- If no rows exist, rows are generated from the parent excl amount,
			  starting from the correct month-to-date tranche position.
		"""

		if self.cost_of_units:
			self.recalculate_from_rows()
			return

		excl_amount = self.get_excl_amount_from_parent_prices()

		if excl_amount <= 0:
			frappe.throw(_("Purchase Price Excl. must be greater than zero."))

		month_to_date_units = get_month_to_date_units(
			address=self.address,
			purchase_date=self.purchase_date,
			exclude_purchase=self.name if not self.is_new() else None,
		)

		self.populate_rows_from_excl_amount(excl_amount, month_to_date_units)
		self.recalculate_from_rows()

	def get_excl_amount_from_parent_prices(self):
		tax_multiplier = self.get_tax_multiplier()

		if self.purchase_price_excl not in (None, ""):
			return flt(self.purchase_price_excl, 4)

		if self.purchase_price_incl not in (None, ""):
			return flt(flt(self.purchase_price_incl, 4) / tax_multiplier, 4)

		return 0

	def get_tax_multiplier(self):
		return 1 + (flt(self.tax) / 100)

	def populate_rows_from_excl_amount(self, excl_amount, month_to_date_units=0):
		rates = get_electricity_cost_rates(self.electricity_cost)

		if not rates:
			frappe.throw(
				_("No rates found for Applicable Electricity Cost {0}.").format(
					frappe.bold(self.electricity_cost)
				)
			)

		self.set("cost_of_units", [])

		remaining_amount = flt(excl_amount, 4)
		cumulative_units_before_this_purchase = flt(month_to_date_units, 4)

		for rate in rates:
			if remaining_amount <= 0:
				break

			unit_cost = flt(rate.get("unit_cost"), 4)

			if unit_cost <= 0:
				frappe.throw(_("Electricity Cost rate must be greater than zero."))

			available_units = get_remaining_units_in_tranche(
				rate=rate,
				cumulative_units_before_purchase=cumulative_units_before_this_purchase,
			)

			if available_units == 0:
				continue

			affordable_units = remaining_amount / unit_cost

			if available_units is None:
				units = affordable_units
			else:
				units = min(available_units, affordable_units)

			if units <= 0:
				continue

			subtotal = units * unit_cost

			self.append(
				"cost_of_units",
				{
					"units": flt(units, 2),
					"cost": unit_cost,
					"subtotal": flt(subtotal, 4),
				}
			)

			remaining_amount = flt(remaining_amount - subtotal, 4)
			cumulative_units_before_this_purchase += flt(units, 4)

	def recalculate_from_rows(self):
		total_excl = 0

		for row in self.cost_of_units:
			if row.units in (None, ""):
				frappe.throw(_("Row #{0}: Units are required.").format(row.idx))

			if row.cost in (None, ""):
				frappe.throw(_("Row #{0}: Unit Cost is required.").format(row.idx))

			units = flt(row.units, 4)
			cost = flt(row.cost, 4)

			if units < 0:
				frappe.throw(_("Row #{0}: Units cannot be negative.").format(row.idx))

			if cost < 0:
				frappe.throw(_("Row #{0}: Unit Cost cannot be negative.").format(row.idx))

			row.subtotal = flt(units * cost, 4)
			total_excl += flt(row.subtotal, 4)

		self.purchase_price_excl = flt(total_excl, 4)
		self.purchase_price_incl = flt(total_excl * self.get_tax_multiplier(), 4)


@frappe.whitelist()
def get_latest_electricity_cost():
	"""
	Returns the latest submitted Personal Finance Electricity Cost record only.
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


@frappe.whitelist()
def get_purchase_calculation_context(electricity_cost=None, address=None, purchase_date=None, exclude_purchase=None):
	"""
	Returns everything the client needs to calculate purchase rows:

		- latest submitted Electricity Cost if none is selected
		- submitted Electricity Cost rates
		- month-to-date units already bought for this address

	Month-to-date means submitted purchases for the same Address from the first
	day of the purchase month up to, but not including, this purchase datetime.
	"""

	if not electricity_cost:
		electricity_cost = get_latest_electricity_cost()

	rates = []

	if electricity_cost:
		rates = get_electricity_cost_rates(electricity_cost)

	month_to_date_units = 0

	if address and purchase_date:
		month_to_date_units = get_month_to_date_units(
			address=address,
			purchase_date=purchase_date,
			exclude_purchase=exclude_purchase,
		)

	return {
		"electricity_cost": electricity_cost,
		"rates": rates,
		"month_to_date_units": flt(month_to_date_units, 4),
	}


@frappe.whitelist()
def get_electricity_cost_rates(electricity_cost):
	"""
	Returns submitted Electricity Cost tranche rows for client-side calculation.
	"""

	if not electricity_cost:
		return []

	docstatus = frappe.db.get_value(
		"Personal Finance Electricity Cost",
		electricity_cost,
		"docstatus"
	)

	if docstatus != 1:
		frappe.throw(_("Applicable Electricity Cost must be a submitted record."))

	doc = frappe.get_doc("Personal Finance Electricity Cost", electricity_cost)

	rates = []

	for row in doc.rates:
		to_units = None

		if row.to_units not in (None, ""):
			to_units = flt(row.to_units, 4)

			# In your setup, final infinite tranche may appear as 0 in the grid.
			# Example: 601 -> 0 means 601+.
			if flt(row.from_units, 4) > 0 and to_units == 0:
				to_units = None

		from_units = flt(row.from_units, 4)

		rates.append(
			{
				"from_units": from_units,
				"to_units": to_units,
				"unit_cost": flt(row.unit_cost, 4),
				"capacity": get_tranche_unit_capacity(from_units, to_units),
			}
		)

	rates.sort(key=lambda item: item["from_units"])

	return rates


def get_month_to_date_units(address, purchase_date, exclude_purchase=None):
	"""
	Returns units already bought for the same address in the same calendar month.

	Only submitted purchases are counted.

	For a purchase on 20 Jan:
		- Count submitted purchases from 1 Jan up to before 20 Jan.
		- Exclude the current purchase if editing/revalidating an existing one.
	"""

	if not address or not purchase_date:
		return 0

	purchase_dt = getdate(purchase_date)
	month_start = get_first_day(purchase_dt)
	next_month_start = add_months(month_start, 1)

	filters = {
		"address": address,
		"docstatus": 1,
		"purchase_date": ["between", [month_start, purchase_date]],
	}

	if exclude_purchase:
		filters["name"] = ["!=", exclude_purchase]

	purchases = frappe.get_all(
		"Personal Finance Electricity Purchase",
		filters=filters,
		fields=["name"],
		order_by="purchase_date asc, creation asc",
	)

	total_units = 0

	for purchase in purchases:
		if exclude_purchase and purchase.name == exclude_purchase:
			continue

		# Guard against including future records in the same day if purchase_date
		# was reduced to a date by DB/filter behaviour.
		purchase_doc = frappe.get_doc("Personal Finance Electricity Purchase", purchase.name)

		if str(purchase_doc.purchase_date) >= str(purchase_date):
			continue

		for row in purchase_doc.cost_of_units:
			total_units += flt(row.units, 4)

	return flt(total_units, 4)


def get_tranche_unit_capacity(from_units, to_units):
	"""
	Calculates the number of units available in a tariff tranche.

	Your tariff setup is:

		0   -> 50   = 50 units
		51  -> 350  = 300 units
		351 -> 600  = 250 units
		601 -> blank/0 = infinite

	So:
		- First row starting at 0 uses: to - from
		- Later rows use inclusive counting: to - from + 1
		- Blank/0 final to_units means open-ended/infinite
	"""

	from_units = flt(from_units, 4)

	if to_units in (None, ""):
		return None

	to_units = flt(to_units, 4)

	if from_units > 0 and to_units == 0:
		return None

	if to_units < from_units:
		frappe.throw(_("Invalid Electricity Cost tranche: To Units cannot be less than From Units."))

	if from_units == 0:
		return flt(to_units - from_units, 4)

	return flt(to_units - from_units + 1, 4)


def get_remaining_units_in_tranche(rate, cumulative_units_before_purchase):
	"""
	Given the month-to-date units already bought, return how many units are still
	available in this tranche.

	Returns:
		0     -> tranche already exhausted or not reached in this loop
		None  -> open-ended/infinite tranche
		number -> remaining units available in this tranche
	"""

	cumulative_units_before_purchase = flt(cumulative_units_before_purchase, 4)

	capacity = rate.get("capacity")

	if capacity in (None, ""):
		return None

	capacity = flt(capacity, 4)
	from_units = flt(rate.get("from_units"), 4)

	if from_units == 0:
		tranche_start_position = 0
	else:
		tranche_start_position = from_units - 1

	tranche_end_position = tranche_start_position + capacity

	if cumulative_units_before_purchase >= tranche_end_position:
		return 0

	if cumulative_units_before_purchase <= tranche_start_position:
		return capacity

	return flt(tranche_end_position - cumulative_units_before_purchase, 4)
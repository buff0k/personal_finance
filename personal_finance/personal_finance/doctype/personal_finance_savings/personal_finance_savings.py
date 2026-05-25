# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document


class PersonalFinanceSavings(Document):
    def onload(self):
        self.calculate_total_savings()

    def validate(self):
        self.validate_savings_values()
        self.calculate_total_savings()

    def before_save(self):
        self.validate_savings_values()
        self.calculate_total_savings()

    def validate_savings_values(self):
        """
        Savings values cannot be negative.
        """
        for row in self.get("savings_list") or []:
            if (row.asset_value or 0) < 0:
                frappe.throw(
                    _("Savings value cannot be negative for row #{0}.").format(row.idx),
                    title=_("Invalid Savings Value"),
                )

    def calculate_total_savings(self):
        """
        Calculates the total savings value from the child table.
        """
        total = 0

        for row in self.get("savings_list") or []:
            total += row.asset_value or 0

        self.total = total
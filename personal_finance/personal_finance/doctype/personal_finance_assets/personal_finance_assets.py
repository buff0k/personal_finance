# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document


class PersonalFinanceAssets(Document):
    def onload(self):
        self.calculate_total_assets()

    def validate(self):
        self.validate_asset_values()
        self.calculate_total_assets()

    def before_save(self):
        self.validate_asset_values()
        self.calculate_total_assets()

    def validate_asset_values(self):
        """
        Asset values cannot be negative.
        """
        for row in self.get("asset_list") or []:
            if (row.asset_value or 0) < 0:
                frappe.throw(
                    _("Asset value cannot be negative for row #{0}.").format(row.idx),
                    title=_("Invalid Asset Value"),
                )

    def calculate_total_assets(self):
        """
        Calculates the total asset value from the child table.
        """
        total = 0

        for row in self.get("asset_list") or []:
            total += row.asset_value or 0

        self.total = total
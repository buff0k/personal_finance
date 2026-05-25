# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

from __future__ import annotations

from frappe.model.document import Document


class PersonalFinanceDebts(Document):
    def onload(self):
        self.calculate_total_debts()

    def validate(self):
        self.calculate_total_debts()

    def before_save(self):
        self.calculate_total_debts()

    def calculate_total_debts(self):
        """
        Calculates the total debt value from the child table.

        Debt values are expected to be recorded as negative numbers.
        Positive balances, for example a positive credit card balance,
        are included as positive values and therefore reduce/offset the
        total debt figure naturally.
        """
        total = 0

        for row in self.get("debts") or []:
            total += row.current_value or 0

        self.total = total
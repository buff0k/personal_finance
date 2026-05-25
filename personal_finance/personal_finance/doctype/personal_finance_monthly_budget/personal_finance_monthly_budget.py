# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

from __future__ import annotations

from calendar import monthrange
from datetime import date

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate


MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]

MONTH_NUMBER_BY_NAME = {
    month: index + 1
    for index, month in enumerate(MONTHS)
}

MONTH_NAME_BY_NUMBER = {
    index + 1: month
    for index, month in enumerate(MONTHS)
}


class PersonalFinanceMonthlyBudget(Document):
    def before_insert(self):
        self.set_next_period_if_missing()
        self.populate_snapshot_tables_if_empty()

    def validate(self):
        self.validate_year()
        self.validate_month()
        self.set_period_fields()
        self.validate_unique_period()
        self.calculate_totals()

    def before_save(self):
        self.calculate_totals()

    def autoname(self):
        self.set_next_period_if_missing()
        self.validate_year()
        self.validate_month()
        self.set_period_fields()
        self.name = self.period

    # -------------------------------------------------------------------------
    # Period helpers
    # -------------------------------------------------------------------------

    def validate_year(self):
        if not self.year:
            frappe.throw(_("Year is required."))

        try:
            year = int(self.year)
        except (TypeError, ValueError):
            frappe.throw(_("Year must be a valid number."))

        current_year = date.today().year
        min_year = current_year - 10
        max_year = current_year + 10

        if year < min_year or year > max_year:
            frappe.throw(
                _("Year must be between {0} and {1}.").format(min_year, max_year)
            )

        self.year = year

    def validate_month(self):
        if not self.month:
            frappe.throw(_("Month is required."))

        if self.month not in MONTH_NUMBER_BY_NAME:
            frappe.throw(_("Invalid month: {0}").format(self.month))

    def set_period_fields(self):
        self.month_number = MONTH_NUMBER_BY_NAME[self.month]
        self.period = f"{int(self.year)} - {self.month}"

    def validate_unique_period(self):
        existing = frappe.db.exists(
            "Personal Finance Monthly Budget",
            {
                "year": int(self.year),
                "month": self.month,
                "name": ["!=", self.name],
            },
        )

        if existing:
            frappe.throw(
                _("A monthly budget already exists for {0}.").format(self.period),
                title=_("Duplicate Monthly Budget"),
            )

    def set_next_period_if_missing(self):
        if self.year and self.month:
            return

        next_period = get_next_budget_period()

        self.year = next_period.get("year")
        self.month = next_period.get("month")
        self.month_number = next_period.get("month_number")
        self.period = next_period.get("period")

    # -------------------------------------------------------------------------
    # Snapshot helpers
    # -------------------------------------------------------------------------

    def populate_snapshot_tables_if_empty(self):
        """
        For a new Monthly Budget:

        - Income is copied from the latest previous Monthly Budget.
        - Expenses are copied from the latest previous Monthly Budget.
        - Income and expense dates are incremented by one month.
        - Asset, Savings and Debt snapshots are pulled from their singleton DocTypes.

        Payment completion fields are intentionally not copied.
        """

        target_year = int(self.year)
        target_month_number = int(self.month_number)

        if not self.get("income"):
            for row in get_previous_income_snapshot(target_year, target_month_number):
                self.append("income", row)

        if not self.get("expenses"):
            for row in get_previous_expense_snapshot(target_year, target_month_number):
                self.append("expenses", row)

        if not self.get("assets"):
            for row in get_assets_snapshot():
                self.append("assets", row)

        if not self.get("savings"):
            for row in get_savings_snapshot():
                self.append("savings", row)

        if not self.get("debts"):
            for row in get_debts_snapshot():
                self.append("debts", row)

    # -------------------------------------------------------------------------
    # Totals
    # -------------------------------------------------------------------------

    def calculate_totals(self):
        """
        total_income:
            Sum of all income rows.

        gross_payroll_income:
            Sum of income rows where linked item has is_payroll_income checked.

        nett_payroll_income:
            gross_payroll_income less payroll expenses.

        nett_income:
            total_income less payroll expenses.

        total_expenses:
            Sum of all expense rows.

        outstanding_expenses:
            Sum of expense rows where payment_made is not checked.

        available_balance:
            current_bank_balance - outstanding_expenses.
        """

        item_flags_cache = {}

        total_income = 0
        gross_payroll_income = 0

        for row in self.get("income") or []:
            amount = flt(row.get("income_amount"))
            total_income += amount

            flags = get_item_flags(row.get("income_item"), item_flags_cache)

            if flags.get("is_payroll_income"):
                gross_payroll_income += amount

        total_expenses = 0
        payroll_expenses = 0
        outstanding_expenses = 0

        for row in self.get("expenses") or []:
            amount = flt(row.get("expense_amount"))
            total_expenses += amount

            flags = get_item_flags(row.get("expense_item"), item_flags_cache)

            if flags.get("is_payroll_expense"):
                payroll_expenses += amount

            if not row.get("payment_made"):
                outstanding_expenses += amount

        total_assets = 0
        for row in self.get("assets") or []:
            total_assets += flt(row.get("asset_value"))

        total_debts = 0
        for row in self.get("debts") or []:
            total_debts += flt(row.get("current_value"))

        values = {
            "total_income": total_income,
            "gross_payroll_income": gross_payroll_income,
            "nett_payroll_income": gross_payroll_income - payroll_expenses,
            "nett_income": total_income - payroll_expenses,
            "total_expenses": total_expenses,
            "outstanding_expenses": outstanding_expenses,
            "available_balance": flt(self.get("current_bank_balance")) - outstanding_expenses,
            "total_assets": total_assets,
            "total_debts": total_debts,
        }

        set_existing_fields(self, values)


# -------------------------------------------------------------------------
# Whitelisted client helpers
# -------------------------------------------------------------------------

@frappe.whitelist()
def get_next_budget_period() -> dict:
    last_budget = frappe.get_all(
        "Personal Finance Monthly Budget",
        fields=[
            "name",
            "year",
            "month",
            "month_number",
            "creation",
        ],
        order_by="year desc, month_number desc, creation desc",
        limit=1,
    )

    if not last_budget:
        today = date.today()
        return build_period_dict(today.year, today.month)

    last = last_budget[0]

    last_year = int(last.get("year"))
    last_month_number = last.get("month_number")

    if not last_month_number:
        last_month = last.get("month")

        if last_month not in MONTH_NUMBER_BY_NAME:
            frappe.throw(
                _("Existing budget {0} has an invalid month value: {1}").format(
                    last.get("name"),
                    last_month,
                )
            )

        last_month_number = MONTH_NUMBER_BY_NAME[last_month]

    last_month_number = int(last_month_number)

    if last_month_number == 12:
        next_year = last_year + 1
        next_month_number = 1
    else:
        next_year = last_year
        next_month_number = last_month_number + 1

    return build_period_dict(next_year, next_month_number)


@frappe.whitelist()
def get_new_budget_defaults() -> dict:
    period = get_next_budget_period()

    target_year = int(period.get("year"))
    target_month_number = int(period.get("month_number"))

    return {
        "year": period.get("year"),
        "month": period.get("month"),
        "month_number": period.get("month_number"),
        "period": period.get("period"),
        "income": get_previous_income_snapshot(target_year, target_month_number),
        "expenses": get_previous_expense_snapshot(target_year, target_month_number),
        "assets": get_assets_snapshot(),
        "savings": get_savings_snapshot(),
        "debts": get_debts_snapshot(),
    }


@frappe.whitelist()
def calculate_budget_totals(doc: str | dict) -> dict:
    if isinstance(doc, str):
        doc = frappe.parse_json(doc)

    budget = frappe.get_doc(doc)
    budget.calculate_totals()

    return {
        "total_income": flt(budget.get("total_income")),
        "gross_payroll_income": flt(budget.get("gross_payroll_income")),
        "nett_payroll_income": flt(budget.get("nett_payroll_income")),
        "nett_income": flt(budget.get("nett_income")),
        "total_expenses": flt(budget.get("total_expenses")),
        "outstanding_expenses": flt(budget.get("outstanding_expenses")),
        "available_balance": flt(budget.get("available_balance")),
        "total_assets": flt(budget.get("total_assets")),
        "total_debts": flt(budget.get("total_debts")),
    }


@frappe.whitelist()
def get_expense_payment_context(expense_item: str | None = None) -> dict:
    flags = get_item_flags(expense_item)

    return {
        "is_debt_item": 1 if flags.get("is_debt_item") else 0,
        "is_savings_item": 1 if flags.get("is_savings_item") else 0,
    }


@frappe.whitelist()
def process_expense_payment(
    budget_name: str,
    expense_row_name: str | None = None,
    expense_row_idx: int | str | None = None,
    payment_date: str | None = None,
    credit_amount: float | int | str | None = 0,
) -> dict:
    """
    Processes the Make Payment button on an expense row.

    Behaviour:
        - Prevents duplicate processing if payment_made is already checked.
        - Sets payment_made = 1.
        - Sets payment_actual_date to the user-selected date.
        - If the expense item is a debt item, credits the matching row in
          Personal Finance Debts.
        - If the expense item is a savings item, credits the matching row in
          Personal Finance Savings.
    """

    if not budget_name:
        frappe.throw(_("Budget name is required."))

    if not payment_date:
        frappe.throw(_("Payment date is required."))

    payment_date = getdate(payment_date)

    budget = frappe.get_doc("Personal Finance Monthly Budget", budget_name)

    expense_row = find_expense_row(
        budget=budget,
        expense_row_name=expense_row_name,
        expense_row_idx=expense_row_idx,
    )

    if not expense_row:
        frappe.throw(_("The selected expense row was not found."))

    if expense_row.get("payment_made"):
        frappe.throw(
            _("This payment has already been processed."),
            title=_("Payment Already Made"),
        )

    expense_item = expense_row.get("expense_item")

    if not expense_item:
        frappe.throw(_("Please select an Expense Item before making payment."))

    flags = get_item_flags(expense_item)

    is_debt_item = flags.get("is_debt_item")
    is_savings_item = flags.get("is_savings_item")

    if is_debt_item and is_savings_item:
        frappe.throw(
            _(
                "The linked item {0} is marked as both a debt item and a savings item. "
                "Please correct the Personal Finance Item setup before processing payment."
            ).format(expense_item),
            title=_("Invalid Item Setup"),
        )

    if is_debt_item or is_savings_item:
        credit_amount = flt(credit_amount)

        if credit_amount <= 0:
            frappe.throw(_("Credit amount must be greater than zero."))

        if is_debt_item:
            credit_debt_item(expense_item, credit_amount, budget.name)

        if is_savings_item:
            credit_savings_item(expense_item, credit_amount, budget.name)

    expense_row.payment_made = 1
    expense_row.payment_actual_date = payment_date

    budget.calculate_totals()
    budget.save(ignore_permissions=True)

    return {
        "ok": True,
        "message": _("Payment processed."),
    }


def find_expense_row(
    budget: Document,
    expense_row_name: str | None = None,
    expense_row_idx: int | str | None = None,
):
    if expense_row_name:
        for row in budget.get("expenses") or []:
            if row.name == expense_row_name:
                return row

    if expense_row_idx:
        try:
            expense_row_idx = int(expense_row_idx)
        except (TypeError, ValueError):
            expense_row_idx = None

        if expense_row_idx:
            for row in budget.get("expenses") or []:
                if int(row.idx) == expense_row_idx:
                    return row

    return None


# -------------------------------------------------------------------------
# Personal Finance Item flag helpers
# -------------------------------------------------------------------------

def get_item_flags(item_name: str | None, cache: dict | None = None) -> dict:
    default_flags = {
        "is_payroll_income": False,
        "is_payroll_expense": False,
        "is_debt_item": False,
        "is_savings_item": False,
        "current_bank_balance": False,
    }

    if not item_name:
        return default_flags

    cache = cache if cache is not None else {}

    if item_name in cache:
        return cache[item_name]

    meta = frappe.get_meta("Personal Finance Item")

    possible_fields = [
        "is_payroll_income",
        "is_payroll_expense",
        "is_payroll_deduction",
        "is_debt_item",
        "is_savings_item",
        "current_bank_balance",
        "is_current_bank_balance",
    ]

    fields = [
        fieldname
        for fieldname in possible_fields
        if meta.get_field(fieldname)
    ]

    if not fields:
        cache[item_name] = default_flags
        return default_flags

    values = frappe.db.get_value(
        "Personal Finance Item",
        item_name,
        fields,
        as_dict=True,
    ) or {}

    flags = {
        "is_payroll_income": bool(values.get("is_payroll_income")),
        "is_payroll_expense": bool(
            values.get("is_payroll_expense")
            or values.get("is_payroll_deduction")
        ),
        "is_debt_item": bool(values.get("is_debt_item")),
        "is_savings_item": bool(values.get("is_savings_item")),
        "current_bank_balance": bool(
            values.get("current_bank_balance")
            or values.get("is_current_bank_balance")
        ),
    }

    cache[item_name] = flags
    return flags


# -------------------------------------------------------------------------
# Singleton update helpers
# -------------------------------------------------------------------------

def credit_debt_item(debt_item: str, credit_amount: float, budget_name: str):
    """
    Debts are stored as negative values.

    Example:
        Current debt: -10000
        Payment:       1500
        New debt:     -8500
    """

    debts_doc = frappe.get_single("Personal Finance Debts")

    target_row = None

    for row in debts_doc.get("debts") or []:
        if row.get("debt_item") == debt_item:
            target_row = row
            break

    if not target_row:
        frappe.throw(
            _("Debt item {0} was not found in Personal Finance Debts.").format(debt_item),
            title=_("Debt Item Not Found"),
        )

    target_row.current_value = flt(target_row.get("current_value")) + flt(credit_amount)
    target_row.update_budget = budget_name

    debts_doc.save(ignore_permissions=True)


def credit_savings_item(savings_item: str, credit_amount: float, budget_name: str):
    savings_doc = frappe.get_single("Personal Finance Savings")

    target_row = None

    for row in savings_doc.get("savings_list") or []:
        if row.get("asset_item") == savings_item:
            target_row = row
            break

    if not target_row:
        frappe.throw(
            _("Savings item {0} was not found in Personal Finance Savings.").format(
                savings_item
            ),
            title=_("Savings Item Not Found"),
        )

    target_row.asset_value = flt(target_row.get("asset_value")) + flt(credit_amount)
    target_row.updated_by = budget_name

    savings_doc.save(ignore_permissions=True)


# -------------------------------------------------------------------------
# Period / snapshot helpers
# -------------------------------------------------------------------------

def build_period_dict(year: int, month_number: int) -> dict:
    month = MONTH_NAME_BY_NUMBER[int(month_number)]

    return {
        "year": int(year),
        "month": month,
        "month_number": int(month_number),
        "period": f"{int(year)} - {month}",
    }


def get_latest_monthly_budget_name() -> str | None:
    latest = frappe.get_all(
        "Personal Finance Monthly Budget",
        fields=["name"],
        order_by="year desc, month_number desc, creation desc",
        limit=1,
    )

    if not latest:
        return None

    return latest[0].get("name")


def get_previous_income_snapshot(
    target_year: int,
    target_month_number: int,
) -> list[dict]:
    """
    Pull income rows from the latest previous Monthly Budget.

    Copies:
        - income_item
        - income_amount

    Generates:
        - income_date by incrementing the previous income_date by one month.
    """

    latest_budget_name = get_latest_monthly_budget_name()

    if not latest_budget_name:
        return []

    previous_budget = frappe.get_doc(
        "Personal Finance Monthly Budget",
        latest_budget_name,
    )

    rows = []

    for row in previous_budget.get("income") or []:
        rows.append(
            {
                "income_item": row.get("income_item"),
                "income_amount": row.get("income_amount"),
                "income_date": add_one_month_or_target_period(
                    source_date=row.get("income_date"),
                    target_year=target_year,
                    target_month_number=target_month_number,
                    fallback_day=1,
                ),
            }
        )

    return rows


def get_previous_expense_snapshot(
    target_year: int,
    target_month_number: int,
) -> list[dict]:
    """
    Pull expense rows from the latest previous Monthly Budget.

    Copies:
        - expense_item
        - expense_amount

    Generates:
        - payment_date by incrementing the previous payment_date by one month.

    Resets:
        - payment_actual_date
        - payment_made
    """

    latest_budget_name = get_latest_monthly_budget_name()

    if not latest_budget_name:
        return []

    previous_budget = frappe.get_doc(
        "Personal Finance Monthly Budget",
        latest_budget_name,
    )

    rows = []

    for row in previous_budget.get("expenses") or []:
        rows.append(
            {
                "expense_item": row.get("expense_item"),
                "expense_amount": row.get("expense_amount"),
                "payment_date": add_one_month_or_target_period(
                    source_date=row.get("payment_date"),
                    target_year=target_year,
                    target_month_number=target_month_number,
                    fallback_day=1,
                ),
                "payment_actual_date": None,
                "payment_made": 0,
            }
        )

    return rows


def add_one_month_or_target_period(
    source_date,
    target_year: int,
    target_month_number: int,
    fallback_day: int = 1,
):
    """
    If source_date exists:
        return source_date + 1 calendar month, clamped to the valid day.

    If source_date is missing:
        return target_year/target_month/fallback_day.
    """

    if source_date:
        try:
            source = getdate(source_date)

            year = int(source.year)
            month = int(source.month) + 1

            if month > 12:
                month = 1
                year += 1

            max_day = monthrange(year, month)[1]
            day = min(int(source.day), max_day)

            return date(year, month, day)
        except Exception:
            pass

    return date_in_target_period(
        target_year=target_year,
        target_month_number=target_month_number,
        day=fallback_day,
    )


def date_in_target_period(
    target_year: int,
    target_month_number: int,
    day: int = 1,
):
    max_day = monthrange(int(target_year), int(target_month_number))[1]
    day = min(max(int(day), 1), max_day)

    return date(int(target_year), int(target_month_number), day)


def get_assets_snapshot() -> list[dict]:
    try:
        doc = frappe.get_single("Personal Finance Assets")
    except frappe.DoesNotExistError:
        return []

    rows = []

    for row in doc.get("asset_list") or []:
        rows.append(
            {
                "asset_item": row.get("asset_item"),
                "asset_value": row.get("asset_value"),
                "date_asset_aqcuired": row.get("date_asset_aqcuired"),
            }
        )

    return rows


def get_savings_snapshot() -> list[dict]:
    try:
        doc = frappe.get_single("Personal Finance Savings")
    except frappe.DoesNotExistError:
        return []

    rows = []

    for row in doc.get("savings_list") or []:
        rows.append(
            {
                "asset_item": row.get("asset_item"),
                "asset_value": row.get("asset_value"),
                "updated_by": row.get("updated_by"),
            }
        )

    return rows


def get_debts_snapshot() -> list[dict]:
    try:
        doc = frappe.get_single("Personal Finance Debts")
    except frappe.DoesNotExistError:
        return []

    rows = []

    for row in doc.get("debts") or []:
        rows.append(
            {
                "debt_item": row.get("debt_item"),
                "current_value": row.get("current_value"),
                "update_budget": row.get("update_budget"),
                "inception_date": row.get("inception_date"),
                "completion_date": row.get("completion_date"),
            }
        )

    return rows


def set_existing_fields(doc: Document, values: dict):
    """
    Safely sets values only for fields that exist on the DocType.
    """

    meta = frappe.get_meta(doc.doctype)

    for fieldname, value in values.items():
        if meta.get_field(fieldname):
            doc.set(fieldname, value)
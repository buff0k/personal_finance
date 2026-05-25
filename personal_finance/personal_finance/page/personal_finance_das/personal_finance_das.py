# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe.utils import flt


@frappe.whitelist()
def get_dashboard_data(months: int | str = 12) -> dict:
    """
    Returns all data required by the Personal Finance Dashboard.

    Sources:
        - Personal Finance Assets singleton
        - Personal Finance Savings singleton
        - Personal Finance Debts singleton
        - Personal Finance Monthly Budget history

    Notes:
        - Savings are treated as part of the total asset portfolio.
        - Debts are stored as negative values.
    """

    months = int(months or 12)

    assets = get_assets_data()
    savings = get_savings_data()
    debts = get_debts_data()
    monthly = get_monthly_budget_data(months=months)

    total_assets = flt(assets.get("total"))
    total_savings = flt(savings.get("total"))
    total_debts = flt(debts.get("total"))

    asset_portfolio = total_assets + total_savings

    # Debts are stored as negative values, so this works naturally.
    net_worth = asset_portfolio + total_debts

    debt_exposure = abs(total_debts)
    debt_to_asset_ratio = 0

    if asset_portfolio:
        debt_to_asset_ratio = (debt_exposure / asset_portfolio) * 100

    return {
        "summary": {
            "total_assets": total_assets,
            "total_savings": total_savings,
            "asset_portfolio": asset_portfolio,
            "total_debts": total_debts,
            "net_worth": net_worth,
            "debt_to_asset_ratio": debt_to_asset_ratio,
            "latest_budget": monthly.get("latest_budget"),
        },
        "breakdowns": {
            "assets": assets.get("breakdown"),
            "savings": savings.get("breakdown"),
            "debts": debts.get("breakdown"),
            "income": monthly.get("income_breakdown"),
            "expenses": monthly.get("expense_breakdown"),
        },
        "trends": {
            "income_expense": monthly.get("income_expense_trend"),
            "income": monthly.get("income_trend"),
            "expenses": monthly.get("expense_trend"),
            "available_balance": monthly.get("available_balance_trend"),
        },
    }


def get_assets_data() -> dict:
    try:
        doc = frappe.get_single("Personal Finance Assets")
    except frappe.DoesNotExistError:
        return {
            "total": 0,
            "breakdown": [],
        }

    rows = []

    for row in doc.get("asset_list") or []:
        value = flt(row.get("asset_value"))

        if value <= 0:
            continue

        rows.append(
            {
                "label": row.get("asset_item") or "Unspecified",
                "value": value,
            }
        )

    return {
        "total": flt(doc.get("total")),
        "breakdown": combine_duplicate_labels(rows),
    }


def get_savings_data() -> dict:
    try:
        doc = frappe.get_single("Personal Finance Savings")
    except frappe.DoesNotExistError:
        return {
            "total": 0,
            "breakdown": [],
        }

    rows = []

    for row in doc.get("savings_list") or []:
        value = flt(row.get("asset_value"))

        if value <= 0:
            continue

        rows.append(
            {
                "label": row.get("asset_item") or "Unspecified",
                "value": value,
            }
        )

    return {
        "total": flt(doc.get("total")),
        "breakdown": combine_duplicate_labels(rows),
    }


def get_debts_data() -> dict:
    try:
        doc = frappe.get_single("Personal Finance Debts")
    except frappe.DoesNotExistError:
        return {
            "total": 0,
            "breakdown": [],
        }

    rows = []

    for row in doc.get("debts") or []:
        value = abs(flt(row.get("current_value")))

        if value <= 0:
            continue

        rows.append(
            {
                "label": row.get("debt_item") or "Unspecified",
                "value": value,
            }
        )

    return {
        "total": flt(doc.get("total")),
        "breakdown": combine_duplicate_labels(rows),
    }


def get_monthly_budget_data(months: int = 12) -> dict:
    budgets = frappe.get_all(
        "Personal Finance Monthly Budget",
        fields=[
            "name",
            "period",
            "year",
            "month",
            "month_number",
            "total_income",
            "gross_payroll_income",
            "nett_payroll_income",
            "nett_income",
            "total_expenses",
            "outstanding_expenses",
            "available_balance",
            "current_bank_balance",
        ],
        order_by="year desc, month_number desc, creation desc",
        limit=months,
    )

    budgets = list(reversed(budgets))

    latest_budget = None
    if budgets:
        latest_budget = budgets[-1]

    income_expense_trend = []
    income_trend = []
    expense_trend = []
    available_balance_trend = []

    for budget in budgets:
        label = budget.get("period") or budget.get("name")

        income_expense_trend.append(
            {
                "period": label,
                "total_income": flt(budget.get("total_income")),
                "total_expenses": flt(budget.get("total_expenses")),
                "nett_income": flt(budget.get("nett_income")),
                "outstanding_expenses": flt(budget.get("outstanding_expenses")),
            }
        )

        income_trend.append(
            {
                "period": label,
                "total_income": flt(budget.get("total_income")),
                "gross_payroll_income": flt(budget.get("gross_payroll_income")),
                "nett_payroll_income": flt(budget.get("nett_payroll_income")),
                "nett_income": flt(budget.get("nett_income")),
            }
        )

        expense_trend.append(
            {
                "period": label,
                "total_expenses": flt(budget.get("total_expenses")),
                "outstanding_expenses": flt(budget.get("outstanding_expenses")),
            }
        )

        available_balance_trend.append(
            {
                "period": label,
                "available_balance": flt(budget.get("available_balance")),
                "current_bank_balance": flt(budget.get("current_bank_balance")),
                "outstanding_expenses": flt(budget.get("outstanding_expenses")),
            }
        )

    income_breakdown = []
    expense_breakdown = []

    if latest_budget:
        latest_doc = frappe.get_doc(
            "Personal Finance Monthly Budget",
            latest_budget.get("name"),
        )

        for row in latest_doc.get("income") or []:
            value = flt(row.get("income_amount"))

            if value <= 0:
                continue

            income_breakdown.append(
                {
                    "label": row.get("income_item") or "Unspecified",
                    "value": value,
                }
            )

        for row in latest_doc.get("expenses") or []:
            value = flt(row.get("expense_amount"))

            if value <= 0:
                continue

            expense_breakdown.append(
                {
                    "label": row.get("expense_item") or "Unspecified",
                    "value": value,
                }
            )

    return {
        "latest_budget": latest_budget,
        "income_breakdown": combine_duplicate_labels(income_breakdown),
        "expense_breakdown": combine_duplicate_labels(expense_breakdown),
        "income_expense_trend": income_expense_trend,
        "income_trend": income_trend,
        "expense_trend": expense_trend,
        "available_balance_trend": available_balance_trend,
    }


def combine_duplicate_labels(rows: list[dict]) -> list[dict]:
    combined = {}

    for row in rows:
        label = row.get("label") or "Unspecified"
        combined[label] = combined.get(label, 0) + flt(row.get("value"))

    return [
        {
            "label": label,
            "value": value,
        }
        for label, value in sorted(
            combined.items(),
            key=lambda item: item[1],
            reverse=True,
        )
        if flt(value) != 0
    ]
# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe


def has_app_permission() -> bool:
    """
    Check whether the current user can access the Personal Finance app.

    Used from hooks.py:

        has_permission = "personal_finance.api.permission.has_app_permission"
    """

    # Administrator always has access
    if frappe.session.user == "Administrator":
        return True

    # Only users with this role can access the app
    return "Personal Finance User" in frappe.get_roles(frappe.session.user)
from __future__ import annotations

import frappe

MONEY_COLUMNS = {
    'Customs Entry': ['total_entered_value'],
    'Entry Invoice': ['invoice_amount'],
    'Entry Fee': ['amount'],
    'Entry Tariff Line': ['entered_value', 'duty_amount'],
}


def ensure_large_money_columns() -> None:
    for doctype, fieldnames in MONEY_COLUMNS.items():
        table = f"tab{doctype}"
        for fieldname in fieldnames:
            frappe.db.sql_ddl(
                f"ALTER TABLE `{table}` MODIFY COLUMN `{fieldname}` DECIMAL(24,2) NOT NULL DEFAULT 0.00"
            )

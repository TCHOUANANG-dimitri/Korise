from datetime import date

from pydantic import BaseModel


class ExpectedCashOut(BaseModel):
    closing_date: date
    expected_cash: int
    expected_momo: int
    expected_orange: int
    sales_total: int
    income_total: int
    expense_total: int
    withdrawal_total: int
    credit_repayment_total: int

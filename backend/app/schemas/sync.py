import uuid
from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel

from app.models.events import MoneyMovementChannel


class ManualMoneyMovementType(str, Enum):
    """Excludes "sale" and "credit_repayment": those are only ever derived
    server-side from a Sale / CreditRepaymentIn event."""

    income = "income"
    expense = "expense"
    withdrawal = "withdrawal"


class ManualStockMovementType(str, Enum):
    """Excludes "sale": that type is only ever derived server-side from a Sale event."""

    restock = "restock"
    adjustment = "adjustment"


class SaleIn(BaseModel):
    client_uuid: uuid.UUID
    product_id: uuid.UUID
    customer_id: uuid.UUID | None = None
    """Required when payment_method == "credit" — a credit sale must name a customer."""
    quantity: int
    unit_price: int
    payment_method: str
    """"cash", "mobile_money" or "credit"."""


class MoneyMovementIn(BaseModel):
    client_uuid: uuid.UUID
    type: ManualMoneyMovementType
    channel: MoneyMovementChannel
    """Required: every movement is cash or Mobile Money (historical rows == cash)."""
    amount: int
    reason: str | None = None
    category: str | None = None
    """Expense category (optional, free text)."""


class StockMovementIn(BaseModel):
    client_uuid: uuid.UUID
    product_id: uuid.UUID
    type: ManualStockMovementType
    quantity_delta: int
    reason: str | None = None


class CustomerIn(BaseModel):
    client_uuid: uuid.UUID
    full_name: str
    phone: str | None = None


class CreditRepaymentIn(BaseModel):
    client_uuid: uuid.UUID
    customer_id: uuid.UUID
    amount: int
    channel: MoneyMovementChannel
    note: str | None = None


class DailyClosingIn(BaseModel):
    """No `expected_cash`/`expected_momo` here on purpose: they are computed
    server-side from recorded money movements, never trusted from the client —
    see documentation/SYNC_DESIGN.md."""

    client_uuid: uuid.UUID
    closing_date: date
    actual_cash: int
    actual_momo: int
    actual_orange: int
    note: str | None = None


class ShiftIn(BaseModel):
    """Opening and closing of one work session, idempotent on client_uuid: the first push
    creates the shift (opened_at + opening_cash); a later push with closed_at + counted_cash
    closes it. expected_cash / difference are computed server-side, never trusted."""

    client_uuid: uuid.UUID
    opened_at: datetime
    opening_cash: int = 0
    closed_at: datetime | None = None
    counted_cash: int | None = None
    note: str | None = None


class PushRequest(BaseModel):
    sales: list[SaleIn] = []
    money_movements: list[MoneyMovementIn] = []
    stock_movements: list[StockMovementIn] = []
    daily_closings: list[DailyClosingIn] = []
    customers: list[CustomerIn] = []
    credit_repayments: list[CreditRepaymentIn] = []
    shifts: list[ShiftIn] = []


class PushResult(BaseModel):
    client_uuid: uuid.UUID
    status: str
    """"accepted" | "duplicate" | "rejected" """
    detail: str | None = None


class PushResponse(BaseModel):
    sales: list[PushResult] = []
    money_movements: list[PushResult] = []
    stock_movements: list[PushResult] = []
    daily_closings: list[PushResult] = []
    customers: list[PushResult] = []
    shifts: list[PushResult] = []
    credit_repayments: list[PushResult] = []
    """Idempotency is per client_uuid, so credit_repayments replay the same key
    once (e.g. device offline retry) and are marked duplicate, never double-applied."""


class PullResponse(BaseModel):
    sales: list[dict]
    money_movements: list[dict]
    stock_movements: list[dict]
    daily_closings: list[dict]
    customers: list[dict]
    cursors: dict[str, str | None]
    """Opaque strings, one per entity key. Echo back verbatim as the next `since_*` param."""

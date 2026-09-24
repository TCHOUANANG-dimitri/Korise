import uuid
from datetime import date, datetime, timezone
from enum import Enum

from sqlmodel import Field, SQLModel


class MoneyMovementChannel(str, Enum):
    cash = "cash"
    mobile_money = "mobile_money"
    orange_money = "orange_money"


class MoneyMovementType(str, Enum):
    sale = "sale"
    """Cash produced by a sale — created automatically, never entered manually."""
    income = "income"
    expense = "expense"
    withdrawal = "withdrawal"
    credit_repayment = "credit_repayment"
    """A credit repayment — money back in the till, linked to a Customer."""


class StockMovementType(str, Enum):
    sale = "sale"
    """Stock consumed by a sale — created automatically, never entered manually."""
    restock = "restock"
    adjustment = "adjustment"


class Sale(SQLModel, table=True):
    """The core business event: one sale updates money, stock and sales in one shot."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    client_uuid: uuid.UUID = Field(unique=True, index=True)
    """Generated on the device at capture time. Used as the offline-sync idempotency key."""
    business_id: uuid.UUID = Field(foreign_key="business.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id")
    product_id: uuid.UUID = Field(foreign_key="product.id")
    customer_id: uuid.UUID | None = Field(default=None, foreign_key="customer.id")
    """Set when the sale is on credit (payment_method == "credit") or when the
    sale is linked to a known credit customer."""
    quantity: int
    unit_price: int
    total_amount: int
    payment_method: str
    """One of "cash", "mobile_money", "credit" for the MVP."""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MoneyMovement(SQLModel, table=True):
    """Every FCFA in or out of the till, whether from a sale or entered manually."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    client_uuid: uuid.UUID = Field(unique=True, index=True)
    business_id: uuid.UUID = Field(foreign_key="business.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id")
    type: MoneyMovementType
    channel: MoneyMovementChannel | None = None
    """cash or mobile_money. NULL on historical rows (before the split) — treated as cash."""
    amount: int
    """Positive for money in, negative for money out."""
    reason: str | None = None
    category: str | None = None
    """Expense category chosen by the employee (transport, fournisseur, loyer...). Free text."""
    sale_id: uuid.UUID | None = Field(default=None, foreign_key="sale.id")
    customer_id: uuid.UUID | None = Field(default=None, foreign_key="customer.id")
    """Linked to a Customer on credit_repayment movements."""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StockMovement(SQLModel, table=True):
    """Every unit in or out of stock, whether from a sale or a manual restock/adjustment."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    client_uuid: uuid.UUID = Field(unique=True, index=True)
    business_id: uuid.UUID = Field(foreign_key="business.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id")
    product_id: uuid.UUID = Field(foreign_key="product.id")
    type: StockMovementType
    quantity_delta: int
    """Positive for stock in, negative for stock out."""
    reason: str | None = None
    sale_id: uuid.UUID | None = Field(default=None, foreign_key="sale.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AuditLog(SQLModel, table=True):
    """Who did what, when. Written alongside every sensitive action, never edited or deleted."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    business_id: uuid.UUID = Field(foreign_key="business.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id")
    action: str
    entity_type: str
    entity_id: uuid.UUID
    details: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DailyClosing(SQLModel, table=True):
    """The signature end-of-day reconciliation: expected cash vs counted cash.

    Three independent halves, one per channel: cash (expected_cash/actual_cash/difference),
    Mobile Money (expected_momo/actual_momo/difference_momo), Orange Money
    (expected_orange/actual_orange/difference_orange). Historical rows only carry the cash
    half; rows recorded before Orange Money existed as a channel carry cash+momo but not
    orange — all nullable for that reason, never backfilled.
    """

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    client_uuid: uuid.UUID = Field(unique=True, index=True)
    business_id: uuid.UUID = Field(foreign_key="business.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id")
    closing_date: date
    expected_cash: int
    actual_cash: int
    difference: int
    expected_momo: int | None = None
    actual_momo: int | None = None
    difference_momo: int | None = None
    expected_orange: int | None = None
    actual_orange: int | None = None
    difference_orange: int | None = None
    note: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

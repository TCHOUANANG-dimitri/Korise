import uuid
from datetime import datetime

from pydantic import BaseModel


class CustomerWithBalance(BaseModel):
    """A customer and what they currently owe — balance is derived, never stored."""

    id: uuid.UUID
    client_uuid: uuid.UUID
    full_name: str
    phone: str | None = None
    balance: int
    """How much this customer owes right now: sum of credit sales minus repayments."""


class CustomerOut(CustomerWithBalance):
    """Public view for the /customers endpoints."""


class CustomerTransactionOut(BaseModel):
    """One line of a customer's history: a credit sale or a repayment."""

    kind: str
    """"sale" | "repayment" """
    created_at: datetime
    amount: int
    """For a sale: total owed. For a repayment: money back in (positive)."""
    product_name: str | None = None
    quantity: int | None = None
    channel: str | None = None
    note: str | None = None


class CustomerDetailOut(CustomerWithBalance):
    """Full view: balance + ordered transaction history."""

    created_at: datetime
    transactions: list[CustomerTransactionOut]
    """Most recent first."""
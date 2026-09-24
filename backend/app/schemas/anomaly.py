import uuid
from datetime import date, datetime

from pydantic import BaseModel


class AnomalyOut(BaseModel):
    """One derived anomaly shown in the web /anomalies screen.

    `amount` is a signed FCFA gap (closing) or a negative quantity delta (stock)
    or a price deviation — the exact meaning depends on `kind`.
    """

    kind: str
    """"closing_gap" | "stock_adjustment" | "price_deviation" | "shift_gap" """
    label: str
    """Human-readable title, e.g. "Écart de clôture — 3 500 FCFA"."""
    detail: str | None = None
    probable_cause: str | None = None
    """Heuristic explanation shown next to the amount (cahier fonctionnel §7.1)."""
    amount: int | None = None
    date: date | datetime
    product_name: str | None = None
    user_name: str | None = None
    source_type: str
    source_id: uuid.UUID
    status: str
    """"open" | "resolved" """
    resolved_at: datetime | None = None
    resolution_note: str | None = None


class AnomalyResolveIn(BaseModel):
    note: str | None = None


class RelatedOperationOut(BaseModel):
    """One operation that contributed to an anomaly (drill-down "historique d'un écart")."""

    at: datetime
    kind: str
    """sale | money_movement | stock_movement | credit_repayment | shift"""
    label: str
    amount: int | None = None
    channel: str | None = None
    user_name: str | None = None

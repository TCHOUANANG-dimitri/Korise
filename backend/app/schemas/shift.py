import uuid
from datetime import datetime

from pydantic import BaseModel


class ShiftOut(BaseModel):
    id: uuid.UUID
    client_uuid: uuid.UUID
    user_id: uuid.UUID
    user_name: str | None
    opened_at: datetime
    opening_cash: int
    closed_at: datetime | None
    counted_cash: int | None
    expected_cash: int | None
    difference: int | None
    note: str | None
    operations_count: int = 0
    sales_total: int = 0

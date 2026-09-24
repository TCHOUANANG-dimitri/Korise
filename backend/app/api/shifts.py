from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.deps import CurrentUser, get_current_user
from app.db.session import get_session
from app.models.events import MoneyMovement, Sale
from app.models.shift import Shift
from app.models.user import User, UserRole
from app.schemas.shift import ShiftOut

router = APIRouter(prefix="/shifts", tags=["shifts"])


def _to_out(session: Session, shift: Shift, user_name: str | None) -> ShiftOut:
    end = shift.closed_at or _far_future()
    ops = session.exec(
        select(func.count(MoneyMovement.id))
        .where(MoneyMovement.business_id == shift.business_id)
        .where(MoneyMovement.user_id == shift.user_id)
        .where(MoneyMovement.created_at >= shift.opened_at)
        .where(MoneyMovement.created_at <= end)
    ).one()
    sales_total = session.exec(
        select(func.coalesce(func.sum(Sale.total_amount), 0))
        .where(Sale.business_id == shift.business_id)
        .where(Sale.user_id == shift.user_id)
        .where(Sale.created_at >= shift.opened_at)
        .where(Sale.created_at <= end)
    ).one()
    return ShiftOut(
        id=shift.id,
        client_uuid=shift.client_uuid,
        user_id=shift.user_id,
        user_name=user_name,
        opened_at=shift.opened_at,
        opening_cash=shift.opening_cash,
        closed_at=shift.closed_at,
        counted_cash=shift.counted_cash,
        expected_cash=shift.expected_cash,
        difference=shift.difference,
        note=shift.note,
        operations_count=int(ops),
        sales_total=int(sales_total),
    )


def _far_future():
    from datetime import datetime

    return datetime(2100, 1, 1)


@router.get("", response_model=list[ShiftOut])
def list_shifts(
    limit: int = 50,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Owner: every shift of the business (who opened, cash gap). Employee: only their own."""
    query = (
        select(Shift, User.full_name)
        .join(User, User.id == Shift.user_id)
        .where(Shift.business_id == current_user.business_id)
    )
    if current_user.role != UserRole.owner:
        query = query.where(Shift.user_id == current_user.id)
    rows = session.exec(query.order_by(Shift.opened_at.desc()).limit(min(limit, 200))).all()
    return [_to_out(session, shift, name) for shift, name in rows]

import uuid
from datetime import date

from sqlmodel import Session, select
from sqlalchemy import String, func

from app.models.events import MoneyMovement, MoneyMovementChannel, MoneyMovementType


def _channel_of(coalesced_channel: str | None) -> MoneyMovementChannel:
    """Rows before the split have channel = NULL — they count as cash."""
    if coalesced_channel == MoneyMovementChannel.mobile_money.value:
        return MoneyMovementChannel.mobile_money
    if coalesced_channel == MoneyMovementChannel.orange_money.value:
        return MoneyMovementChannel.orange_money
    return MoneyMovementChannel.cash


def compute_expected_amounts(
    session: Session, business_id: uuid.UUID, closing_date: date
) -> tuple[int, int, int]:
    """Total money *actually expected to have arrived* that calendar day, split
    into (cash, mobile_money, orange_money). Every MoneyMovement type counts (sales,
    manual income, expenses, withdrawals, credit repayments), grouped by channel.

    Historical rows with channel = NULL are treated as cash. Per SYNC_DESIGN.md,
    this is deliberately per-day, not a running balance: each day is reconciled
    independently.
    """
    channel = MoneyMovement.channel.cast(String)
    coalesced = func.coalesce(channel, "cash")
    rows = session.exec(
        select(coalesced, func.coalesce(func.sum(MoneyMovement.amount), 0))
        .where(MoneyMovement.business_id == business_id)
        .where(func.date(MoneyMovement.created_at) == closing_date)
        .group_by(coalesced)
    ).all()

    totals = {c.value: 0 for c in MoneyMovementChannel}
    for raw_channel, total in rows:
        totals[_channel_of(raw_channel).value] += int(total)

    return (
        totals[MoneyMovementChannel.cash.value],
        totals[MoneyMovementChannel.mobile_money.value],
        totals[MoneyMovementChannel.orange_money.value],
    )


def compute_expected_cash(session: Session, business_id: uuid.UUID, closing_date: date) -> int:
    """Backwards-compatible alias: the cash half of the split expectation."""
    cash, _, _ = compute_expected_amounts(session, business_id, closing_date)
    return cash


def compute_expected_cash_breakdown(session: Session, business_id: uuid.UUID, closing_date: date) -> dict:
    """Detailed breakdown for the closing screen and the dashboard.

    expected_cash/expected_momo/expected_orange are the per-channel totals (the three
    halves the seller has to count and reconcile). The per-type subtotals (sales_total,
    income_total, …) stay channel-agnostic.
    """
    cash, momo, orange = compute_expected_amounts(session, business_id, closing_date)

    rows = session.exec(
        select(MoneyMovement.type, func.coalesce(func.sum(MoneyMovement.amount), 0))
        .where(MoneyMovement.business_id == business_id)
        .where(func.date(MoneyMovement.created_at) == closing_date)
        .group_by(MoneyMovement.type)
    ).all()

    totals = {t: 0 for t in MoneyMovementType}
    for movement_type, total in rows:
        totals[MoneyMovementType(movement_type)] = int(total)

    return {
        "closing_date": closing_date,
        "expected_cash": cash,
        "expected_momo": momo,
        "expected_orange": orange,
        "sales_total": totals[MoneyMovementType.sale],
        "income_total": totals[MoneyMovementType.income],
        "expense_total": totals[MoneyMovementType.expense],
        "withdrawal_total": totals[MoneyMovementType.withdrawal],
        "credit_repayment_total": totals[MoneyMovementType.credit_repayment],
    }
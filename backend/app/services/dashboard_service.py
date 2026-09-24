import uuid
from datetime import date

from sqlmodel import Session, select
from sqlalchemy import func

from app.models.catalog import Product
from app.models.events import DailyClosing, Sale
from app.models.user import User
from app.services.closing_service import compute_expected_cash_breakdown

TOP_PRODUCTS_LIMIT = 5


def _stock_alerts(session: Session, business_id: uuid.UUID) -> list[dict]:
    products = session.exec(
        select(Product)
        .where(Product.business_id == business_id)
        .where(Product.is_active == True)  # noqa: E712
        .where(Product.is_stockable == True)  # noqa: E712
        .where(Product.quantity <= Product.minimum_stock)
    ).all()
    return [
        {
            "product_id": p.id,
            "name": p.name,
            "quantity": p.quantity,
            "minimum_stock": p.minimum_stock,
        }
        for p in products
    ]


def _top_products(session: Session, business_id: uuid.UUID, day: date) -> list[dict]:
    rows = session.exec(
        select(
            Sale.product_id,
            Product.name,
            func.sum(Sale.quantity),
            func.sum(Sale.total_amount),
        )
        .join(Product, Product.id == Sale.product_id)
        .where(Sale.business_id == business_id)
        .where(func.date(Sale.created_at) == day)
        .group_by(Sale.product_id, Product.name)
        .order_by(func.sum(Sale.total_amount).desc())
        .limit(TOP_PRODUCTS_LIMIT)
    ).all()
    return [
        {"product_id": product_id, "name": name, "quantity_sold": int(qty), "revenue": int(revenue)}
        for product_id, name, qty, revenue in rows
    ]


def _employee_activity(session: Session, business_id: uuid.UUID, day: date) -> list[dict]:
    rows = session.exec(
        select(
            Sale.user_id,
            User.full_name,
            func.count(Sale.id),
            func.sum(Sale.total_amount),
        )
        .join(User, User.id == Sale.user_id)
        .where(Sale.business_id == business_id)
        .where(func.date(Sale.created_at) == day)
        .group_by(Sale.user_id, User.full_name)
        .order_by(func.sum(Sale.total_amount).desc())
    ).all()
    return [
        {"user_id": user_id, "full_name": full_name, "sales_count": int(count), "sales_total": int(total)}
        for user_id, full_name, count, total in rows
    ]


def _latest_closing(session: Session, business_id: uuid.UUID, day: date) -> dict | None:
    closing = session.exec(
        select(DailyClosing)
        .where(DailyClosing.business_id == business_id)
        .where(DailyClosing.closing_date == day)
        .order_by(DailyClosing.created_at.desc())
    ).first()
    if closing is None:
        return None
    return {
        "actual_cash": closing.actual_cash,
        "expected_cash": closing.expected_cash,
        "difference": closing.difference,
        "note": closing.note,
        "created_at": closing.created_at,
    }


def build_dashboard(session: Session, business_id: uuid.UUID, day: date) -> dict:
    breakdown = compute_expected_cash_breakdown(session, business_id, day)
    return {
        "day": day,
        "sales_total": breakdown["sales_total"],
        "expense_total": breakdown["expense_total"],
        "income_total": breakdown["income_total"],
        "withdrawal_total": breakdown["withdrawal_total"],
        "expected_cash": breakdown["expected_cash"],
        "latest_closing": _latest_closing(session, business_id, day),
        "stock_alerts": _stock_alerts(session, business_id),
        "top_products": _top_products(session, business_id, day),
        "employee_activity": _employee_activity(session, business_id, day),
    }

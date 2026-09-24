import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from app.api.deps import CurrentUser, get_current_user, require_dashboard_access, require_owner
from app.db.session import get_session
from app.models.business import Business
from app.models.catalog import Product
from app.models.customer import Customer
from app.models.events import Sale
from app.models.user import User
from app.services import pdf_service, report_service
from app.services.anomaly_service import list_anomalies
from app.services.platform_service import record_event

router = APIRouter(tags=["reports"])


def _track(session: Session, user: CurrentUser) -> None:
    """Feature-usage event for the Super Admin analytics (« rapports » is not derivable from
    the business tables, since reports write nothing)."""
    record_event(session, "feature.report", business_id=user.business_id, user_id=user.id)
    session.commit()


def _pdf(content: bytes, filename: str) -> Response:
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/reports/summary")
def summary(
    date_from: date | None = None,
    date_to: date | None = None,
    user_id: uuid.UUID | None = None,
    product_id: uuid.UUID | None = None,
    payment_method: str | None = None,
    current_user: CurrentUser = Depends(require_dashboard_access),
    session: Session = Depends(get_session),
):
    _track(session, current_user)
    today = date.today()
    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=6))
    return report_service.summary(
        session,
        current_user.business_id,
        date_from,
        date_to,
        user_id=user_id,
        product_id=product_id,
        payment_method=payment_method,
        with_costs=current_user.can_view_purchase_prices,
    )


@router.get("/reports/daily.pdf")
def daily_pdf(
    day: date,
    current_user: CurrentUser = Depends(require_dashboard_access),
    session: Session = Depends(get_session),
):
    _track(session, current_user)
    business = session.get(Business, current_user.business_id)
    data = report_service.day_report(session, current_user.business_id, day, current_user.can_view_purchase_prices)
    return _pdf(pdf_service.daily_report_pdf(business, day, data), f"rapport-journalier-{day.isoformat()}.pdf")


@router.get("/reports/stock.pdf")
def stock_pdf(
    current_user: CurrentUser = Depends(require_dashboard_access),
    session: Session = Depends(get_session),
):
    _track(session, current_user)
    business = session.get(Business, current_user.business_id)
    rows = report_service.stock_report(session, current_user.business_id, current_user.can_view_purchase_prices)
    return _pdf(pdf_service.stock_report_pdf(business, rows, current_user.can_view_purchase_prices), "rapport-stock.pdf")


@router.get("/reports/employee.pdf")
def employee_pdf(
    user_id: uuid.UUID,
    date_from: date | None = None,
    date_to: date | None = None,
    current_user: CurrentUser = Depends(require_owner),
    session: Session = Depends(get_session),
):
    _track(session, current_user)
    user = session.get(User, user_id)
    if user is None or user.business_id != current_user.business_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employé introuvable")
    date_to = date_to or date.today()
    date_from = date_from or (date_to - timedelta(days=29))
    business = session.get(Business, current_user.business_id)
    data = report_service.employee_report(session, current_user.business_id, user_id, date_from, date_to)
    return _pdf(pdf_service.employee_report_pdf(business, date_from, date_to, data), "rapport-employe.pdf")


@router.get("/reports/anomalies.pdf")
def anomalies_pdf(
    days: int = 30,
    current_user: CurrentUser = Depends(require_owner),
    session: Session = Depends(get_session),
):
    _track(session, current_user)
    business = session.get(Business, current_user.business_id)
    anomalies = list_anomalies(session, current_user.business_id, days=days)
    return _pdf(pdf_service.anomalies_report_pdf(business, anomalies), "rapport-anomalies.pdf")


def _sales_context(session: Session, business_id: uuid.UUID, refs: list[uuid.UUID]):
    """A basket = one or several sale lines. Each is addressed by its server id OR the
    client_uuid the device knows offline."""
    lines = []
    for ref in refs:
        sale = session.get(Sale, ref)
        if sale is None or sale.business_id != business_id:
            sale = session.exec(select(Sale).where(Sale.client_uuid == ref, Sale.business_id == business_id)).first()
        if sale is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "Vente introuvable — elle n'est peut-être pas encore synchronisée",
            )
        product = session.get(Product, sale.product_id)
        lines.append((product.name if product else "Produit", sale))
    if not lines:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Aucune vente indiquée")
    head = lines[0][1]
    seller = session.get(User, head.user_id)
    customer = session.get(Customer, head.customer_id) if head.customer_id else None
    return lines, (seller.full_name if seller else "—"), customer


def _parse_refs(refs: str) -> list[uuid.UUID]:
    try:
        return [uuid.UUID(x) for x in refs.split(",") if x.strip()][:50]
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Références de vente invalides")


@router.get("/receipts.pdf")
def receipt_basket(
    refs: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lines, seller, customer = _sales_context(session, current_user.business_id, _parse_refs(refs))
    business = session.get(Business, current_user.business_id)
    content = pdf_service.receipt_pdf(business, lines, seller, customer.full_name if customer else None)
    return _pdf(content, f"recu-{str(lines[0][1].id)[:8]}.pdf")


@router.get("/invoices.pdf")
def invoice_basket(
    refs: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lines, seller, customer = _sales_context(session, current_user.business_id, _parse_refs(refs))
    business = session.get(Business, current_user.business_id)
    return _pdf(pdf_service.invoice_pdf(business, lines, seller, customer), f"facture-{str(lines[0][1].id)[:8]}.pdf")


@router.get("/receipts/{ref}.pdf")
def receipt(
    ref: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lines, seller, customer = _sales_context(session, current_user.business_id, [ref])
    business = session.get(Business, current_user.business_id)
    content = pdf_service.receipt_pdf(business, lines, seller, customer.full_name if customer else None)
    return _pdf(content, f"recu-{str(lines[0][1].id)[:8]}.pdf")


@router.get("/invoices/{ref}.pdf")
def invoice(
    ref: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lines, seller, customer = _sales_context(session, current_user.business_id, [ref])
    business = session.get(Business, current_user.business_id)
    return _pdf(pdf_service.invoice_pdf(business, lines, seller, customer), f"facture-{str(lines[0][1].id)[:8]}.pdf")

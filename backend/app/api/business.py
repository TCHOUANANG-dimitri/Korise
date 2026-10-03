from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session

from app.api.deps import CurrentUser, get_current_user, require_owner
from app.db.session import get_session
from app.models.business import Business
from app.models.events import AuditLog
from app.schemas.business import BusinessDeletionRequest, BusinessOut, BusinessUpdate
from app.services import export_service, pdf_service
from app.services.account_service import cancel_business_deletion, schedule_business_deletion

router = APIRouter(prefix="/business", tags=["business"])

MAX_LOGO_CHARS = 400_000  # ~300 KB once base64-decoded


def _out(b: Business) -> BusinessOut:
    return BusinessOut(
        id=str(b.id),
        name=b.name,
        business_code=b.business_code,
        sector=b.sector,
        address=b.address,
        phone=b.phone,
        email=b.email,
        logo_data=b.logo_data,
        deletion_scheduled_for=b.deletion_scheduled_for,
    )


@router.get("/me", response_model=BusinessOut)
def get_me(
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return _out(session.get(Business, current_user.business_id))


@router.patch("/me", response_model=BusinessOut)
def update_me(
    body: BusinessUpdate,
    current_user: CurrentUser = Depends(require_owner),
    session: Session = Depends(get_session),
):
    business = session.get(Business, current_user.business_id)
    changes = body.model_dump(exclude_unset=True)
    if "logo_data" in changes:
        logo = changes["logo_data"] or None
        if logo and (not logo.startswith("data:image/") or len(logo) > MAX_LOGO_CHARS):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Logo invalide (image ≤ 300 Ko)")
        changes["logo_data"] = logo
    if "name" in changes and not (changes["name"] or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Le nom ne peut pas être vide")
    for field, value in changes.items():
        setattr(business, field, value)
    session.add(business)
    session.flush()
    session.add(
        AuditLog(
            business_id=business.id,
            user_id=current_user.id,
            action="business.updated",
            entity_type="business",
            entity_id=business.id,
            details=",".join(sorted(changes)),
        )
    )
    session.commit()
    session.refresh(business)
    return _out(business)


# ------------------------------------------------ suppression du compte (propriétaire)


@router.post("/me/deletion", response_model=BusinessOut)
def request_deletion(
    body: BusinessDeletionRequest,
    current_user: CurrentUser = Depends(require_owner),
    session: Session = Depends(get_session),
):
    """PIN re-vérifié, puis suppression programmée dans 7 jours (annulable jusque-là)."""
    return _out(schedule_business_deletion(session, current_user.business_id, current_user.id, body.pin, body.export_first))


@router.delete("/me/deletion", response_model=BusinessOut)
def cancel_deletion(
    current_user: CurrentUser = Depends(require_owner),
    session: Session = Depends(get_session),
):
    return _out(cancel_business_deletion(session, current_user.business_id, current_user.id))


@router.get("/export.pdf")
def export_pdf(
    current_user: CurrentUser = Depends(require_owner),
    session: Session = Depends(get_session),
):
    history = export_service.collect(session, current_user.business_id)
    return Response(
        content=pdf_service.history_pdf(history),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="historique-korise.pdf"'},
    )


@router.get("/export.xlsx")
def export_xlsx(
    current_user: CurrentUser = Depends(require_owner),
    session: Session = Depends(get_session),
):
    history = export_service.collect(session, current_user.business_id)
    return Response(
        content=export_service.history_xlsx(history),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="historique-korise.xlsx"'},
    )

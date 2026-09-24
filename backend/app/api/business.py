from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import CurrentUser, get_current_user, require_owner
from app.db.session import get_session
from app.models.business import Business
from app.models.events import AuditLog
from app.schemas.business import BusinessOut, BusinessUpdate

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

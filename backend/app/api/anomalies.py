import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import CurrentUser, require_owner
from app.db.session import get_session
from app.models.events import DailyClosing
from app.schemas.anomaly import AnomalyOut, AnomalyResolveIn, RelatedOperationOut
from app.services.anomaly_service import list_anomalies, related_operations, resolve_anomaly

router = APIRouter(prefix="/anomalies", tags=["anomalies"])


@router.get("", response_model=list[AnomalyOut])
def anomalies(
    days: int = 14,
    only_open: bool = False,
    _owner: CurrentUser = Depends(require_owner),
    session: Session = Depends(get_session),
):
    return list_anomalies(session, _owner.business_id, days=days, only_open=only_open)


@router.get("/{anomaly_type}/{source_id}/operations", response_model=list[RelatedOperationOut])
def operations(
    anomaly_type: str,
    source_id: uuid.UUID,
    _owner: CurrentUser = Depends(require_owner),
    session: Session = Depends(get_session),
):
    return related_operations(session, _owner.business_id, anomaly_type, source_id)


@router.post("/{anomaly_type}/{source_id}/resolve", response_model=AnomalyOut)
def resolve(
    anomaly_type: str,
    source_id: uuid.UUID,
    body: AnomalyResolveIn,
    _owner: CurrentUser = Depends(require_owner),
    session: Session = Depends(get_session),
):
    if anomaly_type not in {"closing_gap", "stock_adjustment", "price_deviation", "shift_gap"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Type d'anomalie inconnu")

    # L'extra conservé en base est recalculé côté serveur, jamais pris tel quel du client.
    source_extra = None
    if anomaly_type == "closing_gap":
        closing = session.get(DailyClosing, source_id)
        if closing is None or closing.business_id != _owner.business_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Clôture introuvable pour cette entreprise")
        source_extra = closing.closing_date.isoformat()

    resolve_anomaly(
        session,
        business_id=_owner.business_id,
        user_id=_owner.id,
        anomaly_type=anomaly_type,
        source_id=source_id,
        source_extra=source_extra,
        note=body.note,
    )
    # Re-dérive la liste complète : la résolution vient de s'écrire, l'anomalie est "resolved".
    all_anomalies = list_anomalies(session, _owner.business_id)
    for a in all_anomalies:
        if a.source_type == {"closing_gap": "daily_closing", "stock_adjustment": "stock_movement", "price_deviation": "sale", "shift_gap": "shift"}[anomaly_type] and a.source_id == source_id:
            return a
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Anomalie introuvable")
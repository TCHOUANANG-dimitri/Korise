import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.admin_deps import CurrentSuperAdmin, get_current_super_admin, require_admin_roles
from app.core.security import hash_password
from app.db.session import get_session
from app.models.admin import SuperAdminRole, SuperAdminUser
from app.models.billing import Plan, PlanPeriod, Subscription, SubscriptionStatus
from app.models.business import Business
from app.models.platform import AdminAuditLog, AdminNote, SupportTicket, TicketStatus
from app.models.user import User, UserRole
from app.schemas.admin import (
    AdminAuditOut,
    AdminOverviewOut,
    AdminUserIn,
    AdminUserOut,
    AdminUserUpdate,
    AlertOut,
    AnalyticsOut,
    BillingOut,
    BusinessDetailOut,
    BusinessListItemOut,
    ConfirmIn,
    DeviceOut,
    MonitoringOut,
    NoteIn,
    NoteOut,
    PlanIn,
    PlanOut,
    PlanUpdate,
    SearchHit,
    SubscriptionChange,
    TicketIn,
    TicketOut,
    TicketUpdate,
)
from app.services import admin_service
from app.services.platform_service import record_event

router = APIRouter(prefix="/admin", tags=["admin"])

OWNER = SuperAdminRole.owner.value
PM = SuperAdminRole.product_manager.value
SUPPORT = SuperAdminRole.support.value
DEV = SuperAdminRole.developer.value

# Who sees what (cahier Super Admin §16 — least privilege).
ANY_ADMIN = require_admin_roles(OWNER, PM, SUPPORT, DEV)
PRODUCT_ACCESS = require_admin_roles(OWNER, PM)
TECH_ACCESS = require_admin_roles(OWNER, DEV, SUPPORT)
SUPPORT_ACCESS = require_admin_roles(OWNER, SUPPORT)
FINANCE_ACCESS = require_admin_roles(OWNER, PM)
OWNER_ONLY = require_admin_roles(OWNER)


def _audit(
    session: Session,
    admin: CurrentSuperAdmin,
    action: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    details: str | None = None,
) -> None:
    session.add(AdminAuditLog(admin_id=admin.id, action=action, target_type=target_type, target_id=target_id, details=details))


def _business(session: Session, business_id: uuid.UUID) -> Business:
    b = session.get(Business, business_id)
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entreprise introuvable")
    return b


# ------------------------------------------------------------------ read models


@router.get("/overview", response_model=AdminOverviewOut)
def overview(admin: CurrentSuperAdmin = Depends(ANY_ADMIN), session: Session = Depends(get_session)):
    return admin_service.get_overview(session, include_billing=admin.role in (OWNER, PM))


@router.get("/alerts", response_model=list[AlertOut])
def alerts(admin: CurrentSuperAdmin = Depends(ANY_ADMIN), session: Session = Depends(get_session)):
    return admin_service.build_alerts(session, include_billing=admin.role in (OWNER, PM))


@router.get("/search", response_model=list[SearchHit])
def search(q: str, _admin: CurrentSuperAdmin = Depends(ANY_ADMIN), session: Session = Depends(get_session)):
    needle = f"%{q.strip().lower()}%"
    if len(q.strip()) < 2:
        return []
    rows = session.exec(
        select(Business)
        .where((Business.name.ilike(needle)) | (Business.business_code.ilike(needle)))
        .order_by(Business.name)
        .limit(8)
    ).all()
    owners = {u.business_id: u.full_name for u in session.exec(select(User).where(User.role == UserRole.owner)).all()}
    return [SearchHit(business_id=b.id, name=b.name, business_code=b.business_code, owner_full_name=owners.get(b.id)) for b in rows]


@router.get("/businesses", response_model=list[BusinessListItemOut])
def businesses(_admin: CurrentSuperAdmin = Depends(ANY_ADMIN), session: Session = Depends(get_session)):
    return admin_service.list_businesses(session)


@router.get("/businesses/{business_id}", response_model=BusinessDetailOut)
def business_detail(business_id: uuid.UUID, admin: CurrentSuperAdmin = Depends(ANY_ADMIN), session: Session = Depends(get_session)):
    detail = admin_service.get_business_detail(session, business_id)
    if detail is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entreprise introuvable")
    if admin.role == DEV:
        detail.notes = []  # notes / tickets are support material
        detail.tickets = []
    return detail


@router.get("/analytics", response_model=AnalyticsOut)
def analytics(
    days: int = 30,
    plan_id: uuid.UUID | None = None,
    platform: str | None = None,
    app_version: str | None = None,
    activity: str | None = None,
    _admin: CurrentSuperAdmin = Depends(PRODUCT_ACCESS),
    session: Session = Depends(get_session),
):
    return admin_service.get_analytics(session, days, plan_id, platform, app_version, activity)


@router.get("/monitoring", response_model=MonitoringOut)
def monitoring(_admin: CurrentSuperAdmin = Depends(TECH_ACCESS), session: Session = Depends(get_session)):
    return admin_service.get_monitoring(session)


@router.get("/devices", response_model=list[DeviceOut])
def devices(business_id: uuid.UUID | None = None, _admin: CurrentSuperAdmin = Depends(TECH_ACCESS), session: Session = Depends(get_session)):
    return admin_service.list_devices(session, business_id)


# ------------------------------------------------------------------ business actions (confirmation UI-side, audited here)


@router.post("/businesses/{business_id}/suspend", response_model=BusinessDetailOut)
def suspend(
    business_id: uuid.UUID,
    body: ConfirmIn,
    admin: CurrentSuperAdmin = Depends(SUPPORT_ACCESS),
    session: Session = Depends(get_session),
):
    b = _business(session, business_id)
    b.is_suspended = True
    session.add(b)
    _audit(session, admin, "business.suspend", "business", b.id, body.reason)
    record_event(session, "business.suspended", business_id=b.id, meta={"reason": body.reason})
    session.commit()
    return admin_service.get_business_detail(session, business_id)


@router.post("/businesses/{business_id}/reactivate", response_model=BusinessDetailOut)
def reactivate(
    business_id: uuid.UUID,
    body: ConfirmIn,
    admin: CurrentSuperAdmin = Depends(SUPPORT_ACCESS),
    session: Session = Depends(get_session),
):
    b = _business(session, business_id)
    b.is_suspended = False
    session.add(b)
    _audit(session, admin, "business.reactivate", "business", b.id, body.reason)
    record_event(session, "business.reactivated", business_id=b.id, meta={"reason": body.reason})
    session.commit()
    return admin_service.get_business_detail(session, business_id)


@router.post("/businesses/{business_id}/subscription", response_model=BusinessDetailOut)
def change_subscription(
    business_id: uuid.UUID,
    body: SubscriptionChange,
    admin: CurrentSuperAdmin = Depends(OWNER_ONLY),
    session: Session = Depends(get_session),
):
    """View/change plan, extend a trial, suspend/reactivate the subscription (cahier §15)."""
    _business(session, business_id)
    sub = session.exec(select(Subscription).where(Subscription.business_id == business_id)).first()
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Abonnement introuvable")
    before = f"{sub.status.value}/{sub.plan_id}"
    now = datetime.utcnow()
    if body.plan_id is not None:
        plan = session.get(Plan, body.plan_id)
        if plan is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan introuvable")
        sub.plan_id = plan.id
        if plan.price > 0 and sub.converted_at is None:
            sub.converted_at = now
    if body.status is not None:
        try:
            sub.status = SubscriptionStatus(body.status)
        except ValueError:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Statut d'abonnement inconnu")
    if body.extend_trial_days:
        base = sub.trial_ends_at if sub.trial_ends_at and sub.trial_ends_at > now else now
        sub.trial_ends_at = base + timedelta(days=body.extend_trial_days)
        sub.status = SubscriptionStatus.trial
    if body.current_period_ends_at is not None:
        sub.current_period_ends_at = body.current_period_ends_at.replace(tzinfo=None)
    sub.updated_at = now
    session.add(sub)
    _audit(session, admin, "subscription.change", "business", business_id, f"{before} -> {sub.status.value}/{sub.plan_id}")
    record_event(session, "subscription.changed", business_id=business_id, meta={"status": sub.status.value})
    session.commit()
    return admin_service.get_business_detail(session, business_id)


@router.post("/businesses/{business_id}/users/{user_id}/deactivate", response_model=BusinessDetailOut)
def deactivate_business_user(
    business_id: uuid.UUID,
    user_id: uuid.UUID,
    body: ConfirmIn,
    admin: CurrentSuperAdmin = Depends(SUPPORT_ACCESS),
    session: Session = Depends(get_session),
):
    user = session.get(User, user_id)
    if user is None or user.business_id != business_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Utilisateur introuvable")
    if user.role == UserRole.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Le propriétaire se gère via la suspension de l'entreprise")
    user.is_active = False
    session.add(user)
    _audit(session, admin, "user.deactivate", "user", user.id, body.reason)
    session.commit()
    return admin_service.get_business_detail(session, business_id)


# ------------------------------------------------------------------ support: notes + tickets


@router.post("/businesses/{business_id}/notes", response_model=NoteOut)
def add_note(business_id: uuid.UUID, body: NoteIn, admin: CurrentSuperAdmin = Depends(SUPPORT_ACCESS), session: Session = Depends(get_session)):
    _business(session, business_id)
    if not body.text.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Note vide")
    note = AdminNote(business_id=business_id, admin_id=admin.id, text=body.text.strip())
    session.add(note)
    _audit(session, admin, "note.add", "business", business_id)
    session.commit()
    session.refresh(note)
    who = session.get(SuperAdminUser, admin.id)
    return NoteOut(id=note.id, admin_name=who.full_name if who else None, text=note.text, created_at=note.created_at)


@router.get("/tickets", response_model=list[TicketOut])
def tickets(status_filter: str | None = None, _admin: CurrentSuperAdmin = Depends(SUPPORT_ACCESS), session: Session = Depends(get_session)):
    q = select(SupportTicket, Business.name).join(Business, Business.id == SupportTicket.business_id)
    if status_filter:
        q = q.where(SupportTicket.status == status_filter)
    names = dict(session.exec(select(SuperAdminUser.id, SuperAdminUser.full_name)).all())
    rows = session.exec(q.order_by(SupportTicket.updated_at.desc())).all()
    return [admin_service.ticket_out(t, bname, names.get(t.created_by)) for t, bname in rows]


@router.post("/tickets", response_model=TicketOut)
def create_ticket(body: TicketIn, admin: CurrentSuperAdmin = Depends(SUPPORT_ACCESS), session: Session = Depends(get_session)):
    b = _business(session, body.business_id)
    if not body.subject.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Sujet vide")
    t = SupportTicket(business_id=b.id, subject=body.subject.strip(), description=body.description, created_by=admin.id)
    session.add(t)
    session.flush()
    _audit(session, admin, "ticket.create", "ticket", t.id, t.subject)
    session.commit()
    session.refresh(t)
    who = session.get(SuperAdminUser, admin.id)
    return admin_service.ticket_out(t, b.name, who.full_name if who else None)


@router.patch("/tickets/{ticket_id}", response_model=TicketOut)
def update_ticket(ticket_id: uuid.UUID, body: TicketUpdate, admin: CurrentSuperAdmin = Depends(SUPPORT_ACCESS), session: Session = Depends(get_session)):
    t = session.get(SupportTicket, ticket_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket introuvable")
    if body.status is not None:
        try:
            t.status = TicketStatus(body.status)
        except ValueError:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Statut inconnu")
    if body.subject is not None:
        t.subject = body.subject
    if body.description is not None:
        t.description = body.description
    t.updated_at = datetime.utcnow()
    session.add(t)
    _audit(session, admin, "ticket.update", "ticket", t.id, t.status.value)
    session.commit()
    session.refresh(t)
    names = dict(session.exec(select(SuperAdminUser.id, SuperAdminUser.full_name)).all())
    b = session.get(Business, t.business_id)
    return admin_service.ticket_out(t, b.name if b else None, names.get(t.created_by))


# ------------------------------------------------------------------ billing


@router.get("/billing", response_model=BillingOut)
def billing(_admin: CurrentSuperAdmin = Depends(FINANCE_ACCESS), session: Session = Depends(get_session)):
    return admin_service.get_billing(session)


@router.post("/plans", response_model=PlanOut)
def create_plan(body: PlanIn, admin: CurrentSuperAdmin = Depends(OWNER_ONLY), session: Session = Depends(get_session)):
    try:
        period = PlanPeriod(body.period)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Période inconnue (monthly / annual)")
    plan = Plan(name=body.name.strip(), price=body.price, period=period, is_active=body.is_active)
    session.add(plan)
    session.flush()
    _audit(session, admin, "plan.create", "plan", plan.id, plan.name)
    session.commit()
    return PlanOut(id=plan.id, name=plan.name, price=plan.price, period=plan.period.value, is_active=plan.is_active)


@router.patch("/plans/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: uuid.UUID, body: PlanUpdate, admin: CurrentSuperAdmin = Depends(OWNER_ONLY), session: Session = Depends(get_session)):
    plan = session.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan introuvable")
    data = body.model_dump(exclude_unset=True)
    if "period" in data and data["period"] is not None:
        data["period"] = PlanPeriod(data["period"])
    for k, v in data.items():
        if v is not None:
            setattr(plan, k, v)
    session.add(plan)
    _audit(session, admin, "plan.update", "plan", plan.id, ",".join(sorted(data)))
    session.commit()
    return PlanOut(id=plan.id, name=plan.name, price=plan.price, period=plan.period.value, is_active=plan.is_active)


# ------------------------------------------------------------------ administration (Super Admin team)


@router.get("/admins", response_model=list[AdminUserOut])
def list_admins(_admin: CurrentSuperAdmin = Depends(OWNER_ONLY), session: Session = Depends(get_session)):
    rows = session.exec(select(SuperAdminUser).order_by(SuperAdminUser.created_at)).all()
    return [AdminUserOut(id=a.id, email=a.email, full_name=a.full_name, role=a.role, is_active=a.is_active, created_at=a.created_at) for a in rows]


@router.post("/admins", response_model=AdminUserOut)
def create_admin(body: AdminUserIn, admin: CurrentSuperAdmin = Depends(OWNER_ONLY), session: Session = Depends(get_session)):
    email = body.email.lower().strip()
    if len(body.password) < 8:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Mot de passe : 8 caractères minimum")
    if session.exec(select(SuperAdminUser).where(SuperAdminUser.email == email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Un compte existe déjà avec cet email")
    row = SuperAdminUser(email=email, full_name=body.full_name.strip(), password_hash=hash_password(body.password), role=body.role)
    session.add(row)
    session.flush()
    _audit(session, admin, "admin.create", "admin", row.id, f"{email} ({body.role.value})")
    session.commit()
    return AdminUserOut(id=row.id, email=row.email, full_name=row.full_name, role=row.role, is_active=row.is_active, created_at=row.created_at)


@router.patch("/admins/{admin_id}", response_model=AdminUserOut)
def update_admin(admin_id: uuid.UUID, body: AdminUserUpdate, admin: CurrentSuperAdmin = Depends(OWNER_ONLY), session: Session = Depends(get_session)):
    row = session.get(SuperAdminUser, admin_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Compte introuvable")
    if row.id == admin.id and (body.is_active is False or (body.role is not None and body.role != SuperAdminRole.owner)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tu ne peux pas retirer ton propre accès propriétaire")
    changed = []
    if body.full_name is not None:
        row.full_name = body.full_name
        changed.append("full_name")
    if body.role is not None:
        row.role = body.role
        changed.append(f"role={body.role.value}")
    if body.is_active is not None:
        row.is_active = body.is_active
        changed.append(f"active={body.is_active}")
    if body.password:
        if len(body.password) < 8:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Mot de passe : 8 caractères minimum")
        row.password_hash = hash_password(body.password)
        changed.append("password")
    session.add(row)
    _audit(session, admin, "admin.update", "admin", row.id, ",".join(changed))
    session.commit()
    return AdminUserOut(id=row.id, email=row.email, full_name=row.full_name, role=row.role, is_active=row.is_active, created_at=row.created_at)


@router.get("/audit", response_model=list[AdminAuditOut])
def audit_log(limit: int = 100, _admin: CurrentSuperAdmin = Depends(OWNER_ONLY), session: Session = Depends(get_session)):
    rows = session.exec(
        select(AdminAuditLog, SuperAdminUser.full_name)
        .join(SuperAdminUser, SuperAdminUser.id == AdminAuditLog.admin_id)
        .order_by(AdminAuditLog.created_at.desc())
        .limit(min(limit, 300))
    ).all()
    return [
        AdminAuditOut(id=a.id, at=a.created_at, admin_name=name, action=a.action, target_type=a.target_type, target_id=a.target_id, details=a.details)
        for a, name in rows
    ]

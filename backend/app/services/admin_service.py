"""Super Admin read models.

Principle from the Super Admin cahier §3: every metric comes from MEASURABLE data — the
business tables (sales, money/stock movements, closings, shifts...) and the append-only
`PlatformEvent` / `Device` telemetry — never from estimates. Everything is computed on the fly,
with datetimes as naive UTC (the columns are TIMESTAMP WITHOUT TIME ZONE)."""

import json
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import func
from sqlmodel import Session, select

from app.core.config import settings
from app.models.admin import SuperAdminUser
from app.models.billing import Plan, Subscription, SubscriptionStatus
from app.models.business import Business
from app.models.catalog import Product
from app.models.customer import Customer
from app.models.events import DailyClosing, MoneyMovement, MoneyMovementType, Sale, StockMovement, StockMovementType
from app.models.platform import AdminAuditLog, AdminNote, Device, PlatformEvent, SupportTicket
from app.models.shift import Shift
from app.models.user import User, UserRole
from app.schemas.admin import (
    AdminOverviewOut,
    AlertOut,
    AnalyticsOut,
    BillingOut,
    BusinessDetailOut,
    BusinessHealthStatus,
    BusinessListItemOut,
    DeviceOut,
    EventOut,
    FeatureUsageOut,
    FunnelStep,
    MonitoringOut,
    NoteOut,
    PlanOut,
    RetentionOut,
    SeriesPoint,
    SubscriptionRowOut,
    TicketOut,
)


def _now() -> datetime:
    return datetime.utcnow()


def _day(value) -> str:
    return str(value)[:10]


def _pct(part: int, whole: int) -> float:
    return round(100.0 * part / whole, 1) if whole else 0.0


def _semver(v: str | None) -> tuple:
    if not v:
        return ()
    parts = []
    for chunk in v.replace("-", ".").split("."):
        parts.append(int(chunk) if chunk.isdigit() else 0)
    return tuple(parts)


# ---------------------------------------------------------------------------- features

FEATURES: list[tuple[str, str, bool]] = [
    ("sales", "Ventes", True),
    ("stock", "Stock (entrées / ajustements)", True),
    ("cash", "Caisse (entrées, dépenses, retraits)", True),
    ("mobile_money", "Mobile Money", True),
    ("orange_money", "Orange Money", True),
    ("credit", "Crédits clients", True),
    ("closing", "Clôture de journée", True),
    ("shifts", "Shifts", True),
    ("reports", "Rapports / PDF", True),
    ("inventory", "Inventaire", False),
    ("multi_shop", "Multi-boutiques", False),
]


def _feature_business_sets(session: Session, since: datetime, scope: set[uuid.UUID] | None) -> dict[str, dict]:
    """feature key -> {business_id: last_used_at} within the period."""
    result: dict[str, dict] = {k: {} for k, _, _ in FEATURES}

    def add(key: str, rows):
        for business_id, last in rows:
            if scope is not None and business_id not in scope:
                continue
            result[key][business_id] = last

    add("sales", session.exec(select(Sale.business_id, func.max(Sale.created_at)).where(Sale.created_at >= since).group_by(Sale.business_id)).all())
    add(
        "stock",
        session.exec(
            select(StockMovement.business_id, func.max(StockMovement.created_at))
            .where(StockMovement.created_at >= since)
            .where(StockMovement.type != StockMovementType.sale)
            .group_by(StockMovement.business_id)
        ).all(),
    )
    add(
        "cash",
        session.exec(
            select(MoneyMovement.business_id, func.max(MoneyMovement.created_at))
            .where(MoneyMovement.created_at >= since)
            .where(MoneyMovement.type.in_([MoneyMovementType.income, MoneyMovementType.expense, MoneyMovementType.withdrawal]))
            .group_by(MoneyMovement.business_id)
        ).all(),
    )
    add(
        "credit",
        session.exec(
            select(Sale.business_id, func.max(Sale.created_at))
            .where(Sale.created_at >= since)
            .where(Sale.payment_method == "credit")
            .group_by(Sale.business_id)
        ).all(),
    )
    for channel in ("mobile_money", "orange_money"):
        add(
            channel,
            session.exec(
                select(Sale.business_id, func.max(Sale.created_at))
                .where(Sale.created_at >= since)
                .where(Sale.payment_method == channel)
                .group_by(Sale.business_id)
            ).all(),
        )
    add("closing", session.exec(select(DailyClosing.business_id, func.max(DailyClosing.created_at)).where(DailyClosing.created_at >= since).group_by(DailyClosing.business_id)).all())
    add("shifts", session.exec(select(Shift.business_id, func.max(Shift.created_at)).where(Shift.created_at >= since).group_by(Shift.business_id)).all())
    add(
        "reports",
        session.exec(
            select(PlatformEvent.business_id, func.max(PlatformEvent.created_at))
            .where(PlatformEvent.created_at >= since)
            .where(PlatformEvent.type == "feature.report")
            .where(PlatformEvent.business_id.is_not(None))
            .group_by(PlatformEvent.business_id)
        ).all(),
    )
    return result


def feature_usage(session: Session, since: datetime, scope: set[uuid.UUID] | None, active_total: int) -> list[FeatureUsageOut]:
    sets = _feature_business_sets(session, since, scope)
    out = []
    for key, label, available in FEATURES:
        used = sets[key]
        out.append(
            FeatureUsageOut(
                key=key,
                label=label,
                businesses=len(used),
                percent=_pct(len(used), active_total) if available else 0.0,
                available=available,
                last_used_at=max(used.values()) if used else None,
            )
        )
    return out


# ---------------------------------------------------------------------------- activity helpers


def _active_business_ids(session: Session, since: datetime, scope: set[uuid.UUID] | None = None) -> set[uuid.UUID]:
    ids: set[uuid.UUID] = set()
    for model in (Sale, MoneyMovement, StockMovement):
        ids.update(session.exec(select(model.business_id).where(model.created_at >= since).distinct()).all())
    ids.update(
        b
        for b in session.exec(
            select(PlatformEvent.business_id).where(PlatformEvent.created_at >= since).where(PlatformEvent.type == "user.login").distinct()
        ).all()
        if b
    )
    return ids & scope if scope is not None else ids


def _active_user_ids(session: Session, since: datetime) -> set[uuid.UUID]:
    ids: set[uuid.UUID] = set()
    for model in (Sale, MoneyMovement, StockMovement):
        ids.update(session.exec(select(model.user_id).where(model.created_at >= since).distinct()).all())
    ids.update(
        u
        for u in session.exec(
            select(PlatformEvent.user_id).where(PlatformEvent.created_at >= since).where(PlatformEvent.type == "user.login").distinct()
        ).all()
        if u
    )
    return ids


def _last_activity_map(session: Session) -> dict[uuid.UUID, datetime]:
    last: dict[uuid.UUID, datetime] = {}
    queries = [
        select(Sale.business_id, func.max(Sale.created_at)).group_by(Sale.business_id),
        select(MoneyMovement.business_id, func.max(MoneyMovement.created_at)).group_by(MoneyMovement.business_id),
        select(StockMovement.business_id, func.max(StockMovement.created_at)).group_by(StockMovement.business_id),
        select(PlatformEvent.business_id, func.max(PlatformEvent.created_at))
        .where(PlatformEvent.type == "user.login")
        .where(PlatformEvent.business_id.is_not(None))
        .group_by(PlatformEvent.business_id),
    ]
    for q in queries:
        for business_id, ts in session.exec(q).all():
            if ts and (business_id not in last or ts > last[business_id]):
                last[business_id] = ts
    return last


def _series_active(session: Session, days: int, scope: set[uuid.UUID] | None = None) -> tuple[list[SeriesPoint], list[SeriesPoint]]:
    since = (_now() - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    biz: dict[str, set] = defaultdict(set)
    users: dict[str, set] = defaultdict(set)
    for model in (Sale, MoneyMovement, StockMovement):
        for ts, b, u in session.exec(select(model.created_at, model.business_id, model.user_id).where(model.created_at >= since)).all():
            if scope is not None and b not in scope:
                continue
            d = _day(ts)
            biz[d].add(b)
            users[d].add(u)
    labels = [(since + timedelta(days=i)).date().isoformat() for i in range(days)]
    return (
        [SeriesPoint(date=d, value=len(biz.get(d, ()))) for d in labels],
        [SeriesPoint(date=d, value=len(users.get(d, ()))) for d in labels],
    )


# ---------------------------------------------------------------------------- devices


def _latest_versions(session: Session) -> dict[str, str]:
    latest: dict[str, str] = {}
    for platform, version in session.exec(select(Device.platform, Device.app_version).where(Device.app_version.is_not(None))).all():
        if platform not in latest or _semver(version) > _semver(latest[platform]):
            latest[platform] = version
    return latest


def _device_out(device: Device, business_name: str, user_name: str | None, latest: dict[str, str]) -> DeviceOut:
    now = _now()
    if device.last_sync_at is None:
        status = "never_synced"
    elif now - device.last_seen_at <= timedelta(minutes=settings.device_online_minutes):
        status = "online"
    else:
        status = "offline"
    lv = latest.get(device.platform)
    obsolete = bool(lv and device.app_version and _semver(device.app_version) < _semver(lv))
    return DeviceOut(
        id=device.id,
        business_id=device.business_id,
        business_name=business_name,
        device_ref=device.device_key[-6:],
        platform=device.platform,
        app_version=device.app_version,
        user_name=user_name,
        first_seen_at=device.first_seen_at,
        last_seen_at=device.last_seen_at,
        last_sync_at=device.last_sync_at,
        last_sync_ok=device.last_sync_ok,
        last_sync_error=device.last_sync_error,
        pending_ops=device.pending_ops,
        rejected_ops=device.rejected_ops,
        status=status,
        obsolete=obsolete,
    )


def list_devices(session: Session, business_id: uuid.UUID | None = None) -> list[DeviceOut]:
    latest = _latest_versions(session)
    q = select(Device, Business.name, User.full_name).join(Business, Business.id == Device.business_id).outerjoin(User, User.id == Device.user_id)
    if business_id:
        q = q.where(Device.business_id == business_id)
    rows = session.exec(q.order_by(Device.last_seen_at.desc())).all()
    return [_device_out(d, bname, uname, latest) for d, bname, uname in rows]


# ---------------------------------------------------------------------------- health / list


def _health(
    last_activity: datetime | None,
    created_at: datetime,
    *,
    suspended: bool,
    sub_status: str | None,
    devices_stale: bool,
    now: datetime | None = None,
) -> BusinessHealthStatus:
    now = now or _now()
    reference = last_activity or created_at
    days = (now - reference).days
    reasons: list[str] = []
    level = 0  # 0 healthy, 1 watch, 2 risk
    if days > settings.health_risk_after_days:
        level, reasons = 2, [f"Aucune activité depuis {days} jours"]
    elif days > settings.health_watch_after_days:
        level = 1
        reasons.append(f"Aucune activité depuis {days} jours")
    if devices_stale:
        level = max(level, 1)
        reasons.append("Synchronisation en échec ou trop ancienne")
    if sub_status == SubscriptionStatus.payment_failed.value:
        level = 2
        reasons.append("Paiement échoué")
    if suspended:
        level = 2
        reasons.append("Compte suspendu")
    value = ("healthy", "a_surveiller", "a_risque")[level]
    return BusinessHealthStatus(value=value, last_activity_at=last_activity, reasons=reasons)


def _device_aggregates(session: Session) -> dict[uuid.UUID, dict]:
    agg: dict[uuid.UUID, dict] = {}
    now = _now()
    for d in session.exec(select(Device)).all():
        a = agg.setdefault(d.business_id, {"count": 0, "last_sync": None, "pending": 0, "versions": set(), "platforms": set(), "stale": False})
        a["count"] += 1
        a["pending"] += d.pending_ops
        a["versions"].add(d.app_version or "?")
        a["platforms"].add(d.platform)
        if d.last_sync_at and (a["last_sync"] is None or d.last_sync_at > a["last_sync"]):
            a["last_sync"] = d.last_sync_at
        if d.last_sync_ok is False and (d.last_sync_at is None or now - d.last_sync_at > timedelta(hours=settings.stale_sync_hours)):
            a["stale"] = True
        if d.pending_ops >= settings.pending_ops_alert and d.last_sync_at and now - d.last_sync_at > timedelta(hours=1):
            a["stale"] = True
    return agg


def list_businesses(session: Session) -> list[BusinessListItemOut]:
    now = _now()
    businesses = session.exec(select(Business).order_by(Business.created_at.desc())).all()
    last_activity = _last_activity_map(session)
    devices = _device_aggregates(session)
    owners = {u.business_id: u for u in session.exec(select(User).where(User.role == UserRole.owner)).all()}
    emp = dict(session.exec(select(User.business_id, func.count(User.id)).where(User.is_active == True).group_by(User.business_id)).all())  # noqa: E712
    prod = dict(session.exec(select(Product.business_id, func.count(Product.id)).group_by(Product.business_id)).all())
    sales7 = dict(
        session.exec(select(Sale.business_id, func.count(Sale.id)).where(Sale.created_at >= now - timedelta(days=7)).group_by(Sale.business_id)).all()
    )
    errors7 = dict(
        session.exec(
            select(PlatformEvent.business_id, func.count(PlatformEvent.id))
            .where(PlatformEvent.created_at >= now - timedelta(days=7))
            .where(PlatformEvent.type.in_(["sync.failed", "sync.rejected"]))
            .where(PlatformEvent.business_id.is_not(None))
            .group_by(PlatformEvent.business_id)
        ).all()
    )
    subs = {s.business_id: s for s in session.exec(select(Subscription)).all()}
    plans = {p.id: p for p in session.exec(select(Plan)).all()}

    out: list[BusinessListItemOut] = []
    for b in businesses:
        sub = subs.get(b.id)
        plan = plans.get(sub.plan_id) if sub and sub.plan_id else None
        dev = devices.get(b.id, {})
        owner = owners.get(b.id)
        la = last_activity.get(b.id)
        out.append(
            BusinessListItemOut(
                id=b.id,
                name=b.name,
                business_code=b.business_code,
                sector=b.sector,
                created_at=b.created_at,
                owner_full_name=owner.full_name if owner else None,
                owner_phone=owner.phone if owner else None,
                employee_count=int(emp.get(b.id, 0)),
                product_count=int(prod.get(b.id, 0)),
                device_count=dev.get("count", 0),
                plan_name=plan.name if plan else None,
                subscription_status=sub.status.value if sub else None,
                subscription_ends_at=(sub.current_period_ends_at or sub.trial_ends_at) if sub else None,
                is_suspended=b.is_suspended,
                last_activity_at=la,
                sales_7d=int(sales7.get(b.id, 0)),
                last_sync_at=dev.get("last_sync"),
                pending_ops=dev.get("pending", 0),
                errors_7d=int(errors7.get(b.id, 0)),
                app_versions=sorted(dev.get("versions", [])),
                platforms=sorted(dev.get("platforms", [])),
                health=_health(
                    la,
                    b.created_at,
                    suspended=b.is_suspended,
                    sub_status=sub.status.value if sub else None,
                    devices_stale=dev.get("stale", False),
                    now=now,
                ),
            )
        )
    return out


# ---------------------------------------------------------------------------- business detail


def _events_for_business(session: Session, business_id: uuid.UUID, limit: int = 40) -> list[EventOut]:
    events: list[EventOut] = []
    for e in session.exec(
        select(PlatformEvent).where(PlatformEvent.business_id == business_id).order_by(PlatformEvent.created_at.desc()).limit(limit)
    ).all():
        events.append(EventOut(at=e.created_at, type=e.type, source="platform", detail=e.meta, platform=e.platform, app_version=e.app_version))
    for a, name in session.exec(
        select(AdminAuditLog, SuperAdminUser.full_name)
        .join(SuperAdminUser, SuperAdminUser.id == AdminAuditLog.admin_id)
        .where(AdminAuditLog.target_id == business_id)
        .order_by(AdminAuditLog.created_at.desc())
        .limit(limit)
    ).all():
        events.append(EventOut(at=a.created_at, type=a.action, source="admin", actor=name, detail=a.details))
    events.sort(key=lambda e: e.at, reverse=True)
    return events[:limit]


def ticket_out(t: SupportTicket, business_name: str | None, creator: str | None) -> TicketOut:
    return TicketOut(
        id=t.id,
        business_id=t.business_id,
        business_name=business_name,
        subject=t.subject,
        description=t.description,
        status=t.status.value,
        created_by_name=creator,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def get_business_detail(session: Session, business_id: uuid.UUID) -> BusinessDetailOut | None:
    b = session.get(Business, business_id)
    if b is None:
        return None
    now = _now()
    listing = next((x for x in list_businesses(session) if x.id == b.id), None)

    owner = session.exec(select(User).where(User.business_id == b.id, User.role == UserRole.owner)).first()
    users = session.exec(select(User).where(User.business_id == b.id).order_by(User.full_name)).all()
    customer_count = session.exec(select(func.count(Customer.id)).where(Customer.business_id == b.id)).one()
    sub = session.exec(select(Subscription).where(Subscription.business_id == b.id)).first()
    plan = session.get(Plan, sub.plan_id) if sub and sub.plan_id else None

    def sales_since(delta: timedelta) -> int:
        return int(session.exec(select(func.count(Sale.id)).where(Sale.business_id == b.id).where(Sale.created_at >= now - delta)).one())

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    sales30 = session.exec(
        select(func.count(Sale.id), func.coalesce(func.sum(Sale.total_amount), 0))
        .where(Sale.business_id == b.id)
        .where(Sale.created_at >= now - timedelta(days=30))
    ).first()
    since7 = now - timedelta(days=7)
    active_users_7d = set()
    for model in (Sale, MoneyMovement, StockMovement):
        active_users_7d.update(session.exec(select(model.user_id).where(model.business_id == b.id).where(model.created_at >= since7).distinct()).all())
    days30: set[str] = set()
    for ts in session.exec(select(Sale.created_at).where(Sale.business_id == b.id).where(Sale.created_at >= now - timedelta(days=30))).all():
        days30.add(_day(ts))

    scope = {b.id}
    sets = _feature_business_sets(session, now - timedelta(days=30), scope)
    features = [
        FeatureUsageOut(
            key=k,
            label=label,
            businesses=1 if sets[k] else 0,
            percent=100.0 if sets[k] else 0.0,
            available=avail,
            last_used_at=sets[k].get(b.id),
        )
        for k, label, avail in FEATURES
    ]

    devices = list_devices(session, b.id)
    tickets = session.exec(select(SupportTicket).where(SupportTicket.business_id == b.id).order_by(SupportTicket.created_at.desc())).all()
    names = dict(session.exec(select(SuperAdminUser.id, SuperAdminUser.full_name)).all())
    notes = session.exec(select(AdminNote).where(AdminNote.business_id == b.id).order_by(AdminNote.created_at.desc())).all()

    return BusinessDetailOut(
        id=b.id,
        name=b.name,
        business_code=b.business_code,
        sector=b.sector,
        address=b.address,
        phone=b.phone,
        email=b.email,
        created_at=b.created_at,
        is_suspended=b.is_suspended,
        owner_full_name=owner.full_name if owner else None,
        owner_phone=owner.phone if owner else None,
        plan_id=plan.id if plan else None,
        plan_name=plan.name if plan else None,
        subscription_status=sub.status.value if sub else None,
        subscription_started_at=sub.started_at if sub else None,
        subscription_ends_at=(sub.current_period_ends_at or sub.trial_ends_at) if sub else None,
        health=listing.health if listing else BusinessHealthStatus(value="healthy", last_activity_at=None),
        employee_count=sum(1 for u in users if u.is_active),
        product_count=int(session.exec(select(func.count(Product.id)).where(Product.business_id == b.id)).one()),
        customer_count=int(customer_count),
        device_count=len(devices),
        sales_count_today=int(session.exec(select(func.count(Sale.id)).where(Sale.business_id == b.id).where(Sale.created_at >= today_start)).one()),
        sales_count_7d=sales_since(timedelta(days=7)),
        sales_count_30d=int(sales30[0]) if sales30 else 0,
        sales_total_30d=int(sales30[1]) if sales30 else 0,
        active_users_7d=len(active_users_7d),
        active_days_30d=len(days30),
        features=features,
        devices=devices,
        pending_ops=sum(d.pending_ops for d in devices),
        last_sync_at=max((d.last_sync_at for d in devices if d.last_sync_at), default=None),
        errors_7d=listing.errors_7d if listing else 0,
        history=_events_for_business(session, b.id),
        notes=[NoteOut(id=n.id, admin_name=names.get(n.admin_id), text=n.text, created_at=n.created_at) for n in notes],
        tickets=[ticket_out(t, b.name, names.get(t.created_by)) for t in tickets],
        users=[{"id": str(u.id), "full_name": u.full_name, "role": u.role.value, "is_active": u.is_active, "phone": u.phone} for u in users],
    )


# ---------------------------------------------------------------------------- funnel / retention


def _funnel(session: Session, since: datetime, scope: set[uuid.UUID] | None) -> list[FunnelStep]:
    q = select(Business.id, Business.created_at).where(Business.created_at >= since)
    biz = [(i, c) for i, c in session.exec(q).all() if scope is None or i in scope]
    ids = {i for i, _ in biz}
    created = dict(biz)
    with_products = set(session.exec(select(Product.business_id).distinct()).all()) & ids
    sale_days: dict[uuid.UUID, dict[str, datetime]] = defaultdict(dict)
    if ids:
        for b, ts in session.exec(select(Sale.business_id, Sale.created_at)).all():
            if b in ids:
                sale_days[b][_day(ts)] = ts
    first_sale = {b for b in ids if sale_days.get(b)}
    active7 = set()
    recurring = set()
    for b in ids:
        c = created[b]
        early = [d for d, ts in sale_days.get(b, {}).items() if ts <= c + timedelta(days=7)]
        if len(early) >= 2:
            active7.add(b)
        within30 = [d for d, ts in sale_days.get(b, {}).items() if ts <= c + timedelta(days=30)]
        if len(within30) >= 5:
            recurring.add(b)
    total = len(ids)
    steps = [
        ("signup", "Compte et entreprise créés", total),
        ("configured", "Entreprise configurée (1er produit)", len(with_products)),
        ("first_sale", "Première vente", len(first_sale)),
        ("active_7d", "Activité 7 jours (ventes sur 2 jours ou plus)", len(active7)),
        ("recurring", "Activité récurrente (5 jours de vente ou plus)", len(recurring)),
    ]
    return [FunnelStep(key=k, label=l, count=n, percent=_pct(n, total)) for k, l, n in steps]


def _retention(session: Session, days: int, scope: set[uuid.UUID] | None) -> RetentionOut:
    now = _now()
    biz = [
        (i, c)
        for i, c in session.exec(select(Business.id, Business.created_at).where(Business.created_at <= now - timedelta(days=days))).all()
        if scope is None or i in scope
    ]
    if not biz:
        return RetentionOut(eligible=0, retained=0, percent=0.0)
    created = dict(biz)
    last: dict[uuid.UUID, datetime] = {}
    for model in (Sale, MoneyMovement):
        for b, ts in session.exec(select(model.business_id, func.max(model.created_at)).group_by(model.business_id)).all():
            if b in created and ts and (b not in last or ts > last[b]):
                last[b] = ts
    retained = sum(1 for b, c in created.items() if b in last and last[b] >= c + timedelta(days=days))
    return RetentionOut(eligible=len(created), retained=retained, percent=_pct(retained, len(created)))


def _segment_scope(session: Session, plan_id: uuid.UUID | None, platform: str | None, app_version: str | None, activity: str | None, since: datetime) -> set[uuid.UUID] | None:
    scope: set[uuid.UUID] | None = None

    def narrow(ids: set[uuid.UUID]):
        nonlocal scope
        scope = ids if scope is None else scope & ids

    if plan_id:
        narrow(set(session.exec(select(Subscription.business_id).where(Subscription.plan_id == plan_id)).all()))
    if platform or app_version:
        q = select(Device.business_id)
        if platform:
            q = q.where(Device.platform == platform)
        if app_version:
            q = q.where(Device.app_version == app_version)
        narrow(set(session.exec(q.distinct()).all()))
    if activity in ("active", "inactive"):
        active = _active_business_ids(session, since)
        if activity == "active":
            narrow(active)
        else:
            all_ids = set(session.exec(select(Business.id)).all())
            narrow(all_ids - active)
    return scope


def get_analytics(
    session: Session,
    days: int = 30,
    plan_id: uuid.UUID | None = None,
    platform: str | None = None,
    app_version: str | None = None,
    activity: str | None = None,
) -> AnalyticsOut:
    days = max(1, min(days, 365))
    now = _now()
    since = now - timedelta(days=days)
    scope = _segment_scope(session, plan_id, platform, app_version, activity, since)
    active = _active_business_ids(session, since, scope)
    users_today = _active_user_ids(session, now.replace(hour=0, minute=0, second=0, microsecond=0))
    users7 = _active_user_ids(session, now - timedelta(days=7))
    users30 = _active_user_ids(session, now - timedelta(days=30))
    series_biz, series_users = _series_active(session, min(days, 60), scope)

    new_by_day: dict[str, int] = defaultdict(int)
    for bid, c in session.exec(select(Business.id, Business.created_at).where(Business.created_at >= now - timedelta(days=min(days, 60)))).all():
        if scope is None or bid in scope:
            new_by_day[_day(c)] += 1
    labels = [p.date for p in series_biz]

    funnel = _funnel(session, since, scope)
    signup = funnel[0].count if funnel else 0
    first_sale = funnel[2].count if funnel else 0

    version_counts: dict[str, int] = defaultdict(int)
    platform_counts: dict[str, int] = defaultdict(int)
    for d in session.exec(select(Device)).all():
        if scope is not None and d.business_id not in scope:
            continue
        version_counts[f"{d.platform} {d.app_version or '?'}"] += 1
        platform_counts[d.platform] += 1

    return AnalyticsOut(
        period_days=days,
        generated_at=now,
        active_businesses=len(active),
        feature_usage=feature_usage(session, since, scope, len(active)),
        funnel=funnel,
        retention_d7=_retention(session, 7, scope),
        retention_d30=_retention(session, 30, scope),
        dau=len(users_today),
        wau=len(users7),
        mau=len(users30),
        activation_rate=_pct(first_sale, signup),
        series_active_businesses=series_biz,
        series_new_businesses=[SeriesPoint(date=d, value=new_by_day.get(d, 0)) for d in labels],
        series_active_users=series_users,
        versions=[{"label": k, "count": v} for k, v in sorted(version_counts.items(), key=lambda kv: -kv[1])],
        platforms=[{"label": k, "count": v} for k, v in sorted(platform_counts.items(), key=lambda kv: -kv[1])],
    )


# ---------------------------------------------------------------------------- monitoring / alerts


def _humanize(delta: timedelta) -> str:
    hours = int(delta.total_seconds() // 3600)
    if hours < 1:
        return f"{int(delta.total_seconds() // 60)} min"
    if hours < 48:
        return f"{hours} h"
    return f"{hours // 24} j"


def build_alerts(session: Session, include_billing: bool = True) -> list[AlertOut]:
    now = _now()
    alerts: list[AlertOut] = []
    latest = _latest_versions(session)
    names = dict(session.exec(select(Business.id, Business.name)).all())

    for d in session.exec(select(Device)).all():
        name = names.get(d.business_id, "Entreprise")
        if d.pending_ops >= settings.pending_ops_alert:
            ago = _humanize(now - d.last_sync_at) if d.last_sync_at else "jamais"
            alerts.append(
                AlertOut(
                    severity="critical",
                    kind="sync_blocked",
                    title=f"{name} — {d.pending_ops} opérations non synchronisées",
                    detail=f"Dernière synchronisation il y a {ago}" if d.last_sync_at else "Jamais synchronisé",
                    business_id=d.business_id,
                    business_name=name,
                    at=d.last_seen_at,
                )
            )
        elif d.last_sync_ok is False:
            alerts.append(
                AlertOut(
                    severity="warning",
                    kind="sync_failing",
                    title=f"{name} — synchronisation en échec",
                    detail=d.last_sync_error,
                    business_id=d.business_id,
                    business_name=name,
                    at=d.last_seen_at,
                )
            )
        lv = latest.get(d.platform)
        if lv and d.app_version and _semver(d.app_version) < _semver(lv):
            alerts.append(
                AlertOut(
                    severity="info",
                    kind="obsolete_version",
                    title=f"{name} — version obsolète ({d.platform} {d.app_version})",
                    detail=f"Dernière version connue : {lv}",
                    business_id=d.business_id,
                    business_name=name,
                    at=d.last_seen_at,
                )
            )

    since_1h = now - timedelta(hours=1)
    errors_1h = session.exec(select(func.count(PlatformEvent.id)).where(PlatformEvent.type == "server.error").where(PlatformEvent.created_at >= since_1h)).one()
    if errors_1h >= 5:
        alerts.append(AlertOut(severity="critical", kind="server_errors", title=f"{errors_1h} erreurs serveur sur la dernière heure", at=now))

    if include_billing:
        for sub, bid in session.exec(select(Subscription, Subscription.business_id).where(Subscription.status == SubscriptionStatus.payment_failed)).all():
            alerts.append(AlertOut(severity="warning", kind="payment_failed", title=f"{names.get(bid, 'Entreprise')} — paiement échoué", business_id=bid, business_name=names.get(bid)))

    last = _last_activity_map(session)
    created = dict(session.exec(select(Business.id, Business.created_at)).all())
    inactive = [(bid, (now - last.get(bid, c)).days) for bid, c in created.items() if (now - last.get(bid, c)).days > settings.health_risk_after_days]
    for bid, d in sorted(inactive, key=lambda x: -x[1])[:5]:
        alerts.append(AlertOut(severity="info", kind="inactive", title=f"{names.get(bid, 'Entreprise')} — sans activité depuis {d} jours", business_id=bid, business_name=names.get(bid)))

    for a, who in session.exec(
        select(AdminAuditLog, SuperAdminUser.full_name)
        .join(SuperAdminUser, SuperAdminUser.id == AdminAuditLog.admin_id)
        .where(AdminAuditLog.created_at >= now - timedelta(hours=24))
        .where(AdminAuditLog.action.in_(["business.suspend", "business.reactivate", "subscription.change", "admin.create", "admin.update"]))
        .order_by(AdminAuditLog.created_at.desc())
        .limit(5)
    ).all():
        alerts.append(AlertOut(severity="info", kind="admin_action", title=f"Action sensible : {a.action} par {who}", detail=a.details, at=a.created_at))

    order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: order[a.severity])
    return alerts


def get_monitoring(session: Session) -> MonitoringOut:
    now = _now()
    devices = list_devices(session)
    since_24h = now - timedelta(hours=24)
    sync_errors = session.exec(select(func.count(PlatformEvent.id)).where(PlatformEvent.type == "sync.failed").where(PlatformEvent.created_at >= since_24h)).one()
    server_errors = session.exec(select(func.count(PlatformEvent.id)).where(PlatformEvent.type == "server.error").where(PlatformEvent.created_at >= since_24h)).one()

    recent = session.exec(
        select(PlatformEvent)
        .where(PlatformEvent.type.in_(["server.error", "sync.failed", "sync.rejected"]))
        .order_by(PlatformEvent.created_at.desc())
        .limit(25)
    ).all()
    names = dict(session.exec(select(Business.id, Business.name)).all())
    recent_out = [
        EventOut(at=e.created_at, type=e.type, source="platform", actor=names.get(e.business_id) if e.business_id else None, detail=e.meta, platform=e.platform, app_version=e.app_version)
        for e in recent
    ]
    hours: dict[str, int] = defaultdict(int)
    for ts in session.exec(select(PlatformEvent.created_at).where(PlatformEvent.type.in_(["server.error", "sync.failed"])).where(PlatformEvent.created_at >= since_24h)).all():
        hours[ts.strftime("%Y-%m-%d %H:00")] += 1
    labels = [(now - timedelta(hours=i)).strftime("%Y-%m-%d %H:00") for i in range(23, -1, -1)]

    stale = [
        d
        for d in devices
        if d.status != "online" and (d.pending_ops > 0 or d.last_sync_ok is False or d.status == "never_synced")
    ]
    stale.sort(key=lambda d: -d.pending_ops)
    return MonitoringOut(
        generated_at=now,
        devices_total=len(devices),
        devices_online=sum(1 for d in devices if d.status == "online"),
        devices_offline=sum(1 for d in devices if d.status != "online"),
        pending_ops_total=sum(d.pending_ops for d in devices),
        rejected_ops_total=sum(d.rejected_ops for d in devices),
        sync_errors_24h=int(sync_errors),
        server_errors_24h=int(server_errors),
        outdated_devices=sum(1 for d in devices if d.obsolete),
        alerts=build_alerts(session),
        stale_devices=stale[:30],
        recent_errors=recent_out,
        error_series=[SeriesPoint(date=h[11:], value=hours.get(h, 0)) for h in labels],
        latest_versions=_latest_versions(session),
    )


# ---------------------------------------------------------------------------- overview


def get_overview(session: Session, include_billing: bool = True) -> AdminOverviewOut:
    now = _now()
    since7, since30 = now - timedelta(days=7), now - timedelta(days=30)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    businesses = list_businesses(session)
    total = len(businesses)
    active7 = _active_business_ids(session, since7)
    monitoring = get_monitoring(session)

    sales30 = session.exec(select(func.count(Sale.id), func.coalesce(func.sum(Sale.total_amount), 0)).where(Sale.created_at >= since30)).first()
    sales_today = session.exec(select(func.count(Sale.id)).where(Sale.created_at >= today_start)).one()
    with_sale_30d = set(session.exec(select(Sale.business_id).where(Sale.created_at >= since30).distinct()).all())
    first_sales = 0
    first_sale_dates = dict(session.exec(select(Sale.business_id, func.min(Sale.created_at)).group_by(Sale.business_id)).all())
    for bid, ts in first_sale_dates.items():
        if ts >= since30:
            first_sales += 1

    health = defaultdict(int)
    for b in businesses:
        health[b.health.value] += 1

    subs = session.exec(select(Subscription)).all()
    plans = {p.id: p for p in session.exec(select(Plan)).all()}

    def by_status(status: SubscriptionStatus) -> int:
        return sum(1 for s in subs if s.status == status)

    mrr = 0
    for s in subs:
        if s.status == SubscriptionStatus.active and s.plan_id in plans:
            p = plans[s.plan_id]
            mrr += p.price if p.period.value == "monthly" else p.price // 12

    inactive_recent = sorted(
        [b for b in businesses if b.health.value != "healthy" and not b.is_suspended],
        key=lambda b: (b.health.last_activity_at or b.created_at),
    )[:6]

    series_biz, series_users = _series_active(session, 30)
    users_today = _active_user_ids(session, today_start)
    users7 = _active_user_ids(session, since7)
    users30 = _active_user_ids(session, since30)
    emp_total = int(session.exec(select(func.count(User.id)).where(User.is_active == True)).one())  # noqa: E712
    active_30 = _active_business_ids(session, since30)
    usage = feature_usage(session, since30, None, len(active_30))
    usage_sorted = sorted([u for u in usage if u.available], key=lambda u: -u.businesses)[:6]

    return AdminOverviewOut(
        environment=settings.environment,
        generated_at=now,
        businesses_total=total,
        businesses_active_7d=len(active7),
        businesses_new_7d=sum(1 for b in businesses if b.created_at >= since7),
        businesses_new_30d=sum(1 for b in businesses if b.created_at >= since30),
        businesses_first_sale_30d=first_sales,
        businesses_without_activity=sum(1 for b in businesses if b.last_activity_at is None or (now - b.last_activity_at).days > settings.health_risk_after_days),
        users_active_today=len(users_today),
        users_active_7d=len(users7),
        users_active_30d=len(users30),
        sales_count_30d=int(sales30[0]) if sales30 else 0,
        sales_total_30d=int(sales30[1]) if sales30 else 0,
        sales_count_today=int(sales_today),
        employees_total=emp_total,
        devices_total=monitoring.devices_total,
        shops_total=total,  # one shop per business until multi-shop (P2) exists
        subscriptions_active=by_status(SubscriptionStatus.active) if include_billing else None,
        subscriptions_trial=by_status(SubscriptionStatus.trial) if include_billing else None,
        subscriptions_expired=by_status(SubscriptionStatus.expired) if include_billing else None,
        payments_failed=by_status(SubscriptionStatus.payment_failed) if include_billing else None,
        mrr=mrr if include_billing else None,
        devices_offline=monitoring.devices_offline,
        pending_ops_total=monitoring.pending_ops_total,
        sync_errors_24h=monitoring.sync_errors_24h,
        server_errors_24h=monitoring.server_errors_24h,
        open_incidents=sum(1 for a in monitoring.alerts if a.severity == "critical"),
        businesses_healthy=health["healthy"],
        businesses_to_watch=health["a_surveiller"],
        businesses_at_risk=health["a_risque"],
        alerts=build_alerts(session, include_billing)[:8],
        funnel=_funnel(session, since30, None),
        active_businesses_series=series_biz,
        active_users_series=series_users,
        top_features=usage_sorted,
        inactive_recently=inactive_recent,
    )


# ---------------------------------------------------------------------------- billing


def get_billing(session: Session) -> BillingOut:
    now = _now()
    plans = session.exec(select(Plan).order_by(Plan.price)).all()
    subs = session.exec(select(Subscription)).all()
    names = dict(session.exec(select(Business.id, Business.name)).all())
    plan_by_id = {p.id: p for p in plans}
    counts: dict[uuid.UUID, int] = defaultdict(int)
    by_status: dict[str, int] = defaultdict(int)
    mrr = 0
    for s in subs:
        by_status[s.status.value] += 1
        if s.plan_id:
            counts[s.plan_id] += 1
        if s.status == SubscriptionStatus.active and s.plan_id in plan_by_id:
            p = plan_by_id[s.plan_id]
            mrr += p.price if p.period.value == "monthly" else p.price // 12
    since30 = now - timedelta(days=30)
    trials_started = sum(1 for s in subs if s.status == SubscriptionStatus.trial or (s.trial_ends_at is not None and s.started_at >= since30))
    converted = sum(1 for s in subs if s.converted_at is not None and s.converted_at >= since30)
    rows = []
    for s in subs:
        p = plan_by_id.get(s.plan_id) if s.plan_id else None
        rows.append(
            SubscriptionRowOut(
                business_id=s.business_id,
                business_name=names.get(s.business_id, "—"),
                plan_name=p.name if p else None,
                status=s.status.value,
                started_at=s.started_at,
                trial_ends_at=s.trial_ends_at,
                current_period_ends_at=s.current_period_ends_at,
                price=p.price if p else 0,
            )
        )
    rows.sort(key=lambda r: r.started_at, reverse=True)
    return BillingOut(
        generated_at=now,
        plans=[PlanOut(id=p.id, name=p.name, price=p.price, period=p.period.value, is_active=p.is_active, subscribers=counts.get(p.id, 0)) for p in plans],
        by_status=dict(by_status),
        mrr=mrr,
        arr=mrr * 12,
        trials_started_30d=trials_started,
        trials_converted_30d=converted,
        failed_or_unpaid=by_status.get("payment_failed", 0),
        expired=by_status.get("expired", 0),
        subscriptions=rows,
        revenue_note=(
            "MRR/ARR calculés à partir des plans actifs. Aucun processeur de paiement n'est branché : "
            "les revenus encaissés, remboursements et remises ne sont pas encore instrumentés."
        ),
    )


def parse_meta(meta: str | None) -> dict:
    if not meta:
        return {}
    try:
        return json.loads(meta)
    except ValueError:
        return {}


def today() -> date:
    return _now().date()

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.admin import SuperAdminRole


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class AdminTokenResponse(BaseModel):
    access_token: str
    super_admin_id: uuid.UUID
    email: str
    full_name: str
    role: SuperAdminRole
    environment: str = "development"


# ------------------------------------------------------------------ businesses


class BusinessHealthStatus(BaseModel):
    """« healthy » / « a_surveiller » / « a_risque » — computed from configurable, measurable
    rules (days without activity, blocked sync, failed payment), never an arbitrary score.
    `reasons` says which rule fired so the team can act (cahier Super Admin §8)."""

    value: str
    last_activity_at: datetime | None
    reasons: list[str] = []


class BusinessListItemOut(BaseModel):
    id: uuid.UUID
    name: str
    business_code: str
    sector: str | None
    created_at: datetime
    owner_full_name: str | None
    owner_phone: str | None = None
    employee_count: int
    product_count: int = 0
    device_count: int = 0
    plan_name: str | None
    subscription_status: str | None
    subscription_ends_at: datetime | None = None
    is_suspended: bool = False
    last_activity_at: datetime | None = None
    sales_7d: int = 0
    last_sync_at: datetime | None = None
    pending_ops: int = 0
    errors_7d: int = 0
    app_versions: list[str] = []
    platforms: list[str] = []
    health: BusinessHealthStatus


class DeviceOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    business_name: str
    device_ref: str
    platform: str
    app_version: str | None
    user_name: str | None
    first_seen_at: datetime
    last_seen_at: datetime
    last_sync_at: datetime | None
    last_sync_ok: bool | None
    last_sync_error: str | None
    pending_ops: int
    rejected_ops: int
    status: str
    """online | offline | never_synced"""
    obsolete: bool


class EventOut(BaseModel):
    at: datetime
    type: str
    source: str
    """platform | admin"""
    actor: str | None = None
    detail: str | None = None
    platform: str | None = None
    app_version: str | None = None


class NoteOut(BaseModel):
    id: uuid.UUID
    admin_name: str | None
    text: str
    created_at: datetime


class TicketOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    business_name: str | None = None
    subject: str
    description: str | None
    status: str
    created_by_name: str | None
    created_at: datetime
    updated_at: datetime


class FeatureUsageOut(BaseModel):
    key: str
    label: str
    businesses: int
    percent: float
    available: bool = True
    last_used_at: datetime | None = None


class BusinessDetailOut(BaseModel):
    id: uuid.UUID
    name: str
    business_code: str
    sector: str | None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    created_at: datetime
    is_suspended: bool
    owner_full_name: str | None
    owner_phone: str | None
    plan_id: uuid.UUID | None = None
    plan_name: str | None
    subscription_status: str | None
    subscription_started_at: datetime | None
    subscription_ends_at: datetime | None = None
    health: BusinessHealthStatus
    # structure
    employee_count: int
    product_count: int
    customer_count: int = 0
    device_count: int = 0
    # usage
    sales_count_today: int = 0
    sales_count_7d: int = 0
    sales_count_30d: int
    sales_total_30d: int
    active_users_7d: int = 0
    active_days_30d: int = 0
    features: list[FeatureUsageOut] = []
    # technical
    devices: list[DeviceOut] = []
    pending_ops: int = 0
    last_sync_at: datetime | None = None
    errors_7d: int = 0
    # history / support
    history: list[EventOut] = []
    notes: list[NoteOut] = []
    tickets: list[TicketOut] = []
    users: list[dict] = []


# ------------------------------------------------------------------ overview / analytics / monitoring


class AlertOut(BaseModel):
    severity: str
    """critical | warning | info"""
    kind: str
    title: str
    detail: str | None = None
    business_id: uuid.UUID | None = None
    business_name: str | None = None
    at: datetime | None = None


class SeriesPoint(BaseModel):
    date: str
    value: int


class FunnelStep(BaseModel):
    key: str
    label: str
    count: int
    percent: float


class RetentionOut(BaseModel):
    eligible: int
    retained: int
    percent: float


class AdminOverviewOut(BaseModel):
    environment: str
    generated_at: datetime
    # Entreprises
    businesses_total: int
    businesses_active_7d: int
    businesses_new_7d: int
    businesses_new_30d: int
    businesses_first_sale_30d: int
    businesses_without_activity: int
    # Usage
    users_active_today: int
    users_active_7d: int
    users_active_30d: int
    sales_count_30d: int
    sales_total_30d: int
    sales_count_today: int
    # Structure
    employees_total: int
    devices_total: int
    shops_total: int
    # Business SaaS (None if the role has no financial access)
    subscriptions_active: int | None = None
    subscriptions_trial: int | None = None
    subscriptions_expired: int | None = None
    payments_failed: int | None = None
    mrr: int | None = None
    # Technique
    devices_offline: int
    pending_ops_total: int
    sync_errors_24h: int
    server_errors_24h: int
    open_incidents: int
    # health of the portfolio
    businesses_healthy: int
    businesses_to_watch: int
    businesses_at_risk: int
    # widgets
    alerts: list[AlertOut]
    funnel: list[FunnelStep]
    active_businesses_series: list[SeriesPoint]
    active_users_series: list[SeriesPoint]
    top_features: list[FeatureUsageOut]
    inactive_recently: list[BusinessListItemOut]


class AnalyticsOut(BaseModel):
    period_days: int
    generated_at: datetime
    active_businesses: int
    feature_usage: list[FeatureUsageOut]
    funnel: list[FunnelStep]
    retention_d7: RetentionOut
    retention_d30: RetentionOut
    dau: int
    wau: int
    mau: int
    activation_rate: float
    series_active_businesses: list[SeriesPoint]
    series_new_businesses: list[SeriesPoint]
    series_active_users: list[SeriesPoint]
    versions: list[dict]
    platforms: list[dict]


class MonitoringOut(BaseModel):
    generated_at: datetime
    devices_total: int
    devices_online: int
    devices_offline: int
    pending_ops_total: int
    rejected_ops_total: int
    sync_errors_24h: int
    server_errors_24h: int
    outdated_devices: int
    alerts: list[AlertOut]
    stale_devices: list[DeviceOut]
    recent_errors: list[EventOut]
    error_series: list[SeriesPoint]
    latest_versions: dict[str, str]


# ------------------------------------------------------------------ billing


class PlanOut(BaseModel):
    id: uuid.UUID
    name: str
    price: int
    period: str
    is_active: bool
    subscribers: int = 0


class PlanIn(BaseModel):
    name: str
    price: int
    period: str = "monthly"
    is_active: bool = True


class PlanUpdate(BaseModel):
    name: str | None = None
    price: int | None = None
    period: str | None = None
    is_active: bool | None = None


class SubscriptionRowOut(BaseModel):
    business_id: uuid.UUID
    business_name: str
    plan_name: str | None
    status: str
    started_at: datetime
    trial_ends_at: datetime | None
    current_period_ends_at: datetime | None
    price: int


class BillingOut(BaseModel):
    generated_at: datetime
    plans: list[PlanOut]
    by_status: dict[str, int]
    mrr: int
    arr: int
    trials_started_30d: int
    trials_converted_30d: int
    failed_or_unpaid: int
    expired: int
    subscriptions: list[SubscriptionRowOut]
    revenue_note: str


class SubscriptionChange(BaseModel):
    plan_id: uuid.UUID | None = None
    status: str | None = None
    extend_trial_days: int | None = None
    current_period_ends_at: datetime | None = None


# ------------------------------------------------------------------ support / administration


class NoteIn(BaseModel):
    text: str


class TicketIn(BaseModel):
    business_id: uuid.UUID
    subject: str
    description: str | None = None


class TicketUpdate(BaseModel):
    status: str | None = None
    subject: str | None = None
    description: str | None = None


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: SuperAdminRole
    is_active: bool
    created_at: datetime


class AdminUserIn(BaseModel):
    email: str
    full_name: str
    password: str
    role: SuperAdminRole = SuperAdminRole.support


class AdminUserUpdate(BaseModel):
    full_name: str | None = None
    role: SuperAdminRole | None = None
    is_active: bool | None = None
    password: str | None = None


class AdminAuditOut(BaseModel):
    id: uuid.UUID
    at: datetime
    admin_name: str | None
    action: str
    target_type: str | None
    target_id: uuid.UUID | None
    details: str | None


class SearchHit(BaseModel):
    business_id: uuid.UUID
    name: str
    business_code: str
    owner_full_name: str | None


class ConfirmIn(BaseModel):
    reason: str | None = None

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Korah Business Manager API"
    environment: str = "development"

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/korah"

    jwt_secret_key: str = "change-me-in-.env"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60 * 24

    # Origines autorisées pour le web (dev : localhost:3000), apps/admin (dev :
    # localhost:3001) et le desktop Tauri (webview : tauri.localhost). Activable via
    # CORS_ALLOW_ORIGINS en .env.
    cors_allow_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://tauri.localhost",
        "tauri://localhost",
        "https://biz-flow-theta.vercel.app",
    ]

    # Règles de santé d'usage du Super Admin (cahier Super Admin §8 : « règles configurables »,
    # jamais une note arbitraire). Modifiables via variables d'environnement.
    health_watch_after_days: int = 7
    health_risk_after_days: int = 30
    device_online_minutes: int = 10
    stale_sync_hours: int = 24
    pending_ops_alert: int = 20

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()

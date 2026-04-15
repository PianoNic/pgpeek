from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: Optional[str] = None
    read_only: bool = False
    auth_user: Optional[str] = None
    auth_pass: Optional[str] = None
    query_timeout_ms: int = 30_000
    cors_origins: str = "*"
    static_dir: Optional[str] = None

    class Config:
        env_prefix = ""

    @property
    def prefixed_aliases(self) -> dict:
        return {}


def _load() -> Settings:
    import os

    # Accept either PGPEEK_FOO or the unprefixed names that match pgweb/DATABASE_URL conventions.
    mapping = {
        "database_url": ["DATABASE_URL", "PGPEEK_DATABASE_URL"],
        "read_only": ["PGPEEK_READ_ONLY"],
        "auth_user": ["PGPEEK_AUTH_USER"],
        "auth_pass": ["PGPEEK_AUTH_PASS"],
        "query_timeout_ms": ["PGPEEK_QUERY_TIMEOUT_MS"],
        "cors_origins": ["PGPEEK_CORS_ORIGINS"],
        "static_dir": ["PGPEEK_STATIC_DIR"],
    }
    kwargs = {}
    for field, envs in mapping.items():
        for env in envs:
            val = os.environ.get(env)
            if val is not None and val != "":
                kwargs[field] = val
                break
    return Settings(**kwargs)


settings = _load()

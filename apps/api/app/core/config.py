import json
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve paths relative to this file so the backend can be started from any cwd.
# config.py lives at: apps/api/app/core/config.py
# parents[4] walks up to the monorepo root (Flora/).
_ROOT = Path(__file__).resolve().parents[4]
_API_DIR = Path(__file__).resolve().parents[2]  # apps/api/

# Load root .env first; apps/api/.env (if present) overrides for local dev.
_ENV_FILES = [str(_ROOT / ".env"), str(_API_DIR / ".env")]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILES, env_file_encoding="utf-8", extra="ignore")

    # App
    environment: str = "development"
    debug: bool = False

    # Security
    secret_key: str
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    algorithm: str = "HS256"

    # Database
    database_url: str

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Storage
    upload_dir: str = "/data/uploads"

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [v]
        return v

    # LLM provider: "openai" (default) or "anthropic"
    llm_provider: str = "openai"

    # OpenAI — default provider (Responses API)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # Anthropic — optional; set LLM_PROVIDER=anthropic + install anthropic package
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # Embeddings — Voyage AI (required for ingestion and search; validated at call site)
    voyage_api_key: str = ""
    voyage_model: str = "voyage-3"
    embedding_dimensions: int = 1024

    @model_validator(mode="after")
    def check_llm_keys(self) -> "Settings":
        if self.llm_provider == "openai" and not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY must be set when LLM_PROVIDER=openai")
        if self.llm_provider == "anthropic" and not self.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY must be set when LLM_PROVIDER=anthropic")
        return self


settings = Settings()  # type: ignore[call-arg]

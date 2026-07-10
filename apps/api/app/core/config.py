import json
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve paths relative to this file so the backend can be started from any cwd.
# In the monorepo: apps/api/app/core/config.py → parents[4] = repo root (Flora/).
# In Docker: /app/app/core/config.py → only 3 parents exist, so fall back to API dir.
_config_path = Path(__file__).resolve()
_API_DIR = _config_path.parents[2]  # apps/api/ in monorepo, /app in Docker
try:
    _ROOT = _config_path.parents[4]
except IndexError:
    _ROOT = _API_DIR

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

    # Cache backend: "memory" (default) | "redis"
    cache_backend: str = "memory"

    # Logging
    log_level: str = "INFO"

    # Storage
    upload_dir: str = "/data/uploads"

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001", "http://192.168.31.36:4000", "http://192.168.31.36:3000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [v]
        return v

    # LLM provider: "openai" | "anthropic" | "ollama"
    llm_provider: str = "openai"

    # OpenAI — default provider (Responses API)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # Anthropic — optional; set LLM_PROVIDER=anthropic + install anthropic package
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # Ollama — local inference; set LLM_PROVIDER=ollama (no API key required)
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen3:8b"

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
        # ollama requires no API key
        return self


settings = Settings()  # type: ignore[call-arg]

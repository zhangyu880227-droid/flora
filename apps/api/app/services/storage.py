"""
Abstract storage backend. Currently: local filesystem.
Swap in an S3Backend by implementing the same interface.
"""
import uuid
from pathlib import Path

from app.core.config import settings


class LocalStorageBackend:
    def save(self, workspace_id: uuid.UUID, source_id: uuid.UUID, filename: str, data: bytes) -> str:
        dest = Path(settings.upload_dir) / str(workspace_id) / str(source_id)
        dest.mkdir(parents=True, exist_ok=True)
        file_path = dest / filename
        file_path.write_bytes(data)
        return str(file_path)

    def delete(self, file_path: str) -> None:
        path = Path(file_path)
        if path.exists():
            path.unlink()


storage = LocalStorageBackend()

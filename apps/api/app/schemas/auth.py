import uuid

from pydantic import BaseModel, EmailStr, field_serializer


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    avatar_url: str | None

    model_config = {"from_attributes": True}

    @field_serializer("id")
    def serialize_id(self, v: uuid.UUID) -> str:
        return str(v)


class WorkspaceInfo(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}

    @field_serializer("id")
    def serialize_id(self, v: uuid.UUID) -> str:
        return str(v)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    workspace: WorkspaceInfo | None = None

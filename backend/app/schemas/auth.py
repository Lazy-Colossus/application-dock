from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CreateUserRequest(BaseModel):
    username: str


class UsersResponse(BaseModel):
    usernames: list[str]


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

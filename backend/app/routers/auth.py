from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.auth import (
    ChangePasswordRequest,
    CreateUserRequest,
    LoginRequest,
    TokenResponse,
    UsersResponse,
)
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest) -> TokenResponse:
    if not auth_service.verify_login(req.username, req.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=auth_service.create_access_token(req.username))


@router.get("/me")
def me(current_user: str = Depends(get_current_user)) -> dict[str, str]:
    return {"username": current_user}


@router.get("/users", response_model=UsersResponse)
def list_users(current_user: str = Depends(get_current_user)) -> UsersResponse:
    return UsersResponse(usernames=auth_service.list_usernames())


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    current_user: str = Depends(get_current_user),
) -> dict[str, str]:
    try:
        auth_service.change_password(current_user, req.current_password, req.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"detail": "Password changed"}


@router.post("/users", status_code=201)
def create_user(
    req: CreateUserRequest,
    current_user: str = Depends(get_current_user),
) -> dict[str, str]:
    try:
        auth_service.create_user(req.username)
    except auth_service.UserAlreadyExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"username": req.username}

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.auth import LoginRequest, TokenResponse
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

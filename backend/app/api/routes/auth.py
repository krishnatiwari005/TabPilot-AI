from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.db.database import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
bearer_scheme = HTTPBearer(auto_error=False)


@router.post("/register",response_model=UserResponse,status_code=status.HTTP_201_CREATED,)
def register(data: RegisterRequest,db: Session = Depends(get_db),):
    email = str(data.email).lower()
    existing_user = db.scalar(select(User).where(User.email == email))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(email=email,full_name=data.full_name,hashed_password=hash_password(data.password),)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest,db: Session = Depends(get_db),):
    email = str(data.email).lower()
    user = db.scalar(select(User).where(User.email == email))

    if not user or not verify_password(data.password,user.hashed_password,):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is disabled.",
        )
    token = create_access_token(user.id)
    return TokenResponse(access_token=token)


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),db: Session = Depends(get_db),) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(credentials.credentials)
        subject = payload.get("sub")

        if not isinstance(subject, str) or not subject.isdigit():
            raise InvalidTokenError("Invalid token subject")

        user_id = int(subject)

    except (InvalidTokenError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    user = db.get(User, user_id)

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user),):
    return current_user
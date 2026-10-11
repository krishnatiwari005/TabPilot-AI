from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text

from app.api.routes.auth import router as auth_router
from app.db.database import Base, engine
from app.models import User  
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.chat import router as chat_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Development convenience. Use Alembic migrations in production.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="TabPilot AI API",
    description="Authentication and AI-agent backend for TabPilot AI.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router)
app.include_router(chat_router)

@app.get("/")
def root():
    return {
        "message": "TabPilot AI API is running",
    }


@app.get("/health/db")
def database_health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    return {"database": "connected"}
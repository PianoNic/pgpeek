import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles

from .api import router as api_router
from .db import manager
from .settings import settings

security = HTTPBasic(auto_error=False)


def verify_auth(credentials: HTTPBasicCredentials | None = Depends(security)):
    if not settings.auth_user:
        return None
    if credentials is None:
        raise HTTPException(
            401, "Auth required", headers={"WWW-Authenticate": "Basic"}
        )
    ok = secrets.compare_digest(
        credentials.username, settings.auth_user
    ) and secrets.compare_digest(credentials.password, settings.auth_pass or "")
    if not ok:
        raise HTTPException(
            401, "Bad credentials", headers={"WWW-Authenticate": "Basic"}
        )
    return credentials.username


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        manager.add("default", settings.database_url, id="default")
    yield
    await manager.close_all()


app = FastAPI(title="pgpeek", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[s.strip() for s in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"ok": True, "read_only": settings.read_only, "auth": bool(settings.auth_user)}


app.include_router(api_router, prefix="/api", dependencies=[Depends(verify_auth)])


static_dir = Path(settings.static_dir) if settings.static_dir else Path("/app/static")
if static_dir.is_dir():
    assets_dir = static_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    index_file = static_dir / "index.html"

    @app.get("/")
    async def root():
        if index_file.exists():
            return FileResponse(str(index_file))
        raise HTTPException(404)

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        candidate = static_dir / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        if index_file.exists():
            return FileResponse(str(index_file))
        raise HTTPException(404)

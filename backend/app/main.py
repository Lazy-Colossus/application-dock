from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.routers import shell

app = FastAPI(title="Application Dock")

api_router = APIRouter(prefix="/api", tags=["health"])


@api_router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router)
app.include_router(shell.router)


# Serve the built Quasar SPA when present (production / post-build). In dev the
# frontend runs on its own Vite server and proxies /api/* here, so the dist
# directory will not exist — skip the mount in that case so uvicorn can boot.
_DIST_DIR = Path(__file__).resolve().parent.parent / "dist" / "spa"

if _DIST_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=_DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> FileResponse:
        # Any non-/api route returns index.html so Vue Router (history mode) can
        # handle the path on the client.
        return FileResponse(_DIST_DIR / "index.html")


# Touch settings so the module-level mkdir on DATA_DIR runs at import time.
_ = settings.data_dir

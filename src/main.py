import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.agent.runner import start_agent, stop_agent
from src.central import db as central_db
from src.config import settings
from src.recorder.manager import recorder_loop
from src.routes import agent_local, cameras, central_admin, central_agent, live, recordings, system

logger = logging.getLogger(__name__)
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
ADMIN_DIR = STATIC_DIR / "admin"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    if settings.central_mock:
        await central_db.init_central_db()
        logger.info("Serveur central mock actif — admin : /admin")
    task = asyncio.create_task(recorder_loop())
    start_agent()
    logger.info("RaspNVR démarré — %s", settings.recordings_dir)
    yield
    await stop_agent()
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


app = FastAPI(title="RaspNVR Edge", version="0.2.0", lifespan=lifespan)
app.include_router(agent_local.router)
app.include_router(cameras.router)
app.include_router(live.router)
app.include_router(system.router)
app.include_router(recordings.router)

if settings.central_mock:
    app.include_router(central_agent.router)
    app.include_router(central_admin.router)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "RaspNVR edge API", "docs": "/docs"}


@app.get("/cameras")
async def cameras_page():
    page = STATIC_DIR / "cameras.html"
    if page.exists():
        return FileResponse(page)
    raise HTTPException(status_code=404)


@app.get("/settings")
async def settings_page():
    page = STATIC_DIR / "settings.html"
    if page.exists():
        return FileResponse(page)
    raise HTTPException(status_code=404)


@app.get("/admin")
async def admin_page():
    if not settings.central_mock:
        raise HTTPException(status_code=404, detail="Admin central désactivé")
    page = ADMIN_DIR / "index.html"
    if page.exists():
        return FileResponse(page)
    raise HTTPException(status_code=404)

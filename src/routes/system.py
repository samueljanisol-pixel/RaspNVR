import shutil

from fastapi import APIRouter, HTTPException

from src.config import settings
from src.db import get_db
from src.models import AppSettingsOut, AppSettingsUpdate, HostnameUpdate, SystemStatus
from src.settings_store import load_settings, save_settings
from src.system_hostname import apply_hostname, get_current_hostname

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/status", response_model=SystemStatus)
async def system_status() -> SystemStatus:
    settings.ensure_dirs()
    app_settings = load_settings()
    usage = shutil.disk_usage(settings.recordings_dir)
    db = await get_db()
    try:
        cursor = await db.execute("SELECT COUNT(*) AS c FROM cameras")
        row = await cursor.fetchone()
        camera_count = int(row["c"]) if row else 0
    finally:
        await db.close()

    total_gb = usage.total / (1024**3)
    used_gb = usage.used / (1024**3)
    return SystemStatus(
        store_code=settings.store_code,
        app_name=app_settings["app_name"],
        hostname=get_current_hostname(),
        disk_total_gb=round(total_gb, 2),
        disk_used_gb=round(used_gb, 2),
        disk_used_percent=round(100 * usage.used / usage.total, 1),
        camera_count=camera_count,
        recordings_dir=str(settings.recordings_dir),
    )


@router.get("/settings", response_model=AppSettingsOut)
async def get_app_settings() -> AppSettingsOut:
    app_settings = load_settings()
    return AppSettingsOut(
        app_name=app_settings["app_name"],
        hostname=get_current_hostname(),
        store_code=settings.store_code,
    )


@router.patch("/settings", response_model=AppSettingsOut)
async def update_app_settings(payload: AppSettingsUpdate) -> AppSettingsOut:
    if payload.app_name is None:
        return await get_app_settings()
    name = payload.app_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom de l'application requis")
    saved = save_settings({"app_name": name})
    return AppSettingsOut(
        app_name=saved["app_name"],
        hostname=get_current_hostname(),
        store_code=settings.store_code,
    )


@router.post("/hostname", response_model=AppSettingsOut)
async def update_hostname(payload: HostnameUpdate) -> AppSettingsOut:
    try:
        ok, message = apply_hostname(payload.hostname)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not ok:
        raise HTTPException(status_code=500, detail=message)

    app_settings = load_settings()
    return AppSettingsOut(
        app_name=app_settings["app_name"],
        hostname=get_current_hostname(),
        store_code=settings.store_code,
    )

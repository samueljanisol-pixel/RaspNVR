import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from src.central import db as central_db
from src.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/raspnvr/admin", tags=["central-admin"])

ONLINE_THRESHOLD_SEC = 120


class CommandCreate(BaseModel):
    type: str = Field(min_length=1, max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)


class StoreCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    sort_order: int | None = None


class StoreUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    code: str | None = Field(default=None, min_length=1, max_length=64)
    sort_order: int | None = None


def _require_admin(authorization: Optional[str] = Header(default=None)) -> None:
    if not settings.admin_api_key:
        return
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Non autorisé")
    token = authorization.split(" ", 1)[1].strip()
    if token != settings.admin_api_key:
        raise HTTPException(status_code=401, detail="Non autorisé")


def _device_online(last_seen_at: Optional[str]) -> bool:
    if not last_seen_at:
        return False
    try:
        seen = datetime.fromisoformat(last_seen_at.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - seen.astimezone(timezone.utc)
        return delta.total_seconds() < ONLINE_THRESHOLD_SEC
    except ValueError:
        return False


@router.get("/stores")
async def list_stores(authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization)
    stores = await central_db.list_stores()
    devices = await central_db.list_devices()
    by_store = {d["store_id"]: d for d in devices}
    rows = []
    for store in stores:
        device = by_store.get(store["id"])
        rows.append(
            {
                **store,
                "device": device,
                "online": _device_online(device.get("last_seen_at")) if device else False,
            }
        )
    return {"stores": rows}


@router.post("/stores")
async def create_store(
    body: StoreCreate,
    authorization: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    _require_admin(authorization)
    try:
        store = await central_db.create_store(
            code=body.code,
            name=body.name,
            sort_order=body.sort_order,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"store": store}


@router.get("/stores/{store_id}")
async def get_store(store_id: str, authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization)
    detail = await central_db.get_store_detail(store_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Magasin introuvable")
    device = detail.get("device")
    if device:
        device["online"] = _device_online(device.get("last_seen_at"))
    return detail


@router.patch("/stores/{store_id}")
async def update_store(
    store_id: str,
    body: StoreUpdate,
    authorization: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    _require_admin(authorization)
    try:
        store = await central_db.update_store(
            store_id,
            name=body.name,
            code=body.code,
            sort_order=body.sort_order,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not store:
        raise HTTPException(status_code=404, detail="Magasin introuvable")
    return {"store": store}


@router.post("/stores/{store_id}/token")
async def create_token(store_id: str, authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization)
    stores = await central_db.list_stores()
    if not any(s["id"] == store_id for s in stores):
        raise HTTPException(status_code=404, detail="Magasin introuvable")
    token = await central_db.create_registration_token(store_id)
    return {"token": token, "expires_hours": 48}


@router.post("/stores/{store_id}/commands")
async def create_command(
    store_id: str,
    body: CommandCreate,
    authorization: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    _require_admin(authorization)
    devices = await central_db.list_devices()
    device = next((d for d in devices if d["store_id"] == store_id), None)
    if not device:
        raise HTTPException(status_code=404, detail="Aucun device enregistré")
    command = await central_db.create_command(device["id"], body.type, body.payload)
    return {"command": command}


@router.get("/recordings/{recording_id}/url")
async def recording_url(recording_id: str, authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization)
    async with central_db.get_connection() as db:
        row = await (
            await db.execute("SELECT storage_path FROM recordings WHERE id = ?", (recording_id,))
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Enregistrement introuvable")
    path = central_db.central_recording_path(row["storage_path"])
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return {"url": f"/api/raspnvr/admin/recordings/{recording_id}/file", "expires_in": 3600}


@router.get("/recordings/{recording_id}/file")
async def recording_file(recording_id: str, authorization: Optional[str] = Header(default=None)):
    from fastapi.responses import FileResponse

    _require_admin(authorization)
    async with central_db.get_connection() as db:
        row = await (
            await db.execute("SELECT storage_path FROM recordings WHERE id = ?", (recording_id,))
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Enregistrement introuvable")
    path = central_db.central_recording_path(row["storage_path"])
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return FileResponse(path, media_type="video/x-matroska", filename=path.name)

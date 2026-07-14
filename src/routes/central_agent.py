import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from src.central import db as central_db
from src.central.auth import generate_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/raspnvr/agent", tags=["central-agent"])
bearer_scheme = HTTPBearer(auto_error=False)


class RegisterBody(BaseModel):
    store_code: str = Field(min_length=1, max_length=64)
    registration_token: str = Field(min_length=1, max_length=128)
    hostname: str = Field(default="", max_length=128)
    agent_version: str = Field(default="1.0.0", max_length=32)


class TunnelBody(BaseModel):
    tunnel_url: str = Field(min_length=8, max_length=512)


class RecordingRegisterBody(BaseModel):
    camera_id: int
    camera_name: str = ""
    local_path: str
    size_bytes: int = 0
    started_at: str


class AckBody(BaseModel):
    success: bool = True
    result: dict[str, Any] = Field(default_factory=dict)


async def get_device(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict[str, Any]:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Token Bearer requis")
    device = await central_db.get_device_by_api_key(credentials.credentials)
    if not device:
        raise HTTPException(status_code=401, detail="Device inconnu")
    return device


@router.post("/register")
async def register_device(body: RegisterBody) -> dict[str, str]:
    store = await central_db.get_store_by_code(body.store_code)
    if not store:
        raise HTTPException(status_code=404, detail="Magasin introuvable")

    valid = await central_db.consume_registration_token(store["id"], body.registration_token)
    if not valid:
        raise HTTPException(status_code=403, detail="Token invalide ou expiré")

    api_key = generate_token(32)
    device = await central_db.register_device(
        store["id"],
        api_key=api_key,
        hostname=body.hostname or f"raspnvr-{body.store_code}",
        agent_version=body.agent_version,
    )
    return {"device_id": device["id"], "api_key": api_key}


@router.post("/heartbeat")
async def heartbeat(
    payload: dict[str, Any],
    device: dict[str, Any] = Depends(get_device),
) -> dict[str, str]:
    await central_db.update_device_heartbeat(device["id"], payload)
    return {"status": "ok"}


@router.get("/commands")
async def list_commands(device: dict[str, Any] = Depends(get_device)) -> dict[str, list]:
    commands = await central_db.list_pending_commands(device["id"])
    return {"commands": commands}


@router.post("/commands/{command_id}/ack")
async def ack_command(
    command_id: str,
    body: AckBody,
    device: dict[str, Any] = Depends(get_device),
) -> dict[str, str]:
    ok = await central_db.ack_command(
        command_id,
        device["id"],
        success=body.success,
        result=body.result,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return {"status": "ok"}


@router.post("/tunnel")
async def update_tunnel(
    body: TunnelBody,
    device: dict[str, Any] = Depends(get_device),
) -> dict[str, str]:
    url = body.tunnel_url.strip().rstrip("/")
    await central_db.update_device_tunnel(device["id"], url)
    return {"status": "ok", "tunnel_url": url}


@router.post("/recordings")
async def prepare_recording_upload(
    body: RecordingRegisterBody,
    device: dict[str, Any] = Depends(get_device),
) -> dict[str, str]:
    filename = body.local_path.split("/")[-1].split("\\")[-1]
    storage_path = f"{device['store_code']}/cam_{body.camera_id}/{filename}"
    recording = await central_db.register_recording(
        device["id"],
        device["store_id"],
        camera_id=body.camera_id,
        camera_name=body.camera_name,
        storage_path=storage_path,
        local_path=body.local_path,
        size_bytes=body.size_bytes,
        started_at=body.started_at,
    )
    upload_url = f"/api/raspnvr/agent/recordings/{recording['id']}/upload"
    return {
        "recording_id": recording["id"],
        "storage_path": storage_path,
        "upload_url": upload_url,
    }


@router.put("/recordings/{recording_id}/upload")
async def upload_recording_file(
    recording_id: str,
    request: Request,
    device: dict[str, Any] = Depends(get_device),
) -> dict[str, str]:
    async with central_db.get_connection() as db:
        row = await (
            await db.execute(
                "SELECT * FROM recordings WHERE id = ? AND device_id = ?",
                (recording_id, device["id"]),
            )
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Enregistrement introuvable")

    dest = central_db.central_recording_path(row["storage_path"])
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = await request.body()
    dest.write_bytes(data)
    return {"status": "ok", "storage_path": row["storage_path"]}

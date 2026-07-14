import shutil

from fastapi import APIRouter, HTTPException

from src.db import get_db
from src.models import CameraCreate, CameraOut, CameraUpdate
from src.recorder.manager import get_hls_url, recorder
from src.rtsp_utils import normalize_rtsp_url

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


async def _get_camera_row(camera_id: int) -> dict | None:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, name, rtsp_sub, rtsp_main, enabled FROM cameras WHERE id = ?",
            (camera_id,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


def _camera_out(row: dict) -> CameraOut:
    return CameraOut(
        id=row["id"],
        name=row["name"],
        rtsp_sub=row["rtsp_sub"],
        rtsp_main=row["rtsp_main"],
        enabled=bool(row["enabled"]),
        hls_url=get_hls_url(row["id"]),
        recording=recorder.is_recording(row["id"]),
    )


@router.get("", response_model=list[CameraOut])
async def list_cameras() -> list[CameraOut]:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, name, rtsp_sub, rtsp_main, enabled FROM cameras ORDER BY id"
        )
        rows = await cursor.fetchall()
        return [_camera_out(dict(row)) for row in rows]
    finally:
        await db.close()


@router.get("/{camera_id}", response_model=CameraOut)
async def get_camera(camera_id: int) -> CameraOut:
    row = await _get_camera_row(camera_id)
    if not row:
        raise HTTPException(status_code=404, detail="Caméra introuvable")
    return _camera_out(row)


@router.post("", response_model=CameraOut, status_code=201)
async def create_camera(payload: CameraCreate) -> CameraOut:
    rtsp_sub = normalize_rtsp_url(payload.rtsp_sub) or payload.rtsp_sub
    rtsp_main = normalize_rtsp_url(payload.rtsp_main)

    db = await get_db()
    try:
        cursor = await db.execute(
            """
            INSERT INTO cameras (name, rtsp_sub, rtsp_main)
            VALUES (?, ?, ?)
            """,
            (payload.name, rtsp_sub, rtsp_main),
        )
        await db.commit()
        camera_id = cursor.lastrowid
    finally:
        await db.close()

    camera = {
        "id": camera_id,
        "name": payload.name,
        "rtsp_sub": rtsp_sub,
        "rtsp_main": rtsp_main,
        "enabled": True,
    }
    await recorder.ensure_camera(camera)
    return _camera_out(camera)


@router.patch("/{camera_id}", response_model=CameraOut)
async def update_camera(camera_id: int, payload: CameraUpdate) -> CameraOut:
    row = await _get_camera_row(camera_id)
    if not row:
        raise HTTPException(status_code=404, detail="Caméra introuvable")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return _camera_out(row)

    name = updates.get("name", row["name"])
    rtsp_sub = updates.get("rtsp_sub", row["rtsp_sub"])
    rtsp_main = updates.get("rtsp_main", row["rtsp_main"])
    enabled = int(updates.get("enabled", row["enabled"]))

    rtsp_sub = normalize_rtsp_url(rtsp_sub) or rtsp_sub
    rtsp_main = normalize_rtsp_url(rtsp_main)

    db = await get_db()
    try:
        await db.execute(
            """
            UPDATE cameras SET name = ?, rtsp_sub = ?, rtsp_main = ?, enabled = ?
            WHERE id = ?
            """,
            (name, rtsp_sub, rtsp_main, enabled, camera_id),
        )
        await db.commit()
    finally:
        await db.close()

    camera = {
        "id": camera_id,
        "name": name,
        "rtsp_sub": rtsp_sub,
        "rtsp_main": rtsp_main,
        "enabled": bool(enabled),
    }
    await recorder.stop_camera(camera_id)
    if camera["enabled"]:
        await recorder.ensure_camera(camera)

    return _camera_out(camera)


@router.delete("/{camera_id}", status_code=204)
async def delete_camera(camera_id: int) -> None:
    await recorder.stop_camera(camera_id)
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM cameras WHERE id = ?", (camera_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Caméra introuvable")
        await db.execute("DELETE FROM segments WHERE camera_id = ?", (camera_id,))
        await db.execute("DELETE FROM cameras WHERE id = ?", (camera_id,))
        await db.commit()
    finally:
        await db.close()

    from src.config import settings

    cam_path = settings.recordings_dir / f"cam_{camera_id}"
    if cam_path.exists():
        shutil.rmtree(cam_path, ignore_errors=True)


@router.post("/{camera_id}/restart", response_model=CameraOut)
async def restart_camera(camera_id: int) -> CameraOut:
    row = await _get_camera_row(camera_id)
    if not row:
        raise HTTPException(status_code=404, detail="Caméra introuvable")

    await recorder.stop_camera(camera_id)
    if row["enabled"]:
        await recorder.ensure_camera(row)

    return _camera_out(row)

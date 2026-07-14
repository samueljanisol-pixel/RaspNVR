import asyncio
import logging
from pathlib import Path
from typing import Any, Optional

from src.agent.client import CentralClient
from src.agent.storage import get_api_key, is_registered, update_agent_fields
from src.config import settings

logger = logging.getLogger(__name__)

_upload_lock = asyncio.Lock()


async def upload_segment(segment_id: int, camera_id: int, path: str, started_at: str, size_bytes: int) -> bool:
    if not is_registered() or not (settings.storage_upload_enabled or settings.central_mock):
        return False

    from src.db import get_db

    client = CentralClient(timeout=120.0)
    file_path = Path(path)
    if not file_path.is_file() or file_path.stat().st_size < 1024:
        return False

    camera_name = ""
    db = await get_db()
    try:
        row = await (
            await db.execute("SELECT name FROM cameras WHERE id = ?", (camera_id,))
        ).fetchone()
        if row:
            camera_name = row["name"]
    finally:
        await db.close()

    try:
        prep = await client.prepare_recording_upload(
            {
                "camera_id": camera_id,
                "camera_name": camera_name,
                "local_path": str(file_path),
                "size_bytes": size_bytes,
                "started_at": started_at,
            }
        )
        upload_path = prep.get("upload_url", "")
        if upload_path.startswith("http"):
            async with __import__("httpx").AsyncClient(timeout=120.0) as http:
                data = file_path.read_bytes()
                resp = await http.put(
                    upload_path,
                    content=data,
                    headers={
                        "Authorization": f"Bearer {get_api_key()}",
                        "Content-Type": "video/x-matroska",
                    },
                )
                if resp.status_code >= 400:
                    raise RuntimeError(resp.text)
        else:
            await client.upload_recording_file(upload_path, str(file_path))

        db = await get_db()
        try:
            await db.execute(
                "UPDATE segments SET uploaded_at = datetime('now') WHERE id = ?",
                (segment_id,),
            )
            await db.commit()
        finally:
            await db.close()
        return True
    except Exception as exc:
        logger.warning("Upload segment %s: %s", path, exc)
        return False


async def upload_pending_segments(limit: int = 5) -> dict[str, Any]:
    if not is_registered():
        return {"uploaded": 0, "error": "Device non enregistré"}

    from src.db import get_db

    async with _upload_lock:
        db = await get_db()
        try:
            cursor = await db.execute(
                """
                SELECT id, camera_id, path, started_at, size_bytes
                FROM segments
                WHERE uploaded_at IS NULL AND size_bytes >= 1024
                ORDER BY started_at ASC
                LIMIT ?
                """,
                (limit,),
            )
            rows = await cursor.fetchall()
        finally:
            await db.close()

        uploaded = 0
        import time

        now = time.time()
        for row in rows:
            file_path = Path(row["path"])
            if file_path.is_file() and (now - file_path.stat().st_mtime) < 90:
                continue
            ok = await upload_segment(
                row["id"],
                row["camera_id"],
                row["path"],
                row["started_at"],
                row["size_bytes"],
            )
            if ok:
                uploaded += 1
        return {"uploaded": uploaded, "pending_checked": len(rows)}


async def queue_upload_for_path(path: str, camera_id: int) -> None:
    if not settings.storage_upload_enabled or not is_registered():
        return
    asyncio.create_task(_upload_path_task(path, camera_id))


async def _upload_path_task(path: str, camera_id: int) -> None:
    await asyncio.sleep(2)
    from src.db import get_db

    db = await get_db()
    try:
        row = await (
            await db.execute(
                "SELECT id, started_at, size_bytes, uploaded_at FROM segments WHERE path = ?",
                (path,),
            )
        ).fetchone()
    finally:
        await db.close()
    if not row or row["uploaded_at"]:
        return
    await upload_segment(row["id"], camera_id, path, row["started_at"], row["size_bytes"])

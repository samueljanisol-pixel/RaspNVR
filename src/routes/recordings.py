from fastapi import APIRouter

from src.db import get_db

router = APIRouter(prefix="/api/recordings", tags=["recordings"])


@router.get("")
async def list_recordings(camera_id: int | None = None, limit: int = 50) -> list[dict]:
    db = await get_db()
    try:
        if camera_id:
            cursor = await db.execute(
                """
                SELECT s.id, s.camera_id, c.name AS camera_name, s.path, s.started_at, s.size_bytes
                FROM segments s
                JOIN cameras c ON c.id = s.camera_id
                WHERE s.camera_id = ?
                ORDER BY s.started_at DESC
                LIMIT ?
                """,
                (camera_id, limit),
            )
        else:
            cursor = await db.execute(
                """
                SELECT s.id, s.camera_id, c.name AS camera_name, s.path, s.started_at, s.size_bytes
                FROM segments s
                JOIN cameras c ON c.id = s.camera_id
                ORDER BY s.started_at DESC
                LIMIT ?
                """,
                (limit,),
            )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()

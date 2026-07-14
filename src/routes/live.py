from fastapi import APIRouter
from fastapi.responses import Response
import httpx

from src.config import settings

router = APIRouter(prefix="/api/hls", tags=["live"])


@router.get("/cam{camera_id}/{path:path}")
async def proxy_hls(camera_id: int, path: str) -> Response:
    url = f"{settings.mediamtx_hls_base}/cam{camera_id}/{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url)
    media_type = resp.headers.get("content-type", "application/octet-stream")
    return Response(content=resp.content, media_type=media_type, status_code=resp.status_code)

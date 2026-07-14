from fastapi import APIRouter, Response
import httpx

from src.config import settings

router = APIRouter(prefix="/api/hls", tags=["live"])

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
}


@router.options("/cam{camera_id}/{path:path}")
async def proxy_hls_options(camera_id: int, path: str) -> Response:
    return Response(status_code=204, headers=CORS_HEADERS)


@router.get("/cam{camera_id}/{path:path}")
async def proxy_hls(camera_id: int, path: str) -> Response:
    url = f"{settings.mediamtx_hls_base}/cam{camera_id}/{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url)
    media_type = resp.headers.get("content-type", "application/octet-stream")
    return Response(
        content=resp.content,
        media_type=media_type,
        status_code=resp.status_code,
        headers=CORS_HEADERS,
    )

import asyncio
import contextlib
import logging
import os
import shutil
import signal
import socket
from datetime import datetime, timezone
from pathlib import Path

import httpx

from src.config import settings

logger = logging.getLogger(__name__)


class RecorderManager:
    def __init__(self) -> None:
        self._tasks: dict[int, asyncio.Task] = {}
        self._procs: dict[int, asyncio.subprocess.Process] = {}

    def is_recording(self, camera_id: int) -> bool:
        proc = self._procs.get(camera_id)
        return proc is not None and proc.returncode is None

    async def sync_cameras(self, cameras: list[dict]) -> None:
        enabled_ids = {c["id"] for c in cameras if c["enabled"]}
        for camera_id in list(self._procs.keys()):
            if camera_id not in enabled_ids:
                await self.stop_camera(camera_id)
        for camera in cameras:
            if camera["enabled"]:
                await self.ensure_camera(camera)

    async def ensure_camera(self, camera: dict) -> None:
        camera_id = camera["id"]
        if self.is_recording(camera_id):
            return
        await self._configure_mediamtx(camera)
        await self.start_camera(camera)

    async def _configure_mediamtx(self, camera: dict) -> None:
        path_name = f"cam{camera['id']}"
        live_url = camera.get("rtsp_sub") or camera["rtsp_main"]
        escaped_url = live_url.replace("'", "'\\''")
        # HLS ne supporte pas G711 : ffmpeg transcode l'audio en AAC vers MediaMTX.
        run_on_init = (
            "ffmpeg -hide_banner -loglevel warning -rtsp_transport tcp "
            "-fflags nobuffer -flags low_delay -probesize 32 -analyzeduration 0 "
            f"-i '{escaped_url}' -c:v copy -c:a aac -ar 44100 -ac 1 -b:a 64k "
            f"-async 1 -f rtsp rtsp://127.0.0.1:8554/{path_name}"
        )
        payload = {
            "runOnInit": run_on_init,
            "runOnInitRestart": True,
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            base = f"{settings.mediamtx_api_url}/v3/config/paths"
            try:
                await client.post(f"{base}/delete/{path_name}")
            except httpx.HTTPError as exc:
                logger.debug("MediaMTX delete %s: %s", path_name, exc)
            for method, url in (
                ("post", f"{base}/add/{path_name}"),
                ("patch", f"{base}/patch/{path_name}"),
            ):
                try:
                    resp = await client.request(method, url, json=payload)
                    if resp.status_code in (200, 201):
                        logger.info("MediaMTX %s configuré (AAC)", path_name)
                        return
                except httpx.HTTPError as exc:
                    logger.warning("MediaMTX API %s: %s", method, exc)

    async def start_camera(self, camera: dict) -> None:
        camera_id = camera["id"]
        cam_dir = settings.recordings_dir / f"cam_{camera_id}"
        cam_dir.mkdir(parents=True, exist_ok=True)
        pattern = str(cam_dir / "seg_%Y%m%d_%H%M%S.mkv")

        cmd = [
            settings.ffmpeg_bin,
            "-hide_banner",
            "-loglevel",
            "warning",
            "-rtsp_transport",
            "tcp",
            "-i",
            camera["rtsp_sub"],
            "-map",
            "0:v:0",
            "-c",
            "copy",
            "-f",
            "segment",
            "-segment_time",
            str(settings.segment_seconds),
            "-reset_timestamps",
            "1",
            "-strftime",
            "1",
            pattern,
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._procs[camera_id] = proc
        self._tasks[camera_id] = asyncio.create_task(self._watch_process(camera_id, proc, cam_dir))

    async def _watch_process(self, camera_id: int, proc: asyncio.subprocess.Process, cam_dir: Path) -> None:
        try:
            while proc.returncode is None:
                await asyncio.sleep(5)
                await self._index_new_segments(camera_id, cam_dir)
                await self._enforce_retention()
        finally:
            if proc.returncode is None:
                proc.send_signal(signal.SIGTERM)
                try:
                    await asyncio.wait_for(proc.wait(), timeout=5)
                except TimeoutError:
                    proc.kill()
            self._procs.pop(camera_id, None)
            self._tasks.pop(camera_id, None)

    async def _index_new_segments(self, camera_id: int, cam_dir: Path) -> None:
        from src.db import get_db

        db = await get_db()
        try:
            for file_path in sorted(cam_dir.glob("seg_*.mkv")):
                stat = file_path.stat()
                if stat.st_size < 1024:
                    continue
                await db.execute(
                    """
                    INSERT OR IGNORE INTO segments (camera_id, path, started_at, size_bytes)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        camera_id,
                        str(file_path),
                        datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                        stat.st_size,
                    ),
                )
            await db.commit()
        finally:
            await db.close()

    async def _enforce_retention(self) -> None:
        usage = shutil.disk_usage(settings.recordings_dir)
        if usage.used / usage.total < settings.disk_usage_threshold:
            return

        from src.db import get_db

        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT id, path FROM segments ORDER BY started_at ASC LIMIT 20"
            )
            rows = await cursor.fetchall()
            for row in rows:
                path = Path(row["path"])
                if path.exists():
                    path.unlink(missing_ok=True)
                await db.execute("DELETE FROM segments WHERE id = ?", (row["id"],))
                usage = shutil.disk_usage(settings.recordings_dir)
                if usage.used / usage.total < settings.disk_usage_threshold:
                    break
            await db.commit()
        finally:
            await db.close()

    async def stop_camera(self, camera_id: int) -> None:
        task = self._tasks.pop(camera_id, None)
        proc = self._procs.pop(camera_id, None)
        if proc and proc.returncode is None:
            proc.send_signal(signal.SIGTERM)
            try:
                await asyncio.wait_for(proc.wait(), timeout=5)
            except TimeoutError:
                proc.kill()
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task


recorder = RecorderManager()


async def recorder_loop() -> None:
    from src.db import get_db

    while True:
        try:
            db = await get_db()
            try:
                cursor = await db.execute(
                    "SELECT id, name, rtsp_sub, rtsp_main, enabled FROM cameras WHERE enabled = 1"
                )
                cameras = [dict(row) for row in await cursor.fetchall()]
            finally:
                await db.close()
            await recorder.sync_cameras(cameras)
        except Exception:
            logger.exception("Recorder loop error")
        await asyncio.sleep(15)


def get_hls_url(camera_id: int) -> str:
    return f"/api/hls/cam{camera_id}/index.m3u8"


def get_hostname() -> str:
    return socket.gethostname()

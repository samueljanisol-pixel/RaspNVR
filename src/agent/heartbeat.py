import logging
import shutil
from datetime import datetime
from typing import Any

from src.agent.client import AGENT_VERSION
from src.agent.storage import get_store_code, load_agent_data, public_config
from src.config import settings
from src.settings_store import load_settings
from src.system_hostname import get_current_hostname

logger = logging.getLogger(__name__)


async def build_heartbeat_payload() -> dict[str, Any]:
    from src.db import get_db

    app_settings = load_settings()
    usage = shutil.disk_usage(settings.recordings_dir)
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id, name, enabled FROM cameras ORDER BY id")
        cameras = [dict(row) for row in await cursor.fetchall()]
        from src.recorder.manager import recorder

        camera_entries = []
        for cam in cameras:
            camera_entries.append(
                {
                    "id": cam["id"],
                    "name": cam["name"],
                    "enabled": bool(cam["enabled"]),
                    "recording": recorder.is_recording(cam["id"]),
                    "hls_url": f"/api/hls/cam{cam['id']}/index.m3u8",
                }
            )
    finally:
        await db.close()

    agent_cfg = public_config()
    return {
        "store_code": get_store_code(),
        "device_id": agent_cfg.get("device_id"),
        "hostname": get_current_hostname(),
        "app_name": app_settings["app_name"],
        "agent_version": AGENT_VERSION,
        "server_time": datetime.now().isoformat(timespec="seconds"),
        "camera_count": len(camera_entries),
        "cameras": camera_entries,
        "disk_total_gb": round(usage.total / (1024**3), 2),
        "disk_used_gb": round(usage.used / (1024**3), 2),
        "disk_used_percent": round(100 * usage.used / usage.total, 1),
        "tunnel_url": agent_cfg.get("tunnel_url"),
        "agent_meta": load_agent_data().get("agent_meta") or {},
    }

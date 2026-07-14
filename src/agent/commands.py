import logging
import subprocess
from typing import Any

from src.agent.upload import upload_pending_segments
from src.config import settings

logger = logging.getLogger(__name__)


async def execute_command(command: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    cmd_type = str(command.get("type") or "").strip()
    payload = command.get("payload") or {}
    if not isinstance(payload, dict):
        payload = {}

    try:
        if cmd_type == "restart_service":
            if settings.allow_service_restart:
                subprocess.run(
                    ["systemctl", "restart", "raspnvr"],
                    check=False,
                    capture_output=True,
                    text=True,
                )
                return True, {"message": "Redémarrage du service demandé"}
            return False, {"error": "Redémarrage service désactivé"}
        if cmd_type == "upload_recordings":
            summary = await upload_pending_segments()
            return True, summary
        if cmd_type == "sync_now":
            summary = await upload_pending_segments()
            return True, summary
        return False, {"error": f"Commande inconnue: {cmd_type}"}
    except Exception as exc:
        logger.exception("Échec commande %s", cmd_type)
        return False, {"error": str(exc)}

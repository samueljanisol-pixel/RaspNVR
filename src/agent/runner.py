import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from src.agent.client import CentralClient
from src.agent.commands import execute_command
from src.agent.heartbeat import build_heartbeat_payload
from src.agent.register import try_register_from_storage
from src.agent.storage import is_registered, load_agent_data, update_agent_fields
from src.agent.tunnel import publish_tunnel_if_needed
from src.agent.upload import upload_pending_segments
from src.config import settings

logger = logging.getLogger(__name__)

_agent_task: Optional[asyncio.Task[None]] = None
_state: dict[str, Any] = {
    "running": False,
    "last_heartbeat_at": None,
    "last_upload_at": None,
    "last_error": None,
    "last_command_at": None,
}


def get_agent_state() -> dict[str, Any]:
    return dict(_state)


def _set_error(message: str | None) -> None:
    _state["last_error"] = message


async def _poll_once(client: CentralClient) -> None:
    if not client.central_configured():
        _set_error("URL centrale non configurée")
        return

    if not is_registered():
        registered = await try_register_from_storage()
        if not registered:
            _set_error("En attente d'enregistrement (code magasin + token)")
            return

    await publish_tunnel_if_needed()

    payload = await build_heartbeat_payload()
    await client.heartbeat(payload)
    _state["last_heartbeat_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    _set_error(None)

    commands = await client.fetch_commands()
    for command in commands:
        command_id = str(command.get("id") or "")
        if not command_id:
            continue
        success, result = await execute_command(command)
        await client.ack_command(command_id, success=success, result=result)
        _state["last_command_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    if settings.storage_upload_enabled or settings.central_mock:
        summary = await upload_pending_segments(limit=2)
        if summary.get("uploaded"):
            _state["last_upload_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            meta = load_agent_data().get("agent_meta") or {}
            meta["last_upload_summary"] = summary
            update_agent_fields(agent_meta=meta)


async def _agent_loop() -> None:
    client = CentralClient()
    _state["running"] = True
    logger.info("Agent central démarré (intervalle %ss)", settings.agent_poll_seconds)
    while True:
        try:
            await _poll_once(client)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Erreur agent: %s", exc)
            _set_error(str(exc))
        await asyncio.sleep(settings.agent_poll_seconds)


def start_agent() -> None:
    global _agent_task
    if not settings.agent_enabled:
        logger.info("Agent central désactivé")
        return
    if _agent_task and not _agent_task.done():
        return
    _agent_task = asyncio.create_task(_agent_loop(), name="raspnvr-agent")


async def stop_agent() -> None:
    global _agent_task
    if _agent_task and not _agent_task.done():
        _agent_task.cancel()
        try:
            await _agent_task
        except asyncio.CancelledError:
            pass
    _agent_task = None
    _state["running"] = False

import logging
from pathlib import Path

from src.agent.client import CentralClient
from src.agent.storage import get_central_url, is_registered, load_agent_data, update_agent_fields
from src.config import settings

logger = logging.getLogger(__name__)

TUNNEL_URL_FILE = settings.data_dir / "tunnel_url"


def read_tunnel_url() -> str:
    env_url = str(settings.tunnel_url or "").strip().rstrip("/")
    if env_url:
        return env_url
    if TUNNEL_URL_FILE.is_file():
        return TUNNEL_URL_FILE.read_text(encoding="utf-8").strip().rstrip("/")
    return ""


async def publish_tunnel_if_needed() -> None:
    if not is_registered() or not get_central_url():
        return
    url = read_tunnel_url()
    if not url:
        return
    stored = load_agent_data().get("tunnel_url")
    if stored == url:
        return
    try:
        client = CentralClient()
        await client.publish_tunnel(url)
        update_agent_fields(tunnel_url=url)
        logger.info("Tunnel URL publié au central: %s", url)
    except Exception as exc:
        logger.warning("Publication tunnel: %s", exc)

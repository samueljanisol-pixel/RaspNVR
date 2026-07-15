import logging
import re
import subprocess
from pathlib import Path

from src.agent.client import CentralClient
from src.agent.storage import get_central_url, is_registered, load_agent_data, update_agent_fields
from src.config import settings

logger = logging.getLogger(__name__)

TUNNEL_URL_FILE = settings.data_dir / "tunnel_url"
_TUNNEL_URL_RE = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")


def read_tunnel_url() -> str:
    env_url = str(settings.tunnel_url or "").strip().rstrip("/")
    if env_url:
        return env_url
    if TUNNEL_URL_FILE.is_file():
        return TUNNEL_URL_FILE.read_text(encoding="utf-8").strip().rstrip("/")
    return ""


def _write_tunnel_url(url: str) -> None:
    settings.ensure_dirs()
    TUNNEL_URL_FILE.write_text(url + "\n", encoding="utf-8")


def refresh_tunnel_url_from_journal() -> str:
    """Aligne tunnel_url sur la dernière URL cloudflared-quick (quick tunnel)."""
    try:
        proc = subprocess.run(
            ["journalctl", "-u", "cloudflared-quick", "-b", "--no-pager", "-o", "cat"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        logger.debug("Lecture journal cloudflared: %s", exc)
        return read_tunnel_url()

    matches = _TUNNEL_URL_RE.findall(proc.stdout or "")
    if not matches:
        return read_tunnel_url()

    latest = matches[-1].rstrip("/")
    current = read_tunnel_url()
    if latest != current:
        _write_tunnel_url(latest)
        logger.info("Tunnel URL synchronisé depuis cloudflared: %s", latest)
    return latest


async def publish_tunnel_if_needed() -> None:
    if not is_registered() or not get_central_url():
        return
    url = refresh_tunnel_url_from_journal()
    if not url:
        return
    stored = str(load_agent_data().get("tunnel_url") or "").strip().rstrip("/")
    if stored == url:
        return
    try:
        client = CentralClient()
        await client.publish_tunnel(url)
        update_agent_fields(tunnel_url=url)
        logger.info("Tunnel URL publié au central: %s", url)
    except Exception as exc:
        logger.warning("Publication tunnel: %s", exc)

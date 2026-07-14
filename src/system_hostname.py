import logging
import platform
import re
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

_HOSTNAME_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")
_SET_HOSTNAME_SCRIPT = Path("/opt/raspnvr/deploy/set-hostname.sh")


def validate_hostname(hostname: str) -> str:
    hostname = hostname.strip().lower()
    if not hostname or not _HOSTNAME_RE.match(hostname):
        raise ValueError(
            "Nom d'hôte invalide (lettres minuscules, chiffres, tirets, 2–63 caractères)"
        )
    return hostname


def get_current_hostname() -> str:
    try:
        return subprocess.run(
            ["hostname"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        import socket

        return socket.gethostname()


def apply_hostname(hostname: str) -> tuple[bool, str]:
    hostname = validate_hostname(hostname)
    if platform.system() != "Linux":
        return True, f"Hostname simulé : {hostname}"

    if _SET_HOSTNAME_SCRIPT.is_file():
        cmd = ["sudo", str(_SET_HOSTNAME_SCRIPT), hostname]
    else:
        cmd = ["sudo", "hostnamectl", "set-hostname", hostname]

    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        msg = result.stdout.strip() or f"Hostname défini : {hostname}"
        return True, msg
    except (OSError, subprocess.CalledProcessError) as exc:
        logger.warning("Impossible de définir le hostname: %s", exc)
        err = getattr(exc, "stderr", "") or str(exc)
        return False, err.strip() or str(exc)

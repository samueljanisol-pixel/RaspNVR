import json
import threading
from pathlib import Path
from typing import Any, Optional

from src.config import settings

_lock = threading.Lock()
AGENT_FILENAME = "agent.json"


def agent_path() -> Path:
    return settings.data_dir / AGENT_FILENAME


def load_agent_data() -> dict[str, Any]:
    path = agent_path()
    if not path.is_file():
        return {}
    try:
        with _lock:
            data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_agent_data(data: dict[str, Any]) -> None:
    settings.ensure_dirs()
    path = agent_path()
    with _lock:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def get_store_code() -> str:
    stored = str(load_agent_data().get("store_code") or "").strip()
    return stored or settings.store_code


def get_central_url() -> str:
    stored = str(load_agent_data().get("central_url") or "").strip()
    if stored:
        return stored.rstrip("/")
    env_url = str(settings.central_url or "").strip()
    return env_url.rstrip("/")


def get_device_id() -> str:
    return str(load_agent_data().get("device_id") or "").strip()


def get_api_key() -> str:
    return str(load_agent_data().get("api_key") or "").strip()


def is_registered() -> bool:
    return bool(get_device_id() and get_api_key())


def update_agent_fields(**fields: Any) -> dict[str, Any]:
    data = load_agent_data()
    for key, value in fields.items():
        if value is None:
            data.pop(key, None)
        else:
            data[key] = value
    save_agent_data(data)
    return data


def clear_registration_token() -> None:
    data = load_agent_data()
    data.pop("registration_token", None)
    save_agent_data(data)


def public_config() -> dict[str, Any]:
    data = load_agent_data()
    return {
        "store_code": get_store_code(),
        "central_url": get_central_url(),
        "device_id": get_device_id() or None,
        "registered": is_registered(),
        "registered_at": data.get("registered_at"),
        "tunnel_url": data.get("tunnel_url"),
        "has_pending_token": bool(str(data.get("registration_token") or "").strip()),
    }


def pending_registration_token() -> Optional[str]:
    token = str(load_agent_data().get("registration_token") or "").strip()
    return token or None

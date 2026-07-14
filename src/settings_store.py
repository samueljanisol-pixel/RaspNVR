import json
import logging
from pathlib import Path

from src.config import settings

logger = logging.getLogger(__name__)

DEFAULT_APP_NAME = "RaspNVR"


def _settings_path() -> Path:
    return settings.data_dir / "settings.json"


def load_settings() -> dict:
    settings.ensure_dirs()
    path = _settings_path()
    if not path.is_file():
        return {"app_name": DEFAULT_APP_NAME}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"app_name": DEFAULT_APP_NAME}
        return {"app_name": str(data.get("app_name") or DEFAULT_APP_NAME)}
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Lecture settings.json: %s", exc)
        return {"app_name": DEFAULT_APP_NAME}


def save_settings(data: dict) -> dict:
    settings.ensure_dirs()
    current = load_settings()
    if "app_name" in data and data["app_name"]:
        current["app_name"] = str(data["app_name"]).strip()
    path = _settings_path()
    path.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return current

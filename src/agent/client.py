import logging
from typing import Any, Optional

import httpx

from src.agent.storage import get_api_key, get_central_url, get_device_id, get_store_code
from src.config import settings

logger = logging.getLogger(__name__)

AGENT_VERSION = "1.0.0"
REGISTER_PATH = "/api/raspnvr/agent/register"
HEARTBEAT_PATH = "/api/raspnvr/agent/heartbeat"
COMMANDS_PATH = "/api/raspnvr/agent/commands"
COMMAND_ACK_PATH = "/api/raspnvr/agent/commands/{command_id}/ack"
TUNNEL_PATH = "/api/raspnvr/agent/tunnel"
RECORDINGS_PATH = "/api/raspnvr/agent/recordings"


class CentralClient:
    def __init__(self, timeout: float | None = None) -> None:
        self.timeout = timeout or settings.agent_http_timeout_sec

    def _url(self, path: str) -> str:
        base = get_central_url()
        if not base:
            raise ValueError("URL centrale non configurée")
        return f"{base}{path}"

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[dict[str, Any]] = None,
        auth: bool = False,
        content: bytes | None = None,
        headers_extra: Optional[dict[str, str]] = None,
    ) -> httpx.Response:
        headers: dict[str, str] = {"User-Agent": f"RaspNVR-Agent/{AGENT_VERSION}"}
        if headers_extra:
            headers.update(headers_extra)
        if auth:
            api_key = get_api_key()
            if not api_key:
                raise ValueError("Device non enregistré")
            headers["Authorization"] = f"Bearer {api_key}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            if content is not None:
                response = await client.request(method, self._url(path), content=content, headers=headers)
            else:
                response = await client.request(
                    method,
                    self._url(path),
                    json=json_body,
                    headers=headers,
                )
        return response

    async def register(
        self,
        *,
        store_code: str,
        registration_token: str,
        hostname: str,
    ) -> dict[str, Any]:
        payload = {
            "store_code": store_code,
            "registration_token": registration_token,
            "hostname": hostname,
            "agent_version": AGENT_VERSION,
        }
        response = await self._request("POST", REGISTER_PATH, json_body=payload)
        if response.status_code >= 400:
            detail = response.text
            try:
                detail = response.json().get("detail") or detail
            except Exception:
                pass
            raise RuntimeError(f"Enregistrement refusé ({response.status_code}): {detail}")
        data = response.json()
        if not data.get("device_id") or not data.get("api_key"):
            raise RuntimeError("Réponse d'enregistrement invalide")
        return data

    async def heartbeat(self, payload: dict[str, Any]) -> None:
        response = await self._request("POST", HEARTBEAT_PATH, json_body=payload, auth=True)
        if response.status_code >= 400:
            raise RuntimeError(f"Heartbeat refusé ({response.status_code}): {response.text}")

    async def fetch_commands(self) -> list[dict[str, Any]]:
        response = await self._request("GET", COMMANDS_PATH, auth=True)
        if response.status_code >= 400:
            raise RuntimeError(f"Commandes refusées ({response.status_code}): {response.text}")
        data = response.json()
        return list(data.get("commands") or [])

    async def ack_command(self, command_id: str, *, success: bool, result: dict[str, Any]) -> None:
        path = COMMAND_ACK_PATH.format(command_id=command_id)
        payload = {"success": success, "result": result}
        response = await self._request("POST", path, json_body=payload, auth=True)
        if response.status_code >= 400:
            raise RuntimeError(f"Ack refusé ({response.status_code}): {response.text}")

    async def publish_tunnel(self, tunnel_url: str) -> None:
        response = await self._request(
            "POST",
            TUNNEL_PATH,
            json_body={"tunnel_url": tunnel_url},
            auth=True,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Tunnel refusé ({response.status_code}): {response.text}")

    async def prepare_recording_upload(self, meta: dict[str, Any]) -> dict[str, Any]:
        response = await self._request("POST", RECORDINGS_PATH, json_body=meta, auth=True)
        if response.status_code >= 400:
            raise RuntimeError(f"Upload prep refusé ({response.status_code}): {response.text}")
        return response.json()

    async def upload_recording_file(self, upload_path: str, file_path: str) -> None:
        from pathlib import Path

        data = Path(file_path).read_bytes()
        response = await self._request(
            "PUT",
            upload_path,
            content=data,
            auth=True,
            headers_extra={"Content-Type": "video/x-matroska"},
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Upload refusé ({response.status_code}): {response.text}")

    def central_configured(self) -> bool:
        return bool(get_central_url())

    def device_ready(self) -> bool:
        return bool(get_device_id() and get_api_key() and get_store_code())

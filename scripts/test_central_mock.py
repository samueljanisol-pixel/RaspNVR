"""Test E2E du flux agent ↔ central mock."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx


async def main() -> None:
    base = "http://127.0.0.1:8080"
    async with httpx.AsyncClient(timeout=10.0) as client:
        token_res = await client.post(
            f"{base}/api/raspnvr/admin/stores/mag01/token",
            headers={"Authorization": "Bearer dev-admin-key"},
        )
        if token_res.status_code == 404:
            stores = await client.get(
                f"{base}/api/raspnvr/admin/stores",
                headers={"Authorization": "Bearer dev-admin-key"},
            )
            stores.raise_for_status()
            store_id = stores.json()["stores"][0]["id"]
            token_res = await client.post(
                f"{base}/api/raspnvr/admin/stores/{store_id}/token",
                headers={"Authorization": "Bearer dev-admin-key"},
            )
        token_res.raise_for_status()
        token = token_res.json()["token"]

        reg = await client.post(
            f"{base}/api/raspnvr/agent/register",
            json={
                "store_code": "mag01",
                "registration_token": token,
                "hostname": "test-pi",
            },
        )
        reg.raise_for_status()
        api_key = reg.json()["api_key"]

        hb = await client.post(
            f"{base}/api/raspnvr/agent/heartbeat",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"store_code": "mag01", "camera_count": 0},
        )
        hb.raise_for_status()
        print("OK — register + heartbeat")


if __name__ == "__main__":
    asyncio.run(main())

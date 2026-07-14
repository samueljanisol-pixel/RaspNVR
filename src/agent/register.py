import argparse
import asyncio
import logging
from datetime import datetime, timezone

from src.agent.client import CentralClient
from src.agent.storage import (
    clear_registration_token,
    get_store_code,
    pending_registration_token,
    update_agent_fields,
)
from src.system_hostname import get_current_hostname

logger = logging.getLogger(__name__)


async def register_device(
    *,
    store_code: str,
    registration_token: str,
    central_url: str | None = None,
) -> dict[str, str]:
    store_code = store_code.strip()
    registration_token = registration_token.strip()
    if not store_code:
        raise ValueError("Code magasin requis")
    if not registration_token:
        raise ValueError("Token d'enregistrement requis")

    hostname = get_current_hostname()
    fields: dict[str, str] = {
        "store_code": store_code,
        "registration_token": registration_token,
        "hostname": hostname,
    }
    if central_url:
        fields["central_url"] = central_url.strip().rstrip("/")
    update_agent_fields(**fields)

    client = CentralClient()
    result = await client.register(
        store_code=store_code,
        registration_token=registration_token,
        hostname=hostname,
    )

    update_agent_fields(
        device_id=result["device_id"],
        api_key=result["api_key"],
        registered_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        hostname=hostname,
    )
    clear_registration_token()
    return {
        "device_id": result["device_id"],
        "hostname": hostname,
        "message": "Enregistrement réussi",
    }


async def try_register_from_storage() -> bool:
    store_code = get_store_code()
    token = pending_registration_token()
    if not store_code or not token:
        return False
    try:
        await register_device(store_code=store_code, registration_token=token)
        return True
    except Exception as exc:
        logger.warning("Enregistrement automatique échoué: %s", exc)
        return False


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Enregistrer ce Pi auprès du serveur central RaspNVR")
    parser.add_argument("--store-code", required=True, help="Code magasin")
    parser.add_argument("--token", required=True, help="Token d'enregistrement")
    parser.add_argument("--url", help="URL centrale (sinon agent.json ou RASPNVR_CENTRAL_URL)")
    args = parser.parse_args()

    async def _run() -> None:
        result = await register_device(
            store_code=args.store_code,
            registration_token=args.token,
            central_url=args.url,
        )
        print(f"OK — device_id={result['device_id']} hostname={result['hostname']}")

    asyncio.run(_run())


if __name__ == "__main__":
    main()

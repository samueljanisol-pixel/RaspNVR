from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.agent.register import register_device
from src.agent.runner import get_agent_state
from src.agent.storage import public_config, update_agent_fields

router = APIRouter(prefix="/api/agent", tags=["agent"])


class RegisterRequest(BaseModel):
    store_code: str = Field(min_length=1, max_length=64)
    registration_token: str = Field(min_length=1, max_length=128)
    central_url: str | None = None


class AgentConfigUpdate(BaseModel):
    central_url: str | None = None
    tunnel_url: str | None = None


@router.get("/status")
async def agent_status() -> dict:
    return {
        "config": public_config(),
        "state": get_agent_state(),
    }


@router.post("/register")
async def agent_register(body: RegisterRequest) -> dict:
    result = await register_device(
        store_code=body.store_code,
        registration_token=body.registration_token,
        central_url=body.central_url,
    )
    return result


@router.patch("/config")
async def agent_config(body: AgentConfigUpdate) -> dict:
    fields = {}
    if body.central_url is not None:
        fields["central_url"] = body.central_url.strip().rstrip("/")
    if body.tunnel_url is not None:
        fields["tunnel_url"] = body.tunnel_url.strip().rstrip("/")
    if fields:
        update_agent_fields(**fields)
    return public_config()

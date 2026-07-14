import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import aiosqlite

from src.central.auth import generate_token, hash_secret, verify_secret
from src.config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS registration_tokens (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL UNIQUE,
    api_key_hash TEXT NOT NULL,
    hostname TEXT,
    tunnel_url TEXT,
    agent_version TEXT,
    last_seen_at TEXT,
    last_status TEXT,
    registered_at TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS commands (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    created_at TEXT NOT NULL,
    acked_at TEXT,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    camera_id INTEGER NOT NULL,
    camera_name TEXT,
    storage_path TEXT NOT NULL,
    local_path TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);
"""

SEED_STORES = [
    ("mag01", "mag01", "Magasin 01", 1),
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@asynccontextmanager
async def get_connection():
    db = await aiosqlite.connect(settings.central_db_path)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
    finally:
        await db.close()


async def init_central_db() -> None:
    settings.central_db_path.parent.mkdir(parents=True, exist_ok=True)
    settings.central_recordings_dir.mkdir(parents=True, exist_ok=True)
    async with get_connection() as db:
        await db.executescript(SCHEMA)
        count = await (await db.execute("SELECT COUNT(*) AS c FROM stores")).fetchone()
        if count and count["c"] == 0:
            for store_id, code, name, order in SEED_STORES:
                await db.execute(
                    "INSERT INTO stores (id, code, name, sort_order) VALUES (?, ?, ?, ?)",
                    (store_id, code, name, order),
                )
        await db.commit()


async def list_stores() -> list[dict[str, Any]]:
    async with get_connection() as db:
        rows = await (await db.execute("SELECT * FROM stores ORDER BY sort_order, code")).fetchall()
        return [dict(row) for row in rows]


async def get_store_by_code(code: str) -> Optional[dict[str, Any]]:
    async with get_connection() as db:
        row = await (
            await db.execute(
                "SELECT * FROM stores WHERE lower(trim(code)) = lower(trim(?))",
                (code,),
            )
        ).fetchone()
        return dict(row) if row else None


async def create_registration_token(store_id: str, *, expires_hours: int = 48) -> str:
    token = generate_token(24)
    token_hash = hash_secret(token)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=expires_hours)).isoformat(
        timespec="seconds"
    )
    async with get_connection() as db:
        await db.execute(
            """
            INSERT INTO registration_tokens (id, store_id, token_hash, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (str(uuid.uuid4()), store_id, token_hash, expires_at, _now_iso()),
        )
        await db.commit()
    return token


async def consume_registration_token(store_id: str, token: str) -> bool:
    async with get_connection() as db:
        rows = await (
            await db.execute(
                """
                SELECT * FROM registration_tokens
                WHERE store_id = ? AND used_at IS NULL
                ORDER BY created_at DESC
                """,
                (store_id,),
            )
        ).fetchall()
        for row in rows:
            if not verify_secret(token, row["token_hash"]):
                continue
            if row["expires_at"]:
                expires = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
                if expires < datetime.now(timezone.utc):
                    continue
            await db.execute(
                "UPDATE registration_tokens SET used_at = ? WHERE id = ?",
                (_now_iso(), row["id"]),
            )
            await db.commit()
            return True
    return False


async def register_device(
    store_id: str,
    *,
    api_key: str,
    hostname: str,
    agent_version: str,
) -> dict[str, Any]:
    device_id = str(uuid.uuid4())
    api_key_hash = hash_secret(api_key)
    now = _now_iso()
    async with get_connection() as db:
        existing = await (
            await db.execute("SELECT id FROM devices WHERE store_id = ?", (store_id,))
        ).fetchone()
        if existing:
            await db.execute(
                """
                UPDATE devices
                SET api_key_hash = ?, hostname = ?, agent_version = ?, registered_at = ?
                WHERE store_id = ?
                """,
                (api_key_hash, hostname, agent_version, now, store_id),
            )
            device_id = existing["id"]
        else:
            await db.execute(
                """
                INSERT INTO devices (id, store_id, api_key_hash, hostname, agent_version, registered_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (device_id, store_id, api_key_hash, hostname, agent_version, now),
            )
        await db.commit()
        row = await (await db.execute("SELECT * FROM devices WHERE store_id = ?", (store_id,))).fetchone()
        return dict(row)


async def get_device_by_api_key(api_key: str) -> Optional[dict[str, Any]]:
    api_key_hash = hash_secret(api_key)
    async with get_connection() as db:
        row = await (
            await db.execute(
                """
                SELECT d.*, s.code AS store_code, s.name AS store_name
                FROM devices d
                JOIN stores s ON s.id = d.store_id
                WHERE d.api_key_hash = ?
                """,
                (api_key_hash,),
            )
        ).fetchone()
        return dict(row) if row else None


async def update_device_heartbeat(device_id: str, payload: dict[str, Any]) -> None:
    async with get_connection() as db:
        await db.execute(
            """
            UPDATE devices
            SET last_seen_at = ?, last_status = ?, hostname = ?, agent_version = ?
            WHERE id = ?
            """,
            (
                _now_iso(),
                json.dumps(payload, ensure_ascii=False),
                payload.get("hostname"),
                payload.get("agent_version"),
                device_id,
            ),
        )
        await db.commit()


async def update_device_tunnel(device_id: str, tunnel_url: str) -> None:
    async with get_connection() as db:
        await db.execute(
            "UPDATE devices SET tunnel_url = ? WHERE id = ?",
            (tunnel_url.rstrip("/"), device_id),
        )
        await db.commit()


async def list_devices() -> list[dict[str, Any]]:
    async with get_connection() as db:
        rows = await (
            await db.execute(
                """
                SELECT d.*, s.code AS store_code, s.name AS store_name
                FROM devices d
                JOIN stores s ON s.id = d.store_id
                ORDER BY s.sort_order, s.code
                """
            )
        ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            if item.get("last_status"):
                try:
                    item["last_status"] = json.loads(item["last_status"])
                except json.JSONDecodeError:
                    pass
            result.append(item)
        return result


async def get_store_detail(store_id: str) -> Optional[dict[str, Any]]:
    async with get_connection() as db:
        store_row = await (await db.execute("SELECT * FROM stores WHERE id = ?", (store_id,))).fetchone()
        if not store_row:
            return None
        device_row = await (
            await db.execute("SELECT * FROM devices WHERE store_id = ?", (store_id,))
        ).fetchone()
        rec_rows = await (
            await db.execute(
                """
                SELECT * FROM recordings WHERE store_id = ?
                ORDER BY started_at DESC LIMIT 50
                """,
                (store_id,),
            )
        ).fetchall()
    device = dict(device_row) if device_row else None
    if device and device.get("last_status"):
        try:
            device["last_status"] = json.loads(device["last_status"])
        except json.JSONDecodeError:
            pass
    return {
        "store": dict(store_row),
        "device": device,
        "recordings": [dict(r) for r in rec_rows],
    }


async def create_command(device_id: str, cmd_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    cmd_id = str(uuid.uuid4())
    async with get_connection() as db:
        await db.execute(
            """
            INSERT INTO commands (id, device_id, type, payload, status, created_at)
            VALUES (?, ?, ?, ?, 'pending', ?)
            """,
            (cmd_id, device_id, cmd_type, json.dumps(payload), _now_iso()),
        )
        await db.commit()
    return {"id": cmd_id, "type": cmd_type, "payload": payload}


async def list_pending_commands(device_id: str) -> list[dict[str, Any]]:
    async with get_connection() as db:
        rows = await (
            await db.execute(
                """
                SELECT id, type, payload FROM commands
                WHERE device_id = ? AND status = 'pending'
                ORDER BY created_at
                """,
                (device_id,),
            )
        ).fetchall()
        commands = []
        for row in rows:
            payload = {}
            try:
                payload = json.loads(row["payload"])
            except json.JSONDecodeError:
                pass
            commands.append({"id": row["id"], "type": row["type"], "payload": payload})
        return commands


async def ack_command(command_id: str, device_id: str, *, success: bool, result: dict[str, Any]) -> bool:
    async with get_connection() as db:
        row = await (
            await db.execute(
                "SELECT id FROM commands WHERE id = ? AND device_id = ?",
                (command_id, device_id),
            )
        ).fetchone()
        if not row:
            return False
        await db.execute(
            """
            UPDATE commands
            SET status = ?, result = ?, acked_at = ?
            WHERE id = ?
            """,
            (
                "acked" if success else "failed",
                json.dumps(result, ensure_ascii=False),
                _now_iso(),
                command_id,
            ),
        )
        await db.commit()
        return True


async def register_recording(
    device_id: str,
    store_id: str,
    *,
    camera_id: int,
    camera_name: str,
    storage_path: str,
    local_path: str,
    size_bytes: int,
    started_at: str,
) -> dict[str, Any]:
    rec_id = str(uuid.uuid4())
    async with get_connection() as db:
        await db.execute(
            """
            INSERT INTO recordings (
                id, device_id, store_id, camera_id, camera_name,
                storage_path, local_path, size_bytes, started_at, uploaded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rec_id,
                device_id,
                store_id,
                camera_id,
                camera_name,
                storage_path,
                local_path,
                size_bytes,
                started_at,
                _now_iso(),
            ),
        )
        await db.commit()
        row = await (await db.execute("SELECT * FROM recordings WHERE id = ?", (rec_id,))).fetchone()
        return dict(row)


def central_recording_path(storage_path: str) -> Path:
    return settings.central_recordings_dir / storage_path

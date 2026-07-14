import aiosqlite

from src.config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS cameras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rtsp_sub TEXT NOT NULL,
    rtsp_main TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id INTEGER NOT NULL,
    path TEXT NOT NULL UNIQUE,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_segments_camera ON segments(camera_id);
CREATE INDEX IF NOT EXISTS idx_segments_started ON segments(started_at);
"""

MIGRATIONS = [
    "ALTER TABLE segments ADD COLUMN uploaded_at TEXT",
]


async def get_db() -> aiosqlite.Connection:
    settings.ensure_dirs()
    db = await aiosqlite.connect(settings.db_path)
    db.row_factory = aiosqlite.Row
    await db.executescript(SCHEMA)
    for sql in MIGRATIONS:
        try:
            await db.execute(sql)
        except aiosqlite.OperationalError:
            pass
    await db.commit()
    return db

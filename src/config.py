from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RASPNVR_", env_file=".env", extra="ignore")

    data_dir: Path = Path("/opt/raspnvr/data")
    host: str = "0.0.0.0"
    port: int = 8080
    recordings_dir: Path = Path("/mnt/raspnvr/recordings")
    segment_seconds: int = 300
    disk_usage_threshold: float = 0.90
    mediamtx_api_url: str = "http://127.0.0.1:9997"
    mediamtx_hls_base: str = "http://127.0.0.1:8888"
    ffmpeg_bin: str = "ffmpeg"
    store_code: str = "mag01"

    central_url: str = ""
    central_mock: bool = True
    agent_enabled: bool = True
    agent_poll_seconds: int = 30
    agent_http_timeout_sec: float = 30.0
    tunnel_url: str = ""
    storage_upload_enabled: bool = False
    admin_api_key: str = "dev-admin-key"
    allow_service_restart: bool = True

    @property
    def db_path(self) -> Path:
        return self.data_dir / "raspnvr.db"

    @property
    def central_db_path(self) -> Path:
        return self.data_dir / "central.db"

    @property
    def central_recordings_dir(self) -> Path:
        return self.data_dir / "central" / "recordings"

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.recordings_dir.mkdir(parents=True, exist_ok=True)
        self.central_recordings_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()

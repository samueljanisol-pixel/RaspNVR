from pydantic import BaseModel, Field


class CameraCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    rtsp_sub: str = Field(min_length=8, description="URL RTSP substream (enregistrement)")
    rtsp_main: str | None = Field(default=None, description="URL RTSP main stream (live HD)")


class CameraUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    rtsp_sub: str | None = Field(default=None, min_length=8)
    rtsp_main: str | None = None
    enabled: bool | None = None


class CameraOut(BaseModel):
    id: int
    name: str
    rtsp_sub: str
    rtsp_main: str | None
    enabled: bool
    hls_url: str | None = None
    recording: bool = False


class SystemStatus(BaseModel):
    store_code: str
    app_name: str = "RaspNVR"
    hostname: str
    disk_total_gb: float
    disk_used_gb: float
    disk_used_percent: float
    camera_count: int
    recordings_dir: str


class AppSettingsOut(BaseModel):
    app_name: str
    hostname: str
    store_code: str


class AppSettingsUpdate(BaseModel):
    app_name: str | None = Field(default=None, min_length=1, max_length=64)


class HostnameUpdate(BaseModel):
    hostname: str = Field(min_length=2, max_length=63)

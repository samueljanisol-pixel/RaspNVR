from urllib.parse import quote, unquote, urlunparse
from urllib.parse import urlparse


def normalize_rtsp_url(url: str | None) -> str | None:
    """Encode user/password in RTSP URLs (e.g. ! -> %21)."""
    if not url:
        return url
    trimmed = url.strip()
    if not trimmed.lower().startswith("rtsp://"):
        return trimmed

    parsed = urlparse(trimmed)
    user = unquote(parsed.username) if parsed.username else ""
    password = unquote(parsed.password) if parsed.password else ""
    host = parsed.hostname or ""
    port = parsed.port

    if user:
        auth = f"{quote(user, safe='')}:{quote(password, safe='')}"
        netloc = f"{auth}@{host}"
    else:
        netloc = host

    if port:
        netloc = f"{netloc}:{port}"

    return urlunparse(
        (
            parsed.scheme,
            netloc,
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        )
    )

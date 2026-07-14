import hashlib
import secrets


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def verify_secret(value: str, hashed: str) -> bool:
    return secrets.compare_digest(hash_secret(value), hashed)


def generate_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)[: length + 4].replace("-", "")[:length]

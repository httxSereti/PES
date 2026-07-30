from cuid2 import Cuid

CUID_GENERATOR: Cuid = Cuid(length=42)


def generate_magic_token() -> str:
    """
    Generate a MagicToken for User to Login
    """

    return CUID_GENERATOR.generate()


def hash_magic_token(raw_token: str) -> str:
    """SHA-256 hash of a raw magic token — the only form ever persisted."""
    import hashlib

    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

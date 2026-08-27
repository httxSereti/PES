from datetime import datetime, timezone


def to_utc_iso(dt: datetime | None) -> str | None:
    """Serialize a datetime as a timezone-aware UTC ISO 8601 string.

    The backend persists naive-UTC datetimes (``datetime.utcnow()``); a
    timezone-less ISO string is otherwise interpreted by browsers as local
    time. Attach a UTC offset when missing so clients convert correctly.
    """
    if dt is None:
        return None
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()

import os
import re
import secrets

from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from events.dispatcher import EventDispatcher
from events.enums import TriggerableEvent
from utils import Logger

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
security = HTTPBasic()

# Dispatcher — set during app startup
_dispatcher: EventDispatcher | None = None


def setup(dispatcher: EventDispatcher) -> None:
    """Called during app startup to inject the event dispatcher."""
    global _dispatcher
    _dispatcher = dispatcher


def _get_dispatcher() -> EventDispatcher:
    if _dispatcher is None:
        raise RuntimeError("Webhook router not initialized")
    return _dispatcher


def verify_credentials(credentials: HTTPBasicCredentials = Depends(security)):
    expected_user = os.getenv("CHASTER_WEBHOOK_USER", "sereti")
    expected_pwd = os.getenv("CHASTER_WEBHOOK_PWD", "password")

    correct_username = secrets.compare_digest(
        credentials.username.encode("utf8"),
        expected_user.encode("utf8"),
    )
    correct_password = secrets.compare_digest(
        credentials.password.encode("utf8"),
        expected_pwd.encode("utf8"),
    )
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


@router.post("/chaster", tags=["chaster"])
async def read_chaster_webhook(
    request: Request,
    username: str = Depends(verify_credentials),
):
    """
    Handle Chaster webhook events.
    Parses action_log.created events and dispatches them to the event system.
    """
    data = await request.json()
    dispatcher = _get_dispatcher()

    event: str = data.get("event", "")
    webhook_id: str = data.get("requestId", "")

    Logger.info(f"[Webhook] Received Chaster event='{event}' requestId='{webhook_id}'")

    if event == "action_log.created":
        action_log: dict = data.get("data", {}).get("actionLog", {})
        action_type: str = action_log.get("type", "")
        payload: dict = action_log.get("payload", {})
        role: str = action_log.get("role", "unknown")
        created_at: str = action_log.get("createdAt", "")

        origin = f"chaster:{action_type}:{webhook_id}"

        # ── Wheel of Fortune ──
        if action_type == "wheel_of_fortune_turned":
            segment = payload.get("segment", {})
            segment_type = segment.get("type", "")

            if segment_type == "text":
                text = segment.get("text", "")

                """
                    Check for custom WOF action code to apply profile (e.g. "{p:JfA} description")
                    The code must be wrapped in curly braces "{}".
                    it need to start with "p:".
                    and followed by 3-letter abbreviations (profile id, profile level, duration).
                    like "{p:JfA}", "{p:AdB}", or "{p:XcC}".
                """
                match_profile = re.match(r"^\{p:([A-Z][A-Za-z][A-Za-z])\}", text)

                """
                    # TODO: custom wof update for units
                    Check for custom WOF update unit action code to apply unit update (e.g. "{u:1@A@%+5} description")
                    The code must be wrapped in curly braces "{}".
                    it need to start with "u:".
                    and followed by 3-letter abbreviations (profile id, profile level, duration).
                    like "{u:[unit]@[channel]@[operator]}"; "{u:12RO@ABRM@[5-25]}", or "{u:1@A@%+5}".
                """
                match_unit_update = re.match(r"^\{u:([A-Z]@[A-Za-z]@[A-Za-z])\}", text)

                # handle logic for profile action
                if match_profile:
                    wof_code = f"custom:wof_profile_{match_profile.group(1)}"
                    Logger.info(
                        f"[Webhook] Custom WOF profile action: {match_profile.group(1)}"
                    )
                    await dispatcher.dispatch(
                        event_type=wof_code,
                        event_data={
                            "author": role,
                            "wofText": text,
                            "wofCustomType": "profile",
                            "wofAction": match_profile.group(1),
                            "triggeredAt": created_at,
                        },
                        origin=origin,
                    )
                elif match_unit_update:
                    wof_code = f"custom:wof_unit_{match_unit_update.group(1)}"
                    Logger.info(
                        f"[Webhook] Custom WOF update unit action: {match_unit_update.group(1)}"
                    )
                    # TODO: implement unit update logic
                    await dispatcher.dispatch(
                        event_type=wof_code,
                        event_data={
                            "author": role,
                            "wofText": text,
                            "wofCustomType": "unit",
                            "wofAction": match_unit_update.group(1),
                            "triggeredAt": created_at,
                        },
                        origin=origin,
                    )
                else:
                    Logger.info(f"[Webhook] WOF text without action code: '{text}'")

            # WOF with non-text segment — dispatch generic event
            await dispatcher.dispatch(
                event_type=TriggerableEvent.CHASTER_WOF_TURNED.value,
                event_data={
                    "author": role,
                    "wofText": segment.get("text", ""),
                    "segmentType": segment_type,
                    "triggeredAt": created_at,
                },
                origin=origin,
            )
        # ── Time changes (keyholder/user/extension) ──
        elif action_type == "time_changed":
            if "duration" in payload:
                duration = payload["duration"]
                event_type = (
                    TriggerableEvent.CHASTER_TIME_ADD.value
                    if duration > 0
                    else TriggerableEvent.CHASTER_TIME_SUB.value
                )
                await dispatcher.dispatch(
                    event_type=event_type,
                    event_data={
                        "author": role,
                        "duration": duration,
                        "triggeredAt": created_at,
                    },
                    origin=origin,
                )

        # ── Shared Link votes ──
        elif action_type == "link_time_changed":
            duration = payload.get("duration", 0)
            user_data = data.get("data", {}).get("user", {})
            author = user_data.get("username", "Someone") if user_data else "Someone"

            event_type = (
                TriggerableEvent.CHASTER_VOTE_ADD.value
                if duration > 0
                else TriggerableEvent.CHASTER_VOTE_SUB.value
            )
            await dispatcher.dispatch(
                event_type=event_type,
                event_data={
                    "author": author,
                    "duration": duration,
                    "triggeredAt": created_at,
                },
                origin=origin,
            )

        # ── Lock frozen/unfrozen ──
        elif action_type == "lock_frozen":
            await dispatcher.dispatch(
                event_type=TriggerableEvent.CHASTER_LOCK_FROZEN.value,
                event_data={"triggeredAt": created_at},
                origin=origin,
            )

        elif action_type == "lock_unfrozen":
            await dispatcher.dispatch(
                event_type=TriggerableEvent.CHASTER_LOCK_UNFROZEN.value,
                event_data={"triggeredAt": created_at},
                origin=origin,
            )

        # ── Pillory ──
        elif action_type == "pillory_in":
            await dispatcher.dispatch(
                event_type=TriggerableEvent.CHASTER_PILLORY_STARTED.value,
                event_data={**payload, "triggeredAt": created_at},
                origin=origin,
            )

        elif action_type == "pillory_out":
            await dispatcher.dispatch(
                event_type=TriggerableEvent.CHASTER_PILLORY_ENDED.value,
                event_data={**payload, "triggeredAt": created_at},
                origin=origin,
            )

        else:
            Logger.debug(f"[Webhook] Unhandled action_log type: '{action_type}'")

    return {"status": "ok"}

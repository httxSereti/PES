#!/usr/bin/env python3
"""
Generate the TypeScript WebSocket contract from the pydantic schema.

Source of truth: apps/app/src/api/ws/schema.py
Output:          apps/front/src/types/websocket.generated.ts

Usage (from apps/app):
    uv run python scripts/generate_ws_types.py           # write the file
    uv run python scripts/generate_ws_types.py --check   # fail if stale
"""

from __future__ import annotations

import sys
import types
import typing
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, get_args, get_origin, get_type_hints

_UNION_ORIGINS = (typing.Union, types.UnionType)

APP_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_DIR / "src"))

from pydantic import BaseModel

from api.ws import schema

OUTPUT = APP_DIR.parents[0] / "front" / "src" / "types" / "websocket.generated.ts"
INDENT = "    "

# Bases whose fields are inlined into each message instead of `extends`.
SKIPPED_BASES = {"WireModel", "ClientMessage", "ServerMessage"}


def _is_model(annotation: Any) -> bool:
    return isinstance(annotation, type) and issubclass(annotation, BaseModel)


def _is_enum(annotation: Any) -> bool:
    return isinstance(annotation, type) and issubclass(annotation, Enum)


def unwrap_annotated(annotation: Any) -> tuple[Any, str | None]:
    """Return (core annotation, TsType override or None)."""
    if get_origin(annotation) is typing.Annotated:
        core, *metadata = get_args(annotation)
        override = next(
            (str(m) for m in metadata if isinstance(m, schema.TsType)), None
        )
        return core, override
    return annotation, None


# Named module-level union aliases (e.g. `Sensor = Union[...]`), so unions get
# a named `export type` instead of being inlined everywhere.
ALIASES: dict[Any, str] = {}
for _name in dir(schema):
    if _name.startswith("_"):
        continue
    _value = getattr(schema, _name)
    _core, _override = unwrap_annotated(_value)
    if _override is None and get_origin(_core) in _UNION_ORIGINS:
        ALIASES[_value] = _name


def _literal(value: Any) -> str:
    if isinstance(value, str):
        return f"'{value}'"
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _strip_optional(annotation: Any) -> tuple[Any, bool]:
    """Optional[X] -> (X, True), anything else -> (annotation, False)."""
    core, _ = unwrap_annotated(annotation)
    if get_origin(core) in _UNION_ORIGINS:
        args = get_args(core)
        non_none = [a for a in args if a is not type(None)]
        if len(non_none) == 1 and len(args) == 2:
            return non_none[0], True
    return annotation, False


def ts_type(annotation: Any, aliases_out: set[str]) -> str:
    core, override = unwrap_annotated(annotation)
    if override is not None:
        return override

    if annotation in ALIASES:
        aliases_out.add(ALIASES[annotation])
        return ALIASES[annotation]

    origin = get_origin(core)

    if origin in _UNION_ORIGINS:
        return " | ".join(ts_type(arg, aliases_out) for arg in get_args(core))

    if origin in (list, tuple):
        args = get_args(core)
        inner = ts_type(args[0], aliases_out) if args else "unknown"
        return f"({inner})[]" if " | " in inner else f"{inner}[]"

    if origin is dict:
        args = get_args(core)
        value = ts_type(args[1], aliases_out) if len(args) == 2 else "unknown"
        return f"Record<string, {value}>"

    if origin is typing.Literal:
        return " | ".join(_literal(v) for v in get_args(core))

    if core is None or core is type(None):
        return "null"
    if core is str:
        return "string"
    if core is bool:
        return "boolean"
    if core in (int, float):
        return "number"
    if core is datetime:
        return "string"
    if core is Any:
        return "unknown"
    if _is_enum(core):
        return core.__name__
    if _is_model(core):
        return core.__name__

    raise TypeError(f"Unsupported annotation: {annotation!r}")


def emit_enum(enum_cls: type[Enum]) -> str:
    lines = [f"export enum {enum_cls.__name__} {{"]
    for member in enum_cls:
        lines.append(f'{INDENT}{member.name} = "{member.value}",')
    lines.append("}")
    return "\n".join(lines)


def emit_model(model: type[BaseModel], aliases_out: set[str]) -> str:
    hints = get_type_hints(model, include_extras=True)
    fields = model.model_fields  # includes inherited, base-first order

    mro_bases = [
        b for b in model.__mro__[1:] if _is_model(b) and b is not BaseModel
    ]
    emitted_base = next(
        (b for b in mro_bases if b.__name__ not in SKIPPED_BASES), None
    )
    extends = f" extends {emitted_base.__name__}" if emitted_base else ""
    exclude = set(emitted_base.model_fields) if emitted_base else set()

    lines = [f"export interface {model.__name__}{extends} {{"]
    for name in fields:
        if name in exclude or name not in hints:
            continue
        annotation = hints[name]
        inner, optional = _strip_optional(annotation)
        ts = ts_type(inner, aliases_out)
        # the discriminator is always on the wire, even with a Python default
        required = fields[name].is_required() or name == "type"
        if optional and required:
            lines.append(f"{INDENT}{name}: {ts} | null;")
        elif optional:
            lines.append(f"{INDENT}{name}?: {ts};")
        else:
            lines.append(f"{INDENT}{name}: {ts};")
    lines.append("}")
    return "\n".join(lines)


def collect_payload_models(
    roots: list[type[BaseModel]],
) -> list[type[BaseModel]]:
    """Every BaseModel reachable from the roots' fields, parents first."""
    seen: dict[str, type[BaseModel]] = {}

    def visit(annotation: Any) -> None:
        core, _ = unwrap_annotated(annotation)
        if _is_model(core):
            if core.__name__ in seen or core is BaseModel:
                return
            seen[core.__name__] = core  # mark before recursing (cycles)
            visit(core.__base__)
            for hint in get_type_hints(core, include_extras=True).values():
                visit(hint)
            return
        for arg in get_args(core):
            if arg is not type(None) and not isinstance(arg, schema.TsType):
                visit(arg)

    for root in roots:
        for hint in get_type_hints(root, include_extras=True).values():
            visit(hint)

    order = [m for m in seen.values() if m.__name__ not in SKIPPED_BASES]
    order.sort(key=lambda m: len(m.__mro__))  # parents before children
    return order


def collect_enums(models: list[type[BaseModel]]) -> list[type[Enum]]:
    found: dict[str, type[Enum]] = {}

    def visit(annotation: Any) -> None:
        core, _ = unwrap_annotated(annotation)
        if _is_enum(core):
            found[core.__name__] = core
        for arg in get_args(core):
            if not isinstance(arg, schema.TsType):
                visit(arg)

    for model in models:
        for hint in get_type_hints(model, include_extras=True).values():
            visit(hint)
    return list(found.values())


def main() -> int:
    check = "--check" in sys.argv

    all_messages = schema.CLIENT_MESSAGE_MODELS + schema.SERVER_MESSAGE_MODELS
    payload_models = collect_payload_models(all_messages)

    aliases_used: set[str] = set()
    chunks: list[str] = []

    for enum_cls in collect_enums(payload_models + all_messages):
        chunks.append(emit_enum(enum_cls))

    for model in payload_models:
        chunks.append(emit_model(model, aliases_used))

    for model in all_messages:
        chunks.append(emit_model(model, aliases_used))

    # Named union aliases actually referenced (e.g. Sensor)
    for alias in sorted(aliases_used):
        core, _ = unwrap_annotated(getattr(schema, alias))
        members = " | ".join(ts_type(arg, aliases_used) for arg in get_args(core))
        chunks.append(f"export type {alias} = {members};")

    for name, models in (
        ("WebSocketClientMessage", schema.CLIENT_MESSAGE_MODELS),
        ("WebSocketServerMessage", schema.SERVER_MESSAGE_MODELS),
    ):
        union = "\n".join(f"{INDENT}| {m.__name__}" for m in models)
        chunks.append(f"export type {name} =\n{union};")

    chunks.append(
        "/** Messages the client receives (alias of WebSocketServerMessage). */\n"
        "export type WebSocketIncomingMessage = WebSocketServerMessage;\n\n"
        "/** Messages the client sends (alias of WebSocketClientMessage). */\n"
        "export type WebSocketOutgoingMessage = WebSocketClientMessage;"
    )

    header = (
        "// AUTO-GENERATED from apps/app/src/api/ws/schema.py\n"
        "// by apps/app/scripts/generate_ws_types.py — DO NOT EDIT.\n"
        "// Regenerate with: pnpm codegen:ws\n\n"
        f"export const WS_SCHEMA_VERSION = {schema.WS_SCHEMA_VERSION};"
    )
    output = header + "\n\n" + "\n\n".join(chunks) + "\n"

    if check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != output:
            print(
                f"error: {OUTPUT} is stale — run `pnpm codegen:ws`",
                file=sys.stderr,
            )
            return 1
        print(f"ok: {OUTPUT} is up to date")
        return 0

    OUTPUT.write_text(output, encoding="utf-8", newline="\n")
    print(f"wrote {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

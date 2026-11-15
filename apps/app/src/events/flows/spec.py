"""Serializable flow graph and compiled operation models."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

FlowNodeType = Literal[
    "trigger.event",
    "trigger.schedule",
    "trigger.manual",
    "trigger.webhook",
    "data.actor",
    "data.state",
    "data.variable",
    "data.constant",
    "data.json",
    "data.template",
    "data.math",
    "data.compare",
    "data.select",
    "data.random",
    "data.now",
    "data.coalesce",
    "logic.guard",
    "logic.switch",
    "logic.all",
    "logic.any",
    "logic.not",
    "logic.cooldown",
    "logic.throttle",
    "logic.dedupe",
    "logic.window",
    "logic.sequence",
    "logic.parallel",
    "logic.delay",
    "logic.repeat",
    "logic.foreach",
    "logic.subflow",
    "logic.stop",
    "effect.action",
    "effect.level",
    "effect.mult",
    "effect.profile",
    "effect.chaster_time",
    "effect.lovense",
    "effect.puryfi",
    "effect.training",
    "effect.discord",
    "effect.webhook",
    "effect.notify",
    "effect.emit_event",
    "terminal.log",
    "terminal.alert",
    "flow.call",
]
CompiledOpType = Literal[
    "match_event",
    "eval_condition",
    "eval_data",
    "eval_logic",
    "emit_action",
    "emit_event",
    "notify",
    "call_flow",
    "terminal",
]


class FlowNode(BaseModel):
    id: str
    type: FlowNodeType
    config: dict[str, Any] = Field(default_factory=dict)
    # Canvas layout. Kept outside `config` so the compiler ignores it.
    position: dict[str, float] | None = None


class FlowEdge(BaseModel):
    source: str
    target: str
    source_port: str = "out"
    target_port: str = "in"


class FlowSpec(BaseModel):
    id: str
    name: str
    version: int = 1
    nodes: list[FlowNode] = Field(default_factory=list)
    edges: list[FlowEdge] = Field(default_factory=list)
    variables: dict[str, Any] = Field(default_factory=dict)
    created_from: str | None = None
    schema_version: int = 1


class CompiledOp(BaseModel):
    op: CompiledOpType
    node_id: str
    config: dict[str, Any] = Field(default_factory=dict)


class CompiledFlow(BaseModel):
    flow_id: str
    flow_version: int = 1
    ops: list[CompiledOp] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

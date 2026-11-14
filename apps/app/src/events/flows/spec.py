"""Serializable flow graph and compiled operation models."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

FlowNodeType = Literal["trigger.event", "logic.guard", "effect.action"]
CompiledOpType = Literal["match_event", "eval_condition", "emit_action"]


class FlowNode(BaseModel):
    id: str
    type: FlowNodeType
    config: dict[str, Any] = Field(default_factory=dict)


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

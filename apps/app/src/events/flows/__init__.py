"""Events v3 flow specification and compiled plan.

The linear Composer form is the source of truth for now, but it is compiled
into the same `FlowSpec` / `CompiledFlow` shape the future canvas will use.
This keeps the backend ready for graph authoring without a second engine.

`spec.py` holds the serializable flow graph; `compiler.py` turns a trigger
rule (or a flow spec) into a small, explicit operation list.
"""

from __future__ import annotations

from .compiler import compile_flow_spec, compile_trigger_rule
from .graph import (
    GraphAction,
    GraphPlan,
    GraphValidationError,
    compile_graph,
    diff_graphs,
    ensure_positions,
    graph_event_types,
    graph_from_rule,
    validate_graph,
)
from .runtime import (
    FlowEffect,
    FlowEmission,
    FlowGateState,
    FlowRuntime,
    FlowRuntimeResult,
    FlowTrace,
)
from .spec import CompiledFlow, CompiledOp, FlowEdge, FlowNode, FlowSpec

__all__ = [
    "CompiledFlow",
    "CompiledOp",
    "FlowEdge",
    "FlowNode",
    "FlowSpec",
    "FlowEffect",
    "FlowEmission",
    "FlowGateState",
    "FlowRuntime",
    "FlowRuntimeResult",
    "FlowTrace",
    "GraphAction",
    "GraphPlan",
    "GraphValidationError",
    "compile_flow_spec",
    "compile_graph",
    "compile_trigger_rule",
    "diff_graphs",
    "ensure_positions",
    "graph_event_types",
    "graph_from_rule",
    "validate_graph",
]

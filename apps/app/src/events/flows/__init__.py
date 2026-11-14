"""Events v3 flow specification and compiled plan.

The linear Composer form is the source of truth for now, but it is compiled
into the same `FlowSpec` / `CompiledFlow` shape the future canvas will use.
This keeps the backend ready for graph authoring without a second engine.

`spec.py` holds the serializable flow graph; `compiler.py` turns a trigger
rule (or a flow spec) into a small, explicit operation list.
"""

from __future__ import annotations

from .compiler import compile_flow_spec, compile_trigger_rule
from .spec import CompiledFlow, CompiledOp, FlowEdge, FlowNode, FlowSpec

__all__ = [
    "CompiledFlow",
    "CompiledOp",
    "FlowEdge",
    "FlowNode",
    "FlowSpec",
    "compile_flow_spec",
    "compile_trigger_rule",
]

"""Safe expression and template evaluation for the FlowSpec runtime.

Only a small, side-effect-free subset of Python expressions is allowed.
No attribute access on arbitrary objects, no imports, no function calls
outside an explicit whitelist.
"""

from __future__ import annotations

import ast
import operator
import re
from collections.abc import Mapping, Sequence
from typing import Any

MISSING = object()

_MAX_EXPRESSION_LENGTH = 512
_TEMPLATE_RE = re.compile(r"\{\{\s*(.+?)\s*\}\}|\{\s*(.+?)\s*\}")

_SAFE_FUNCTIONS = {
    "len": len,
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
}

_SAFE_METHODS = {
    "lower",
    "upper",
    "strip",
    "startswith",
    "endswith",
    "get",
    "contains",
}

_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

_CMP_OPS = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.In: lambda left, right: left in right,
    ast.NotIn: lambda left, right: left not in right,
    ast.Is: operator.is_,
    ast.IsNot: operator.is_not,
}


def resolve_path(context: Mapping[str, Any], path: str) -> Any:
    """Resolve a dotted path, with numeric indexes, or return MISSING."""
    if not path:
        return MISSING
    parts = path.strip().split(".")
    root = parts[0]
    current = context.get(root, MISSING)
    if current is MISSING:
        return MISSING
    for part in parts[1:]:
        if isinstance(current, Mapping):
            if part not in current:
                return MISSING
            current = current[part]
        elif isinstance(current, Sequence) and not isinstance(current, (str, bytes)):
            try:
                current = current[int(part)]
            except (ValueError, IndexError):
                return MISSING
        else:
            return MISSING
    return current


def _resolve_node(node: ast.AST, context: Mapping[str, Any]) -> Any:
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        aliases = {"true": True, "false": False, "null": None, "none": None}
        if node.id.lower() in aliases:
            return aliases[node.id.lower()]
        return context.get(node.id, MISSING)
    if isinstance(node, ast.Attribute):
        if node.attr.startswith("_"):
            return MISSING
        base = _resolve_node(node.value, context)
        if isinstance(base, Mapping):
            return base.get(node.attr, MISSING)
        return getattr(base, node.attr, MISSING)
    if isinstance(node, ast.Subscript):
        base = _resolve_node(node.value, context)
        index = _resolve_node(node.slice, context)
        try:
            return base[index]
        except (KeyError, IndexError, TypeError):
            return MISSING
    if isinstance(node, ast.List):
        return [_resolve_node(item, context) for item in node.elts]
    if isinstance(node, ast.Tuple):
        return tuple(_resolve_node(item, context) for item in node.elts)
    if isinstance(node, ast.Dict):
        return {
            _resolve_node(key, context): _resolve_node(value, context)
            for key, value in zip(node.keys, node.values)
        }
    if isinstance(node, ast.Set):
        return {_resolve_node(item, context) for item in node.elts}
    if isinstance(node, ast.BoolOp):
        values = [_resolve_node(value, context) for value in node.values]
        if isinstance(node.op, ast.And):
            return all(bool(value) for value in values)
        return any(bool(value) for value in values)
    if isinstance(node, ast.UnaryOp):
        value = _resolve_node(node.operand, context)
        if isinstance(node.op, ast.Not):
            return not bool(value)
        if isinstance(node.op, ast.USub):
            return -value
        if isinstance(node.op, ast.UAdd):
            return +value
        raise ValueError("unsupported unary operator")
    if isinstance(node, ast.BinOp):
        left = _resolve_node(node.left, context)
        right = _resolve_node(node.right, context)
        op = _BIN_OPS.get(type(node.op))
        if op is None:
            raise ValueError("unsupported binary operator")
        if isinstance(node.op, ast.Pow):
            try:
                if abs(float(right)) > 10:
                    raise ValueError("exponent too large")
            except (TypeError, ValueError):
                raise ValueError("invalid exponent")
        return op(left, right)
    if isinstance(node, ast.Compare):
        left = _resolve_node(node.left, context)
        for op, comparator in zip(node.ops, node.comparators):
            right = _resolve_node(comparator, context)
            fn = _CMP_OPS.get(type(op))
            if fn is None:
                raise ValueError("unsupported comparison")
            if not fn(left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.IfExp):
        return _resolve_node(node.body if _resolve_node(node.test, context) else node.orelse, context)
    if isinstance(node, ast.Call):
        if len(node.args) > 8:
            raise ValueError("too many arguments")
        args = [_resolve_node(arg, context) for arg in node.args]
        if isinstance(node.func, ast.Name) and node.func.id in _SAFE_FUNCTIONS:
            return _SAFE_FUNCTIONS[node.func.id](*args)
        if isinstance(node.func, ast.Attribute) and node.func.attr in _SAFE_METHODS:
            base = _resolve_node(node.func.value, context)
            method = getattr(base, node.func.attr, None)
            if method is None or not callable(method):
                raise ValueError("unsupported method")
            return method(*args)
        raise ValueError("unsupported function call")
    raise ValueError(f"unsupported expression node: {type(node).__name__}")


def evaluate_expression(expression: str, context: Mapping[str, Any]) -> Any:
    """Evaluate a safe expression, returning MISSING on any error."""
    if not isinstance(expression, str):
        return MISSING
    text = expression.strip()
    if not text or len(text) > _MAX_EXPRESSION_LENGTH:
        return MISSING
    try:
        tree = ast.parse(text, mode="eval")
        return _resolve_node(tree.body, context)
    except Exception:
        return MISSING


def truthy(value: Any) -> bool:
    if value is MISSING:
        return False
    return bool(value)


def _render_match(match: re.Match[str], context: Mapping[str, Any]) -> str:
    expression = match.group(1) or match.group(2)
    value = evaluate_expression(expression, context)
    if value is MISSING:
        return match.group(0)
    if value is None:
        return ""
    return str(value)


def render_template(template: str, context: Mapping[str, Any]) -> Any:
    """Render `{expr}` / `{{ expr }}` templates, preserving the typed value."""
    if not isinstance(template, str):
        return template
    matches = list(_TEMPLATE_RE.finditer(template))
    if len(matches) == 1 and matches[0].group(0) == template:
        expression = matches[0].group(1) or matches[0].group(2)
        value = evaluate_expression(expression, context)
        return template if value is MISSING else ("" if value is None else value)
    return _TEMPLATE_RE.sub(lambda match: _render_match(match, context), template)


def render_value(value: Any, context: Mapping[str, Any]) -> Any:
    """Recursively render templates inside dicts/lists/strings."""
    if isinstance(value, str):
        return render_template(value, context)
    if isinstance(value, Mapping):
        return {key: render_value(item, context) for key, item in value.items()}
    if isinstance(value, list):
        return [render_value(item, context) for item in value]
    if isinstance(value, tuple):
        return tuple(render_value(item, context) for item in value)
    return value

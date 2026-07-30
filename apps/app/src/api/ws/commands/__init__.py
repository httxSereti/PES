"""
WS command handlers, one file per command, grouped by domain.

Modules here are auto-discovered by `api.ws.registry.load_commands()` —
each handler self-registers with the @command decorator, so no __init__
re-exports are needed. To add a command: declare its model in
api/ws/schema/client.py, then drop a handle_*.py file in the right domain.
"""

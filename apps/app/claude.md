# PlunEStim (PES) Architecture Overview

This document provides a high-level overview of the PlunEStim architecture for AI coding assistants.

## ˚.✨⋆ Core Components

### 1. **Entry Point & Concurrency (`main.py`)**
PlunEStim runs two main systems in parallel:
- **FastAPI Server**: Handles REST API and WebSockets.
- **Lifecycle**: Managed via an `@asynccontextmanager` lifespan in FastAPI for clean startup/shutdown of database and event systems.

### 2. **Event & Action System (`src/events/`)**
The heart of PES, enabling reactive logic based on external inputs.
- **`EventDispatcher` (Singleton)**: The entry point for all events (Chaster, Discord, Sensors). It resolves rules and enqueues actions.
- **`EventRegistry`**: Queries the database to find enabled **Trigger Rules** for a given event type.
- **`ActionQueue` (Singleton)**: An asynchronous, thread-safe, priority-based queue. It manages the execution lifecycle of actions (wait, run, cancel, resume).
- **`ActionExecutor`**: Implements the actual logic for each `ActionType` (applying profiles, changing unit levels, modifying Chaster time).
- **`ActionType`**: Supports `LEVEL`, `PROFILE`, `MULT`, and `CHASTER_TIME_ADD`.

### 3. **Database Layer (`src/database/`)**
PES uses **SQLAlchemy (Async)** with a SQLite backend.
- **`Database` (Singleton)**: Centralizes the engine and session maker. Initialized once at startup.
- **Models**:
    - `TriggerRule`: Maps an event type to a set of actions.
    - `TriggerAction`: A specific consequence with payload and duration.
- **Repositories**: `TriggerRuleRepo` handles all CRUD operations, ensuring clean separation from the API/Logic layers.

### 4. **State Management (`src/store/`)**
- **`Store`**: A thread-safe, in-memory proxy for the current state of units (intensity, modes) and sensors. It bridges the gap between hardware threads and the API.

### 5. **Communication Layer**
- **WebSockets (Primary)**: The frontend and backend communicate primarily via WebSockets for real-time state synchronization. The `ws_notifier` (backend) broadcasts updates, while the `WebSocketProvider` (frontend) manages the connection.
- **REST API**: Used for authentication, administrative tasks, and CRUD operations on `Trigger Rules`.

### 6. **Frontend Architecture (`apps/front/`)**
- **Tech Stack**: React + Vite + TailwindCSS.
- **State Management**: Redux Toolkit with a custom **WebSocket Middleware** to handle real-time data flow.
- **Hooks & Providers**:
    - `WebSocketProvider`: Manages the lifecycle of the WS connection.
    - `useWebSocketEvent`: Custom hooks to consume real-time events (unit updates, sensor data) and send commands.
- **Event-Driven UI**: The UI reacts to incoming WS messages (e.g., `websocket:unit_update`) by updating the Redux store or triggering local component effects.

### 7. **Services (`src/services/`)**
- **`Notifier`**: Manages outgoing messages to Discord and WebSockets, centralizing feedback for the user.

## ˚.✨⋆ Design Patterns

- **Singletons**: Used for heavy/centralized services (`Database`, `ActionQueue`, `EventDispatcher`, `ws_notifier`) to ensure they are accessible globally without complex dependency injection.
- **Repository Pattern**: All database access is abstracted via repositories.
- **Command Pattern**: Actions are encapsulated as objects with payloads, allowing for queuing and reversal.

## ˚.✨⋆ Data Flow Example (Trigger Event)

1.  **Input**: A Chaster webhook or Discord command calls `dispatcher.dispatch("event_type")`.
2.  **Resolution**: `dispatcher` asks `registry` for all enabled `TriggerRule`s for that event.
3.  **Queueing**: `dispatcher` converts rules into `QueueItem`s and enqueues them in `ActionQueue`.
4.  **Execution**: `ActionQueue` ticks, calling `executor.apply(item)`.
5.  **Effect**: `executor` updates the `store` (for levels/profiles) or calls external APIs (Chaster).
6.  **Feedback**: `ws_notifier` sends a state update to the frontend; `notifier` sends a message to Discord.

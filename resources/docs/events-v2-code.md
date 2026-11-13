# Events v2 — Annexes code

> Tous les blocs de code, SQL, JSON, YAML et protocoles extraits de [events-v2.md](events-v2.md).
> Les diagrammes, tableaux, listes d'événements et arbres de fichiers restent dans le document principal.

## Sommaire

- **Modèles et pipeline** — 4.1, 4.3, 5.1
- **Rule Engine** — 6.1 à 6.12
- **Connecteurs** — 7.2, 7.4, 7.6
- **Discord** — 8.5
- **Chaster** — 9.8
- **Sécurité et consentement** — 12.1, 12.2
- **Modèle de données** — 13.1 à 13.11
- **API** — 14.2

---

## 4.1 — EventEnvelope

Modèle pydantic de l'enveloppe canonique.

```python
from datetime import datetime
from pydantic import BaseModel, Field


class ActorRef(BaseModel):
    id: str | None = None            # id interne PES (actors.id)
    platform: str                    # "discord", "chaster", "reddit", ...
    platform_id: str
    display_name: str | None = None
    is_self: bool = False
    is_bot: bool = False
    roles: list[str] = Field(default_factory=list)
    trust: float = 0.5              # 0..1
    metadata: dict = Field(default_factory=dict)


class SubjectRef(BaseModel):
    kind: str                        # "session", "lock", "device", "unit", "channel"
    id: str
    label: str | None = None


class EventEnvelope(BaseModel):
    id: str
    type: str                        # "discord.message.created"
    version: int = 1
    source: str                      # "discord_vencord", "chaster", "rss"
    account: str | None = None       # compte/bridge émetteur
    actor: ActorRef | None = None
    subject: SubjectRef | None = None
    occurred_at: datetime            # côté plateforme
    received_at: datetime            # côté PES
    session_id: str | None = None
    correlation_id: str              # racine de la chaîne
    causation_id: str | None = None  # événement qui a causé celui-ci
    dedupe_key: str | None = None
    severity: str = "info"
    tags: list[str] = Field(default_factory=list)
    payload: dict = Field(default_factory=dict)
    raw: dict | None = None          # debug, redacted, optionnel
```

## 4.3 — Payload normalisé Discord

Exemple de payload normalisé pour `discord.message.created`.

```json
{
  "message": {
    "id": "1234567890",
    "channel_id": "9876543210",
    "guild_id": "1122334455",
    "content_hash": "sha256:...",
    "length": 42
  },
  "channel": {
    "name": "punitions",
    "type": "GUILD_TEXT",
    "nsfw": true
  },
  "is_mention": true,
  "mention_count": 2,
  "is_reply": false,
  "is_dm": false,
  "attachments": [{ "mime": "image/jpeg", "size": 184320, "spoiler": false }],
  "author": {
    "id": "5566778899",
    "username": "sub42",
    "is_bot": false
  }
}
```

## 5.1 — Filtres d'ingress

Filtres recommandés pour les sources à fort volume.

```yaml
filters:
  guild_ids: ["..."] # Discord
  channel_ids: ["..."]
  include_dms: true
  nsfw_only: false
  ignore_bots: true
  event_types: ["discord.message.created", "discord.reaction.added"]
  keyword_regex: ["\\b(punition|edge|deny)\\b"]
  sample_rate: 1.0
```

## 6.1 — RuleSpec

Modèles pydantic des règles, conditions, fenêtres et actions.

```python
class Condition(BaseModel):
    field: str
    op: Literal[
        "eq", "neq", "gt", "gte", "lt", "lte",
        "in", "not_in", "contains", "icontains",
        "starts_with", "ends_with", "matches",
        "exists", "between", "length", "is_null",
    ]
    value: Any | None = None
    other: str | None = None        # comparer à un autre champ
    case_sensitive: bool = True


class ConditionGroup(BaseModel):
    mode: Literal["all", "any", "not"] = "all"
    conditions: list["Condition | ConditionGroup"] = []


class WindowSpec(BaseModel):
    seconds: int
    group_by: str | None = None
    function: Literal["count", "sum", "avg", "min", "max", "distinct", "rate"]
    field: str | None = None
    having: Condition
    on: Literal["threshold_crossed", "every_match"] = "threshold_crossed"
    allowed_lateness_seconds: int = 0


class CooldownSpec(BaseModel):
    seconds: int
    scope: Literal["rule", "actor", "group", "subject"] = "rule"
    max_fires: int | None = None
    window_seconds: int | None = None


class ActionSpec(BaseModel):
    type: str
    payload: dict = {}
    duration: int = -1
    cumulative: bool = False
    delay_seconds: int = 0
    when: ConditionGroup | None = None
    probability: float = 1.0
    clamp: dict | None = None


class RuleSpec(BaseModel):
    event: str
    where: ConditionGroup | None = None
    window: WindowSpec | None = None
    cooldown: CooldownSpec | None = None
    probability: float = 1.0
    match_mode: Literal["all", "first"] = "all"
    stop_processing: bool = False
    silent: bool = False
    actions: list[ActionSpec] = []
    emits: str | None = None        # événement dérivé optionnel
```

## 6.2 — Conditions

Exemple d'arbre `all` / `any` avec opérateurs.

```jsonc
{
  "all": [
    { "field": "payload.channel.nsfw", "op": "eq", "value": true },
    { "field": "payload.is_mention", "op": "eq", "value": true },
    { "field": "actor.is_bot", "op": "eq", "value": false },
    {
      "any": [
        {
          "field": "actor.id",
          "op": "not_in",
          "value": "$vars.trusted_actors",
        },
        { "field": "payload.mention_count", "op": "gte", "value": 3 },
      ],
    },
  ],
}
```

## 6.3 — Comparaison de champs

Comparaison d'un champ avec un autre champ (`other`).

```json
{ "field": "payload.duration", "op": "gt", "other": "vars.max_allowed_minutes" }
```

## 6.4 — Condition contextuelle

Condition sur l'état courant des unités et de la queue.

```json
{
  "all": [
    { "field": "state.units.1.level", "op": "lt", "value": 70 },
    { "field": "state.queue.active_count", "op": "lt", "value": 5 }
  ]
}
```

## 6.5 — Fenêtres et agrégats

Trois exemples de fenêtres glissantes.

### Exemple 1 — 10 réactions 🔥 sur le même message en 5 minutes

```jsonc
// 10 réactions 🔥 sur le même message en 5 minutes
{
  "event": "discord.reaction.added",
  "where": { "field": "payload.emoji.name", "op": "eq", "value": "🔥" },
  "window": {
    "seconds": 300,
    "group_by": "payload.message.id",
    "function": "count",
    "having": { "field": "count", "op": "gte", "value": 10 },
    "on": "threshold_crossed",
  },
  "cooldown": { "seconds": 600, "scope": "group" },
}
```

### Exemple 2 — 60 minutes de votes cumulés en 1 heure

```jsonc
// 60 minutes de votes cumulés en 1 heure
{
  "event": "chaster.vote.added",
  "window": {
    "seconds": 3600,
    "function": "sum",
    "field": "payload.duration",
    "having": { "field": "sum", "op": "gte", "value": 60 },
    "on": "threshold_crossed",
  },
}
```

### Exemple 3 — 5 personnes distinctes en 10 minutes

```jsonc
// 5 personnes distinctes ont voté en 10 minutes
{
  "event": "chaster.pillory.voted",
  "window": {
    "seconds": 600,
    "function": "distinct",
    "field": "actor.id",
    "having": { "field": "distinct", "op": "gte", "value": 5 },
  },
}
```

## 6.6 — Cooldowns et budgets

Cooldown par acteur et budget horaire.

```jsonc
{
  "cooldown": {
    "seconds": 300,
    "scope": "actor",
    "max_fires": 3,
    "window_seconds": 3600,
  },
  "budget": {
    "max_intensity_delta_per_hour": 40,
    "max_time_added_per_hour": 120,
  },
}
```

## 6.8 — Templating

Exemple d'action avec template.

```json
{
  "type": "CHASTER_TIME_UPDATE",
  "payload": {
    "duration_minutes": "{ clamp(payload.mention_count * 5, 1, 60) }",
    "reason": "Ping de {actor.display_name} dans #{payload.channel.name}"
  }
}
```

## 6.9 — Actions conditionnelles et différées

Action conditionnelle avec délai.

```json
{
  "type": "LEVEL",
  "when": { "field": "state.units.1.connected", "op": "eq", "value": true },
  "delay_seconds": 30,
  "payload": { "units": "1", "channels": "A", "value": "+5" }
}
```

## 6.10 — Composition (EMIT_EVENT)

Émission d'un événement dérivé depuis une règle.

```json
{
  "type": "EMIT_EVENT",
  "payload": {
    "type": "custom:high_engagement",
    "data": { "count": "{window.count}", "message_id": "{payload.message.id}" }
  }
}
```

## 6.11 — Scénarios

Scénario de punition pillory avec étapes temporelles.

```yaml
id: pillory_punishment
name: "Pillory punishment"
steps:
  - on: chaster.pillory.started
    do:
      - { type: PROFILE, payload: { profile: "tease", level_pct: 30 } }
  - on: chaster.pillory.voted
    do:
      - { type: LEVEL, payload: { units: "1", channels: "A", value: "+2" } }
    cooldown: { seconds: 20, scope: actor }
  - after: 5m
    if: { field: "session.votes", op: "gte", value: 10 }
    do:
      - { type: LOVENSE_PATTERN_PLAY, payload: { pattern_id: "edge_hold" } }
  - on: chaster.pillory.ended
    do:
      - { type: PROFILE, payload: { profile: "aftercare", level_pct: 0 } }
```

## 6.12.A — Ping Discord NSFW → punition

```jsonc
{
  "name": "NSFW ping = punition",
  "event": "discord.message.created",
  "where": {
    "all": [
      { "field": "payload.is_mention", "op": "eq", "value": true },
      { "field": "payload.channel.nsfw", "op": "eq", "value": true },
      { "field": "actor.is_bot", "op": "eq", "value": false },
      { "field": "actor.trust", "op": "lt", "value": 0.8 },
    ],
  },
  "cooldown": { "seconds": 300, "scope": "actor" },
  "actions": [
    {
      "type": "LEVEL",
      "payload": {
        "units": "1",
        "channels": "A",
        "value": "+{ clamp(payload.mention_count * 2, 1, 10) }",
      },
    },
    {
      "type": "CHASTER_TIME_UPDATE",
      "payload": { "duration_minutes": "{ payload.mention_count * 5 }" },
    },
  ],
}
```

## 6.12.B — 10 réactions 🔥 → pulse

```jsonc
{
  "name": "Fire reactions",
  "event": "discord.reaction.added",
  "where": { "field": "payload.emoji.name", "op": "eq", "value": "🔥" },
  "window": {
    "seconds": 300,
    "group_by": "payload.message.id",
    "function": "count",
    "having": { "field": "count", "op": "gte", "value": 10 },
    "on": "threshold_crossed",
  },
  "cooldown": { "seconds": 600, "scope": "group" },
  "actions": [
    {
      "type": "LOVENSE_PULSE",
      "payload": { "value": "{ clamp(window.count * 8, 20, 100) }" },
    },
  ],
}
```

## 6.12.C — Message Chaster du keyholder → scénario

```jsonc
{
  "name": "Keyholder says punish",
  "event": "chaster.message.received",
  "where": {
    "all": [
      {
        "field": "payload.conversation.role",
        "op": "eq",
        "value": "keyholder",
      },
      {
        "field": "payload.text",
        "op": "matches",
        "value": "(?i)\\b(punish|punition)\\b",
      },
    ],
  },
  "actions": [
    {
      "type": "EMIT_EVENT",
      "payload": { "type": "custom:punishment_requested" },
    },
  ],
}
```

## 6.12.D — Tip ≥ 100 tokens → récompense

```jsonc
{
  "name": "Tip reward",
  "event": "chaturbate.tip.received",
  "where": { "field": "payload.tokens", "op": "gte", "value": 100 },
  "cooldown": { "seconds": 60, "scope": "actor" },
  "actions": [
    {
      "type": "LOVENSE_SET",
      "payload": {
        "value": "{ clamp(payload.tokens / 10, 10, 80) }",
        "mode": "absolute",
      },
    },
  ],
}
```

## 6.12.E — Même acteur Discord + Chaster → double

```jsonc
{
  "name": "Cross-platform actor",
  "event": "chaster.vote.added",
  "where": { "field": "actor.id", "op": "exists", "value": true },
  "window": {
    "seconds": 600,
    "function": "count",
    "field": "actor.id",
    "having": { "field": "count", "op": "gte", "value": 2 },
  },
  "actions": [
    {
      "type": "CHASTER_TIME_UPDATE",
      "payload": { "duration_minutes": "{ payload.duration * 2 }" },
    },
  ],
}
```

## 7.2 — Connector

Classe de base d'un connecteur.

```python
class Connector:
    id: str
    name: str
    description: str

    def events(self) -> list[EventDef]: ...
    def actions(self) -> list[ActionDef]: ...
    def settings(self) -> list[SettingDef]: ...

    def capabilities(self) -> set[str]:
        return {"emit"}

    def transport(self) -> Transport | None: ...

    async def start(self, ctx: ConnectorContext) -> None: ...
    async def stop(self) -> None: ...

    def health(self) -> dict: ...
```

## 7.4 — Connecteurs déclaratifs

Deux manifestes sans code : RSS et webhook générique.

### RSS

```yaml
id: rss_blog
name: "Blog RSS"
transport: rss
url: https://example.com/feed.xml
interval_seconds: 120
dedupe: "{{ item.guid }}"
map:
  type: "rss.item.published"
  actor: "{{ item.author }}"
  payload:
    title: "{{ item.title }}"
    url: "{{ item.link }}"
    summary: "{{ item.summary }}"
```

### Webhook générique

```yaml
id: custom_webhook
name: "Custom webhook"
transport: webhook
path: /webhooks/custom/custom_webhook
secret_env: CUSTOM_WEBHOOK_SECRET
map:
  type: "custom.event.received"
  dedupe: "{{ body.id }}"
  actor:
    platform: "custom"
    platform_id: "{{ body.user.id }}"
    display_name: "{{ body.user.name }}"
  payload: "{{ body.data }}"
```

## 7.6 — Santé du connecteur

Payload de health exposé à l'UI.

```json
{
  "status": "online",
  "last_event_at": "2026-11-13T10:42:00Z",
  "lag_seconds": 1.2,
  "error_count": 0,
  "events_per_minute": 14,
  "last_error": null
}
```

## 8.5 — Protocole PES Link

Échanges JSON entre un client (Vencord, companion) et PES.

```jsonc
// client → PES
{
  "type": "hello",
  "token": "...",
  "client": { "id": "vencord", "version": "1.0" },
  "account": { "id": "...", "username": "..." },
  "capabilities": ["discord.message.created", "discord.reaction.added"]
}

// PES → client
{
  "type": "welcome",
  "session": "...",
  "server_time": "2026-11-13T10:42:00Z",
  "heartbeat": 30
}

// PES → client
{
  "type": "subscribe",
  "filters": [
    {
      "event": "discord.message.created",
      "guild_ids": ["..."],
      "channel_ids": ["..."],
      "nsfw_only": true,
      "include_content": false
    }
  ]
}

// client → PES
{ "type": "event", "event": { /* EventEnvelope */ } }

// PES → client
{ "type": "ack", "id": "..." }

// keepalive
{ "type": "ping" } / { "type": "pong" }
```

## 9.8 — Sécurité webhook Chaster

Suppression des credentials par défaut.

```python
expected_user = os.getenv("CHASTER_WEBHOOK_USER")  # pas de défaut
expected_pwd = os.getenv("CHASTER_WEBHOOK_PWD")    # pas de défaut
if not expected_user or not expected_pwd:
    raise RuntimeError("Chaster webhook credentials are not configured")
```

## 12.1 — Profil de consentement

Exemple de limites dures.

```json
{
  "session_id": "...",
  "limits": {
    "max_level_pct": 80,
    "max_continuous_minutes": 45,
    "max_total_time_added_minutes": 240,
    "max_intensity_delta_per_hour": 40,
    "mandatory_break_minutes": 10
  },
  "allowed_sources": ["discord", "chaster", "lovense"],
  "allowed_actors": ["actor_id_1", "actor_id_2"],
  "quiet_hours": { "start": "01:00", "end": "08:00" },
  "safewords": ["red", "pause"],
  "remote_actions_require_approval": true
}
```

## 12.2 — SafetyDecision

Résultat du Safety Governor.

```python
class SafetyDecision(BaseModel):
    allowed: bool
    clamped_payload: dict | None
    reason: str | None
```

## 13.1 — triggered_events

Extensions du journal d'événements.

```sql
ALTER TABLE triggered_events ADD COLUMN source TEXT;
ALTER TABLE triggered_events ADD COLUMN account TEXT;
ALTER TABLE triggered_events ADD COLUMN actor_id TEXT;
ALTER TABLE triggered_events ADD COLUMN subject_kind TEXT;
ALTER TABLE triggered_events ADD COLUMN subject_id TEXT;
ALTER TABLE triggered_events ADD COLUMN correlation_id TEXT;
ALTER TABLE triggered_events ADD COLUMN causation_id TEXT;
ALTER TABLE triggered_events ADD COLUMN dedupe_key TEXT;
ALTER TABLE triggered_events ADD COLUMN severity TEXT NOT NULL DEFAULT 'info';
ALTER TABLE triggered_events ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE triggered_events ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE triggered_events ADD COLUMN raw TEXT;

CREATE INDEX IF NOT EXISTS ix_triggered_events_source
  ON triggered_events(source, triggered_at);
CREATE INDEX IF NOT EXISTS ix_triggered_events_actor
  ON triggered_events(actor_id, triggered_at);
CREATE INDEX IF NOT EXISTS ix_triggered_events_correlation
  ON triggered_events(correlation_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_triggered_events_dedupe
  ON triggered_events(dedupe_key) WHERE dedupe_key IS NOT NULL;
```

## 13.2 — trigger_rules

Nouvelles colonnes des règles.

```sql
ALTER TABLE trigger_rules ADD COLUMN conditions TEXT;        -- JSON ConditionGroup
ALTER TABLE trigger_rules ADD COLUMN window_spec TEXT;       -- JSON WindowSpec
ALTER TABLE trigger_rules ADD COLUMN cooldown_spec TEXT;     -- JSON CooldownSpec
ALTER TABLE trigger_rules ADD COLUMN budget_spec TEXT;       -- JSON BudgetSpec
ALTER TABLE trigger_rules ADD COLUMN probability REAL NOT NULL DEFAULT 1.0;
ALTER TABLE trigger_rules ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'all';
ALTER TABLE trigger_rules ADD COLUMN stop_processing INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trigger_rules ADD COLUMN silent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trigger_rules ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 2;
```

## 13.3 — trigger_actions

Nouvelles colonnes des actions.

```sql
ALTER TABLE trigger_actions ADD COLUMN delay_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trigger_actions ADD COLUMN condition TEXT;       -- JSON ConditionGroup
ALTER TABLE trigger_actions ADD COLUMN probability REAL NOT NULL DEFAULT 1.0;
ALTER TABLE trigger_actions ADD COLUMN clamp_spec TEXT;      -- JSON
```

## 13.4 — rule_runs

Trace d'évaluation des règles.

```sql
CREATE TABLE IF NOT EXISTS rule_runs (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES triggered_events(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  rule_name TEXT,
  matched INTEGER NOT NULL DEFAULT 0,
  skip_reason TEXT,
  latency_ms REAL,
  action_ids TEXT NOT NULL DEFAULT '[]',
  trace TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_rule_runs_event ON rule_runs(event_id);
CREATE INDEX IF NOT EXISTS ix_rule_runs_rule ON rule_runs(rule_id, created_at);
```

## 13.5 — rule_state

État persistant des cooldowns et fenêtres.

```sql
CREATE TABLE IF NOT EXISTS rule_state (
  rule_id TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  last_fired_at DATETIME,
  fire_count INTEGER NOT NULL DEFAULT 0,
  window_start DATETIME,
  window_value REAL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rule_id, scope_key)
);
```

## 13.6 — actors, actor_identities, actor_stats

Identité unifiée et statistiques par acteur.

```sql
CREATE TABLE IF NOT EXISTS actors (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  trust REAL NOT NULL DEFAULT 0.5,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  first_seen_at DATETIME,
  last_seen_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS actor_identities (
  platform TEXT NOT NULL,
  platform_id TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  display_name TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (platform, platform_id)
);

CREATE TABLE IF NOT EXISTS actor_stats (
  actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  total_value REAL NOT NULL DEFAULT 0,
  last_event_at DATETIME,
  PRIMARY KEY (actor_id, event_type)
);
```

## 13.7 — effect_ledger

Idempotence et audit des effets.

```sql
CREATE TABLE IF NOT EXISTS effect_ledger (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  rule_id TEXT,
  action_type TEXT NOT NULL,
  dedupe_key TEXT,
  status TEXT NOT NULL,
  payload TEXT,
  clamped INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_effect_ledger_dedupe
  ON effect_ledger(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_effect_ledger_event ON effect_ledger(event_id);
```

## 13.8 — event_dedupe

Déduplication persistante.

```sql
CREATE TABLE IF NOT EXISTS event_dedupe (
  key TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  expires_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_event_dedupe_expires ON event_dedupe(expires_at);
```

## 13.9 — connector_state

Curseurs et état des connecteurs.

```sql
CREATE TABLE IF NOT EXISTS connector_state (
  connector_id TEXT PRIMARY KEY,
  cursor TEXT,
  last_event_at DATETIME,
  error_count INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## 13.10 — scenario_runs, scenario_steps

Exécution des scénarios.

```sql
CREATE TABLE IF NOT EXISTS scenario_runs (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  session_id TEXT,
  status TEXT NOT NULL,
  current_step TEXT,
  state TEXT NOT NULL DEFAULT '{}',
  started_at DATETIME,
  updated_at DATETIME,
  ended_at DATETIME
);

CREATE TABLE IF NOT EXISTS scenario_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES scenario_runs(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  status TEXT NOT NULL,
  due_at DATETIME,
  completed_at DATETIME,
  data TEXT NOT NULL DEFAULT '{}'
);
```

## 13.11 — FTS event_search

Recherche plein texte optionnelle.

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS event_search USING fts5(
  event_id UNINDEXED,
  text,
  tokenize = 'unicode61'
);
```

## 14.2 — events:triggered

Payload WebSocket d'un événement.

```json
{
  "id": "evt_...",
  "type": "discord.message.created",
  "source": "discord_vencord",
  "actor": { "id": "act_...", "display_name": "sub42" },
  "session_id": "ses_...",
  "occurred_at": "2026-11-13T10:42:00Z",
  "payload": { "is_mention": true, "channel": { "nsfw": true } },
  "triggered_rules": [ ... ]
}
```

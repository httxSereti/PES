# Events v3 — PES Flow et télémétrie

> Statut : phases 0 à 4 implémentées côté moteur ; phase 5 (durcissement) entamée. Canvas en lecture seule ; l'édition graphique drag-and-drop reste à venir.
> Portée : moteur d'événements, éditeur de flows, télémétrie, schéma WS, base SQLite.
> Documents liés : [events-v2.md](events-v2.md), [events-v2-code.md](events-v2-code.md), [events-trigger-rules-audit.md](events-trigger-rules-audit.md).
> Intégrations : [events-v3-integrations.md](events-v3-integrations.md) — catalogue séparé, volontairement exclu de la roadmap moteur.

---

## Table des matières

1. [Résumé exécutif](#1-résumé-exécutif)
2. [Périmètre et non-objectifs](#2-périmètre-et-non-objectifs)
3. [Architecture cible](#3-architecture-cible)
4. [Modèle de flow](#4-modèle-de-flow)
5. [Compilation et exécution](#5-compilation-et-exécution)
6. [Effect Planner et Safety Governor](#6-effect-planner-et-safety-governor)
7. [Télémétrie](#7-télémétrie)
8. [API et WebSocket](#8-api-et-websocket)
9. [Frontend](#9-frontend)
10. [Modèle de données](#10-modèle-de-données)
11. [Migration et compatibilité](#11-migration-et-compatibilité)
12. [Roadmap moteur](#12-roadmap-moteur)
13. [Risques](#13-risques)
14. [Décisions ouvertes](#14-décisions-ouvertes)
15. [Annexes](#15-annexes)

---

## 1. Résumé exécutif

Le système actuel fonctionne : `EventDispatcher` résout des `TriggerRule`, crée des `QueueItem`, et `ActionQueue` exécute les actions. La v2 a documenté le bon socle : `EventEnvelope`, conditions, fenêtres, cooldowns, budgets, connecteurs, Safety Governor.

La v3 ajoute la couche qui manque pour un usage avancé :

1. **Un format de flow visuel** (`FlowSpec`) compilé vers un IR exécutable — pas un moteur de workflow généraliste.
2. **Un Effect Planner** : les nœuds produisent des effets déclaratifs, le planner applique les modificateurs, les budgets et le consentement avant la queue.
3. **Une identité d'acteur unifiée** : `actor.id` remplace les noms affichés dans les conditions. « Sereti » devient une référence stable, pas une chaîne fragile.
4. **Une télémétrie complète** : `events → flow_runs → node_runs → effect_ledger → queue`, avec replay et explication de chaque décision.
5. **Un versioning des flows** : brouillon, publication, diff, rollback, et version épinglée dans chaque run.

Le graphe n'est pas le seul mode d'édition : le formulaire simple actuel reste supporté et produit le même IR. Le mode Flow est le mode avancé.

**Les intégrations ne font pas partie de ce plan.** Leur catalogue, leurs transports, leurs priorités et leurs risques sont dans [events-v3-integrations.md](events-v3-integrations.md).

### 1.1 État d'implémentation — phase 0

Le socle backend est en place :

- `EventEnvelope` + `ActorRef` dans `events/envelope.py` ; le dispatcher construit et persiste l'enveloppe (source, acteur, corrélation, causation, dédup, sévérité, tags, version).
- Tables `actors`, `actor_identities`, `actor_stats`, `flow_defs`, `flow_versions`, `flow_trigger_index`, `flow_runs`, `node_runs`, `effect_ledger`.
- Migrations additives de `triggered_events` (`occurred_at`, `source`, `actor_id`, `correlation_id`, `causation_id`, `dedupe_key`, `severity`, `tags`, `version`).
- `POST /api/events/simulate` : dry-run d'un événement contre les règles actives, sans queue ni écriture.
- `GET /api/events/v3/status` : flags de rollout.
- `EVENTS_V3_ENABLED`, `EVENTS_V3_SHADOW_MODE`, `EVENTS_V3_TELEMETRY`, `EVENTS_V3_MAX_WORKERS`.
- Shadow mode : le plan legacy est enregistré dans `flow_runs` + `effect_ledger` sans modifier l'exécution.
- Les messages `events:triggered` et l'historique exposent les nouveaux champs d'enveloppe.

Fichiers principaux : `events/envelope.py`, `events/v3/`, `database/models/actor.py`, `database/models/flow.py`, `database/repositories/actor_repo.py`, `database/repositories/flow_repo.py`, `api/rest/events_v3.py`.

Les briques F+G sont désormais couvertes ; le planner complet et l'éditeur canvas restent des chantiers séparés.

### 1.2 État d'implémentation — phase 1 (F + G)

La direction retenue est **Rules + Drawer (F)** + **Composer (G)**, pas le canvas. La phase 1 livre donc une version linéaire, incrémentale, sur le modèle `TriggerRule` existant :

- conditions JSON (`trigger_rules.conditions`, `condition_mode`) évaluées avant les actions ;
- amplificateurs (`trigger_actions.modifiers`) de type `scale`, avec condition optionnelle ;
- formulaire Composer : builder de conditions, bloc amplificateur par action, preview live ;
- routes d'éditeur dédiées : `/app/events/flows/new` et `/app/events/flows/:id` ;
- drawer « Flow preview » depuis la liste des règles ;
- endpoint `POST /api/events/simulate` étendu avec `draft_rule` pour le dry-run du brouillon ;
- compilateur `FlowSpec` linéaire (`events/flows/`) et plan compilé renvoyé par la simulation.

Limites assumées : conditions plates (AND/OR), pas encore d'édition graphique drag-and-drop. Ces éléments restent la cible des directions A/B, à brancher plus tard sur le même IR.

Fichiers phase 1 : `events/conditions.py`, `events/modifiers.py`, `events/flows/`, `form/condition-builder.tsx`, `form/action-amplifier-fields.tsx`, `form/flow-map.tsx`, `form/rule-preview.tsx`, `console/rule-flow-drawer.tsx`, `hooks/useRuleSimulation.ts`.

### 1.3 Télémétrie locale

Une première page `/app/events/telemetry` expose les métriques du buffer d'événements : débit sur 12 minutes, top events, top règles, actions, taux de match et inspecteur d'événement (payload + règles + modificateurs). Une page `/app/events/runs` liste les runs serveur persistés (`flow_runs`, `node_runs`, `effect_ledger`) avec replay dry-run.

Activer l'enregistrement serveur :

```dotenv
EVENTS_V3_TELEMETRY=true
```

Le stockage `flow_runs` / `node_runs` / `effect_ledger` reste la source de la trace complète.

### 1.4 Phase 2 — télémétrie serveur

La phase 2 est branchée :

- `EVENTS_V3_TELEMETRY=true` enregistre un `flow_run` par règle évaluée ;
- `node_runs` trace le trigger, les conditions et les actions ;
- `effect_ledger` conserve payload avant/après, modificateurs et item de queue ;
- `GET /api/events/runs`, `GET /api/events/runs/{id}`, `GET /api/events/{id}/trace` ;
- `POST /api/events/{id}/replay` pour le dry-run d'un événement passé ;
- UI `/app/events/runs` et `/app/events/runs/{id}` avec timeline, ledger et replay.
- Canvas de lecture seule `/app/events/flows/{id}/canvas` : rend le `FlowSpec` compilé (nœuds WHEN/IF/THEN, arêtes, warnings) sans permettre l'édition pour l'instant.

### 1.5 Phase 3 — moteur avancé

Le dispatcher applique désormais, dans l'ordre : fenêtre d'agrégation → cooldown → budget.

- **Fenêtre d'agrégation** (`window_count`, `window_seconds`) : une règle ne tire qu'après N événements correspondants dans la fenêtre. Le burst est consommé une seule fois.
- **Cooldown** (`cooldown_seconds`) : délai minimum entre deux tirs.
- **Budget** (`budget_count`, `budget_window_seconds`, `budget_per_actor`) : plafond glissant par règle ou par acteur.
- **Approbations** (`requires_approval`, `approval_timeout_seconds`) : les actions ne sont pas mises en queue ; une `ApprovalRequest` est créée et visible dans `/app/events/approvals`. Un admin approuve (les items sont alors enfilés) ou refuse. API : `GET /api/events/approvals`, `POST /api/events/approvals/{id}/approve`, `POST /api/events/approvals/{id}/reject`.
- **Modificateurs** : `scale`, `clamp` (réduction uniquement), `repeat`, `delay`, `probability`. `repeat` et `delay` produisent des `QueueItem` avec `not_before`, honoré par `ActionQueue.tick()`.
- Les dry-runs (`simulate`, replay, preview) n'incrémentent ni cooldown, ni fenêtre, ni budget.

Tables : `trigger_rules` (colonnes additives), `approval_requests`.

### 1.6 Phase 4 — SDK connecteurs

- **Webhook générique entrant** : `POST /webhooks/generic` (`X-PES-Token`), événement `webhook.received`, santé `GET /webhooks/generic/health`.
- **Action sortante** `WEBHOOK_SEND` : `POST`/`PUT`/`PATCH` JSON vers une URL http(s), timeout borné, en-têtes optionnels. Les adresses privées/loopback sont bloquées sauf `WEBHOOK_ALLOW_PRIVATE=true`.
- **Manifestes** : `GET /api/integrations/manifests` et `GET /api/integrations/{id}/manifest` exposent events/actions/settings + `health` + `manifest_version` pour les auteurs de connecteurs.
- Les connecteurs nominatifs (Discord, Reddit, X, plateformes NSFW) restent à brancher au cas par cas : credentials, quotas et ToS propres à chaque service.

### 1.7 Phase 5 — durcissement

- **Dédup entrante** : `dedupe_key` (webhooks, sources) est mémorisé pendant `EVENTS_V3_DEDUPE_TTL_SECONDS` (300 s par défaut). Un doublon est ignoré avant toute écriture.
- **Rétention** : `EVENTS_V3_RETENTION_DAYS` supprime au démarrage les runs, nœuds, effets et approbations plus anciens (0 = conservation illimitée).
- Les erreurs de télémétrie/approbation ne cassent jamais le pipeline legacy ; une approbation qui ne peut pas être persistée ne déclenche jamais ses actions.

```dotenv
EVENTS_V3_TELEMETRY=true
EVENTS_V3_DEDUPE_TTL_SECONDS=300
EVENTS_V3_RETENTION_DAYS=30
WEBHOOK_ALLOW_PRIVATE=false
```

Les éléments restants sont l'édition graphique drag-and-drop (A/B), les sous-flows/versioning visuel et les connecteurs nominatifs.

---

## 2. Périmètre et non-objectifs

### 2.1 Dans le périmètre

- Modèle `FlowSpec`, catalogue de nœuds, validation et compilation.
- Éditeur visuel de flows (React Flow) et conversion depuis le mode simple.
- `EffectSpec`, modificateurs, planner, Safety Governor.
- Télémétrie : runs, traces de nœuds, ledger d'effets, métriques, replay.
- API REST/WS, schémas pydantic, génération TypeScript.
- Migration additive depuis `trigger_rules` / `trigger_actions`.
- Tests du compilateur, du planner et des fonctions pures.

### 2.2 Hors périmètre

- Les connecteurs et intégrations concrètes (voir le document séparé).
- Un moteur de workflow généraliste type n8n/Temporal : trop large, trop de surface d'attaque, incompatible avec les contraintes hardware.
- L'exécution de code arbitraire dans un nœud.
- Le multi-tenant / cloud.
- Le remplacement de `ActionQueue`, `ActionExecutor` ou `neutralize_all()`.
- Les actions hardware directes depuis un flow : tout passe par le planner et la queue.

### 2.3 Contraintes de compatibilité

- **Ne jamais renommer un `event_type` persisté** : les anciens ids restent des alias.
- **Ne pas casser `EventDispatcher.dispatch`** : c'est l'API utilisée par Chaster, PuryFi, Lovense, les capteurs et le training.
- **Ne pas contourner `ActionQueue`** : toute action matérielle doit passer par la queue et par `neutralize_all()`.
- **Pas d'Alembic** : les migrations sont additives dans `database/connection.py::ensure_schema()`.
- **Windows d'abord** : le code Bluetooth et les chemins de fichiers sont sensibles à la plateforme.
- **Pas de suite de tests aujourd'hui** : le compilateur, le planner et les opérateurs sont les bons endroits pour introduire pytest.

---

## 3. Architecture cible

### 3.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CONNECTEURS                               │
│  Discord · Chaster · Reddit · Bluesky · RSS · IMAP · Webhook ...     │
│  (catalogue et priorités : events-v3-integrations.md)                │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ EventEnvelope
┌───────────────────────────────▼─────────────────────────────────────┐
│                         EVENT BUS (v2)                              │
│  ingress → validate → dedupe → policy → enrich → match              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ EventEnvelope + StateView
┌───────────────────────────────▼─────────────────────────────────────┐
│                         FLOW ENGINE (v3)                            │
│  trigger index → compile cache → evaluate DAG → collect effects     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ EffectSpec[]
┌───────────────────────────────▼─────────────────────────────────────┐
│                      EFFECT PLANNER + SAFETY                        │
│  modifiers → cooldown → dedupe → budgets → governor → approvals     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ PlannedEffect[]
┌───────────────────────────────▼─────────────────────────────────────┐
│                         ACTION QUEUE (existant)                     │
│  priorité · durée · cumulatif · reverse · cancel · pause            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│  ActionExecutor · Units · Sensors · Training · Lovense · Chaster     │
│  PuryFi · Discord · Webhooks ...                                    │
└─────────────────────────────────────────────────────────────────────┘

Transversal : Telemetry Store (event log, flow_runs, node_runs, effect_ledger)
              WebSocket, metrics, replay, audit
```

### 3.2 Principes

1. **Le graphe compile, il n'exécute pas.** Un nœud est une fonction pure ; seuls les nœuds d'effet produisent des `EffectSpec`.
2. **Un événement est immuable.** Les effets sont des enregistrements séparés, avec leur propre statut.
3. **Les conditions sont pures.** Elles lisent une enveloppe et une `StateView` en lecture seule ; elles ne modifient rien.
4. **Les limites de sécurité sont hors des flows.** Une règle ne peut pas lever un cap.
5. **Tout est explicable.** Chaque run produit une trace : nœuds passés/échoués, valeurs résolues, effets clampés ou bloqués.
6. **Le volume est un risque.** Filtrage à l'ingress, échantillonnage, rétention, backpressure.
7. **Les effets sont idempotents quand c'est possible.** `effect.idempotency_key` + clés des plateformes.

### 3.3 Flux de bout en bout

1. Le connecteur reçoit un événement brut et construit un `EventEnvelope`.
2. L'ingress vérifie taille, auth, rate limit et scope.
3. La validation applique le JSON Schema du type d'événement.
4. Le dedupe rejette les doublons (`dedupe_key`, TTL).
5. La policy vérifie intégration, event, session, consentement, acteur bloqué.
6. L'enrich résout l'acteur et construit la `StateView` (units, queue, session, Lovense, capteurs).
7. Le Flow Engine sélectionne les flows par index de triggers, dans l'ordre de priorité.
8. Chaque flow est évalué en topologie : branches, guards, calculs, agrégats.
9. Les nœuds d'effet produisent des `EffectSpec` ; le planner applique modificateurs, cooldown, budgets, probabilité et Safety Governor.
10. Les effets acceptés deviennent des `QueueItem` ; les effets bloqués restent dans le ledger avec leur raison.
11. Le journal persiste `flow_runs`, `node_runs`, `effect_ledger` ; le WS diffuse.
12. La queue applique, reverse à l'expiration, et émet éventuellement des événements de feedback (`system.action.applied`, `system.action.reversed`).

---

## 4. Modèle de flow

### 4.1 `FlowSpec`

Un flow est un DAG typé, avec des triggers, des nœuds, des arêtes, des variables et des réglages.

```python
from __future__ import annotations

from datetime import datetime
from random import Random
from typing import Any, Literal

from pydantic import BaseModel, Field


class NodeSpec(BaseModel):
    id: str
    type: str
    config: dict[str, Any] = Field(default_factory=dict)
    position: dict[str, float] = Field(default_factory=dict)
    label: str | None = None


class EdgeSpec(BaseModel):
    id: str
    source: str
    source_port: str
    target: str
    target_port: str


class FlowSettings(BaseModel):
    priority: int = 0
    match_mode: Literal["all", "first"] = "all"
    stop_processing: bool = False
    silent: bool = False
    atomic: bool = False
    on_blocked: Literal["skip", "cancel_flow"] = "skip"
    max_effects: int = 32
    timeout_ms: int = 50
    tags: list[str] = Field(default_factory=list)


class FlowSpec(BaseModel):
    id: str
    name: str
    description: str | None = None
    schema_version: int = 1
    version: int = 1
    status: Literal["draft", "published", "archived"] = "draft"
    nodes: list[NodeSpec]
    edges: list[EdgeSpec]
    variables: dict[str, Any] = Field(default_factory=dict)
    settings: FlowSettings = Field(default_factory=FlowSettings)
    legacy_rule_id: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
```

### 4.2 Ports et types

Chaque nœud déclare des ports d'entrée et de sortie typés. C'est ce qui permet la validation, l'autocomplétion et l'explication.

| Type       | Usage                                         |
| ---------- | --------------------------------------------- |
| `event`    | enveloppe de l'événement courant              |
| `actor`    | acteur unifié (`ActorRef`)                    |
| `subject`  | session, lock, device, unit, channel          |
| `state`    | vue d'état en lecture seule                   |
| `number`   | entier ou flottant                            |
| `string`   | texte                                         |
| `boolean`  | booléen                                       |
| `duration` | secondes, avec formatage lisible              |
| `json`     | objet ou liste                                |
| `effect`   | effet déclaratif produit par un nœud d'action |
| `void`     | terminal                                      |

```python
class PortDef(BaseModel):
    id: str
    type: Literal[
        "event", "actor", "subject", "state", "number",
        "string", "boolean", "duration", "json", "effect", "void",
    ]
    required: bool = True
    multiple: bool = False


class NodeDef(BaseModel):
    type: str
    category: Literal["trigger", "data", "logic", "effect", "terminal"]
    label: str
    inputs: list[PortDef] = Field(default_factory=list)
    outputs: list[PortDef] = Field(default_factory=list)
    config_schema: dict[str, Any]  # JSON Schema
    risk: Literal["safe", "external", "physical", "financial"] = "safe"
    nsfw: bool = False
```

### 4.3 Catalogue de nœuds

| Catégorie    | Types                                                                                                                                                                                                                                                       | Rôle                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Trigger**  | `trigger.event`, `trigger.schedule`, `trigger.manual`, `trigger.webhook`                                                                                                                                                                                    | point d'entrée du flow          |
| **Data**     | `data.actor`, `data.state`, `data.variable`, `data.constant`, `data.json`, `data.template`, `data.math`, `data.compare`, `data.select`, `data.random`, `data.now`, `data.coalesce`                                                                          | lire et transformer des valeurs |
| **Logic**    | `logic.guard`, `logic.switch`, `logic.all`, `logic.any`, `logic.not`, `logic.cooldown`, `logic.throttle`, `logic.dedupe`, `logic.window`, `logic.sequence`, `logic.parallel`, `logic.delay`, `logic.repeat`, `logic.foreach`, `logic.subflow`, `logic.stop` | contrôle du flux                |
| **Effect**   | `effect.action` (générique) + presets `effect.level`, `effect.mult`, `effect.profile`, `effect.chaster_time`, `effect.lovense`, `effect.puryfi`, `effect.training`, `effect.discord`, `effect.webhook`, `effect.notify`, `effect.emit_event`                | produire des effets             |
| **Terminal** | `terminal.log`, `terminal.alert`                                                                                                                                                                                                                            | journaliser, alerter, terminer  |

`effect.action` est le nœud principal : il sélectionne une action du catalogue (`ActionDef`) et génère son formulaire depuis `payload_schema`. Les presets sont des raccourcis pour les actions les plus utilisées ; ils compilent tous vers `effect.action`.

### 4.4 Contexte d'exécution

Chaque nœud reçoit un `FlowContext` immuable :

```python
class FlowContext(BaseModel):
    event: EventEnvelope
    actor: ActorRef | None
    subject: SubjectRef | None
    state: StateView          # units, queue, session, lovense, sensors, connectors
    vars: dict[str, Any]
    secrets: SecretResolver   # références uniquement, jamais de valeur brute
    now: datetime
    random: Random            # seedé par run_id pour le replay
    run: RunInfo              # flow_id, flow_version, run_id, trigger_node_id
```

Aucun nœud ne reçoit `Store`, `ActionQueue` ou `ActionExecutor`. Un nœud qui a besoin d'une donnée d'état la lit dans `state` ; un nœud qui a besoin d'agir produit un effet.

### 4.5 Sémantique des triggers

- Un flow peut avoir **plusieurs triggers** (OR) : un trigger qui matche suffit à exécuter le flow.
- Le `match_mode` du flow contrôle l'exécution des **autres flows** compatibles : `all` = tous les flows compatibles s'exécutent, `first` = seul le premier (par priorité) s'exécute.
- L'index de triggers est construit à la publication : exact (`discord.message.created`), famille (`discord.message.*`), wildcard (`discord.*`).
- Ordre d'évaluation : priorité DESC, puis spécificité (exact > famille > wildcard), puis `created_at` ASC.
- `stop_processing: true` arrête l'évaluation des flows suivants pour cet événement.
- Les triggers `system.*` sont exclus par défaut des flows utilisateur.

### 4.6 Mode simple et mode Flow

| Mode           | Stockage                            | Usage                                                                 |
| -------------- | ----------------------------------- | --------------------------------------------------------------------- |
| **Simple**     | `trigger_rules` + `trigger_actions` | 90 % des règles : 1 événement, quelques filtres, une chaîne d'actions |
| **Flow**       | `flow_defs` + `flow_versions`       | conditions complexes, branches, agrégats, effets calculés             |
| **Conversion** | génère un `FlowSpec` linéaire       | « Ouvrir en Flow » ; retour possible si le graphe reste linéaire      |

Les deux modes compilent vers le même `CompiledFlow`. Une règle simple peut être représentée par un flow linéaire :

```
trigger.event → logic.guard (conditions) → effect.action × N
```

La conversion inverse n'est autorisée que si le graphe ne contient que des nœuds supportés par le formulaire et aucune branche. Sinon, le flow reste en mode Flow.

### 4.7 Exemple « Sereti est l'auteur → doubler l'action »

```
[trigger.event · discord.message.created]
        │ event
        ▼
[logic.guard · channel.nsfw == true]
        │ event
        ├──────────────────────────────┐
        ▼                              │
[data.actor]                           │
        │ actor                        │
        ▼                              │
[data.compare · actor.id == Sereti]    │
        │ boolean                      │
        ▼                              │
[data.select · true=2, false=1]        │
        │ number (amplifier)           │
        ▼                              ▼
[effect.action · LEVEL · U1 A+B · +5% · 30s]
```

Le nœud `effect.action` a un port `amplifier` (défaut `1`) et une config `amplifier_fields` (`value`, `duration`, `multiplier`…). Si Sereti est l'auteur, l'intensité et/ou la durée sont multipliées par 2, sans dupliquer le nœud d'action.

```json
{
  "id": "flow_sereti_double",
  "name": "Sereti auteur → intensité ×2",
  "schema_version": 1,
  "version": 3,
  "status": "published",
  "variables": {
    "base_intensity": 5,
    "base_duration": 30
  },
  "settings": {
    "priority": 10,
    "match_mode": "all",
    "stop_processing": false,
    "silent": false,
    "atomic": false,
    "on_blocked": "skip",
    "max_effects": 16,
    "timeout_ms": 50
  },
  "nodes": [
    {
      "id": "trg",
      "type": "trigger.event",
      "config": { "event": "discord.message.created" },
      "position": { "x": 0, "y": 80 }
    },
    {
      "id": "guard_nsfw",
      "type": "logic.guard",
      "config": { "expr": "event.payload.channel.nsfw == true" },
      "position": { "x": 260, "y": 80 }
    },
    {
      "id": "actor",
      "type": "data.actor",
      "config": {},
      "position": { "x": 520, "y": 80 }
    },
    {
      "id": "is_sereti",
      "type": "data.compare",
      "config": {
        "left": "actor.id",
        "op": "eq",
        "right": "actor:sereti"
      },
      "position": { "x": 780, "y": 80 }
    },
    {
      "id": "amp",
      "type": "data.select",
      "config": { "if_true": 2, "if_false": 1 },
      "position": { "x": 1040, "y": 80 }
    },
    {
      "id": "level",
      "type": "effect.action",
      "config": {
        "action_id": "LEVEL",
        "payload": {
          "units": "1",
          "channels": "AB",
          "value": "+{vars.base_intensity}"
        },
        "duration": "{vars.base_duration}",
        "amplifier_fields": ["value", "duration"]
      },
      "position": { "x": 1300, "y": 80 }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "trg",
      "source_port": "event",
      "target": "guard_nsfw",
      "target_port": "event"
    },
    {
      "id": "e2",
      "source": "guard_nsfw",
      "source_port": "event",
      "target": "actor",
      "target_port": "event"
    },
    {
      "id": "e3",
      "source": "actor",
      "source_port": "actor",
      "target": "is_sereti",
      "target_port": "actor"
    },
    {
      "id": "e4",
      "source": "is_sereti",
      "source_port": "boolean",
      "target": "amp",
      "target_port": "condition"
    },
    {
      "id": "e5",
      "source": "guard_nsfw",
      "source_port": "event",
      "target": "level",
      "target_port": "event"
    },
    {
      "id": "e6",
      "source": "amp",
      "source_port": "number",
      "target": "level",
      "target_port": "amplifier"
    }
  ]
}
```

> `actor:sereti` est une référence lisible vers `actors.id`. L'UI stocke l'identifiant stable ; le slug sert à l'affichage et à l'import/export. Une règle ne doit jamais dépendre du `display_name`, qui peut changer.

Aperçu dans l'éditeur :

```
Sereti   → LEVEL U1 A+B, +10 %, 60 s
Autre    → LEVEL U1 A+B, +5 %, 30 s
```

### 4.8 Duplicate, Repeat, Scale

Trois notions différentes, à nommer explicitement dans l'UI :

| Concept       | Moment    | Effet                                         | Exemple                                         |
| ------------- | --------- | --------------------------------------------- | ----------------------------------------------- |
| **Duplicate** | édition   | clone la définition d'un flow ou d'une action | « dupliquer cette règle »                       |
| **Repeat**    | exécution | crée N effets distincts                       | envoyer 2 messages, ajouter 2× du temps Chaster |
| **Scale**     | exécution | multiplie les champs numériques d'un effet    | intensité ×2, durée ×2, multiplicateur ×2       |

- `logic.repeat` prend un `count` (1–10) et expose `iteration` (0-based) aux nœuds en aval.
- `effect.action.amplifier` est un modificateur `scale` appliqué aux champs listés dans `amplifier_fields`.
- `Scale` ne doit jamais augmenter une valeur au-delà d'un cap : le Safety Governor clamp après le planner.
- Pour les actions discrètes, `Repeat` est plus naturel ; pour les actions continues, `Scale` est plus naturel. L'UI propose les deux avec un aperçu du plan.

### 4.9 Identité d'acteur

`actors` et `actor_identities` (déjà décrits dans la v2) sont un prérequis de la v3 :

```
actors
  id, slug, display_name, trust, is_blocked, tags, notes,
  first_seen_at, last_seen_at

actor_identities
  (platform, platform_id) → actor_id, display_name, metadata
```

Cela permet :

- de bloquer une personne sur toutes les plateformes ;
- de calculer `actor.trust` à partir de l'ancienneté, des rôles, des dons, des signalements ;
- de faire des règles cross-platform (« la même personne qui ping sur Discord et vote sur Chaster ») ;
- d'afficher une fiche acteur dans l'UI ;
- d'utiliser `actor.id` dans les conditions, jamais `author` en texte libre.

### 4.10 Subflows, variables et expressions

- **Subflows** : un flow réutilisable avec des entrées/sorties typées, appelé par `logic.subflow`. Pour le MVP, expansion inline avec détection de cycles ; plus tard, appel avec pile et version épinglée.
- **Variables de flow** : `vars.base_intensity`, `vars.trusted_actors`, `vars.severity`. Elles sont typées et validées à la publication.
- **Expressions** : syntaxe `{ expression }` dans les chaînes, et expressions complètes dans les guards/compare/math.
  - Fonctions autorisées : `clamp`, `min`, `max`, `round`, `abs`, `coalesce`, `random`, `random_int`, `choice`, `now`, `duration`.
  - Pas d'`eval`, pas d'accès attribut arbitraire : parse `ast`, walk avec une whitelist.
  - Compilation à la publication, pas à chaque événement.
  - Timeout d'évaluation (10 ms par nœud, 50 ms par flow).
  - Si un champ est un MagicNumber, on rend le template puis on parse la syntaxe MagicNumber.

### 4.11 Validation, versioning et permissions

**Validation à la publication** :

- ids uniques, edges valides, ports existants et compatibles ;
- pas de cycle ;
- entrées requises connectées ;
- config conforme au JSON Schema du nœud ;
- expressions compilables ;
- limites : `max_nodes`, `max_effects`, `max_repeat`, `max_depth` ;
- actions autorisées par le profil de consentement ;
- pas de `trigger.system.*` dans un flow utilisateur.

**Versioning** :

- `draft` : éditable, non exécutable en production.
- `published` : immuable ; chaque publication crée une ligne `flow_versions`.
- `archived` : conservé pour l'historique, non exécutable.
- Chaque `flow_run` référence `flow_id` + `flow_version` ; un replay utilise la même version.
- Diff entre versions et rollback depuis l'UI.

**Permissions** :

- `flows:read` : voir les flows et les runs.
- `flows:write` : créer/éditer un brouillon.
- `flows:publish` : publier, archiver, rollback.
- `telemetry:read` : traces complètes et replay.
- `flows:run` : lancer un dry-run.
- Les actions `physical` et `financial` sont réservées aux admins, même si un flow est partagé.

---

## 5. Compilation et exécution

### 5.1 Pipeline de compilation

```
FlowSpec
  → validation de schéma
  → validation du graphe (ids, ports, types, cycles)
  → extraction des triggers
  → tri topologique
  → compilation des expressions
  → constant folding (optionnel)
  → CompiledFlow (cache mémoire)
  → publication (flow_versions + flow_trigger_index)
```

`CompiledFlow` contient :

- la liste ordonnée des nœuds et leurs dépendances ;
- les ports résolus (source → cible) ;
- les triggers indexés ;
- les expressions compilées ;
- les métadonnées de risque (safe/external/physical/financial).

Le compilateur ne génère pas de code Python à la volée. Il produit un plan interprétable et sérialisable, ce qui permet de le stocker, de le diffuser et de le rejouer.

### 5.2 Index de triggers et cache

- `flow_trigger_index(pattern, flow_id, priority)` est reconstruit à chaque publication.
- Le Flow Engine garde un cache en mémoire des `CompiledFlow` publiés.
- Invalidation sur création/édition/publication/suppression ; pas de requête DB par événement.
- Les patterns sont résolus dans l'ordre : exact, famille, wildcard. Un index par préfixe évite de scanner tous les flows.

### 5.3 Évaluation

- Un `FlowContext` est créé par flow et par événement.
- Les nœuds sont évalués en ordre topologique, mais **seulement les branches atteignables** (lazy evaluation).
- `logic.guard` qui échoue arrête la branche, pas le flow entier ; le run est marqué `skipped` avec la raison.
- `logic.switch` n'évalue que le cas sélectionné.
- `logic.sequence` et `logic.parallel` contrôlent l'ordre des effets ; `sequence` ajoute une dépendance, `parallel` n'en ajoute pas.
- `logic.repeat` expose `iteration` et un `iteration_key` stable pour l'idempotence.
- `logic.foreach` est borné (`max_iterations`, défaut 32) et interdit sur les collections non finies.
- Les effets sont collectés dans l'ordre de déclaration ; le planner décide ensuite de l'ordre final dans la queue.

### 5.4 Erreurs, timeouts et dead-letter

- Une erreur de nœud ne crashe jamais le bus : le run est marqué `error`, l'erreur est tracée, les autres flows continuent.
- Timeout par nœud (10 ms) et par flow (50 ms) ; au-delà, le run est `timeout`.
- Les erreurs de template, de type ou de schéma sont des erreurs de compilation, pas d'exécution.
- Les événements invalides et les runs en erreur vont dans une **dead-letter queue** consultable et rejouable.
- Un flow `silent: true` est un dry-run permanent : il trace mais n'enqueue rien.

### 5.5 Plan d'effets et atomicité

- Tous les effets d'un flow sont planifiés **avant** d'être enqueued.
- `atomic: false` (défaut) : un effet bloqué n'annule pas les autres ; le run est `partial`.
- `atomic: true` : si un effet est bloqué, tout le plan est annulé ; le run est `blocked`.
- `on_blocked: "cancel_flow"` est un alias d'atomicité pour les flows critiques.
- L'ordre des effets est conservé dans le plan ; la queue peut réordonner selon la priorité et les dépendances.
- Les effets d'un même flow partagent `flow_run_id`, ce qui permet de les annuler ensemble (`cancel_by_run`).

### 5.6 Concurrence et ordonnancement

- Le Flow Engine tourne dans le loop asyncio, mais les évaluations pures ne bloquent pas : elles sont rapides et bornées.
- Un worker pool borné exécute les flows ; le nombre de workers est configurable.
- La queue hardware reste le point de sérialisation par unité ; le planner ne touche jamais au hardware.
- Les événements de feedback (`system.action.applied`) sont traités comme des événements normaux, avec `causation_id` et `chain_depth`.
- Cap dur de profondeur de chaîne (8) et détection de cycles par `correlation_id`.

---

## 6. Effect Planner et Safety Governor

### 6.1 `EffectSpec`

```python
class EffectSpec(BaseModel):
    kind: str                       # action id du catalogue
    target: dict[str, Any] = {}
    params: dict[str, Any] = {}
    duration: int = -1
    cumulative: bool = False
    delay_seconds: int = 0
    when: dict[str, Any] | None = None
    clamp: dict[str, Any] | None = None
    source_node_id: str
    iteration: int = 0
    idempotency_key: str
```

Un effet est **déclaratif** : il décrit ce qui devrait se passer, pas comment l'exécuter. Le planner le transforme en `PlannedEffect`, puis en `QueueItem`.

### 6.2 Modificateurs

| Modificateur  | Effet                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| `scale`       | multiplie des champs numériques (`value`, `duration`, `multiplier`) par un facteur |
| `repeat`      | duplique l'effet N fois, avec `iteration`                                          |
| `delay`       | décale `not_before`                                                                |
| `clamp`       | borne locale, avant le governor                                                    |
| `probability` | exécute avec une probabilité donnée                                                |
| `silent`      | trace sans exécuter                                                                |
| `when`        | condition réévaluée au moment de l'application                                     |

Les modificateurs sont appliqués dans cet ordre : `when` → `probability` → `scale` → `clamp` → `repeat` → `delay`. Le Safety Governor passe après tous les modificateurs.

### 6.3 Planner

```
EffectSpec[]
  → résolution des templates et des MagicNumbers
  → when / probability
  → scale / clamp
  → repeat / delay
  → cooldown (rule, actor, group, subject)
  → dedupe (event, effect, idempotency)
  → budgets (global, acteur, source, flow)
  → Safety Governor (consentement, caps, actions autorisées)
  → approvals (si requis)
  → effect_ledger
  → QueueItem[]
```

Chaque étape peut produire :

- `accepted` : l'effet continue ;
- `clamped` : l'effet continue avec des valeurs réduites ;
- `blocked` : l'effet est rejeté avec une raison ;
- `deferred` : l'effet attend une approbation ou une échéance.

### 6.4 Safety Governor

Le governor est le dernier filtre avant la queue :

- clamp des niveaux, durées, temps ajouté ;
- rejet si le profil de consentement l'interdit ;
- rejet si le budget global/acteur/source est épuisé ;
- rejet si l'action n'est pas autorisée pour la source ;
- rejet si l'acteur est bloqué ;
- log `action.clamped` / `action.blocked` avec la raison.

Règles :

- un clamp ne doit jamais augmenter une valeur, seulement la réduire ;
- les limites dures ne sont pas éditables par les flows ni par les connecteurs ;
- le governor est testé unitairement (c'est du code de sécurité).

### 6.5 Approbations

Un effet `risk: physical` ou `financial`, ou une source non fiable, peut nécessiter une approbation :

- `ApprovalRequest` créée par le planner ;
- notification via UI, Discord, Chaster ou Telegram ;
- l'effet reste `deferred` jusqu'à `approve` / `deny` / expiration ;
- timeout par défaut : 5 minutes ;
- refus = effet `blocked`, avec `resolved_by` et raison.

C'est particulièrement utile pour les événements d'audience (tips, votes, raids) et les actions à fort impact.

---

## 7. Télémétrie

### 7.1 Modèle

| Table                                  | Rôle                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `triggered_events` (étendu)            | journal canonique : type, source, acteur, payload redacted, corrélation, causation, dedupe, session |
| `flow_runs`                            | une exécution de flow : flow/version, statut, latence, trigger, erreur, trace                       |
| `node_runs`                            | trace nœud par nœud : statut, entrée/sortie, valeur résolue, raison, durée                          |
| `effect_ledger`                        | effet planifié/appliqué/reversé : action, cible, params avant/après, clamp, blocage, queue item     |
| `approvals`                            | demandes d'approbation et décisions                                                                 |
| `budget_ledger`                        | consommation par flow, acteur, source, session                                                      |
| `budget_counters`                      | compteurs agrégés pour les lectures rapides                                                         |
| `connector_state` / `connector_health` | curseurs et santé (voir v2)                                                                         |

### 7.2 Niveaux de trace

| Niveau      | Quand                        | Contenu                                      |
| ----------- | ---------------------------- | -------------------------------------------- |
| **summary** | toujours                     | événement, flow run, statut, ledger d'effets |
| **full**    | runs `matched` ou `error`    | tous les `node_runs`, valeurs résolues       |
| **sampled** | runs `skipped` à fort volume | 1 run sur N, avec raison                     |
| **off**     | événements bruyants          | compteurs seulement                          |

Le niveau est configurable par flow et par type d'événement. Les valeurs de nœuds sont stockées en aperçu + digest, pas en payload complet.

### 7.3 Les quatre questions

- **Quoi ?** `triggered_events` + `effect_ledger`.
- **Pourquoi ?** `flow_runs` + `node_runs` : condition passée/échouée, valeur réelle, raison du skip.
- **Qu'est-ce que ça a changé ?** `effect_ledger` + statut des `QueueItem` + ack hardware.
- **Combien ?** `budget_ledger` + métriques : actions/min, delta intensité/heure, temps ajouté/heure, taux d'erreur.

### 7.4 UI

**Event Inspector** :

```
Événement reçu (Discord, #punitions, auteur Sereti)
  └─ Flow "Sereti auteur → ×2" v3 : MATCHED (4 ms)
       ├─ guard_nsfw      ✅
       ├─ actor           ✅ act_123
       ├─ is_sereti       ✅ true
       ├─ amp             ✅ 2
       └─ LEVEL           → effet planifié
            └─ Queue item #q_456 : APPLIED (12 ms)
                 └─ clamp : 10 % → 10 % (aucun)
```

**Flow Analytics** : fires, taux de match, latence p50/p95, top acteurs, top sources, erreurs, cooldowns atteints, budget consommé.

**Causality Graph** : événement racine → flows → effets → événements de feedback. On voit les chaînes et les boucles.

**Replay** : sélectionner un événement, rejouer en dry-run avec le snapshot d'état et le seed aléatoire stockés. Le replay live crée un nouvel événement avec `replay_of`.

**Alerts** : connecteur offline, pic d'erreurs, budget épuisé, action bloquée, dead-letter.

### 7.5 Rétention et privacy

- Écriture batchée (250 ms / 100 événements), connexion dédiée, WAL activé.
- Rétention par type : chat 7–30 jours, traces 7 jours, ledger 1 an, agrégats indéfinis.
- Redaction des clés sensibles avant stockage et broadcast.
- Pas de contenu de message par défaut : hash + catégories.
- Suppression par session sur demande.
- Export JSON/CSV par session.

---

## 8. API et WebSocket

### 8.1 REST

| Endpoint                                      | Rôle                          |
| --------------------------------------------- | ----------------------------- |
| `GET /api/flows`                              | liste des flows               |
| `POST /api/flows`                             | créer un brouillon            |
| `GET /api/flows/{id}`                         | flow + version courante       |
| `PUT /api/flows/{id}`                         | mettre à jour un brouillon    |
| `DELETE /api/flows/{id}`                      | archiver/supprimer            |
| `POST /api/flows/{id}/validate`               | validation détaillée          |
| `POST /api/flows/{id}/publish`                | publier une version           |
| `POST /api/flows/{id}/duplicate`              | cloner un flow                |
| `GET /api/flows/{id}/versions`                | historique                    |
| `GET /api/flows/{id}/versions/{v}/diff`       | diff                          |
| `POST /api/flows/{id}/simulate`               | dry-run avec événement + état |
| `POST /api/flows/{id}/replay`                 | replay d'un run               |
| `GET /api/flows/{id}/runs`                    | runs du flow                  |
| `GET /api/runs/{id}`                          | trace complète                |
| `GET /api/events/{id}/trace`                  | trace d'un événement          |
| `GET /api/events/runs`                        | runs serveur récents          |
| `GET /api/events/runs/{id}`                   | trace complète d'un run       |
| `POST /api/events/{id}/replay`                | replay dry-run                |
| `GET /api/telemetry/metrics`                  | métriques agrégées            |
| `GET /api/telemetry/dead-letter`              | dead-letter                   |
| `POST /api/telemetry/dead-letter/{id}/replay` | rejouer                       |

Exemple de simulation (phase 0, aucun effet de bord) :

```http
POST /api/events/simulate
Authorization: Bearer <token>
Content-Type: application/json

{
  "event_type": "sensor_sound_alarm",
  "event_data": { "sensor": "sound1" },
  "origin": "manual"
}
```

La réponse contient `event` (enveloppe), `matched`, `skipped_reason`, `rules`, `queue_items`, `counts` et `warnings`. `GET /api/events/v3/status` expose les flags `enabled`, `shadow_mode` et `max_workers`.

Le body accepte aussi `draft_rule` (`{ conditions, condition_mode, actions }`) : le Composer l'utilise pour un dry-run sans persister la règle.

### 8.2 WebSocket

- `flows:load` / `flows:loaded`
- `flows:update` / `flows:updated`
- `flows:validate` / `flows:validation`
- `flows:publish` / `flows:published`
- `flows:simulate` / `flows:simulation`
- `flows:run_started` / `flows:run_finished`
- `flows:node_run` (admin)
- `events:trace`
- `telemetry:metrics`
- `telemetry:alert`

Les commandes de création/édition suivent le pattern existant des `trigger_rules:*` : un handler par commande, validation, réponse `status`, mise à jour Redux.

### 8.3 Codegen

Après modification du schéma WS ou des enums `Role` / `Permission` :

```bash
pnpm codegen:ws
pnpm --filter front typecheck
```

Ne jamais éditer `*.generated.ts` à la main.

---

## 9. Frontend

### 9.1 Routes

| Route                       | Contenu                         |
| --------------------------- | ------------------------------- |
| `/app/events/flows`         | liste des flows (cartes)        |
| `/app/events/flows/new`     | créer un flow                   |
| `/app/events/flows/:id`     | éditeur Composer                |
| `/app/events/runs`          | liste des runs                  |
| `/app/events/runs/:runId`   | trace complète                  |
| `/app/events/telemetry`     | métriques, alertes, dead-letter |
| `/app/events/trigger-rules` | mode simple existant            |

### 9.2 Éditeur

- **React Flow** (`@xyflow/react`) pour le canvas : custom nodes, minimap, snap, groupes, inspectors.
- Palette à gauche, canvas au centre, inspecteur à droite, console de run en bas.
- Chaque port a une couleur par type ; au survol d'un run, les valeurs réelles s'affichent sur les câbles.
- Bouton « Validate », « Dry run », « Publish ».
- Panneau « Test » : événement d'exemple, snapshot d'état, résultat du plan.
- Panneau « Diff » entre versions.
- Groupes/frames et commentaires pour les gros flows.
- Vue mobile en lecture seule.

### 9.3 Inspecteur et analytics

- Timeline de run avec statut par nœud.
- Valeurs résolues, raison du skip, clamp.
- Graphe de causalité.
- Métriques avec `recharts` (déjà présent).
- Filtres : flow, acteur, source, statut, date.
- Export JSON/CSV.

### 9.4 State

- `flowsSlice` : liste, flow courant, version, brouillon.
- `runsSlice` : runs, trace courante, filtres.
- `telemetrySlice` : métriques, alertes, dead-letter.
- Les composants du flow editor restent dans `apps/front/src/components/common/events/flows/` ; ils ne sont pas assez génériques pour `packages/ui`.

---

## 10. Modèle de données

Les migrations sont additives et idempotentes. SQLite ne supporte pas `ADD COLUMN IF NOT EXISTS` : chaque `ALTER` doit être exécuté après un `PRAGMA table_info(...)`.

### 10.1 Flows

```sql
CREATE TABLE IF NOT EXISTS flow_defs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    current_version INTEGER NOT NULL DEFAULT 1,
    graph JSON NOT NULL,
    settings JSON NOT NULL DEFAULT '{}',
    legacy_rule_id TEXT,
    created_by TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flow_versions (
    flow_id TEXT NOT NULL REFERENCES flow_defs(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    graph JSON NOT NULL,
    compiled JSON,
    published_at DATETIME,
    published_by TEXT,
    PRIMARY KEY (flow_id, version)
);

CREATE TABLE IF NOT EXISTS flow_trigger_index (
    flow_id TEXT NOT NULL REFERENCES flow_defs(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (flow_id, pattern)
);

CREATE INDEX IF NOT EXISTS ix_flow_trigger_pattern
    ON flow_trigger_index (pattern, priority DESC);
```

### 10.2 Runs et traces

```sql
CREATE TABLE IF NOT EXISTS flow_runs (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    flow_id TEXT NOT NULL,
    flow_version INTEGER NOT NULL,
    status TEXT NOT NULL,
    trigger_node_id TEXT,
    correlation_id TEXT,
    causation_id TEXT,
    started_at DATETIME NOT NULL,
    finished_at DATETIME,
    latency_ms INTEGER,
    error TEXT,
    trace JSON
);

CREATE INDEX IF NOT EXISTS ix_flow_runs_event
    ON flow_runs (event_id);
CREATE INDEX IF NOT EXISTS ix_flow_runs_flow
    ON flow_runs (flow_id, started_at);

CREATE TABLE IF NOT EXISTS node_runs (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES flow_runs(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    node_type TEXT NOT NULL,
    status TEXT NOT NULL,
    iteration INTEGER NOT NULL DEFAULT 0,
    started_at DATETIME,
    duration_ms INTEGER,
    input_preview JSON,
    output_preview JSON,
    reason TEXT,
    error TEXT
);

CREATE INDEX IF NOT EXISTS ix_node_runs_run
    ON node_runs (run_id);
```

### 10.3 Effets et approbations

```sql
CREATE TABLE IF NOT EXISTS effect_ledger (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES flow_runs(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    effect_kind TEXT NOT NULL,
    target JSON,
    params_before JSON,
    params_after JSON,
    modifiers JSON,
    clamp JSON,
    blocked_reason TEXT,
    status TEXT NOT NULL,
    queue_item_id TEXT,
    idempotency_key TEXT,
    created_at DATETIME NOT NULL,
    applied_at DATETIME,
    reversed_at DATETIME
);

CREATE INDEX IF NOT EXISTS ix_effect_ledger_run
    ON effect_ledger (run_id);
CREATE INDEX IF NOT EXISTS ix_effect_ledger_status
    ON effect_ledger (status, created_at);

CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    run_id TEXT,
    effect_id TEXT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at DATETIME NOT NULL,
    resolved_at DATETIME,
    resolved_by TEXT,
    payload JSON,
    expires_at DATETIME
);

CREATE INDEX IF NOT EXISTS ix_approvals_status
    ON approvals (status, requested_at);
```

### 10.4 Budgets

```sql
CREATE TABLE IF NOT EXISTS budget_ledger (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    flow_id TEXT,
    actor_id TEXT,
    source TEXT,
    metric TEXT NOT NULL,
    amount REAL NOT NULL,
    recorded_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_budget_ledger_scope
    ON budget_ledger (session_id, metric, recorded_at);

CREATE TABLE IF NOT EXISTS budget_counters (
    scope TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    window_start DATETIME NOT NULL,
    value REAL NOT NULL,
    PRIMARY KEY (scope, scope_id, metric, window_start)
);
```

### 10.5 Extensions de tables existantes

```sql
-- triggered_events (ajouter seulement si la colonne manque)
ALTER TABLE triggered_events ADD COLUMN source TEXT;
ALTER TABLE triggered_events ADD COLUMN actor_id TEXT;
ALTER TABLE triggered_events ADD COLUMN correlation_id TEXT;
ALTER TABLE triggered_events ADD COLUMN causation_id TEXT;
ALTER TABLE triggered_events ADD COLUMN dedupe_key TEXT;
ALTER TABLE triggered_events ADD COLUMN severity TEXT DEFAULT 'info';
ALTER TABLE triggered_events ADD COLUMN tags JSON;
ALTER TABLE triggered_events ADD COLUMN version INTEGER DEFAULT 1;

-- trigger_rules
ALTER TABLE trigger_rules ADD COLUMN flow_id TEXT;
ALTER TABLE trigger_rules ADD COLUMN conditions JSON;
ALTER TABLE trigger_rules ADD COLUMN condition_mode TEXT DEFAULT 'all';
ALTER TABLE trigger_rules ADD COLUMN cooldown_seconds INTEGER DEFAULT 0;
ALTER TABLE trigger_rules ADD COLUMN window_spec JSON;
ALTER TABLE trigger_rules ADD COLUMN cooldown_spec JSON;
ALTER TABLE trigger_rules ADD COLUMN budget_spec JSON;
ALTER TABLE trigger_rules ADD COLUMN probability REAL DEFAULT 1.0;
ALTER TABLE trigger_rules ADD COLUMN match_mode TEXT DEFAULT 'all';
ALTER TABLE trigger_rules ADD COLUMN stop_processing BOOLEAN DEFAULT 0;
ALTER TABLE trigger_rules ADD COLUMN silent BOOLEAN DEFAULT 0;
ALTER TABLE trigger_rules ADD COLUMN schema_version INTEGER DEFAULT 1;

-- trigger_actions
ALTER TABLE trigger_actions ADD COLUMN delay_seconds INTEGER DEFAULT 0;
ALTER TABLE trigger_actions ADD COLUMN condition JSON;
ALTER TABLE trigger_actions ADD COLUMN clamp_spec JSON;
ALTER TABLE trigger_actions ADD COLUMN modifiers JSON;
```

Index recommandés :

```sql
CREATE INDEX IF NOT EXISTS ix_triggered_events_type_time
    ON triggered_events (event_type, triggered_at);
CREATE INDEX IF NOT EXISTS ix_triggered_events_session_time
    ON triggered_events (session_id, triggered_at);
CREATE INDEX IF NOT EXISTS ix_triggered_events_actor_time
    ON triggered_events (actor_id, triggered_at);
CREATE INDEX IF NOT EXISTS ix_triggered_events_correlation
    ON triggered_events (correlation_id);
```

### 10.6 Rétention

- Purge planifiée par type, avec archive JSONL optionnelle.
- `flow_runs` et `node_runs` : 7 jours par défaut.
- `effect_ledger` : 1 an.
- Agrégats : indéfinis.
- Les `triggered_events` de chat/NSFW : 7–30 jours configurables.
- Les secrets ne sont jamais stockés dans les traces.

---

## 11. Migration et compatibilité

### 11.1 Feature flag

`config.env` :

```dotenv
EVENTS_V3_ENABLED=false
EVENTS_V3_SHADOW_MODE=true
EVENTS_V3_TELEMETRY=false
EVENTS_V3_MAX_WORKERS=4
```

- `EVENTS_V3_ENABLED=false` : le dispatcher utilise uniquement les règles legacy.
- `EVENTS_V3_SHADOW_MODE=true` : les flows sont évalués, les runs sont tracés, mais aucun effet n'est enqueued. On compare avec les règles legacy.
- `EVENTS_V3_ENABLED=true` : les flows publiés sont exécutés ; les règles legacy non converties continuent de fonctionner.
- `EVENTS_V3_TELEMETRY=true` : chaque évaluation de règle écrit un `flow_run`, ses `node_runs` et son `effect_ledger`.

### 11.2 Migration des règles legacy

1. Créer les tables v3 (additif).
2. Adapter `EventDispatcher.dispatch` pour construire un `EventEnvelope` et appeler le Flow Engine.
3. Importer les règles legacy à la demande (`POST /api/flows/import-legacy`) ou au premier démarrage, avec `legacy_rule_id`.
4. Marquer `trigger_rules.flow_id` pour les règles converties ; le dispatcher ne les exécute plus en legacy.
5. Laisser les règles non converties en legacy jusqu'à validation.
6. Une fois les flows validés, passer `EVENTS_V3_ENABLED=true`.

L'import legacy produit un flow linéaire :

```
trigger.event(event_type)
  → logic.guard(conditions legacy)
  → effect.action × N (payload, duration, cumulative, sort_order)
```

Les `priority`, `enabled`, `labels` et `event_links` sont conservés. Les actions désactivées restent désactivées.

### 11.3 Enums et catalogue

- `ActionType` et `TriggerableEvent` restent des valeurs persistées ; on ne les renomme pas.
- Les nouveaux ids viennent du catalogue `IntegrationRegistry` ; les anciens restent des alias.
- À terme, les enums hardcodés peuvent être générés depuis le catalogue, mais c'est une migration séparée.
- Les `EventDef` gagnent `json_schema`, `aliases`, `nsfw`, `retention_days`, `dedupe_key_path`, `rate_limit`.
- Les `ActionDef` gagnent `params_schema`, `risk`, `secret_fields` (déjà là), `capabilities`.

### 11.4 Rollback

- Désactiver `EVENTS_V3_ENABLED` : les flows restent en base, les règles legacy reprennent.
- Les runs et ledgers restent consultables.
- Aucune migration destructive : les colonnes ajoutées sont nullables ou avec défaut.
- `ensure_schema()` doit être testé deux fois de suite (base neuve + base ancienne).

### 11.5 Tests

- pytest sur `compiler.py`, `operators.py`, `templating.py`, `planner.py`, `safety.py`.
- Golden tests : `event JSON + flow JSON → effets attendus`.
- Tests de non-régression sur les alias legacy.
- Tests de migration `ensure_schema()` (base neuve + base ancienne).
- Tests de charge : 1 000 events/s en mémoire, mesure du temps de matching.
- Tests du mode shadow : mêmes effets que les règles legacy sur un corpus d'événements.

---

## 12. Roadmap moteur

> Les intégrations ne figurent pas ici. Leur catalogue, leurs priorités et leurs risques sont dans [events-v3-integrations.md](events-v3-integrations.md).

| Phase                  | Contenu                                                                                                                                                                                                                                                               | Dépendances | Critère de sortie                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| **0. Socle**           | `EventEnvelope`, `actors`/`actor_identities`, tables `flow_*`, `effect_ledger`, `POST /api/events/simulate`, feature flag, mode shadow                                                                                                                                | —           | un événement legacy produit le même plan en shadow qu'en legacy                      |
| **1. Flow MVP**        | `FlowSpec`, compilateur, cache, index de triggers, nœuds `trigger.event`, `logic.guard`, `data.actor`, `data.compare`, `data.select`, `logic.repeat`, `effect.action` + `amplifier` + presets LEVEL/MULT/CHASTER_TIME_UPDATE/LOVENSE_SET, éditeur React Flow, dry-run | 0           | le flow « Sereti → ×2 » est publiable, testable et rejouable                         |
| **2. Télémétrie**      | Event Inspector, Flow Analytics, Causality Graph, replay, métriques, dead-letter, sampling/rétention                                                                                                                                                                  | 0, 1        | chaque effet est explicable de l'événement jusqu'au hardware                         |
| **3. Flows avancés**   | fenêtres/agrégats, cooldowns, budgets, approbations, subflows, diff de versions, atomicité                                                                                                                                                                            | 1, 2        | une règle « 10 réactions en 5 min » et une règle « max 3/heure/acteur » fonctionnent |
| **4. SDK connecteurs** | manifest, transports, PES Link, pairing, santé, privacy modes, sandbox                                                                                                                                                                                                | 0           | un connecteur de test peut émettre un événement et recevoir une action               |
| **5. Durcissement**    | tests de charge, revue sécurité, docs, migration legacy complète, observabilité                                                                                                                                                                                       | 1–4         | `EVENTS_V3_ENABLED=true` par défaut, rollback testé                                  |

> Phase 1 livrée dans la direction **F + G** : conditions, amplificateurs, preview de brouillon et drawer de flow. Le compilateur `FlowSpec` existe désormais et alimente un canvas de lecture seule ; l'édition graphique drag-and-drop reste reportée.
>
> Phases 2 à 4 livrées : télémétrie/runs, fenêtres/cooldowns/budgets/approbations, modificateurs `clamp`/`repeat`/`delay`/`probability`, webhook générique entrant et sortant, manifestes de connecteurs.

### 12.1 MVP concret

Le premier livrable que je validerais :

1. un flow `discord.message.created` → guard `nsfw` → acteur `Sereti` → amplifier `2` → `LEVEL` ;
2. un dry-run qui affiche `+10 % / 60 s` pour Sereti et `+5 % / 30 s` pour les autres ;
3. une trace complète dans l'Event Inspector ;
4. un replay qui produit le même plan ;
5. un test golden qui échoue si le plan change.

Si ce cas fonctionne de bout en bout, l'architecture est bonne.

---

## 13. Risques

| Risque                                  | Impact                    | Mitigation                                                             |
| --------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| Complexité du graphe pour l'utilisateur | Faible adoption           | mode simple conservé, templates, conversion, groupes                   |
| Volume de télémétrie                    | SQLite saturée            | batch, sampling, rollups, rétention, connexion dédiée                  |
| Migration legacy incomplète             | règles qui ne tirent plus | mode shadow, import à la demande, feature flag, tests golden           |
| Performance du matching                 | latence                   | index de triggers, cache compilé, pas de DB par événement              |
| Contournement du Safety Governor        | risque physique           | governor hors flows, limites dures, tests dédiés, revue sécurité       |
| Expressions dangereuses                 | exécution arbitraire      | AST whitelist, timeout, pas d'`eval`, compilation à la publication     |
| Boucles d'événements                    | tempête d'actions         | `causation_id`, `chain_depth`, `system.*`, cap 8                       |
| Fuite de données intimes                | vie privée                | privacy by default, redaction, rétention, chiffrement optionnel        |
| ToS des plateformes                     | bannissement              | bot officiel prioritaire, extensions opt-in, documentation des risques |
| Windows                                 | chemins/Bluetooth         | tests sur Windows, pas d'API Linux-only                                |

---

## 14. Décisions ouvertes

1. **Graphe primaire ou mode avancé ?** Recommandation : mode avancé, formulaire simple conservé.
2. **Un flow par règle ou flows multi-triggers ?** Recommandation : multi-triggers par flow, mais index séparé par trigger.
3. **Atomicité par défaut ?** Recommandation : `atomic: false` (partial), `atomic: true` pour les flows critiques.
4. **Permissions granulaires ?** Recommandation : `flows:read/write/publish`, `telemetry:read`, `flows:run`.
5. **Rétention par défaut ?** Recommandation : traces 7 j, ledger 1 an, chat 7–30 j.
6. **Subflows : inline ou call stack ?** Recommandation : inline au MVP, call stack ensuite.
7. **Support de `EMIT_EVENT` dans les flows ?** Recommandation : oui, mais avec cap de profondeur et exclusion `system.*`.
8. **Multi-utilisateur ?** Recommandation : hors scope v3, mais le modèle `actors` le prépare.

---

## 15. Annexes

### A. Glossaire

| Terme           | Définition                                                         |
| --------------- | ------------------------------------------------------------------ |
| **Flow**        | DAG de nœuds qui transforme un événement en effets                 |
| **Node**        | fonction pure avec des ports typés                                 |
| **Port**        | entrée/sortie typée d'un nœud                                      |
| **Effect**      | action déclarative produite par un nœud                            |
| **Planner**     | composant qui applique modificateurs, budgets et safety aux effets |
| **Run**         | exécution d'un flow pour un événement                              |
| **Trace**       | ensemble des `node_runs` d'un run                                  |
| **Ledger**      | journal des effets planifiés/appliqués/reversés                    |
| **Shadow mode** | évaluation sans exécution, pour comparer avec le legacy            |
| **Amplifier**   | modificateur `scale` appliqué aux champs d'un effet                |

### B. Exemple de définition de nœud

```python
NODE_EFFECT_ACTION = NodeDef(
    type="effect.action",
    category="effect",
    label="Action",
    inputs=[
        PortDef(id="event", type="event"),
        PortDef(id="amplifier", type="number", required=False),
    ],
    outputs=[PortDef(id="effect", type="effect")],
    config_schema={
        "type": "object",
        "required": ["action_id"],
        "properties": {
            "action_id": {"type": "string"},
            "payload": {"type": "object"},
            "duration": {"type": "integer", "default": -1},
            "cumulative": {"type": "boolean", "default": False},
            "amplifier_fields": {
                "type": "array",
                "items": {"enum": ["value", "duration", "multiplier"]},
            },
        },
    },
    risk="physical",
)
```

### C. Checklist de publication

- [ ] Le flow est en `draft` et validé.
- [ ] Les triggers sont indexés.
- [ ] Les expressions sont compilées.
- [ ] Les actions sont autorisées par le profil de consentement.
- [ ] Les caps et budgets sont définis.
- [ ] Un dry-run a été exécuté avec un événement réel.
- [ ] La trace est lisible.
- [ ] Le replay produit le même plan.
- [ ] La version est publiée et tracée.
- [ ] Le rollback est testé.

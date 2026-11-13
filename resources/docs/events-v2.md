# Events v2 — Architecture cible du système d'événements

> Statut : proposition d'architecture, non implémentée.
> Portée : `apps/app/src/events/`, `apps/app/src/integrations/`, schéma WS, UI Events.
> Documents liés : [Events.md](Events.md), [integrations.md](integrations.md), [realtime-architecture.md](realtime-architecture.md), [events-trigger-rules-audit.md](events-trigger-rules-audit.md).
> Code : [events-v2-code.md](events-v2-code.md) — modèles Python, DDL SQL, exemples JSON/YAML, protocole PES Link.
> Suite : [events-v3-flows.md](events-v3-flows.md) — PES Flow, télémétrie et migration ; [events-v3-integrations.md](events-v3-integrations.md) — catalogue d'intégrations séparé de la roadmap moteur.

---

## Table des matières

1. [Résumé exécutif](#1-résumé-exécutif)
2. [État des lieux](#2-état-des-lieux)
3. [Architecture cible](#3-architecture-cible)
4. [EventEnvelope](#4-eventenvelope)
5. [Pipeline d'ingestion](#5-pipeline-dingestion)
6. [Rule Engine v2](#6-rule-engine-v2)
7. [SDK de connecteurs](#7-sdk-de-connecteurs)
8. [Discord : bot officiel + Vencord](#8-discord--bot-officiel--vencord)
9. [Chaster](#9-chaster)
10. [Autres intégrations prioritaires](#10-autres-intégrations-prioritaires)
11. [Features NSFW](#11-features-nsfw)
12. [Sécurité, consentement, vie privée](#12-sécurité-consentement-vie-privée)
13. [Modèle de données](#13-modèle-de-données)
14. [API et WebSocket](#14-api-et-websocket)
15. [Frontend](#15-frontend)
16. [Plan d'implémentation](#16-plan-dimplémentation)
17. [Décisions ouvertes](#17-décisions-ouvertes)
18. [Annexes](#18-annexes)

---

## 1. Résumé exécutif

Le système actuel fonctionne : un dispatcher unique, des règles liées à des types d'événements, une queue d'actions avec reverse, un catalogue d'intégrations et un journal d'événements. Mais il est trop plat pour tout ce qui est prévu : messages Chaster, Discord via Vencord (pings, messages, réactions), X, Reddit, et d'autres réseaux.

La cible est un **Event Bus** en sept étages :

```
Connecteurs → Ingress → Validation → Dedupe → Policy/Consent → Enrich
                                                                  ↓
Queue ← Safety Governor ← Effects ← Fenêtres/Aggrégats ← Rule Match
   ↓
Hardware / intégrations

Transversal : Event Log, Rule Runs, Metrics, WebSocket, Replay
```

Les quatre changements structurants :

1. **Une enveloppe canonique** (`EventEnvelope`) avec acteur, sujet, corrélation, causation et clé de déduplication.
2. **Un moteur de règles v2** : conditions AND/OR/NOT, wildcards, agrégations temporelles, cooldowns, budgets, probabilité, templating des payloads.
3. **Un SDK de connecteurs** : transports réutilisables (webhook, WS server/client, polling, RSS, IMAP, MQTT) et connecteurs déclaratifs sans code.
4. **Un Safety Governor** : les limites de consentement sont appliquées après les règles, jamais par les règles. C'est non négociable dès qu'on branche des sources externes sur du hardware.

Le dispatcher actuel (`EventDispatcher.dispatch` / `dispatch_direct`) reste la façade : les intégrations existantes continuent de fonctionner pendant la migration.

---

## 2. État des lieux

### 2.1 Ce qui fonctionne déjà

- `IntegrationRegistry` : source de vérité des événements, actions, settings, routers et cycle de vie.
- Catalogue piloté par le backend : `GET /api/events/types`, `GET /api/events/action-types`, WS `integrations:load|update`.
- `ActionQueue` : priorité, durée, cumulatif, reverse, annulation, pause.
- `EventDispatcher` : règles par type, résumé des règles déclenchées, journal `triggered_events`, broadcast WS.
- Scoping par session (`integration_ids`) et kill switch par intégration.
- `echo_guard` / `source_integration_id` / `chain_depth` pour éviter les boucles.
- Redaction des payloads sensibles avant stockage et broadcast.
- `neutralize_all()` : chemin unique d'arrêt d'urgence (panic, fin de session, shutdown).

### 2.2 Limites

| Limite                                        | Où                                                             | Conséquence                                                               |
| --------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `dispatch(event_type: str, event_data: dict)` | `events/dispatcher.py`                                         | Pas d'acteur, sujet, corrélation, causation, dédup                        |
| Matching exact sur `event_type`               | `events/registry.py`                                           | Pas de wildcard, pas de conditions, pas de AND/OR                         |
| Payloads d'actions statiques                  | `database/models/trigger_action.py`                            | Impossible d'utiliser la durée d'un vote, le nom d'un acteur, un compteur |
| Pas d'agrégation                              | —                                                              | Impossible de dire « 10 réactions en 5 min »                              |
| Pas de cooldown / budget                      | —                                                              | Un raid ou un spam peut tout déclencher                                   |
| Pas d'identité unifiée                        | payloads `author` en string                                    | Le même utilisateur sur Discord et Chaster = 2 inconnus                   |
| Pas de `rule_runs`                            | —                                                              | Impossible d'expliquer pourquoi une règle n'a pas fire                    |
| `EventDef.data_schema` doc-only               | `integrations/base.py`                                         | Pas de validation ni de types TS générés                                  |
| Chaque intégration gère son transport         | `chaster/webhooks.py`, `puryfi/protocol.py`, `lovense/node.py` | Pas de SDK commun, pas de HMAC/pairing/backpressure/health                |
| Webhook Chaster avec credentials par défaut   | `chaster/webhooks.py`                                          | Faille à corriger immédiatement                                           |
| Journal non indexé pour la recherche          | `triggered_events`                                             | Pas de recherche plein texte, pas de replay ciblé                         |

### 2.3 Contraintes de compatibilité

- **Ne jamais renommer un `event_type` persisté** : `EventDef.id` est stocké dans `trigger_rule.event_type`. Les nouveaux ids viennent en plus, les anciens restent des alias.
- **Ne pas casser `EventDispatcher.dispatch`** : c'est l'API utilisée par Chaster, PuryFi, Lovense, les capteurs, le training.
- **Ne pas contourner `ActionQueue`** : toute action matérielle doit passer par la queue et par `neutralize_all()`.
- **Pas d'Alembic** : les migrations sont additives dans `database/connection.py::ensure_schema()`.
- **Windows d'abord** : le code Bluetooth et les chemins de fichiers sont sensibles à la plateforme.
- **Pas de suite de tests aujourd'hui** : le moteur de règles est le bon endroit pour en introduire (pytest sur les fonctions pures).

---

## 3. Architecture cible

### 3.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CONNECTEURS                               │
│  Chaster · Discord bot · Vencord · Reddit · X · Bluesky · Telegram   │
│  Throne · Chaturbate · Stripchat · RSS · IMAP · Webhook · MQTT ...   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ EventEnvelope
┌───────────────────────────────▼─────────────────────────────────────┐
│                         EVENT BUS (pipeline)                        │
│  ingress → validate → dedupe → policy → enrich → match → windows    │
│  → effects → safety → persist/broadcast                             │
└───────┬───────────────────────────────────────────────┬─────────────┘
        │                                               │
┌───────▼──────────┐                          ┌─────────▼───────────┐
│   ActionQueue    │                          │  Event Log / Metrics│
│  (durée/reverse) │                          │  Rule Runs / Audit  │
└───────┬──────────┘                          └─────────────────────┘
        │
┌───────▼─────────────────────────────────────────────────────────────┐
│  ActionExecutor · Units · Sensors · Training · Lovense · Chaster     │
│  PuryFi · Discord · Webhooks · OBS · Home Assistant ...              │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Principes

1. **Le connecteur normalise, la règle ne dépend jamais du format brut d'une plateforme.**
2. **Un événement est immuable.** Les effets sont des enregistrements séparés.
3. **Les conditions sont pures.** Elles lisent une enveloppe + une vue d'état, elles ne modifient rien.
4. **Les limites de sécurité sont hors des règles.** Une règle ne peut pas lever un cap.
5. **Tout est explicable.** Chaque règle produit une trace : conditions passées/échouées, skip, clamp.
6. **Le volume est un risque.** Filtrage à l'ingress, échantillonnage, rétention, backpressure.
7. **Les actions sont idempotentes quand c'est possible.** `effect_ledger` + clés d'idempotence des plateformes.

### 3.3 Flux de bout en bout

1. Le connecteur reçoit un événement brut et construit un `EventEnvelope`.
2. L'ingress vérifie la taille, le rate limit, l'authentification et le scope.
3. La validation applique le JSON Schema du type d'événement.
4. Le dedupe rejette les doublons (`dedupe_key`, TTL).
5. La policy vérifie : intégration activée, event activé, session, consentement, quiet hours, acteur bloqué.
6. L'enrich résout l'acteur, les stats, l'état courant (units, session, queue, Lovense).
7. Le matcher évalue les règles compilées (exact → famille → wildcard), dans l'ordre de priorité.
8. Les fenêtres mettent à jour les compteurs et décident si le seuil est franchi.
9. Les effects rendent les payloads, appliquent cooldown/budget/probabilité, créent les `QueueItem`s.
10. Le Safety Governor clampe ou rejette chaque action.
11. Le journal persiste l'événement, les rule runs et l'effect ledger ; le WS diffuse.
12. La queue exécute, reverse à l'expiration, et émet éventuellement des événements de feedback (`system.action.applied`, `system.action.reversed`).

---

## 4. EventEnvelope

### 4.1 Modèle

L'enveloppe est un modèle pydantic immuable : identité, type, payload normalisé, corrélation et métadonnées de la source.

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 4.1 — EventEnvelope ».

### 4.2 Convention de nommage

Format : `<source>.<domaine>.<action>`

```
discord.message.created
discord.message.mention
discord.reaction.added
chaster.lock.time_changed
chaster.pillory.voted
chaster.message.received
reddit.comment.created
x.mention.received
bluesky.post.liked
rss.item.published
system.connector.offline
system.action.applied
```

Règles :

- **Minuscules, points, pas d'espaces.**
- **Les ids existants ne changent pas.** Les anciens `chaster_pillory_vote`, `sensor_sound_alarm`, etc. restent des alias déclarés dans `EventDef.aliases`.
- **`system.*`** est réservé aux événements internes (santé, actions appliquées, budgets). Exclu par défaut des règles utilisateur.
- **`custom:*`** reste le namespace des événements dynamiques legacy (WOF). Les nouveaux dynamiques utilisent `dynamic.<nom>`.
- **Wildcards** : `discord.message.*`, `chaster.*`, `*` (à éviter).

### 4.3 Payload normalisé vs raw

Le payload est **stable, documenté et versionné**. Il ne contient jamais la structure brute de la plateforme.

Exemple Discord :

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 4.3 — Payload normalisé Discord ».

Le champ `raw` conserve le payload d'origine pour le debug, mais :

- il est **désactivé par défaut** sur les sources à fort volume ;
- il est **redacted** avant stockage ;
- il n'est **jamais** exposé aux règles (seulement à l'inspecteur d'événements).

### 4.4 Identité unifiée

`ActorRef` pointe vers une table `actors` commune. Les identités par plateforme vivent dans `actor_identities`.

```
actors
  id, display_name, trust, is_blocked, tags, notes, first_seen_at, last_seen_at

actor_identities
  (platform, platform_id) → actor_id, display_name, metadata
```

Cela permet :

- de bloquer un utilisateur sur **toutes** les plateformes ;
- de calculer `actor.trust` à partir de l'ancienneté, des rôles, des dons, des signalements ;
- de faire des règles cross-platform (« la même personne qui ping et qui vote ») ;
- d'afficher une fiche acteur dans l'UI.

### 4.5 Corrélation, causation, déduplication

- `correlation_id` : id de l'événement racine d'une chaîne. Tous les événements dérivés le partagent.
- `causation_id` : id de l'événement qui a causé celui-ci (echo d'action, événement émis par une règle).
- `dedupe_key` : clé stable fournie par le connecteur (`message.id`, `event_id` Chaster, `guid` RSS).
- Le dispatcher conserve un cache TTL et une table `event_dedupe` pour les événements critiques.
- `chain_depth` reste un garde-fou dur (max 8) en plus de la propagation de `causation_id`.

### 4.6 Versioning

- `version` commence à 1.
- On **ajoute** des champs, on n'en retire pas sans bump majeur.
- Un connecteur émet toujours la dernière version ; les règles déclarent une plage compatible.
- Les payloads legacy sont migrés à la lecture si nécessaire.

---

## 5. Pipeline d'ingestion

### 5.1 Ingress

Responsabilités :

- authentifier (token, HMAC, signature, pairing) ;
- vérifier la taille maximale ;
- appliquer le rate limit du connecteur ;
- vérifier le scope (guild/salon, compte, session) ;
- construire l'enveloppe ;
- pousser dans une file bornée.

Filtres d'ingress recommandés pour les sources à fort volume :

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 5.1 — Filtres d'ingress ».

Sans ces filtres, un serveur Discord actif peut générer des milliers d'événements par minute et saturer SQLite.

### 5.2 Validation

- JSON Schema par `EventDef` (remplace `data_schema` doc-only).
- En dev : validation stricte, rejet avec erreur détaillée.
- En prod : validation permissive, champs inconnus conservés dans `payload` mais loggés.
- Les événements invalides vont dans une **dead-letter queue** consultable dans l'UI.

### 5.3 Dedupe

- `dedupe_key` fourni par le connecteur.
- Cache mémoire TTL (ex. 15 min) pour les doublons chauds.
- Table `event_dedupe` pour les événements critiques (paiements, temps Chaster).
- En cas de doublon : incrémenter un compteur `duplicate_count`, ne pas créer d'effet.

### 5.4 Policy / consent

Vérifications dans l'ordre :

1. intégration activée (`is_enabled`) ;
2. event activé (`is_event_toggled`) ;
3. scope de session (`integration_ids`) ;
4. consentement : source autorisée, acteur autorisé, quiet hours, limite de session ;
5. acteur bloqué (`actors.is_blocked`) ;
6. rate limit par acteur et par source.

Un rejet produit un `rule_run` avec `skip_reason` (`integration_disabled`, `event_disabled`, `out_of_scope`, `actor_blocked`, `consent_denied`, `rate_limited`).

### 5.5 Enrich

- Résolution d'acteur : `(platform, platform_id)` → `actors.id`, création à la volée si inconnu.
- Stats acteur : compteurs par type, dernier événement, total de temps ajouté.
- Vue d'état : units, session, queue, Lovense, santé des connecteurs.
- Champs dérivés : `actor.is_first_time`, `actor.total_tributes`, `session.elapsed_minutes`.
- Optionnel : classification IA (sentiment, intent, NSFW) avec cache.

### 5.6 Rule match

- Règles compilées en mémoire, indexées par pattern exact, famille et wildcard.
- Invalidation sur CRUD de règle (REST/WS) via `EventRegistry.reload()`.
- Ordre : priorité DESC, puis spécificité (exact > famille > wildcard), puis `created_at`.
- `match_mode: "all"` (défaut) ou `"first"` ; `stop_processing` arrête l'évaluation.

### 5.7 Windows / agrégats

- Ring buffer en mémoire par `(rule_id, group_key)`.
- Checkpoint SQLite toutes les N secondes (`rule_state`).
- Reconstruction au démarrage depuis `triggered_events` pour la fenêtre courante.
- `allowed_lateness` pour les sources de polling qui peuvent livrer en retard.

### 5.8 Effects

- Rendu des templates.
- Application de `probability`, `cooldown`, `budget`.
- Création des `QueueItem` avec `duration`, `cumulative`, `priority`, `delay_seconds`.
- `effect_ledger` pour l'idempotence et l'audit.
- Si `silent: true`, on logge sans exécuter (dry-run permanent).

### 5.9 Safety Governor

Le gouvernor est le **dernier** filtre avant la queue :

- clamp des niveaux, durées, temps ajouté ;
- rejet si le profil de consentement l'interdit ;
- rejet si le budget global/acteur est épuisé ;
- rejet si l'action n'est pas autorisée pour la source ;
- log `action.clamped` / `action.blocked` avec la raison.

Voir [section 12](#12-sécurité-consentement-vie-privée).

### 5.10 Persist / broadcast

- Écriture batchée (250 ms ou 100 événements) sur une connexion dédiée.
- WAL SQLite activé.
- `triggered_events` + `rule_runs` + `effect_ledger`.
- Broadcast WS `events:triggered` avec l'enveloppe complète (redacted).
- Les `rule_runs` ne sont diffusés qu'aux clients admin, ou à la demande (`events:explain`).

### 5.11 Backpressure et dead-letter

- File bornée par connecteur (ex. 5 000 événements).
- Politique : `drop_oldest`, `drop_new`, `sample`.
- Si le taux dépasse un seuil : échantillonnage des events non critiques + warning.
- Dead-letter : payload brut, erreur, timestamp, connecteur ; consultable et rejouable.

---

## 6. Rule Engine v2

### 6.1 Modèle de règle

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.1 — RuleSpec ».

### 6.2 Conditions

Exemple :

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.2 — Conditions ».

### 6.3 Opérateurs

| Opérateur                   | Sens                      | Exemple                                 |
| --------------------------- | ------------------------- | --------------------------------------- |
| `eq` / `neq`                | égalité stricte           | `payload.duration eq 30`                |
| `gt` / `gte` / `lt` / `lte` | comparaison numérique     | `actor.trust gte 0.6`                   |
| `in` / `not_in`             | appartenance à une liste  | `payload.emoji.name in ["🔥","💦"]`     |
| `contains` / `icontains`    | sous-chaîne               | `payload.text contains "punish"`        |
| `starts_with` / `ends_with` | préfixe/suffixe           | `payload.command starts_with "!"`       |
| `matches`                   | regex (timeout 50 ms)     | `payload.text matches "(?i)\\bedge\\b"` |
| `exists`                    | champ présent et non nul  | `payload.attachments exists true`       |
| `between`                   | intervalle inclusif       | `payload.duration between [10, 120]`    |
| `length`                    | taille d'une liste/chaîne | `payload.attachments length gte 1`      |
| `is_null`                   | nul                       | `payload.reply_to is_null true`         |

`other` permet de comparer deux champs :

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.3 — Comparaison de champs ».

### 6.4 Vue d'état (`state.*`)

Champs disponibles dans les conditions, sans requête DB lourde :

```
state.units.<unit_id>.level
state.units.<unit_id>.multiplier
state.units.<unit_id>.connected
state.queue.active_count
state.queue.max_level
state.session.id
state.session.type
state.session.elapsed_minutes
state.session.intensity_budget_used
state.lovense.devices[].battery
state.lovense.devices[].connected
state.sensors.<sensor_id>.last_value
state.connectors.<connector_id>.online
```

Cela permet des règles contextuelles :

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.4 — Condition contextuelle ».

### 6.5 Fenêtres et agrégats

Exemples :

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.5 — Fenêtres et agrégats ».

### 6.6 Cooldowns, budgets, probabilité

- **Cooldown** : `rule`, `actor`, `group`, `subject`. Persisté dans `rule_state`.
- **max_fires / window_seconds** : « max 3 fois par heure et par utilisateur ».
- **Budget global** : max actions/min, max delta d'intensité/heure, max temps ajouté/heure.
- **Budget par acteur** : même chose, par `actor.id`.
- **Probabilité** : 0..1, ou table pondérée pour les choix aléatoires.
- **Silent** : la règle logge mais n'exécute pas.

Exemple :

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.6 — Cooldowns et budgets ».

### 6.7 Ordre d'évaluation

1. Priorité DESC.
2. Spécificité : type exact > famille (`discord.message.*`) > wildcard (`discord.*`).
3. `created_at` ASC.
4. `match_mode` :
   - `all` : toutes les règles compatibles s'appliquent ;
   - `first` : la première règle qui matche s'applique, les suivantes sont marquées `skipped_by_first_match`.
5. `stop_processing: true` : arrêt immédiat après cette règle.

### 6.8 Templating

Syntaxe : `{ expression }` dans les chaînes du payload.

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.8 — Templating ».

Fonctions autorisées :

```
clamp(x, min, max)
min(...), max(...)
round(x, digits?)
abs(x)
coalesce(...)
random()                 # 0..1
random_int(min, max)
choice([...])
now()
duration(seconds)        # format lisible
```

Règles de sécurité :

- Pas d'`eval`, pas d'accès attribut arbitraire.
- Parse `ast`, walk avec une whitelist.
- Compilation à la sauvegarde de la règle, pas à chaque événement.
- Timeout d'évaluation (ex. 10 ms).
- Si le champ est un MagicNumber, on rend le template puis on parse la syntaxe MagicNumber.

### 6.9 Actions conditionnelles et différées

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.9 — Actions conditionnelles et différées ».

- `delay_seconds` : l'item est créé avec `not_before` ; la queue le skip jusqu'à échéance.
- `when` : évalué au moment de l'exécution, pas seulement à la création.
- `clamp` : borne locale (en plus du Safety Governor).

### 6.10 Composition (`EMIT_EVENT`)

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.10 — Composition (EMIT_EVENT) ».

- L'événement émis hérite de `correlation_id`, reçoit `causation_id`.
- `chain_depth` est incrémenté.
- Les événements `system.*` sont exclus par défaut des règles utilisateur.
- Un cap dur (8) empêche les boucles cross-intégrations.

### 6.11 Scénarios

Pour les séquences longues, un mini-moteur de process manager :

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.11 — Scénarios ».

Modèle : `scenario_runs` + `scenario_steps`. La phase 6 peut être livrée après le reste ; le scheduler et `delay_seconds` doivent être prévus dès le début.

### 6.12 Exemples complets

Cinq règles complètes, du ping Discord au tip Chaturbate.

#### A. Ping Discord dans un salon NSFW → punition

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.12.A — Ping Discord NSFW → punition ».

#### B. 10 réactions 🔥 → pulse

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.12.B — 10 réactions 🔥 → pulse ».

#### C. Message Chaster du keyholder → scénario

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.12.C — Message Chaster du keyholder → scénario ».

#### D. Tip ≥ 100 tokens → récompense

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.12.D — Tip ≥ 100 tokens → récompense ».

#### E. Même acteur sur Discord + Chaster en 10 min → double

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 6.12.E — Même acteur Discord + Chaster → double ».

---

## 7. SDK de connecteurs

### 7.1 Pourquoi

Aujourd'hui :

- Chaster : route FastAPI + Basic auth.
- PuryFi : serveur WebSocket msgpack.
- Lovense : client WebSocket/Buttplug.
- Capteurs : threads.

Chaque intégration réinvente l'authentification, la reconnexion, le rate limit, le health check et la déduplication. Le SDK factorise tout cela.

### 7.2 Modèle `Connector`

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 7.2 — Connector ».

`ConnectorContext` fournit :

- `emit(envelope)` ;
- `state` en lecture seule ;
- `notifier` ;
- `settings` ;
- `logger` scopé.

Un connecteur **ne reçoit jamais** `Store`, `ActionQueue` ou `ActionExecutor` directement. Il émet des événements ; le bus décide.

### 7.3 Transports

| Transport           | Usage                                      | Points d'attention                                      |
| ------------------- | ------------------------------------------ | ------------------------------------------------------- |
| `WebhookTransport`  | Chaster, Throne, Stripe, Ko-fi, génériques | HMAC/Ed25519, timestamp, replay window, IP allowlist    |
| `WsServerTransport` | PuryFi, Vencord, companions                | pairing, heartbeat, subscriptions, une connexion active |
| `WsClientTransport` | Lovense, gateways distants                 | reconnexion/backoff, auth, buffer borné                 |
| `PollTransport`     | Reddit, Emlalock, X                        | curseur, ETag/Last-Modified, backfill, rate limit       |
| `LongPollTransport` | Chaturbate Events API                      | `nextUrl`, un seul consommateur, reprise                |
| `RssTransport`      | blogs, subreddits, AO3                     | `guid`, dates, dédup                                    |
| `ImapTransport`     | FetLife, OnlyFans, notifications           | UIDVALIDITY, IDLE, parsing robuste                      |
| `MqttTransport`     | Home Assistant, ESPHome                    | topics, QoS, reconnexion                                |
| `SseTransport`      | services modernes                          | reconnexion, `Last-Event-ID`                            |

### 7.4 Connecteur déclaratif

Pour couvrir la longue traîne sans code :

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 7.4 — Connecteurs déclaratifs ».

Le manifeste est validé au chargement ; les erreurs vont dans le health du connecteur.

### 7.5 Capabilities et sandbox

- `emit` : peut produire des événements.
- `actions` : peut exécuter des actions (dangereux).
- `state:read` : peut lire l'état.
- `secrets` : peut lire ses propres secrets.

Un connecteur tiers (communauté) ne doit avoir que `emit` + `state:read`. Pour exécuter du code non fiable :

- process séparé ;
- RPC restreint ;
- pas d'accès au système de fichiers ni au hardware ;
- limite CPU/mémoire ;
- signature optionnelle des paquets.

### 7.6 Santé, circuit breaker

Chaque connecteur expose :

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 7.6 — Santé du connecteur ».

- Circuit breaker après N erreurs consécutives.
- Événements `system.connector.offline` / `system.connector.online`.
- Backoff exponentiel avec jitter.
- Les erreurs ne doivent jamais crasher le bus.

### 7.7 Sécurité

- Secrets dans le keyring OS (Windows Credential Manager) ou `config.env`, jamais dans les payloads.
- Webhooks : HMAC + timestamp + fenêtre de replay + allowlist IP.
- Throne : signature Ed25519 officielle.
- Chaster : Basic auth + suppression des valeurs par défaut.
- Pairing code à 6 chiffres pour les clients WS, token persistant, bind `127.0.0.1` par défaut.
- TLS obligatoire si le connecteur écoute au-delà de localhost.
- Taille max de payload (ex. 256 Ko) et profondeur JSON limitée.
- Rate limit par connecteur et par acteur.

### 7.8 Catalogue d'intégrations

#### API officielle

| Intégration                   | Transport                            | Événements clés                                                    | NSFW | Effort       |
| ----------------------------- | ------------------------------------ | ------------------------------------------------------------------ | ---- | ------------ |
| **Chaster**                   | REST + webhooks + extension API      | messages, votes, tasks, penalties, verification, temporary opening | 🔞   | Moyen        |
| **Emlalock**                  | API publique (polling)               | temps ajouté/retiré, min/max, info session                         | 🔞   | Faible       |
| **Throne**                    | Webhook officiel Ed25519             | `gift_purchased`, `contribution_purchased`, `gift_crowdfunded`     | 🔞   | Faible       |
| **Chaturbate**                | Events API officielle (long polling) | tip, chat, PM, follow, fanclub, media purchase, broadcast          | 🔞   | Moyen        |
| **Stripchat**                 | Extensions API officielle            | `v1.tokens.spent`, `v1.ext.context.updated`, chat                  | 🔞   | Moyen        |
| **Reddit**                    | OAuth2 + polling                     | post, commentaire, mention, reply, modmail, modqueue               | 🔞   | Moyen        |
| **Bluesky**                   | AT Protocol / Jetstream              | post, like, follow, mention, reply, DM                             | 🔞   | Faible-Moyen |
| **Mastodon**                  | Streaming API                        | mention, DM, hashtag, follow, boost, fav                           | 🔞   | Faible       |
| **Telegram**                  | Bot API / MTProto                    | message, mention, réaction, join/leave, bouton                     | 🔞   | Moyen        |
| **X / Twitter**               | API v2 payante                       | mention, DM, like, repost, quote, follow, post                     | 🔞   | Moyen (coût) |
| **Twitch**                    | EventSub + IRC                       | sub, bits, raid, channel points, prédiction, chat                  | ⚠️   | Faible       |
| **VRChat**                    | OSC                                  | paramètres avatar, casque, chatbox, haptics                        | 🔞   | Moyen        |
| **OBS**                       | WebSocket                            | scène, recording, streaming, replay                                | 🔞   | Faible       |
| **Home Assistant**            | Webhook / MQTT                       | lockbox, prise, présence, capteur                                  | 🔞   | Faible       |
| **Stripe / Ko-fi / Patreon**  | Webhooks                             | tip, abonnement, renouvellement, refund                            | 🔞   | Faible       |
| **ntfy / Apprise / Pushover** | HTTP                                 | notifications sortantes                                            | —    | Faible       |
| **e621 / Danbooru / Redgifs** | API publique                         | nouveau post par tag, likes, vues                                  | 🔞   | Faible       |
| **Google Calendar / CalDAV**  | API                                  | début/fin de session planifiée                                     | 🔞   | Faible       |

#### Sans API publique

| Intégration                            | Transport                         | Événements                                                                | NSFW | Risque         |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------- | ---- | -------------- |
| **FetLife**                            | IMAP + extension + RSS partiel    | friend request, message, wall post, group post, RSVP, photo comment, love | 🔞   | Moyen          |
| **OnlyFans**                           | Extension + notifications mobiles | abonné, renouvellement, tip, PPV, message, like, expiration               | 🔞   | Élevé (ToS)    |
| **Fansly**                             | idem                              | idem                                                                      | 🔞   | Élevé          |
| **LoyalFans / ManyVids / JustForFans** | idem / API partielle à vérifier   | tip, achat, abonnement, message                                           | 🔞   | Élevé          |
| **Grindr / Tinder / Feeld**            | Extension navigateur              | tap/match/message                                                         | 🔞   | Élevé          |
| **Cam4 / BongaCams / CamSoda / MFC**   | Extension + notifications         | tip, private show, follow                                                 | 🔞   | Moyen          |
| **Recon / Gearfetish / Kinksters**     | Extension / IMAP                  | message, friend, event                                                    | 🔞   | Moyen          |
| **Pornhub / xHamster**                 | Extension                         | commentaire, like, upload                                                 | 🔞   | Faible intérêt |
| **Instagram / TikTok / Snapchat**      | Extension                         | DM, mention, commentaire                                                  | ⚠️   | Élevé          |

#### Génériques

| Transport                       | Ce que ça couvre                                        |
| ------------------------------- | ------------------------------------------------------- |
| **Webhook générique + mapping** | Zapier, n8n, Make, scripts, iOS Shortcuts, Tasker       |
| **RSS / Atom**                  | blogs, subreddits `.rss`, AO3, Literotica, newsletters  |
| **IMAP**                        | toutes les notifications email                          |
| **Mobile companion (Android)**  | notification listener → toutes les apps, y compris NSFW |
| **Desktop companion (Windows)** | fenêtre active, idle, screenshot opt-in, hotkey         |
| **Browser extension générique** | adaptateurs par site (FetLife, OnlyFans, Grindr…)       |
| **MQTT**                        | IoT, ESPHome, capteurs maison                           |
| **SMS (Twilio)**                | contrôle distant de secours avec 2FA                    |

---

## 8. Discord : bot officiel + Vencord

### 8.1 Deux modes, un namespace

Un plugin Vencord tourne dans le client Discord et voit des choses qu'un bot ne voit pas : tes DMs, ta présence, les salons NSFW auxquels tu as accès. Mais :

- il ne tourne que quand Discord est ouvert → événements manqués ;
- il utilise le compte utilisateur → **automatisation de compte contraire aux ToS Discord**, risque de ban ;
- les actions d'envoi via le client sont fragiles et encore plus risquées.

**Recommandation : deux modes derrière le même namespace `discord.*`.**

1. **Bot officiel** : Gateway + actions (envoyer, réagir, DM, thread, timeout, voice move, boutons, slash commands). Stable, supporté, obligatoire pour tout ce qui agit.
2. **Vencord** : source d'événements côté client (DMs, présence, salons NSFW, réactions), en lecture seule par défaut. Dédup par `message.id`.

### 8.2 Événements

```
discord.message.created / updated / deleted
discord.message.mention          # self, role, everyone, reply
discord.message.pinned
discord.dm.received
discord.reaction.added / removed
discord.reaction.milestone       # agrégat
discord.typing.started
discord.voice.joined / left / moved / streaming
discord.call.incoming
discord.presence.updated
discord.member.joined / left
discord.role.added / removed
discord.thread.created
discord.interaction.button
discord.command.used
discord.attachment.posted        # mime, taille, dimensions, spoiler, nsfw
discord.poll.voted
```

### 8.3 Payload normalisé

Le payload normalisé est identique à celui de la section 4.3.

### 8.4 Actions

- Webhook (pas de bot) pour les notifications simples.
- Bot pour : envoyer/éditer/supprimer, réagir, DM, thread, timeout, rôle, déplacer en vocal, boutons d'approbation.
- Slash commands : `/pes status`, `/pes deny 30`, `/pes reward`, `/pes stop` — vérification de rôle, réponse éphémère.
- Salons age-restricted : vérifier les règles Discord côté bot (app marquée 18+, permissions).

### 8.5 Protocole PES Link

Un seul protocole pour Vencord, le companion mobile, le companion desktop et les extensions navigateur.

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 8.5 — Protocole PES Link ».

Bonnes pratiques :

- Token obligatoire, pairing code, origin allowlist, `127.0.0.1` par défaut.
- Taille max par message, rate limit, reconnexion avec backoff, buffer borné quand offline.
- **Privacy by default** : le plugin n'envoie pas le contenu des messages. Il envoie `content_hash` + des catégories calculées localement à partir de règles envoyées par PES (`keywords`, `regex`), ou un mode `full` explicitement activé.
- Le plugin ne bloque jamais le dispatcher Discord : il pousse dans une micro-queue.

### 8.6 Design du plugin Vencord

- `definePlugin` avec settings : URL PES, token, guilds, channels, `nsfw_only`, `include_content`, `ignore_bots`, `self_events`, event toggles.
- Hooks FluxDispatcher :
  - `MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE`, `MESSAGE_DELETE_BULK` ;
  - `MESSAGE_REACTION_ADD`, `MESSAGE_REACTION_REMOVE`, `MESSAGE_REACTION_REMOVE_ALL` ;
  - `TYPING_START`, `CALL_UPDATE`, `CALL_DELETE` ;
  - `VOICE_STATE_UPDATES`, `PRESENCE_UPDATES` ;
  - `GUILD_MEMBER_ADD/UPDATE/REMOVE`, `CHANNEL_CREATE/UPDATE/DELETE` ;
  - `THREAD_CREATE/UPDATE`, `RELATIONSHIP_ADD/REMOVE` ;
  - `INTERACTION_*`, `MESSAGE_ACK`.
- Calcul de `is_mention` : `mentions` contient l'utilisateur courant, `mention_roles`, `mention_everyone`, `message_reference`.
- NSFW : `channel.nsfw`, `guild.nsfw_level`, attachments `spoiler`, `content_type`.
- Reconnexion avec backoff, queue mémoire bornée, `ack`.
- Actions : lecture seule par défaut ; `open_channel`, `copy_link`, `show_notification` local. `allow_send` opt-in et documenté comme risqué.

### 8.7 Privacy et ToS

- Ne pas stocker le contenu des messages par défaut.
- Ne pas télécharger les attachments par défaut (URL CDN éphémères).
- Documenter clairement le risque de ban lié à l'automatisation du compte.
- Le bot officiel reste le chemin recommandé pour les actions.
- Âge : 18+ obligatoire, salons NSFW uniquement si l'utilisateur l'a explicitement activé.

---

## 9. Chaster

### 9.1 Ce qui existe déjà

- Webhook `POST /webhooks/chaster` (Basic auth).
- `action_log.created` : `wheel_of_fortune_turned`, `time_changed`, `link_time_changed`, `lock_frozen`, `lock_unfrozen`, `pillory_in`, `pillory_out`.
- WOF custom codes (`{p:...}`, `{u:...}`) via `dispatch_direct`.
- Action `CHASTER_TIME_UPDATE`.

### 9.2 Ce que l'API expose en plus

L'API Chaster couvre :

- **Locks** : time update, freeze/unfreeze, unlock, archive, settings, max limit date, combination, history.
- **Shared locks** : création, extensions.
- **Messagerie** : conversations, messages, statut, unread, ignored users.
- **Notifications** : counts, search, channel health, read, act, read all, seen.
- **Extensions** : tasks, penalties, pillory, dice, wheel of fortune, link, verification picture, temporary opening.
- **Extension communication** (expérimental) : manifest, commandes, queries, événements, `action.invoke`, `lock_event.created`.
- **Rate limits** : IP 100/min, messages 500/jour, conversations 20/jour, etc.

### 9.3 Événements à ajouter

| Domaine               | Événements                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Messagerie**        | `chaster.message.received`, `chaster.message.sent`, `chaster.conversation.unread`                                                                               |
| **Notifications**     | `chaster.notification.received`                                                                                                                                 |
| **Lock**              | `chaster.lock.time_changed`, `chaster.lock.frozen`, `chaster.lock.unfrozen`, `chaster.lock.unlocked`, `chaster.lock.archived`, `chaster.lock.max_limit_changed` |
| **Pillory**           | `chaster.pillory.started`, `chaster.pillory.ended`, `chaster.pillory.voted`                                                                                     |
| **Tasks**             | `chaster.tasks.assigned`, `completed`, `failed`, `vote_ended`, `vote_cancelled`                                                                                 |
| **Penalty**           | `chaster.penalty.incremented`, `chaster.penalty.time_limit_created`, `cancelled`                                                                                |
| **Verification**      | `chaster.verification.requested`, `submitted`, `verdict`                                                                                                        |
| **Temporary opening** | `chaster.temporary_opening.opened`, `relocked`, `late`                                                                                                          |
| **Dice / WOF**        | `chaster.dice.rolled`, `chaster.wof.landed`                                                                                                                     |
| **Shared link**       | `chaster.link.voted`, `chaster.link.time_changed`                                                                                                               |

### 9.4 Actions à ajouter

`lock.add-time`, `lock.remove-time`, `lock.freeze`, `lock.unfreeze`, `lock.toggle-freeze`, `lock.pillory`, `lock.set-display-remaining-time`, `tasks.assign`, `tasks.start-timer`, `tasks.complete`, `penalty.increment`, `penalty.create-time-limit`, `verification.request`, `temporary-opening.open`, `conversation.send`, `conversation.create`.

### 9.5 Webhooks, `lock_event.created` et idempotence

- Utiliser `lock_event.created` (flux ordonné) **et** `action_log.created`.
- Dédupliquer sur `data.actionLog._id` / `data.eventId`, jamais sur `requestId`.
- Répondre `2xx` aux événements non gérés.
- Propager `causationId` dans `causation_id`.
- Utiliser `idempotencyKey` pour les commandes d'extension.
- Vérifier `X-Chaster-Event-Id` pour corréler les deux webhooks.

### 9.6 Messagerie et notifications

La messagerie n'a pas de webhook dédié : polling contrôlé.

```
GET /conversations
GET /conversations/{conversationId}/messages
GET /conversations/by-user/{userId}
PUT /conversations/{conversationId}/unread
```

- Curseur `lastMessageId` / `updatedAt` dans `connector_state`.
- Rate limit : 500 messages/jour, 20 conversations/jour.
- Événements normalisés : `chaster.message.received` avec `conversation.role`, `author`, `text`, `attachments`, `unread_count`.
- Notifications : `GET /notifications` (counts, search, read) → `chaster.notification.received`.

### 9.7 Mapping legacy

| Legacy                    | v2                                    |
| ------------------------- | ------------------------------------- |
| `chaster_pillory_vote`    | `chaster.pillory.voted`               |
| `chaster_pillory_started` | `chaster.pillory.started`             |
| `chaster_pillory_ended`   | `chaster.pillory.ended`               |
| `chaster_vote_add`        | `chaster.link.voted` (positif)        |
| `chaster_vote_sub`        | `chaster.link.voted` (négatif)        |
| `chaster_time_add`        | `chaster.lock.time_changed` (positif) |
| `chaster_time_sub`        | `chaster.lock.time_changed` (négatif) |
| `chaster_wof_turned`      | `chaster.wof.landed`                  |
| `chaster_lock_frozen`     | `chaster.lock.frozen`                 |
| `chaster_lock_unfrozen`   | `chaster.lock.unfrozen`               |

Les deux ids restent valides. `EventDef.aliases` permet aux règles existantes de continuer à matcher.

### 9.8 Sécurité immédiate

Dans `integrations/chaster/webhooks.py` :

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 9.8 — Sécurité webhook Chaster ».

Ajouter une allowlist IP et un rate limit. Ne jamais logger les credentials.

---

## 10. Autres intégrations prioritaires

### 10.1 Reddit

- OAuth2 (script app), polling `/r/{sub}/new`, `/user/{me}/inbox`, `/about/modqueue`, `/about/modmail`.
- Événements : `reddit.post.created`, `reddit.comment.created`, `reddit.mention.received`, `reddit.reply.received`, `reddit.modmail.received`, `reddit.modqueue.item`, `reddit.flair.changed`.
- NSFW : subreddits `over_18`, posts avec `over_18`, galleries, media.
- Dédup par `thing.id` (`t3_...`, `t1_...`).
- Rate limit : respecter `X-Ratelimit-*`.

### 10.2 X / Twitter

- API v2 payante. Stream filtré (enterprise) ou polling mentions/DMs.
- Événements : `x.mention.received`, `x.dm.received`, `x.like.received`, `x.repost.received`, `x.quote.received`, `x.follow.received`, `x.post.published`.
- NSFW : labels adultes, `possibly_sensitive`, media metadata.
- Coût/limites : à documenter ; alternative extension si le tier ne suffit pas.

### 10.3 Bluesky

- AT Protocol, Jetstream (`wss://jetstream2.us-east.bsky.network/subscribe`) pour le realtime.
- Événements : `bluesky.post.created`, `bluesky.like.received`, `bluesky.follow.received`, `bluesky.mention.received`, `bluesky.reply.received`, `bluesky.dm.received`.
- NSFW : labels `adult`, `self`, `sensitive` ; `contentWarnings`.
- Excellent rapport simplicité/coût, pas de ToS problématique.

### 10.4 Mastodon

- Streaming API par instance, notifications, hashtag timeline, DMs.
- NSFW : `spoiler_text` (content warning), `sensitive` media.
- Événements : `mastodon.mention.received`, `mastodon.dm.received`, `mastodon.follow.received`, `mastodon.boost.received`, `mastodon.fav.received`, `mastodon.hashtag.posted`.

### 10.5 Telegram

- Bot API : messages dans les groupes où le bot est admin, commandes, boutons, paiements, polls.
- MTProto (Telethon) pour les DMs/channels du compte utilisateur — **ToS risk**, à documenter.
- Événements : `telegram.message.received`, `telegram.mention.received`, `telegram.reaction.added`, `telegram.join/leave`, `telegram.callback`, `telegram.poll.answered`.
- NSFW : channels/groupes adultes, médias.
- Très bon canal de contrôle distant (`/deny 30`, `/status`, `/stop`).

### 10.6 Twitch

- EventSub : `channel.subscribe`, `channel.cheer`, `channel.raid`, `channel.follow`, `channel.channel_points_custom_reward_redemption.add`, `channel.prediction.*`.
- IRC pour le chat et les commandes.
- NSFW : Twitch restreint le contenu sexuel ; pour le NSFW, préférer Chaturbate/Stripchat.
- Overlay OBS pour afficher l'état.

### 10.7 Throne

- Webhook officiel, signature Ed25519, `event_id` pour l'idempotence.
- Événements : `throne.gift.purchased`, `throne.contribution.purchased`, `throne.gift.crowdfunded`.
- Payload : `creator_id`, `creator_username`, `gifter_username`, `message`, `item_name`, `price`, `currency`.
- NSFW : wishlist adulte, très pertinent pour les creators.
- Vérifier `X-Signature-Timestamp` + `X-Signature-Ed25519` avant toute logique.

### 10.8 Chaturbate

- Events API officielle : long polling avec `nextUrl`.
- Événements : `chaturbate.tip.received`, `chaturbate.chat.message`, `chaturbate.private_message.received`, `chaturbate.follow`, `chaturbate.unfollow`, `chaturbate.fanclub.join`, `chaturbate.media.purchase`, `chaturbate.broadcast.started`, `chaturbate.broadcast.stopped`, `chaturbate.room.subject_changed`.
- Un seul consommateur par session ; ne pas redémarrer au milieu d'un stream (perte/doublons).
- Dédup par id d'événement, sinon hash de `method + timestamp + user + payload`.

### 10.9 Stripchat

- Extensions API officielle (iframe) : `v1.tokens.spent`, `v1.ext.context.updated`, chat.
- Événements : `stripchat.tip.received`, `stripchat.chat.message`, `stripchat.context.updated`.
- Le pont vers PES dépend des restrictions CSP de l'iframe ; à valider. Sinon, Studio API pour les stats (moins temps réel).

### 10.10 Emlalock

- API publique : `add`, `info`, minimum/maximum.
- Événements (polling) : `emlalock.session.updated`, `emlalock.time.changed`, `emlalock.session.ended`.
- Actions : ajouter/retirer du temps, ajuster min/max.
- NSFW : chastity, alternative à Chaster.

### 10.11 FetLife / OnlyFans / Fansly

- **FetLife** : pas d'API publique. IMAP (notifications email) + extension navigateur + RSS partiel.
  - Événements : friend request, message, wall post, group post, RSVP, photo comment, love.
  - NSFW : 100 %.
- **OnlyFans / Fansly** : pas d'API publique. Extension + notifications mobiles.
  - Événements : nouvel abonné, renouvellement, tip, PPV, message, like, expiration.
  - NSFW : 100 %, risque ToS élevé.
- Ne jamais stocker les credentials du site ; utiliser la session du navigateur ou les notifications.

### 10.12 VRChat, OBS, santé, smart home

- **VRChat OSC** : recevoir `/avatar/parameters/*`, détecter le casque retiré, envoyer chatbox/haptics. Très pertinent pour les clubs NSFW privés.
- **OBS WebSocket** : scène changée, recording, streaming, replay buffer. Overlay navigateur.
- **Santé** : ceinture HR BLE (Polar H10, Garmin HRM), Oura, Whoop, Apple Health, Google Fit, Strava.
  - Événements : `health.hr.threshold`, `health.hrv.drop`, `health.sleep.score`, `health.steps.goal`.
  - NSFW : proxy d'arousal, effort, aftercare.
- **Smart home** : Home Assistant, Nuki/Yale, Shelly, Hue, capteurs de présence.
  - Événements : `home.lock.opened`, `home.plug.toggled`, `home.presence.changed`.
  - NSFW : lockbox, curfew, lumière, caméra.

### 10.13 Génériques

- **Webhook générique** : mapping JSONPath/Jinja, HMAC, replay window.
- **RSS/Atom** : `guid`, dates, dédup.
- **IMAP** : `Message-ID`, UIDVALIDITY, IDLE.
- **Mobile companion** : notification listener + widget + panic.
- **Desktop companion** : fenêtre active, idle, screenshot opt-in, hotkey.
- **Browser extension générique** : adaptateurs par site.
- **MQTT** : IoT.
- **SMS** : Twilio, 2FA.

---

## 11. Features NSFW

### 11.1 Mécaniques

1. **Audience control** — votes Twitch/Chaster/Discord pondérés par abonné/donation ; seuil de consensus ; veto du keyholder ; budget global.
2. **Tribute wallet** — chaque tip crédite des tokens ; les viewers les dépensent pour déclencher une action (spike, edge, wheel) ; ledger + prix + audit.
3. **Denial debt / edge bank** — chaque edge ajoute une dette, chaque heure de denial la réduit, avec intérêts ; commande Discord pour consulter le solde.
4. **Vérification photo** — l'événement demande une preuve avec un code aléatoire ; PuryFi/NSFWJS vérifie la nudité ; approbation manuelle ; stockage d'un hash, pas de l'image.
5. **Exposure meter** — likes/commentaires/reposts sur un post NSFW → score de « honte » → intensité/temps ; décroissance.
6. **Cross-platform actor multiplier** — la même personne qui ping sur Discord et vote sur Chaster en 10 min → effet doublé.
7. **Remote keyholder PWA** — feed live, gros boutons reward/punish, file d'approbation, panic, « grant orgasm » token, push.
8. **AI dungeon master** — un LLM local lit l'événement + l'état + les limites et propose une tâche ; approbation humaine ou auto si dans les limites.
9. **Public control page** — page anonyme rate-limitée, captcha, budget, bouton d'arrêt d'urgence.
10. **Wearable arousal proxy** — HR/HRV : HR élevé pendant N minutes → « arousal detected » → edge/reward ; retour au calme → « good behavior ».
11. **Lockbox / NFC chores** — scan NFC, photo avec objet, calendrier, step count ; échec → punition, succès → récompense.
12. **Aftercare automation** — fin de session/panic → message d'aftercare, baisse d'intensité, log, détection de « drop » via sentiment.
13. **Stream overlay** — source navigateur OBS : intensité, temps restant, derniers événements, QR de contrôle audience.
14. **Partner-to-partner federation** — deux instances PES appairées, événements miroir, consentement mutuel, « pass the control ».
15. **Consent receipts** — chaque session a un profil de consentement signé ; toute action hors limites est rejetée et loggée ; export possible.

### 11.2 Exemples de boucles

#### Boucle Discord + Chaster + Lovense

```
Ping Discord dans #punitions
  → +2 % unité 1 canal A (cooldown 5 min par acteur)
  → +5 min Chaster
  → si 3 pings du même acteur en 15 min : pulse Lovense 60 %
  → budget horaire atteint : event system.budget.exhausted, plus d'effet
```

#### Boucle stream

```
Tip 100 tokens
  → +10 % vibration pendant 30 s
  → si total session ≥ 1000 tokens : déblocage d'un pattern
  → overlay OBS mis à jour
  → après le stream : aftercare automatique + rapport
```

#### Boucle sociale NSFW

```
Nouveau post Reddit dans r/...
  → si over_18 et media : +1 « exposure »
  → 50 upvotes en 1 h : +10 min Chaster
  → 100 upvotes : reward (pattern)
  → commentaire contenant un mot-clé : tâche générée par LLM, approbation keyholder
```

#### Boucle wearable

```
HR > 120 pendant 5 min
  → event health.hr.threshold
  → si session active : edge demandé
  → si HR redescend < 90 pendant 3 min : « calm » → reward
```

---

## 12. Sécurité, consentement, vie privée

### 12.1 Profil de consentement

Chaque session porte un profil de limites dures : niveau max, durée max, temps total ajouté, sources et acteurs autorisés, quiet hours, safewords.

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 12.1 — Profil de consentement ».

### 12.2 Safety Governor

Appliqué à l'étage Effects, **après** les règles :

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 12.2 — SafetyDecision ».

Règles :

- Un clamp ne doit jamais augmenter une valeur, seulement la réduire.
- Un rejet produit `action.blocked` + `rule_run.skip_reason`.
- Les limites dures ne sont pas éditables par les règles ni par les connecteurs.
- Le gouvernor est testé unitairement (c'est du code de sécurité).

### 12.3 Budgets

- Global : actions/min, delta intensité/heure, temps ajouté/heure.
- Par acteur : mêmes limites, pour éviter qu'un seul viewer domine.
- Par source : éviter qu'un raid Discord épuise le budget.
- Réinitialisation à la fin de session.
- Affichage dans l'UI (jauge) et événement `system.budget.exhausted`.

### 12.4 Panic et dead man's switch

- `neutralize_all()` reste le chemin unique : queue annulée, ramps arrêtées, multiplicateurs reset, canaux à zéro, profil actif cleared.
- Déclencheurs : bouton UI, hotkey, NFC, mot dans un DM authentifié, bouton physique, perte de heartbeat companion.
- Dead man's switch : si le companion/phone ne donne plus signe de vie pendant N minutes → neutralize.
- Le panic doit être accessible même si l'UI est bloquée (endpoint local + hotkey).

### 12.5 Audit

- `effect_ledger` : event, règle, acteur, action, payload avant/après, clamp, raison.
- `rule_runs` : pourquoi la règle a matché ou non.
- Journal immuable (append-only) ; pas de suppression sauf purge de rétention.
- Export JSON/CSV par session.

### 12.6 Vie privée

- Pas de contenu de message par défaut (Discord, Reddit, OnlyFans).
- Hash + catégories calculées localement.
- Redaction des clés sensibles (`password`, `token`, `secret`, `api_key`, ...).
- Rétention par type d'événement (ex. 7 jours pour le chat, 1 an pour les paiements).
- Suppression par session sur demande.
- Chiffrement au repos optionnel (SQLCipher) pour les payloads sensibles.
- Les URLs d'attachments CDN ne sont pas stockées par défaut.

### 12.7 Âge et ToS

- Gate 18+ à l'installation, flag `nsfw` par connecteur, mode NSFW flouté par défaut.
- Documenter les risques : Vencord/self-bot, OnlyFans, Fansly, Grindr, Tinder, Instagram.
- Le bot Discord officiel reste le chemin recommandé pour les actions.
- Ne pas aider à contourner un paywall ou un système d'âge.
- Les intégrations de scraping doivent être opt-in et signalées comme fragiles.

---

## 13. Modèle de données

Le DDL complet (extensions de tables, nouvelles tables, index) est dans
[events-v2-code.md](events-v2-code.md), section 13. Les sous-sections ci-dessous
décrivent le rôle de chaque table.

### 13.1 `triggered_events` (journal canonique)

On étend la table existante plutôt que d'en créer une nouvelle, pour ne pas casser l'UI ni les loaders.
Elle reçoit `source`, `account`, `actor_id`, `subject_kind`, `subject_id`, `correlation_id`,
`causation_id`, `dedupe_key`, `severity`, `tags`, `version` et `raw`.

> Note : SQLite ne supporte pas `ADD COLUMN IF NOT EXISTS`. Chaque `ALTER` doit être exécuté
> uniquement si la colonne manque (`PRAGMA table_info(...)`), comme le fait déjà
> `database/connection.py::ensure_schema()`. Le DDL de l'annexe est donc illustratif.

### 13.2 `trigger_rules` (nouvelles colonnes)

Ajoute `conditions`, `window_spec`, `cooldown_spec`, `budget_spec`, `probability`,
`match_mode`, `stop_processing`, `silent` et `schema_version`.

### 13.3 `trigger_actions` (nouvelles colonnes)

Ajoute `delay_seconds`, `condition`, `probability` et `clamp_spec`.

### 13.4 `rule_runs`

Trace d'évaluation : règle, `matched`, raison du skip, latence, ids d'actions, trace détaillée.

### 13.5 `rule_state`

Cooldowns et fenêtres persistants par `(rule_id, scope_key)` : dernier tir, compteur,
début de fenêtre, valeur de fenêtre.

### 13.6 `actors` / `actor_identities` / `actor_stats`

Identité unifiée (`actors`), identités par plateforme (`actor_identities`) et compteurs
par type d'événement (`actor_stats`).

### 13.7 `effect_ledger`

Idempotence et audit des effets : event, règle, action, payload, clamp, raison, statut.

### 13.8 `event_dedupe`

Déduplication persistante des événements critiques, avec TTL.

### 13.9 `connector_state`

Curseurs de polling (Reddit, Chaster conversations, RSS) et état de santé des connecteurs.

### 13.10 `scenario_runs` (phase ultérieure)

Exécution des scénarios et de leurs étapes : statut, étape courante, état JSON, échéances.

### 13.11 Index, rétention, FTS

- `PRAGMA journal_mode=WAL;` et `PRAGMA synchronous=NORMAL;` pour la connexion du journal.
- Index `(event_type, triggered_at)`, `(session_id, triggered_at)`, `(actor_id, triggered_at)`.
- FTS5 optionnel sur le texte des payloads (`event_search`).
- Rétention par type : `retention_days` dans `EventDef` ; purge planifiée.
- Archive JSONL avant purge si nécessaire.

### 13.12 Migrations

- `database/connection.py::ensure_schema()` : `PRAGMA table_info` puis `ALTER TABLE ADD COLUMN` idempotent.
- Les nouvelles tables sont créées par `Base.metadata.create_all`.
- Toujours tester `ensure_schema()` deux fois de suite (base neuve + base ancienne).
- Ne pas oublier les index (SQLite ne les ajoute pas aux tables existantes).

---

## 14. API et WebSocket

### 14.1 REST

| Endpoint                                | Rôle                                         |
| --------------------------------------- | -------------------------------------------- |
| `GET /api/events/types`                 | catalogue + `json_schema`, `aliases`, `nsfw` |
| `GET /api/events/action-types`          | catalogue + `params_schema`                  |
| `POST /api/events/simulate`             | event + draft de règle → résultat détaillé   |
| `GET /api/events/{event_id}/runs`       | trace des règles                             |
| `GET /api/events/search`                | recherche FTS                                |
| `POST /api/events/replay`               | rejeu dry-run/live                           |
| `GET /api/actors`                       | liste + stats                                |
| `PATCH /api/actors/{id}`                | trust, block, tags                           |
| `GET /api/connectors`                   | statut, santé, capacités                     |
| `POST /api/connectors/{id}/test`        | événement de test                            |
| `GET /api/consent` / `PUT /api/consent` | profil de consentement                       |
| `GET /api/budgets`                      | jauges                                       |

### 14.2 WebSocket

- `events:triggered` : enveloppe complète (redacted).
- `events:rule_run` : trace (admin uniquement).
- `events:simulate` : requête/réponse.
- `connectors:load` / `connectors:update` / `connectors:health`.
- `actors:load` / `actors:update`.
- `consent:load` / `consent:update`.
- `budgets:load` / `budgets:update`.

Exemple `events:triggered` :

> **Code** — voir [events-v2-code.md](events-v2-code.md), section « 14.2 — events:triggered ».

### 14.3 Codegen

Après modification du schéma WS ou des enums `Role` / `Permission` :

```bash
pnpm codegen:ws
pnpm --filter front typecheck
```

Ne jamais éditer `*.generated.ts` à la main.

---

## 15. Frontend

### 15.1 Rule builder

- Arbre récursif all/any/not.
- Autocomplétion des champs depuis le JSON Schema de l'événement.
- Aperçu du payload normalisé.
- Validation côté client + serveur.
- Drag-and-drop des actions (existant à conserver).
- Section « Avancé » : fenêtre, cooldown, budget, probabilité, silent.

### 15.2 « Explain »

C'est la feature qui rend le moteur utilisable :

- sélectionner un événement passé ;
- afficher chaque règle : matchée / skip / erreur ;
- pour chaque condition : passée / échouée / valeur réelle ;
- pour chaque action : créée / clampée / bloquée / différée ;
- bouton « Rejouer en dry-run ».

### 15.3 Connecteurs

- Cartes par connecteur : statut, dernier événement, taux, erreurs, latence.
- Bouton « Tester » (émet un événement de test).
- Pairing code pour Vencord/companion.
- Allowlist de guildes/salons.
- Mode privacy (contenu : none / hash / redacted / full).

### 15.4 Acteurs

- Liste, recherche, fiche.
- Identités par plateforme.
- Trust, tags, notes, block.
- Stats : événements, temps ajouté, tips, dernier vu.
- Fusion manuelle de deux acteurs.

### 15.5 Console et replay

- Filtres : source, type, acteur, session, tag, sévérité.
- Recherche FTS.
- Inspecteur de payload + raw (redacted).
- Vue chaîne de causation (graphe).
- Replay : sélection → dry-run ou live.
- Export JSON/CSV.

### 15.6 Consentement et budgets

- Éditeur de profil de consentement.
- Jauges : intensité/heure, temps ajouté/heure, actions/min.
- Historique des clamps/rejets.
- Bouton panic toujours visible.

---

## 16. Plan d'implémentation

### 16.1 Phases

| Phase | Contenu                                                             | Dépendances | Valeur                        |
| ----- | ------------------------------------------------------------------- | ----------- | ----------------------------- |
| **0** | Envelope + event log + `rule_runs` + `events:simulate`              | —           | Debuggable, socle de tout     |
| **1** | Conditions + templating + cooldowns + wildcards + cache             | 0           | Puissance immédiate           |
| **2** | SDK connecteurs + webhook générique + RSS + IMAP + mobile companion | 0           | Longue traîne                 |
| **3** | Discord bot + Vencord + Chaster complet                             | 1, 2        | Les deux plus grosses sources |
| **4** | Fenêtres/agrégats + scheduler + scénarios                           | 1           | Mécaniques avancées           |
| **5** | Identité + budgets + Safety Governor                                | 0, 4        | Sécurité multi-sources        |
| **6** | Reddit/X/Bluesky/Mastodon/Telegram/Twitch/Throne/cam sites/VR/santé | 2           | Couverture                    |
| **7** | Rule packs, replay avancé, overlay, PWA keyholder, fédération       | 3, 4, 5     | Expérience complète           |

### 16.2 Fichiers

```
apps/app/src/events/
  envelope.py
  bus.py
  pipeline/
    normalize.py
    dedupe.py
    policy.py
    enrich.py
    match.py
    aggregate.py
    effects.py
  rules/
    schema.py
    compiler.py
    operators.py
    windows.py
  templating.py
  safety.py
  scheduler.py
  store.py

apps/app/src/integrations/connectors/
  base.py
  manifest.py
  transports/
    webhook.py
    ws_server.py
    ws_client.py
    poller.py
    long_poll.py
    rss.py
    imap.py
    mqtt.py

apps/app/src/integrations/discord/
  bot.py
  vencord.py
  events.py
  actions.py

apps/app/src/integrations/{reddit,bluesky,mastodon,telegram,throne,chaturbate,stripchat,emlalock,...}/
```

### 16.3 Tests

Le repo n'a pas de suite de tests ; le moteur de règles justifie d'en introduire une.

- pytest sur `operators.py`, `windows.py`, `templating.py`, `safety.py`.
- Golden tests : `event JSON → actions attendues`.
- Tests de non-régression sur les alias legacy.
- Tests de migration `ensure_schema()` (base neuve + base ancienne).
- Tests de charge : 1 000 events/s en mémoire, mesure du temps de matching.

### 16.4 Risques

| Risque                             | Mitigation                                                      |
| ---------------------------------- | --------------------------------------------------------------- |
| Volume Discord/Reddit → DB saturée | Filtres ingress, sampling, batch, rétention, WAL                |
| Boucles d'événements               | `causation_id`, `chain_depth`, `system.*`, cap                  |
| Règles communautaires dangereuses  | Capabilities, sandbox, review, consent                          |
| Contournement des limites          | Safety Governor hors règles, tests dédiés                       |
| Rupture de compatibilité           | Façade `dispatch`, alias, migrations additives                  |
| ToS / ban                          | Bot officiel prioritaire, extension opt-in documentée           |
| Fuite de données intimes           | Privacy by default, redaction, rétention, chiffrement optionnel |

---

## 17. Décisions ouvertes

1. **Discord** : bot officiel seul au départ, ou bot + Vencord dès la phase 3 ?
2. **X** : payer l'API v2, ou se contenter de l'extension/RSS ?
3. **Multi-utilisateur** : une seule session active (actuel), ou participants multiples (wearer/keyholder/viewer) avec consentements séparés ?
4. **Scénarios** : moteur de workflow complet, ou règles composées + `EMIT_EVENT` suffisent au début ?
5. **Rétention** : combien de temps pour le chat, les paiements, les événements système ?
6. **Chiffrement** : SQLCipher au repos, ou redaction + accès local uniquement ?
7. **Plugins communautaires** : process séparé dès le départ, ou plus tard ?

---

## 18. Annexes

### A. Glossaire

| Terme           | Définition                                                                  |
| --------------- | --------------------------------------------------------------------------- |
| **Envelope**    | Enveloppe canonique d'un événement (id, type, acteur, payload, corrélation) |
| **Connecteur**  | Adaptateur qui reçoit des événements d'une source et les normalise          |
| **Transport**   | Mécanisme de communication (webhook, WS, polling, RSS, IMAP)                |
| **Rule run**    | Trace d'évaluation d'une règle pour un événement                            |
| **Window**      | Fenêtre temporelle glissante pour les agrégats                              |
| **Cooldown**    | Période minimale entre deux déclenchements                                  |
| **Budget**      | Plafond d'effets par unité de temps                                         |
| **Governor**    | Composant qui applique les limites de consentement                          |
| **Effect**      | Action concrète créée par une règle                                         |
| **Causation**   | Lien entre un événement et celui qui l'a causé                              |
| **Correlation** | Lien entre tous les événements d'une même chaîne                            |

### B. Correspondance legacy → v2

| Legacy                     | v2                                    |
| -------------------------- | ------------------------------------- |
| `chaster_pillory_vote`     | `chaster.pillory.voted`               |
| `chaster_pillory_started`  | `chaster.pillory.started`             |
| `chaster_pillory_ended`    | `chaster.pillory.ended`               |
| `chaster_vote_add`         | `chaster.link.voted` (positif)        |
| `chaster_vote_sub`         | `chaster.link.voted` (négatif)        |
| `chaster_time_add`         | `chaster.lock.time_changed` (positif) |
| `chaster_time_sub`         | `chaster.lock.time_changed` (négatif) |
| `chaster_wof_turned`       | `chaster.wof.landed`                  |
| `chaster_lock_frozen`      | `chaster.lock.frozen`                 |
| `chaster_lock_unfrozen`    | `chaster.lock.unfrozen`               |
| `sensor_sound_alarm`       | `sensor.sound.alarm`                  |
| `sensor_position_alarm`    | `sensor.position.alarm`               |
| `sensor_move_alarm`        | `sensor.move.alarm`                   |
| `training_session_started` | `training.session.started`            |
| `training_edge_recorded`   | `training.edge.recorded`              |
| `training_goal_reached`    | `training.goal.reached`               |
| `lovense_device_connected` | `lovense.device.connected`            |
| `lovense_battery_low`      | `lovense.battery.low`                 |

Les deux ids restent valides via `EventDef.aliases`.

### C. Exemples de règles JSON

Voir [6.12](#612-exemples-complets).

### D. Checklist de sécurité

- [ ] Credentials Chaster sans valeur par défaut.
- [ ] HMAC/Ed25519 sur tous les webhooks.
- [ ] Allowlist IP pour les webhooks exposés.
- [ ] Pairing code + token pour les WS clients.
- [ ] Bind `127.0.0.1` par défaut.
- [ ] TLS si écoute distante.
- [ ] Rate limit par connecteur et par acteur.
- [ ] Taille max de payload.
- [ ] Validation JSON Schema.
- [ ] Redaction avant stockage/broadcast.
- [ ] Pas de contenu de message par défaut.
- [ ] Rétention configurée.
- [ ] Safety Governor appliqué après les règles.
- [ ] Limites dures non éditables par les règles.
- [ ] Panic accessible même si l'UI est bloquée.
- [ ] Dead man's switch.
- [ ] Audit append-only.
- [ ] Tests unitaires du gouvernor.
- [ ] Documentation des risques ToS.
- [ ] Gate 18+ et mode NSFW.

### E. Références externes

- Chaster API : <https://docs.chaster.app/api/basics/introduction>
- Chaster extension communication : <https://docs.chaster.app/api/extensions-api/extension-communication/introduction/>
- Throne webhooks : <https://help.throne.com/en/articles/15935990-how-do-i-set-up-webhook-integration>
- Chaturbate Developer Portal : <https://devportal.cb.dev/>
- Chaturbate Events API (exemple communautaire) : <https://github.com/MountainGod2/cb-events>
- Stripchat Extensions API : <https://extensions.stripchat.com/docs/api/events>
- Emlalock API : <https://about.emlalock.com/docs/api/time/add/>
- Bluesky Jetstream : <https://github.com/bluesky-social/jetstream>
- Mastodon streaming API : <https://docs.joinmastodon.org/methods/streaming/>
- Discord developer docs : <https://discord.com/developers/docs/intro>
- Reddit API : <https://www.reddit.com/dev/api/>

# Events v3 — Intégrations et connecteurs

> Statut : connecteur générique implémenté (entrant + sortant) ; connecteurs nominatifs à brancher au cas par cas.
> Portée : sources d'événements, actions exposées, transports, priorités, risques.
> Ce document est **séparé du plan moteur** : [events-v3-flows.md](events-v3-flows.md) décrit le Flow Engine, la télémétrie et le Safety Governor, pas les intégrations.
> Documents liés : [events-v2.md](events-v2.md), [events-v2-code.md](events-v2-code.md), [integrations.md](integrations.md), [lovense.md](lovense.md).

---

## Table des matières

1. [Principes](#1-principes)
2. [Contrat de connecteur](#2-contrat-de-connecteur)
3. [Transports](#3-transports)
4. [PES Link](#4-pes-link)
5. [Discord](#5-discord)
6. [Chaster](#6-chaster)
7. [Réseaux sociaux](#7-réseaux-sociaux)
8. [Plateformes NSFW](#8-plateformes-nsfw)
9. [Hardware et immersif](#9-hardware-et-immersif)
10. [Connecteurs génériques](#10-connecteurs-génériques)
11. [Priorisation](#11-priorisation)
12. [Sécurité, vie privée, ToS](#12-sécurité-vie-privée-tos)
13. [Décisions ouvertes](#13-décisions-ouvertes)

---

## 1. Principes

1. **Le connecteur normalise, il ne décide pas.** Il produit des `EventEnvelope` ; le Flow Engine décide.
2. **Aucun connecteur ne touche au hardware.** Les actions passent par l'Effect Planner et l'`ActionQueue`.
3. **Chaque connecteur est isolé.** Une panne, un rate limit ou un payload invalide ne doit jamais crasher le bus.
4. **Tout est dédupliqué.** `dedupe_key` fourni par le connecteur (`message.id`, `event_id`, `guid` RSS…).
5. **Le volume est un risque.** Filtres d'ingress, sampling, backpressure et rétention avant d'ajouter une source.
6. **Privacy by default.** Pas de contenu de message stocké, hash + catégories, raw désactivé.
7. **Les ToS sont explicites.** Chaque connecteur déclare son mode d'accès et son risque.

---

## 2. Contrat de connecteur

Chaque intégration expose un **manifeste** validé au chargement. Le manifeste est la source des événements, actions, settings et capacités ; il alimente le catalogue backend et la génération TypeScript.

```yaml
id: discord_bot
name: Discord (bot)
version: 1
kind: external
nsfw: true
capabilities:
  - emit
  - actions
  - state:read
transport: gateway
auth:
  type: token
  secret: DISCORD_BOT_TOKEN
events:
  - id: discord.message.created
    label: Message créé
    group: Messages
    json_schema: schemas/discord_message_created.json
    dedupe_key: payload.message.id
    retention_days: 30
  - id: discord.message.mention
    label: Mention reçue
    group: Mentions
    json_schema: schemas/discord_message_mention.json
actions:
  - id: discord.message.send
    label: Envoyer un message
    params_schema: schemas/discord_message_send.json
    risk: external
    reversible: false
    one_shot: true
settings:
  - key: guild_ids
    type: list
    label: Serveurs autorisés
  - key: include_dms
    type: bool
    default: false
privacy:
  content: hash # none | hash | redacted | full
  raw: false
rate_limit:
  events_per_minute: 600
  actions_per_minute: 30
```

### 2.1 Capacités

| Capacité     | Sens                                            |
| ------------ | ----------------------------------------------- |
| `emit`       | peut produire des événements                    |
| `actions`    | peut exécuter des actions                       |
| `state:read` | peut lire l'état (units, session, queue)        |
| `secrets`    | peut lire ses propres secrets                   |
| `files`      | peut lire/écrire des fichiers (rare, dangereux) |
| `hardware`   | peut piloter du hardware (core uniquement)      |

Un connecteur communautaire ne devrait avoir que `emit` + `state:read`. Les connecteurs qui agissent doivent être signés/reviewés.

### 2.2 Cycle de vie

```
created → configured → connecting → online → degraded → offline → stopped
```

- `health()` expose statut, dernier événement, taux, erreurs, latence.
- Circuit breaker après N erreurs consécutives.
- Backoff exponentiel avec jitter.
- Événements `system.connector.online` / `system.connector.offline`.
- Un connecteur désactivé ne doit ni émettre ni exécuter d'action.

### 2.3 Filtres d'ingress

Chaque connecteur déclare ses filtres :

```yaml
filters:
  guild_ids: ["..."]
  channel_ids: ["..."]
  include_dms: true
  nsfw_only: false
  ignore_bots: true
  event_types: ["discord.message.created", "discord.reaction.added"]
  keyword_regex: ["\\b(punition|edge|deny)\\b"]
  sample_rate: 1.0
```

Sans ces filtres, un serveur Discord actif peut générer des milliers d'événements par minute et saturer SQLite.

---

## 3. Transports

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

---

## 4. PES Link

Un seul protocole pour Vencord, le companion mobile, le companion desktop et les extensions navigateur.

### 4.1 Handshake

```
client → hello { client_id, version, capabilities, pairing_code? }
server → hello_ok { session_token, server_time, config }
client → subscribe { topics: ["discord.message.created", ...] }
server → subscribed { topics, filters }
client → event { envelope }
server → ack { event_id }
client → heartbeat { ts }
server → heartbeat_ok { ts }
```

### 4.2 Règles

- Token obligatoire, pairing code à 6 chiffres, origin allowlist.
- Bind `127.0.0.1` par défaut ; TLS obligatoire au-delà de localhost.
- Taille max par message (256 Ko), profondeur JSON limitée.
- Rate limit par client et par type d'événement.
- Buffer borné quand offline ; le client ne bloque jamais le dispatcher Discord.
- Ack + retry idempotent : le serveur déduplique sur `dedupe_key`.

### 4.3 Privacy modes

| Mode       | Contenu envoyé                                     |
| ---------- | -------------------------------------------------- |
| `none`     | uniquement les métadonnées (type, ids, timestamps) |
| `hash`     | hash du contenu + catégories calculées localement  |
| `redacted` | contenu avec les secrets/mots sensibles masqués    |
| `full`     | contenu complet (opt-in explicite)                 |

Le mode par défaut est `hash`. Les règles de catégories (keywords/regex) sont envoyées par PES au client pour qu'il calcule localement `is_mention`, `keyword_hit`, `nsfw`, etc.

---

## 5. Discord

### 5.1 Deux modes, un namespace

| Mode             | Ce qu'il voit                                                | Ce qu'il peut faire                                                        | Risque      |
| ---------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------- |
| **Bot officiel** | guildes où il est invité, salons autorisés, DMs si configuré | envoyer, réagir, DM, thread, timeout, rôle, vocal, boutons, slash commands | Faible      |
| **Vencord**      | DMs, présence, salons NSFW accessibles au compte, réactions  | lecture seule par défaut ; envoi opt-in et documenté comme risqué          | Élevé (ToS) |

Recommandation : bot officiel pour les actions, Vencord pour les événements que le bot ne voit pas. Dédup sur `message.id`.

### 5.2 Événements

| Domaine      | Événements                                                                                |
| ------------ | ----------------------------------------------------------------------------------------- |
| Messages     | `discord.message.created`, `updated`, `deleted`, `mention`, `pinned`, `attachment.posted` |
| DMs          | `discord.dm.received`, `discord.call.incoming`                                            |
| Réactions    | `discord.reaction.added`, `removed`, `milestone`                                          |
| Vocal        | `discord.voice.joined`, `left`, `moved`, `streaming`                                      |
| Présence     | `discord.presence.updated`                                                                |
| Membres      | `discord.member.joined`, `left`, `role.added`, `role.removed`                             |
| Threads      | `discord.thread.created`, `updated`                                                       |
| Interactions | `discord.interaction.button`, `discord.command.used`                                      |
| Polls        | `discord.poll.voted`                                                                      |

### 5.3 Actions

- Webhook simple pour les notifications.
- Bot pour : envoyer/éditer/supprimer, réagir, DM, thread, timeout, rôle, déplacer en vocal, boutons d'approbation.
- Slash commands : `/pes status`, `/pes deny 30`, `/pes reward`, `/pes stop` — vérification de rôle, réponse éphémère.
- Salons age-restricted : vérifier les règles Discord côté bot (app 18+, permissions).
- Les actions d'envoi via Vencord sont **opt-in** et désactivées par défaut.

### 5.4 Vencord : événements utiles

- `MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE`, `MESSAGE_DELETE_BULK`
- `MESSAGE_REACTION_ADD`, `MESSAGE_REACTION_REMOVE`, `MESSAGE_REACTION_REMOVE_ALL`
- `TYPING_START`, `CALL_UPDATE`, `CALL_DELETE`
- `VOICE_STATE_UPDATES`, `PRESENCE_UPDATES`
- `GUILD_MEMBER_ADD/UPDATE/REMOVE`, `CHANNEL_CREATE/UPDATE/DELETE`
- `THREAD_CREATE/UPDATE`, `RELATIONSHIP_ADD/REMOVE`
- `INTERACTION_*`, `MESSAGE_ACK`

Calcul de `is_mention` : `mentions` contient l'utilisateur courant, `mention_roles`, `mention_everyone`, `message_reference`.

NSFW : `channel.nsfw`, `guild.nsfw_level`, attachments `spoiler`, `content_type`.

### 5.5 Payload normalisé

Le payload Discord doit rester stable et documenté :

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

Le champ `raw` est optionnel, redacted, et jamais exposé aux règles.

---

## 6. Chaster

### 6.1 Ce qui existe déjà

- Webhook `POST /webhooks/chaster` (Basic auth).
- `action_log.created` : `wheel_of_fortune_turned`, `time_changed`, `link_time_changed`, `lock_frozen`, `lock_unfrozen`, `pillory_in`, `pillory_out`.
- WOF custom codes via `dispatch_direct`.
- Action `CHASTER_TIME_UPDATE`.

### 6.2 Événements à ajouter

| Domaine           | Événements                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Messagerie        | `chaster.message.received`, `sent`, `conversation.unread`                                      |
| Notifications     | `chaster.notification.received`                                                                |
| Lock              | `chaster.lock.time_changed`, `frozen`, `unfrozen`, `unlocked`, `archived`, `max_limit_changed` |
| Pillory           | `chaster.pillory.started`, `ended`, `voted`                                                    |
| Tasks             | `chaster.tasks.assigned`, `completed`, `failed`, `vote_ended`, `vote_cancelled`                |
| Penalty           | `chaster.penalty.incremented`, `time_limit_created`, `cancelled`                               |
| Verification      | `chaster.verification.requested`, `submitted`, `verdict`                                       |
| Temporary opening | `chaster.temporary_opening.opened`, `relocked`, `late`                                         |
| Dice / WOF        | `chaster.dice.rolled`, `chaster.wof.landed`                                                    |
| Shared link       | `chaster.link.voted`, `time_changed`                                                           |

### 6.3 Actions à ajouter

`lock.add-time`, `lock.remove-time`, `lock.freeze`, `lock.unfreeze`, `lock.toggle-freeze`, `lock.pillory`, `lock.set-display-remaining-time`, `tasks.assign`, `tasks.start-timer`, `tasks.complete`, `penalty.increment`, `penalty.create-time-limit`, `verification.request`, `temporary-opening.open`, `conversation.send`, `conversation.create`.

### 6.4 Messagerie et notifications

La messagerie n'a pas de webhook dédié : polling contrôlé.

```
GET /conversations
GET /conversations/{conversationId}/messages
GET /conversations/by-user/{userId}
PUT /conversations/{conversationId}/unread
```

- Curseur `lastMessageId` / `updatedAt` dans `connector_state`.
- Rate limits : 500 messages/jour, 20 conversations/jour.
- Événement `chaster.message.received` avec `conversation.role`, `author`, `text`, `attachments`, `unread_count`.
- Notifications : `GET /notifications` → `chaster.notification.received`.

### 6.5 Idempotence et sécurité

- Utiliser `lock_event.created` (flux ordonné) **et** `action_log.created`.
- Dédupliquer sur `data.actionLog._id` / `data.eventId`, jamais sur `requestId`.
- Répondre `2xx` aux événements non gérés.
- Propager `causationId` dans `causation_id`.
- Vérifier `X-Chaster-Event-Id`.
- Supprimer les credentials par défaut `sereti` / `password` ; exiger une configuration explicite.
- Ajouter une allowlist IP et un rate limit.

---

## 7. Réseaux sociaux

| Intégration     | Transport               | Événements clés                                        | NSFW | Effort       | Risque          |
| --------------- | ----------------------- | ------------------------------------------------------ | ---- | ------------ | --------------- |
| **Reddit**      | OAuth2 + polling        | post, comment, mention, reply, modmail, modqueue       | 🔞   | Moyen        | Moyen           |
| **Bluesky**     | AT Protocol / Jetstream | post, like, follow, mention, reply, DM                 | 🔞   | Faible-Moyen | Faible          |
| **Mastodon**    | Streaming API           | mention, DM, hashtag, follow, boost, fav               | 🔞   | Faible       | Faible          |
| **Telegram**    | Bot API / MTProto       | message, mention, réaction, join/leave, callback, poll | 🔞   | Moyen        | Moyen (MTProto) |
| **X / Twitter** | API v2 payante          | mention, DM, like, repost, quote, follow, post         | 🔞   | Moyen (coût) | Moyen           |
| **Twitch**      | EventSub + IRC          | sub, bits, raid, channel points, prédiction, chat      | ⚠️   | Faible       | Faible          |

### 7.1 Reddit

- OAuth2 (script app), polling `/r/{sub}/new`, `/user/{me}/inbox`, `/about/modqueue`, `/about/modmail`.
- Dédup par `thing.id` (`t3_...`, `t1_...`).
- Respecter `X-Ratelimit-*`.
- NSFW : `over_18`, galleries, media.

### 7.2 Bluesky

- AT Protocol, Jetstream (`wss://jetstream2.us-east.bsky.network/subscribe`).
- Excellent rapport simplicité/coût, pas de ToS problématique.
- NSFW : labels `adult`, `self`, `sensitive`, `contentWarnings`.

### 7.3 Mastodon

- Streaming API par instance, notifications, hashtag timeline, DMs.
- NSFW : `spoiler_text` (content warning), `sensitive` media.

### 7.4 Telegram

- Bot API : messages dans les groupes où le bot est admin, commandes, boutons, paiements, polls.
- MTProto (Telethon) pour les DMs/channels du compte utilisateur — **risque ToS**.
- Très bon canal de contrôle distant (`/deny 30`, `/status`, `/stop`).

### 7.5 X / Twitter

- API v2 payante. Stream filtré (enterprise) ou polling mentions/DMs.
- NSFW : labels adultes, `possibly_sensitive`, media metadata.
- Coût/limites à documenter ; alternative extension si le tier ne suffit pas.

### 7.6 Twitch

- EventSub : `channel.subscribe`, `channel.cheer`, `channel.raid`, `channel.follow`, `channel.channel_points_custom_reward_redemption.add`, `channel.prediction.*`.
- IRC pour le chat et les commandes.
- Twitch restreint le contenu sexuel ; pour le NSFW, préférer Chaturbate/Stripchat.

---

## 8. Plateformes NSFW

### 8.1 API officielle

| Intégration                | Transport               | Événements clés                                           | Effort | Risque |
| -------------------------- | ----------------------- | --------------------------------------------------------- | ------ | ------ |
| **Throne**                 | Webhook Ed25519         | gift, contribution, crowdfund                             | Faible | Faible |
| **Chaturbate**             | Events API long polling | tip, chat, PM, follow, fanclub, media purchase, broadcast | Moyen  | Moyen  |
| **Stripchat**              | Extensions API          | tip, chat, context                                        | Moyen  | Moyen  |
| **Emlalock**               | API polling             | time changed, session updated/ended                       | Faible | Faible |
| **Chaturbate / cam sites** | selon plateforme        | tip, private show, follow                                 | Moyen  | Moyen  |

#### Throne

- Webhook officiel, signature Ed25519, `event_id` pour l'idempotence.
- Événements : `throne.gift.purchased`, `throne.contribution.purchased`, `throne.gift.crowdfunded`.
- Payload : `creator_id`, `creator_username`, `gifter_username`, `message`, `item_name`, `price`, `currency`.
- Vérifier `X-Signature-Timestamp` + `X-Signature-Ed25519` avant toute logique.

#### Chaturbate

- Events API officielle : long polling avec `nextUrl`.
- Événements : `chaturbate.tip.received`, `chat.message`, `private_message.received`, `follow`, `unfollow`, `fanclub.join`, `media.purchase`, `broadcast.started/stopped`, `room.subject_changed`.
- Un seul consommateur par session ; ne pas redémarrer au milieu d'un stream.
- Dédup par id d'événement, sinon hash de `method + timestamp + user + payload`.

#### Stripchat

- Extensions API officielle (iframe) : `v1.tokens.spent`, `v1.ext.context.updated`, chat.
- Le pont vers PES dépend des restrictions CSP de l'iframe ; à valider.
- Sinon, Studio API pour les stats (moins temps réel).

#### Emlalock

- API publique : `add`, `info`, minimum/maximum.
- Événements (polling) : `emlalock.session.updated`, `time.changed`, `session.ended`.
- Actions : ajouter/retirer du temps, ajuster min/max.
- Alternative à Chaster pour la chasteté.

### 8.2 Sans API publique

| Intégration                            | Transport                            | Événements                                                                | Risque         |
| -------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------- | -------------- |
| **FetLife**                            | IMAP + extension + RSS partiel       | friend request, message, wall post, group post, RSVP, photo comment, love | Moyen          |
| **OnlyFans**                           | Extension + notifications mobiles    | abonné, renouvellement, tip, PPV, message, like, expiration               | Élevé (ToS)    |
| **Fansly**                             | Extension + notifications            | idem                                                                      | Élevé          |
| **LoyalFans / ManyVids / JustForFans** | Extension / API partielle à vérifier | tip, achat, abonnement, message                                           | Élevé          |
| **Grindr / Tinder / Feeld**            | Extension navigateur                 | tap/match/message                                                         | Élevé          |
| **Recon / Gearfetish / Kinksters**     | Extension / IMAP                     | message, friend, event                                                    | Moyen          |
| **Cam4 / BongaCams / CamSoda / MFC**   | Extension + notifications            | tip, private show, follow                                                 | Moyen          |
| **Pornhub / xHamster**                 | Extension                            | commentaire, like, upload                                                 | Faible intérêt |
| **Instagram / TikTok / Snapchat**      | Extension                            | DM, mention, commentaire                                                  | Élevé          |

Règles :

- Ne jamais stocker les credentials du site ; utiliser la session du navigateur ou les notifications.
- Ne pas aider à contourner un paywall ou un système d'âge.
- Les intégrations de scraping sont opt-in, signalées comme fragiles, et peuvent casser sans préavis.

### 8.3 Médias adultes et communautés

| Intégration                                       | Transport     | Événements                                  |
| ------------------------------------------------- | ------------- | ------------------------------------------- |
| **Redgifs**                                       | API/RSS       | nouveau post par tag, likes, vues           |
| **e621 / Danbooru / Rule34 / Gelbooru / Sankaku** | API publique  | nouveau post par tag, favoris, commentaires |
| **AO3**                                           | RSS / IMAP    | nouveau chapitre, kudos, commentaire        |
| **Literotica**                                    | RSS / IMAP    | nouvelle histoire, commentaire              |
| **Chastikey**                                     | API/web       | timer, combination, lock/unlock             |
| **WarpMyMind / hypno**                            | extension/RSS | nouveau contenu, session                    |

### 8.4 Idées de mécaniques NSFW

- **Audience control** : votes pondérés par abonné/donation, seuil de consensus, veto du keyholder.
- **Tribute wallet** : chaque tip crédite des tokens ; les viewers les dépensent pour déclencher une action.
- **Denial debt / edge bank** : chaque edge ajoute une dette, chaque heure de denial la réduit, avec intérêts.
- **Vérification photo** : code aléatoire, NSFWJS/PuryFi, approbation manuelle, stockage d'un hash.
- **Exposure meter** : likes/commentaires/reposts sur un post NSFW → score → intensité/temps, avec décroissance.
- **Cross-platform actor multiplier** : la même personne qui ping sur Discord et vote sur Chaster en 10 min → effet doublé.
- **Remote keyholder PWA** : feed live, boutons reward/punish, file d'approbation, panic, push.
- **AI dungeon master** : LLM local lit l'événement + l'état + les limites et propose une tâche ; approbation humaine.
- **Public control page** : page anonyme rate-limitée, captcha, budget, bouton d'arrêt d'urgence.
- **Wearable arousal proxy** : HR/HRV → « arousal detected » → edge/reward.
- **Lockbox / NFC chores** : scan NFC, photo avec objet, calendrier, step count.
- **Aftercare automation** : fin de session/panic → message d'aftercare, baisse d'intensité, détection de drop.
- **Stream overlay** : source navigateur OBS : intensité, temps restant, derniers événements, QR de contrôle.
- **Partner-to-partner federation** : deux instances PES appairées, événements miroir, consentement mutuel.
- **Consent receipts** : profil de consentement signé, actions hors limites rejetées et loggées, export.

---

## 9. Hardware et immersif

| Intégration                            | Transport           | Événements / actions                                    | NSFW | Risque |
| -------------------------------------- | ------------------- | ------------------------------------------------------- | ---- | ------ |
| **Buttplug.io / Intiface**             | WebSocket local     | tous jouets compatibles : vibration, rotation, patterns | 🔞   | Faible |
| **Lovense**                            | WebSocket/relais    | déjà intégré                                            | 🔞   | Faible |
| **The Handy / OSR2 / SR6**             | API locale / serial | stroke, speed, FunScript                                | 🔞   | Moyen  |
| **VRChat OSC**                         | OSC                 | paramètres avatar, casque retiré, chatbox, haptics      | 🔞   | Moyen  |
| **Haptics (OWO, bHaptics, Teslasuit)** | API locale          | vibrations, zones, intensité                            | 🔞   | Moyen  |
| **Wearables (HR, HRV, sommeil)**       | BLE / API           | seuils, arousal proxy, aftercare                        | 🔞   | Faible |
| **Home Assistant / MQTT**              | Webhook/MQTT        | lockbox, prise, présence, capteur, lumière              | 🔞   | Faible |
| **NFC / smart lockbox**                | local               | scan, ouverture/fermeture, preuve                       | 🔞   | Moyen  |
| **OBS**                                | WebSocket           | scène, recording, streaming, replay                     | 🔞   | Faible |

### 9.1 Buttplug.io / Intiface

C'est l'intégration la plus rentable côté jouets : un seul connecteur couvre Lovense, We-Vibe, Kiiroo, Satisfyer, Magic Motion, OhMiBod, Vorze et beaucoup d'autres. Le repo a déjà Lovense ; Buttplug généralise.

### 9.2 The Handy / OSR2 / SR6

- Synchronisation avec du contenu vidéo et des FunScript.
- Événements de lecture, de pause, de fin.
- Actions : vitesse, position, pattern.
- Attention : ce sont des périphériques physiques à mouvement ; les caps et le panic sont obligatoires.

### 9.3 VRChat OSC

- Recevoir `/avatar/parameters/*`, détecter le casque retiré, envoyer chatbox/haptics.
- Très pertinent pour les clubs NSFW privés et les sessions VR.
- NSFW : paramètres d'avatar, proximity, haptics.

### 9.4 Wearables et smart home

- HR/HRV : `health.hr.threshold`, `health.hrv.drop`, `health.sleep.score`, `health.steps.goal`.
- Smart home : `home.lock.opened`, `home.plug.toggled`, `home.presence.changed`.
- Lockbox, curfew, lumière, caméra (opt-in).
- Privacy : les données de santé sont sensibles ; rétention courte, pas de raw.

---

## 10. Connecteurs génériques

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
| **Matrix / Signal**             | messagerie, notifications, commandes                    |
| **Calendar (Google/CalDAV)**    | début/fin de session planifiée                          |

Le **webhook générique** est le connecteur à livrer en premier : il couvre la longue traîne sans code, avec mapping JSONPath/Jinja, HMAC et replay window.

### 10.1 Webhook générique (implémenté)

```http
POST /webhooks/generic
X-PES-Token: <GENERIC_WEBHOOK_TOKEN>
Content-Type: application/json

{
  "event": "deploy_finished",
  "source": "ci",
  "payload": { "branch": "main" }
}
```

Le body est aplati dans `event_data` : les règles voient `payload.event`, `payload.source`, `payload.payload.branch`, etc. L'événement normalisé est `webhook.received`. Le token est obligatoire et lu depuis `GENERIC_WEBHOOK_TOKEN`. `GET /webhooks/generic/health` expose l'état et le compteur de réceptions.

Le connecteur expose aussi une action **`WEBHOOK_SEND`** : une règle peut envoyer `{ url, method, body, headers, timeout_seconds }` vers un webhook externe (Discord, Slack, n8n, maison). Seules les URL http(s) sont acceptées ; les adresses privées/loopback sont bloquées sauf `WEBHOOK_ALLOW_PRIVATE=true`.

Enfin, `GET /api/integrations/manifests` et `GET /api/integrations/{id}/manifest` publient les manifestes de connecteurs (events, actions, settings, `health`, `manifest_version`).

---

## 11. Priorisation

> Cette priorisation est celle des **intégrations**. Elle est indépendante de la roadmap moteur de [events-v3-flows.md](events-v3-flows.md).

| Priorité | Intégration                    | Pourquoi                             | NSFW | Effort | Risque      |
| -------- | ------------------------------ | ------------------------------------ | ---- | ------ | ----------- |
| **P0**   | Discord bot                    | source et actions les plus utilisées | 🔞   | Moyen  | Faible      |
| **P0**   | Vencord (lecture seule)        | DMs, présence, salons NSFW           | 🔞   | Moyen  | Élevé (ToS) |
| **P0**   | Chaster messages/notifications | cœur du produit                      | 🔞   | Moyen  | Faible      |
| **P0**   | Webhook générique              | couvre la longue traîne              | —    | Faible | Faible      |
| **P0**   | RSS / IMAP                     | blogs, notifications, AO3, FetLife   | 🔞   | Faible | Faible      |
| **P1**   | Reddit                         | communautés, comments, modmail       | 🔞   | Moyen  | Moyen       |
| **P1**   | Bluesky                        | realtime simple et pas cher          | 🔞   | Faible | Faible      |
| **P1**   | Mastodon                       | streaming, mentions, DMs             | 🔞   | Faible | Faible      |
| **P1**   | Telegram                       | contrôle distant, groupes            | 🔞   | Moyen  | Moyen       |
| **P1**   | Throne                         | tips/gifts, webhook signé            | 🔞   | Faible | Faible      |
| **P1**   | Chaturbate                     | tips/chat, Events API                | 🔞   | Moyen  | Moyen       |
| **P1**   | Emlalock                       | alternative chasteté                 | 🔞   | Faible | Faible      |
| **P1**   | Buttplug/Intiface              | jouets génériques                    | 🔞   | Moyen  | Faible      |
| **P2**   | X / Twitter                    | mentions/DMs, mais coût              | 🔞   | Moyen  | Moyen       |
| **P2**   | Twitch                         | EventSub, stream                     | ⚠️   | Faible | Faible      |
| **P2**   | Stripchat                      | extensions                           | 🔞   | Moyen  | Moyen       |
| **P2**   | FetLife                        | IMAP + extension                     | 🔞   | Moyen  | Moyen       |
| **P2**   | VRChat OSC                     | immersion, clubs                     | 🔞   | Moyen  | Moyen       |
| **P2**   | OBS / Home Assistant           | overlay, lockbox, présence           | 🔞   | Faible | Faible      |
| **P2**   | Wearables                      | arousal/aftercare                    | 🔞   | Moyen  | Faible      |
| **P3**   | OnlyFans / Fansly              | revenus, mais ToS                    | 🔞   | Moyen  | Élevé       |
| **P3**   | Cam sites                      | tips/private shows                   | 🔞   | Moyen  | Moyen       |
| **P3**   | Dating apps                    | match/message                        | 🔞   | Moyen  | Élevé       |
| **P3**   | Médias adultes                 | tags/likes                           | 🔞   | Faible | Faible      |
| **P3**   | Browser extension générique    | couvre tout le reste                 | 🔞   | Élevé  | Élevé       |
| **P3**   | PES federation                 | partenaire distant                   | 🔞   | Élevé  | Moyen       |

### 11.1 Premier lot recommandé

1. Discord bot (messages, mentions, réactions, DMs).
2. Vencord en lecture seule (DMs, présence, NSFW).
3. Chaster messages + notifications.
4. Webhook générique + RSS + IMAP.
5. Throne + Chaturbate + Emlalock.
6. Buttplug/Intiface.

### 11.2 Ce qu'il faut éviter au début

- OnlyFans/Fansly (ToS, maintenance).
- Dating apps (ToS, scraping).
- X API (coût) tant que le besoin n'est pas validé.
- Un browser extension générique avant d'avoir un SDK stable.

---

## 12. Sécurité, vie privée, ToS

### 12.1 Secrets

- Secrets dans le keyring OS (Windows Credential Manager) ou `config.env`, jamais dans les payloads.
- Webhooks : HMAC + timestamp + fenêtre de replay + allowlist IP.
- Throne : signature Ed25519.
- Chaster : Basic auth + suppression des valeurs par défaut.
- Pairing code à 6 chiffres pour les clients WS, token persistant, bind `127.0.0.1` par défaut.
- TLS obligatoire si le connecteur écoute au-delà de localhost.
- Taille max de payload (256 Ko) et profondeur JSON limitée.
- Rate limit par connecteur et par acteur.

### 12.2 Privacy

- Pas de contenu de message par défaut (Discord, Reddit, OnlyFans).
- Hash + catégories calculées localement.
- Redaction des clés sensibles (`password`, `token`, `secret`, `api_key`, …).
- Rétention par type d'événement (7 jours pour le chat, 1 an pour les paiements).
- Suppression par session sur demande.
- Chiffrement au repos optionnel (SQLCipher) pour les payloads sensibles.
- Les URLs d'attachments CDN ne sont pas stockées par défaut.

### 12.3 ToS et âge

- Gate 18+ à l'installation, flag `nsfw` par connecteur, mode NSFW flouté par défaut.
- Documenter les risques : Vencord/self-bot, OnlyFans, Fansly, Grindr, Tinder, Instagram.
- Le bot Discord officiel reste le chemin recommandé pour les actions.
- Ne pas aider à contourner un paywall ou un système d'âge.
- Les intégrations de scraping sont opt-in et signalées comme fragiles.

### 12.4 Checklist connecteur

- [ ] Manifeste validé.
- [ ] Auth et secrets configurés.
- [ ] Dédup testée.
- [ ] Rate limit et backpressure.
- [ ] Filtres d'ingress.
- [ ] Privacy mode par défaut.
- [ ] Health/circuit breaker.
- [ ] Événement de test.
- [ ] Documentation des risques ToS.
- [ ] Actions classées par risque.
- [ ] Aucun accès direct au hardware.
- [ ] Aucun secret dans les logs/traces.

---

## 13. Décisions ouvertes

1. **Discord : bot seul au départ, ou bot + Vencord ?** Recommandation : bot + Vencord en lecture seule.
2. **X : API v2 payante ou extension ?** Recommandation : attendre, ou extension opt-in.
3. **OnlyFans/Fansly : maintenant ou plus tard ?** Recommandation : plus tard, après le SDK et le browser extension générique.
4. **Cam sites : lesquels en premier ?** Recommandation : Chaturbate, puis Stripchat.
5. **Mobile companion : Android d'abord ?** Recommandation : oui, notification listener.
6. **Browser extension : générique ou par site ?** Recommandation : générique + adaptateurs, après le SDK.
7. **Fédération PES : utile au MVP ?** Recommandation : non, plus tard.
8. **Quel niveau de privacy par défaut ?** Recommandation : `hash` pour le chat, `redacted` pour les paiements.

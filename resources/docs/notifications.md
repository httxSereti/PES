# Notifications in-app

> Centre de notifications de l'application (cloche + toasts) alimenté par le
> pipeline d'évènements. Voir [events-v3-flows.md](events-v3-flows.md) pour le
> moteur de flows et [realtime-architecture.md](realtime-architecture.md) pour
> le contrat WebSocket.

## Déclencheurs

| Source | Toujours notifié ? | Genre (`kind`) |
|---|---|---|
| Règle qui fire avec des actions (`notify_on_fire = true`) | Non — opt-in par règle | `rule_fired` |
| Noeud `effect.notify` d'un flow | Oui | `flow_notify` |
| Noeud `terminal.alert` d'un flow | Oui | `flow_notify` (severity `warning` par défaut) |
| Règle bloquée par cooldown / budget (`notify_on_fire = true`) | Non — opt-in | `warning` |
| Échec du runtime de flow, fallback legacy (`notify_on_fire = true`) | Non — opt-in | `error` |
| Demande d'approbation créée | Oui | `approval` |

`notify_on_fire` est une colonne `trigger_rules.notify_on_fire` (défaut `0`),
exposée dans le contrat WS (`TriggerRule`, `TriggerRuleDraft`,
`TriggerRuleUpdatePayload`) et dans le formulaire de règle (« Notify when this
rule fires »). Les règles existantes restent silencieuses.

## Anti-spam (coalescing)

`services/notifications.py` garde une fenêtre de 4 secondes par clé de
coalescence (`rule:<id>`, `rule-gate:<id>:<raison>`,
`flow-notify:<rule>:<node>`, …). La première occurrence envoie
`notifications:new` ; les répétitions dans la fenêtre mettent à jour la même
notification via `notifications:update` (`count`, `updated_at`). Une règle
capteur qui fire 50 fois par minute produit donc une seule entrée « ×50 ».

Rien n'est persisté côté serveur : le client (Redux) garde l'historique de la
session navigateur, plafonné à 100 entrées.

## Messages WebSocket

Les deux messages sont dans l'audience `READ_EVENTS` :

- `notifications:new` → `InAppNotificationPayload`
  (`id`, `kind`, `severity`, `title`, `message`, `created_at`, `count`, `rule_id`,
  `rule_name`, `event_id`, `event_type`, `origin`, `actions`, `link`, `data`).
- `notifications:update` → `InAppNotificationUpdatePayload` (`id`, `count`,
  `updated_at`).

## Côté front

- `apps/front/src/store/slices/notificationsSlice.ts` : liste, compteur
  non-lu, préférence de toasts (persistée dans `localStorage`).
- `apps/front/src/store/middleware/websocketMiddleware.ts` : dispatch des deux
  messages + toast `sonner` si les toasts sont activés.
- `apps/front/src/components/common/notifications/notifications-bell.tsx` :
  cloche du header, badge non-lu, panneau (marquer tout lu, vider, couper les
  toasts), clic sur une entrée → `link`.

## Ajouter un noeud `effect.notify`

Config du noeud :

```json
{
  "title": "Règle capteur",
  "message": "Mouvement de {{ event.actor.display_name }}",
  "severity": "warning"
}
```

`message` supporte les templates du runtime (`{{ event.… }}`, `{{ vars.… }}`),
comme les autres noeuds. Sans `message`, aucune notification n'est publiée.

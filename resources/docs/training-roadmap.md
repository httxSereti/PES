# Training / Edging — prochaines actions à implémenter

Roadmap des évolutions identifiées pour le module Training après les lots 1 à 5
(auto-stop, participants, pause, métadonnées, événements, templates, programmes,
mode guidé, analytics, édition des programmes/templates et exports).

## Priorités

| Priorité | Chantier                                                     | Impact     | Risque / effort              |
| -------- | ------------------------------------------------------------ | ---------- | ---------------------------- |
| 1        | Conditions de règle                                          | Très élevé | Moyen                        |
| 2        | Actions `TRAINING_*`                                         | Très élevé | Moyen, attention aux boucles |
| 3        | Cooldown / intervalle minimum + préférences de notifications | Élevé      | Faible                       |
| 4        | Automatisation des phases guidées                            | Élevé      | Élevé (hardware)             |
| 5        | Édition templates/programmes + export analytics              | Moyen      | Faible                       |

---

## 1. Conditions de règle

Aujourd'hui, une règle sur `training_edge_recorded` se déclenche à chaque edge.
Ajouter des filtres permettrait de rendre les événements réellement exploitables.

- [ ] `difficulty >= hard`
- [ ] `outcome = fail`
- [ ] `every N edges` (tous les N edges)
- [ ] `edge interval >= X`
- [ ] `goals_met = true`
- [ ] `mode = guided`
- [ ] `session status = running / succeeded / failed`
- [ ] `program_id` / `program_step`

C'est la priorité n°1 : sans conditions, les règles training restent limitées à
des actions statiques.

---

## 2. Actions training dans les trigger rules

Aujourd'hui le training émet des événements mais ne peut pas être piloté par une
règle. Ajouter des actions :

- [x] `TRAINING_START` (depuis un template ou un programme)
- [x] `TRAINING_PAUSE`
- [x] `TRAINING_RESUME`
- [x] `TRAINING_END` (`succeeded`, `cancelled`, `failed`)
- [x] `TRAINING_NEXT_PROGRAM_STEP`
- [x] `TRAINING_RECORD_EDGE` — réservé au système, avec prudence
- [x] `TRAINING_STOP_AND_NEUTRALIZE` sur fail

Exemples d'automatisations :

- un événement Chaster démarre une session d'edging ;
- un capteur ou un événement partenaire met la session en pause ;
- un fail applique un profil de punition puis stoppe le matériel ;
- une session réussie débloque le step suivant d'un programme.

**Attention :** ces actions doivent être protégées contre les boucles
d'événements, car démarrer une session émet elle-même
`training_session_started`. Utiliser le mécanisme d'echo / chain depth existant.

---

## 3. UX de session

- [x] Cooldown timer entre deux edges, avec temps restant visible
- [x] Intervalle minimum configurable
- [ ] Historique des suppressions d'edges (audit de l'undo)
- [ ] Tags sur les notes d'edge
- [x] Raccourcis clavier (1–4 pour les difficultés, espace pour pause)
- [x] Mode kiosque plein écran avec gros boutons
- [x] Contrôle partenaire : le membre peut enregistrer un edge, avec validation ou notification au Host
- [x] Préférences de notifications : edge par edge, fail uniquement, résumé, etc.

Le cooldown est configuré par session (0–3600 s) et bloque uniquement les edges
réussis ; un fail reste toujours possible. Les notifications sont filtrées par
session (`all`, `edges`, `failures`, `summary`, `none`) côté backend.

Le contrôle partenaire s'active par session : les participants peuvent alors
enregistrer des edges réussis (notifiés au Host). Les échecs, la pause et la fin
de session restent réservés au Host. Le mode kiosque ajoute un affichage plein
écran avec de gros boutons, et les raccourcis `1`–`4` / `Espace` fonctionnent
aussi bien dans la page de session que dans le kiosque.

---

## 4. Automatisation matérielle guidée

Prolongement du mode guidé actuel, qui est encore informatif.

- [x] Appliquer un profil au démarrage
- [x] Monter le niveau par paliers selon les phases
- [x] Baisser l'intensité après chaque edge
- [x] Cooldown automatique entre deux edges
- [x] Profil de récompense sur session réussie
- [x] Profil de punition ou neutralisation sur fail
- [x] Plafonds de sécurité stricts et actions réversibles

Doit rester optionnel, encadré et compatible avec `neutralize_all()`.

L'automatisation se configure par session (`guided_config`, activé uniquement en
mode guidé) et est reprise par les templates. Le profil de démarrage est appliqué
via la file d'actions (`ActionQueue`), avec un item à durée infinie : `units:stop`,
`neutralize_all()` et l'annulation manuelle de la file le révoquent donc comme
n'importe quelle action. Les paliers de phase réappliquent le profil au même
propriétaire (les rampes précédentes sont arrêtées) et fusionnent les snapshots,
si bien qu'une seule révocation restaure l'état matériel d'avant la session. Le
plafond (`max_level_pct`, 0–100) est appliqué côté service, en plus des limites
d'usage du Store. En cas d'échec, `neutralize_on_fail` (activé par défaut) passe
par `neutralize_all()` ; sinon le profil de punition est appliqué. Une
annulation restaure l'état précédent, tandis qu'une interruption (arrêt de
l'application, redémarrage) reste gérée par les chemins de neutralisation
existants. Si l'item d'automatisation disparaît (panic stop, arrêt d'unité),
l'automatisation s'arrête au lieu de réappliquer quoi que ce soit.

---

## 5. Programmes et templates

- [x] Éditeur de programme existant
- [x] Réorganisation des steps
- [x] Duplication d'un programme
- [x] Templates avec participants / mode par défaut
- [x] Import / export JSON
- [x] Objectifs de programme (ex. 10 sessions réussies, 1 h cumulée)
- [x] Récompenses automatiques à la fin d'un programme

Les programmes et les templates se gèrent désormais depuis la page Programs :
édition, réorganisation, duplication et import/export JSON. Les templates
conservent aussi les participants, le mode, la cooldown, le niveau de
notification, le contrôle partenaire et la visibilité ; ces valeurs sont
recopiées dans la session créée. Une session ou un template peut être privé ou
visible par tout le monde : dans ce second cas, les guests connectés reçoivent
aussi le direct et peuvent suivre la session. Les objectifs de programme comptent les sessions réussies et la
durée active cumulée. Quand toutes les étapes et tous les objectifs sont
terminés, le programme émet `training_program_completed` et applique
éventuellement le profil de récompense configuré, via la file d'actions (donc
révocable par `units:stop` / `neutralize_all()`).

---

## 6. Analytics

- [ ] Taux de réussite par difficulté
- [ ] Comparaison semaine précédente / semaine en cours
- [ ] Distribution des temps entre edges par difficulté
- [ ] Évolution des records
- [x] Export CSV / JSON
- [ ] Résumé partageable d'une session ou d'un programme

La page Analytics exporte la tendance des sessions en CSV et l'agrégat complet
en JSON (records, quotidien, intervalles et résumé).

- [ ] Heatmap calendrier et streaks par programme

---

## 7. Notifications

- [ ] Inbox persistante des notifications
- [ ] Notifications navigateur / push
- [ ] Résumé quotidien
- [ ] Notification au partenaire quand une session est en pause, proche du but ou échouée
- [ ] Intégration Discord / Chaster via les trigger rules

---

## Ordre recommandé

1. Conditions de règle
2. Actions `TRAINING_*`
3. Cooldown / intervalle minimum + préférences de notifications
4. Automatisation des phases guidées
5. Édition templates/programmes + export analytics

Les deux premiers chantiers transforment le module d'un journal de sessions en
système réellement automatisable.

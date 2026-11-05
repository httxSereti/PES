# Training / Edging — prochaines actions à implémenter

Roadmap des évolutions identifiées pour le module Training après les lots 1 à 4
(auto-stop, participants, pause, métadonnées, événements, templates, programmes,
mode guidé et analytics).

## Priorités

| Priorité | Chantier | Impact | Risque / effort |
| -------- | -------- | ------ | --------------- |
| 1 | Conditions de règle | Très élevé | Moyen |
| 2 | Actions `TRAINING_*` | Très élevé | Moyen, attention aux boucles |
| 3 | Cooldown / intervalle minimum + préférences de notifications | Élevé | Faible |
| 4 | Automatisation des phases guidées | Élevé | Élevé (hardware) |
| 5 | Édition templates/programmes + export analytics | Moyen | Faible |

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
- [ ] Raccourcis clavier (1–4 pour les difficultés, espace pour pause)
- [ ] Mode kiosque plein écran avec gros boutons
- [ ] Contrôle partenaire : le membre peut enregistrer un edge, avec validation ou notification au Host
- [x] Préférences de notifications : edge par edge, fail uniquement, résumé, etc.

Le cooldown est configuré par session (0–3600 s) et bloque uniquement les edges
réussis ; un fail reste toujours possible. Les notifications sont filtrées par
session (`all`, `edges`, `failures`, `summary`, `none`) côté backend.

---

## 4. Automatisation matérielle guidée

Prolongement du mode guidé actuel, qui est encore informatif.

- [ ] Appliquer un profil au démarrage
- [ ] Monter le niveau par paliers selon les phases
- [ ] Baisser l'intensité après chaque edge
- [ ] Cooldown automatique entre deux edges
- [ ] Profil de récompense sur session réussie
- [ ] Profil de punition ou neutralisation sur fail
- [ ] Plafonds de sécurité stricts et actions réversibles

Doit rester optionnel, encadré et compatible avec `neutralize_all()`.

---

## 5. Programmes et templates

- [ ] Éditeur de programme existant
- [ ] Réorganisation des steps
- [ ] Duplication d'un programme
- [ ] Templates avec participants / mode par défaut
- [ ] Import / export JSON
- [ ] Objectifs de programme (ex. 10 sessions réussies, 1 h cumulée)
- [ ] Récompenses automatiques à la fin d'un programme

---

## 6. Analytics

- [ ] Taux de réussite par difficulté
- [ ] Comparaison semaine précédente / semaine en cours
- [ ] Distribution des temps entre edges par difficulté
- [ ] Évolution des records
- [ ] Export CSV / JSON
- [ ] Résumé partageable d'une session ou d'un programme
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

# E-Stim Systems 2B™ — Résumé de la documentation

> Source : `resources/E-Stim_Systems_2106_Manual.pdf` — « 2B™ User Manual », Issue 2.8 (janvier 2021), firmware 2.106 — E-Stim Systems Ltd.
>
> Ce fichier résume le manuel officiel de l'unité 2B, le matériel d'électrostimulation contrôlé par PlunEStim.

## Présentation

La **2B™** est une unité d'électrostimulation (e-stim) à **deux canaux isolés** avec contrôles indépendants, pilotée par microprocesseur. Elle propose :

- 2 niveaux de puissance principaux : **L (Low, par défaut)** et **H (High)**.
- un écran **LCD rétroéclairé** 16 caractères × 2 lignes + 2 LED bleues indiquant l'activité des canaux.
- de nombreux programmes (pulse, tickle, squeeze, etc.) avec options **Triphase**.
- un **microphone intégré** et une **entrée audio stéréo** (line-in avec réponse ajustable).
- une possibilité de mise à jour / contrôle via l'interface **Digital Link** en option (Commander™, UpLink2™).
- une alimentation sur pile 9V ou sur secteur (adaptateur E-Stim Systems en option).
- des sorties **biphasiques isolées sûres** (Type BF), garantie à vie.

⚡ **Voir l'avertissement de sécurité ci-dessous avant toute utilisation.**

## Sécurité

> **(NE JAMAIS CONNECTER l'unité 2B ou tout appareil électrique À UN ENDROIT AU-DESSUS DE LA TAILLE (TRAVERSER LES BRAS COMPTE COMME AU-DESSUS DE LA TAILLE), ET SURTOUT PAS EN TRAVERS DU CŒUR, DE LA POITRINE, DU COU OU DE LA TÊTE. NE PAS UTILISER EN CAS DE PORTEUR DE PACEMAKER OU DE GROSSESSE. UTILISATION À VOS PROPRES RISQUES. VOUS DEVEZ LIRE ET COMPRENDRE LE MANUEL AVANT TOUTE UTILISATION.)**

- En cas de **douleur ou d'inconfort**, arrêter immédiatement.
- Risque de **brûlure** possible à haute intensité sur des zones de contact petites ou sensibles.
- **Ne pas court-circuiter** la sortie (risque d'endommagement de l'unité).
- **Ne pas ouvrir** le boîtier : hautes tensions présentes pendant l'usage (et possiblement encore après extinction). Aucune pièce réparable par l'utilisateur, ouverture = garantie annulée.
- Toujours **éteindre l'unité** avant de brancher/débrancher un câble ou une électrode (risque de choc électrique ou de court-circuit).

## Mise en route rapide

1. Insérer une **pile 9V** (voir Alimentation), éteindre/aucune électrode connectée, puis allumer via le commutateur à glissière.
2. L'écran s'allume ; si l'affichage est allumé sans texte, régler le **contraste** (vis à l'arrière de l'unité, tournevis isolé fin).
3. L'affichage initial montre le mode **Pulse**, les sorties **OFF**, la puissance **L**, le taux et le « feel » de pulse à **50**. Des réglages différents indiquent des paramètres mémorisés → faire un **Factory Reset** si nécessaire.
4. Tourner **Channel A level** (molette gauche) puis **Channel B level** (molette droite) pour monter chaque sortie (0→100). Les LED bleues clignotent proportionnellement.
5. La molette centrale **Adjust** change la valeur de la première ligne ; **Select + Adjust** change la seconde valeur (ex. « pulse feel »). Si le « : » n'est pas affiché, Select+Adjust n'est pas disponible dans le mode.
6. **Double appui sur SELECT** → menu de sélection de mode : cycle avec Adjust, valider avec Select.
7. Pour couper rapidement les sorties : **double appui sur SELECT** (remet les sorties à OFF).

À la sélection d'un nouveau mode, les sorties retombent toujours à **OFF (0 %)** et le réglage d'ajustement revient au **milieu de sa plage**.

## Contrôles utilisateur

De gauche à droite : **Channel A Level**, **Select Button**, **Adjust Control**, **Channel B Level**. Plus : commutateur marche/arrêt (sous l'unité) et réglage de contraste (arrière).

| Contrôle | Rôle |
|---|---|
| Channel A/B Level | Niveau absolu de sortie du canal, de OFF (0) à MAX (100 %). Contrôles indépendants. |
| Select | Combiné à Adjust : change/vallide les réglages et modes. Double appui = menu modes / arrêt rapide des sorties. |
| Adjust | Combiné à Select : fait défiler et ajuste les valeurs. |

- **Join Mode (A+B)** : lie les deux contrôles de canal (équivalent d'une commande unique). Monter A monte aussi B ; ajuster B règle les niveaux relatifs. Un « = » s'affiche en bas de l'écran. Se désactive en désélectionnant le mode, en éteignant l'unité, ou via Factory Reset.
- **LED** : deux LED bleues (droite) s'illuminent selon l'intensité de sortie du canal correspondant.
- **Rétroéclairage** : Off / On / Auto (par défaut : allumé en mode select, éteint ~7 s après la sortie). L'état est conservé après extinction.

## Entrées / Sorties

- **Sorties** : 2 prises jack **3.5 mm mono** (électrodes). Éteindre l'unité avant insertion/retrait ; tirer sur le corps de la prise, pas sur le fil. Compatibles avec les prises jack 3.5 mm mono standard d'autres fabricants.
- **Entrée** : prise jack **3.5 mm stéréo** centrale, pour source audio (niveaux type sortie casque) **ou** Digital Link — jamais les deux à la fois.
  - ⚠️ Ne jamais brancher un appareil audio ou le Digital Link sur les prises de sortie (destruction de l'appareil audio).
  - ⚠️ Le câble Digital Link **n'est pas un câble USB standard** : ne jamais y brancher un câble USB quelconque (destruction de la 2B + garantie).
  - ⚠️ Ne jamais relier une sortie à une entrée.

## Modes

Il existe deux familles : les **modes programme** (effets sur la sortie) et les **modes système** (réglages généraux). Le menu de sélection (double appui SELECT) désactive automatiquement les sorties.

### Modes programme

| # | Mode | Paramètre Adjust | Select+Adjust | Description |
|---|---|---|---|---|
| 1 | **Pulse** | Vitesse de pulse (2–100) | Pulse feel (1–100) | Les deux canaux pulsent ensemble. |
| 2 | **Bounce** | Vitesse (2–100) | Pulse feel (1–100) | Les sorties pulsent en alternance (A allumé quand B éteint). |
| 3 | **Continuous** | Feel (2–100) | — | Les deux sorties sont actives en continu. |
| 4 | **A Split** | Vitesse (2–100) | Pulse feel (1–100) | Canal B pulsé, canal A continu. |
| 5 | **B Split** | Vitesse (2–100) | Pulse feel (1–100) | Canal A pulsé, canal B continu. |
| 6 | **Wave** | Vitesse montée/descente (2–100) | Pulse feel (1–100) | Le niveau monte de 0 % à la limite puis retombe à 0 %. Des niveaux de canaux différents désynchronisent A et B. |
| 7 | **Waterfall** | Vitesse (2–100) | Pulse feel (1–100) | Comme Wave, mais la descente est lente au lieu d'un retour direct à 0 %. |
| 8 | **Squeeze** | Vitesse (10–100) | Pulse feel (1–100) | Le taux de pulse augmente puis retombe vers quasi-continu : sensation de « pression » synchronisée ; A et B au même rythme. |
| 9 | **Milk** | Vitesse (10–100) | Pulse feel (1–100) | Comme Squeeze mais les canaux A et B alternent. |
| 10 | **Throb** | Plage de throb (10–100) | — | Continu, le « feel » cycle entre 10 et la valeur choisie. |
| 11 | **Thrust** | Plage de thrust (10–100) | — | Comme Throb, le « feel » cycle entre 10 et la valeur puis revient à 0. |
| 12 | **Random** | « Randomness » (2–100) | Pulse feel | Sortie pulsée aléatoire ; petits nombres = flux plus rapide. |
| 13 | **Step** | Délai des paliers (2–100) | Pulse feel | Monte par paliers de **1 %** entre 0 et le niveau du canal ; petits nombres = plus rapide. Un changement de niveau n'est pris en compte qu'au palier suivant. |
| 14 | **Training** | Délai (2–100) | Pulse feel | Comme Step mais paliers de **1/12 du niveau du canal** (ou 1 % si ≤ 12 %) : ex. 48 % → paliers de 4 %, 8 %… puis retour à zéro. |
| 15 | **Microphone** | Seuil de réponse | — | Micro intégré (mono → les deux canaux). A/B = pourcentage du signal transmis ; Adjust = niveau de déclenchement (plus bas = plus réactif). |
| 16 | **Stereo** | Vitesse de réponse | — | Entrée line-in stéréo : gauche → canal A, droite → canal B ; bargraphes = niveau d'entrée relatif ; A/B = pourcentage transmis. Faible valeur = réponse vive, valeur haute = plus lisse. Cible : bargraphes très mobiles (réduire le volume si saturés). |
| 17 | **Tickle** | « Tickle » | — | Mode continu actif uniquement quand la molette Adjust tourne (plus vite = plus prononcé) ; sortie active seulement si le niveau > 0 %. Non accessible depuis Commander. |

**Modes audio** : Microphone et Stereo utilisent des sources audio classiques, filtrées numériquement pour produire une sensation d'e-stim sûre. Aucun des deux n'est accessible depuis Commander.

**Microphone (précisions)** : mono, situé près de la molette Channel A, capte une conversation à plusieurs mètres. Sensibilité globale réglable ×1 (normal), ×2, ×4 via le mode système « Microphone Level ». Sortie du mode : appui sur Select ou extinction.

### Modes système

Les modes système modifient la configuration ; **sélectionner un mode système ramène toujours l'unité au mode Pulse par défaut**.

| # | Mode | Détails |
|---|---|---|
| 18 | **Power Level** | Choix **L (Low)** ou **H (High)** via Adjust + Select. Conservé jusqu'au changement ou extinction ; affiché en bas de l'écran sur tous les programmes. |
| 19 | **AB Join** | Lie les canaux A et B (voir Join Mode). |
| 20 | **Microphone Level** | Sensibilité du micro : ×1, ×2, ×4. |
| 21 | **Backlight** | Off / On / Auto (défaut, ~7 s après sortie du mode select). |
| 22 | **Factory Reset** | Efface les réglages mémorisés entre deux utilisations. |

**Indicateur de pile** : 4 symboles (pleine, 2/3, 1/3, vide) + symbole alimentation secteur. Affichage mis à jour à chaque ajustement. Une pile « plate » laisse l'unité fonctionner avec une sortie réduite ; des **réinitialisations lors de la sélection d'une puissance élevée** = pile à remplacer. Une pile neuve peut ne pas afficher « pleine » selon la technologie.

**Commander™** : logiciel PC/Mac de contrôle via Digital Link. Quand Commander est actif, une petite flèche s'affiche à l'écran. Activation/désactivation automatique. Commander ne donne pas accès à Tickle ni aux modes audio ; en mode select (via Tickle) la double pression SELECT fait office de « bouton d'arrêt d'urgence ».

**System Info** : au démarrage, l'unité exécute un auto-test ; la version de firmware est normalement affichée pendant ce démarrage.

## Audio (détails complémentaires)

- **Stereo** : gauche → sortie A (indiqué par « A: » et bargraphe de gauche), droite → sortie B. Les contrôles A/B règlent le **pourcentage de drive audio transmis**. Adjust règle la **vitesse de réponse** (3e valeur affichée).
- **Microphone** : source mono → stimule les deux sorties ensemble.

## Alimentation

- **Pile** : une seule pile **9V alcaline (PP3)**. Les **rechargeables sont acceptables** ; les piles **zinc-carbone ne sont pas recommandées** (performances médiocres).
- Retirer la pile si l'unité n'est pas utilisée pendant une longue période (risque de fuite).
- **Alimentation externe** : uniquement l'adaptateur **E-Stim Systems** fourni en option (isolation/sécurité ; un autre bloc peut annuler la garantie). Prise à côté de l'interrupteur. Brancher unité **éteinte**, allumer le secteur puis la 2B.

## Digital Link, bootloader et mises à jour

- L'interface **Digital Link** (option) permet de connecter la 2B à un PC/Mac pour le **contrôle** (Commander™) et les **mises à jour firmware**.
- **Bootloader** intégré : mise à jour du firmware avec le logiciel **UpLink2™**.
- Vérifier la version de firmware avant toute mise à jour. **Ne jamais installer un firmware plus ancien** : risque de « briquer » l'unité (retour atelier nécessaire).
- Les mises à jour firmware **ne sont pas couvertes** par la garantie à vie (des services payants existent : remplacement de « chip » ou retour atelier).

## Spécifications

| Élément | Valeur |
|---|---|
| Appareil | Classe IV, unité d'électrostimulation à deux canaux pilotée par microprocesseur |
| Canaux / sorties | Double canal isolé (Type BF) |
| Affichage | LCD 16 caractères × 2 lignes rétroéclairé + 2 LED d'activité |
| Modes programme | 15 |
| Modes audio | 2 |
| Modes système | 5 |
| Contrôles | Encodeurs rotatifs numériques (niveau par canal, sélection/ajustement), interrupteur on/off |
| Forme d'onde de sortie | AC biphasique |
| Entrée audio | Stéréo 33 kΩ |
| Alimentation | 1 pile 9V alcaline (PP3) ou bloc secteur E-Stim Systems en option |
| Autonomie | Variable selon la charge |
| Dimensions | ≈ 145 × 80 × 50 mm |
| Poids (avec pile) | 400 g |
| Accessoires fournis | 2 câbles 3.5 mm → 2 mm/TENS, 1 câble audio stéréo 3.5 mm, 4 électrodes gel auto-adhésives, guide utilisateur, carte de garantie |

- Les câbles fournis : deux 1,5 m, 2 fiches 3.5 mm d'un côté et 2 fiches 2 mm codées couleur de l'autre.
- Conformité : FCC Part 15 (US), directives EMC et basse tension CE, sorties Type BF.

## Électrodes et placement

- L'électroplay nécessite **au moins deux points de contact** par canal : les électrodes (pads) s'utilisent **par paires** sur la peau. Coller les pads l'un près de l'autre augmente l'intensité ressentie, mais **ils ne doivent pas se toucher**.
- Zones typiques : faces internes des cuisses, fessiers, etc. Une sensation asymétrique entre les deux points est normale.
- Ne pas connecter/débrancher d'électrode quand l'unité est allumée.
- Ranger les pads sur leur support plastique après usage.

## Dépannage

- **Sortie plus faible que d'habitude** → remplacer la pile.
- **Aucune sortie** (avec pile neuve) → suspecter les câbles de connexion.
- Sinon → contacter `info@e-stim.co.uk` en indiquant le **numéro de série** et le problème.
- **Aucune pièce réparable par l'utilisateur** ; briser les scellés annule la garantie. Garantie à vie (pièces et main-d'œuvre) contre les défauts de fabrication et pannes en usage normal.
- Ne jamais renvoyer l'unité sans avoir obtenu un **numéro de retour** au préalable.

## Entretien

- **Stockage** : retirer la pile si l'unité n'est pas utilisée pendant un moment (fuites).
- **Nettoyage** : pas de solvants ; simple lingette douce. L'unité de contrôle ne peut pas être stérilisée.

## Ressources externes

- Commander™ : https://www.e-stim.co.uk/commander/
- UpLink2™ (firmware) : https://www.e-stim.co.uk/uplink/
- Forum : https://www.e-stim.net
- Boutique UK/EU : https://www.e-stim.co.uk — Reste du monde : https://www.e-stimsystems.com

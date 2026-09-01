# Vue calendrier — refonte ergonomique (design)

**Date :** 2026-09-01
**Branche :** `calendrier-ergonomie` (partie de `frise-retards-numerotation` @ `e3b55cc`, après fusion de `vue-calendrier`)
**Statut :** design validé, prêt pour le plan

## 1 · Contexte

La vue de base `ariane-calendrier` (`MoteurCalendrier`, `main.js:20154` ;
`fabriquerVueCalendrierBase`, `main.js:20491`) est en place mais reste un
squelette : barre d'outils à gros boutons, cartes réduites à l'intitulé,
bandeau « tout le jour » qui mange de la hauteur pour rien, navigation aux
seules flèches, et le glisser d'une tâche depuis la frise ne fonctionne pas.

Ce chantier corrige l'ergonomie **sans nouveau concept de données** : on
réutilise le concept `Créneaux`, les familles, et le pont
`getValue`/`_parRef` de Bases déjà exploité par la frise
(`fabriquerVueFriseBase`, `main.js:18327`). La synchronisation EventKit /
Agenda macOS reste **hors périmètre** (spec `2026-09-01-calendrier-agenda-design.md`, §4).

Source d'inspiration étudiée : `obsidian-day-planner` (ivan-lednev) — cartes
à contenu rendu + pastilles de propriétés, poignées de redimensionnement,
bandeau de jours mince, bord tireté quand un bloc est tronqué. On s'en
inspire pour le **rendu** et la **densité**, pas pour l'architecture (Svelte +
Redux + build ; ici un seul `main.js` sans build).

## 2 · Global Constraints

- `main.js` est un fichier unique ~20 k lignes, `'use strict'`, **sans build**,
  contenant des octets NUL → toujours `grep -a`, jamais `sed` en place.
- Déploiement : `cp main.js styles.css manifest.json` vers le dossier du
  greffon dans le vault. Ne jamais toucher `data.json`.
- Tests : `node --test tests/*.test.js`. Base actuelle : **288 verts**.
- Messages de commit : rédigés dans un fichier puis `git commit -F`, finissant
  par `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Déposer un lien de tâche sur le calendrier crée toujours un `Créneau`**
  via `majCreneau` : en vue semaine à l'heure du lâcher, en vue mois à 09:00
  pour 1 h par défaut. Un dépôt ne touche jamais `début`/`échéance`. *(Révisé
  batch 2 / P5 : la première version reprogrammait les dates en vue mois.)*
- Décaler une **barre de tâche** ou un **bloc/pastille de créneau** déjà posé
  sur le calendrier écrit respectivement `début`/`échéance` (`ecrireDatesTaches`)
  ou le `Créneau` (`majCreneau`). Le seul autre point d'écriture de dates est
  l'item de menu contextuel « Retirer du calendrier » (efface `début`+`échéance`, §7).
- Le rendu DOM et la vérification visuelle dans Obsidian sont **différés à
  l'utilisateur** : les sous-agents font `node --check` / `node --test` /
  `cp` de déploiement / relecture de code.

## 3 · Pont Bases enrichi

`fabriquerVueCalendrierBase` (`main.js:20491`) ne relaie aujourd'hui que
`taches`, `lire`, `ecrire`. On lui ajoute le même `ctx` que la frise, en
copiant les implémentations de `fabriquerVueFriseBase` (`main.js:18337`-`18410`
et la méthode `colonnes()`, `main.js:18477`) :

| Clé `ctx` | Rôle | Reprise de |
|---|---|---|
| `colonnes()` | liste `{ cle, nom, valeur(ref), valeurBrute(ref), valeurBase(ref), chemin(ref) }` des propriétés **visibles** de la base, dans l'ordre `getOrder()` | `VueFriseBase.colonnes()` `main.js:18477` |
| `ordreColonnes()` | `config.getOrder()` (repli `[]`) | `main.js:18358` |
| `renomColonne(id)` | `config.get('renoms')[id]` | `main.js:18364` |
| `triNatif()` | `{ criteres, preparer(taches) }` — pose `t._multi` (voir `main.js:18391`-`18409`) | idem frise |
| `nomVue()` | nom sérialisé de la vue, repli basename, repli `tr('Calendrier')` | `main.js:18341` |

`VueCalendrierBase` doit aussi tenir `this._parRef` : `Map<ref, entry>` des
lignes de `this.data.data` (clé = `refDeChemin(entry.file.path)`), reconstruite
à chaque `onDataUpdated`, exactement comme la frise. `tachesDeLaBase()`
(`main.js:20509`) est étendue pour peupler `_parRef` en même temps que le
`Set` d'appartenance.

**Filtres.** Bases pré-filtre `this.data.data` en amont ; `tachesDeLaBase()`
ne garde que les refs présentes → les filtres de la base sont déjà respectés.
Aucun code supplémentaire.

**Tri.** Dans une cellule (mois) ou une colonne (semaine), les événements
s'empilent par :
1. heure de début (`ev.debut`, les « tout le jour » avant les horaires ou
   selon leur `debut` ISO) ;
2. puis le **tri natif** de la base : si `triNatif()` renvoie des critères,
   appeler `preparer(taches)` une fois par dessin puis comparer les `t._multi`
   (helper pur `Ariane.comparerMulti(a, b)` — à extraire si la frise ne
   l'expose pas déjà comme statique) ;
3. puis `ref` (ordre stable).

Le même comparateur sert au rendu **et** au calcul du « +N » de débordement
en vue mois.

**Grouper par.** Le calendrier n'a pas de couloirs → le `groupBy` natif est
ignoré. Noté en §10 (différé).

## 4 · Cartes = propriétés visibles de la base

Une **carte d'événement** = une pastille en vue mois, un bloc en vue semaine.
Rendu :

- **Ligne 1** : `HH:MM ` (si `!ev.allDay`) + intitulé (`t.intitule || t.ref`).
- **Lignes suivantes** : pour chaque colonne de `ctx.colonnes()` dans l'ordre,
  en sautant :
  - toute colonne dont la `cle` est `file`, `file.name`, `file.link` ou
    `file.path` ;
  - toute colonne dont `col.valeur(ref)` est **égale** à `t.intitule`
    (c'est la propriété rendue comme titre — on ne la répète pas) ;
  - toute valeur vide (`col.valeur(ref)` → `''`) ;

  afficher `«  nom : valeur  »` — `nom` = libellé de colonne, `valeur` =
  `col.valeur(ref)` (texte localisé, comme la frise). Une ligne par propriété.
- **Fond** : `this.couleurTache(t)` (existant, `main.js:20244` — famille ou
  statut selon `settings.friseBarreCouleur`). Le texte prend un contraste
  lisible (réutiliser la logique de contraste de la frise si elle est
  factorisée, sinon `color: var(--text-normal)` sur fond teinté léger comme
  aujourd'hui).
- **Gating par hauteur** :
  - **vue semaine** : `n = Math.max(1, Math.floor((hauteurBloc - padding) / hauteurLigneCarte))` lignes affichées ; bloc court ⇒ titre seul. Même principe
    que `geo.lignes` sur la frise.
  - **vue mois** : pastille = **1 seule ligne** (heure + titre). Le détail des
    propriétés va dans l'attribut `title=` (multi-lignes `\n`) et l'aperçu de
    page au survol.
- **Survol** : déclencher l'aperçu de page natif Obsidian sur `mouseover` de
  la carte :
  `this.app.workspace.trigger('hover-link', { event, source: 'zfa-calendrier', hoverParent: this, targetEl: carte, linktext: t.ref, sourcePath: '' })`
  (même appel qu'`main.js:16661`).
- **Retard** : classe `est-retard` conservée (liseré rouge) —
  `Ariane.tachesEnRetard(this._taches, auj)` déjà appelé dans `dessinerMois`,
  à ajouter aussi dans `dessinerSemaine`.
- **Troncature (vue semaine)** : quand la fin du bloc dépasse le bas de la
  plage horaire visible, classe `zfa-cal-bloc-tronque-bas` → bord bas tireté +
  coins bas carrés (CSS, emprunt `truncated-bottom` de day-planner). Idem en
  haut si le début est avant `hDeb` (`zfa-cal-bloc-tronque-haut`).

Le rendu d'une carte est factorisé dans une méthode
`MoteurCalendrier.rendreCarte(hote, t, ev, { maxLignes, avecHeure })` appelée
par `dessinerMois` et `dessinerSemaine`.

## 5 · Barre d'outils allégée

`dessinerBarreOutils` (`main.js:20211`) refondue :

- Boutons de navigation en **icônes** (`chevron-left` / `chevron-right` via
  `obsidian.setIcon`), pas les glyphes `‹` `›`.
- « Aujourd'hui » compact (petit bouton texte).
- **Titre de période cliquable** : clic → `_ancre = aujourd'hui` + redessin
  (raccourci vers « Aujourd'hui »).
- Segment **Mois / Semaine** compact (deux boutons collés, `is-active`).
- Bouton **« + Nouveau »** aligné à droite (§8).
- Hauteur de barre réduite (CSS : padding vertical resserré, `font-ui-small`).

## 6 · Carrousel continu (navigation gestuelle)

Remplace le pas unique par un ruban suivant le geste.

**Structure DOM.** La grille (`.zfa-cal-grille`) devient un **ruban**
`overflow:hidden` contenant **3 grilles** côte à côte : période
*précédente* (`_ancre` décalé de −1), *courante*, *suivante* (+1). Le ruban
est positionné à `translateX(-100%)` (grille courante centrée). Chaque grille
est rendue par `dessinerMois` / `dessinerSemaine` pour son ancre propre.

**Geste.**
- `wheel` sur le ruban : si `Math.abs(e.deltaX) > Math.abs(e.deltaY)` →
  navigation ; sinon → laisser passer (défilement des heures en semaine, rien
  en mois). Accumuler `e.deltaX` dans un offset, appliquer
  `translateX(calc(-100% + offsetPx))` via `requestAnimationFrame`.
  `e.preventDefault()` seulement dans le cas horizontal.
- Glissé-pointeur horizontal sur une **zone vide** de la grille (pas sur une
  carte, pas sur une cellule cliquable en mois) : `pointerdown` → suivre
  `clientX` ; même offset.
- **Fin de geste** (`pointerup`, ou `wheel` silencieux pendant ~150 ms) :
  - si `|offset| > largeur/4` (ou vitesse suffisante) → caler vers la période
    voisine : animer `translateX` jusqu'à `0` ou `-200%` (transition CSS
    ~180 ms), puis à la fin de transition : `_ancre = ancreVoisin`,
    re-rendre les 3 grilles, repositionner le ruban à `-100%` sans transition.
  - sinon → animer le retour à `-100%`.
- Le calage de l'ancre : helper pur
  `Ariane.ancreCarrousel(ancre, mode, sens)` où `sens ∈ {-1, 0, 1}` :
  `mode==='mois'` → `Ariane.moisSuivantN(ancre, sens)` ;
  `mode==='semaine'` → `Ariane.decalerJour(ancre, sens*7)`. (Enrobage trivial
  mais testable et unique.)

**Alternative écartée :** carrousel virtualisé infini (N grilles recyclées) —
complexité sans bénéfice pour un usage mois/semaine.

**Repli sans geste :** les flèches `‹` `›` de la barre restent et font le
même calage animé (`sens = ±1`).

## 7 · Bandeau « tout le jour » compact (vue semaine)

Dans `dessinerSemaine` (`main.js:20406`), le bandeau `.zfa-cal-bandeau` :

- **hauteur = contenu**, pas de hauteur fixe. Vide → **hauteur nulle** (aucun
  « No all day events », aucun `min-height`).
- Plafond ~2 lignes de cartes ; au-delà, une puce **« +N »** par colonne qui,
  au clic, déplie le bandeau à pleine hauteur (état de dessin local, non
  persistant).
- **Chevron de repli** dans la gouttière (`.zfa-cal-gouttiere`) : bascule
  `config.set('calBandeauReplie', bool)`. Replié → seule une fine bande avec
  le compte total ; déplié → comportement ci-dessus. Défaut : déplié.
- `DEFAUTS_CALENDRIER` (`main.js:15940`) gagne `calBandeauReplie: false`.

## 8 · Bouton « + Nouveau »

Toujours visible dans la barre d'outils.

- **Date semée** (priorité) :
  1. le **jour sélectionné** s'il y en a un — un clic sur un quantième (vue
     mois) ou un en-tête de jour (vue semaine) pose `this._jourSel = jourISO`
     et une classe `est-selection` ;
  2. sinon **aujourd'hui** s'il tombe dans la période affichée ;
  3. sinon le **premier jour** de la période (`grilleMois().moisDebut` borné au
     mois, ou `grilleSemaine().jours[0]`).
- Action : `const chemin = await this.greffon.creerTache({ echeance: jour, debut: jour });`
  (`creerTache`, `main.js:13512`), puis `this.ouvrir(basename(chemin), false)`.
  Vérifier au plan les noms de champs acceptés par
  `Ariane.corpsNouvelleTache` (`main.js:4766`) — `debut` / `echeance` doivent
  passer par `champs`.
- Helper pur `Ariane.jourSeme(jourSel, periodeDebut, periodeFin, aujourd)` →
  ISO, pour tester la cascade.

## 9 · Menus contextuels (clic droit)

`MoteurCalendrier` gagne `menuCarte(e, t, ev)` et `menuCellule(e, jourISO)`,
bâtis sur `obsidian.Menu` (mêmes items que `MoteurFrise.menuTache`,
`main.js:17641`, sans le coupler — menu jumeau).

**`menuCarte`** :
- Ouvrir · Ouvrir dans un nouveau volet
- —
- Statut ▸ (sous-menu : liste des statuts) · Marquer terminée · Priorité ▸
  → écrivent via les helpers déjà utilisés par `menuTache` (à repérer au plan :
  `greffon.majStatutTache` / équivalent).
- —
- *(si `ev.source === 'creneau'`)* Supprimer ce créneau →
  `greffon.majCreneau(t.ref, { avant: ev.brut, debut: '', fin: '' })` puis
  `_apres(...)`.
- Retirer du calendrier → `greffon.ecrireDatesTaches([{ ref: t.ref, debut: '', echeance: '' }])`
  puis `_apres(...)`. **Seule** écriture de dates du moteur, explicite.
- —
- Ouvrir la note source.

**`menuCellule`** (clic droit sur cellule vide / colonne) :
- Nouvelle tâche ce jour-là → comme §8 avec `jour = jourISO`.
- Coller le lien en créneau → si `navigator.clipboard` / presse-papier
  contient `[[T…]]` reconnu comme tâche : `majCreneau(ref, { avant:'', debut, fin })`
  (heure = milieu de journée en mois, position du clic en semaine).

Câblage : `carte.addEventListener('contextmenu', e => this.menuCarte(e, t, ev))`
dans `rendreCarte` ; `cell.addEventListener('contextmenu', ...)` /
`col.addEventListener('contextmenu', ...)` dans `dessinerMois` /
`dessinerSemaine`.

## 10 · Retrait du `draggable` des barres SVG de la frise

Dans `MoteurFrise`, au dessin d'une barre (`main.js:17564`-`17570`) :

```js
groupe.setAttribute('draggable', 'true');
groupe.addEventListener('dragstart', (ev) => { ... 'text/x-ariane-tache' ... });
```

→ **supprimé**. Le `<g draggable>` SVG est peu fiable dans Electron et son
`dragstart` n'part jamais quand `saisir()` a fait `e.preventDefault()` sur le
`pointerdown` du fond.

**Conservé :** le glissé du lien de la **colonne de gauche**
(`.zfa-gantt-libelle`, `main.js:17045`-`17050`) — `<div>` HTML, `draggable`
fiable, charge `text/x-ariane-tache` + `text/plain` `[[ref]]`. C'est
l'unique chemin « frise → calendrier ».

`MoteurCalendrier._dropExterne` / `_refDepuisDrop` (`main.js:20271` / `20259`)
inchangés : ils lisent déjà ces deux formats.

Vérifier au plan qu'aucun test existant n'assied le `dragstart` de la barre.

## 11 · Tests (purs)

`tests/calendrier.test.js` (existant) étendu :

1. `Ariane.ancreCarrousel` : mois ±1 franchit décembre ; semaine ±1 = ±7 j ;
   `sens = 0` → ancre inchangée.
2. `Ariane.jourSeme` : cascade jourSel → aujourd'hui-dans-période →
   premier-jour ; bornes de mois.
3. Comparateur d'empilement : heure d'abord, puis `_multi` (tri natif), puis
   ref ; « tout le jour » avant horaire à heure égale.
4. Sélection des lignes de propriété par hauteur : `maxLignes` respecté,
   colonnes vides / `file` / titre sautées, ordre = `getOrder()`.
5. Hauteur du bandeau compact : 0 quand aucune carte « tout le jour » ;
   plafond + `+N` au-delà.

DOM / visuel (différé utilisateur) : barre allégée, carrousel au trackpad,
cartes multi-propriétés, bandeau repliable, menus clic droit, glisser le
lien de la colonne de gauche vers un jour → créneau, `## Créneaux` de la note
mis à jour.

## 12 · Différé

- Synchronisation EventKit / Agenda macOS (spec dédiée §4-§5).
- Couloirs par « Grouper par » natif dans le calendrier.
- Glisser une barre SVG de la frise (abandonné au profit du lien de gauche).
- Carrousel à inertie physique fine (on se contente d'un calage animé).

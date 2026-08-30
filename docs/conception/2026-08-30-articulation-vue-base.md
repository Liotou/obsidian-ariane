# Conception — Vue de base « Articulation » (remplace les canvas de tâches)

**But :** une surface pour **penser l'organisation des tâches** — poser les
tâches, les relier en hiérarchie (sous-tâches) et en blocage (amont/aval),
repérer d'un coup d'œil la structure. C'est une **seconde vue de base** du même
jeu de tâches que la frise : la frise donne le temps, l'articulation donne la
structure. Aucun fichier `.canvas`.

**Architecture :** comme la frise — la disposition, la détection de cycles et
d'incohérences, le placement automatique sont des **fonctions pures**, statiques
de `Ariane`, éprouvables par `node --test`. La vue (`VueArticulationBase extends
obsidian.BasesView`) dessine ce qu'elles rendent et écrit dans l'entête des
notes ce que Monsieur décide.

**Spécification amont :** `docs/conception/2026-08-28-systeme-de-taches.md`,
`docs/conception/2026-08-30-frise-regroupement.md`.

---

## Contraintes globales

- **Le frontmatter est la seule source de vérité.** `parent`, `bloque-par`,
  `canvas-x`, `canvas-y` (et les champs de tâche existants). La vue lit et
  écrit là, rien d'autre. Deux vues (frise, articulation) éditent le même
  entête sans se marcher dessus.
- **Aucune écriture qui ne change rien.**
- **Garde-fous AU TRACÉ.** Un lien qui créerait un cycle ou une incohérence de
  dates est refusé sur-le-champ, avec un message ; rien n'est écrit.
- **Fonctions pures pour tout ce qui se raisonne.** La vue ne fait que du DOM
  et des `processFrontMatter`.
- **Hors périmètre v1 :** menu contextuel de nœud (statut/priorité/dates),
  renommage d'arête en ligne, repointage d'arête, export.

---

## 1. Modèle de données

| Concept | Frontmatter | Rendu |
|---|---|---|
| Nœud | une note de tâche du jeu filtré par la base | carte |
| Arête **hiérarchie** | `parent: [[A]]` sur la fille | trait plein discret |
| Arête **blocage** | `bloque-par: [[X]]` (ou `[[X\|libellé]]`) sur la bloquée | flèche pointillée |
| Position | `canvas-x: <nombre>`, `canvas-y: <nombre>` | coordonnées du nœud |

**Règle sous-tâche ⇒ blocage implicite.** Pour finir une tâche il faut finir
ses sous-tâches : une arête de hiérarchie vaut aussi contrainte « la fille
s'achève avant la mère ». On ne l'écrit **pas** en double dans `bloque-par` ;
les garde-fous et la cascade la prennent en compte (voir § 4). Un blocage pur
relie deux tâches sans lien de parenté.

**Position partagée.** `canvas-x/y` sont des propriétés de la tâche, pas de la
vue : une tâche vue dans deux bases garde la même place. Acceptable et voulu.

---

## 2. Fonctions pures (statiques de `Ariane`)

### 2.1 `Ariane.grapheArticulation(taches) -> { noeuds, aretes }`
- `taches` : liste `{ ref, intitule, statut, avancement, jalon, echeance,
  parent, bloquePar[], famille, x, y }` (déjà produite par `tachesPourGantt`
  + lecture de `canvas-x/y`).
- `noeuds` : `[{ ref, intitule, statut, avancement, jalon, famille, echeance,
  x|null, y|null }]`.
- `aretes` : `[{ de, vers, type: 'hier'|'bloque', libelle }]`.
  - hiérarchie : `de = parent`, `vers = ref` (le parent « contient » la fille) ;
  - blocage : `de = refDeLien(b)`, `vers = ref`, `libelle` extrait de `[[…|…]]`.
  - une arête dont un bout n'est pas dans `taches` est ignorée.

### 2.2 `Ariane.placerGraphe(noeuds, aretes, opts) -> Map<ref, {x, y}>`
Placement automatique des nœuds **sans position**. Ceux qui en ont sont
laissés tels quels.
- Rangs par profondeur dans le DAG hiérarchie + blocage (Kahn) : rang 0 = sans
  antécédent. `x = rang * opts.dx`.
- Dans un rang : tri par `echeance` puis `ref`, `y = i * opts.dy`, décalé pour
  ne pas chevaucher un nœud déjà placé à ce `x`.
- Cycle éventuel : les nœuds du cycle sont posés au rang le plus bas rencontré,
  sans boucler.
- `opts = { dx: 260, dy: 120 }` par défaut.

Tests (`tests/articulation.test.js`) :
- graphe sans arêtes → une colonne ;
- chaîne A→B→C → trois rangs ;
- un nœud avec `x/y` fixés n'est pas déplacé ;
- deux nœuds au même rang ne se superposent pas ;
- un cycle ne fait pas boucler `placerGraphe`.

### 2.3 `Ariane.lienValide(aretes, dates, ajout) -> { ok, raison }`
`aretes` : arêtes actuelles (`{de, vers, type}`). `dates` : `Map<ref, {debut,
echeance}>`. `ajout` : `{de, vers, type}` proposé.
- **Cycle** : si `ajout` referme un cycle sur l'union hiérarchie+blocage →
  `{ ok:false, raison:'cycle', chaine:[...] }`.
- **Dates** : `de` doit s'achever avant que `vers` puisse commencer.
  - blocage : `echeance(de)` renseignée et `debut(vers)` renseigné et
    `echeance(de) > debut(vers)` → `{ ok:false, raison:'dates', … }`.
  - hiérarchie : `echeance(de)` (la mère) < `echeance(vers)` (la fille) →
    `{ ok:false, raison:'dates-hier', … }` (la mère ne peut finir avant sa
    fille).
- Sinon `{ ok:true }`.

Tests :
- un lien qui referme un cycle est refusé ;
- un blocage dont l'amont finit après le début de l'aval est refusé ;
- une hiérarchie dont la mère finit avant la fille est refusée ;
- dates absentes d'un côté → autorisé (on ne bloque que sur une preuve) ;
- un lien sain est autorisé.

### 2.4 Réutilisées telles quelles
`Ariane.cyclesDe`, `Ariane.datesIncoherentes`, `Ariane.refDeLien`,
`Ariane._cheminFleche` (courbe de Bézier), `Ariane.jourValide`.

---

## 3. `VueArticulationBase` (registerBasesView)

Enregistrée à côté de la frise :

```js
this.registerBasesView('ariane-articulation', {
  name: tr('Articulation'), icon: 'git-branch',
  factory: (ctrl, cont) => new VueArticulationBase(ctrl, cont),
  options: () => [],   // rien pour l'instant : filtre/tri viennent de la base
});
```

- `onload` : monte un `MoteurArticulation` (nouvelle classe, ~parallèle à
  `MoteurFrise`) dans `this.conteneur`.
- `tachesDuGraphe()` : mêmes entrées que `VueFriseBase.tachesDeLaBase` (le jeu
  filtré + remontée des ancêtres absents), plus la lecture de `canvas-x/y`
  depuis l'entrée Bases (`e.getValue('note.canvas-x')`).
- `onDataUpdated` / `onResize` → `moteur.dessiner()`.
- Écritures fournies au moteur via le `ctx` :
  - `poserPosition(ref, x, y)` → `greffon.majTache(ref, {'canvas-x': x, 'canvas-y': y})` ;
  - `poserParent(ref, parentRef|null)` → `majTache(ref, {parent: parentRef ? '[[…]]' : ''})` ;
  - `creerBlocage`, `retirerBlocage` → déjà sur le greffon.

## 4. `MoteurArticulation` — rendu et gestes

### 4.1 Ossature
`racine` → un `<svg class="zfa-artic-svg">` unique, pannable/zoomable via un
`<g>` de transformation (`translate` + `scale`). Roue = zoom, glisser le fond =
pan. Boutons flottants : **re-disposer**, **ajuster à la vue**, **+ tâche**.

### 4.2 Placement
`dessiner()` :
1. `taches = ctx.taches()` ; `dates = Map(ref -> {debut, echeance})`.
2. `{ noeuds, aretes } = Ariane.grapheArticulation(taches)`.
3. `pos = Ariane.placerGraphe(noeuds, aretes, DX_DY)` ; pour chaque nœud sans
   `x/y`, écrire la position calculée via `ctx.poserPosition` (une passe, une
   seule fois — ensuite Monsieur les bouge à la main).
4. Dessiner arêtes (sous) puis nœuds (dessus).

### 4.3 Nœud (carte SVG, ~220 × 64)
`<g class="zfa-artic-noeud" data-ref>` : rect arrondi (fond = statut teinté),
icône de famille (`setIcon` dans un `<foreignObject>` ou un `<text>` d'icône),
intitulé tronqué, échéance, mini-barre d'avancement. Jalon → losange à la place
du rect. Clic → `greffon.ouvrir(ref)`. `contextmenu` → v2.

Deux **points d'accroche** au bord droit : `↳` (hiérarchie, en haut) et `⊘`
(blocage, en bas). `pointerdown` dessus → tirage d'arête.

### 4.4 Arête
`<g class="zfa-artic-arete" data-de data-vers data-type>` : chemin
`Ariane._cheminFleche(x1,y1,x2,y2)` entre les bords des deux cartes, plus une
cible large invisible (comme la frise). Type `hier` = trait plein 1 px ; type
`bloque` = pointillé + pointe. Rouge si `datesIncoherentes` la signale encore.
Sélection au clic (`est-active`), ⌫ → suppression :
- `hier` → `ctx.poserParent(vers, null)` ;
- `bloque` → `ctx.retirerBlocage(de, vers)`.

### 4.5 Tirage d'une arête (avec garde-fou)
Depuis un point d'accroche : un trait suit le pointeur (`zfa-artic-lien-en-cours`).
Au lâcher sur un nœud cible `t` (≠ source, ≠ soi) :
1. `ajout = { de, vers, type }` selon le point d'accroche
   (hiérarchie : `de = cibleOuSource` selon le sens ; blocage : `de = source`).
2. `r = Ariane.lienValide(aretes, dates, ajout)`.
3. `r.ok` faux → `new obsidian.Notice(message(r.raison))`, rien n'est écrit,
   la cible clignote en rouge.
4. `r.ok` vrai → `ctx.poserParent` ou `ctx.creerBlocage`, puis `dessiner()`.

### 4.6 Déplacement d'un nœud
`pointerdown` sur la carte (hors accroche) → glisser en direct (transform du
`<g>`), au lâcher `ctx.poserPosition(ref, x, y)` (arrondi entier) avec un
antirebond de 400 ms si plusieurs déplacements s'enchaînent.

### 4.7 Ajout rapide
Bouton **+ tâche** ou double-clic sur le fond : `greffon.creerTache({})`,
`poserPosition` au point du clic, `dessiner()`, puis on ouvre l'entrée en ligne
du titre (petit `<input>` en overlay au-dessus du nœud → `majTache(ref,
{intitule: v})` au blur). Reste simple : pas de brouillon sans note.

### 4.8 Re-disposer / ajuster
- **Re-disposer** : efface `canvas-x/y` de toutes les tâches du graphe puis
  `dessiner()` (le placement auto reprend la main). Confirmation `Notice`.
- **Ajuster à la vue** : calcule la boîte englobante des nœuds, ajuste
  translate + scale du `<g>`.

---

## 5. Volet Incohérences

`VueIncoherencesTaches` et `_incoherencesTaches` sont **conservés** mais
alimentés autrement : une méthode `recalculerIncoherences()` sur le greffon
qui, au lieu de lire les canvas, lit le frontmatter de toutes les tâches
(`parent`, `bloque-par`, `debut`, `echeance`), construit `bloquants` +
`compositions`, et rejoue `cyclesDe` + `datesIncoherentes`. Appelée par
l'antirebond `metadataCache.on('changed')` sur un chemin de tâche (remplace
l'antirebond `canvas-taches`).

---

## 6. Ce qui est retiré

- `Plugin.synchroniserCanvas`, `Plugin.canvasDeTaches`.
- `Ariane.lireCanvasTaches`, `Ariane.unionLiens`, `Ariane.majCanvas` (+ leurs
  tests `tests/canvas.test.js`, `tests/canvas-ecriture.test.js`,
  `tests/union.test.js`, la fixture `tests/fixtures/sonde.canvas`).
- Le réglage `couleurCompositionCanvas` (DEFAULT_SETTINGS + onglet Tâches).
- La commande / le déclencheur liés aux `.canvas`.
- Les libellés de traduction devenus orphelins.

**Conservés :** `Ariane.cyclesDe` (+ `tests/cycles.test.js`),
`Ariane.datesIncoherentes` (+ `tests/dates.test.js`), `VueIncoherencesTaches`.

---

## 7. Fichiers touchés

- `main.js` : `Ariane.grapheArticulation`, `Ariane.placerGraphe`,
  `Ariane.lienValide` ; `VueArticulationBase` + `MoteurArticulation` ;
  `registerBasesView('ariane-articulation', …)` ; `recalculerIncoherences`
  sur le greffon ; retrait de la machinerie `.canvas` (§ 6) ;
  `tachesPourGantt` lit `canvas-x/y`.
- `styles.css` : `.zfa-artic-*`.
- `tests/articulation.test.js` : neuf. Retrait des tests canvas (§ 6).
- Onglet Tâches : retrait de « couleur des arêtes de composition ».

---

## 8. Séquence de vérification

1. `node --check main.js`
2. `node --test tests/*.test.js` — dont `tests/articulation.test.js`.
3. `cp main.js styles.css "$HOME/Obsidian Vault/.obsidian/plugins/obsidian-ariane/"`,
   recharger.
4. Dans la base des tâches, ajouter une vue **Articulation** :
   - les tâches apparaissent, placées automatiquement, arêtes hiérarchie +
     blocage visibles ;
   - déplacer un nœud → `canvas-x/y` écrits, la place tient après rechargement ;
   - tirer une sous-tâche / un blocage → arête créée, entête à jour ;
   - tenter un lien qui referme un cycle, ou dont les dates se contredisent →
     refus + message, rien d'écrit ;
   - sélectionner une arête, ⌫ → lien retiré ;
   - « + tâche » → nouvelle note posée, titre éditable ;
   - « re-disposer » → placement auto repris ;
   - le volet Incohérences reflète l'état sans qu'aucun `.canvas` n'existe.

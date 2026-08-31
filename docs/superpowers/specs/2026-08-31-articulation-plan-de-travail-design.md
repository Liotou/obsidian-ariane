# Articulation → plan de travail persistant — conception

**Date** : 2026-08-31
**Statut** : design validé par l'utilisateur (Q&R). À figer en plan d'implémentation.
**Portée** : `MoteurArticulation` (région 15) + `fabriquerVueArticulationBase`. Pas d'autre plugin, pas de nouvelle dépendance.

## 1. Changement de modèle

Avant : la vue d'articulation affiche **tout** le jeu filtré de la base, auto‑disposé par `placerGraphe` à chaque rendu. Après : c'est un **plan de travail**. Il n'affiche que les tâches que l'utilisateur y a **posées** ; cette liste est persistante, dans la config de la vue.

## 2. État du plan — dans la config de la vue

Nouvelle clé de config de vue (`this.config.get/set`), sérialisée dans le `.base` :

```
arianeArtPlan: {
  cartes: [ { ref: "T26-014", x: 120, y: 60, replie: true } , … ],
  _migre: true            // drapeau : migration canvas-x/y déjà faite pour cette vue
}
```

- `replie` : au moins un relatif (sous‑tâche ou bloquante) de cette carte est hors du plan et masqué. Sert à afficher le badge et à ne pas re‑proposer.
- Ordre du tableau = ordre de dessin (z‑index).
- Une `ref` dont la note n'existe plus → retirée du tableau au chargement (silencieux).
- Deux vues d'articulation = deux `arianeArtPlan` indépendants (positions comprises). Voulu.

`MoteurArticulation` lit/écrit ce plan via le `ctx` :
- `ctx.lirePlan()` → `{cartes:[…]}` (jamais null).
- `ctx.ecrirePlan(plan)` → `this.config.set('arianeArtPlan', plan)`.
- `ctx.poserPosition(ref, x, y)` → met à jour `cartes[i].x/y` (ou retire l'entrée si `x == null`). **N'écrit plus dans l'entête des notes.**
- `ctx.poserParent`, `ctx.poserFamille`, `ctx.poserTitre` : inchangés (vraie donnée de tâche).

## 3. Rendu

`dessinerVraiment` :
1. `plan = ctx.lirePlan()`. Purge des refs orphelines (note absente) → `ecrirePlan` si purge.
2. `pool = tachesDuGraphe()` (jeu filtré de la base, inchangé) + `toutes = greffon.tachesPourGantt()` indexées par ref.
3. `refsPlan = plan.cartes.map(c => c.ref)` présentes dans `toutes` (la tâche existe).
4. `noeuds` = uniquement `refsPlan`. **`placerGraphe` n'est PAS appelé.** Chaque nœud prend sa position depuis `cartes[i].x/y`. Une carte sans position (ajout récent non positionné) → placée en cascade près du centre visible.
5. `aretes` = `Ariane.grapheArticulation(toutes).aretes` **filtrées** : on ne trace qu'une arête dont `de` ET `vers` sont dans `refsPlan`.
6. **Loupe** : une carte de `refsPlan` absente de `pool` (ne matche pas le filtre courant) reçoit la classe `zfa-artic-carte-hors-filtre` (opacité réduite, `pointer-events` limités au menu contextuel). Filtre vide → `pool` contient tout, aucune carte grisée.
7. Badges de relatifs hors plan (voir §5).
8. Cadrage : `ajuster()` au premier rendu si le plan est non vide, sinon vue par défaut ; ensuite `appliquerVue()`.
9. Plan vide → message d'accueil : « Glissez des notes de tâche ici, ou utilisez « Ajouter au plan les tâches du filtre ». »

## 4. Ajouter des tâches au plan

### 4.1 Glisser‑déposer

- Écouteurs `dragover` / `drop` sur le `svg` du canvas (comme `el.addEventListener('dragover'/'drop')` du panier, §8115 du code actuel).
- `dragover` : si la charge est une note de tâche → `e.preventDefault()` + `e.dataTransfer.dropEffect = 'copy'` + classe visuelle `zfa-artic-survol-drop` sur la racine.
- `drop` : résoudre la ref via un helper `_refTacheGlissee(e)` calqué sur `greffon.obtenirCleGlissee` (utilise `app.dragManager.draggable` : `file` / `files` / `items` / `linktext`, sinon le texte `[[…]]` du `dataTransfer`), mais critère d'acceptation = `greffon.refDeChemin(f.path)` **non nul** (c'est une note de tâche, identité par dossier). Note non‑tâche → `Notice('Ce n'est pas une note de tâche.')`.
- La ref résolue :
  - déjà dans le plan → recentre la vue dessus + sélectionne, pas de doublon.
  - sinon → `plan.cartes.push({ ref, x, y, replie: <a des relatifs hors plan> })` à la position scène du lâcher (`_versScene`), `ecrirePlan`, `dessiner`, sélectionne la nouvelle carte.

### 4.2 Bouton barre « Ajouter au plan les tâches du filtre »

- Icône `list-plus`. Pose toutes les refs de `pool` (jeu filtré) **absentes** du plan.
- Positions : grille compacte (ex. pas de 240×150) à partir d'un coin près du centre visible, en sautant les cellules qui chevaucheraient une carte déjà posée.
- `replie` de chaque nouvelle carte selon ses relatifs hors plan.
- `ecrirePlan`, `dessiner`, `Notice(n + ' tâche(s) ajoutée(s) au plan')`.

### 4.3 Bouton natif « Nouveau » de la base + commande « Créer une tâche »

- La vue d'articulation, **quand elle est la vue active**, pose automatiquement toute tâche nouvellement créée.
- Mécanisme : `VueArticulationBase` retient l'ensemble des refs vues au dernier `onDataUpdated` (`this._refsConnues`). Au `onDataUpdated` suivant, toute ref nouvelle **et** absente du plan **et** dont la note a été créée il y a moins de ~4 s (`file.stat.ctime`) → `plan.cartes.push({ ref, x: <cascade centre>, y: … })`. Couvre le bouton « Nouveau » et la commande, sans poser les tâches créées ailleurs sur toutes les vues ouvertes.
- Garde‑fou : ne s'applique que si `this.leaf === app.workspace.activeLeaf` (ou équivalent : la vue a le focus).

### 4.4 Création sur le canvas (points d'accroche)

- `_nouvelleTacheReliee(ref, type, s0)` : après `creerTache`, `poserParent`/`creerBlocage`, **ajouter la nouvelle ref au plan** à la position calculée (déjà quasi le cas via `ctx.poserPosition`, qui écrit maintenant dans le plan). Vérifier que la carte parente est bien sur le plan (elle l'est, on tire depuis elle).

## 5. Dépôt = rétracté ; badges = déplier dans le plan

Quand une carte T est sur le plan :
- **Sous‑tâches hors plan** : `enfants(T)` qui ne sont pas dans `refsPlan`. S'il y en a → pastille numérotée `zfa-artic-repli-hier` (nombre = compte). Clic → ajoute ces enfants au plan, posés en éventail sous T (grille locale), `replie` de T recalculé, `dessiner`.
- **Bloquantes hors plan** : tâches qui bloquent T (`aretes` bloque `vers == T`, `de` hors `refsPlan`) → pastille accent `zfa-artic-repli-bloque` (nombre). Clic → ajoute ces bloquantes au plan à gauche de T.
- Les badges existants (`_bloqueCaches`, repli numéroté) sont **repurposés** : ils comptent désormais les relatifs **hors plan** (avant : hors mode d'affichage). `_repliesNoeuds` disparaît (le repli n'est plus « masquer une descendance affichée » mais « des relatifs ne sont pas sur le plan »).
- Au **dépôt** d'une note (glisser, filtre, création) : on n'ajoute **jamais** ses relatifs ; `replie` = vrai s'il en existe hors plan.

## 6. Suppression / retrait

| Geste | Effet | Confirmation |
|---|---|---|
| **⌫ / Suppr** sur la sélection de cartes | **Retire du plan** (`plan.cartes` filtré) ; les notes ne bougent pas | non |
| Clic droit → **Retirer du plan** (`x` / `minus-circle`) | idem, une carte ou la sélection | non |
| Clic droit → **Supprimer la tâche…** (`trash-2`) | `greffon.supprimerTache(ref)` (corbeille) **puis** retire du plan | selon `articulationConfirmerSuppression` |
| ⌫ sur une **arête** sélectionnée | inchangé (retire le lien parent / le blocage) | non |

- `_supprimerNoeuds` (vraie suppression) : conservé, gardé par le réglage, + retire du plan à la fin.
- Nouveau `_retirerDuPlan(refs)` : `plan.cartes = plan.cartes.filter(c => !set.has(c.ref))`, `ecrirePlan`, `dessiner`, `Notice(n + ' carte(s) retirée(s) du plan')`.
- `touche(e)` : `Backspace`/`Delete` sur `_selNoeuds` → `_retirerDuPlan([...])` (plus `_supprimerNoeuds`).

## 7. Bouton « Nettoyer le canvas »

- Bouton barre, icône `eraser` (ou entrée clic‑droit sur le fond).
- Ouvre `ConfirmationRattachement` : « Vider le plan de travail ? Les N cartes sont retirées du canvas. Les notes de tâche ne sont pas supprimées. »
- OK → `ecrirePlan({cartes: [], _migre: true})`, `dessiner`, `Notice`.

## 8. Migration `canvas-x` / `canvas-y`

- Au premier `dessinerVraiment` d'une vue dont `plan._migre` est absent :
  - Pour chaque note de tâche du **jeu filtré** portant `canvas-x`/`canvas-y` : si sa ref n'est pas déjà dans le plan, l'ajouter `{ref, x: canvas-x, y: canvas-y, replie: …}`.
  - Puis, une fois par note reprise, `processFrontMatter` → `delete fm['canvas-x']; delete fm['canvas-y']`.
  - `plan._migre = true`, `ecrirePlan`.
- Après migration, `poserPosition` n'écrit plus jamais dans les entêtes.
- Note : cette reprise ne concerne que les tâches **du filtre courant** au moment de la première ouverture. Une tâche placée jadis mais hors filtre garde ses `canvas-x/y` inutilisés — sans gravité, on ne balaye pas tout le coffre.

## 9. Barre d'outils (icônes seules, infobulles)

Ordre : `layout-grid` Re‑disposer · `maximize-2` Ajuster · `zoom-out` · `zoom-in` · `list-plus` Ajouter au plan les tâches du filtre · `eraser` Nettoyer le canvas.
**Retirés** : `minus` / `plus` (replier / déplier un niveau) — le repli par niveaux n'a plus de sens dans le modèle « plan ». Le toggle Rétracté/Détaillé (`rows-2`/`rows-3`) est **conservé** (compact vs propriétés visibles, réglage de vue `modeCarte`).

## 10. `placerGraphe` / disposition

- Plus appelé au rendu.
- **Re‑disposer** : `placerGraphe(noeuds, aretesFiltrees, opts)` sur tout le plan, puis écrit toutes les positions dans `plan.cartes`, `ecrirePlan`, `dessiner`.
- **Ajouter au plan les tâches du filtre** et les dépliages de badges : disposition **locale** (grille / éventail), pas `placerGraphe`.
- Carte sans position au rendu (cas de bord) : cascade `(centreVue.x + 30*k, centreVue.y + 30*k)`.

## 11. Ce qui ne change pas

- Zoom (molette + boutons), pan (Espace + glissé / clic milieu), rubber‑band, sélection multiple, copier/coller (le collage **ajoute au plan** les copies, déjà le cas via `poserPosition`), double‑clic → `ModaleTache`, renommage en place, chevron propriétés, points d'accroche (clic = nouvelle tâche reliée, tirer = relier existante — la cible d'un tirer doit être **sur le plan**).
- `ariane-articulation` reste l'identifiant de type de vue (compat `.base`).
- Réglages : `articulationConfirmerSuppression`, `articulationFleches`, `articulationAimant` (+ grille + seuil) inchangés.

## 12. Fonctions pures + tests

- `Ariane.grillePlacement(nCartes, {origine:{x,y}, pas:{x,y}, occupe:[{x,y,w,h}]})` → `[{x,y}]` : positions en grille sautant les cellules qui chevauchent une boîte occupée. Testée (grille simple, évitement, origine).
- `Ariane.aretesEntre(aretes, refsSet)` → arêtes dont les deux bouts sont dans l'ensemble. Trivial, testée.
- `Ariane.relativesHorsPlan(ref, aretes, refsPlanSet)` → `{sousTaches:[…], bloquantes:[…]}`. Testée.
- `Ariane.rectSelection` (déjà là), `Ariane.cleTache` (déjà là) inchangées.

## 13. Risques / points d'attention

1. **`config.set` fréquent** : chaque déplacement de carte écrit tout `arianeArtPlan`. Acceptable (petit objet), mais debouncer l'écriture pendant un glissé (écrire au `pointerup`, pas à chaque `pointermove`) — déjà le cas dans `glisserNoeud` (écrit au `lacher`).
2. **`onDataUpdated` boucle** : `rattraperProprietesFamilles` peut déclencher un nouveau `onDataUpdated`. La détection « tâche créée récemment » doit être idempotente (une ref déjà dans le plan ne se re‑pose pas).
3. **Sérialisation `.base`** : vérifier que `config.set` d'un objet imbriqué est bien persisté par Bases (le `modeCarte` actuel est une chaîne). Si Bases n'accepte que des primitives → stocker `JSON.stringify(plan)` sous une clé chaîne et parser à la lecture. **À vérifier en premier dans l'implémentation.**
4. **Glisser depuis l'explorateur** : Obsidian pose la charge dans `app.dragManager.draggable` ; le `drop` HTML5 sur un `<svg>` fonctionne si `dragover` fait `preventDefault`. Tester avec un vrai fichier.
5. **Tirer une arête vers une tâche hors plan** : refuser (ou proposer « ajouter au plan puis relier »). v1 : refus + `Notice`.
6. Migration : ne pas balayer tout le coffre — se limiter au jeu filtré, accepter que quelques `canvas-x/y` traînent hors filtre.

## 14. À faire à la reprise

Valider ce document, puis writing-plans → implémentation (probablement en une branche, MoteurArticulation étant bien isolé ; sous‑agents possibles mais le fichier a des pièges — cf. mémoire octets NUL).

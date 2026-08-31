# Articulation → plan de travail persistant — plan d'implémentation

> **Pour agents :** exécuter tâche par tâche (superpowers:subagent-driven-development ou executing-plans). Cases `- [ ]` pour le suivi.

**But :** transformer la vue d'articulation en plan de travail : ne s'affichent que les tâches posées ; la liste + positions + état de repli vivent dans la config de la vue `.base`.

**Architecture :** changements confinés à la région 15 de `main.js` (`MoteurArticulation`, `fabriquerVueArticulationBase`, `ancreY`, constantes `ARTIC_*`), à `styles.css` (bloc `.zfa-artic-*`), et à de nouveaux tests. Aucune dépendance nouvelle, pas de build.

**Spec :** `docs/superpowers/specs/2026-08-31-articulation-plan-de-travail-design.md` — à lire avec ce plan.

## Contraintes globales

- Un seul fichier `main.js`, pas de build. `main.js` contient 4 octets NUL pré-existants → toujours `grep -a` dessus.
- Tests : `node --test tests/*.test.js` doit rester **vert** à chaque commit (193 au départ ; le nombre monte avec les nouveaux tests).
- `node --check main.js` avant chaque commit.
- Identifiant de type de vue `ariane-articulation` **inchangé** (compat `.base`).
- Le plan est stocké **en chaîne JSON** sous la clé de config de vue `arianeArtPlan` (évite toute question sur la sérialisation d'objets par Bases). Lecture = `JSON.parse` tolérant ; écriture = `JSON.stringify`.
- Messages de commit terminés par `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Après la dernière tâche : `cp main.js styles.css manifest.json` vers `/Users/equiriconi/Obsidian Vault/.obsidian/plugins/obsidian-ariane/`.
- Ne pas pousser, ne pas taguer.

## Vérification (VERIF) — avant chaque commit

```bash
node --check main.js
node --test tests/*.test.js 2>&1 | grep -aE 'tests [0-9]+$|pass [0-9]+$|fail [0-9]+$'   # fail 0
```

---

### Task 1 — Fonctions pures + tests

**Files :**
- Modify : `main.js` (région `Ariane · static · articulation`, après `static rectSelection`)
- Create : `tests/plan-articulation.test.js`

Aucun changement de comportement : on n'ajoute que des statiques et leurs tests.

- [ ] **Step 1 — `Ariane.aretesEntre`**

Dans `main.js`, juste après `static rectSelection(...) { … }` :

```js
  // Les arêtes dont les DEUX extrémités sont dans l'ensemble de refs.
  static aretesEntre(aretes, refs) {
    const s = refs instanceof Set ? refs : new Set(refs || []);
    return (aretes || []).filter((a) => a && s.has(a.de) && s.has(a.vers));
  }

  // Relatifs d'une tâche qui NE SONT PAS sur le plan :
  //  - sousTaches : enfants de `ref` (arête hier `de === ref`) hors plan
  //  - bloquantes : tâches qui bloquent `ref` (arête bloque `vers === ref`) hors plan
  static relativesHorsPlan(ref, aretes, refsPlan) {
    const s = refsPlan instanceof Set ? refsPlan : new Set(refsPlan || []);
    const sousTaches = [];
    const bloquantes = [];
    for (const a of aretes || []) {
      if (!a) continue;
      if (a.type === 'hier' && a.de === ref && !s.has(a.vers)) sousTaches.push(a.vers);
      if (a.type === 'bloque' && a.vers === ref && !s.has(a.de)) bloquantes.push(a.de);
    }
    return { sousTaches, bloquantes };
  }

  // Positions en grille pour poser N cartes, en sautant les cellules qui
  // chevaucheraient une boîte déjà occupée. `occupe` : [{ x, y, w, h }].
  static grillePlacement(n, opts) {
    const o = opts || {};
    const ox = (o.origine && o.origine.x) || 0;
    const oy = (o.origine && o.origine.y) || 0;
    const px = (o.pas && o.pas.x) || 240;
    const py = (o.pas && o.pas.y) || 150;
    const w = o.carte && o.carte.w ? o.carte.w : 210;
    const h = o.carte && o.carte.h ? o.carte.h : 58;
    const occupe = o.occupe || [];
    const chevauche = (x, y) => occupe.some((b) =>
      x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
    const out = [];
    let col = 0;
    let ligne = 0;
    const parLigne = Math.max(1, o.parLigne || 4);
    let garde = 0;
    while (out.length < n && garde < 10000) {
      garde++;
      const x = ox + col * px;
      const y = oy + ligne * py;
      if (!chevauche(x, y) && !out.some((p) => p.x === x && p.y === y)) out.push({ x, y });
      col++;
      if (col >= parLigne) { col = 0; ligne++; }
    }
    return out;
  }
```

- [ ] **Step 2 — Tests** — `tests/plan-articulation.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const A = (de, vers, type) => ({ de, vers, type });

test('aretesEntre garde les arêtes internes à l ensemble', () => {
  const ar = [A('P', 'C', 'hier'), A('P', 'X', 'hier'), A('B', 'P', 'bloque')];
  assert.deepEqual(
    Ariane.aretesEntre(ar, ['P', 'C']),
    [A('P', 'C', 'hier')]);
  assert.deepEqual(Ariane.aretesEntre(ar, new Set(['P', 'C', 'B'])).length, 2);
  assert.deepEqual(Ariane.aretesEntre([], ['P']), []);
});

test('relativesHorsPlan : enfants et bloquantes absents du plan', () => {
  const ar = [A('T', 'C1', 'hier'), A('T', 'C2', 'hier'),
    A('B1', 'T', 'bloque'), A('T', 'B2', 'bloque')];
  const r = Ariane.relativesHorsPlan('T', ar, new Set(['T', 'C1']));
  assert.deepEqual(r.sousTaches, ['C2']);        // C1 est sur le plan
  assert.deepEqual(r.bloquantes, ['B1']);        // B2 est bloqué PAR T, pas l inverse
  const r2 = Ariane.relativesHorsPlan('T', ar, new Set(['T', 'C1', 'C2', 'B1']));
  assert.deepEqual(r2.sousTaches, []);
  assert.deepEqual(r2.bloquantes, []);
});

test('grillePlacement : N positions, saute l occupé, respecte parLigne', () => {
  const g = Ariane.grillePlacement(3, { origine: { x: 0, y: 0 },
    pas: { x: 100, y: 100 }, carte: { w: 50, h: 50 }, parLigne: 2 });
  assert.deepEqual(g, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);

  const occ = [{ x: 0, y: 0, w: 50, h: 50 }];
  const g2 = Ariane.grillePlacement(1, { origine: { x: 0, y: 0 },
    pas: { x: 100, y: 100 }, carte: { w: 50, h: 50 }, occupe: occ, parLigne: 2 });
  assert.deepEqual(g2, [{ x: 100, y: 0 }]);      // (0,0) est occupé

  assert.deepEqual(Ariane.grillePlacement(0, {}), []);
});
```

- [ ] **Step 3 — VERIF**, puis commit :

```
git add main.js tests/plan-articulation.test.js
git commit -m "Articulation : fonctions pures pour le plan de travail (aretesEntre, relativesHorsPlan, grillePlacement)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2 — Stockage du plan dans la config de vue + migration `canvas-x/y`

**Files :** Modify `main.js` (`fabriquerVueArticulationBase`, `MoteurArticulation` constructeur)

**Interfaces produites :** `ctx.lirePlan()`, `ctx.ecrirePlan(plan)`, `ctx.poserPosition` réécrit, `ctx.migrerCanvasXY(refsDuFiltre)`.
Encore **aucun changement visible** : le rendu utilise toujours l'ancien chemin (Task 3 le bascule).

- [ ] **Step 1 — dans `fabriquerVueArticulationBase`**, ajouter au `ctx` (et retirer l'ancien `poserPosition` qui écrivait l'entête) :

```js
        lirePlan: () => {
          let p = null;
          try { p = JSON.parse(this.config.get('arianeArtPlan') || 'null'); } catch (e) { p = null; }
          if (!p || typeof p !== 'object') p = {};
          if (!Array.isArray(p.cartes)) p.cartes = [];
          return p;
        },
        ecrirePlan: (plan) => {
          this.config.set('arianeArtPlan', JSON.stringify(plan || { cartes: [] }));
        },
        poserPosition: async (ref, x, y) => {
          const plan = this.moteur ? this.moteur._plan : null;
          if (!plan) return;
          const i = plan.cartes.findIndex((c) => c.ref === ref);
          if (x == null) { if (i >= 0) plan.cartes.splice(i, 1); }
          else if (i >= 0) { plan.cartes[i].x = Math.round(x); plan.cartes[i].y = Math.round(y); }
          else { plan.cartes.push({ ref, x: Math.round(x), y: Math.round(y), replie: false }); }
          this.config.set('arianeArtPlan', JSON.stringify(plan));
        },
```

- [ ] **Step 2 — migration**, méthode de `VueArticulationBase` :

```js
    async migrerCanvasXY(refsFiltre) {
      const plan = this.moteur && this.moteur._plan;
      if (!plan || plan._migre) return;
      const dejaLa = new Set(plan.cartes.map((c) => c.ref));
      let reprises = 0;
      for (const ref of refsFiltre) {
        if (dejaLa.has(ref)) continue;
        const f = this.greffon.app.vault.getMarkdownFiles().find((z) => z.basename === ref);
        if (!f) continue;
        const fm = (this.greffon.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
        const x = Number(fm['canvas-x']);
        const y = Number(fm['canvas-y']);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        plan.cartes.push({ ref, x, y, replie: false });
        reprises++;
        this.greffon.marquerEcriture(f.path);
        await this.greffon.app.fileManager.processFrontMatter(f, (m) => {
          delete m['canvas-x']; delete m['canvas-y'];
        });
      }
      plan._migre = true;
      this.config.set('arianeArtPlan', JSON.stringify(plan));
      if (reprises) console.log('[Ariane] articulation : ' + reprises + ' position(s) canvas reprises dans la vue');
    }
```

- [ ] **Step 3 — `MoteurArticulation` constructeur** : ajouter `this._plan = { cartes: [] };` (sera rempli par `dessinerVraiment` en Task 3). Retirer `this._repliesNoeuds = new Set();` **maintenant** (plus utilisé après Task 3 ; s'il reste des références, Task 3 les supprime — ici on peut le laisser si `_replierNiveau` y touche encore ; dans le doute, garder jusqu'à Task 3 et le retirer là).

Ruling par défaut : **garder `_repliesNoeuds` jusqu'à Task 3**, le retirer proprement avec `_replierNiveau`/`_deplierNiveau`/`_calculerArbre` dans Task 3.

- [ ] **Step 4 — VERIF** (rien ne doit casser : l'ancien rendu tourne encore, `poserPosition` écrit un plan que personne ne lit). Commit :

```
Articulation : plan de travail stocké en config de vue (JSON) + migration canvas-x/y
```

---

### Task 3 — Rendu basé sur le plan (le cœur)

**Files :** Modify `main.js` (`MoteurArticulation.dessinerVraiment`, `dessinerNoeud`, suppression de `_calculerArbre`/`_compteSousArbre`/`_replierNiveau`/`_deplierNiveau`/`_repliesNoeuds`, boutons barre)

- [ ] **Step 1 — `dessinerVraiment`** : remplacer la construction du jeu de nœuds.

Après avoir obtenu `taches` (via `ctx.taches()` = jeu filtré) :

```js
    // Le plan de travail (config de vue). On ne dessine QUE ses cartes.
    this._plan = this.ctx.lirePlan ? this.ctx.lirePlan() : { cartes: [] };
    // Migration unique canvas-x/y (jeu filtré courant).
    if (this.ctx.migrerCanvasXY && !this._plan._migre) {
      await this.ctx.migrerCanvasXY(taches.map((t) => t.ref));
      this._plan = this.ctx.lirePlan();
    }

    const toutes = this.greffon.tachesPourGantt();
    const parRef = new Map(toutes.map((t) => [t.ref, t]));

    // Purge des cartes dont la note n'existe plus.
    const avant = this._plan.cartes.length;
    this._plan.cartes = this._plan.cartes.filter((c) => parRef.has(c.ref));
    if (this._plan.cartes.length !== avant) this.ctx.ecrirePlan(this._plan);

    const refsPlan = new Set(this._plan.cartes.map((c) => c.ref));
    const posDe = new Map(this._plan.cartes.map((c) => [c.ref, c]));

    if (!refsPlan.size) {
      // …barre d'outils quand même… puis :
      c.createDiv({ cls: 'zfa-artic-vide',
        text: tr('Plan de travail vide. Glissez des notes de tâche ici, ou « Ajouter au plan les tâches du filtre ».') });
      // (garder les écouteurs drag du canvas — cf. Task 4 — même quand vide :
      //  créer le svg vide dans ce cas plutôt que de sortir tôt.)
    }

    const filtre = new Set(taches.map((t) => t.ref)); // pour la loupe
    const noeudsSource = this._plan.cartes
      .filter((c) => parRef.has(c.ref))
      .map((c) => parRef.get(c.ref));
    const grapheAll = Ariane.grapheArticulation(toutes);
    const aretes = Ariane.aretesEntre(grapheAll.aretes, refsPlan);
    // nœuds : forme attendue par le reste du code (grapheArticulation sur le sous-ensemble)
    const { noeuds } = Ariane.grapheArticulation(noeudsSource);
```

- Positions : pour chaque `n` de `noeuds`, `const cc = posDe.get(n.ref);` → `this._pos.set(n.ref, { x: cc.x, y: cc.y })`. Si `cc.x`/`cc.y` manquent (cas de bord) : cascade `centreVue + 30*k`.
- **Supprimer** l'appel à `Ariane.placerGraphe(...)` dans ce chemin. `this._pos` est rempli à la main depuis le plan.
- **Supprimer** `_calculerArbre` / `this._arbre` / `taches.filter(refsVisibles)`.
- `_bloqueCaches` : recalculer comme « bloquantes hors plan » :
  ```js
  this._bloqueCaches = new Map();
  for (const [ref] of posDe) {
    const rel = Ariane.relativesHorsPlan(ref, grapheAll.aretes, refsPlan);
    if (rel.bloquantes.length) this._bloqueCaches.set(ref, rel.bloquantes.length);
  }
  ```
- `_enfantsHorsPlan` : `new Map()` de `ref -> [refs]` via `relativesHorsPlan(ref).sousTaches`, pour le badge numéroté.

- [ ] **Step 2 — `dessinerNoeud`** : le bloc « repli des sous-tâches » (badge numéroté `zfa-artic-repli-hier`) :
  - condition d'affichage : `const sous = (this._enfantsHorsPlan && this._enfantsHorsPlan.get(n.ref)) || [];` → badge si `sous.length`.
  - texte du badge = `String(sous.length)`.
  - clic → `this._deplierRelatifs(n.ref, 'hier')` (Task 7 l'implémente ; ici on peut poser un stub qui appelle `this.dessiner()` — ou faire Task 7 dans la foulée).
  - retirer la gestion `_repliesNoeuds` / `repliee` / `_compteSousArbre` / titre `–`.
  - le badge accent `zfa-artic-repli-bloque` : garder, alimenté par `_bloqueCaches` (déjà « hors plan » depuis Step 1). Clic → `this._deplierRelatifs(n.ref, 'bloque')`.
  - classe loupe : `if (!filtre.has(n.ref)) carte.classList.add('zfa-artic-hors-filtre');` (passer `filtre` à `dessinerNoeud` ou le mettre sur `this._filtre`).

- [ ] **Step 3 — barre d'outils** dans `dessinerVraiment` : retirer les deux `boutonBarre(..., 'minus', ...)` / `('plus', ...)`. Supprimer les méthodes `_replierNiveau` et `_deplierNiveau`.

- [ ] **Step 4 — VERIF** + essai manuel : ouvrir une vue d'articulation existante → les cartes jadis positionnées (via migration) réapparaissent ; une vue neuve → message « plan vide ». Commit :

```
Articulation : rendu basé sur le plan de travail (fin de l'auto-disposition exhaustive)
```

---

### Task 4 — Glisser-déposer une note de tâche sur le canvas

**Files :** Modify `main.js` (`MoteurArticulation` : `dessinerVraiment` écouteurs, nouveau `_refTacheGlissee`, `_poserRef`)

- [ ] **Step 1 — `_refTacheGlissee(e)`** (calqué sur `greffon.obtenirCleGlissee`, critère = note de tâche) :

```js
  _refTacheGlissee(e) {
    const g = this.greffon;
    const estTache = (f) => f && f.extension === 'md' && !!g.refDeChemin(f.path);
    const dm = this.app.dragManager;
    const d = dm && dm.draggable;
    if (d) {
      if (estTache(d.file)) return g.refDeChemin(d.file.path);
      for (const arr of [d.files, d.items]) {
        if (Array.isArray(arr)) for (const f of arr) if (estTache(f)) return g.refDeChemin(f.path);
      }
      for (const k of ['linktext', 'link', 'title', 'name']) {
        if (typeof d[k] === 'string') {
          const cible = d[k].replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].trim();
          const f = this.app.metadataCache.getFirstLinkpathDest(cible, '');
          if (estTache(f)) return g.refDeChemin(f.path);
        }
      }
    }
    const txt = e && e.dataTransfer && e.dataTransfer.getData('text/plain');
    if (txt) {
      const cible = txt.replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].trim();
      const f = this.app.metadataCache.getFirstLinkpathDest(cible, '');
      if (estTache(f)) return g.refDeChemin(f.path);
    }
    return null;
  }
```

- [ ] **Step 2 — écouteurs sur le `svg`** (dans `dessinerVraiment`, à côté des autres `svg.addEventListener`) :

```js
    svg.addEventListener('dragover', (e) => {
      if (!this._refTacheGlissee(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      this.racine.addClass('zfa-artic-survol-drop');
    });
    svg.addEventListener('dragleave', () => this.racine.removeClass('zfa-artic-survol-drop'));
    svg.addEventListener('drop', (e) => {
      this.racine.removeClass('zfa-artic-survol-drop');
      const ref = this._refTacheGlissee(e);
      if (!ref) { new obsidian.Notice(tr("Ce n'est pas une note de tâche.")); return; }
      e.preventDefault();
      const p = this._versScene(e);
      this._poserRef(ref, p.x, p.y);
    });
```

- [ ] **Step 3 — `_poserRef(ref, x, y)`** :

```js
  _poserRef(ref, x, y) {
    const i = this._plan.cartes.findIndex((c) => c.ref === ref);
    if (i >= 0) {
      // déjà sur le plan : recentrer + sélectionner
      this._appliquerSelection(new Set([ref]));
      const cc = this._plan.cartes[i];
      this._vue.x = this._svg.getBoundingClientRect().width / 2 - cc.x * this._vue.k;
      this._vue.y = this._svg.getBoundingClientRect().height / 2 - cc.y * this._vue.k;
      this.appliquerVue();
      return;
    }
    const grapheAll = Ariane.grapheArticulation(this.greffon.tachesPourGantt());
    const refsPlan = new Set(this._plan.cartes.map((c) => c.ref).concat(ref));
    const rel = Ariane.relativesHorsPlan(ref, grapheAll.aretes, refsPlan);
    this._plan.cartes.push({ ref, x: Math.round(x), y: Math.round(y),
      replie: rel.sousTaches.length > 0 || rel.bloquantes.length > 0 });
    this.ctx.ecrirePlan(this._plan);
    this.dessiner();
    this._appliquerSelection(new Set([ref]));
  }
```

- [ ] **Step 4 — VERIF** + essai : glisser une note de tâche depuis l'explorateur → carte posée ; glisser une note quelconque → Notice de refus. Commit :

```
Articulation : glisser une note de tâche sur le canvas la pose sur le plan
```

---

### Task 5 — Boutons « Ajouter les tâches du filtre » et « Nettoyer le canvas »

**Files :** Modify `main.js` (`dessinerVraiment` barre), `styles.css` si besoin

- [ ] **Step 1 — barre d'outils**, après `zoom-in` :

```js
    this.boutonBarre(barre, 'list-plus', tr('Ajouter au plan les tâches du filtre'),
      () => this._ajouterDuFiltre());
    this.boutonBarre(barre, 'eraser', tr('Nettoyer le canvas'), () => this._nettoyerPlan());
```

- [ ] **Step 2 — `_ajouterDuFiltre()`** :

```js
  _ajouterDuFiltre() {
    const filtrees = (this.ctx.taches() || []).map((t) => t.ref);
    const dejaLa = new Set(this._plan.cartes.map((c) => c.ref));
    const aPoser = filtrees.filter((r) => !dejaLa.has(r));
    if (!aPoser.length) { new obsidian.Notice(tr('Toutes les tâches du filtre sont déjà sur le plan.')); return; }
    const b = this._svg.getBoundingClientRect();
    const centre = { x: (b.width / 2 - this._vue.x) / this._vue.k,
      y: (b.height / 2 - this._vue.y) / this._vue.k };
    const occupe = this._plan.cartes.map((c) => ({ x: c.x, y: c.y, w: ARTIC_W, h: ARTIC_H }));
    const pos = Ariane.grillePlacement(aPoser.length, {
      origine: { x: Math.round(centre.x - 360), y: Math.round(centre.y - 200) },
      pas: { x: 240, y: 150 }, carte: { w: ARTIC_W, h: ARTIC_H }, occupe, parLigne: 4 });
    const grapheAll = Ariane.grapheArticulation(this.greffon.tachesPourGantt());
    const refsFin = new Set(this._plan.cartes.map((c) => c.ref).concat(aPoser));
    aPoser.forEach((ref, k) => {
      const rel = Ariane.relativesHorsPlan(ref, grapheAll.aretes, refsFin);
      this._plan.cartes.push({ ref, x: pos[k].x, y: pos[k].y,
        replie: rel.sousTaches.length > 0 || rel.bloquantes.length > 0 });
    });
    this.ctx.ecrirePlan(this._plan);
    this.dessiner();
    new obsidian.Notice(aPoser.length + tr(' tâche(s) ajoutée(s) au plan'));
  }
```

- [ ] **Step 3 — `_nettoyerPlan()`** :

```js
  async _nettoyerPlan() {
    const n = this._plan.cartes.length;
    if (!n) return;
    const ok = await new Promise((res) => new ConfirmationRattachement(this.app,
      tr('Vider le plan de travail ? Les ') + n + tr(' cartes sont retirées du canvas. Les notes de tâche ne sont pas supprimées.'),
      res).open());
    if (!ok) return;
    this._plan = { cartes: [], _migre: true };
    this.ctx.ecrirePlan(this._plan);
    this._selNoeuds = new Set();
    this.dessiner();
    new obsidian.Notice(tr('Plan de travail vidé.'));
  }
```

- [ ] **Step 4 — VERIF** + essai. Commit :

```
Articulation : boutons « Ajouter les tâches du filtre » et « Nettoyer le canvas »
```

---

### Task 6 — Pose automatique d'une tâche créée (bouton natif « Nouveau », commande, canvas)

**Files :** Modify `main.js` (`VueArticulationBase.onDataUpdated`, `_nouvelleTacheReliee`)

- [ ] **Step 1 — `VueArticulationBase`** : mémoriser les refs connues et poser les créations récentes.

Dans `onDataUpdated`, après le `rattraperProprietesFamilles` et avant `this.moteur.dessiner()` :

```js
      try {
        const refsMaint = new Set();
        for (const e of (this.data && this.data.data) || []) {
          const r = e && e.file ? this.greffon.refDeChemin(e.file.path) : null;
          if (r) refsMaint.add(r);
        }
        const active = this.greffon.app.workspace.activeLeaf
          && this.containerEl && this.containerEl.closest
          && this.containerEl.closest('.workspace-leaf')
            === this.greffon.app.workspace.activeLeaf.containerEl;
        if (active && this._refsConnues && this.moteur && this.moteur._plan) {
          const plan = this.moteur._plan;
          const surPlan = new Set(plan.cartes.map((c) => c.ref));
          for (const r of refsMaint) {
            if (this._refsConnues.has(r) || surPlan.has(r)) continue;
            const f = this.greffon.app.vault.getMarkdownFiles().find((z) => z.basename === r);
            const recent = f && f.stat && (Date.now() - f.stat.ctime < 4000);
            if (!recent) continue;
            plan.cartes.push({ ref: r, x: 0, y: 0, replie: false }); // position ajustée au rendu (cascade)
          }
          this.config.set('arianeArtPlan', JSON.stringify(plan));
        }
        this._refsConnues = refsMaint;
      } catch (e) { /* sans gravité */ }
```

Note : la « cascade » de position quand `x/y` valent 0 et qu'une autre carte est déjà en (0,0) est gérée au rendu (Task 3, cas de bord).

- [ ] **Step 2 — `_nouvelleTacheReliee`** : vérifier que la nouvelle ref est bien poussée dans `this._plan` (via `ctx.poserPosition`, qui le fait déjà depuis Task 2). Ajouter, avant le `dessiner`, si absente : `_poserRef`-like push à la position calculée. Confirmer par lecture que `poserPosition(nouv, x, y)` est appelé — sinon l'ajouter.

- [ ] **Step 3 — VERIF** + essai : bouton « Nouveau » de la base avec la vue d'articulation active → la carte apparaît. Créer une tâche par la commande alors qu'une AUTRE vue est active → n'apparaît pas sur le plan. Commit :

```
Articulation : une tâche créée pendant que la vue est active se pose sur le plan
```

---

### Task 7 — Déplier les relatifs hors plan (clic sur badge)

**Files :** Modify `main.js` (`MoteurArticulation._deplierRelatifs`, clics des badges dans `dessinerNoeud`)

- [ ] **Step 1 — `_deplierRelatifs(ref, type)`** :

```js
  _deplierRelatifs(ref, type) {
    const grapheAll = Ariane.grapheArticulation(this.greffon.tachesPourGantt());
    const refsPlan = new Set(this._plan.cartes.map((c) => c.ref));
    const rel = Ariane.relativesHorsPlan(ref, grapheAll.aretes, refsPlan);
    const cibles = type === 'hier' ? rel.sousTaches : rel.bloquantes;
    if (!cibles.length) return;
    const src = this._pt(ref);
    const occupe = this._plan.cartes.map((c) => ({ x: c.x, y: c.y, w: ARTIC_W, h: ARTIC_H }));
    const base = type === 'hier'
      ? { x: src.x - ((cibles.length - 1) * 120), y: src.y + 150 }   // en éventail sous T
      : { x: src.x - 260, y: src.y - ((cibles.length - 1) * 40) };   // à gauche de T
    const pos = Ariane.grillePlacement(cibles.length, {
      origine: { x: Math.round(base.x), y: Math.round(base.y) },
      pas: { x: 240, y: 120 }, carte: { w: ARTIC_W, h: ARTIC_H }, occupe, parLigne: 3 });
    cibles.forEach((r, k) => this._plan.cartes.push({ ref: r, x: pos[k].x, y: pos[k].y, replie: false }));
    // T n'a peut-être plus de relatif hors plan -> recalcul de `replie`
    const ic = this._plan.cartes.findIndex((c) => c.ref === ref);
    if (ic >= 0) {
      const relApres = Ariane.relativesHorsPlan(ref, grapheAll.aretes,
        new Set(this._plan.cartes.map((c) => c.ref)));
      this._plan.cartes[ic].replie = relApres.sousTaches.length > 0 || relApres.bloquantes.length > 0;
    }
    this.ctx.ecrirePlan(this._plan);
    this.dessiner();
  }
```

- [ ] **Step 2** — brancher les `click` des deux badges (`zfa-artic-repli-hier` numéroté, `zfa-artic-repli-bloque` accent) sur `this._deplierRelatifs(n.ref, 'hier' | 'bloque')`. Le badge accent (`_bloqueCaches`) devient cliquable (avant : informatif).

- [ ] **Step 3 — VERIF** + essai : poser un parent → badge « 3 » → clic → les 3 enfants apparaissent, badge disparaît, arêtes hier tracées. Commit :

```
Articulation : cliquer un badge déplie les relatifs hors plan sur le canvas
```

---

### Task 8 — ⌫ retire du plan ; clic droit = retirer OU supprimer

**Files :** Modify `main.js` (`MoteurArticulation.touche`, `_retirerDuPlan`, menu contextuel de carte)

- [ ] **Step 1 — `_retirerDuPlan(refs)`** :

```js
  _retirerDuPlan(refs) {
    const s = new Set((refs || []).filter(Boolean));
    if (!s.size) return;
    this._plan.cartes = this._plan.cartes.filter((c) => !s.has(c.ref));
    this.ctx.ecrirePlan(this._plan);
    this._selNoeuds = new Set();
    this.dessiner();
    new obsidian.Notice(s.size + tr(' carte(s) retirée(s) du plan'));
  }
```

- [ ] **Step 2 — `touche(e)`** : dans la branche `Backspace`/`Delete`, remplacer `await this._supprimerNoeuds([...this._selNoeuds])` par `this._retirerDuPlan([...this._selNoeuds])`. La branche arête (retrait de lien) est inchangée.

- [ ] **Step 3 — menu contextuel de carte** (`carte.addEventListener('contextmenu', …)`) : remplacer l'unique item « Supprimer la tâche… » par deux items :

```js
      m.addItem((i) => i.setTitle(plur ? tr('Retirer les ') + sel.length + tr(' du plan') : tr('Retirer du plan'))
        .setIcon('minus-circle').onClick(() => this._retirerDuPlan(sel)));
      m.addItem((i) => i.setTitle(plur ? tr('Supprimer les ') + sel.length + tr(' tâches…') : tr('Supprimer la tâche…'))
        .setIcon('trash-2').onClick(() => this._supprimerNoeuds(sel)));
```

- [ ] **Step 4 — `_supprimerNoeuds`** : à la fin (après la boucle `supprimerTache`), retirer aussi du plan : `this._plan.cartes = this._plan.cartes.filter((c) => !refs.includes(c.ref)); this.ctx.ecrirePlan(this._plan);` avant `this.dessiner()`.

- [ ] **Step 5 — menu du fond** (`svg` contextmenu) : ajouter une entrée « Nettoyer le canvas » qui appelle `this._nettoyerPlan()` (doublon du bouton barre, pratique).

- [ ] **Step 6 — VERIF** + essai : ⌫ sur une carte → retirée du plan, la note reste dans l'explorateur ; clic droit → les deux options ; « Supprimer » → corbeille + retrait. Commit :

```
Articulation : ⌫ retire du plan ; clic droit propose retirer OU supprimer la note
```

---

### Task 9 — Re-disposer + CSS + finitions

**Files :** Modify `main.js` (`redisposer` / `_replierNiveau` résidus), `styles.css`

- [ ] **Step 1 — `redisposer()`** : re-lancer `Ariane.placerGraphe` sur le plan et **écrire les positions** dans `this._plan` :

```js
  redisposer() {
    if (!this._plan.cartes.length) return;
    const refsPlan = new Set(this._plan.cartes.map((c) => c.ref));
    const sousSet = this.greffon.tachesPourGantt().filter((t) => refsPlan.has(t.ref));
    const { noeuds, aretes } = Ariane.grapheArticulation(sousSet);
    for (const n of noeuds) n.h = n.h || ARTIC_H;
    const pos = Ariane.placerGraphe(noeuds, aretes, { dx: 300, dy: 130 });
    for (const c of this._plan.cartes) {
      const p = pos.get(c.ref);
      if (p) { c.x = Math.round(p.x); c.y = Math.round(p.y); }
    }
    this.ctx.ecrirePlan(this._plan);
    this.dessiner();
  }
```

(vérifier la signature réelle de `placerGraphe` / `grapheArticulation` dans le fichier et adapter).

- [ ] **Step 2 — `styles.css`**, bloc `.zfa-artic-*` :

```css
/* Carte présente sur le plan mais hors du filtre courant (loupe). */
.zfa-artic-carte.zfa-artic-hors-filtre { opacity: 0.4; }
.zfa-artic-noeud:has(.zfa-artic-hors-filtre) .zfa-artic-accroche,
.zfa-artic-noeud:has(.zfa-artic-hors-filtre) .zfa-artic-repli { opacity: 0.4; }
/* Survol de dépôt d'une note sur le canvas. */
.zfa-artic.zfa-artic-survol-drop .zfa-artic-svg {
  outline: 2px dashed var(--interactive-accent); outline-offset: -6px;
}
/* Badge de relatifs hors plan : curseur pointer (cliquable pour déplier). */
.zfa-artic-repli { cursor: pointer; }
/* Message plan vide. */
.zfa-artic-vide {
  position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; text-align: center; padding: 24px;
  color: var(--text-muted); pointer-events: none;
}
```

- [ ] **Step 3** — grep de contrôle : plus aucune référence à `_repliesNoeuds`, `_calculerArbre`, `_compteSousArbre`, `_replierNiveau`, `_deplierNiveau`, `refsVisibles`, `canvas-x` dans la région 15.

```bash
grep -an "_repliesNoeuds\|_calculerArbre\|_compteSousArbre\|_replierNiveau\|_deplierNiveau\|refsVisibles" main.js
grep -an "canvas-x\|canvas-y" main.js   # ne doit plus rien viser côté articulation
```

- [ ] **Step 4 — VERIF** + essai complet dans le coffre :
  - vue existante : cartes migrées visibles ;
  - glisser une note → posée ; bouton « ajouter du filtre » → grille ;
  - filtre natif → cartes hors filtre grisées ;
  - badge → déplie ;
  - ⌫ → retire ; clic droit « Supprimer » → corbeille ;
  - « Re-disposer », « Ajuster », zoom, pan Espace, rubber-band, copier/coller ;
  - « Nettoyer le canvas » → confirmation → vide ;
  - recharger Obsidian → le plan est conservé (config `.base`).

- [ ] **Step 5 — commit** puis `cp main.js styles.css manifest.json` vers le coffre :

```
Articulation : Re-disposer réécrit les positions du plan ; CSS loupe / dépôt / plan vide
```

---

## Auto-revue (à faire après rédaction)

- **Couverture spec** : §2 storage → T2 ; §3 rendu → T3 ; §4.1 glisser → T4 ; §4.2 bouton filtre → T5 ; §4.3 Nouveau → T6 ; §4.4 canvas → T6 ; §5 badges → T3+T7 ; §6 suppression → T8 ; §7 nettoyer → T5 ; §8 migration → T2+T3 ; §9 barre → T3+T5 ; §10 placerGraphe → T3+T9 ; §12 pures → T1. ✔
- **Placeholders** : les « (vérifier la signature réelle) » de T9/T3 sont des rappels de prudence sur du code existant, pas des trous — les snippets sont complets.
- **Cohérence des noms** : `this._plan` (moteur) ↔ `ctx.lirePlan/ecrirePlan` ↔ `arianeArtPlan` (clé config) ; `_poserRef` / `_retirerDuPlan` / `_deplierRelatifs` / `_ajouterDuFiltre` / `_nettoyerPlan` ; helpers `Ariane.aretesEntre` / `relativesHorsPlan` / `grillePlacement`. Cohérent entre tâches.
- **Ordre** : T1 (pur) → T2 (stockage, invisible) → T3 (bascule rendu) → T4–T8 (fonctions) → T9 (finitions). Chaque commit VERIF-vert ; essais manuels aux frontières T3, T6, T9.

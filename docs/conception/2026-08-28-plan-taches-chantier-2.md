# Plan d'implémentation — Chantier 2 : l'articulation par canvas

> **Pour un exécutant agentique :** SOUS-COMPÉTENCE REQUISE — employer
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour dérouler ce plan tâche par tâche.

**But :** tracer les dépendances entre tâches à la souris dans un canvas
Obsidian, et les voir apparaître dans le frontmatter des notes, sans qu'aucune
information n'ait deux propriétaires.

**Architecture :** la lecture d'un canvas, l'union entre canvas, la détection de
cycles et celle des dates incohérentes sont des **fonctions pures**, méthodes
statiques de `ZotflowAtomiser`, donc éprouvables par `node --test`. Les méthodes
d'instance ne font que lire et écrire des fichiers.

**Pile technique :** identique au chantier 1. Tests par
`node --test "tests/**/*.test.js"`.

**Spécification :** `docs/conception/2026-08-28-systeme-de-taches.md`, § 6 et § 7.

**Chantier précédent :** `docs/conception/2026-08-28-plan-taches-chantier-1.md`.

## Contraintes globales

Celles du chantier 1 restent en vigueur. S'y ajoutent :

- **Le canvas fait foi pour les arêtes**, la note fait foi pour son existence,
  son intitulé, son statut et ses dates. Jamais l'inverse.
- **La position et la taille d'un nœud ne sont jamais recopiées** dans une note.
- **Sémantique des arêtes**, telle que la spécification l'arrête :
  arête **sans couleur** → `fromNode` **bloque** `toNode` ;
  arête de la **couleur de composition**, réglable, `6` (violet) par défaut →
  `fromNode` est le **parent** de `toNode` ;
  arête **rouge** (`1`) → réservée au signalement par Ariane, lue comme un
  blocage.
- **Couleurs d'Obsidian :** `1` rouge, `2` orange, `3` jaune, `4` vert,
  `5` cyan, `6` violet. Une couleur peut aussi être un `#rrggbb`.
- **Règle d'union :** pour tout couple ordonné (A, B), le lien existe si au moins
  un canvas de tâches porte une arête de A vers B. Effacer une arête dans un
  canvas ne supprime le lien que si aucun autre ne le porte.
- **Le libellé d'une arête devient l'alias du lien** : `[[T26-038|données livrées]]`.
- **Aucune écriture qui ne change rien.** Toute méthode qui écrit compare avant.
  C'est ce qui empêche les écoutes de se rappeler elles-mêmes.
- **Hors périmètre :** la frise Gantt, le greffon de la vue canvas qui refuserait
  le geste, le pont Rappels, la capture par modèle, l'export, la reprise de
  l'existant.

---

### Tâche 1 : Lire un canvas

**Fichiers :**
- Créer : `tests/fixtures/sonde.canvas`, copie du canvas éprouvé dans le coffre
- Créer : `tests/canvas.test.js`
- Modifier : `main.js`, section « Tâches »

**Interfaces :**
- Produit : `ZotflowAtomiser.lireCanvasTaches(canvas, estTache, couleurCompo) -> {liens, noeuds}`
  - `canvas` est l'objet JSON déjà analysé ;
  - `estTache(chemin)` rend la référence de la tâche (`'T26-001'`) ou `null` ;
  - `couleurCompo` est la couleur de composition en vigueur ;
  - `liens` est un tableau de `{ de, vers, relation, libelle }`, où `relation`
    vaut `'bloque'` ou `'compose'` ;
  - `noeuds` est la liste des références présentes, sans doublon.

Un même fichier peut apparaître dans **plusieurs nœuds** du même canvas : une
arête vers l'un d'eux vaut pour la tâche, quel que soit le nœud choisi.

- [ ] **Étape 1 : figer le format observé**

Copier le canvas éprouvé dans le coffre vers `tests/fixtures/sonde.canvas`. Il
doit contenir au moins deux nœuds de type `file`, une arête sans couleur portant
un libellé, une arête de couleur `6`, et un fichier présent en deux nœuds.

- [ ] **Étape 2 : écrire le test qui échoue**

Créer `tests/canvas.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Ariane = require('./obsidian-factice.js');

const sonde = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'sonde.canvas'), 'utf8'));

// Une tâche est une note du dossier des tâches, reconnue à son nom.
const estTache = (chemin) => {
  const m = String(chemin).match(/\/(T\d{2}-\d{3,4})\.md$/);
  return m ? m[1] : null;
};
const lire = (c) => Ariane.lireCanvasTaches(c, estTache, '6');

test('la sonde du coffre se lit sans erreur', () => {
  const r = lire(sonde);
  assert.ok(r.noeuds.length >= 2);
  assert.ok(r.liens.length >= 1);
});

test('une arête sans couleur est un blocage', () => {
  const r = lire({
    nodes: [
      { id: 'a', type: 'file', file: '8 - Tâches/T26-001.md' },
      { id: 'b', type: 'file', file: '8 - Tâches/T26-002.md' },
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
  });
  assert.deepEqual(r.liens, [{ de: 'T26-001', vers: 'T26-002', relation: 'bloque', libelle: '' }]);
});

test('une arête de la couleur de composition relie un parent à son enfant', () => {
  const r = lire({
    nodes: [
      { id: 'a', type: 'file', file: '8 - Tâches/T26-001.md' },
      { id: 'b', type: 'file', file: '8 - Tâches/T26-002.md' },
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b', color: '6' }],
  });
  assert.equal(r.liens[0].relation, 'compose');
});

test('une arête rouge est un signalement, et reste un blocage', () => {
  const r = lire({
    nodes: [
      { id: 'a', type: 'file', file: '8 - Tâches/T26-001.md' },
      { id: 'b', type: 'file', file: '8 - Tâches/T26-002.md' },
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b', color: '1' }],
  });
  assert.equal(r.liens[0].relation, 'bloque');
});

test('le libellé de l arête est conservé', () => {
  const r = lire({
    nodes: [
      { id: 'a', type: 'file', file: '8 - Tâches/T26-001.md' },
      { id: 'b', type: 'file', file: '8 - Tâches/T26-002.md' },
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b', label: 'données livrées' }],
  });
  assert.equal(r.liens[0].libelle, 'données livrées');
});

test('une arête touchant un nœud qui n est pas une tâche est ignorée', () => {
  const r = lire({
    nodes: [
      { id: 'a', type: 'file', file: '8 - Tâches/T26-001.md' },
      { id: 'x', type: 'text', text: 'une remarque' },
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'x' }],
  });
  assert.deepEqual(r.liens, []);
  assert.deepEqual(r.noeuds, ['T26-001']);
});

test('une tâche présente en deux nœuds ne compte qu une fois', () => {
  const r = lire({
    nodes: [
      { id: 'a', type: 'file', file: '8 - Tâches/T26-001.md' },
      { id: 'b', type: 'file', file: '8 - Tâches/T26-001.md' },
    ],
    edges: [],
  });
  assert.deepEqual(r.noeuds, ['T26-001']);
});

test('une arête d une tâche vers elle-même est écartée', () => {
  const r = lire({
    nodes: [
      { id: 'a', type: 'file', file: '8 - Tâches/T26-001.md' },
      { id: 'b', type: 'file', file: '8 - Tâches/T26-001.md' },
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
  });
  assert.deepEqual(r.liens, []);
});

test('un canvas vide ou malformé ne fait pas tomber la lecture', () => {
  assert.deepEqual(lire({}).liens, []);
  assert.deepEqual(lire(null).noeuds, []);
});
```

- [ ] **Étape 3 : lancer le test et vérifier qu'il échoue**

Lancer : `cd ~/obsidian-ariane && node --test "tests/canvas.test.js"`
Attendu : `Ariane.lireCanvasTaches is not a function`.

- [ ] **Étape 4 : écrire la méthode**

Dans la section « Tâches » de `main.js` :

```js
  // Lecture d'un canvas. On n'y prend que ce dont les notes ont besoin : qui
  // est relié à qui, comment, et sous quel libellé. La position et la taille
  // des nœuds restent au canvas, qui en est seul propriétaire.
  // Un même fichier peut occuper plusieurs nœuds : les arêtes valent alors pour
  // la tâche, sans qu'il faille choisir un nœud de référence.
  static lireCanvasTaches(canvas, estTache, couleurCompo) {
    const c = canvas || {};
    const parId = new Map();
    const noeuds = [];
    for (const n of c.nodes || []) {
      if (!n || n.type !== 'file' || !n.file) continue;
      const ref = estTache(n.file);
      if (!ref) continue;
      parId.set(n.id, ref);
      if (!noeuds.includes(ref)) noeuds.push(ref);
    }
    const liens = [];
    const vus = new Set();
    for (const e of c.edges || []) {
      if (!e) continue;
      const de = parId.get(e.fromNode);
      const vers = parId.get(e.toNode);
      if (!de || !vers || de === vers) continue;
      const relation = String(e.color || '') === String(couleurCompo) ? 'compose' : 'bloque';
      const cle = de + '\\u0000' + vers + '\\u0000' + relation;
      if (vus.has(cle)) continue;
      vus.add(cle);
      liens.push({ de, vers, relation, libelle: String(e.label || '').trim() });
    }
    return { liens, noeuds };
  }
```

- [ ] **Étape 5 : lancer le test et vérifier qu'il passe**

Lancer : `cd ~/obsidian-ariane && node --test "tests/**/*.test.js" && node --check main.js`

- [ ] **Étape 6 : engager**

```bash
cd ~/obsidian-ariane
git add tests main.js
git commit -m "Lire les arêtes d un canvas de tâches

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 2 : L'union entre canvas

**Fichiers :**
- Créer : `tests/union.test.js`
- Modifier : `main.js`, section « Tâches »

**Interfaces :**
- Produit : `ZotflowAtomiser.unionLiens(lectures) -> Map<ref, {parent, bloquePar, conflits}>`
  où `lectures` est le tableau des résultats de `lireCanvasTaches`, `parent` une
  chaîne `[[T26-012|libellé]]` ou `''`, `bloquePar` un tableau de telles chaînes
  trié, et `conflits` la liste des parents concurrents quand il y en a plusieurs.

Une tâche n'a **qu'un parent**. Deux canvas qui lui en donnent deux différents se
contredisent : on retient le premier dans l'ordre alphabétique, pour que le
résultat ne dépende pas de l'ordre de lecture des fichiers, et on signale.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `tests/union.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const l = (de, vers, relation, libelle) => ({ de, vers, relation, libelle: libelle || '' });

test('un blocage devient une entrée de bloque-par sur la tâche bloquée', () => {
  const u = Ariane.unionLiens([{ liens: [l('T26-001', 'T26-002', 'bloque')] }]);
  assert.deepEqual(u.get('T26-002').bloquePar, ['[[T26-001]]']);
  assert.equal(u.get('T26-001').bloquePar.length, 0);
});

test('une composition devient le parent de l enfant', () => {
  const u = Ariane.unionLiens([{ liens: [l('T26-001', 'T26-002', 'compose')] }]);
  assert.equal(u.get('T26-002').parent, '[[T26-001]]');
});

test('le libellé passe en alias du lien', () => {
  const u = Ariane.unionLiens([{ liens: [l('T26-001', 'T26-002', 'bloque', 'données livrées')] }]);
  assert.deepEqual(u.get('T26-002').bloquePar, ['[[T26-001|données livrées]]']);
});

test('deux canvas qui portent la même arête ne la comptent qu une fois', () => {
  const u = Ariane.unionLiens([
    { liens: [l('T26-001', 'T26-002', 'bloque')] },
    { liens: [l('T26-001', 'T26-002', 'bloque')] },
  ]);
  assert.deepEqual(u.get('T26-002').bloquePar, ['[[T26-001]]']);
});

test('les arêtes de canvas différents s additionnent', () => {
  const u = Ariane.unionLiens([
    { liens: [l('T26-001', 'T26-003', 'bloque')] },
    { liens: [l('T26-002', 'T26-003', 'bloque')] },
  ]);
  assert.deepEqual(u.get('T26-003').bloquePar, ['[[T26-001]]', '[[T26-002]]']);
});

test('deux parents concurrents sont signalés, et le tri décide', () => {
  const u = Ariane.unionLiens([
    { liens: [l('T26-009', 'T26-003', 'compose')] },
    { liens: [l('T26-002', 'T26-003', 'compose')] },
  ]);
  assert.equal(u.get('T26-003').parent, '[[T26-002]]');
  assert.deepEqual(u.get('T26-003').conflits, ['T26-002', 'T26-009']);
});

test('sans conflit la liste des conflits est vide', () => {
  const u = Ariane.unionLiens([{ liens: [l('T26-001', 'T26-002', 'compose')] }]);
  assert.deepEqual(u.get('T26-002').conflits, []);
});

test('une tâche qui ne fait que bloquer figure tout de même dans la table', () => {
  const u = Ariane.unionLiens([{ liens: [l('T26-001', 'T26-002', 'bloque')] }]);
  assert.ok(u.has('T26-001'));
  assert.equal(u.get('T26-001').parent, '');
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `node --test "tests/union.test.js"`

- [ ] **Étape 3 : écrire la méthode**

```js
  // Réunion des arêtes de tous les canvas. Un lien existe s'il figure dans au
  // moins un d'entre eux : c'est ce qui permet d'ouvrir un canvas partiel sans
  // effacer les liens tracés ailleurs.
  // Une tâche n'a qu'un parent. Deux canvas qui lui en donnent deux se
  // contredisent : on retient le premier dans l'ordre alphabétique, pour que le
  // résultat ne dépende pas de l'ordre de lecture des fichiers, et on signale.
  static unionLiens(lectures) {
    const table = new Map();
    const assurer = (ref) => {
      if (!table.has(ref)) table.set(ref, { parent: '', bloquePar: [], conflits: [] });
      return table.get(ref);
    };
    const bloquants = new Map();   // enfant -> Map(parentRef -> libellé)
    const parents = new Map();     // enfant -> Map(parentRef -> libellé)
    for (const lecture of lectures || []) {
      for (const lien of (lecture && lecture.liens) || []) {
        assurer(lien.de);
        assurer(lien.vers);
        const cible = lien.relation === 'compose' ? parents : bloquants;
        if (!cible.has(lien.vers)) cible.set(lien.vers, new Map());
        const m = cible.get(lien.vers);
        // Un libellé déjà posé n'est pas effacé par une arête qui n'en a pas.
        if (!m.get(lien.de)) m.set(lien.de, lien.libelle || '');
      }
    }
    const ecrire = (ref, libelle) => '[[' + ref + (libelle ? '|' + libelle : '') + ']]';
    for (const [enfant, m] of bloquants) {
      assurer(enfant).bloquePar = [...m.keys()].sort()
        .map((ref) => ecrire(ref, m.get(ref)));
    }
    for (const [enfant, m] of parents) {
      const refs = [...m.keys()].sort();
      const e = assurer(enfant);
      e.parent = ecrire(refs[0], m.get(refs[0]));
      e.conflits = refs.length > 1 ? refs : [];
    }
    return table;
  }
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `node --test "tests/**/*.test.js" && node --check main.js`

- [ ] **Étape 5 : engager**

```bash
cd ~/obsidian-ariane
git add tests main.js
git commit -m "Réunir les arêtes de tous les canvas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 3 : Les cycles

**Fichiers :**
- Créer : `tests/cycles.test.js`
- Modifier : `main.js`, section « Tâches »

**Interfaces :**
- Produit : `ZotflowAtomiser.cyclesDe(aretes) -> string[][]` où `aretes` est un
  tableau de `{ de, vers }` et le résultat la liste des cycles, chacun donné
  comme la suite de ses références, la première répétée en fin pour se lire.

Un cycle de blocage rend la disposition de la frise incalculable. Un cycle de
composition produit en outre une descente infinie. Les deux graphes se
contrôlent avec la même fonction.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `tests/cycles.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const a = (de, vers) => ({ de, vers });

test('un graphe sans cycle n en signale aucun', () => {
  assert.deepEqual(Ariane.cyclesDe([a('A', 'B'), a('B', 'C')]), []);
});

test('un cycle de deux est trouvé', () => {
  const c = Ariane.cyclesDe([a('A', 'B'), a('B', 'A')]);
  assert.equal(c.length, 1);
  assert.equal(c[0][0], c[0][c[0].length - 1]);
  assert.ok(c[0].includes('A') && c[0].includes('B'));
});

test('un cycle de trois est trouvé', () => {
  const c = Ariane.cyclesDe([a('A', 'B'), a('B', 'C'), a('C', 'A')]);
  assert.equal(c.length, 1);
  assert.equal(c[0].length, 4);
});

test('une boucle sur soi est un cycle', () => {
  assert.equal(Ariane.cyclesDe([a('A', 'A')]).length, 1);
});

test('un losange n est pas un cycle', () => {
  assert.deepEqual(Ariane.cyclesDe([a('A', 'B'), a('A', 'C'), a('B', 'D'), a('C', 'D')]), []);
});

test('deux cycles disjoints sont tous deux signalés', () => {
  const c = Ariane.cyclesDe([a('A', 'B'), a('B', 'A'), a('X', 'Y'), a('Y', 'X')]);
  assert.equal(c.length, 2);
});

test('un graphe vide ne fait pas tomber la fonction', () => {
  assert.deepEqual(Ariane.cyclesDe([]), []);
  assert.deepEqual(Ariane.cyclesDe(null), []);
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `node --test "tests/cycles.test.js"`

- [ ] **Étape 3 : écrire la méthode**

```js
  // Détection des cycles par parcours en profondeur. Le tableau « chemin »
  // garde la branche courante : y retomber, c'est boucler.
  // Un cycle n'est retenu qu'une fois, quel que soit le sommet par lequel on y
  // entre, d'où la signature construite sur ses membres triés.
  static cyclesDe(aretes) {
    const sortants = new Map();
    for (const e of aretes || []) {
      if (!e || !e.de || !e.vers) continue;
      if (!sortants.has(e.de)) sortants.set(e.de, []);
      sortants.get(e.de).push(e.vers);
    }
    const trouves = new Map();
    const clos = new Set();
    const chemin = [];
    const dansChemin = new Set();
    const descendre = (n) => {
      if (dansChemin.has(n)) {
        const cycle = chemin.slice(chemin.indexOf(n)).concat([n]);
        const signature = [...new Set(cycle)].sort().join('\\u0000');
        if (!trouves.has(signature)) trouves.set(signature, cycle);
        return;
      }
      if (clos.has(n)) return;
      chemin.push(n);
      dansChemin.add(n);
      for (const suivant of sortants.get(n) || []) descendre(suivant);
      dansChemin.delete(n);
      chemin.pop();
      clos.add(n);
    };
    for (const depart of sortants.keys()) descendre(depart);
    return [...trouves.values()];
  }
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `node --test "tests/**/*.test.js" && node --check main.js`

- [ ] **Étape 5 : engager**

```bash
cd ~/obsidian-ariane
git add tests main.js
git commit -m "Détecter les cycles de blocage et de composition

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 4 : Les dates incohérentes

**Fichiers :**
- Créer : `tests/dates.test.js`
- Modifier : `main.js`, section « Tâches »

**Interfaces :**
- Produit : `ZotflowAtomiser.datesIncoherentes(aretes, datesParRef) -> [{de, vers, fin, debut}]`
  où `datesParRef` est un objet `{ 'T26-001': { debut, echeance } }`.

Si A bloque B, B ne peut pas commencer avant que A ne s'achève. Une date
manquante d'un côté ou de l'autre ne permet de rien conclure, et ne signale rien.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `tests/dates.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const dates = {
  'T26-001': { debut: '2026-09-01', echeance: '2026-09-30' },
  'T26-002': { debut: '2026-09-15', echeance: '2026-10-15' },
  'T26-003': { debut: '2026-10-01', echeance: '2026-10-20' },
  'T26-004': { debut: '', echeance: '' },
};

test('une tâche qui commence avant la fin de ce qui la bloque est signalée', () => {
  const r = Ariane.datesIncoherentes([{ de: 'T26-001', vers: 'T26-002' }], dates);
  assert.equal(r.length, 1);
  assert.equal(r[0].de, 'T26-001');
  assert.equal(r[0].vers, 'T26-002');
});

test('un enchaînement correct ne signale rien', () => {
  assert.deepEqual(Ariane.datesIncoherentes([{ de: 'T26-001', vers: 'T26-003' }], dates), []);
});

test('commencer le jour même de l échéance reste admis', () => {
  const d = { A: { echeance: '2026-09-30' }, B: { debut: '2026-09-30' } };
  assert.deepEqual(Ariane.datesIncoherentes([{ de: 'A', vers: 'B' }], d), []);
});

test('une date manquante ne permet de rien conclure', () => {
  assert.deepEqual(Ariane.datesIncoherentes([{ de: 'T26-001', vers: 'T26-004' }], dates), []);
  assert.deepEqual(Ariane.datesIncoherentes([{ de: 'T26-004', vers: 'T26-002' }], dates), []);
});

test('une tâche inconnue de la table ne fait pas tomber la fonction', () => {
  assert.deepEqual(Ariane.datesIncoherentes([{ de: 'T26-001', vers: 'T26-999' }], dates), []);
});

test('plusieurs arêtes fautives sont toutes signalées', () => {
  const d = {
    A: { echeance: '2026-09-30' }, B: { debut: '2026-09-01' }, C: { debut: '2026-09-02' },
  };
  assert.equal(Ariane.datesIncoherentes([{ de: 'A', vers: 'B' }, { de: 'A', vers: 'C' }], d).length, 2);
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `node --test "tests/dates.test.js"`

- [ ] **Étape 3 : écrire la méthode**

```js
  // Si A bloque B, B ne peut pas commencer avant que A ne s'achève. Commencer
  // le jour même de l'échéance reste admis : une tâche peut prendre la suite
  // d'une autre dans la journée.
  // Une date manquante ne permet de rien conclure, et ne signale donc rien :
  // mieux vaut taire un doute que crier une fausse erreur à chaque tâche non
  // encore planifiée.
  static datesIncoherentes(aretes, datesParRef) {
    const d = datesParRef || {};
    const jour = (v) => {
      const s = String(v == null ? '' : v).slice(0, 10);
      return /^\\d{4}-\\d{2}-\\d{2}$/.test(s) ? s : '';
    };
    const out = [];
    for (const e of aretes || []) {
      if (!e) continue;
      const fin = jour(d[e.de] && d[e.de].echeance);
      const debut = jour(d[e.vers] && d[e.vers].debut);
      if (!fin || !debut) continue;
      if (debut < fin) out.push({ de: e.de, vers: e.vers, fin, debut });
    }
    return out;
  }
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `node --test "tests/**/*.test.js" && node --check main.js`

- [ ] **Étape 5 : engager**

```bash
cd ~/obsidian-ariane
git add tests main.js
git commit -m "Signaler les dates qui contredisent un blocage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 5 : Écrire les liens dans les notes

**Fichiers :**
- Modifier : `main.js`, section « Tâches », plus `onload` et `DEFAULT_SETTINGS`

**Interfaces :**
- Consomme : `lireCanvasTaches`, `unionLiens`, `cyclesDe`, `datesIncoherentes`.
- Produit :
  - le réglage `couleurCompositionCanvas`, `'6'` par défaut ;
  - `canvasDeTaches() -> TFile[]`, les canvas dont au moins un nœud vise une tâche ;
  - `refDeChemin(chemin) -> string|null` ;
  - `async synchroniserCanvas() -> {ecrites, cycles, dates, conflits}`.

Cette tâche n'a pas de test automatisé : elle ne fait que lire et écrire des
fichiers. Elle est éprouvée à la main, à l'étape 4.

- [ ] **Étape 1 : déclarer le réglage**

Dans `DEFAULT_SETTINGS`, à la suite de `listeRappelsDefaut` :

```js
  couleurCompositionCanvas: '6',
```

Et dans l'onglet de réglages, à la suite du rôle `dossierTaches` :

```js
    new obsidian.Setting(c)
      .setName(tr('Couleur des arêtes de composition'))
      .setDesc(tr("Dans un canvas de tâches, une arête de cette couleur relie une méta-tâche à ce qui la compose. Une arête sans couleur est un blocage. Le rouge est réservé aux signalements d'Ariane."))
      .addDropdown((d) => d
        .addOption('2', tr('orange')).addOption('3', tr('jaune'))
        .addOption('4', tr('vert')).addOption('5', tr('cyan'))
        .addOption('6', tr('violet'))
        .setValue(s.couleurCompositionCanvas || '6')
        .onChange(async (v) => { s.couleurCompositionCanvas = v; await maj(); }));
```

- [ ] **Étape 2 : écrire les trois méthodes**

Dans la section « Tâches » :

```js
  // La référence d'une tâche, déduite du chemin. On la reconnaît à sa forme
  // plutôt qu'à son dossier : une tâche déplacée reste une tâche.
  refDeChemin(chemin) {
    const m = String(chemin || '').match(/(?:^|\\/)(T\\d{2}-\\d{3,4})\\.md$/);
    return m ? m[1] : null;
  }

  // Est canvas de tâches tout fichier .canvas dont au moins un nœud vise une
  // note de tâche. Aucun dossier convenu, aucun réglage : Monsieur range ses
  // canvas où il veut.
  async canvasDeTaches() {
    const out = [];
    for (const f of this.app.vault.getFiles()) {
      if (f.extension !== 'canvas') continue;
      let json = null;
      try { json = JSON.parse(await this.app.vault.read(f)); } catch (e) { continue; }
      const lu = ZotflowAtomiser.lireCanvasTaches(
        json, (p) => this.refDeChemin(p), this.settings.couleurCompositionCanvas || '6');
      if (lu.noeuds.length) out.push({ fichier: f, json, lu });
    }
    return out;
  }

  // Reporte dans les notes ce que les canvas disent des liens. Le canvas fait
  // foi : parent et bloque-par sont réécrits d'après lui, jamais l'inverse.
  // Aucune écriture qui ne change rien, sans quoi l'écoute qui appelle cette
  // méthode se rappellerait elle-même sans fin.
  async synchroniserCanvas() {
    const canvas = await this.canvasDeTaches();
    const table = ZotflowAtomiser.unionLiens(canvas.map((c) => c.lu));
    const tous = [].concat(...canvas.map((c) => c.lu.liens));
    const bloquants = tous.filter((l) => l.relation === 'bloque');
    const compositions = tous.filter((l) => l.relation === 'compose');

    const dates = {};
    const fichierDe = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const ref = this.refDeChemin(f.path);
      if (!ref) continue;
      fichierDe.set(ref, f);
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      dates[ref] = { debut: fm.debut || '', echeance: fm.echeance || '' };
    }

    const cycles = ZotflowAtomiser.cyclesDe(bloquants)
      .concat(ZotflowAtomiser.cyclesDe(compositions));
    const incoherences = ZotflowAtomiser.datesIncoherentes(bloquants, dates);
    const conflits = [];
    let ecrites = 0;

    for (const [ref, etat] of table) {
      if (etat.conflits.length) conflits.push({ ref, parents: etat.conflits });
      const f = fichierDe.get(ref);
      if (!f) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const avantParent = String(fm.parent == null ? '' : fm.parent);
      const avantBloque = [].concat(fm['bloque-par'] || []).map(String);
      const memeListe = avantBloque.length === etat.bloquePar.length
        && avantBloque.every((v, i) => v === etat.bloquePar[i]);
      if (avantParent === etat.parent && memeListe) continue;
      await this.app.fileManager.processFrontMatter(f, (x) => {
        x.parent = etat.parent;
        x['bloque-par'] = etat.bloquePar;
        x.modifie = new Date().toISOString().slice(0, 10);
      });
      ecrites += 1;
    }
    this._incoherencesTaches = { cycles, dates: incoherences, conflits };
    return { ecrites, cycles, dates: incoherences, conflits };
  }
```

- [ ] **Étape 3 : brancher l'écoute et la commande**

Dans `onload`, à la suite de l'écoute qui rafraîchit le bloc :

```js
    // Le canvas fait foi pour les arêtes : sa modification se reporte dans les
    // notes. L'antirebond laisse passer un glissé de plusieurs nœuds en une
    // seule passe.
    const surCanvas = (f) => {
      if (!f || f.extension !== 'canvas') return;
      this.antirebond('canvas-taches', () => this.synchroniserCanvas(), 1200);
    };
    this.registerEvent(this.app.vault.on('modify', surCanvas));
    this.registerEvent(this.app.vault.on('create', surCanvas));
    this.registerEvent(this.app.vault.on('delete', surCanvas));
```

Et une commande, à côté de `creer-tache` :

```js
    this.addCommand({
      id: 'synchroniser-canvas-taches',
      name: tr('Tâches : relire les canvas'),
      callback: async () => {
        const r = await this.synchroniserCanvas();
        new obsidian.Notice(
          r.ecrites + tr(' note(s) mise(s) à jour, ')
          + (r.cycles.length + r.dates.length + r.conflits.length) + tr(' incohérence(s).'));
      },
    });
```

Cette commande n'est pas à usage unique : elle sert chaque fois qu'un canvas
revient d'une synchronisation externe, cas où l'écoute peut n'avoir rien vu.

Ajouter dans `TEXTES.en` les clés introduites.

- [ ] **Étape 4 : éprouver dans le coffre**

```bash
cd ~/obsidian-ariane && node --check main.js && node --test "tests/**/*.test.js"
cp main.js "$HOME/Obsidian Vault/.obsidian/plugins/zotflow-atomiser/"
```

Dans un canvas, poser deux notes de tâche et tirer une flèche de l'une à l'autre.
Vérifier que `bloque-par` apparaît dans la note visée, dans la seconde qui suit.
Nommer la flèche et vérifier que le libellé arrive en alias. Effacer la flèche
et vérifier que le champ se vide. Vérifier surtout qu'aucune boucle ne s'installe.

- [ ] **Étape 5 : engager**

```bash
cd ~/obsidian-ariane
git add main.js
git commit -m "Reporter dans les notes les arêtes des canvas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 6 : Écrire dans le canvas

**Fichiers :**
- Modifier : `main.js`, section « Tâches »
- Créer : `tests/canvas-ecriture.test.js`

**Interfaces :**
- Produit :
  - `ZotflowAtomiser.majCanvas(json, etats, incoherences, couleurCompo) -> {json, change}`
    où `etats` est un objet `{ 'T26-001': { statut } }` ;
  - `async ecrireCanvas()` qui applique le résultat aux fichiers.

Deux écritures seulement, et dans ce sens-là uniquement : la **couleur du nœud**
suit le statut de la note, et l'**arête fautive** passe au rouge. La position, la
taille et le libellé restent intouchés, ils appartiennent au canvas.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `tests/canvas-ecriture.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const canvas = () => ({
  nodes: [
    { id: 'a', type: 'file', file: '8 - Tâches/T26-001.md', x: 0, y: 0, width: 300, height: 200 },
    { id: 'b', type: 'file', file: '8 - Tâches/T26-002.md', x: 500, y: 0, width: 300, height: 200 },
  ],
  edges: [{ id: 'e', fromNode: 'a', toNode: 'b', label: 'suite' }],
});

test('un nœud prend la couleur de son statut', () => {
  const r = Ariane.majCanvas(canvas(), { 'T26-001': { statut: 'terminée' } }, [], '6');
  assert.ok(r.change);
  assert.equal(r.json.nodes.find((n) => n.id === 'a').color, '4');
});

test('la position et la taille ne bougent pas', () => {
  const r = Ariane.majCanvas(canvas(), { 'T26-001': { statut: 'terminée' } }, [], '6');
  const n = r.json.nodes.find((x) => x.id === 'a');
  assert.equal(n.x, 0);
  assert.equal(n.width, 300);
});

test('une arête fautive passe au rouge', () => {
  const r = Ariane.majCanvas(canvas(), {}, [{ de: 'T26-001', vers: 'T26-002' }], '6');
  assert.equal(r.json.edges[0].color, '1');
});

test('le libellé d une arête devenue rouge est conservé', () => {
  const r = Ariane.majCanvas(canvas(), {}, [{ de: 'T26-001', vers: 'T26-002' }], '6');
  assert.equal(r.json.edges[0].label, 'suite');
});

test('une arête redevenue cohérente perd son rouge', () => {
  const c = canvas();
  c.edges[0].color = '1';
  const r = Ariane.majCanvas(c, {}, [], '6');
  assert.ok(!r.json.edges[0].color);
});

test('une arête de composition ne se fait pas rougir par mégarde', () => {
  const c = canvas();
  c.edges[0].color = '6';
  const r = Ariane.majCanvas(c, {}, [{ de: 'T26-001', vers: 'T26-002' }], '6');
  assert.equal(r.json.edges[0].color, '6');
});

test('sans rien à changer le canvas n est pas réécrit', () => {
  assert.equal(Ariane.majCanvas(canvas(), {}, [], '6').change, false);
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `node --test "tests/canvas-ecriture.test.js"`

- [ ] **Étape 3 : écrire la méthode statique**

La correspondance des couleurs de statut est fixe : `à faire` sans couleur,
`en cours` en `3` jaune, `en attente` en `2` orange, `terminée` en `4` vert,
`abandonnée` en `5` cyan.

```js
  static get COULEURS_STATUT() {
    return { 'à faire': '', 'en cours': '3', 'en attente': '2', 'terminée': '4', 'abandonnée': '5' };
  }

  // Les deux seules choses qu'Ariane écrit dans un canvas : la couleur d'un
  // nœud, qui suit le statut de sa note, et le rouge d'une arête fautive.
  // La position, la taille et le libellé appartiennent au canvas et ne sont
  // jamais touchés. Rend change à faux quand rien ne bouge, pour ne pas
  // réécrire un fichier que Monsieur a peut-être ouvert.
  static majCanvas(json, etats, incoherences, couleurCompo) {
    const c = JSON.parse(JSON.stringify(json || {}));
    const couleurs = ZotflowAtomiser.COULEURS_STATUT;
    const ref = (chemin) => {
      const m = String(chemin || '').match(/(?:^|\\/)(T\\d{2}-\\d{3,4})\\.md$/);
      return m ? m[1] : null;
    };
    let change = false;
    const parId = new Map();
    for (const n of c.nodes || []) {
      if (!n || n.type !== 'file') continue;
      const r = ref(n.file);
      if (!r) continue;
      parId.set(n.id, r);
      const etat = (etats || {})[r];
      if (!etat || !(etat.statut in couleurs)) continue;
      const voulue = couleurs[etat.statut];
      const actuelle = n.color || '';
      if (voulue === actuelle) continue;
      if (voulue) n.color = voulue; else delete n.color;
      change = true;
    }
    const fautives = new Set(
      (incoherences || []).map((i) => i.de + '\\u0000' + i.vers));
    for (const e of c.edges || []) {
      if (!e) continue;
      const de = parId.get(e.fromNode);
      const vers = parId.get(e.toNode);
      if (!de || !vers) continue;
      // Une arête de composition n'est pas concernée : le contrôle des dates
      // ne porte que sur les blocages.
      if (String(e.color || '') === String(couleurCompo)) continue;
      const doitRougir = fautives.has(de + '\\u0000' + vers);
      const rouge = String(e.color || '') === '1';
      if (doitRougir === rouge) continue;
      if (doitRougir) e.color = '1'; else delete e.color;
      change = true;
    }
    return { json: c, change };
  }
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `node --test "tests/**/*.test.js" && node --check main.js`

- [ ] **Étape 5 : brancher l'écriture**

À la fin de `synchroniserCanvas`, avant le `return` :

```js
    const etats = {};
    for (const [ref, f] of fichierDe) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      etats[ref] = { statut: fm.statut || '' };
    }
    for (const c of canvas) {
      const r = ZotflowAtomiser.majCanvas(
        c.json, etats, incoherences, this.settings.couleurCompositionCanvas || '6');
      if (!r.change) continue;
      await this.app.vault.modify(c.fichier, JSON.stringify(r.json, null, 2));
    }
```

- [ ] **Étape 6 : éprouver dans le coffre**

```bash
cd ~/obsidian-ariane && node --check main.js && node --test "tests/**/*.test.js"
cp main.js "$HOME/Obsidian Vault/.obsidian/plugins/zotflow-atomiser/"
```

Passer une tâche du canvas au statut `terminée` et vérifier que son nœud verdit.
Donner à la tâche bloquée une date de début antérieure à l'échéance de ce qui la
bloque, et vérifier que la flèche rougit. Corriger la date et vérifier qu'elle
reprend sa couleur.

- [ ] **Étape 7 : engager**

```bash
cd ~/obsidian-ariane
git add tests main.js
git commit -m "Teindre les nœuds selon le statut et les arêtes fautives en rouge

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 7 : Le volet des incohérences

**Fichiers :**
- Modifier : `main.js`, nouvelle vue à côté de `VueReferencesAttente`
- Modifier : `styles.css`

**Interfaces :**
- Consomme : `this._incoherencesTaches`, posé par `synchroniserCanvas`.
- Produit : `class VueIncoherencesTaches extends obsidian.ItemView`, de type
  `'zfa-taches-incoherences'`.

Le volet liste ce qu'Ariane ne peut pas trancher seule : cycles de blocage ou de
composition, dates qui contredisent un blocage, parents concurrents, liens morts,
et conflits de champs de désignation. Chaque ligne ouvre la note en cause.

- [ ] **Étape 1 : écrire la vue**

Suivre exactement la structure de `VueReferencesAttente` : `getViewType`,
`getDisplayText`, `getIcon`, `onOpen`, `dessiner`. Le corps rend quatre sections,
chacune masquée si elle est vide, et un état « rien à signaler » quand toutes le
sont. Réemployer la méthode `this.bouton(parent, libellé, icône, action)` déjà
présente sur les vues du greffon pour les accès aux notes.

- [ ] **Étape 2 : enregistrer la vue et sa commande**

Dans `onload`, à côté de l'enregistrement de `TYPE_VUE_REFS` :

```js
    this.registerView(TYPE_VUE_INCOHERENCES, (feuille) => new VueIncoherencesTaches(feuille, this));
```

Puis une commande « Tâches : incohérences », qui ouvre le volet à droite en
suivant le motif de `ouvrirVueReferences`.

- [ ] **Étape 3 : styler**

Dans `styles.css`, reprendre les classes du volet des références en attente
plutôt que d'en inventer : le volet doit se fondre dans le greffon.

- [ ] **Étape 4 : éprouver dans le coffre**

```bash
cd ~/obsidian-ariane && node --check main.js && node --test "tests/**/*.test.js"
cp main.js styles.css "$HOME/Obsidian Vault/.obsidian/plugins/zotflow-atomiser/"
```

Fabriquer volontairement un cycle de deux tâches dans un canvas, ouvrir le volet
et vérifier qu'il le signale. Défaire le cycle et vérifier que le volet se vide.

- [ ] **Étape 5 : engager**

```bash
cd ~/obsidian-ariane
git add main.js styles.css
git commit -m "Volet des incohérences des tâches

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Après le chantier

Documenter dans les deux README, puis publier `2.76.0`.

Le chantier 3a, la frise Gantt, ne s'ouvre qu'après quelques jours d'usage réel
du canvas. C'est l'usage qui dira si la couleur suffit à distinguer les deux
relations, ou s'il faut un second signe.

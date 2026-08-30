# Plan d'implémentation — Chantier 1 : le noyau des tâches

> **Pour un exécutant agentique :** SOUS-COMPÉTENCE REQUISE — employer
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les
> étapes emploient la syntaxe à cases (`- [ ]`) pour le suivi.

**But :** créer, écrire et consulter des notes de tâche dans le coffre, avec
référence calculée, famille déduite et vues de travail, sans canvas ni frise.

**Architecture :** tout entre dans `main.js`, en une section « Tâches » placée
avant la classe `ArianeSettingTab`. La logique pure devient des
**méthodes statiques** de `Ariane`, à l'image de `entreeDansTexte` et
`fondreOeuvresProches` qui existent déjà : c'est ce qui la rend testable hors
d'Obsidian. Les méthodes d'instance ne font que de l'entrée-sortie.

**Pile technique :** JavaScript sans transpilation, sans empaqueteur, sans npm.
API Obsidian 1.9 ou supérieure. Tests par `node --test "tests/**/*.test.js"`, sans dépendance. Node 25 prend
`node --test tests/` pour un module et non pour un dossier : la forme entre
guillemets est la seule qui fonctionne.

**Spécification :** `docs/conception/2026-08-28-systeme-de-taches.md`

## Contraintes globales

Elles s'appliquent implicitement à chaque tâche du plan.

- **Un seul fichier livré.** `main.js`. Aucun `require` relatif d'un autre
  fichier du greffon : Obsidian ne charge que `main.js`. Le dossier `tests/` ne
  fait pas partie du livrable.
- **Aucune dépendance.** Ni npm, ni `package.json`, ni bibliothèque tierce.
- **Français.** Identifiants, commentaires et libellés en français. Toute chaîne
  vue par l'utilisateur passe par `tr('…')`, avec le français pour clé, et reçoit
  sa traduction dans `TEXTES.en`.
- **Pas de tiret en incise** dans les commentaires ni dans les libellés.
- **Vérification de syntaxe** après chaque modification de `main.js` :
  `node --check main.js`.
- **Le dossier des tâches est réglable**, jamais écrit en dur. Valeur par
  défaut `8 - Tâches`.
- **Convention de référence :** `T` + année sur deux chiffres + `-` + rang sur
  trois chiffres, étendu à quatre au-delà de 999.
- **Statuts :** `à faire`, `en cours`, `en attente`, `terminée`, `abandonnée`.
- **Priorités :** vide, `basse`, `moyenne`, `haute`.
- **Hors périmètre de ce chantier :** canvas, frise Gantt, pont Rappels, capture
  par modèle, export, reprise de l'existant. Ne rien anticiper de tout cela.
- **Ne pas supprimer `97 - Modèles/Templater/Templates/Tâche.md`.** La
  spécification l'annonce au § 4, mais son § 12 le range dans la reprise de
  l'existant, qui vient en dernier. Le retirer maintenant priverait Monsieur de
  son outil actuel avant que le nouveau soit éprouvé.

---

### Tâche 1 : Le harnais de test et la référence

**Fichiers :**
- Créer : `tests/obsidian-factice.js`
- Créer : `tests/reference.test.js`
- Modifier : `main.js`, section « Tâches » à créer
- Modifier : `.gitignore` si nécessaire, pour que `tests/` soit versionné

**Interfaces :**
- Consomme : rien.
- Produit : `Ariane.referenceTacheSuivante(noms: string[], annee: number) -> string`.
  `noms` est la liste des `basename` des notes du dossier des tâches, `annee`
  l'année sur quatre chiffres. Rend la référence libre suivante.

- [ ] **Étape 1 : écrire le chargeur d'Obsidian factice**

`main.js` appelle `require('obsidian')` à son chargement. Le harnais intercepte
cette demande et rend un objet dont chaque propriété est une classe vide, ce qui
suffit aux `extends`.

Créer `tests/obsidian-factice.js` :

```js
// Charge main.js hors d'Obsidian, pour éprouver les méthodes statiques.
// Le greffon demande le module « obsidian » à son chargement : on intercepte
// cette demande et on rend un objet dont chaque propriété est une classe vide.
// Cela suffit aux « extends » et aux quelques constantes lues au chargement.
const Module = require('module');

const classes = {};
const factice = new Proxy({}, {
  get(_, nom) {
    if (nom === 'Platform') return { isMacOS: true, isDesktopApp: true };
    if (nom === 'setIcon') return () => {};
    if (!classes[nom]) classes[nom] = class { constructor() {} };
    return classes[nom];
  },
});

const charger = Module._load;
Module._load = function (demande) {
  return demande === 'obsidian' ? factice : charger.apply(this, arguments);
};

module.exports = require('../main.js');
```

- [ ] **Étape 2 : écrire le test qui échoue**

Créer `tests/reference.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const suivante = (noms, annee) => Ariane.referenceTacheSuivante(noms, annee);

test('la première tâche de l année porte le rang 001', () => {
  assert.equal(suivante([], 2026), 'T26-001');
});

test('le rang suit le plus grand déjà employé', () => {
  assert.equal(suivante(['T26-001', 'T26-002'], 2026), 'T26-003');
});

test('un trou dans la numérotation ne réattribue pas le rang libéré', () => {
  assert.equal(suivante(['T26-001', 'T26-004'], 2026), 'T26-005');
});

test('le compteur repart à chaque année', () => {
  assert.equal(suivante(['T25-999'], 2026), 'T26-001');
});

test('au delà de 999 la référence passe à quatre chiffres', () => {
  assert.equal(suivante(['T26-999'], 2026), 'T26-1000');
});

test('un nom qui ne suit pas la convention est ignoré', () => {
  assert.equal(suivante(['Brouillon', 'T26-abc', 'T26-'], 2026), 'T26-001');
});

test('un rang écrit sans zéros de tête est tout de même compté', () => {
  assert.equal(suivante(['T26-7'], 2026), 'T26-008');
});
```

- [ ] **Étape 3 : lancer le test et vérifier qu'il échoue**

Lancer : `cd ~/obsidian-ariane && node --test "tests/**/*.test.js"`

Attendu : échec sur les sept cas, avec `Ariane.referenceTacheSuivante is not a function`.

- [ ] **Étape 4 : écrire la méthode**

Dans `main.js`, ouvrir une section juste avant `class ArianeSettingTab`,
et y placer la méthode comme **statique de `Ariane`**, c'est à dire à
l'intérieur de cette classe, à côté de `static fondreOeuvresProches`.

```js
  /* ============================== Tâches =============================== */

  // Référence d'une tâche : T, l'année sur deux chiffres, le rang dans l'année.
  // Le rang ne réemploie jamais un numéro libéré : une référence est définitive,
  // et deux tâches distinctes ne doivent jamais avoir porté le même nom.
  // L'horodatage employé par les notes conceptuelles est écarté à dessein, un
  // lot importé produisant plusieurs objets dans la même minute.
  static referenceTacheSuivante(noms, annee) {
    const prefixe = 'T' + String(annee % 100).padStart(2, '0') + '-';
    let max = 0;
    for (const nom of noms || []) {
      if (typeof nom !== 'string' || !nom.startsWith(prefixe)) continue;
      const m = nom.slice(prefixe.length).match(/^(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return prefixe + String(max + 1).padStart(3, '0');
  }
```

- [ ] **Étape 5 : lancer le test et vérifier qu'il passe**

Lancer : `cd ~/obsidian-ariane && node --test "tests/**/*.test.js" && node --check main.js`

Attendu : sept tests passés, et aucune sortie de `node --check`.

- [ ] **Étape 6 : engager**

```bash
cd ~/obsidian-ariane
git add tests main.js
git commit -m "Harnais de test et référence des tâches

Le harnais charge main.js hors d Obsidian en interceptant la demande du
module obsidian, ce qui rend les méthodes statiques éprouvables sans
lancer l application.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 2 : La famille déduite

**Fichiers :**
- Créer : `tests/famille.test.js`
- Modifier : `main.js`, section « Tâches »

**Interfaces :**
- Consomme : rien.
- Produit :
  - `Ariane.champTache(fm: object) -> { retenu: string|null, conflits: string[] }`
    où `retenu` vaut `'source'`, `'livrable'`, `'fichier'` ou `null`, et
    `conflits` liste les champs remplis quand il y en a plus d'un.
  - `Ariane.familleTache(fm: object) -> 'lecture'|'production'|'action'`.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `tests/famille.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('une source désigne une lecture', () => {
  assert.equal(Ariane.familleTache({ source: '[[@perrow1984]]' }), 'lecture');
});

test('un livrable désigne une production', () => {
  assert.equal(Ariane.familleTache({ livrable: '[[NC-202607081912]]' }), 'production');
});

test('un fichier externe désigne aussi une production', () => {
  assert.equal(Ariane.familleTache({ fichier: '/Users/x/soutenance.pptx' }), 'production');
});

test('aucun des trois champs désigne une action', () => {
  assert.equal(Ariane.familleTache({ statut: 'à faire' }), 'action');
});

test('un champ vide ou blanc ne compte pas', () => {
  assert.equal(Ariane.familleTache({ source: '', livrable: '   ' }), 'action');
});

test('un frontmatter absent ne fait pas tomber la fonction', () => {
  assert.equal(Ariane.familleTache(null), 'action');
});

test('la source l emporte quand plusieurs champs sont remplis', () => {
  const c = Ariane.champTache({ source: '[[@a]]', fichier: '/x.pptx' });
  assert.equal(c.retenu, 'source');
  assert.deepEqual(c.conflits, ['source', 'fichier']);
});

test('un seul champ rempli ne produit aucun conflit', () => {
  assert.deepEqual(Ariane.champTache({ livrable: '[[N]]' }).conflits, []);
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `cd ~/obsidian-ariane && node --test "tests/famille.test.js"`

Attendu : échec, `Ariane.familleTache is not a function`.

- [ ] **Étape 3 : écrire les deux méthodes**

Dans la section « Tâches » de `main.js`, à la suite de `referenceTacheSuivante` :

```js
  // La famille d'une tâche n'est pas déclarée, elle se déduit du champ rempli.
  // Un champ « famille » pourrait contredire les champs présents ; l'absence de
  // ce champ rend la contradiction impossible.
  // L'ordre est aussi celui de la priorité quand plusieurs sont remplis.
  static champTache(fm) {
    const ordre = ['source', 'livrable', 'fichier'];
    const remplis = ordre.filter((c) => fm && String(fm[c] == null ? '' : fm[c]).trim());
    return { retenu: remplis[0] || null, conflits: remplis.length > 1 ? remplis : [] };
  }

  static familleTache(fm) {
    const retenu = Ariane.champTache(fm).retenu;
    if (retenu === 'source') return 'lecture';
    return retenu ? 'production' : 'action';
  }
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `cd ~/obsidian-ariane && node --test "tests/**/*.test.js" && node --check main.js`

Attendu : quinze tests passés au total.

- [ ] **Étape 5 : engager**

```bash
cd ~/obsidian-ariane
git add tests main.js
git commit -m "Déduire la famille d une tâche du champ rempli

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 3 : Le corps d'une note neuve

**Fichiers :**
- Créer : `tests/corps.test.js`
- Modifier : `main.js`, section « Tâches »

**Interfaces :**
- Consomme : rien.
- Produit :
  - `Ariane.yamlChaine(v: any) -> string` rendant une valeur YAML entre
    guillemets, ou la chaîne vide si la valeur est vide.
  - `Ariane.corpsNouvelleTache(champs: object) -> string` où `champs`
    porte `intitule`, `statut`, `priorite`, `debut`, `echeance`, `avancement`,
    `jalon`, `source`, `livrable`, `fichier`, `liste`, `aujourdhui`.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `tests/corps.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const base = {
  intitule: "Rédiger l'état de l'art",
  statut: 'à faire',
  priorite: 'haute',
  debut: '2026-09-01',
  echeance: '2026-11-30',
  avancement: 0,
  jalon: false,
  source: '',
  livrable: '',
  fichier: '',
  liste: 'Doctorat - Tâches',
  aujourdhui: '2026-08-28',
};

test('le frontmatter porte tous les champs du schéma, même vides', () => {
  const s = Ariane.corpsNouvelleTache(base);
  for (const cle of ['type', 'statut', 'priorite', 'debut', 'echeance',
                     'avancement', 'termine-le', 'jalon', 'parent', 'bloque-par',
                     'source', 'livrable', 'fichier', 'liste', 'rappel-id',
                     'cree', 'modifie']) {
    assert.ok(new RegExp('^' + cle + ':', 'm').test(s), 'champ manquant : ' + cle);
  }
});

test('l intitulé figure en alias et en titre de niveau 1', () => {
  const s = Ariane.corpsNouvelleTache(base);
  assert.ok(s.includes('aliases:\n  - "Rédiger l\'état de l\'art"'));
  assert.ok(s.includes("\n# Rédiger l'état de l'art\n"));
});

test('les deux sections du corps sont présentes', () => {
  const s = Ariane.corpsNouvelleTache(base);
  assert.ok(s.includes('\n## Note de travail\n'));
  assert.ok(s.includes('\n## Journal\n'));
});

test('bloque-par est une liste vide, pas une chaîne', () => {
  assert.ok(/^bloque-par: \[\]$/m.test(Ariane.corpsNouvelleTache(base)));
});

test('les dates de création et de modification valent le jour donné', () => {
  const s = Ariane.corpsNouvelleTache(base);
  assert.ok(/^cree: 2026-08-28$/m.test(s));
  assert.ok(/^modifie: 2026-08-28$/m.test(s));
});

test('un guillemet dans l intitulé est échappé', () => {
  const s = Ariane.corpsNouvelleTache({ ...base, intitule: 'Lire « Normal "Accidents" »' });
  assert.ok(s.includes('\\"Accidents\\"'));
});

test('un jalon écrit jalon à vrai', () => {
  assert.ok(/^jalon: true$/m.test(Ariane.corpsNouvelleTache({ ...base, jalon: true })));
});

test('une source est écrite comme lien entre guillemets', () => {
  const s = Ariane.corpsNouvelleTache({ ...base, source: '[[@perrow1984]]' });
  assert.ok(/^source: "\[\[@perrow1984\]\]"$/m.test(s));
});

test('un champ vide est écrit sans valeur', () => {
  assert.ok(/^livrable:$/m.test(Ariane.corpsNouvelleTache(base)));
});

test('yamlChaine rend la chaîne vide pour une valeur absente', () => {
  assert.equal(Ariane.yamlChaine(null), '');
  assert.equal(Ariane.yamlChaine(''), '');
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `cd ~/obsidian-ariane && node --test "tests/corps.test.js"`

Attendu : échec, `Ariane.corpsNouvelleTache is not a function`.

- [ ] **Étape 3 : écrire les deux méthodes**

Dans la section « Tâches » de `main.js`, à la suite de `familleTache` :

```js
  // Une valeur YAML citée. Les intitulés portent des apostrophes, des deux
  // points et des guillemets typographiques : les citer systématiquement évite
  // d'avoir à décider au cas par cas.
  static yamlChaine(v) {
    const s = String(v == null ? '' : v);
    if (!s) return '';
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  // Le corps d'une note de tâche neuve. Tous les champs du schéma sont émis,
  // y compris vides : l'éditeur de propriétés d'Obsidian ne montre que ce qui
  // existe, et une tâche dont les champs manquent est une tâche qu'on ne pense
  // pas à remplir.
  static corpsNouvelleTache(champs) {
    const c = champs || {};
    const q = Ariane.yamlChaine;
    const jour = c.aujourdhui || '';
    const l = [];
    l.push('---');
    l.push('aliases:');
    l.push('  - ' + q(c.intitule || 'Sans titre'));
    l.push('type: tache');
    l.push('statut: ' + (c.statut || 'à faire'));
    l.push('priorite: ' + (c.priorite || ''));
    l.push('debut: ' + (c.debut || ''));
    l.push('echeance: ' + (c.echeance || ''));
    l.push('avancement: ' + (Number(c.avancement) || 0));
    l.push('termine-le:');
    l.push('jalon: ' + (c.jalon ? 'true' : 'false'));
    l.push('parent:');
    l.push('bloque-par: []');
    l.push('source: ' + q(c.source));
    l.push('livrable: ' + q(c.livrable));
    l.push('fichier: ' + q(c.fichier));
    l.push('liste: ' + q(c.liste));
    l.push('rappel-id:');
    l.push('cree: ' + jour);
    l.push('modifie: ' + jour);
    l.push('---');
    l.push('');
    l.push('# ' + (c.intitule || 'Sans titre'));
    l.push('');
    l.push('## Note de travail');
    l.push('');
    l.push('## Journal');
    l.push('');
    return l.join('\n');
  }
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `cd ~/obsidian-ariane && node --test "tests/**/*.test.js" && node --check main.js`

Attendu : vingt-cinq tests passés au total.

- [ ] **Étape 5 : engager**

```bash
cd ~/obsidian-ariane
git add tests main.js
git commit -m "Composer le corps d une note de tâche

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 4 : Le réglage du dossier et l'écriture de la note

**Fichiers :**
- Modifier : `main.js` — `DEFAULT_SETTINGS` (vers la ligne 794), la table
  `indices` de détection des dossiers (vers la ligne 6811), `CLES_ETAT` (vers la
  ligne 6690), le getter voisin de `dossierR` (vers la ligne 6906), la section
  « Tâches », l'onglet de réglages (helper `role`, vers la ligne 9339), et
  `TEXTES.en`.

**Interfaces :**
- Consomme : `Ariane.referenceTacheSuivante`,
  `Ariane.corpsNouvelleTache`.
- Produit :
  - le réglage `dossierTaches` et le réglage `listeRappelsDefaut` ;
  - le getter d'instance `dossierT`, sur le modèle de `dossierR` ;
  - `async creerTache(champs) -> string` rendant le chemin de la note écrite.

Cette tâche n'a pas de test automatisé : elle ne contient que de
l'entrée-sortie Obsidian, que le harnais ne peut pas simuler. Elle est éprouvée
à la main dans le coffre, à l'étape 6.

- [ ] **Étape 1 : déclarer les deux réglages**

Dans `DEFAULT_SETTINGS`, à la suite de `dossierReferences` :

```js
  dossierTaches: '',            // rôle : où déposer les notes de tâche
  listeRappelsDefaut: 'Doctorat - Tâches',
```

- [ ] **Étape 2 : brancher la détection automatique et le profil portable**

Dans la table `indices`, à la suite de la ligne `dossierReferences` :

```js
      ['dossierTaches', ['tache', 'taches']],
```

Dans `CLES_ETAT`, ajouter `'dossierTaches'` à la liste : un dossier est propre au
coffre et ne doit pas voyager dans un profil partagé. `listeRappelsDefaut` n'y
figure pas, cette valeur étant un choix d'organisation transmissible.

- [ ] **Étape 3 : ajouter le getter**

À côté du getter `dossierR` :

```js
  get dossierT() {
    return this.settings.dossierTaches || '8 - Tâches';
  }
```

- [ ] **Étape 4 : écrire la méthode de création**

Dans la section « Tâches », après les méthodes statiques, comme méthode
d'instance :

```js
  // Écrit une note de tâche neuve et rend son chemin. La référence se calcule
  // sur les notes déjà présentes, ce qui garantit l'unicité sans compteur
  // conservé dans les réglages, lequel se désynchroniserait du coffre.
  async creerTache(champs) {
    const dossier = this.dossierT;
    await this.assurerDossier(dossier);
    const noms = this.app.vault.getMarkdownFiles()
      .filter((f) => f.path.startsWith(dossier + '/'))
      .map((f) => f.basename);
    const reference = Ariane.referenceTacheSuivante(noms, new Date().getFullYear());
    const chemin = dossier + '/' + reference + '.md';
    const jour = new Date().toISOString().slice(0, 10);
    await this.ecrire(chemin, Ariane.corpsNouvelleTache({
      ...champs,
      aujourdhui: jour,
      liste: champs.liste || this.settings.listeRappelsDefaut,
    }));
    return chemin;
  }
```

- [ ] **Étape 5 : exposer le réglage dans l'onglet**

À la suite de l'appel `role(tr('Références en attente'), 'dossierReferences', …)` :

```js
    role(tr('Tâches'), 'dossierTaches', tr("Une note par tâche."));
```

Puis, dans `TEXTES.en`, ajouter les deux clés employées :

```js
  'Tâches': 'Tasks',
  'Une note par tâche.': 'One note per task.',
```

- [ ] **Étape 6 : éprouver dans le coffre**

```bash
cd ~/obsidian-ariane && node --check main.js && node --test "tests/**/*.test.js"
cp main.js "$HOME/Obsidian Vault/.obsidian/plugins/obsidian-ariane/"
```

Recharger le greffon dans Obsidian, ouvrir les réglages et vérifier que le champ
« Tâches » apparaît et se remplit tout seul de `8 - Tâches`. La création
proprement dite est éprouvée à la tâche 5, qui fournit le formulaire.

- [ ] **Étape 7 : engager**

```bash
cd ~/obsidian-ariane
git add main.js
git commit -m "Réglage du dossier des tâches et écriture de la note

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 5 : Le formulaire de création

**Fichiers :**
- Modifier : `main.js` — nouvelle classe `ModaleNouvelleTache` à placer à côté de
  `ChoixSourceModal` (vers la ligne 10145), un `addCommand` dans `onload` (vers
  la ligne 2949), et `TEXTES.en`.

**Interfaces :**
- Consomme : `creerTache(champs)`.
- Produit : `class ModaleNouvelleTache extends obsidian.Modal`, dont le
  constructeur prend `(app, greffon, surValidation)` et rappelle
  `surValidation(champs | null)`.

- [ ] **Étape 1 : écrire la classe**

À côté de `ChoixSourceModal`, en suivant son style :

```js
/* ---------------- Formulaire de création d'une tâche ------------------- */

class ModaleNouvelleTache extends obsidian.Modal {
  constructor(app, greffon, surValidation) {
    super(app);
    this.greffon = greffon;
    this.surValidation = surValidation;
    this.repondu = false;
    this.champs = {
      intitule: '', statut: 'à faire', priorite: '', debut: '', echeance: '',
      avancement: 0, jalon: false, source: '', livrable: '', fichier: '',
      liste: greffon.settings.listeRappelsDefaut,
    };
    this.famille = 'action';
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: tr('Ariane — nouvelle tâche') });
    this.corps = contentEl.createDiv();
    this.dessiner();
  }

  // Le formulaire se redessine à chaque changement de famille : c'est elle qui
  // décide du seul champ de désignation offert, et en offrir plusieurs à la
  // fois inviterait à remplir la contradiction que le schéma interdit.
  dessiner() {
    this.corps.empty();
    const c = this.corps;

    new obsidian.Setting(c).setName(tr('Intitulé'))
      .addText((t) => t.setValue(this.champs.intitule)
        .onChange((v) => { this.champs.intitule = v; }));

    new obsidian.Setting(c).setName(tr('Famille'))
      .addDropdown((d) => d
        .addOption('action', tr('Action'))
        .addOption('lecture', tr('Lecture'))
        .addOption('production-interne', tr('Production, note du coffre'))
        .addOption('production-externe', tr('Production, fichier externe'))
        .setValue(this.famille)
        .onChange((v) => {
          this.famille = v;
          this.champs.source = '';
          this.champs.livrable = '';
          this.champs.fichier = '';
          this.dessiner();
        }));

    if (this.famille === 'lecture') {
      new obsidian.Setting(c).setName(tr('Source Zotero'))
        .setDesc(tr('Clé de citation, sans les crochets.'))
        .addText((t) => t.setPlaceholder('@perrowNormalAccidents1984')
          .onChange((v) => {
            const n = v.trim();
            this.champs.source = n ? '[[' + n + ']]' : '';
          }));
    } else if (this.famille === 'production-interne') {
      new obsidian.Setting(c).setName(tr('Note produite'))
        .setDesc(tr('Nom de la note, sans les crochets.'))
        .addText((t) => t.onChange((v) => {
          const n = v.trim();
          this.champs.livrable = n ? '[[' + n + ']]' : '';
        }));
    } else if (this.famille === 'production-externe') {
      new obsidian.Setting(c).setName(tr('Fichier externe'))
        .setDesc(tr('Chemin absolu du document.'))
        .addText((t) => t.setPlaceholder('/Users/…/soutenance.pptx')
          .onChange((v) => { this.champs.fichier = v.trim(); }));
    }

    new obsidian.Setting(c).setName(tr('Début'))
      .addText((t) => t.setPlaceholder('AAAA-MM-JJ').setValue(this.champs.debut)
        .onChange((v) => { this.champs.debut = v.trim(); }));

    new obsidian.Setting(c).setName(tr('Échéance'))
      .addText((t) => t.setPlaceholder('AAAA-MM-JJ').setValue(this.champs.echeance)
        .onChange((v) => { this.champs.echeance = v.trim(); }));

    new obsidian.Setting(c).setName(tr('Priorité'))
      .addDropdown((d) => d
        .addOption('', tr('(aucune)'))
        .addOption('haute', tr('haute'))
        .addOption('moyenne', tr('moyenne'))
        .addOption('basse', tr('basse'))
        .setValue(this.champs.priorite)
        .onChange((v) => { this.champs.priorite = v; }));

    new obsidian.Setting(c).setName(tr('Jalon'))
      .setDesc(tr("Repère de calendrier : seule l'échéance est retenue."))
      .addToggle((t) => t.setValue(this.champs.jalon)
        .onChange((v) => { this.champs.jalon = v; }));

    new obsidian.Setting(c).setName(tr('Liste Apple Rappels'))
      .addText((t) => t.setValue(this.champs.liste)
        .onChange((v) => { this.champs.liste = v.trim(); }));

    const ligne = c.createDiv();
    ligne.style.textAlign = 'right';
    ligne.style.marginTop = '10px';
    const annuler = ligne.createEl('button', { text: tr('Annuler') });
    annuler.addEventListener('click', () => this.repondre(null));
    const creer = ligne.createEl('button', { text: tr('Créer') });
    creer.style.marginLeft = '6px';
    creer.addEventListener('click', () => {
      if (!this.champs.intitule.trim()) {
        new obsidian.Notice(tr('Une tâche sans intitulé ne se retrouve pas.'));
        return;
      }
      if (this.champs.jalon) this.champs.debut = '';
      this.repondre(this.champs);
    });
  }

  repondre(v) {
    if (this.repondu) return;
    this.repondu = true;
    this.close();
    this.surValidation(v);
  }

  onClose() {
    this.contentEl.empty();
    if (!this.repondu) {
      this.repondu = true;
      this.surValidation(null);
    }
  }
}
```

- [ ] **Étape 2 : déclarer la commande**

Dans `onload`, à côté des autres `addCommand` :

```js
    this.addCommand({
      id: 'creer-tache',
      name: tr('Tâches : créer une tâche'),
      callback: () => new ModaleNouvelleTache(this.app, this, async (champs) => {
        if (!champs) return;
        const chemin = await this.creerTache(champs);
        const f = this.app.vault.getAbstractFileByPath(chemin);
        if (f) await this.app.workspace.getLeaf(true).openFile(f);
      }).open(),
    });
```

- [ ] **Étape 3 : traduire**

Ajouter dans `TEXTES.en` toutes les clés introduites ci-dessus, dont
`'Ariane — nouvelle tâche'`, `'Intitulé'`, `'Famille'`, `'Action'`, `'Lecture'`,
`'Production, note du coffre'`, `'Production, fichier externe'`,
`'Source Zotero'`, `'Clé de citation, sans les crochets.'`, `'Note produite'`,
`'Nom de la note, sans les crochets.'`, `'Fichier externe'`,
`'Chemin absolu du document.'`, `'Début'`, `'Échéance'`, `'Priorité'`,
`'(aucune)'`, `'haute'`, `'moyenne'`, `'basse'`, `'Jalon'`,
`"Repère de calendrier : seule l'échéance est retenue."`,
`'Liste Apple Rappels'`, `'Créer'`, `'Tâches : créer une tâche'`,
`'Une tâche sans intitulé ne se retrouve pas.'`. Vérifier au passage si l'une
d'elles existe déjà, auquel cas ne pas la dupliquer.

- [ ] **Étape 4 : éprouver dans le coffre**

```bash
cd ~/obsidian-ariane && node --check main.js && node --test "tests/**/*.test.js"
cp main.js "$HOME/Obsidian Vault/.obsidian/plugins/obsidian-ariane/"
```

Recharger le greffon, lancer « Tâches : créer une tâche », créer une tâche de
lecture sur `@perrowNormalAccidents1984` avec une échéance, puis vérifier dans
`8 - Tâches/` que la note s'appelle `T26-001`, qu'elle porte l'alias, et que
`source` est un lien cliquable. Créer une seconde tâche et vérifier `T26-002`.

- [ ] **Étape 5 : engager**

```bash
cd ~/obsidian-ariane
git add main.js
git commit -m "Formulaire de création d une tâche

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 6 : Le bloc d'accès dans la note

**Fichiers :**
- Créer : `tests/bloc.test.js`
- Modifier : `main.js`, section « Tâches », plus un `addCommand`

**Interfaces :**
- Consomme : `Ariane.familleTache`, `Ariane.champTache`.
- Produit :
  - `Ariane.blocTache(fm: object, meta: object|null) -> string` rendant
    le contenu du bloc marqué. `meta` porte `{ uriPdf, uriZotero }` pour une
    lecture, `{ modifie, ouvert }` pour un fichier externe, ou vaut `null` ;
  - `async accesTache(fm) -> object|null` qui calcule ce `meta` ;
  - `async majBlocTache(file)` qui réécrit le bloc.

**Les URI ne s'inventent pas.** Le greffon en emploie déjà deux formes, et ce
sont les seules qui fonctionnent : `obsidian://zotflow?type=open-attachment&libraryID=…&key=…`,
où la clé est celle de la **pièce jointe**, obtenue par `cleAttachement(f)`, et
`zotero://select/library/items/…`, où la clé est le `zotero-key` du frontmatter
de la fiche source. Ni l'une ni l'autre ne se déduit de la clé de citation, d'où
le passage par `accesTache` plutôt que par une chaîne bâtie dans la méthode
statique.

Le bloc est délimité par `%% ariane:tache %%` et `%% /ariane:tache %%`, sur le
modèle de `ZFA_BIBLIO_DEBUT` et `ZFA_BIBLIO_FIN` déjà employés pour les
bibliographies. Ce choix évite tout greffage sur la vue : le contenu est du
Markdown ordinaire, il survit à la synchronisation et se lit sur téléphone.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `tests/bloc.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('une lecture offre les accès quand les URI sont connus', () => {
  const s = Ariane.blocTache({ source: '[[@perrow1984]]' }, {
    uriPdf: 'obsidian://zotflow?type=open-attachment&libraryID=1&key=ABCD1234',
    uriZotero: 'zotero://select/library/items/WXYZ9876',
  });
  assert.ok(s.includes('[[@perrow1984]]'));
  assert.ok(s.includes('obsidian://zotflow?type=open-attachment'));
  assert.ok(s.includes('zotero://select/library/items/WXYZ9876'));
});

test('une lecture sans PDF attaché n offre pas de lien mort', () => {
  const s = Ariane.blocTache({ source: '[[@perrow1984]]' },
    { uriZotero: 'zotero://select/library/items/W' });
  assert.ok(s.includes('[[@perrow1984]]'));
  assert.ok(!s.includes('obsidian://zotflow'));
  assert.ok(!s.includes('undefined'));
});

test('une production interne renvoie vers la note produite', () => {
  const s = Ariane.blocTache({ livrable: '[[NC-202607081912]]' }, null);
  assert.ok(s.includes('[[NC-202607081912]]'));
});

test('une production externe affiche les deux dates connues', () => {
  const s = Ariane.blocTache(
    { fichier: '/Users/x/soutenance.pptx' },
    { modifie: '2026-08-20', ouvert: '2026-08-26' },
  );
  assert.ok(s.includes('2026-08-20'));
  assert.ok(s.includes('2026-08-26'));
  assert.ok(s.includes('soutenance.pptx'));
});

test('une production externe sans métadonnées ne prétend rien', () => {
  const s = Ariane.blocTache({ fichier: '/Users/x/absent.pptx' }, null);
  assert.ok(!s.includes('undefined'));
  assert.ok(!s.includes('null'));
});

test('une action ne produit aucun bloc', () => {
  assert.equal(Ariane.blocTache({ statut: 'à faire' }, null), '');
});

test('un conflit de champs est signalé dans le bloc', () => {
  const s = Ariane.blocTache({ source: '[[@a]]', fichier: '/x.pptx' }, null);
  assert.ok(s.toLowerCase().includes('conflit'));
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `cd ~/obsidian-ariane && node --test "tests/bloc.test.js"`

Attendu : échec, `Ariane.blocTache is not a function`.

- [ ] **Étape 3 : écrire la méthode statique**

Dans la section « Tâches » :

```js
  // Contenu du bloc d'accès, sans ses marques. Une action n'en a pas besoin :
  // un bloc vide dans chaque note d'action serait du bruit.
  static blocTache(fm, meta) {
    const c = Ariane.champTache(fm);
    if (!c.retenu) return '';
    const l = [];
    if (c.conflits.length) {
      l.push('> [!warning] ' + tr('Conflit de champs') + ' : ' +
             c.conflits.join(', ') + '. ' + tr('Seul le premier est retenu.'));
      l.push('');
    }
    if (c.retenu === 'source') {
      l.push('**' + tr('Source') + '** ' + String(fm.source).trim());
      const acces = [];
      if (meta && meta.uriPdf) acces.push('[' + tr('Ouvrir le PDF') + '](' + meta.uriPdf + ')');
      if (meta && meta.uriZotero) acces.push('[' + tr('Ouvrir dans Zotero') + '](' + meta.uriZotero + ')');
      if (acces.length) { l.push(''); l.push(acces.join('  ·  ')); }
    } else if (c.retenu === 'livrable') {
      l.push('**' + tr('Livrable') + '** ' + String(fm.livrable).trim());
    } else {
      const chemin = String(fm.fichier).trim();
      const nom = chemin.split('/').pop();
      l.push('**' + tr('Fichier') + '** `' + nom + '`');
      if (meta && (meta.modifie || meta.ouvert)) {
        const bouts = [];
        if (meta.modifie) bouts.push(tr('modifié le') + ' ' + meta.modifie);
        if (meta.ouvert) bouts.push(tr('ouvert le') + ' ' + meta.ouvert);
        l.push('');
        l.push('*' + bouts.join('  ·  ') + '*');
      }
    }
    return l.join('\n');
  }
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `cd ~/obsidian-ariane && node --test "tests/**/*.test.js" && node --check main.js`

- [ ] **Étape 5 : écrire la méthode d'instance et la commande**

Toujours dans la section « Tâches », après `creerTache` :

```js
  // Interroge Spotlight pour les deux dates d'un fichier externe. mdls est
  // fourni par macOS et ne demande aucune installation. Un fichier absent ou
  // non indexé rend null, ce que le bloc sait afficher sans mentir.
  async metadonneesFichier(chemin) {
    return new Promise((resolve) => {
      require('child_process').execFile('mdls', [
        '-raw', '-name', 'kMDItemContentModificationDate',
        '-name', 'kMDItemLastUsedDate', chemin,
      ], (err, sortie) => {
        if (err || !sortie) return resolve(null);
        const dates = String(sortie).split('\0')
          .map((s) => s.trim())
          .map((s) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''));
        if (!dates[0] && !dates[1]) return resolve(null);
        resolve({ modifie: dates[0] || '', ouvert: dates[1] || '' });
      });
    });
  }

  // Rassemble ce que le bloc a besoin de savoir et que seule l'application
  // connaît : les deux URI d'une lecture, les deux dates d'un fichier externe.
  // Le calcul des URI réemploie cleAttachement, déjà écrite pour le volet des
  // références : la clé de la pièce jointe ne se déduit pas de la clé de
  // citation, elle se lit dans la fiche.
  async accesTache(fm) {
    const c = Ariane.champTache(fm);
    if (c.retenu === 'fichier') return this.metadonneesFichier(String(fm.fichier).trim());
    if (c.retenu !== 'source') return null;
    const base = String(fm.source).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === base);
    if (!f) return null;
    const fms = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const out = {};
    const cle = await this.cleAttachement(f);
    if (cle) {
      out.uriPdf = 'obsidian://zotflow?type=open-attachment&libraryID='
        + encodeURIComponent(fms['library-id'] || '') + '&key=' + encodeURIComponent(cle);
    }
    if (fms['zotero-key']) {
      out.uriZotero = 'zotero://select/library/items/' + String(fms['zotero-key']).trim();
    }
    return (out.uriPdf || out.uriZotero) ? out : null;
  }

  // Réécrit le bloc marqué de la note active. Le bloc est ajouté sous le titre
  // s'il n'existe pas encore.
  async majBlocTache(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = (cache && cache.frontmatter) || {};
    if (fm.type !== 'tache') return false;
    const meta = await this.accesTache(fm);
    const interieur = Ariane.blocTache(fm, meta);
    const bloc = interieur
      ? ZFA_TACHE_DEBUT + '\n' + interieur + '\n' + ZFA_TACHE_FIN
      : '';
    let texte = await this.app.vault.read(file);
    const debut = texte.indexOf(ZFA_TACHE_DEBUT);
    const fin = texte.indexOf(ZFA_TACHE_FIN);
    if (debut !== -1 && fin > debut) {
      texte = texte.slice(0, debut) + bloc + texte.slice(fin + ZFA_TACHE_FIN.length);
    } else if (bloc) {
      texte = texte.replace(/^(# .*\n)/m, '$1\n' + bloc + '\n');
    }
    await this.app.vault.modify(file, texte);
    return true;
  }
```

Déclarer les deux marques à côté de `ZFA_BIBLIO_DEBUT` :

```js
const ZFA_TACHE_DEBUT = '%% ariane:tache %%';
const ZFA_TACHE_FIN = '%% /ariane:tache %%';
```

Et la commande, à côté de `creer-tache` :

```js
    this.addCommand({
      id: 'maj-bloc-tache',
      name: tr('Tâches : rafraîchir le bloc de la tâche active'),
      callback: async () => {
        const f = this.app.workspace.getActiveFile();
        if (!f) return;
        const fait = await this.majBlocTache(f);
        new obsidian.Notice(fait ? tr('Bloc rafraîchi.') : tr("Cette note n'est pas une tâche."));
      },
    });
```

Ajouter dans `TEXTES.en` les clés introduites.

- [ ] **Étape 6 : éprouver dans le coffre**

```bash
cd ~/obsidian-ariane && node --check main.js && node --test "tests/**/*.test.js"
cp main.js "$HOME/Obsidian Vault/.obsidian/plugins/obsidian-ariane/"
```

Sur la tâche de lecture créée à la tâche 5, lancer « Tâches : rafraîchir le bloc
de la tâche active » et vérifier que les liens apparaissent et fonctionnent.
Créer ensuite une tâche de production externe pointant vers un fichier réel du
Bureau et vérifier que les deux dates s'affichent.

Vérifier enfin qu'une tâche de lecture sur une source **sans PDF attaché**
n'affiche pas de lien « Ouvrir le PDF » mort, mais garde le lien Zotero.

- [ ] **Étape 7 : engager**

```bash
cd ~/obsidian-ariane
git add tests main.js
git commit -m "Bloc d accès dans la note de tâche

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 7 : La date d'achèvement

**Fichiers :**
- Créer : `tests/achevement.test.js`
- Modifier : `main.js`, section « Tâches », plus `onload`

**Interfaces :**
- Consomme : rien.
- Produit : `Ariane.achevementAEcrire(fm, aujourdhui) -> string|null`,
  rendant la valeur à inscrire dans `termine-le`, ou `null` s'il n'y a rien à
  faire.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `tests/achevement.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const a = (fm) => Ariane.achevementAEcrire(fm, '2026-08-28');

test('une tâche terminée sans date reçoit le jour même', () => {
  assert.equal(a({ type: 'tache', statut: 'terminée' }), '2026-08-28');
});

test('une tâche terminée qui a déjà sa date n est pas retouchée', () => {
  assert.equal(a({ type: 'tache', statut: 'terminée', 'termine-le': '2026-07-01' }), null);
});

test('une tâche non terminée qui porte une date la perd', () => {
  assert.equal(a({ type: 'tache', statut: 'en cours', 'termine-le': '2026-07-01' }), '');
});

test('une tâche non terminée sans date ne demande rien', () => {
  assert.equal(a({ type: 'tache', statut: 'à faire' }), null);
});

test('une tâche abandonnée n est pas une tâche achevée', () => {
  assert.equal(a({ type: 'tache', statut: 'abandonnée' }), null);
});

test('une note qui n est pas une tâche est laissée tranquille', () => {
  assert.equal(a({ type: 'conceptuelle', statut: 'terminée' }), null);
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `cd ~/obsidian-ariane && node --test "tests/achevement.test.js"`

- [ ] **Étape 3 : écrire la méthode**

```js
  // La date d'achèvement se déduit du statut, elle ne se saisit pas. Rendre
  // null veut dire « ne rien écrire », ce qui compte : réécrire à l'identique
  // relancerait l'événement de modification et ferait tourner la boucle.
  static achevementAEcrire(fm, aujourdhui) {
    if (!fm || fm.type !== 'tache') return null;
    const dejaPosee = String(fm['termine-le'] == null ? '' : fm['termine-le']).trim();
    if (fm.statut === 'terminée') return dejaPosee ? null : aujourdhui;
    return dejaPosee ? '' : null;
  }
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `cd ~/obsidian-ariane && node --test "tests/**/*.test.js" && node --check main.js`

- [ ] **Étape 5 : brancher l'écoute**

Dans `onload`, à côté des autres `registerEvent` :

```js
    this.registerEvent(this.app.metadataCache.on('changed', async (file, _d, cache) => {
      const fm = (cache && cache.frontmatter) || null;
      const valeur = Ariane.achevementAEcrire(fm, new Date().toISOString().slice(0, 10));
      if (valeur === null) return;
      await this.app.fileManager.processFrontMatter(file, (x) => {
        x['termine-le'] = valeur;
        x.modifie = new Date().toISOString().slice(0, 10);
      });
    }));
```

- [ ] **Étape 6 : éprouver dans le coffre**

```bash
cd ~/obsidian-ariane && node --check main.js && node --test "tests/**/*.test.js"
cp main.js "$HOME/Obsidian Vault/.obsidian/plugins/obsidian-ariane/"
```

Passer une tâche au statut `terminée` et vérifier que `termine-le` se remplit du
jour, puis la repasser à `en cours` et vérifier que le champ se vide. Vérifier
surtout qu'aucune boucle ne s'installe : la note ne doit pas se réécrire en
continu, ce que trahirait un clignotement de l'indicateur de synchronisation.

- [ ] **Étape 7 : engager**

```bash
cd ~/obsidian-ariane
git add tests main.js
git commit -m "Inscrire la date d achèvement au changement de statut

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 8 : Les quatre vues de travail

**Fichiers :**
- Créer : `docs/taches.base` — l'exemplaire versionné, à l'image de
  `docs/annotations.base`
- Modifier : `main.js`, section « Tâches », plus un `addCommand`
- Modifier : `README.fr.md` et `README.md`, section des Bases

**Interfaces :**
- Consomme : le réglage `dossierTaches`.
- Produit : `async ecrireBaseTaches() -> string` écrivant
  `<dossier des tâches>/Tâches.base` et rendant son chemin.

- [ ] **Étape 1 : écrire le fichier de base**

Créer `docs/taches.base`, en suivant la syntaxe de `docs/annotations.base` :

```yaml
formulas:
  bloquantes: note["bloque-par"].filter(value.asFile().properties["statut"] != "terminée").length
  famille: if(note["source"], "lecture", if(note["livrable"], "production", if(note["fichier"], "production", "action")))
properties:
  file.name:
    displayName: Réf.
  note.aliases:
    displayName: Intitulé
  note.statut:
    displayName: Statut
  note.priorite:
    displayName: Priorité
  note.debut:
    displayName: Début
  note.echeance:
    displayName: Échéance
  note.avancement:
    displayName: Avancement
  note.parent:
    displayName: Rattachée à
  formula.famille:
    displayName: Famille
  formula.bloquantes:
    displayName: Bloquantes
views:
  - type: table
    name: 1. Débloquées
    filters:
      and:
        - note["type"] == "tache"
        - note["statut"] != "terminée"
        - note["statut"] != "abandonnée"
        - formula.bloquantes == 0
    order:
      - file.name
      - aliases
      - echeance
      - priorite
      - avancement
      - formula.famille
    sort:
      - property: echeance
        direction: ASC
  - type: table
    name: 2. Cette semaine
    filters:
      and:
        - note["type"] == "tache"
        - note["statut"] != "terminée"
        - note["statut"] != "abandonnée"
        - note["echeance"] != null
        - note["echeance"] <= (now() + "7 days")
    order:
      - file.name
      - aliases
      - echeance
      - priorite
      - formula.bloquantes
    sort:
      - property: echeance
        direction: ASC
  - type: table
    name: 3. Par famille
    filters:
      and:
        - note["type"] == "tache"
        - note["statut"] != "terminée"
    groupBy:
      property: formula.famille
      direction: ASC
    order:
      - file.name
      - aliases
      - statut
      - echeance
      - avancement
  - type: table
    name: 4. Terminées
    filters:
      and:
        - note["type"] == "tache"
        - note["statut"] == "terminée"
    order:
      - file.name
      - aliases
      - note.termine-le
      - formula.famille
    sort:
      - property: note.termine-le
        direction: DESC
```

- [ ] **Étape 2 : écrire la méthode qui la pose dans le coffre**

Dans la section « Tâches ». Le contenu est repris tel quel dans une constante
`BASE_TACHES`, déclarée juste au dessus de la méthode, pour que le greffon
n'ait pas à lire un fichier de son propre dossier.

```js
  // Pose la base de travail dans le dossier des tâches. Ne l'écrase jamais :
  // Monsieur y ajoutera ses propres vues, et les perdre à chaque mise à jour du
  // greffon serait pire que de ne pas la fournir.
  async ecrireBaseTaches() {
    const dossier = this.dossierT;
    await this.assurerDossier(dossier);
    const chemin = dossier + '/Tâches.base';
    const deja = this.app.vault.getAbstractFileByPath(chemin);
    if (deja) {
      new obsidian.Notice(tr('La base existe déjà, elle n a pas été touchée.'));
      return chemin;
    }
    await this.app.vault.create(chemin, BASE_TACHES);
    return chemin;
  }
```

Et la commande :

```js
    this.addCommand({
      id: 'poser-base-taches',
      name: tr('Tâches : poser la base de travail'),
      callback: async () => {
        const chemin = await this.ecrireBaseTaches();
        new obsidian.Notice(tr('Base posée : ') + chemin);
      },
    });
```

Ajouter dans `TEXTES.en` les clés introduites.

- [ ] **Étape 3 : éprouver dans le coffre**

```bash
cd ~/obsidian-ariane && node --check main.js && node --test "tests/**/*.test.js"
cp main.js "$HOME/Obsidian Vault/.obsidian/plugins/obsidian-ariane/"
```

Le coffre porte déjà `8 - Tâches/Tâches.base`, vide. **La déplacer d'abord** vers
`99 - Archives/`, sans quoi la commande refusera de l'écraser :

```bash
mv "$HOME/Obsidian Vault/8 - Tâches/Tâches.base" "$HOME/Obsidian Vault/99 - Archives/Tâches.base.ancien"
```

Puis lancer « Tâches : poser la base de travail », ouvrir la base, et vérifier
les quatre vues avec les trois tâches créées aux étapes précédentes. Vérifier en
particulier que *Débloquées* montre bien les tâches sans bloquante ouverte, la
formule `bloquantes` étant la seule du lot qui puisse se comporter autrement
qu'attendu sur une liste `bloque-par` vide.

Si `formula.bloquantes` échoue sur une liste vide, remplacer le filtre par
`note["bloque-par"].isEmpty() || formula.bloquantes == 0` et le relever dans le
message d'engagement.

- [ ] **Étape 4 : documenter**

Dans `README.fr.md` et `README.md`, à la section qui décrit les Bases fournies,
ajouter un paragraphe sur `taches.base` et ses quatre vues, en disant que la vue
*Débloquées* est celle du quotidien et que la frise viendra plus tard.

- [ ] **Étape 5 : engager**

```bash
cd ~/obsidian-ariane
git add docs/taches.base main.js README.fr.md README.md
git commit -m "Base de travail des tâches et ses quatre vues

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Après le chantier

Publier une version mineure, `2.75.0`, en suivant la procédure habituelle :
`manifest.json`, `versions.json`, la constante de version dans `main.js`, copie
dans le coffre, étiquette et poussée.

Puis vivre avec pendant quelques jours avant d'ouvrir le chantier 2. Le schéma
est fait pour être corrigé à l'usage, et c'est l'usage qui dira si `avancement`
mérite de rester un entier saisi, si `liste` a sa place dès maintenant, et si le
bloc d'accès gagne à se rafraîchir tout seul plutôt que sur commande.

# Familles de tâches personnalisables — Plan d'implémentation

> **Pour l'exécutant :** SOUS-COMPÉTENCE REQUISE — `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`, tâche par tâche. Les étapes sont en cases à cocher (`- [ ]`).

**But :** rendre les familles de tâches configurables dans les réglages (couleur, icône, propriétés ajoutées), colorer et illustrer les cartes de la vue Articulation par famille, et brancher cette vue sur les boutons natifs de Bases (Propriétés, filtre, tri, Nouveau).

**Architecture :** le champ frontmatter `famille` est la seule source de vérité. Tout ce qui se raisonne est une fonction pure statique de `Ariane`, testée par `node --test`. La vue Articulation (`MoteurArticulation` + `VueArticulationBase`) ne fait que du DOM et des `processFrontMatter`. Aucun fichier de build : `main.js` est édité à la main, `'use strict'`, un seul fichier.

**Tech :** Obsidian Bases API 1.12.7 (`registerBasesView`, `BasesView`, `this.config`, `this.data.data`), `app.metadataTypeManager` (widgets de type, `setType`), `node:test`.

**Spéc :** `docs/conception/2026-08-30-familles-taches.md`

## Contraintes globales

- `main.js` : un seul fichier, `'use strict'`, pas de build, pas d'`import`/`require` ajouté. Les fonctions pures pendent de `class Ariane`.
- **Aucune écriture qui ne change rien** : tout `processFrontMatter` doit d'abord vérifier qu'une valeur change réellement.
- **Familles par défaut préchargées** (`lecture`, `production`, `action`) : le comportement actuel est conservé, aucune migration de notes.
- **Ne pas toucher** `famillesNotes` (côté Zotero) ni les clés frontmatter `zotflow-*`. `famillesTaches` est un réglage neuf et distinct.
- Tests : `node --test tests/*.test.js`. Le total actuel est de 174 tests, tous verts avant de commencer.
- Textes d'interface via `tr('…')`. Français d'abord.
- Messages de commit git terminés par : `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Vocabulaire de type FR (menus, réglages) : `texte | nombre | date | case | liste | lien`.

---

## Structure des fichiers

| Fichier | Rôle dans ce chantier |
|---|---|
| `main.js` | tout : `DEFAULT_SETTINGS`, `Ariane.*` (pures), `ArianeSettingTab.ongletTaches` + éditeur, `MoteurArticulation`, `fabriquerVueArticulationBase`, `registerBasesView` |
| `styles.css` | variable `--zfa-fam-couleur`, rangées de propriété de carte, chevron de dépli, carte à hauteur variable |
| `tests/familles-taches.test.js` | **créé** — `familleTache`, `proprietesManquantes`, `TYPE_FR_VERS_OBSIDIAN` |
| `tests/articulation.test.js` | **modifié** — un cas « tri + nœuds mixtes placés/libres » pour `placerGraphe` |
| `README.md`, `README.fr.md` | mention de la fonctionnalité |
| `manifest.json`, `versions.json` | bump de version |

Repères de ligne dans `main.js` (état actuel, à revérifier avant d'éditer) :

- `DEFAULT_SETTINGS` : 911 ; `famillesNotes: []` : 927
- `Ariane.familleTache` : 9384 ; `Ariane.corpsNouvelleTache` : 9404 ; `Ariane.typeProprieteBase` : 9464
- `tachesPourGantt` (boucle, `famille: Ariane.familleTache(fm)`) : ~10141
- `creerTache` : 10381
- `registerBasesView(TYPE_VUE_BASE_FRISE …)` : 3382 ; `…_ARTIC` : 3416 (`options: () => []` : 3420)
- `ongletTaches` : 11024 ; `_section`/`_aide` : 11586 ; `_tableFamilles` (familles de notes, modèle) : 10456
- menu « Type » d'en-tête (table FR→Obsidian en dur) : ~12518
- `rendreCelluleTypee` (widget de type, modèle) : 12315
- `MoteurArticulation` : 13795 ; `dessinerNoeud` : 13879 ; `boutonBarre` : 13864 ; `ajoutRapide` : 14125
- `fabriquerVueArticulationBase` : 14139 ; ctx `onload` : 14148 ; `tachesDuGraphe` : 14171
- `fabriquerVueFriseBase` ctx (modèle de plomberie) : 13587 ; `colonnes()` : 13699 ; `sortNatif()` : 13642

---

## Task 1 : Fondations — réglages + fonctions pures

**Files:**
- Modify: `main.js` — `DEFAULT_SETTINGS` (~911), nouvelle statique `Ariane.TYPE_FR_VERS_OBSIDIAN`, `Ariane.familleTache` (9384), nouvelle statique `Ariane.proprietesManquantes`
- Create: `tests/familles-taches.test.js`

**Interfaces:**
- Produces:
  - `DEFAULT_SETTINGS.famillesTaches` : `Array<{id:string, nom:string, couleur:string, icone:string, proprietes:Array<{cle:string, libelle:string, type:string}>}>` — 3 entrées préchargées.
  - `DEFAULT_SETTINGS.familleTacheDefaut : string` = `'action'`.
  - `Ariane.TYPE_FR_VERS_OBSIDIAN : Record<string,string>` = `{texte:'text', nombre:'number', date:'date', case:'checkbox', liste:'multitext', lien:'link'}`.
  - `Ariane.familleTache(fm, familles?, defaut?) -> string` : si `familles` est un tableau non vide, résout via `fm.famille` puis déduction puis `defaut`; sinon comportement historique inchangé.
  - `Ariane.proprietesManquantes(fm, famille) -> Array<{cle:string, type:string}>` : les propriétés déclarées par `famille.proprietes` dont la clé est absente de `fm`.

- [ ] **Step 1 : Écrire les tests (`tests/familles-taches.test.js`)**

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const FAM = [
  { id: 'lecture', nom: 'Lecture', couleur: '#4c78c9', icone: 'book-open',
    proprietes: [{ cle: 'source', libelle: 'Source', type: 'lien' }] },
  { id: 'production', nom: 'Production', couleur: '#e0873d', icone: 'file-pen',
    proprietes: [{ cle: 'livrable', libelle: 'Livrable', type: 'lien' },
                 { cle: 'fichier', libelle: 'Fichier', type: 'texte' }] },
  { id: 'action', nom: 'Action', couleur: '#6aa84f', icone: 'zap', proprietes: [] },
];

/* ---------------------- familleTache ---------------------- */

test('champ famille explicite et connu : renvoyé tel quel', () => {
  assert.equal(Ariane.familleTache({ famille: 'production' }, FAM, 'action'), 'production');
});

test('champ famille explicite mais inconnu : repli sur la déduction/défaut', () => {
  assert.equal(Ariane.familleTache({ famille: 'zephyr' }, FAM, 'action'), 'action');
});

test('sans champ famille : source deduit lecture', () => {
  assert.equal(Ariane.familleTache({ source: '[[@x]]' }, FAM, 'action'), 'lecture');
});

test('sans champ famille : livrable deduit production', () => {
  assert.equal(Ariane.familleTache({ livrable: 'Article' }, FAM, 'action'), 'production');
});

test('rien de rien : famille par defaut', () => {
  assert.equal(Ariane.familleTache({}, FAM, 'action'), 'action');
});

test('appel historique sans familles : comportement inchange', () => {
  assert.equal(Ariane.familleTache({ source: 'x' }), 'lecture');
  assert.equal(Ariane.familleTache({ livrable: 'x' }), 'production');
  assert.equal(Ariane.familleTache({}), 'action');
});

/* ------------------- proprietesManquantes ------------------- */

test('fm vide : toutes les proprietes de la famille manquent', () => {
  const m = Ariane.proprietesManquantes({}, FAM[1]);
  assert.deepEqual(m, [{ cle: 'livrable', type: 'lien' }, { cle: 'fichier', type: 'texte' }]);
});

test('fm complet : aucune propriete manquante', () => {
  assert.deepEqual(Ariane.proprietesManquantes({ livrable: 'a', fichier: 'b' }, FAM[1]), []);
});

test('fm partiel : seules les clés absentes', () => {
  assert.deepEqual(Ariane.proprietesManquantes({ livrable: 'a' }, FAM[1]), [{ cle: 'fichier', type: 'texte' }]);
});

test('clé présente mais valeur vide : considérée présente', () => {
  assert.deepEqual(Ariane.proprietesManquantes({ livrable: '', fichier: null }, FAM[1]), []);
});

test('famille sans proprietes : liste vide', () => {
  assert.deepEqual(Ariane.proprietesManquantes({}, FAM[2]), []);
});

/* ----------------- TYPE_FR_VERS_OBSIDIAN ------------------ */

test('table de correspondance des types', () => {
  assert.deepEqual(Ariane.TYPE_FR_VERS_OBSIDIAN, {
    texte: 'text', nombre: 'number', date: 'date',
    case: 'checkbox', liste: 'multitext', lien: 'link',
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `node --test tests/familles-taches.test.js`
Attendu : ÉCHEC — `proprietesManquantes` indéfini, `TYPE_FR_VERS_OBSIDIAN` indéfini, `familleTache` à 3 arguments ignore `familles`.

- [ ] **Step 3 : `DEFAULT_SETTINGS`**

Après la ligne `famillesNotes: [],` (~927), ajouter :

```js
  // FAMILLES DE TÂCHES — distinctes des familles de notes ci-dessus. Chaque
  // ligne : { id, nom, couleur, icone, proprietes:[{cle,libelle,type}] }. La
  // valeur d'id est celle écrite dans le champ `famille` d'une note de tâche.
  // Préchargées avec les trois familles historiques pour ne rien casser.
  famillesTaches: [
    { id: 'lecture', nom: 'Lecture', couleur: '#4c78c9', icone: 'book-open',
      proprietes: [{ cle: 'source', libelle: 'Source', type: 'lien' }] },
    { id: 'production', nom: 'Production', couleur: '#e0873d', icone: 'file-pen',
      proprietes: [{ cle: 'livrable', libelle: 'Livrable', type: 'lien' },
                   { cle: 'fichier', libelle: 'Fichier', type: 'texte' }] },
    { id: 'action', nom: 'Action', couleur: '#6aa84f', icone: 'zap', proprietes: [] },
  ],
  familleTacheDefaut: 'action',
```

- [ ] **Step 4 : `Ariane.TYPE_FR_VERS_OBSIDIAN`**

Juste avant `static familleTache(fm)` (~9384) :

```js
  // Vocabulaire de type FR partagé entre l'éditeur de familles, le menu
  // « Type » de l'en-tête de frise et le rendu des cartes d'articulation.
  static get TYPE_FR_VERS_OBSIDIAN() {
    return { texte: 'text', nombre: 'number', date: 'date',
             case: 'checkbox', liste: 'multitext', lien: 'link' };
  }
```

- [ ] **Step 5 : `Ariane.familleTache` élargie**

Remplacer la méthode (9384-9388) par :

```js
  static familleTache(fm, familles, defaut) {
    const liste = Array.isArray(familles) ? familles : null;
    // Appel historique (un seul argument) : on garde la déduction d'origine.
    if (!liste) {
      const retenu = Ariane.champTache(fm).retenu;
      if (retenu === 'source') return 'lecture';
      return retenu ? 'production' : 'action';
    }
    const connus = new Set(liste.map((f) => f && f.id).filter(Boolean));
    const explicite = fm && fm.famille ? String(fm.famille).trim() : '';
    if (explicite && connus.has(explicite)) return explicite;
    const retenu = Ariane.champTache(fm).retenu;
    if (retenu === 'source' && connus.has('lecture')) return 'lecture';
    if (retenu && connus.has('production')) return 'production';
    return (defaut && connus.has(defaut)) ? defaut
      : (connus.has('action') ? 'action' : (liste[0] && liste[0].id) || 'action');
  }
```

- [ ] **Step 6 : `Ariane.proprietesManquantes`**

Juste après `familleTache` :

```js
  // Les propriétés qu'une famille ajoute à une tâche et qui n'existent pas
  // encore dans son entête. « Existe » = la clé est présente, même vide.
  static proprietesManquantes(fm, famille) {
    const props = (famille && Array.isArray(famille.proprietes)) ? famille.proprietes : [];
    const cles = new Set(Object.keys(fm || {}));
    return props
      .filter((p) => p && p.cle && !cles.has(p.cle))
      .map((p) => ({ cle: p.cle, type: p.type || 'texte' }));
  }
```

- [ ] **Step 7 : Lancer les tests**

Run: `node --test tests/familles-taches.test.js`
Attendu : PASS (11 tests).

- [ ] **Step 8 : Non-régression**

Run: `node --test tests/*.test.js`
Attendu : tout vert (174 + 11).

- [ ] **Step 9 : Commit**

```bash
git add main.js tests/familles-taches.test.js
git commit -m "Familles de tâches : réglages et fonctions pures

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2 : Champ `famille` sur les nouvelles tâches, type enregistré

**Files:**
- Modify: `main.js` — `Ariane.corpsNouvelleTache` (~9404), boucle de `tachesPourGantt` (~10141), `onload` (près de `registerBasesView`, ~3380)
- Modify: `tests/*` — le fichier qui couvre déjà `corpsNouvelleTache` (chercher `corpsNouvelleTache` dans `tests/`)

**Interfaces:**
- Consumes : `Ariane.familleTache(fm, familles, defaut)` (Task 1), `DEFAULT_SETTINGS.famillesTaches`, `DEFAULT_SETTINGS.familleTacheDefaut`.
- Produces : toute note de tâche neuve porte une ligne `famille:` (vide) après `type: tache`. `tachesPourGantt()` renvoie `famille` résolue avec les réglages.

- [ ] **Step 1 : Localiser le test de `corpsNouvelleTache`**

Run: `grep -rn "corpsNouvelleTache" tests/`
Ouvrir le fichier trouvé, repérer un test qui vérifie la présence de lignes d'entête (`type: tache`, `statut`…).

- [ ] **Step 2 : Ajouter l'assertion `famille:`**

Dans ce test, après l'assertion sur `type: tache`, ajouter :

```js
assert.ok(/^famille:/m.test(corps), 'la note neuve déclare une ligne famille');
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run: `node --test <fichier trouvé>`
Attendu : ÉCHEC sur la nouvelle assertion.

- [ ] **Step 4 : Émettre la ligne dans `corpsNouvelleTache`**

Dans `corpsNouvelleTache` (~9414), juste après `l.push('type: tache');` :

```js
    l.push(ligne('famille', c.famille));
```

(`ligne(cle, val)` est déjà défini localement et produit `famille:` quand `val` est vide.)

- [ ] **Step 5 : Lancer les tests du fichier**

Run: `node --test <fichier trouvé>`
Attendu : PASS.

- [ ] **Step 6 : Passer les réglages à `familleTache` dans `tachesPourGantt`**

Dans la boucle (`famille: Ariane.familleTache(fm),`, ~10141), remplacer par :

```js
        famille: Ariane.familleTache(fm, this.settings.famillesTaches, this.settings.familleTacheDefaut),
```

- [ ] **Step 7 : Enregistrer le type de la propriété `famille` au chargement**

Dans `onload`, juste après le bloc `if (typeof this.registerBasesView === 'function') { … }` (après la ligne 3422, `}`), ajouter :

```js
    // « famille » est un texte pour Obsidian ; le menu déroulant se fait
    // côté carte (l'API n'expose pas de type énuméré).
    try {
      const mtm = this.app.metadataTypeManager;
      if (mtm && typeof mtm.setType === 'function'
        && (!mtm.properties || !mtm.properties.famille)) {
        mtm.setType('famille', 'text');
      }
    } catch (e) { /* metadataTypeManager indisponible : sans gravité */ }
```

- [ ] **Step 8 : Non-régression**

Run: `node --test tests/*.test.js`
Attendu : tout vert.

- [ ] **Step 9 : Vérif manuelle**

Dans Obsidian (recharger le greffon) : commande de création de tâche → la note neuve contient `famille:` vide dans l'entête, entre `type: tache` et `statut:`.

- [ ] **Step 10 : Commit**

```bash
git add main.js tests/
git commit -m "Familles de tâches : champ famille sur les nouvelles tâches

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3 : Éditeur de familles dans l'onglet Tâches

**Files:**
- Modify: `main.js` — `ArianeSettingTab.ongletTaches` (~11024), nouvelle méthode `_tableFamillesTaches` (à placer juste après `ongletTaches`)

**Interfaces:**
- Consumes : `s.famillesTaches`, `s.familleTacheDefaut`, `Ariane.TYPE_FR_VERS_OBSIDIAN` (pour les libellés de type), `this._section`/`this._aide`.
- Produces : section « Familles de tâches » dans l'onglet, écrivant dans `s.famillesTaches` / `s.familleTacheDefaut` via `maj()`.

Pas de test automatique (UI). Le rendu suit le modèle de `_tableFamilles` (familles de notes) mais avec ses propres classes CSS `zfa-famt-*` pour ne pas interférer.

- [ ] **Step 1 : Appeler l'éditeur depuis `ongletTaches`**

Dans `ongletTaches`, avant le dernier `this._aide(...)` (celui qui parle de l'articulation, ~11040), insérer :

```js
    this._section(c, tr('Familles de tâches'));
    this._aide(c, tr("Chaque famille porte une couleur et une icône (cartes de l'articulation) et déclare les propriétés qu'elle ajoute à une tâche. La famille d'une tâche vit dans son champ « famille »."));
    this._tableFamillesTaches(c, s, maj);
    new obsidian.Setting(c)
      .setName(tr('Famille par défaut'))
      .setDesc(tr("Appliquée quand le champ « famille » est vide et qu'aucune règle ne tranche."))
      .addDropdown((d) => {
        for (const f of (s.famillesTaches || [])) d.addOption(f.id, f.nom || f.id);
        d.setValue(s.familleTacheDefaut || 'action')
          .onChange(async (v) => { s.familleTacheDefaut = v; await maj(); });
      });
```

- [ ] **Step 2 : Écrire `_tableFamillesTaches`**

Juste après la fermeture de `ongletTaches` :

```js
  // Éditeur des familles de tâches. Même esprit que _tableFamilles (familles
  // de notes) : liste répétable, réordonnable, chaque ligne portant en plus
  // une sous-liste de propriétés { cle, libelle, type }.
  _tableFamillesTaches(parent, s, maj) {
    const TYPES = Object.keys(Ariane.TYPE_FR_VERS_OBSIDIAN); // texte, nombre, …
    const slug = (v) => String(v || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const hote = parent.createDiv({ cls: 'zfa-famt-hote' });

    const rendre = () => {
      hote.empty();
      const familles = Array.isArray(s.famillesTaches) ? s.famillesTaches : (s.famillesTaches = []);
      if (!familles.length) {
        hote.createDiv({ cls: 'zfa-fam-vide', text: tr('Aucune famille de tâches.') });
      }
      familles.forEach((f, i) => {
        const ligne = hote.createDiv({ cls: 'zfa-famt' });
        const tete = ligne.createDiv({ cls: 'zfa-famt-tete' });

        const apercu = tete.createSpan({ cls: 'zfa-famt-apercu' });
        const peindreApercu = () => {
          apercu.empty();
          apercu.style.setProperty('--zfa-fam-couleur', f.couleur || '#888888');
          obsidian.setIcon(apercu, f.icone || 'circle');
        };
        peindreApercu();

        const id = tete.createEl('input', { cls: 'zfa-famt-id', type: 'text' });
        id.placeholder = tr('identifiant'); id.value = f.id || '';
        id.onchange = async () => {
          const v = slug(id.value); id.value = v;
          const collision = (familles || []).some((g, j) => j !== i && g.id === v);
          id.toggleClass('zfa-famt-collision', !!collision || !v);
          if (v && !collision) { f.id = v; await maj(); }
        };

        const nom = tete.createEl('input', { cls: 'zfa-famt-nom', type: 'text' });
        nom.placeholder = tr('Nom affiché'); nom.value = f.nom || '';
        nom.onchange = async () => { f.nom = nom.value.trim(); await maj(); };

        const couleur = tete.createEl('input', { cls: 'zfa-famt-couleur', type: 'color' });
        couleur.value = f.couleur || '#888888';
        couleur.onchange = async () => { f.couleur = couleur.value; peindreApercu(); await maj(); };

        const icone = tete.createEl('input', { cls: 'zfa-famt-icone', type: 'text' });
        icone.placeholder = tr('icône Lucide'); icone.value = f.icone || '';
        icone.onchange = async () => { f.icone = icone.value.trim(); peindreApercu(); await maj(); };

        const monter = tete.createEl('button', { cls: 'zfa-fam-bouton' });
        obsidian.setIcon(monter, 'chevron-up');
        monter.onclick = async () => { if (i === 0) return;
          familles.splice(i - 1, 0, familles.splice(i, 1)[0]); await maj(); rendre(); };
        const descendre = tete.createEl('button', { cls: 'zfa-fam-bouton' });
        obsidian.setIcon(descendre, 'chevron-down');
        descendre.onclick = async () => { if (i >= familles.length - 1) return;
          familles.splice(i + 1, 0, familles.splice(i, 1)[0]); await maj(); rendre(); };
        const suppr = tete.createEl('button', { cls: 'zfa-fam-bouton zfa-fam-suppr' });
        obsidian.setIcon(suppr, 'trash-2');
        suppr.onclick = async () => { familles.splice(i, 1); await maj(); rendre(); };

        ligne.createDiv({ cls: 'zfa-famt-avert', text:
          tr("Renommer l'identifiant ne migre pas les tâches déjà rattachées.") });

        const corps = ligne.createDiv({ cls: 'zfa-famt-props' });
        corps.createEl('div', { cls: 'zfa-famt-props-titre', text: tr('Propriétés ajoutées') });
        (f.proprietes = Array.isArray(f.proprietes) ? f.proprietes : []).forEach((p, j) => {
          const pr = corps.createDiv({ cls: 'zfa-famt-prop' });
          const cle = pr.createEl('input', { type: 'text' });
          cle.placeholder = tr('clé'); cle.value = p.cle || '';
          cle.onchange = async () => { p.cle = cle.value.trim(); await maj(); };
          const lib = pr.createEl('input', { type: 'text' });
          lib.placeholder = tr('libellé'); lib.value = p.libelle || '';
          lib.onchange = async () => { p.libelle = lib.value.trim(); await maj(); };
          const typ = pr.createEl('select');
          for (const t of TYPES) typ.createEl('option', { value: t, text: tr(t[0].toUpperCase() + t.slice(1)) });
          typ.value = p.type || 'texte';
          typ.onchange = async () => { p.type = typ.value; await maj(); };
          const del = pr.createEl('button', { cls: 'zfa-fam-bouton zfa-fam-suppr' });
          obsidian.setIcon(del, 'x');
          del.onclick = async () => { f.proprietes.splice(j, 1); await maj(); rendre(); };
        });
        const plus = corps.createEl('button', { cls: 'zfa-famt-prop-plus' });
        plus.setText(tr('Ajouter une propriété'));
        plus.onclick = async () => { f.proprietes.push({ cle: '', libelle: '', type: 'texte' }); await maj(); rendre(); };
      });
    };

    const barre = parent.createDiv({ cls: 'zfa-fam-barre' });
    new obsidian.Setting(barre)
      .addButton((b) => b.setButtonText(tr('Ajouter une famille')).setCta().onClick(async () => {
        (s.famillesTaches = s.famillesTaches || []).push({
          id: '', nom: '', couleur: '#888888', icone: 'circle', proprietes: [],
        });
        await maj(); rendre();
      }))
      .addButton((b) => b.setButtonText(tr('Recharger les familles par défaut')).onClick(async () => {
        s.famillesTaches = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.famillesTaches));
        await maj(); rendre();
      }));
    rendre();
  }
```

- [ ] **Step 3 : Non-régression**

Run: `node --test tests/*.test.js`
Attendu : tout vert (aucune fonction pure touchée).

- [ ] **Step 4 : Vérif manuelle**

Recharger le greffon → Réglages → onglet Tâches → section « Familles de tâches » :
- les 3 familles préchargées s'affichent, aperçu icône teinté par la couleur ;
- « Ajouter une famille » ajoute une ligne vierge ; un id vide ou en collision passe le champ en rouge et n'est pas enregistré ;
- « Ajouter une propriété » ajoute une rangée `clé / libellé / type` ; suppression OK ;
- monter/descendre réordonne ; « Recharger les familles par défaut » restaure les 3 ;
- le menu « Famille par défaut » liste les familles et retient le choix (fermer/rouvrir les réglages).

- [ ] **Step 5 : Commit**

```bash
git add main.js
git commit -m "Familles de tâches : éditeur dans l'onglet Tâches

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4 : Rattrapage des propriétés manquantes

**Files:**
- Modify: `main.js` — nouvelle méthode greffon `rattraperProprietesFamilles` (à placer près de `majTache` / `tachesPourGantt`), appels dans `VueFriseBase.onDataUpdated`/`onload` et `VueArticulationBase.onDataUpdated`/`onload`

**Interfaces:**
- Consumes : `Ariane.familleDe` (défini ici), `Ariane.proprietesManquantes` (Task 1), `this.settings.famillesTaches`, `this.app.vault`, `this.app.fileManager.processFrontMatter`, `this.app.metadataCache`.
- Produces : `async rattraperProprietesFamilles(): Promise<number>` — écrit les clés manquantes (valeur `''`) dans chaque note de tâche dont `famille` est renseignée ; renvoie le nombre de notes modifiées. `this.familleDe(id) -> famille | repli`.

- [ ] **Step 1 : `familleDe` (repli sûr) sur le greffon**

Près de `tachesPourGantt` :

```js
  // La définition d'une famille par son id, ou un repli gris/rond pour une
  // famille inconnue ou supprimée. Jamais null : les dessinateurs s'appuient
  // dessus sans garde.
  familleDe(id) {
    const liste = Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [];
    return liste.find((f) => f && f.id === id)
      || { id: id || '', nom: id || tr('(sans famille)'), couleur: '#888888', icone: 'circle', proprietes: [] };
  }
```

- [ ] **Step 2 : `rattraperProprietesFamilles`**

Juste après :

```js
  // « Une tâche de la famille X porte les champs de X » : on complète les
  // entêtes qui ne les ont pas encore. Une seule passe, silencieuse, et jamais
  // d'écriture si rien ne manque.
  async rattraperProprietesFamilles() {
    const liste = Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [];
    if (!liste.length) return 0;
    let touchees = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (fm.type !== 'tache') continue;
      const id = fm.famille ? String(fm.famille).trim() : '';
      if (!id) continue;
      const fam = liste.find((x) => x && x.id === id);
      if (!fam) continue;
      const manquantes = Ariane.proprietesManquantes(fm, fam);
      if (!manquantes.length) continue;
      await this.app.fileManager.processFrontMatter(f, (m) => {
        for (const p of manquantes) if (!(p.cle in m)) m[p.cle] = '';
      });
      touchees += 1;
    }
    return touchees;
  }
```

- [ ] **Step 3 : Brancher dans les deux vues**

Dans `fabriquerVueFriseBase`, `onDataUpdated()` (~13692) — le rendre `async` et appeler avant le dessin :

```js
    async onDataUpdated() {
      if (this.greffon.settings.famillesTaches && this.greffon.settings.famillesTaches.length) {
        try { await this.greffon.rattraperProprietesFamilles(); } catch (e) { /* sans gravité */ }
      }
      if (this.moteur) this.moteur.dessiner();
    }
```

Faire la même chose dans `fabriquerVueArticulationBase.onDataUpdated()` (~14166).

- [ ] **Step 4 : Non-régression**

Run: `node --test tests/*.test.js`
Attendu : tout vert.

- [ ] **Step 5 : Vérif manuelle**

Créer une note de tâche, y mettre à la main `famille: production` (sans `livrable` ni `fichier`). Ouvrir une base avec la vue Frise ou Articulation → rouvrir la note : `livrable:` et `fichier:` ont été ajoutés, vides. Rouvrir la vue une 2ᵉ fois → aucune réécriture (vérifier l'historique de version de la note / pas de conflit de sync).

- [ ] **Step 6 : Commit**

```bash
git add main.js
git commit -m "Familles de tâches : rattrapage des propriétés déclarées

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5 : Articulation — plomberie base (ordre, tri, lire/écrire, famille)

**Files:**
- Modify: `main.js` — `fabriquerVueArticulationBase` (`onload` ctx, ~14148 ; ajout de méthodes `colonnesArtic`, `sortNatif` calquées sur la frise), `MoteurArticulation.dessinerVraiment` (tri appliqué avant `placerGraphe`)
- Modify: `tests/articulation.test.js` — cas « tri + nœuds mixtes »

**Interfaces:**
- Consumes : `this.config.getOrder`, `this.config.getDisplayName`, `this.config.serialize().sort`, `this.data.data` entries (`getValue`), `Ariane.typeProprieteBase`, `this.greffon.majTache`.
- Produces, sur le ctx passé à `MoteurArticulation` :
  - `ordre(): Array<{id:string, nom:string, type:string, valeur:(ref)=>any}>` — les propriétés cochées de la base, dans l'ordre, avec leur type Obsidian et un accès à la Value par ref.
  - `tri(): Array<string>` — refs ordonnées selon le tri natif multi-critères (vide si aucun tri).
  - `lire(cle)`, `ecrire(cle, v)` — accès aux options de vue (`modeCarte` en Task 7).
  - `poserFamille(ref, id): Promise<void>` — `majTache(ref, { famille: id })`.
- `placerGraphe` reçoit les nœuds **déjà triés** ; il ne pose de position qu'aux nœuds sans `x/y`. (Comportement déjà en place — vérifié par test ajouté ici.)

- [ ] **Step 1 : Test `placerGraphe` — tri + nœuds mixtes**

Dans `tests/articulation.test.js`, après le test « un nœud avec x/y fixés n'est pas déplacé » :

```js
test('tri : l ordre des nœuds libres suit l entrée, les placés ne bougent pas', () => {
  const pos = Ariane.placerGraphe(
    [N('B', { x: 999, y: 999 }), N('A'), N('C')],
    [], { dx: 200, dy: 100 });
  assert.deepEqual(pos.get('B'), { x: 999, y: 999 });        // placé : intact
  assert.ok(pos.get('A').y < pos.get('C').y);                 // libres : ordre d'entrée
});
```

- [ ] **Step 2 : Lancer**

Run: `node --test tests/articulation.test.js`
Attendu : PASS si `placerGraphe` respecte déjà l'ordre d'entrée pour les nœuds libres ; ÉCHEC sinon → corriger `placerGraphe` pour parcourir les nœuds dans l'ordre reçu (ne pas trier en interne) avant de continuer.

- [ ] **Step 3 : `sortNatif` + `refsTriees` dans `VueArticulationBase`**

Ajouter dans la classe (après `tachesDuGraphe`) :

```js
    sortNatif() {
      let s = [];
      try { s = (this.config.serialize() || {}).sort || (this.config.getSort && this.config.getSort()) || []; }
      catch (e) { s = []; }
      return (Array.isArray(s) ? s : [])
        .filter((x) => x && x.property)
        .map((x) => ({ property: String(x.property),
          desc: String(x.direction || 'ASC').toUpperCase() === 'DESC' }));
    }

    // Les refs du jeu filtré, ordonnées selon le tri natif multi-critères.
    // Vide si aucun tri : le moteur garde alors l'ordre de tachesDuGraphe.
    refsTriees() {
      const crit = this.sortNatif();
      if (!crit.length) return [];
      const parRef = new Map();
      for (const e of (this.data && this.data.data) || []) {
        const ref = e && e.file ? this.greffon.refDeChemin(e.file.path) : null;
        if (ref) parRef.set(ref, e);
      }
      return [...parRef.keys()].sort((ra, rb) => {
        for (const c of crit) {
          const va = this._valTri(parRef.get(ra), c.property);
          const vb = this._valTri(parRef.get(rb), c.property);
          if (va < vb) return c.desc ? 1 : -1;
          if (va > vb) return c.desc ? -1 : 1;
        }
        return 0;
      });
    }

    _valTri(e, prop) {
      let v = null;
      try { v = e ? e.getValue(prop) : null; } catch (err) { v = null; }
      const b = (v && typeof v === 'object' && 'data' in v && v.data != null) ? v.data : v;
      return b == null ? '' : b;
    }

    colonnesArtic() {
      let props = [];
      try { props = this.config.getOrder() || []; } catch (e) { props = []; }
      if (!props.length) props = (this.data && this.data.properties) || [];
      const parRef = new Map();
      for (const en of (this.data && this.data.data) || []) {
        const ref = en && en.file ? this.greffon.refDeChemin(en.file.path) : null;
        if (ref) parRef.set(ref, en);
      }
      return props
        .filter((id) => !String(id).startsWith('file.'))
        .map((id) => {
          let nom = id;
          try { nom = this.config.getDisplayName(id) || id; } catch (e) { /* garde l'id */ }
          const type = Ariane.typeProprieteBase(this.app.metadataTypeManager, id);
          return { id, nom, type, champ: String(id).replace(/^note\./, ''),
            valeur: (ref) => { const en = parRef.get(ref);
              try { return en ? en.getValue(id) : null; } catch (e) { return null; } } };
        });
    }
```

- [ ] **Step 4 : Enrichir le ctx `onload`**

Dans `fabriquerVueArticulationBase.onload()`, ajouter au littéral passé à `new MoteurArticulation(...)` :

```js
        ordre: () => this.colonnesArtic(),
        triRefs: () => this.refsTriees(),
        lire: (cle) => {
          const v = this.config.get(cle);
          return v === undefined || v === null ? null : v;
        },
        ecrire: async (cle, v) => { this.config.set(cle, v); },
        poserFamille: async (ref, id) => { await this.greffon.majTache(ref, { famille: id }); },
```

- [ ] **Step 5 : Appliquer le tri dans `dessinerVraiment`**

Dans `MoteurArticulation.dessinerVraiment`, après `const taches = (this.ctx.taches && this.ctx.taches()) || [];` :

```js
    const ordreTri = (this.ctx.triRefs && this.ctx.triRefs()) || [];
    if (ordreTri.length) {
      const rang = new Map(ordreTri.map((r, i) => [r, i]));
      taches.sort((a, b) => (rang.has(a.ref) ? rang.get(a.ref) : 1e9)
        - (rang.has(b.ref) ? rang.get(b.ref) : 1e9));
    }
```

`Ariane.grapheArticulation(taches)` conserve l'ordre du tableau pour `noeuds` — `placerGraphe` reçoit donc les nœuds triés.

- [ ] **Step 6 : Tests**

Run: `node --test tests/*.test.js`
Attendu : tout vert.

- [ ] **Step 7 : Vérif manuelle**

Base avec vue Articulation : dans « Trier » (menu natif), trier par `echeance`. Cliquer « Re-disposer » → les cartes non déplacées à la main s'ordonnent par échéance de haut en bas. Une carte préalablement déplacée (avec `canvas-x/y`) reste à sa place.

- [ ] **Step 8 : Commit**

```bash
git add main.js tests/articulation.test.js
git commit -m "Articulation : tri natif et accès aux propriétés de la base

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6 : Articulation — cartes pilotées par les propriétés + sélecteur de famille

**Files:**
- Modify: `main.js` — `MoteurArticulation.dessinerNoeud` (~13879)
- Modify: `styles.css` — rangées de propriété de carte, sélecteur de famille

**Interfaces:**
- Consumes : `this.ctx.ordre()`, `this.ctx.poserFamille()` (Task 5), `this.greffon.familleDe()` (Task 4), `this.greffon.majTache`, `app.metadataTypeManager.registeredTypeWidgets`, `this.greffon.settings.famillesTaches`.
- Produces : chaque carte affiche, sous le titre, une rangée par propriété cochée dans la base (widget de type éditable si dispo, texte sinon) et un `<select>` de famille en pied.

- [ ] **Step 1 : Rendu des rangées de propriété**

Dans `dessinerNoeud`, après le bloc de la jauge (`if (n.avancement > 0) { … }`) et avant `carte.addEventListener('pointerdown' …)` :

```js
    const cols = (this.ctx.ordre && this.ctx.ordre()) || [];
    if (cols.length) {
      const tb = corps.createDiv({ cls: 'zfa-artic-props' });
      for (const col of cols) {
        const rg = tb.createDiv({ cls: 'zfa-artic-prop' });
        rg.createSpan({ cls: 'zfa-artic-prop-cle', text: col.nom });
        const val = rg.createSpan({ cls: 'zfa-artic-prop-val' });
        if (!this._rendreValeurTypee(val, col, n.ref)) {
          const brut = col.valeur ? col.valeur(n.ref) : null;
          val.setText(VueFriseBase.texteValeur(brut && typeof brut === 'object' && 'data' in brut ? brut.data : brut));
        }
      }
    }

    const pied = carte.createDiv({ cls: 'zfa-artic-famchoix' });
    const sel = pied.createEl('select', { cls: 'zfa-artic-famsel' });
    for (const f of (this.greffon.settings.famillesTaches || [])) {
      sel.createEl('option', { value: f.id, text: f.nom || f.id });
    }
    sel.value = n.famille || '';
    sel.addEventListener('pointerdown', (e) => e.stopPropagation());
    sel.addEventListener('change', async () => {
      await this.ctx.poserFamille(n.ref, sel.value);
      this.dessiner();
    });
```

- [ ] **Step 2 : `_rendreValeurTypee` (calqué sur `rendreCelluleTypee`)**

Ajouter à `MoteurArticulation` :

```js
  // Rend une valeur de propriété avec le widget de type d'Obsidian. true si le
  // widget a pris la main, false sinon (l'appelant retombe sur du texte).
  _rendreValeurTypee(hote, col, ref) {
    const id = String(col.id || '');
    if (id.startsWith('file.') || id.startsWith('formula.')) return false;
    const widgets = this.app.metadataTypeManager
      && this.app.metadataTypeManager.registeredTypeWidgets;
    const w = widgets && widgets[col.type];
    if (!w || typeof w.render !== 'function') return false;
    const v = col.valeur ? col.valeur(ref) : null;
    const brut = (v && typeof v === 'object' && 'data' in v) ? v.data : v;
    try {
      w.render(hote, brut == null ? '' : brut, {
        app: this.app, key: col.champ, sourcePath: ref + '.md',
        blur: () => {},
        onChange: (nv) => this.greffon.majTache(ref, { [col.champ]: nv }),
      });
      hote.addClass('bases-metadata-value', 'metadata-property-value');
      return true;
    } catch (e) { hote.empty(); return false; }
  }
```

- [ ] **Step 3 : CSS**

Dans `styles.css`, à la fin du bloc `.zfa-artic-*` :

```css
.zfa-artic-props { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
.zfa-artic-prop { display: flex; gap: 6px; font-size: 0.75em; line-height: 1.3; }
.zfa-artic-prop-cle { color: var(--text-muted); flex: 0 0 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zfa-artic-prop-val { flex: 1 1 60%; overflow: hidden; text-overflow: ellipsis; }
.zfa-artic-prop-val .metadata-input-longtext,
.zfa-artic-prop-val input { font-size: inherit; min-height: 0; padding: 0; }
.zfa-artic-famchoix { margin-top: 4px; }
.zfa-artic-famsel { width: 100%; font-size: 0.75em; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 4px; }
```

- [ ] **Step 4 : Tests**

Run: `node --test tests/*.test.js`
Attendu : tout vert (rien de pur touché).

- [ ] **Step 5 : Vérif manuelle**

Vue Articulation, mode par défaut (rétracté — Task 7 pas encore là, donc les rangées apparaissent d'office pour l'instant) :
- cocher `statut` puis `priorite` dans « Propriétés » de la base → chaque carte gagne une rangée par propriété, empilées ;
- une propriété éditable (date, nombre) montre le champ natif, une modif se répercute dans la note ;
- le `<select>` en pied liste les familles ; changer la famille réécrit `famille:` dans la note et redessine.

- [ ] **Step 6 : Commit**

```bash
git add main.js styles.css
git commit -m "Articulation : cartes pilotées par les propriétés de la base

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7 : Articulation — couleur et icône par famille

**Files:**
- Modify: `main.js` — `MoteurArticulation.dessinerNoeud` (bloc icône, ~13887)
- Modify: `styles.css` — usage de `--zfa-fam-couleur`

**Interfaces:**
- Consumes : `this.greffon.familleDe(id)` (Task 4).
- Produces : la carte porte `--zfa-fam-couleur` (bord gauche + teinte du badge) et l'icône de la famille ; famille inconnue → gris `#888`, icône `circle` (déjà le repli de `familleDe`).

- [ ] **Step 1 : Remplacer le bloc icône en dur**

Dans `dessinerNoeud`, remplacer :

```js
    const ic = carte.createSpan({ cls: 'zfa-artic-fam' });
    obsidian.setIcon(ic, { lecture: 'book-open', production: 'file-pen', action: 'zap' }[n.famille] || 'circle');
```

par :

```js
    const fam = this.greffon.familleDe(n.famille);
    carte.style.setProperty('--zfa-fam-couleur', fam.couleur || '#888888');
    const ic = carte.createSpan({ cls: 'zfa-artic-fam' });
    ic.setAttribute('aria-label', fam.nom || n.famille || '');
    obsidian.setIcon(ic, fam.icone || 'circle');
```

- [ ] **Step 2 : CSS — utiliser la variable**

Dans `styles.css`, ajuster `.zfa-artic-carte` et `.zfa-artic-fam`. Remplacer la règle actuelle du bord gauche (`.zfa-artic-carte { border-left: 3px solid …[data-statut]… }`) pour que le bord suive la famille, en gardant `data-statut` pour la pastille :

```css
.zfa-artic-carte { border-left: 3px solid var(--zfa-fam-couleur, var(--background-modifier-border)); }
.zfa-artic-fam { color: var(--zfa-fam-couleur, var(--text-muted)); }
```

(Laisser les règles `[data-statut]` qui colorent la pastille `.zfa-artic-pastille`, pas le bord.)

- [ ] **Step 3 : Tests**

Run: `node --test tests/*.test.js`
Attendu : tout vert.

- [ ] **Step 4 : Vérif manuelle**

Régler des couleurs contrastées pour `lecture` / `production` / `action` dans les réglages. Vue Articulation → chaque carte a le bon bord gauche et la bonne icône. Mettre `famille: zephyr` (inconnue) sur une note → carte grise, icône rond.

- [ ] **Step 5 : Commit**

```bash
git add main.js styles.css
git commit -m "Articulation : couleur et icône de carte par famille

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8 : Articulation — modes Rétracté / Détaillé et hauteur de nœud variable

**Files:**
- Modify: `main.js` — `registerBasesView(TYPE_VUE_BASE_ARTIC …)` (`options`, ~3420), `MoteurArticulation` (barre, `dessinerNoeud`, `dessinerVraiment`, `dessinerArete`, `majAretesDe`)
- Modify: `styles.css` — carte détaillée, chevron de dépli

**Interfaces:**
- Consumes : `this.ctx.lire('modeCarte')`, `this.ctx.ecrire('modeCarte', v)` (Task 5).
- Produces : option de vue `modeCarte` (`retracte` \| `detaille`, défaut `retracte`) ; bouton bascule dans la barre ; en `detaille`, chevron par carte (état plié en `Map` de session) ; chaque nœud expose `n.h` (hauteur effective) que `placerGraphe` et le tracé des arêtes utilisent au lieu de `ARTIC_H` constant.

- [ ] **Step 1 : Déclarer l'option de vue**

Dans `registerBasesView` pour `TYPE_VUE_BASE_ARTIC`, remplacer `options: () => []` par :

```js
        options: () => [
          {
            type: 'dropdown', key: 'modeCarte', displayName: tr('Cartes'),
            default: 'retracte',
            options: { retracte: tr('Rétracté'), detaille: tr('Détaillé') },
          },
        ],
```

- [ ] **Step 2 : Bouton bascule dans la barre**

Dans `dessinerVraiment`, remplacer la ligne du bouton « + Tâche »… (traitée en Task 9 ; ici, ajouter la bascule) après les boutons Re-disposer / Ajuster :

```js
    const mode = (this.ctx.lire && this.ctx.lire('modeCarte')) || 'retracte';
    this._mode = mode;
    this.boutonBarre(barre, mode === 'detaille' ? 'rows-3' : 'rows-2',
      mode === 'detaille' ? tr('Détaillé') : tr('Rétracté'), async () => {
        await this.ctx.ecrire('modeCarte', mode === 'detaille' ? 'retracte' : 'detaille');
        this.dessiner();
      });
```

- [ ] **Step 3 : Hauteur de nœud effective**

Dans `dessinerVraiment`, avant `Ariane.placerGraphe(...)`, calculer une hauteur par nœud selon le mode et le nombre de propriétés :

```js
    const cols = (this.ctx.ordre && this.ctx.ordre()) || [];
    const hDe = (n) => {
      if (this._mode !== 'detaille') return ARTIC_H;
      if (this._plies && this._plies.has(n.ref)) return ARTIC_H;
      return ARTIC_H + Math.max(0, cols.length) * 18 + 22; // rangées + pied famille
    };
    for (const n of noeuds) n.h = hDe(n);
```

Passer les hauteurs à `placerGraphe` via une option, et l'utiliser pour l'empilement vertical. Modifier la signature d'appel :

```js
    this._pos = Ariane.placerGraphe(noeuds, aretes, { dx: 300, dy: 130, hauteur: (ref) => {
      const n = noeuds.find((x) => x.ref === ref); return n ? n.h : ARTIC_H;
    } });
```

Dans `Ariane.placerGraphe`, si `opts.hauteur` est fourni, utiliser `opts.hauteur(ref)` au lieu d'un `dy` fixe pour espacer deux nœuds d'un même rang (empilement = cumul des hauteurs + marge). Si absent, comportement actuel. **Ajouter un test** :

```js
test('placerGraphe : hauteur variable espace les nœuds d un même rang', () => {
  const pos = Ariane.placerGraphe([N('A'), N('B')], [],
    { dx: 200, dy: 100, hauteur: (r) => (r === 'A' ? 200 : 60) });
  assert.ok(pos.get('B').y - pos.get('A').y >= 200);
});
```

- [ ] **Step 4 : `dessinerNoeud` — `foreignObject` et rangées selon le mode**

- `fo` : `height: n.h` au lieu de `ARTIC_H`.
- Le bloc `zfa-artic-props` + le pied famille : rendus seulement si `this._mode === 'detaille'` **et** nœud non plié.
- En `detaille`, ajouter un chevron dans la carte :

```js
    if (this._mode === 'detaille') {
      const chev = carte.createSpan({ cls: 'zfa-artic-chevron' });
      const plie = this._plies && this._plies.has(n.ref);
      obsidian.setIcon(chev, plie ? 'chevron-right' : 'chevron-down');
      chev.addEventListener('pointerdown', (e) => e.stopPropagation());
      chev.addEventListener('click', (e) => {
        e.stopPropagation();
        this._plies = this._plies || new Set();
        if (this._plies.has(n.ref)) this._plies.delete(n.ref); else this._plies.add(n.ref);
        this.dessiner();
      });
    }
```

Initialiser `this._plies = this._plies || new Set();` dans le constructeur.

- [ ] **Step 5 : Arêtes — accrocher au milieu réel du nœud**

Dans `dessinerArete` et `majAretesDe`, remplacer `ARTIC_H / 2` par la demi-hauteur du nœud concerné. Le moteur garde `this._noeudsParRef = new Map(noeuds.map((n) => [n.ref, n]))` dans `dessinerVraiment` ; puis :

```js
    const hs = (this._noeudsParRef.get(a.de) || {}).h || ARTIC_H;
    const ht = (this._noeudsParRef.get(a.vers) || {}).h || ARTIC_H;
    const y1 = s.y + hs / 2;
    const y2 = t.y + ht / 2;
```

Idem pour les positions `cy` des cercles d'accroche dans `dessinerNoeud` (`n.h * 0.32`, `n.h * 0.72`).

- [ ] **Step 6 : CSS**

```css
.zfa-artic-carte { position: relative; overflow: hidden; }
.zfa-artic-chevron { position: absolute; top: 4px; right: 4px; cursor: pointer; color: var(--text-muted); }
.zfa-artic-carte:has(.zfa-artic-props) { height: auto; }
```

- [ ] **Step 7 : Tests**

Run: `node --test tests/*.test.js`
Attendu : tout vert (dont les 2 nouveaux cas `placerGraphe`).

- [ ] **Step 8 : Vérif manuelle**

Vue Articulation → « Configurer la vue » montre « Cartes : Rétracté / Détaillé ». Le bouton de barre bascule et persiste (rouvrir la base). En rétracté : cartes compactes, ni rangées de propriété ni sélecteur de famille. En détaillé : cartes hautes, rangées + pied famille + chevron ; replier une carte la ramène à la taille compacte et resserre ses voisines ; les flèches restent accrochées au milieu des cartes quelle que soit leur hauteur.

- [ ] **Step 9 : Commit**

```bash
git add main.js styles.css tests/articulation.test.js
git commit -m "Articulation : modes Rétracté / Détaillé et hauteur de carte variable

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9 : Nettoyage — retrait du bouton « + Tâche »

**Files:**
- Modify: `main.js` — `MoteurArticulation.dessinerVraiment` (ligne du bouton, ~13826), suppression de `ajoutRapide` (~14125)

**Interfaces:**
- Le bouton natif « Nouveau » de Bases (à côté de « Recherche ») crée la tâche. `creerTache` reste (utilisée ailleurs — vérifier avec `grep -n "creerTache" main.js`).

- [ ] **Step 1 : Retirer la ligne du bouton**

Dans `dessinerVraiment`, supprimer :

```js
    this.boutonBarre(barre, 'plus', tr('Tâche'), () => this.ajoutRapide());
```

- [ ] **Step 2 : Supprimer la méthode `ajoutRapide`**

Supprimer le bloc `async ajoutRapide() { … }` en entier (de `async ajoutRapide() {` à sa `}` fermante, ~14125-14136). Ne pas toucher aux méthodes voisines (`redisposer`, la fin de classe).

- [ ] **Step 3 : Vérifier qu'aucun appelant ne reste**

Run: `grep -n "ajoutRapide" main.js`
Attendu : aucune occurrence.

Run: `grep -n "creerTache" main.js`
Attendu : `creerTache` toujours définie et référencée ailleurs (capture, commandes) — ne pas la retirer.

- [ ] **Step 4 : Tests**

Run: `node --test tests/*.test.js`
Attendu : tout vert.

- [ ] **Step 5 : Vérif manuelle**

Vue Articulation : la barre montre seulement Re-disposer · Ajuster · bascule Rétracté/Détaillé. Le bouton « Nouveau » de Bases (barre native au-dessus) crée une note dans le dossier des tâches ; lui donner `type: tache` si la source de la base ne l'impose pas déjà, puis la carte apparaît.

- [ ] **Step 6 : Commit**

```bash
git add main.js
git commit -m "Articulation : retrait du bouton de création redondant

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10 : Documentation et version

**Files:**
- Modify: `README.md`, `README.fr.md`, `manifest.json`, `versions.json`

**Interfaces:** aucune (docs + métadonnées).

- [ ] **Step 1 : README**

Dans `README.fr.md` et `README.md`, section des tâches / de la frise, ajouter un paragraphe : les familles de tâches sont configurables dans Réglages → Tâches (couleur, icône, propriétés ajoutées) ; la vue Articulation colore et illustre les cartes par famille, affiche les propriétés cochées dans la base, et respecte filtre et tri natifs ; deux modes de carte (Rétracté / Détaillé).

- [ ] **Step 2 : Version**

Choisir la version (mineure : `2.76.0`). Mettre à jour `manifest.json` (`version`) et ajouter `"2.76.0": "1.0.0"` à `versions.json`.

- [ ] **Step 3 : Non-régression finale**

Run: `node --test tests/*.test.js`
Attendu : tout vert.

- [ ] **Step 4 : Commit + tag**

```bash
git add README.md README.fr.md manifest.json versions.json
git commit -m "Familles de tâches : docs et version 2.76.0

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Le tag et la publication GitHub se font sur demande explicite de l'utilisateur (workflow `.github/workflows/release.yml` déclenché par un tag `x.y.z`).

---

## Auto-revue du plan

**Couverture de la spéc :**

| Section spéc | Tâche(s) |
|---|---|
| §1.1 définition de famille + `famillesTaches` préchargé + `familleTacheDefaut` | 1, 3 |
| §1.2 champ `famille`, `corpsNouvelleTache`, enregistrement du type | 2 |
| §2.1 `familleTache` élargie + rétro-compat | 1 |
| §2.2 `proprietesManquantes` | 1 |
| §2.3 `TYPE_FR_VERS_OBSIDIAN` partagé | 1 |
| §3.1 rattrapage des propriétés manquantes | 4 |
| §3.2 éditeur de familles dans l'onglet Tâches | 3 |
| §3.3 cartes pilotées par `getOrder()`, filtre natif, tri natif, `<select>` famille, couleur/icône | 5, 6, 7 |
| §3.4 modes Rétracté / Détaillé, hauteur de nœud variable, dépli par carte | 8 |
| §3.5 retrait du bouton « + Tâche » | 9 |
| §4 récap réglages + option de vue `modeCarte` | 1, 8 |
| §5 tests | 1 (`familles-taches.test.js`), 5 et 8 (`articulation.test.js`) |
| §6 ordre de mise en œuvre | 1→10 |

Filtre natif (§3.3) : aucun code neuf — `tachesDuGraphe()` lit déjà `this.data.data`, qui est le jeu filtré. Vérifié en Task 5 step 7 (vérif manuelle) et noté ici pour mémoire.

**Placeholders :** aucun « TODO/TBD ». Tous les blocs de code sont complets.

**Cohérence des types :** `familleDe` renvoie toujours un objet `{id,nom,couleur,icone,proprietes}` (Task 4) — consommé tel quel en 6 et 7. `ctx.ordre()` renvoie `{id,nom,type,champ,valeur}` (Task 5) — consommé en 6 (`_rendreValeurTypee`, rangées) et 8 (`hDe`). `n.h` posé en Task 8 step 3, lu en 8 steps 4-5. `this._plies` initialisé au constructeur (Task 8 step 4), lu en 8 step 3.

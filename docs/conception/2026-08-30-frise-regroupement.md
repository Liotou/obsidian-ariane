# Conception — Regroupement de la frise (B′)

**But :** regrouper les lignes de la frise Gantt par la valeur d'une propriété,
avec un en-tête par groupe pleine largeur, repliable. Le regroupement natif de
Bases n'étant pas exposé aux vues custom en Obsidian 1.12 (`config.getGroupBy`
absent, `this.data.groups` absent, pas de menu « Grouper par »), Ariane fournit
son propre moteur, réglé depuis le panneau natif « Configurer la vue » et rangé
dans le fichier `.base`.

**Architecture :** comme le reste de la frise — le partitionnement et le calcul
de disposition sont des **fonctions pures**, statiques de `Ariane`, éprouvables
par `node --test`. `MoteurFrise` ne fait que dessiner ce qu'elles rendent.
`VueFriseBase` lit la base et prépare les données.

**Spécification amont :** `docs/conception/2026-08-28-systeme-de-taches.md`,
`docs/conception/2026-08-28-plan-taches-chantier-3a.md`.

---

## Contraintes globales

Celles du chantier 3a restent en vigueur. S'y ajoutent :

- **`groupBy` vide ⇒ aucun changement de comportement.** Le code actuel reste le
  chemin par défaut, bit pour bit. Toute la nouveauté est derrière ce test.
- **Une passe de placement unique.** Aujourd'hui chaque dessinateur recalcule
  `_hEntete + rang * _H`. Avec des en-têtes de groupe (hauteur `_hEntete`)
  intercalés entre des lignes de données (hauteur `_H`), les Y cessent d'être
  des multiples uniformes. Une seule passe attribue à chaque ligne visuelle un
  `y` et un `h` ; tous les dessinateurs lisent ces valeurs, plus jamais
  `rang * _H`.
- **`ref` reste l'identité d'écriture.** Une tâche multi-valeur est dupliquée
  dans plusieurs groupes ; chaque ligne porte une `cleLigne` distincte, mais
  `ligne.ref` désigne toujours la même note. Glisser une barre dupliquée écrit
  la note ; le redraw remet à jour toutes ses instances.
- **Aucune écriture qui ne change rien**, comme partout ailleurs.
- **Hors périmètre v1 :** barre récapitulative sur l'en-tête de groupe ;
  réordonnancement manuel des groupes ; connexion des flèches à *toutes* les
  occurrences d'une tâche dupliquée (v1 : première occurrence seulement).

---

## 1. Le réglage `groupBy`

Dans l'appel `registerBasesView(TYPE_VUE_BASE_FRISE, { options: (config) => [...] })`,
ajouter une entrée :

```js
{
  type: 'dropdown', key: 'groupBy', displayName: tr('Grouper par'),
  default: '',
  options: fabriquerChoixGroupby(),   // { '': tr('(aucun)'), 'note.famille': 'famille', … }
}
```

`fabriquerChoixGroupby()` (helper, portée greffon) construit la liste :

- `'' → tr('(aucun)')` en tête ;
- `'file.name' → tr('nom du fichier')`, `'file.folder' → tr('dossier')` ;
- toutes les clés de `this.app.metadataTypeManager.properties`, préfixées
  `note.`, libellé = le nom de la propriété.

C'est le comportement d'un `group by` natif : n'importe quelle propriété du
coffre, affichée ou non en colonne.

`DEFAUTS_FRISE` reçoit `groupBy: ''`.

---

## 2. Lecture de la valeur de groupe — `VueFriseBase`

Nouvelle méthode `groupesParTache()` appelée dans `dessiner` avant la
disposition. Retour : `Map<ref, string[]>` — pour chaque `ref` retenu, la liste
ordonnée de ses libellés de groupe (déjà mis en texte).

```js
groupesParTache() {
  const id = this.config.get('groupBy');
  if (!id) return null;                     // pas de regroupement
  const out = new Map();
  for (const [ref, e] of this._parRef) {
    let v;
    try { v = e.getValue(id); } catch (err) { v = null; }
    const libelles = VueFriseBase.libellesGroupe(v);   // [] si vide
    out.set(ref, libelles.length ? libelles : [SANS_GROUPE]);
  }
  return out;
}
```

`VueFriseBase.libellesGroupe(value)` (statique) :

- `null` / `undefined` / `''` → `[]` ;
- tableau → chaque élément passé à `texteValeur`, vides retirés ;
- sinon → `[texteValeur(value)]`.

`SANS_GROUPE` est une constante marquée (ex. `'sans'`) que la disposition
reconnaît pour libeller « (sans <nom>) » et placer le groupe en dernier ;
`<nom>` = `this.config.getDisplayName(id)`.

Les ancêtres ajoutés par `tachesDeLaBase` (parents hors du filtre) n'ont pas
d'entrée dans `_parRef` : `groupesParTache` leur attribue `[SANS_GROUPE]`, ce
qui les garde visibles sans les rattacher à un groupe arbitraire.

---

## 3. Disposition — fonctions pures

### 3.1 `Ariane.disposerFriseGroupee(taches, groupes, tri, sens)`

`groupes` = `Map<ref, string[]>` ou `null`.

- `groupes` nul ⇒ `return Ariane.disposerGantt(taches, tri, sens)` inchangé,
  chaque ligne recevant `cleLigne = ref` et `kind = 'tache'`.
- Sinon :
  1. Construire la liste des groupes : union de tous les libellés, triés
     `localeCompare('fr')`, `SANS_GROUPE` toujours en dernier.
  2. Pour chaque groupe G :
     - `tachesG` = tâches dont `groupes.get(ref)` contient G ;
     - `lignesG = Ariane.disposerGantt(tachesG, tri, sens)` — l'arbre est
       reconstruit sur ce sous-ensemble, donc un parent absent du groupe
       devient racine (règle existante) ;
     - donner à chaque ligne une `cleLigne` = `G` + séparateur nul + `ref`,
       pour distinguer les doublons d'une tâche multi-valeur entre groupes ;
     - émettre `{ kind: 'groupe', libelle: G, cleGroupe: 'groupe:' + G }` puis
       les lignes de `lignesG` (`kind: 'tache'`).
- Retour : liste unifiée `[{kind, …}]`, dans l'ordre d'affichage, repli non
  encore appliqué. Le compte affiché dans la bande est calculé en § 4.1, sur les
  seules lignes de tâches datées du groupe.

Tests (`tests/regroupement.test.js`) :
- sans `groupes`, sortie identique à `disposerGantt` ;
- deux familles → deux en-têtes, chacun suivi de son arbre ;
- tâche sans valeur → groupe « sans » en dernier ;
- tâche multi-valeur → présente dans chaque groupe, `cleLigne` distinctes ;
- parent dans un autre groupe → l'enfant est racine dans le sien ;
- l'ordre des groupes est alphabétique, « sans » en dernier ;
- le tri (`cle`, `intitule`, `manuel`) s'applique dans chaque groupe.

### 3.2 `Ariane.placerLignes(dispo, hEntete, hLigne, replies)`

Passe de placement, pure. `dispo` = sortie de `disposerFriseGroupee` (ou une
liste de `{kind:'tache'}` seule). `replies` = `Set` des `cleGroupe` et `ref`
repliés.

Parcours en ordre ; maintient un `y` courant partant de `hEntete` (la bande de
titres de la frise) :

- `kind:'groupe'` → `{ …, y, h: hEntete }` ; `y += hEntete` ; si
  `replies.has(cleGroupe)`, un drapeau `masquerJusquAuGroupeSuivant` saute les
  lignes de tâches jusqu'au prochain `kind:'groupe'` (elles reçoivent
  `visible:false`, pas de `y`).
- `kind:'tache'` non masquée → application du repli de méta-tâche existant
  (`replies.has(ref)` d'un ancêtre) via le champ `niveau` et le `Set` déjà géré
  par `MoteurFrise.visibles` — **`visibles` est absorbé dans cette passe** ;
  `{ …, y, h: hLigne }` ; `y += hLigne`.
- Retour `{ lignes: [...visibles avec y/h...], hauteurTotale: y }`.

Tests :
- alternance en-tête / lignes → `y` cumulés corrects, en-têtes à `hEntete`,
  lignes à `hLigne` ;
- groupe replié → ses tâches absentes, `y` du groupe suivant remonte ;
- méta-tâche repliée dans un groupe → sa descendance absente ;
- `hauteurTotale` = somme exacte.

---

## 4. `MoteurFrise` — intégration

### 4.1 `dessiner`

Après le filtrage et le tri actuels :

```js
const groupes = this.ctx.groupes ? this.ctx.groupes() : null;
const dispo = Ariane.disposerFriseGroupee(taches, groupes, mode, sensTri);
const place = Ariane.placerLignes(dispo, this._hEntete, this._H, this.replies);
const lignes = place.lignes;                 // remplace this.visibles(planifiees)
const hauteur = place.hauteurTotale;         // remplace _hEntete + n*_H
```

`this.ctx.groupes` est fourni par `VueFriseBase` (renvoie `groupesParTache()`),
absent pour `VueGanttTaches` → `null` → aucun regroupement dans la vue autonome.

**Filtrage des non datées et des groupes vides.** Entre `disposerFriseGroupee`
et `placerLignes` :

1. retirer de `dispo` les lignes `kind:'tache'` sans `debut` ni `echeance`
   (après remontée des dates sur les méta-tâches, comme aujourd'hui) ;
2. les collecter, dédupliquées par `ref`, pour le tiroir des non planifiées ;
3. retirer toute ligne `kind:'groupe'` qui n'est plus suivie d'aucune ligne de
   tâche avant le groupe suivant (groupe devenu vide) ;
4. calculer le compte de chaque bande sur les lignes de tâches datées restantes
   du groupe, et le porter sur l'objet `{kind:'groupe'}`.

`placerLignes` reçoit donc un `dispo` déjà nettoyé. La cascade est inchangée.

### 4.2 Conversion des Y — inventaire exhaustif

Remplacer `this._hEntete + rang * this._H` (et variantes `rang * this._H`) par
`ligne.y` / `ligne.h` dans :

| Méthode | Usage actuel | Après |
|---|---|---|
| `dessinerColonneGauche` | `rangee.style.top = rang * H` | `ligne.y - _hEntete` (le tableau gauche part de 0 sous l'en-tête) |
| `dessinerColonneGauche` | `tbody.style.height = lignes.length * H` | `hauteurTotale - _hEntete` |
| `dessinerBarres` | `yLigne = _hEntete + rang * _H` | `ligne.y` |
| `dessinerBarres` | `height: this._H` (rect survol) | `ligne.h` |
| `dessinerJalon` | reçoit `rang, lignes.length` | recevoir `ligne` (utiliser `ligne.y`, `ligne.h`) |
| `dessinerFond` | `bas = haut + nLignes * _H` ; grille horizontale `r * _H` | `bas = hauteurTotale` ; une ligne par frontière `ligne.y` |
| `dessinerRegroupements` | `y = _hEntete + rang * _H` ; `h = (dernier-rang+1) * _H` | `ligne.y` ; somme des `h` de la portée |
| `dessinerFleches` | `y1/y2 = _hEntete + rang.get(ref) * _H + _H/2` | `ligne.y + ligne.h/2` via une `Map<cleLigne|ref, ligne>` |
| `dessinerAujourdhui` | `nLignes * _H` | `hauteurTotale - _hEntete` |
| `svg` hauteur | `_hEntete + lignes.length * _H` | `hauteurTotale` |
| `_bougerFleches` | lit `f.y1/f.y2` figés au dessin | inchangé (les Y viennent déjà du dessin) |

`dessinerFleches` : la `Map` de rang devient `Map<ref, ligne>` en **première
occurrence** (`if (!m.has(ref)) m.set(ref, ligne)`), conforme à la limite v1.

### 4.3 En-têtes de groupe — le dessin

Nouvelle méthode `dessinerEntetesGroupes(env, lignes)` appelée après
`dessinerColonneGauche` et le montage du SVG. Pour chaque `ligne.kind==='groupe'` :

- créer `env.createDiv({ cls: 'zfa-gantt-bande-groupe' })` — `env` est
  `.zfa-gantt-enveloppe`, déjà `position: relative` ;
- `style.top = (ligne.y - défilement) + 'px'` ; `left: 0; right: 0` ;
  `height: _hEntete` ;
- contenu : un chevron ▸/▾ + le libellé + `« (n) »`, épinglés à gauche
  (`position: sticky; left: 0` dans la bande, ou simplement à `left:0` puisque
  la bande couvre toute la largeur) ;
- `pointerdown` sur la bande → bascule `this.replies` sur `ligne.cleGroupe`,
  puis `this.dessiner()`.

Synchronisation du défilement : le gestionnaire `droite.addEventListener(
'scroll', …)` qui décale déjà `table.style.top` décale aussi chaque
`.zfa-gantt-bande-groupe` de `-droite.scrollTop`. Regrouper ces bandes dans un
conteneur `.zfa-gantt-bandes` unique pour n'avoir qu'un `style.top` à bouger.

CSS (`styles.css`) :

```css
.zfa-gantt-bandes { position: absolute; top: 0; left: 0; right: 0; z-index: 7;
  pointer-events: none; }
.zfa-gantt-bande-groupe {
  position: absolute; left: 0; right: 0; pointer-events: auto;
  display: flex; align-items: center; gap: 6px;
  padding: 0 var(--bases-table-cell-edge-padding, 8px);
  font-size: 0.875em; font-weight: 600;
  background: var(--background-secondary);
  border-top: 1px solid var(--background-modifier-border);
  border-bottom: 1px solid var(--background-modifier-border);
  cursor: pointer;
}
.zfa-gantt-bande-groupe .zfa-gantt-chevron { font-weight: 400; }
.zfa-gantt-bande-compte { color: var(--text-faint); font-weight: 400; }
```

La bande passe **au-dessus** du tableau gauche (`z-index: 7 > 5`) et du SVG, d'un
seul tenant sur toute la largeur de la fenêtre, comme demandé.

---

## 5. Repli

`this.replies` (déjà un `Set`, déjà consulté pour les méta-tâches) accueille les
`cleGroupe` (`'groupe:' + libelle`). Aucune collision : les clés de méta-tâches
sont des `ref` (`T26-001`), jamais préfixées `groupe:`. `placerLignes` applique
les deux replis dans la même passe. Un groupe replié garde sa bande ; ses lignes
n'ont pas de `y` et ne sont pas dessinées.

Le repli n'est pas persisté (comme celui des méta-tâches aujourd'hui) : il vit le
temps de la vue.

---

## 6. Séquence de vérification

1. `node --check main.js`
2. `node --test tests/*.test.js` — dont `tests/regroupement.test.js` neuf.
3. `cp main.js styles.css "$HOME/Obsidian Vault/.obsidian/plugins/obsidian-ariane/"`,
   recharger.
4. À la main dans la base des tâches, vue Frise :
   - `groupBy` vide → strictement l'affichage actuel ;
   - grouper par une propriété mono-valeur → un en-tête par valeur, arbre
     dessous, alignement gauche/droite conservé ;
   - propriété multi-valeur → tâche présente dans chaque groupe ;
   - tâche sans valeur → groupe « (sans …) » en dernier ;
   - replier un groupe → ses lignes disparaissent, la frise se resserre, les
     flèches et la ligne d'aujourd'hui restent cohérentes ;
   - changer la hauteur de ligne → les bandes de groupe gardent la hauteur
     d'en-tête, seules les lignes de données s'épaississent ;
   - glisser une barre → flèches vivantes, écriture au lâcher, redraw correct
     même pour une tâche dupliquée.

---

## 7. Fichiers touchés

- `main.js` : `Ariane.disposerFriseGroupee`, `Ariane.placerLignes`,
  `VueFriseBase.libellesGroupe` / `groupesParTache`, `fabriquerChoixGroupby`,
  entrée `options` `groupBy`, `DEFAUTS_FRISE.groupBy`, conversion des Y dans les
  dessinateurs, `MoteurFrise.dessinerEntetesGroupes`, absorption de
  `MoteurFrise.visibles` dans `placerLignes`.
- `styles.css` : `.zfa-gantt-bandes`, `.zfa-gantt-bande-groupe`,
  `.zfa-gantt-bande-compte`.
- `tests/regroupement.test.js` : neuf.
- `tests/placement.test.js` : neuf (ou fusionné au précédent).

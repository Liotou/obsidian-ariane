# Mise au propre de `main.js` — Étape 1 — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Découper `main.js` (16 558 lignes, un seul fichier) en sections `//#region` explicites et ordonnées, avec une carte du fichier en tête, sans changer une ligne de comportement.

**Architecture:** Reshuffle pur d'un unique fichier CommonJS chargé tel quel par Obsidian. Aucun build, aucune dépendance. On déplace des définitions entières (fonctions top-level, membres de classe) sous des bandeaux de section ; on ne modifie jamais le corps d'une fonction ni d'une méthode. Filet de sécurité : `node --check` + les 184 tests + un invariant « ensemble des identifiants définis inchangé ».

**Tech Stack:** Node.js (tests via `node --test`), pas de bundler.

**Spec:** `docs/superpowers/specs/2026-08-31-mise-au-propre-main-design.md` — à lire avec ce plan.

## Global Constraints

- Un seul fichier `main.js`. Aucun build, aucune dépendance, aucun `package.json`.
- Aucun renommage (fonction, méthode, classe, constante, variable). Aucun corps modifié.
- Aucun changement de comportement. Aucune correction de bug « au passage » — les suspects vont dans le journal.
- Tests : **184 pass / 0 fail** à chaque commit. Fichiers de `tests/` **non modifiés**.
- `styles.css`, `manifest.json`, `versions.json` : **non modifiés**.
- Un commit = une region (ou un lot de petites régions de même forme). Jamais deux régions de fond dans un commit.
- Chaque commit fait explicitement `git add main.js` (+ `docs/...` quand la tâche l'indique). Ne jamais `git add -A` : les fichiers baseline sous `.superpowers/` restent non suivis.
- Ne pas pousser, ne pas taguer, ne pas fusionner.
- Ne **pas** copier vers le vault avant la phase G.
- Messages de commit terminés par `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Convention de region : voir la spec, section « Convention de section ». `//#region N · Titre` / `//#endregion N · Titre` mot pour mot, bandeau `═`, sous-régions de classe en `──` indentées.

## Procédure de vérification (identique pour presque toutes les tâches)

`VERIF` = la séquence suivante, à exécuter avant chaque commit :

```bash
node --check main.js
node --test tests/*.test.js 2>&1 | grep -E '^# (tests|pass|fail)'
# attendu : # tests 184 / # pass 184 / # fail 0

node -e "const A=require('./tests/obsidian-factice.js'); \
 const s=x=>Object.getOwnPropertyNames(x).sort().join('\n'); \
 console.log('=STATIC=\n'+s(A)); \
 console.log('=PROTO=\n'+s(A.prototype)); \
 console.log('=TEST=\n'+Object.keys(A._test||{}).sort().join('\n'))" > .superpowers/mise-au-propre/api-now.txt
grep -oE '^(async )?function [A-Za-z0-9_]+' main.js | sort -u > .superpowers/mise-au-propre/fns-now.txt

diff .superpowers/mise-au-propre/api-baseline.txt .superpowers/mise-au-propre/api-now.txt
diff .superpowers/mise-au-propre/fns-baseline.txt .superpowers/mise-au-propre/fns-now.txt
# attendu : les deux diff VIDES
```

Si un `diff` n'est pas vide, ou si un test échoue : **ne pas committer**, réparer d'abord. Un `diff` non vide signifie qu'une définition a été perdue, dupliquée ou renommée par accident.

`git diff --stat` du commit doit montrer quasi exclusivement des déplacements (mêmes lignes, position différente, au plus ré-indentées).

---

### Task 1 : Baselines + journal des suspects

**Files:**
- Create: `.superpowers/mise-au-propre/api-baseline.txt` (non suivi)
- Create: `.superpowers/mise-au-propre/fns-baseline.txt` (non suivi)
- Create: `docs/conception/2026-08-31-mise-au-propre-main-suspects.md`

**Interfaces:**
- Produces: les deux fichiers baseline que toutes les tâches suivantes utilisent dans `VERIF`.

- [ ] **Step 1 : créer le dossier de travail**

```bash
mkdir -p .superpowers/mise-au-propre
```

- [ ] **Step 2 : capturer l'invariant d'API**

```bash
node -e "const A=require('./tests/obsidian-factice.js'); \
 const s=x=>Object.getOwnPropertyNames(x).sort().join('\n'); \
 console.log('=STATIC=\n'+s(A)); \
 console.log('=PROTO=\n'+s(A.prototype)); \
 console.log('=TEST=\n'+Object.keys(A._test||{}).sort().join('\n'))" > .superpowers/mise-au-propre/api-baseline.txt
grep -oE '^(async )?function [A-Za-z0-9_]+' main.js | sort -u > .superpowers/mise-au-propre/fns-baseline.txt
```

Vérifier que les deux fichiers sont non vides (`wc -l` > 0). `api-baseline.txt` doit contenir les trois sections `=STATIC=`, `=PROTO=`, `=TEST=` avec des noms sous chacune.

- [ ] **Step 3 : écrire le squelette du journal des suspects**

`docs/conception/2026-08-31-mise-au-propre-main-suspects.md` :

```markdown
# Suspects relevés pendant la mise au propre de `main.js`

Choses repérées pendant le reshuffle (étape 1) et **délibérément non corrigées** :
bugs possibles, code mort, incohérences. À trancher dans une itération dédiée.

Format : un `##` par suspect, avec chemin + ligne (au moment du repérage),
ce qui cloche, pourquoi on n'y touche pas maintenant.

---

_(rien pour l'instant)_
```

- [ ] **Step 4 : vérifier que rien n'a bougé**

```bash
node --test tests/*.test.js 2>&1 | grep -E '^# (tests|pass|fail)'
git status --porcelain
```

Attendu : 184 / 184 / 0. `git status` montre `docs/conception/2026-08-31-mise-au-propre-main-suspects.md` en nouveau fichier suivi-able et le dossier `.superpowers/mise-au-propre/` non suivi.

- [ ] **Step 5 : commit**

```bash
git add docs/conception/2026-08-31-mise-au-propre-main-suspects.md
git commit -m "Mise au propre : journal des suspects + invariant d'API (baseline)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2 : Region 1 — Constantes & i18n

**Files:**
- Modify: `main.js` (haut du fichier, ~lignes 41–1162)

**Contenu de la region** (déjà en tête de fichier, il s'agit surtout de baliser) : `FENETRE_ECRITURE_MS`, `DELAI_ANTIREBOND_MS`, `TEXTES`, `LANGUE`, `definirLangue`, `tr`, `DEFAULT_SETTINGS`.

- [ ] **Step 1 : repérer les bornes**

```bash
grep -n "^const FENETRE_ECRITURE_MS\|^const TEXTES\|^let LANGUE\|^function definirLangue\|^function tr\|^const DEFAULT_SETTINGS\|^function echapperRegex" main.js
```

La region va de `const FENETRE_ECRITURE_MS` jusqu'à la ligne juste avant `function echapperRegex` (première fonction de la region 2). Vérifier qu'il n'y a rien d'autre entre les deux qui appartienne à un autre domaine ; si oui, le laisser à sa place (il sera pris dans sa region plus tard) ou le noter.

- [ ] **Step 2 : insérer les marqueurs**

Juste avant `const FENETRE_ECRITURE_MS` (après le `require('obsidian')`) :

```js
//#region 1 · Constantes & i18n
// ═══════════════════════════════════════════════════════════════════════════
//  1 · CONSTANTES & I18N
//  Délais globaux, table de traduction (le français sert de clé), réglages
//  par défaut du greffon.
// ═══════════════════════════════════════════════════════════════════════════
```

Juste avant `function echapperRegex` :

```js
//#endregion 1 · Constantes & i18n

//#region 2 · Utilitaires génériques
```

(le bandeau de la region 2 sera complété en Task 3 ; pour l'instant poser au moins le `//#region`)

- [ ] **Step 3 : `VERIF`** (voir en tête de plan). Les deux `diff` vides, 184 / 0.

- [ ] **Step 4 : commit**

```bash
git add main.js
git commit -m "Mise au propre : region 1 · Constantes & i18n

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3 : Region 2 — Utilitaires génériques

**Files:**
- Modify: `main.js`

**But :** rassembler sous la region 2 les petits helpers chaîne / date / format **sans domaine propre**, aujourd'hui dispersés entre les lignes ~1163 et ~2360. Candidats (liste indicative, cf. spec) : `echapperRegex`, `sansLien`, `sansAccents`, `normDoi`, `jourIsoDe`, `horodatageNC`, `dureeLisible`, `enumererFrancais`, `nomCouleur` / `COULEURS_ZOTERO` si générique, `valeurLisible` si générique.

**Règle de tri (spec) :** une fonction utilisée par **un seul** domaine part avec ce domaine ; une fonction utilisée par **plusieurs** domaines (ou aucun clairement) reste ici. En cas d'hésitation, laisser la fonction où elle est et la noter — ne pas forcer.

- [ ] **Step 1 : inventaire**

```bash
grep -nE '^(const|function|async function) ' main.js | sed -n '1,120p'
```

Pour chaque candidat, compter les appelants :

```bash
grep -c '\bnomFonction\b' main.js
```

et repérer dans quelles régions ils tombent.

- [ ] **Step 2 : déplacer les helpers réellement transverses** juste sous le `//#region 2`, dans l'ordre alphabétique ou par parenté. Déplacer la **définition entière** (du commentaire qui la précède jusqu'à son `}` fermant). Ne rien changer dans le corps.

- [ ] **Step 3 : compléter le bandeau de la region 2**

```js
//#region 2 · Utilitaires génériques
// ═══════════════════════════════════════════════════════════════════════════
//  2 · UTILITAIRES GÉNÉRIQUES
//  Petits helpers chaîne / date / format sans domaine propre, partagés par
//  plusieurs sections.
// ═══════════════════════════════════════════════════════════════════════════
```

Fermer par `//#endregion 2 · Utilitaires génériques` avant la première fonction de la region 3.

- [ ] **Step 4 : `VERIF`**. Les deux `diff` vides (l'ordre a changé, pas l'ensemble). 184 / 0.

- [ ] **Step 5 : commit** — `git add main.js` ; message `Mise au propre : region 2 · Utilitaires génériques` + trailer.

---

### Task 4 : Region 3 — Références Zotero (parsing & appariement)

**Files:**
- Modify: `main.js`

**Contenu** (cf. spec, region 3) : `parseNomReference`, `parseAuteurSeul`, `compilerProfils`, `nomCompletAuteur`, `normaliserConjAuteurs`, `surnamesReference`, `appariementSource`, `candidatsSource`, `cibleDeReference`, `migrerCorrespondances`, `cleLibelle`, `titreCredible`, `titreDansReference`, `cleOeuvre`, `nomOeuvreDetachee`, `trouverSourceZotero`, `refDepuisNomAttente`, `refsDepuisCrossref`, `refsDepuisOpenAlexWorks`, `separerNomPrenom`, `nomFamille`, `construireReference`.

- [ ] **Step 1 :** localiser chaque fonction (`grep -n '^function <nom>' main.js`). Certaines sont déjà groupées (~1279–2160), d'autres non.
- [ ] **Step 2 :** poser `//#region 3 · Références Zotero — parsing & appariement` + bandeau (description : « Analyse des noms d'auteurs, appariement d'une référence à une entrée Zotero, import Crossref / OpenAlex, construction d'une note référence. ») au début du bloc.
- [ ] **Step 3 :** déplacer sous cette region les fonctions listées qui sont hors du bloc, définitions entières, corps intacts.
- [ ] **Step 4 :** `//#endregion 3 · …` avant la première fonction de la region 4.
- [ ] **Step 5 : `VERIF`**. Diffs vides, 184 / 0.
- [ ] **Step 6 : commit** — `git add main.js` ; `Mise au propre : region 3 · Références Zotero` + trailer.

---

### Task 5 : Region 4 — Similarité locale (TF-IDF & vecteurs)

**Files:**
- Modify: `main.js`

**Contenu :** `MOTS_VIDES`, `tokeniser`, `frequenceTermes`, `calculerIdf`, `vecteurTfIdf`, `cosinusTfIdf`, `hacherTexte`, `normaliserVecteur`, `cosinusVecteurs` (~1449–1544).

- [ ] **Step 1 :** ces fonctions sont déjà contiguës. Vérifier les bornes (`grep -n`).
- [ ] **Step 2 :** poser `//#region 4 · Similarité locale (TF-IDF & vecteurs)` + bandeau (description : « Tokenisation, TF-IDF, similarité cosinus — utilisées par les suggestions de voisinage locales. ») et `//#endregion` autour du bloc. Déplacer les rares fonctions de la liste qui seraient hors du bloc.
- [ ] **Step 3 : `VERIF`**. Diffs vides, 184 / 0.
- [ ] **Step 4 : commit** — `Mise au propre : region 4 · Similarité locale (TF-IDF)` + trailer.

---

### Task 6 : Region 5 — Notes atomiques

**Files:**
- Modify: `main.js`

**Contenu :** `estNoteDeDonnees`, `extraireNotesFilles`, `titreDeNoteFille`, `citationsZotflowVersAriane`, `finDeSpanApparie`, `titreDeRepli`, `extraireBlocs`, `construireNote`, `analyserCarte`, `rangesNotesOrphelines`, `appliquerModele`.

- [ ] **Step 1 :** localiser (plusieurs sont vers 1544–1809 et 2032–2140 et 2769).
- [ ] **Step 2 :** `//#region 5 · Notes atomiques` + bandeau (« Détection des notes de données, extraction des blocs d'une source, construction d'une note atomique, parsing des cartes mentales. »).
- [ ] **Step 3 :** regrouper les fonctions listées sous la region, corps intacts. `analyserCarte` (~2769) est loin : la remonter ici.
- [ ] **Step 4 :** `//#endregion 5 · …`.
- [ ] **Step 5 : `VERIF`**. Diffs vides, 184 / 0.
- [ ] **Step 6 : commit** — `Mise au propre : region 5 · Notes atomiques` + trailer.

---

### Task 7 : Region 6 — Bibliographie

**Files:**
- Modify: `main.js`

**Contenu :** marqueurs `ZFA_BIBLIO_DEBUT`/`ZFA_BIBLIO_FIN`, `auteurBiblio`, `listeAuteursBiblio`, `entreeBiblio`, `nettoyerEntreeBiblio`, `entreeCliquable`, `construireBibliographie`, `injecterBibliographie`, `prefixeCommun`, `valeurLisible`, `cleDeLien`, `corpsCitable`, `rafraichirLibelles`, `composerCitation`, `citationsDuTexte`, `ZFA_RE_CITATION` (~2360–2711).

- [ ] **Step 1 :** bornes (`grep -n`). Bloc déjà assez contigu.
- [ ] **Step 2 :** `//#region 6 · Bibliographie` + bandeau (« Marqueurs de bloc biblio, formatage d'une entrée, construction et injection de la bibliographie, composition d'une citation. »). `//#endregion` avant la region 7.
- [ ] **Step 3 :** si `valeurLisible` / `cleDeLien` sont en fait transverses, les laisser en region 2 (cf. règle de tri) et le noter.
- [ ] **Step 4 : `VERIF`**. Diffs vides, 184 / 0.
- [ ] **Step 5 : commit** — `Mise au propre : region 6 · Bibliographie` + trailer.

---

### Task 8 : Region 7 — Export Pandoc / Word

**Files:**
- Modify: `main.js`

**Contenu :** `ZFA_RE_CIT_GROUPE`, `citationsEnLigneVersPandoc`, `preparerMarkdownExport`, `normaliserBlocsPandoc`, `insecablesFrancais`, `MARQUE_ENCADRE_DEBUT`/`FIN`, `encadresVersPandoc`, `footnotesVersCitations`, et les helpers de phrase `masquerLiens`, `finDePhrase`, `finDePhraseAvantPonct`, `debutPhrase` **s'ils ne servent qu'à l'export** (sinon region 2, à noter).

- [ ] **Step 1 :** localiser (~1405–1434 pour les helpers de phrase, ~2975–3205 pour le gros du bloc). Compter les appelants de `masquerLiens`/`finDePhrase*`/`debutPhrase` pour décider region 7 vs region 2.
- [ ] **Step 2 :** `//#region 7 · Export Pandoc / Word` + bandeau (« Conversion du markdown Obsidian vers un markdown Pandoc : citations en ligne, encadrés, notes de bas de page, insécables français. »). `//#endregion` avant la region 8.
- [ ] **Step 3 :** déplacer le contenu, corps intacts.
- [ ] **Step 4 : `VERIF`**. Diffs vides, 184 / 0.
- [ ] **Step 5 : commit** — `Mise au propre : region 7 · Export Pandoc / Word` + trailer.

---

### Task 9 : Region 8 — Schémas mxgraph / draw.io

**Files:**
- Modify: `main.js`

**Contenu :** `ZFA_SCHEMA_DEBUT`/`FIN`, `texteNoeud`, `deshtmlMx`, `texteBrutMx`, `attrsMx`, `parserMxGraph`, `decompresserDiagramme`, `pagesDepuisDrawio`, `propagerEtiquettes`, `normEtiquette`, `polariteEtiquette`, `relationDeEtiquette`, `extraitSchema`, `injecterExtrait` (~2160–2769 et ~2711–2769).

- [ ] **Step 1 :** localiser. Bloc déjà assez contigu (~2160–2340).
- [ ] **Step 2 :** `//#region 8 · Schémas mxgraph / draw.io` + bandeau (« Parsing d'un diagramme draw.io / mxGraph, propagation des étiquettes de relation, extrait de schéma injecté dans une note. »). `//#endregion` avant la region 9.
- [ ] **Step 3 :** déplacer, corps intacts.
- [ ] **Step 4 : `VERIF`**. Diffs vides, 184 / 0.
- [ ] **Step 5 : commit** — `Mise au propre : region 8 · Schémas mxgraph` + trailer.

---

### Task 10 : Regions 9 & 10 — Doublons d'auteurs + Modèles de bases

**Files:**
- Modify: `main.js`

**Region 9 — Doublons d'auteurs :** `normNom`, `tokensNom`, `surnameKey`, `memePersonne`, `meilleurCanonique`, `clustersDoublons`, `ajouterTravail`, `ordonnerPages`, `rendreGrappe`, `titreSansNumerotation`, `enumererFrancais` si propre à ce domaine (~2820–2975).

**Region 10 — Modèles de bases & marqueurs de tâche :** `BASE_TACHES`, `VUE_ARTICULATION_BASE`, `ZFA_TACHE_DEBUT`/`FIN` (~2380–2496).

- [ ] **Step 1 :** localiser les deux blocs.
- [ ] **Step 2 :** poser `//#region 9 · Doublons d'auteurs` + bandeau (« Normalisation de noms, détection de personnes identiques, regroupement des œuvres d'un même auteur. ») et `//#region 10 · Modèles de bases & marqueurs de tâche` + bandeau (« Gabarits `Tâches.base` et vue articulation, marqueurs de bloc `%% ariane:tache %%`. »), chacun avec son `//#endregion`.
- [ ] **Step 3 :** l'ordre du fichier suit la spec : region 9 puis region 10, toutes deux **avant** `class Ariane`. Déplacer les blocs si besoin. Corps / chaînes gabarits **strictement** intacts (attention aux `\`` et `${}` dans `BASE_TACHES`).
- [ ] **Step 4 : `VERIF`** — attention particulière au `node --check` (chaînes gabarits) et au fait que `BASE_TACHES` est un `const` : s'il est déplacé après un `const` qui le référence, TDZ au `require` des tests. Diffs vides, 184 / 0.
- [ ] **Step 5 : commit** — `Mise au propre : regions 9–10 · Doublons d'auteurs, modèles de bases` + trailer.

---

### Task 11 : Region 11 — `class Ariane` : bandeau + sous-régions cycle de vie / commandes / événements

**Files:**
- Modify: `main.js` (~3205–10863)

**Interfaces:**
- Consumes: rien de neuf.
- Produces: le squelette de sous-régions de `class Ariane` que les Tasks 12–13 remplissent.

- [ ] **Step 1 :** poser juste avant `class Ariane extends obsidian.Plugin {` :

```js
//#region 11 · class Ariane
// ═══════════════════════════════════════════════════════════════════════════
//  11 · CLASS ARIANE  (extends obsidian.Plugin)
//  Le greffon lui-même. Sous-régions : cycle de vie · commandes · événements ·
//  helpers static (par domaine) · méthodes d'instance (par domaine).
// ═══════════════════════════════════════════════════════════════════════════
```

et `//#endregion 11 · class Ariane` juste après le `}` de fin de classe (avant `class ArianeSettingTab`).

- [ ] **Step 2 :** identifier les membres du **cycle de vie** : ce que le `constructor` initialise (s'il existe), `onload`, `onunload`. Les regrouper en tête du corps de classe sous :

```js
  //#region Ariane · cycle de vie
  // ── cycle de vie ─────────────────────────────────────────────────────────
```
`//#endregion Ariane · cycle de vie` après.

- [ ] **Step 3 :** identifier tous les `this.addCommand({...})` — souvent dans une méthode dédiée (`enregistrerCommandes` ou dans `onload`). **Ne pas extraire** de `onload` ce qui y est en ligne ; se contenter de baliser la méthode qui les porte si elle existe. Si les commandes sont éparpillées dans plusieurs méthodes, poser la sous-région `Ariane · commandes` autour de la ou des méthodes concernées, sans déplacer de code hors d'une méthode.
- [ ] **Step 4 :** idem pour les **événements** (`registerEvent`, handlers `metadataCache.on('changed')`, `vault.on('create')`, etc.) → sous-région `Ariane · événements`.
- [ ] **Step 5 :** ne **rien** changer dans les corps. Seuls l'ordre des membres et les lignes `//#region`/`//#endregion`/`//` de bandeau sont ajoutés.
- [ ] **Step 6 : `VERIF`**. `=PROTO=` inchangé (mêmes méthodes), diffs vides, 184 / 0.
- [ ] **Step 7 : commit** — `Mise au propre : region 11 · class Ariane (cycle de vie, commandes, événements)` + trailer.

---

### Task 12 : Region 11 — `class Ariane` : helpers `static` regroupés par domaine

**Files:**
- Modify: `main.js`

**But :** rassembler les ~90 méthodes `static` de `class Ariane` en sous-régions, **sans les sortir de la classe** et **sans toucher un seul corps**. Ordre des sous-régions (cf. spec) :

1. `Ariane · static · getters` — `CLES_MACHINE`, `CLES_ETAT`, `TYPE_FR_VERS_OBSIDIAN`, `PROPS_GENERIQUES`, `CONCEPTS_TACHE`, `COULEURS_GANTT`, `ZOOMS_GANTT`, `SANS_GROUPE`
2. `Ariane · static · références` — `normaliserEntree`, `normaliserBiblio`, `entreeDansTexte`, `fondreOeuvresProches`, `premier`, `referenceTacheSuivante`
3. `Ariane · static · dates & jours` — `jourValide`, `_versUTC`, `decalerJour`, `ecartJours`, `semaineIso`
4. `Ariane · static · tâches` — `champTache`, `familleTache`, `proprietesManquantes`, `yamlChaine`, `corpsNouvelleTache`, `livrableOuFichier`, `refDeLien`, `refDepuisChemin`, `filtrerTaches`, `achevementAEcrire`, `blocTache`, `libelleNote`, `libelleSource`
5. `Ariane · static · frise / gantt` — `disposerGantt`, `disposerFriseGroupee`, `placerLignes`, `repartirSansDate`, `_sousArbre`, `decalerSousArbre`, `cascadeAval`, `etendueGantt`, `typeProprieteBase`, `_sansAccentMinuscule`
6. `Ariane · static · articulation` — `cyclesDe`, `datesIncoherentes`, `grapheArticulation`, `placerGraphe`, `lienValide`, `_cheminFleche`

Toute `static` non listée : la ranger dans la sous-région la plus proche par thème et le noter dans le compte-rendu de tâche.

- [ ] **Step 1 :** lister toutes les `static` et leurs bornes :

```bash
awk 'NR>=3205 && NR<=10863 && /^  static /{print NR": "$0}' main.js
```

Pour chacune, repérer la ligne de début (commentaire précédent inclus) et la ligne de `}` fermante à l'indentation `  }`.

- [ ] **Step 2 :** créer les 6 sous-régions, dans l'ordre ci-dessus, **juste après** la sous-région `Ariane · événements` et **avant** la première méthode d'instance. Bandeau `──` pour chacune, `//#region Ariane · static · <nom>` / `//#endregion Ariane · static · <nom>`.
- [ ] **Step 3 :** déplacer chaque `static` (définition entière, commentaire d'en-tête compris) dans sa sous-région. Ne rien réécrire.
- [ ] **Step 4 : `VERIF`**. `=STATIC=` **strictement** inchangé. `=TEST=` inchangé. Diffs vides. 184 / 0. Lancer aussi une fois de plus la suite complète (`node --test tests/*.test.js`) car beaucoup de tests portent sur ces statics.
- [ ] **Step 5 : commit** — `Mise au propre : region 11 · class Ariane (helpers static par domaine)` + trailer.

---

### Task 13 : Region 11 — `class Ariane` : méthodes d'instance regroupées par domaine

**Files:**
- Modify: `main.js`

**But :** regrouper les méthodes d'instance en sous-régions thématiques, dans l'ordre de la spec (sous-régions 10–18) : `réglages` · `index & Zotero` · `références en attente` · `notes atomiques` · `bibliographie` · `export` · `suggestions` · `tâches` · `rendu des vues natives`. Aucun corps modifié. L'affectation d'une méthode à une sous-région est au jugement de l'exécutant ; principe : « regrouper ce qui se lit ensemble ».

**Cette tâche est la plus lourde. La faire en 3 commits** (un par lot de sous-régions), chacun passant `VERIF` :

- [ ] **Commit 13a — `réglages` + `index & Zotero` + `références en attente`.**
  - Lister les méthodes d'instance (`awk 'NR>=DEB && NR<=FIN && /^  [A-Za-z_][A-Za-z0-9_]*\(/'` en excluant `static`).
  - Poser les 3 sous-régions après la dernière sous-région `static`. Déplacer les méthodes concernées.
  - `VERIF` (`=PROTO=` inchangé, diffs vides, 184 / 0). Commit : `Mise au propre : region 11 · class Ariane (méthodes — réglages, Zotero, réf. en attente)` + trailer.
- [ ] **Commit 13b — `notes atomiques` + `bibliographie` + `export` + `suggestions`.**
  - 4 sous-régions, déplacer les méthodes. `VERIF`. Commit : `… (méthodes — notes atomiques, biblio, export, suggestions)` + trailer.
- [ ] **Commit 13c — `tâches` + `rendu des vues natives` + reliquat.**
  - 2 sous-régions. Toute méthode non classée ailleurs atterrit ici, dans une sous-région `Ariane · divers` en dernier, et est listée dans le compte-rendu.
  - `VERIF`. Vérifier qu'entre la fin de la dernière méthode et le `}` de classe il ne reste que des `//#endregion`. Commit : `… (méthodes — tâches, rendu des vues, divers)` + trailer.

---

### Task 14 : Region 12 — `ArianeSettingTab`

**Files:**
- Modify: `main.js` (~10864–12250)

- [ ] **Step 1 :** poser `//#region 12 · ArianeSettingTab` + bandeau (« Onglet de réglages. Une sous-région par onglet. ») avant `class ArianeSettingTab`, `//#endregion` après son `}`.
- [ ] **Step 2 :** identifier les méthodes : `display`, les `ongletXxx(...)` (`ongletGeneral`, `ongletZotero`, `ongletTaches`, …), et les helpers privés (`_section`, `_aide`, `_tableFamillesTaches`, …).
- [ ] **Step 3 :** sous-régions dans cet ordre : `SettingTab · display` (le routeur `display()`), puis une sous-région par `ongletXxx` dans l'ordre où `display()` les appelle, puis `SettingTab · helpers`. Déplacer les méthodes, corps intacts.
- [ ] **Step 4 : `VERIF`**. `ArianeSettingTab` n'est pas exporté pour les tests, donc l'invariant d'API ne le couvre pas : redoubler de vigilance sur `git diff` (déplacements purs) et `node --check`. 184 / 0.
- [ ] **Step 5 : commit** — `Mise au propre : region 12 · ArianeSettingTab` + trailer.

---

### Task 15 : Region 13 — Modales de tâche

**Files:**
- Modify: `main.js` (~12251–12662)

**Contenu :** `ConfirmationRattachement`, `ChoixSourceModal`, `ModaleTache`, `ModaleDaterTache`.

- [ ] **Step 1 :** `//#region 13 · Modales de tâche` + bandeau (« Confirmation de rattachement, choix de source Zotero, formulaire de tâche (création + édition), saisie de dates. ») ; `//#endregion` avant `const TYPE_VUE_REFS`.
- [ ] **Step 2 :** s'assurer que les 4 classes sont contiguës dans cet ordre. Déplacer si besoin (classe entière, du commentaire d'en-tête au `}` final). Corps intacts.
- [ ] **Step 3 : `VERIF`**. `node --check`, `git diff` = déplacements, 184 / 0.
- [ ] **Step 4 : commit** — `Mise au propre : region 13 · Modales de tâche` + trailer.

---

### Task 16 : Region 14 — Vue Frise

**Files:**
- Modify: `main.js` (~12662–14695)

**Contenu :** `TYPE_VUE_REFS`, `TYPE_VUE_INCOHERENCES`, `TYPE_VUE_BASE_FRISE`, `TYPE_VUE_BASE_ARTIC` (constantes de type de vue — les garder groupées ici, en tête de region 14, même si `TYPE_VUE_BASE_ARTIC` sert à la region 15), `DEFAUTS_FRISE`, `HAUTEUR_ENTETE_GANTT`, `JOURS_MINIMUM_GANTT`, `MOIS_COURTS`, `MOIS_LETTRES`, `svgEl`, `class MoteurFrise`, `fabriquerVueFriseBase`.

- [ ] **Step 1 :** `//#region 14 · Vue Frise` + bandeau (« Constantes de type de vue, moteur de rendu de la frise Gantt, fabrique de la vue Bases `ariane-frise`. »). `//#endregion` avant `const ARTIC_W`.
- [ ] **Step 2 :** contenu déjà quasi contigu ; poser les marqueurs, remonter `svgEl` juste avant `class MoteurFrise` s'il ne l'est pas.
- [ ] **Step 3 : `VERIF`**. `node --check`, `git diff` = déplacements, 184 / 0 (des tests portent sur `MoteurFrise` / `placerGraphe` via statics — déjà couverts — mais relancer la suite).
- [ ] **Step 4 : commit** — `Mise au propre : region 14 · Vue Frise` + trailer.

---

### Task 17 : Region 15 — Vue Articulation

**Files:**
- Modify: `main.js` (~14695–15687)

**Contenu :** `ARTIC_W`, `ARTIC_H`, `GRILLE_ARTIC`, `SEUIL_AIMANT`, `ANCRE_ECART`, `ancreY`, `class MoteurArticulation`, `fabriquerVueArticulationBase`.

- [ ] **Step 1 :** `//#region 15 · Vue Articulation` + bandeau (« Constantes de carte, ancrage magnétique, moteur d'articulation (hiérarchie / blocages), fabrique de la vue Bases `ariane-articulation`. »). `//#endregion` avant `class VueIncoherencesTaches`.
- [ ] **Step 2 :** contenu déjà contigu ; poser les marqueurs.
- [ ] **Step 3 : `VERIF`**. `node --check`, `git diff` = déplacements, 184 / 0.
- [ ] **Step 4 : commit** — `Mise au propre : region 15 · Vue Articulation` + trailer.

---

### Task 18 : Regions 16–18 — Vues latérales, modales secondaires, exports

**Files:**
- Modify: `main.js` (~15687–16558)

**Region 16 — Vues latérales `ItemView` :** `VueIncoherencesTaches`, `VueReferencesAttente`, `VueSuggestionsZotflow`.
**Region 17 — Modales secondaires :** `ChoixListeModal`, `RapportCarteModal`, `TexteModal`, `VoisinageModal`, `StylesModeleModal`, `FusionAuteursModal`.
**Region 18 — Exports :** `module.exports = Ariane`, `module.exports._test = { … }`.

- [ ] **Step 1 :** poser les 3 `//#region` + bandeaux (16 : « Vues latérales : incohérences de tâches, références en attente, suggestions de voisinage. » ; 17 : « Modales secondaires : choix de liste, rapports, voisinage, styles de modèle, fusion d'auteurs. » ; 18 : « Points d'entrée CommonJS : la classe du greffon et la surface `_test` pour la suite de tests. »).
- [ ] **Step 2 :** s'assurer que l'ordre est 16 → 17 → 18. `module.exports` reste tout en bas. Déplacer les classes mal placées, corps intacts.
- [ ] **Step 3 :** `//#endregion` pour chacune ; le `//#endregion 18 · Exports` est la dernière ligne du fichier.
- [ ] **Step 4 : `VERIF`**. `=STATIC=` / `=PROTO=` / `=TEST=` **tous** inchangés (region 18 touche justement `_test` — vérifier au caractère près que la liste des clés `_test` est identique). 184 / 0.
- [ ] **Step 5 : commit** — `Mise au propre : regions 16–18 · Vues latérales, modales secondaires, exports` + trailer.

---

### Task 19 : Carte du fichier (table des matières) + finalisation des docs

**Files:**
- Modify: `main.js` (en-tête, ~lignes 3–39)
- Modify: `docs/conception/2026-08-31-mise-au-propre-main-suspects.md` (retirer le `_(rien pour l'instant)_` si des suspects ont été ajoutés ; sinon laisser)

- [ ] **Step 1 :** dans le bloc de commentaire d'en-tête existant (`/* Ariane … */`), **après** la ligne `* ATTENTION : …` et avant la fermeture `*/`, ajouter une section :

```
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CARTE DU FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 * Un seul fichier, AUCUN build : Obsidian charge ce main.js tel quel.
 * Copie vers le coffre : cp main.js styles.css manifest.json <plugin>/
 * Chaque section est délimitée par  //#region N · Titre … //#endregion.
 *
 *    1 · Constantes & i18n
 *    2 · Utilitaires génériques
 *    3 · Références Zotero — parsing & appariement
 *    4 · Similarité locale (TF-IDF & vecteurs)
 *    5 · Notes atomiques
 *    6 · Bibliographie
 *    7 · Export Pandoc / Word
 *    8 · Schémas mxgraph / draw.io
 *    9 · Doublons d'auteurs
 *   10 · Modèles de bases & marqueurs de tâche
 *   11 · class Ariane   (cycle de vie · commandes · événements · static/domaine · méthodes/domaine)
 *   12 · ArianeSettingTab   (une sous-région par onglet)
 *   13 · Modales de tâche
 *   14 · Vue Frise
 *   15 · Vue Articulation
 *   16 · Vues latérales (ItemView)
 *   17 · Modales secondaires
 *   18 · Exports
 *
 * Conception : docs/superpowers/specs/2026-08-31-mise-au-propre-main-design.md
 * Suspects relevés : docs/conception/2026-08-31-mise-au-propre-main-suspects.md
 * ─────────────────────────────────────────────────────────────────────────
```

- [ ] **Step 2 :** vérifier que l'ordre listé correspond **exactement** à l'ordre réel des `//#region` dans le fichier :

```bash
grep -n '^//#region [0-9]' main.js
```

Corriger la carte si un écart apparaît.

- [ ] **Step 3 : `VERIF`**. `node --check` (le bloc est un commentaire, mais vérifier qu'on n'a pas cassé le `*/`). 184 / 0. Diffs vides.
- [ ] **Step 4 : commit** — `git add main.js docs/conception/2026-08-31-mise-au-propre-main-suspects.md` ; `Mise au propre : carte du fichier en tête + journal des suspects` + trailer.

---

### Task 20 : Relecture finale (phase G)

**Files:** aucune modification directe — cette tâche produit un rapport et, si besoin, **un seul** lot de correctifs.

- [ ] **Step 1 :** générer le diff complet de la branche :

```bash
git diff taches-par-dossier..HEAD -- main.js > .superpowers/mise-au-propre/diff-total.txt
git diff --stat taches-par-dossier..HEAD
```

- [ ] **Step 2 :** relecture (cf. spec, section « Relecture finale ») :
  1. **Aucun changement de comportement** — chaque hunk est un déplacement ; repérer toute ligne de logique ajoutée / retirée / modifiée (au-delà de l'indentation et des lignes `//#region`/`//#endregion`/bandeaux).
  2. **Aucune définition perdue ou dupliquée** — recouper avec :
     ```bash
     node -e "const A=require('./tests/obsidian-factice.js'); \
      const s=x=>Object.getOwnPropertyNames(x).sort().join('\n'); \
      console.log(s(A)); console.log('---'); console.log(s(A.prototype)); \
      console.log('---'); console.log(Object.keys(A._test||{}).sort().join('\n'))" \
      > .superpowers/mise-au-propre/api-final.txt
     diff .superpowers/mise-au-propre/api-baseline.txt .superpowers/mise-au-propre/api-final.txt
     ```
     + `grep -c '^//#region ' main.js` == `grep -c '^//#endregion ' main.js` (et pour les sous-régions indentées : `grep -c '^  //#region ' main.js` == `grep -c '^  //#endregion ' main.js`).
  3. **Marqueurs bien formés** — chaque `//#region X` a un `//#endregion X` au libellé identique ; la carte du fichier (Task 19) liste les régions dans l'ordre réel ; aucune region imbriquée par erreur au premier niveau.
  4. **Tests** — `node --check main.js` OK ; `node --test tests/*.test.js` = 184 / 0.
  5. **Journal des suspects** — cohérent, chaque entrée a chemin + raison de non-correction ; `git log -p` de la branche ne contient **aucune** correction de logique.

- [ ] **Step 3 :** écrire le rapport dans `.superpowers/mise-au-propre/relecture.md` : constats classés (bloquant / à corriger / observation), avec chemin + ligne.

- [ ] **Step 4 :** s'il y a des constats « bloquant » ou « à corriger » : **un seul** commit de correctifs (`Mise au propre : correctifs post-relecture` + trailer), puis re-`VERIF` + re-vérifier les points 2 et 3 ci-dessus sur le diff de ce commit uniquement.

- [ ] **Step 5 :** une fois la relecture propre — copie vers le coffre :

```bash
cp main.js styles.css manifest.json "/Users/equiriconi/Obsidian Vault/.obsidian/plugins/obsidian-ariane/"
```

(rappel : `styles.css` et `manifest.json` sont inchangés depuis `taches-par-dossier` ; on les recopie par cohérence du trio.)

- [ ] **Step 6 :** compte-rendu à l'utilisateur : régions créées, ce qui a bougé, suspects relevés (avec le chemin du journal), état de la branche `mise-au-propre-main` (non fusionnée, non poussée), et rappel qu'il doit recharger Ariane dans Obsidian puis faire un tour manuel (base Tâches, frise, articulation, réglages, création de tâche, export d'un document) avant toute fusion.

---

## Self-review (à faire après rédaction du plan)

- **Couverture spec :** regions 1–18 + `class Ariane` sous-régions + `ArianeSettingTab` sous-régions + invariant d'API + phases A–G + relecture finale + journal des suspects + copie vault différée → toutes présentes (Tasks 1–20).
- **Placeholders :** aucun « TODO / à compléter » ; les listes de fonctions sont explicites, l'ambiguïté d'affectation est déléguée avec une règle écrite (spec + Task 3).
- **Cohérence des noms :** `VERIF` défini une fois, référencé partout ; fichiers baseline `.superpowers/mise-au-propre/api-baseline.txt` et `fns-baseline.txt` créés en Task 1, lus jusqu'en Task 20 ; libellés de region identiques entre spec, plan et carte du fichier (Task 19).

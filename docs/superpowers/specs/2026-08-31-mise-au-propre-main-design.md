# Mise au propre de `main.js` — Étape 1 (sans build)

**Date** : 2026-08-31
**Branche de base** : `taches-par-dossier` (contient tout le travail courant, 27 commits d'avance sur `main`)
**Branche de travail** : `mise-au-propre-main`
**Statut** : approuvé par l'utilisateur, exécution autonome (sans point de contrôle manuel)

## Contexte

`main.js` fait 16 558 lignes / 785 Ko, un seul fichier CommonJS chargé tel quel par
Obsidian (pas de bundler). La logique y est concentrée : ~130 fonctions pures et
constantes au top-level, une `class Ariane extends obsidian.Plugin` de 7 660 lignes
qui mélange cycle de vie, commandes, événements, ~90 helpers `static` purs et des
centaines de méthodes d'instance, puis `ArianeSettingTab`, les modales, les moteurs
Frise et Articulation, et les vues latérales.

La montée en complexité du plugin rend le fichier difficile à tenir en contexte, pour
un humain comme pour un agent. On veut le rendre **navigable et pérenne** sans en
changer le comportement.

## Approche : staged

- **Étape 1 (ce document)** : réorganisation interne d'un seul fichier, sans build,
  sans dépendance. Bandeaux de section, table des matières, regroupement physique
  des helpers `static` par domaine, sous-régions dans les grosses classes.
  **Reshuffle pur** : zéro changement fonctionnel.
- **Étape 2 (plus tard, hors périmètre)** : introduire esbuild + `package.json`,
  éclater en `src/*.js`, réécrire les sites d'appel `Ariane.xxx → xxx`. Se fera
  d'autant mieux que les coutures de l'étape 1 seront nettes.

## Objectif

Après l'étape 1, `main.js` est découpé en sections `//#region` explicites, dans un
ordre stable, avec une carte du fichier en tête. Le comportement est identique au
bit près sur le plan fonctionnel : mêmes fonctions, mêmes corps, mêmes noms, mêmes
tests (184 / 0).

## Non-objectifs (YAGNI)

- Pas de `src/`, pas de bundler, pas de `package.json`, pas de `node_modules`.
- Pas de réécriture des sites d'appel `Ariane.xxx`.
- Aucun renommage de fonction, méthode, classe, constante, variable.
- Aucun changement de comportement, aucune correction de bug « au passage ».
- `styles.css`, `manifest.json`, `versions.json` : intouchés.
- Fichiers de test : intouchés (aucun n'a besoin de bouger).
- eslint : reporté à l'étape 2 (arrive avec esbuild).
- Passe de JSDoc / commentaires de fond : reportée.
- Copie vers le vault : **différée à la toute fin**, une fois la branche verte et
  relue. On ne copie jamais un `main.js` à moitié réorganisé dans le plugin installé.

## Convention de section

### Régions de premier niveau

```js
//#region 4 · Références Zotero — parsing & appariement
// ═══════════════════════════════════════════════════════════════════════════
//  4 · RÉFÉRENCES ZOTERO — parsing & appariement
//  Analyse des noms d'auteurs, appariement d'une référence à une entrée Zotero,
//  import depuis Crossref / OpenAlex, construction d'une note « référence ».
// ═══════════════════════════════════════════════════════════════════════════

... contenu ...

//#endregion 4 · Références Zotero — parsing & appariement
```

- `//#region N · Titre` et `//#endregion N · Titre` : identiques mot pour mot,
  numéro + titre repris de la table ci-dessous. Repères stables pour grep et pour
  le pliage d'éditeur.
- Bandeau `═` sur 3 lignes minimum : `N · TITRE EN CAPITALES`, puis 1 à 3 lignes
  de description.
- Une ligne vide avant `//#region`, une ligne vide après le bandeau, une ligne vide
  avant `//#endregion`.

### Sous-régions dans une classe

```js
  //#region Ariane · static · frise / gantt
  // ── static · frise / gantt ───────────────────────────────────────────────

  ... méthodes statiques ...

  //#endregion Ariane · static · frise / gantt
```

Règle légère `──`, indentée au niveau du corps de classe. `//#region` en commentaire
est valide partout, y compris dans un corps de classe.

### Carte du fichier (en tête)

Bloc de commentaire tout en haut de `main.js`, avant le `'use strict'` éventuel et
les `require`, contenant :

- une phrase sur ce qu'est ce fichier ;
- la contrainte : **un seul fichier, aucun build, chargé tel quel par Obsidian** ;
- le rappel du flux de copie vers le vault (`cp main.js styles.css manifest.json …`) ;
- la **table des matières** : la liste ordonnée des `//#region N · Titre` ;
- un lien vers `docs/superpowers/specs/2026-08-31-mise-au-propre-main-design.md` et
  vers le journal des suspects.

## Ordre cible du fichier

| N | Region | Contenu regroupé |
|---|---|---|
| 1 | Constantes & i18n | délais (`FENETRE_ECRITURE_MS`…), `TEXTES`, `LANGUE`/`definirLangue`/`tr`, `DEFAULT_SETTINGS` |
| 2 | Utilitaires génériques | `echapperRegex`, `sansLien`, `sansAccents`, `normDoi`, `jourIsoDe`, `horodatageNC`, `dureeLisible`, `enumererFrancais`, autres petits helpers chaîne/date sans domaine |
| 3 | Références Zotero — parsing & appariement | `parseNomReference`, `parseAuteurSeul`, `compilerProfils`, `nomCompletAuteur`, `normaliserConjAuteurs`, `surnamesReference`, `appariementSource`, `candidatsSource`, `cibleDeReference`, `migrerCorrespondances`, `cleLibelle`, `titreCredible`, `titreDansReference`, `cleOeuvre`, `nomOeuvreDetachee`, `trouverSourceZotero`, `refDepuisNomAttente`, `refsDepuisCrossref`, `refsDepuisOpenAlexWorks`, `separerNomPrenom`, `nomFamille`, `construireReference`, `parseNomReference` & co. |
| 4 | Similarité locale (TF-IDF & vecteurs) | `MOTS_VIDES`, `tokeniser`, `frequenceTermes`, `calculerIdf`, `vecteurTfIdf`, `cosinusTfIdf`, `hacherTexte`, `normaliserVecteur`, `cosinusVecteurs` |
| 5 | Notes atomiques | `estNoteDeDonnees`, `extraireNotesFilles`, `titreDeNoteFille`, `citationsZotflowVersAriane`, `finDeSpanApparie`, `titreDeRepli`, `extraireBlocs`, `construireNote`, `analyserCarte`, `rangesNotesOrphelines`, `appliquerModele` |
| 6 | Bibliographie | marqueurs `ZFA_BIBLIO_*`, `auteurBiblio`, `listeAuteursBiblio`, `entreeBiblio`, `nettoyerEntreeBiblio`, `entreeCliquable`, `construireBibliographie`, `injecterBibliographie`, `prefixeCommun`, `valeurLisible`, `cleDeLien`, `corpsCitable`, `rafraichirLibelles`, `composerCitation`, `citationsDuTexte`, `ZFA_RE_CITATION` |
| 7 | Export Pandoc / Word | `ZFA_RE_CIT_GROUPE`, `citationsEnLigneVersPandoc`, `preparerMarkdownExport`, `normaliserBlocsPandoc`, `insecablesFrancais`, marqueurs `MARQUE_ENCADRE_*`, `encadresVersPandoc`, `footnotesVersCitations`, `masquerLiens`, `finDePhrase*`, `debutPhrase` (si propres à l'export ; sinon region 2) |
| 8 | Schémas mxgraph / draw.io | marqueurs `ZFA_SCHEMA_*`, `texteNoeud`, `deshtmlMx`, `texteBrutMx`, `attrsMx`, `parserMxGraph`, `decompresserDiagramme`, `pagesDepuisDrawio`, `propagerEtiquettes`, `normEtiquette`, `polariteEtiquette`, `relationDeEtiquette`, `extraitSchema`, `injecterExtrait` |
| 9 | Doublons d'auteurs | `normNom`, `tokensNom`, `surnameKey`, `memePersonne`, `meilleurCanonique`, `clustersDoublons`, `ajouterTravail`, `ordonnerPages`, `rendreGrappe`, `titreSansNumerotation` |
| 10 | Modèles de bases & marqueurs de tâche | `BASE_TACHES`, `VUE_ARTICULATION_BASE`, `ZFA_TACHE_*`, `svgEl` reste en region 14 |
| 11 | `class Ariane` | sous-régions ci-dessous |
| 12 | `ArianeSettingTab` | une sous-région par onglet (`ongletGeneral`, `ongletZotero`, `ongletTaches`, …) + helpers `_section`/`_aide`/`_tableFamillesTaches` |
| 13 | Modales de tâche | `ConfirmationRattachement`, `ChoixSourceModal`, `ModaleTache`, `ModaleDaterTache` |
| 14 | Vue Frise | `TYPE_VUE_*`, `DEFAUTS_FRISE`, `HAUTEUR_ENTETE_GANTT`, `JOURS_MINIMUM_GANTT`, `MOIS_*`, `svgEl`, `class MoteurFrise`, `fabriquerVueFriseBase` |
| 15 | Vue Articulation | `ARTIC_W`/`ARTIC_H`/`GRILLE_ARTIC`/`SEUIL_AIMANT`/`ANCRE_ECART`, `ancreY`, `class MoteurArticulation`, `fabriquerVueArticulationBase` |
| 16 | Vues latérales `ItemView` | `VueIncoherencesTaches`, `VueReferencesAttente`, `VueSuggestionsZotflow` |
| 17 | Modales secondaires | `ChoixListeModal`, `RapportCarteModal`, `TexteModal`, `VoisinageModal`, `StylesModeleModal`, `FusionAuteursModal` |
| 18 | Exports | `module.exports = Ariane`, `module.exports._test = { … }` |

L'affectation précise d'une fonction à sa region est tranchée par l'exécutant si le
tableau est ambigu ; le principe : **une fonction va avec le domaine qui l'appelle**.
En cas de doute entre « utilitaire générique » (region 2) et un domaine, mettre dans
le domaine si un seul domaine l'utilise, dans la region 2 si plusieurs.

## Sous-régions de `class Ariane`

Dans cet ordre :

1. `Ariane · cycle de vie` — état initialisé dans le constructeur / `onload`, `onload`, `onunload`
2. `Ariane · commandes` — tous les `this.addCommand(...)`
3. `Ariane · événements` — handlers `registerEvent` sur `metadataCache.on` / `vault.on` / layout
4. `Ariane · static · getters` — `CLES_MACHINE`, `CLES_ETAT`, `TYPE_FR_VERS_OBSIDIAN`, `PROPS_GENERIQUES`, `CONCEPTS_TACHE`, `COULEURS_GANTT`, `ZOOMS_GANTT`, `SANS_GROUPE`
5. `Ariane · static · références` — `normaliserEntree`, `normaliserBiblio`, `entreeDansTexte`, `fondreOeuvresProches`, `premier`, `referenceTacheSuivante`
6. `Ariane · static · dates & jours` — `jourValide`, `_versUTC`, `decalerJour`, `ecartJours`, `semaineIso`
7. `Ariane · static · tâches` — `champTache`, `familleTache`, `proprietesManquantes`, `yamlChaine`, `corpsNouvelleTache`, `livrableOuFichier`, `refDeLien`, `refDepuisChemin`, `filtrerTaches`, `achevementAEcrire`, `blocTache`, `libelleNote`, `libelleSource`
8. `Ariane · static · frise / gantt` — `disposerGantt`, `disposerFriseGroupee`, `placerLignes`, `repartirSansDate`, `_sousArbre`, `decalerSousArbre`, `cascadeAval`, `etendueGantt`, `typeProprieteBase`, `_sansAccentMinuscule`
9. `Ariane · static · articulation` — `cyclesDe`, `datesIncoherentes`, `grapheArticulation`, `placerGraphe`, `lienValide`, `_cheminFleche`
10. `Ariane · réglages` — `loadSettings`, `saveSettings`, migrations de settings
11. `Ariane · index & Zotero` — lecture de l'index Zotero, cache d'embeddings
12. `Ariane · références en attente` — dépouillement, appariement, écriture
13. `Ariane · notes atomiques` — orchestration de la création de notes
14. `Ariane · bibliographie` — orchestration de l'injection biblio
15. `Ariane · export` — orchestration de l'export Word/Pandoc
16. `Ariane · suggestions` — voisinage local
17. `Ariane · tâches` — `cleT`, `_labelConcept`, `_lireT`, `libelleColonne`, `libelleGen`, `familleDe`, `refDeChemin`, `majTache`, `creerTache`, `supprimerTache`, `basculerTermine`, `renommerTitreTache`, `creerBlocage`/`retirerBlocage`, `surCreationTacheVierge`, `rattraperProprietesFamilles`, `majBlocTache`, `tachesPourGantt`, `sourcesZoteroPourChoix`, `notesPourChoix`, `ecrireDatesTaches`, `marquerEcriture`, etc.
18. `Ariane · rendu des vues natives` — enregistrement des vues, helpers de rendu partagés

Le découpage exact des méthodes d'instance en sous-régions 10–18 est laissé au
jugement de l'exécutant : le tableau est indicatif, la règle est « regrouper ce qui
se lit ensemble », sans jamais changer un corps de méthode.

## Protocole de sécurité

### Invariant d'API (capturé une fois au début)

```bash
node -e "const A=require('./tests/obsidian-factice.js'); \
 const s=x=>Object.getOwnPropertyNames(x).sort().join('\n'); \
 console.log('=STATIC=\n'+s(A)); \
 console.log('=PROTO=\n'+s(A.prototype)); \
 console.log('=TEST=\n'+Object.keys(A._test||{}).sort().join('\n'))" > .superpowers/api-baseline.txt

grep -oE '^(async )?function [A-Za-z0-9_]+' main.js | sort -u > .superpowers/fns-baseline.txt
```

Après chaque commit, régénérer et comparer : **`diff` doit être vide**. Toute
différence (nom perdu, dupliqué, ajouté) bloque et doit être corrigée avant de
continuer.

### Par commit

1. `node --check main.js` → OK
2. `node --test tests/*.test.js` → **184 pass / 0 fail** (les tests exécutent
   `require('../main.js')`, donc un ordre de `const` cassé — TDZ — est aussi
   attrapé ici)
3. Invariant d'API : `diff` vide contre les deux fichiers baseline
4. `git diff` du commit : quasi exclusivement des déplacements (blocs identiques
   ré-indentés au plus). Un ajout/retrait de logique = anomalie.
5. **Un commit = une region** (ou un lot de petites régions de même forme).
   Jamais deux régions de fond mélangées dans un commit.

### Journal des suspects

Tout ce qui ressemble à un bug, du code mort, une incohérence, une fonction jamais
appelée : consigné dans `docs/conception/2026-08-31-mise-au-propre-main-suspects.md`,
**jamais corrigé dans cette branche**. Format : un titre `##`, le chemin+ligne, ce
qui est suspect, pourquoi on n'y touche pas.

## Phases

| Phase | Périmètre | Tâches |
|---|---|---|
| A | Régions libres 1–10 (hors classes) | le plus safe : `function` hoistées et `const` top-level. Un commit par region. |
| B | `class Ariane` : bandeaux + sous-régions 1–9 (cycle de vie, commandes, événements, statics) | aucun corps de méthode modifié, seulement l'ordre et les marqueurs |
| C | `class Ariane` : sous-régions 10–18 (méthodes d'instance) | idem |
| D | `ArianeSettingTab` + modales de tâche (regions 12–13) | idem |
| E | Vues Frise, Articulation, `ItemView`, modales secondaires, exports (regions 14–18) | idem |
| F | Carte du fichier en tête + `docs` (spec liée, journal des suspects finalisé) | |
| G | **Relecture finale** (voir ci-dessous) | |

Pas de copie vers le vault entre les phases. Copie unique en fin de phase G.

## Relecture finale (phase G, demandée explicitement)

Un sous-agent de revue, sur un modèle capable, relit l'intégralité de
`git diff taches-par-dossier..HEAD` et vérifie :

1. **Aucun changement de comportement** : chaque bloc déplacé est identique à
   l'original modulo indentation/espaces. Repérer toute ligne de logique
   ajoutée, retirée ou modifiée.
2. **Aucune définition perdue ou dupliquée** : recoupe avec l'invariant d'API.
3. **Marqueurs de region bien formés** : chaque `//#region` a son `//#endregion`
   exact ; la table des matières en tête liste toutes les régions dans l'ordre
   réel du fichier ; pas de region orpheline.
4. **Tests** : 184 / 0, `node --check` OK.
5. **Journal des suspects** : cohérent, rien de corrigé en douce.

Les constats de la relecture sont traités en un seul lot de correctifs, puis une
re-revue ciblée du diff de correctifs. Ensuite seulement : `cp` vers le vault et
compte-rendu à l'utilisateur.

## Contraintes globales

- Un seul fichier `main.js`, aucun build, aucune dépendance ajoutée.
- Tests : 184 / 0 à chaque commit, fichiers de test non modifiés.
- `styles.css`, `manifest.json`, `versions.json` : non modifiés.
- Périmètre limité aux notes de tâches pour toute opération de migration — sans
  objet ici (aucune migration).
- Ne pas pousser, ne pas taguer (l'utilisateur déclenche les releases).
- Ne pas fusionner `mise-au-propre-main` ni `taches-par-dossier` sans demande
  explicite.
- Messages de commit terminés par
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Copie vers le vault uniquement en toute fin, après relecture.

## Définition de « terminé »

- `main.js` découpé en régions 1–18, table des matières en tête à jour.
- `class Ariane` et `ArianeSettingTab` sous-régionnées.
- `node --check` OK, `node --test tests/*.test.js` = 184 / 0.
- Invariant d'API : `diff` vide.
- Relecture finale passée, correctifs éventuels intégrés et re-relus.
- Journal des suspects écrit.
- `main.js` + `styles.css` + `manifest.json` copiés dans le plugin du vault.
- Compte-rendu à l'utilisateur : ce qui a bougé, les suspects relevés, l'état de
  la branche (non fusionnée).

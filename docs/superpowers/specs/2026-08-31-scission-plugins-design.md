# Scission d'Ariane en 4 plugins — conception

**Date** : 2026-08-31
**Statut** : brainstorm terminé en autonomie (utilisateur absent). **À valider avant tout plan / implémentation.**
**Prérequis** : la branche `mise-au-propre-main` (main.js balisé en 18 régions + 27 sous-régions) sert de base — c'est elle qui rend la scission mécanique.

## 1. Contexte & objectif

`main.js` fait ~16,8k lignes. Le plugin mélange 4 domaines quasi indépendants : notes atomiques/biblio/export, suggestions locales (IA), tâches/frise/temps, schémas draw.io. Objectif : **4 plugins Obsidian distincts**, chacun installable et versionné séparément, plus un **socle partagé** non publié. Le plugin `obsidian-ariane` global est archivé.

Aucune interaction runtime entre les 4 plugins : chacun lit le coffre pour son compte. Le seul partage est du **code** (via le socle), pas des données ni des API.

## 2. Décisions déjà prises par l'utilisateur

1. **Mono-repo + esbuild + `ariane-core` partagé** (vs code copié / submodule).
2. **`ariane-graph` = uniquement le système de fiches graphiques draw.io / mxGraph** (l'onglet « Schémas » des réglages). Le **graphe d'articulation des tâches reste dans `ariane-task`**.

## 3. Périmètre — 5 paquets

Mono-repo `obsidian-ariane/`, npm workspaces :

```
obsidian-ariane/
  package.json                 (workspaces, scripts build/test/lint)
  esbuild.config.mjs
  tsconfig.json / jsconfig.json
  packages/
    ariane-core/               (non publié)
    ariane-note/
    ariane-assistant/
    ariane-task/
    ariane-graph/
  scripts/
    publish.mjs                (build + pousse artefacts + README vers les 4 dépôts de distribution)
  docs/
```

### 3.1 `ariane-core` — socle (non publié)

Bibliothèque interne importée par les 4 plugins. **Aucun `manifest.json`**, pas de `main.js`.

| Depuis `main.js` | Contenu |
|---|---|
| région 1 | `TEXTES`, `LANGUE`, `definirLangue`, `tr` (i18n — le FR est la clé) |
| région 2 | utilitaires transverses : `echapperRegex`, `sansLien`, `sansAccents`, `normDoi`, `jourIsoDe`, `horodatageNC`, `dureeLisible`, `enumererFrancais`, `cleDeLien` |
| `Ariane · static · dates & jours` | `jourValide`, `_versUTC`, `decalerJour`, `ecartJours`, `semaineIso` |
| région 14 (extrait) | `svgEl` |
| `Ariane · static · getters` (extrait) | `TYPE_FR_VERS_OBSIDIAN`, `typeProprieteBase` (métadonnées Obsidian) |
| `refDepuisChemin` & co. | identité des notes par dossier (utilisé par `ariane-task`, potentiellement `ariane-note`) |
| `Ariane · dossiers & garde-fous d'écriture` | `marquerEcriture`, `ecritePlugin`, `antirebond`, `ecrire`, `supprimerFichier`, `assurerDossier`, `nettoyerNomFichier` |
| `Ariane · réglages & profils` (base) | classe de base `GreffonAriane extends Plugin` : `loadSettings`/`saveSettings` avec `DEFAULT_SETTINGS` fusionnés + **hook de migration** (voir §5), helper d'enregistrement de vue Bases, helper d'enregistrement de `ItemView` |
| `installerVerrouLecture` / `appliquerVerrouLecture` | verrou d'édition des notes auto-générées (partagé note + graph) |
| `styles-core.css` | reset + classes `zfa-*` communes |
| `tests/obsidian-factice.js` | harnais de test |

`ariane-core` expose un point d'entrée `index.js` (CommonJS ou ESM, tranché au build) ré-exportant tout ce qui précède.

### 3.2 `ariane-note` — « tout le reste »

Le plus gros. Repo `obsidian-ariane-note`, id `ariane-note`, nom « Ariane — Notes ».

| Depuis `main.js` | Contenu |
|---|---|
| région 3 | références Zotero : parsing des noms, appariement, import Crossref/OpenAlex, `construireReference` |
| région 5 | notes atomiques : `extraireBlocs`, `construireNote`, `extraireNotesFilles`, `citationsZotflowVersAriane`, `titreDeRepli`, `appliquerModele`, `rangesNotesOrphelines` |
| région 6 | bibliographie : `entreeBiblio`, `construireBibliographie`, `injecterBibliographie`, `composerCitation`, `rafraichirLibelles`, marqueurs `%% ariane:biblio %%` |
| région 7 | export Pandoc / Word : `preparerMarkdownExport`, `normaliserBlocsPandoc`, `insecablesFrancais`, `encadresVersPandoc`, `footnotesVersCitations`, `citationsEnLigneVersPandoc` |
| région 9 | doublons d'auteurs : `normNom`, `memePersonne`, `clustersDoublons`, `meilleurCanonique` |
| `Ariane · static · références` | `normaliserEntree`, `normaliserBiblio`, `entreeDansTexte`, `fondreOeuvresProches`, `premier` |
| sous-régions instance | `notes & citations — rendu`, `glisser-déposer & clés d'annotation`, `citations repliables`, `lecteurs ZotFlow & liens Zotero`, `bibliographie en note & citations dynamiques`, `panier d'annotations & dépôt paragraphe`, `familles de notes & routage de dossier`, `atomisation (orchestration)`, `références en attente`, `bibliographie — index & génération` |
| événements | `surModification`, `surCreation`, `surSuppression` (côté notes/annotations) |
| vues | `VueReferencesAttente` (+ type `zfa-references`) |
| modales | `ConfirmationRattachement`* , `ChoixSourceModal`, `RapportCarteModal`, `TexteModal`, `VoisinageModal`, `StylesModeleModal`, `FusionAuteursModal`, `ChoixListeModal` |
| onglets réglages | Général, Dossiers (moins les cases « suggestions »), Affichage, Citations, Contenu, Références, Export, Avancé + `_tableFamilles` (familles de notes) |

\* `ConfirmationRattachement` sert au rattachement Zotero → `ariane-note`. (À ne pas confondre avec la confirmation de rattachement de tâche, qui n'existe pas comme classe séparée.)

### 3.3 `ariane-assistant` — suggestions locales & IA

Repo `obsidian-ariane-assistant`, id `ariane-assistant`, nom « Ariane — Assistant ».

| Depuis `main.js` | Contenu |
|---|---|
| région 4 | TF-IDF & vecteurs : `MOTS_VIDES`, `tokeniser`, `calculerIdf`, `vecteurTfIdf`, `cosinus*`, `hacherTexte`, `normaliserVecteur` |
| `Ariane · suggestions locales` | `fichiersCandidatsSuggestions`, `construireIndexSuggestion`, `assurerIndexSuggestion`, `rafraichirIndexSuggestion`, cache embeddings (`assurerCacheEmbeddings`, `sauverCacheEmbeddings`, `cheminCacheEmbeddings`), fournisseurs LLM (`genererClaude`, `genererMistral`, `genererAvecFournisseur`, `encoderTexte`), index sémantique (`construireIndexSemantique`), reclassement (`reclasserLLM`, `_reclasserLLM`), `suggestionsPour`, `suggestionsPourArgument`, `vueSuggestions`, `majSuggestions`, `construireItemSugg`, `afficherFenetreArgument`/`fermerFenetreArgument`, `libererAncrage` |
| vues | `VueSuggestionsZotflow` (+ type `zfa-suggestions`) |
| onglet réglages | Suggestions (+ **récupère** les cases « dossiers candidats / masqués » retirées de l'onglet Dossiers de `ariane-note`) |

**Note utilisateur** : en v1, retirer de `ariane-note` (onglet Dossiers/Familles) toutes les cases « suggestions » (`suggDossiersCandidats`, `suggDossiersMasques`, `suggStylesDossiers` par dossier/famille). Le choix fin des dossiers éligibles se fera « dans un second temps » dans les réglages de `ariane-assistant`. **Décision (à valider)** : `ariane-assistant` v1 expose quand même un sélecteur minimal « Dossiers éligibles » (multi-select), pré-rempli par la migration ; l'UI riche viendra après.

### 3.4 `ariane-task` — tâches, frise, articulation, temps

Repo `obsidian-ariane-task`, id `ariane-task`, nom « Ariane — Tâches ».

| Depuis `main.js` | Contenu |
|---|---|
| région 10 | `BASE_TACHES`, `VUE_ARTICULATION_BASE`, marqueurs `%% ariane:tache %%` |
| région 14 | Vue Frise : `MoteurFrise`, `fabriquerVueFriseBase`, `DEFAUTS_FRISE`, géométrie Gantt, types de vue `ariane-frise` |
| région 15 | Vue Articulation : `MoteurArticulation`, `fabriquerVueArticulationBase`, `ancreY`, constantes `ARTIC_*`, type de vue `ariane-articulation` |
| `Ariane · static · tâches` | `champTache`, `familleTache`, `proprietesManquantes`, `yamlChaine`, `corpsNouvelleTache`, `livrableOuFichier`, `refDeLien`, `filtrerTaches`, `achevementAEcrire`, `blocTache`, `libelleNote`, `libelleSource`, `referenceTacheSuivante` |
| `Ariane · static · frise / gantt` | `disposerGantt`, `disposerFriseGroupee`, `placerLignes`, `repartirSansDate`, `decalerSousArbre`, `cascadeAval`, `etendueGantt`, `_sansAccentMinuscule` |
| `Ariane · static · articulation` | `cyclesDe`, `datesIncoherentes`, `grapheArticulation`, `placerGraphe`, `lienValide`, `_cheminFleche` |
| sous-régions instance | `tâches` (CRUD, `cleT`/`_lireT`/`_labelConcept`, familles de tâches, blocages, `tachesPourGantt`, `recalculerIncoherences`, `majTache`, `creerTache`, `supprimerTache`, `basculerTermine`, `renommerTitreTache`, `ecrireDatesTaches`, `metadonneesFichier`, `accesTache`, `majBlocTache`, `assurerBaseTaches`, `sourcesZoteroPourChoix`, `notesPourChoix`, `surCreationTacheVierge`), `temps de travail` (compteur, journal quotidien) |
| événements | achèvement de tâche, sync `terminee` ⇄ `statut`, `surCreationTacheVierge` |
| vues | `VueIncoherencesTaches` (+ type `zfa-taches-incoherences`) |
| modales | `ModaleTache`, `ModaleDaterTache` |
| onglets réglages | Tâches (+ `_tableFamillesTaches`), Temps |

### 3.5 `ariane-graph` — schémas draw.io / mxGraph

Repo `obsidian-ariane-graph`, id `ariane-graph`, nom « Ariane — Graphes & schémas » (nom à confirmer — le code parle de « cartes »/« schémas », l'utilisateur dit « graph »).

| Depuis `main.js` | Contenu |
|---|---|
| région 8 | `parserMxGraph`, `decompresserDiagramme`, `pagesDepuisDrawio`, `propagerEtiquettes`, `extraitSchema`, `injecterExtrait`, `texteNoeud`, `deshtmlMx`, `texteBrutMx`, `attrsMx`, `normEtiquette`, `polariteEtiquette`, `relationDeEtiquette`, marqueurs `%% ariane:schema %%` |
| région 5 (extrait) | `analyserCarte` (parseur de carte mentale) |
| `Ariane · schémas draw.io` | `estSchemaDrawio`, `fichierSchemaActif`, `grapheSchema`, `noteDeSchema`, `synchroniserSchema`, `synchroniserTousSchemas`, `indexerCarte`, `interrogerGraphe`, `vocabCartes`, `validerCarte` |
| onglet réglages | Schémas |

## 4. Build

- **npm workspaces** (racine `package.json` : `"workspaces": ["packages/*"]`).
- **esbuild** (1 dépendance de dev). `esbuild.config.mjs` : pour chaque plugin, bundle `packages/<plugin>/src/main.js` + résout `ariane-core` en interne → `packages/<plugin>/main.js` (format `cjs`, `platform: node`, `external: ["obsidian", "electron", ...builtins]`, `banner` minimal). Concatène `styles-core.css` + `packages/<plugin>/styles.css` → `packages/<plugin>/styles.css` de sortie (ou garde `styles.css` séparé et esbuild ne fait que le JS + un script CSS trivial).
- Scripts racine : `npm run build` (les 4), `npm run build:task` (un seul), `npm run dev` (watch), `npm test` (tous les workspaces), `npm run lint` (eslint — **on l'adopte maintenant**, il vient naturellement avec le `package.json`).
- Chaque `packages/<plugin>/` contient `manifest.json`, `versions.json`, `src/`, `tests/`, `README.md`, `styles.css` (source), `main.js` (généré, **gitignoré dans le mono-repo**, commité seulement dans les dépôts de distribution).
- `minAppVersion` : relever à la version qui fournit l'API Bases stable (1.9+ ; à vérifier — l'actuel `1.0.0` est faux).

## 5. Réglages & migration

Chaque plugin a son propre `data.json` dans `.obsidian/plugins/<id>/`.

**Répartition des clés `DEFAULT_SETTINGS`** (table complète dans le plan ; résumé) :
- **assistant** : `suggActif`, `suggDossiersCandidats`, `suggDossiersMasques`, `suggK`, `suggSeuil`, `suggAntirebond`, `suggMoteur`, `suggArgAffichage`, `suggPoidsSemantique`, `suggStylesDossiers`, `suggFournisseur`, `suggOllamaUrl`, `suggLmStudioUrl`, `suggModeleEmbed`, `suggRerank*`, `suggModeleLLM`, `hoverPartout`.
- **task** : `dossierTaches`, `listeRappelsDefaut`, `prefixeTaches*`, `nomsTachesLisibles`, `masquerPrefixeAffichage`, `clesTaches`, `libellesTaches`, `_clesTachesNettoye`, `articulation*`, `friseBarreCouleur`, `famillesTaches`, `familleTacheDefaut`, tous les `temps*`.
- **graph** : `cartesStrict`, `cartesTypesBlocs`, `cartesRelations`, `schemaSyncAuto`, `schemaPropagerEtiquettes`, `cartesSvgPolice`, `cartesSvgTaille`.
- **core (dupliqué)** : `langue`, `verrouLecture` (note + graph en ont besoin → chacun garde sa copie).
- **note** : tout le reste (~80 clés).
- **Ambigu, à trancher** : `famillesNotes` (routage de dossier → note) porte peut-être un champ « suggestions » → à scinder ; `nomsMonospaceFont`/`dossiersMonospace`/`dossiersAliasExplorateur` (affichage explorateur → note) ; `refsFournisseur`/`refsModele`/`refsCleMistral`/`refsCheminClaude` (IA de rattachement de référence → note, mais recoupe l'IA de l'assistant — **décision : restent dans note**, l'assistant a ses propres clés `sugg*`).

**Migration one-shot** : `ariane-core` fournit `migrerDepuisAriane(plugin, clés)` appelé dans `loadSettings` si `settings._migreDepuisAriane !== true`. Lit `.obsidian/plugins/obsidian-ariane/data.json` via `app.vault.adapter.read`, copie les clés du sous-ensemble du plugin, pose le drapeau, `saveSettings`. Le `data.json` legacy est **laissé en place** (source de migration + filet). L'utilisateur désactive le plugin global après avoir vérifié les 4.

## 6. Identifiants de vue, commandes, CSS

- **Types de vue Bases / ItemView : identifiants inchangés** (`ariane-frise`, `ariane-articulation`, `zfa-references`, `zfa-taches-incoherences`, `zfa-suggestions`). Sinon les fichiers `.base` du coffre et l'état du workspace cassent. `ariane-task` enregistre `ariane-frise` + `ariane-articulation` + `zfa-taches-incoherences` ; `ariane-assistant` enregistre `zfa-suggestions` ; `ariane-note` enregistre `zfa-references`.
- **IDs de commande** : le champ `id` de `addCommand` reste tel quel ; Obsidian préfixe par l'id du plugin → `ariane-task:creer-tache` etc. **Conséquence : les raccourcis clavier existants (`obsidian-ariane:*`) sont perdus** — inévitable, à documenter dans les READMEs et le message du dépôt archivé.
- **CSS** : classes `zfa-*` inchangées. `styles-core.css` (commun) + `styles.css` par plugin, concaténés au build. Risque mineur de collision si deux plugins définissent la même classe — on ne partage que ce qui est réellement commun.
- Marqueurs de bloc (`%% ariane:tache %%`, `%% ariane:biblio %%`, `%% ariane:schema %%`) : inchangés, chacun lu par un seul plugin.

## 7. Tests

Les 184 tests suivent leur code dans le paquet correspondant (`packages/<plugin>/tests/`), + les tests du socle dans `packages/ariane-core/tests/`. `tests/obsidian-factice.js` → `ariane-core`. `npm test` racine agrège via workspaces. Cible : rester à 184+ verts après scission.

## 8. Publication GitHub

Deux besoins distincts : (a) où vit le développement, (b) quel sort pour l'ancien plugin mono-fichier.

**(a) Dépôt de développement** = le mono-repo. Deux options, **D2 à valider** :
- **Option A** — le mono-repo *est* `Liotou/obsidian-ariane` (l'historique du plugin mono-fichier y est déjà, on continue dessus). Le dépôt n'est pas archivé au sens GitHub : il reste le lieu de dev. Son `README.md` gagne le bandeau (voir (b)).
- **Option B** — `Liotou/obsidian-ariane` est archivé (flag GitHub read-only) et le mono-repo est un dépôt neuf `Liotou/ariane`. Plus net conceptuellement (« l'ancien monde est figé »), mais coupe le dépôt de dev de l'historique et demande de recréer 5 dépôts au lieu de 4.

L'utilisateur a écrit « le plugin Ariane global sera archivé et son readme modifié » — cohérent avec B, mais A satisfait aussi l'intention (le *plugin mono-fichier* est arrêté ; le *dépôt* devient le mono-repo). **Recommandation : A** (moins de casse, l'historique reste attaché au dev). Si tu tiens à l'archivage GitHub formel → B.

**(b) Sort du plugin mono-fichier** (indépendant de A/B) :
- Dernière release mono-fichier figée (`2.76.x`), toujours téléchargeable.
- `README.md` du dépôt `obsidian-ariane` : bandeau en tête —
  « ⚠️ Ariane a été scindé en 4 plugins. Ce dépôt » (+ « est désormais le mono-repo » si A / « est archivé » si B). Liens vers les 4. Paragraphe « pourquoi ». Le reste du README d'origine conservé sous un `<details>`.
- Note pour les utilisateurs BRAT : ré-ajouter les 4 dépôts, désactiver le global.

**4 dépôts de distribution** : `Liotou/obsidian-ariane-{note,assistant,task,graph}`. Contenu : `README.md` (généré depuis `packages/<plugin>/README.md`), `manifest.json`, `versions.json`, `LICENSE`, et les **releases** portent `main.js` + `manifest.json` + `styles.css` (modèle standard BRAT / plugin communautaire). Alimentés par `scripts/publish.mjs` (ou une GitHub Action sur tag `<plugin>-vX.Y.Z`) : build → copie artefacts → commit/push + crée la release. L'historique de développement reste dans le mono-repo ; les dépôts de distribution ont un historique plat de releases.

**READMEs** : suivre le style des READMEs existants du dépôt (`README.md` / `README.fr.md` — bilingue, sections « Ce que fait le plugin », captures `.gif`, « Installation », « Réglages », « Avertissement »). Un README par plugin, centré sur son domaine, avec une phrase « fait partie de la famille Ariane » + liens croisés. Le README du mono-repo : vue d'ensemble + tableau des 4 + « comment contribuer (build) ».

## 9. Nommage

| Repo | id plugin | `name` manifest |
|---|---|---|
| `obsidian-ariane` | — (mono-repo) | — |
| `obsidian-ariane-note` | `ariane-note` | Ariane — Notes |
| `obsidian-ariane-assistant` | `ariane-assistant` | Ariane — Assistant |
| `obsidian-ariane-task` | `ariane-task` | Ariane — Tâches |
| `obsidian-ariane-graph` | `ariane-graph` | Ariane — Graphes & schémas |

L'id actuel `obsidian-ariane` (préfixé, inhabituel) n'est pas repris ; les nouveaux ids sont nus (`ariane-*`). Dossiers d'install : `.obsidian/plugins/ariane-note/` etc.

## 10. Inférences & ce que la scission casse (à assumer / documenter)

1. **Raccourcis clavier** : rebinding manuel nécessaire (IDs de commande re-préfixés). Documenté.
2. **`data.json`** : migration auto one-shot (§5) ; le legacy reste en place.
3. **État du workspace** (panneaux ouverts) : préservé si les types de vue gardent leurs identifiants (§6). ✔
4. **Fichiers `.base`** : préservés (identifiants de vue inchangés). ✔
5. **`versions.json` / historique de version** : chaque plugin repart à `1.0.0`. Le mono-fichier s'arrête à `2.76.x`.
6. **BRAT** : les utilisateurs BRAT du plugin global doivent ré-ajouter les 4 dépôts. Message dans le README archivé.
7. **`fundingUrl` / `authorUrl`** : repris à l'identique dans les 4 manifests.
8. **Traductions** : `TEXTES` est monolithique ; au split, soit chaque plugin embarque tout `TEXTES` (simple, quelques Ko dupliqués), soit `TEXTES` est découpé par domaine dans chaque paquet + un tronc commun dans le socle. **Décision : `TEXTES` entier dans `ariane-core`, importé par tous** (le plus simple, coût négligeable).
9. **Familles de notes vs suggestions** : le champ « suggestions » éventuel dans `famillesNotes` doit être extrait vers l'assistant (§5).
10. **`analyserCarte`** vit en région 5 (notes atomiques) mais sert les schémas → part dans `ariane-graph`. Vérifier qu'aucune autre fonction de `ariane-note` ne l'appelle (sinon → socle).
11. **`ChoixSourceModal` / `sourcesZoteroPourChoix`** : dans `ariane-task` (formulaire de tâche de lecture), scanne le coffre pour les notes `@…` sans dépendre de `ariane-note`. ✔
12. **Icônes de ruban** : chaque plugin ajoute la ou les siennes ; l'ancien ruban unique disparaît.
13. **Onglet de réglages unique → 4 onglets** : chaque plugin a son propre `PluginSettingTab`. Les helpers `_section`/`_aide`/`_tableFamilles*` → dupliqués ou dans le socle. **Décision : dans le socle** (`ariane-core/reglages-ui.js`).

## 11. Décisions prises en autonomie — à valider par l'utilisateur

- **D1** — `ariane-assistant` v1 expose un sélecteur « Dossiers éligibles » minimal (pré-rempli par migration), UI riche plus tard. *Alternative : aucun réglage de dossier en v1, suggestions sur tout le coffre.*
- **D2** — Archivage : **Option A** (le mono-repo garde le nom `obsidian-ariane`, pas d'archivage GitHub, bandeau README). *Alternative : Option B, dépôt archivé + nouveau `Liotou/ariane`.*
- **D3** — `TEXTES` entier dans le socle, importé partout.
- **D4** — Helpers d'UI de réglages (`_section`, `_aide`, `_tableFamilles`, `_tableFamillesTaches`) dans le socle.
- **D5** — `refs*` (IA de rattachement de référence) restent dans `ariane-note`, distincts des `sugg*` de l'assistant.
- **D6** — Identifiants de vue Bases/ItemView **inchangés** (compat `.base` + workspace).
- **D7** — Adoption d'eslint + esbuild + npm workspaces (le build que l'étape 1 avait écarté est maintenant assumé).
- **D8** — Nom de `ariane-graph` : « Ariane — Graphes & schémas ». *À confirmer (le code dit « cartes »/« schémas »).*
- **D9** — Chaque plugin repart en `1.0.0`.

## 12. Piloter le chantier (et la suite) avec Claude

**Question posée** : un chat Claude par plugin + un chat orchestrateur ?

**Réponse courte : non.** Un mono-repo + **une session Claude Code principale à la racine** est le bon modèle. Justification :

- **La littérature multi-agents** (orchestrateur-ouvriers) recommande plusieurs agents seulement quand les sous-tâches sont *parallélisables et indépendantes*, avec un agent chef qui découpe et synthétise — et signale explicitement le surcoût de coordination et de jetons. Elle déconseille le multi-agent quand la tâche tient dans un seul contexte. Après scission, chaque plugin fait ~1–5k lignes, **balisé en régions** : l'ensemble tient largement dans une session.
- **Claude Code gère nativement** : `CLAUDE.md` par répertoire (`packages/ariane-task/CLAUDE.md` chargé automatiquement quand on travaille dans ce paquet), la mémoire fichier persistante, les worktrees git, les sous-agents à la demande.
- **Le modèle recommandé** :
  1. **Une session principale** à la racine du mono-repo pour tout le travail courant (features, corrections, revues). Elle voit les 4 plugins + le socle.
  2. **`CLAUDE.md` racine** (règles communes : build, tests, conventions, « ne jamais toucher `famillesNotes` de ZotFlow », etc.) + **un `CLAUDE.md` par `packages/<plugin>/`** (contexte local : ce que fait le plugin, ses pièges).
  3. **`git worktree` par chantier concurrent** — pas par plugin. Si tu veux mener une feature dans `ariane-task` pendant qu'un gros remaniement tourne dans `ariane-note`, un worktree + une session par chantier. C'est exactement ce qu'on a fait pour la mise au propre.
  4. **Sous-agents (`Task` / subagent-driven-development)** uniquement pour l'*exécution* de lots parallélisables d'un plan validé — pas comme structure permanente. Retour d'expérience de cette session : les sous-agents partent « à froid », il leur faut des briefs précis, et ils calent sur des entrées inattendues (le bug `grep`/NUL). Les garder pour des tâches mécaniques bien cadrées.
  5. **Un « chat orchestrateur » permanent n'a pas de sens** ici : il n'y a pas de flux continu de sous-tâches indépendantes à répartir. Le découpage par plugin est déjà porté par l'arborescence + les `CLAUDE.md`.
- **Quand plusieurs sessions se justifient** : (a) chantiers vraiment concurrents (worktrees) ; (b) une session « design/brainstorm » longue distincte d'une session « exécution » ; (c) revue de code isolée. Jamais « une par plugin par principe ».
- **Mémoire & continuité** : le `MEMORY.md` + les fichiers de mémoire couvrent déjà « Ariane vs ZotFlow », le chantier Gantt, etc. Ajouter une entrée « architecture mono-repo 4 plugins » après validation.

## 13. Découpage en étapes (haut niveau — le plan détaillé viendra après validation)

1. **Échafaudage mono-repo** : `package.json` workspaces, esbuild config, eslint, `packages/ariane-core/` vide + 4 `packages/<plugin>/` avec `manifest.json`/`versions.json`/`src/main.js` minimal qui charge et log. Build vert, 4 `main.js` produits.
2. **Socle** : déplacer i18n + utilitaires + dates + `svgEl` + base `GreffonAriane` + migration + UI réglages + harnais de test dans `ariane-core`. Tests du socle verts.
3. **`ariane-graph`** (le plus petit, bon galop d'essai) : déplacer région 8 + sous-région schémas + `analyserCarte` + onglet Schémas. Charge dans Obsidian, un schéma se synchronise.
4. **`ariane-task`** : régions 10/14/15 + statics tâches/frise/articulation + sous-régions tâches/temps + vues + modales + onglets. Frise, articulation, incohérences, compteur de temps fonctionnels.
5. **`ariane-assistant`** : région 4 + sous-région suggestions + `VueSuggestionsZotflow` + onglet Suggestions + retrait des cases suggestions de `ariane-note`. Suggestions fonctionnelles.
6. **`ariane-note`** : le reste. C'est ce qui « tombe » une fois 2–5 sortis ; surtout de la vérification.
7. **Migration `data.json`** : implémentée dans le socle, testée sur une copie du `data.json` réel.
8. **Publication** : `scripts/publish.mjs`, création des 4 dépôts, READMEs, bandeau sur le mono-repo, release finale du mono-fichier.
9. **Revue finale** + copie dans le coffre + bascule (désactiver le global, activer les 4).

Chaque étape = branche + tests verts + essai manuel dans le coffre avant la suivante.

---

## À faire à la reprise (utilisateur)

1. Valider / amender les décisions **D1–D9** (§11).
2. Trancher l'archivage (§8, D2).
3. Confirmer le nom de `ariane-graph` (D8).
4. Dire si le plan détaillé (writing-plans) peut être rédigé, et si l'exécution se fait en subagent-driven-development ou à la main.

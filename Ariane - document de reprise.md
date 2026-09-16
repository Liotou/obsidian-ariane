# Ariane — document de reprise

Passation complète du greffon Obsidian **Ariane** à un agent travaillant en
ligne de commande. Ce document est autoportant : il donne le contexte, l'état
du code, les décisions déjà prises, les pièges déjà payés, et ce qui reste
ouvert.

---

## 1. À qui l'on s'adresse

Elliot Quiriconi, doctorant en sciences de gestion (Université Paris-Dauphine,
laboratoire DRM, en lien avec l'INERIS). Sujet de thèse : le **risque
systémique NaTech** — les accidents technologiques déclenchés par des aléas
naturels.

Conventions de travail qu'il attend :

- le vouvoyer et l'appeler **« Monsieur »** ;
- **code et commentaires en français**, sans exception : c'est la règle depuis
  le premier jour et elle vaut pour tout ajout ;
- pas de tiret cadratin isolé en incise, rare en français ;
- **vérifier plutôt qu'affirmer**, et dire franchement ce qui n'a pas été
  testé. Il a été trompé plusieurs fois par des affirmations non éprouvées et
  y est devenu attentif ;
- ne pas piloter son écran : les vérifications se font en arrière-plan.

Il tranche vite et annule sans hésiter ce qui ne lui convient pas. Plusieurs
chantiers ont été abandonnés en cours de route — voir le chapitre 9. **Ne pas
les relancer sans instruction explicite.**

---

## 2. Ce qu'est Ariane

Un greffon Obsidian sur mesure, écrit pour sa chaîne de travail doctorale.

| | |
|---|---|
| Chemin | `/Users/equiriconi/Obsidian Vault/.obsidian/plugins/zotflow-atomiser/` |
| Identifiant | `zotflow-atomiser` (nom affiché : **Ariane**) |
| Version | 2.44.0 |
| Code | `main.js`, **fichier unique en JavaScript simple**, ~6 900 lignes |
| Compilation | **aucune** : pas de TypeScript, pas de bundler, pas de `npm` |
| Réglages | `data.json`, 130 clés |
| Styles | `styles.css` |
| Scripts | `pandoc/finition.py`, `pandoc/remap-styles.py` |
| Serveur MCP | `mcp/serveur.js` (+ `LISEZMOI.md`, `config-claudian.json`) |
| Commandes | 24 |
| Onglets de réglages | 11 |

Structure du code : `module.exports = class extends obsidian.Plugin`, avec une
classe de réglages `ZotflowAtomiserSettingTab` en fin de fichier. On édite
`main.js` directement ; contrôler ensuite avec `node --check main.js`, puis en
chargeant le module avec un faux `obsidian` (voir chapitre 10).

---

## 3. Le coffre

`/Users/equiriconi/Obsidian Vault`

| Dossier | Contenu | Volume |
|---|---|---|
| `1 - Annotations/` | une note par annotation Zotero, rangée par source | **1 294** |
| `2 - Notes conceptuelles/` | notes de fond, préfixe `NC-` | 25 |
| `3 - Notes réflexives/` | préfixe `NR-` | 3 |
| `4 - Livrables/` | documents produits, sortie de l'export Word | 7 |
| `5 - Références en attente/` | références citées non encore dans Zotero | — |
| `6 - Bibliographies citées/` | bibliographies par source | — |
| `7 - Fiches graphiques/` | une note par schéma, sous-dossier `Graphiques/` | 24 |
| `9 - Journal du temps/` | journaux quotidiens du compteur de temps | — |
| `Références/My Library/` | fiches sources Zotero, nommées `@citekey.md` | **731** |
| `Auteurs/` | fiches auteurs | 695 |
| `Modèle/` | gabarits, dont `Modèle exportation word.docx` | — |
| `Templater/Templates/` | gabarits Templater | — |

Greffons voisins qui comptent :

- **zotflow** — synchronise Zotero vers le coffre. Ariane travaille en aval.
- **ariane-graph** — fork personnel de `somesanity/draw-io-obsidian`, en
  français, pour les schémas draw.io. Dépôt local : `~/Ariane-graph`, compilé
  par `node esbuild.config.mjs production`.
- **realclaudian** — Claude Code embarqué dans le coffre.
- **templater-obsidian**, **quickadd**, **local-backup**, **editing-toolbar**,
  **obsidian-style-settings**, **boox-ocr-import**.

---

## 4. Les fonctionnalités, par domaine

### 4.1 Atomisation des annotations

Le cœur historique. Transforme les annotations Zotero en notes reliées, avec
identité stable, régénération, verrouillage et propagation des suppressions.

Commandes : `atomise-active`, `atomise-tout`.

### 4.2 Citations

Le format a **changé en cours de route** : les notes de bas de page ont été
**abandonnées** au profit de citations en ligne. Une citation s'écrit :

```
([[CLE|Dresch et al., 2015, p. 63]] ; [[CLE2|Gibbons, 1994, p. 12]])
```

Règles acquises :

- la citation se place **toujours avant la ponctuation finale** ;
- les libellés sont produits par `libelleCitation()` selon trois cas : note
  source, annotation simple, annotation rapportant un travail tiers ;
- **« cité dans »** : quand une annotation rapporte un travail que Monsieur n'a
  pas consulté, la source consultée porte un **compteur** `⟨2⟩` au lieu de
  nommer les emprunts. Le survol du compteur affiche les travaux en liens
  cliquables. Les références présentes dans Zotero sont, elles, citées en
  clair ;
- **repliement** : une citation peut céder la place à une pastille portant son
  nombre de références. Commandes « tout replier », « tout déplier »,
  « replier ou déplier », plus un bouton de barre latérale.

Commandes : `citations-replier`, `citations-deplier`, `citations-basculer`,
`citations-rafraichir`.

Pièges déjà payés :

- un basculement global ne modifie ni le texte ni la sélection : sans compteur
  de version, la vue CodeMirror ne se reconstruit pas et l'on croit à de la
  latence ;
- le dépliement d'une citation isolée doit passer par un **drapeau distinct**
  du compteur global, sinon la commande globale efface l'exception au moment
  même où on la pose.

### 4.3 Bibliographie de note

Bloc délimité par `%% ariane:biblio %%` … `%% /ariane:biblio %%`, mise en forme
CSL déléguée au greffon **zotflow**, précédé d'un `---`. Chaque entrée reçoit un
lien cliquable `[[@clé|↗]]` ajouté **après** l'entrée : envelopper l'entrée
entière dans un alias de lien tuerait le formatage markdown.

Commandes : `biblio-note`, `biblio-tout`, `bibliographie-citee-source`,
`bibliographies-citees-toutes`.

### 4.4 Glisser-déposer

Glisser une annotation ou une source sur un paragraphe y insère la citation.

Trois défauts corrigés, tous instructifs :

1. **Chromium refuse de transporter une adresse `app://`** dans un glisser. Un
   lien interne rendu hors d'une vue markdown — le chat de Claudian, par
   exemple — arrive donc avec un `dataTransfer` **vide**. Ariane note la cible
   **au départ du glisser** (`noterSourceGlissee`), seul moment sûr.
2. En Live Preview, une citation n'est pas une balise `<a>` : Ariane lit le
   **texte source sous le point de départ** pour y retrouver le `[[…]]`.
3. Réutiliser une citation est une **copie**, jamais un déplacement : sans
   forcer `effectAllowed`, l'éditeur la retirait du paragraphe d'origine. Cet
   effet n'est forcé que si la cible est réellement citable, pour ne pas
   altérer le déplacement de texte ordinaire.

### 4.5 Schémas draw.io

Les schémas `.drawio.svg` de `7 - Fiches graphiques/Graphiques/` sont doublés
d'une note. Leur contenu est extrait et recopié dans la note associée, entre
`%% ariane:schema %%` et `%% /ariane:schema %%`, pour être cherchable.

Règle de propagation acquise : **une étiquette unique posée sur un faisceau de
flèches s'applique à toutes**.

Commandes : `schema-synchroniser-tout`, `carte-valider`, `carte-interroger`.

### 4.6 Suggestions d'annotations

Panneau latéral proposant des annotations à rapprocher de la note en cours,
avec filtres par type de note. Index reconstructible.

Commandes : `suggestions-ouvrir`, `suggestions-reconstruire`.

### 4.7 Compteur de temps

Ajouté en dernier. Mesure le temps passé **dans une note ouverte en édition**,
avec pause automatique dès que le clavier et la souris se taisent ou que la
fenêtre perd le focus. Total inscrit en minutes dans la propriété
`temps-passe`.

Points de conception :

- **total de référence en secondes** conservé dans les réglages, la propriété
  n'en étant qu'une vue arrondie. Arrondir à chaque report, en repartant d'une
  valeur déjà arrondie, gonflait le total de plusieurs pour cent ;
- écriture espacée (toutes les cinq minutes, en quittant la note, à la
  fermeture) pour ne pas agiter OneDrive et les sauvegardes ;
- les notes portant `locked: true` sont ignorées.

Commandes : `temps-journal`, `temps-reporter`.

### 4.8 Export Word

Voir le chapitre 6, qui lui est entièrement consacré : c'est le chantier ouvert.

Commande : `exporter-word-zotero`.

### 4.9 Divers

`retirer-alias-liens`, `normaliser-conjonctions-references`,
`panier-annotations`, `lier-reference-zotero`, `rattacher-toutes-references`,
`fusionner-doublons-auteurs`.

---

## 5. Défaut transversal à connaître

**Trois fois** une fonctionnalité s'est révélée n'installer ses gestionnaires
que sur la fenêtre principale, cassant tout usage en fenêtre détachée — Monsieur
travaille sur deux écrans.

- Les gestionnaires de glisser n'étaient posés que sur `document` et sur les
  fenêtres ouvertes **après** le chargement. Une fenêtre restaurée au démarrage
  n'était jamais couverte.
- Le compteur de temps testait `document.hasFocus()`, soit le focus de la
  **fenêtre principale** : tout travail en fenêtre détachée était compté comme
  de l'arrière-plan, donc jamais compté.

Le remède, à appliquer à tout nouvel ajout : parcourir `iterateAllLeaves()` au
démarrage pour couvrir les fenêtres existantes, écouter `window-open` pour les
suivantes, et juger le focus sur le document de la feuille active.

**Limite qui ne se corrige pas** : un glisser ne traverse pas deux fenêtres
Electron distinctes. Ce n'est pas une lacune d'Ariane.

---

## 6. Le chantier ouvert : l'export Word

### 6.1 Objectif

Exporter une note en `.docx` conforme au modèle de Monsieur, **en conservant
des citations Zotero vivantes** — des champs Word actualisables, et non du
texte figé. C'est la contrainte cardinale : toute solution qui régénère le
document détruit ces champs et ne vaut rien.

### 6.2 Outillage

| | |
|---|---|
| pandoc | `/opt/homebrew/bin/pandoc`, 3.10.1 |
| Filtre Lua | `~/.ariane-mcp/bbt/pandoc/pandoc-zotero-live-citemarkers.lua` |
| `LUA_PATH` | doit pointer le dossier du filtre, sinon `module 'lunajson' not found` |
| Zotero | doit tourner, avec Better BibTeX. Sonde : `curl http://127.0.0.1:23119/better-bibtex/cayw?probe=probe` → 200 |
| Modèle | `Modèle/Modèle exportation word.docx` |
| Sortie | `4 - Livrables` |

### 6.3 La chaîne en trois temps

1. **`preparerMarkdownExport()`** dans `main.js` :
   - citations en ligne `([[CLE|libellé]])` → `[@citekey, p. 12]` ;
   - fusion des entrées d'une même source, pages cumulées dans un seul
     suffixe : `[@dresch2015, p. 63, 42]` ;
   - suppression des compteurs `⟨n⟩` ;
   - suppression du bloc `%% ariane:biblio %%` ;
   - titres décalés d'un cran — `#` est le titre du document, pas une partie,
     donc `##` devient Titre 1 — et numérotation manuelle retirée
     (« 2.1 Titre » → « Titre ») pour laisser Word numéroter ;
   - encadrés `> [!info]` → `::: {custom-style="Items de réflexion"}`.
2. **pandoc** avec `--lua-filter` et `--reference-doc`.
3. **`pandoc/finition.py`** : rattache les en-têtes, remappe les styles,
   habille les tableaux.

### 6.4 Ce qui est vérifié et fonctionne

- champ `ADDIN ZOTERO_ITEM CSL_CITATION` produit, métadonnées réelles,
  localisateur transmis (`"locator":"63, 42"`) ;
- tableaux markdown convertis en tableaux Word avec filets ;
- styles du modèle appliqués, aucun style inconnu ;
- XML bien formé.

### 6.5 Défaut n° 1 — Zotero refuse d'actualiser

**Symptôme** : dans Word, « Actualiser » répond *« Vous devez insérer une
citation avant d'effectuer cette opération. »*

**Cause établie, preuve à l'appui.** Le module Zotero ne reconnaît un document
que s'il y trouve ses préférences, rangées dans `docProps/custom.xml` sous
`ZOTERO_PREF_1` et `ZOTERO_PREF_2`.

- Le **modèle** les contient :
  `<data data-version="3" zotero-version="9.0.4"><session id="lmVm1xeb"/>
  <style id="http://www.zotero.org/styles/apa" locale="fr-FR"
  hasBibliography="1" …/>`
- Le **document exporté** ne contient qu'une propriété vide :
  `<property … name="zotero"><vt:lpwstr></vt:lpwstr></property>`

La chaîne **écrase donc les préférences du modèle**. Les champs de citation
existent, mais le document n'est pas un « document Zotero ».

**Piste** : recopier `ZOTERO_PREF_1` et `ZOTERO_PREF_2` du modèle vers
`docProps/custom.xml` du document produit, avec des `pid` uniques et
consécutifs. À faire dans `finition.py`, qui ouvre déjà l'archive.

À contrôler aussi : le filtre mentionne `ZOTERO_TRANSFER_DOCUMENT`, absent du
document produit ; et le champ de bibliographie `ZOTERO_BIBL` n'apparaît pas.

### 6.6 Défaut n° 2 — les en-têtes ont été abîmés

**Ce que Monsieur veut**, dans ses termes : deux en-têtes distincts, définis
dans le modèle, dont la mise en forme doit être **conservée telle quelle**. Il
ne faut **remplir que les champs**.

- **en-tête principal** (`header1.xml`) : en-tête par défaut, répété à chaque
  page. Ne contient qu'un champ `PAGE`. Doit devenir dynamique.
- **en-tête secondaire** (`header2.xml`) : n'apparaît que sur la première page.
  Un tableau réunissant les propriétés de la note.

**Erreur commise** : le tableau de `header2.xml` a été reconstruit avec des
largeurs inventées et une fusion sur trois colonnes, au lieu de reprendre le
gabarit. Monsieur a jugé, à raison, que tout avait été « fusionné ».
**Repartir du XML du modèle et se borner à remplacer le texte des cellules ;
ajouter des rangs en clonant un rang existant, jamais en le reconstruisant.**

Structure réelle relevée dans le modèle :

```
tableau extérieur (grille : 10456)
  └ cellule
      └ tableau intérieur (grille : 2831 | 565 | 2296 | 587 | 1124 | 2829)
          rang 1 : [vide] [« Document de travail doctoral – Elliot Quiriconi »] [vide]
          rang 2 : [vide] [« Type »] [« Fiche conceptuelle »] [« Date »] [« 07/06/26 »] [vide]
          rang 3 : [vide] [« Réf. »] [« FC-26-07-02-01-A »] [« Page »] [« 1 sur 4 »] [vide]
```

Cellules de contenu : style `Entte` (nom « En tête »). Cellules de marge :
`Sansinterligne`. Un rang loge **deux paires étiquette/valeur** : c'est le
format à respecter.

**Cause de la disparition** : pandoc écrit sa propre `<w:sectPr>`. Les en-têtes
restent dans l'archive mais plus aucune `headerReference` ne les désigne, et
`titlePg` est perdu. `finition.py` corrige déjà ce point.

### 6.7 Styles du modèle

Word attend un **`styleId`**, jamais le nom affiché. Le modèle range « Corps de
texte » sous le nom anglais « Body Text » : seul l'identifiant `Corpsdetexte`
porte le libellé français, et il s'écrit **sans espaces**. D'où la résolution
en deux temps de `identifiant()` : nom exact, puis forme compactée.

| Identifiant | Nom affiché |
|---|---|
| `Titre1` … `Titre9` | heading 1 … 9 |
| `Corpsdetexte` | Body Text |
| `Titredetableau` | Titre de tableau |
| `Champdetableau` | Champ de tableau |
| `Sous-titredetableau` | Sous-titre de tableau |
| `Rfrencesbib` | Références bib |
| `Itemsderflexion` | Items de réflexion |
| `Citationintense` | Intense Quote |
| `CitationENG` | Citation ENG |
| `Entte` | En tête |
| `Sansinterligne` | No Spacing |
| `Grilledutableau` | Table Grid |

### 6.8 Réglages de l'export

```json
"exportModeleWord": "/Users/equiriconi/Obsidian Vault/Modèle/Modèle exportation word.docx",
"exportPandocBin": "/opt/homebrew/bin/pandoc",
"exportFiltreLua": "/Users/equiriconi/.ariane-mcp/bbt/pandoc/pandoc-zotero-live-citemarkers.lua",
"exportDossier": "4 - Livrables",
"exportBibliographie": true,
"exportDecalerTitres": true,
"exportRetirerNumerotation": true,
"exportStyleEncadre": "Items de réflexion",
"exportStyleEnteteTableau": "Titre de tableau",
"exportStyleCelluleTableau": "Champ de tableau",
"exportEntetes": true
```

**`exportMapStyles` a été réinitialisé par Obsidian** et ne contient plus que
des chaînes vides. Il doit valoir :

```json
{"BodyText":"Corps de texte","FirstParagraph":"Corps de texte",
 "Compact":"Corps de texte","BlockText":"Citation intense"}
```

### 6.9 Règles à ne pas enfreindre

1. **Ne jamais régénérer le document.** On retouche le `.docx` produit.
2. **Compter les champs Zotero avant et après** toute retouche, et refuser
   d'écrire s'il en manque un. `finition.py` le fait.
3. **Toute cellule doit se terminer par un paragraphe**, sinon Word refuse
   d'ouvrir le fichier. pandoc pose ses `bookmarkStart` entre les paragraphes
   et l'un d'eux peut se retrouver en dernière position.
4. **Effacer les `headerReference` existantes avant d'inscrire les siennes**,
   sous peine de doublons et de références `even` non désirées.
5. **Vérifier le XML** : équilibre des balises, `xml.etree` qui parse, aucun
   style inconnu. Ces contrôles ont attrapé trois défauts invisibles.

---

## 7. Le pont Apple Rappels — retiré

Ariane a longtemps porté un pont vers Apple Rappels : la boîte de réception
`Doctorat - Boîte de réception` devenait une tâche numérotée `T001` dans
`Doctorat - Tâches`, doublée d'une note.

**Ce pont a été entièrement retiré d'Ariane en v2.35.0**, Monsieur ayant choisi
de gérer ses tâches hors d'Obsidian, entre Rappels et Calendrier. Ne pas le
réintroduire.

Les leçons techniques valent d'être conservées, car elles resserviront à qui
touchera à Apple Rappels :

- `name of rs` après un `set rs to reminders of list …` **échoue** ;
- `item i of rs` re-résout la collection entière et fige l'application ;
- le seul idiome valide est `name of every reminder of L`, et il facture
  **plusieurs secondes par propriété** — jusqu'à douze sur une liste vide ;
- **EventKit** rend l'objet complet en une fois : 113 rappels, toutes
  propriétés, en moins de 300 ms. Scripts conservés dans
  `~/Library/Application Support/Ariane/` ;
- le booléen passé au bloc de rappel `requestFullAccessTo…` **ne traverse pas
  fiablement le pont JXA** : il vaut faux alors même que l'accès est accordé.
  Interroger `authorizationStatusForEntityType` à la place.

---

## 8. Serveur MCP

`mcp/serveur.js`, documenté dans `mcp/LISEZMOI.md`, configuré par
`mcp/config-claudian.json`. Expose le coffre à Claudian.

---

## 9. Chantiers abandonnés — ne pas relancer

Monsieur les a annulés explicitement. Les rouvrir sans instruction serait une
faute.

| Chantier | Motif |
|---|---|
| **Module Canvas** | « c'est pas ce que je souhaite » |
| **CSL en HTTP** pour la bibliographie | « trop complexe comme système » ; zotflow s'en charge |
| **Projets et planification** dans Ariane | « On annulle » |
| **Embeddings des sources Zotero** | « j'abandonne le umbedding ». `grep` s'est montré plus fiable que la recherche sémantique pour retrouver un ouvrage parmi 731 |
| **Agent IA de planification** (sessions de travail au calendrier) | « ça devient un foutoir » |
| **Ariane-jalon** (fork de TaskNotes) | abandonné avec la gestion des tâches dans Obsidian |
| **Trame Word à tableaux imbriqués** | écrite puis retirée : « ça marche mal ». Le document de référence de pandoc ne transporte que des styles, jamais de structure ; la trame devait donc être construite en retouchant la sortie. Ne pas y revenir sans instruction |

Un fichier `cache-embeddings.json` de **29 Mo** subsiste dans le dossier du
greffon, vestige des embeddings abandonnés. Il peut être supprimé après accord.

---

## 10. Comment travailler sur ce code

### Contrôles après édition

```bash
cd "$HOME/Obsidian Vault/.obsidian/plugins/zotflow-atomiser"
node --check main.js
```

`node --check` ne valide que la **syntaxe**. Un appel à une fonction
inexistante passe au travers — cela a déjà cassé le greffon. Charger le module
avec un faux `obsidian` pour vérifier que les méthodes existent :

```js
const fs = require('fs');
const M = { exports: {} };
new Function('module', 'exports', 'require', fs.readFileSync('main.js', 'utf8'))(
  M, M.exports, (n) => n === 'obsidian' ? new Proxy({}, { get: () => class {} }) : require(n));
const C = M.exports.prototype;
console.log(['maMethode', 'autre'].filter((x) => typeof C[x] !== 'function'));
```

Vérifier aussi qu'aucun appel `this.X()` ne pointe vers une méthode disparue,
et qu'aucune fonction utilitaire du module n'a été emportée par une découpe.
**Une réécriture par tranche a déjà supprimé quatre fonctions utilitaires sans
que la syntaxe en souffre.**

### Sauvegardes

Copier `main.js` avant toute réécriture large. Les précédentes sont dans
`/tmp/main.*.js` mais ne survivent pas au redémarrage.

### Tester l'export sans passer par Obsidian

```bash
cd ~/.ariane-mcp/bbt/pandoc
export LUA_PATH="$HOME/.ariane-mcp/bbt/pandoc/?.lua;$HOME/.ariane-mcp/bbt/pandoc/?/init.lua;;"

pandoc --lua-filter pandoc-zotero-live-citemarkers.lua \
       --reference-doc "$HOME/Obsidian Vault/Modèle/Modèle exportation word.docx" \
       essai.md -s -o /tmp/essai.docx

python3 "$HOME/Obsidian Vault/.obsidian/plugins/zotflow-atomiser/pandoc/finition.py" \
        /tmp/essai.docx /tmp/ordres.json
```

Contrôles sur le résultat :

```bash
cd /tmp && rm -rf x && mkdir x && cd x && unzip -q /tmp/essai.docx
grep -c "ADDIN ZOTERO_ITEM" word/document.xml
grep -o 'name="ZOTERO_PREF_[0-9]"' docProps/custom.xml
grep -o '<w:headerReference w:type="[a-z]*"' word/document.xml
python3 -c "import xml.etree.ElementTree as E; E.parse('word/document.xml')"
```

---

## 11. Contraintes Templater, si l'on y touche

Le moteur **Eta** de Templater 2.20.6 a deux limites qui ont coûté du temps :

- **pas d'apostrophe dans un commentaire JavaScript** : elle est lue comme une
  chaîne non fermée ;
- **pas de guillemet double dans une expression régulière** à l'intérieur d'un
  bloc `<%* … %>`. Employer `String.fromCharCode(34)`.

---

## 12. Ce que je proposerais de faire en premier

1. Rétablir `exportMapStyles` dans `data.json`.
2. **Recopier `ZOTERO_PREF_1` et `ZOTERO_PREF_2`** du modèle vers le document
   produit. C'est le blocage principal : sans cela, aucune actualisation
   Zotero n'est possible, et tout le reste est cosmétique.
3. **Refaire le remplissage de `header2.xml`** en repartant du gabarit du
   modèle, sans en changer la structure.
4. Vérifier dans Word : ouverture sans avertissement, en-têtes conformes,
   « Actualiser » fonctionnel.
5. Traiter la bibliographie `ZOTERO_BIBL`, absente du document.

Faire valider chaque étape par Monsieur avant de passer à la suivante : il
préfère de loin corriger tôt que découvrir tard.

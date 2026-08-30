# Suspects relevés pendant la mise au propre de `main.js`

Choses repérées pendant le reshuffle (étape 1) et **délibérément non corrigées** :
bugs possibles, code mort, incohérences. À trancher dans une itération dédiée.

Format : un `##` par suspect, avec chemin + ligne (au moment du repérage),
ce qui cloche, pourquoi on n'y touche pas maintenant.

---

## `horodatageNC` sans appelant interne

`main.js`, définition dans la region 2 (ex-ligne ~1290). `grep -n horodatageNC main.js`
ne trouve que la définition et l'export `module.exports._test`. Aucun appel dans le
plugin. Peut-être du code mort, ou un helper prévu pour un usage futur. Laissé en
place (la spec le liste en region 2), non supprimé : hors périmètre du reshuffle.

## Commentaire fusionné au-dessus de `sansAccents` (region 2)

`main.js`, bloc `sansAccents` de la region 2. La première ligne du commentaire
(« Normalise un DOI : minuscule, sans préfixe URL ni "doi:". ») décrit en réalité
`normDoi`, pas `sansAccents` ; les trois lignes suivantes décrivent bien
`sansAccents`. Commentaire mal découpé pré-existant, déplacé tel quel avec la
fonction. Non retouché (pas de chirurgie de commentaire dans le reshuffle).

## Commentaire fusionné au-dessus de `enumererFrancais` (region 2)

`main.js`, bloc `enumererFrancais` de la region 2. Les deux premières lignes
(« Regroupe les entrées d'une même source… ») décrivent `rendreGrappe` /
`ajouterTravail`, pas `enumererFrancais` ; les deux dernières lignes décrivent
bien `enumererFrancais`. Commentaire fusionné pré-existant, déplacé tel quel.

## Bandeaux ad hoc orphelins après le déplacement des helpers en region 2

`main.js` : le bandeau `/* --- Temps passé --- */` (avant l'ancien `dureeLisible` /
`jourIsoDe`) et le bandeau `/* --- Préparation du markdown exporté --- */` +
le commentaire « Transforme les notes de bas de page… » (avant l'ancien
`enumererFrancais`) ne précèdent plus la fonction qu'ils annonçaient : ces helpers
sont partis en region 2. Bandeaux laissés en place, à réaffecter/retirer lors de
la mise au propre des regions concernées (7, 9).

## Commentaire fusionné au-dessus de `surnamesReference` (region 3)

`main.js`, bloc `surnamesReference` de la region 3. La première ligne du
commentaire (« Cherche une source Zotero correspondante (1er auteur + année). »)
décrit `trouverSourceZotero` ; la seconde (« Noms de famille (minuscule)… »)
décrit bien `surnamesReference`. Commentaire fusionné pré-existant, déplacé tel
quel avec la fonction (les deux fonctions sont dans la region 3).

## Bloc TF-IDF (region 4) remonté lors du commit de la region 3

`main.js` : le bloc `MOTS_VIDES` → `cosinusVecteurs` (region 4) a été remonté
juste après `//#endregion 3` dès le commit de la region 3, pour que
`//#endregion 3` précède immédiatement la première déclaration de la region 4
(contrainte d'ordre du fichier). Le commit de la region 4 ne fait plus que poser
`//#region 4` + bandeau + `//#endregion 4` autour de ce bloc déjà en place.

## `COULEURS_ZOTERO` / `nomCouleur` placés en region 5 (et non 3 ou 9)

`main.js`, region 5 · Notes atomiques (juste après `rangesNotesOrphelines`). Le
brief envisageait la region 9 (doublons d'auteurs) ou 3 pour ce couple, mais le
seul appelant est `extraireBlocs` (region 5, calcul de la couleur d'une
annotation). Placés donc en region 5, sans déplacement (ils y étaient déjà). Rien
de suspect sur le fond ; note laissée pour justifier l'écart au brief.

## Commentaire orphelin « Extrait tous les blocs d'annotation… » (region 5)

`main.js`, region 5, juste au-dessus du commentaire de `titreDeRepli`. La ligne
« Extrait tous les blocs d'annotation d'une note source, selon la config. »
décrit `extraireBlocs`, pas `titreDeRepli` qui la suit immédiatement. Commentaire
mal placé pré-existant, déplacé tel quel avec le bloc (pas de chirurgie de
commentaire dans le reshuffle).

## `cleDeLien` déplacé en region 2 (et non region 6)

`main.js` : `cleDeLien` figurait dans la liste region 6 du brief, mais avec ~13
sites d'appel répartis sur plusieurs domaines (bibliographie, export Pandoc,
méthodes `Ariane` de références / tâches / index). Transverse → déplacé en
region 2 · Utilitaires génériques (juste avant `//#endregion 2`), conformément à
la règle « dans la region 2 si plusieurs domaines l'utilisent ». `valeurLisible`,
lui, n'a que 2 appelants (tous export) : laissé en region 6 comme le liste le
brief.

## Bandeau ad hoc `/* Bibliographie de note */` supprimé (region 6)

`main.js` : le bandeau `/* ------- Bibliographie de note ------- */`, mal placé
(il précédait `BASE_TACHES`, qui relève des tâches, pas de la bibliographie), est
supprimé — superséordé par le bandeau `//#region 6 · Bibliographie`. Seule ligne
retirée du commit region 6.

## Bandeau orphelin `/* Temps passé */` désormais collé à `BASE_TACHES`

`main.js`, juste avant le commentaire de `BASE_TACHES` (region 10 à venir). Ce
bandeau ad hoc n'annonce aucun code de cette zone (le compteur de temps passé est
une méthode de `class Ariane`). Déjà signalé par le lot régions 1–4 ; après le
regroupement de la region 6 il se retrouve accolé au bloc des modèles de bases.
Laissé en place, à retirer lors de la mise au propre de la zone « temps passé »
de `class Ariane`.

## `masquerLiens` / `finDePhrase` / `finDePhraseAvantPonct` / `debutPhrase` → region 2

`main.js` : ces quatre helpers de phrase figuraient dans la liste region 7 du
brief « s'ils ne servent qu'à l'export ». Vérification des appelants : aucune
fonction de la region 7 (export Pandoc) ne les appelle ; leurs seuls appelants
sont des méthodes de `class Ariane` du dépôt de citation par glisser-déposer
(`attacherCitation`, `surlignerPhrase`, `surDropParagraphe`). Domaine unique mais
hors regions 5–10 → déplacés en region 2 · Utilitaires génériques (juste après
`cleDeLien`), conformément au repli prévu par le brief et la spec.

## Bandeau ad hoc `/* Préparation du markdown exporté */` supprimé (region 7)

`main.js` : ce bandeau, échoué entre `clustersDoublons` (region 9) et
`ajouterTravail` (region 9) après le lot régions 1–4, est supprimé — superséordé
par le bandeau `//#region 7 · Export Pandoc / Word`. Le commentaire
« Transforme les notes de bas de page… » qui le précédait décrivait en fait
`footnotesVersCitations` : il a été remonté avec le bloc region 7, juste
au-dessus de cette fonction (retrouvailles commentaire/fonction). Seules
modifications non-déplacement du commit region 7.

## Bandeau ad hoc `/* Module Cartes */` conservé dans la region 8

`main.js`, region 8, juste sous le bandeau `//#region 8`. Contrairement aux
bandeaux `/* Bibliographie de note */` et `/* Préparation du markdown exporté */`
(supprimés car réduits à un titre), le bloc `/* Module Cartes — cartes
ontologiques sur Canvas … */` porte de la doc de fond (fichier `.canvas` = JSON,
relations = étiquettes d'arêtes, types de blocs dans un sidecar `.ariane.json`)
absente du bandeau de region. Conservé tel quel comme commentaire interne à la
region 8 plutôt que supprimé. Regroupé avec lui : le sous-bloc `ZFA_SCHEMA_*` /
`extraitSchema` / `injecterExtrait`, jusque-là séparé du bloc mxGraph par les
modèles de bases (region 10).

## Bandeaux ad hoc supprimés au commit régions 9–10

`main.js` :
- `/* ---- Détection de doublons d'auteurs ---- */` : titre nu, superséordé par
  `//#region 9 · Doublons d'auteurs`. Supprimé.
- `/* --------------------------- Temps passé --------------------------------- */`
  (bloc 5 lignes) : bandeau orphelin de premier niveau — le compteur de temps
  passé est un groupe de méthodes de `class Ariane`, aucun code de cette zone ne
  s'y rapporte. Déjà signalé par le lot régions 1–4 (« à retirer lors de la mise
  au propre des régions concernées ») ; retiré ici. Les sections `/* Temps passé
  */` internes à `class Ariane` (≈ L984, ≈ L5780) ne sont pas touchées.

Le bandeau `/* === Plugin === */` a été conservé et laissé juste avant
`class Ariane` (il annonce la region 11, hors périmètre de ce lot).

## Ordre des régions 6→10 : blocs remontés à leur rang

`main.js` : pour respecter « l'ordre du fichier suit la spec » (region N avant
region N+1, tout avant `class Ariane`), les blocs suivants ont été remontés au fil
des commits de ce lot, sans toucher aux corps :
- region 6 : `ZFA_RE_CITATION` / `citationsDuTexte` d'une part, bloc
  `ZFA_BIBLIO_*` → `composerCitation` d'autre part, réunis juste après
  `//#endregion 5` (ils encadraient `BASE_TACHES`).
- region 7 : bloc `ZFA_RE_CIT_GROUPE` → `footnotesVersCitations` remonté depuis
  la fin de zone (après les régions 8/9/10) jusqu'après `//#endregion 6`.
- region 8 : sous-bloc `ZFA_SCHEMA_*` / `extraitSchema` / `injecterExtrait`
  rapproché du bloc mxGraph (ils étaient séparés par les modèles de bases).
- region 10 : bloc `BASE_TACHES` → `ZFA_TACHE_FIN` redescendu après la region 9.
Aucun risque de TDZ : les `const` concernés (`BASE_TACHES`, `ZFA_TACHE_*`,
`ZFA_SCHEMA_*`, `ZFA_RE_CIT_GROUPE`, `MARQUE_ENCADRE_*`, `COULEURS_ZOTERO`) ne
sont lus qu'au sein de corps de fonctions/méthodes, jamais au chargement du
module. Vérifié : 184 tests verts et invariants d'API vides à chaque commit.

## Bandeaux de section `/* … */` orphelins après regroupement des `static` (region 11)

`main.js` ~10497 (après commit « helpers static par domaine ») : quatre bandeaux
mono-ligne se retrouvent empilés entre `surSuppression` et `tachesPourGantt` :

```
  /* ============================== Tâches =============================== */
  /* ----------------------------- Frise Gantt ----------------------------- */
  /* --------------------- Cohérence des tâches -------------------------- */
  /* ---------------------- Vue « Articulation » ------------------------ */
```

Ils précédaient chacun un groupe thématique de méthodes `static` (referenceTacheSuivante /
disposerGantt / cyclesDe / grapheArticulation). Ces `static` ayant été remontés dans
les sous-régions `Ariane · static · …`, les bandeaux — qui ne sont pas le
commentaire d'en-tête d'un `static` précis mais des séparateurs de section — sont
restés sur place et se sont regroupés. Le bandeau `/* === Tâches === */` garde du
sens (il ouvre la série de méthodes d'instance « tâches » qui suit) ; les trois
autres sont désormais redondants. Non touché ici : retirer/déplacer un séparateur
de section relève du rangement des méthodes d'instance par domaine (lot suivant),
pas de ce commit. Aucun impact : ce sont des commentaires.

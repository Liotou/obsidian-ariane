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

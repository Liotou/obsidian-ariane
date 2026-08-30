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

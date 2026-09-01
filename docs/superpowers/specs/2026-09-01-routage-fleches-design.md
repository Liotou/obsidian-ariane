# Routage des flèches de l'articulation — règles arrêtées

**But :** une flèche de la vue articulation ne doit jamais passer sur une carte.
Dans le SVG, les cartes sont peintes après les flèches : toute portion qui les
chevauche disparaît derrière, et la dépendance semble rompue. Par ailleurs le
bord droit d'une carte est réservé aux points de connexion de sortie — on n'y
entre jamais.

**Source :** batch 2, idée n° 8 (`docs/superpowers/2026-09-01-batch2-idees.md`).

---

## 1. Règles

| Règle | Décision |
|---|---|
| Sortie de la source | Toujours le **bord droit** de la carte source, à la hauteur d'ancre du type de lien (`hier` au-dessus du centre, `bloque` en dessous). |
| Entrée dans la cible | Bord **gauche**, **haut** ou **bas** — jamais la droite, réservé aux sorties. L'entrée verticale se fait au centre de la carte. |
| Passage sur une carte | Interdit. Chaque segment est validé contre toutes les cartes du plan (hors les deux bouts) gonflées d'une **marge de 12 px** ; les bords de la source et de la cible sont validés sans marge, le test intérieur strict épargnant les ancrages posés dessus. |
| Aucun chemin | Repli sur le **tracé historique** (peut passer derrière une carte) : mieux vaut une flèche partielle que pas de flèche. |
| Réglage « courbe » / « angulaire » | Conservé. Le tracé simple garde exactement son rendu actuel ; le tracé routé se rend en polyligne à coins arrondis (rayon 12) en courbe, à angles vifs en angulaire. |

## 2. Ordre d'essai (`Ariane.traceFlecheArticulation`)

1. **Tracé simple inchangé** (courbe de Bézier, ou H-V-H en angulaire) dès
   qu'il ne frôle aucune carte et que l'entrée à gauche est possible (cible
   franchement à droite, à 24 px près comme aujourd'hui). Aucun changement
   visible dans les cas qui marchaient déjà.
2. **Routage.** Entrées essayées dans l'ordre : gauche (si la cible est à
   droite), puis le vertical qui se justifie (cible au-dessus → entrée par le
   bas ; cible en dessous → entrée par le haut), puis l'autre vertical, puis
   la gauche en dernier recours (long contour). Pour l'entrée à gauche, trois
   gabarits : *direct* dans l'entre-deux, puis couloir **par-dessus** ou
   **par-dessous** les cartes du passage — le couloir est posé juste à
   l'extérieur de la carte la plus englobante. Le premier gabarit dont tous
   les segments sont libres gagne.
3. **Repli historique** si aucun gabarit n'est libre.

Les verticales de sortie et d'approche sont posées à 22 px des bords (`ecart`),
sans rattrapage dynamique : si une carte jouxte, le gabarit échoue et le
suivant est essayé. L'ensemble des gabarits est volontairement borné —
prévisible et éprouvable ; les dispositions que rien ne sauve retombent sur le
repli, et se corrigeront au cas par cas.

## 3. Fonctions pures (éprouvées hors Obsidian)

| Fonction | Rôle |
|---|---|
| `Ariane.segmentFrappe(x1, y1, x2, y2, cartes, marge)` | un segment (vertical, horizontal, oblique échantillonné) touche-t-il une carte gonflée ? |
| `Ariane.flecheEncombee(x1, y1, mx, x2, y2, cartes, marge)` | le tracé simple « courbe » passe-t-il sur une carte ? (échantillonnage de la même Bézier que le rendu) |
| `Ariane.routeFlecheArticulation(sortie, cible, obstacles, opts)` | renvoie la première polyligne libre et son côté d'entrée, ou `null` |
| `Ariane.cheminPolyligne(points, rayon)` | rend la polyligne en `d` SVG, coins arrondis ou vifs, points alignés dédupliqués |
| `Ariane.traceFlecheArticulation(o)` | la décision complète : simple → routé → historique |

`_traceArete` devient l'adaptateur : il rassemble la géométrie (positions,
hauteurs de cartes dépliées, obstacles = toutes les cartes sauf les deux
bouts) et appelle la décision pure. L'étiquette d'un lien routé se pose au
milieu du plus long segment ; le tracé simple garde sa position d'origine.

## 4. Hors périmètre

La flèche fantôme du glissé (`tirerArete`), les flèches de la frise (des barres,
pas de cartes), les badges de groupes repliés, et le déplacement automatique
des cartes pour faire de la place.

# Batch 2 — demandes utilisateur (à brainstormer après la fusion de `calendrier-ergonomie`)

Reçu le 2026-09-01, pendant la revue finale de la branche `calendrier-ergonomie`.
Statut : **non traité** — à passer par brainstorming → spec → plan → SDD. Rien n'est
implémenté. Certains points recoupent / révisent des tâches de `calendrier-ergonomie`
(notamment le rendu des tâches sur le calendrier) : à réconcilier au design.

## Général / multi-fenêtre / réglages

1. **Multi-fenêtre / écran secondaire.** Toutes les fonctionnalités doivent marcher
   dans une 2ᵉ fenêtre Obsidian sur un écran secondaire. Exemple constaté : le
   glisser (et l'allongement / rétrécissement) des barres de la frise **ne
   fonctionne pas** dans une nouvelle fenêtre sur écran secondaire. (Piste :
   `document` / `window` capturés au lieu de ceux de la fenêtre de la vue ;
   `registerDomEvent` sur le bon `doc`.)

2. **Undo / Ctrl+Z / Cmd+Z dans la frise ET l'articulation.** Déplacer une barre
   puis Ctrl+Z → la barre revient à sa position de départ. Déplacer une carte dans
   l'articulation puis Ctrl+Z → retour à la position d'origine. Etc.

3. **Réglages du plugin.** Ajouter les réglages jugés pertinents pour toutes les
   modifications de ce batch (préfixe de tags Apple Rappel, etc.).

## Frise

4. **Persistance de la zone de dates.** Quand on change de fenêtre puis revient sur
   la vue frise, elle repart toujours au début. Conserver la position (zone de
   dates travaillée) par vue et y revenir à la réouverture / au retour de focus.

5. **Traits de lignée hiérarchique — plusieurs problèmes.**
   - Au survol de la tâche mère, le trait ne se pose que sur la tâche fille
     directement adjacente (juste au-dessus ou juste en dessous), pas sur toutes.
   - Cas « la fille commence en même temps que la mère » : le trait est un simple
     segment vertical du début de la mère au début de la fille — pas esthétique.
     Vouloir un **petit angle droit**.
   - Dans ce cas précis, le point d'accroche du trait doit être **au centre de
     l'extrémité gauche** de la barre fille, pas en bas à gauche.

6. **Blocage hérité par les filles.** Quand une tâche mère bloque une autre tâche
   (dont elle n'est pas la parente), les filles de cette mère bloquent aussi cette
   tâche → donc **empêcher de créer un lien bloquant** d'une fille vers cette même
   tâche (redondant / dérivé).

## Articulation

7. **Undo** (voir point 2).

8. **Routage des flèches autour des cartes.** Une flèche ne doit jamais passer
   **sur** une carte ; elle doit toujours être visible en entier, sauf si aucun
   chemin n'existe. Points d'accroche possibles partout sur la carte (haut, bas,
   gauche) **sauf le côté droit** (réservé aux points de connexion de sortie).
   Donc la flèche contourne la carte pour éviter le bord droit.

9. **Zone morte sous une carte aux propriétés dépliées.** Quand on déplie les
   propriétés d'une carte, on ne peut plus déplacer le canvas quand la souris est
   dans une certaine zone **sous** la carte — comme une zone invisible qui capte.

10. **Zones / groupes nommés + propriété thématique.**
    - Pouvoir tracer des zones englobant plusieurs cartes et les **nommer**.
    - De concert : nouvelle **propriété de tâche « thématique »** (ex. « cours de
      gestion », « livres sur la littérature systémique »).
    - Nommer une zone → écrit automatiquement ce nom comme propriété thématique
      sur chaque carte qu'elle contient.
    - Sur Apple Rappel : représenté par des **tags**.
    - La recherche d'articulation trouve aussi les zones.
    - Filtrer selon la propriété thématique dans les filtres de la base de la vue
      articulation (afficher / masquer des zones).
    - Réglage : **préfixe** de tags Apple Rappel (distinguer les tags du plugin de
      ceux d'autres rappels).

11. **Redimensionner la longueur des cartes** (curseur sur l'extrémité gauche)
    pour afficher le titre de façon plus ou moins importante.

## Création de tâche

12. **Création en Markdown, pas d'aperçu.** Quand on ajoute une tâche via
    l'interface, la note doit être directement en mode Markdown / édition (comme
    quand on remplit une note en mode édition), pas une fenêtre d'aperçu.

## Calendrier (révise partiellement `calendrier-ergonomie` Task 4)

13. **Rendu des tâches (≠ créneaux).** Privilégier les **créneaux horaires**. Les
    tâches courtes doivent être **discrètes** : de très fines barres à la bonne
    couleur, en **haut de la case**, comme des mini-barres de frise.
    Les barres **ne s'arrêtent pas aux cases** pour resurgir à la suivante : elles
    sont **continues** jusqu'à l'échéance.

14. **Jalons dans l'en-tête de la case** du calendrier, comme dans le plugin de
    référence `obsidian-day-planner` (sauf si déjà bien traité par les modifs de
    `calendrier-ergonomie` non encore testées).

## Rappel de contexte

Plugin de référence fourni : `obsidian-day-planner` (ivan-lednev) — cloné en
scratchpad pendant le chantier `calendrier-ergonomie`, à re-cloner au besoin.

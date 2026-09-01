# Zones thématiques de la vue articulation — design

Date : 2026-09-01 · Branche : `frise-retards-numerotation` · Origine : idée n° 10
du lot 2 (`docs/superpowers/2026-09-01-batch2-idees.md`).

## 1. But

Tracer sur le canvas de l'articulation des **zones nommées** englobant des
cartes ; le nom d'une zone devient la **propriété thématique** de chaque tâche
qu'elle contient (« cours de gestion », « littérature systémique »…). La
propriété est ensuite filtrable comme n'importe quelle propriété de base.

Décisions tranchées avec Monsieur (2026-09-01) :

1. **Recalcul à chaque glissé** — déposer une carte dans/hors d'une zone met à
   jour sa thématique automatiquement (aucune action manuelle requise).
2. **Une seule valeur** par tâche (texte simple) ; si des zones se chevauchent,
   la **dernière zone du tableau** contenant la carte gagne.
3. **Z3 (Apple Rappels) reporté** : les tags de Rappels ne sont pas exposés par
   AppleScript ; le pont vers Rappels se fera plus tard (le format de titre
   `{thematique}` est la piste retenue quand il le sera).

## 2. Modèle de données

**Zones** — dans le plan de la vue (`arianeArtPlan`, JSON dans la config de la
vue, aux côtés de `cartes`) :

```json
{ "cartes": [ … ],
  "zones": [ { "id": "z170…", "nom": "Cours de gestion",
               "x": 120, "y": 80, "w": 420, "h": 300 } ] }
```

- Coordonnées **espace scène** (indépendantes du zoom), comme les cartes.
- `id` stable (horodaté) ; `nom` modifiable ; zones **par vue** (elles partagent
  la persistance du plan ; deux vues articulation sur la même tâche peuvent
  diverger — dernière écriture gagne, comme aujourd'hui pour les positions).

**Propriété thématique** — nouveau concept de tâche `thematique` :

- Ajout à `Ariane.CONCEPTS_TACHE` (mappé par `cleT`, donc préfixe/clé
  personnalisée gratuits) → `majTache(ref, { thematique: '…' })` fonctionne tel
  quel ; valeur vide écrite `null` (clé sans valeur, convention du plugin).
- Ajout à `Ariane.PROPS_GENERIQUES` (`{ cle: 'thematique', defaut: 'Thématique',
  icone: 'folder-tree' }`) pour le nom affiché et l'icône.
- **Pas** dans `GROUPES_TACHE`/`defautsNoyau` : on ne sème pas une clé vide dans
  toutes les notes existantes ; la clé n'apparaît que lorsqu'une zone écrit.
- Sur la carte dépliée : la thématique s'affiche parmi les propriétés courantes.

## 3. Règle d'adhésion (uniforme)

Une fonction pure statique décide, à tout instant, la thématique d'une carte :

```
Ariane.thematiqueDe(zones, x, y)  → nom de la DERNIÈRE zone (ordre du tableau)
                                    dont le rect contient le point (centre de
                                    la carte), sinon ''
Ariane.changementsThematique(zones, cartes, refs) →
    [{ ref, thematique }] restreinte aux cartes dont la valeur calculée
    diffère de la valeur actuelle (aucune écriture inutile)
```

Recalcul déclenché par : fin de glissé de carte(s), création de zone, deletion
de zone, déplacement/redimensionnement de zone, renommage. La même règle
partout — la propriété reflète toujours la géométrie, jamais l'historique.

## 4. Interactions

- **Tracer** : bouton « Nouvelle zone » de la barre d'outils → mode tracé
  (curseur reticle), glisser sur le fond dessine le rect, Échap annule ; à la
  pause, une modale demande le **nom** (le tracé s'abandonne si vide).
- **Rendu** : rect SVG **sous** les cartes — fond translucide, bordure, nom en
  étiquette en haut à gauche. Les cartes restent pleinement cliquables (le rect
  de zone est en premier plan du fond, derrière les nœuds).
- **Manipuler** : glisser à l'intérieur déplace la zone ; poignées aux quatre
  coins pour redimensionner (min. 80×60) ; clic droit → Renommer / Supprimer.
  Un glissé qui commence sur une carte déplace la carte (comportement inchangé).
- **Supprimer** une zone : les cartes contenues **dans les zones restantes**
  sont recalculées ; une carte qui n'est plus dans aucune zone perd sa
  thématique. (La suppression répercute donc la géométrie, comme partout.)

## 5. Annulation / rétablissement

Chaque geste pousse sa paire `{ annule, retablit }` (mécanisme existant) :

- **glissé de cartes** : l'annulation restaure positions **et** thématiques
  d'avant ; le rétablissement les rejoue ;
- **création** : annule = retire la zone + restaure les thématiques modifiées ;
  rétablit = recrée la zone + recalcule ;
- **suppression** : symétrique de la création ;
- **renommage** : restaure le nom + les thématiques écrites ;
- **déplacement/redimensionnement de zone** : restaure le rect + thématiques.

Les thématiques capturées = valeurs d'avant le geste des cartes touchées
(`majTache` réécrit exactement ces valeurs).

## 6. Filtres et loupe (Z4)

- La propriété étant une propriété de tâche ordinaire déclarée au gestionnaire
  de types, les **filtres natifs de la base** suffisent à afficher/masquer des
  zones de tâches — rien à construire.
- Loupe : une carte hors filtre s'assombrit (comportement existant) ; **nicety
  optionnelle** (si gratuite) : étiquette de zone assombrie quand toutes ses
  cartes sont hors filtre.
- « La recherche d'articulation trouve aussi les zones » : couvert par le filtre
  de base sur `thematique` (pas de champ de recherche séparé dans la vue).

## 7. Tests (`node --test`, statiques pures + faux moteur)

- `thematiqueDe` : contenance, chevauchement (dernière gagne), vide.
- `changementsThematique` : ne propose que les cartes dont la valeur change.
- Paire undo/redo d'un glissé avec thématiques (faux moteur, motif
  `tests/annulation.test.js`).
- Lecture/écriture du plan tolérante : `zones` absent ou mal formé → `[]`.

## 8. Hors périmètre (assumé)

- Z3 Rappels (tags impossible en AppleScript ; `{thematique}` en titre plus tard).
- Zones partagées entre vues ou globales au coffre.
- Zones rondes/polygonales, couleur par zone (une teinte unique, sobre).

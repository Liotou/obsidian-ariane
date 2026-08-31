# Numérotation des références de tâche & titre du rappel Apple — conception

**Date :** 2026-09-01
**Statut :** validé (échange en session)

## Problème

La référence d'une tâche est figée : `T` + année sur deux chiffres + `-` + rang
sur trois chiffres (`T26-001`), avec remise à zéro chaque janvier. Le titre du
rappel Apple est figé lui aussi : `[T26-001] - Intitulé`. Deux demandes :

1. L'utilisateur veut choisir la **forme de la référence**. Contrainte unique :
   la numérotation reste **incrémentale**. Le reste (préfixe, séparateur, largeur
   du nombre) est libre. **L'année disparaît** : plus de remise à zéro annuelle,
   un seul compteur global.
2. L'utilisateur veut choisir la **forme du titre du rappel** : `[T26-001] - X`,
   `[T26-001] X`, `T26-001. X`, etc.

## Modèle : moteur de gabarit à jetons

`Ariane.formatModele(modele, vars)` — remplace dans `modele` :

- `{n}` → `vars.n` tel quel ; `{n:3}` → `vars.n` complété de zéros à gauche
  sur 3 chiffres (au moins ; un nombre plus large n'est pas tronqué) ;
- `{clé}` → `vars.clé` si défini, sinon le jeton est laissé verbatim ;
- tout le reste est littéral.

Partagé par la référence (`vars = { n }`) et le titre du rappel
(`vars = { ref, intitule, famille }`).

## 1 · Forme de la référence

- Réglage `refGabarit`, défaut **`T-{n:3}`** → `T-001`, `T-002`, …
- Doit contenir **exactement un** jeton `{n}` / `{n:W}`. Sinon : champ en
  erreur, réglage non enregistré (on garde la valeur précédente).
- `Ariane.referenceTacheSuivante(noms, gabarit)` — le 2ᵉ argument devient le
  gabarit (et non l'année) :
  - on découpe le gabarit en `prefixe + {n[:W]} + suffixe` ;
  - `max` = plus grand nombre parmi
    - les noms qui collent **exactement** à `prefixe + chiffres + suffixe`,
    - **plus** les noms de forme héritée `T\d{2}-\d+` (seule forme jamais
      produite par Ariane jusqu'ici) — ainsi un coffre déjà numéroté `T26-041`
      continue à **42**, il ne repart pas à 1 ;
  - retour : `formatModele(gabarit, { n: max + 1 })`, largeur au moins `W`.
- **Coexistence / migration :** les notes existantes gardent leur nom (la
  référence **est** le nom de fichier). Le nouveau gabarit ne vaut que pour les
  tâches créées ensuite. La forme héritée `T\d{2}-\d+` reste reconnue partout
  (`refDepuisChemin`, rappels).

### Sites dépendants

| Site | Changement |
|---|---|
| `referenceTacheSuivante(noms, annee)` | 2ᵉ arg = gabarit ; scan exact + héritée |
| `creerTache` | passe `this.settings.refGabarit` |
| `releverRappels` (création d'une tâche depuis un rappel orphelin) | passe le gabarit ; le bump de collision incrémente les chiffres de fin de la réf, quelle que soit la forme |
| `refDepuisChemin` | inchangé (dossier + repli `T\d{2}-\d{3,4}`) |
| Aide de l'onglet Tâches | « référence selon la forme réglée ci-dessous » |
| README FR + EN | mention de la forme réglable |

## 2 · Titre du rappel Apple

- Réglage `rappelsFormatTitre`, défaut **`[{ref}] - {intitule}`**.
- Construction du rappel : `Ariane.formatModele(s.rappelsFormatTitre,
  { ref, intitule, famille })`.
- **Relève** (rappel ajouté à la main, rattaché à une tâche existante) :
  la détection ne suppose plus `^\[T\d+-\d+\]`. On cherche, dans le titre du
  rappel, un jeton entre crochets qui soit une référence connue ; à défaut, une
  référence connue (longueur ≥ 3) présente en sous-chaîne. `refsTaches` est déjà
  construit dans `releverRappels`.

## Réglages (onglet Tâches)

- « Forme de la référence » — champ texte + aperçu en direct (`n = 1`) + aide
  courte sur `{n}` / `{n:3}`.
- « Titre du rappel Apple » — champ texte, dans la section Apple Rappels, +
  aperçu (`ref = T-001`, intitulé d'exemple).

## Tests

- `formatModele` : `{n}`, `{n:3}`, jeton inconnu laissé verbatim, littéraux.
- `referenceTacheSuivante` : gabarit par défaut ; suite ; forme héritée reprise ;
  gabarit sans préfixe `{n:4}` ; gabarit `TASK-{n}` ; > largeur.
- `reference.test.js` réécrit (l'ancienne signature `(noms, annee)` disparaît).

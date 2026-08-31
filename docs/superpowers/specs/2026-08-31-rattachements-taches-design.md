# Rattachements entre tâches — règles arrêtées

**But :** fixer les règles qui régissent la hiérarchie parent/fille (rattachement)
et son articulation avec les relations bloquantes, dans la frise et l'articulation.

**Sources :** échange de conception du 2026-08-31 + `questionnaire_arborescence_taches.docx`.

---

## 1. Structure de l'arbre

| Règle | Décision |
|---|---|
| Nombre de parents par tâche | **Un seul** (`Rattachement` = valeur unique). Ce qui garde l'arbre lisible. |
| Rattachement inter-famille / inter-dossier | **Libre**, aucun contrôle. |
| Rattachement d'un jalon | Un **jalon ne peut pas être parent** : c'est une date-butoir, pas un conteneur. |
| Profondeur | Non limitée. |
| Suppression d'une mère | Les filles sont **re-rattachées au grand-parent**. S'il n'y a pas de grand-parent, elles deviennent **orphelines (racines)** — jamais supprimées. |

## 2. Dates

**Modèle retenu : hybride (option 1c).**

- Chaque tâche a des **dates propres** (`Début`, `Échéance`) éditables directement,
  y compris une mère.
- La **barre affichée d'une mère** couvre l'**union** :
  `début = min(propre.début, min filles.début)`,
  `échéance = max(propre.échéance, max filles.échéance)`.
- Cohérent avec « la composition prime » du questionnaire (Q6) : une fille plus
  tardive que l'échéance propre de la mère **repousse** l'échéance affichée ; une
  échéance propre plus tardive que toutes les filles l'étend aussi. Les deux sens
  = union.

**Déplacements et redimensionnements :**

| Geste | Effet |
|---|---|
| Redimensionner une barre (n'importe laquelle, mère comprise) | écrit les **dates propres** de cette tâche. |
| Déplacer une **mère** | décale **tout le sous-arbre** du même nombre de jours (`decalerSousArbre`), écrit chaque fille. |
| Déplacer une **fille** hors des bornes de sa mère | la **mère s'étend** pour la contenir : ses **dates propres** sont réécrites (`min`/`max` avec la fille). |
| Aperçu pendant le glissé d'une fille | l'**enveloppe de la mère se redessine en direct**, pas seulement au lâcher. |

## 3. Blocage — propagation (distinct de la complétion)

Le statut **« bloqué »** se propage automatiquement dans les deux sens :

- **Montante (Q2)** : si une fille est bloquée, la **mère hérite** du statut « bloquée »
  (dérivé, non écrit dans le frontmatter de la mère).
- **Descendante (Q3)** : si une mère est bloquée, **toutes ses filles sont gelées**
  automatiquement.
- **Portée d'un lien bloquant (Q4)** : **aucune restriction** — inter-branches,
  inter-niveaux permis.

## 4. Complétion / avancement — pas de cascade

- Marquer une mère terminée **ne termine pas** les filles ; toutes filles terminées
  **ne terminent pas** la mère. **Aucune proposition** non plus, pour le moment.
- **Avancement d'une mère** = **moyenne des filles pondérée par leur durée**,
  en **lecture seule** (dérivé, non éditable, non écrit).

## 5. Cohérence / cycles

- **Détection unifiée (Q1)** : l'acyclicité se vérifie sur le **graphe fusionné**
  (arbre de composition + arcs de blocage), pas sur chaque structure isolément.
- **Ordre topologique (Q5)** : recalculé à **chaque modification** de structure.
- **À l'ajout d'une relation** : un vrai **cycle** du graphe fusionné est **refusé**.
- **Contradictions plus molles** (ex. A parent de B *et* A bloquée par B ; blocage
  redondant avec une contrainte de composition) : **autorisées mais signalées**
  dans une **vue « Incohérences »** enrichie, avec des actions de correction.
- **Chemin critique (Q7)** : **hors périmètre** de la première version.

---

## Points confirmés (2026-08-31)

1. **À l'ajout d'une relation** : un **vrai cycle** du graphe fusionné est **refusé** ;
   les contradictions plus molles (A parent de B *et* A bloquée par B, blocage
   redondant avec une contrainte de composition) sont **autorisées mais signalées**
   dans la vue « Incohérences ».
2. **« Gelée » descendante (Q3)** : les filles d'une mère bloquée passent en statut
   **« bloquée » dérivé** (non écrit dans le frontmatter), cohérent avec la
   propagation montante.

---

## Découpage de mise en œuvre

- **Tranche A — Dates (§2).** Modèle hybride, fille-hors-bornes étend la mère,
  aperçu en direct. Bornée, une vue touchée (frise). Prête à lancer.
- **Tranche B — Blocage propagé (§3).** Statut « bloquée » dérivé montant/descendant.
  Touche frise + articulation + calcul d'incohérences.
- **Tranche C — Avancement dérivé (§4).** Moyenne pondérée en lecture seule.
- **Tranche D — Incohérences unifiées (§5).** Graphe fusionné, refus de cycle à
  l'ajout, vue « Incohérences » enrichie avec corrections.

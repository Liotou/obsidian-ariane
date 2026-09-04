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
- **Interdiction immédiate** : tout lien (rattachement ou blocage) qui fermerait
  un cycle du graphe fusionné est **refusé au moment où on l'ajoute**, avec un
  message. Pas de vue d'incohérences à consulter après coup — on ne laisse pas
  l'incohérence s'installer. `Ariane.lienValide(arêtes fusionnées, {}, ajout)` ;
  points d'entrée : `greffon.rattacher`, `greffon.creerBlocage`, la modale de
  tâche. Le combo « A parent de B *et* A bloquée par B » EST un cycle fusionné,
  donc couvert.
- **Modification manuelle** de « Rattachement » ou « Bloquée par » — dans la note
  de tâche **ou dans une base normale** (même événement `metadataCache.changed`) :
  si le graphe fusionné contient alors un cycle passant par cette tâche, l'entête
  **revient aussitôt** à son dernier état sain (`greffon.veillerRattachements`,
  baseline `_rattachOk` semée au chargement). L'utilisateur voit un message.
- Un lien **redondant mais cohérent** (A parent de B *et* A bloque B) reste permis :
  il n'est pas contradictoire.
- La **vue « Incohérences » existante** est conservée telle quelle : elle attrape
  ce que le greffon ne peut pas empêcher (édition manuelle du frontmatter,
  références mortes, conflits de dates). Elle n'est **pas enrichie**.
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
- **Tranche D — Refus de cycle à l'ajout (§5).** Graphe fusionné, `lienValide` sur
  `rattacher` / `creerBlocage` / modale. Pas de vue enrichie. **Fait.**

---

## Révision 2026-09-04 (R2) — distinguer « bloquée » et « impactée »

Le retour d'usage a montré que la propagation **montante** telle que définie en
§3 (Q2) est trop invasive : enchâîner des lectures par des liens bloquants au
sein d'un même niveau gelait l'arborescence entière de la tâche mère, alors
qu'on ne veut signaler qu'un enchaînement de processus entre sœurs.

Décision — le statut dérivé est scindé en deux états **disjoints**, calculés par
`Ariane.propagerBlocage` (désormais `{ bloquee, impactee }`) :

- **« bloquée »** (opérationnel) : cible directe d'un lien bloquant non clos,
  **plus** le gel descendant (tout le sous-arbre sous une tâche bloquée).
  **L'héritage montante de §3/Q2 disparaît de cet état.**
- **« impactée »** (attentionnel, nouveau) : toute tâche ayant une descendante
  bloquée (transitif), sans être bloquée elle-même. Signalé plus légèrement :
  contour pointillé gris discret sur la barre/jalon de la frise (pas de voile
  hachuré, pas d'héritage du gel) ; bordure pointillée grise sur la carte
  d'articulation. Ligne « impactée » au survol.

Le gel descendant reste le seul mécanisme qui *bloque* ; l'impactée n'est
qu'une remontée d'information vers les mères. Tranche B est révisée en ce sens.

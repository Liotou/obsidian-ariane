# Système de tâches et de rétroplanning

Conception arrêtée le 28 août 2026. Ce document fige le modèle, le partage
d'autorité entre le canvas et les notes, et le contrat des vues. Il précède le
plan d'implémentation et ne décrit aucun code.

## 1. Objet

Ariane gère aujourd'hui la matière documentaire : sources Zotero, annotations,
notes de lecture, références citées. Il lui manque la dimension temporelle, à
savoir ce qui reste à faire, dans quel ordre, et pour quand. Le présent système
ajoute cette dimension **sans créer de second coffre** : une tâche est une note
du coffre comme les autres, citable, liable, visible dans le graphe.

Trois instruments, et trois seulement :

- une **note** par tâche, qui est le lieu de vérité ;
- un **canvas**, où l'articulation se manipule à la souris ;
- une **frise** de type Gantt, où le calendrier se manipule à la souris.

## 2. Découpage en chantiers

| # | Chantier | Dépend de |
|---|---|---|
| 1 | Noyau : schéma, référence, formulaires, Bases | rien |
| 2 | Articulation : synchronisation canvas ↔ notes, garde-fous | 1 |
| 3a | Frise Gantt | 2 |
| 3b | Greffon de la vue canvas (refus du geste, bandeaux) | 2 |
| 4 | Pont vers Apple Rappels | 1 |
| 5 | Capture en langage naturel | 1 |
| 6 | Export tableur | 3a |
| 7 | Reprise de l'existant | tous |

Les chantiers 4 et 5 ne dépendent que du noyau et peuvent être avancés si le
confort quotidien prime sur la planification. Le chantier 7 vient en dernier,
par décision expresse.

## 3. La note de tâche

### 3.1 Emplacement et référence

Une tâche est une note de `8 - Tâches/`. Son nom de fichier est sa référence,
de la forme `T26-042` : la lettre `T`, l'année de création sur deux chiffres, un
tiret, le rang dans l'année sur trois chiffres, étendu à quatre au-delà de 999.

Le compteur est le plus grand rang déjà employé pour l'année en cours, augmenté
de un. Il repart chaque janvier.

L'horodatage employé par les notes conceptuelles (`NC-202607081912`) est écarté
pour une raison mesurée sur les références en attente : un lot importé produit
plusieurs objets dans la même minute, et l'horodatage cesse alors d'être unique.
Le chantier 7 est exactement ce lot.

La référence n'encode ni la famille ni le statut : une référence ne doit porter
que ce qui ne changera jamais, sous peine de devoir renommer la note et de
casser les liens qui la citent.

L'intitulé figure en `aliases:` et en titre de niveau 1, comme dans les notes
conceptuelles.

### 3.2 Frontmatter

```yaml
---
aliases:
  - Rédiger l'état de l'art
type: tache
statut: à faire          # à faire | en cours | en attente | terminée | abandonnée
priorite:                # (vide) | basse | moyenne | haute
debut:                   # AAAA-MM-JJ
echeance:                # AAAA-MM-JJ
avancement: 0            # entier de 0 à 100, saisi à la main
jalon: false
parent:                  # "[[T26-012]]" ou "[[T26-012|libellé]]"
bloque-par: []           # ["[[T26-038|données livrées]]", …]
source:                  # "[[@perrowNormalAccidents1984]]"
livrable:                # "[[3 - Notes conceptuelles/NC-202607081912]]"
fichier:                 # "/Users/…/soutenance.pptx"
liste:                   # liste Apple Rappels cible
rappel-id:
cree: 2026-08-28
modifie: 2026-08-28
---

# Rédiger l'état de l'art

## Note de travail

## Journal
```

Le corps porte deux sections. **Note de travail** est l'espace de production :
idées, plan, remarques, et pour les tâches simples le livrable lui-même.
**Journal** reçoit l'historique daté.

### 3.3 La famille est déduite, jamais déclarée

Il n'existe pas de champ `famille`. Elle se lit du champ rempli :

| Champ rempli | Famille | Ce que la note affiche en plus |
|---|---|---|
| `source` | lecture | boutons vers la fiche `@source`, vers le lecteur ZotFlow, vers Zotero |
| `livrable` | production interne | lien vers la note produite |
| `fichier` | production externe | dernière modification et dernière ouverture, lues par `mdls` |
| aucun | action | rien |

Un seul de ces trois champs peut être rempli. Si plusieurs le sont, Ariane
retient `source`, puis `livrable`, puis `fichier`, et signale la note dans le
volet des incohérences.

Ce choix supprime toute possibilité de contradiction entre une famille déclarée
et les champs effectivement présents.

### 3.4 Deux relations, à ne pas confondre

- `parent:` exprime la **composition**. « Rédiger l'état de l'art » contient
  « Rédiger la partie sur la gouvernance des risques ». Dans la frise, la barre
  du parent couvre celles de ses enfants.
- `bloque-par:` exprime la **séquence**. « Analyser les données » est bloquée par
  « Obtenir les données INERIS ». Dans la frise, cela dessine une flèche.

Les deux peuvent coexister sur une même tâche. Les écraser sous un seul mot rend
la frise incalculable, une barre ne pouvant pas à la fois s'étendre sur une autre
et pointer vers elle.

### 3.5 Le libellé d'un lien est porté par l'alias

Un lien nommé s'écrit `[[T26-038|données livrées]]`. La syntaxe d'alias
d'Obsidian résout le lien, préserve l'arête dans le graphe, et transporte le
libellé jusqu'au canvas et jusqu'à la frise. Aucun champ supplémentaire n'est
nécessaire.

### 3.6 Jalons

`jalon: true` marque une tâche comme repère de calendrier. Elle se dessine en
losange et d'un trait vertical traversant toute la frise. Une tâche d'action
telle qu'« envoyer le document au comité » est ainsi à la fois cochable et
structurante, sans être deux objets.

## 4. Saisie

Ariane possède le formulaire et écrit la note directement. Templater n'est plus
un point d'entrée : le modèle `97 - Modèles/Templater/Templates/Tâche.md` est
supprimé, sa raison d'être étant absorbée.

Le formulaire demande l'intitulé, la famille, puis selon la famille la source
Zotero, la note livrable ou le fichier externe, et enfin les dates, la priorité
et la liste Rappels. Il ne demande jamais la référence, qui est calculée.

## 5. Vues de travail

`8 - Tâches/Tâches.base`, aujourd'hui vide, reçoit quatre vues :

- **Débloquées** : statut `à faire` ou `en cours`, dont aucune entrée de
  `bloque-par` n'est encore terminée. C'est la vue quotidienne, et la seule qui
  réponde à la question « que puis-je attaquer maintenant ».
- **Cette semaine** : échéance dans les sept jours, non terminées.
- **Par famille** : regroupée sur la famille déduite.
- **Terminées** : archive, triée sur `termine-le`.

La frise est un instrument de planification trimestrielle. Elle ne remplace pas
la vue *Débloquées* et ne doit pas être conçue pour cela.

## 6. Articulation par canvas

### 6.1 Partage d'autorité

L'autorité se partage **par nature d'information**, jamais par fichier. C'est ce
qui rend la bidirectionnalité sûre.

| Information | Propriétaire | Copie |
|---|---|---|
| Position, taille d'un nœud | canvas | jamais recopiée |
| Arêtes et leurs libellés | **canvas** | canvas → frontmatter |
| Existence du nœud, intitulé, statut, dates | **note** | note → canvas |
| Couleur du nœud | note, via le statut | note → canvas, désactivable |

Aucune information n'a deux maîtres.

### 6.2 Ce qu'est un canvas de tâches

Tout fichier `.canvas` du coffre comportant au moins un nœud de type `file`
pointant vers une note `type: tache`. Aucun dossier convenu, aucun réglage.
Monsieur crée un canvas par chantier et une tâche peut figurer dans plusieurs.

### 6.3 Sémantique des arêtes

- Arête **sans couleur** : `fromNode` **bloque** `toNode`.
- Arête de la **couleur de composition**, réglable, violet par défaut :
  `fromNode` est le **parent** de `toNode`.
- Arête **rouge** : réservée au signalement d'incohérence par Ariane. Elle se
  lit comme un blocage. Monsieur ne doit pas employer le rouge pour son compte.
- Le `label` de l'arête devient l'alias du lien dans le frontmatter.

### 6.4 Règle d'union entre canvas

Pour tout couple ordonné (A, B), le lien existe si et seulement si **au moins un**
canvas de tâches contient une arête de A vers B.

Il en découle qu'effacer une arête dans un canvas ne supprime le lien que si
aucun autre canvas ne le porte. Sans cette règle, ouvrir un canvas partiel
effacerait les liens tracés ailleurs.

### 6.5 Écriture à la main dans le frontmatter

Un lien ajouté à la main dans une note est accepté et poussé comme arête dans
tout canvas contenant déjà les deux nœuds. S'il n'en existe aucun, le lien vit
dans la note et se dessine dans la frise, sans canvas.

### 6.6 Boucles de rétroaction

Ariane marque ses propres écritures et ignore les événements de fichier qu'elles
provoquent. Les modifications sont regroupées sur un court délai avant d'être
appliquées, de façon qu'un glissé de plusieurs nœuds ne déclenche qu'une passe.

## 7. Garde-fous

Trois contrôles, appliqués à chaque synchronisation :

1. **Cycle de blocage.** `A bloque B bloque A` rend la disposition de la frise
   incalculable. Le cycle est détecté sur le graphe de `bloque-par`, la dernière
   arête ajoutée est refusée, et l'ensemble est signalé.
2. **Cycle de composition.** Même contrôle sur `parent`, où un cycle produirait
   en outre une descente infinie.
3. **Dates incohérentes.** Si A bloque B et que `B.debut` précède `A.echeance`,
   l'arête est teinte en rouge et inscrite au volet des incohérences.

Obsidian ne permet pas d'intercepter le tracé d'une arête depuis l'API publique.
Le refus du geste au moment où il se produit relève du chantier 3b et repose sur
des rouages internes non documentés. Le chantier 2 doit donc être complet et
utilisable sans lui : si le greffon cesse un jour de s'accrocher, on retombe sur
le signalement en rouge, sans rien perdre d'autre.

## 8. Frise Gantt

Vue propre à Ariane. Bases ne sait pas dessiner une frise.

**Disposition.** Deux colonnes : à gauche l'arbre des tâches, indenté sur
`parent` et repliable ; à droite la frise, avec un trait vertical marquant le
jour même.

**Barres.** De `debut` à `echeance`, remplies à hauteur de `avancement`, teintées
par `statut`. Le déplacement décale les deux dates, le tirage d'un bord n'en
change qu'une, et l'écriture dans le frontmatter a lieu au lâcher.

**Méta-tâches.** Une tâche ayant des enfants s'affiche comme barre de synthèse
couvrant du premier début à la dernière échéance de sa descendance. La déplacer
décale tout son sous-arbre d'un bloc.

**Flèches.** Dessinées d'après `bloque-par`, avec leur libellé. **Jamais
créées ici** : le canvas seul crée les liens. Conséquence du partage d'autorité,
et garantie qu'un même geste n'existe pas à deux endroits.

**Jalons.** Losange sur la frise et trait vertical traversant le tableau.

**Réordonnancement en aval.** Déplacer une barre au-delà d'une tâche qu'elle
bloque n'est pas empêché : la flèche vire au rouge et un bouton propose de
décaler toute la chaîne aval de la même durée. La propagation du retard reste
une décision.

**Tiroir des non planifiées.** Les tâches sans dates s'alignent dans un bandeau
au-dessus de la frise et se glissent sur celle-ci pour recevoir leurs dates. La
capture en langage naturel y déverse ce qui est jeté au vol.

**Zoom** de la semaine à l'année. Le clic sur une méta-tâche replie la frise sur
son sous-arbre, sans quoi un rétroplanning de thèse devient illisible dès la
trentième tâche.

## 9. Pont vers Apple Rappels

Rappels est une **projection**, non un pair. La structure vit dans Obsidian ;
Rappels porte ce qui a du sens sur un téléphone et alimente le glisser-déposer
vers Calendrier.

**Aller.** Intitulé, échéance, priorité, liste. Le corps du rappel reçoit la
référence et un lien `obsidian://`. La clé de jointure est `rappel-id`.

**Retour, volontairement étroit.** Deux signaux seulement : la tâche a été cochée
sur le téléphone, et l'échéance a été déplacée. Rien d'autre ne remonte.

**Conflit.** La date de modification la plus récente l'emporte, et le cas est
inscrit au volet des incohérences plutôt que résolu en silence.

**Outillage.** Les scripts EventKit `rappels-lire.js` et `rappels-ecrire.js`
existent dans `~/Library/Application Support/Ariane/` et rendent 113 rappels en
moins de 300 ms. AppleScript est proscrit pour la lecture ou l'écriture en
nombre. Le script d'écriture devra être étendu à la mise à jour d'échéance.

## 10. Capture en langage naturel

Sur l'infrastructure déjà présente : Ollama, LM Studio, API Mistral, Claude CLI.

Monsieur tape « lire l'article de Perrow avant vendredi, urgent ». Le modèle rend
un objet contenant l'intitulé, l'échéance, la priorité, la famille et
éventuellement une source citée. La source est résolue contre les fiches Zotero
par la fonction d'appariement auteur-année déjà écrite pour les références en
attente.

Le résultat **pré-remplit le formulaire** et n'écrit jamais directement. Un
modèle local se trompe, et une tâche fausse écrite en silence coûte plus cher
qu'une confirmation.

## 11. Export

Ariane n'a ni empaqueteur ni dépendance : ni bibliothèque de tableur, ni
compression, donc **pas de `.xlsx`**. L'export produit un **CSV**, qu'Excel et
Numbers ouvrent directement, avec une ligne par tâche et les colonnes
référence, intitulé, famille, statut, priorité, début, échéance, avancement,
parent, bloque-par, jalon.

## 12. Reprise de l'existant

En dernier, par décision expresse.

- Les tâches vivant dans les listes Apple Rappels sont importées en notes, et
  reçoivent `T25-xxx` ou `T26-xxx` selon leur date de création réelle, ce qui les
  insère au bon endroit dans la chronologie.
- Le modèle Templater `Tâche.md` est supprimé.
- Les anciennes conventions de champs sont abandonnées sans reprise.

## 13. Hors périmètre

Écartés pour l'instant, et à ne pas anticiper dans le code : le suivi du temps
passé, les tâches récurrentes, les personnes assignées, les champs
personnalisables par projet, et la synchronisation vers Calendrier Apple, qui
reste assurée par l'outil de Monsieur depuis Rappels.

# Ariane en modules : réglages clairs, accueil et tutoriel

Date : 2026-10-26. Validé par Monsieur en conversation, partie par partie.

## But

Rendre Ariane utilisable par un large public de chercheurs, et non plus
seulement par celui qui l'a fait naître :

- le cœur, l'intégration des annotations Zotero dans l'écriture, est mis en
  avant ; le reste devient une série de **modules activables** ;
- les **réglages** deviennent clairs : un onglet par module actif, l'essentiel
  en haut, l'expert replié ;
- à la **première installation**, une note de présentation s'ouvre, en
  français ou en anglais, avec un **assistant** qui fait choisir un profil ;
- un **tutoriel** pas à pas, sur un dossier d'exemple, fait faire le parcours
  d'une annotation, de la source jusqu'à la citation.

## Hors champ

- Pas de scission en plusieurs greffons (abandonnée le 2026-09-07) : Ariane
  reste UN greffon, ses modules sont internes.
- Pas de chargement « à chaud » des modules : basculer un module recharge
  Ariane (approche A, voir plus bas).
- La veille de thèse est retirée (fait le 2026-10-26, commit 4ec1e1b) ; elle
  ne devient pas un module.

## Invariant : l'installation de Monsieur ne perd rien

Une installation existante (des réglages déjà enregistrés, sans la clé
`modules`) reçoit le profil « Tout » : tous les modules actifs, rien ne
change pour elle. Aucune note de présentation ne s'ouvre chez elle ; une
commande « Ariane : ouvrir la présentation » la rend accessible.

## 1. Les modules

Identifiants stables (ils vivent dans les réglages) :

| id | Module | Cœur | Dépend de | Mac seul |
|---|---|---|---|---|
| `annotations` | Annotations Zotero : atomisation, verrouillage, notes de lecture, références et auteurs, références en attente | oui | | |
| `citations` | Citations et bibliographie : glisser-déposer, citations repliables, notes de bas de page, bibliographies, panier, notes conceptuelles glissées | oui | | |
| `export` | Export Word (pandoc) | | | |
| `familles` | Familles de notes : notes conceptuelles, réflexives, aparté, préfixes, icônes | | | |
| `typographie` | Ponctuation insécable, numérotation des titres | | | |
| `suggestions` | Suggestions d'annotations (voisinage, index sémantique) | | | |
| `barre` | Barre d'édition flottante | | | |
| `taches` | Tâches : notes de tâche, tableau de bord, frise, calendrier, IA des tâches | | | |
| `canevas` | Canevas : notes en cartes compactes ; cartes de tâches si `taches` | | | |
| `rappels` | Rappels et agendas : Apple, Google, Microsoft | | `taches` | |
| `temps` | Temps et activité : compteur, chronologie, ActivityWatch, iPhone, micro-interruptions ; créneau en barre d'état si `taches` | | | |
| `correcteur` | Correcteur Apple | | | oui |
| `schemas` | Schémas draw.io | | | |
| `claude` | Pont avec Claude : serveurs MCP, compétences | | | |
| `publication` | Publication de site | | | |

Profils proposés par l'assistant :

- **Zotero et écriture** : cœur + `export`, `familles`, `typographie`.
- **Gestion de la thèse** : le précédent + `taches`, `canevas`, `rappels`,
  `temps`.
- **Tout** : tous les modules.

`suggestions`, `barre`, `correcteur`, `schemas`, `claude` et `publication`
restent à activer à la carte dans les deux premiers profils.

Règles de dépendance : activer un module active ce dont il dépend ; couper un
module coupe ce qui dépend de lui, après confirmation qui les nomme.

## 2. Comment un module est coupé (approche A)

- Un **registre** (`MODULES`, données pures) décrit chaque module : id, nom,
  description, dépendances, Mac seul, cœur.
- `this.module(id)` dit si un module est actif (le cœur l'est toujours ; un
  module « Mac seul » ne l'est jamais ailleurs).
- **Tout ce que le démarrage enregistre est étiqueté** de son module :
  commandes, vues, icônes du ruban, extensions de l'éditeur, écouteurs
  d'événements, minuteries, post-processeurs de lecture, entrées de menus. Un
  module coupé n'est pas chargé : rien de lui ne s'enregistre.
- Basculer un module, puis « Appliquer », **recharge Ariane** (désactiver puis
  réactiver le greffon par l'API d'Obsidian), en une seconde, sans
  redémarrer Obsidian.
- Les vues d'un module coupé déjà ouvertes dans l'espace de travail se
  ferment proprement (Obsidian les montre sinon comme « vue introuvable »).
- Les migrations au démarrage (reprises de données, `_…Retire` et autres)
  restent rattachées à leur module : un module coupé ne touche pas au coffre.

## 3. Les réglages

Ordre des onglets :

1. **Accueil** : l'état des prérequis (ZotFlow installé et relié, Zotero et
   Better BibTeX joignables, pandoc trouvé), et trois boutons : ouvrir la
   présentation, lancer le tutoriel, changer de profil.
2. **Modules** : une carte par module (interrupteur, une phrase, dépendances,
   mention « Mac »), bouton « Appliquer » qui recharge Ariane. Les modules du
   cœur sont montrés, sans interrupteur.
3. **Un onglet par module actif**, dans l'ordre du registre. Les réglages
   actuels y sont redistribués (table de correspondance dans le plan).
4. **IA** : affiché si `suggestions` ou `taches` est actif.
5. **Greffons liés** : ZotFlow, Better BibTeX, Annota (existant).
6. **Avancé** : dossiers et leurs rôles, maintenance, export et import du
   profil de réglages, icônes des vues de base.

Dans chaque onglet : l'essentiel en haut ; le reste dans un bloc repliable
« Réglages avancés », replié par défaut. La recherche dans les réglages
existante est conservée et cherche aussi dans les blocs repliés.

## 4. La note de présentation et l'assistant

- **Quand** : à la première installation seulement (aucune donnée enregistrée
  au chargement). Ariane crée la note à la racine du coffre et l'ouvre, puis
  retient `_accueilFait`. Commande « Ariane : ouvrir la présentation » pour
  la rouvrir, ou la recréer si elle a été supprimée.
- **Langue** : celle de l'interface d'Obsidian (français, sinon anglais).
  « Bienvenue dans Ariane.md » ou « Welcome to Ariane.md ». Un lien en tête
  ouvre (en la créant au besoin) la version dans l'autre langue.
- **Contenu** : ce qu'est Ariane en trois phrases ; le parcours d'une
  annotation (Zotero, ZotFlow, note d'annotation, glisser, citation,
  bibliographie, export Word) ; les prérequis ; les modules en une ligne
  chacun ; où trouver l'aide.
- **Zones vivantes** : deux blocs de code que dessine Ariane
  (`registerMarkdownCodeBlockProcessor`) :
  - ` ```ariane-etat ` : les prérequis, cochés ou non, avec la marche à
    suivre pour chacun ;
  - ` ```ariane-profil ` : trois cartes cliquables (les profils), qui
    appliquent les modules et rechargent Ariane ; le profil en cours est
    marqué.
  Sans Ariane, ces blocs s'affichent comme du texte : la note reste lisible.

## 5. Le tutoriel

- Un bouton de la présentation (et de l'onglet Accueil) crée le dossier
  « Ariane - Tutoriel » (« Ariane - Tutorial ») :
  - **une source d'exemple** au format des notes de ZotFlow (marqueur de
    source, trois annotations sur un ouvrage fictif, auteurs fictifs), qui
    s'atomise sans Zotero ;
  - **un brouillon** vide ;
  - **le parcours**, avec un bloc vivant ` ```ariane-tutoriel `.
- Six étapes, qui **se cochent d'elles-mêmes** quand Ariane les constate :
  1. atomiser la source (les trois notes d'annotation existent) ;
  2. ouvrir une annotation ;
  3. la glisser dans le brouillon (une citation y apparaît ; Maj pour
     « Auteur (année) ») ;
  4. voir la bibliographie se construire dans le brouillon ;
  5. replier puis déplier les citations ;
  6. exporter en Word (si pandoc est présent ; sinon, étape signalée comme
     facultative).
- Bouton « Supprimer le tutoriel » : le dossier et les annotations d'exemple
  partent à la corbeille d'Obsidian.
- Point à vérifier en premier (phase 4) : l'atomisation d'une source absente
  de la base Zotero (index des références) doit fonctionner, ou être rendue
  tolérante pour la source d'exemple.

## 6. Langues

Tout texte nouveau passe par `tr()` et reçoit sa traduction anglaise. La
présentation et le tutoriel existent en deux rédactions complètes, non en
traduction mot à mot.

## 7. Tests

- Registre : dépendances, profils, « Mac seul », cœur toujours actif.
- Migration : réglages existants sans `modules` donnent « Tout » ; aucune
  présentation ouverte ; première installation donne la présentation.
- Étiquetage : avec un module coupé, aucune de ses commandes, vues ou
  minuteries n'est enregistrée (greffon factice qui compte les
  enregistrements).
- Présentation et tutoriel : contenu produit (FR et EN), détection des
  étapes faites.
- `tests/structure.test.js` reste vert (nouvelle section, carte mise à jour).

## 8. Phases

Chacune se termine par la suite verte, le dépôt dans le coffre de Monsieur
et un commit ; la publication n'a lieu qu'à la fin, sur sa demande.

1. Registre des modules et étiquetage (rien ne change à l'œil).
2. Réglages refondus (Accueil, Modules, un onglet par module, avancé replié).
3. Note de présentation, zones vivantes, assistant de premier lancement.
4. Tutoriel et dossier d'exemple.
5. README (FR et EN) refondus autour du cœur Zotero, version 3.0.0.

## 9. Risques

- **Étiquetage incomplet** : une écoute oubliée d'un module coupé continue de
  tourner. Parade : le test qui compte les enregistrements par module.
- **Rechargement** : désactiver puis réactiver le greffon depuis lui-même
  doit attendre la fin de `onunload`. À éprouver dès la phase 1.
- **Redistribution des réglages** : un réglage oublié lors du découpage des
  onglets devient introuvable. Parade : la table de correspondance du plan,
  et un test qui vérifie que chaque clé de `DEFAULT_SETTINGS` modifiable est
  rattachée à un onglet.

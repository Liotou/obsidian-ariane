# Gestion des tâches avec Claude : conception

Date : 2026-09-29. Statut : à relire par Monsieur avant tout plan.

## 1. Objectif

Donner à Claude, dans Claudian, une connaissance fine des tâches du coffre
(état, historique des modifications, créneaux prévus et temps réellement
passé, charge du calendrier) et le moyen d'agir dessus **par Ariane**, jamais
en éditant les notes à la main. Et offrir, dans `00 - Cadrage`, un tableau de
bord natif qui range les tâches intelligemment sans que Monsieur ait à remplir
de nouveaux champs.

Questions typiques visées : « qu'est-ce qui dérape cette semaine ? »,
« quelles tâches semblent abandonnées ? », « replanifie-moi la lecture de
Hartwig sur mes créneaux libres ».

## 2. Décisions actées

| Sujet | Décision |
|---|---|
| Fournisseur d'IA | Claude, dans Claudian (Claude Code, racine = le coffre). Pas d'appel d'IA en arrière-plan depuis Ariane. |
| Intégration | Une compétence Claude Code dans le coffre, et des outils MCP fournis par Ariane. Aucun branchement sur le code interne de Claudian. |
| Journal des modifications | Fichier caché d'Ariane, lu par Claude via un outil. |
| Tableau de bord | Une note `00 - Cadrage/Gestion de l'organisation.md`. |
| Compétence « gestion-des-taches » (Apple Rappels) | Remplacée par la nouvelle, qui en reprend le savoir-faire utile (voir § 7). |

## 3. Ce qui existe déjà et que l'on réutilise

- **Serveur MCP `ariane-annotations`** (`mcp/serveur.js` du dépôt) : Node sans
  dépendance, JSON-RPC 2.0 sur stdio. Installé dans `~/.ariane-mcp/`, déclaré
  dans `.claude/mcp.json` du coffre (fichier de Claudian). Le nouveau serveur
  suit exactement ces conventions.
- **Données des tâches** : `tachesPourGantt()` (champs, créneaux, dates,
  parent, blocages), le Journal du temps (`07 - Journal du temps`, temps réel
  par note et par jour), l'agenda Apple (`evenementsFond`).
- **Écritures annulables** : `majTache`, `majCreneau`, la pile
  `poserAnnulation`. `marquerEcriture(chemin)` signale une écriture d'Ariane.
- **Import Rappels** : `releverRappels` crée déjà une note de tâche pour chaque
  nouveau rappel des listes surveillées, dont la boîte de réception.

## 4. Architecture

```
Claudian (Claude Code, racine = le coffre)
  ├── compétence   <coffre>/.claude/skills/ariane-taches/SKILL.md
  └── serveur MCP  ~/.ariane-mcp/taches.js   (déclaré dans .claude/mcp.json)
          │ HTTP local 127.0.0.1, jeton
          ▼
Ariane dans Obsidian : « pont » HTTP local
  ├── lectures : tâches, journal, créneaux, temps, calendrier, diagnostics
  └── écritures : uniquement via une fenêtre de validation dans Obsidian
```

**Pourquoi un relais vers Ariane plutôt qu'un serveur autonome qui lirait les
notes :** toute la logique des tâches (clés de propriétés configurables,
familles, créneaux, retard, annulation, synchronisations Rappels et Agenda)
vit dans Ariane. La réécrire dans un script séparé ferait deux versions qui
divergent. Contrepartie assumée : Obsidian doit être ouvert, ce qui est
toujours le cas quand Monsieur parle à Claudian.

## 5. Composants

### 5.1 Journal des modifications (section 11k, nouvelle sous-région)

- **Fichier** : `<dossier du greffon>/journal-taches.jsonl`, une ligne JSON par
  changement : `{ "le": "2026-09-29T14:02", "ref": "T020", "champ": "echeance",
  "avant": "2026-12-01", "apres": "2026-12-19", "origine": "ariane" | "externe" }`.
  Champ exprimé en **concept** Ariane (`echeance`, `statut`…), pas en clé
  de propriété : le journal survit à un renommage des clés.
- **Capture** : un instantané des champs suivis de chaque tâche, pris au
  démarrage (une passe, quand le cache des métadonnées est prêt, comme
  `_etatTermine`). À chaque `metadataCache.changed` d'une tâche : différence
  avec l'instantané, une ligne par champ changé, puis mise à jour de
  l'instantané. Création et suppression de tâche journalisées aussi.
- **Champs suivis** : statut, priorité, début, échéance, heure, avancement,
  jalon, parent, bloque-par, famille, créneaux (ajouts et retraits, pas la liste
  entière), intitulé.
- **Origine** : `ariane` si `ecritePlugin(chemin)` est vrai au moment du
  changement, `externe` sinon (panneau des propriétés, base, autre greffon).
  Les écritures dérivées d'Ariane (sans-échéance, date de fin, accord
  case/statut, synchro) ne sont **pas** journalisées comme décisions : elles
  sont marquées `derive` et ignorées par les diagnostics.
- **Écriture** : ajout en fin de fichier, groupé (antirebond 2 s), jamais de
  réécriture. Pas de rotation dans un premier temps (quelques Ko par mois).
- **Limite connue** : l'historique commence au jour de la mise en service ; le
  passé n'est pas reconstituable (sauvegarde locale sur 3 jours, coffre hors
  git).

### 5.2 Diagnostics (fonctions pures, section 11h)

Règles explicables, chacune rend `{ code, raison }` en français, testées sans
Obsidian :

- **abandon probable** : ni créneau ni temps passé depuis N semaines (réglage,
  4 par défaut), statut non terminé, avancement inchangé sur la période ;
- **s'étire** : échéance reportée au moins deux fois (journal), ou créneaux
  passés sans temps réellement passé correspondant ;
- **sous-planifiée** : échéance à moins de 14 jours et peu de créneaux à
  venir au regard de ce qui reste ;
- **en retard** : échéance dépassée, non terminée (réutilise `tachesEnRetard`) ;
- **bloque d'autres tâches** : nombre de tâches qu'elle bloque encore.

Plus deux indicateurs dérivés, **jamais écrits dans les notes** :
- **urgence** : échéance proche, prochain créneau, tâches bloquées ;
- **importance** : la priorité si renseignée, sinon déduite (livrable
  rattaché, nombre de tâches débloquées, tâche mère de plusieurs, famille).

### 5.3 Le pont (section 11k ou nouvelle section, à trancher au plan)

- Serveur `http` de Node, dans Obsidian (bureau seulement), sur `127.0.0.1`,
  port choisi par le système.
- Au démarrage : écrit `~/.ariane-mcp/pont.json` `{ port, jeton, coffre }`,
  droits `600`. Jeton aléatoire, renouvelé à chaque démarrage d'Obsidian.
  Refuse toute requête sans le bon jeton. Supprimé à la fermeture.
- Réglage pour l'éteindre (onglet Général, section Claude).
- Plusieurs coffres ouverts : `pont.json` indexé par chemin de coffre.

### 5.4 Le serveur MCP `ariane-taches` (`mcp/taches.js` du dépôt)

Même facture que `serveur.js`. Il lit `pont.json` à chaque appel (Obsidian a
pu redémarrer) et relaie. Obsidian fermé : message clair.

**Outils de lecture**
- `lister_taches(filtre)` : par statut, famille, période, diagnostic ; rend
  pour chaque tâche ses champs, urgence, importance et diagnostics avec raisons.
- `detail_tache(ref)` : tout ce qui précède, plus la note de travail, le
  journal complet de la tâche, les créneaux passés et à venir, le temps passé
  par jour.
- `charge_calendrier(du, au)` : créneaux de tâches et événements Apple par
  jour, et plages libres (dans la plage horaire réglée du calendrier).
- `revue(periode)` : la synthèse prête à l'emploi (en retard, s'étirent,
  abandons probables, sous-planifiées, cette semaine).

**Un seul outil d'écriture**
- `proposer_modifications(motif, changements[])` : chaque changement est
  `{ ref, champs? , ajouter_creneaux?, retirer_creneaux?, creer? }`, avec une
  justification. Ariane ouvre une fenêtre dans Obsidian : liste des
  changements, avant / après, justification, une case par changement. Les
  changements cochés passent par `majTache` / `majCreneau` / `creerTache` : ils
  sont annulables (⌘Z) et journalisés avec l'origine `claude`. L'appel attend
  la décision (jusqu'à 10 minutes) et rend à Claude ce qui a été accepté,
  refusé, ou laissé sans réponse.

Aucun outil n'écrit une note arbitraire, ne supprime une tâche, ni ne touche à
autre chose que les tâches.

### 5.5 La compétence `ariane-taches`

- Source dans le dépôt (`competence/ariane-taches/SKILL.md`), installée dans
  `<coffre>/.claude/skills/ariane-taches/` par une commande Ariane
  (« Claude : installer ou mettre à jour la compétence des tâches »), qui
  installe aussi le serveur MCP et l'entrée de `.claude/mcp.json`.
- Contenu : ce qu'est une tâche chez Monsieur (familles, statuts, créneaux,
  jalons, mères, blocages), comment lire l'historique et les diagnostics, quand
  proposer de replanifier, découper, fixer une échéance réaliste ou abandonner ;
  le tri de la boîte de réception (règles d'intitulé et de références reprises
  de l'ancienne compétence, § 7). Règle ferme : **ne jamais éditer une note de
  tâche directement, toujours `proposer_modifications`**. Ton : celui de
  l'ancienne compétence (vouvoiement, « Monsieur », sans tiret cadratin).

### 5.6 La note « Gestion de l'organisation »

- `00 - Cadrage/Gestion de l'organisation.md`, créée par Ariane si absente,
  contenant un bloc ` ```ariane-organisation``` ` rendu par Ariane
  (`registerMarkdownCodeBlockProcessor`). Monsieur peut écrire ce qu'il veut
  autour.
- Sections : Aujourd'hui, Cette semaine, En retard, Urgent et important,
  Important mais pas urgent, À surveiller (s'étire, abandon probable,
  sous-planifiée). Chaque ligne : tâche cliquable, raison courte, prochain
  créneau.
- Se rafraîchit quand une tâche change (antirebond). Rien n'y est écrit : le
  bloc est une vue.
- Choix d'un bloc de code plutôt qu'une vue Bases : des sections avec des
  raisons ne tiennent pas dans un tableau, et le bloc vit dans une note
  ordinaire, que Monsieur peut enrichir.

## 6. Tests

- Journal : différences d'instantanés (champs, créneaux ajoutés et retirés,
  origine, dérivés ignorés), en fonctions pures.
- Diagnostics, urgence, importance : fonctions pures, cas limites.
- Serveur MCP : protocole (`initialize`, `tools/list`, `tools/call`) contre un
  faux pont HTTP, dans la suite de tests.
- Pont : jeton refusé, pont absent, Obsidian fermé.
- Le rendu du bloc et la fenêtre de validation se vérifient à l'usage.

## 7. Remplacement de l'ancienne compétence

L'ancienne compétence `gestion-des-taches` part du principe qu'il n'y a
« aucune intégration Obsidian » et écrit directement dans Apple Rappels, avec
sa propre numérotation. Ce n'est plus vrai : Ariane importe les rappels en
notes et numérote les tâches. Deux méthodes concurrentes se contrediraient.

- La nouvelle compétence reprend : règles d'intitulé (verbe à l'infinitif,
  noms propres et sigles conservés à l'identique, rien d'ajouté), résolution
  des références dans Zotero, ton.
- Le tri de la boîte de réception passe par Ariane : les rappels déposés sont
  importés en tâches par `releverRappels`, puis Claude propose leur mise au
  propre par `proposer_modifications`.
- L'ancienne est retirée **avec l'accord explicite de Monsieur** : elle vit
  hors du dépôt (`~/.claude/skills/`) et une copie est synchronisée depuis son
  compte Claude, qu'il faut retirer aussi, sans quoi elle reviendrait.

## 8. Lots

1. Journal des modifications, diagnostics, urgence et importance (Ariane seule,
   testable sans Claude).
2. Le pont et le serveur MCP, lectures d'abord.
3. `proposer_modifications` et la fenêtre de validation.
4. La compétence, la commande d'installation, le retrait de l'ancienne.
5. La note « Gestion de l'organisation ».

Le lot 1 passe en premier : l'historique ne s'accumule qu'à partir de sa mise
en service.

## 9. Hors périmètre

- Appels d'IA en arrière-plan depuis Ariane.
- Toute modification appliquée sans validation dans Obsidian.
- Mobile (le pont et le serveur sont réservés au bureau).

## 10. Points relevés en passant

- La copie installée `~/.ariane-mcp/serveur.js` diffère de `mcp/serveur.js` du
  dépôt : son chemin d'index par défaut pointe encore vers l'ancien dossier
  `zotflow-atomiser`. La commande d'installation du lot 4 réinstallera les deux
  serveurs depuis le dépôt.

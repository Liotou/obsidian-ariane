# Phase 1 : registre des modules et étiquetage

**Spec :** docs/superpowers/specs/2026-10-26-modules-accueil-design.md
(sections 1, 2, 7, 9). Les phases 2 à 5 auront chacune leur plan, écrit
quand la précédente sera livrée.

**But :** chaque élément enregistré au démarrage appartient à un module ; un
module coupé ne charge rien ; basculer un module recharge Ariane. Rien ne
change à l'œil : l'installation de Monsieur passe au profil « Tout ».

**Contraintes globales (CLAUDE.md) :** éditer `src/`, jamais `main.js` ;
`npm run build`, `npm test`, `npm run verifier` ; 7 octets NUL dans
`main.js` ; un membre défini dans un seul mixin ; ni tiret cadratin ni
demi-cadratin nulle part ; pas de `sed -i` ; déploiement dans le coffre en
fin de phase (jamais `data.json`) ; pas de publication sans demande.

---

### Tâche 1 : le registre et l'état des modules

**Fichiers :** `src/01-constantes-i18n.js` (données), `src/11b-socle.js`
(méthodes), `tests/modules.test.js` (nouveau).

- `MODULES_ARIANE` (constante de premier niveau, 01) : tableau ordonné de
  `{ id, nom, description, coeur, dependances: [], macSeul }`, les quinze
  modules de la spec, noms et descriptions passés par `tr()` à l'affichage
  seulement (les données gardent le français).
- `PROFILS_ARIANE` : `{ zotero: [...], these: [...], tout: [...] }` (ids).
- `DEFAULT_SETTINGS.modules = null` (null : pas encore choisi).
- Statiques (11b, avecSocle) :
  - `Ariane.modulesAvecDependances(ids)` : ajoute les dépendances
    (transitives) et le cœur ; rend un tableau ordonné comme le registre ;
  - `Ariane.modulesDependants(id, actifs)` : ceux qui tomberaient avec lui ;
  - `Ariane.moduleActif(id, reglage, mac)` : cœur toujours vrai ; `macSeul`
    faux hors Mac ; sinon présence dans `reglage` ; `reglage` null : vrai
    (profil « Tout », filet de sécurité).
- Méthode `module(ids)` : vrai si chacun des ids (un id ou un tableau) est
  actif, d'après `this.settings.modules` et `obsidian.Platform.isMacOS`.
- Migration dans `loadSettings` : données chargées sans `modules` donnent
  `PROFILS_ARIANE.tout` ; aucune donnée (première installation) donne aussi
  « tout » en phase 1 (l'assistant de la phase 3 prendra le relais).
- Tests : dépendances transitives, dépendants, cœur, `macSeul`, migration
  (avec et sans données), ids inconnus ignorés.

### Tâche 2 : les commandes étiquetées

**Fichiers :** `src/11z-ariane.js`, `src/11b-socle.js`,
`tests/structure.test.js`.

- Chaque `this.addCommand({ … })` reçoit `module: 'id'` (ou un tableau quand
  plusieurs modules sont requis). Commandes du cœur : `module: 'annotations'`
  ou `module: 'citations'`.
- `addCommand(c)` surchargé dans avecSocle : si `c.module` est inactif, rien
  n'est enregistré ; sinon la propriété est retirée et la commande passe à
  `super.addCommand`.
- Correspondance (id de commande : module) :
  - annotations : atomise-active, atomise-tout, sommaire-lecture,
    retirer-alias-liens, normaliser-conjonctions-references,
    lier-reference-zotero, rattacher-toutes-references, notes-lecture-atomiser,
    ouvrir-dans-zotero, decouper-bibliographies, reparer-liens-auteurs,
    arbitrer-references-attente, bibliographie-citee-source,
    arreter-bibliographies, bibliographies-citees-toutes,
    fusionner-doublons-auteurs, zotero-references-orphelines,
    annotations-sources-mentionnees, bases-icone-vue ;
  - citations : panier-annotations, citations-replier, citations-deplier,
    citations-basculer, citations-rafraichir, biblio-note, biblio-tout ;
  - export : verifier-modele-word, exporter-word-zotero ;
  - familles : concepts-uniformiser-liens ;
  - typographie : titres-numeroter, titres-renumeroter-note ;
  - suggestions : suggestions-ouvrir, suggestions-reconstruire ;
  - taches : incoherences-taches, harmoniser-colonnes-bases,
    completer-concepts-taches, relire-incoherences-taches, creer-tache,
    structurer-brouillon-taches, decouper-tache-active,
    normaliser-intitules-taches, verifier-familles-taches,
    ajouter-tache-langage-naturel, resoudre-sources-lecture, modifier-tache,
    organisation-repartir, organisation-ouvrir ;
  - [canevas, taches] : canevas-nouveau, canevas-ajouter-tache,
    canevas-nouvelle-tache, canevas-panneau, canevas-ouvrir,
    canevas-tracer-relations ;
  - rappels : rappels-pousser, rappels-relever, agenda-pousser,
    agenda-relever, agenda-diagnostic, agenda-nettoyer, google-relier,
    google-synchroniser, google-relever ;
  - temps : distractions-classer, journee-resumer, activite-resumer-semaine,
    ouvrir-chronologie, temps-reporter ;
  - schemas : schema-synchroniser-tout, carte-valider, carte-interroger ;
  - publication : publier-site ;
  - correcteur : correcteur-basculer, correcteur-relire, correcteur-volet ;
  - claude : claude-installer, claude-annuler ;
  - barre : barre-basculer.
  Les commandes non listées ici (relevé : 77 sur l'inventaire) reçoivent
  leur module à la lecture de leur code.
- Test structurel : chaque appel `addCommand` de `src/` porte `module:` avec
  des ids connus du registre.

### Tâche 3 : vues, ruban, interface, extensions, écoutes, minuteries

**Fichiers :** `src/11z-ariane.js` (et les « démarreurs » appelés depuis
lui).

- Garde `if (this.module('…'))` autour de chaque enregistrement, par bloc
  cohérent. Correspondance :
  - `_enregistrerVues` : vue suggestions (suggestions) ; références en
    attente (annotations) ; incohérences des tâches (taches) ; chronologie
    (temps) ; relecture (correcteur) ; `IntegrationCanevas` (canevas) ;
    `CorrecteurApple` (correcteur) ; bloc `ariane-organisation` (taches) ;
    `BarreEdition` (barre) ; `PontClaude` (claude) ; vues Bases frise et
    calendrier (taches) ; `IconesVuesBases` (cœur).
  - `_brancherInterface` : ruban citations (citations), suggestions
    (suggestions), références (annotations), chronologie (temps), relecture
    (correcteur) ; glisser-déposer, survol, notes orphelines (citations) ;
    post-processeurs : aparté (familles), citations repliables (citations),
    compteurs d'emprunts (annotations), ponctuation et numérotation
    (typographie) ; plans (typographie) ; migrations des notes de tâche
    (taches) ; pages des EPUB (annotations) ; rôles (cœur) ; explorateur
    (temps, infobulle du temps) ; bloc « données par jour » et démarreurs du
    temps, de la barre de créneau ([temps, taches]), de l'activité, de la
    chronologie (temps).
  - `_installerExtensionsEditeur` : aparté (familles) ; citations repliables
    et surlignage de phrase (citations) ; ponctuation et numérotation
    (typographie) ; correcteur (correcteur).
  - `_brancherEvenements` : journal et suppressions des tâches, écoutes des
    tâches, rappels et agendas (taches, rappels selon le cas) ; suggestions
    (suggestions) ; lecteurs ZotFlow, références orphelines, menus Zotero
    (annotations) ; menus de sélection (suggestions ; structurer en tâches :
    taches).
  - `_demarrerMinuteries` : modifications des sources (annotations) ;
    schémas (schemas) ; bibliographie (citations) ; tâches vierges (taches) ;
    étiquettes d'orphelines (annotations).
- `onload` : `installerAffichageTaches` (taches) ; le reste est du cœur.
- Les membres qui deviennent `undefined` quand leur module est coupé
  (`this.canevas`, `this.correcteur`, `this.barre`, `this.pont`) : relever
  chaque usage hors de leur module et le garder (`if (this.canevas)` …).
  Relevé à faire par `grep -an "this\.\(canevas\|correcteur\|barre\|pont\)\."`.

### Tâche 4 : rechargement et vues orphelines

**Fichiers :** `src/11b-socle.js`, `src/11z-ariane.js`.

- `async appliquerModules(ids)` : enregistre
  `Ariane.modulesAvecDependances(ids)` dans les réglages, puis recharge
  Ariane hors de la pile courante (`setTimeout`), par
  `app.plugins.disablePlugin(id)` puis `enablePlugin(id)`.
- Au démarrage, une fois la disposition prête : les feuilles dont le type de
  vue appartient à un module coupé sont détachées.
- Essai réel sans interface (phase 1) : par la console du développeur
  d'Obsidian, par Monsieur, si nécessaire ; sinon en phase 2 avec l'onglet
  Modules.

### Tâche 5 : le test qui compte les enregistrements

**Fichiers :** `tests/modules-chargement.test.js` (nouveau), et
`tests/obsidian-factice.js` si besoin.

- Un greffon factice, `onload` exécuté avec un faux `app` minimal, qui compte
  commandes, vues, icônes, extensions, post-processeurs, écoutes et
  minuteries, avec le profil « Tout » puis avec chaque module coupé tour à
  tour : un module coupé fait baisser les comptes, et aucune commande de
  son module ne subsiste. Si le faux `app` ne permet pas d'exécuter `onload`
  en entier, le test se limite aux commandes et aux vues, et le reste est
  vérifié par le relevé de la tâche 3.

### Fin de phase

`npm test` vert, `npm run verifier`, 7 octets NUL, aucun tiret long ajouté,
commit, dépôt de `main.js`, `styles.css`, `manifest.json` dans le coffre.
Compte rendu à Monsieur : rien ne doit avoir changé chez lui.

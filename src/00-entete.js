'use strict';

/*
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  FICHIER PRODUIT — NE PAS ÉDITER ICI.                                 ║
 * ║  main.js est la CONCATÉNATION des fragments de src/, dans l'ordre de   ║
 * ║  src/ordre.json. Éditer le fragment, puis : npm run build             ║
 * ║  Une édition faite ici est perdue à la construction suivante.         ║
 * ║  Correspondance : la section N ci-dessous vit dans src/NN-*.js        ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 *
 * Ariane
 * ================
 * Plugin Obsidian sur mesure et PARAMÉTRABLE. Transforme les
 * annotations d'une note source (ZotFlow / Zotero) en notes atomiques
 * réactives, selon un ou plusieurs standards d'annotation configurables.
 *
 * Principes :
 *   - IDENTITÉ STABLE : chaque note d'annotation garde dans son entête
 *     une clé stable (zotflow-anno-key). C'est cette clé, et non le nom
 *     de fichier, qui sert d'identité au plugin. Les liens survivent
 *     donc aux changements de titre (renommage via l'API d'Obsidian).
 *   - RÉACTIF : régénération automatique à chaque modification de la
 *     source (désactivable).
 *   - VERROUILLÉ : les éditions manuelles des notes automatiques sont
 *     restaurées (désactivable).
 *   - SUPPRESSION PROPAGÉE : une annotation retirée de la source voit
 *     sa note supprimée et ses liens retirés des notes conceptuelles
 *     (désactivable).
 *   - RATTACHEMENT ZOTERO : une référence citée correspondant à une
 *     source Zotero (même premier auteur + année) pointe vers la note
 *     @citekey (désactivable).
 *
 * Paramétrage (onglet Réglages) :
 *   - Dossiers de sortie, nommage, alias.
 *   - Motifs d'analyse (regex) par champ, regroupés en PROFILS de
 *     standard : plusieurs standards peuvent coexister, le premier
 *     profil dont le motif de titre correspond est retenu pour le bloc.
 *   - Modèles de sortie type Templater ({{title}}, {{paraphrase}},
 *     {{source}}, {{references}}, {{image}}, {{page}}...).
 *   - Interrupteurs de comportement.
 *
 * ATTENTION : agit automatiquement, peut supprimer des notes et retirer
 * des liens. Sauvegardez votre coffre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CARTE DU FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 * Obsidian charge ce main.js tel quel ; il est produit par npm run build à
 * partir de src/. Chaque section ci-dessous est un fragment src/NN-*.js.
 * Copie vers le coffre : cp main.js styles.css manifest.json <dossier-plugin>/
 *
 *    1 · Constantes & i18n
 *          réglages par défaut, dictionnaire anglais
 *    2 · Utilitaires génériques
 *          chaînes, dates, DOM, antirebond
 *    3 · Références Zotero — parsing & appariement
 *          reconnaissance auteur/année, rattachement aux sources
 *    4 · Similarité locale (TF-IDF & vecteurs)
 *          moteur des suggestions de voisinage
 *    5 · Notes atomiques
 *          découpe d'une note source en notes filles réactives
 *    6 · Bibliographie
 *          index, rendu, citations dynamiques
 *    7 · Export Pandoc / Word
 *          chaîne pandoc + champs Zotero rafraîchissables
 *    8 · Schémas mxgraph / draw.io
 *    9 · Doublons d'auteurs
 *          détection et fusion des variantes de nom
 *   10 · Marqueurs de tâche
 *          balises des blocs de note entretenus par Ariane
 *   11 · class Ariane
 *          LE greffon, assemblé de mixins — un fragment src/11*.js chacun,
 *          un domaine chacun :
 *            11a  composition   composer(), en-tête de la section
 *            11b  avecSocle     réglages, dates, chemins, garde-fous,
 *                               aiguillage des événements du coffre
 *            11c  avecIa        voisinage, encodage, fournisseurs LLM
 *            11d  avecNoteReferences        Zotero, familles, attente
 *            11e  avecNoteAtomes            atomisation, panier
 *            11f  avecNoteBiblio            biblio, Pandoc, doublons
 *            11g  avecNoteSchemas           draw.io
 *            11h  avecTachesStatiques       fonctions pures des tâches
 *            11i  avecFriseStatiques        Gantt, périodes, tri
 *            11j  avecArticulationStatiques plan, arêtes, zones
 *            11k  avecTaches     notes de tâche, temps, synchro Apple
 *            11z  class Ariane   composition + cycle de vie (onload)
 *          Sous-régions « Ariane · … » à l'intérieur de chaque mixin.
 *   12 · ArianeSettingTab
 *          réglages : une méthode par onglet
 *   13 · Modales de tâche
 *          création, datation, structuration assistée
 *   14 · Socle des vues
 *          identifiants de vue, réglages par défaut des vues de base, svgEl,
 *          pile d'annulation / rétablissement, et la classe MoteurVue dont
 *          héritent les trois moteurs (contexte, _doc(), _win())
 *   15 · Vue Frise
 *          Gantt. Sous-régions « Frise · … ».
 *            15a  MoteurFrise — reste une SEULE classe : l'export la sérialise
 *                 par toString(), des mixins l'ampute (voir l'en-tête de 15a)
 *            15b  fabriquerVueFriseBase — la vue Bases « ariane-frise »
 *            15c  figage des données + pageFriseHtml (page autonome)
 *   16 · Vue Articulation
 *          graphe : MoteurArticulation, vue Bases « ariane-articulation ».
 *          Sous-régions « Articulation · … ».
 *   17 · Vue Calendrier
 *          mois et semaine : MoteurCalendrier, vue Bases « ariane-calendrier »,
 *          agenda Apple en fond. Sous-régions « Calendrier · … ».
 *   18 · Vues latérales (ItemView)
 *          incohérences de tâches, références en attente, suggestions
 *   19 · Modales secondaires
 *          choix, rapports, fusion d'auteurs
 *   20 · Exports
 *          module.exports et surface _test des fonctions pures
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CONVENTIONS — à respecter par toute personne (ou IA) qui édite ce fichier
 * ─────────────────────────────────────────────────────────────────────────
 * OÙ ÉDITER. Dans src/, jamais dans main.js. Un fragment = une section de la
 * carte ci-dessous : la section 15 est src/15-vue-frise.js, et ainsi de suite.
 * La construction est une concaténation d'octets — pas un empaquetage : les
 * fragments partagent UNE SEULE PORTÉE (ni import ni export, noms de premier
 * niveau uniques), et chacun doit rester du JavaScript valide au premier
 * niveau. scripts/build.mjs dit pourquoi ce choix plutôt qu'esbuild.
 *
 * BALISAGE. Deux niveaux, tous deux repliables dans l'éditeur :
 *   · niveau 1, en colonne 0 :  //#region N · Titre  …  //#endregion N · Titre
 *     Les deux bornes portent le MÊME numéro et le MÊME titre. Ajouter une
 *     section = renuméroter les suivantes ET cette carte. tests/structure.test.js
 *     échoue si l'un des trois diverge : il est la garantie que cette carte ne
 *     ment pas.
 *   · niveau 2, indenté de 2 espaces, à l'intérieur des grosses classes :
 *       //#region Ariane · <domaine>          (class Ariane, section 11)
 *       //#region Frise · <domaine>           (MoteurFrise, section 15)
 *       //#region Articulation · <domaine>    (MoteurArticulation, 16)
 *       //#region Calendrier · <domaine>      (MoteurCalendrier, 17)
 *     Une méthode nouvelle se range DANS le groupe qui la concerne, pas en fin
 *     de classe : c'est ce qui garde le fichier lisible malgré sa taille.
 *
 * OCTETS NUL. Le fichier en contient quelques-uns (chaînes de gabarit). `grep`
 * le traite alors comme binaire : utiliser `grep -a`. Éviter `sed -i`, qui les
 * mange ; `perl -0pi` et les outils d'édition les préservent. Contrôle après
 * toute réécriture globale :  tr -cd '\000' < main.js | wc -c
 *
 * MULTI-FENÊTRE. Dans un volet détaché, `document` et `window` globaux sont
 * ceux de la fenêtre PRINCIPALE. Les trois moteurs de vue héritent de MoteurVue
 * (section 14), qui expose `_doc()` et `_win()` : les utiliser pour tout
 * createElement, tout écouteur de glisser (pointermove/pointerup) et tout
 * requestAnimationFrame lié à la vue. Ne jamais réintroduire un `_doc()` local :
 * c'est la duplication qui a déjà fait rater une correction sur un moteur.
 *
 * VÉRIFICATION.  npm test  (construit main.js, puis lance les tests).
 * npm run verifier  échoue si main.js diverge de src/ sans reconstruction.
 * Déploiement : cp main.js styles.css manifest.json vers le dossier du greffon
 * du coffre — JAMAIS data.json (ce sont les réglages de l'utilisateur).
 *
 * UN SEUL GREFFON. La scission en plusieurs greffons a été étudiée deux fois
 * puis abandonnée le 2026-09-07 : les deux specs sont archivées avec la raison.
 * Le découpage de src/ et des mixins reste — il vaut pour lui-même.
 *
 * Conception : docs/superpowers/specs/2026-08-31-mise-au-propre-main-design.md
 * Suspects relevés : docs/conception/2026-08-31-mise-au-propre-main-suspects.md
 * ─────────────────────────────────────────────────────────────────────────
 */

const obsidian = require('obsidian');


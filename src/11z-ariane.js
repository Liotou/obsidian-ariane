
// ── class Ariane ──────────────────────────────────────────────────────────
// Le point d'assemblage. Ne porte que le cycle de vie : onload, et les
// enregistrements qu'il délègue. À la scission, chaque greffon aura le sien.
class Ariane extends composer(obsidian.Plugin,
  avecSocle,
  avecIa,
  avecNoteReferences,
  avecNoteAtomes,
  avecNoteBiblio,
  avecNoteSchemas,
  avecTachesStatiques,
  avecFriseStatiques,
  avecArticulationStatiques,
  avecTaches) {
  //#region Ariane · cycle de vie
  // ── cycle de vie ─────────────────────────────────────────────────────────

  async onload() {
    await this.loadSettings();
    this.appliquerStyleAparte();
    this.installerVerrouLecture();
    this.installerAffichageTaches();
    this.appliquerCssPersonnalise();
    this.ecrituresRecentes = new Map();
    this.antirebonds = new Map();
    this.rattachementsIgnores = new Set();

    // État du panier flottant d'annotations.
    this.panier = [];
    this.panierEl = null;
    this.glisseDepuisPanier = false;
    this.register(() => this.fermerPanier());
    this.argFenetreEl = null;
    this.suggAncrage = null;
    this.register(() => this.fermerFenetreArgument());

    this.addSettingTab(new ArianeSettingTab(this.app, this));

    this.addRibbonIcon('layers', "Panier de notes (Ariane)", () => this.basculerPanier());

    // Le reste du démarrage, dans l'ordre : ce que le greffon OFFRE (commandes,
    // vues, interface), puis ce à quoi il RÉAGIT (extensions d'éditeur, écoutes),
    // puis ce qui attend la disposition. Chaque étape est une méthode juste
    // en dessous : y ajouter une commande ou une écoute, pas ici.
    this._enregistrerCommandes();
    this._enregistrerVues();
    this._brancherInterface();
    this._installerExtensionsEditeur();
    this._brancherEvenements();
    this._demarrerMinuteries();
  }

  // Toutes les commandes de la palette. Un seul endroit où chercher
  // « pourquoi cette commande fait ça » — et où en ajouter une.
  _enregistrerCommandes() {
    this.addCommand({
      id: 'atomise-active',
      name: tr('Atomiser : la note source active'),
      callback: () => this.commandeNoteActive(),
    });
    this.addCommand({
      id: 'atomise-tout',
      name: tr('Atomiser : toutes les sources'),
      callback: () => this.atomiserTout(),
    });
    this.addCommand({
      id: 'retirer-alias-liens',
      name: tr('Entretien : retirer l’alias des liens d’annotation'),
      callback: () => this.retirerAliasLiensAnnotation(),
    });
    this.addCommand({
      id: 'normaliser-conjonctions-references',
      name: tr('Entretien : normaliser les conjonctions des références'),
      callback: () => this.normaliserConjonctionsReferences(),
    });
    this.addCommand({
      id: 'panier-annotations',
      name: tr("Panier de notes : afficher ou masquer"),
      callback: () => this.basculerPanier(),
    });
    this.addCommand({
      id: 'lier-reference-zotero',
      name: tr('Références en attente : lier la référence active à une fiche Zotero'),
      callback: () => this.assistantLiageReference(),
    });
    this.addCommand({
      id: 'rattacher-toutes-references',
      name: tr('Références en attente : rattacher automatiquement'),
      callback: () => this.rattacherToutesReferences(),
    });
    this.addCommand({
      id: 'incoherences-taches',
      name: tr('Tâches : incohérences'),
      callback: () => this.ouvrirVueIncoherences(),
    });
    this.addCommand({
      id: 'harmoniser-colonnes-bases',
      name: tr('Tâches : harmoniser les noms de colonnes des bases'),
      callback: () => this.harmoniserNomsColonnesBases().catch(() => {}),
    });
    this.addCommand({
      id: 'completer-concepts-taches',
      name: tr('Tâches : compléter les propriétés manquantes'),
      callback: async () => {
        const n = await this.semerConceptsTache();
        new obsidian.Notice(n + tr(' note(s) de tâche complétée(s).'));
      },
    });
    this.addCommand({
      id: 'relire-incoherences-taches',
      name: tr('Tâches : relire les incohérences'),
      callback: () => {
        const r = this.recalculerIncoherences();
        const n = r.cycles.length + r.dates.length + r.morts.length;
        new obsidian.Notice(n + tr(' incohérence(s).'));
      },
    });
    this.addCommand({
      id: 'creer-tache',
      name: tr('Tâches : créer une tâche'),
      callback: () => new ModaleTache(this.app, this, {
        apres: async (ref) => {
          const f = this.fichierDeRef(ref);
          if (f) await this.app.workspace.getLeaf(true).openFile(f);
        },
      }).open(),
    });
    this.addCommand({
      id: 'structurer-brouillon-taches',
      name: tr('Tâches : structurer un brouillon (IA)'),
      callback: () => {
        const ed = this.app.workspace.activeEditor && this.app.workspace.activeEditor.editor;
        const sel = ed && ed.getSelection ? ed.getSelection() : '';
        new ModaleStructurerTaches(this, sel && sel.trim() ? sel : '').open();
      },
    });
    this.addCommand({
      id: 'decouper-tache-active',
      name: tr('Tâches : découper la tâche active (IA)'),
      callback: () => {
        const f = this.app.workspace.getActiveFile();
        const ref = f && this.refDeChemin(f.path);
        if (!ref) { new obsidian.Notice(tr('Ouvrez d\'abord une note de tâche.')); return; }
        this.ouvrirDecoupage(ref);
      },
    });
    this.addCommand({
      id: 'normaliser-intitules-taches',
      name: tr('Tâches : normaliser les intitulés (IA)'),
      callback: async () => {
        const lignes = await this.normaliserIntitules(null);
        new ModaleRevueLot(this.app, {
          titre: tr('Normaliser les intitulés'),
          aide: tr('Décochez ce que vous ne voulez pas ; le texte reste modifiable.'),
          lignes, editable: true,
          appliquer: async (sel) => {
            let n = 0;
            for (const r of sel) { if (await this.renommerTitreTache(r.ref, r.apres)) n += 1; }
            return n;
          },
        }).open();
      },
    });
    this.addCommand({
      id: 'verifier-familles-taches',
      name: tr('Tâches : vérifier les familles (IA)'),
      callback: async () => {
        const lignes = await this.verifierFamilles(null);
        new ModaleRevueLot(this.app, {
          titre: tr('Vérifier les familles'),
          aide: tr('L\'IA propose une famille différente pour ces tâches.'),
          lignes,
          appliquer: async (sel) => {
            let n = 0;
            for (const r of sel) { if (await this.majTache(r.ref, { famille: r.apres })) n += 1; }
            return n;
          },
        }).open();
      },
    });
    this.addCommand({
      id: 'ajouter-tache-langage-naturel',
      name: tr('Tâches : ajouter (langage naturel, IA)'),
      callback: () => new ModaleAjoutLN(this).open(),
    });
    this.addCommand({
      id: 'resoudre-sources-lecture',
      name: tr('Tâches : résoudre les sources des tâches de lecture'),
      callback: async () => {
        const avis = new obsidian.Notice(tr('Recherche des sources…'), 0);
        let lignes = [];
        try { lignes = await this.resoudreSourcesLecture(null); } finally { avis.hide(); }
        new ModaleRevueLot(this.app, {
          titre: tr('Résoudre les sources (lecture)'),
          aide: tr('Rapprochement d\'une source en clair d\'une fiche @citekey du coffre.'),
          lignes, editable: true,
          appliquer: async (sel) => {
            let n = 0;
            for (const r of sel) { if (await this.majTache(r.ref, { source: r.apres })) n += 1; }
            return n;
          },
        }).open();
      },
    });
    this.addCommand({
      id: 'rappels-pousser',
      name: tr('Tâches : synchroniser vers Apple Rappels'),
      callback: () => this.pousserRappels(false),
    });
    this.addCommand({
      id: 'rappels-relever',
      name: tr('Tâches : relever les rappels (terminés, échéances)'),
      callback: () => this.releverRappels(false),
    });
    this.addCommand({
      id: 'agenda-pousser',
      name: tr('Tâches : synchroniser vers Apple Agenda'),
      callback: () => this.pousserAgenda(false),
    });
    this.addCommand({
      id: 'agenda-relever',
      name: tr('Tâches : relever Apple Agenda'),
      callback: () => this.releverAgenda(false),
    });
    this.addCommand({
      id: 'agenda-diagnostic',
      name: tr('Tâches : diagnostiquer Apple Agenda'),
      callback: () => this.diagnostiquerAgenda(),
    });
    this.addCommand({
      id: 'agenda-nettoyer',
      name: tr('Tâches : nettoyer les doublons Apple Agenda'),
      callback: () => this.nettoyerAgenda(false),
    });
    this.addCommand({
      id: 'modifier-tache',
      name: tr('Tâches : modifier une tâche…'),
      callback: () => {
        const items = this.tachesPourGantt()
          .map((t) => ({ nom: t.intitule + '  (' + t.ref + ')', cle: t.ref }));
        if (!items.length) { new obsidian.Notice(tr('Aucune tâche.')); return; }
        new ChoixListeModal(this.app, tr('Tâche à modifier…'), items, (it) => {
          if (it) new ModaleTache(this.app, this, { ref: it.cle }).open();
        }).open();
      },
    });
    this.addCommand({
      id: 'temps-journal',
      name: tr('Temps : écrire le journal du jour'),
      callback: () => this.ouvrirBilanTemps(),
    });
    this.addCommand({
      id: 'temps-reporter',
      name: tr('Temps : reporter maintenant dans les notes'),
      callback: async () => {
        await this.reporterTemps();
        new obsidian.Notice(tr('Temps reporté dans les propriétés.'));
      },
    });
    this.addCommand({
      id: 'citations-replier',
      name: tr('Citations : tout replier'),
      callback: () => this.basculerCitations(true),
    });
    this.addCommand({
      id: 'citations-deplier',
      name: tr('Citations : tout déplier'),
      callback: () => this.basculerCitations(false),
    });
    this.addCommand({
      id: 'citations-basculer',
      name: tr('Citations : replier ou déplier'),
      callback: () => this.basculerCitations(!this.settings.citationsRepliees),
    });
    this.addCommand({
      id: 'citations-rafraichir',
      name: tr('Citations : rafraîchir les libellés…'),
      callback: () => new ChoixListeModal(this.app, 'Rafraîchir les libellés de citation', [
        { nom: 'Note active', portee: 'active' },
        { nom: 'Toutes les notes du coffre', portee: 'tout' },
      ], (c) => this.rafraichirCitations(c.portee)).open(),
    });
    this.addCommand({
      id: 'biblio-note',
      name: tr('Bibliographie : recomposer celle de la note active'),
      callback: () => {
        const f = this.app.workspace.getActiveFile();
        if (f) this.majBibliographie(f); else new obsidian.Notice(tr('Ouvrez une note.'));
      },
    });
    this.addCommand({
      id: 'biblio-tout',
      name: tr('Bibliographie : recomposer celles de toutes les notes'),
      callback: () => this.majBibliographieToutes(),
    });
    this.addCommand({
      id: 'schema-synchroniser-tout',
      name: tr('Schémas : synchroniser dans les notes'),
      callback: () => this.synchroniserTousSchemas(),
    });
    this.addCommand({
      id: 'carte-valider',
      name: tr('Schémas : valider le schéma actif'),
      callback: () => this.validerCarte(),
    });
    this.addCommand({
      id: 'carte-interroger',
      name: tr('Schémas : interroger le graphe'),
      callback: () => this.interrogerGraphe(),
    });
    this.addCommand({
      id: 'notes-lecture-atomiser',
      name: tr('Atomiser : les notes-filles Zotero'),
      callback: () => this.atomiserToutesNotesLecture(),
    });
    this.addCommand({
      id: 'ouvrir-dans-zotero',
      name: tr('Annotations : ouvrir dans Zotero'),
      callback: () => this.ouvrirDansZotero(),
    });
    this.addCommand({
      id: 'verifier-modele-word',
      name: tr('Word : vérifier le modèle'),
      callback: () => this.verifierModeleWord(),
    });
    this.addCommand({
      id: 'decouper-bibliographies',
      name: tr('Références citées : structurer les entrées non structurées'),
      callback: () => this.decouperBibliographies(),
    });
    this.addCommand({
      id: 'reparer-liens-auteurs',
      name: tr('Entretien : réparer les liens d’auteurs'),
      callback: () => this.reparerLiensAuteurs(),
    });
    this.addCommand({
      id: 'arbitrer-references-attente',
      name: tr('Références en attente : ouvrir la liste'),
      callback: () => this.ouvrirVueReferences(),
    });
    this.addCommand({
      id: 'exporter-word-zotero',
      name: tr('Word : exporter avec citations Zotero'),
      callback: () => this.exporterWordZotero(),
    });
    this.addCommand({
      id: 'bibliographie-citee-source',
      name: tr('Références citées : extraire celles de la source active'),
      callback: () => this.genererBibliographieSource(),
    });
    this.addCommand({
      id: 'arreter-bibliographies',
      name: tr('Références citées : interrompre l’extraction'),
      callback: () => {
        if (!this.bibliosEnCours) { new obsidian.Notice(tr('Aucune génération en cours.')); return; }
        this.bibliosEnCours = false;
      },
    });
    this.addCommand({
      id: 'bibliographies-citees-toutes',
      name: tr('Références citées : extraire celles de toutes les sources'),
      callback: () => this.genererToutesBibliographies(),
    });
    this.addCommand({
      id: 'fusionner-doublons-auteurs',
      name: tr('Entretien : fusionner les doublons d’auteurs'),
      callback: () => this.ouvrirFusionAuteurs(),
    });
    this.addCommand({
      id: 'suggestions-ouvrir',
      name: tr('Annotations : ouvrir le panneau de suggestions'),
      callback: () => this.ouvrirVueSuggestions(),
    });
    this.addCommand({
      id: 'suggestions-reconstruire',
      name: tr('Annotations : reconstruire l’index des suggestions'),
      callback: async () => {
        const n = await this.construireIndexSuggestions();
        new obsidian.Notice(tr('Index de suggestions reconstruit (') + n + ' notes).');
        this.majSuggestions();
      },
    });
  }

  // Volets latéraux et vues de base (frise, articulation, calendrier).
  // Les vues de base n'existent que si Bases est actif.
  _enregistrerVues() {
    // Panneau de suggestions dynamiques (moteur lexical local).
    this.registerView('zfa-suggestions', (leaf) => new VueSuggestionsZotflow(leaf, this));
    this.registerView(TYPE_VUE_REFS, (leaf) => new VueReferencesAttente(leaf, this));
    this.registerView(TYPE_VUE_INCOHERENCES, (leaf) => new VueIncoherencesTaches(leaf, this));
    // La frise est une vue de base : elle n'existe que si Bases est actif.
    if (typeof this.registerBasesView === 'function') {
      const Vue = fabriquerVueFriseBase(this);
      this.registerBasesView(TYPE_VUE_BASE_FRISE, {
        name: tr('Frise'),
        icon: 'calendar-range',
        factory: (controleur, conteneur) => new Vue(controleur, conteneur),
        // Les réglages de la frise se déclarent ici pour figurer dans
        // « Configurer la vue », comme ceux des vues natives, et se ranger
        // dans le fichier .base. Ils restent doublés dans la barre de la frise,
        // qu'on manipule sans arrêt.
        options: (config) => [
          {
            type: 'dropdown', key: 'rowHeight', displayName: tr('Hauteur de ligne'),
            default: 'medium',
            options: { short: tr('Courte'), medium: tr('Moyenne'),
                       tall: tr('Haute'), extra: tr('Très haute') },
          },
          {
            type: 'dropdown', key: 'zoom', displayName: tr('Échelle'), default: 'mois',
            options: { jour: tr('Jour'), semaine: tr('Semaine'), mois: tr('Mois'),
                       trimestre: tr('Trimestre'), 'année': tr('Année') },
          },
          {
            type: 'dropdown', key: 'libelleSemaine',
            displayName: tr('Libellé des semaines'), default: 'numero',
            options: { numero: tr('nº de semaine'), dates: tr('dates'),
                       'les-deux': tr('les deux') },
            shouldHide: () => config.get('zoom') !== 'semaine',
          },
        ],
      });
      const VueArtic = fabriquerVueArticulationBase(this);
      this.registerBasesView(TYPE_VUE_BASE_ARTIC, {
        name: tr('Articulation'),
        icon: 'git-branch',
        factory: (controleur, conteneur) => new VueArtic(controleur, conteneur),
        options: () => [
          {
            type: 'dropdown', key: 'modeCarte', displayName: tr('Cartes'),
            default: 'retracte',
            options: { retracte: tr('Rétracté'), detaille: tr('Détaillé') },
          },
        ],
      });
      const VueCal = fabriquerVueCalendrierBase(this);
      this.registerBasesView(TYPE_VUE_BASE_CALENDRIER, {
        name: tr('Calendrier'),
        icon: 'calendar-days',
        factory: (controleur, conteneur) => new VueCal(controleur, conteneur),
        options: () => [
          { type: 'dropdown', key: 'calMode', displayName: tr('Vue'), default: 'mois',
            options: { mois: tr('Mois'), semaine: tr('Semaine') } },
          { type: 'text', key: 'calHeureDebut', displayName: tr('Heure de début (semaine)'), default: '07:00' },
          { type: 'text', key: 'calHeureFin', displayName: tr('Heure de fin (semaine)'), default: '21:00' },
        ],
      });
    }
    // « famille » est un texte pour Obsidian ; le menu déroulant se fait
    // côté carte (l'API n'expose pas de type énuméré).
    try {
      const mtm = this.app.metadataTypeManager;
      if (mtm && typeof mtm.setType === 'function'
        && (!mtm.properties || !mtm.properties.famille)) {
        mtm.setType('famille', 'text');
      }
    } catch (e) { /* metadataTypeManager indisponible : sans gravité */ }
  }

  // Icônes du ruban, aperçu au survol, glisser-déposer d'annotations et
  // post-traitements Markdown.
  _brancherInterface() {
    this.addRibbonIcon('quote', 'Citations : replier ou déplier (Ariane)',
      () => this.basculerCitations(!this.settings.citationsRepliees));
    this.addRibbonIcon('sparkles', "Suggestions d'annotations (Ariane)", () => this.ouvrirVueSuggestions());
    this.addRibbonIcon('scale', tr('Références en attente (Ariane)'), () => this.ouvrirVueReferences());
    // Déclare le panneau comme source d'aperçu au survol (« Page preview »).
    if (this.registerHoverLinkSource) {
      this.registerHoverLinkSource('zfa-suggestions', { display: tr('Suggestions (Ariane)'), defaultMod: false });
      this.registerHoverLinkSource('zfa-partout', { display: 'Ariane — liens (chat, panneaux)', defaultMod: false });
    }
    // Aperçu au survol des liens internes dans les vues NON-markdown (ex. chat
    // Claudian), qui ne déclenchent pas l'aperçu natif elles-mêmes.
    this.registerDomEvent(document, 'mouseover', (e) => {
      if (!this.settings.hoverPartout) return;
      const a = e.target && e.target.closest ? e.target.closest('a.internal-link') : null;
      if (!a) return;
      if (a.closest('.markdown-reading-view, .markdown-source-view, .cm-editor')) return; // déjà géré
      const cible = a.getAttribute('data-href') || a.getAttribute('href');
      if (!cible) return;
      this.app.workspace.trigger('hover-link', { event: e, source: 'zfa-partout', hoverParent: this, targetEl: a, linktext: cible, sourcePath: '' });
    });

    // Clic sur un lien dans une fenêtre de survol : la refermer. Les liens
    // externes (obsidian://, zotero://) ouvrent une autre app sans que le
    // popover natif ne se ferme ; on le retire après le traitement du clic.
    this.registerDomEvent(document, 'click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!a || !a.closest('.hover-popover, .popover')) return;
      setTimeout(() => {
        document.querySelectorAll('.hover-popover').forEach((el) => el.remove());
      }, 0);
    }, { capture: true });

    // Glisser une annotation sur un paragraphe -> note de bas de page.
    // Enregistré sur le document principal ET sur chaque fenêtre détachée
    // (pop-out / multi-moniteurs), pour que le dépôt fonctionne partout.
    // Les fenêtres détachées ouvertes AVANT le chargement du greffon — celles
    // qu'Obsidian restaure au démarrage — n'étaient couvertes par aucun
    // gestionnaire : seuls le document principal et les fenêtres ouvertes
    // ensuite l'étaient. Le dépôt y restait donc sans effet.
    const docsCouverts = new WeakSet();
    const enregistrerDnD = (doc) => {
      if (!doc || docsCouverts.has(doc)) return;
      docsCouverts.add(doc);
      // Un glisser parti d'un panneau tiers peut arriver avec un dataTransfer
      // vide : Chromium refuse de transporter une adresse « app:// », et c'est
      // précisément la forme que prennent les liens internes rendus hors d'une
      // vue markdown (le chat de Claudian, par exemple). On note donc la cible
      // au départ du glisser, seul moment où l'information est sûre.
      this.registerDomEvent(doc, 'dragstart', (e) => this.noterSourceGlissee(e), { capture: true });
      this.registerDomEvent(doc, 'dragover', (e) => this.surDragOverParagraphe(e), { capture: true });
      this.registerDomEvent(doc, 'drop', (e) => this.surDropParagraphe(e), { capture: true });
      this.registerDomEvent(doc, 'dragend', () => { this._sourceGlissee = ''; this.nettoyerZoneDrop(); });
    };
    enregistrerDnD(document);
    // Rattrapage des fenêtres déjà ouvertes.
    this.app.workspace.onLayoutReady(() => {
      try {
        this.app.workspace.iterateAllLeaves((feuille) => {
          const c = feuille && feuille.view && feuille.view.containerEl;
          if (c && c.ownerDocument) enregistrerDnD(c.ownerDocument);
        });
      } catch (e) {
        console.warn('[Ariane] fenêtres détachées non parcourues :', e);
      }
    });
    this.registerEvent(
      this.app.workspace.on('window-open', (_wsWin, win) => {
        if (win && win.document) enregistrerDnD(win.document);
      })
    );
    // Suppression dynamique des notes de bas de page orphelines.
    this.registerEvent(
      this.app.workspace.on('editor-change', (editor) => {
        if (!this.settings.nettoyerNotesOrphelines) return;
        this.antirebond('notesOrphelines', () => this.nettoyageNotesOrphelines(editor), 1200);
      })
    );
    // Affiche dynamiquement le titre (alias) en aparté discret après un
    // lien d'annotation montrant la clé, en lecture. Non destructif.
    this.registerMarkdownPostProcessor((el, ctx) => this.enrichirLiensAnnotation(el, ctx));
    this.registerMarkdownPostProcessor((el) => this.rendreCitationsRepliables(el));
    this.registerMarkdownPostProcessor((el) => this.enrichirCompteursEmprunts(el));
    this.app.workspace.onLayoutReady(() => this.installerDecorateurExplorateur());
    this.app.workspace.onLayoutReady(() => {
      this.elaguerHistoriqueTemps();
      this.demarrerCompteurTemps();
      this.installerInfobulleTemps();
    });
    this._citVersion = 0;
    this.app.workspace.onLayoutReady(() => this.appliquerEtatCitations());
  }

  // Extensions CodeMirror (aparté en Live Preview, surlignage de phrase).
  // Chaque bloc est gardé : une API absente ne doit pas empêcher le
  // greffon de démarrer.
  _installerExtensionsEditeur() {
    // Même aparté en mode édition (Live Preview), via une extension CodeMirror.
    try {
      const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
      const { RangeSetBuilder } = require('@codemirror/state');
      const plugin = this;

      class AliasWidget extends WidgetType {
        constructor(texte) { super(); this.texte = texte; }
        eq(other) { return other.texte === this.texte; }
        toDOM() {
          const span = document.createElement('span');
          span.className = 'zfa-lien-alias';
          span.textContent = this.texte;
          return span;
        }
        ignoreEvent() { return true; }
      }

      const ext = ViewPlugin.fromClass(
        class {
          constructor(view) { this.decorations = this.build(view); }
          update(u) {
            if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = this.build(u.view);
          }
          build(view) {
            const builder = new RangeSetBuilder();
            if (!plugin.settings.aliasSurLiens) return builder.finish();
            for (const { from, to } of view.visibleRanges) {
              const texte = view.state.doc.sliceString(from, to);
              const re = /\[\[([^\]\n]+?)\]\]/g;
              let m;
              while ((m = re.exec(texte)) !== null) {
                if (m.index > 0 && texte[m.index - 1] === '!') continue; // embeds
                const inner = m[1];
                if (inner.includes('#')) continue;
                const parts = inner.split('|');
                if (parts.length > 1) continue; // alias manuel présent -> pas d'aparté auto
                const cible = parts[0].trim();
                const titre = plugin.titreAnnotationCiblee(cible, '', true);
                if (!titre) continue;
                const pos = from + m.index + m[0].length;
                builder.add(pos, pos, Decoration.widget({ widget: new AliasWidget(plugin.formatAparte(titre, cible)), side: 1 }));
              }
            }
            return builder.finish();
          }
        },
        { decorations: (v) => v.decorations }
      );

      this.registerEditorExtension(ext);
    } catch (e) {
      console.error('[Ariane] Aparté en édition indisponible :', e);
    }

    // Citations repliables en édition (Live Preview et mode source).
    // La citation est remplacée par une pastille cliquable ; le contenu
    // réapparaît si le curseur y entre, pour ne jamais gêner la frappe.
    try {
      const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
      const { RangeSetBuilder } = require('@codemirror/state');
      const plugin = this;

      class PastilleCitation extends WidgetType {
        constructor(nombre, deplier) { super(); this.nombre = nombre; this.deplier = deplier; }
        eq(autre) { return autre.nombre === this.nombre; }
        toDOM() {
          const b = document.createElement('span');
          b.className = 'zfa-cit-pastille';
          b.textContent = String(this.nombre);
          b.setAttribute('aria-label', this.nombre > 1
            ? this.nombre + ' références — cliquer pour déplier'
            : 'Une référence — cliquer pour déplier');
          b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
          b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.deplier(); });
          return b;
        }
        ignoreEvent() { return false; }
      }

      const extCitations = ViewPlugin.fromClass(
        class {
          constructor(view) {
            this.ouvertes = new Set();
            this.local = false;
            this.plages = [];
            this.version = plugin._citVersion;
            this.decorations = this.build(view);
          }
          update(u) {
            // Les décalages changent dès que le document change : les
            // exceptions ouvertes à la main ne survivent pas à une édition.
            if (u.docChanged) this.ouvertes.clear();

            // Le basculement global ne modifie ni le texte ni la sélection :
            // sans ce compteur, la vue restait telle quelle jusqu'au prochain
            // clic, ce qui donnait l'impression d'une latence considérable.
            const bascule = this.version !== plugin._citVersion;
            if (bascule) {
              this.version = plugin._citVersion;
              // Une commande globale reprend la main sur les citations
              // dépliées une à une : sans cet oubli, « tout replier » laissait
              // ouvertes celles que l'on avait touchées au doigt.
              this.ouvertes.clear();
            }

            // Dépliement d'une citation isolée : il ne passe pas par le
            // compteur global, qui viderait aussitôt l'exception demandée.
            const local = this.local;
            this.local = false;

            if (bascule || local || u.docChanged || u.viewportChanged) {
              this.decorations = this.build(u.view);
              return;
            }

            // Un simple déplacement du curseur ne change rien tant qu'il
            // n'entre ni ne sort d'une citation. C'est le cas le plus fréquent,
            // et le reconstruire à chaque frappe était inutilement coûteux.
            if (u.selectionSet && this.selectionCompte(u.startState, u.state)) {
              this.decorations = this.build(u.view);
            }
          }
          selectionCompte(avant, apres) {
            const a = avant.selection.main, b = apres.selection.main;
            for (const p of this.plages) {
              const dedansAvant = a.from <= p.to && a.to >= p.from;
              const dedansApres = b.from <= p.to && b.to >= p.from;
              if (dedansAvant !== dedansApres) return true;
            }
            return false;
          }
          build(view) {
            const builder = new RangeSetBuilder();
            this.plages = [];
            const s = plugin.settings;
            if (!s.citationsRepliables || !s.citationsRepliees) return builder.finish();
            const sel = view.state.selection.main;
            const self = this;
            for (const { from, to } of view.visibleRanges) {
              const texte = view.state.doc.sliceString(from, to);
              for (const c of citationsDuTexte(texte)) {
                const debut = from + c.index;
                const fin = debut + c.longueur;
                this.plages.push({ from: debut, to: fin });
                if (this.ouvertes.has(debut)) continue;
                // Curseur ou sélection dans la citation : on la laisse lisible.
                if (sel.from <= fin && sel.to >= debut) continue;
                builder.add(debut, fin, Decoration.replace({
                  widget: new PastilleCitation(c.nombre, () => {
                    self.ouvertes.add(debut);
                    self.local = true;
                    view.dispatch({});
                  }),
                }));
              }
            }
            return builder.finish();
          }
        },
        { decorations: (v) => v.decorations }
      );

      this.registerEditorExtension(extCitations);
    } catch (e) {
      console.error('[Ariane] Citations repliables indisponibles :', e);
    }

    // Surlignage de la phrase visée pendant un glisser (mode « cibler la phrase »).
    try {
      const { StateField, StateEffect } = require('@codemirror/state');
      const { Decoration, EditorView } = require('@codemirror/view');
      this.effetPhrase = StateEffect.define();
      const effetPhrase = this.effetPhrase;
      const marque = Decoration.mark({ class: 'zfa-drop-cible-phrase' });
      const champPhrase = StateField.define({
        create() { return Decoration.none; },
        update(deco, tr) {
          deco = deco.map(tr.changes);
          for (const ef of tr.effects) {
            if (ef.is(effetPhrase)) {
              deco = ef.value && ef.value.to > ef.value.from
                ? Decoration.set([marque.range(ef.value.from, ef.value.to)])
                : Decoration.none;
            }
          }
          return deco;
        },
        provide: (f) => EditorView.decorations.from(f),
      });
      this.registerEditorExtension(champPhrase);
    } catch (e) {
      console.error('[Ariane] Surlignage de phrase indisponible :', e);
    }
  }

  // Écoutes du coffre et de l'index de métadonnées. Les fermetures locales
  // (estCandidat, revaliderIndex, surTache…) restent volontairement ici :
  // elles ne servent qu'à ce câblage.
  _brancherEvenements() {
    // Suggestions : recalcul à la pause de frappe et au changement de note.
    const estCandidat = (f) => {
      if (!f || !f.path) return false;
      const dossiers = this.dossiersSuggeres();
      return !dossiers.length || dossiers.some((d) => f.path === d + '.md' || f.path.startsWith(d + '/'));
    };
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
      if (this.settings.suggActif) this.antirebond('suggestions', () => this.majSuggestions(false), 200);
    }));
    this.registerEvent(this.app.workspace.on('editor-change', () => {
      if (this.settings.suggActif) this.antirebond('suggestions', () => this.majSuggestions(false), this.settings.suggAntirebond || 900);
    }));
    // Bouton « Ouvrir dans Zotero » dans les lecteurs ZotFlow : au démarrage
    // pour les vues déjà restaurées, puis à chaque changement de disposition.
    this.app.workspace.onLayoutReady(() => this.decorerLecteursZotflow());
    this.registerEvent(this.app.workspace.on('layout-change', () => this.decorerLecteursZotflow()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.decorerLecteursZotflow()));

    // « Ouvrir dans Zotero », au clic droit sur la note comme dans l'éditeur.
    const entreeZotero = (menu, fichier) => {
      if (!fichier || fichier.extension !== 'md') return;
      if (!this.cibleZotero(fichier)) return;
      menu.addItem((it) => it.setTitle(tr('Ariane : ouvrir dans Zotero')).setIcon('external-link')
        .onClick(() => this.ouvrirDansZotero(fichier)));
    };
    this.registerEvent(this.app.workspace.on('file-menu', (menu, f) => entreeZotero(menu, f)));
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, ed, vue) => {
      entreeZotero(menu, vue && vue.file ? vue.file : this.app.workspace.getActiveFile());
    }));

    // Clic droit sur une sélection -> suggestions ciblées sur ce passage.
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor) => {
      const sel = editor && editor.getSelection ? editor.getSelection() : '';
      if (!sel || !sel.trim()) return;
      menu.addItem((it) => it.setTitle(tr('Ariane : suggestions pour ce passage')).setIcon('sparkles')
        .onClick(() => this.suggestionsPourArgument(sel)));
      menu.addItem((it) => it.setTitle(tr('Ariane : structurer en tâches')).setIcon('list-tree')
        .onClick(() => new ModaleStructurerTaches(this, sel).open()));
    }));
    // Invalidation de l'index quand une note candidate change.
    const revaliderIndex = (f) => {
      if (!estCandidat(f)) return;
      this.marquerNoteSale(f);
      if (this.settings.suggActif) this.antirebond('suggestionsIndex', () => this.majSuggestions(false), 1500);
    };
    // La date d'achèvement suit le statut. La passe ne réécrit que si la valeur
    // change vraiment, faute de quoi cette écoute se rappellerait elle-même.
    this.registerEvent(this.app.metadataCache.on('changed', async (fichier, _donnees, cacheNote) => {
      const fm = (cacheNote && cacheNote.frontmatter) || null;
      if (!fm) return;
      const jour = new Date().toISOString().slice(0, 10);
      const kFin = this.cleT('termine-le');
      const fmN = Object.assign({}, fm,
        { statut: this._lireT(fm, 'statut'), 'termine-le': this._lireT(fm, 'termine-le') });
      const valeur = Ariane.achevementAEcrire(fmN, jour);
      if (valeur === null) return;
      this.marquerEcriture(fichier.path);
      await this.app.fileManager.processFrontMatter(fichier, (x) => {
        x[kFin] = valeur;
        x.modifie = jour;
      });
    }));

    // « Sans échéance » (case dérivée) suit l'échéance : vrai tant qu'il n'y en
    // a pas. Écrite pour être sélectionnable comme n'importe quelle propriété
    // dans les bases. On ne réécrit que si la valeur change vraiment.
    this.registerEvent(this.app.metadataCache.on('changed', async (fichier, _d, cacheNote) => {
      if (!this.refDeChemin(fichier.path)) return;
      const fm = (cacheNote && cacheNote.frontmatter) || {};
      const kSE = this.cleT('sans-echeance');
      const v = Ariane.sansEcheanceAEcrire(this._lireT(fm, 'echeance'), this._lireT(fm, 'sans-echeance'));
      if (v === null) return;
      const jour = new Date().toISOString().slice(0, 10);
      this.marquerEcriture(fichier.path);
      await this.app.fileManager.processFrontMatter(fichier, (x) => { x[kSE] = v; x.modifie = jour; });
    }));

    // « terminee » (case) et « statut » restent en phase, dans les deux sens :
    // celui des deux qui vient de changer entraîne l'autre.
    this._etatTermine = this._etatTermine || new Map();
    this.registerEvent(this.app.metadataCache.on('changed', async (fichier, _d, cacheNote) => {
      if (!this.refDeChemin(fichier.path)) return;
      const fm = (cacheNote && cacheNote.frontmatter) || {};
      const kSt = this.cleT('statut');
      const kTe = this.cleT('terminee');
      const coche = this._lireT(fm, 'terminee') === true;
      const fini = this._lireT(fm, 'statut') === 'terminée';
      if (coche === fini) { this._etatTermine.set(fichier.path, { coche, fini }); return; }
      const av = this._etatTermine.get(fichier.path) || { coche: fini, fini };
      const caseModifiee = av.coche !== coche;
      const cible = caseModifiee
        ? { statut: coche ? 'terminée' : 'à faire' }   // la case pilote le statut
        : { terminee: fini };                           // le statut pilote la case
      this._etatTermine.set(fichier.path,
        { coche: cible.terminee != null ? cible.terminee : coche,
          fini: cible.statut ? cible.statut === 'terminée' : fini });
      this.marquerEcriture(fichier.path);
      await this.app.fileManager.processFrontMatter(fichier, (x) => {
        if (cible.statut != null) x[kSt] = cible.statut;
        if (cible.terminee != null) x[kTe] = cible.terminee;
        x.modifie = new Date().toISOString().slice(0, 10);
      });
    }));

    // Les incohérences des tâches se recalculent à l'entête, avec un antirebond
    // pour absorber une rafale de modifications.
    const surTache = (f) => {
      if (!f || !this.refDeChemin(f.path)) return;
      this.antirebond('incoherences-taches', () => this.recalculerIncoherences(), 1200);
    };
    this.registerEvent(this.app.metadataCache.on('changed', surTache));
    this.registerEvent(this.app.vault.on('delete', surTache));

    // Le bloc d'accès suit les champs de la note, sans commande à lancer.
    // Il ne se réécrit que s'il change vraiment, faute de quoi cette écoute
    // se rappellerait elle-même sans fin. L'antirebond évite en outre de
    // réécrire à chaque frappe pendant que Monsieur remplit ses propriétés.
    this.registerEvent(this.app.metadataCache.on('changed', (fichier) => {
      if (!this.refDeChemin(fichier.path)) return;
      this.antirebond('tache:' + fichier.path, () => this.majBlocTache(fichier));
    }));

    // Même principe pour la section « ## Créneaux » : elle suit « Tâche -
    // Créneaux » de la note, sans commande à lancer, et ne se réécrit que si
    // elle change vraiment (garde-fou anti-cycle dans majBlocCreneaux).
    this.registerEvent(this.app.metadataCache.on('changed', (fichier) => {
      if (!this.refDeChemin(fichier.path)) return;
      this.antirebond('creneaux:' + fichier.path, () => this.majBlocCreneaux(fichier), 600);
    }));

    // Les mêmes règles anti-cycle quand on modifie « Rattachement » ou « Bloquée
    // par » à la main — dans la note de tâche comme dans une base normale
    // (même événement). Un lien qui ferme un cycle du graphe fusionné est
    // aussitôt annulé, l'entête revenant à son dernier état sain.
    this._rattachOk = this._rattachOk || new Map();
    this.registerEvent(this.app.metadataCache.on('changed', (fichier) => {
      const ref = this.refDeChemin(fichier.path);
      if (!ref) return;
      this.antirebond('rattach:' + fichier.path, () => this.veillerRattachements(fichier, ref), 400);
    }));
    this.app.workspace.onLayoutReady(() => this.semerRattachOk());
    this.app.workspace.onLayoutReady(() => {
      // D'abord compléter les propriétés de tâche manquantes (toute nouvelle
      // propriété du plugin est ainsi rattrapée au démarrage), puis corriger
      // « sans-echeance » selon l'échéance courante.
      setTimeout(() => {
        Promise.resolve(this.semerConceptsTache())
          .then(() => this.semerSansEcheance())
          .catch(() => {});
      }, 3000);
    });

    // Apple Rappels : poussée automatique quand une tâche change, et relève
    // régulière tant qu'Obsidian est ouvert. Tout est inerte hors macOS ou si
    // l'intégration est coupée. Les gestes des vues passent par majTache
    // (jamais marquée écriture) → cette écoute les couvre aussi.
    this.registerEvent(this.app.metadataCache.on('changed', (fichier) => {
      if (!this.refDeChemin(fichier.path)) return;
      if (this.ecritePlugin(fichier.path)) return;
      this._relancerPushRappels(2500);
    }));
    this.app.workspace.onLayoutReady(() => {
      if (obsidian.Platform.isMacOS && this.settings.rappelsActif && this.settings.rappelsAuto) {
        setTimeout(() => this.releverRappels(true), 8000);
        this.registerInterval(window.setInterval(
          () => { if (this.settings.rappelsActif && this.settings.rappelsAuto) this.releverRappels(true); },
          Math.max(2, Number(this.settings.rappelsReleveMin) || 10) * 60000));
      }
    });

    // Apple Agenda : push antirebondi quand une note de tâche change de
    // l'extérieur (édition manuelle du frontmatter). Les gestes de la vue
    // calendrier passent par majCreneau → _relancerPushAgenda directement, car
    // marquerEcriture fait taire cette écoute.
    this.registerEvent(this.app.metadataCache.on('changed', (fichier) => {
      if (!this.refDeChemin(fichier.path)) return;
      if (this.ecritePlugin(fichier.path)) return;
      this._relancerPushAgenda(2500);
    }));
    this.app.workspace.onLayoutReady(() => {
      if (obsidian.Platform.isMacOS && this.settings.agendaActif && this.settings.agendaAuto !== false) {
        setTimeout(() => this.releverAgenda(true), 12000);
        this.registerInterval(window.setInterval(() => {
          if (!this.settings.agendaActif || this.settings.agendaAuto === false) return;
          if (this._agendaStatut === 2 || this._agendaStatut === 1) return;
          if (this._agendaPushEnAttente) return;
          this.releverAgenda(true);
        }, Math.max(2, Number(this.settings.agendaReleveMin) || 10) * 60000));
      }
    });
    // Synchro au changement de fenêtre : en revenant sur Obsidian on relève
    // (modifs faites dans Calendar) ; en quittant Obsidian on pousse tout de
    // suite ce qui est en attente (Calendar à jour quand on y bascule).
    this.registerDomEvent(window, 'focus', () => this._relancerReleveAgenda(700));
    this.registerDomEvent(window, 'blur', () => {
      if (!this._agendaAutoActif() || !this.antirebonds.has('agenda:push')) return;
      clearTimeout(this.antirebonds.get('agenda:push'));
      this.antirebonds.delete('agenda:push');
      Promise.resolve(this.pousserAgenda(true)).finally(() => { this._agendaPushEnAttente = false; });
    });
    // Même parti pour Apple Rappels : en revenant sur Obsidian on relève
    // (cases cochées, échéances changées dans Rappels) ; en quittant Obsidian
    // on pousse tout de suite ce qui est en attente (Rappels à jour quand on
    // y bascule).
    this.registerDomEvent(window, 'focus', () => this._relancerReleveRappels(700));
    this.registerDomEvent(window, 'blur', () => {
      if (!this._rappelsAutoActif() || !this.antirebonds.has('rappels:push')) return;
      clearTimeout(this.antirebonds.get('rappels:push'));
      this.antirebonds.delete('rappels:push');
      Promise.resolve(this.pousserRappels(true)).finally(() => { this._rappelsPushEnAttente = false; });
    });

    this.registerEvent(this.app.vault.on('modify', revaliderIndex));
    this.registerEvent(this.app.vault.on('create', revaliderIndex));
    this.registerEvent(this.app.vault.on('delete', revaliderIndex));
    this.registerEvent(this.app.vault.on('rename', (f) => revaliderIndex(f)));

    // L'index des tâches se lit sur les chemins : seul un chemin qui bouge le
    // périme. Une modification de contenu n'y change rien, d'où l'absence de
    // « modify » ici — c'est ce qui rend le cache rentable.
    for (const ev of ['create', 'delete', 'rename']) {
      this.registerEvent(this.app.vault.on(ev, () => this._invaliderIndexTaches()));
    }
  }

  // Ce qui ne démarre qu'une fois la disposition prête : écoutes tardives,
  // reprises différées, minuteries.
  _demarrerMinuteries() {
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.vault.on('modify', (f) => this.surModification(f)));

      // Un schéma draw.io modifié -> on rafraîchit l'extrait dans sa note.
      const majSchema = (f) => {
        if (!this.settings.schemaSyncAuto) return;
        if (!(f instanceof obsidian.TFile) || !this.estSchemaDrawio(f)) return;
        this.antirebond('schema:' + f.path, () => this.synchroniserSchema(f, true), 1200);
      };
      this.registerEvent(this.app.vault.on('modify', majSchema));

      // Bibliographie : régénérée après une pause dans la frappe.
      this.registerEvent(this.app.vault.on('modify', (f) => {
        if (!this.settings.biblioAuto) return;
        if (!(f instanceof obsidian.TFile) || f.extension !== 'md') return;
        if (this.ecritePlugin(f.path)) return;
        if (f.path.startsWith(this.dossierA + '/') || f.path.startsWith('Références/')) return;
        this.antirebond('biblio:' + f.path, () => this.majBibliographie(f, true), 2500);
      }));
      this.registerEvent(this.app.vault.on('create', majSchema));
      this.registerEvent(this.app.vault.on('create', (f) => this.surCreation(f)));
      this.registerEvent(this.app.vault.on('create', (f) => this.surCreationTacheVierge(f)));
      this.registerEvent(this.app.vault.on('delete', (f) => this.surSuppression(f)));

      // Tag « orpheline » : mise à jour quand les liens changent.
      this.registerEvent(this.app.metadataCache.on('resolved', () => {
        if (!this.settings.marquerOrphelines) return;
        this.antirebond('orphelines', () => this.synchroniserTagsOrphelines(), 800);
      }));
      if (this.settings.marquerOrphelines) {
        this.antirebond('orphelines', () => this.synchroniserTagsOrphelines(), 1500);
      }
    });
  }

  onunload() {
    for (const t of this.antirebonds.values()) clearTimeout(t);
    this.antirebonds.clear();
    // Le cache d'embeddings n'est plus écrit à chaque frappe : il faut donc le
    // poser au plus tard ici, faute de quoi la session serait perdue.
    if (this.suggEmbMinuteur) { clearTimeout(this.suggEmbMinuteur); this.suggEmbMinuteur = null; }
    this.sauverCacheEmbeddings().catch(() => { /* fermeture en cours */ });
    // Dernier report : sans cela, les minutes de la session en cours seraient
    // perdues à la fermeture d'Obsidian ou au rechargement du greffon.
    this.reporterTemps().catch(() => { /* fermeture en cours */ });
  }

  //#endregion Ariane · cycle de vie
}

//#endregion 11 · class Ariane

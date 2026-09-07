//#region 11 · class Ariane
// ═══════════════════════════════════════════════════════════════════════════
//  11 · CLASS ARIANE  (extends obsidian.Plugin)
//  Le greffon lui-même. Sous-régions : cycle de vie · commandes · événements ·
//  helpers static (par domaine) · méthodes d'instance (par domaine).
// ═══════════════════════════════════════════════════════════════════════════

class Ariane extends obsidian.Plugin {
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

  //#region Ariane · static · getters
  // ── static · getters ─────────────────────────────────────────────────────

  // Ce qui ne voyage pas : chemins absolus et adresses de services locaux.
  // Un profil partagé ne doit jamais imposer l'installation de qui l'a écrit.
  static get CLES_MACHINE() {
    return ['exportPandocBin', 'exportFiltreLua', 'exportModeleWord',
            'suggOllamaUrl', 'suggLmStudioUrl'];
  }

  // Ce qui ne voyage pas non plus : l'état accumulé, propre au coffre.
  static get CLES_ETAT() {
    return ['tempsTotalSecondes', 'tempsHistorique', 'rattachementsIgnores',
            'famillesNotes', 'dossierAnnotations', 'dossierNotesLecture',
            'dossierReferences', 'dossierBibliographies', 'exportDossier',
            'dossierTaches', 'tempsDossierJournal'];
  }

  // Vocabulaire de type FR partagé entre l'éditeur de familles, le menu
  // « Type » de l'en-tête de frise et le rendu des cartes d'articulation.
  static get TYPE_FR_VERS_OBSIDIAN() {
    return { texte: 'text', nombre: 'number', date: 'date',
             case: 'checkbox', liste: 'multitext', lien: 'link' };
  }

  // Les propriétés communes à toutes les tâches : identifiant interne, intitulé
  // affiché par défaut (renommable dans les réglages), icône (fixe).
  static get PROPS_GENERIQUES() {
    return [
      { cle: 'intitule', defaut: 'Intitulé', icone: 'text' },
      { cle: 'famille', defaut: 'Famille', icone: 'shapes' },
      { cle: 'statut', defaut: 'Statut', icone: 'circle-dot' },
      { cle: 'terminee', defaut: 'Terminée', icone: 'check-check' },
      { cle: 'priorite', defaut: 'Priorité', icone: 'flag' },
      { cle: 'jalon', defaut: 'Jalon', icone: 'diamond' },
      { cle: 'debut', defaut: 'Début', icone: 'calendar' },
      { cle: 'echeance', defaut: 'Échéance', icone: 'calendar-check' },
      { cle: 'heure', defaut: 'Heure', icone: 'clock' },
      { cle: 'sans-echeance', defaut: 'Sans échéance', icone: 'calendar-off' },
      { cle: 'creneaux', defaut: 'Créneaux', icone: 'calendar-clock' },
      { cle: 'avancement', defaut: 'Avancement', icone: 'percent' },
      { cle: 'parent', defaut: 'Rattachée à', icone: 'git-branch' },
      { cle: 'thematique', defaut: 'Thématique', icone: 'folder-tree' },
    ];
  }

  // Concepts génériques dont la clé de frontmatter est renommable / préfixable
  // (tous sauf l'intitulé, qui n'est pas une vraie propriété mais le premier
  // alias). On y ajoute les champs structurels propres aux tâches.
  static get CONCEPTS_TACHE() {
    return ['famille', 'statut', 'terminee', 'priorite', 'jalon',
            'debut', 'echeance', 'heure', 'sans-echeance', 'creneaux', 'avancement', 'parent',
            'bloque-par', 'termine-le',
            'source', 'livrable', 'fichier', 'liste', 'rappel-id', 'agenda-id', 'thematique'];
  }

  // Zones thématiques de l'articulation : une zone nommée couvre un rectangle
  // de l'espace scène ; la thématique d'une carte est le nom de la DERNIÈRE
  // zone (ordre du plan) contenant son centre, sinon ''. La géométrie fait
  // foi : c'est la même règle après un glissé de carte qu'après une
  // modification de zone.
  static thematiqueDe(zones, x, y) {
    let nom = '';
    for (const z of zones || []) {
      if (!z || !Number.isFinite(z.x) || !Number.isFinite(z.y)
        || !Number.isFinite(z.w) || !Number.isFinite(z.h)) continue;
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) nom = z.nom || '';
    }
    return nom;
  }

  // Les seules cartes dont la thématique calculée diffère de la valeur portée
  // — on n'écrit jamais une note pour rien. `cartes` = [{ ref, x, y,
  // thematique }], la valeur actuelle lue par le moteur (cache ou note).
  static changementsThematique(zones, cartes) {
    const out = [];
    for (const c of cartes || []) {
      if (!c || !c.ref) continue;
      const nv = Ariane.thematiqueDe(zones, c.x, c.y);
      if ((c.thematique || '') !== nv) out.push({ ref: c.ref, thematique: nv });
    }
    return out;
  }

  // Regroupement des propriétés d'une tâche (habillage de la note). `famille`
  // est traité à part (en tête, distinct). Les propriétés apportées par la
  // famille (source/livrable/fichier + clés déclarées) vont dans un volet final.
  static get GROUPES_TACHE() {
    return [
      { id: 'etat', nom: 'État & progression', concepts: ['statut', 'terminee', 'priorite', 'avancement'] },
      { id: 'planning', nom: 'Planning', concepts: ['debut', 'echeance', 'heure', 'creneaux', 'jalon', 'termine-le'] },
      { id: 'relations', nom: 'Relations', concepts: ['parent', 'bloque-par'] },
      { id: 'rappel', nom: 'Rappel', concepts: ['liste', 'rappel-id'] },
      { id: 'agenda', nom: 'Agenda', concepts: ['agenda-id'] },
    ];
  }

  // Concepts du « noyau » d'une tâche (états + planning + relations, hors
  // rappel) et leur valeur d'amorçage. Dérivé de GROUPES_TACHE pour rester la
  // seule source de vérité ; « sans-echeance » n'est dans aucun groupe (dérivé
  // de l'échéance), on l'ajoute à la main. Les scalaires vides valent `null` :
  // processFrontMatter écrit alors « clé: » sans valeur, comme corpsNouvelleTache.
  static defautsNoyau() {
    const typees = {
      terminee: false, jalon: false,
      creneaux: [], 'bloque-par': [],
      avancement: 0, statut: 'à faire',
    };
    const out = {};
    for (const g of Ariane.GROUPES_TACHE) {
      if (g.id === 'rappel' || g.id === 'agenda') continue;
      for (const c of g.concepts) out[c] = (c in typees) ? typees[c] : null;
    }
    out['sans-echeance'] = false;
    return out;
  }

  // Parmi les concepts de `defauts`, ceux absents d'une note selon `lire`
  // (callback : concept → valeur lue, `undefined` si la note ne la porte sous
  // aucune forme). Renvoie `{ cléRéelle: valeur }` prêt pour processFrontMatter,
  // la clé venant de `cleDe`. « sans-echeance » prend la valeur dérivée de
  // l'échéance lue. N'écrase jamais : une valeur déjà présente est ignorée.
  static conceptsAAmorcer(defauts, lire, cleDe) {
    const out = {};
    for (const c of Object.keys(defauts)) {
      if (lire(c) !== undefined) continue;
      out[cleDe(c)] = c === 'sans-echeance' ? !lire('echeance') : defauts[c];
    }
    return out;
  }

  static get COULEURS_GANTT() {
    return {
      'à faire': 'var(--text-faint)',
      'en cours': 'var(--color-yellow)',
      'en attente': 'var(--color-orange)',
      'terminée': 'var(--color-green)',
      'abandonnée': 'var(--text-faint)',
    };
  }

  static get ZOOMS_GANTT() {
    return { jour: 44, semaine: 22, mois: 8, trimestre: 3, 'année': 1 };
  }

  // Modes de couleur des barres de la frise (réglage friseBarreCouleur) :
  // [valeur, libellé de la page Réglages, libellé court de la barre de vue].
  static get MODES_COULEUR_FRISE() {
    return [
      ['famille', 'Famille', 'Famille'],
      ['statut', 'Statut', 'Statut'],
      ['racine', 'Tâche parente (arborescence)', 'Arborescence'],
      ['priorite', 'Priorité', 'Priorité'],
      ['avancement', 'Avancement', 'Avancement'],
    ];
  }

  // Palette « par arborescence » : couleurs moyennement saturées, lisibles sur
  // les deux thèmes (le libellé des barres reste en couleur de texte normale).
  static get COULEURS_RACINES() {
    return ['#e0533d', '#d9832b', '#e0ac00', '#59b07a', '#2f9fe0', '#38c0c7',
      '#6c7df0', '#c666e0', '#ec7cb4', '#8a6f4b', '#7c8aa0', '#4b9e6f'];
  }

  // Indice stable d'une chaîne dans la palette (hachage FNV-1a 32 bits) :
  // même ref → même couleur, quel que soit l'ordre des lignes ou la session.
  static indiceRacine(ref) {
    const s = String(ref || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h % Ariane.COULEURS_RACINES.length;
  }

  static couleurRacine(ref) {
    return Ariane.COULEURS_RACINES[Ariane.indiceRacine(ref)];
  }

  // Racine de chaque arborescence : ref → ref de l'ancêtre le plus haut.
  // Un parent absent des lignes (hors filtre, note supprimée) met fin à la
  // montée : la tâche devient sa propre racine. Un cycle s'arrête de lui-même.
  static racinesArborescence(lignes) {
    const parRef = new Map();
    for (const l of lignes || []) if (l && l.ref) parRef.set(l.ref, l);
    const out = new Map();
    for (const l of parRef.values()) {
      const vues = new Set();
      let cur = l;
      while (cur && !vues.has(cur.ref)) {
        vues.add(cur.ref);
        out.set(l.ref, cur.ref);
        cur = (cur.parent && parRef.get(cur.parent)) || null;
      }
    }
    return out;
  }

  // Couleur de barre « par priorité » : les mêmes teintes que les badges.
  static get COULEURS_PRIORITE() {
    return {
      haute: 'var(--color-red)',
      moyenne: 'var(--color-orange)',
      basse: 'var(--color-blue)',
    };
  }

  // Couleur de barre « par avancement » : dégradé gris-bleu (0 %) → vert
  // (100 %), reprenant le « à faire » et le « terminée » de la frise.
  static couleurAvancement(p) {
    const x = Math.max(0, Math.min(100, Number(p) || 0));
    if (!x) return 'var(--text-faint)';
    const a = [138, 148, 164];
    const b = [47, 158, 91];
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * (x / 100)));
    return 'rgb(' + c[0] + ', ' + c[1] + ', ' + c[2] + ')';
  }

  // Sentinelle du groupe « sans valeur » : impossible à confondre avec un
  // libellé réel. La vue la remplace par « (sans <propriété>) » à l'affichage.
  static get SANS_GROUPE() { return ' sans'; }

  //#endregion Ariane · static · getters

  //#region Ariane · static · références
  // ── static · références ──────────────────────────────────────────────────

  // Deux formes ont coexisté dans le cache : les tableaux « reference » bruts de
  // Crossref, et la forme d'Ariane { auteurs, annee, titre, doi, brut }. On
  // convertit à la lecture, pour n'en manipuler qu'une seule ensuite.
  static normaliserEntree(e) {
    if (!e || typeof e !== 'object') return null;
    if (Array.isArray(e.auteurs) || e.annee !== undefined) return e; // déjà normalisée
    const brut = String(e.unstructured || '').trim();
    const decoupe = e._ariane || null;
    const auteur = String(e.author || '').trim();
    const auteurs = decoupe && decoupe.auteurs && decoupe.auteurs.length
      ? decoupe.auteurs
      : (auteur ? auteur.split(/[^\p{L}\p{M}'-]+/u).filter((x) => x.length > 1) : []);
    return {
      auteurs,
      annee: String(e.year || (decoupe && decoupe.annee) || '').trim(),
      titre: String(e['article-title'] || e['volume-title'] || (decoupe && decoupe.titre) || '').trim(),
      revue: String(e['journal-title'] || (decoupe && decoupe.revue) || '').trim(),
      doi: normDoi(e.DOI),
      brut,
    };
  }

  static normaliserBiblio(liste) {
    return (liste || []).map((e) => Ariane.normaliserEntree(e)).filter(Boolean);
  }

  // Une entrée de bibliographie porte le nom SUIVI d'initiales, « March, S. T.
  // (1995) », ce qu'un appel en cours de texte n'écrit jamais : « (March and
  // Smith 1995) ». C'est ce discriminant qui distingue les deux, et il est
  // fiable — vérifié sur huit références d'un même ouvrage.
  static entreeDansTexte(texte, nomFamille, annee) {
    if (!texte || !nomFamille || !annee) return null;
    let motif;
    try {
      motif = new RegExp(echapperRegex(nomFamille)
        + ',\\s*(?:[A-Z]\\.\\s*){1,4}[^\\n]{0,120}?\\b' + annee + '\\b[^\\n]{0,320}', 'g');
    } catch (e) { return null; }
    let brut = null;
    let m;
    while ((m = motif.exec(texte)) !== null) {
      const s = m[0].replace(/\s+/g, ' ').trim();
      if (!brut || s.length > brut.length) brut = s;
    }
    if (!brut) return null;
    // Couper à l'entrée suivante, qui commence par « Nom, X. ».
    const suivante = /\s(?:[A-Z][\wÀ-ÿ'’-]+(?:\s[A-Z][\wÀ-ÿ'’-]+)?,\s*(?:[A-Z]\.\s*){1,4})/;
    const apres = brut.indexOf(annee) + annee.length;
    const d = suivante.exec(brut.slice(apres));
    if (d) brut = brut.slice(0, apres + d.index).trim();
    let titre = '';
    const mt = new RegExp(annee + '\\)?\\s*[.,]\\s*(.+?)(?:\\.\\s|\\.$)').exec(brut);
    if (mt) titre = mt[1].trim();
    return { brut, titre };
  }

// Deux entrées désignent le même travail quand l'une des deux commence ou
  // contient l'autre au-delà de douze caractères : « Co-opetition » et
  // « Co‐opetition: A revolutionary mindset… », « Designing interactive
  // strategy » et « From value chain… designing interactive strategy ». Deux
  // DOI distincts restent deux œuvres, quel que soit le titre.
  static fondreOeuvresProches(liste) {
    const clef = (t) => sansAccents(t || '')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const out = [];
    for (const o of liste) {
      const ko = clef(o.titre);
      const jumeau = out.find((x) => {
        if (x.doi && o.doi) return x.doi === o.doi;
        if (x.doi !== o.doi && (x.doi || o.doi)) return false;
        const kx = clef(x.titre);
        if (!ko || !kx) return false;
        const court = ko.length < kx.length ? ko : kx;
        const long = ko.length < kx.length ? kx : ko;
        if (court.length >= 12 && long.includes(court)) return true;
        // Un mot d'écart ne fait pas deux œuvres : « Design science in
        // information systems research » et « Design research in information
        // systems research » sortent du même PDF, à une coquille près.
        const a = new Set(court.split(' ').filter((w) => w.length > 2));
        const b = new Set(long.split(' ').filter((w) => w.length > 2));
        if (a.size < 3 || b.size < 3) return false;
        let communs = 0;
        for (const w of a) if (b.has(w)) communs += 1;
        return communs / Math.max(a.size, b.size) >= 0.75;
      });
      if (!jumeau) { out.push(o); continue; }
      jumeau.n += o.n;
      for (const sr of o.sources) if (!jumeau.sources.includes(sr)) jumeau.sources.push(sr);
      if ((o.titre || '').length > (jumeau.titre || '').length) jumeau.titre = o.titre;
      if (!jumeau.doi && o.doi) jumeau.doi = o.doi;
    }
    return out;
  }

  // Le modèle rend parfois « {"annee":["2012"]} » au lieu d'une chaîne : on
  // accepte les deux plutôt que de perdre l'extraction sur une vétille.
  static premier(v) {
    if (Array.isArray(v)) return v.length ? String(v[0]).trim() : '';
    return String(v == null ? '' : v).trim();
  }

  // Moteur de gabarit à jetons, partagé par la référence de tâche et le titre
  // du rappel Apple. `{n}` → vars.n ; `{n:3}` → vars.n complété de zéros à
  // gauche sur 3 chiffres (au moins) ; `{clé}` → vars.clé si défini, sinon le
  // jeton reste verbatim ; le reste est littéral.
  static formatModele(modele, vars) {
    const v = vars || {};
    return String(modele == null ? '' : modele).replace(
      /\{(\w+)(?::(\d+))?\}/g,
      (jeton, cle, largeur) => {
        if (cle === 'n' && v.n != null) {
          const s = String(Math.trunc(Number(v.n)) || 0);
          return largeur ? s.padStart(Number(largeur), '0') : s;
        }
        return v[cle] != null ? String(v[cle]) : jeton;
      });
  }

  // Décompose un gabarit de référence en { prefixe, suffixe, largeur } autour de
  // son unique jeton `{n}` / `{n:W}`. Rend null si le jeton manque ou apparaît
  // plus d'une fois (gabarit refusé).
  static analyserGabaritRef(gabarit) {
    const g = String(gabarit == null ? '' : gabarit);
    const re = /\{n(?::(\d+))?\}/g;
    const trouves = [...g.matchAll(re)];
    if (trouves.length !== 1) return null;
    const m = trouves[0];
    return {
      prefixe: g.slice(0, m.index),
      suffixe: g.slice(m.index + m[0].length),
      largeur: m[1] ? Number(m[1]) : 1,
    };
  }

  // Référence d'une tâche : un compteur incrémental habillé par `gabarit`
  // (défaut « T-{n:3} » → T-001). Le rang ne réemploie jamais un numéro libéré ;
  // une référence est définitive, deux tâches distinctes ne portent jamais le
  // même nom. Le plus grand rang déjà pris est cherché à la fois sur le gabarit
  // courant ET sur la forme héritée « T26-041 » (seule forme jamais produite
  // avant) : un coffre déjà numéroté continue sa série au lieu de repartir à 1.
  static referenceTacheSuivante(noms, gabarit) {
    const spec = Ariane.analyserGabaritRef(gabarit) || { prefixe: 'T-', suffixe: '', largeur: 3 };
    const reExact = new RegExp(
      '^' + Ariane._echapRe(spec.prefixe) + '(\\d+)' + Ariane._echapRe(spec.suffixe) + '$');
    const reHerite = /^T\d{2}-(\d+)$/;
    let max = 0;
    for (const nom of noms || []) {
      if (typeof nom !== 'string') continue;
      const m = nom.match(reExact) || nom.match(reHerite);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return spec.prefixe + String(max + 1).padStart(spec.largeur, '0') + spec.suffixe;
  }

  static _echapRe(s) {
    return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Incrémente les derniers chiffres d'une référence en gardant leur largeur
  // (« T-007 » → « T-008 », « TASK9 » → « TASK10 »). Sans chiffres, suffixe -2.
  static incrementerRef(ref) {
    const r = String(ref == null ? '' : ref);
    if (!/\d(?!.*\d)/.test(r)) return r + '-2';
    return r.replace(/(\d+)(?!.*\d)/, (d) => String(parseInt(d, 10) + 1).padStart(d.length, '0'));
  }

  // Cherche dans `texte` (un titre de rappel Apple) la référence d'une tâche
  // connue (`refs` : Set de réfs), sans supposer de forme : d'abord un jeton
  // entre crochets, puis n'importe quelle réf (longueur ≥ 3) en sous-chaîne.
  // Rend la réf trouvée ou ''.
  static refDansTexte(texte, refs) {
    const s = String(texte == null ? '' : texte);
    const jeu = refs instanceof Set ? refs : new Set(refs || []);
    const crochet = s.match(/\[([^\]]+)\]/);
    if (crochet && jeu.has(crochet[1].trim())) return crochet[1].trim();
    let trouve = '';
    for (const r of jeu) {
      if (typeof r === 'string' && r.length >= 3 && s.includes(r) && r.length > trouve.length) {
        trouve = r;
      }
    }
    return trouve;
  }

  // Un chemin est-il dans l'un des dossiers listés (ou un de leurs
  // sous-dossiers) ? Les entrées sont normalisées (sans / de tête/queue).
  static sousDossier(chemin, dossiers) {
    const p = String(chemin || '');
    for (let d of dossiers || []) {
      d = String(d || '').trim().replace(/^\/+|\/+$/g, '');
      if (!d) continue;
      if (p === d || p.startsWith(d + '/')) return true;
    }
    return false;
  }

  // Décrit ce qu'il faut ajouter à un fichier .base (objet déjà analysé) pour
  // que les colonnes de tâche s'affichent sans le préfixe : un `displayName`
  // dépréfixé pour chaque propriété préfixée citée qui n'en a pas déjà un.
  // Ne propose jamais d'écraser un displayName choisi à la main.
  static planHarmonisationBase(base, prefixe) {
    const pre = String(prefixe || '');
    const vide = { ajouts: [] };
    if (!pre || !base || typeof base !== 'object') return vide;
    const cites = new Set();
    const noter = (n) => {
      if (typeof n !== 'string') return;
      const brut = n.startsWith('note.') ? n.slice(5) : n;
      if (brut.length > pre.length && brut.startsWith(pre)) cites.add(brut);
    };
    const scan = (v) => {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v.order)) v.order.forEach(noter);
      if (Array.isArray(v.sort)) v.sort.forEach((s) => noter(s && s.property));
      if (v.groupBy) noter(v.groupBy.property);
      for (const k of Object.keys(v.columnSize || {})) noter(k);
      for (const k of Object.keys(v.properties || {})) noter(k);
    };
    scan(base);
    if (Array.isArray(base.views)) base.views.forEach(scan);
    if (!cites.size) return vide;
    const props = (base.properties && typeof base.properties === 'object') ? base.properties : {};
    const aDejaNom = (brut) => {
      const e = props['note.' + brut] || props[brut];
      return !!(e && typeof e === 'object'
        && typeof e.displayName === 'string' && e.displayName.trim());
    };
    const ajouts = [];
    for (const brut of cites) {
      if (aDejaNom(brut)) continue;
      ajouts.push({ cle: 'note.' + brut, nom: brut.slice(pre.length) });
    }
    return { ajouts };
  }

  // Insère (ou complète) le bloc `properties:` de niveau racine dans le TEXTE
  // d'un .base sans re-sérialiser le reste : on préserve tel quel les chaînes
  // fragiles (p. ex. arianeArtPlan, que stringifyYaml couperait sur 80 col).
  static insererProprietesBase(texte, ajouts) {
    if (!ajouts || !ajouts.length) return texte;
    const eol = texte.includes('\r\n') ? '\r\n' : '\n';
    const lignes = texte.split(/\r?\n/);
    const entrees = [];
    for (const a of ajouts) {
      entrees.push('  ' + JSON.stringify(a.cle) + ':');
      entrees.push('    displayName: ' + JSON.stringify(a.nom));
    }
    const iProps = lignes.findIndex((l) => /^properties:[ \t]*$/.test(l));
    if (iProps !== -1) {
      let fin = iProps + 1;
      while (fin < lignes.length && (lignes[fin] === '' || /^[ \t]/.test(lignes[fin]))) fin++;
      lignes.splice(fin, 0, ...entrees);
      return lignes.join(eol);
    }
    // Un `properties:` en ligne (« properties: {} ») : on n'ose pas créer un
    // second bloc (clé dupliquée). On laisse le fichier tel quel.
    if (lignes.some((l) => /^properties:/.test(l))) return texte;
    const bloc = ['properties:', ...entrees];
    const iViews = lignes.findIndex((l) => /^views:[ \t]*$/.test(l));
    if (iViews !== -1) {
      lignes.splice(iViews, 0, ...bloc);
    } else {
      if (lignes.length && lignes[lignes.length - 1] !== '') lignes.push('');
      lignes.push(...bloc);
    }
    return lignes.join(eol);
  }

  // Icône (nom lucide) d'un concept de tâche — la même variété que le
  // formulaire de création. Défaut « tag » pour l'inconnu.
  static iconeConcept(concept) {
    const d = Ariane.PROPS_GENERIQUES.find((p) => p.cle === concept);
    if (d) return d.icone;
    return ({
      'bloque-par': 'ban', 'termine-le': 'calendar-check', source: 'book-marked',
      livrable: 'package', fichier: 'file', liste: 'list-checks', 'rappel-id': 'bell',
    })[concept] || 'tag';
  }

  // Nom de fichier encore générique (« Sans titre », « Untitled 3 ») : c'est
  // qu'Obsidian l'a créé sans que l'utilisateur le nomme. On peut alors lui
  // attribuer une référence. Un nom choisi (même s'il commence par ces mots)
  // est respecté.
  static estNomTacheGenerique(nom) {
    return /^(sans titre|untitled)( \d+)?$/i.test(String(nom || '').trim());
  }

  //#endregion Ariane · static · références

  //#region Ariane · static · dates & jours
  // ── static · dates & jours ───────────────────────────────────────────────

  // Les dates circulent en chaînes « AAAA-MM-JJ » et l'arithmétique passe par
  // UTC. Un Date local franchissant un changement d'heure décale d'un jour, ce
  // qui déplacerait des barres deux fois par an sans qu'on comprenne pourquoi.
  static jourValide(v) {
    const s = String(v == null ? '' : v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    const [a, m, j] = s.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1, j));
    // Écarte le 31 février et consorts, que Date.UTC reporterait en silence.
    return (d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j) ? s : '';
  }

  static _versUTC(jour) {
    const s = Ariane.jourValide(jour);
    if (!s) return null;
    const [a, m, j] = s.split('-').map(Number);
    return Date.UTC(a, m - 1, j);
  }

  static decalerJour(jour, n) {
    const t = Ariane._versUTC(jour);
    if (t === null) return '';
    return new Date(t + (Number(n) || 0) * 86400000).toISOString().slice(0, 10);
  }

  static ecartJours(a, b) {
    const ta = Ariane._versUTC(a);
    const tb = Ariane._versUTC(b);
    if (ta === null || tb === null) return 0;
    return Math.round((tb - ta) / 86400000);
  }

  // Numéro de semaine ISO. La règle ISO rattache la semaine au jeudi, ce qui
  // évite qu'une semaine à cheval sur deux années soit comptée deux fois.
  static semaineIso(jour) {
    const t = Ariane._versUTC(jour);
    if (t === null) return 0;
    const d = new Date(t);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const debutAnnee = Date.UTC(d.getUTCFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - debutAnnee) / 86400000 + 1) / 7);
  }

  //#endregion Ariane · static · dates & jours

  //#region Ariane · static · tâches
  // ── static · tâches ──────────────────────────────────────────────────────

  // Nom lisible d'un concept de tâche. C'est TOUJOURS ce nom qui sert de base
  // à la clé de frontmatter (« Échéance », pas « echeance ») ; l'utilisateur
  // n'a pas à choisir.
  static libelleConcept(concept) {
    const d = Ariane.PROPS_GENERIQUES.find((p) => p.cle === concept);
    if (d) return tr(d.defaut);
    return ({
      'bloque-par': 'Bloquée par', 'termine-le': 'Terminée le',
      source: 'Source', livrable: 'Livrable', fichier: 'Fichier',
      liste: 'Liste', 'rappel-id': 'Rappel ID',
    })[concept] || concept;
  }

  // Clé de frontmatter d'un concept de tâche. Règle UNIQUE :
  //   clé = `prefixe` + label
  //   label = `cles[concept]` si l'utilisateur l'a personnalisé,
  //           sinon le nom lisible par défaut.
  // Le préfixe s'applique TOUJOURS, à toutes les propriétés de la même façon.
  // (`intitule` reste à part : il vit dans `aliases`.)
  static cleTache(concept, opts) {
    if (concept === 'intitule') return 'intitule';
    const o = opts || {};
    const perso = String((o.cles || {})[concept] || '').trim();
    const label = perso || Ariane.libelleConcept(concept);
    return (o.prefixe || '') + label;
  }

  // La famille d'une tâche n'est pas déclarée, elle se déduit du champ rempli.
  // Un champ « famille » pourrait contredire les champs présents ; son absence
  // rend la contradiction impossible.
  // L'ordre est aussi celui de la priorité quand plusieurs sont remplis.
  static champTache(fm) {
    const ordre = ['source', 'livrable', 'fichier'];
    const remplis = ordre.filter((c) => fm && String(fm[c] == null ? '' : fm[c]).trim());
    return { retenu: remplis[0] || null, conflits: remplis.length > 1 ? remplis : [] };
  }

  static familleTache(fm, familles, defaut) {
    const liste = Array.isArray(familles) ? familles : null;
    // Appel historique (un seul argument) : on garde la déduction d'origine.
    if (!liste) {
      const retenu = Ariane.champTache(fm).retenu;
      if (retenu === 'source') return 'lecture';
      return retenu ? 'production' : 'action';
    }
    const connus = new Set(liste.map((f) => f && f.id).filter(Boolean));
    const explicite = fm && fm.famille ? String(fm.famille).trim() : '';
    if (explicite && connus.has(explicite)) return explicite;
    const retenu = Ariane.champTache(fm).retenu;
    if (retenu === 'source' && connus.has('lecture')) return 'lecture';
    if (retenu && connus.has('production')) return 'production';
    return (defaut && connus.has(defaut)) ? defaut
      : (connus.has('action') ? 'action' : (liste[0] && liste[0].id) || 'action');
  }

  // Les propriétés qu'une famille ajoute à une tâche et qui n'existent pas
  // encore dans son entête. « Existe » = la clé est présente, même vide.
  static proprietesManquantes(fm, famille) {
    const props = (famille && Array.isArray(famille.proprietes)) ? famille.proprietes : [];
    const cles = new Set(Object.keys(fm || {}));
    return props
      .filter((p) => p && p.cle && !cles.has(p.cle))
      .map((p) => ({ cle: p.cle, type: p.type || 'texte' }));
  }

  // Une valeur YAML citée. Les intitulés portent des apostrophes, des deux
  // points et des guillemets typographiques : les citer systématiquement évite
  // d'avoir à décider au cas par cas.
  static yamlChaine(v) {
    const s = String(v == null ? '' : v);
    if (!s) return '';
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  // Le corps d'une note de tâche neuve. Tous les champs du schéma sont émis,
  // y compris vides : l'éditeur de propriétés d'Obsidian ne montre que ce qui
  // existe, et une tâche dont les champs manquent est une tâche qu'on ne pense
  // pas à remplir. Un champ vide s'écrit sans espace en fin de ligne, que
  // certains éditeurs suppriment et qui ferait alors diverger le fichier.
  static corpsNouvelleTache(champs) {
    const c = champs || {};
    const q = Ariane.yamlChaine;
    const ligne = (cle, val) => cle + ':' + (val ? ' ' + val : '');
    // Clés personnalisées éventuelles : c.cles = { concept: 'nom réel', … }.
    const K = (concept) => (c.cles && c.cles[concept]) || concept;
    const intitule = c.intitule || 'Sans titre';
    const jour = c.aujourdhui || '';
    const l = [];
    l.push('---');
    l.push('aliases:');
    l.push('  - ' + q(intitule));
    l.push('type: tache');
    l.push(ligne(K('famille'), c.famille));
    l.push(ligne(K('statut'), c.statut || 'à faire'));
    l.push(K('terminee') + ': ' + ((c.statut || '') === 'terminée' ? 'true' : 'false'));
    l.push(ligne(K('priorite'), c.priorite));
    l.push(ligne(K('debut'), c.debut));
    l.push(ligne(K('echeance'), c.echeance));
    l.push(ligne(K('heure'), c.heure));
    // Dérivé, tenu à jour par Ariane : vrai tant qu'il n'y a pas d'échéance.
    l.push(K('sans-echeance') + ': ' + (c.echeance ? 'false' : 'true'));
    l.push(K('creneaux') + ': []');
    l.push(K('avancement') + ': ' + (Number(c.avancement) || 0));
    l.push(K('termine-le') + ':');
    l.push(K('jalon') + ': ' + (c.jalon ? 'true' : 'false'));
    l.push(K('parent') + ':');
    l.push(K('bloque-par') + ': []');
    l.push(ligne(K('source'), q(c.source)));
    l.push(ligne(K('livrable'), q(c.livrable)));
    l.push(ligne(K('fichier'), q(c.fichier)));
    l.push(ligne(K('liste'), q(c.liste)));
    l.push(K('rappel-id') + ':');
    l.push(K('agenda-id') + ': []');
    l.push(ligne('cree', jour));
    l.push(ligne('modifie', jour));
    l.push('---');
    l.push('');
    l.push('# ' + intitule);
    l.push('');
    l.push('## Note de travail');
    l.push('');
    l.push('## Journal');
    l.push('');
    return l.join('\n');
  }

  // Référence nue d'un lien, alias compris : « [[T26-001|partie 2]] » rend
  // « T26-001 ».
  static refDeLien(v) {
    return String(v == null ? '' : v).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
  }

  // Le chemin d'une note désigne-t-il une tâche, et sous quelle référence ?
  // Une tâche est une note .md du dossier des tâches (sous-dossiers compris) ;
  // les anciennes références « T26-001 » restent reconnues où qu'elles soient.
  // La référence EST le nom de fichier, quel qu'il soit — plus de forme imposée.
  static refDepuisChemin(chemin, dossier) {
    const p = String(chemin || '');
    if (!/\.md$/i.test(p)) return null;
    const base = p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/i, '');
    const d = String(dossier || '').replace(/^\/+|\/+$/g, '');
    if (d && p.startsWith(d + '/')) return base;
    const m = p.match(/(?:^|\/)(T\d{2}-\d{3,4})\.md$/);
    return m ? m[1] : null;
  }

  // La date d'achèvement se déduit du statut, elle ne se saisit pas. Rendre
  // null veut dire « ne rien écrire », ce qui compte : réécrire à l'identique
  // relancerait l'événement de modification et ferait tourner la boucle.
  // Une tâche abandonnée n'est pas une tâche achevée, elle ne reçoit pas de date.
  static achevementAEcrire(fm, aujourdhui) {
    if (!fm || fm.type !== 'tache') return null;
    const dejaPosee = String(fm['termine-le'] == null ? '' : fm['termine-le']).trim();
    if (fm.statut === 'terminée') return dejaPosee ? null : aujourdhui;
    return dejaPosee ? '' : null;
  }

  // « Sans échéance » est une vraie propriété (case) mais elle ne se saisit
  // pas : elle vaut vrai tant que la tâche n'a pas d'échéance. Rendre null veut
  // dire « ne rien réécrire » — sinon l'écoute de modification tournerait en
  // boucle. `actuel` est la valeur déjà dans la note (true/false/undefined).
  static sansEcheanceAEcrire(echeance, actuel) {
    const attendu = !String(echeance == null ? '' : echeance).trim();
    return actuel === attendu ? null : attendu;
  }

  // Contenu du bloc d'accès, sans ses marques. Une action n'en a pas besoin :
  // un bloc vide dans chaque note d'action ne serait que du bruit.
  static blocTache(fm, meta) {
    const c = Ariane.champTache(fm);
    if (!c.retenu) return '';
    const l = [];
    if (c.conflits.length) {
      l.push('> [!warning] ' + tr('Conflit de champs') + ' : ' + c.conflits.join(', ')
             + '. ' + tr('Seul le premier est retenu.'));
      l.push('');
    }
    if (c.retenu === 'source') {
      l.push('**' + tr('Source') + '** ' + String(fm.source).trim());
      const acces = [];
      if (meta && meta.uriPdf) acces.push('[' + tr('Ouvrir le PDF') + '](' + meta.uriPdf + ')');
      if (meta && meta.uriZotero) acces.push('[' + tr('Ouvrir dans Zotero') + '](' + meta.uriZotero + ')');
      if (acces.length) { l.push(''); l.push(acces.join('  ·  ')); }
    } else if (c.retenu === 'livrable') {
      l.push('**' + tr('Livrable') + '** ' + String(fm.livrable).trim());
    } else {
      const chemin = String(fm.fichier).trim();
      l.push('**' + tr('Fichier') + '** `' + chemin.split('/').pop() + '`');
      if (meta && (meta.modifie || meta.ouvert)) {
        const bouts = [];
        if (meta.modifie) bouts.push(tr('modifié le') + ' ' + meta.modifie);
        if (meta.ouvert) bouts.push(tr('ouvert le') + ' ' + meta.ouvert);
        l.push('');
        l.push('*' + bouts.join('  ·  ') + '*');
      }
    }
    return l.join('\n');
  }

  // Libellé d'une note du coffre dans le sélecteur. L'alias passe devant : c'est
  // sous ce nom que Monsieur connaît ses notes, « NC-202607081912 » ne disant
  // rien à personne. Le nom de fichier suit tout de même, pour rester cherchable.
  static libelleNote(fm, basename) {
    const alias = []
      .concat((fm && fm.aliases) || [])
      .map((a) => String(a).trim())
      .filter(Boolean);
    return alias.length ? alias.join(' / ') + '  ·  ' + basename : basename;
  }

  // Libellé d'une fiche Zotero dans le sélecteur. Tout y est réuni pour que la
  // recherche approchée morde sur l'auteur, l'année, le titre ou la clé : on ne
  // retient pas une clé de citation par cœur.
  static libelleSource(fm, basename) {
    const f = fm || {};
    const auteurs = []
      .concat(f.creators || [])
      .map((c) => String(c).replace(/^\[\[|\]\]$/g, '').trim())
      .filter(Boolean);
    const bouts = [];
    if (auteurs.length) bouts.push(auteurs.slice(0, 3).join(', '));
    if (f.year) bouts.push('(' + f.year + ')');
    if (f.title) bouts.push('— ' + String(f.title));
    bouts.push('· ' + basename);
    return bouts.join(' ');
  }

  //#endregion Ariane · static · tâches

  //#region Ariane · static · frise / gantt
  // ── static · frise / gantt ───────────────────────────────────────────────

  // Réfs des tâches en retard : une échéance valide, antérieure à `aujourdhui`,
  // sur une tâche ni terminée ni abandonnée. Rien n'est écrit : c'est un état
  // dérivé, relu à chaque dessin.
  static tachesEnRetard(taches, aujourdhui) {
    const out = new Set();
    const auj = Ariane.jourValide(aujourdhui);
    if (!auj) return out;
    for (const t of taches || []) {
      if (!t || !t.ref) continue;
      const e = Ariane.jourValide(t.echeance);
      if (e && e < auj && t.statut !== 'terminée' && t.statut !== 'abandonnée') out.add(t.ref);
    }
    return out;
  }

  // Une plage texte -> { debut, fin } ISO « YYYY-MM-DDTHH:MM », ou null.
  // « 2026-09-08 14:00-16:00 » (même jour) ; « 2026-09-08 22:00 / 2026-09-09 01:30 »
  // (minuit explicite). Séparateurs : - – — / « à ». Heures H:MM ou HH:MM.
  static parseCreneau(str) {
    const s = String(str == null ? '' : str).trim();
    if (!s) return null;
    const jhm = (d, h) => {
      const m = String(h).match(/^(\d{1,2}):(\d{2})$/);
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || !Ariane.jourValide(d)) return null;
      return d + 'T' + String(Number(m[1])).padStart(2, '0') + ':' + m[2];
    };
    let m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*(?:[-–—/]|à)\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})$/);
    if (m) {
      const a = jhm(m[1], m[2]);
      const b = jhm(m[3], m[4]);
      return (a && b && b > a) ? { debut: a, fin: b } : null;
    }
    m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*(?:[-–—/]|à)\s*(\d{1,2}:\d{2})$/);
    if (!m) return null;
    const a = jhm(m[1], m[2]);
    let b = jhm(m[1], m[3]);
    if (!a || !b) return null;
    if (b <= a) b = jhm(Ariane.decalerJour(m[1], 1), m[3]);
    return b > a ? { debut: a, fin: b } : null;
  }

  static formatCreneau(debut, fin) {
    const d = String(debut || '');
    const f = String(fin || '');
    const [jd, hd] = [d.slice(0, 10), d.slice(11, 16)];
    const [jf, hf] = [f.slice(0, 10), f.slice(11, 16)];
    if (!jd || !hd || !jf || !hf) return '';
    return jd === jf ? jd + ' ' + hd + '-' + hf : jd + ' ' + hd + ' / ' + jf + ' ' + hf;
  }

  // Liste de créneaux d'une valeur (tableau, chaîne, ou tâche avec `.creneaux`).
  // Trié par début, entrées invalides écartées, `brut` = chaîne d'origine.
  static creneauxDeTache(v) {
    let brut = v;
    if (v && !Array.isArray(v) && typeof v === 'object') brut = v.creneaux;
    const arr = Array.isArray(brut) ? brut : (brut ? [brut] : []);
    const out = [];
    for (const s of arr) {
      const p = Ariane.parseCreneau(s);
      if (p) out.push({ debut: p.debut, fin: p.fin, brut: String(s) });
    }
    out.sort((a, b) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0));
    const vus = new Set();
    return out.filter((c) => {
      const k = c.debut + '|' + c.fin;
      if (vus.has(k)) return false;
      vus.add(k);
      return true;
    });
  }

  // Compare deux listes de critères de tri natif Bases : { v, s(ens 1|-1) }.
  // Valeur vide toujours après, quel que soit le sens. 0 si tout égal.
  // Reprend, en le mutualisant, le corps de la branche « multi » de disposerGantt.
  static comparerMulti(ma, mb) {
    const a = ma || [];
    const b = mb || [];
    // Invariant : ma et mb ont la même longueur (une config de vue Bases produit un critère _multi par colonne triée).
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const ka = String(a[i] && a[i].v != null ? a[i].v : '');
      const kb = String(b[i] && b[i].v != null ? b[i].v : '');
      if (!ka !== !kb) return ka ? -1 : 1;
      const c = ka.localeCompare(kb, 'fr', { sensitivity: 'base', numeric: true });
      if (c) return c * ((a[i] && a[i].s === -1) ? -1 : 1);
    }
    return 0;
  }

  // Ordre d'empilement des événements dans une cellule/colonne du calendrier :
  // tout-le-jour d'abord, puis heure de début, puis tri natif de la base, puis ref.
  static comparerEmpilement(x, y) {
    const ax = x.ev.allDay ? 0 : 1;
    const ay = y.ev.allDay ? 0 : 1;
    if (ax !== ay) return ax - ay;
    if (x.ev.debut !== y.ev.debut) return x.ev.debut < y.ev.debut ? -1 : 1;
    const r = Ariane.comparerMulti(x.t._multi, y.t._multi);
    if (r) return r;
    return String(x.t.ref).localeCompare(String(y.t.ref), 'fr', { numeric: true });
  }

  // Ancre voisine pour le carrousel : ±1 mois ou ±1 semaine. sens 0 = sur place.
  static ancreCarrousel(ancre, mode, sens) {
    if (!sens) return ancre;
    return mode === 'mois'
      ? Ariane.moisSuivantN(ancre, sens)
      : Ariane.decalerJour(ancre, sens * 7);
  }

  // Jour à pré-dater pour « + Nouveau » : le jour sélectionné s'il existe,
  // sinon aujourd'hui s'il tombe dans la période affichée, sinon son 1er jour.
  static jourSeme(jourSel, periodeDebut, periodeFin, aujourd) {
    if (jourSel) return jourSel;
    if (aujourd >= periodeDebut && aujourd <= periodeFin) return aujourd;
    return periodeDebut;
  }

  // Lignes de propriété à écrire sur une carte : on saute la colonne fichier,
  // les valeurs vides et celle qui répète l'intitulé ; on coupe à maxLignes.
  static lignesProprietes(paires, intitule, maxLignes) {
    if (!Array.isArray(paires) || !(maxLignes > 0)) return [];
    const exclues = new Set(['file', 'file.name', 'file.link', 'file.path']);
    const titre = String(intitule || '').trim();
    const out = [];
    for (const p of paires) {
      if (!p || exclues.has(p.cle)) continue;
      const v = p.valeur == null ? '' : String(p.valeur).trim();
      if (!v || v === titre) continue;
      out.push({ nom: p.nom, valeur: v });
      if (out.length >= maxLignes) break;
    }
    return out;
  }

  // Coupe une liste à `plafond` éléments et dit combien restent cachés.
  // plafond <= 0 → aucun repli.
  static replierListe(items, plafond) {
    const arr = Array.isArray(items) ? items : [];
    if (plafond <= 0 || arr.length <= plafond) return { montres: arr.slice(), reste: 0 };
    return { montres: arr.slice(0, plafond), reste: arr.length - plafond };
  }

  // Instantané note ↔ Apple Agenda : seuls les créneaux deviennent des EKEvent,
  // l'instantané est donc « <créneaux canoniques joints par ';'>|<statut> ».
  // Comparé à `agenda-sync` de la note à la relève : différent → la note a bougé
  // depuis le dernier push, elle fait foi (on repoussera, on ne l'écrase pas).
  static instantAgenda(t) {
    const crs = Ariane.creneauxDeTache(t)
      .map((c) => Ariane.formatCreneau(c.debut, c.fin)).join(';');
    return crs + '|' + ((t && t.statut) || '');
  }

  // Répartit en colonnes les blocs horaires d'UN jour qui se chevauchent ; les
  // groupes disjoints repartent de la colonne 0. `blocs` : [{ deb, fin }] en
  // minutes. Rend, dans l'ordre d'entrée, [{ col, ncols }] : la colonne du bloc
  // et le nombre de colonnes du groupe auquel il appartient.
  static disposerBlocsJour(blocs) {
    const n = (blocs || []).length;
    const ordre = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => blocs[a].deb - blocs[b].deb || blocs[a].fin - blocs[b].fin || a - b);
    const res = Array.from({ length: n }, () => ({ col: 0, ncols: 1 }));
    let groupe = [];
    let finMax = -Infinity;
    const clore = () => {
      const nc = groupe.reduce((m, gg) => Math.max(m, gg.col + 1), 1);
      for (const gg of groupe) res[gg.i].ncols = nc;
      groupe = [];
      finMax = -Infinity;
    };
    for (const i of ordre) {
      if (groupe.length && blocs[i].deb >= finMax) clore();
      const prises = new Set(groupe
        .filter((gg) => blocs[gg.i].fin > blocs[i].deb).map((gg) => gg.col));
      let col = 0;
      while (prises.has(col)) col += 1;
      res[i].col = col;
      groupe.push({ i, col });
      finMax = Math.max(finMax, blocs[i].fin);
    }
    if (groupe.length) clore();
    return res;
  }

  // Statistiques d'une liste de créneaux. `maintenantISO` sert de coupe
  // passé / futur ; les durées sont en minutes. Accepte un tableau de chaînes
  // ou de { debut, fin }. Les entrées invalides sont écartées (creneauxDeTache).
  static statsCreneaux(creneaux, maintenantISO) {
    const now = String(maintenantISO || new Date().toISOString());
    const list = Ariane.creneauxDeTache(Array.isArray(creneaux) ? creneaux
      : (creneaux ? [creneaux] : []));
    let total = 0;
    let passe = 0;
    let futur = 0;
    for (const c of list) {
      const min = (Date.parse(c.fin + ':00') - Date.parse(c.debut + ':00')) / 60000;
      total += min;
      if (c.fin < now) passe += min;
      else if (c.debut >= now) futur += min;
      else { passe += (Date.parse(now) - Date.parse(c.debut + ':00')) / 60000;
             futur += (Date.parse(c.fin + ':00') - Date.parse(now)) / 60000; }
    }
    return {
      nb: list.length, totalMin: Math.round(total),
      passeMin: Math.round(passe), futurMin: Math.round(futur),
      premier: list.length ? list[0].debut : '',
      dernier: list.length ? list[list.length - 1].fin : '',
    };
  }

  static _dureeHumaine(min) {
    const h = Math.floor(min / 60);
    return h + ' h ' + String(min % 60).padStart(2, '0');
  }

  static _jourHumain(iso) {
    // « lun. 8 sept. » — sans dépendance à la locale de la machine.
    const JS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    const MS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.',
      'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const d = String(iso).slice(0, 10);
    if (!Ariane.jourValide(d)) return d;
    const [a, m, j] = d.split('-').map(Number);
    const dow = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
    return JS[dow] + ' ' + j + ' ' + MS[m - 1];
  }

  // Clé d'un commentaire de session : mois-jour + heure de DÉBUT, sans l'année
  // (« MM-JJTHH:MM »). Sans année : le commentaire suit le créneau déplacé même
  // d'une année sur l'autre, et la relecture du bloc (rendu humain, sans année)
  // retrouve la même clé.
  static cleCommentaire(cren) {
    const c = typeof cren === 'string' ? Ariane.parseCreneau(cren) : cren;
    return c && c.debut ? String(c.debut).slice(5, 16) : '';
  }

  // Une cellule de tableau markdown : barre verticale masquée, retour à la
  // ligne rendu comme <br>.
  static echapperCellule(t) {
    return String(t || '').replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|').trim();
  }
  static desechapperCellule(t) {
    return String(t || '').replace(/<br\s*\/?>/gi, '\n').replace(/\\\|/g, '|').trim();
  }

  // Relit les commentaires de session depuis le bloc balisé d'une note.
  // Rendu humain (date « mer. 2 sept. », heures « 09:45 – 12:45 ») relu vers
  // la même clé que cleCommentaire — c'est elle qui fait la jointure.
  static commentairesDuBloc(texte) {
    const s = String(texte || '');
    const d = s.indexOf(ZFA_CRENEAUX_DEBUT);
    const f = s.indexOf(ZFA_CRENEAUX_FIN);
    if (d === -1 || f <= d) return {};
    const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.',
      'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const num = new Map(MOIS.map((m, i) => [m, String(i + 1).padStart(2, '0')]));
    const out = {};
    for (const ligne of s.slice(d + ZFA_CRENEAUX_DEBUT.length, f).split('\n')) {
      // Découpe en ignorant les barres échappées (\|) d'un commentaire.
      const cel = ligne.split(/(?<!\\)\|/);
      // 5 colonnes rendues → 7 cellules éclatées (bords vides compris).
      if (cel.length < 7) continue;
      const dm = (cel[2] || '').trim()
        .match(/^\S+\s+(\d{1,2})\s+(janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.)$/);
      const hm = (cel[3] || '').trim().match(/^(\d{1,2}:\d{2})\s*[-–—]/);
      if (!dm || !hm || !num.has(dm[2])) continue;
      const txt = Ariane.desechapperCellule(cel[5]);
      if (!txt) continue;
      out[num.get(dm[2]) + '-' + String(Number(dm[1])).padStart(2, '0') + 'T' + hm[1]] = txt;
    }
    return out;
  }

  // Rend le corps markdown de la section « ## Sessions » (sans les marqueurs).
  // Chaîne vide quand aucun créneau valide. Les commentaires (clé
  // cleCommentaire) complètent la 5ᵉ colonne ; seuls ceux des sessions
  // présentes s'écrivent — une session supprimée emporte le sien.
  static blocCreneaux(creneaux, stats, commentaires) {
    const list = Ariane.creneauxDeTache(Array.isArray(creneaux) ? creneaux
      : (creneaux ? [creneaux] : []));
    if (!list.length) return '';
    const s = stats || Ariane.statsCreneaux(list, new Date().toISOString());
    const coms = commentaires || {};
    const lignes = list.map((c, i) => {
      const min = Math.round((Date.parse(c.fin + ':00') - Date.parse(c.debut + ':00')) / 60000);
      const cle = Ariane.cleCommentaire(c);
      const com = (cle && coms[cle]) ? Ariane.echapperCellule(coms[cle]) : '';
      return '| ' + (i + 1) + ' | ' + Ariane._jourHumain(c.debut) + ' | '
        + c.debut.slice(11, 16) + ' – ' + c.fin.slice(11, 16) + ' | '
        + Ariane._dureeHumaine(min) + ' | ' + com + ' |';
    });
    const resume = '**' + s.nb + ' session' + (s.nb > 1 ? 's' : '')
      + ' · ' + Ariane._dureeHumaine(s.totalMin) + ' planifiées'
      + (s.futurMin ? ' · ' + Ariane._dureeHumaine(s.futurMin) + ' à venir' : '')
      + (s.dernier ? ' · dernière : ' + Ariane._jourHumain(s.dernier) : '') + '**';
    return ['## Sessions', '',
      '| Session | Date | Heures | Durée | Commentaire |', '|---|---|---|---|---|',
      ...lignes, '', resume].join('\n');
  }

  static lundiDeSemaine(iso) {
    const j = Ariane.jourValide(iso);
    if (!j) return null;
    const dow = new Date(j + 'T00:00:00Z').getUTCDay();
    return Ariane.decalerJour(j, -((dow + 6) % 7));
  }

  static grilleMois(ancreISO) {
    const j = Ariane.jourValide(ancreISO) || new Date().toISOString().slice(0, 10);
    const moisDebut = j.slice(0, 8) + '01';
    const [a, m] = moisDebut.split('-').map(Number);
    const moisFin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    let cur = Ariane.lundiDeSemaine(moisDebut);
    const semaines = [];
    for (let s = 0; s < 6; s += 1) {
      const ligne = [];
      for (let d = 0; d < 7; d += 1) { ligne.push(cur); cur = Ariane.decalerJour(cur, 1); }
      semaines.push(ligne);
    }
    return { moisDebut, moisFin, semaines };
  }

  static grilleSemaine(ancreISO) {
    const lundi = Ariane.lundiDeSemaine(ancreISO)
      || Ariane.lundiDeSemaine(new Date().toISOString().slice(0, 10));
    const jours = [];
    for (let d = 0; d < 7; d += 1) jours.push(Ariane.decalerJour(lundi, d));
    return { lundi, jours };
  }

  static moisSuivantN(iso, n) {
    let [a, m] = String(iso).slice(0, 7).split('-').map(Number);
    m += n;
    a += Math.floor((m - 1) / 12);
    m = ((m - 1) % 12 + 12) % 12 + 1;
    return a + '-' + String(m).padStart(2, '0') + '-01';
  }

  static creneauDepuisDrop(opts) {
    const o = opts || {};
    const jour = Ariane.jourValide(o.jourISO);
    if (!jour || !(o.hauteurHeure > 0)) return null;
    const minutes = Math.max(0, (o.yRel / o.hauteurHeure) + (o.heureDebut || 0)) * 60;
    const cale = Math.round(minutes / 15) * 15;
    const duree = o.dureeMin || 60;
    const iso = (base, min) => {
      const dec = Math.floor(min / 1440);
      const r = min - dec * 1440;
      return (dec ? Ariane.decalerJour(base, dec) : base) + 'T'
        + String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0');
    };
    return { debut: iso(jour, cale), fin: iso(jour, cale + duree) };
  }

  // Hauteur (px) du bandeau « journée entière » de la vue semaine, ajustée par
  // la poignée de redimensionnement : borne 24–320, repli sur 66 si la valeur
  // stockée est absente ou aberrante.
  static clampHauteurBandeau(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 66;
    return Math.max(24, Math.min(320, Math.round(n)));
  }

  // Disposition de la frise : parcours en profondeur, dates remontées sur les
  // méta-tâches. Les dates propres sont conservées à part, le glissé d'une
  // barre devant écrire celles de la note et non celles de sa descendance.
  // Un parent inconnu ou un cycle ne fait pas disparaître la tâche : elle
  // remonte à la racine, ce qui la rend visible plutôt que perdue.
  static disposerGantt(taches, tri, sens, plat) {
    const liste = (taches || []).filter((x) => x && x.ref);
    const parRef = new Map(liste.map((x) => [x.ref, x]));
    const enfants = new Map();
    const racines = [];
    for (const x of liste) {
      const p = Ariane.refDeLien(x.parent);
      // Un cycle se casse à la remontée : dès qu'on repasse par une tâche déjà
      // vue, la parenté est tenue pour invalide et la tâche devient racine.
      let valide = !!p && parRef.has(p) && p !== x.ref;
      if (valide) {
        const vus = new Set([x.ref]);
        let cur = p;
        while (cur && parRef.has(cur)) {
          if (vus.has(cur)) { valide = false; break; }
          vus.add(cur);
          cur = Ariane.refDeLien(parRef.get(cur).parent);
        }
      }
      if (valide) {
        if (!enfants.has(p)) enfants.set(p, []);
        enfants.get(p).push(x);
      } else {
        racines.push(x);
      }
    }
    // Une tâche sans date passe après celles qui en ont : sa place est au
    // tiroir des non planifiées, pas au milieu de la frise.
    const parDate = (a, b) => {
      const da = Ariane.jourValide(a.debut) || Ariane.jourValide(a.echeance);
      const db = Ariane.jourValide(b.debut) || Ariane.jourValide(b.echeance);
      if (da && db && da !== db) return da < db ? -1 : 1;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return a.ref.localeCompare(b.ref);
    };
    const RANGS_PRIORITE = { haute: 0, moyenne: 1, basse: 2 };
    // Le tri s'applique entre frères, jamais à travers la hiérarchie : un
    // enfant reste sous son parent quoi qu'il arrive.
    const trier = (a, b) => {
      if (tri === 'priorite') {
        const pa = RANGS_PRIORITE[a.priorite];
        const pb = RANGS_PRIORITE[b.priorite];
        const ra = pa === undefined ? 3 : pa;
        const rb = pb === undefined ? 3 : pb;
        if (ra !== rb) return ra - rb;
      } else if (tri === 'cle') {
        // La vue prépare _cle : elle seule sait lire une propriété de base.
        // Une clé vide passe après celles qui sont remplies, comme partout
        // ailleurs dans la frise.
        const ka = String(a._cle == null ? '' : a._cle);
        const kb = String(b._cle == null ? '' : b._cle);
        if (!ka !== !kb) return ka ? -1 : 1;
        const c = ka.localeCompare(kb, 'fr', { sensitivity: 'base', numeric: true });
        if (c) return c * (sens === -1 ? -1 : 1);
      } else if (tri === 'intitule') {
        const c = String(a.intitule || a.ref)
          .localeCompare(String(b.intitule || b.ref), 'fr', { sensitivity: 'base' });
        if (c) return c;
      } else if (tri === 'multi') {
        // Tri natif de la base : critères { v, s } préparés par la vue.
        const r = Ariane.comparerMulti(a._multi, b._multi);
        if (r) return r;
      }
      return parDate(a, b);
    };
    // Mode « selon le tri actif » : la frise n'impose plus le regroupement d'une
    // fille sous sa mère. Chaque tâche est une ligne comme les autres, classée
    // par le seul critère de tri. `niveau` reste 0 partout.
    if (plat) {
      return liste.slice().sort(trier).map((x) => {
        const jalon = !!x.jalon;
        const propre = {
          debut: jalon ? '' : Ariane.jourValide(x.debut),
          echeance: Ariane.jourValide(x.echeance),
        };
        return {
          ref: x.ref, intitule: x.intitule || x.ref, niveau: 0,
          statut: x.statut || 'à faire', avancement: Number(x.avancement) || 0,
          famille: x.famille || '', priorite: x.priorite || '',
          parent: Ariane.refDeLien(x.parent) || '',
          jalon, aDesEnfants: (enfants.get(x.ref) || []).length > 0, propre,
          debut: propre.debut, echeance: propre.echeance,
          sansDate: !propre.debut && !propre.echeance,
        };
      });
    }
    const lignes = [];
    const descendre = (x, niveau) => {
      const fils = (enfants.get(x.ref) || []).slice().sort(trier);
      const jalon = !!x.jalon;
      const propre = {
        debut: jalon ? '' : Ariane.jourValide(x.debut),
        echeance: Ariane.jourValide(x.echeance),
      };
      const ligne = {
        ref: x.ref, intitule: x.intitule || x.ref, niveau,
        statut: x.statut || 'à faire', avancement: Number(x.avancement) || 0,
        famille: x.famille || '', priorite: x.priorite || '',
        parent: Ariane.refDeLien(x.parent) || '',
        jalon, aDesEnfants: fils.length > 0, propre,
        debut: propre.debut, echeance: propre.echeance,
      };
      lignes.push(ligne);
      const posees = fils.map((f) => descendre(f, niveau + 1));
      if (posees.length) {
        const debuts = posees.map((p) => p.debut).filter(Boolean);
        const fins = posees.map((p) => p.echeance).filter(Boolean);
        if (!jalon && debuts.length) {
          ligne.debut = [ligne.debut, ...debuts].filter(Boolean).sort()[0];
        }
        if (fins.length) {
          const toutes = [ligne.echeance, ...fins].filter(Boolean).sort();
          ligne.echeance = toutes[toutes.length - 1];
        }
      }
      // « Sans date » se juge après l'enveloppe : une mère qui hérite des dates
      // de ses filles a désormais une barre, ce n'est plus une ligne hachurée.
      ligne.sansDate = !ligne.debut && !ligne.echeance;
      return ligne;
    };
    for (const r of racines.slice().sort(trier)) descendre(r, 0);
    return lignes;
  }

  // Regroupement de la frise. `groupes` = Map<ref, string[]> (les libellés de
  // groupe d'une tâche) ou null. La disposition en arbre est faite par
  // disposerGantt sur les seules tâches de chaque groupe : un parent absent du
  // groupe redevient racine, comme pour un parent inconnu. Une tâche
  // multi-valeur est reprise dans chaque groupe, avec une cleLigne distincte
  // mais le même ref pour l'écriture.
  static disposerFriseGroupee(taches, groupes, tri, sens, groupeDesc, plat) {
    if (!groupes) {
      return Ariane.disposerGantt(taches, tri, sens, plat)
        .map((l) => Object.assign(l, { kind: 'tache', cleLigne: l.ref }));
    }
    const SEP = ' ';
    const grDe = (ref) => {
      const g = groupes.get(ref);
      return g && g.length ? g : [Ariane.SANS_GROUPE];
    };
    const tous = new Set();
    for (const t of taches || []) for (const g of grDe(t.ref)) tous.add(g);
    const ordre = [...tous]
      .filter((g) => g !== Ariane.SANS_GROUPE)
      .sort((a, b) => String(a).localeCompare(String(b), 'fr',
        { sensitivity: 'base', numeric: true }));
    if (groupeDesc) ordre.reverse();
    if (tous.has(Ariane.SANS_GROUPE)) ordre.push(Ariane.SANS_GROUPE);

    const out = [];
    for (const g of ordre) {
      const tachesG = (taches || []).filter((t) => grDe(t.ref).includes(g));
      if (!tachesG.length) continue;
      out.push({ kind: 'groupe', libelle: g, cleGroupe: 'groupe:' + g });
      for (const l of Ariane.disposerGantt(tachesG, tri, sens, plat)) {
        out.push(Object.assign(l, { kind: 'tache', cleLigne: g + SEP + l.ref }));
      }
    }
    return out;
  }

  // Passe de placement. Attribue à chaque ligne visible un `y` et un `h`, en
  // sautant la descendance des méta-tâches repliées (comme l'ancienne
  // MoteurFrise.visibles) et les tâches des groupes repliés. `replies` : Set
  // des `ref` de méta-tâches et des `cleGroupe` repliés.
  static placerLignes(dispo, hEntete, hLigne, replies) {
    const R = replies instanceof Set ? replies : new Set(replies || []);
    const out = [];
    let y = hEntete;
    let sautGroupe = false;
    let seuilMeta = -1;
    for (const it of dispo || []) {
      if (it.kind === 'groupe') {
        sautGroupe = R.has(it.cleGroupe);
        seuilMeta = -1;
        out.push(Object.assign({}, it, { y, h: hEntete }));
        y += hEntete;
        continue;
      }
      if (sautGroupe) continue;
      if (seuilMeta >= 0 && it.niveau > seuilMeta) continue;
      seuilMeta = -1;
      out.push(Object.assign({}, it, { y, h: hLigne }));
      y += hLigne;
      if (it.aDesEnfants && R.has(it.ref)) seuilMeta = it.niveau;
    }
    return { lignes: out, hauteurTotale: y };
  }

  // Le sous-arbre d'une ligne, déduit des niveaux : tout ce qui suit et qui est
  // plus profond, jusqu'à retomber au niveau de départ.
  static _sousArbre(lignes, ref) {
    const l = lignes || [];
    const i = l.findIndex((x) => x.ref === ref);
    if (i === -1) return [];
    const out = [l[i]];
    for (let k = i + 1; k < l.length && l[k].niveau > l[i].niveau; k++) out.push(l[k]);
    return out;
  }

  // Décaler une barre emporte sa descendance : quand un chantier glisse d'un
  // mois, tout ce qu'il contient glisse avec lui.
  // Une tâche sans dates n'est pas planifiée par ricochet : ce serait décider à
  // la place de Monsieur.
  static decalerSousArbre(lignes, ref, jours) {
    const n = Number(jours) || 0;
    if (!n) return [];
    const out = [];
    for (const l of Ariane._sousArbre(lignes, ref)) {
      const d = Ariane.decalerJour(l.propre.debut, n);
      const e = Ariane.decalerJour(l.propre.echeance, n);
      if (!d && !e) continue;
      out.push({ ref: l.ref, debut: d, echeance: e });
    }
    return out;
  }

  // Étend les dates PROPRES des ascendants (`parentRef` puis au-dessus) pour
  // qu'ils contiennent la plage `bas` ({debut, echeance}). S'arrête au premier
  // niveau qui la contient déjà. Chaque niveau étendu devient la nouvelle borne
  // à contenir pour le niveau supérieur. Renvoie [{ref, debut, echeance}].
  static datesAscendants(lignes, parentRef, bas) {
    const parRef = new Map();
    for (const l of lignes || []) if (l && l.ref && !parRef.has(l.ref)) parRef.set(l.ref, l);
    const out = [];
    let borne = { debut: (bas && bas.debut) || '', echeance: (bas && bas.echeance) || '' };
    const vus = new Set();
    let ref = parentRef;
    while (ref && parRef.has(ref) && !vus.has(ref)) {
      vus.add(ref);
      const mere = parRef.get(ref);
      const pd = (mere.propre && mere.propre.debut) || '';
      const pe = (mere.propre && mere.propre.echeance) || '';
      const nd = (pd && (!borne.debut || pd <= borne.debut)) ? pd : (borne.debut || pd);
      const ne = (pe && (!borne.echeance || pe >= borne.echeance)) ? pe : (borne.echeance || pe);
      if (nd === pd && ne === pe) break;
      out.push({ ref: mere.ref, debut: nd, echeance: ne });
      borne = { debut: nd, echeance: ne };
      ref = mere.parent;
    }
    return out;
  }

  // Réordonnancement de l'aval : la tâche et tout ce qu'elle bloque, de proche
  // en proche, du même nombre de jours, descendances comprises. Le parcours
  // retient les tâches déjà vues, sans quoi un cycle de blocage le ferait
  // tourner sans fin.
  static cascadeAval(lignes, bloquants, ref, jours) {
    const n = Number(jours) || 0;
    if (!n) return [];
    const suivants = new Map();
    for (const b of bloquants || []) {
      if (!b || !b.de || !b.vers) continue;
      if (!suivants.has(b.de)) suivants.set(b.de, []);
      suivants.get(b.de).push(b.vers);
    }
    const vus = new Set();
    const file = [ref];
    while (file.length) {
      const cur = file.shift();
      if (vus.has(cur)) continue;
      vus.add(cur);
      for (const s of suivants.get(cur) || []) file.push(s);
    }
    const out = [];
    const deja = new Set();
    for (const r of vus) {
      for (const l of Ariane._sousArbre(lignes, r)) {
        if (deja.has(l.ref)) continue;
        deja.add(l.ref);
        const d = Ariane.decalerJour(l.propre.debut, n);
        const e = Ariane.decalerJour(l.propre.echeance, n);
        if (!d && !e) continue;
        out.push({ ref: l.ref, debut: d, echeance: e });
      }
    }
    return out;
  }

  // Type d'une propriété de base, à la source, sans deviner d'après le nom :
  // « properties[nom].widget » porte le widget assigné (date, checkbox…),
  // « getTypeInfo » sert de repli quand rien n'est assigné. Les colonnes de
  // fichier et de formule n'ont pas de type de propriété. En 1.12
  // « getAssignedType » a disparu : on ne s'appuie plus dessus.
  static typeProprieteBase(gestionnaire, id) {
    const s = String(id == null ? '' : id);
    if (s.startsWith('file.') || s.startsWith('formula.')) return '';
    const nom = s.replace(/^note\./, '');
    try {
      const p = gestionnaire && gestionnaire.properties;
      const assigne = p && p[nom] && p[nom].widget;
      if (assigne) return String(assigne);
      const info = gestionnaire && typeof gestionnaire.getTypeInfo === 'function'
        ? gestionnaire.getTypeInfo(nom) : null;
      const t = info && info.expected && info.expected.type;
      return t ? String(t) : '';
    } catch (e) { return ''; }
  }

  /* ---- Export XLSX (généré à la main, sans dépendance) ---------------- */

  // CRC-32 (polynôme 0xEDB88320), sur un Uint8Array. Sert au conteneur ZIP.
  static crc32(octets) {
    if (!Ariane._crcTable) {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
      }
      Ariane._crcTable = t;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < octets.length; i += 1) {
      crc = (crc >>> 8) ^ Ariane._crcTable[(crc ^ octets[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // Colonne 1 -> « A », 27 -> « AA ». Pour les références de cellule XLSX.
  static _colLettre(n) {
    let s = '';
    let x = n;
    while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
    return s || 'A';
  }

  // Numéro de série Excel d'une date ISO (jours depuis le 1899-12-30).
  static dateSerieExcel(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return Math.round((d - Date.UTC(1899, 11, 30)) / 86400000);
  }

  static _echapXml(v) {
    return String(v == null ? '' : v)
      .replace(/[ --]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Conteneur ZIP « stored » (aucune compression) : suffisant pour un XLSX,
  // et sans dépendance. `entrees` = [{ nom, donnees: Uint8Array | string }].
  static zipStored(entrees) {
    const enc = new TextEncoder();
    const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
    const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
    const morceaux = [];
    const centrale = [];
    let position = 0;
    for (const e of entrees || []) {
      const nom = enc.encode(e.nom);
      const data = e.donnees instanceof Uint8Array ? e.donnees : enc.encode(String(e.donnees));
      const crc = Ariane.crc32(data);
      const enTete = Uint8Array.from([].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nom.length), u16(0)));
      morceaux.push(enTete, nom, data);
      centrale.push({ nom, crc, taille: data.length, position });
      position += enTete.length + nom.length + data.length;
    }
    const debutCentrale = position;
    const cd = [];
    for (const c of centrale) {
      const rec = Uint8Array.from([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c.crc), u32(c.taille), u32(c.taille),
        u16(c.nom.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(c.position)));
      cd.push(rec, c.nom);
      position += rec.length + c.nom.length;
    }
    const tailleCentrale = position - debutCentrale;
    const fin = Uint8Array.from([].concat(
      u32(0x06054b50), u16(0), u16(0),
      u16(centrale.length), u16(centrale.length),
      u32(tailleCentrale), u32(debutCentrale), u16(0)));
    const tout = [...morceaux, ...cd, fin];
    let total = 0;
    for (const p of tout) total += p.length;
    const sortie = new Uint8Array(total);
    let pos = 0;
    for (const p of tout) { sortie.set(p, pos); pos += p.length; }
    return sortie;
  }

  // Lundi (ISO) de la semaine contenant `iso`.
  static _lundiDe(iso) {
    const dow = new Date(iso + 'T00:00:00Z').getUTCDay(); // 0 = dimanche
    return Ariane.decalerJour(iso, -((dow + 6) % 7));
  }

  // Découpe [debutISO, finISO] en périodes selon `unite` ('jour'|'semaine'|
  // 'mois'). Si le nombre de colonnes dépasse `maxCols`, l'unité s'élargit
  // (jour -> semaine -> mois). Chaque période : { debut, fin, label }.
  static periodesGantt(debutISO, finISO, unite, maxCols) {
    const MC = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.',
      'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const max = maxCols || 400;
    const d0 = Ariane.jourValide(debutISO);
    const f0 = Ariane.jourValide(finISO);
    if (!d0 || !f0 || d0 > f0) return { unite: unite || 'mois', periodes: [] };
    const ordre = ['jour', 'semaine', 'mois'];
    let u = ordre.indexOf(unite) >= 0 ? unite : 'mois';
    for (;;) {
      const periodes = [];
      const jj = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
      if (u === 'jour') {
        let j = d0;
        while (j <= f0 && periodes.length <= max) {
          periodes.push({ debut: j, fin: j, label: jj(j) });
          j = Ariane.decalerJour(j, 1);
        }
      } else if (u === 'semaine') {
        let j = Ariane._lundiDe(d0);
        while (j <= f0 && periodes.length <= max) {
          periodes.push({ debut: j, fin: Ariane.decalerJour(j, 6), label: jj(j) });
          j = Ariane.decalerJour(j, 7);
        }
      } else {
        let y = Number(d0.slice(0, 4));
        let m = Number(d0.slice(5, 7));
        const ey = Number(f0.slice(0, 4));
        const em = Number(f0.slice(5, 7));
        while ((y < ey || (y === ey && m <= em)) && periodes.length <= max) {
          const deb = y + '-' + String(m).padStart(2, '0') + '-01';
          const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
          periodes.push({ debut: deb, fin, label: (MC[m - 1] || m) + ' ' + String(y).slice(2) });
          m += 1;
          if (m > 12) { m = 1; y += 1; }
        }
      }
      if (periodes.length <= max || u === 'mois') return { unite: u, periodes };
      u = ordre[ordre.indexOf(u) + 1];
    }
  }

  // Construit un .xlsx d'une feuille. `feuille` :
  //   { nom, titre?, colonnes:[{ titre, largeur? }], lignes:[ [cellule, …] ], figerColonnes? }
  // cellule : { v, t?:'s'|'n'|'d'|'b',
  //             s?:{ b?, color?:'RRGGBB', fill?:'RRGGBB', sz?, fmt?:'date'|'pourcent',
  //                  bord?:'grille'|'entete'|'today', align?:'center' } }
  // Titre fusionné, en-tête figée + colorée, quadrillage discret, filtre auto,
  // largeurs, dates réelles, teintes.
  static classeurXlsx(feuille) {
    const f = feuille || {};
    const cols = f.colonnes || [];
    const lignes = f.lignes || [];
    const nomFeuille = (Ariane._echapXml(f.nom || 'Frise').slice(0, 31)) || 'Frise';
    const titre = f.titre ? String(f.titre) : '';
    const decal = titre ? 1 : 0;            // décalage des lignes si titre
    const ligEntete = 1 + decal;

    const norm = (s) => ({
      b: s && s.b ? 1 : 0, color: (s && s.color) || '', fill: (s && s.fill) || '',
      sz: (s && s.sz) || 11, fmt: (s && s.fmt) || '',
      bord: (s && s.bord) || '', align: (s && s.align) || '' });
    const cleStyle = (s) => JSON.stringify(norm(s));
    const styles = new Map();
    styles.set(cleStyle({}), 0);
    const enteteStyle = { b: true, color: 'FFFFFF', fill: '44546A', bord: 'entete', align: 'center' };
    const titreStyle = { b: true, color: 'FFFFFF', fill: '44546A', sz: 14, align: 'center' };
    const noter = (s) => {
      const k = cleStyle(s);
      if (!styles.has(k)) styles.set(k, styles.size);
      return styles.get(k);
    };
    // Style effectif d'une cellule de données : quadrillage discret par défaut,
    // sauf si la cellule impose déjà une bordure.
    const effData = (c) => Object.assign({ bord: 'grille' }, (c && c.s) || {});
    noter(enteteStyle);
    if (titre) noter(titreStyle);
    for (const c of cols) if (c && c.sEntete) noter(c.sEntete);
    for (const rangee of lignes) {
      for (let i = 0; i < cols.length; i += 1) noter(effData(rangee[i]));
    }

    const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
    const fontIndex = new Map([['0||11', 0]]);
    const fillsHex = [];
    const bordSet = new Set([''].concat([...styles.keys()].map((k) => JSON.parse(k).bord)));
    const bordListe = [...bordSet];
    const bordIndex = new Map(bordListe.map((n, i) => [n, i]));
    const bordXml = (n) => {
      const thin = (c) => '<' + c + ' style="thin"><color rgb="FFD9D9D9"/></' + c + '>';
      if (n === 'grille') {
        return '<border>' + thin('left') + thin('right') + thin('top') + thin('bottom') + '<diagonal/></border>';
      }
      if (n === 'entete') {
        return '<border><left style="thin"><color rgb="FF8EA9DB"/></left>'
          + '<right style="thin"><color rgb="FF8EA9DB"/></right>'
          + '<top style="thin"><color rgb="FF8EA9DB"/></top>'
          + '<bottom style="medium"><color rgb="FF44546A"/></bottom><diagonal/></border>';
      }
      if (n === 'today') {
        return '<border><left style="medium"><color rgb="FFC55A11"/></left>'
          + thin('right') + thin('top') + thin('bottom') + '<diagonal/></border>';
      }
      return '<border><left/><right/><top/><bottom/><diagonal/></border>';
    };
    const numDate = 164;
    const numPct = 165;
    let besoinDate = false;
    let besoinPct = false;
    const xfs = [];
    for (const [k] of styles) {
      const s = JSON.parse(k);
      const fk = s.b + '|' + s.color + '|' + s.sz;
      if (!fontIndex.has(fk)) {
        fontIndex.set(fk, fonts.length);
        fonts.push('<font>' + (s.b ? '<b/>' : '')
          + '<sz val="' + s.sz + '"/>'
          + (s.color ? '<color rgb="FF' + s.color + '"/>' : '')
          + '<name val="Calibri"/></font>');
      }
      let fillId = 0;
      if (s.fill) {
        let idx = fillsHex.indexOf(s.fill);
        if (idx < 0) { fillsHex.push(s.fill); idx = fillsHex.length - 1; }
        fillId = 2 + idx;
      }
      if (s.fmt === 'date') besoinDate = true;
      if (s.fmt === 'pourcent') besoinPct = true;
      const numFmtId = s.fmt === 'date' ? numDate : (s.fmt === 'pourcent' ? numPct : 0);
      const borderId = bordIndex.get(s.bord) || 0;
      const align = s.align === 'center'
        ? '<alignment horizontal="center" vertical="center"/>' : '';
      xfs.push('<xf numFmtId="' + numFmtId + '" fontId="' + fontIndex.get(fk)
        + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0"'
        + (numFmtId ? ' applyNumberFormat="1"' : '')
        + (s.b || s.color || s.sz !== 11 ? ' applyFont="1"' : '')
        + (fillId ? ' applyFill="1"' : '')
        + (borderId ? ' applyBorder="1"' : '')
        + (align ? ' applyAlignment="1"' : '') + '>'
        + align + '</xf>');
    }
    const fills = ['<fill><patternFill patternType="none"/></fill>',
      '<fill><patternFill patternType="gray125"/></fill>']
      .concat(fillsHex.map((h) => '<fill><patternFill patternType="solid"><fgColor rgb="FF'
        + h + '"/><bgColor indexed="64"/></patternFill></fill>'));
    const numFmts = [];
    if (besoinDate) numFmts.push('<numFmt numFmtId="' + numDate + '" formatCode="yyyy\\-mm\\-dd"/>');
    if (besoinPct) numFmts.push('<numFmt numFmtId="' + numPct + '" formatCode="0&quot;%&quot;"/>');

    const styleXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + (numFmts.length ? '<numFmts count="' + numFmts.length + '">' + numFmts.join('') + '</numFmts>' : '')
      + '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>'
      + '<fills count="' + fills.length + '">' + fills.join('') + '</fills>'
      + '<borders count="' + bordListe.length + '">' + bordListe.map(bordXml).join('') + '</borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '<dxfs count="0"/>'
      + '</styleSheet>';

    const cellule = (colNum, ligNum, c, sForce) => {
      const ref = Ariane._colLettre(colNum) + ligNum;
      const s = sForce || (c && c.s) || null;
      const si = s ? styles.get(cleStyle(s)) : 0;
      const attrS = si ? ' s="' + si + '"' : '';
      if (!c || c.v == null || c.v === '') return '<c r="' + ref + '"' + attrS + '/>';
      if (c.t === 'n') return '<c r="' + ref + '"' + attrS + '><v>' + Number(c.v) + '</v></c>';
      if (c.t === 'b') return '<c r="' + ref + '"' + attrS + ' t="b"><v>' + (c.v ? 1 : 0) + '</v></c>';
      if (c.t === 'd') {
        const serie = Ariane.dateSerieExcel(c.v);
        return serie == null
          ? '<c r="' + ref + '"' + attrS + ' t="inlineStr"><is><t>' + Ariane._echapXml(c.v) + '</t></is></c>'
          : '<c r="' + ref + '"' + attrS + '><v>' + serie + '</v></c>';
      }
      return '<c r="' + ref + '"' + attrS + ' t="inlineStr"><is><t xml:space="preserve">'
        + Ariane._echapXml(c.v) + '</t></is></c>';
    };
    const rangs = [];
    if (titre) {
      rangs.push('<row r="1" ht="26" customHeight="1">'
        + cols.map((c, i) => cellule(i + 1, 1, i === 0 ? { v: titre, t: 's' } : { v: '' }, titreStyle)).join('')
        + '</row>');
    }
    rangs.push('<row r="' + ligEntete + '" ht="20" customHeight="1">' + cols.map((c, i) =>
      cellule(i + 1, ligEntete, { v: c.titre, t: 's' }, (c && c.sEntete) || enteteStyle)).join('') + '</row>');
    lignes.forEach((rangee, r) => {
      const y = ligEntete + 1 + r;
      rangs.push('<row r="' + y + '">'
        + cols.map((_, i) => cellule(i + 1, y, rangee[i], effData(rangee[i]))).join('') + '</row>');
    });
    const colsXml = cols.length
      ? '<cols>' + cols.map((c, i) => '<col min="' + (i + 1) + '" max="' + (i + 1)
        + '" width="' + (Math.max(4, Math.min(80, c.largeur || 16))) + '" customWidth="1"/>').join('') + '</cols>'
      : '';
    const derniere = Ariane._colLettre(Math.max(1, cols.length));
    const dernRef = derniere + (ligEntete + lignes.length);
    const xSplit = Math.max(0, Math.min(f.figerColonnes || 0, cols.length));
    const hautGele = ligEntete;             // en-tête (et titre) figés
    const coinBR = Ariane._colLettre(xSplit + 1) + (hautGele + 1);
    const pane = xSplit
      ? '<pane xSplit="' + xSplit + '" ySplit="' + hautGele + '" topLeftCell="' + coinBR
        + '" activePane="bottomRight" state="frozen"/><selection pane="bottomRight"/>'
      : '<pane ySplit="' + hautGele + '" topLeftCell="A' + (hautGele + 1)
        + '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>';
    const merge = titre
      ? '<mergeCells count="1"><mergeCell ref="A1:' + derniere + '1"/></mergeCells>' : '';
    const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView showGridLines="0" workbookViewId="0">' + pane + '</sheetView></sheetViews>'
      + '<sheetFormatPr defaultRowHeight="17"/>'
      + colsXml
      + '<sheetData>' + rangs.join('') + '</sheetData>'
      + '<autoFilter ref="A' + ligEntete + ':' + dernRef + '"/>'
      + merge
      + '</worksheet>';

    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>';
    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
      + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheets><sheet name="' + nomFeuille + '" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>';

    return Ariane.zipStored([
      { nom: '[Content_Types].xml', donnees: contentTypes },
      { nom: '_rels/.rels', donnees: rels },
      { nom: 'xl/workbook.xml', donnees: workbook },
      { nom: 'xl/_rels/workbook.xml.rels', donnees: workbookRels },
      { nom: 'xl/styles.xml', donnees: styleXml },
      { nom: 'xl/worksheets/sheet1.xml', donnees: sheetXml },
    ]);
  }

  //#endregion Ariane · static · frise / gantt

  //#region Ariane · static · articulation
  // ── static · articulation ────────────────────────────────────────────────

  // Refs des boîtes qu'un rectangle de sélection TOUCHE (chevauchement, pas
  // seulement inclusion). `boites` : [{ ref, x, y, w, h }] ; `rect` : { x, y, w, h }.
  static rectSelection(boites, rect) {
    const r = rect || {};
    const rx = r.x || 0;
    const ry = r.y || 0;
    const rw = r.w || 0;
    const rh = r.h || 0;
    const out = [];
    for (const b of boites || []) {
      if (!b) continue;
      if (b.x < rx + rw && b.x + b.w > rx && b.y < ry + rh && b.y + b.h > ry) out.push(b.ref);
    }
    return out;
  }

  // Plan de travail de l'articulation : outils purs.

  // Les arêtes dont les DEUX extrémités sont dans l'ensemble de refs.
  static aretesEntre(aretes, refs) {
    const s = refs instanceof Set ? refs : new Set(refs || []);
    return (aretes || []).filter((a) => a && s.has(a.de) && s.has(a.vers));
  }

  // Relatifs d'une tâche qui NE SONT PAS sur le plan :
  //  - sousTaches : enfants de `ref` (arête hier `de === ref`) hors plan
  //  - bloquantes : tâches qui bloquent `ref` (arête bloque `vers === ref`) hors plan
  static relativesHorsPlan(ref, aretes, refsPlan) {
    const s = refsPlan instanceof Set ? refsPlan : new Set(refsPlan || []);
    const sousTaches = [];
    const bloquantes = [];
    for (const a of aretes || []) {
      if (!a) continue;
      if (a.type === 'hier' && a.de === ref && !s.has(a.vers)) sousTaches.push(a.vers);
      if (a.type === 'bloque' && a.vers === ref && !s.has(a.de)) bloquantes.push(a.de);
    }
    return { sousTaches, bloquantes };
  }

  // Positions en grille pour poser N cartes, en sautant les cellules qui
  // chevaucheraient une boîte déjà occupée. `occupe` : [{ x, y, w, h }].
  static grillePlacement(n, opts) {
    const o = opts || {};
    const ox = (o.origine && o.origine.x) || 0;
    const oy = (o.origine && o.origine.y) || 0;
    const px = (o.pas && o.pas.x) || 240;
    const py = (o.pas && o.pas.y) || 150;
    const w = o.carte && o.carte.w ? o.carte.w : 210;
    const h = o.carte && o.carte.h ? o.carte.h : 58;
    const occupe = o.occupe || [];
    const chevauche = (x, y) => occupe.some((b) =>
      x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
    const out = [];
    let col = 0;
    let ligne = 0;
    const parLigne = Math.max(1, o.parLigne || 4);
    let garde = 0;
    while (out.length < n && garde < 10000) {
      garde++;
      const x = ox + col * px;
      const y = oy + ligne * py;
      if (!chevauche(x, y) && !out.some((p) => p.x === x && p.y === y)) out.push({ x, y });
      col++;
      if (col >= parLigne) { col = 0; ligne++; }
    }
    return out;
  }

  // Détection des cycles par parcours en profondeur. Le tableau « chemin »
  // garde la branche courante : y retomber, c'est boucler.
  // Un cycle n'est retenu qu'une fois, quel que soit le sommet par lequel on y
  // entre, d'où la signature construite sur ses membres triés.
  static cyclesDe(aretes) {
    const sortants = new Map();
    for (const e of aretes || []) {
      if (!e || !e.de || !e.vers) continue;
      if (!sortants.has(e.de)) sortants.set(e.de, []);
      sortants.get(e.de).push(e.vers);
    }
    const trouves = new Map();
    const clos = new Set();
    const chemin = [];
    const dansChemin = new Set();
    const descendre = (n) => {
      if (dansChemin.has(n)) {
        const cycle = chemin.slice(chemin.indexOf(n)).concat([n]);
        const signature = [...new Set(cycle)].sort().join('\u0000');
        if (!trouves.has(signature)) trouves.set(signature, cycle);
        return;
      }
      if (clos.has(n)) return;
      chemin.push(n);
      dansChemin.add(n);
      for (const suivant of sortants.get(n) || []) descendre(suivant);
      dansChemin.delete(n);
      chemin.pop();
      clos.add(n);
    };
    for (const depart of sortants.keys()) descendre(depart);
    return [...trouves.values()];
  }

  // Si A bloque B, B ne peut pas commencer avant que A ne s'achève. Commencer
  // le jour même de l'échéance reste admis : une tâche peut prendre la suite
  // d'une autre dans la journée.
  // Une date manquante ne permet de rien conclure, et ne signale donc rien :
  // mieux vaut taire un doute que crier une fausse erreur sur chaque tâche non
  // encore planifiée.
  static datesIncoherentes(aretes, datesParRef) {
    const d = datesParRef || {};
    const jour = (v) => {
      const x = String(v == null ? '' : v).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : '';
    };
    const out = [];
    for (const e of aretes || []) {
      if (!e) continue;
      const fin = jour(d[e.de] && d[e.de].echeance);
      const debut = jour(d[e.vers] && d[e.vers].debut);
      if (!fin || !debut) continue;
      if (debut < fin) out.push({ de: e.de, vers: e.vers, fin, debut });
    }
    return out;
  }

  // Le graphe des tâches : nœuds + arêtes typées, déduits du frontmatter.
  // Arête hiérarchie : de = parent, vers = enfant. Arête blocage : de =
  // bloquant, vers = bloqué. Un bout absent du jeu, ou un lien vers soi, est
  // ignoré. Chaque paire (de, vers, type) n'apparaît qu'une fois.
  static grapheArticulation(taches) {
    const liste = (taches || []).filter((x) => x && x.ref);
    const dedans = new Set(liste.map((x) => x.ref));
    const noeuds = liste.map((x) => ({
      ref: x.ref, intitule: x.intitule || x.ref, statut: x.statut || 'à faire',
      avancement: Number(x.avancement) || 0, jalon: !!x.jalon,
      famille: x.famille || 'action', echeance: Ariane.jourValide(x.echeance),
      x: x.x, y: x.y,
    }));
    const aretes = [];
    const vues = new Set();
    const pousser = (de, vers, type, libelle) => {
      if (!de || !vers || de === vers || !dedans.has(de) || !dedans.has(vers)) return;
      const cle = de + ' ' + vers + ' ' + type;
      if (vues.has(cle)) return;
      vues.add(cle);
      aretes.push({ de, vers, type, libelle: libelle || '' });
    };
    for (const x of liste) {
      const p = Ariane.refDeLien(x.parent);
      if (p) pousser(p, x.ref, 'hier', '');
      for (const b of x.bloquePar || []) {
        const m = String(b).match(/\|([^\]]*)\]\]$/);
        pousser(Ariane.refDeLien(b), x.ref, 'bloque', m ? m[1].trim() : '');
      }
    }
    return { noeuds, aretes };
  }

  // Statut « bloquée » et « impactée » DÉRIVÉS (jamais écrits dans le frontmatter),
  // renvoyés en deux ensembles disjoints { bloquee, impactee }.
  //  - bloquée (opérationnel) : blocage direct (au moins un bloqueur non clos,
  //    terminé/abandonné) PLUS gel descendant (tout le sous-arbre d'une tâche
  //    à blocage direct) ;
  //  - impactée (attentionnel) : toute tâche ayant une descendante bloquée,
  //    sans être bloquée elle-même — simple remontée d'information vers les
  //    mères, elle ne gèle rien et une sœur d'une tâche bloquée n'est pas gelée.
  // `noeuds` : [{ref, statut}] ; `aretes` : [{de, vers, type}] avec type 'hier'
  // (de = parent) ou 'bloque' (de = bloqueur).
  static propagerBlocage(noeuds, aretes) {
    const parRef = new Map();
    for (const n of noeuds || []) if (n && n.ref && !parRef.has(n.ref)) parRef.set(n.ref, n);
    const parentDe = new Map();
    const enfants = new Map();
    const bloqueursDe = new Map();
    for (const a of aretes || []) {
      if (!a || !a.de || !a.vers || !parRef.has(a.de) || !parRef.has(a.vers)) continue;
      if (a.type === 'hier') {
        parentDe.set(a.vers, a.de);
        if (!enfants.has(a.de)) enfants.set(a.de, []);
        enfants.get(a.de).push(a.vers);
      } else if (a.type === 'bloque') {
        if (!bloqueursDe.has(a.vers)) bloqueursDe.set(a.vers, []);
        bloqueursDe.get(a.vers).push(a.de);
      }
    }
    const clos = (ref) => {
      const s = String((parRef.get(ref) || {}).statut || '');
      return s === 'terminée' || s === 'abandonnée';
    };
    const direct = new Set();
    for (const [ref, bs] of bloqueursDe) {
      if (bs.some((b) => !clos(b))) direct.add(ref);
    }
    const bloquee = new Set(direct);
    const descendre = (ref) => {
      for (const c of enfants.get(ref) || []) {
        if (!bloquee.has(c)) { bloquee.add(c); descendre(c); }
      }
    };
    for (const ref of direct) descendre(ref);
    const impactee = new Set();
    for (const ref of bloquee) {
      let cur = parentDe.get(ref);
      const vus = new Set([ref]);
      while (cur && parRef.has(cur) && !vus.has(cur)) {
        vus.add(cur);
        impactee.add(cur);
        cur = parentDe.get(cur);
      }
    }
    for (const ref of bloquee) impactee.delete(ref);
    return { bloquee, impactee };
  }

  // Avancement EFFECTIF de chaque tâche (dérivé, jamais écrit) :
  //  - feuille : son propre % (terminée = 100, abandonnée = 0) ;
  //  - mère : moyenne des filles pondérée par leur durée en jours. Une fille
  //    abandonnée sort de la moyenne ; si aucune fille n'est datée, moyenne
  //    simple ; si toutes sont abandonnées, on retombe sur le % propre.
  // `taches` : [{ref, parent, statut, avancement, debut, echeance}].
  static avancementsDerives(taches) {
    const parRef = new Map();
    for (const t of taches || []) if (t && t.ref && !parRef.has(t.ref)) parRef.set(t.ref, t);
    const enfants = new Map();
    for (const t of parRef.values()) {
      const p = Ariane.refDeLien(t.parent);
      if (p && parRef.has(p) && p !== t.ref) {
        if (!enfants.has(p)) enfants.set(p, []);
        enfants.get(p).push(t.ref);
      }
    }
    const propre = (t) => {
      const s = String(t.statut || '');
      if (s === 'terminée') return 100;
      if (s === 'abandonnée') return 0;
      return Math.max(0, Math.min(100, Number(t.avancement) || 0));
    };
    const duree = (t) => {
      const d = Ariane.jourValide(t.debut);
      const e = Ariane.jourValide(t.echeance);
      return (d && e) ? Math.max(1, Ariane.ecartJours(d, e) + 1) : 0;
    };
    const cache = new Map();
    const calc = (ref, pile) => {
      if (cache.has(ref)) return cache.get(ref);
      const t = parRef.get(ref);
      if (!t) return 0;
      const kids = enfants.get(ref);
      let v;
      if (!kids || !kids.length || pile.has(ref)) {
        v = propre(t);
      } else {
        const p2 = new Set(pile);
        p2.add(ref);
        let sPoids = 0;
        let sVal = 0;
        let sSimple = 0;
        let n = 0;
        for (const c of kids) {
          const ct = parRef.get(c);
          if (ct && String(ct.statut || '') === 'abandonnée') continue;
          const cv = calc(c, p2);
          const w = ct ? duree(ct) : 0;
          sPoids += w;
          sVal += w * cv;
          sSimple += cv;
          n += 1;
        }
        if (!n) v = propre(t);
        else if (sPoids > 0) v = sVal / sPoids;
        else v = sSimple / n;
      }
      v = Math.round(v);
      cache.set(ref, v);
      return v;
    };
    const out = new Map();
    for (const ref of parRef.keys()) out.set(ref, calc(ref, new Set()));
    return out;
  }

  /* ---- Apple Rappels via EventKit (JXA, macOS) --------------------- */

  // Préambule EventKit commun aux entités Rappels (1) et Événements (0) :
  // utilitaires qui ne dépendent pas de l'entité. EventKit voit TOUT (y compris
  // les listes rangées dans un groupe, invisibles à l'AppleScript de Rappels).
  static _jxaEKCommun() {
    return [
      'ObjC.import("EventKit"); ObjC.import("CoreFoundation");',
      'var ST = $.EKEventStore.alloc.init;',
      'function pompe(ms){ var t=Date.now(); while(Date.now()-t<ms){ $.CFRunLoopRunInMode($.kCFRunLoopDefaultMode,0.03,false); } }',
      'function norm(x){ return String(x==null?"":x).trim().toLowerCase().replace(/\\s+/g," "); }',
      'function net(x){ return String(x==null?"":x).replace(/[\\t\\r\\n]+/g," "); }',
      'function titre(c){ try{ return ObjC.unwrap(c.title()); }catch(e){ try{ return ObjC.unwrap(c.title); }catch(e2){ return ""; } } }',
      'function comps(iso,heure){ var p=String(iso).split("-"); var c=$.NSDateComponents.alloc.init; c.year=parseInt(p[0],10); c.month=parseInt(p[1],10); c.day=parseInt(p[2],10); if(heure){ var q=String(heure).split(":"); c.hour=parseInt(q[0],10)||0; c.minute=parseInt(q[1],10)||0; } return c; }',
      'function isoDe(dc){ if(!dc) return ""; var y,mo,da; try{ y=dc.year; mo=dc.month; da=dc.day; }catch(e){ return ""; } if(!(y>0)) return ""; var z=function(n){return (n<10?"0":"")+n;}; var s=y+"-"+z(mo)+"-"+z(da); var h,mi; try{ h=dc.hour; mi=dc.minute; }catch(e){ h=-1; } if(h>=0 && h<24) s+="T"+z(h)+":"+z(mi>=0?mi:0); return s; }',
    ].join('\n');
  }

  // Préambule Rappels (entité 1). Concatène le commun + les helpers propres à
  // l'entité. Sortie fonctionnellement identique à l'ancien _jxaEK monolithique.
  static _jxaEK() {
    return [
      Ariane._jxaEKCommun(),
      'function acces(){ var d=false; try{ ST.requestFullAccessToRemindersWithCompletion(function(g,e){d=true;}); }catch(e){ try{ ST.requestAccessToEntityTypeCompletion(1,function(g,e){d=true;}); }catch(e2){} } var t=Date.now(); while(!d && Date.now()-t<20000){ $.CFRunLoopRunInMode($.kCFRunLoopDefaultMode,0.05,false); } }',
      'function listes(){ try{ return ST.calendarsForEntityType(1); }catch(e){ return $([]); } }',
      'function listeParNom(nom){ if(!nom) { try{ return ST.defaultCalendarForNewReminders; }catch(e){ return null; } } var L=listes(); for(var i=0;i<L.count;i++){ var c=L.objectAtIndex(i); if(titre(c)===nom) return c; } for(var j=0;j<L.count;j++){ var c2=L.objectAtIndex(j); if(norm(titre(c2))===norm(nom)) return c2; } return null; }',
      'function remById(id){ if(!id) return null; try{ var it=ST.calendarItemWithIdentifier(id); if(it && it.isKindOfClass($.EKReminder)) return it; }catch(e){} return null; }',
      'function fetchListe(cal){ var pred=ST.predicateForRemindersInCalendars($([cal])); var res=null,d=false; ST.fetchRemindersMatchingPredicateCompletion(pred,function(a){res=a;d=true;}); var t=Date.now(); while(!d && Date.now()-t<15000){ $.CFRunLoopRunInMode($.kCFRunLoopDefaultMode,0.05,false); } return res; }',
    ].join('\n');
  }

  // Préambule Événements (entité 0). Jumeau de _jxaEK, helpers propres à EKEvent.
  static _jxaEKEvenements() {
    return [
      Ariane._jxaEKCommun(),
      // Statut TCC Calendriers (SYNCHRONE) : 0 indéterminé, 1 restreint,
      // 2 refusé, 3 autorisé (accès complet), 4 écriture seule.
      // Number() est INDISPENSABLE : authorizationStatusForEntityType renvoie un
      // NSInteger ponté qui n\'est pas === à un littéral JS (=> le garde « !== 3 »
      // se déclenchait toujours et tout renvoyait « __ACCES__ »).
      'function statutAcces(){ try{ return Number($.EKEventStore.authorizationStatusForEntityType(0)); }catch(e){ return -1; } }',
      // N\'ouvre la demande d\'accès QUE si indéterminé ; sinon renvoie le statut
      // tout de suite (pas d\'attente de 20 s inutile quand c\'est déjà refusé).
      'function acces(){ var st=statutAcces(); if(st!==0) return st; var d=false; try{ ST.requestFullAccessToEventsWithCompletion(function(g,e){d=true;}); }catch(e){ try{ ST.requestAccessToEntityTypeCompletion(0,function(g,e){d=true;}); }catch(e2){} } var t=Date.now(); while(!d && Date.now()-t<15000){ $.CFRunLoopRunInMode($.kCFRunLoopDefaultMode,0.05,false); } return statutAcces(); }',
      'function cals(){ try{ return ST.calendarsForEntityType(0); }catch(e){ return $([]); } }',
      'function calParNom(nom){ if(!nom) { try{ return ST.defaultCalendarForNewEvents; }catch(e){ return null; } } var L=cals(); for(var i=0;i<L.count;i++){ var c=L.objectAtIndex(i); if(titre(c)===nom) return c; } for(var j=0;j<L.count;j++){ var c2=L.objectAtIndex(j); if(norm(titre(c2))===norm(nom)) return c2; } return null; }',
      'function evById(id){ if(!id) return null; try{ var e=ST.eventWithIdentifier(id); if(e) return e; }catch(e1){} try{ var it=ST.calendarItemWithIdentifier(id); if(it && it.isKindOfClass($.EKEvent)) return it; }catch(e2){} return null; }',
      'function evId(e){ var s=""; try{ s=ObjC.unwrap(e.eventIdentifier); }catch(x1){} if(!s) try{ s=ObjC.unwrap(e.calendarItemIdentifier); }catch(x2){} return s||""; }',
      'function fmtDate(dc){ try{ return $.NSCalendar.currentCalendar.dateFromComponents(dc); }catch(e){ return null; } }',
      'function isoDeDate(d){ if(!d) return ""; try{ var f=$.NSDateFormatter.alloc.init; f.dateFormat=$("yyyy-MM-dd\'T\'HH:mm"); f.timeZone=$.NSTimeZone.localTimeZone; return ObjC.unwrap(f.stringFromDate(d)); }catch(e){ return ""; } }',
      // NB : pas d\'extraction de couleur ici — passer `EKCalendar.color`
      // (CGColorRef) à NSColor/CIColor fait planter osascript (SIGBUS). Les
      // couleurs sont relevées à part, en AppleScript (genererASCouleursAgendas).
    ].join('\n');
  }

  // AppleScript (pas JXA) : « nom \t r,g,b » (composantes 16 bits) par ligne,
  // pour tous les calendriers. Sert à colorer les événements de fond.
  static genererASCouleursAgendas() {
    return [
      'tell application "Calendar"',
      'set AppleScript\'s text item delimiters to ","',
      'set sortie to ""',
      'repeat with c in calendars',
      'try',
      'set sortie to sortie & (name of c) & (ASCII character 9) & ((color of c) as text) & (ASCII character 10)',
      'end try',
      'end repeat',
      'end tell',
      'return sortie',
    ].join('\n');
  }

  // Sortie de genererASCouleursAgendas → { "Nom du calendrier": "#rrggbb" }.
  // Les composantes AppleScript sont sur 16 bits (0–65535).
  static parseCouleursAgendas(txt) {
    const out = {};
    for (const ligne of String(txt || '').split('\n')) {
      const i = ligne.indexOf('\t');
      if (i < 1) continue;
      const nom = ligne.slice(0, i).trim();
      const m = ligne.slice(i + 1).trim().match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!nom || !m) continue;
      const h = (v) => {
        const n = Math.max(0, Math.min(255, Math.round((Number(v) || 0) * 255 / 65535)));
        return (n < 16 ? '0' : '') + n.toString(16);
      };
      out[nom] = '#' + h(m[1]) + h(m[2]) + h(m[3]);
    }
    return out;
  }

  // Crée / met à jour un rappel par tâche. Rend « ref \t id » (id vide si échec).
  // `taches` : [{ ref, id, titre, notes, liste, echeance, heure, priorite,
  //               termine, dedup }].
  // Dédoublonnage (dedup, calculé côté JS quand la référence se lit dans le
  // titre) : un rappel-id perdu faisait créer une copie à chaque push, sans
  // jamais reprendre l'ancienne — d'où les doublons à l'identique dans Rappels.
  // On scanne la liste cible : le premier homonyme est REPRIS (son id rendu,
  // donc re-mémorisé dans la note), les suivants supprimés ; quand le rappel
  // lié est vivant, les homonymes restants sont de simples restes → supprimés.
  static genererJXARappels(taches) {
    const IN = JSON.stringify({ taches: Array.isArray(taches) ? taches : [] });
    return [
      Ariane._jxaEK(),
      'function run(){',
      '  var IN=' + IN + '; acces();',
      '  var PRIO={haute:1,moyenne:5,basse:9};',
      '  var cacheL={};',
      '  function listeDe(cal){ try{ var k=ObjC.unwrap(cal.calendarIdentifier); if(!cacheL[k]) cacheL[k]=fetchListe(cal); return cacheL[k]; }catch(e){ return null; } }',
      '  var out=[];',
      '  for(var i=0;i<IN.taches.length;i++){',
      '    var t=IN.taches[i];',
      '    var r=remById(t.id);',
      '    var cal=listeParNom(t.liste);',
      '    if(r && cal){ try{ if(ObjC.unwrap(r.calendar.calendarIdentifier)!==ObjC.unwrap(cal.calendarIdentifier)){ ST.removeReminderCommitError(r,true,null); r=null; } }catch(e){} }',
      '    if(t.dedup && cal){',
      '      var L2=listeDe(cal);',
      '      if(L2){',
      '        var mon=""; try{ if(r) mon=ObjC.unwrap(r.calendarItemIdentifier); }catch(e){}',
      '        var prem=null;',
      '        for(var k=0;k<L2.count;k++){',
      '          var rk=L2.objectAtIndex(k);',
      '          if(net(titre(rk))!==t.titre) continue;',
      '          var idr=""; try{ idr=ObjC.unwrap(rk.calendarItemIdentifier); }catch(e){}',
      '          if(mon && idr===mon) continue;',
      '          if(!prem && !mon){ prem=rk; continue; }',
      '          try{ ST.removeReminderCommitError(rk,true,null); }catch(e){}',
      '        }',
      '        if(!r && prem) r=prem;',
      '      }',
      '    }',
      '    if(!r){ r=$.EKReminder.reminderWithEventStore(ST); if(cal) r.calendar=cal; }',
      '    try{ r.title=t.titre; }catch(e){}',
      '    try{ r.notes=t.notes||""; }catch(e){}',
      '    try{ r.completed=!!t.termine; }catch(e){}',
      '    try{ r.priority=PRIO[t.priorite]||0; }catch(e){}',
      '    try{ if(t.echeance){ r.dueDateComponents=comps(t.echeance,t.heure); } else { r.dueDateComponents=false; } }catch(e){}',
      '    var ok=false; try{ ok=ST.saveReminderCommitError(r,true,null); }catch(e){}',
      '    var nid=""; try{ nid=ObjC.unwrap(r.calendarItemIdentifier); }catch(e){}',
      '    out.push(t.ref+"\\t"+(ok?nid:""));',
      '  }',
      '  return out.join("\\n");',
      '}',
    ].join('\n');
  }

  // Titres de toutes les listes (groupes inclus), une par ligne.
  static genererJXAListes() {
    return [
      Ariane._jxaEK(),
      'function run(){ acces(); var L=listes(); var out=[]; for(var i=0;i<L.count;i++){ var n=net(titre(L.objectAtIndex(i))); if(n) out.push(n); } out.sort(); return out.join("\\n"); }',
    ].join('\n');
  }

  // Relève : (1) « ref \t completed \t dueISO » pour les rappels liés ;
  // (2) « NOUVEAU \t id \t nom \t completed \t dueISO \t nomListe » pour ceux
  //     ajoutés à la main dans une liste surveillée, sans référence connue.
  static genererJXAReleve(paires, listes) {
    const IN = JSON.stringify({
      paires: Array.isArray(paires) ? paires : [],
      listes: [...new Set((Array.isArray(listes) ? listes : []).filter(Boolean))],
    });
    return [
      Ariane._jxaEK(),
      'function run(){',
      '  var IN=' + IN + '; acces();',
      '  var connus={}; for(var i=0;i<IN.paires.length;i++) connus[IN.paires[i].id]=1;',
      '  var out=[];',
      '  for(var j=0;j<IN.paires.length;j++){',
      '    var p=IN.paires[j]; var r=remById(p.id);',
      '    if(!r){ out.push(p.ref+"\\tMANQUANT\\t"); continue; }',
      '    var comp=false; try{ comp=r.completed; }catch(e){}',
      '    out.push(p.ref+"\\t"+(comp?"1":"0")+"\\t"+isoDe(r.dueDateComponents));',
      '  }',
      '  var L=listes();',
      '  for(var k=0;k<L.count;k++){',
      '    var cal=L.objectAtIndex(k); var ln=titre(cal); var surv=false;',
      '    for(var w=0;w<IN.listes.length;w++){ if(norm(IN.listes[w])===norm(ln)){ surv=true; break; } }',
      '    if(!surv) continue;',
      '    var rs=fetchListe(cal); if(!rs) continue;',
      '    for(var m=0;m<rs.count;m++){',
      '      var rr=rs.objectAtIndex(m); var rid=""; try{ rid=ObjC.unwrap(rr.calendarItemIdentifier); }catch(e){ continue; }',
      '      if(connus[rid]) continue;',
      '      var comp2=false; try{ comp2=rr.completed; }catch(e){}',
      '      out.push("NOUVEAU\\t"+rid+"\\t"+net(ObjC.unwrap(rr.title))+"\\t"+(comp2?"1":"0")+"\\t"+isoDe(rr.dueDateComponents)+"\\t"+net(ln));',
      '    }',
      '  }',
      '  return out.join("\\n");',
      '}',
    ].join('\n');
  }

  /* ---- Apple Agenda via EventKit (EKEvent, entité 0, macOS) -------- */

  // Crée / met à jour / supprime les EKEvent d'une liste de créneaux.
  // `evenements` : [{ ref, idx, id, titre, notes, calendrier, debut, fin, supprimer }]
  // debut / fin = ISO « YYYY-MM-DDTHH:MM ». Rend, une ligne par entrée :
  //   « ref \t idx \t nouvelId »  (id vide si échec)
  //   « ref \t idx \t SUPPRIME »  (entrée supprimer:true)
  static genererJXAEvenementsPush(evenements) {
    const IN = JSON.stringify({ evenements: Array.isArray(evenements) ? evenements : [] });
    return [
      Ariane._jxaEKEvenements(),
      'function run(){',
      '  var IN=' + IN + '; var ACC=Number(acces());',
      '  if(ACC!==3 && ACC!==4) return "__ACCES__\\t"+ACC;',
      // `pris` : identifiants déjà attribués à un créneau de CE run. Deux
      // créneaux d’une même tâche partagent la même URL de note — sans ce
      // garde, le rattrapage anti-doublon rattachait les deux sessions au
      // même EKEvent, qui se faisait alors battre d’un push à l’autre.
      '  var out=[]; var pris={};',
      '  for(var i=0;i<IN.evenements.length;i++){',
      '    var v=IN.evenements[i];',
      '    if(v.supprimer){',
      '      if(v.id && pris[String(v.id)]){ out.push(v.ref+"\\t"+v.idx+"\\t"+String(v.id)); continue; }',
      '      var er=evById(v.id);',
      '      if(er){ try{ ST.removeEventSpanCommitError(er,0,true,null); }catch(e){} }',
      '      out.push(v.ref+"\\t"+v.idx+"\\tSUPPRIME"); continue;',
      '    }',
      '    var e=evById(v.id);',
      '    if(e && v.id){ var ex0=evId(e); if(ex0 && pris[ex0]) e=null; }',
      '    var cal=calParNom(v.calendrier);',
      '    if(!cal){ out.push(v.ref+"\\t"+v.idx+"\\tERREUR\\tcalendrier introuvable: "+net(v.calendrier)); continue; }',
      // Identifiant non résolu (churn iCloud) : avant de créer un doublon, on
      // cherche dans le calendrier cible un événement du même titre sur la
      // fenêtre du créneau ($([cal]) — un null plante le prédicat en JXA).
      '    if(!e){ try{',
      '      var dd0=fmtDate(comps(String(v.scanDebut||v.debut).slice(0,10),"00:00"));',
      '      var dd1=fmtDate(comps(String(v.scanFin||v.fin).slice(0,10),"23:59"));',
      '      var pr=ST.predicateForEventsWithStartDateEndDateCalendars(dd0,dd1,$([cal]));',
      '      var ex=ST.eventsMatchingPredicate(pr);',
      '      var vu="";',
      '      if(ex){ for(var q=0;q<ex.count;q++){ var ee=ex.objectAtIndex(q);',
      '        var exq=evId(ee); if(exq && pris[exq]) continue;',
      '        if(String(ObjC.unwrap(ee.title))===String(v.titre)){ e=ee; break; }',
      '        try{ vu=String(ObjC.unwrap(ee.URL.absoluteString)||""); }catch(eu){ vu=""; }',
      '        if(v.lien && vu && vu===String(v.lien)){ e=ee; break; } } }',
      '    }catch(eDup){} }',
      '    if(e){ try{ if(ObjC.unwrap(e.calendar.calendarIdentifier)!==ObjC.unwrap(cal.calendarIdentifier)) e.calendar=cal; }catch(er2){} }',
      '    else { e=$.EKEvent.eventWithEventStore(ST); e.calendar=cal; }',
      '    var exi=evId(e); if(exi) pris[exi]=1;',
      '    try{ e.title=v.titre; }catch(er3){}',
      '    try{ e.notes=v.notes||""; }catch(er4){}',
      '    try{ if(v.lien){ var u=$.NSURL.URLWithString(v.lien); if(u) e.URL=u; } }catch(erU){}',
      '    try{ e.isAllDay=false; }catch(er5){}',
      '    var sd=fmtDate(comps(String(v.debut).slice(0,10),String(v.debut).slice(11,16)));',
      '    var ed=fmtDate(comps(String(v.fin).slice(0,10),String(v.fin).slice(11,16)));',
      '    if(!sd || !ed){ out.push(v.ref+"\\t"+v.idx+"\\tERREUR\\tdate invalide "+net(v.debut)+"/"+net(v.fin)); continue; }',
      '    try{ e.startDate=sd; e.endDate=ed; }catch(er6){}',
      // NB : lire un out-param NSError** en JXA fait planter osascript (exit 139).
      // On passe null et on se contente du booléen de retour.
      '    var ok=false;',
      '    try{ ok=ST.saveEventSpanCommitError(e,0,true,null); }catch(er8){}',
      // Un événement dont l’identifiant a été partagé entre deux créneaux peut
      // refuser de se sauver, même une fois la cause réparée : on le reconstruit
      // à neuf ; l’ancien est retiré si possible.
      '    if(!ok && v.id){',
      '      var e2=$.EKEvent.eventWithEventStore(ST); e2.calendar=cal;',
      '      try{ e2.title=v.titre; }catch(er9){}',
      '      try{ e2.notes=v.notes||""; }catch(erA){}',
      '      try{ if(v.lien){ var u2=$.NSURL.URLWithString(v.lien); if(u2) e2.URL=u2; } }catch(erB){}',
      '      try{ e2.isAllDay=false; }catch(erC){}',
      '      try{ e2.startDate=sd; e2.endDate=ed; }catch(erD){}',
      '      try{ ok=ST.saveEventSpanCommitError(e2,0,true,null); }catch(erE){}',
      '      if(ok){ try{ ST.removeEventSpanCommitError(e,0,true,null); }catch(erF){} e=e2; }',
      '    }',
      '    if(!ok){ out.push(v.ref+"\\t"+v.idx+"\\tERREUR\\tsaveEvent a renvoyé false"); continue; }',
      '    var exf=evId(e); if(exf) pris[exf]=1;',
      '    out.push(v.ref+"\\t"+v.idx+"\\t"+exf);',
      '  }',
      '  return out.join("\\n");',
      '}',
    ].join('\n');
  }

  // Relève des EKEvent liés (pas d'import d'événements inconnus).
  // `paires` : [{ ref, idx, id }]. Rend :
  //   « ref \t idx \t isoDebut \t isoFin »   (événement retrouvé)
  //   « ref \t idx \t MANQUANT »             (supprimé côté Calendar)
  static genererJXAEvenementsReleve(paires, fenetreJours) {
    const IN = JSON.stringify({
      paires: Array.isArray(paires) ? paires : [],
      fenetreJours: Number(fenetreJours) || 120,
    });
    return [
      Ariane._jxaEKEvenements(),
      'function run(){',
      '  var IN=' + IN + '; var ACC=Number(acces());',
      '  if(ACC!==3) return "__ACCES__\\t"+ACC;',
      '  var out=[];',
      '  for(var i=0;i<IN.paires.length;i++){',
      '    var p=IN.paires[i]; var e=evById(p.id);',
      '    if(!e){ out.push(p.ref+"\\t"+p.idx+"\\tMANQUANT"); continue; }',
      '    out.push(p.ref+"\\t"+p.idx+"\\t"+isoDeDate(e.startDate)+"\\t"+isoDeDate(e.endDate));',
      '  }',
      '  return out.join("\\n");',
      '}',
    ].join('\n');
  }

  // Diagnostic : statut d'accès Calendriers + liste des calendriers vus.
  static genererJXAAgendas() {
    return [
      Ariane._jxaEKEvenements(),
      'function run(){',
      '  var st0=statutAcces(); var st1=acces();',
      '  var L=cals(); var noms=[];',
      '  if(L && L.count){ for(var i=0;i<L.count;i++) noms.push(net(titre(L.objectAtIndex(i)))); }',
      '  noms.sort();',
      '  var def=""; try{ def=net(titre(ST.defaultCalendarForNewEvents)); }catch(e){}',
      '  return JSON.stringify({ statutAvant:st0, statut:st1, defaut:def, calendriers:noms });',
      '}',
    ].join('\n');
  }

  // Ménage : dans les calendriers de synchro, supprime les EKEvent « à Ariane »
  // (URL obsidian:// ou titre « [ref connue] … ») dont l'identifiant n'est PAS
  // dans la liste des liens légitimes → efface les doublons laissés par une
  // course entre deux push. `idsLegitimes` : { eventId: 1 }. `refs` : liste des
  // références de tâche connues.
  static genererJXAEvenementsMenage(calendriers, idsLegitimes, refs, fenetreJours) {
    const IN = JSON.stringify({
      calendriers: [...new Set((Array.isArray(calendriers) ? calendriers : []).filter(Boolean))],
      ids: idsLegitimes && typeof idsLegitimes === 'object' ? idsLegitimes : {},
      refs: [...new Set((Array.isArray(refs) ? refs : []).map(String))],
      fenetreJours: Math.max(7, Number(fenetreJours) || 180),
    });
    return [
      Ariane._jxaEKEvenements(),
      'function run(){',
      '  var IN=' + IN + '; var ACC=Number(acces());',
      '  if(ACC!==3 && ACC!==4) return "__ACCES__\\t"+ACC;',
      '  if(!IN.calendriers.length) return "";',
      '  var want={}; for(var w=0;w<IN.calendriers.length;w++) want[norm(IN.calendriers[w])]=1;',
      '  var refset={}; for(var r=0;r<IN.refs.length;r++) refset[IN.refs[r]]=1;',
      '  var L=cals(); var arr=[];',
      '  for(var i=0;i<L.count;i++){ var c=L.objectAtIndex(i); if(want[norm(titre(c))]) arr.push(c); }',
      '  if(!arr.length) return "";',
      '  var maintenant=$.NSDate.date;',
      '  var d0=maintenant.dateByAddingTimeInterval(-IN.fenetreJours*86400);',
      '  var d1=maintenant.dateByAddingTimeInterval(IN.fenetreJours*86400);',
      '  var pred=ST.predicateForEventsWithStartDateEndDateCalendars(d0,d1,$(arr));',
      '  var evs=ST.eventsMatchingPredicate(pred); var out=[]; var vus=[];',
      '  if(evs){ for(var k=0;k<evs.count;k++){',
      '    var e=evs.objectAtIndex(k); var id=evId(e); if(!id || IN.ids[id]) continue;',
      '    var url=""; try{ url=String(ObjC.unwrap(e.URL.absoluteString)||""); }catch(eu){}',
      '    var ti=""; try{ ti=String(ObjC.unwrap(e.title)||""); }catch(et){}',
      '    var aNous=(url.indexOf("obsidian://")===0);',
      '    if(!aNous){ var m=ti.match(/\\[([^\\]]+)\\]/); if(m && refset[String(m[1]).trim()]) aNous=true; }',
      '    if(!aNous) continue;',
      '    try{ ST.removeEventSpanCommitError(e,0,true,null); out.push("SUPPRIME\\t"+id+"\\t"+net(ti)); }catch(er){ out.push("ERREUR\\t"+id+"\\t"+net(ti)); }',
      '  } }',
      '  return out.join("\\n");',
      '}',
    ].join('\n');
  }

  // Événements réels des calendriers surveillés, pour l'affichage en fond.
  // Rend, une ligne par événement :
  //   « id \t titre \t isoDebut \t isoFin \t allDay(0/1) \t nomCalendrier »
  //   (la couleur du calendrier est relevée à part, en AppleScript)
  static genererJXAEvenementsFond(calendriers, debutISO, finISO) {
    const IN = JSON.stringify({
      calendriers: [...new Set((Array.isArray(calendriers) ? calendriers : []).filter(Boolean))],
      debut: String(debutISO || ''), fin: String(finISO || ''),
    });
    return [
      Ariane._jxaEKEvenements(),
      'function run(){',
      '  var IN=' + IN + '; var ACC=Number(acces());',
      '  if(ACC!==3) return "__ACCES__\\t"+ACC;',
      '  if(!IN.debut || !IN.fin || !IN.calendriers.length) return "";',
      '  var want={}; for(var w=0;w<IN.calendriers.length;w++) want[norm(IN.calendriers[w])]=1;',
      '  var d0=fmtDate(comps(IN.debut,"00:00")); var d1=fmtDate(comps(IN.fin,"23:59"));',
      '  if(!d0 || !d1) return "";',
      // Tableau d\'EKCalendar filtré par nom, ponté via $() (un tableau JS brut
      // ou un null plantent le prédicat en JXA — testé).
      '  var L=cals(); var arr=[];',
      '  for(var i=0;i<L.count;i++){ var c=L.objectAtIndex(i); if(want[norm(titre(c))]) arr.push(c); }',
      '  if(!arr.length) return "";',
      '  var pred=ST.predicateForEventsWithStartDateEndDateCalendars(d0,d1,$(arr));',
      '  var evs=ST.eventsMatchingPredicate(pred); var out=[];',
      '  if(evs){ for(var k=0;k<evs.count;k++){',
      '    var e=evs.objectAtIndex(k);',
      '    var cn=""; try{ cn=norm(titre(e.calendar)); }catch(ecn){} if(!want[cn]) continue;',
      '    var id=evId(e); if(!id) continue;',
      '    var ad=false; try{ ad=e.isAllDay; }catch(er2){}',
      '    out.push(id+"\\t"+net(ObjC.unwrap(e.title))+"\\t"+isoDeDate(e.startDate)+"\\t"+isoDeDate(e.endDate)+"\\t"+(ad?"1":"0")+"\\t"+net(titre(e.calendar)));',
      '  } }',
      '  return out.join("\\n");',
      '}',
    ].join('\n');
  }

  /* ---- IA : structuration de brouillons de tâches -------------------- */

  // Toutes les dates repérées telles quelles dans un texte, ramenées en ISO.
  // Sert à n'autoriser à l'import QUE les dates réellement présentes.
  static datesDansTexte(txt) {
    const s = String(txt || '');
    const out = new Set();
    let m;
    const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = iso.exec(s))) out.add(m[1] + '-' + m[2] + '-' + m[3]);
    const num = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g;
    while ((m = num.exec(s))) {
      out.add(m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0'));
    }
    return out;
  }

  // Extrait un objet/tableau JSON d'une réponse LLM (tolère un habillage
  // ```json … ``` et du bavardage autour). Rend null si rien d'exploitable.
  static extraireJson(txt) {
    const s = String(txt || '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try { return JSON.parse(s); } catch (e) { /* on tente un sous-bloc */ }
    const a = s.search(/[[{]/);
    if (a < 0) return null;
    const ferme = s[a] === '[' ? ']' : '}';
    const b = s.lastIndexOf(ferme);
    if (b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  }

  // Nettoie l'arbre de specs rendu par l'IA : familles bornées aux ids connus,
  // booléens coercés, priorité normalisée, PROFONDEUR plafonnée, et surtout
  // AUCUNE date qui ne soit déjà dans le texte source (opts.dates : Set ISO).
  // opts = { familles: Set|Array, defaut, dates: Set, profMax }.
  static normaliserSpecsTaches(brut, opts) {
    const o = opts || {};
    const familles = o.familles instanceof Set ? o.familles
      : new Set(Array.isArray(o.familles) ? o.familles : []);
    const defaut = familles.has(o.defaut) ? o.defaut
      : (familles.values().next().value || 'action');
    const dates = o.dates instanceof Set ? o.dates : new Set();
    const profMax = Number.isFinite(o.profMax) ? o.profMax : 8;
    const PRIOS = {
      haute: 'haute', high: 'haute', urgent: 'haute', urgente: 'haute',
      moyenne: 'moyenne', medium: 'moyenne', normale: 'moyenne', normal: 'moyenne',
      basse: 'basse', low: 'basse', bonus: 'basse', optionnel: 'basse',
      optionnelle: 'basse', 'si le temps': 'basse',
    };
    const racine = Array.isArray(brut) ? brut
      : (brut && Array.isArray(brut.taches) ? brut.taches
        : (brut && Array.isArray(brut.tasks) ? brut.tasks : []));
    const dateOk = (v) => {
      const s = String(v == null ? '' : v).trim().slice(0, 10);
      return (/^\d{4}-\d{2}-\d{2}$/.test(s) && dates.has(s)) ? s : '';
    };
    const vrai = (v) => v === true || /^(true|oui|yes|1)$/i.test(String(v == null ? '' : v));
    const un = (n, prof) => {
      if (!n || typeof n !== 'object') return null;
      const titre = String(n.titre || n.title || n.intitule || n.nom || n.name || '').trim();
      if (!titre) return null;
      const fam = String(n.famille || n.family || '').trim().toLowerCase();
      const prio = PRIOS[String(n.priorite || n.priority || '').trim().toLowerCase()] || '';
      const brutEnf = n.enfants || n.children || n.sous || n.sousTaches || n.subtasks || [];
      const enfants = (prof < profMax && Array.isArray(brutEnf))
        ? brutEnf.map((e) => un(e, prof + 1)).filter(Boolean) : [];
      return {
        titre,
        famille: familles.has(fam) ? fam : defaut,
        jalon: vrai(n.jalon != null ? n.jalon : n.milestone),
        priorite: prio,
        debut: dateOk(n.debut != null ? n.debut : n.start),
        echeance: dateOk(n.echeance != null ? n.echeance : (n.due != null ? n.due : n.deadline)),
        note: String(n.note || n.remarque || n.commentaire || n.comment || '').trim(),
        source: String(n.source || n.source_pressentie || n.sourcePressentie || '').trim(),
        enfants,
      };
    };
    return racine.map((n) => un(n, 0)).filter(Boolean);
  }

  // Aplatit un arbre de specs en liste [{ n, prof }] (parcours préfixe) :
  // l'ordre des éléments suit l'ordre visuel des lignes de l'aperçu.
  static aplatirSpecsTaches(arbre) {
    const out = [];
    const voir = (liste, prof) => {
      for (const n of liste || []) { out.push({ n, prof }); voir(n.enfants, prof + 1); }
    };
    voir(arbre, 0);
    return out;
  }

  // Opération inverse : reconstruit l'arbre depuis une liste plate. Chaque
  // profondeur sautée est ramenée sous le parent ouvert le plus proche.
  static reconstruireSpecsTaches(plat) {
    const racine = [];
    const pile = [];
    for (const x of plat) {
      while (pile.length && pile[pile.length - 1].prof >= x.prof) pile.pop();
      x.n.enfants = [];
      (pile.length ? pile[pile.length - 1].n.enfants : racine).push(x.n);
      pile.push(x);
    }
    return racine;
  }

  // Dépôt du bloc plat[i] (nœud et sa descendance) au trou g — « avant
  // plat[g] », g ∈ [0..plat.length]. Rend { h, profMax } : position d'insertion
  // dans la liste amputée du bloc, et profondeur maximale possible là (enfant
  // de la ligne précédente). Rend null si g tombe dans la propre descendance
  // du bloc (déplacement impossible).
  static depotSpecTaches(plat, i, g) {
    const n = plat.length;
    if (!n || i < 0 || i >= n || g < 0 || g > n) return null;
    let fin = i + 1;
    while (fin < n && plat[fin].prof > plat[i].prof) fin += 1;
    if (g > i && g <= fin) return null;
    const h = g <= i ? g : g - (fin - i);
    // Prédécesseur du trou, en coordonnées de la liste d'origine : jamais
    // dans le bloc lui-même (h-1 < i, ou h-1 décalé au-delà de fin-1).
    const j = (h <= i) ? h - 1 : (h - 1) + (fin - i);
    const profMax = (j >= 0 && j < n) ? plat[j].prof + 1 : 0;
    return { h, profMax };
  }

  // Déplace le bloc plat[i] (nœud et toute sa descendance) au trou g, à la
  // profondeur demandée (bornée au maximum possible là, et à 8 comme le
  // normaliseur). Les descendants suivent d'autant. Rend la nouvelle liste
  // plate, ou null si le dépôt est impossible.
  static deplacerSpecTaches(plat, i, g, prof) {
    const depot = Ariane.depotSpecTaches(plat, i, g);
    if (!depot) return null;
    const n = plat.length;
    let fin = i + 1;
    while (fin < n && plat[fin].prof > plat[i].prof) fin += 1;
    const delta = Math.max(0, Math.min(prof, depot.profMax, 8)) - plat[i].prof;
    const bloc = [];
    for (let k = i; k < fin; k += 1) {
      bloc.push({ n: plat[k].n, prof: Math.max(0, Math.min(8, plat[k].prof + delta)) });
    }
    const hors = plat.filter((_, k) => k < i || k >= fin);
    hors.splice(depot.h, 0, ...bloc);
    return hors;
  }

  // Meilleure correspondance d'un titre approximatif parmi des candidats
  // {ref, titre} : recouvrement de mots (minuscule, sans accents ni ponctuation),
  // pondéré par la longueur du plus court. Rend { ref, score } ou null si trop
  // faible (< seuil, défaut 0,34).
  static meilleurTitre(cible, candidats, seuil) {
    const mots = (s) => new Set(String(s || '')
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
    const mc = mots(cible);
    if (!mc.size) return null;
    let best = null;
    for (const c of candidats || []) {
      const m = mots(c && c.titre);
      if (!m.size) continue;
      let inter = 0;
      for (const w of mc) if (m.has(w)) inter += 1;
      const score = inter / Math.min(mc.size, m.size);
      if (!best || score > best.score) best = { ref: c.ref, score };
    }
    return (best && best.score >= (seuil == null ? 0.34 : seuil)) ? best : null;
  }

  // Ajoute des cartes au plan d'une vue « ariane-articulation » dans le TEXTE
  // brut d'un .base, sans re-sérialiser le reste. `nomVue` cible la vue par son
  // name ; à défaut, la première vue articulation. Rend le texte modifié, ou
  // null si aucune vue articulation ou rien à ajouter.
  static majPlanArticulationTexte(texte, nomVue, refs) {
    const aAjouter = [...new Set((refs || []).filter(Boolean))];
    if (!aAjouter.length) return null;
    const eol = texte.includes('\r\n') ? '\r\n' : '\n';
    const lignes = texte.split(/\r?\n/);
    const iViews = lignes.findIndex((l) => /^views:\s*$/.test(l));
    if (iViews === -1) return null;
    // Découpe le bloc views: en entrées (chaque « - type: … » à 2 espaces).
    let debut = -1;
    let fin = lignes.length;
    let dansArticulation = false;
    let nomCourant = '';
    let iPlan = -1;
    let iEntree = -1;
    for (let k = iViews + 1; k < lignes.length; k += 1) {
      const l = lignes[k];
      if (/^\S/.test(l) && l.trim() !== '') { fin = k; break; }
      const mType = l.match(/^ {2}-\s*type:\s*(.+?)\s*$/);
      if (mType) {
        if (dansArticulation && (nomVue == null || nomCourant === nomVue)) { debut = iEntree; break; }
        dansArticulation = /ariane-articulation/.test(mType[1]);
        nomCourant = '';
        iPlan = -1;
        iEntree = k;
        continue;
      }
      const mNom = l.match(/^ {4}name:\s*(.+?)\s*$/);
      if (mNom) nomCourant = mNom[1].replace(/^["']|["']$/g, '');
      if (/^ {4}arianeArtPlan:/.test(l)) iPlan = k;
    }
    if (debut === -1 && dansArticulation && (nomVue == null || nomCourant === nomVue)) {
      debut = iEntree;
    }
    if (debut === -1) return null;
    // Fin de l'entrée ciblée : prochaine « - type: » à 2 espaces, ou fin du bloc.
    let finEntree = fin;
    for (let k = debut + 1; k < fin; k += 1) {
      if (/^ {2}-\s*type:/.test(lignes[k])) { finEntree = k; break; }
    }
    let planLigne = -1;
    for (let k = debut; k < finEntree; k += 1) {
      if (/^ {4}arianeArtPlan:/.test(lignes[k])) { planLigne = k; break; }
    }
    let plan = { cartes: [] };
    if (planLigne !== -1) {
      const m = lignes[planLigne].match(/^ {4}arianeArtPlan:\s*'(.*)'\s*$/)
        || lignes[planLigne].match(/^ {4}arianeArtPlan:\s*"(.*)"\s*$/);
      if (m) { try { plan = JSON.parse(m[1]) || plan; } catch (e) { plan = { cartes: [] }; } }
    }
    if (!Array.isArray(plan.cartes)) plan.cartes = [];
    const deja = new Set(plan.cartes.map((c) => c && c.ref));
    let n = 0;
    for (const r of aAjouter) {
      if (deja.has(r)) continue;
      plan.cartes.push({ ref: r, x: null, y: null, replie: false });
      n += 1;
    }
    if (!n) return null;
    const nouvelle = "    arianeArtPlan: '" + JSON.stringify(plan) + "'";
    if (planLigne !== -1) lignes.splice(planLigne, 1, nouvelle);
    else lignes.splice(debut + 1, 0, nouvelle);
    return lignes.join(eol);
  }

  // Place les nœuds SANS position (x/y non finis). Ceux qui en ont sont laissés
  // tels quels. Rang = profondeur dans le DAG (hiérarchie ∪ blocage) par un
  // parcours de Kahn ; les nœuds d'un cycle retombent au rang 0. Dans un rang,
  // tri par échéance puis ref, et on décale en y pour ne rien chevaucher.
  static placerGraphe(noeuds, aretes, opts) {
    const dx = (opts && opts.dx) || 260;
    const dy = (opts && opts.dy) || 120;
    const refs = new Set((noeuds || []).map((n) => n.ref));
    const out = new Map();
    const inc = new Map();
    for (const n of noeuds || []) { out.set(n.ref, []); inc.set(n.ref, 0); }
    for (const a of aretes || []) {
      if (!a || !refs.has(a.de) || !refs.has(a.vers) || a.de === a.vers) continue;
      out.get(a.de).push(a.vers);
      inc.set(a.vers, inc.get(a.vers) + 1);
    }
    const rang = new Map();
    const reste = new Map(inc);
    const file = (noeuds || []).filter((n) => reste.get(n.ref) === 0).map((n) => n.ref);
    for (const r of file) rang.set(r, 0);
    for (let i = 0; i < file.length; i += 1) {
      const cur = file[i];
      const rc = rang.get(cur);
      for (const v of out.get(cur) || []) {
        reste.set(v, reste.get(v) - 1);
        if (reste.get(v) === 0) {
          rang.set(v, Math.max(rang.has(v) ? rang.get(v) : 0, rc + 1));
          file.push(v);
        }
      }
    }
    for (const n of noeuds || []) if (!rang.has(n.ref)) rang.set(n.ref, 0);

    const pos = new Map();
    const fini = (v) => Number.isFinite(Number(v)) && v !== '' && v !== null;
    for (const n of noeuds || []) {
      if (fini(n.x) && fini(n.y)) pos.set(n.ref, { x: Number(n.x), y: Number(n.y) });
    }
    const chevauche = (x, y) => {
      for (const p of pos.values()) {
        if (Math.abs(p.x - x) < dx * 0.8 && Math.abs(p.y - y) < dy * 0.8) return true;
      }
      return false;
    };
    const parRang = new Map();
    for (const n of noeuds || []) {
      if (pos.has(n.ref)) continue;
      const r = rang.get(n.ref);
      if (!parRang.has(r)) parRang.set(r, []);
      parRang.get(r).push(n);
    }
    // opts.ordre : liste de refs dans l'ordre d'affichage voulu. Quand elle est
    // fournie et non vide, chaque rang suit cet ordre (les refs absentes vont
    // après, dans leur ordre d'origine). Sinon, tri par échéance puis ref.
    const ordreImpose = (opts && Array.isArray(opts.ordre) && opts.ordre.length) ? opts.ordre : null;
    const rangImpose = ordreImpose ? new Map(ordreImpose.map((r, i) => [r, i])) : null;
    // opts.hauteur : (ref) => hauteur réelle du nœud. Fourni, l'empilement
    // vertical d'un rang cumule ces hauteurs (+ une marge) au lieu d'un dy fixe.
    // Absent, comportement d'origine (chaque carte à k * dy).
    const hauteurDe = (opts && typeof opts.hauteur === 'function') ? opts.hauteur : null;
    // Marge entre deux cartes empilées : ce qui, en hauteur fixe, séparait déjà
    // deux rangs (dy − hauteur de carte). ARTIC_H est défini plus bas mais lu au
    // seul appel, jamais au chargement du module.
    const margeRang = dy > ARTIC_H ? dy - ARTIC_H : Math.max(24, dy * 0.25);
    for (const [r, groupe] of [...parRang.entries()].sort((a, b) => a[0] - b[0])) {
      if (rangImpose) {
        groupe.sort((a, b) => (rangImpose.has(a.ref) ? rangImpose.get(a.ref) : 1e9)
          - (rangImpose.has(b.ref) ? rangImpose.get(b.ref) : 1e9));
      } else {
        groupe.sort((a, b) => (Ariane.jourValide(a.echeance) || '~')
          .localeCompare(Ariane.jourValide(b.echeance) || '~') || a.ref.localeCompare(b.ref));
      }
      const x = r * dx;
      if (hauteurDe) {
        let y = 0;
        for (const n of groupe) {
          while (chevauche(x, y)) y += dy;
          pos.set(n.ref, { x, y });
          y += (Number(hauteurDe(n.ref)) || dy) + margeRang;
        }
      } else {
        let k = 0;
        for (const n of groupe) {
          let y = k * dy;
          while (chevauche(x, y)) y += dy;
          pos.set(n.ref, { x, y });
          k += 1;
        }
      }
    }
    return pos;
  }

  // Un lien proposé est-il licite ? Refus si (a) il referme un cycle sur
  // l'union des arêtes, (b) les dates se contredisent : un blocage dont
  // l'amont s'achève après le début de l'aval ; une hiérarchie dont la mère
  // s'achève avant la fille. On ne bloque que sur une preuve : une date
  // manquante n'interdit rien.
  static lienValide(aretes, dates, ajout) {
    const { de, vers, type } = ajout || {};
    if (!de || !vers || de === vers) return { ok: false, raison: 'soi' };
    const adj = new Map();
    const arc = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
    for (const e of aretes || []) if (e) arc(e.de, e.vers);
    // Cycle ssi « vers » atteint déjà « de » par les arêtes existantes.
    const vus = new Set();
    const pile = [vers];
    while (pile.length) {
      const c = pile.pop();
      if (c === de) return { ok: false, raison: 'cycle' };
      if (vus.has(c)) continue;
      vus.add(c);
      for (const x of adj.get(c) || []) pile.push(x);
    }
    const lire = (k) => (dates && dates.get ? dates.get(k) : (dates || {})[k]) || {};
    const eDe = Ariane.jourValide(lire(de).echeance);
    const dVers = Ariane.jourValide(lire(vers).debut);
    const eVers = Ariane.jourValide(lire(vers).echeance);
    if (type === 'hier') {
      if (eDe && eVers && eDe < eVers) return { ok: false, raison: 'dates-hier' };
    } else if (eDe && dVers && eDe > dVers) {
      return { ok: false, raison: 'dates' };
    }
    return { ok: true };
  }

  // Un lien bloquant est DÉRIVÉ quand un ancêtre du bloqueur proposé bloque
  // déjà la même tâche : une mère bloquante bloque avec toutes ses filles, et
  // la flèche explicite ne ferait que répéter l'héritage. Renvoie la référence
  // de l'ancêtre bloqueur le plus proche, ou '' si le lien porte une
  // information propre. `aretes` : arêtes de rattachement ({de, vers, type}),
  // type 'hier' (de = parent) ou 'bloque' (de = bloqueur).
  static blocageDerive(aretes, de, vers) {
    if (!de || !vers) return '';
    const parentDe = new Map();
    const bloqueurs = new Set();
    for (const e of aretes || []) {
      if (!e || !e.de || !e.vers) continue;
      if (e.type === 'hier') parentDe.set(e.vers, e.de);
      else if (e.type === 'bloque' && e.vers === vers) bloqueurs.add(e.de);
    }
    let cur = parentDe.get(de);
    const vus = new Set([de]);
    while (cur && !vus.has(cur)) {
      if (bloqueurs.has(cur)) return cur;
      vus.add(cur);
      cur = parentDe.get(cur);
    }
    return '';
  }

  // Courbe de Bézier entre deux points : elle se suit mieux à l'œil que le coude
  // quand plusieurs liens se croisent. Partagée par la frise et l'articulation.
  static _cheminFleche(x1, y1, x2, y2) {
    const ecart = Math.max(34, Math.abs(x2 - x1) / 2);
    return 'M ' + x1 + ' ' + y1
      + ' C ' + (x1 + ecart) + ' ' + y1 + ', ' + (x2 - ecart) + ' ' + y2
      + ', ' + x2 + ' ' + y2;
  }

  /* ---- Routage des flèches (batch 2, idée n° 8) ------------------------- */
  // Une flèche ne doit jamais passer sur une carte : dans le SVG, les cartes
  // sont peintes après les flèches, toute portion qui les chevauche disparaît
  // derrière. Et le bord droit d'une carte est réservé aux sorties : on n'y
  // entre jamais. Fonctions pures, éprouvées hors Obsidian ; voir
  // docs/superpowers/specs/2026-09-01-routage-fleches-design.md.

  // Un segment touche-t-il l'une des cartes, gonflées de `marge` ? Les
  // segments obliques sont échantillonnés (les tracés de l'articulation sont
  // sinon verticaux ou horizontaux). Les points posés sur le pourtour ne
  // comptent pas : c'est là que vivent les ancrages.
  static segmentFrappe(x1, y1, x2, y2, cartes, marge) {
    const M = Number(marge) || 0;
    const oblique = x1 !== x2 && y1 !== y2;
    const N = 12;
    for (const c of cartes || []) {
      if (!c) continue;
      const g = c.x - M, h = c.y - M;
      const d = c.x + (c.w || 0) + M, b = c.y + (c.h || 0) + M;
      if (oblique) {
        for (let i = 0; i <= N; i++) {
          const px = x1 + (x2 - x1) * i / N, py = y1 + (y2 - y1) * i / N;
          if (px > g && px < d && py > h && py < b) return true;
        }
      } else if (x1 === x2) {
        if (x1 > g && x1 < d
          && Math.max(Math.min(y1, y2), h) < Math.min(Math.max(y1, y2), b)) return true;
      } else if (y1 > h && y1 < b
        && Math.max(Math.min(x1, x2), g) < Math.min(Math.max(x1, x2), d)) return true;
    }
    return false;
  }

  // Le tracé simple « courbe » passe-t-il sur une carte ? On échantillonne la
  // même Bézier que le rendu (contrôles posés à mx, comme _cheminFleche).
  static flecheEncombee(x1, y1, mx, x2, y2, cartes, marge) {
    const M = Number(marge) || 0;
    const N = 16;
    for (const c of cartes || []) {
      if (!c) continue;
      const g = c.x - M, h = c.y - M;
      const d = c.x + (c.w || 0) + M, b = c.y + (c.h || 0) + M;
      for (let i = 0; i <= N; i++) {
        const t = i / N, u = 1 - t;
        const px = u * u * u * x1 + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * x2;
        const py = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
        if (px > g && px < d && py > h && py < b) return true;
      }
    }
    return false;
  }

  // Polyligne à segments verticaux/horizontaux rendue en `d` SVG. Rayon 0 :
  // angles vifs ; sinon coins arrondis, bornés à la demi-longueur des côtés.
  // Les points alignés intermédiaires sont dédupliqués.
  static cheminPolyligne(points, rayon) {
    const P = [];
    for (const p of points || []) {
      if (p && (P.length === 0 || p.x !== P[P.length - 1].x || p.y !== P[P.length - 1].y)) P.push(p);
    }
    if (P.length < 2) return '';
    const r = Math.max(0, Number(rayon) || 0);
    let d = 'M ' + P[0].x + ' ' + P[0].y;
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i - 1], b = P[i], c = P[i + 1];
      const rr = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
      if (!rr) { d += ' L ' + b.x + ' ' + b.y; continue; }
      const p1 = { x: b.x - Math.sign(b.x - a.x) * rr, y: b.y - Math.sign(b.y - a.y) * rr };
      const p2 = { x: b.x + Math.sign(c.x - b.x) * rr, y: b.y + Math.sign(c.y - b.y) * rr };
      d += ' L ' + p1.x + ' ' + p1.y + ' Q ' + b.x + ' ' + b.y + ' ' + p2.x + ' ' + p2.y;
    }
    const f = P[P.length - 1];
    return d + ' L ' + f.x + ' ' + f.y;
  }

  // Routage : sortie au bord droit de la source, entrée par la gauche, le haut
  // ou le bas de la cible — jamais par la droite. Gabarits essayés dans
  // l'ordre ; le premier dont tous les segments sont libres gagne. Renvoie
  // { points, cote, x2, y2 }, ou null si aucun chemin n'existe (l'appelant
  // retombe alors sur le tracé simple).
  //  sortie    : {x, y} — le point de sortie (bord droit de la source).
  //  cible     : {x, y, w, h, ancreGauche} — rect de la carte + hauteur
  //              d'ancre du bord gauche ; l'entrée verticale se fait au centre.
  //  obstacles : les AUTRES cartes {x, y, w, h}.
  //  opts      : {marge, ecart, source}.
  static routeFlecheArticulation(sortie, cible, obstacles, opts) {
    if (!sortie || !cible) return null;
    const o = opts || {};
    const M = Number.isFinite(o.marge) ? o.marge : 12;
    const E = Number.isFinite(o.ecart) ? o.ecart : 22;
    const x1 = sortie.x, y1 = sortie.y;
    const yQ = Number.isFinite(cible.ancreGauche) ? cible.ancreGauche : cible.y + (cible.h || 0) / 2;
    const cx = cible.x + (cible.w || 0) / 2;
    const aDroite = cible.x >= x1 + 24;
    const auDessus = cible.y + (cible.h || 0) / 2 < y1;
    // La source et la cible entrent dans la validation sans marge : le test
    // intérieur strict épargne les ancrages posés sur leurs bords.
    const defence = [o.source, cible].filter(Boolean);
    const libre = (pts) => {
      for (let i = 1; i < pts.length; i++) {
        if (Ariane.segmentFrappe(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, obstacles, M)) return false;
        if (Ariane.segmentFrappe(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, defence, 0)) return false;
      }
      return true;
    };
    // Les cartes qui encombrent le passage repoussent le couloir horizontal :
    // juste au-dessus de la plus haute, ou juste en dessous de la plus basse.
    // La source y compte (contour à rebours) ; la cible non, ses plafonds
    // d'entrée suffisent.
    const passage = (a, b) => [o.source].concat(obstacles || []).filter((c) => c
      && c.x + (c.w || 0) + M > Math.min(a, b) && c.x - M < Math.max(a, b));
    const couloirHaut = (a, b, plafond) => {
      let y = plafond;
      for (const c of passage(a, b)) y = Math.min(y, c.y - M);
      return y;
    };
    const couloirBas = (a, b, plancher) => {
      let y = plancher;
      for (const c of passage(a, b)) y = Math.max(y, c.y + (c.h || 0) + M);
      return y;
    };
    const essais = [];
    // Entrée par la gauche : direct dans l'entre-deux, sinon couloir au-dessus
    // ou en dessous des cartes du passage, puis descente / montée d'approche.
    const parGauche = () => {
      const mx = Math.max(x1 + 16, (x1 + cible.x) / 2);
      const direct = [{ x: x1, y: y1 }, { x: mx, y: y1 }, { x: mx, y: yQ }, { x: cible.x, y: yQ }];
      if (libre(direct)) return direct;
      for (const couloir of [
        couloirHaut(x1 + E, cible.x - E, Math.min(y1, yQ)),
        couloirBas(x1 + E, cible.x - E, Math.max(y1, yQ)),
      ]) {
        const pts = [{ x: x1, y: y1 }, { x: x1 + E, y: y1 }, { x: x1 + E, y: couloir },
          { x: cible.x - E, y: couloir }, { x: cible.x - E, y: yQ }, { x: cible.x, y: yQ }];
        if (libre(pts)) return pts;
      }
      return null;
    };
    const parHaut = () => {
      const couloir = couloirHaut(x1 + E, cx, Math.min(y1, cible.y - M));
      const pts = [{ x: x1, y: y1 }, { x: x1 + E, y: y1 }, { x: x1 + E, y: couloir },
        { x: cx, y: couloir }, { x: cx, y: cible.y }];
      return libre(pts) ? pts : null;
    };
    const parBas = () => {
      const couloir = couloirBas(x1 + E, cx, Math.max(y1, cible.y + (cible.h || 0) + M));
      const pts = [{ x: x1, y: y1 }, { x: x1 + E, y: y1 }, { x: x1 + E, y: couloir },
        { x: cx, y: couloir }, { x: cx, y: cible.y + (cible.h || 0) }];
      return libre(pts) ? pts : null;
    };
    essais.push(['gauche', parGauche]);
    essais.push(auDessus ? ['bas', parBas] : ['haut', parHaut]);
    essais.push(auDessus ? ['haut', parHaut] : ['bas', parBas]);
    if (!aDroite) essais.push(['gauche', parGauche]);
    for (const [cote, essai] of essais) {
      const pts = essai();
      if (pts) {
        const f = pts[pts.length - 1];
        return { points: pts, cote, x2: f.x, y2: f.y };
      }
    }
    return null;
  }

  // Décision complète pour une arête : le tracé simple dès qu'il est libre et
  // qu'il entre à gauche, le routage qui contourne les cartes sinon, le tracé
  // historique en dernier recours (peut passer derrière une carte). Renvoie
  // { d, x2, y2, cote, detour, labX, labY }. `o` : { x1, y1,
  // source:{x,y,w,h}, cible:{x,y,w,h,ancreGauche}, obstacles, mode, marge,
  // ecart }.
  static traceFlecheArticulation(o) {
    const c = o || {};
    const mode = c.mode === 'angulaire' ? 'angulaire' : 'courbe';
    const T = c.cible || {};
    const x1 = c.x1, y1 = c.y1;
    const yQ = Number.isFinite(T.ancreGauche) ? T.ancreGauche : T.y;
    const aDroite = T.x >= x1 + 24;
    const milieux = (x2, y2) => ({ labX: (x1 + x2) / 2, labY: (y1 + y2) / 2 - 4 });
    // Le tracé d'origine, dès qu'il est libre : aucun changement visible dans
    // les cas qui marchaient déjà.
    if (aDroite) {
      const mx = Math.max(x1 + 16, (x1 + T.x) / 2);
      const pris = mode === 'angulaire'
        ? Ariane.segmentFrappe(x1, y1, mx, y1, c.obstacles, c.marge)
          || Ariane.segmentFrappe(mx, y1, mx, yQ, c.obstacles, c.marge)
          || Ariane.segmentFrappe(mx, yQ, T.x, yQ, c.obstacles, c.marge)
        : Ariane.flecheEncombee(x1, y1, mx, T.x, yQ, c.obstacles, c.marge);
      if (!pris) {
        const d = mode === 'angulaire'
          ? 'M ' + x1 + ' ' + y1 + ' H ' + mx + ' V ' + yQ + ' H ' + T.x
          : Ariane._cheminFleche(x1, y1, T.x, yQ);
        return Object.assign({ d, x2: T.x, y2: yQ, cote: 'gauche', detour: false }, milieux(T.x, yQ));
      }
    }
    // Routage : contourner les cartes.
    const route = Ariane.routeFlecheArticulation({ x: x1, y: y1 }, T, c.obstacles,
      { marge: c.marge, ecart: c.ecart, source: c.source });
    if (route) {
      const d = Ariane.cheminPolyligne(route.points, mode === 'angulaire' ? 0 : 12);
      let meilleur = null, long = -1;
      for (let i = 1; i < route.points.length; i++) {
        const p = route.points[i - 1], q = route.points[i];
        const l = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
        if (l > long) { long = l; meilleur = { labX: (p.x + q.x) / 2, labY: (p.y + q.y) / 2 - 4 }; }
      }
      return Object.assign({ d, x2: route.x2, y2: route.y2, cote: route.cote, detour: true }, meilleur);
    }
    // Aucun chemin : le tracé historique, entrée à droite comprise.
    const x2 = aDroite ? T.x : T.x + (T.w || 0);
    const mx = aDroite ? Math.max(x1 + 16, (x1 + T.x) / 2) : Math.max(x1, x2) + 26;
    const d = mode === 'angulaire'
      ? 'M ' + x1 + ' ' + y1 + ' H ' + mx + ' V ' + yQ + ' H ' + x2
      : 'M ' + x1 + ' ' + y1 + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + yQ + ', ' + x2 + ' ' + yQ;
    return Object.assign({ d, x2, y2: yQ, cote: aDroite ? 'gauche' : 'droite', detour: false },
      milieux(x2, yQ));
  }
  // Lignée révélée au survol : la famille entière. On remonte la chaîne des
  // parents rendus jusqu'à la racine, puis on prend tout son sous-arbre.
  // Qu'on survole la mère ou une de ses filles, le trait se pose alors sur
  // toutes les filles de chaque mère de la lignée. Renvoie un Set de refs.
  static ligneeDe(ref, parRef) {
    const enfants = new Map();
    for (const l of parRef.values()) {
      if (!l.parent) continue;
      if (!enfants.has(l.parent)) enfants.set(l.parent, []);
      enfants.get(l.parent).push(l.ref);
    }
    const lignee = new Set([ref]);
    let cur = (parRef.get(ref) || {}).parent;
    let racine = ref;
    while (cur && parRef.has(cur) && !lignee.has(cur)) {
      lignee.add(cur); racine = cur; cur = parRef.get(cur).parent;
    }
    const file = [racine];
    while (file.length) {
      for (const e of enfants.get(file.shift()) || []) {
        if (!lignee.has(e)) { lignee.add(e); file.push(e); }
      }
    }
    return lignee;
  }

  // Hiérarchie complète des tâches, pour les boutons et panneaux de lignée du
  // calendrier. Renvoie { parRef, meres, filles } : parRef = Map ref → tâche ;
  // meres = Map ref → chaîne [racine, …, mère, ref] ; filles = Map ref →
  // sous-arbre [{ ref, filles: […] }]. Parent inconnu ou cycle : la remontée
  // s'arrête, la descendance coupe au chemin déjà parcouru.
  static hierarchiesTaches(taches) {
    const liste = (taches || []).filter((t) => t && t.ref);
    const parRef = new Map(liste.map((t) => [t.ref, t]));
    const enfants = new Map();
    for (const t of liste) {
      const p = Ariane.refDeLien(t.parent);
      if (!p || !parRef.has(p) || p === t.ref) continue;
      if (!enfants.has(p)) enfants.set(p, []);
      enfants.get(p).push(t.ref);
    }
    const filles = new Map();
    const chemin = new Set();
    // Pas de mémoïsation : un résultat calculé pendant le parcours d'un cycle
    // serait coupé trop tôt et empoisonnerait ensuite la memo. Les hiérarchies
    // réelles sont peu profondes — le recalcul ne coûte rien.
    const sousArbre = (r) => {
      if (chemin.has(r)) return [];            // cycle : coupe ici
      chemin.add(r);
      const out = (enfants.get(r) || []).map((e) => ({ ref: e, filles: sousArbre(e) }));
      chemin.delete(r);
      return out;
    };
    const meres = new Map();
    const chaineDe = (r) => {
      const out = [r];
      const vus = new Set([r]);
      let cur = Ariane.refDeLien((parRef.get(r) || {}).parent);
      while (cur && parRef.has(cur) && !vus.has(cur)) {
        out.unshift(cur); vus.add(cur);
        cur = Ariane.refDeLien((parRef.get(cur) || {}).parent);
      }
      return out;
    };
    for (const t of liste) {
      chemin.clear();
      filles.set(t.ref, sousArbre(t.ref));
      meres.set(t.ref, chaineDe(t.ref));
    }
    return { parRef, meres, filles };
  }

  // Paires de tâches à relier dans la vue semaine du calendrier : mère DIRECTE
  // → fille (parenté) et bloqueur → bloquée. Seules sortent les paires dont
  // les deux bouts figurent dans `taches` (celles qui ont un créneau rendu) ;
  // la grand-mère n'est pas reliée à la petite-fille — la chaîne des traits
  // passe par la mère. Renvoie [{ de, vers, genre }] (de = amont).
  static pairesLigneeCalendrier(taches, hier) {
    const liste = (taches || []).filter((t) => t && t.ref);
    const la = new Set(liste.map((t) => t.ref));
    const vus = new Set();
    const out = [];
    const pousser = (de, vers, genre) => {
      if (!de || de === vers || !la.has(de) || !la.has(vers)) return;
      const cle = de + ' ' + vers + ' ' + genre;
      if (vus.has(cle)) return;
      vus.add(cle);
      out.push({ de, vers, genre });
    };
    for (const t of liste) {
      const chaine = hier && hier.meres ? hier.meres.get(t.ref) : null;
      if (chaine && chaine.length >= 2) pousser(chaine[chaine.length - 2], t.ref, 'hier');
      for (const b of t.bloquePar || []) pousser(Ariane.refDeLien(b), t.ref, 'bloque');
    }
    return out;
  }

  // Associe aux paires de tâches les créneaux rendus (points) : TOUS les
  // créneaux amont sont reliés à TOUS les créneaux aval (une tâche avec
  // plusieurs sessions affiche un trait par paire), mais seulement dans la
  // `portee` — écart en jours, la largeur de la vue. Renvoie [{ a, b, genre }]
  // — indices dans points, a = amont.
  static liensLigneeCalendrier(points, paires, portee) {
    const pts = points || [];
    const temps = (q) => {
      const n = Date.parse(String(q || '').replace(' ', 'T'));
      return Number.isFinite(n) ? n : 0;
    };
    const parRef = new Map();
    pts.forEach((p, i) => {
      if (!p || !p.ref) return;
      if (!parRef.has(p.ref)) parRef.set(p.ref, []);
      parRef.get(p.ref).push(i);
    });
    const maxJours = Number.isFinite(portee) ? portee : 7;
    const out = [];
    for (const paire of paires || []) {
      const cote = (ref) => (parRef.get(ref) || [])
        .map((i) => ({ i, q: String(pts[i].quand || '') }))
        .sort((x, y) => (x.q < y.q ? -1 : x.q > y.q ? 1 : 0));
      for (const u of cote(paire.de)) {
        for (const v of cote(paire.vers)) {
          const jours = Math.abs(temps(u.q.slice(0, 10))
            - temps(v.q.slice(0, 10))) / 86400000;
          if (jours > maxJours) continue;
          out.push({ a: u.i, b: v.i, genre: paire.genre });
        }
      }
    }
    return out;
  }

  // Géométrie d'un trait entre deux créneaux rendus (rects relatifs au SVG) :
  // colonnes différentes → courbe horizontale bord à bord ; même colonne →
  // courbe verticale du bas de l'un au haut de l'autre ; chevauchement
  // horizontal (blocs côte à côte) → court trait bord à bord. Renvoie
  // { d, ax, ay, bx, by } — d pour le path, a/b pour les nœuds d'extrémité.
  static cheminLienCalendrier(ra, rb) {
    const r2 = (v) => Math.round(v * 100) / 100;
    const siHorizontal = (ra.x + ra.w) <= rb.x || (rb.x + rb.w) <= ra.x;
    if (siHorizontal) {
      const [g, dr] = ra.x <= rb.x ? [ra, rb] : [rb, ra];
      const ax = g.x + g.w, ay = g.y + g.h / 2;
      const bx = dr.x, by = dr.y + dr.h / 2;
      const mx = r2((ax + bx) / 2);
      return { d: 'M ' + r2(ax) + ' ' + r2(ay) + ' C ' + mx + ' ' + r2(ay)
        + ' ' + mx + ' ' + r2(by) + ' ' + r2(bx) + ' ' + r2(by),
        ax: r2(ax), ay: r2(ay), bx: r2(bx), by: r2(by) };
    }
    const haut = ra.y <= rb.y ? ra : rb;
    const bas = haut === ra ? rb : ra;
    const ax = haut.x + haut.w / 2, ay = haut.y + haut.h;
    const bx = bas.x + bas.w / 2, by = bas.y;
    const my = r2((ay + by) / 2);
    return { d: 'M ' + r2(ax) + ' ' + r2(ay) + ' C ' + r2(ax) + ' ' + my
      + ' ' + r2(bx) + ' ' + my + ' ' + r2(bx) + ' ' + r2(by),
      ax: r2(ax), ay: r2(ay), bx: r2(bx), by: r2(by) };
  }

  // Colonne de jour visée par l'étirement d'une barre de la frise : la date
  // qui change est celle qui touche le bord tiré — début pour la poignée
  // gauche (bord gauche de sa colonne), échéance pour la droite (la barre
  // couvre son dernier jour en entier, donc bord droit = fin de sa colonne).
  static colonneGuideEtir(x, ppj, cote) {
    const p = Number(ppj) > 0 ? Number(ppj) : 1;
    const i = Math.round(Number(x) / p) - (cote === 'droite' ? 1 : 0);
    return Math.max(0, i);
  }

  // Défilement de l'intitulé d'une barre survolée : décalage (en px, négatif —
  // le texte glisse vers la gauche) et durée d'un aller (vitesse ~20 px/s)
  // quand le texte dépasse la place disponible, null sinon.
  static defileEtiquette(mesure, dispo) {
    const trop = Number(mesure) - Math.max(10, Number(dispo) || 10);
    if (!(trop > 4)) return null;
    return { x: Math.round(-trop * 10) / 10, duree: Math.round(trop / 0.02) };
  }

  // Abscisse de l'épine d'une accolade de lignée : dégagée À GAUCHE de la
  // mère ET de la première fille datée (voir _cheminAccolade). Elle ne
  // traverse donc jamais une barre de la famille, même quand le tri actif ou
  // le regroupement éparpille la mère au milieu de ses filles. Les filles
  // sans date (accrochées au bord gauche visible) ne tirent pas l'épine.
  static _epineAccolade(b, dx, refBouge) {
    const kx = (k) => k.xg + (k.ref === refBouge ? (dx || 0) : 0);
    const xs = b.kids.filter((k) => !k.sansDate).map(kx);
    xs.push(b.mx);
    return Math.max(0, Math.min.apply(null, xs) - b.degage);
  }

  // `d` d'une accolade de lignée : l'épine est un rail vertical dégagé à
  // gauche de la mère et des filles datées, couvrant toute la famille. La mère
  // et chaque fille se raccordent AU CENTRE de l'extrémité gauche de leur
  // barre par un ANGLE DROIT dont le sommet est SUR le trait — c'est là que
  // porte le nœud (la jointure ronde du trait adoucit l'angle, sans courbe
  // qui s'arrêterait avant le point). Une fille sans date rejoint sa bande en
  // trait direct le long de sa ligne. `dx` décale la fille `refBouge`
  // (glissé en direct).
  // b : { mx, pCy, kids:[{ref,xg,cy,sansDate}], degage }
  static _cheminAccolade(b, dx, refBouge) {
    const sx = Ariane._epineAccolade(b, dx, refBouge);
    const kx = (k) => k.xg + (k.ref === refBouge ? (dx || 0) : 0);
    const cys = b.kids.map((k) => k.cy);
    const haut = Math.min.apply(null, cys.concat([b.pCy]));
    const bas = Math.max.apply(null, cys.concat([b.pCy]));
    const dessus = haut < b.pCy - 0.5; // des filles au-dessus de la mère
    const dessous = bas > b.pCy + 0.5; // des filles en dessous
    let d;
    if (dessus && dessous) {
      // Famille éparpillée des deux côtés : rail traversant, la mère le
      // rejoint en trait droit (aucun sens d'angle à privilégier).
      d = 'M ' + sx + ' ' + haut + ' L ' + sx + ' ' + bas
        + ' M ' + b.mx + ' ' + b.pCy + ' L ' + sx + ' ' + b.pCy;
    } else if (dessous) {
      // Filles plus bas : l'angle droit est sous la mère, au ras du rail.
      d = 'M ' + b.mx + ' ' + b.pCy + ' L ' + sx + ' ' + b.pCy
        + ' L ' + sx + ' ' + bas;
    } else {
      // Filles plus haut (ou à hauteur) : le rail descend jusqu'à la mère.
      d = 'M ' + sx + ' ' + haut + ' L ' + sx + ' ' + b.pCy
        + ' L ' + b.mx + ' ' + b.pCy;
    }
    for (const k of b.kids) {
      // Chaque fille part du rail à sa hauteur, en angle droit ; une bande
      // sans date a son bord gauche des deux côtés possibles de l'épine.
      const xg = kx(k);
      d += ' M ' + sx + ' ' + k.cy + ' L ' + xg + ' ' + k.cy;
    }
    return d;
  }

  //#endregion Ariane · static · articulation

  //#region Ariane · suggestions locales
  // ── suggestions locales ──────────────────────────────────────────────────

  /* --------------------- Moteur de suggestions -------------------------- */

  // Fichiers markdown appartenant aux dossiers candidats configurés.
  fichiersCandidatsSuggestions() {
    const dossiers = this.dossiersSuggeres();
    const res = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!dossiers.length || dossiers.some((d) => f.path === d + '.md' || f.path.startsWith(d + '/'))) {
        res.push(f);
      }
    }
    return res;
  }

  // Dossier candidat (le plus spécifique) contenant un chemin, ou '' si aucun.
  // Un dossier candidat est-il retenu par le filtre du panneau ?
  dossierRetenu(dossier) {
    const masques = this.settings.suggDossiersMasques || [];
    return !masques.includes(dossier);
  }

  dossierCandidatDe(chemin) {
    const dossiers = this.dossiersSuggeres()
      .slice().sort((a, b) => b.length - a.length); // plus spécifique d'abord
    for (const d of dossiers) {
      if (chemin === d + '.md' || chemin.startsWith(d + '/')) return d;
    }
    return '';
  }

  // Titre lisible : premier alias, sinon nom de fichier.
  titreLisibleFichier(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const al = cache && cache.frontmatter ? cache.frontmatter.aliases : null;
    if (Array.isArray(al) && al.length) return String(al[0]);
    if (typeof al === 'string' && al) return al;
    return file.basename;
  }

  // Texte indexable d'un fichier candidat : titre (pondéré) + corps nettoyé.
  async texteIndexable(file) {
    let contenu = '';
    try { contenu = await this.app.vault.cachedRead(file); } catch (e) { contenu = ''; }
    const sansFm = contenu.replace(/^---\n[\s\S]*?\n---\n?/, '');
    const propre = sansFm
      .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
      .replace(/[#>*_\[\]\(\)!|^-]+/g, ' ')
      .replace(/\s+/g, ' ');
    const titre = this.titreLisibleFichier(file);
    return titre + ' . ' + titre + ' . ' + propre; // titre compté deux fois
  }

  // (Re)construit l'index des notes candidates : lexical (toujours) et
  // sémantique (si le moteur l'exige et qu'Ollama répond).
  async construireIndexSuggestions() {
    const fichiers = this.fichiersCandidatsSuggestions();
    const entrees = [];
    for (const f of fichiers) {
      const texte = await this.texteIndexable(f);
      if (!texte.trim()) continue;
      entrees.push({ path: f.path, basename: f.basename, titre: this.titreLisibleFichier(f), texte, hash: hacherTexte(texte) });
    }
    this.suggEntrees = entrees;
    this.suggSales = new Set();
    this.recomposerIndexLexical();
    if (this.moteurSemantiqueDemande()) await this.construireIndexSemantique(entrees);
    else this.suggIndexSem = null;
    return this.suggIndex.docs.length;
  }

  moteurSemantiqueDemande() {
    const m = this.settings.suggMoteur || 'hybride';
    return m === 'semantique' || m === 'hybride';
  }

  // Recompose les vecteurs lexicaux à partir des entrées DÉJÀ en mémoire : une
  // centaine de millisecondes pour tout le coffre, sans lire un seul fichier.
  // C'est ce qui permet de ne plus tout relire au moindre enregistrement.
  recomposerIndexLexical() {
    const entrees = this.suggEntrees || [];
    const docsTf = entrees.map((e) => frequenceTermes(tokeniser(e.texte)));
    const idf = calculerIdf(docsTf);
    const docs = entrees.map((e, i) => {
      const v = vecteurTfIdf(docsTf[i], idf);
      return { path: e.path, basename: e.basename, titre: e.titre, vec: v.vec, norme: v.norme };
    });
    this.suggIndex = { docs, idf };
  }

  async assurerIndexSuggestions() {
    if (!this.suggIndex || !this.suggEntrees) { await this.construireIndexSuggestions(); return; }
    if (this.suggSales && this.suggSales.size) await this.rafraichirIndexSuggestions();
  }

  // Une note modifiée ne salit qu'elle-même. Auparavant le moindre
  // enregistrement jetait l'index entier : 1344 notes relues, et 29 Mo de
  // cache d'embeddings relus puis réécrits, à chaque fois.
  marquerNoteSale(file) {
    if (!file || !file.path || !this.suggEntrees) return;
    (this.suggSales = this.suggSales || new Set()).add(file.path);
  }

  async rafraichirIndexSuggestions() {
    const sales = [...(this.suggSales || [])];
    this.suggSales = new Set();
    if (!sales.length) return;
    const parPath = new Map((this.suggEntrees || []).map((e) => [e.path, e]));
    const candidats = new Set(this.fichiersCandidatsSuggestions().map((f) => f.path));
    for (const chemin of sales) {
      const f = this.app.vault.getAbstractFileByPath(chemin);
      if (!f || !f.basename || !candidats.has(chemin)) { parPath.delete(chemin); continue; }
      const texte = await this.texteIndexable(f);
      if (!texte.trim()) { parPath.delete(chemin); continue; }
      parPath.set(chemin, { path: chemin, basename: f.basename, titre: this.titreLisibleFichier(f), texte, hash: hacherTexte(texte) });
    }
    this.suggEntrees = [...parPath.values()];
    this.recomposerIndexLexical();
    if (this.moteurSemantiqueDemande()) await this.construireIndexSemantique(this.suggEntrees);
    else this.suggIndexSem = null;
  }

  invaliderIndexSuggestions() {
    this.suggIndex = null;
    this.suggIndexSem = null;
    this.suggEntrees = null;
    this.suggSales = null;
  }

  /* ---- Embeddings locaux via Ollama (gratuit, hors-ligne) ---- */

  cheminCacheEmbeddings() {
    return this.manifest.dir + '/cache-embeddings.json';
  }

  // Le cache des embeddings pèse 29 Mo. Il vit désormais en mémoire pour toute
  // la session : le relire et le réécrire à chaque mise à jour de l'index
  // coûtait cher, et faisait repartir OneDrive pour rien.
  async assurerCacheEmbeddings(modele) {
    if (this.suggEmb && this.suggEmbModele === modele) return this.suggEmb;
    let entrees = {};
    try {
      const chemin = this.cheminCacheEmbeddings();
      if (await this.app.vault.adapter.exists(chemin)) {
        const j = JSON.parse(await this.app.vault.adapter.read(chemin));
        if (j && j.model === modele && j.entries) entrees = j.entries;
      }
    } catch (e) { /* cache illisible : on repart de zéro */ }
    this.suggEmb = entrees;
    this.suggEmbModele = modele;
    this.suggEmbSale = false;
    this.suggVecs = new Map();
    return entrees;
  }

  // Écriture espacée : au plus une fois toutes les cinq minutes, et à la
  // fermeture. Les 29 Mo n'ont pas à repartir sur le disque à chaque frappe.
  planifierSauvegardeEmbeddings() {
    this.suggEmbSale = true;
    if (this.suggEmbMinuteur) return;
    this.suggEmbMinuteur = setTimeout(() => {
      this.suggEmbMinuteur = null;
      this.sauverCacheEmbeddings().catch(() => { /* fermeture en cours */ });
    }, 5 * 60 * 1000);
  }

  async sauverCacheEmbeddings() {
    if (!this.suggEmbSale || !this.suggEmb) return;
    this.suggEmbSale = false;
    try {
      await this.app.vault.adapter.write(this.cheminCacheEmbeddings(),
        JSON.stringify({ model: this.suggEmbModele, entries: this.suggEmb }));
    } catch (e) { console.debug('[Ariane] sauvegarde cache embeddings', e); }
  }

  // Encode une liste de textes via Ollama. Renvoie null si Ollama est
  // indisponible (le moteur bascule alors sur le lexical).
  /* --- Service d'inférence local : Ollama ou LM Studio --------------- */

  fournisseurLmStudio() {
    return (this.settings.suggFournisseur || 'ollama') === 'lmstudio';
  }

  // Le drapeau est passé explicitement : deux réglages coexistent, celui des
  // suggestions et celui du découpage bibliographique, et ils peuvent différer.
  urlInference(lm) {
    const estLm = lm === undefined ? this.fournisseurLmStudio() : !!lm;
    return estLm
      ? (this.settings.suggLmStudioUrl || 'http://localhost:1234').replace(/\/+$/, '')
      : (this.settings.suggOllamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
  }

  // Encode une liste de textes. LM Studio parle l'API d'OpenAI — /v1/embeddings,
  // réponse dans « data[].embedding » — là où Ollama a la sienne. Rend null si
  // le service est indisponible : le moteur bascule alors sur le lexical.
  async encoderTextes(textes) {
    const lm = this.fournisseurLmStudio();
    try {
      const url = this.urlInference() + (lm ? '/v1/embeddings' : '/api/embed');
      const rep = await obsidian.requestUrl({
        url, method: 'POST', throw: false,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.settings.suggModeleEmbed || 'bge-m3', input: textes }),
      });
      if (rep && rep.status >= 200 && rep.status < 300) {
        const j = rep.json !== undefined ? rep.json : JSON.parse(rep.text);
        if (lm && Array.isArray(j.data)) return j.data.map((d) => d.embedding);
        if (Array.isArray(j.embeddings)) return j.embeddings;
        if (Array.isArray(j.embedding)) return [j.embedding];
      }
    } catch (e) {
      console.debug('[Ariane] encodage indisponible', e);
    }
    return null;
  }

  // Une génération censée rendre du JSON. Bornée dans les deux dialectes :
  // « num_predict » pour Ollama, « max_tokens » pour LM Studio. Sans cette
  // borne, un modèle qui ne referme pas son objet tourne jusqu'à saturer son
  // contexte — plusieurs minutes à pleine charge.
  async genererJson(prompt, jetons) {
    return this.genererJsonAvec(prompt, jetons || this.settings.suggRerankJetons || 400,
      this.fournisseurLmStudio(), this.settings.suggModeleLLM || 'llama3.2');
  }

  async genererJsonAvec(prompt, max, lm, modele) {
    const url = this.urlInference(lm) + (lm ? '/v1/chat/completions' : '/api/generate');
    try {
      const corps = lm
        // LM Studio refuse « response_format: json_object » — il n'accepte que
        // « json_schema » ou « text », et cela varie d'une version à l'autre.
        // On s'en passe : la consigne est dans l'invite, et l'analyse de la
        // réponse est déjà tolérante. « max_tokens » suffit à borner.
        ? { model: modele, messages: [{ role: 'user', content: prompt }],
            temperature: 0, max_tokens: max }
        : { model: modele, prompt, stream: false, format: 'json', keep_alive: '2m',
            options: { temperature: 0, num_predict: max } };
      const rep = await obsidian.requestUrl({
        url, method: 'POST', throw: false,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      if (!rep || rep.status < 200 || rep.status >= 300) {
        this._diagIA = 'HTTP ' + (rep ? rep.status : '?') + ' — ' + url
          + (rep && rep.text ? ' : ' + String(rep.text).replace(/\s+/g, ' ').slice(0, 180) : '')
          + tr(' (modèle « ') + modele + tr(' » installé ? service lancé ?)');
        return null;
      }
      const j = rep.json !== undefined ? rep.json : JSON.parse(rep.text);
      if (lm) {
        const c = j && j.choices && j.choices[0];
        const t = c && c.message ? String(c.message.content || '') : '';
        if (!t) this._diagIA = tr('Réponse vide de LM Studio (modèle chargé ?).');
        return t || null;
      }
      const r = (j && typeof j.response === 'string') ? j.response : (rep.text || '');
      if (!r) this._diagIA = tr('Réponse vide d\'Ollama (essayez un autre modèle).');
      else this._diagIA = '';
      return r || null;
    } catch (e) {
      this._diagIA = url + tr(' injoignable : ') + (e && e.message ? e.message : e);
      console.debug('[Ariane] génération indisponible', e);
      return null;
    }
  }

  // Le découpage bibliographique passe par son propre moteur. Les quatre
  // dialectes se rejoignent ici, pour qu'il n'existe qu'un seul endroit où
  // borner la génération et rattraper les erreurs.
  async genererJsonRefs(prompt, jetons) {
    return this.genererAvecFournisseur(prompt, jetons || 300,
      this.settings.refsFournisseur || 'ollama', this.settings.refsModele || 'llama3.2');
  }



  async genererAvecFournisseur(prompt, max, f, modele) {
    if (f === 'mistral') return this.genererMistral(prompt, max, modele);
    if (f === 'claude') return this.genererClaude(prompt, max);
    return this.genererJsonAvec(prompt, max, f === 'lmstudio', modele);
  }

  async genererMistral(prompt, max, modele) {
    const cle = (this.settings.refsCleMistral || '').trim();
    if (!cle) {
      this._diagIA = tr('Clé Mistral absente des réglages.');
      new obsidian.Notice(this._diagIA);
      return null;
    }
    // Un nom de modèle local (llama…, qwen…, …:tag) ne veut rien dire pour
    // Mistral : on retombe alors sur un modèle Mistral valide.
    let m = String(modele || '').trim();
    if (!/^(mistral|ministral|magistral|codestral|pixtral|open-)/i.test(m)) m = 'mistral-small-latest';
    try {
      const rep = await obsidian.requestUrl({
        url: 'https://api.mistral.ai/v1/chat/completions',
        method: 'POST', throw: false,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cle },
        body: JSON.stringify({
          model: m,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0, max_tokens: max,
          response_format: { type: 'json_object' },
        }),
      });
      if (!rep || rep.status < 200 || rep.status >= 300) {
        this._diagIA = 'Mistral HTTP ' + (rep ? rep.status : '?')
          + (rep && rep.text ? ' : ' + String(rep.text).replace(/\s+/g, ' ').slice(0, 180) : '')
          + tr(' (clé valide ? modèle « ') + m + ' » ?)';
        return null;
      }
      const j = rep.json !== undefined ? rep.json : JSON.parse(rep.text);
      const c = j && j.choices && j.choices[0];
      const t = c && c.message ? String(c.message.content || '') : '';
      this._diagIA = t ? '' : tr('Réponse vide de Mistral.');
      return t || null;
    } catch (e) {
      this._diagIA = tr('Mistral injoignable : ') + (e && e.message ? e.message : e);
      console.debug('[Ariane] Mistral indisponible', e);
      return null;
    }
  }

  // Le CLI de Claude ne demande ni clé ni serveur. On le borne dans le temps :
  // un processus qui ne rend pas la main bloquerait tout le lot.
  genererClaude(prompt, max) {
    const bin = (this.settings.refsCheminClaude || 'claude').trim() || 'claude';
    return new Promise((resoudre) => {
      let fini = false;
      const env = Object.assign({}, process.env, {
        PATH: process.env.HOME + '/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:'
          + (process.env.PATH || ''),
      });
      const enfant = require('child_process').execFile(
        bin, ['-p', prompt], { env, timeout: 60000, maxBuffer: 1 << 20 },
        (err, sortie) => {
          if (fini) return;
          fini = true;
          if (err) this._diagIA = tr('CLI Claude : ') + (err.message || err)
            + tr(' (« ') + bin + tr(' » dans le PATH ?)');
          else this._diagIA = '';
          resoudre(err ? null : String(sortie || '').trim());
        });
      // Sans cela le CLI attend trois secondes une entrée standard qui ne
      // viendra jamais, à chaque appel.
      try { if (enfant.stdin) enfant.stdin.end(); } catch (e) { /* déjà fermée */ }
      setTimeout(() => { if (!fini) { try { enfant.kill('SIGKILL'); } catch (e) { /* déjà mort */ } } }, 61000);
    });
  }

  async testerEncodage() {
    const v = await this.encoderTextes(['test']);
    return !!(v && v[0] && v[0].length);
  }

  async testerLLM() {
    const t = await this.genererJson('Réponds uniquement : {"ok":true}', 32);
    return !!t;
  }

  // Construit l'index sémantique en réutilisant le cache disque : seules les
  // notes nouvelles ou modifiées sont réencodées.
  async construireIndexSemantique(entrees) {
    const modele = this.settings.suggModeleEmbed || 'bge-m3';
    const cache = await this.assurerCacheEmbeddings(modele);
    const aEncoder = entrees.filter((e) => {
      const c = cache[e.path];
      return !(c && c.hash === e.hash && Array.isArray(c.vec));
    });
    const total = aEncoder.length;
    const vue = this.vueSuggestions();
    let notice = null;
    const rapporter = (fait) => {
      const msg = 'Indexation sémantique : ' + fait + ' / ' + total + ' notes…';
      if (notice) notice.setMessage(msg);
      if (vue && vue.marquerIndexation) vue.marquerIndexation(fait, total);
    };
    // Popup uniquement pour un gros index (premier build / reconstruction).
    // Les petites réindexations (note éditée) restent silencieuses.
    if (total > 30) notice = new obsidian.Notice(tr('Indexation sémantique…'), 0);
    if (total > 0) rapporter(0);
    const lot = 24;
    let fait = 0;
    for (let i = 0; i < aEncoder.length; i += lot) {
      const tranche = aEncoder.slice(i, i + lot);
      const vecs = await this.encoderTextes(tranche.map((e) => e.texte));
      if (!vecs) { // Ollama indisponible -> repli lexical
        if (notice) notice.hide();
        if (vue && vue.marquerIndexation) vue.marquerIndexation(-1, total);
        this.suggIndexSem = null;
        return;
      }
      tranche.forEach((e, k) => {
        const v = normaliserVecteur(vecs[k]);
        cache[e.path] = { hash: e.hash, vec: Array.from(v) };
        this.suggVecs.set(e.path, { hash: e.hash, vec: v });
      });
      fait += tranche.length;
      rapporter(fait);
    }
    if (notice) notice.hide();
    if (vue && vue.marquerIndexation) vue.marquerIndexation(total, total, true);

    // Les vecteurs restent en Float32Array d'une mise à jour à l'autre : les
    // reconvertir depuis le JSON coûtait 1,4 million de conversions à chaque
    // reconstruction, pour un résultat identique.
    const docs = [];
    for (const e of entrees) {
      let v = this.suggVecs.get(e.path);
      if (!v || v.hash !== e.hash) {
        const c = cache[e.path];
        if (!c || !Array.isArray(c.vec)) continue;
        v = { hash: c.hash, vec: Float32Array.from(c.vec) };
        this.suggVecs.set(e.path, v);
      }
      docs.push({ path: e.path, basename: e.basename, titre: e.titre, hash: e.hash, vec: v.vec });
    }
    this.suggIndexSem = { model: modele, docs };
    if (total > 0) this.planifierSauvegardeEmbeddings();
  }

  async reclasserLLM(noteTexte, candidats) {
    // Second garde-fou, côté greffon : même borné, un modèle peut être lent.
    // On rend la main au bout du délai réglé plutôt que d'attendre sans fin.
    const secondes = this.settings.suggRerankDelaiSec || 45;
    return Promise.race([
      this._reclasserLLM(noteTexte, candidats),
      new Promise((r) => setTimeout(() => r(null), secondes * 1000)),
    ]);
  }

  async _reclasserLLM(noteTexte, candidats) {
    try {
      const liste = candidats.map((c) => '- [' + c.basename + '] ' + c.titre).join('\n');
      const avecJustif = this.settings.suggRerankJustif !== false;
      const formatJson = avecJustif
        ? '{"resultats":[{"basename":"<identifiant>","raison":"courte justification en français"}]}'
        : '{"resultats":["<identifiant>", "..."]}';
      const prompt =
        'Tu aides un chercheur qui rédige une note. Voici son texte en cours :\n"""\n'
        + noteTexte.slice(0, 1800)
        + '\n"""\n\nParmi les notes candidates ci-dessous, sélectionne et classe les plus pertinentes pour enrichir sa rédaction (de la plus à la moins pertinente). N\'invente aucune note ; recopie exactement les identifiants entre crochets.\n\n'
        + liste
        + '\n\nRéponds UNIQUEMENT en JSON : ' + formatJson + ', au plus '
        + (this.settings.suggK || 8) + ' éléments.';
      const brut = await this.genererJson(prompt);
      if (!brut) return null;
      console.debug('[Ariane] LLM brut', brut);
      // Analyse tolérante : JSON direct, sinon premier bloc { } ou [ ] trouvé.
      let obj = null;
      try { obj = JSON.parse(brut); } catch (e) {
        const m = brut.match(/[\[{][\s\S]*[\]}]/);
        if (m) { try { obj = JSON.parse(m[0]); } catch (e2) { obj = null; } }
      }
      if (!obj) return null;
      // Trouve le tableau de résultats quelle que soit la clé.
      let arr = null;
      if (Array.isArray(obj)) arr = obj;
      else if (Array.isArray(obj.resultats)) arr = obj.resultats;
      else if (Array.isArray(obj.results)) arr = obj.results;
      else if (Array.isArray(obj.suggestions)) arr = obj.suggestions;
      else for (const v of Object.values(obj)) { if (Array.isArray(v)) { arr = v; break; } }
      if (!arr || !arr.length) return null;
      // Appariement tolérant (crochets, .md, casse) sur clé puis titre.
      const norm = (x) => String(x || '').trim().replace(/^\[+|\]+$/g, '').replace(/\.md$/i, '').trim().toLowerCase();
      const parBase = new Map();
      const parTitre = new Map();
      for (const c of candidats) { parBase.set(norm(c.basename), c); parTitre.set(norm(c.titre), c); }
      const ordonne = [];
      for (const r of arr) {
        let id = '', raison = '';
        if (typeof r === 'string') id = r;
        else if (r && typeof r === 'object') {
          id = r.basename || r.id || r.identifiant || r.nom || r.name || r.cle || r.key || r.titre || r.title || '';
          raison = r.raison || r.reason || r.justification || r.pourquoi || '';
        }
        let c = parBase.get(norm(id)) || parTitre.get(norm(id));
        if (c && !ordonne.includes(c)) { c.raison = String(raison || '').trim(); ordonne.push(c); }
      }
      return ordonne.length ? ordonne : null;
    } catch (e) {
      console.debug('[Ariane] reclassement LLM échoué', e);
      return null;
    }
  }

  // Basenames déjà liés dans un contenu (pour ne pas les re-proposer).
  liensExistants(contenu) {
    const set = new Set();
    const re = /\[\[([^\]|#\n]+)/g;
    let m;
    while ((m = re.exec(contenu)) !== null) set.add(cleDeLien(m[1]));
    return set;
  }

  // Meilleures suggestions pour une note : combine score lexical et sémantique
  // selon le moteur choisi. Renvoie { liste, statut }.
  async suggestionsPour(cheminActif, contenu, dejaLies) {
    if (!this.suggIndex || !this.suggIndex.docs.length) return { liste: [], statut: 'vide' };
    const moteur = this.settings.suggMoteur || 'hybride';
    // Score lexical (toujours calculé)
    const { vec, norme } = vecteurTfIdf(frequenceTermes(tokeniser(contenu)), this.suggIndex.idf);
    const lex = new Map();
    for (const d of this.suggIndex.docs) lex.set(d.path, cosinusTfIdf(vec, norme, d.vec, d.norme));
    // Score sémantique (si disponible)
    let sem = null;
    let statut = 'lexical';
    if (moteur !== 'lexical' && this.suggIndexSem && this.suggIndexSem.docs.length) {
      // La requête change peu d'un recalcul à l'autre : revenir sur une note
      // déjà vue ne doit plus coûter 600 ms d'Ollama.
      const extrait = contenu.slice(0, 4000);
      const empreinte = hacherTexte(extrait);
      this.suggReqCache = this.suggReqCache || new Map();
      let q = this.suggReqCache.get(empreinte);
      if (!q) {
        const qv = await this.encoderTextes([extrait]);
        if (qv && qv[0]) {
          q = normaliserVecteur(qv[0]);
          if (this.suggReqCache.size > 24) this.suggReqCache.clear();
          this.suggReqCache.set(empreinte, q);
        }
      }
      if (q) {
        sem = new Map();
        for (const d of this.suggIndexSem.docs) sem.set(d.path, cosinusVecteurs(q, d.vec));
        statut = moteur === 'semantique' ? 'sémantique' : 'hybride';
      } else {
        statut = 'lexical (repli)';
      }
    }
    const w = typeof this.settings.suggPoidsSemantique === 'number' ? this.settings.suggPoidsSemantique : 0.7;
    const seuil = typeof this.settings.suggSeuil === 'number' ? this.settings.suggSeuil : 0.18;
    const res = [];
    for (const d of this.suggIndex.docs) {
      if (d.path === cheminActif) continue;
      if (dejaLies && dejaLies.has(d.basename)) continue;
      const l = lex.get(d.path) || 0;
      const s = sem ? (sem.get(d.path) || 0) : 0;
      let score;
      if (!sem) score = l;
      else if (moteur === 'semantique') score = s;
      else score = w * s + (1 - w) * l;
      if (score < seuil) continue;
      const dossier = this.dossierCandidatDe(d.path);
      if (!this.dossierRetenu(dossier)) continue;   // filtre du panneau
      res.push({ path: d.path, basename: d.basename, titre: d.titre, score, dossier });
    }
    res.sort((a, b) => b.score - a.score);
    return { liste: res.slice(0, this.settings.suggK || 8), statut };
  }

  vueSuggestions() {
    // Obsidian 1.7 diffère l'instanciation des vues : une feuille peut exister
    // sans que sa vue le soit encore. On ne renvoie qu'une vue réellement prête.
    const feuilles = this.app.workspace.getLeavesOfType('zfa-suggestions');
    for (const f of feuilles) {
      const v = f ? f.view : null;
      if (v && typeof v.rendre === 'function') return v;
    }
    return null;
  }

  // Recalcule et pousse les suggestions vers la vue, si ouverte.
  // forcerRerank : autorise le reclassement LLM (changement de note / manuel).
  // Une vue existe même repliée dans la barre latérale ou cachée derrière un
  // autre onglet. Tant qu'elle n'est pas RÉELLEMENT affichée, tout calcul est
  // perdu — et c'est ce qui faisait tourner Ollama pour rien. Le test porte sur
  // les dimensions du conteneur, ce qui vaut aussi en fenêtre détachée.
  vueSuggestionsVisible() {
    const v = this.vueSuggestions();
    const el = v ? v.containerEl : null;
    if (!el) return null;
    return (el.offsetWidth > 0 || el.offsetHeight > 0) ? v : null;
  }

  async majSuggestions(forcerRerank, ignorerVisibilite) {
    const vue = ignorerVisibilite ? this.vueSuggestions() : this.vueSuggestionsVisible();
    if (!vue) return;
    if (!this.settings.suggActif) { vue.rendre([], null, 'inactif'); return; }
    await this.assurerIndexSuggestions();
    const anc = this.suggAncrage;
    const file = this.app.workspace.getActiveFile();
    let cheminActif = '', requete = null, dejaLies = new Set();
    if (anc) {
      cheminActif = anc.sourcePath || (file ? file.path : '');
      requete = anc.texte;
    } else {
      if (!file || file.extension !== 'md') { if (vue.montrerAncrage) vue.montrerAncrage(null); vue.rendre([], null); return; }
      cheminActif = file.path;
      try { requete = await this.app.vault.cachedRead(file); } catch (e) { requete = ''; }
      dejaLies = this.liensExistants(requete);
    }
    if (vue.montrerAncrage) vue.montrerAncrage(anc ? anc.texte : null);
    const etiq = anc ? { basename: 'Argument sélectionné' } : file;
    const jeton = (this._suggJeton = (this._suggJeton || 0) + 1);
    const { liste, statut } = await this.suggestionsPour(cheminActif, requete, dejaLies);
    if (jeton !== this._suggJeton) return;
    vue.rendre(liste, etiq, (anc ? 'argument · ' : '') + statut);
    const reclasser = (forcerRerank || this.settings.suggRerankAuto === true)
      && this.settings.suggRerank && liste.length
      && (statut === 'sémantique' || statut === 'hybride');
    if (reclasser) {
      vue.marquerReclassement(true);
      const topN = liste.slice(0, this.settings.suggRerankTopN || 12).map((x) => Object.assign({}, x));
      const reclasse = await this.reclasserLLM(requete, topN);
      if (jeton !== this._suggJeton) return;
      vue.marquerReclassement(false);
      if (reclasse && reclasse.length) vue.rendre(reclasse, etiq, (anc ? 'argument · ' : '') + statut + ' + LLM');
      else vue.rendre(liste, etiq, (anc ? 'argument · ' : '') + statut + ' · LLM indisponible');
    }
  }

  // Suggestions ciblées sur un passage sélectionné (clic droit).
  async suggestionsPourArgument(texte) {
    if (!texte || !texte.trim()) return;
    await this.assurerIndexSuggestions();
    const file = this.app.workspace.getActiveFile();
    const cheminActif = file ? file.path : '';
    if ((this.settings.suggArgAffichage || 'panneau') === 'flottant') {
      const { liste } = await this.suggestionsPour(cheminActif, texte, new Set());
      this.afficherFenetreArgument(texte, liste);
    } else {
      this.suggAncrage = { texte, sourcePath: cheminActif };
      await this.ouvrirVueSuggestions();
      this.majSuggestions(true, true);
    }
  }

  libererAncrage() { this.suggAncrage = null; this.majSuggestions(false, true); }

  // Un item de suggestion (cliquable, glissable, aperçu au survol).
  construireItemSugg(container, sug, hoverParent) {
    const styleDe = (d) => this.styleDuDossier(d);
    const item = container.createDiv({ cls: 'zfa-sugg-item' });
    item.setAttribute('draggable', 'true');
    const style = sug.dossier ? styleDe(sug.dossier) : null;
    if (style && style.couleur) { item.addClass('zfa-sugg-colore'); item.style.setProperty('--zfa-sugg-couleur', style.couleur); }
    const tete = item.createDiv({ cls: 'zfa-sugg-tete' });
    if (style && style.icone) { const ic = tete.createSpan({ cls: 'zfa-sugg-icone' }); obsidian.setIcon(ic, style.icone); if (style.couleur) ic.style.color = style.couleur; }
    tete.createSpan({ cls: 'zfa-sugg-lien', text: sug.titre });
    if (sug.raison) item.createDiv({ cls: 'zfa-sugg-raison', text: sug.raison });
    const pct = typeof sug.score === 'number' ? Math.round(sug.score * 100) + '%  ·  ' : '';
    item.createDiv({ cls: 'zfa-sugg-meta', text: pct + sug.basename });
    item.addEventListener('click', () => this.app.workspace.openLinkText(sug.basename, '', false));
    item.addEventListener('mouseover', (event) => this.app.workspace.trigger('hover-link', { event, source: 'zfa-suggestions', hoverParent: hoverParent || this, targetEl: item, linktext: sug.path || sug.basename, sourcePath: '' }));
    item.addEventListener('dragstart', (e) => { if (e.dataTransfer) { e.dataTransfer.setData('text/plain', '[[' + sug.basename + ']]'); e.dataTransfer.effectAllowed = 'copy'; } });
    return item;
  }

  afficherFenetreArgument(texte, suggestions) {
    this.fermerFenetreArgument();
    const el = document.createElement('div');
    el.className = 'zfa-argfen';
    el.style.top = '90px'; el.style.right = '40px';
    const header = el.createDiv({ cls: 'zfa-argfen-header' });
    header.createSpan({ cls: 'zfa-argfen-titre', text: tr("Suggestions pour l'argument") });
    const x = header.createSpan({ cls: 'zfa-argfen-x', text: tr('✕') });
    x.onmousedown = (e) => e.stopPropagation();
    x.onclick = () => this.fermerFenetreArgument();
    const snip = String(texte).replace(/\s+/g, ' ').trim();
    el.createDiv({ cls: 'zfa-argfen-arg', text: snip.slice(0, 160) + (snip.length > 160 ? '…' : '') });
    const liste = el.createDiv({ cls: 'zfa-argfen-liste' });
    if (!suggestions || !suggestions.length) liste.createDiv({ cls: 'zfa-sugg-vide', text: tr('Aucune suggestion pertinente.') });
    else for (const sug of suggestions) this.construireItemSugg(liste, sug, this);
    this.rendreDeplacable(el, header);
    document.body.appendChild(el);
    this.argFenetreEl = el;
  }

  fermerFenetreArgument() { if (this.argFenetreEl) { this.argFenetreEl.remove(); this.argFenetreEl = null; } }

  async ouvrirVueSuggestions() {
    let feuilles = this.app.workspace.getLeavesOfType('zfa-suggestions');
    if (!feuilles.length) {
      const leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: 'zfa-suggestions', active: true });
      feuilles = this.app.workspace.getLeavesOfType('zfa-suggestions');
    }
    if (feuilles.length) this.app.workspace.revealLeaf(feuilles[0]);
    this.majSuggestions();
  }

  //#endregion Ariane · suggestions locales

  //#region Ariane · doublons d'auteurs
  // ── doublons d'auteurs ───────────────────────────────────────────────────

  /* ------------------- Fusion des doublons d'auteurs -------------------- */

  baseSansConflit(n) {
    return n.replace(/\s*-?\s*MacBook Pro de .*/i, '')
            .replace(/\s*\(conflicted copy[^)]*\)/i, '')
            .replace(/\s+\(\d+\)$/, '').trim();
  }

  async detecterDoublonsAuteurs() {
    const dossier = (this.settings.dossierAuteurs || 'Auteurs').replace(/\/+$/, '');
    const noms = this.app.vault.getMarkdownFiles()
      .filter((f) => f.path.startsWith(dossier + '/'))
      .map((f) => f.basename);
    const ensemble = new Set(noms);
    const conflits = [], propres = [];
    for (const n of noms) {
      const base = this.baseSansConflit(n);
      if (base && base !== n && ensemble.has(base)) conflits.push({ nom: n, base });
      else propres.push(n);
    }
    return { conflits, clusters: clustersDoublons(propres), dossier };
  }

  async ouvrirFusionAuteurs() {
    const { conflits, clusters, dossier } = await this.detecterDoublonsAuteurs();
    if (!conflits.length && !clusters.length) { new obsidian.Notice(tr("Aucun doublon d'auteur détecté.")); return; }
    new FusionAuteursModal(this.app, this, conflits, clusters, dossier).open();
  }

  async supprimerConflitsAuteurs(conflits, dossier) {
    for (const c of conflits) {
      const f = this.app.vault.getAbstractFileByPath(dossier + '/' + c.nom + '.md');
      if (f instanceof obsidian.TFile) await this.app.fileManager.trashFile(f);
    }
  }

  async fusionnerCluster(canon, variantes, dossier) {
    const fCanon = this.app.vault.getAbstractFileByPath(dossier + '/' + canon + '.md');
    if (fCanon instanceof obsidian.TFile) {
      await this.app.fileManager.processFrontMatter(fCanon, (fm) => {
        const al = new Set(Array.isArray(fm.aliases) ? fm.aliases : (fm.aliases ? [fm.aliases] : []));
        for (const v of variantes) al.add(v);
        fm.aliases = [...al];
      });
    }
    // Redirige les liens partout dans le coffre.
    const repl = [];
    for (const v of variantes) { repl.push(['[[' + v + ']]', '[[' + canon + ']]']); repl.push(['[[' + v + '|', '[[' + canon + '|']); }
    for (const f of this.app.vault.getMarkdownFiles()) {
      let contenu = await this.app.vault.read(f); const orig = contenu;
      for (const [a, b] of repl) if (contenu.includes(a)) contenu = contenu.split(a).join(b);
      if (contenu !== orig) await this.app.vault.modify(f, contenu);
    }
    // Supprime les variantes.
    for (const v of variantes) {
      const f = this.app.vault.getAbstractFileByPath(dossier + '/' + v + '.md');
      if (f instanceof obsidian.TFile) await this.app.fileManager.trashFile(f);
    }
  }

  //#endregion Ariane · doublons d'auteurs

  //#region Ariane · schémas draw.io
  // ── schémas draw.io ──────────────────────────────────────────────────────

  /* ----------------------- Module Cartes (Canvas) ------------------------ */

  vocabCartes() {
    return {
      relations: this.settings.cartesRelations || [],
      types: this.settings.cartesTypesBlocs || [],
      strict: !!this.settings.cartesStrict,
    };
  }

  // Fichier de schéma draw.io actif (.drawio.svg ou .drawio).
  estSchemaDrawio(f) {
    return !!f && (/\.drawio\.svg$/i.test(f.path) || f.extension === 'drawio');
  }

  fichierSchemaActif() {
    const f = this.app.workspace.getActiveFile();
    return this.estSchemaDrawio(f) ? f : null;
  }

  // Graphe d'un schéma draw.io : toutes les pages fusionnées.
  async grapheSchema(file) {
    let contenu = '';
    try { contenu = await this.app.vault.read(file); } catch (e) { return { nodes: [], edges: [] }; }
    const pages = pagesDepuisDrawio(contenu);
    const nodes = [], edges = [];
    pages.forEach((pg, i) => {
      const pref = pages.length > 1 ? 'p' + i + ':' : '';
      for (const n of pg.graphe.nodes) nodes.push(Object.assign({}, n, { id: pref + n.id, page: pg.nom }));
      for (const e of pg.graphe.edges) edges.push(Object.assign({}, e, { id: pref + e.id, fromNode: pref + e.fromNode, toNode: pref + e.toNode, page: pg.nom }));
    });
    // Étiquettes implicites : voir propagerEtiquettes.
    const brut = { nodes, edges, pages: pages.map((x) => x.nom) };
    return this.settings.schemaPropagerEtiquettes === false ? brut : propagerEtiquettes(brut);
  }

  async validerCarte() {
    const schema = this.fichierSchemaActif();
    if (!schema) { new obsidian.Notice(tr('Ouvrez un schéma draw.io (.drawio.svg).')); return; }
    const g = await this.grapheSchema(schema);
    new RapportCarteModal(this.app, schema.basename, analyserCarte(g, this.vocabCartes(), {})).open();
  }

  /* ------------------------- Verrou d'édition --------------------------- */

  // Les notes portant « locked: true » deviennent non modifiables. Le verrou
  // est purement visuel (contenteditable) : le fichier reste accessible aux
  // outils, notamment à la synchronisation des schémas.
  installerVerrouLecture() {
    const appliquer = () => this.appliquerVerrouLecture();
    this.registerEvent(this.app.workspace.on('file-open', appliquer));
    this.registerEvent(this.app.workspace.on('active-leaf-change', appliquer));
    this.registerEvent(this.app.workspace.on('layout-change', appliquer));
    this.registerEvent(this.app.metadataCache.on('resolved', appliquer));
    this.app.workspace.onLayoutReady(appliquer);
  }

  appliquerVerrouLecture() {
    if (this.settings.verrouLecture === false) return;
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const vue = leaf ? leaf.view : null;
      if (!vue || !vue.file || !vue.contentEl) continue;
      const fm = (this.app.metadataCache.getFileCache(vue.file) || {}).frontmatter;
      const verrou = !!(fm && (fm.locked === true || fm['zotflow-locked'] === true));
      const zone = vue.contentEl.querySelector('.cm-content');
      if (zone) zone.setAttribute('contenteditable', verrou ? 'false' : 'true');
      vue.contentEl.toggleClass('zfa-verrouillee', verrou);
    }
  }

  // Note associée à un schéma : d'abord par la propriété « graphique »,
  // sinon par la référence (nom de note = préfixe du nom du schéma).
  noteDeSchema(file) {
    const base = file.basename.replace(/\.drawio$/i, '');
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (!fm || !fm.graphique) continue;
      const cible = String(fm.graphique).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
      if (cible === base + '.drawio.svg' || cible === base || cible === file.path) return f;
    }
    // À défaut, par la référence : « FS007 - Contingence » -> note « FS007 ».
    // Les schémas peuvent vivre dans un sous-dossier (ex. « Graphiques ») et
    // les notes dans le dossier parent : on élargit donc la recherche, du plus
    // proche au plus lointain.
    const sep = base.match(/^(.*?)\s+-\s+/);
    const reference = (sep ? sep[1] : base).trim();
    if (!reference) return null;

    const dossierSchema = file.parent ? file.parent.path : '';
    const dossierParent = file.parent && file.parent.parent ? file.parent.parent.path : '';
    const homonymes = this.app.vault.getMarkdownFiles().filter((f) => f.basename === reference);
    if (!homonymes.length) return null;

    const dans = (d) => homonymes.find((f) => (f.parent ? f.parent.path : '') === d);
    return dans(dossierSchema) || dans(dossierParent) || homonymes[0];
  }

  // Recopie l'extrait lisible du schéma dans sa note. Renvoie true si écrit.
  async synchroniserSchema(file, silencieux) {
    if (!this.estSchemaDrawio(file)) return false;
    const note = this.noteDeSchema(file);
    if (!note) {
      if (!silencieux) new obsidian.Notice(tr('Aucune note associée à « ') + file.basename + ' ».');
      return false;
    }
    const graphe = await this.grapheSchema(file);
    const base = file.basename.replace(/\.drawio$/i, '');
    const sep = base.match(/^.*?\s+-\s+(.*)$/);
    const extrait = extraitSchema(graphe, sep ? sep[1].trim() : base);
    const actuel = await this.app.vault.read(note);
    const nouveau = injecterExtrait(actuel, extrait);
    if (nouveau === actuel) return false;
    await this.ecrire(note.path, nouveau, note);
    if (!silencieux) new obsidian.Notice(tr('Note « ') + note.basename + ' » synchronisée.');
    return true;
  }

  async synchroniserTousSchemas() {
    const schemas = this.app.vault.getFiles().filter((f) => this.estSchemaDrawio(f));
    if (!schemas.length) { new obsidian.Notice(tr('Aucun schéma draw.io trouvé.')); return; }
    const notice = new obsidian.Notice(tr('Synchronisation des schémas…'), 0);
    let majes = 0, sansNote = 0;
    try {
      for (const f of schemas) {
        if (!this.noteDeSchema(f)) { sansNote++; continue; }
        if (await this.synchroniserSchema(f, true)) majes++;
      }
    } finally { notice.hide(); }
    new obsidian.Notice(tr('Schémas : ') + majes + ' note(s) mise(s) à jour sur ' + schemas.length
      + (sansNote ? ', ' + sansNote + ' sans note associée.' : '.')
    );
  }

  // Agrège toutes les cartes du coffre en un graphe unique.
  async indexerCartes() {
    const vocab = this.vocabCartes();
    const noeuds = new Map();  // texte -> { texte, type, cartes:Set }
    const liens = [];
    for (const f of this.app.vault.getFiles()) {
      if (!this.estSchemaDrawio(f)) continue;
      const data = await this.grapheSchema(f);
      const a = analyserCarte(data, vocab, { blocs: {} });
      const parId = {};
      for (const b of a.blocs) {
        parId[b.id] = b.texte;
        if (!b.texte) continue;
        if (!noeuds.has(b.texte)) noeuds.set(b.texte, { texte: b.texte, type: b.type, cartes: new Set() });
        const n = noeuds.get(b.texte);
        n.cartes.add(f.basename);
        if (!n.type && b.type) n.type = b.type;
      }
      for (const l of a.liens) {
        if (!l.deTexte || !l.versTexte) continue;
        liens.push({ de: l.deTexte, vers: l.versTexte, etiquette: l.etiquette, relation: l.relation, carte: f.basename });
      }
    }
    return { noeuds: [...noeuds.values()], liens };
  }

  async interrogerGraphe() {
    const notice = new obsidian.Notice(tr('Indexation des cartes…'), 0);
    let g;
    try { g = await this.indexerCartes(); } finally { notice.hide(); }
    if (!g.noeuds.length) { new obsidian.Notice(tr('Aucun schéma draw.io trouvé (.drawio.svg).')); return; }
    const choix = g.noeuds
      .sort((a, b) => a.texte.localeCompare(b.texte))
      .map((n) => ({ nom: n.texte + (n.cartes.size > 1 ? '  (' + n.cartes.size + ' cartes)' : ''), valeur: n.texte }));
    new ChoixListeModal(this.app, 'Concept (' + g.noeuds.length + ')', choix, (c) => {
      const sortants = g.liens.filter((l) => l.de === c.valeur);
      const entrants = g.liens.filter((l) => l.vers === c.valeur);
      new VoisinageModal(this.app, c.valeur, sortants, entrants, this).open();
    }).open();
  }

  //#endregion Ariane · schémas draw.io

  //#region Ariane · export Word / Pandoc
  // ── export Word / Pandoc ─────────────────────────────────────────────────

  /* ------------- Export Word avec citations Zotero vivantes -------------- */

  cheminAbsoluVault(rel) {
    const ad = this.app.vault.adapter;
    if (typeof ad.getFullPath === 'function') return ad.getFullPath(rel);
    return require('path').join(ad.basePath || '', rel);
  }

  cheminScriptPandoc(nom) {
    return require('path').join(this.cheminAbsoluVault(this.manifest.dir), 'pandoc', nom);
  }

  // Applique les styles du modèle Word en remappant les identifiants pandoc.
  async remapperStyles(outPath, env) {
    const map = this.settings.exportMapStyles || {};
    if (!Object.values(map).some((v) => v && String(v).trim())) return;
    const m = Object.assign({}, map);
    if (m.BodyText) m.FirstParagraph = m.BodyText;
    const script = this.cheminScriptPandoc('remap-styles.py');
    try {
      await new Promise((resolve, reject) => {
        require('child_process').execFile('python3', [script, '--remap', outPath, JSON.stringify(m)],
          { env: env || process.env },
          (e, so, se) => e ? reject(new Error(String(se || e.message || e).slice(0, 300))) : resolve());
      });
    } catch (e) {
      new obsidian.Notice(tr('Styles du modèle non appliqués : ') + (e && e.message ? e.message : e));
      console.error('[Ariane] remap styles', e);
    }
  }

  // Liste les styles du modèle Word dans une fenêtre.
  async listerStylesModele() {
    const modele = this.settings.exportModeleWord;
    if (!modele || !require('fs').existsSync(modele)) { new obsidian.Notice(tr('Renseignez un modèle Word valide dans les réglages.')); return; }
    const script = this.cheminScriptPandoc('remap-styles.py');
    const env = Object.assign({}, process.env, { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '') });
    try {
      const out = await new Promise((resolve, reject) => {
        require('child_process').execFile('python3', [script, '--list', modele], { env, maxBuffer: 8 * 1024 * 1024 },
          (e, so, se) => e ? reject(new Error(String(se || e.message || e).slice(0, 300))) : resolve(so));
      });
      new StylesModeleModal(this.app, JSON.parse(out)).open();
    } catch (e) {
      new obsidian.Notice(tr('Lecture des styles — échec : ') + (e && e.message ? e.message : e));
    }
  }

  citekeyDepuisLien(v) {
    return String(v || '').replace(/^\[\[/, '').replace(/\]\]$/, '').replace(/\|.*$/, '').replace(/#.*/, '').replace(/^@/, '').trim();
  }

  cibleDepuisLien(v) {
    return String(v || '').replace(/^\[\[/, '').replace(/\]\]$/, '').replace(/\|.*$/, '').replace(/#.*/, '').trim();
  }

  // Résout un lien [[annotation]] en un tableau d'entrées de citation Pandoc,
  // ou null. Gère l'apparat « cité dans » pour les références citées distinctes
  // de la source et absentes de Zotero.
  resoudreCitation(cible, sourcePath, ctx) {
    ctx = ctx || {};
    const dest = this.app.metadataCache.getFirstLinkpathDest(cible, sourcePath || '');
    if (!dest) return null;
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    const src = fm['zotflow-source'];
    if (!src) {
      if (fm.citationKey) return ['@' + String(fm.citationKey).trim()];
      if (dest.basename.startsWith('@')) return ['@' + dest.basename.slice(1)];
      return null;
    }
    const srcKey = this.citekeyDepuisLien(src);
    if (!srcKey) return null;
    const page = fm.page != null ? String(fm.page).replace(/^["']|["']$/g, '').trim() : '';
    // Entrée structurée : le regroupement se fait plus tard, à l'échelle de la
    // grappe, où l'on voit toutes les annotations d'une même source.
    const srcEntry = { cle: srcKey, page };
    const pages = fm['références-pages'] || {};
    let refs = fm['références-citées'];
    refs = Array.isArray(refs) ? refs : (refs ? [refs] : []);
    const citeDansActif = this.settings.exportCiteDansActif !== false;
    const entrees = [];
    const rapportes = [];                          // travaux rapportés, absents de Zotero
    for (const rv of refs) {
      const cibleRef = this.cibleDepuisLien(rv);
      if (!cibleRef) continue;
      const ck = this.citekeyDepuisLien(rv);
      if (ck === srcKey) continue;                 // la référence est la source : rien de plus
      const pc = String(pages[cibleRef] != null ? pages[cibleRef] : '').replace(/^["']|["']$/g, '').trim();
      const locRef = pc ? ', p. ' + pc : '';       // page propre à la référence citée
      if (/^@/.test(cibleRef)) { entrees.push({ cle: ck, page: pc }); continue; } // déjà dans Zotero -> directe
      // référence en attente : présente malgré tout dans Zotero ?
      let base = null;
      if (ctx.index) {
        const ref = refDepuisNomAttente(cibleRef);
        base = ref ? trouverSourceZotero(ref, ctx.index) : null;
      }
      if (base) { entrees.push({ cle: base.replace(/^@/, ''), page: pc }); continue; } // citation directe
      // Travail rapporté, introuvable dans Zotero.
      if (citeDansActif) rapportes.push(cibleRef + locRef);
      else entrees.push({ cle: srcKey, page });    // on ne cite que la source consultée
    }
    // Les travaux rapportés d'une même source tiennent en UNE entrée. Huit
    // entrées distinctes renvoyant à la même source donnaient huit citations
    // que Zotero regroupait en effaçant le nom de l'auteur : « … cité dans
    // Raizada & Sinha, 2025, p. 1, …, cité dans 2025, p. 1, … ».
    //
    // Ils sont énumérés à la française — virgules, puis « et » — et non par des
    // points-virgules : le « ; » reste ainsi réservé à la séparation des
    // citations entre elles, si bien que le lecteur voit où le groupe finit.
    if (rapportes.length) {
      entrees.push({ cle: srcKey, page, travaux: rapportes });
    }
    return entrees.length ? entrees : [srcEntry];
  }

  // Garde-fou : le modèle se retouche dans Word, et Word y scinde les
  // jetons, quand ce n'est pas une faute de frappe qui les rend muets. Cette
  // commande dit ce que le modèle porte, et ce qui cloche, avant d'exporter.
  async verifierModeleWord() {
    const fs = require('fs');
    const script = this.cheminScriptPandoc('finition.py');
    const modele = this.settings.exportModeleWord || '';
    if (!fs.existsSync(script)) { new obsidian.Notice(tr('finition.py introuvable.')); return; }
    if (!modele || !fs.existsSync(modele)) { new obsidian.Notice(tr('Modèle Word introuvable : ') + modele); return; }
    try {
      const sortie = await new Promise((resolve) => {
        require('child_process').execFile('python3', [script, '--verifier', modele],
          { maxBuffer: 4 * 1024 * 1024 },
          (e, so, se) => resolve(String(so || '') + String(se || '')));
      });
      console.log('[Ariane] modèle —\n' + sortie);
      const alertes = sortie.split('\n').filter((l) => l.startsWith('ATTENTION'));
      new obsidian.Notice(alertes.length
        ? 'Modèle Word — ' + alertes.length + ' anomalie(s) :\n' + alertes.join('\n')
        : 'Modèle Word : aucune anomalie.\n' + sortie.trim(), alertes.length ? 0 : 12000);
    } catch (e) {
      new obsidian.Notice(tr('Vérification du modèle — échec : ') + (e && e.message ? e.message : e));
    }
  }

  async exporterWordZotero() {
    // L'export appelle pandoc et python par child_process : rien de tout cela
    // n'existe sur mobile. Le greffon se charge malgré tout, tous les modules
    // Node étant requis à l'intérieur des fonctions, mais mieux vaut un
    // message clair qu'une exception non rattrapée.
    if (obsidian.Platform && !obsidian.Platform.isDesktopApp) {
      new obsidian.Notice(tr("L'export Word demande pandoc et n'est possible que sur ordinateur."));
      return;
    }
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') { new obsidian.Notice(tr('Ouvrez la note à exporter.')); return; }
    const contenu = await this.app.vault.read(file);
    const ctx = { index: this.construireIndexZotero() };
    const resoudre = (c) => this.resoudreCitation(c, file.path, ctx);
    // Les notes anciennes portent encore des notes de bas de page ; les
    // récentes des citations en ligne. Les deux passes se complètent.
    const citeDans = this.settings.citeDans || ', cité dans ';
    let md = footnotesVersCitations(contenu, resoudre, citeDans);
    md = preparerMarkdownExport(md, resoudre, {
      citeDans,
      styleEncadre: this.settings.exportStyleEncadre || 'Items de réflexion',
      insecables: this.settings.exportInsecables !== false,
      decalerTitres: this.settings.exportDecalerTitres !== false,
      retirerNumerotation: this.settings.exportRetirerNumerotation !== false,
    });
    // La bibliographie est ajoutée APRÈS la préparation, qui supprime celle
    // d'Ariane : c'est Zotero qui produira la sienne à cet emplacement.
    if (this.settings.exportBibliographie) md += '\n\n# Bibliographie\n';
    // Active les citations « auteur dans le texte » pour les liens [[@clé]] du corps.
    md = '---\nzotero:\n  author-in-text: true\n---\n\n' + md;
    const fs = require('fs'), os = require('os'), pathMod = require('path');
    const tmp = pathMod.join(os.tmpdir(), 'ariane-export-' + Date.now() + '.md');
    fs.writeFileSync(tmp, md, 'utf8');
    await this.assurerDossier(this.settings.exportDossier);
    const outPath = pathMod.join(this.cheminAbsoluVault(this.settings.exportDossier), file.basename + '.docx');
    const notice = new obsidian.Notice(tr('Export Word (Zotero)…'), 0);
    try {
      const dirFiltre = pathMod.dirname(this.settings.exportFiltreLua);
      const env = Object.assign({}, process.env, {
        PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || ''),
        LUA_PATH: dirFiltre + '/?.lua;' + dirFiltre + '/?/init.lua;;',
      });
      const args = ['--lua-filter', this.settings.exportFiltreLua];
      const modele = this.settings.exportModeleWord;
      if (modele && fs.existsSync(modele)) args.push('--reference-doc', modele);
      args.push(tmp, '-s', '-o', outPath);
      await new Promise((resolve, reject) => {
        require('child_process').execFile(
          this.settings.exportPandocBin || 'pandoc', args,
          { maxBuffer: 64 * 1024 * 1024, env, cwd: dirFiltre },
          (e, so, se) => e ? reject(new Error(String(se || e.message || e).slice(0, 400))) : resolve());
      });
      await this.remapperStyles(outPath, env);
      await this.finirDocument(outPath, env, file);
      notice.hide();
      new obsidian.Notice(tr('Export terminé : ') + file.basename + '.docx (dans « ' + this.settings.exportDossier + ' »).');
    } catch (e) {
      notice.hide();
      new obsidian.Notice(tr('Export — échec : ') + (e && e.message ? e.message : e) + ' — pandoc installé ? Zotero lancé ?');
      console.error('[Ariane] export word', e);
    } finally {
      try { fs.unlinkSync(tmp); } catch (e) { /* */ }
    }
  }

  // Finition du .docx : en-têtes du modèle rattachés, en-tête de première page
  // alimenté par les propriétés de la note, tableaux habillés. Pandoc écrit sa
  // propre section et laisse les en-têtes du modèle orphelins dans le fichier.
  async finirDocument(chemin, env, fichier) {
    if (this.settings.exportEntetes === false) return;
    const fs = require('fs'), os = require('os'), pathMod = require('path');
    const script = this.cheminScriptPandoc('finition.py');
    if (!fs.existsSync(script)) return;

    const fm = ((this.app.metadataCache.getFileCache(fichier) || {}).frontmatter) || {};
    const date = this.dateDeNote(fichier, fm);

    // Le greffon ne décide plus de rien : il dit seulement ce que vaut chaque
    // jeton. C'est le MODÈLE qui porte les jetons, donc qui décide où va
    // quelle donnée, et laquelle apparaît. Voir la légende en fin de modèle.
    // Les liens d'Obsidian n'ont pas leur place dans un document Word : sans
    // ce nettoyage, une propriété sortait « [[Chabane Mazri]], [[Lionel
    // Garreau]] », crochets compris.
    const lisible = (x) => (this.settings.exportNettoyerLiens === false ? String(x) : valeurLisible(x));

    const valeurs = {
      titre: lisible((Array.isArray(fm.aliases) && fm.aliases[0]) || fichier.basename),
      dossier: this.dossierDeNote(fichier),
      date: this.formaterDate(date, 'court'),
      'date:long': this.formaterDate(date, 'long'),
      'réf': this.referenceDeNote(fichier, fm),
    };

    // Toutes les propriétés de la note, à double titre : nommément, pour un
    // {{propriété:clé}} du modèle, et en liste, pour ses rangs répétables. La
    // finition écarte de la liste celles que le modèle place déjà ailleurs.
    const structurelles = new Set(['position', 'aliases', 'tags', 'cssclasses']);
    const proprietes = [];
    for (const [cle, val] of Object.entries(fm)) {
      if (val == null || val === '') continue;
      const texte = lisible(Array.isArray(val) ? val.map(lisible).join(', ') : val);
      if (!texte.trim()) continue;
      valeurs['propriété:' + cle] = texte;
      if (!structurelles.has(String(cle).toLowerCase())) {
        proprietes.push([this.libellePropriete(cle), texte]);
      }
    }

    const ordres = pathMod.join(os.tmpdir(), 'ariane-finition-' + Date.now() + '.json');
    fs.writeFileSync(ordres, JSON.stringify({
      valeurs,
      proprietes,
      // Le modèle porte les préférences Zotero (ZOTERO_PREF_1, _2) que pandoc
      // n'écrit pas pour le .docx : sans elles, Word ne reconnaît pas un
      // document Zotero et refuse d'actualiser les citations. Il porte aussi
      // la section et le gabarit du tableau des propriétés.
      modele: this.settings.exportModeleWord || '',
      // Le champ ZOTERO_BIBL, que le filtre ne pose que pour l'ODT.
      bibliographie: this.settings.exportBibliographie !== false,
      styleEnteteTableau: this.settings.exportStyleEnteteTableau || 'Titre de tableau',
      styleCelluleTableau: this.settings.exportStyleCelluleTableau || 'Champ de tableau',
      // Les styles que pandoc invente pour le corps de texte sont ramenés à
      // ceux du modèle. La finition résout les noms en identifiants.
      styles: this.settings.exportMapStyles || {},
    }), 'utf8');

    try {
      const sortie = await new Promise((resolve, reject) => {
        require('child_process').execFile('python3', [script, chemin, ordres],
          { maxBuffer: 32 * 1024 * 1024, env },
          (e, so, se) => (e ? reject(new Error(String(se || e.message).slice(0, 400))) : resolve(String(so || ''))));
      });
      console.log('[Ariane] finition —', sortie.trim());
      // Rien ne doit se dérégler en silence : ce que la finition signale est
      // remonté à l'utilisateur, l'export ayant tout de même abouti.
      const alertes = sortie.split('\n').filter((l) => l.startsWith('ATTENTION'));
      if (alertes.length) {
        new obsidian.Notice(tr('Modèle Word — ') + alertes.length + ' anomalie(s) :\n'
          + alertes.join('\n') + '\n(commande « Vérifier le modèle Word » pour le détail)', 0);
      }
      try { fs.unlinkSync(chemin + '.avant-finition'); } catch (e) { /* */ }
    } catch (e) {
      new obsidian.Notice(tr('Finition non appliquée : ') + (e && e.message ? e.message : e), 10000);
      console.error('[Ariane] finition', e);
      try {
        if (fs.existsSync(chemin + '.avant-finition')) {
          fs.copyFileSync(chemin + '.avant-finition', chemin);
          fs.unlinkSync(chemin + '.avant-finition');
        }
      } catch (err) { /* on garde ce qu'on a */ }
    } finally {
      try { fs.unlinkSync(ordres); } catch (e) { /* */ }
    }
  }

  //#endregion Ariane · export Word / Pandoc

  //#region Ariane · notes & citations — rendu
  // ── notes & citations — rendu ────────────────────────────────────────────

  // La référence de la note pour l'en-tête principal. On cherche, dans
  // l'ordre, les propriétés que l'utilisateur a désignées ; à défaut, et s'il
  // l'a demandé, le nom du fichier fait office de référence — c'est le cas des
  // notes nommées « NP-260826-07 » ou « CR-260826-07 ».
  referenceDeNote(fichier, fm) {
    const noms = String(this.settings.exportProprieteReference || 'ref')
      .split(',').map((x) => x.trim()).filter(Boolean);
    const sansAccent = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const table = new Map();
    for (const [k, v] of Object.entries(fm || {})) table.set(sansAccent(k).replace(/\.$/, ''), v);
    for (const n of noms) {
      const v = table.get(sansAccent(n).replace(/\.$/, ''));
      if (v != null && String(v).trim()) {
        return valeurLisible(Array.isArray(v) ? v.join(', ') : v);
      }
    }
    return this.settings.exportRefDepuisNom === false ? '' : fichier.basename;
  }

  // Le dossier du coffre où vit la note, sans son numéro de rangement :
  // « 2 - Notes conceptuelles » -> « Notes conceptuelles ». C'est ce que le
  // gabarit de l'en-tête principal appelle « Type ».
  dossierDeNote(fichier) {
    const parent = fichier.parent && fichier.parent.name ? fichier.parent.name : '';
    return parent.replace(/^\s*\d+\s*-\s*/, '').trim();
  }

  // Date de création : la propriété « date » de la note si elle est lisible,
  // sinon la date de création du fichier.
  dateDeNote(fichier, fm) {
    const brute = fm && fm.date ? String(fm.date) : '';
    const d = brute ? new Date(brute) : null;
    if (d && !isNaN(d.getTime())) return d;
    const ctime = fichier.stat && fichier.stat.ctime;
    return ctime ? new Date(ctime) : new Date();
  }

  // Deux formats, ceux du modèle : « 02/07/2026 » dans l'en-tête principal,
  // « Jeudi 02 juillet 2026 » dans le tableau des propriétés.
  formaterDate(d, forme) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    if (forme === 'court') {
      return d.toLocaleDateString('fr-FR',
        { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    const t = d.toLocaleDateString('fr-FR',
      { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // « date-creation » -> « Date creation ». Les noms techniques restent lisibles.
  libellePropriete(cle) {
    const t = String(cle).replace(/[-_]+/g, ' ').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Infobulle dans l'explorateur : le total inscrit dans la note.
  installerInfobulleTemps() {
    if (!this.settings.tempsInfobulleExplorateur) return;
    this.registerDomEvent(document, 'mouseover', (e) => {
      const cible = e && e.target;
      if (!cible || typeof cible.closest !== 'function') return;
      const titre = cible.closest('.nav-file-title');
      if (!titre) return;
      const chemin = titre.getAttribute('data-path');
      if (!chemin || !chemin.endsWith('.md')) return;
      const minutes = this.tempsTotalDe(chemin)
        + ((this._tempsSecondes && this._tempsSecondes.get(chemin)) || 0) / 60;
      if (minutes < 1) return;
      titre.setAttribute('title', 'Temps passé : ' + dureeLisible(minutes));
    }, { capture: true });
  }

  /* Compteur d'appels dans l'explorateur retiré : voir la vue
     « Ordre et appels » de la base ZotFlow. */

  // Titre (alias) d'une annotation ciblée par un lien, ou '' si ce n'en
  // est pas une.
  titreAnnotationCiblee(cheminLien, sourcePath, pourAparte) {
    if (!cheminLien) return '';
    const dest = this.app.metadataCache.getFirstLinkpathDest(cheminLien, sourcePath || '');
    if (!dest) return '';
    const cache = this.app.metadataCache.getFileCache(dest);
    const fm = cache ? cache.frontmatter : null;
    if (!fm) return '';
    // Cibles éligibles à l'aparté : annotations ET notes conceptuelles.
    const estAnnotation = dest.path.startsWith(this.dossierA + '/') && fm['zotflow-anno-key'] !== undefined;
    // Hors annotations, c'est la famille de la note qui dit si l'aparté
    // s'applique — plus aucun type de note n'est nommé dans le code.
    const famille = estAnnotation ? null : this.familleDuChemin(dest.path, dest.basename);
    if (!estAnnotation && !famille) return '';
    // Filtrage par type, uniquement pour l'aparté sur les liens.
    if (pourAparte) {
      if (estAnnotation && !this.settings.aparteAnnotations) return '';
      if (famille && !famille.aparte) return '';
    }
    const al = fm.aliases;
    if (Array.isArray(al) && al.length) return String(al[0]);
    if (typeof al === 'string') return al;
    return '';
  }

  // Post-traitement (lecture) : ajoute « (Titre) » discret après un lien
  // d'annotation qui affiche la clé. N'écrit rien dans les notes.
  enrichirLiensAnnotation(el, ctx) {
    if (!this.settings.aliasSurLiens) return;
    const liens = el.querySelectorAll('a.internal-link');
    liens.forEach((a) => {
      const suivant = a.nextElementSibling;
      if (suivant && suivant.classList && suivant.classList.contains('zfa-lien-alias')) return;
      const cible = a.getAttribute('data-href') || a.getAttribute('href') || '';
      if (!cible || cible.includes('#')) return;
      // Alias manuel présent ([[cible|affiché]]) -> pas d'aparté auto.
      const affiche = (a.textContent || '').trim();
      const base = cible.split('/').pop().replace(/\.md$/, '');
      if (affiche && affiche !== cible && affiche !== base) return;
      const titre = this.titreAnnotationCiblee(cible, ctx && ctx.sourcePath, true);
      if (!titre) return;
      // On n'ajoute rien si le lien affiche déjà le titre.
      if (affiche === titre) return;
      const span = document.createElement('span');
      span.className = 'zfa-lien-alias';
      span.textContent = this.formatAparte(titre, cible);
      a.insertAdjacentElement('afterend', span);
    });
  }

  // Explorateur de fichiers : ajoute l'alias (titre) à côté du nom des
  // annotations et notes conceptuelles, dont le nom de fichier est cryptique.
  installerDecorateurExplorateur() {
    const planifier = () => this.antirebond('explorateur', () => this.decorerExplorateur(), 200);
    this.registerEvent(this.app.workspace.on('layout-change', planifier));
    this.registerEvent(this.app.workspace.on('active-leaf-change', planifier));
    this.registerEvent(this.app.metadataCache.on('resolved', planifier));
    const cont = document.querySelector('.nav-files-container');
    if (cont && typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver(() => planifier());
      obs.observe(cont, { childList: true, subtree: true });
      this.register(() => obs.disconnect());
    }
    planifier();
  }

  decorerExplorateur() {
    const dossiers = this.dossiersDeFamille('alias');
    // Dossiers en police à largeur fixe : appartenance directe uniquement,
    // un sous-dossier n'hérite pas du réglage de son parent.
    const dossiersMono = new Set(this.dossiersDeFamille('monospace'));
    document.querySelectorAll('.nav-file-title').forEach((el) => {
      const ancien = el.querySelector('.zfa-explorer-alias');
      const path = el.getAttribute('data-path') || '';
      // Police à largeur fixe si la note est directement dans un dossier listé.
      const i = path.lastIndexOf('/');
      const dossierNote = i === -1 ? '' : path.slice(0, i);
      el.classList.toggle('zfa-nom-mono', !!(path.endsWith('.md') && dossiersMono.has(dossierNote)));
      if (!path.endsWith('.md') || !dossiers.some((d) => path === d + '.md' || path.startsWith(d + '/'))) {
        if (ancien) ancien.remove();
        return;
      }
      const alias = this.aliasDeFichier(path);
      if (!alias) { if (ancien) ancien.remove(); return; }
      if (ancien) { if (ancien.textContent !== alias) ancien.textContent = alias; return; }
      el.createSpan({ cls: 'zfa-explorer-alias', text: alias });
    });
  }

  // Premier alias du frontmatter d'un fichier, quel que soit son type.
  aliasDeFichier(path) {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!f) return '';
    const cache = this.app.metadataCache.getFileCache(f);
    const al = cache && cache.frontmatter ? cache.frontmatter.aliases : null;
    if (Array.isArray(al) && al.length) return String(al[0]);
    if (typeof al === 'string' && al) return al;
    return '';
  }

  formaterAuteurs(familles, annee) {
    familles = (familles || []).filter(Boolean);
    let court = '';
    if (familles.length === 1) court = familles[0];
    else if (familles.length === 2) court = familles[0] + ' et ' + familles[1];
    else if (familles.length >= 3) court = familles[0] + ' et al.';
    return { court, complet: familles.join(', '), annee: annee || '' };
  }

  // Auteurs déduits d'un lien de référence : via les « creators » si la
  // cible en a (source Zotero), sinon via l'analyse du nom « Auteur, Année ».
  auteursDepuisReference(lien, ctx) {
    const cible = String(lien)
      .replace(/^\[\[|\]\]$/g, '')
      .replace(/\|.*$/, '')
      .replace(/#.*$/, '')
      .trim();
    if (!cible) return null;
    const dest = this.app.metadataCache.getFirstLinkpathDest(cible, ctx || '');
    if (dest) {
      const cache = this.app.metadataCache.getFileCache(dest);
      const fm = cache ? cache.frontmatter : null;
      if (fm && fm.creators) {
        const creators = (Array.isArray(fm.creators) ? fm.creators : [fm.creators]).map(sansLien);
        const familles = creators
          .map((c) => {
            const s = String(c).trim();
            return s.includes(',') ? s.split(',')[0].trim() : s.split(/\s+/).pop();
          })
          .filter(Boolean);
        const an = String(fm.year || fm.date || '').match(/\d{4}/);
        return this.formaterAuteurs(familles, an ? an[0] : '');
      }
    }
    // Pas de creators : la cible est du type « Auteur(s), Année ».
    const ref = parseNomReference(cible, this.settings);
    if (ref) return { court: ref.auteurComplet, complet: ref.auteurComplet, annee: ref.annee };
    return null;
  }

  // Auteurs de l'annotation : d'abord la référence citée, puis la source.
  auteursAnnotation(cle) {
    const anno = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    if (!anno) return null;
    const cache = this.app.metadataCache.getFileCache(anno);
    const fmA = cache ? cache.frontmatter : null;
    if (!fmA) return null;

    // 1) Référence(s) citée(s) en priorité.
    let refs = fmA['références-citées'];
    if (refs) {
      if (!Array.isArray(refs)) refs = [refs];
      if (refs.length) {
        const r = this.auteursDepuisReference(refs[0], anno.path);
        if (r && r.court) return r;
      }
    }
    // 2) Repli : la source de l'annotation.
    const src = String(fmA['zotflow-source'] || '')
      .replace(/^\[\[|\]\]$/g, '')
      .replace(/\|.*$/, '')
      .trim();
    if (src) {
      const r = this.auteursDepuisReference('[[' + src + ']]', anno.path);
      if (r && r.court) return r;
    }
    return null;
  }

  // Texte de l'aparté, à partir du modèle configurable.
  formatAparte(titre, cle) {
    const vars = { alias: titre, title: titre, key: cle || '', auteur: '', auteurs: '', annee: '' };
    if (/\{\{\s*(auteur|auteurs|annee)\s*\}\}/.test(this.settings.modeleAparte || '')) {
      const a = this.auteursAnnotation(cle);
      if (a) {
        vars.auteur = a.court;
        vars.auteurs = a.complet;
        vars.annee = a.annee;
      }
    }
    let out = appliquerModele(this.settings.modeleAparte || ' ({{alias}})', vars);
    // Retire une parenthèse d'auteurs restée vide (ex. « (, ) » pour les notes
    // conceptuelles, qui n'ont pas d'auteur), sans toucher au reste de l'alias.
    out = out.replace(/\s*\([\s,;]*\)/g, '').replace(/\s+$/, '');
    return out;
  }

  // Applique couleur et taille de l'aparté via des variables CSS globales.
  appliquerStyleAparte() {
    const b = document.body;
    if (!b) return;
    const taille = (this.settings.aparteTaille || '').trim();
    const couleur = (this.settings.aparteCouleur || '').trim();
    if (taille) b.style.setProperty('--zfa-aparte-taille', taille);
    else b.style.removeProperty('--zfa-aparte-taille');
    if (couleur) b.style.setProperty('--zfa-aparte-couleur', couleur);
    else b.style.removeProperty('--zfa-aparte-couleur');
    const police = (this.settings.nomsMonospaceFont || '').trim();
    if (police) b.style.setProperty('--zfa-nom-mono-font', police);
    else b.style.removeProperty('--zfa-nom-mono-font');
  }

  // Commande : retire l'alias affiché des liens d'annotation
  // (« [[clé|Titre]] » -> « [[clé]] »). Ne touche pas les notes d'annotation.
  async retirerAliasLiensAnnotation() {
    const cles = new Set();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (fm && fm['zotflow-anno-key'] !== undefined) cles.add(f.basename);
    }
    if (cles.size === 0) {
      new obsidian.Notice(tr('Aucune annotation trouvée.'));
      return;
    }
    let modifs = 0;
    const re = /(?<!!)\[\[([^\]|#^\n]+)\|[^\]\n]*\]\]/g;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.path.startsWith(this.dossierA + '/')) continue;
      const contenu = await this.app.vault.read(f);
      const nouveau = contenu.replace(re, (m, cible) => {
        const t = cible.trim();
        if (cles.has(t)) {
          modifs++;
          return '[[' + t + ']]';
        }
        return m;
      });
      if (nouveau !== contenu) await this.ecrire(f.path, nouveau, f);
    }
    new obsidian.Notice(tr('Ariane : ') + modifs + ' lien(s) nettoyé(s).');
  }

  //#endregion Ariane · notes & citations — rendu

  //#region Ariane · glisser-déposer & clés d'annotation
  // ── glisser-déposer & clés d'annotation ──────────────────────────────────

  /* ------------- Glisser une annotation sur un paragraphe --------------- */

  // Éditeur CodeMirror situé sous un point de l'écran (quel que soit le
  // volet actif), pour gérer le glisser depuis la base vers la note.
  // Document de l'événement (gère les fenêtres détachées / multi-moniteurs).
  docDeEvenement(e) {
    return (e && e.view && e.view.document) ||
      (e && e.target && e.target.ownerDocument) ||
      document;
  }

  cmSousPoint(x, y, doc) {
    const d = doc || document;
    const el = d.elementFromPoint(x, y);
    const editeur = el && el.closest ? el.closest('.cm-editor') : null;
    if (!editeur) return null;
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      const cm = view && view.editor ? view.editor.cm : null;
      if (cm && cm.dom === editeur) return cm;
    }
    return null;
  }

  estAnnotationCle(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    if (!dest || !dest.path.startsWith(this.dossierA + '/')) return false;
    const cache = this.app.metadataCache.getFileCache(dest);
    const fm = cache ? cache.frontmatter : null;
    return !!(fm && fm['zotflow-anno-key'] !== undefined);
  }

  extraireCleDepuisTexte(text) {
    if (!text) return '';
    const s = String(text).trim();
    const m = s.match(/\[\[([^\]|#\n]+)/);
    return m ? cleDeLien(m[1]) : s.split('\n')[0].trim();
  }

  // Un glisser venu d'un panneau tiers — le chat de Claudian, par exemple —
  // n'est pas un glisser interne d'Obsidian : c'est un glisser HTML natif,
  // dont la charge peut prendre des formes très diverses. On les ramène
  // toutes à un nom de note.
  cleDepuisCharge(brut) {
    if (!brut) return '';
    let s = String(brut).trim().split('\n')[0].trim();
    if (!s) return '';

    // Lien interne, la forme la plus directe.
    const w = s.match(/\[\[([^\]|#\n]+)/);
    if (w) return cleDeLien(w[1]);

    // Lien markdown : on ne garde que la cible.
    const md = s.match(/\]\(([^)]+)\)/);
    if (md) s = md[1].trim();

    // URL Obsidian : le nom de la note est dans le paramètre « file ».
    const ob = s.match(/obsidian:\/\/[^\s]*[?&]file=([^&\s]+)/i);
    if (ob) {
      try { s = decodeURIComponent(ob[1]); } catch (e) { s = ob[1]; }
    } else if (/^app:\/\//i.test(s)) {
      // Forme interne d'Obsidian pour un fichier du coffre.
      try { s = decodeURIComponent(s.replace(/^app:\/\/[^/]*\//i, '')); } catch (e) { /* brut */ }
    } else if (/%[0-9a-f]{2}/i.test(s)) {
      try { s = decodeURIComponent(s); } catch (e) { /* brut */ }
    }

    return s.replace(/^<|>$/g, '')
      .replace(/#.*$/, '')
      .replace(/\|.*$/, '')
      .replace(/\.md$/i, '')
      .trim();
  }

  // Note la cible du lien d'où part le glisser. On interroge « data-href »
  // en premier : c'est la valeur qu'Obsidian et Claudian y inscrivent, non
  // résolue, donc exploitable telle quelle.
  noterSourceGlissee(e) {
    this._sourceGlissee = '';
    const cible = e && e.target;
    if (!cible || typeof cible.closest !== 'function') return;

    let a = cible.closest('a[data-href], a.internal-link, .claudian-file-link');
    // Le glisser peut partir de l'aparté qu'Ariane accole après le lien.
    if (!a) {
      const aparte = cible.closest('.zfa-lien-alias');
      if (aparte && aparte.previousElementSibling) a = aparte.previousElementSibling;
    }
    if (a && typeof a.getAttribute === 'function') {
      this._sourceGlissee = (a.getAttribute('data-href')
        || a.getAttribute('href')
        || a.textContent
        || '').trim();
      return;
    }

    // En édition, une citation déjà posée n'est pas une balise « a » : le lien
    // est rendu sans « data-href », seul l'alias est visible. On lit donc le
    // document sous le point de départ pour y retrouver le « [[…]] » englobant.
    const cle = this.lienSousPoint(e);
    if (!cle) return;
    this._sourceGlissee = cle;

    // Réutiliser une citation, c'est la copier : sans cela l'éditeur la
    // déplacerait, et elle disparaîtrait du paragraphe d'origine. On ne force
    // cet effet que sur une cible réellement citable, pour ne pas altérer le
    // déplacement ordinaire d'un lien quelconque.
    if (e.dataTransfer && this.noteCitable(cle)) {
      try { e.dataTransfer.effectAllowed = 'copy'; } catch (err) { /* selon la source */ }
    }
  }

  // Une note peut-elle servir d'appui : annotation, ou source Zotero ?
  noteCitable(cle) {
    if (!cle) return false;
    for (const c of [cle, String(cle).split('/').pop()]) {
      const f = this.app.metadataCache.getFirstLinkpathDest(c, '');
      if (!f || f.extension !== 'md') continue;
      if (this.settings.dropToutesNotes) return true;
      const fm = ((this.app.metadataCache.getFileCache(f) || {}).frontmatter) || {};
      if (f.path.startsWith(this.dossierA + '/') && fm['zotflow-anno-key'] !== undefined) return true;
      if (fm.citationKey !== undefined) return true;
    }
    return false;
  }

  // Cible du lien interne situé sous les coordonnées d'un événement, lue dans
  // le texte source de l'éditeur. Rend '' si le point ne tombe pas dans un lien.
  lienSousPoint(e) {
    if (!e || e.clientX == null) return '';
    let cm = null;
    try {
      cm = this.cmSousPoint(e.clientX, e.clientY, this.docDeEvenement(e));
    } catch (err) { return ''; }
    if (!cm) return '';

    let pos = null;
    try { pos = cm.posAtCoords({ x: e.clientX, y: e.clientY }); } catch (err) { return ''; }
    if (pos == null) return '';

    const ligne = cm.state.doc.lineAt(pos);
    const rel = pos - ligne.from;
    for (const m of ligne.text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
      if (rel >= m.index && rel <= m.index + m[0].length) {
        return m[1].split('|')[0].split('#')[0].trim();
      }
    }
    return '';
  }

  // Quand la charge n'est pas un identifiant propre — une sélection de texte,
  // par exemple, où la clé se trouve collée au titre par l'aparté d'Ariane —
  // on y cherche les jetons qui ressemblent à une clé : citekey Zotero
  // « @auteurTitre2014 », ou clé d'annotation en capitales « TG7F24EE ».
  clesCandidates(brut) {
    const s = String(brut || '');
    const out = [];
    const ajouter = (x) => { if (x && out.indexOf(x) === -1) out.push(x); };
    for (const m of s.matchAll(/@[A-Za-zÀ-ÿ0-9_-]{4,}/g)) ajouter(m[0]);
    for (const m of s.matchAll(/\b[A-Z0-9]{6,12}\b/g)) ajouter(m[0]);
    return out;
  }

  // Récupère la clé de l'annotation glissée, en priorité via le
  // gestionnaire de glisser interne d'Obsidian (dragManager), sinon via
  // les données du presse-papier.
  // Toutes les notes markdown portées par un glisser (tâches ou non) :
  // fichier(s) du dragManager d'Obsidian, panier de notes, ou liens [[…]] du
  // presse-papier. Renvoie une liste de basenames, dédoublonnée.
  notesGlissees(e) {
    const noms = new Set();
    const add = (f) => { if (f && f.extension === 'md') noms.add(f.basename); };
    const parNom = (v) => {
      const cible = String(v || '').replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].trim();
      if (!cible || cible === 'zfa-panier') return;
      add(this.app.metadataCache.getFirstLinkpathDest(cible, '')
        || this.app.vault.getMarkdownFiles().find((z) => z.basename === cible || z.path === cible));
    };
    if (this.glisseDepuisPanier && Array.isArray(this.panier)) this.panier.forEach(parNom);
    const d = this.app.dragManager && this.app.dragManager.draggable;
    if (d) {
      add(d.file);
      for (const arr of [d.files, d.items]) if (Array.isArray(arr)) arr.forEach(add);
      for (const k of ['linktext', 'link', 'title', 'name']) {
        const s = typeof d[k] === 'string' ? d[k] : '';
        if (s.includes('[[')) for (const m of s.matchAll(/\[\[([^\]|#\n]+)/g)) parNom(m[1]);
        else if (s) parNom(s);
      }
    }
    if (!noms.size && e && e.dataTransfer) {
      const t = e.dataTransfer.getData('text/plain') || '';
      if (t.includes('[[')) for (const m of t.matchAll(/\[\[([^\]|#\n]+)/g)) parNom(m[1]);
      else t.split(/\r?\n/).forEach(parNom);
    }
    return [...noms];
  }

  obtenirCleGlissee(e) {
    const toutes = this.settings.dropToutesNotes;
    // Un fichier est-il acceptable comme appui ? Toute note markdown si
    // « toutes les notes », sinon seulement les annotations.
    const accepteFichier = (f) => {
      if (!f || !f.path || f.extension !== 'md') return false;
      if (toutes) return true;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = (cache ? cache.frontmatter : null) || {};
      // Annotation.
      if (f.path.startsWith(this.dossierA + '/') && fm['zotflow-anno-key'] !== undefined) return true;
      // Note source : citer un travail sans passer par une annotation reste
      // légitime, et c'est précisément ce qu'on glisse depuis un panneau tiers.
      return fm.citationKey !== undefined;
    };
    const accepteCible = (cible) => {
      if (!cible) return false;
      // La charge peut porter un chemin complet comme un simple nom.
      const essais = [cible, cible.split('/').pop()];
      for (const c of essais) {
        if (accepteFichier(this.app.metadataCache.getFirstLinkpathDest(c, ''))) return true;
      }
      return false;
    };
    const normaliser = (cible) => {
      const essais = [cible, cible.split('/').pop()];
      for (const c of essais) {
        const f = this.app.metadataCache.getFirstLinkpathDest(c, '');
        if (accepteFichier(f)) return f.basename;
      }
      return '';
    };
    const dm = this.app.dragManager;
    const d = dm && dm.draggable;
    if (d) {
      if (accepteFichier(d.file)) return d.file.basename;
      const arr = d.files || d.items;
      if (Array.isArray(arr)) {
        for (const f of arr) if (accepteFichier(f)) return f.basename;
      }
      for (const k of ['linktext', 'link', 'title', 'name']) {
        if (typeof d[k] === 'string') {
          const cible = this.extraireCleDepuisTexte(d[k]);
          if (accepteCible(cible)) return cible;
        }
      }
    }
    // Élément d'origine, retenu au départ du glisser. C'est la seule voie
    // quand la charge est vide, ce qui est le cas depuis un panneau tiers.
    if (this._sourceGlissee) {
      const k = normaliser(this.cleDepuisCharge(this._sourceGlissee));
      if (k) return k;
      for (const jeton of this.clesCandidates(this._sourceGlissee)) {
        const j = normaliser(jeton);
        if (j) return j;
      }
    }

    // Glisser natif : on interroge chaque format proposé, du plus explicite
    // au plus vague. Un panneau tiers ne remplit pas forcément « text/plain ».
    const dt = e && e.dataTransfer;
    if (dt) {
      const formats = ['text/plain', 'text/uri-list', 'text/x-moz-url', 'text/html'];
      const vus = [];
      for (const fmt of formats) {
        let brut = '';
        try { brut = dt.getData(fmt); } catch (err) { brut = ''; }
        if (!brut) continue;
        vus.push(fmt);

        if (fmt === 'text/html') {
          // On tente d'abord les liens du fragment, puis son texte.
          const candidats = [];
          const re = /(?:href|data-href)\s*=\s*["']([^"']+)["']/gi;
          let m;
          while ((m = re.exec(brut)) !== null) candidats.push(m[1]);
          candidats.push(brut.replace(/<[^>]*>/g, ' '));
          for (const c of candidats) {
            const k = normaliser(this.cleDepuisCharge(c));
            if (k) return k;
          }
          for (const jeton of this.clesCandidates(brut)) {
            const k = normaliser(jeton);
            if (k) return k;
          }
          continue;
        }

        for (const ligne of String(brut).split('\n')) {
          const k = normaliser(this.cleDepuisCharge(ligne));
          if (k) return k;
        }
        // La charge entière n'a rien donné : on y cherche une clé isolée.
        for (const jeton of this.clesCandidates(brut)) {
          const k = normaliser(jeton);
          if (k) return k;
        }
      }
      // Aide au diagnostic : sans cela, un dépôt refusé reste muet.
      if (this.settings.dropSignalerRefus !== false) {
        const apercu = this._sourceGlissee || (() => {
          try { return dt.getData('text/plain'); } catch (err) { return ''; }
        })();
        new obsidian.Notice(tr("Dépôt non reconnu : ")
          + (apercu ? '« ' + String(apercu).slice(0, 80) + ' »' : 'charge vide')
          + '. Aucune note du coffre ne correspond.', 6000);
      }
      console.debug('[Ariane] glisser non reconnu. Formats reçus :',
        Array.from(dt.types || []), '| exploités :', vus,
        '| text/plain :', (() => { try { return dt.getData('text/plain'); } catch (err) { return '?'; } })());
    }
    if (d) console.debug('[Ariane] objet glissé non reconnu :', Object.keys(d), d);
    return '';
  }

  // La ligne appartient-elle à un paragraphe de corps (éligible au dépôt) ?
  ligneEstParagraphe(doc, n) {
    if (n < 1 || n > doc.lines) return false;
    const t = doc.line(n).text;
    if (t.trim() === '') return false;
    if (/^#{1,6}\s/.test(t)) return false; // titre
    if (/^\s*\[\^[^\]]+\]:/.test(t)) return false; // définition de note
    if (/^[\t ]/.test(t)) return false; // ligne indentée (continuation)
    if (/^(?:!?\[\[[^\]]*\]\]\s*)+$/.test(t.trim())) return false; // ligne de liens seuls
    // exclure la zone des notes de bas de page (à partir de la 1re définition)
    for (let k = 1; k < n; k++) {
      if (/^\s*\[\^[^\]]+\]:/.test(doc.line(k).text)) return false;
    }
    return true;
  }

  // Rattache une ou plusieurs annotations à la note de bas de page du
  // paragraphe contenant la ligne donnée (création ou complément).
  // Notes concernées par une conversion : on écarte les annotations elles-mêmes
  // et les fiches Zotero, qui ne contiennent pas de rédaction.
  notesConvertibles() {
    const exclus = [this.dossierA + '/', this.dossierR + '/', 'Références/', 'Auteurs/'];
    return this.app.vault.getMarkdownFiles()
      .filter((f) => !exclus.some((d) => f.path.startsWith(d)));
  }

  //#endregion Ariane · glisser-déposer & clés d'annotation

  //#region Ariane · temps de travail
  // ── temps de travail ─────────────────────────────────────────────────────

  // Le compteur s'appuie sur la note active et sur l'activité du clavier et de
  // la souris. Il ne mesure donc pas la présence devant l'écran, mais le temps
  // de travail effectif, ce qui est plus honnête pour un journal de thèse.
  demarrerCompteurTemps() {
    if (!this.settings.tempsActif) return;

    this._tempsSecondes = new Map();   // chemin -> secondes non encore reportées
    this._tempsDerniereActivite = Date.now();
    this._tempsCheminCourant = '';
    this._tempsDernierJour = jourIsoDe(new Date());

    // Toute action de l'utilisateur repousse l'inactivité. Le passage en
    // capture évite qu'un panneau tiers n'intercepte l'événement avant nous.
    const marquer = () => { this._tempsDerniereActivite = Date.now(); };
    const surDocument = (doc) => {
      for (const ev of ['keydown', 'mousedown', 'mousemove', 'wheel', 'touchstart']) {
        this.registerDomEvent(doc, ev, marquer, { capture: true, passive: true });
      }
    };
    // Les fenêtres détachées déjà ouvertes au chargement doivent être écoutées
    // elles aussi : sans cela, taper dans l'une d'elles ne repoussait jamais
    // l'inactivité, et le compteur s'y arrêtait au bout du délai.
    const docsEcoutes = new WeakSet();
    const ecouter = (doc) => {
      if (!doc || docsEcoutes.has(doc)) return;
      docsEcoutes.add(doc);
      surDocument(doc);
    };
    ecouter(document);
    try {
      this.app.workspace.iterateAllLeaves((feuille) => {
        const c = feuille && feuille.view && feuille.view.containerEl;
        if (c && c.ownerDocument) ecouter(c.ownerDocument);
      });
    } catch (e) {
      console.warn('[Ariane] fenêtres non parcourues pour le compteur :', e);
    }
    this.registerEvent(this.app.workspace.on('window-open', (_w, win) => {
      if (win && win.document) ecouter(win.document);
    }));

    // Un battement court : la précision du compte vaut mieux qu'une économie
    // de quelques réveils, et le calcul se résume à une comparaison de dates.
    this.registerInterval(window.setInterval(() => this.battementTemps(), 5000));

    if (this.settings.tempsBarreEtat) {
      this._tempsBarre = this.addStatusBarItem();
      this._tempsBarre.addClass('zfa-temps-barre');
      this._tempsBarre.addEventListener('click', () => this.ouvrirBilanTemps());
    }

    // Report en propriété à intervalle régulier, et non à chaque seconde :
    // écrire dans le fichier agite la synchronisation et les sauvegardes.
    this.registerInterval(window.setInterval(
      () => this.reporterTemps(),
      Math.max(60, this.settings.tempsEcritureSec || 300) * 1000
    ));
  }

  // La note actuellement chronométrée, ou '' si aucune ne l'est.
  noteChronometrable() {
    const feuille = this.app.workspace.activeLeaf;
    const vue = feuille && feuille.view;
    if (!vue || vue.getViewType() !== 'markdown') return '';
    // Mode lecture : on ne chronomètre que ce qui est modifiable.
    if (typeof vue.getMode === 'function' && vue.getMode() !== 'source') return '';
    const f = vue.file;
    if (!f || f.extension !== 'md') return '';

    if (Ariane.sousDossier(f.path, String(this.settings.tempsDossiersExclus || '').split(/[\n,]+/))) {
      return '';
    }
    if (this.settings.tempsIgnorerVerrouillees !== false) {
      const fm = ((this.app.metadataCache.getFileCache(f) || {}).frontmatter) || {};
      if (fm.locked === true) return '';
    }
    return f.path;
  }

  battementTemps() {
    if (!this.settings.tempsActif || !this._tempsSecondes) return;

    // Changement de jour : on clôt la veille avant de continuer.
    const jour = jourIsoDe(new Date());
    if (jour !== this._tempsDernierJour) {
      this.reporterTemps();
      const veille = this._tempsDernierJour;
      this._tempsDernierJour = jour;
      if (this.settings.tempsJournalAuto) {
        this.ecrireJournalTemps(veille).catch((e) => console.error('[Ariane] journal du temps', e));
      }
    }

    const chemin = this.noteChronometrable();
    const inactifDepuis = (Date.now() - this._tempsDerniereActivite) / 1000;
    const seuil = Math.max(10, this.settings.tempsInactiviteSec || 120);
    // Le focus doit être jugé sur la fenêtre qui porte la note. Interroger le
    // document principal revenait à déclarer en pause tout travail mené dans
    // une fenêtre détachée, sur un second écran par exemple.
    const enPause = !chemin || inactifDepuis > seuil || !this.fenetreNoteActive();

    if (!enPause) {
      this._tempsSecondes.set(chemin, (this._tempsSecondes.get(chemin) || 0) + 5);
      // Le relevé cumule des SECONDES : arrondir en minutes à chaque battement
      // accumulait une erreur de plusieurs pour cent sur une journée.
      const h = this.settings.tempsHistorique || (this.settings.tempsHistorique = {});
      const dujour = h[jour] || (h[jour] = {});
      dujour[chemin] = (dujour[chemin] || 0) + 5;
    }

    // Quitter une note reporte aussitôt son temps : on ne perd rien si
    // Obsidian se ferme brutalement.
    if (chemin !== this._tempsCheminCourant) {
      const precedent = this._tempsCheminCourant;
      this._tempsCheminCourant = chemin;
      if (precedent) this.reporterTemps(precedent);
    }

    this.rafraichirBarreTemps(chemin, enPause);
  }

  // La fenêtre portant la note active a-t-elle le focus ? On interroge son
  // propre document : chaque fenêtre détachée a le sien.
  fenetreNoteActive() {
    const feuille = this.app.workspace.activeLeaf;
    const c = feuille && feuille.view && feuille.view.containerEl;
    const doc = (c && c.ownerDocument) || document;
    try {
      return typeof doc.hasFocus === 'function' ? doc.hasFocus() : true;
    } catch (e) {
      return true;
    }
  }

  rafraichirBarreTemps(chemin, enPause) {
    if (!this._tempsBarre) return;
    if (!chemin) { this._tempsBarre.setText(''); return; }
    const totaux = this.settings.tempsTotalSecondes || {};
    const base = totaux[chemin] != null ? totaux[chemin] / 60 : this.tempsTotalDe(chemin);
    const total = base + (this._tempsSecondes.get(chemin) || 0) / 60;
    this._tempsBarre.setText((enPause ? '○ ' : '● ') + dureeLisible(total));
    this._tempsBarre.setAttr('aria-label',
      (enPause ? 'Compteur en pause — ' : 'Compteur actif — ') + chemin.split('/').pop());
  }

  // Total déjà inscrit dans la note, en minutes.
  tempsTotalDe(chemin) {
    const f = this.app.vault.getAbstractFileByPath(chemin);
    if (!(f instanceof obsidian.TFile)) return 0;
    const fm = ((this.app.metadataCache.getFileCache(f) || {}).frontmatter) || {};
    return Number(fm[this.settings.tempsPropriete || 'temps-passe']) || 0;
  }

  // Reporte en propriété les secondes accumulées. Sans argument, pour toutes
  // les notes en attente.
  async reporterTemps(cheminVoulu) {
    if (!this._tempsSecondes || !this._tempsSecondes.size) return;
    const prop = this.settings.tempsPropriete || 'temps-passe';
    const chemins = cheminVoulu ? [cheminVoulu] : Array.from(this._tempsSecondes.keys());

    const totaux = this.settings.tempsTotalSecondes || (this.settings.tempsTotalSecondes = {});

    for (const chemin of chemins) {
      const secondes = this._tempsSecondes.get(chemin) || 0;
      if (secondes < 30) continue; // sous la demi-minute, on attend
      const f = this.app.vault.getAbstractFileByPath(chemin);
      if (!(f instanceof obsidian.TFile)) { this._tempsSecondes.delete(chemin); continue; }
      try {
        // Amorçage : une note déjà porteuse d'un total le conserve.
        if (totaux[chemin] == null) totaux[chemin] = Math.round(this.tempsTotalDe(chemin) * 60);
        totaux[chemin] += secondes;
        const minutes = Math.round(totaux[chemin] / 60);
        this.marquerEcriture(f.path);
        await this.app.fileManager.processFrontMatter(f, (fm) => { fm[prop] = minutes; });
        this._tempsSecondes.delete(chemin);
      } catch (e) {
        console.error('[Ariane] report du temps impossible :', chemin, e);
      }
    }
    await this.saveSettings();
  }

  /* ------------------------- Journal quotidien --------------------------- */

  async ecrireJournalTemps(jour) {
    const j = jour || jourIsoDe(new Date());
    await this.reporterTemps();
    const releve = (this.settings.tempsHistorique || {})[j] || {};
    const lignes = Object.entries(releve)
      .map(([chemin, secondes]) => [chemin, secondes / 60])
      .filter(([, m]) => m >= 1)
      .sort((a, b) => b[1] - a[1]);

    if (!lignes.length) {
      new obsidian.Notice(tr('Aucun temps enregistré pour le ') + j + '.');
      return '';
    }

    const dossier = (this.settings.tempsDossierJournal || '9 - Journal du temps').replace(/\/+$/, '');
    if (!this.app.vault.getAbstractFileByPath(dossier)) {
      try { await this.app.vault.createFolder(dossier); } catch (e) { /* déjà là */ }
    }

    const total = lignes.reduce((s, [, m]) => s + m, 0);
    const out = ['---', 'type: journal-temps', 'date: ' + j,
      'total-minutes: ' + Math.round(total), '---',
      '# Temps de travail du ' + j, '',
      '**Total : ' + dureeLisible(total) + '** sur ' + lignes.length + ' note(s).', '',
      '| Note | Temps |', '| --- | --- |'];
    for (const [chemin, m] of lignes) {
      const nom = chemin.replace(/\.md$/, '');
      out.push('| [[' + nom + ']] | ' + dureeLisible(m) + ' |');
    }
    out.push('');

    const chemin = dossier + '/' + j + '.md';
    const existant = this.app.vault.getAbstractFileByPath(chemin);
    if (existant instanceof obsidian.TFile) {
      this.marquerEcriture(chemin);
      await this.app.vault.modify(existant, out.join('\n'));
    } else {
      await this.ecrire(chemin, out.join('\n'));
    }
    return chemin;
  }

  async ouvrirBilanTemps() {
    const chemin = await this.ecrireJournalTemps();
    if (!chemin) return;
    await this.app.workspace.openLinkText(chemin.replace(/\.md$/, ''), '', false);
  }

  // Écarte les relevés trop anciens, pour que le fichier de réglages ne gonfle
  // pas indéfiniment.
  elaguerHistoriqueTemps() {
    const h = this.settings.tempsHistorique || {};
    const garder = Math.max(7, this.settings.tempsRetenirJours || 120);
    const limite = jourIsoDe(new Date(Date.now() - garder * 24 * 3600 * 1000));
    let retires = 0;
    for (const j of Object.keys(h)) {
      if (j < limite) { delete h[j]; retires++; }
    }
    return retires;
  }

  //#endregion Ariane · temps de travail

  //#region Ariane · citations repliables
  // ── citations repliables ─────────────────────────────────────────────────

  /* --------------------- Citations repliables ---------------------------- */

  // En lecture, la citation est rendue par un « ( », des liens internes, des
  // « ; » et un « ) ». On enveloppe l'ensemble pour pouvoir le masquer par
  // CSS, en laissant une pastille cliquable à sa place.
  rendreCitationsRepliables(el) {
    if (!this.settings.citationsRepliables) return;
    // Une citation contient forcément un lien interne : en l'absence de tout
    // lien, il est inutile de parcourir les blocs. La grande majorité des
    // paragraphes sort ici, en une seule interrogation du DOM.
    if (!el.querySelector || !el.querySelector('a.internal-link')) return;

    const blocs = el.querySelectorAll('p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6');
    for (const bloc of [el, ...blocs]) {
      if (!bloc.querySelector) continue;
      if (!bloc.querySelector('a.internal-link')) continue;
      if (bloc.querySelector('.zfa-cit')) continue;
      this.envelopperCitations(bloc);
    }
  }

  // Le tableau des enfants devient obsolète dès qu'une citation est
  // enveloppée : on relance donc une passe complète après chaque prise, plutôt
  // que de poursuivre sur une liste périmée. La borne évite toute boucle
  // infinie si un cas imprévu empêchait le repérage d'avancer.
  envelopperCitations(bloc) {
    for (let passe = 0; passe < 50; passe++) {
      if (!this.envelopperUneCitation(bloc)) return;
    }
  }

  envelopperUneCitation(bloc) {
    const enfants = Array.from(bloc.childNodes);
    for (let i = 0; i < enfants.length; i++) {
      const n = enfants[i];
      if (n.nodeType !== Node.TEXT_NODE || !n.nodeValue.endsWith('(')) continue;

      // On avance tant qu'on rencontre des liens internes et des séparateurs.
      let j = i + 1;
      let liens = 0;
      let ferme = null;
      while (j < enfants.length) {
        const suivant = enfants[j];
        if (suivant.nodeType === Node.ELEMENT_NODE
            && suivant.classList && suivant.classList.contains('internal-link')) {
          liens++; j++; continue;
        }
        if (suivant.nodeType === Node.TEXT_NODE) {
          const t = suivant.nodeValue;
          if (/^\s*;\s*$/.test(t)) { j++; continue; }
          if (t.startsWith(')')) { ferme = suivant; break; }
        }
        break;
      }
      if (!liens || !ferme) continue;

      // On coupe les parenthèses des textes qui les portent.
      n.nodeValue = n.nodeValue.slice(0, -1);
      ferme.nodeValue = ferme.nodeValue.slice(1);

      const enveloppe = document.createElement('span');
      enveloppe.className = 'zfa-cit';

      const pastille = document.createElement('span');
      pastille.className = 'zfa-cit-pastille';
      pastille.textContent = String(liens);
      pastille.setAttribute('aria-label', liens > 1
        ? liens + ' références — cliquer pour déplier'
        : 'Une référence — cliquer pour déplier');
      pastille.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        enveloppe.classList.toggle('zfa-cit--ouverte');
      });

      const contenu = document.createElement('span');
      contenu.className = 'zfa-cit-contenu';
      contenu.appendChild(document.createTextNode('('));
      for (let k = i + 1; k < j; k++) contenu.appendChild(enfants[k]);
      contenu.appendChild(document.createTextNode(')'));

      enveloppe.appendChild(pastille);
      enveloppe.appendChild(contenu);
      bloc.insertBefore(enveloppe, ferme);
      return true;
    }
    return false;
  }

  // L'état de repliement se lit sur le corps du document : le mode lecture est
  // ainsi piloté par la seule feuille de style, sans nouveau rendu.
  appliquerEtatCitations() {
    this._citVersion = (this._citVersion || 0) + 1;
    // Même reprise en main côté lecture : une citation dépliée d'un clic porte
    // sa propre exception, qui doit céder devant la commande globale.
    for (const e of document.querySelectorAll('.zfa-cit--ouverte')) {
      e.classList.remove('zfa-cit--ouverte');
    }
    document.body.classList.toggle(
      'zfa-citations-repliees',
      !!(this.settings.citationsRepliables && this.settings.citationsRepliees)
    );
    // En édition, il faut en revanche relancer le calcul des décorations.
    for (const feuille of this.app.workspace.getLeavesOfType('markdown')) {
      const cm = feuille.view && feuille.view.editor && feuille.view.editor.cm;
      if (cm && typeof cm.dispatch === 'function') {
        try { cm.dispatch({}); } catch (e) { /* vue non prête */ }
      }
    }
  }

  // L'affichage est modifié d'abord, l'enregistrement ensuite : attendre
  // l'écriture du fichier de réglages avant de rafraîchir ajoutait un délai
  // perceptible à chaque basculement.
  basculerCitations(replier) {
    this.settings.citationsRepliees = replier;
    // Aucune notification : le changement se voit à l'écran, l'annoncer en
    // plus ne fait qu'encombrer.
    this.appliquerEtatCitations();
    this.saveSettings().catch((e) => console.error('[Ariane] réglages non enregistrés :', e));
  }

  //#endregion Ariane · citations repliables

  //#region Ariane · lecteurs ZotFlow & liens Zotero
  // ── lecteurs ZotFlow & liens Zotero ──────────────────────────────────────

  /* --------------------- Notes de lecture (notes-filles) ---------------- */

  // Table clé Zotero -> clé de citation, bâtie sur les fiches sources. Elle
  // permet de rendre à une citation de note-fille sa forme d'Ariane.
  indexParCleZotero() {
    const m = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (fm.citationKey && fm['zotero-key']) {
        m.set(String(fm['zotero-key']).trim(), '@' + String(fm.citationKey).trim());
      }
    }
    return m;
  }

  // Atomise les notes-filles d'une fiche source : une note par bloc, dans le
  // dossier des notes de lecture. Le lien vers la source suffit à la
  // réciprocité — Obsidian tient les rétroliens.
  async atomiserNotesLecture(fichierSource, parCleZotero) {
    if (this.settings.atomiserNotesLecture === false) return 0;
    const fm = (this.app.metadataCache.getFileCache(fichierSource) || {}).frontmatter || {};
    if (!fm.citationKey) return 0;
    const exclues = (this.settings.sourcesExclues || [])
      .map((x) => String(x).trim().replace(/^@/, '')).filter(Boolean);
    if (exclues.includes(String(fm.citationKey).trim())) return 0;
    const contenu = await this.app.vault.cachedRead(fichierSource);
    const blocs = extraireNotesFilles(contenu);
    if (!blocs.length) return 0;

    const table = parCleZotero || this.indexParCleZotero();
    const racine = this.settings.dossierNotesLecture || '2 - Notes de lecture';
    const dossier = racine + '/' + fichierSource.basename;
    await this.assurerDossier(racine);
    await this.assurerDossier(dossier);

    let faits = 0;
    for (const bloc of blocs) {
      const chemin = dossier + '/' + bloc.cle + '.md';
      const existant = this.app.vault.getAbstractFileByPath(chemin);
      if (existant) {
        const fmx = (this.app.metadataCache.getFileCache(existant) || {}).frontmatter || {};
        if (fmx['zotflow-locked'] === false || fmx.locked === true) continue; // note reprise à la main
      }
      const corps = citationsZotflowVersAriane(bloc.corps, table);
      const entete = [
        '---',
        'aliases:',
        '  - ' + JSON.stringify(bloc.titre || bloc.cle),
        'cssclasses:',
        '  - note-de-lecture',
        'zotflow-note-key: ' + bloc.cle,
        'zotflow-source: "[[' + fichierSource.basename + ']]"',
        'type: lecture',
        'zotflow-auto: true',
        '---',
        '',
      ].join('\n');
      await this.ecrire(chemin, entete + corps + '\n', existant || null);
      faits += 1;
    }
    return faits;
  }

  // Passe sur toutes les fiches sources. L'index des clés Zotero n'est bâti
  // qu'une fois : le refaire par source coûterait 736 lectures à chaque tour.
  async atomiserToutesNotesLecture() {
    const table = this.indexParCleZotero();
    let sources = 0, notes = 0;
    const notice = new obsidian.Notice(tr('Notes de lecture : atomisation…'), 0);
    try {
      for (const f of this.app.vault.getMarkdownFiles()) {
        const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
        if (!fm.citationKey) continue;
        const n = await this.atomiserNotesLecture(f, table);
        if (n) { sources += 1; notes += n; }
      }
    } finally {
      notice.hide();
    }
    new obsidian.Notice(tr('Notes de lecture : ') + notes + ' note(s) depuis ' + sources + ' source(s).');
    return notes;
  }

  /* ----------------------- Retour vers Zotero --------------------------- */

  // Les deux vues de lecture de zotflow. Leur état de feuille porte, tel quel,
  // { libraryID, itemKey } — et cette clé est celle de la PIÈCE JOINTE, la
  // même que Zotero attend. Aucun détour par la fiche source n'est nécessaire.
  estLecteurZotflow(vue) {
    if (!vue || typeof vue.getViewType !== 'function') return false;
    const t = vue.getViewType();
    return t === 'zotflow-zotero-reader-view' || t === 'zotflow-local-zotero-reader-view';
  }

  cibleLecteurZotflow(feuille) {
    if (!feuille || typeof feuille.getViewState !== 'function') return null;
    let etat = null;
    try { etat = (feuille.getViewState() || {}).state || null; } catch (e) { return null; }
    if (!etat || !etat.itemKey) return null;
    return { libraryID: etat.libraryID, itemKey: String(etat.itemKey) };
  }

  // La page en cours. On tente d'abord la vue vivante — sans rien supposer de
  // sa structure interne, qui appartient à zotflow — puis on se rabat sur
  // l'état que zotflow persiste dans ses réglages.
  async pageDuLecteur(vue, cible) {
    const sonder = (o, profondeur) => {
      if (!o || typeof o !== 'object' || profondeur > 3) return null;
      const p = o.primaryViewState;
      if (p && typeof p.pageIndex === 'number') return p.pageIndex;
      if (typeof o.pageIndex === 'number') return o.pageIndex;
      for (const cle of ['state', 'reader', 'viewer', 'viewState', '_state']) {
        const v = sonder(o[cle], profondeur + 1);
        if (v !== null) return v;
      }
      return null;
    };
    let idx = null;
    try { idx = sonder(vue, 0); } catch (e) { idx = null; }
    if (idx === null && cible) {
      try {
        const chemin = this.manifest.dir.replace(/[^/]+$/, 'zotflow') + '/data.json';
        if (await this.app.vault.adapter.exists(chemin)) {
          const d = JSON.parse(await this.app.vault.adapter.read(chemin));
          const e = (d.viewStates || {})[cible.libraryID + ':' + cible.itemKey];
          const p = e && e.primaryViewState;
          if (p && typeof p.pageIndex === 'number') idx = p.pageIndex;
        }
      } catch (e) { /* réglages de zotflow illisibles : on ouvrira sans page */ }
    }
    return (typeof idx === 'number' && idx >= 0) ? idx + 1 : null;   // pageIndex est à base zéro
  }

  async ouvrirLecteurDansZotero(feuille) {
    const f = feuille || this.app.workspace.activeLeaf;
    const cible = this.cibleLecteurZotflow(f);
    if (!cible) { new obsidian.Notice(tr("Ce n'est pas un lecteur ZotFlow.")); return; }
    const page = await this.pageDuLecteur(f ? f.view : null, cible);
    const uri = 'zotero://open-pdf/library/items/' + cible.itemKey
      + (page ? '?page=' + page : '');
    try {
      window.open(uri);
      console.log('[Ariane] Zotero —', uri);
    } catch (e) {
      new obsidian.Notice(tr('Ouverture dans Zotero impossible : ') + (e && e.message ? e.message : e));
    }
  }

  // Un bouton dans la barre d'actions du lecteur. On parcourt TOUTES les
  // feuilles, y compris celles des fenêtres détachées : trois fonctionnalités
  // se sont déjà cassées pour n'avoir couvert que la fenêtre principale.
  decorerLecteursZotflow() {
    this.app.workspace.iterateAllLeaves((feuille) => {
      const vue = feuille ? feuille.view : null;
      if (!this.estLecteurZotflow(vue)) return;
      if (vue._arianeBoutonZotero) return;
      if (typeof vue.addAction !== 'function') return;   // zotflow a changé : on n'insiste pas
      try {
        vue.addAction('external-link', 'Ouvrir dans Zotero (même page)',
          () => this.ouvrirLecteurDansZotero(feuille));
        vue._arianeBoutonZotero = true;
      } catch (e) { console.debug('[Ariane] bouton Zotero non posé', e); }
    });
  }

  // La fiche source de zotflow porte ses pièces jointes sous « ## Attachments »,
  // chacune sous la forme :
  //   - [nom.pdf](obsidian://zotflow?type=open-attachment&libraryID=…&key=T5HPDH45)
  // C'est cette clé de pièce jointe — et non celle de la référence — que Zotero
  // attend pour ouvrir le PDF.
  async cleAttachement(fichierSource) {
    try {
      const texte = await this.app.vault.cachedRead(fichierSource);
      const bloc = texte.split(/^##\s+Attachments\s*$/m)[1];
      if (!bloc) return null;
      const avant = bloc.split(/^##\s+/m)[0];
      const m = avant.match(/type=open-attachment[^)\n]*?[&;]key=([A-Za-z0-9]+)/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }

  // Rend { source, annoKey, page, libraryId } si la note active se rattache à
  // Zotero, sinon null. Vaut pour une annotation comme pour une fiche source.
  cibleZotero(fichier) {
    const f = fichier || this.app.workspace.getActiveFile();
    if (!f || f.extension !== 'md') return null;
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    if (fm.citationKey) {
      return { source: f, annoKey: null, page: '', libraryId: fm['library-id'] || '' };
    }
    const src = fm['zotflow-source'];
    if (!src) return null;
    const cible = String(src).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    const source = this.app.metadataCache.getFirstLinkpathDest(cible, f.path);
    if (!source) return null;
    const fms = (this.app.metadataCache.getFileCache(source) || {}).frontmatter || {};
    return {
      source,
      annoKey: fm['zotflow-anno-key'] ? String(fm['zotflow-anno-key']).trim() : null,
      page: fm.page != null ? String(fm.page).replace(/^["']|["']$/g, '').trim() : '',
      libraryId: fms['library-id'] || '',
    };
  }

  async ouvrirDansZotero(fichier) {
    // Depuis un lecteur ZotFlow, la feuille active dit tout : on n'a pas
    // besoin de la note.
    if (!fichier) {
      const f = this.app.workspace.activeLeaf;
      if (f && this.estLecteurZotflow(f.view)) { await this.ouvrirLecteurDansZotero(f); return; }
    }
    const cible = this.cibleZotero(fichier);
    if (!cible) { new obsidian.Notice(tr('Cette note ne se rattache pas à une source Zotero.')); return; }
    const fms = (this.app.metadataCache.getFileCache(cible.source) || {}).frontmatter || {};
    const att = await this.cleAttachement(cible.source);
    let uri;
    if (att) {
      // Zotero replace le lecteur sur l'annotation quand on la lui nomme ;
      // à défaut, sur la page. Sans pièce jointe, on se rabat sur la fiche.
      const ancre = cible.annoKey
        ? '?annotation=' + encodeURIComponent(cible.annoKey)
        : (cible.page ? '?page=' + encodeURIComponent(cible.page) : '');
      uri = 'zotero://open-pdf/library/items/' + att + ancre;
    } else if (fms['zotero-key']) {
      uri = 'zotero://select/library/items/' + String(fms['zotero-key']).trim();
    } else {
      new obsidian.Notice(tr('Aucune pièce jointe ni clé Zotero dans « ') + cible.source.basename + ' ».');
      return;
    }
    try {
      window.open(uri);
      console.log('[Ariane] Zotero —', uri);
    } catch (e) {
      new obsidian.Notice(tr('Ouverture dans Zotero impossible : ') + (e && e.message ? e.message : e));
    }
  }

  //#endregion Ariane · lecteurs ZotFlow & liens Zotero

  //#region Ariane · bibliographie en note & citations dynamiques
  // ── bibliographie en note & citations dynamiques ─────────────────────────

  /* -------------------------- Bibliographie ----------------------------- */

  // Note source (@citekey) correspondant à une clé citée : elle-même si c'en
  // est une, sinon la source de l'annotation.
  sourceDeCle(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(String(cle), '');
    if (!dest) return null;
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    if (fm.citationKey) return dest;
    const src = fm['zotflow-source'];
    if (!src) return null;
    const cible = String(src).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    const f = this.app.metadataCache.getFirstLinkpathDest(cible, dest.path);
    return f || null;
  }

  // Sources citées dans le corps, dans l'ordre d'apparition, sans doublon.
  sourcesCitees(contenu) {
    const corps = corpsCitable(contenu);
    const vues = new Map();
    for (const m of corps.matchAll(/\[\[([^\]|#\n]+)(?:\|[^\]\n]*)?\]\]/g)) {
      const f = this.sourceDeCle(cleDeLien(m[1]));
      if (f && !vues.has(f.path)) vues.set(f.path, f);
    }
    return [...vues.values()];
  }

  async majBibliographie(file, silencieux) {
    if (!file || file.extension !== 'md') return false;
    const avant = await this.app.vault.read(file);
    const sources = this.sourcesCitees(avant);

    // Aucune citation et aucun bloc existant : on n'ajoute rien.
    if (!sources.length && avant.indexOf(ZFA_BIBLIO_DEBUT) === -1) return false;

    const modele = this.settings.biblioModele;
    const champ = this.settings.biblioChamp || 'bibliographie';

    const entrees = [];
    for (const f of sources) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      // Référence déjà formatée par zotflow, sinon repli sur le modèle libre.
      let texte = nettoyerEntreeBiblio(fm[champ]);
      if (!texte) texte = entreeBiblio(f.basename, fm, modele);
      if (!texte) continue;
      entrees.push({
        texte,
        cle: f.basename,
        tri: entreeBiblio(f.basename, fm, '{{auteurs}} {{annee}}') || texte,
      });
    }

    if (this.settings.biblioTri !== 'apparition') {
      entrees.sort((a, b) => a.tri.localeCompare(b.tri, 'fr'));
    }

    const lignes = entrees.map((e) => (this.settings.biblioLien === false
      ? e.texte
      : entreeCliquable(e.texte, e.cle, this.settings.biblioLienTexte)));
    const bloc = construireBibliographie(lignes, this.settings.biblioTitre);
    const apres = injecterBibliographie(avant, bloc);
    if (apres === avant) return false;
    await this.ecrire(file.path, apres, file);
    if (!silencieux) new obsidian.Notice(tr('Bibliographie : ') + entrees.length + ' source(s).');
    return true;
  }

  async majBibliographieToutes() {
    const notes = this.notesConvertibles();
    const notice = new obsidian.Notice(tr('Bibliographies…'), 0);
    let n = 0;
    try {
      for (const f of notes) { if (await this.majBibliographie(f, true)) n++; }
    } finally { notice.hide(); }
    new obsidian.Notice(tr('Bibliographie mise à jour dans ') + n + ' note(s).');
  }

  // Une clé désigne-t-elle une annotation ou une note source citable ?
  estCitable(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(String(cle), '');
    if (!dest) return false;
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    return fm['zotflow-anno-key'] !== undefined || !!fm.citationKey;
  }

  async rafraichirCitations(portee) {
    let fichiers;
    if (portee === 'active') {
      const f = this.app.workspace.getActiveFile();
      if (!f || f.extension !== 'md') { new obsidian.Notice(tr('Ouvrez une note.')); return; }
      fichiers = [f];
    } else {
      fichiers = this.notesConvertibles();
    }
    const notice = new obsidian.Notice(tr('Rafraîchissement des citations…'), 0);
    let notes = 0, total = 0;
    try {
      for (const f of fichiers) {
        const avant = await this.app.vault.read(f);
        if (avant.indexOf('|') === -1) continue;
        const r = rafraichirLibelles(avant, (c) => this.libelleCitation(c), (c) => this.estCitable(c));
        if (!r.n || r.texte === avant) continue;
        await this.ecrire(f.path, r.texte, f);
        notes++; total += r.n;
      }
    } finally { notice.hide(); }
    new obsidian.Notice(total
      ? total + ' citation(s) mise(s) à jour dans ' + notes + ' note(s).'
      : 'Toutes les citations sont déjà à jour.');
  }

  // Libellé lisible d'une annotation : « Méric et al., 2009, p. 2 ».
  // Met en forme un libellé « Auteurs, année, p. X » à partir de composants.
  formatCitation(a, page, cle) {
    const vars = {
      auteur: a ? a.court : '',
      auteurs: a ? a.court : '',
      auteursComplets: a ? a.complet : '',
      annee: a ? a.annee : '',
      page: page || '',
      key: cle || '',
    };
    return appliquerModele(this.settings.modeleCitation || '{{auteurs}}, {{annee}}, p. {{page}}', vars)
      .replace(/,\s*p\.\s*(?=$|[;,)])/g, '')
      .replace(/\s*,\s*(?=,)/g, '')
      .replace(/^[\s,;]+|[\s,;]+$/g, '')
      .replace(/\s{2,}/g, ' ');
  }

  // Libellé d'une citation. Trois cas :
  //  - note source : ses propres auteurs, sans page ;
  //  - annotation sans référence citée : auteurs de la source + page ;
  //  - annotation citant un travail tiers : ce travail, suivi de « cité dans »
  //    et de la source réellement consultée — sauf si ce travail figure lui
  //    aussi dans Zotero, auquel cas il est cité directement.
  libelleCitation(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    const fm = dest ? ((this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {}) : {};

    if (fm['zotflow-anno-key'] === undefined) {
      return this.formatCitation(this.auteursDepuisReference('[[' + cle + ']]', ''), '', cle) || cle;
    }

    const pageAnno = fm.page != null ? String(fm.page).replace(/^["']|["']$/g, '').trim() : '';
    const src = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    const libSource = this.formatCitation(
      src ? this.auteursDepuisReference('[[' + src + ']]', dest ? dest.path : '') : null, pageAnno, cle);

    // Références citées distinctes de la source. Une annotation peut en
    // porter plusieurs : elles sont toutes retenues, et non la première
    // seulement. Celles qui figurent dans Zotero sont citées directement,
    // les autres sont regroupées derrière un unique « cité dans ».
    let refs = fm['références-citées'];
    refs = Array.isArray(refs) ? refs : (refs ? [refs] : []);
    const pages = fm['références-pages'] || {};
    const sep = this.settings.separateurCitation || ' ; ';
    const directes = [];
    const indirectes = [];

    for (const rv of refs) {
      const cible = String(rv).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').replace(/#.*/, '').trim();
      if (!cible || cible === src) continue;

      const pageRef = String(pages[cible] != null ? pages[cible] : '').replace(/^["']|["']$/g, '').trim();
      const dansZotero = cible.startsWith('@')
        || !!(this.app.metadataCache.getFirstLinkpathDest(cible, '')
          && ((this.app.metadataCache.getFileCache(
            this.app.metadataCache.getFirstLinkpathDest(cible, '')) || {}).frontmatter || {}).citationKey);

      const libRef = this.formatCitation(
        this.auteursDepuisReference('[[' + cible + ']]', dest ? dest.path : ''), pageRef, cible);
      if (!libRef) continue;

      // Consultée directement : citation simple. Sinon : citation de seconde main.
      (dansZotero ? directes : indirectes).push(libRef);
    }

    const morceaux = [];
    if (directes.length) morceaux.push(directes.join(sep));

    if (indirectes.length) {
      if (this.settings.citationsIndirectesAbregees !== false) {
        // Forme abrégée : la source porte le nombre de travaux qu'elle
        // rapporte. La portée du « cité dans » cesse d'être ambiguë, puisque
        // les emprunts sont rattachés à leur source au lieu d'être alignés
        // à côté des citations directes.
        morceaux.push(libSource + ' ' + this.marqueEmprunt(indirectes.length));
      } else {
        // Forme complète. L'accord au pluriel signale au moins qu'il y a
        // plusieurs emprunts derrière un même « cité dans ».
        const mention = this.settings.citeDans || ', cité dans ';
        // « \b » ne marque pas de frontière après « é », qui n'est pas un
        // caractère de mot : on vise donc explicitement « cité dans ».
        const accorde = indirectes.length > 1
          ? mention.replace(/cité(\s+dans)/, 'cités$1')
          : mention;
        morceaux.push(indirectes.join(sep) + accorde + libSource);
      }
    }
    if (morceaux.length) return morceaux.join(sep);

    return libSource || cle;
  }

  // Motif du compteur, dérivé du modèle de réglage : « ⟨{{n}}⟩ » -> /⟨(\d+)⟩/
  motifEmprunt() {
    const modele = this.settings.citationsMarqueEmprunt || '⟨{{n}}⟩';
    const echappe = modele.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(echappe.replace('\\{\\{n\\}\\}', '(\\d+)').replace('{{n}}', '(\\d+)'));
  }

  // Infobulle listant les travaux rapportés, en liens cliquables. Une seule
  // bulle vit à la fois ; elle se ferme au départ du pointeur.
  ouvrirBulleEmprunts(ancre, cle) {
    this.fermerBulleEmprunts();
    const emprunts = this.empruntsDeAnnotation(cle);
    if (!emprunts.length) return;

    const bulle = document.createElement('div');
    bulle.className = 'zfa-bulle-emprunts';

    const source = this.sourceLisible(cle);
    const entete = bulle.createDiv({ cls: 'zfa-bulle-entete' });
    entete.setText(emprunts.length > 1
      ? 'Travaux rapportés par ' + (source || 'cette source')
      : 'Travail rapporté par ' + (source || 'cette source'));

    for (const e of emprunts) {
      const l = bulle.createDiv({ cls: 'zfa-bulle-item' });
      const a = l.createEl('a', { cls: 'internal-link', text: e.libelle });
      a.setAttr('href', e.cible);
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        this.app.workspace.openLinkText(e.cible, e.chemin, ev.ctrlKey || ev.metaKey);
        this.fermerBulleEmprunts();
      });
    }

    document.body.appendChild(bulle);
    const r = ancre.getBoundingClientRect();
    bulle.style.left = Math.max(8, Math.min(r.left, window.innerWidth - bulle.offsetWidth - 8)) + 'px';
    const dessous = r.bottom + 6;
    bulle.style.top = (dessous + bulle.offsetHeight > window.innerHeight
      ? Math.max(8, r.top - bulle.offsetHeight - 6) : dessous) + 'px';

    // La bulle reste tant que le pointeur est sur elle ou sur le compteur.
    let sortie = null;
    const partir = () => { sortie = window.setTimeout(() => this.fermerBulleEmprunts(), 220); };
    const rester = () => { if (sortie) { window.clearTimeout(sortie); sortie = null; } };
    ancre.addEventListener('mouseleave', partir);
    bulle.addEventListener('mouseenter', rester);
    bulle.addEventListener('mouseleave', partir);
    this._bulleEmprunts = bulle;
  }

  fermerBulleEmprunts() {
    if (this._bulleEmprunts) {
      this._bulleEmprunts.remove();
      this._bulleEmprunts = null;
    }
  }

  // En lecture : le compteur est un morceau de texte dans le lien de citation.
  // On l'isole pour lui accrocher la bulle, sans toucher au lien lui-même.
  enrichirCompteursEmprunts(el) {
    if (!el.querySelectorAll) return;
    const motif = this.motifEmprunt();
    for (const a of el.querySelectorAll('a.internal-link')) {
      if (a.querySelector('.zfa-emprunt')) continue;
      const cle = (a.getAttribute('data-href') || a.getAttribute('href') || '')
        .replace(/#.*$/, '').trim();
      if (!cle) continue;
      for (const noeud of Array.from(a.childNodes)) {
        if (noeud.nodeType !== Node.TEXT_NODE) continue;
        const m = noeud.nodeValue.match(motif);
        if (!m) continue;
        const apres = noeud.splitText(m.index);
        apres.nodeValue = apres.nodeValue.slice(m[0].length);
        const marque = document.createElement('span');
        marque.className = 'zfa-emprunt';
        marque.textContent = m[0];
        marque.setAttribute('aria-label', m[1] + ' travaux rapportés');
        marque.addEventListener('mouseenter', () => this.ouvrirBulleEmprunts(marque, cle));
        a.insertBefore(marque, apres);
        break;
      }
    }
  }

  // Compteur d'emprunts accolé à la source consultée.
  marqueEmprunt(n) {
    const modele = this.settings.citationsMarqueEmprunt || '⟨{{n}}⟩';
    return modele.replace(/\{\{n\}\}/g, String(n));
  }

  // Références rapportées par une annotation, pour l'infobulle du compteur.
  // Rend les cibles telles qu'écrites, afin qu'elles restent cliquables.
  empruntsDeAnnotation(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    if (!dest) return [];
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    if (fm['zotflow-anno-key'] === undefined) return [];

    const src = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    let refs = fm['références-citées'];
    refs = Array.isArray(refs) ? refs : (refs ? [refs] : []);
    const pages = fm['références-pages'] || {};
    const out = [];
    for (const rv of refs) {
      const cible = String(rv).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').replace(/#.*/, '').trim();
      if (!cible || cible === src) continue;
      const dansZotero = cible.startsWith('@')
        || !!(this.app.metadataCache.getFirstLinkpathDest(cible, '')
          && ((this.app.metadataCache.getFileCache(
            this.app.metadataCache.getFirstLinkpathDest(cible, '')) || {}).frontmatter || {}).citationKey);
      if (dansZotero) continue; // citée directement, elle figure déjà en clair
      const page = String(pages[cible] != null ? pages[cible] : '').replace(/^["']|["']$/g, '').trim();
      const libelle = this.formatCitation(
        this.auteursDepuisReference('[[' + cible + ']]', dest.path), page, cible) || cible;
      out.push({ cible, libelle, chemin: dest.path });
    }
    return out;
  }

  // Source consultée d'une annotation, pour l'en-tête de l'infobulle.
  sourceLisible(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    if (!dest) return '';
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    const src = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    if (!src) return '';
    const page = fm.page != null ? String(fm.page).replace(/^["']|["']$/g, '').trim() : '';
    return this.formatCitation(this.auteursDepuisReference('[[' + src + ']]', dest.path), page, cle) || src;
  }



  // Mode « citation classique » : insère « ([[clé|Auteur, année, p. X]]) » au
  // point visé, ou complète le groupe de citations déjà présent à cet endroit.
  attacherCitation(cm, lineNumber, cles, insertOffset) {
    const doc = cm.state.doc;
    const docStr = doc.toString();
    const ligneFin = doc.line(lineNumber);
    const sep = this.settings.separateurCitation || ' ; ';

    // La citation se place toujours AVANT la ponctuation finale. En dépôt sur
    // la phrase, l'offset est déjà calculé ainsi ; en dépôt sur le paragraphe,
    // on vise la ponctuation qui termine la ligne.
    let pos;
    if (insertOffset != null) {
      pos = insertOffset;
    } else {
      const txt = ligneFin.text;
      const mFin = masquerLiens(txt).match(/[.?!…][ \t]*$/);
      if (mFin) {
        let i = mFin.index;
        while (i > 0 && /[ \t\u00a0\u202f]/.test(txt[i - 1])) i--;
        pos = ligneFin.from + i;
      } else {
        pos = ligneFin.to;
      }
    }

    // Ne pas citer deux fois la même annotation dans le voisinage immédiat.
    const voisinage = docStr.slice(Math.max(0, pos - 400), pos + 400);
    const entrees = cles
      .filter((c) => voisinage.indexOf('[[' + c + '|') === -1)
      .map((c) => '[[' + c + '|' + this.libelleCitation(c) + ']]');

    const modif = composerCitation(docStr, pos, entrees, sep);
    if (!modif) return false;
    cm.dispatch({ changes: [modif] });
    return true;
  }

  //#endregion Ariane · bibliographie en note & citations dynamiques

  //#region Ariane · panier d'annotations & dépôt paragraphe
  // ── panier d'annotations & dépôt paragraphe ──────────────────────────────

  attacherAnnotationParagraphe(cm, lineNumber, cles, insertOffset) {
    cles = (Array.isArray(cles) ? cles : [cles]).filter(Boolean);
    if (!cles.length) return false;
    return this.attacherCitation(cm, lineNumber, cles, insertOffset);
  }

  // Retire dynamiquement les définitions de notes de bas de page orphelines
  // (appel disparu) gérées par le plugin. Déclenché, avec anti-rebond, à
  // chaque modification de l'éditeur.
  nettoyageNotesOrphelines(editor) {
    if (!this.settings.nettoyerNotesOrphelines) return;
    if (!editor || !editor.cm) return;
    const cm = editor.cm;
    const docStr = cm.state.doc.toString();
    const ranges = rangesNotesOrphelines(docStr, this.settings.titreSectionNotes || '');
    if (!ranges.length) return;
    cm.dispatch({ changes: ranges.map((r) => ({ from: r.from, to: r.to })) });
  }

  /* ------------------------------ Événements DnD ------------------------- */

  surDragOverParagraphe(e) {
    if (!this.settings.dropSurParagraphe) return;
    const doc = this.docDeEvenement(e);
    const cm = this.cmSousPoint(e.clientX, e.clientY, doc);
    if (!cm) { this.nettoyerZoneDrop(); return; }
    const pos = cm.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null || !this.ligneEstParagraphe(cm.state.doc, cm.state.doc.lineAt(pos).number)) {
      this.nettoyerZoneDrop();
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    // Sur le texte -> mode phrase ; dans la marge gauche du paragraphe -> mode paragraphe.
    if (this.modeDrop(e, doc) === 'phrase' && this.effetPhrase) {
      this.surlignerPhrase(cm, pos);
      return;
    }
    this.effacerSurlignagePhrase();
    const ligneDom = this.ligneDomPour(cm, cm.state.doc.lineAt(pos).from);
    if (ligneDom && ligneDom !== this.zoneDrop) {
      if (this.zoneDrop) this.zoneDrop.classList.remove('zfa-drop-cible');
      ligneDom.classList.add('zfa-drop-cible');
      this.zoneDrop = ligneDom;
    }
  }

  // Détermine le mode de dépôt selon la position du survol : sur le texte
  // (au-dessus d'une .cm-line) -> « phrase » ; dans la marge gauche -> « paragraphe ».
  modeDrop(e, doc) {
    const el = doc.elementFromPoint(e.clientX, e.clientY);
    const surTexte = el && el.closest && el.closest('.cm-line');
    return surTexte ? 'phrase' : 'paragraphe';
  }

  // Retrouve l'élément .cm-line correspondant à une position, même quand le
  // survol a lieu dans la marge (hors de tout .cm-line sous le curseur).
  ligneDomPour(cm, pos) {
    try {
      const d = cm.domAtPos(pos);
      let n = d && d.node;
      if (n && n.nodeType === 3) n = n.parentElement;
      return n && n.closest ? n.closest('.cm-line') : null;
    } catch (e) {
      return null;
    }
  }

  // Surligne, via une décoration CodeMirror, la phrase visée sous le point de dépôt.
  surlignerPhrase(cm, pos) {
    const ligne = cm.state.doc.lineAt(pos);
    const localOff = pos - ligne.from;
    const from = ligne.from + debutPhrase(ligne.text, localOff);
    const to = ligne.from + finDePhrase(ligne.text, localOff);
    // Retire un éventuel surlignage de paragraphe hérité.
    if (this.zoneDrop) { this.zoneDrop.classList.remove('zfa-drop-cible'); this.zoneDrop = null; }
    if (to <= from) { this.effacerSurlignagePhrase(); return; }
    if (this.cmPhrase && this.cmPhrase !== cm) this.effacerSurlignagePhrase();
    if (this.cmPhrase === cm && this.phraseRange && this.phraseRange.from === from && this.phraseRange.to === to) return;
    this.cmPhrase = cm;
    this.phraseRange = { from, to };
    try { cm.dispatch({ effects: this.effetPhrase.of({ from, to }) }); } catch (e) { /* silencieux */ }
  }

  effacerSurlignagePhrase() {
    if (this.cmPhrase && this.effetPhrase) {
      try { this.cmPhrase.dispatch({ effects: this.effetPhrase.of(null) }); } catch (e) { /* silencieux */ }
    }
    this.cmPhrase = null;
    this.phraseRange = null;
  }

  surDropParagraphe(e) {
    if (!this.settings.dropSurParagraphe) return;
    const doc = this.docDeEvenement(e);
    const cm = this.cmSousPoint(e.clientX, e.clientY, doc);
    if (!cm) { this.nettoyerZoneDrop(); return; }
    const pos = cm.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) { this.nettoyerZoneDrop(); return; }
    const n = cm.state.doc.lineAt(pos).number;
    if (!this.ligneEstParagraphe(cm.state.doc, n)) { this.nettoyerZoneDrop(); return; }
    // Dépôt groupé depuis le panier flottant, sinon annotation unique glissée.
    let cles;
    if (this.glisseDepuisPanier && this.panier && this.panier.length) {
      cles = this.panier.slice();
    } else {
      const cle = this.obtenirCleGlissee(e);
      if (!cle) { this.nettoyerZoneDrop(); return; }
      cles = [cle];
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    // Dépôt sur le texte -> fin de la phrase visée ; dans la marge -> paragraphe.
    let insertOffset;
    if (this.modeDrop(e, doc) === 'phrase') {
      const ligne = cm.state.doc.lineAt(pos);
      insertOffset = ligne.from + finDePhraseAvantPonct(ligne.text, pos - ligne.from);
    }
    this.attacherAnnotationParagraphe(cm, n, cles, insertOffset);
    this.nettoyerZoneDrop();
  }

  nettoyerZoneDrop() {
    if (this.zoneDrop) {
      this.zoneDrop.classList.remove('zfa-drop-cible');
      this.zoneDrop = null;
    }
    this.effacerSurlignagePhrase();
  }

  /* --------------------------- Panier flottant --------------------------- */

  basculerPanier() {
    if (this.panierEl) this.fermerPanier();
    else this.creerPanier();
  }

  fermerPanier() {
    if (this.panierEl) {
      this.panierEl.remove();
      this.panierEl = null;
      this.panierListe = null;
    }
  }

  creerPanier() {
    const el = document.createElement('div');
    el.className = 'zfa-panier';
    el.style.top = '80px';
    el.style.right = '30px';

    const header = el.createDiv({ cls: 'zfa-panier-header' });
    this.panierTitre = header.createSpan({ cls: 'zfa-panier-titre', text: tr("Panier de notes") });
    const fermer = header.createSpan({ cls: 'zfa-panier-fermer', text: tr('✕') });
    fermer.onclick = () => this.fermerPanier();

    this.panierListe = el.createDiv({ cls: 'zfa-panier-liste' });

    const pied = el.createDiv({ cls: 'zfa-panier-pied' });
    const poignee = pied.createDiv({ cls: 'zfa-panier-deposer', text: tr('⇱ Glisser sur un paragraphe') });
    poignee.setAttribute('draggable', 'true');
    poignee.addEventListener('dragstart', (e) => {
      this.glisseDepuisPanier = true;
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', 'zfa-panier');
        e.dataTransfer.effectAllowed = 'copy';
      }
    });
    poignee.addEventListener('dragend', () => { this.glisseDepuisPanier = false; });

    const btns = pied.createDiv({ cls: 'zfa-panier-boutons' });
    const bDep = btns.createEl('button', { cls: 'zfa-panier-btn', text: tr('Déposer sur le curseur') });
    bDep.onclick = () => this.deposerPanierSurCurseur();
    const bVide = btns.createEl('button', { cls: 'zfa-panier-btn', text: tr('Vider') });
    bVide.onclick = () => this.viderPanier();

    this.rendreDeplacable(el, header);

    // Recevoir des notes / tâches glissées dans le panier (une ou plusieurs).
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      if (!this.glisseDepuisPanier) el.classList.add('zfa-panier-survol');
    });
    el.addEventListener('dragleave', () => el.classList.remove('zfa-panier-survol'));
    el.addEventListener('drop', (e) => {
      el.classList.remove('zfa-panier-survol');
      if (this.glisseDepuisPanier) return; // ne pas s'auto-recevoir
      const noms = this.notesGlissees(e);
      if (noms.length) {
        e.preventDefault();
        e.stopPropagation();
        for (const n of noms) this.ajouterAuPanier(n);
      }
    });

    document.body.appendChild(el);
    this.panierEl = el;
    this.rendrePanier();
  }

  rendreDeplacable(el, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, actif = false;
    const surMouvement = (e) => {
      if (!actif) return;
      el.style.left = (ox + e.clientX - sx) + 'px';
      el.style.top = (oy + e.clientY - sy) + 'px';
      el.style.right = 'auto';
    };
    const surRelache = () => {
      actif = false;
      document.removeEventListener('mousemove', surMouvement);
      document.removeEventListener('mouseup', surRelache);
    };
    handle.addEventListener('mousedown', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('zfa-panier-fermer')) return;
      const rect = el.getBoundingClientRect();
      ox = rect.left; oy = rect.top; sx = e.clientX; sy = e.clientY;
      el.style.left = rect.left + 'px';
      el.style.top = rect.top + 'px';
      el.style.right = 'auto';
      actif = true;
      document.addEventListener('mousemove', surMouvement);
      document.addEventListener('mouseup', surRelache);
      e.preventDefault();
    });
  }

  ajouterAuPanier(cle) {
    if (!this.panier.includes(cle)) this.panier.push(cle);
    this.rendrePanier();
  }

  retirerDuPanier(cle) {
    this.panier = this.panier.filter((c) => c !== cle);
    this.rendrePanier();
  }

  viderPanier() {
    this.panier = [];
    this.rendrePanier();
  }

  rendrePanier() {
    if (this.panierTitre) {
      this.panierTitre.textContent = tr("Panier de notes") + " (" + this.panier.length + ")";
    }
    if (!this.panierListe) return;
    this.panierListe.empty();
    if (!this.panier.length) {
      this.panierListe.createDiv({ cls: 'zfa-panier-vide', text: tr("Glissez des notes ici…") });
      return;
    }
    for (const cle of this.panier) {
      const item = this.panierListe.createDiv({ cls: 'zfa-panier-item' });
      const titre = this.titreAnnotationCiblee(cle, '') || cle;
      item.createSpan({ cls: 'zfa-panier-item-txt', text: titre });
      const x = item.createSpan({ cls: 'zfa-panier-item-x', text: tr('✕') });
      x.onclick = () => this.retirerDuPanier(cle);
    }
  }

  deposerPanierSurCurseur() {
    const view = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view || !view.editor || !view.editor.cm) {
      new obsidian.Notice(tr('Ouvrez une note en mode édition.'));
      return;
    }
    if (!this.panier.length) {
      new obsidian.Notice(tr('Le panier est vide.'));
      return;
    }
    const cm = view.editor.cm;
    const n = view.editor.getCursor().line + 1;
    if (!this.ligneEstParagraphe(cm.state.doc, n)) {
      new obsidian.Notice(tr('Placez le curseur dans un paragraphe.'));
      return;
    }
    this.attacherAnnotationParagraphe(cm, n, this.panier.slice());
    new obsidian.Notice(this.panier.length + ' annotation(s) déposée(s) en note de bas de page.');
  }

  /* ------------- Tag « orpheline » (annotations à 0 appel) --------------- */

  // Ajoute ou retire le tag orpheline dans l'entête, sans toucher au corps.
  async appliquerTagOrpheline(file, orpheline) {
    const tag = this.settings.tagOrpheline || 'orphelin';
    this.marquerEcriture(file.path);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      let tags = fm.tags;
      if (Array.isArray(tags)) { /* garder */ }
      else if (typeof tags === 'string' && tags.trim()) tags = [tags];
      else tags = [];
      tags = tags.filter((t) => String(t).replace(/^#/, '') !== tag);
      if (orpheline) tags.push(tag);
      if (tags.length) fm.tags = tags;
      else delete fm.tags;
    });
  }

  // Met à jour le tag orpheline sur toutes les annotations selon leur
  // nombre d'appels (notes distinctes qui les citent).
  async synchroniserTagsOrphelines() {
    if (!this.settings.marquerOrphelines) return;
    const tag = this.settings.tagOrpheline || 'orphelin';
    const resolved = this.app.metadataCache.resolvedLinks || {};
    const counts = new Map();
    for (const source in resolved) {
      for (const cible in resolved[source]) {
        if (cible === source) continue;
        counts.set(cible, (counts.get(cible) || 0) + 1);
      }
    }
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (!fm || fm['zotflow-anno-key'] === undefined) continue;
      const orpheline = (counts.get(f.path) || 0) === 0;
      let present = false;
      const tg = fm.tags;
      if (Array.isArray(tg)) present = tg.some((t) => String(t).replace(/^#/, '') === tag);
      else if (typeof tg === 'string') present = tg.replace(/^#/, '') === tag;
      if (orpheline !== present) await this.appliquerTagOrpheline(f, orpheline);
    }
  }

  async retirerTousTagsOrphelines() {
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (!fm || fm['zotflow-anno-key'] === undefined) continue;
      await this.appliquerTagOrpheline(f, false);
    }
  }

  //#endregion Ariane · panier d'annotations & dépôt paragraphe

  //#region Ariane · réglages & profils
  // ── réglages & profils ───────────────────────────────────────────────────

  async loadSettings() {
    const charge = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, charge || {});
    this.settings.correspondancesSuffixe = migrerCorrespondances(this.settings.correspondancesSuffixe);

    // clesTaches ne contient plus que de VRAIES personnalisations de label.
    // On enlève : un préfixe redondant collé dedans (ancien réglage), et les
    // entrées qui répètent juste le concept ou son nom lisible par défaut.
    {
      const ct = this.settings.clesTaches;
      if (ct && typeof ct === 'object') {
        const pre = this.settings.prefixeTaches || '';
        for (const k of Object.keys(ct)) {
          let v = String(ct[k] || '').trim();
          if (pre && v.startsWith(pre)) v = v.slice(pre.length);
          if (!v || v === k || v === Ariane.libelleConcept(k)) delete ct[k];
          else ct[k] = v;
        }
      }
    }
    if (!Array.isArray(this.settings.profils) || this.settings.profils.length === 0) {
      this.settings.profils = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.profils));
    }
    definirLangue(this.settings.langue || 'auto');

    // Reprise des anciens réglages de dossiers vers la table des familles.
    const migrees = this.migrerFamilles();
    if (migrees) console.log('[Ariane] familles de notes reprises des anciens réglages :', migrees);

    // Migration : titre cliquable (ancien modèle par défaut -> nouveau).
    const ancienModele = '**{{title}}**\n\n{{image}}\n\n{{paraphrase}}\n\n{{citation}}\n\nSource : {{source}}\n\n{{references}}';
    if (this.settings.modeleNote === ancienModele) this.settings.modeleNote = DEFAULT_SETTINGS.modeleNote;
  }

  async saveSettings() {
    // Le dossier des tâches peut avoir changé : l'index « référence → fichier »
    // se lit dessus, on le laisse se reconstruire.
    this._invaliderIndexTaches();
    await this.saveData(this.settings);
  }

  /* --------------------- Renommage d'une propriété ---------------------- */

  // Changer le nom d'une propriété dans les réglages ne touche que les
  // écritures À VENIR : les notes déjà écrites gardent l'ancien nom. D'où cet
  // outil, qui reporte l'ancienne valeur sur la nouvelle dans tout le coffre.
  notesAvecPropriete(nom) {
    const cle = String(nom || '').trim();
    if (!cle) return [];
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (fm && Object.prototype.hasOwnProperty.call(fm, cle)) out.push(f);
    }
    return out;
  }

  // Rend { faites, ignorees, echecs }. Une note qui porte déjà la nouvelle
  // propriété n'est pas touchée : on ne remplace jamais une valeur existante.
  async renommerPropriete(ancien, nouveau) {
    const a = String(ancien || '').trim();
    const n = String(nouveau || '').trim();
    if (!a || !n || a === n) return { faites: 0, ignorees: 0, echecs: 0 };
    let faites = 0, ignorees = 0, echecs = 0;
    for (const f of this.notesAvecPropriete(a)) {
      try {
        let saute = false;
        this.marquerEcriture(f.path);
        await this.app.fileManager.processFrontMatter(f, (fm) => {
          if (!Object.prototype.hasOwnProperty.call(fm, a)) { saute = true; return; }
          if (Object.prototype.hasOwnProperty.call(fm, n) && fm[n] !== null && fm[n] !== '') {
            saute = true; return;
          }
          fm[n] = fm[a];
          delete fm[a];
        });
        if (saute) ignorees += 1; else faites += 1;
      } catch (e) {
        echecs += 1;
        console.error('[Ariane] renommage de propriété', f.path, e);
      }
    }
    return { faites, ignorees, echecs };
  }

  /* --------------------------- Profil portable --------------------------- */

  profilExportable(avecOrganisation) {
    const hors = new Set(Ariane.CLES_MACHINE);
    if (!avecOrganisation) for (const k of Ariane.CLES_ETAT) hors.add(k);
    const out = {};
    for (const [k, v] of Object.entries(this.settings)) if (!hors.has(k)) out[k] = v;
    return { ariane: this.manifest.version, profil: out };
  }

  async ecrireProfil(avecOrganisation) {
    const nom = 'Ariane - profil' + (avecOrganisation ? ' (avec organisation)' : '') + '.json';
    const chemin = this.manifest.dir + '/' + nom;
    await this.app.vault.adapter.write(chemin,
      JSON.stringify(this.profilExportable(avecOrganisation), null, 2));
    return chemin;
  }

  // À l'import, on ne touche jamais aux clés de machine, même si le fichier
  // en contient : le chemin de pandoc de quelqu'un d'autre n'a aucun sens ici.
  async importerProfil(texte) {
    let j = null;
    try { j = JSON.parse(texte); } catch (e) { return { erreur: 'Fichier illisible (JSON invalide).' }; }
    const profil = (j && j.profil) || j;
    if (!profil || typeof profil !== 'object') return { erreur: 'Ce fichier ne contient pas de profil.' };
    const machine = new Set(Ariane.CLES_MACHINE);
    let n = 0;
    for (const [k, v] of Object.entries(profil)) {
      if (machine.has(k)) continue;
      if (!(k in DEFAULT_SETTINGS)) continue;   // clé inconnue : on l'ignore
      this.settings[k] = v;
      n += 1;
    }
    await this.saveSettings();
    return { poses: n, version: j && j.ariane };
  }

  //#endregion Ariane · réglages & profils

  //#region Ariane · familles de notes & routage de dossier
  // ── familles de notes & routage de dossier ───────────────────────────────

  /* ------------------------ Familles de notes --------------------------- */

  // Une famille : un libellé, un ou PLUSIEURS dossiers, un préfixe facultatif,
  // et ce qu'Ariane doit en faire. Rien n'y est imposé : c'est l'utilisateur
  // qui décrit son organisation, et non le greffon qui présume la sienne.
  familles() {
    const brut = Array.isArray(this.settings.famillesNotes) ? this.settings.famillesNotes : [];
    return brut.map((f) => ({
      nom: String((f && f.nom) || '').trim(),
      dossiers: (Array.isArray(f && f.dossiers) ? f.dossiers : [])
        .map((d) => String(d || '').trim().replace(/^\/+|\/+$/g, '')).filter(Boolean),
      prefixe: String((f && f.prefixe) || '').trim(),
      aparte: (f && f.aparte) !== false,
      suggestions: !!(f && f.suggestions),
      couleur: String((f && f.couleur) || '').trim(),
      icone: String((f && f.icone) || '').trim(),
      monospace: !!(f && f.monospace),
      alias: !!(f && f.alias),
    })).filter((f) => f.dossiers.length || f.prefixe);
  }

  // Une note appartient à une famille par son dossier — sous-dossiers compris —
  // ou par son préfixe de nom. Le dossier prime : le préfixe n'est qu'un
  // filet de sécurité pour les notes rangées ailleurs.
  familleDuChemin(chemin, basename) {
    const c = String(chemin || '');
    const n = String(basename || c.split('/').pop() || '').replace(/\.md$/i, '');
    const fams = this.familles();
    for (const f of fams) {
      if (f.dossiers.some((d) => c === d + '.md' || c.startsWith(d + '/'))) return f;
    }
    for (const f of fams) {
      if (f.prefixe && n.startsWith(f.prefixe)) return f;
    }
    return null;
  }

  // Tous les dossiers dont les notes nourrissent les suggestions.
  dossiersSuggeres() {
    const out = [];
    for (const f of this.familles()) {
      if (!f.suggestions) continue;
      for (const d of f.dossiers) if (!out.includes(d)) out.push(d);
    }
    return out;
  }

  // Couleur et icône d'un dossier, portées par sa famille.
  styleDuDossier(dossier) {
    const d = String(dossier || '').trim();
    for (const f of this.familles()) {
      if (f.dossiers.includes(d)) return { couleur: f.couleur, icone: f.icone };
    }
    return {};
  }

  dossiersDeFamille(propriete) {
    const out = [];
    for (const f of this.familles()) {
      if (!f[propriete]) continue;
      for (const d of f.dossiers) if (!out.includes(d)) out.push(d);
    }
    return out;
  }

  // Reprise des anciens réglages : l'utilisateur ne doit rien ressaisir. On ne
  // migre qu'une fois, et seulement si la table est encore vide.
  // Propose un rôle par dossier dont le nom s'en approche. On ne remplit que
  // les rôles restés vides : jamais on n'écrase un choix de l'utilisateur.
  proposerRoles() {
    const racines = new Set();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const parts = f.path.split('/');
      for (let i = 1; i <= Math.min(2, parts.length - 1); i++) racines.add(parts.slice(0, i).join('/'));
    }
    const sansAccent = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const indices = [
      ['dossierAnnotations', ['annotation']],
      ['dossierNotesLecture', ['note de lecture', 'notes de lecture', 'lecture']],
      ['dossierReferences', ['reference en attente', 'references en attente', 'en attente']],
      ['dossierTaches', ['tache', 'taches']],
      ['dossierBibliographies', ['bibliographie citee', 'bibliographies citees', 'biblio']],
      ['exportDossier', ['livrable', 'export', 'document']],
      ['tempsDossierJournal', ['journal']],
    ];
    let poses = 0;
    for (const [cle, mots] of indices) {
      if (this.settings[cle]) continue;
      let choisi = null;
      for (const d of racines) {
        const n = sansAccent(d);
        if (mots.some((m) => n.includes(m))) {
          if (!choisi || d.length < choisi.length) choisi = d;
        }
      }
      if (choisi) { this.settings[cle] = choisi; poses += 1; }
    }
    return poses;
  }

  // Propose une famille par dossier qui porte des notes — sous-dossiers
  // compris, car les vôtres comptent : les comptes-rendus et les notes
  // préparatoires vivent sous « Livrables ». Le préfixe est DÉDUIT des noms de
  // fichiers : si toutes les notes d'un dossier commencent pareil, c'en est un.
  familiesProposees() {
    const parDossier = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const parts = f.path.split('/');
      if (parts.length < 2) continue;
      const dossier = parts.slice(0, -1).join('/');
      if (dossier.startsWith('.')) continue;
      if (!parDossier.has(dossier)) parDossier.set(dossier, []);
      parDossier.get(dossier).push(f.basename);
    }
    // Un dossier dont TOUS les sous-dossiers sont déjà proposés n'apporte rien.
    const deja = new Set();
    for (const f of this.familles()) for (const d of f.dossiers) deja.add(d);
    const out = [];
    for (const [dossier, noms] of [...parDossier.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))) {
      if (deja.has(dossier) || noms.length < 2) continue;
      // Annotations et notes de lecture sont rangées PAR SOURCE : des dizaines
      // de sous-dossiers « @citekey », qui n'ont pas à devenir autant de
      // familles. On les écarte par leur rôle et par leur nom.
      const parents = [this.settings.dossierAnnotations, this.settings.dossierNotesLecture].filter(Boolean);
      if (parents.some((r) => dossier.startsWith(r + '/'))) continue;
      if (dossier.split('/').pop().startsWith('@')) continue;
      out.push({
        nom: dossier.replace(/^\d+\s*-\s*/, '').split('/').pop(),
        dossiers: [dossier],
        prefixe: prefixeCommun(noms),
        aparte: true, suggestions: false, couleur: '', icone: '',
        monospace: false, alias: false,
      });
    }
    return out;
  }

  migrerFamilles() {
    if (Array.isArray(this.settings.famillesNotes) && this.settings.famillesNotes.length) return 0;
    const s = this.settings;
    const styles = s.suggStylesDossiers || {};
    const mono = new Set((s.dossiersMonospace || []).map((x) => String(x).trim()));
    const alias = new Set((s.dossiersAliasExplorateur || []).map((x) => String(x).trim()));
    const parDossier = new Map();
    const ajouter = (dossier, champs) => {
      const d = String(dossier || '').trim().replace(/^\/+|\/+$/g, '');
      if (!d) return;
      const f = parDossier.get(d) || {
        nom: d.replace(/^\d+\s*-\s*/, '').split('/').pop(),
        dossiers: [d], prefixe: '', aparte: true, suggestions: false,
        couleur: '', icone: '', monospace: false, alias: false,
      };
      Object.assign(f, champs);
      parDossier.set(d, f);
    };
    for (const d of (s.suggDossiersCandidats || [])) {
      ajouter(d, { suggestions: true, couleur: (styles[d] || {}).couleur || '', icone: (styles[d] || {}).icone || '' });
    }
    if (s.dossierNotesConceptuelles) {
      ajouter(s.dossierNotesConceptuelles, {
        nom: 'Note conceptuelle',
        prefixe: s.prefixeNoteConceptuelle || '',
        aparte: s.aparteConceptuelles !== false,
      });
    }
    for (const d of mono) ajouter(d, { monospace: true });
    for (const d of alias) ajouter(d, { alias: true });
    if (!parDossier.size) return 0;
    this.settings.famillesNotes = [...parDossier.values()];
    return this.settings.famillesNotes.length;
  }

  //#endregion Ariane · familles de notes & routage de dossier

  //#region Ariane · dossiers & garde-fous d'écriture
  // ── dossiers & garde-fous d'écriture ─────────────────────────────────────

  get dossierA() {
    return this.settings.dossierAnnotations;
  }
  get dossierR() {
    return this.settings.dossierReferences;
  }

  get dossierT() {
    return this.settings.dossierTaches || '8 - Tâches';
  }

  /* ------------------------- Utilitaires d'écriture ------------------------- */

  marquerEcriture(chemin) {
    this.ecrituresRecentes.set(chemin, Date.now());
  }

  ecritePlugin(chemin) {
    const t = this.ecrituresRecentes.get(chemin);
    return t !== undefined && Date.now() - t < FENETRE_ECRITURE_MS;
  }

  antirebond(cle, fn, delai) {
    clearTimeout(this.antirebonds.get(cle));
    this.antirebonds.set(
      cle,
      setTimeout(() => {
        this.antirebonds.delete(cle);
        Promise.resolve(fn()).catch((e) => console.error('[Ariane]', e));
      }, delai || DELAI_ANTIREBOND_MS)
    );
  }

  async ecrire(chemin, contenu, fichierExistant) {
    this.marquerEcriture(chemin);
    const f = fichierExistant || this.app.vault.getAbstractFileByPath(chemin);
    if (f instanceof obsidian.TFile) await this.app.vault.modify(f, contenu);
    else await this.app.vault.create(chemin, contenu);
  }

  async supprimerFichier(file) {
    this.marquerEcriture(file.path);
    await this.app.fileManager.trashFile(file);
  }

  async assurerDossier(chemin) {
    if (!this.app.vault.getAbstractFileByPath(chemin)) {
      this.marquerEcriture(chemin);
      await this.app.vault.createFolder(chemin);
    }
  }

  nettoyerNomFichier(nom) {
    return nom.replace(/[\\/:*?"<>|]/g, '').trim();
  }

  nomFichierAnnotation(bloc) {
    const brut = appliquerModele(this.settings.formatNomFichier || '{{key}}_{{title}}', {
      key: bloc.cle,
      title: bloc.titre,
    });
    const nom = this.nettoyerNomFichier(brut).replace(/[.\s]+$/, '');
    return nom || bloc.cle;
  }

  indexAnnotationsParCle() {
    const map = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (fm && fm['zotflow-auto'] === true && fm['zotflow-anno-key']) {
        map.set(String(fm['zotflow-anno-key']), f);
      }
    }
    return map;
  }

  //#endregion Ariane · dossiers & garde-fous d'écriture

  //#region Ariane · index Zotero
  // ── index Zotero ─────────────────────────────────────────────────────────

  /* ------------------------------ Index Zotero ------------------------------ */

  // Construit une entrée d'index Zotero à partir du frontmatter d'un fichier.
  // Renvoie toujours un objet ; « citkey » vide = ce n'est pas une source Zotero.
  entreeIndex(file) {
    const fm = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || {};
    const citkey = fm.citationKey || (file.basename.startsWith('@') ? file.basename.slice(1) : '');
    const creators = fm.creators
      ? (Array.isArray(fm.creators) ? fm.creators : [fm.creators]).map(sansLien)
      : [];
    const surnames = creators
      .map((c) => sansAccents(String(c).trim().split(/\s+/).pop()))
      .filter((x) => x.length > 0);
    const anneeMatch = String(fm.year || fm.date || '').match(/\d{4}/);
    const creatorsFull = [];
    for (const c of creators) {
      const nom = nomCompletAuteur(c);
      if (nom && !creatorsFull.includes(nom)) creatorsFull.push(nom);
    }
    return {
      basename: file.basename,
      citkey,
      premier: surnames[0] || '',
      surnames,
      creatorsFull,
      titre: fm.title || '',
      doi: normDoi(fm.doi),
      annee: anneeMatch ? anneeMatch[0] : '',
    };
  }

  construireIndexZotero() {
    const idx = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const e = this.entreeIndex(file);
      if (e.citkey) idx.push(e);
    }
    return idx;
  }

  estSourceZoteroFrontmatter(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache ? cache.frontmatter : null;
    return !!((fm && fm.citationKey) || file.basename.startsWith('@'));
  }

  //#endregion Ariane · index Zotero

  //#region Ariane · atomisation (orchestration)
  // ── atomisation (orchestration) ──────────────────────────────────────────

  /* --------------------------- Atomisation source --------------------------- */

  async commandeNoteActive() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new obsidian.Notice(tr('Aucune note active.'));
      return;
    }
    const contenu = await this.app.vault.read(file);
    if (!contenu.includes(this.settings.marqueurSource)) {
      new obsidian.Notice(tr("Cette note ne contient pas d'annotations reconnues."));
      return;
    }
    await this.atomiseSource(file);
  }

  async atomiserTout() {
    let n = 0;
    for (const file of this.app.vault.getMarkdownFiles()) {
      const contenu = await this.app.vault.read(file);
      if (contenu.includes(this.settings.marqueurSource)) {
        await this.atomiseSource(file);
        n++;
      }
    }
    new obsidian.Notice(tr('Ariane : ') + n + ' source(s) atomisée(s).');
  }

  async atomiseSource(file) {
    const cfg = this.settings;
    const contenu = await this.app.vault.read(file);
    if (!contenu.includes(cfg.marqueurSource)) return;

    const idx = this.construireIndexZotero();
    const blocs = extraireBlocs(contenu, cfg);

    // Dossier cible des annotations : sous-dossier par source si activé.
    const dossierCible = cfg.regrouperParSource
      ? this.dossierA + '/' + this.nettoyerNomFichier(file.basename)
      : this.dossierA;

    // Aucune annotation compatible : retirer les annotations désormais
    // orphelines de cette source, puis le sous-dossier une fois vidé.
    if (blocs.length === 0) {
      if (cfg.propagerSuppressions) {
        await this.nettoyerSupprimees(file.basename, new Set());
      }
      if (cfg.regrouperParSource) {
        const d = this.app.vault.getAbstractFileByPath(dossierCible);
        if (d instanceof obsidian.TFolder && d.children.length === 0) {
          this.marquerEcriture(dossierCible);
          await this.app.fileManager.trashFile(d);
        }
      }
      return;
    }

    await this.assurerDossier(this.dossierA);
    if (dossierCible !== this.dossierA) await this.assurerDossier(dossierCible);

    let creees = 0;
    let majes = 0;
    let renommees = 0;
    const clesPresentes = new Set();
    const parCle = this.indexAnnotationsParCle();
    const canoniques = this.indexCanoniques();

    for (const bloc of blocs) {
      clesPresentes.add(bloc.cle);

      for (const r of bloc.refs) {
        if (r.estAuteurSeul) continue; // auteur seul : pas de note de référence
        const z = cfg.rattachementZotero ? trouverSourceZotero(r, idx) : null;
        if (!z) await this.assurerReference(r, canoniques);
      }

      const fmSource = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || {};
      const canon = construireNote(bloc, file.basename, idx, cfg,
        { collections: fmSource.collections, canoniques });
      const existant = parCle.get(bloc.cle);

      const base = this.nomFichierAnnotation(bloc);
      let cible = dossierCible + '/' + base + '.md';
      const occupant = this.app.vault.getAbstractFileByPath(cible);
      if (occupant instanceof obsidian.TFile && (!existant || occupant.path !== existant.path)) {
        cible = dossierCible + '/' + base + ' (' + bloc.cle + ').md';
      }

      if (existant instanceof obsidian.TFile) {
        if (existant.path !== cible) {
          this.marquerEcriture(existant.path);
          this.marquerEcriture(cible);
          await this.app.fileManager.renameFile(existant, cible);
          renommees++;
        }
        const actuel = await this.app.vault.read(existant);
        if (actuel !== canon) {
          await this.ecrire(existant.path, canon, existant);
          majes++;
        }
      } else {
        await this.ecrire(cible, canon);
        creees++;
      }
    }

    if (cfg.propagerSuppressions) {
      await this.nettoyerSupprimees(file.basename, clesPresentes);
    }

    // Notes d'auteur (nom complet) pour les auteurs de cette source.
    if (cfg.liensAuteurs) {
      const entreeSrc = idx.find((z) => z.basename === file.basename);
      await this.assurerNotesAuteurs(file.basename, (entreeSrc && entreeSrc.creatorsFull) || []);
    }

    if (creees || majes || renommees) {
      new obsidian.Notice(tr('ZotFlow [') + file.basename + '] : ' + creees + ' créée(s), ' + majes + ' maj, ' + renommees + ' renommée(s).'
      );
    }
  }

  //#endregion Ariane · atomisation (orchestration)

  //#region Ariane · références en attente
  // ── références en attente ────────────────────────────────────────────────

  // Nom canonique par clé de libellé. Deux écritures qui ne diffèrent que par
  // une conjonction, un accent, un trait d'union ou une virgule désignent la
  // même référence : « Castan~er » et « Castaner », « Gentner et al., » et
  // « Gentner, et al., ». Il n'y a rien à arbitrer là-dedans, c'est
  // déterministe, et cela se règle à la création plutôt qu'après coup.
  indexCanoniques() {
    const m = new Map();
    const dossier = this.dossierR;
    if (!dossier) return m;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(dossier + '/')) continue;
      const k = cleLibelle(f.basename);
      if (!k) continue;
      const ancien = m.get(k);
      if (!ancien) { m.set(k, f.basename); continue; }
      // Départage, dans cet ordre et sans dépendre de l'ordre des fichiers, qui
      // n'est pas garanti : d'abord la forme normalisée sur les conjonctions,
      // puis la plus petite dans l'ordre des caractères. Ce second critère
      // retient les formes lisibles : « Castaner » avant « Castan~er »,
      // « Gentner et al. » avant « Gentner, et al. », « Garcia-Aristizabal »
      // avant « GarciaAristizabal ».
      const normNeuf = normaliserConjAuteurs(f.basename) === f.basename;
      const normAncien = normaliserConjAuteurs(ancien) === ancien;
      if (normNeuf !== normAncien) { if (normNeuf) m.set(k, f.basename); continue; }
      if (f.basename < ancien) m.set(k, f.basename);
    }
    return m;
  }

  // Rend le nom de note à employer : celui qui existe déjà sous une écriture
  // équivalente, sinon celui de la référence, la note étant alors créée.
  async assurerReference(ref, canoniques) {
    const k = cleLibelle(ref.nom);
    const deja = canoniques && k ? canoniques.get(k) : null;
    if (deja) return deja;
    const nom = this.nettoyerNomFichier(ref.nom);
    const chemin = this.dossierR + '/' + nom + '.md';
    if (!this.app.vault.getAbstractFileByPath(chemin)) {
      await this.assurerDossier(this.dossierR);
      await this.ecrire(chemin, construireReference(ref, this.settings));
    }
    if (canoniques && k) canoniques.set(k, nom);
    return nom;
  }

  // Renomme les notes de référence « … et … » / « … and … » en « … & … »
  // (en conservant « et al. »), via l'API Obsidian pour préserver les liens.
  // « March et Smith, 1995 » et « March & Smith, 1995 » sont la même référence.
  // parseNomReference normalise déjà les conjonctions à la création, donc seules
  // les notes antérieures à ce garde-fou subsistent. Renommer ne suffit pas :
  // quand la forme normalisée existe déjà, il faut FUSIONNER, ce que l'ancienne
  // version refusait de faire en comptant un « conflit ». Elle échouait donc
  // exactement sur les cas qui la justifient.
  async normaliserConjonctionsReferences() {
    const dossier = this.dossierR;
    const fichiers = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(dossier + '/'));
    let renommees = 0, fusionnees = 0, liens = 0, echecs = 0;
    const avis = new obsidian.Notice(tr('Normalisation…'), 0);
    for (const f of fichiers) {
      const nouveauNom = this.nettoyerNomFichier(normaliserConjAuteurs(f.basename));
      if (nouveauNom === f.basename) continue;
      const cible = dossier + '/' + nouveauNom + '.md';
      const existante = this.app.vault.getAbstractFileByPath(cible);
      if (existante) {
        const c = this.indexCitations().get(f.basename) || { total: 0, sources: new Map() };
        const n = await this.fusionnerReferences(
          { nom: f.basename, fichier: f, citations: c.total }, nouveauNom, true);
        fusionnees += 1; liens += n;
        avis.setMessage(tr('Normalisation : ') + (renommees + fusionnees) + ' / ' + fichiers.length);
        continue;
      }
      try {
        await this.app.fileManager.renameFile(f, cible);
        renommees += 1;
      } catch (e) {
        echecs += 1;
        console.error('[Ariane] normalisation', f.basename, e);
      }
    }
    avis.hide();
    new obsidian.Notice(tr('Conjonctions : ') + renommees + ' ' + tr('renommée(s)')
      + ', ' + fusionnees + ' ' + tr('fusionnée(s)') + ' (' + liens + ' ' + tr('lien(s)') + ')'
      + (echecs ? ', ' + echecs + ' ' + tr('en échec') : '') + '.', 10000);
  }

  async nettoyerSupprimees(sourceBasename, clesPresentes) {
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (!fm || fm['zotflow-auto'] !== true) continue;
      if (!String(fm['zotflow-source'] || '').includes(sourceBasename)) continue;
      const cle = fm['zotflow-anno-key'];
      if (cle && !clesPresentes.has(cle)) {
        await this.supprimerAnnotation(f, cle);
      }
    }
  }

  async supprimerAnnotation(file, cle) {
    await this.supprimerFichier(file);
    if (this.settings.propagerSuppressions) await this.retirerLiens(cle);
  }

  // Propagation de la suppression d'une SOURCE (supprimée dans Zotero) :
  // retire toutes ses annotations, son sous-dossier vidé, et les fiches
  // auteurs qui ne dépendaient que de cette source.
  async surSuppressionSource(basename) {
    const annotations = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (!fm || fm['zotflow-auto'] !== true) continue;
      const s = String(fm['zotflow-source'] || '')
        .replace(/^\[\[|\]\]$/g, '')
        .replace(/\|.*$/, '')
        .trim();
      if (s === basename) annotations.push({ f, cle: fm['zotflow-anno-key'] });
    }
    const dossierSource = this.dossierA + '/' + this.nettoyerNomFichier(basename);
    const dossier = this.app.vault.getAbstractFileByPath(dossierSource);
    const dossierExiste = dossier instanceof obsidian.TFolder;
    // Rien qui rattache ce fichier à une source atomisée : on n'y touche pas.
    if (annotations.length === 0 && !dossierExiste) return;

    for (const { f, cle } of annotations) {
      if (cle) await this.supprimerAnnotation(f, cle);
      else await this.supprimerFichier(f);
    }

    // Sous-dossier de la source, une fois vidé.
    const d = this.app.vault.getAbstractFileByPath(dossierSource);
    if (d instanceof obsidian.TFolder && d.children.length === 0) {
      this.marquerEcriture(dossierSource);
      await this.app.fileManager.trashFile(d);
    }

    await this.nettoyerAuteursSource(basename);
  }

  // Fiches auteurs pointant vers une source supprimée : retire le lien ; si la
  // fiche ne pointe plus vers aucune source, elle est mise à la corbeille.
  async nettoyerAuteursSource(basename) {
    if (!this.settings.liensAuteurs) return;
    const dossier = this.settings.dossierAuteurs;
    if (!(this.app.vault.getAbstractFileByPath(dossier) instanceof obsidian.TFolder)) return;
    const lien = '[[' + basename + ']]';
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(dossier + '/')) continue;
      const contenu = await this.app.vault.read(f);
      if (!contenu.includes(lien)) continue;
      const lignes = contenu.split('\n').filter((l) => !l.includes(lien));
      const resteUnLien = /\[\[[^\]]+\]\]/.test(lignes.join('\n'));
      const cache = this.app.metadataCache.getFileCache(f);
      const estFicheAuteur = !!(cache && cache.frontmatter && cache.frontmatter.type === 'auteur');
      if (!resteUnLien && estFicheAuteur) {
        await this.supprimerFichier(f);
      } else {
        const nouveau = lignes.join('\n');
        if (nouveau !== contenu) await this.ecrire(f.path, nouveau, f);
      }
    }
  }

  async retirerLiens(cible) {
    const re = new RegExp('!?\\[\\[' + echapperRegex(cible) + '(\\|[^\\]]*)?\\]\\]', 'g');
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.path.startsWith(this.dossierA + '/')) continue;
      const contenu = await this.app.vault.read(f);
      re.lastIndex = 0;
      if (!re.test(contenu)) continue;

      const lignes = contenu.split('\n').map((l) => {
        re.lastIndex = 0;
        if (!re.test(l)) return l;
        re.lastIndex = 0;
        return l
          .replace(re, '')
          .replace(/[ \t]{2,}/g, ' ')
          .replace(/\s+;\s*$/, '')
          .replace(/^\s*;\s*/, '')
          .replace(/[ \t]+$/g, '');
      });
      const nettoyees = lignes.filter((l) => !/^\s*([-*+]|\d+\.)\s*$/.test(l));
      const nouveau = nettoyees.join('\n');
      if (nouveau !== contenu) await this.ecrire(f.path, nouveau, f);
    }
  }

  /* ------------------------------ Verrouillage ------------------------------ */

  async verrouiller(file) {
    if (!this.settings.verrouillage) return;
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache ? cache.frontmatter : null;
    if (!fm || fm['zotflow-auto'] !== true) return;

    const cle = fm['zotflow-anno-key'];
    const srcNom = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '');
    if (!cle || !srcNom) return;

    const source = this.app.metadataCache.getFirstLinkpathDest(srcNom, file.path);
    if (!source) return;

    const contenu = await this.app.vault.read(source);
    const blocs = extraireBlocs(contenu, this.settings);
    const bloc = blocs.find((b) => b.cle === cle);
    if (!bloc) {
      if (this.settings.propagerSuppressions) await this.supprimerAnnotation(file, cle);
      return;
    }
    const idx = this.construireIndexZotero();
    const fmSrc = (this.app.metadataCache.getFileCache(source) || {}).frontmatter || {};
    const canon = construireNote(bloc, source.basename, idx, this.settings, { collections: fmSrc.collections });
    const actuel = await this.app.vault.read(file);
    if (actuel !== canon) await this.ecrire(file.path, canon, file);
  }

  /* ------------------------ Rattachement Zotero (réf.) ----------------------- */

  async rattacherReferencesZotero(zoteroFile) {
    if (!this.settings.rattachementZotero) return;
    const entree = this.entreeIndex(zoteroFile);
    const creatorsFull = entree.creatorsFull;
    if (!entree.premier || !entree.annee) return;

    if (!this.app.vault.getAbstractFileByPath(this.dossierR)) return;
    // Index complet (pour juger l'unicité d'un appariement fort).
    const index = this.settings.rattachementAutoCertain ? this.construireIndexZotero() : null;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierR + '/')) continue;
      const ref = parseNomReference(f.basename, this.settings);
      if (!ref) continue;
      if (ref.annee && ref.annee4 && ref.annee !== ref.annee4) continue; // suffixe -> assistant
      if (appariementSource(ref, entree)) {
        // Correspondance CERTAINE (unique appariement fort dans toute la
        // bibliothèque) -> rattachement automatique, sans confirmation.
        const certaine = index && trouverSourceZotero(ref, index) === zoteroFile.basename;
        if (!certaine && !(await this.deciderRattachement(f.basename, zoteroFile, entree))) continue;
        await this.remplacerLiens(f.basename, zoteroFile.basename);
        await this.supprimerFichier(f);
        await this.assurerNotesAuteurs(zoteroFile.basename, creatorsFull);
      }
    }
  }

  // Balaye toutes les références en attente et rattache automatiquement celles
  // qui ont une correspondance Zotero certaine (unique appariement fort), sans
  // confirmation. Les cas ambigus (plusieurs candidats, « et al. », 2005a/b)
  // sont laissés à l'assistant.
  async rattacherToutesReferences() {
    if (!this.app.vault.getAbstractFileByPath(this.dossierR)) {
      new obsidian.Notice(tr('Aucun dossier de références en attente.'));
      return;
    }
    const index = this.construireIndexZotero();
    let attachees = 0, ambigues = 0, sansSource = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierR + '/')) continue;
      const ref = parseNomReference(f.basename, this.settings);
      if (!ref) continue;
      if (ref.annee && ref.annee4 && ref.annee !== ref.annee4) { ambigues++; continue; }
      const base = trouverSourceZotero(ref, index);
      if (base) {
        await this.remplacerLiens(f.basename, base);
        await this.supprimerFichier(f);
        const e = index.find((z) => z.basename === base);
        if (e) await this.assurerNotesAuteurs(base, e.creatorsFull || []);
        attachees++;
      } else {
        (candidatsSource(ref, index).length ? (ambigues++) : (sansSource++));
      }
    }
    new obsidian.Notice(tr('Références : ') + attachees + ' rattachée(s) automatiquement, ' + ambigues +
      ' ambiguë(s) (assistant), ' + sansSource + ' sans source Zotero.'
    );
  }

  // Notes d'auteur dédiées : pour chaque auteur (nom complet Zotero) d'une
  // source, garantit une note Auteurs/<Nom complet>.md qui pointe vers la
  // source. Entièrement sous contrôle du plugin (indépendant de ZotFlow).
  async assurerNotesAuteurs(sourceBasename, auteursFull) {
    if (!this.settings.liensAuteurs || !auteursFull || auteursFull.length === 0) return;
    const dossier = this.settings.dossierAuteurs;
    await this.assurerDossier(dossier);
    const lien = '[[' + sourceBasename + ']]';
    for (const auteur of auteursFull) {
      const chemin = dossier + '/' + this.nettoyerNomFichier(auteur) + '.md';
      const f = this.app.vault.getAbstractFileByPath(chemin);
      const { nom, prenom } = separerNomPrenom(auteur);
      if (f instanceof obsidian.TFile) {
        const contenu = await this.app.vault.read(f);
        if (!contenu.includes(lien)) {
          await this.ecrire(chemin, contenu.replace(/\s*$/, '') + '\n' + lien + '\n', f);
        }
        // Rétro-remplit nom/prénom si absents.
        const fmc = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
        const manque = (nom && !fmc.nom) || (prenom && (fmc['prénom'] == null || fmc['prénom'] === ''));
        if (manque) {
          this.marquerEcriture(f.path);
          await this.app.fileManager.processFrontMatter(f, (fm) => {
            if (nom && !fm.nom) fm.nom = nom;
            if (prenom && (fm['prénom'] == null || fm['prénom'] === '')) fm['prénom'] = prenom;
          });
        }
      } else {
        const tete = '---\ntype: auteur\n'
          + (nom ? 'nom: ' + JSON.stringify(nom) + '\n' : '')
          + (prenom ? 'prénom: ' + JSON.stringify(prenom) + '\n' : '')
          + '---\n\n';
        await this.ecrire(chemin, tete + lien + '\n');
      }
    }
  }

  // Tranche un rattachement ambigu avec le modèle local. Renvoie true, false,
  // ou null si le modèle est injoignable (on retombe alors sur la fenêtre).
  async deciderRattachementIA(refNom, entree) {
    try {
      const auteurs = (entree.creatorsFull || []).join(', ');
      const prompt =
        'Tu aides un chercheur à relier une référence citée à une fiche bibliographique.\n\n'
        + 'Référence citée, telle qu\'elle apparaît dans un texte :\n"' + refNom + '"\n\n'
        + 'Fiche candidate :\n'
        + '- Auteurs : ' + (auteurs || '(inconnus)') + '\n'
        + '- Année : ' + (entree.annee || '(inconnue)') + '\n'
        + '- Titre : ' + (entree.titre || '(inconnu)') + '\n\n'
        + 'Désignent-elles le même travail ? Sois prudent : en cas de doute sérieux '
        + '(auteurs différents, homonymie possible, année incohérente), réponds false.\n'
        + 'Réponds UNIQUEMENT en JSON : {"meme": true} ou {"meme": false}.';
      const brut = await this.genererJson(prompt, 64);
      if (!brut) return null;
      let obj = null;
      try { obj = JSON.parse(brut); } catch (e) {
        const m = brut.match(/\{[\s\S]*\}/);
        if (m) { try { obj = JSON.parse(m[0]); } catch (e2) { obj = null; } }
      }
      if (!obj) return null;
      const v = obj.meme !== undefined ? obj.meme : obj.same;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return /^(true|oui|yes)$/i.test(v.trim());
      return null;
    } catch (e) {
      console.debug('[Ariane] rattachement IA', e);
      return null;
    }
  }

  // Décision pour un couple (référence en attente, fiche Zotero) : mémoire
  // persistante d'abord, puis modèle local, puis vous. Une question posée une
  // fois ne revient jamais, même après une nouvelle synchronisation zotflow.
  async deciderRattachement(refNom, zoteroFile, entree) {
    if (!this.settings.rattachementsDecides) this.settings.rattachementsDecides = {};
    const memo = this.settings.rattachementsDecides;
    const cle = refNom + ' => ' + zoteroFile.basename;
    if (Object.prototype.hasOwnProperty.call(memo, cle)) return memo[cle] === true;

    let ok = null;
    if (this.settings.rattachementIA !== false) {
      ok = await this.deciderRattachementIA(refNom, entree);
    }
    if (ok === null) {
      ok = await this.confirmerRattachement(refNom, zoteroFile.basename, entree.creatorsFull);
    }
    memo[cle] = ok === true;
    await this.saveSettings();
    return ok === true;
  }

  // Fenêtre de validation d'un rattachement (anti-homonymie). Renvoie une
  // promesse booléenne. Sans validation activée, renvoie true directement.
  confirmerRattachement(refNom, sourceBasename, auteursFull) {
    if (!this.settings.validationRattachement) return Promise.resolve(true);
    const cle = refNom + '|' + sourceBasename;
    if (this.rattachementsIgnores && this.rattachementsIgnores.has(cle)) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      const texte =
        'Rattacher la référence citée « ' + refNom + ' » à la source Zotero « ' +
        sourceBasename + ' »' +
        (auteursFull && auteursFull.length ? ' (auteurs : ' + auteursFull.join(', ') + ')' : '') +
        ' ? Vérifiez qu\'il ne s\'agit pas d\'un homonyme.';
      new ConfirmationRattachement(this.app, texte, (ok) => {
        if (!ok && this.rattachementsIgnores) this.rattachementsIgnores.add(cle);
        resolve(ok);
      }).open();
    });
  }

  // Assistant : lie la note de référence active (ex. « Aven, 2005a ») à la
  // bonne fiche Zotero parmi les candidats auteur+année, mémorise le choix,
  // remplace les liens et retire la note provisoire.
  async assistantLiageReference() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md' || !file.path.startsWith(this.dossierR + '/')) {
      new obsidian.Notice(tr('Ouvrez une note de référence (dossier « ') + this.dossierR + ' »).');
      return;
    }
    const ref = parseNomReference(file.basename, this.settings);
    if (!ref) {
      new obsidian.Notice(tr('Nom de référence non reconnu (attendu « Auteur, Année »).'));
      return;
    }
    const candidats = candidatsSource(ref, this.construireIndexZotero()).map((c) => c.entree);
    if (!candidats.length) {
      new obsidian.Notice(tr('Aucune fiche Zotero pour « ') + (ref.premierAuteur || '') + ', ' + (ref.annee4 || ref.annee) + ' ».');
      return;
    }
    new ChoixSourceModal(this.app, file.basename, candidats, async (choix) => {
      if (!choix) return;
      if (!this.settings.correspondancesSuffixe) this.settings.correspondancesSuffixe = {};
      this.settings.correspondancesSuffixe[ref.nom] = { __defaut: choix };
      await this.saveSettings();
      await this.remplacerLiens(file.basename, choix);
      const entree = candidats.find((c) => c.basename === choix);
      if (entree) await this.assurerNotesAuteurs(choix, entree.creatorsFull || []);
      await this.supprimerFichier(file);
      new obsidian.Notice(tr('Référence « ') + file.basename + ' » liée à « ' + choix + ' ».');
    }).open();
  }

  async remplacerLiens(ancien, nouveau) {
    const re = new RegExp('\\[\\[' + echapperRegex(ancien) + '(\\|[^\\]]*)?\\]\\]', 'g');
    for (const f of this.app.vault.getMarkdownFiles()) {
      const contenu = await this.app.vault.read(f);
      re.lastIndex = 0;
      if (!re.test(contenu)) continue;
      const nouveauContenu = contenu.replace(re, '[[' + nouveau + ']]');
      if (nouveauContenu !== contenu) await this.ecrire(f.path, nouveauContenu, f);
    }
  }

  /* ===================== Arbitrage des références en attente ================ *
   * Mesuré sur un vrai coffre : sur 631 références en attente, 19 seulement se
   * rattachent par auteur et année. Les autres demandent un arbitrage humain,
   * et pour arbitrer il faut voir ce que la référence désigne réellement. D'où
   * la résolution par la bibliographie de la source citante : l'article qui
   * cite « Aven & Renn, 2009a » donne dans sa propre liste de références le
   * titre et le DOI de ce qu'il désigne.
   * ========================================================================= */

  // Le rattachement complet : mémoriser le choix, réécrire tous les liens du
  // coffre, créer les notes d'auteurs, retirer la note provisoire. C'est le
  // même geste que l'assistant sur note active, factorisé pour que les deux
  // chemins ne divergent jamais.
  async rattacherReference(entree, cible) {
    if (!cible) return;
    if (!this.settings.correspondancesSuffixe) this.settings.correspondancesSuffixe = {};
    this.settings.correspondancesSuffixe[entree.nom] = { __defaut: cible };
    await this.saveSettings();
    await this.remplacerLiens(entree.nom, cible);
    const z = this.construireIndexZotero().find((x) => x.basename === cible);
    if (z) await this.assurerNotesAuteurs(cible, z.creatorsFull || []);
    await this.supprimerFichier(entree.fichier);
    new obsidian.Notice(tr('Référence « ') + entree.nom + ' » liée à « ' + cible + ' ».');
  }

  // « à acquérir » ou « écartée », inscrit dans la note elle-même pour que la
  // décision survive à une réinstallation du greffon.
  async marquerReference(entree, etat) {
    const f = entree.fichier;
    const contenu = await this.app.vault.read(f);
    let neuf;
    if (/^---\n[\s\S]*?\n---/.test(contenu)) {
      const sansLigne = contenu.replace(/^(---\n[\s\S]*?)^arbitrage:.*\n([\s\S]*?---)/m, '$1$2');
      neuf = etat
        ? sansLigne.replace(/^(---\n)/, '$1arbitrage: ' + JSON.stringify(etat) + '\n')
        : sansLigne;
    } else {
      neuf = etat ? '---\narbitrage: ' + JSON.stringify(etat) + '\n---\n\n' + contenu : contenu;
    }
    await this.ecrire(f.path, neuf, f);
  }

  // Inscrit dans la note en attente l'œuvre retenue. C'est la seule écriture
  // que l'arbitrage produit, et elle est réversible : deux propriétés.
  async ecrireIdentification(entree, verdict) {
    if (!verdict || !verdict.titre) return;
    const f = entree.fichier;
    const contenu = await this.app.vault.read(f);
    const pose = (texte, cle, valeur) => {
      const sans = texte.replace(new RegExp('^' + cle + ':.*\\n', 'm'), '');
      return valeur ? sans.replace(/^(---\n)/, '$1' + cle + ': ' + JSON.stringify(valeur) + '\n') : sans;
    };
    let neuf = contenu;
    if (!/^---\n[\s\S]*?\n---/.test(neuf)) neuf = '---\n---\n\n' + neuf;
    neuf = pose(neuf, 'titre-cité', verdict.titre);
    neuf = pose(neuf, 'doi', verdict.doi || '');
    await this.ecrire(f.path, neuf, f);
    new obsidian.Notice(tr('Identification écrite : ') + '« ' + verdict.titre.slice(0, 60) + ' »');
  }

  // Réparation : d'anciennes versions découpaient « Dupont, Martin, & Durand »
  // en laissant l'esperluette collée au dernier nom, d'où des liens « [[& X]] »
  // qui ne pointent nulle part. Le découpage est corrigé, restent les résidus.
  async reparerLiensAuteurs() {
    const motif = /\[\[\s*&\s+([^\]|#]+?)\s*(\|[^\]]*)?\]\]/g;
    let fichiers = 0, liens = 0;
    const touches = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const contenu = await this.app.vault.cachedRead(f);
      motif.lastIndex = 0;
      if (!motif.test(contenu)) continue;
      motif.lastIndex = 0;
      let n = 0;
      const neuf = contenu.replace(motif, (tout, nom, alias) => {
        n += 1;
        return '[[' + nom.trim() + (alias || '') + ']]';
      });
      if (neuf === contenu) continue;
      await this.ecrire(f.path, neuf, f);
      fichiers += 1; liens += n;
      touches.push(f.basename);
    }
    if (!fichiers) new obsidian.Notice(tr('Aucun lien d’auteur à réparer.'));
    else new obsidian.Notice(tr('Liens d’auteurs réparés : ') + liens + tr(' dans ') + fichiers + tr(' note(s).'));
    console.log('[Ariane] liens d’auteurs réparés dans :', touches);
    return liens;
  }

  /* ------------- Compléter une référence depuis son DOI -------------------- *
   * L'arbitrage identifie l'œuvre ; il n'en donne que le titre et le DOI, parce
   * que c'est tout ce qu'une entrée de bibliographie contient. La fiche
   * complète, elle, se demande à Crossref sur le DOI lui-même : auteurs avec
   * leurs prénoms, revue ou éditeur, type, année.
   * ------------------------------------------------------------------------ */

  async ficheDepuisDoi(doi) {
    const d = normDoi(doi);
    if (!d) return null;
    const q = this.paramMailto();
    const j = await this.apiGetJson(
      'https://api.crossref.org/works/' + encodeURIComponent(d) + (q ? '?' + q : ''));
    const m = j && j.message ? j.message : null;
    if (!m) return null;
    const parts = (m.issued && m.issued['date-parts']) || [];
    const auteurs = (m.author || [])
      .map((a) => String((a.given || '') + ' ' + (a.family || a.name || '')).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return {
      doi: d,
      titre: String((m.title || [])[0] || '').trim(),
      auteurs,
      annee: String((parts[0] || [])[0] || '').trim(),
      revue: String((m['container-title'] || [])[0] || '').trim(),
      editeur: String(m.publisher || '').trim(),
      type: String(m.type || '').trim(),
      url: String(m.URL || '').trim(),
    };
  }

  // La fiche récupérée doit parler du même travail : l'année et le nom cité
  // doivent s'y retrouver. Sinon on ne l'écrit pas. Un DOI erroné, cela arrive,
  // et une fausse fiche dans une thèse coûte plus cher qu'une fiche absente.
  ficheConcorde(fiche, nomReference) {
    if (!fiche || !fiche.titre) return false;
    const m = String(nomReference).match(/^(.*?),\s*(\d{4})/);
    if (!m) return true;
    if (fiche.annee && fiche.annee !== m[2]) return false;
    const premier = sansAccents(m[1].split(/\s+(?:et al\.?|&|and|et)\s+|,/)[0].trim().split(/\s+/).pop());
    if (!premier || !fiche.auteurs.length) return true;
    return fiche.auteurs.some((a) => sansAccents(a).split(/[^a-z0-9]+/).includes(premier));
  }

  async completerReference(entree, doi) {
    const fiche = await this.ficheDepuisDoi(doi);
    if (!fiche) { new obsidian.Notice(tr('Fiche introuvable pour ce DOI.')); return false; }
    if (!this.ficheConcorde(fiche, entree.nom)) {
      new obsidian.Notice(tr('La fiche du DOI ne concorde pas avec « ') + entree.nom + ' ». '
        + tr('Rien n’a été écrit.'), 9000);
      return false;
    }
    const f = entree.fichier;
    this.marquerEcriture(f.path);
    await this.app.fileManager.processFrontMatter(f, (fm) => {
      // L'alias porte le titre : c'est lui que lit l'aparté, et c'est par lui
      // que la référence devient trouvable ailleurs qu'en « Auteur, Année ».
      const al = Array.isArray(fm.aliases) ? fm.aliases : (fm.aliases ? [fm.aliases] : []);
      if (!al.includes(fiche.titre)) fm.aliases = [fiche.titre].concat(al.filter((x) => x !== fiche.titre));
      fm['titre-cité'] = fiche.titre;
      fm.doi = fiche.doi;
      if (fiche.auteurs.length) fm.auteurs = fiche.auteurs;
      if (fiche.annee) fm.annee = fiche.annee;
      if (fiche.revue) fm.revue = fiche.revue;
      if (fiche.editeur) fm['éditeur'] = fiche.editeur;
      if (fiche.type) fm['type-œuvre'] = fiche.type;
      if (fiche.url) fm.url = fiche.url;
    });
    // Le corps ne portait que des noms de famille, « [[Bowker]] », alors que
    // les notes d'auteurs du coffre sont en noms complets. On les aligne.
    if (fiche.auteurs.length) {
      const contenu = await this.app.vault.read(f);
      const corps = contenu.replace(/^---\n[\s\S]*?\n---\n?/, '');
      const reste = corps.replace(/^\s*\[\[[^\]]+\]\]\s*$/gm, '').trim();
      const liens = fiche.auteurs.map((a) => '[[' + a + ']]').join('\n');
      const fmBloc = (contenu.match(/^---\n[\s\S]*?\n---\n?/) || [''])[0];
      await this.ecrire(f.path, fmBloc + '\n' + liens + (reste ? '\n\n' + reste : '') + '\n', f);
      await this.assurerNotesAuteurs(entree.nom, fiche.auteurs);
    }
    return true;
  }

  /* --------------------- Fusionner deux libellés --------------------------- *
   * « Gawer & Cusumano, 2014 » et « Gawer, 2014 » désignent parfois le même
   * article et comptent séparément : le signal d'acquisition en est dilué. La
   * fusion réunit les liens sous un seul libellé et mémorise le renvoi.
   * ------------------------------------------------------------------------ */

  async fusionnerReferences(depuis, vers, silencieux) {
    if (!depuis || !vers || depuis.nom === vers) return 0;
    const n = await this.remplacerLiens(depuis.nom, vers);
    const cible = this.app.vault.getMarkdownFiles().find((f) => f.basename === vers);
    if (cible) {
      // Le libellé absorbé est conservé en propriété : il reste cherchable, et
      // l'on sait sous quelles formes ce travail a été cité.
      this.marquerEcriture(cible.path);
      await this.app.fileManager.processFrontMatter(cible, (fm) => {
        const l = Array.isArray(fm['libellés']) ? fm['libellés'] : (fm['libellés'] ? [fm['libellés']] : []);
        if (!l.includes(depuis.nom)) l.push(depuis.nom);
        fm['libellés'] = l;
      });
    }
    if (!this.settings.correspondancesSuffixe) this.settings.correspondancesSuffixe = {};
    this.settings.correspondancesSuffixe[depuis.nom] = { __defaut: vers };
    await this.saveSettings();
    await this.marquerReference(depuis, 'fusionnée');
    if (!silencieux) {
      new obsidian.Notice(tr('Fusionnée : ') + depuis.nom + ' → ' + vers
        + ' (' + n + ' ' + tr('lien(s)') + ').', 8000);
    }
    return n;
  }

  /* ------------------- Détacher une œuvre d'un libellé --------------------- *
   * « Renn, 2008 » recouvre deux travaux selon l'article citant. On crée une
   * note pour l'œuvre minoritaire, nommée par SON titre, et la table renvoie
   * chaque source vers la bonne. Le libellé d'origine garde son nom : aucun
   * lien existant ne se casse ailleurs.
   * ------------------------------------------------------------------------ */

  async detacherOeuvre(entree, oeuvre, silencieux) {
    if (!oeuvre || !oeuvre.sources || !oeuvre.sources.length) return null;
    const nom = this.nettoyerNomFichier(nomOeuvreDetachee(entree.nom, oeuvre.titre));
    if (nom === entree.nom) { new obsidian.Notice(tr('Titre insuffisant pour détacher.')); return null; }
    const chemin = this.dossierR + '/' + nom + '.md';
    if (!this.app.vault.getAbstractFileByPath(chemin)) {
      const fm = ['---', 'aliases:', '  - ' + JSON.stringify(oeuvre.titre || nom),
        'type: reference-citee'];
      if (oeuvre.doi) fm.push('doi: ' + JSON.stringify(oeuvre.doi));
      if (oeuvre.titre) fm.push('titre-cité: ' + JSON.stringify(oeuvre.titre));
      fm.push('libellés:'); fm.push('  - ' + JSON.stringify(entree.nom));
      fm.push('détachée-de: ' + JSON.stringify('[[' + entree.nom + ']]'));
      fm.push('---');
      await this.ecrire(chemin, fm.join('\n') + '\n');
    }
    if (!this.settings.correspondancesSuffixe) this.settings.correspondancesSuffixe = {};
    const table = Object.assign({}, this.settings.correspondancesSuffixe[entree.nom] || {});
    for (const src of oeuvre.sources) table[src] = nom;
    this.settings.correspondancesSuffixe[entree.nom] = table;
    await this.saveSettings();

    // On ne réécrit que les notes des sources concernées : les autres gardent
    // leur lien vers le libellé d'origine, qui reste valide.
    const motif = new RegExp('\\[\\[' + echapperRegex(entree.nom) + '(\\|[^\\]]*)?\\]\\]', 'g');
    const cibles = new Set(oeuvre.sources);
    let n = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fmc = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const src = cleDeLien(sansLien(fmc['zotflow-source'] || ''));
      if (!src || !cibles.has(src)) continue;
      const contenu = await this.app.vault.cachedRead(f);
      motif.lastIndex = 0;
      if (!motif.test(contenu)) continue;
      motif.lastIndex = 0;
      const neuf = contenu.replace(motif, (tout, alias) => '[[' + nom + (alias || '') + ']]');
      if (neuf === contenu) continue;
      await this.ecrire(f.path, neuf, f);
      n += 1;
    }
    if (!silencieux) {
      new obsidian.Notice(tr('Détachée : ') + nom + ' (' + n + ' ' + tr('lien(s)') + ').', 8000);
    }
    return { nom, liens: n };
  }

  /* ------------------ Détachement automatique ------------------------------ *
   * Quand la bibliographie de deux sources désigne deux travaux pour un même
   * libellé, il n'y a rien à arbitrer : chacune a raison pour son article. On
   * crée la note de l'œuvre minoritaire et la table renvoie chaque source vers
   * la sienne. Le libellé d'origine garde son nom, donc aucun lien valide ne
   * se casse.
   *
   * Cela suit la génération des bibliographies, seul moment où l'identification
   * change, plutôt que d'être une commande de plus.
   * ------------------------------------------------------------------------ */

  // Symétrique du détachement : deux libellés qui désignent le même travail se
  // réunissent d'eux-mêmes. Le libellé le plus cité l'emporte.
  async fusionnerAutomatiquement(silencieux) {
    const { parOeuvre } = await this.indexOeuvres();
    let n = 0, liens = 0;
    for (const o of parOeuvre.values()) {
      if (!o.libelles || o.libelles.length < 2) continue;
      const notes = [];
      for (const nom of o.libelles) {
        const f = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + nom + '.md');
        if (f instanceof obsidian.TFile) notes.push({ nom, fichier: f });
      }
      if (notes.length < 2) continue;
      const cites = this.indexCitations();
      notes.sort((a, b) => ((cites.get(b.nom) || {}).total || 0) - ((cites.get(a.nom) || {}).total || 0)
        || a.nom.localeCompare(b.nom));
      const garde = notes[0].nom;
      for (const autre of notes.slice(1)) {
        liens += await this.fusionnerReferences(autre, garde, true);
        n += 1;
      }
    }
    if (!silencieux && !n) new obsidian.Notice(tr('Aucun libellé à fusionner.'));
    console.log('[Ariane] fusions automatiques :', n, 'libellés,', liens, 'liens');
    return n;
  }

  // La résolution vivait en mémoire, recalculée à chaque ouverture du volet, et
  // n'était écrite dans les notes que par un geste manuel. Tout ce qui lit les
  // notes voyait donc des références non identifiées alors qu'elles l'étaient.
  // On inscrit ce qui ne souffre aucun doute : une seule œuvre pour ce libellé.
  async ecrireIdentificationsAutomatiquement(silencieux) {
    const { parRef } = await this.indexOeuvres();
    let n = 0;
    for (const [libelle, e] of parRef) {
      if (!e.oeuvres || e.oeuvres.length !== 1) continue;
      const o = e.oeuvres[0];
      if (!o.titre || !titreCredible(o.titre)) continue;
      const f = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + libelle + '.md');
      if (!(f instanceof obsidian.TFile)) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      // On n'écrase pas une identification déjà posée, ni ce que l'utilisateur
      // a corrigé à la main.
      if (fm['titre-cité']) continue;
      this.marquerEcriture(f.path);
      await this.app.fileManager.processFrontMatter(f, (x) => {
        x['titre-cité'] = o.titre;
        if (o.doi) x.doi = o.doi;
        const al = Array.isArray(x.aliases) ? x.aliases : (x.aliases ? [x.aliases] : []);
        if (!al.includes(o.titre)) x.aliases = [o.titre].concat(al);
      });
      n += 1;
    }
    if (!silencieux) {
      new obsidian.Notice(n ? tr('Identifications écrites : ') + n : tr('Rien de nouveau à identifier.'));
    }
    console.log('[Ariane] identifications écrites :', n);
    return n;
  }

  async detacherAutomatiquement(silencieux) {
    const { parRef } = await this.indexOeuvres();
    const aTraiter = [];
    for (const [libelle, e] of parRef) {
      if (!e.oeuvres || e.oeuvres.length < 2) continue;
      const f = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + libelle + '.md');
      if (!(f instanceof obsidian.TFile)) continue;
      aTraiter.push({ entree: { nom: libelle, fichier: f }, oeuvres: e.oeuvres });
    }
    if (!aTraiter.length) {
      if (!silencieux) new obsidian.Notice(tr('Aucun libellé à détacher.'));
      return 0;
    }
    let notes = 0, liens = 0;
    for (const t of aTraiter) {
      // L'œuvre la plus attestée garde le libellé ; les autres sont détachées.
      const tries = t.oeuvres.slice().sort((a, b) => b.n - a.n);
      // Prudence : on ne sépare que sur une preuve symétrique. Deux DOI
      // distincts, ou aucun DOI de part et d'autre. Quand une seule des deux
      // entrées porte un DOI, l'écart peut n'être qu'une lacune de l'une des
      // bibliographies : le chapitre « Risk Governance: An Application… » et le
      // livre « Handbook of performability engineering » qui le contient sont
      // le même travail, et rien dans les titres ne le dit.
      const separables = (a, b) => (a.doi && b.doi) ? a.doi !== b.doi : (!a.doi && !b.doi);
      for (const o of tries.slice(1)) {
        if (!separables(tries[0], o)) continue;
        const r = await this.detacherOeuvre(t.entree, o, true);
        if (r) { notes += 1; liens += r.liens; }
      }
    }
    if (!silencieux) {
      new obsidian.Notice(tr('Détachements : ') + notes + ' ' + tr('note(s)')
        + ', ' + liens + ' ' + tr('lien(s)') + '.', 9000);
    }
    console.log('[Ariane] détachements automatiques :', notes, 'notes,', liens, 'liens');
    return notes;
  }

  // Ouvre le PDF d'une source dans le lecteur ZotFlow, à l'intérieur d'Obsidian.
  // Le lecteur accepte une page : navigation={"pageIndex":N}, en base zéro.
  async ouvrirPdfSource(sourceBasename, page) {
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === sourceBasename);
    if (!f) { new obsidian.Notice(tr('Note introuvable : ') + sourceBasename); return; }
    const cle = await this.cleAttachement(f);
    if (!cle) { new obsidian.Notice(tr('Cette source n’a pas de PDF attaché.')); return; }
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const lib = fm['library-id'] || '';
    let url = 'obsidian://zotflow?type=open-attachment&libraryID=' + encodeURIComponent(lib)
      + '&key=' + encodeURIComponent(cle);
    if (page) {
      url += '&navigation=' + encodeURIComponent(JSON.stringify({ pageIndex: Math.max(0, page - 1) }));
    }
    window.open(url);
  }

  async ouvrirNote(basename) {
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === basename);
    if (f) await this.app.workspace.getLeaf(true).openFile(f);
    else new obsidian.Notice(tr('Note introuvable : ') + basename);
  }

  async ouvrirVueReferences() {
    const ex = this.app.workspace.getLeavesOfType(TYPE_VUE_REFS);
    if (ex.length) { this.app.workspace.revealLeaf(ex[0]); return; }
    const feuille = this.app.workspace.getRightLeaf(false);
    if (!feuille) return;
    await feuille.setViewState({ type: TYPE_VUE_REFS, active: true });
    this.app.workspace.revealLeaf(feuille);
  }

  async ouvrirVueIncoherences() {
    const ex = this.app.workspace.getLeavesOfType(TYPE_VUE_INCOHERENCES);
    if (ex.length) { this.app.workspace.revealLeaf(ex[0]); return; }
    const feuille = this.app.workspace.getRightLeaf(false);
    if (!feuille) return;
    await feuille.setViewState({ type: TYPE_VUE_INCOHERENCES, active: true });
    this.app.workspace.revealLeaf(feuille);
  }

  //#endregion Ariane · références en attente

  //#region Ariane · bibliographie — index & génération
  // ── bibliographie — index & génération ───────────────────────────────────

  cheminBibliographies() {
    const rel = this.app.vault.configDir + '/plugins/' + this.manifest.id + '/bibliographies.json';
    const base = (this.app.vault.adapter && this.app.vault.adapter.basePath) || '';
    return base ? require('path').join(base, rel) : null;
  }

  chargerBibliographies() {
    if (this.bibliographies) return this.bibliographies;
    const c = this.cheminBibliographies();
    try {
      this.bibliographies = c ? JSON.parse(require('fs').readFileSync(c, 'utf8')) : {};
    } catch (e) {
      this.bibliographies = {};
    }
    return this.bibliographies;
  }

  // Les références citées d'une source, dans la forme d'Ariane, quelle que soit
  // la manière dont elles sont entrées dans le cache.
  /* ------------- La bibliographie lue dans le PDF lui-même ----------------- *
   * Crossref ne connaît que ce qui porte un DOI. Or les livres n'en ont
   * souvent pas, et ce sont eux qui portent les références les plus citées :
   * Dresch 2015 à lui seul cite March & Smith, Romme et van Aken, invisibles
   * autrement. Zotero garde sur le disque le texte extrait de chaque PDF, dans
   * « storage/<clé>/.zotero-ft-cache ». On y lit la bibliographie directement.
   * ------------------------------------------------------------------------ */

  racineZotero() {
    const regle = (this.settings.dossierZotero || '').trim();
    if (regle) return regle;
    const os = require('os');
    return require('path').join(os.homedir(), 'Zotero');
  }

  // Le texte extrait d'une pièce jointe, mis en cache mémoire : un PDF pèse
  // deux cent cinquante mille caractères, on ne le relit pas par référence.
  texteAttachement(cle) {
    if (!cle) return '';
    if (!this._textesPdf) this._textesPdf = {};
    if (Object.prototype.hasOwnProperty.call(this._textesPdf, cle)) return this._textesPdf[cle];
    const chemin = require('path').join(this.racineZotero(), 'storage', cle, '.zotero-ft-cache');
    let t = '';
    try { t = require('fs').readFileSync(chemin, 'utf8'); } catch (e) { t = ''; }
    this._textesPdf[cle] = t;
    return t;
  }

  // Cherche dans le PDF d'une source ce qu'elle dit d'un libellé cité.
  async entreePdfPourSource(sourceBasename, libelle) {
    const m = String(libelle).match(/^(.*?),\s*(\d{4})/);
    if (!m) return null;
    const nom = m[1].split(/\s+(?:et al\.?|&|and|et)\s+|,/)[0].trim().split(/\s+/).pop();
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === sourceBasename);
    if (!f) return null;
    const cle = await this.cleAttachement(f);
    if (!cle) return null;
    const t = this.texteAttachement(cle);
    if (!t) return null;
    const e = Ariane.entreeDansTexte(t, nom, m[2]);
    if (!e || !e.titre || e.titre.length < 8) return null;
    return { auteurs: [nom.toLowerCase()], annee: m[2], titre: e.titre,
      revue: '', doi: '', brut: e.brut, viaPdf: true };
  }

  // Clé de pièce jointe par source, construite une fois : candidatsPourSource
  // est synchrone et ne peut pas lire les notes.
  async indexAttachements() {
    if (this._attachements) return this._attachements;
    const m = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.estSourceZoteroFrontmatter(f)) continue;
      const cle = await this.cleAttachement(f);
      if (cle) m.set(f.basename, cle);
    }
    this._attachements = m;
    return m;
  }

  bibliographieDeDoi(doi) {
    const d = normDoi(doi);
    if (!d) return null;
    const brut = this.chargerBibliographies()[d];
    if (!brut) return null;
    if (!this._biblioNorm) this._biblioNorm = {};
    if (!this._biblioNorm[d]) this._biblioNorm[d] = Ariane.normaliserBiblio(brut);
    return this._biblioNorm[d];
  }

  async ecrireBibliographies() {
    const c = this.cheminBibliographies();
    if (!c) return;
    try {
      require('fs').writeFileSync(c, JSON.stringify(this.bibliographies || {}), 'utf8');
    } catch (e) {
      console.error('[Ariane] Cache de bibliographies non écrit :', e);
    }
  }

  // Qui cite quoi. Une annotation porte « zotflow-source » et
  // « références-citées » : le croisement des deux donne, pour chaque référence
  // en attente, les sources qui la mentionnent et combien de fois.
  indexCitations() {
    const parRef = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const src = sansLien(fm['zotflow-source'] || '');
      const refs = fm['références-citées'];
      if (!src || !refs) continue;
      const liste = Array.isArray(refs) ? refs : [refs];
      for (const brut of liste) {
        const nom = cleDeLien(sansLien(brut));
        if (!nom || nom === src) continue;
        if (!parRef.has(nom)) parRef.set(nom, { total: 0, sources: new Map() });
        const e = parRef.get(nom);
        e.total += 1;
        e.sources.set(src, (e.sources.get(src) || 0) + 1);
      }
    }
    return parRef;
  }

  // Toutes les références en attente, avec ce qu'on sait d'elles.
  indexReferencesAttente() {
    const dossier = this.dossierR;
    const citations = this.indexCitations();
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!dossier || !f.path.startsWith(dossier + '/')) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (fm.type !== 'reference-citee') continue;
      const c = citations.get(f.basename) || { total: 0, sources: new Map() };
      out.push({
        fichier: f,
        nom: f.basename,
        doi: normDoi(fm.doi),
        titre: String(fm['titre-cité'] || '').trim(),
        etat: String(fm['arbitrage'] || '').trim(),
        complete: Array.isArray(fm.auteurs) && fm.auteurs.length > 0 && !!fm['titre-cité'],
        citations: c.total,
        sources: [...c.sources.entries()].sort((a, b) => b[1] - a[1]),
      });
    }
    out.sort((a, b) => b.citations - a.citations || a.nom.localeCompare(b.nom));
    return out;
  }

  // Les passages surlignés où une référence est citée. C'est la matière que
  // demande la résolution fine : le texte de l'article autour de l'appel de
  // citation, qui dit de quoi il retourne.
  indexPassages() {
    const parRef = new Map();
    const marque = '[!' + (this.settings.calloutCitation || 'quote') + ']';
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const src = sansLien(fm['zotflow-source'] || '');
      const refs = fm['références-citées'];
      if (!src || !refs) continue;
      const liste = (Array.isArray(refs) ? refs : [refs]).map((x) => cleDeLien(sansLien(x)));
      const noms = liste.filter((n) => n && n !== src);
      if (!noms.length) continue;
      parRef.set('__fichiers__', true);
      for (const nom of noms) {
        if (!parRef.has(nom)) parRef.set(nom, []);
        parRef.get(nom).push({ fichier: f, source: src, marque });
      }
    }
    parRef.delete('__fichiers__');
    return parRef;
  }

  // Le passage surligné d'une note d'annotation, tel que le modèle l'a écrit.
  async passageDe(fichier, marque) {
    const t = await this.app.vault.cachedRead(fichier);
    const i = t.indexOf('> ' + marque);
    if (i < 0) return '';
    const lignes = [];
    for (const l of t.slice(i).split('\n').slice(1)) {
      const m = l.match(/^>\s?(.*)$/);
      if (!m) break;
      if (/^\[!/.test(m[1].trim())) break;
      lignes.push(m[1]);
    }
    return lignes.join(' ').replace(/\s{2,}/g, ' ').trim();
  }

  // Fenêtre de texte autour de l'appel de citation dans le passage. C'est elle
  // qui départage deux entrées de bibliographie du même auteur et de la même
  // année : le sujet de la phrase ressemble au titre du bon travail.
  fenetreCitation(passage, nomFamille) {
    if (!passage || !nomFamille) return '';
    const p = sansAccents(passage);
    const i = p.indexOf(sansAccents(nomFamille));
    if (i < 0) return passage;
    const mots = passage.split(/\s+/);
    let compte = 0, index = 0;
    for (let k = 0; k < mots.length; k++) {
      compte += mots[k].length + 1;
      if (compte > i) { index = k; break; }
    }
    return mots.slice(Math.max(0, index - 25), index + 25).join(' ');
  }

  // Les candidats de bibliographie d'un libellé chez UNE source, classés. Sorti
  // de la résolution pour que le comptage par œuvre s'appuie exactement sur le
  // même appariement, sans en écrire un second qui divergerait.
  candidatsPourSource(libelle, source, passage) {
    const m = String(libelle).match(/^(.*?),\s*(\d{4})([a-z]?)/);
    if (!m) return [];
    const premier2 = m[1].split(/\s+(?:et al\.?|&|and|et)\s+|,/)[0].trim().split(/\s+/).pop();
    const premier = sansAccents(premier2);
    const annee = m[2];
    const suffixe = m[3] || '';
    const fiche = this.construireIndexZotero().find((z) => z.basename === source);
    const liste = fiche && fiche.doi ? this.bibliographieDeDoi(fiche.doi) : null;
    // Crossref muet — le cas de tous les livres, qui n'ont pas de DOI : on lit
    // la bibliographie dans le texte du PDF lui-même.
    const versPdf = () => {
      const cle = this._attachements ? this._attachements.get(source) : null;
      const e = cle ? Ariane.entreeDansTexte(this.texteAttachement(cle), premier2, annee) : null;
      if (!e || !titreCredible(e.titre)) return [];
      return [{ titre: e.titre, doi: '', brut: e.brut, revue: '', score: 0, viaPdf: true }];
    };
    // Crossref muet, le cas de tous les livres, qui n'ont pas de DOI.
    if (!liste || !liste.length) return versPdf();
    const sac = new Set(tokeniser(this.fenetreCitation(passage || '', premier)));

    const cands = [];
    for (const e of liste) {
      if (String(e.annee || '') !== annee) continue;
      const brut = sansAccents(e.brut || '');
      const noms = (e.auteurs || []).map((x) => sansAccents(String(x).split(/\s+/).pop()));
      const colle = noms.length
        ? noms.includes(premier)
        : brut.split(/[^a-z0-9]+/).filter(Boolean)[0] === premier;
      if (!colle) continue;
      // Crossref rend parfois la référence entière en guise de titre. On en
      // extrait le vrai titre, faute de quoi la note détachée s'appellerait
      // « (Lawrence, M.G., S) », un début de liste d'auteurs.
      let titre = String(e.titre || '').trim();
      if (titre && !titreCredible(titre)) titre = titreDansReference(titre, annee);
      const doi = normDoi(e.doi);
      if (!titre && !doi) continue;
      cands.push({ titre, doi, brut, revue: String(e.revue || '').trim(), score: 0 });
    }
    if (!cands.length) return [];

    if (suffixe) {
      const explicite = cands.filter((c) => c.brut.includes(annee + suffixe));
      if (explicite.length) {
        for (const c of explicite) c.score += 100;
      } else {
        const rang = suffixe.charCodeAt(0) - 97;
        const tries = cands.slice().sort((x, y) => x.titre.localeCompare(y.titre));
        if (tries[rang]) tries[rang].score += 60;
      }
    }
    for (const c of cands) {
      let ctx = 0;
      for (const mot of tokeniser(c.titre)) if (sac.has(mot)) ctx += 3;
      c.score += Math.min(ctx, 30);
    }
    // Crossref a répondu mais ne mentionne pas cette référence : sa liste est
    // souvent incomplète. Le PDF, lui, porte la bibliographie entière.
    if (!cands.length) return versPdf();

    cands.sort((a, b) => b.score - a.score);
    return cands;
  }

  /* ------------------ Compter par œuvre, non par libellé ------------------- *
   * Le libellé agrège mal : « Gawer & Cusumano, 2014 » et « Gawer, 2014 » sont
   * le même article et comptent séparément, tandis que « Iansiti & Levien,
   * 2004 » cumule six citations pour DEUX ouvrages distincts. Compter par œuvre
   * répare les deux, et c'est ce compte qui doit guider une acquisition.
   * ------------------------------------------------------------------------ */

  async indexOeuvres(passages) {
    const P = passages || this.indexPassages();
    await this.indexAttachements();
    const parRef = new Map();
    const parOeuvre = new Map();

    for (const [libelle, occurrences] of P) {
      const oeuvres = new Map();
      let nonResolues = 0;
      for (const occ of occurrences) {
        const passage = await this.passageDe(occ.fichier, occ.marque);
        const c = this.candidatsPourSource(libelle, occ.source, passage)[0];
        const cle = c ? cleOeuvre(c.titre, c.doi) : '';
        if (!cle) { nonResolues += 1; continue; }
        if (!oeuvres.has(cle)) {
          oeuvres.set(cle, { cle, titre: c.titre, doi: c.doi, revue: c.revue,
            viaPdf: !!c.viaPdf, n: 0, sources: [] });
        }
        const o = oeuvres.get(cle);
        o.n += 1;
        if (!o.sources.includes(occ.source)) o.sources.push(occ.source);
        if (c.titre.length > (o.titre || '').length) o.titre = c.titre;
        if (!o.doi && c.doi) o.doi = c.doi;
      }
      // Une occurrence non résolue ne fonde pas une œuvre : elle rejoint la
      // seule connue quand il n'y en a qu'une. Sans cette règle, « Bowker &
      // Star, 1999 » passait pour deux travaux, l'un identifié et l'autre non.
      const liste = Ariane.fondreOeuvresProches([...oeuvres.values()]);
      // La clé doit être recalculée après la fonte : le titre retenu est le plus
      // complet des deux, et sans ce recalcul la clé restait celle du premier
      // venu. Deux libellés désignant la même œuvre gardaient alors des clés
      // différentes, et la détection des fusions tombait à zéro.
      for (const o of liste) o.cle = cleOeuvre(o.titre, o.doi) || o.cle;
      if (liste.length === 1) liste[0].n += nonResolues;
      const total = occurrences.length;
      parRef.set(libelle, { oeuvres: liste, nonResolues: liste.length === 1 ? 0 : nonResolues, total });
      for (const o of liste) {
        if (!parOeuvre.has(o.cle)) {
          parOeuvre.set(o.cle, { cle: o.cle, titre: o.titre, doi: o.doi,
            viaPdf: !!o.viaPdf, n: 0, libelles: [] });
        }
        const g = parOeuvre.get(o.cle);
        g.n += o.n;
        if (!g.libelles.includes(libelle)) g.libelles.push(libelle);
        if ((o.titre || '').length > (g.titre || '').length) g.titre = o.titre;
        if (!g.doi && o.doi) g.doi = o.doi;
      }
    }
    return { parRef, parOeuvre };
  }

  // Résolution d'une référence en attente, source par source.
  //
  // On ne retient plus « la première source qui répond ». Une même note,
  // « Renn, 2008 », peut désigner deux travaux différents selon l'article qui
  // la cite : mesuré, sur les neuf références résolues par au moins deux
  // sources, cinq divergent et deux désignent réellement deux œuvres. Prendre
  // la première venue choisissait au hasard, et le hasard s'est déjà écrit dans
  // le coffre.
  //
  // L'égalité des noms est stricte sur les mots : « han » CONTENU dans
  // « hannah » rattachait Han et al. 2017 à Hannah 2018.
  async resoudreParBibliographie(entree, passages) {
    await this.indexAttachements();
    const biblio = this.chargerBibliographies();
    const m = entree.nom.match(/^(.*?),\s*(\d{4})([a-z]?)/);
    if (!m) return null;
    const premier = sansAccents(m[1].split(/\s+(?:et al\.?|&|and|et)\s+|,/)[0].trim().split(/\s+/).pop());
    const annee = m[2];
    const suffixe = m[3] || '';
    const index = this.construireIndexZotero();
    const occurrences = (passages || this.indexPassages()).get(entree.nom) || [];

    const parSource = [];
    for (const occ of occurrences) {
      const fiche = index.find((z) => z.basename === occ.source);
      const liste = fiche && fiche.doi ? this.bibliographieDeDoi(fiche.doi) : null;
      if (!liste || !liste.length) continue;
      const passage = await this.passageDe(occ.fichier, occ.marque);
      const sac = new Set(tokeniser(this.fenetreCitation(passage, premier)));

      // Un seul appariement dans tout le greffon : la copie qui vivait ici a
      // divergé une fois, un garde-fou n'ayant été posé que sur l'autre.
      const cands = this.candidatsPourSource(entree.nom, occ.source, passage);
      if (!cands.length) continue;
      const ecart = cands.length > 1 ? cands[0].score - cands[1].score : 999;
      parSource.push({
        source: occ.source, fichier: occ.fichier, passage,
        candidats: cands, retenu: cands[0], sur: cands.length === 1 || ecart >= 3,
      });
    }
    if (!parSource.length) return null;

    // Regroupement en œuvres distinctes. La comparaison des titres est plus
    // délicate qu'il n'y paraît : mesuré sur un vrai coffre, trois « conflits »
    // sur cinq n'en étaient pas. « Co-opetition » et « Co‐opetition: A
    // revolutionary mindset… » diffèrent par un trait d'union Unicode et un
    // sous-titre ; « Designing interactive strategy » est la troncature de
    // « From value chain to value constellation: designing interactive
    // strategy ». D'où : normalisation dure, puis un titre qui commence l'autre
    // désigne le même travail. Un titre vide ne fonde jamais une œuvre à part.
    const clefTitre = (t) => sansAccents(t)
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const oeuvres = [];
    for (const p of parSource) {
      const c = p.retenu;
      const kt = clefTitre(c.titre);
      let o = null;
      if (c.doi) o = oeuvres.find((x) => x.doi && x.doi === c.doi);
      if (!o && kt) {
        o = oeuvres.find((x) => {
          if (x.doi && c.doi && x.doi !== c.doi) return false; // deux DOI distincts : deux œuvres
          const kx = clefTitre(x.titre);
          if (!kx) return true;
          const court = kt.length < kx.length ? kt : kx;
          const long = kt.length < kx.length ? kx : kt;
          // Contenu, et pas seulement en tête : « Designing interactive
          // strategy » est le SOUS-titre de « From value chain to value
          // constellation: designing interactive strategy ». Le seuil de douze
          // caractères écarte les rapprochements fortuits.
          return court.length >= 12 && long.includes(court);
        });
      }
      // Entrée sans titre ni DOI : elle rejoint la première œuvre plutôt que
      // d'en inventer une seconde à partir de rien.
      if (!o && !kt && !c.doi) o = oeuvres[0];
      if (!o) {
        o = { cle: c.doi || kt, titre: c.titre, doi: c.doi, revue: c.revue, sources: [] };
        oeuvres.push(o);
      }
      // Un titre plus complet vaut mieux qu'un titre tronqué.
      if (c.titre.length > (o.titre || '').length) o.titre = c.titre;
      if (!o.doi && c.doi) o.doi = c.doi;
      o.sources.push(p.source);
    }
    oeuvres.sort((a, b) => b.sources.length - a.sources.length);

    const t = parSource.find((x) => x.sur) || parSource[0];
    return {
      parSource, oeuvres,
      conflit: oeuvres.length > 1,
      source: t.source, passage: t.passage, sur: t.sur && oeuvres.length === 1,
      doi: t.retenu.doi, titre: t.retenu.titre, revue: t.retenu.revue,
      autres: t.candidats.slice(1).map((x) => ({ titre: x.titre, doi: x.doi })),
    };
  }



  /* ------------- Découpage des entrées de bibliographie brutes ------------- *
   * Mesuré : sur 5917 entrées en cache, 2988 portent un titre, 1974 ne portent
   * rien d'exploitable, et 955 n'existent qu'en texte brut, du genre
   * « Baldwin C. Y.(2014).Bottlenecks modules… (Working Paper No. 15-028) ».
   * Aucune expression régulière n'en vient à bout. Un modèle, si.
   *
   * Règle : le modèle propose, il ne décide jamais. Chaque extraction est
   * recoupée avec le texte d'origine, l'année et le nom devant s'y retrouver,
   * faute de quoi elle est jetée. Une fausse référence dans une thèse est un
   * dégât autrement plus grave qu'une référence non résolue.
   * ------------------------------------------------------------------------ */

  // Recoupement avec le texte d'origine. C'est ici que se joue la confiance.
  validerDecoupage(extrait, brut) {
    const b = sansAccents(brut);
    const annee = Ariane.premier(extrait.annee);
    if (!/^\d{4}$/.test(annee) || !b.includes(annee)) return null;
    const auteurs = (Array.isArray(extrait.auteurs) ? extrait.auteurs : [extrait.auteurs])
      .map((x) => sansAccents(String(x || '')).split(/\s+/)[0])
      .filter((x) => x.length > 1);
    if (!auteurs.length) return null;
    const mots = new Set(b.split(/[^a-z0-9]+/).filter(Boolean));
    if (!mots.has(auteurs[0])) return null;
    const titre = Ariane.premier(extrait.titre);
    // Un titre que le texte d'origine ne contient pas est une invention.
    if (titre.length < 8 || !b.includes(sansAccents(titre).slice(0, 24))) return null;
    return { auteurs, annee, titre, revue: Ariane.premier(extrait.revue) };
  }

  async decouperBibliographies() {
    const biblio = this.chargerBibliographies();
    const aFaire = [];
    for (const doi of Object.keys(biblio)) {
      const liste = biblio[doi] || [];
      const norm = this.bibliographieDeDoi(doi) || [];
      for (let i = 0; i < norm.length; i++) {
        const e = norm[i];
        if (e.titre) continue;
        if (!e.brut || e.brut.length < 20) continue;
        aFaire.push({ doi, i, brut: e.brut });
      }
    }
    if (!aFaire.length) { new obsidian.Notice(tr('Rien à découper.')); return 0; }

    const consigne = tr("Tu reçois une référence bibliographique brute. Rends STRICTEMENT un objet JSON avec les clés auteurs (liste de noms de famille), annee (chaîne de 4 chiffres), titre (le titre de l'œuvre, sans la revue ni l'éditeur), revue (ou chaîne vide). Aucun texte hors du JSON.")
      + '\n\n' + tr('Référence :') + '\n';

    const avis = new obsidian.Notice(tr('Découpage : 0 / ') + aFaire.length, 0);
    let n = 0, gardes = 0, jetes = 0;
    this.decoupageEnCours = true;
    for (const t of aFaire) {
      if (!this.decoupageEnCours) break;
      const rep = await this.genererJsonRefs(consigne + t.brut, 320);
      n += 1;
      avis.setMessage(tr('Découpage : ') + n + ' / ' + aFaire.length
        + '  (' + gardes + ' ' + tr('retenus') + ', ' + jetes + ' ' + tr('rejetés') + ')');
      if (!rep) { jetes += 1; continue; }
      let brutJson = String(rep).trim();
      const d = brutJson.indexOf('{'), f = brutJson.lastIndexOf('}');
      if (d >= 0 && f > d) brutJson = brutJson.slice(d, f + 1);
      let extrait;
      try { extrait = JSON.parse(brutJson); } catch (e) { jetes += 1; continue; }
      const valide = this.validerDecoupage(extrait, t.brut);
      if (!valide) { jetes += 1; continue; }
      // On écrit dans la forme normalisée, qui est celle du cache désormais.
      const cible = (this.bibliographieDeDoi(t.doi) || [])[t.i];
      if (!cible) { jetes += 1; continue; }
      cible.titre = valide.titre;
      cible.revue = cible.revue || valide.revue || '';
      if (!cible.auteurs || !cible.auteurs.length) cible.auteurs = valide.auteurs;
      if (!cible.annee) cible.annee = valide.annee;
      this.bibliographies[t.doi] = this.bibliographieDeDoi(t.doi);
      gardes += 1;
      // Écriture régulière : un lot de mille entrées ne doit pas être perdu
      // parce qu'Obsidian a été fermé en cours de route.
      if (gardes % 25 === 0) await this.ecrireBibliographies();
    }
    this.decoupageEnCours = false;
    await this.ecrireBibliographies();
    avis.hide();
    if (gardes) {
      await this.fusionnerAutomatiquement(true);
      await this.detacherAutomatiquement(true);
      await this.ecrireIdentificationsAutomatiquement(true);
    }
    new obsidian.Notice(tr('Découpage terminé : ') + gardes + ' ' + tr('retenus')
      + ', ' + jetes + ' ' + tr('rejetés') + '.');
    return gardes;
  }

  // Une passe unique sur les sources citantes qui portent un DOI. Mesuré : 69
  // appels suffisent pour couvrir 631 références en attente, et le résultat est
  // conservé sur disque, donc le volet s'ouvre ensuite sans réseau.
  async rafraichirBibliographies(forcer) {
    const biblio = this.chargerBibliographies();
    const index = this.construireIndexZotero();
    const refs = this.indexReferencesAttente();
    const besoins = new Set();
    for (const r of refs) {
      for (const [src] of r.sources) {
        const fiche = index.find((z) => z.basename === src);
        if (fiche && fiche.doi && (forcer || !(fiche.doi in biblio))) besoins.add(fiche.doi);
      }
    }
    if (!besoins.size) {
      new obsidian.Notice(tr('Bibliographies déjà à jour.'));
      return 0;
    }
    const liste = [...besoins];
    const avis = new obsidian.Notice(tr('Bibliographies : 0 / ') + liste.length, 0);
    let n = 0;
    for (const doi of liste) {
      // On passe par le chemin unique : il interroge Crossref puis OpenAlex,
      // complète les entrées qui n'ont qu'un DOI, et écrit dans le cache
      // partagé. Une seconde requête maison faisait double emploi.
      await this.apiRefsPourDoi(doi);
      n += 1;
      avis.setMessage(tr('Bibliographies : ') + n + ' / ' + liste.length);
      if (this.dernierAppelReseau) await new Promise((r) => setTimeout(r, 300));
    }
    avis.hide();
    new obsidian.Notice(tr('Bibliographies récupérées : ') + n);
    return n;
  }

  /* --------------- Références citées via API bibliographique ---------------- */

  paramMailto() {
    const e = (this.settings.apiEmail || '').trim();
    return e ? 'mailto=' + encodeURIComponent(e) : '';
  }

  async apiGetJson(url) {
    try {
      const rep = await obsidian.requestUrl({ url, method: 'GET', throw: false });
      if (rep && rep.status >= 200 && rep.status < 300) {
        return rep.json !== undefined ? rep.json : JSON.parse(rep.text);
      }
    } catch (e) {
      console.debug('[Ariane] apiGetJson', url, e);
    }
    return null;
  }

  async apiCrossref(doi) {
    const q = this.paramMailto();
    const url = 'https://api.crossref.org/works/' + encodeURIComponent(doi) + (q ? '?' + q : '');
    const json = await this.apiGetJson(url);
    return json ? refsDepuisCrossref(json) : [];
  }

  async apiOpenAlex(doi) {
    const q = this.paramMailto();
    const base = 'https://api.openalex.org';
    const w = await this.apiGetJson(base + '/works/doi:' + doi + '?select=referenced_works' + (q ? '&' + q : ''));
    const ids = (w && w.referenced_works) || [];
    const refs = [];
    for (let i = 0; i < ids.length; i += 50) {
      const lot = ids.slice(i, i + 50).map((x) => String(x).replace(/^https?:\/\/openalex\.org\//i, ''));
      const rep = await this.apiGetJson(
        base + '/works?filter=ids.openalex:' + lot.join('|') +
        '&per-page=50&select=id,doi,title,publication_year,authorships' + (q ? '&' + q : '')
      );
      if (rep && rep.results) refs.push(...refsDepuisOpenAlexWorks(rep.results));
    }
    return refs;
  }

  async apiRefsPourDoi(doi, forcer) {
    doi = normDoi(doi);
    if (!doi) return [];
    // Le cache est partagé avec le volet d'arbitrage : générer une
    // bibliographie l'alimente, et l'ouvrir n'appelle plus le réseau. Les deux
    // fonctions interrogeaient les mêmes DOI chacune de son côté.
    this.dernierAppelReseau = false;
    if (!forcer) {
      const enCache = this.bibliographieDeDoi(doi);
      if (enCache && enCache.length) return enCache;
    }
    this.dernierAppelReseau = true;
    const src = this.settings.apiSource || 'auto';
    let refs;
    if (src === 'crossref') refs = await this.apiCrossref(doi);
    else if (src === 'openalex') refs = await this.apiOpenAlex(doi);
    else {
      refs = await this.apiCrossref(doi); // Crossref d'abord (couverture, un appel)
      if (!refs.length) refs = await this.apiOpenAlex(doi); // sinon OpenAlex
    }
    const finales = await this.enrichirRefsParDoi(refs);
    if (finales && finales.length) {
      this.chargerBibliographies()[doi] = finales;
      if (this._biblioNorm) delete this._biblioNorm[doi];
      await this.ecrireBibliographies();
    }
    return finales;
  }

  // Complète les références qui n'ont qu'un DOI (fréquent avec Crossref) en
  // récupérant titre / année / auteurs via OpenAlex, par lots. Échoue en
  // silence : au pire les références restent « sans titre ».
  async enrichirRefsParDoi(refs) {
    const manquants = (refs || []).filter((r) => r.doi && (!r.titre || !r.auteurs || !r.auteurs.length));
    const dois = [...new Set(manquants.map((r) => r.doi))];
    if (!dois.length) return refs;
    const q = this.paramMailto();
    const parDoi = new Map();
    for (let i = 0; i < dois.length; i += 40) {
      const lot = dois.slice(i, i + 40);
      const url = 'https://api.openalex.org/works?filter=doi:' + lot.join('|') +
        '&per-page=40&select=doi,title,publication_year,authorships' + (q ? '&' + q : '');
      const rep = await this.apiGetJson(url);
      for (const w of (rep && rep.results) || []) {
        const d = normDoi(w.doi || '');
        if (d) parDoi.set(d, w);
      }
    }
    for (const r of refs) {
      const w = r.doi ? parDoi.get(r.doi) : null;
      if (!w) continue;
      if (!r.titre) r.titre = String(w.title || '').trim();
      if (!r.annee && w.publication_year) r.annee = String(w.publication_year);
      if (!r.auteurs || !r.auteurs.length) {
        r.auteurs = (w.authorships || [])
          .map((a) => nomFamille((a.author && a.author.display_name) || a.raw_author_name || ''))
          .filter(Boolean);
      }
    }
    return refs;
  }

  sourceParDoi(doi, index) {
    const d = normDoi(doi);
    if (!d) return null;
    for (const z of index || []) if (z.doi && z.doi === d) return z.basename;
    return null;
  }

  doiDeSource(file) {
    const fm = (this.app.metadataCache.getFileCache(file) || {}).frontmatter;
    return normDoi(fm && fm.doi);
  }

  // Une référence citée (parseNomReference) correspond-elle à une réf. API ?
  refCorrespondApi(ref, apiRef) {
    return appariementSource(ref, { surnames: apiRef.auteurs || [], annee: apiRef.annee }) != null;
  }

  // Notes de référence en attente citées par une source (via ses annotations).
  referencesEnAttenteDeSource(sourceBasename) {
    const noms = new Set();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (!fm || fm['zotflow-auto'] !== true) continue;
      const s = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
      if (s !== sourceBasename) continue;
      let refs = fm['références-citées'];
      if (!refs) continue;
      if (!Array.isArray(refs)) refs = [refs];
      for (const r of refs) {
        const cible = String(r).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
        if (!cible) continue;
        const dest = this.app.metadataCache.getFirstLinkpathDest(cible, f.path);
        if (dest && dest.path.startsWith(this.dossierR + '/')) noms.add(dest.basename);
      }
    }
    return [...noms];
  }

  async enrichirReference(refFile, apiRef) {
    this.marquerEcriture(refFile.path);
    await this.app.fileManager.processFrontMatter(refFile, (fm) => {
      if (apiRef.titre) fm['titre-cité'] = apiRef.titre;
      if (apiRef.doi) fm['doi'] = apiRef.doi;
    });
  }

  // Commande : générer la note de bibliographie citée d'une source.
  ligneRefTexte(a) {
    const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
    const aut = (a.auteurs || []).map(cap).join(', ');
    const t = a.titre || a.brut || '(sans titre)';
    const d = a.doi ? '`' + a.doi + '`' : '`—`';
    return '- ' + (aut ? aut + ' ' : '') + (a.annee ? '(' + a.annee + ') ' : '') + '— ' + t + '  ' + d;
  }

  // Génère la note de bibliographie citée d'une source, à trois statuts, et
  // rattache / enrichit dynamiquement ses références en attente au passage.
  async genererBibliographieSource(fileArg, silencieux) {
    if (!this.settings.apiReferencesCitees) {
      if (!silencieux) new obsidian.Notice(tr('Références citées via API : désactivé dans les réglages.'));
      return null;
    }
    const file = fileArg || this.app.workspace.getActiveFile();
    if (!file || !this.estSourceZoteroFrontmatter(file)) {
      if (!silencieux) new obsidian.Notice(tr('Ouvrez une note source Zotero.'));
      return null;
    }
    const doi = this.doiDeSource(file);
    if (!doi) { if (!silencieux) new obsidian.Notice(tr("Cette source n'a pas de DOI.")); return null; }
    if (!silencieux) new obsidian.Notice(tr('Récupération de la bibliographie…'));
    const apiRefs = await this.apiRefsPourDoi(doi);
    if (!apiRefs.length) { if (!silencieux) new obsidian.Notice(tr("Aucune référence citée trouvée pour ce DOI.")); return null; }

    const index = this.construireIndexZotero();
    const pendings = this.referencesEnAttenteDeSource(file.basename)
      .map((nm) => ({ nom: nm, ref: parseNomReference(nm, this.settings) }))
      .filter((x) => x.ref);
    // Combien d'entrées de la bibliographie répondent à chaque référence en
    // attente ? Au-delà d'une, l'appariement auteur-année ne désigne rien : on
    // classe la référence sans écrire d'identification. C'est ce silence qui
    // avait inscrit un mauvais « Renn, 2008 » dans le coffre.
    const ambigues = new Set();
    for (const x of pendings) {
      let n = 0;
      for (const a of apiRefs) if (this.refCorrespondApi(x.ref, a)) n += 1;
      if (n > 1) ambigues.add(x.nom);
    }

    const dejaMatch = new Set();
    const secZotero = [];
    const secAttente = [];
    const secSeule = [];

    for (const a of apiRefs) {
      const zBase = a.doi ? this.sourceParDoi(a.doi, index) : null;
      const pm = pendings.find((x) => !dejaMatch.has(x.nom) && this.refCorrespondApi(x.ref, a));
      if (zBase) {
        // Présente dans Zotero : rattache la référence en attente correspondante.
        if (pm) {
          await this.remplacerLiens(pm.nom, zBase);
          const pf = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + pm.nom + '.md');
          if (pf instanceof obsidian.TFile) await this.supprimerFichier(pf);
          const e = index.find((z) => z.basename === zBase);
          if (e) await this.assurerNotesAuteurs(zBase, e.creatorsFull || []);
          dejaMatch.add(pm.nom);
        }
        secZotero.push('[[' + zBase + ']]');
      } else if (pm) {
        // Référence en attente (citée en annotation, absente de Zotero) : enrichie.
        const pf = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + pm.nom + '.md');
        if (pf instanceof obsidian.TFile && !ambigues.has(pm.nom)) await this.enrichirReference(pf, a);
        dejaMatch.add(pm.nom);
        // On inscrit à côté du lien ce que la bibliographie dit de cette
        // référence. Sans cela la note ne montre qu'un « Auteur, Année » qui ne
        // distingue rien, alors que l'identification vient d'être trouvée et
        // écrite dans la note en attente : elle était invérifiable.
        secAttente.push('[[' + pm.nom + ']] ' + this.ligneRefTexte(a).replace(/^- /, '— ')
          + (ambigues.has(pm.nom) ? '  *(plusieurs entrées possibles : à arbitrer)*' : ''));
      } else {
        // Bibliographie seule : texte, hors graphe.
        secSeule.push(this.ligneRefTexte(a));
      }
    }
    // Celles que la bibliographie ne mentionne pas restent nues : c'est une
    // information en soi, et il ne faut pas laisser croire à une identification.
    for (const x of pendings) if (!dejaMatch.has(x.nom)) secAttente.push('[[' + x.nom + ']]  *(non trouvée dans cette bibliographie)*');

    const uniq = (arr) => [...new Set(arr)];
    const zList = uniq(secZotero);
    const aList = uniq(secAttente);
    const sList = uniq(secSeule);

    const lignes = [
      '---',
      'type: bibliographie-citée',
      'source: ' + JSON.stringify('[[' + file.basename + ']]'),
      'nb-references: ' + apiRefs.length,
      'nb-dans-zotero: ' + zList.length,
      'nb-en-attente: ' + aList.length,
      '---',
      '',
      '# Bibliographie citée — ' + file.basename,
      '',
      '> ' + zList.length + ' dans Zotero · ' + aList.length + ' en attente · ' +
        sList.length + ' hors corpus (sur ' + apiRefs.length + ').',
      '',
      '## Dans Zotero',
      ...(zList.length ? zList.map((l) => '- ' + l) : ['*(aucune)*']),
      '',
      '## Références en attente (citées dans vos annotations)',
      ...(aList.length ? aList.map((l) => '- ' + l) : ['*(aucune)*']),
      '',
      '## Bibliographie seule (non citées — hors graphe)',
      ...(sList.length ? sList : ['*(aucune)*']),
    ];
    await this.assurerDossier(this.settings.dossierBibliographies);
    const nomBiblio = this.nettoyerNomFichier((this.settings.prefixeBibliographie || '') + file.basename);
    const chemin = this.settings.dossierBibliographies + '/' + nomBiblio + '.md';
    await this.ecrire(chemin, lignes.join('\n') + '\n');
    if (!silencieux) {
      new obsidian.Notice(tr('Bibliographie : ') + zList.length + ' dans Zotero, ' + aList.length + ' en attente, ' +
        sList.length + ' hors corpus.'
      );
      const nf = this.app.vault.getAbstractFileByPath(chemin);
      if (nf instanceof obsidian.TFile) this.app.workspace.getLeaf(false).openFile(nf);
    }
    return { zotero: zList.length, attente: aList.length, seule: sList.length, total: apiRefs.length };
  }

  // Batch : génère les bibliographies pour toutes les sources ZotFlow à DOI.
  async genererToutesBibliographies() {
    if (!this.settings.apiReferencesCitees) { new obsidian.Notice(tr('Références citées via API : désactivé.')); return; }
    if (this.bibliosEnCours) { new obsidian.Notice(tr('Génération déjà en cours.')); return; }
    const sources = this.app.vault
      .getMarkdownFiles()
      .filter((f) => this.estSourceZoteroFrontmatter(f) && this.doiDeSource(f));
    if (!sources.length) { new obsidian.Notice(tr('Aucune source Zotero avec DOI.')); return; }

    this.bibliosEnCours = true;
    // Une notification persistante, mise à jour à chaque source. L'ancienne
    // version en créait une neuve toutes les dix sources, qui s'effaçait au
    // bout de quelques secondes : entre deux, l'écran ne disait plus rien.
    const avis = new obsidian.Notice('', 0);
    const debut = Date.now();
    let ok = 0, vide = 0, i = 0, reseau = 0;

    for (const f of sources) {
      if (!this.bibliosEnCours) break;
      i++;
      const ecoule = (Date.now() - debut) / 1000;
      const reste = reseau > 0 && i > 1
        ? Math.round((ecoule / i) * (sources.length - i))
        : null;
      avis.setMessage(tr('Bibliographies : ') + i + ' / ' + sources.length
        + '  ·  ' + ok + ' ' + tr('générée(s)') + ', ' + vide + ' ' + tr('sans résultat')
        + (reste !== null ? '\n' + tr('Reste environ ') + dureeLisible(Math.ceil(reste / 60)) : '')
        + '\n' + f.basename.slice(0, 46));
      try {
        const r = await this.genererBibliographieSource(f, true);
        if (r) ok++; else vide++;
      } catch (e) {
        vide++;
        console.error('[Ariane] biblio', f.basename, e);
      }
      // La temporisation ne vaut que pour le réseau. Une source déjà en cache
      // n'appelle personne : la faire attendre 1,2 s coûtait un quart d'heure
      // sur sept cents sources.
      if (this.dernierAppelReseau) { reseau++; await new Promise((res) => setTimeout(res, 1200)); }
    }
    const arrete = !this.bibliosEnCours;
    this.bibliosEnCours = false;
    avis.hide();
    // L'identification vient de changer : les libellés à double sens se
    // détachent d'eux-mêmes, sans rien demander.
    if (!arrete) {
      await this.fusionnerAutomatiquement(true);
      await this.detacherAutomatiquement(true);
      await this.ecrireIdentificationsAutomatiquement(true);
    }
    new obsidian.Notice((arrete ? tr('Génération interrompue : ') : tr('Bibliographies terminées : '))
      + ok + ' ' + tr('générée(s)') + ', ' + vide + ' ' + tr('sans résultat')
      + ', ' + tr('sur ') + i + '. ' + reseau + ' ' + tr('appel(s) réseau') + '.', 12000);
  }

  //#endregion Ariane · bibliographie — index & génération

  //#region Ariane · événements vault & métadonnées
  // ── événements vault & métadonnées ───────────────────────────────────────

  /* -------------------------------- Événements ------------------------------- */

  surModification(file) {
    if (!(file instanceof obsidian.TFile) || file.extension !== 'md') return;
    if (this.ecritePlugin(file.path)) return;

    if (file.path.startsWith(this.dossierA + '/')) {
      if (this.settings.verrouillage) {
        this.antirebond('lock:' + file.path, () => this.verrouiller(file));
      }
      return;
    }
    if (!this.settings.regenerationAuto && !this.settings.rattachementZotero) return;
    this.antirebond('src:' + file.path, async () => {
      const contenu = await this.app.vault.read(file);
      if (this.settings.regenerationAuto && contenu.includes(this.settings.marqueurSource)) {
        await this.atomiseSource(file);
      }
      if (this.settings.rattachementZotero && this.estSourceZoteroFrontmatter(file)) {
        await this.rattacherReferencesZotero(file);
      }
    });
  }

  surCreation(file) {
    if (!(file instanceof obsidian.TFile) || file.extension !== 'md') return;
    if (this.ecritePlugin(file.path)) return;
    if (!this.settings.regenerationAuto && !this.settings.rattachementZotero) return;
    this.antirebond('src:' + file.path, async () => {
      const contenu = await this.app.vault.read(file);
      if (this.settings.regenerationAuto && contenu.includes(this.settings.marqueurSource)) {
        await this.atomiseSource(file);
      }
      if (this.settings.rattachementZotero && this.estSourceZoteroFrontmatter(file)) {
        await this.rattacherReferencesZotero(file);
      }
    });
  }

  // Le bouton « Nouveau » d'une base (ou une création à la main) dépose une
  // note vide dans le dossier des tâches. On la transforme en vraie tâche :
  // référence T26-xxx et entête complète. On ne touche jamais une note qui a
  // déjà un corps rédigé ou un schéma de tâche renseigné.
  surCreationTacheVierge(file) {
    if (!(file instanceof obsidian.TFile) || file.extension !== 'md') return;
    if (this.ecritePlugin(file.path)) return;
    const dossier = this.dossierT;
    if (!file.parent || (file.parent.path !== dossier && !file.path.startsWith(dossier + '/'))) return;
    this.antirebond('tache-vierge:' + file.path, async () => {
      const f = this.app.vault.getAbstractFileByPath(file.path);
      if (!(f instanceof obsidian.TFile)) return;
      const brut = await this.app.vault.read(f);
      // On ne touche pas une note déjà rédigée ou déjà pourvue d'un schéma.
      const corps = brut.replace(/^---[\s\S]*?\n---\r?\n?/, '').trim();
      if (corps.length) return;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (this._lireT(fm, 'statut') || this._lireT(fm, 'debut')
        || this._lireT(fm, 'echeance') || this._lireT(fm, 'parent')
        || this._lireT(fm, 'avancement') != null) return;
      // Nom de fichier générique (« Sans titre ») : on lui attribue une
      // référence T<AA>-<NNN>, comme la commande de création. Un nom choisi
      // par l'utilisateur est respecté (identité par dossier, pas par nom).
      let cible = f;
      let intitule = f.basename;
      if (Ariane.estNomTacheGenerique(f.basename)) {
        intitule = '';
        const noms = this.app.vault.getMarkdownFiles()
          .filter((x) => x.path.startsWith(dossier + '/'))
          .map((x) => x.basename);
        let ref = Ariane.referenceTacheSuivante(noms, this.settings.refGabarit);
        // Rafale de créations : sauter les noms déjà pris en incrémentant les
        // chiffres de fin de la référence, quelle que soit sa forme.
        while (this.app.vault.getAbstractFileByPath(dossier + '/' + ref + '.md')) {
          ref = Ariane.incrementerRef(ref);
        }
        const nouveau = dossier + '/' + ref + '.md';
        this.marquerEcriture(f.path);
        this.marquerEcriture(nouveau);
        await this.app.fileManager.renameFile(f, nouveau);
        cible = this.app.vault.getAbstractFileByPath(nouveau);
        if (!(cible instanceof obsidian.TFile)) return;
      }
      const jour = new Date().toISOString().slice(0, 10);
      const cles = {};
      for (const con of Ariane.CONCEPTS_TACHE) cles[con] = this.cleT(con);
      this.marquerEcriture(cible.path);
      await this.app.vault.modify(cible, Ariane.corpsNouvelleTache({
        intitule, aujourdhui: jour, cles,
        liste: this.settings.listeRappelsDefaut,
      }));
      new obsidian.Notice(tr('Tâche créée : ') + cible.basename);
    }, 450);
  }

  surSuppression(file) {
    if (!(file instanceof obsidian.TFile) || file.extension !== 'md') return;
    if (this.ecritePlugin(file.path)) return;
    if (!this.settings.propagerSuppressions) return;
    if (file.path.startsWith(this.dossierA + '/')) {
      this.antirebond('del:' + file.path, () => this.retirerLiens(file.basename));
    } else {
      // Une source supprimée (dans Zotero) : retirer ses annotations, son
      // sous-dossier, et les fiches auteurs qui n'en dépendaient que d'elle.
      this.antirebond('delsrc:' + file.path, () => this.surSuppressionSource(file.basename));
    }
  }

  //#endregion Ariane · événements vault & métadonnées

  //#region Ariane · tâches
  // ── tâches ───────────────────────────────────────────────────────────────

  // Index « référence → fichier » des notes de tâche.
  //
  // Sans lui, chaque accès aux tâches balayait TOUT le coffre : sur un coffre
  // de quatre mille notes pour quarante tâches, c'est cent fois trop de travail,
  // et tachesPourGantt() est appelée depuis une trentaine d'endroits, dont le
  // redessin de chaque vue. L'appartenance d'une note aux tâches se lit sur son
  // seul CHEMIN (voir Ariane.refDepuisChemin) : l'index ne dépend donc pas du
  // contenu et ne se périme qu'à la création, la suppression ou le renommage
  // d'un fichier — ni à chaque frappe, ni à chaque écriture d'entête.
  _indexTaches() {
    if (this._idxTaches) return this._idxTaches;
    const m = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const ref = this.refDeChemin(f.path);
      if (ref) m.set(ref, f);
    }
    this._idxTaches = m;
    return m;
  }

  // À appeler dès qu'un chemin bouge, ou que le dossier des tâches change.
  _invaliderIndexTaches() { this._idxTaches = null; }

  // Le fichier d'une référence de tâche, en temps constant. Remplace les
  // « getMarkdownFiles().find(x => x.basename === ref) » qui parcouraient tout
  // le coffre — et vise la vraie note de tâche plutôt que le premier homonyme
  // rencontré ailleurs dans le coffre.
  fichierDeRef(ref) {
    const r = String(ref == null ? '' : ref).trim();
    if (!r) return null;
    const f = this._indexTaches().get(r);
    return (f && !f.deleted) ? f : null;
  }

  // Les tâches du coffre, dans la forme qu'attend disposerGantt. Les objets
  // sont reconstruits à chaque appel : plusieurs vues les annotent au vol
  // (aperçu d'un glissé), un objet partagé ferait fuiter ces retouches.
  tachesPourGantt() {
    const out = [];
    for (const f of this._indexTaches().values()) {
      const ref = this.refDeChemin(f.path);
      if (!ref) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const alias = [].concat(fm.aliases || []).map(String).filter(Boolean);
      const nx = Number(fm['canvas-x']);
      const ny = Number(fm['canvas-y']);
      const fmFam = Object.assign({}, fm, {
        famille: this._lireT(fm, 'famille'),
        source: this._lireT(fm, 'source'),
        livrable: this._lireT(fm, 'livrable'),
        fichier: this._lireT(fm, 'fichier'),
      });
      out.push({
        ref,
        intitule: alias[0] || ref,
        parent: this._lireT(fm, 'parent') || '',
        bloquePar: [].concat(this._lireT(fm, 'bloque-par') || []).map(String),
        debut: this._lireT(fm, 'debut') || '',
        echeance: this._lireT(fm, 'echeance') || '',
        heure: String(this._lireT(fm, 'heure') || '').trim(),
        creneaux: [].concat(this._lireT(fm, 'creneaux') || []).map(String).filter(Boolean),
        statut: this._lireT(fm, 'statut') || 'à faire',
        priorite: this._lireT(fm, 'priorite') || '',
        avancement: Number(this._lireT(fm, 'avancement')) || 0,
        jalon: this._lireT(fm, 'jalon') === true,
        famille: Ariane.familleTache(fmFam, this.settings.famillesTaches, this.settings.familleTacheDefaut),
        x: Number.isFinite(nx) ? nx : null,
        y: Number.isFinite(ny) ? ny : null,
        fichier: f,
      });
    }
    return out;
  }

  // La définition d'une famille par son id, ou un repli gris/rond pour une
  // famille inconnue ou supprimée. Jamais null : les dessinateurs s'appuient
  // dessus sans garde.
  familleDe(id) {
    const liste = Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [];
    return liste.find((f) => f && f.id === id)
      || { id: id || '', nom: id || tr('(sans famille)'), couleur: '#888888', icone: 'circle', proprietes: [] };
  }

  // Nom de liste Apple Rappels pour une tâche : celle de sa famille, sinon la
  // liste par défaut des réglages.
  listeRappelsDe(familleId) {
    const f = this.familleDe(familleId);
    return String((f && f.listeRappels) || this.settings.listeRappelsDefaut || '').trim();
  }

  // Toutes les listes Apple Rappels surveillées (familles + défaut).
  _listesSurveillees() {
    const s = new Set();
    for (const f of (Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [])) {
      if (f && f.id) { const l = this.listeRappelsDe(f.id); if (l) s.add(l); }
    }
    const d = String(this.settings.listeRappelsDefaut || '').trim();
    if (d) s.add(d);
    return [...s];
  }

  // Famille dont la liste Apple Rappels correspond à `nom` (sinon défaut).
  _familleParListe(nom) {
    const n = String(nom || '').trim().toLowerCase();
    for (const f of (Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [])) {
      if (f && f.id && String(this.listeRappelsDe(f.id)).trim().toLowerCase() === n) return f.id;
    }
    return this.settings.familleTacheDefaut || 'action';
  }

  // Nom du calendrier Apple pour une tâche : celui de sa famille, sinon le
  // calendrier par défaut des réglages. Miroir de listeRappelsDe.
  agendaCalendrierDe(familleId) {
    const f = this.familleDe(familleId);
    return String((f && f.agendaCalendrier) || this.settings.agendaCalendrierDefaut || '').trim();
  }

  // Calendriers Apple liés à la synchro (cibles de push, suivis à la relève) :
  // union des calendriers de familles + le calendrier par défaut.
  _agendasSurveilles() {
    const s = new Set();
    for (const f of (Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [])) {
      if (f && f.id) { const c = this.agendaCalendrierDe(f.id); if (c) s.add(c); }
    }
    const d = String(this.settings.agendaCalendrierDefaut || '').trim();
    if (d) s.add(d);
    return [...s];
  }

  // Calendriers affichés en fond de la vue calendrier : ceux de la synchro, plus
  // ceux cochés dans « Calendriers à afficher » (lecture seule, Apple → Obsidian,
  // jamais poussés ni relevés).
  _agendasCoches() {
    const brut = this.settings.agendaCalendriersAffiches;
    return Array.isArray(brut)
      ? brut.map((n) => String(n).trim()).filter(Boolean)
      : String(brut || '').split(',').map((n) => n.trim()).filter(Boolean);
  }

  // Calendriers affichés en fond = UNIQUEMENT ceux cochés dans « Calendriers à
  // afficher ». Les calendriers de famille sont des cibles d'écriture pour les
  // créneaux : on n'en relit pas les événements (le créneau les représente déjà
  // — les relire créait des doublons).
  _agendasAffiches() {
    return this._agendasCoches().filter((n) => !this._agendasSurveilles()
      .some((c) => c.toLowerCase() === n.toLowerCase()));
  }

  _osascriptJXA(script, ms) {
    return new Promise((res) => {
      require('child_process').execFile('osascript', ['-l', 'JavaScript', '-e', script],
        { timeout: ms || 60000, maxBuffer: 1 << 20 },
        (err, out, errOut) => {
          if (err) {
            console.warn('[Ariane] osascript a échoué :', err.code, err.killed ? '(timeout)' : '',
              String(errOut || '').trim());
          }
          res(err ? null : String(out == null ? '' : out));
        });
    });
  }

  // Charge (et met en cache) les noms de listes Apple Rappels connus de l'API.
  async chargerListesRappels() {
    if (!obsidian.Platform.isMacOS) { this._listesRappels = []; return []; }
    const s = await this._osascriptJXA(Ariane.genererJXAListes(), 30000);
    this._listesRappels = (s == null ? [] : s.split('\n').map((x) => x.trim()).filter(Boolean));
    return this._listesRappels;
  }

  // Noms des calendriers Apple (entité événements) connus de l'API, mis en cache
  // pour alimenter la liste à cocher des réglages. Garde de 30 s. Mémorise aussi
  // le statut d'accès Calendriers (this._agendaStatut : 3 = OK, 2 = refusé, …).
  async chargerAgendas() {
    if (!obsidian.Platform.isMacOS) { this._agendas = []; this._agendaStatut = -1; return []; }
    if (this._agendasChargeLe && Date.now() - this._agendasChargeLe < 30000) return this._agendas || [];
    const s = await this._osascriptJXA(Ariane.genererJXAAgendas(), 30000);
    let d = null;
    try { d = s ? JSON.parse(s) : null; } catch (e) { d = null; }
    this._agendaStatut = d ? Number(d.statut) : (s == null ? -2 : -1);
    this._agendas = (d && Array.isArray(d.calendriers)) ? d.calendriers.filter(Boolean) : [];
    this._agendasChargeLe = Date.now();
    if (this._agendaStatut === 2 || this._agendaStatut === 1) this._avertirAccesAgenda();
    // Couleurs des calendriers via AppleScript (impossible en JXA — SIGBUS).
    // Peut demander l'accès « Automatisation » à Calendar une première fois ;
    // en cas d'échec, les événements de fond gardent la couleur de repli.
    if (this._agendaStatut === 3) {
      try {
        const cs = await this._osascriptAS(Ariane.genererASCouleursAgendas(), 20000);
        this._agendaCouleurs = Ariane.parseCouleursAgendas(cs);
      } catch (e) { /* couleurs indisponibles */ }
    }
    return this._agendas;
  }

  _osascriptAS(script, ms) {
    return new Promise((res) => {
      require('child_process').execFile('osascript', ['-e', script],
        { timeout: ms || 30000, maxBuffer: 1 << 20 },
        (err, out) => res(err ? null : String(out == null ? '' : out)));
    });
  }

  // Statut d'accès Calendriers : chaîne lisible pour un message.
  _libelleStatutAgenda(st) {
    return ({ 3: 'accès complet', 4: 'écriture seule (lecture refusée)',
      2: 'refusé', 1: 'restreint', 0: 'non demandé', '-1': 'erreur',
      '-2': 'osascript indisponible' })[st] || ('statut ' + st);
  }

  _avertirAccesAgenda() {
    const st = this._agendaStatut;
    if (this._accesAgendaAverti === st) return;
    this._accesAgendaAverti = st;
    new obsidian.Notice(tr('Apple Agenda : ') + this._libelleStatutAgenda(st) + '. '
      + tr("Autorisez « Calendriers » pour Obsidian dans Réglages système → Confidentialité et sécurité."), 8000);
  }

  // Événements réels des calendriers surveillés, pour l'affichage en fond de la
  // vue calendrier. Cache mémoire 60 s, clé sur la fenêtre demandée. Exclut les
  // événements déjà représentés par un créneau (leur id figure dans un
  // agenda-id de tâche) pour ne pas les afficher deux fois.
  async evenementsFond(debutISO, finISO) {
    if (!obsidian.Platform.isMacOS || !this.settings.agendaActif) return [];
    const cle = String(debutISO) + '|' + String(finISO);
    const c = this._fondCache;
    if (c && c.cle === cle && Date.now() - c.le < 60000) return c.data;
    if (!this._agendaCouleurs) { try { await this.chargerAgendas(); } catch (e) { /* couleurs plus tard */ } }
    const cals = this._agendasAffiches();
    if (!cals.length) { this._fondCache = { cle, le: Date.now(), data: [] }; return []; }
    const connus = new Set();
    const refsConnues = new Set();
    for (const t of this.tachesPourGantt()) {
      refsConnues.add(t.ref);
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      for (const id of [].concat(this._lireT(fm, 'agenda-id') || [])) if (id) connus.add(String(id));
    }
    // Un événement est « à nous » si son id est un agenda-id connu OU si son
    // titre porte entre crochets la référence d'une tâche existante ([T010] …).
    // Le repli par le titre couvre les décalages d'identifiant EventKit et les
    // événements poussés avant cette correction.
    const aNous = (e) => {
      if (connus.has(e.id)) return true;
      const m = String(e.titre || '').match(/\[([^\]]+)\]/);
      return !!(m && refsConnues.has(m[1].trim()));
    };
    const s = await this._osascriptJXA(
      Ariane.genererJXAEvenementsFond(cals, debutISO, finISO), 30000);
    if (s && s.startsWith('__ACCES__')) {
      this._agendaStatut = Number(s.split('\t')[1]);
      this._avertirAccesAgenda();
      this._fondCache = { cle, le: Date.now(), data: [] };
      return [];
    }
    const couleurs = this._agendaCouleurs || {};
    const data = (s == null ? [] : s.split('\n').filter(Boolean).map((l) => {
      const p = l.split('\t');
      const cal = p[5] || '';
      return { id: p[0], titre: p[1] || '', debut: p[2] || '', fin: p[3] || '',
               allDay: p[4] === '1', couleur: couleurs[cal] || '', calendrier: cal };
    })).filter((e) => e.id && e.debut && !aNous(e));
    if (s == null) return [];              // échec dur : ne pas cacher, ne pas marquer l'accès OK
    this._agendaStatut = 3;
    this._fondCache = { cle, le: Date.now(), data };
    return data;
  }

  // Invalide le cache de l'agenda de fond et redemande à chaque vue calendrier
  // ouverte de le recharger (après un push, ou un changement de réglage).
  _rafraichirFond() {
    this._fondCache = null;
    for (const m of (this._moteursCalendrier || [])) {
      try { m._fondCle = null; if (m._chargerFond) m._chargerFond(); } catch (e) { /* vue fermée */ }
    }
  }

  // Instantané « dernier état synchronisé » d'une tâche, pour arbitrer les
  // conflits à la relève : échéance|heure|statut. (Côté Agenda : Ariane.instantAgenda.)
  _instantRappel(t) { return [t.echeance || '', t.heure || '', t.statut || ''].join('|'); }

  // Tâches concernées par un rappel : une échéance, ou déjà un rappel-id.
  _tachesRappel() {
    const out = [];
    for (const t of this.tachesPourGantt()) {
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      const rid = String(this._lireT(fm, 'rappel-id') || '').trim();
      const snap = String(fm['rappel-sync'] || '');
      if (!t.echeance && !rid) continue;
      if ((t.statut === 'terminée' || t.statut === 'abandonnée') && !rid) continue;
      out.push(Object.assign({}, t, { _rid: rid, _snap: snap, _fm: fm }));
    }
    return out;
  }

  // Pousse toutes les tâches éligibles vers Apple Rappels (création / mise à
  // jour), puis mémorise le rappel-id et l'instantané dans chaque note.
  //
  // Verrou : deux osascript de push concurrents (modifs très rapprochées, flush
  // au blur pendant qu'un push tourne…) créaient des DOUBLONS — le rappel-id
  // pas encore écrit relu vide par le second push, qui recrée. Même piège et
  // même parti qu'Apple Agenda : on sérialise ; si un push est demandé pendant
  // qu'un autre tourne, on en relance UN seul après.
  async pousserRappels(silencieux) {
    if (this._rappelsPushEnCours) { this._rappelsPushRedemande = true; return 0; }
    this._rappelsPushEnCours = true;
    try {
      return await this._pousserRappelsImpl(silencieux);
    } finally {
      this._rappelsPushEnCours = false;
      if (this._rappelsPushRedemande) {
        this._rappelsPushRedemande = false;
        setTimeout(() => this.pousserRappels(true), 400);
      }
    }
  }

  async _pousserRappelsImpl(silencieux) {
    if (!obsidian.Platform.isMacOS) {
      if (!silencieux) new obsidian.Notice(tr('Apple Rappels : disponible sur macOS uniquement.'));
      return 0;
    }
    if (this.settings.rappelsActif === false) return 0;
    const vault = this.app.vault.getName();
    const cibles = this._tachesRappel();
    if (!cibles.length) { if (!silencieux) new obsidian.Notice(tr('Aucune tâche à synchroniser.')); return 0; }
    const charge = [];
    for (const t of cibles) {
      let note = '';
      try { note = await this.lireNoteTache(t.ref); } catch (e) { /* rien */ }
      const lien = 'obsidian://open?vault=' + encodeURIComponent(vault)
        + '&file=' + encodeURIComponent(t.fichier.path.replace(/\.md$/, ''));
      const titre = Ariane.formatModele(
        this.settings.rappelsFormatTitre || '[{ref}] - {intitule}',
        { ref: t.ref, intitule: t.intitule, famille: (this.familleDe(t.famille) || {}).nom || '' });
      charge.push({
        ref: t.ref, id: t._rid, titre,
        // Le dédoublonnage JXA ne balaie que si la référence se lit dans le
        // titre du rappel : sans {ref} dans le gabarit, impossible d'identifier
        // un homonyme sans risque d'en supprimer un legitime.
        dedup: titre.indexOf(t.ref) >= 0,
        notes: (note ? note.slice(0, 500).trim() + '\n\n' : '') + lien,
        liste: this.listeRappelsDe(t.famille),
        echeance: t.echeance || '', heure: t.heure || '',
        priorite: t.priorite || '', termine: t.statut === 'terminée',
      });
    }
    const avis = silencieux ? null : new obsidian.Notice(tr('Synchronisation Apple Rappels…'), 0);
    const sortie = await this._osascriptJXA(Ariane.genererJXARappels(charge));
    if (avis) avis.hide();
    if (sortie == null) {
      if (!silencieux) new obsidian.Notice(tr('Apple Rappels a refusé (autorisation d\'automatisation dans Réglages système ?).'));
      return 0;
    }
    const parRef = new Map(cibles.map((t) => [t.ref, t]));
    let n = 0;
    for (const l of sortie.split('\n')) {
      const [ref, id] = l.split('\t');
      const t = ref && parRef.get(ref);
      if (!t || !id) continue;
      const champs = {};
      if (id && id !== t._rid) champs['rappel-id'] = id;
      const f = t.fichier;
      if (Object.keys(champs).length) {
        // marquerEcriture fait taire l'écoute metadataCache : sans lui, chaque
        // push qui re-mémorise un rappel-id relançait un push (echo).
        if (f) this.marquerEcriture(f.path);
        await this.majTache(ref, champs);
      }
      // L'instantané ne s'écrit que s'il change : réécrire à l'identique fait
      // un écho metadataCache au-delà de la fenêtre d'anti-écho (parti Agenda).
      if (f && this._instantRappel(t) !== t._snap) {
        this.marquerEcriture(f.path);
        await this.app.fileManager.processFrontMatter(f, (x) => {
          x['rappel-sync'] = this._instantRappel(t);
        });
      }
      n += 1;
    }
    if (!silencieux) new obsidian.Notice(n + tr(' rappel(s) synchronisé(s).'));
    return n;
  }

  // Relève : un rappel coché → tâche terminée ; échéance changée dans Rappels →
  // répercutée (sauf si la note a bougé, elle fait foi) ; un rappel ajouté à la
  // main dans une liste surveillée, sans référence connue → nouvelle tâche.
  async releverRappels(silencieux) {
    if (!obsidian.Platform.isMacOS || this.settings.rappelsActif === false) return 0;
    const listes = this._listesSurveillees();
    const avecId = [];
    const idsConnus = new Set();
    for (const t of this.tachesPourGantt()) {
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      const rid = String(this._lireT(fm, 'rappel-id') || '').trim();
      if (rid) {
        idsConnus.add(rid);
        avecId.push(Object.assign({}, t, { _rid: rid, _snap: String(fm['rappel-sync'] || '') }));
      }
    }
    if (!avecId.length && !listes.length) return 0;
    const avis = silencieux ? null : new obsidian.Notice(tr('Relève Apple Rappels…'), 0);
    const sortie = await this._osascriptJXA(
      Ariane.genererJXAReleve(avecId.map((t) => ({ ref: t.ref, id: t._rid })), listes));
    if (avis) avis.hide();
    if (sortie == null) return 0;
    const parRef = new Map(avecId.map((t) => [t.ref, t]));
    const refsTaches = new Set(this.tachesPourGantt().map((x) => x.ref));
    let n = 0;
    for (const l of sortie.split('\n')) {
      const parts = l.split('\t');
      if (parts[0] === 'NOUVEAU') {
        const id = parts[1];
        const nom = String(parts[2] || '').trim();
        const coche = parts[3] === '1';
        const dueIso = parts[4] || '';
        const listeNom = parts[5] || '';
        if (!id || idsConnus.has(id)) continue;
        // Le titre du rappel porte-t-il la référence d'une tâche existante ? On
        // relie au lieu de recréer. Sans supposer de forme : un jeton entre
        // crochets qui est une réf connue, sinon une réf connue en sous-chaîne.
        const refLiee = Ariane.refDansTexte(nom, refsTaches);
        if (refLiee) {
          await this.majTache(refLiee, { 'rappel-id': id });
          idsConnus.add(id); n += 1; continue;
        }
        const d = dueIso.slice(0, 10);
        const h = dueIso.length > 10 ? dueIso.slice(11, 16) : '';
        const chemin = await this.creerTache({
          intitule: nom || tr('Sans titre'),
          echeance: d, heure: h === '00:00' ? '' : h,
          statut: coche ? 'terminée' : 'à faire',
          liste: listeNom,
          famille: this._familleParListe(listeNom),
        });
        const ref = this.refDeChemin(chemin);
        if (ref) {
          await this.majTache(ref, { 'rappel-id': id });
          const f2 = this.fichierDeRef(ref);
          if (f2) {
            this.marquerEcriture(f2.path);
            await this.app.fileManager.processFrontMatter(f2, (x) => {
              x['rappel-sync'] = [d, h === '00:00' ? '' : h, coche ? 'terminée' : 'à faire'].join('|');
            });
          }
          idsConnus.add(id); n += 1;
        }
        continue;
      }
      const t = parts[0] && parRef.get(parts[0]);
      if (!t) continue;
      if (parts[1] === 'MANQUANT') continue;
      const coche = parts[1] === '1';
      const dueIso = parts[2] || '';
      const noteInstant = this._instantRappel(t);
      const noteBougee = t._snap && noteInstant !== t._snap;
      const champs = {};
      // Complétion : le rappel coché termine la tâche (si la note n'a pas changé de statut).
      if (coche && t.statut !== 'terminée' && !noteBougee) {
        champs.statut = 'terminée';
        champs.terminee = true;
      }
      // Échéance : reportée seulement si la note n'a pas bougé.
      if (dueIso && !noteBougee) {
        const d = dueIso.slice(0, 10);
        const h = dueIso.length > 10 ? dueIso.slice(11, 16) : '';
        const hNote = h === '00:00' ? '' : h;
        if (d !== t.echeance || (hNote || '') !== (t.heure || '')) {
          champs.echeance = d;
          champs.heure = hNote;
        }
      }
      if (Object.keys(champs).length) {
        await this.majTache(t.ref, champs);
        if (t.fichier) {
          const maj2 = Object.assign({ echeance: t.echeance, heure: t.heure, statut: t.statut }, champs);
          this.marquerEcriture(t.fichier.path);
          await this.app.fileManager.processFrontMatter(t.fichier, (x) => {
            x['rappel-sync'] = [maj2.echeance || '', maj2.heure || '', maj2.statut || ''].join('|');
          });
        }
        n += 1;
      }
    }
    if (!silencieux && n) new obsidian.Notice(n + tr(' tâche(s) mise(s) à jour depuis Rappels.'));
    return n;
  }

  /* ---- Apple Rappels : orchestration -------------------------------- */

  // La synchro automatique Rappels doit-elle tourner ? (macOS, activée, auto.)
  _rappelsAutoActif() {
    return obsidian.Platform.isMacOS && !!this.settings.rappelsActif && !!this.settings.rappelsAuto;
  }

  // Programme un push automatique (note de tâche modifiée, nouvelle tâche…).
  // Antirebondi ; le verrou de pousserRappels gère les recouvrements.
  _relancerPushRappels(delai) {
    if (!this._rappelsAutoActif()) return;
    this._rappelsPushEnAttente = true;
    this.antirebond('rappels:push', async () => {
      try { await this.pousserRappels(true); } finally { this._rappelsPushEnAttente = false; }
    }, delai || 2000);
  }

  // Programme une relève automatique (retour de focus…), antirebondie et
  // espacée d'au moins 15 s des précédentes ; sautée si un push est en attente.
  _relancerReleveRappels(delai) {
    if (!this._rappelsAutoActif() || this._rappelsPushEnAttente) return;
    if (this._rappelsDerniereReleve && Date.now() - this._rappelsDerniereReleve < 15000) return;
    this.antirebond('rappels:releve', async () => {
      this._rappelsDerniereReleve = Date.now();
      await this.releverRappels(true);
    }, delai || 700);
  }

  /* ---- Apple Agenda : orchestration -------------------------------- */

  // La synchro automatique Agenda doit-elle tourner ? (macOS, activée, auto, et
  // l'accès Calendriers n'est pas refusé/restreint.)
  _agendaAutoActif() {
    return obsidian.Platform.isMacOS && !!this.settings.agendaActif
      && this.settings.agendaAuto !== false
      && this._agendaStatut !== 2 && this._agendaStatut !== 1;
  }

  // Programme un push automatique (créneau modifié depuis la vue calendrier,
  // note de tâche sauvegardée…). Antirebondi ; le verrou de pousserAgenda gère
  // les recouvrements.
  _relancerPushAgenda(delai) {
    if (!this._agendaAutoActif()) return;
    this._agendaPushEnAttente = true;
    this.antirebond('agenda:push', async () => {
      try { await this.pousserAgenda(true); } finally { this._agendaPushEnAttente = false; }
    }, delai || 2000);
  }

  // Programme une relève automatique (retour de focus, ouverture de la vue…),
  // antirebondie et espacée d'au moins 15 s des précédentes.
  _relancerReleveAgenda(delai) {
    if (!this._agendaAutoActif() || this._agendaPushEnAttente) return;
    if (this._agendaDerniereReleve && Date.now() - this._agendaDerniereReleve < 15000) return;
    this.antirebond('agenda:releve', async () => {
      this._agendaDerniereReleve = Date.now();
      await this.releverAgenda(true);
    }, delai || 800);
  }

  // Pousse les créneaux des tâches éligibles vers Apple Calendar (un EKEvent par
  // créneau), supprime les événements des créneaux disparus, mémorise agenda-id
  // (liste alignée sur les créneaux) et agenda-sync dans la note.
  //
  // Verrou : deux osascript de push concurrents (modif très rapprochée, flush au
  // blur pendant un push en cours…) créaient des doublons. On sérialise ; si un
  // push est demandé pendant qu'un autre tourne, on en relance UN seul après.
  async pousserAgenda(silencieux) {
    if (this._pushEnCours) { this._pushRedemande = true; return 0; }
    this._pushEnCours = true;
    try {
      return await this._pousserAgendaImpl(silencieux);
    } finally {
      this._pushEnCours = false;
      if (this._pushRedemande) {
        this._pushRedemande = false;
        setTimeout(() => this.pousserAgenda(true), 400);
      }
    }
  }

  async _pousserAgendaImpl(silencieux) {
    if (!silencieux) console.info('[Ariane] Apple Agenda — push manuel demandé.');
    if (!obsidian.Platform.isMacOS) {
      if (!silencieux) new obsidian.Notice(tr('Apple Agenda : disponible sur macOS uniquement.'));
      return 0;
    }
    if (!this.settings.agendaActif) {
      if (!silencieux) new obsidian.Notice(tr("Apple Agenda est désactivé (Réglages → Tâches → Apple Agenda → Activer)."), 8000);
      return 0;
    }
    const vault = this.app.vault.getName();
    const cibles = [];
    for (const t of this.tachesPourGantt()) {
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      const ids = [].concat(this._lireT(fm, 'agenda-id') || []).map(String);
      const crs = Ariane.creneauxDeTache(t);
      const cal = this.agendaCalendrierDe(t.famille);
      if (!(crs.length && cal) && !ids.some((x) => x)) continue;
      cibles.push(Object.assign({}, t, { _fm: fm, _ids: ids, _crs: crs, _cal: cal }));
    }
    if (!cibles.length) {
      if (!silencieux) {
        new obsidian.Notice(tr("Aucune tâche à synchroniser : il faut au moins un créneau ET un calendrier Apple sur la famille (ou le calendrier par défaut)."), 9000);
      }
      return 0;
    }
    const charge = [];
    for (const t of cibles) {
      let note = '';
      try { note = await this.lireNoteTache(t.ref); } catch (e) { /* rien */ }
      const lien = 'obsidian://open?vault=' + encodeURIComponent(vault)
        + '&file=' + encodeURIComponent(t.fichier.path.replace(/\.md$/, ''));
      // Le lien vers la note va dans le champ « URL » de l'événement (pas dans
      // les notes) ; les notes ne portent que l'extrait de la note de travail.
      const notes = note ? note.slice(0, 500).trim() : '';
      const titreBase = Ariane.formatModele(
        this.settings.agendaFormatTitre || '[{ref}] - {intitule}',
        { ref: t.ref, intitule: t.intitule, famille: (this.familleDe(t.famille) || {}).nom || '' });
      const prefixe = t.statut === 'terminée' ? '✅ ' : '';
      const plusieurs = t._crs.length > 1;
      const relie = t._crs.length && t._cal;
      if (relie) {
        t._crs.forEach((c, i) => {
          charge.push({
            ref: t.ref, idx: i, id: t._ids[i] || '',
            titre: prefixe + titreBase + (plusieurs ? ' (session ' + (i + 1) + ')' : ''),
            notes, lien, calendrier: t._cal, debut: c.debut, fin: c.fin,
            // Fenêtre élargie pour le rattrapage anti-doublon : si un créneau a
            // été déplacé de quelques jours entre deux push, on retrouve quand
            // même l'événement existant au lieu d'en créer un nouveau.
            scanDebut: Ariane.decalerJour(c.debut.slice(0, 10), -3),
            scanFin: Ariane.decalerJour(c.fin.slice(0, 10), 3),
          });
        });
      }
      // agenda-id sans créneau correspondant (créneau retiré, ou tâche devenue
      // inéligible) → suppression de l'EKEvent.
      const garde = relie ? t._crs.length : 0;
      t._ids.forEach((id, i) => {
        if (id && i >= garde) charge.push({ ref: t.ref, idx: i, id, supprimer: true });
      });
    }
    if (!charge.length) {
      if (!silencieux) new obsidian.Notice(tr('Rien à pousser vers Apple Agenda.'));
      return 0;
    }
    const avis = silencieux ? null : new obsidian.Notice(tr('Synchronisation Apple Agenda…'), 0);
    const sortie = await this._osascriptJXA(Ariane.genererJXAEvenementsPush(charge));
    if (avis) avis.hide();
    if (sortie == null) {
      if (!silencieux) new obsidian.Notice(tr('Apple Agenda a refusé (autorisation d\'automatisation dans Réglages système ?).'));
      return 0;
    }
    if (sortie.startsWith('__ACCES__')) {
      this._agendaStatut = Number(sortie.split('\t')[1]);
      if (silencieux) this._avertirAccesAgenda();
      else {
        new obsidian.Notice(tr('Apple Agenda : ') + this._libelleStatutAgenda(this._agendaStatut)
          + '. ' + tr("Autorisez « Calendriers » pour Obsidian dans Réglages système → Confidentialité et sécurité."), 10000);
      }
      return 0;
    }
    const recu = new Map();
    const erreurs = [];
    for (const l of sortie.split('\n')) {
      const p = l.split('\t');
      const [ref, idxS, val] = p;
      if (!ref || idxS === undefined) continue;
      if (val === 'ERREUR') { erreurs.push(ref + ' #' + idxS + ' : ' + (p[3] || '?')); continue; }
      if (!recu.has(ref)) recu.set(ref, []);
      recu.get(ref)[Number(idxS)] = (val && val !== 'SUPPRIME') ? val : '';
    }
    if (erreurs.length) console.warn('[Ariane] Apple Agenda — échecs de push :\n' + erreurs.join('\n'));
    let n = 0;
    let liens = 0;
    for (const t of cibles) {
      const arr = recu.get(t.ref) || [];
      const liste = [];
      let confirme = true; // chaque créneau a reçu un identifiant du push
      for (let i = 0; i < t._crs.length; i += 1) {
        if (!arr[i]) confirme = false; // échec : ancien lien conservé, mais pas de « à jour »
        liste.push(arr[i] || t._ids[i] || '');
      }
      liens += liste.filter(Boolean).length;
      if (JSON.stringify(liste) !== JSON.stringify(t._ids)) {
        if (t.fichier) this.marquerEcriture(t.fichier.path); // pas de push en écho
        await this.majTache(t.ref, { 'agenda-id': liste });
      }
      // agenda-sync n'est écrit QUE si tous les créneaux ont bien un événement
      // lié — sinon la relève pourrait croire la note « à jour » et retirer le
      // lien d'un créneau que le push n'a pas réussi à créer.
      const complet = t._crs.length ? (confirme && liste.every(Boolean)) : true;
      // Et il n'est réécrit QUE s'il change : une réécriture à l'identique
      // relance la file du metadataCache, dont l'écho peut dépasser la fenêtre
      // d'anti-écho (2,5 s des deux côtés) et déclencher un push sans fin.
      const instant = Ariane.instantAgenda(t);
      if (t.fichier && complet && String(t._fm['agenda-sync'] || '') !== instant) {
        this.marquerEcriture(t.fichier.path);
        await this.app.fileManager.processFrontMatter(t.fichier, (x) => {
          x['agenda-sync'] = instant;
        });
      }
      n += 1;
    }
    this._rafraichirFond();
    console.info('[Ariane] Apple Agenda — push ' + (silencieux ? 'auto' : 'manuel')
      + ' : ' + liens + ' lien(s), ' + erreurs.length + ' échec(s).');
    if (!silencieux) {
      new obsidian.Notice(liens + tr(' événement(s) liés dans Apple Agenda')
        + (erreurs.length ? tr(', ') + erreurs.length + tr(' échec(s) — voir la console') : '') + '.', 8000);
    }
    return n;
  }

  // Diagnostic Apple Agenda : statut d'accès + calendriers vus + comptage des
  // tâches éligibles. Affiche un résumé et détaille dans la console.
  async diagnostiquerAgenda() {
    if (!obsidian.Platform.isMacOS) {
      new obsidian.Notice(tr('Apple Agenda : disponible sur macOS uniquement.'));
      return;
    }
    const avis = new obsidian.Notice(tr('Diagnostic Apple Agenda…'), 0);
    const s = await this._osascriptJXA(Ariane.genererJXAAgendas(), 30000);
    avis.hide();
    let d = null;
    try { d = s ? JSON.parse(s) : null; } catch (e) { d = null; }
    if (!d) {
      new obsidian.Notice(tr('Diagnostic : osascript n\'a rien renvoyé (voir la console).'), 8000);
      console.warn('[Ariane] diagnostic agenda — sortie brute :', s);
      return;
    }
    this._agendaStatut = Number(d.statut);
    this._agendas = Array.isArray(d.calendriers) ? d.calendriers : [];
    this._agendasChargeLe = Date.now();
    let elig = 0;
    for (const t of this.tachesPourGantt()) {
      const crs = Ariane.creneauxDeTache(t);
      if (crs.length && this.agendaCalendrierDe(t.famille)) elig += 1;
    }
    const lignes = [
      tr('Accès Calendriers : ') + this._libelleStatutAgenda(d.statut)
        + (d.statutAvant !== d.statut ? tr(' (demandé à l\'instant)') : ''),
      tr('Calendriers vus : ') + (d.calendriers.length ? d.calendriers.join(', ') : '—'),
      tr('Calendrier par défaut : ') + (d.defaut || '—'),
      tr('Calendriers surveillés (synchro) : ') + (this._agendasSurveilles().join(', ') || '—'),
      tr('Calendriers cochés (affichage) : ') + (this._agendasCoches().join(', ') || '—'),
      tr('Tâches éligibles au push : ') + elig,
      tr('Intégration activée : ') + (this.settings.agendaActif ? tr('oui') : tr('non')),
    ];
    console.info('[Ariane] diagnostic Apple Agenda\n' + lignes.join('\n'));
    new obsidian.Notice(lignes.join('\n'), 15000);
  }

  // Ménage : supprime des calendriers de synchro les événements « à Ariane »
  // (URL obsidian:// ou titre « [ref] … ») qui ne sont plus reliés à aucun
  // créneau — les doublons laissés par une course entre deux push.
  async nettoyerAgenda(silencieux) {
    if (!obsidian.Platform.isMacOS) {
      if (!silencieux) new obsidian.Notice(tr('Apple Agenda : disponible sur macOS uniquement.'));
      return 0;
    }
    if (!this.settings.agendaActif) {
      if (!silencieux) new obsidian.Notice(tr("Apple Agenda est désactivé (Réglages → Tâches → Apple Agenda → Activer)."), 8000);
      return 0;
    }
    const cals = this._agendasSurveilles();
    if (!cals.length) return 0;
    const ids = {};
    const refs = [];
    for (const t of this.tachesPourGantt()) {
      refs.push(t.ref);
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      for (const id of [].concat(this._lireT(fm, 'agenda-id') || [])) if (id) ids[String(id)] = 1;
    }
    const avis = silencieux ? null : new obsidian.Notice(tr('Nettoyage Apple Agenda…'), 0);
    const sortie = await this._osascriptJXA(Ariane.genererJXAEvenementsMenage(
      cals, ids, refs, this.settings.agendaFenetreJours || 120));
    if (avis) avis.hide();
    if (sortie == null || sortie.startsWith('__ACCES__')) {
      if (!silencieux) new obsidian.Notice(tr('Apple Agenda : nettoyage impossible (voir la console).'));
      return 0;
    }
    const n = sortie.split('\n').filter((l) => l.startsWith('SUPPRIME')).length;
    if (n) { console.info('[Ariane] Apple Agenda — doublons supprimés :\n' + sortie); this._rafraichirFond(); }
    if (!silencieux) new obsidian.Notice(n + tr(' doublon(s) supprimé(s) d\'Apple Agenda.'), 6000);
    return n;
  }

  // Relève : pour chaque EKEvent lié, horaires changés dans Calendar → réécriture
  // de l'entrée de créneau ; événement supprimé → retrait du créneau. Aucun
  // import d'événement inconnu. La note fait foi si elle a bougé (agenda-sync).
  async releverAgenda(silencieux) {
    if (!obsidian.Platform.isMacOS) {
      if (!silencieux) new obsidian.Notice(tr('Apple Agenda : disponible sur macOS uniquement.'));
      return 0;
    }
    if (!this.settings.agendaActif) {
      if (!silencieux) new obsidian.Notice(tr("Apple Agenda est désactivé (Réglages → Tâches → Apple Agenda → Activer)."), 8000);
      return 0;
    }
    const avecId = [];
    for (const t of this.tachesPourGantt()) {
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      const ids = [].concat(this._lireT(fm, 'agenda-id') || []).map(String);
      if (!ids.some((x) => x)) continue;
      avecId.push(Object.assign({}, t, { _ids: ids,
        _crs: Ariane.creneauxDeTache(t), _snap: String(fm['agenda-sync'] || '') }));
    }
    if (!avecId.length) {
      if (!silencieux) new obsidian.Notice(tr("Aucun événement lié à relever (lancez d'abord la synchro vers Apple Agenda)."), 8000);
      return 0;
    }
    const paires = [];
    for (const t of avecId) t._ids.forEach((id, i) => { if (id) paires.push({ ref: t.ref, idx: i, id }); });
    const avis = silencieux ? null : new obsidian.Notice(tr('Relève Apple Agenda…'), 0);
    const sortie = await this._osascriptJXA(
      Ariane.genererJXAEvenementsReleve(paires, this.settings.agendaFenetreJours || 120));
    if (avis) avis.hide();
    if (sortie == null) {
      if (!silencieux) new obsidian.Notice(tr('Apple Agenda : la relève a échoué (voir la console).'), 8000);
      return 0;
    }
    if (sortie.startsWith('__ACCES__')) {
      this._agendaStatut = Number(sortie.split('\t')[1]);
      if (silencieux) this._avertirAccesAgenda();
      else new obsidian.Notice(tr('Apple Agenda : ') + this._libelleStatutAgenda(this._agendaStatut)
        + '. ' + tr("Autorisez « Calendriers » pour Obsidian dans Réglages système → Confidentialité et sécurité."), 10000);
      return 0;
    }
    const parRef = new Map(avecId.map((t) => [t.ref, t]));
    let n = 0;
    for (const l of sortie.split('\n')) {
      const p = l.split('\t');
      const t = p[0] && parRef.get(p[0]);
      if (!t) continue;
      if (t._snap && Ariane.instantAgenda(t) !== t._snap) continue; // la note a bougé
      const idx = Number(p[1]);
      const cr = t._crs[idx];
      if (!cr) continue;
      if (p[2] === 'MANQUANT') {
        // Événement introuvable : ça peut être une vraie suppression, mais aussi
        // un simple raté de résolution d'identifiant (latence iCloud). On NE
        // supprime PAS le créneau — on efface seulement le lien, le prochain
        // push recréera l'événement.
        const ids = t._ids.slice();
        if (ids[idx]) { ids[idx] = ''; await this.majTache(t.ref, { 'agenda-id': ids }); n += 1; }
        continue;
      }
      const isoD = p[2] || '';
      const isoF = p[3] || '';
      if (isoD && isoF && (isoD !== cr.debut || isoF !== cr.fin)) {
        await this.majCreneau(t.ref, { avant: cr.brut, debut: isoD, fin: isoF });
        n += 1;
      }
    }
    if (n) this.antirebond('agenda:push', () => this.pousserAgenda(true), 1500);
    if (!silencieux && n) new obsidian.Notice(n + tr(' créneau(x) mis à jour depuis Apple Agenda.'));
    return n;
  }

  _labelConcept(concept) { return Ariane.libelleConcept(concept); }

  cleT(concept) {
    return Ariane.cleTache(concept, {
      prefixe: this.settings.prefixeTaches || '',
      cles: this.settings.clesTaches,
    });
  }

  // Intitulé d'une colonne / propriété affichée : sans le préfixe des tâches si
  // l'option est active (les vues frise et articulation).
  libelleColonne(nom) {
    if (this.settings.masquerPrefixeAffichage === false) return nom;
    const pre = this.settings.prefixeTaches || '';
    if (pre && typeof nom === 'string' && nom.startsWith(pre)) return nom.slice(pre.length);
    return nom;
  }

  // Lit un concept dans un entête, en acceptant l'ancienne clé par défaut le
  // temps que les notes soient migrées.
  _lireT(fm, concept) {
    if (!fm) return undefined;
    const k = this.cleT(concept);
    if (k in fm) return fm[k];
    // Repli sur d'autres formes le temps que les notes soient migrées :
    // concept nu, nom lisible, clé personnalisée — chacun avec/sans préfixe.
    const pre = this.settings.prefixeTaches || '';
    const perso = String((this.settings.clesTaches || {})[concept] || '').trim();
    for (const base of [concept, Ariane.libelleConcept(concept), perso]) {
      if (!base) continue;
      if (base in fm) return fm[base];
      if (pre && (pre + base) in fm) return fm[pre + base];
    }
    return undefined;
  }

  // Intitulé affiché d'une propriété générique dans le formulaire (toujours
  // l'intitulé lisible ; la clé de frontmatter réelle est un détail).
  libelleGen(cle) {
    const d = Ariane.PROPS_GENERIQUES.find((p) => p.cle === cle);
    return d ? tr(d.defaut) : cle;
  }

  // « Une tâche de la famille X porte les champs de X » : on complète les
  // entêtes qui ne les ont pas encore. Une seule passe, silencieuse, et jamais
  // d'écriture si rien ne manque.
  async rattraperProprietesFamilles() {
    const liste = Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [];
    if (!liste.length) return 0;
    let touchees = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.refDeChemin(f.path)) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const fVal = this._lireT(fm, 'famille');
      const id = fVal ? String(fVal).trim() : '';
      if (!id) continue;
      const fam = liste.find((x) => x && x.id === id);
      if (!fam) continue;
      const manquantes = Ariane.proprietesManquantes(fm, fam);
      if (!manquantes.length) continue;
      await this.app.fileManager.processFrontMatter(f, (m) => {
        for (const p of manquantes) if (!(p.cle in m)) m[p.cle] = '';
      });
      touchees += 1;
    }
    return touchees;
  }

  // Écrit un blocage dans l'entête de la tâche bloquée. Le frontmatter est la
  // seule source : plus de registre canvas. Un cycle est refusé avant écriture.
  // Toutes les arêtes de rattachement du coffre : composition (parent -> fille)
  // ET blocage (bloqueur -> bloquée), pour valider un nouveau lien contre le
  // graphe FUSIONNÉ (un cycle peut n'apparaître qu'en mêlant les deux).
  _aretesRattachement() {
    const ar = [];
    for (const t of this.tachesPourGantt()) {
      const p = Ariane.refDeLien(t.parent);
      if (p) ar.push({ de: p, vers: t.ref, type: 'hier' });
      for (const b of t.bloquePar || []) {
        const x = Ariane.refDeLien(b);
        if (x) ar.push({ de: x, vers: t.ref, type: 'bloque' });
      }
    }
    return ar;
  }

  // Le lien `ajout` ({de, vers, type}) fermerait-il un cycle du graphe fusionné ?
  _lienFermeCycle(ajout) {
    const r = Ariane.lienValide(this._aretesRattachement(), new Map(), ajout);
    return !r.ok && (r.raison === 'cycle' || r.raison === 'soi');
  }

  // Rattache une tâche à une mère (ou détache si parentRef vide). Un
  // rattachement qui fermerait un cycle (rattachements + blocages) est refusé
  // d'emblée — aucune vue d'incohérences à consulter ensuite.
  async rattacher(enfantRef, parentRef) {
    if (!enfantRef) return false;
    if (parentRef && parentRef !== enfantRef
      && this._lienFermeCycle({ de: parentRef, vers: enfantRef, type: 'hier' })) {
      new obsidian.Notice(tr('Ce rattachement fermerait un cycle (rattachements + blocages) : refusé.'));
      return false;
    }
    return this.majTache(enfantRef, { parent: parentRef ? '[[' + parentRef + ']]' : '' });
  }

  /* ---- IA : structuration de tâches -------------------------------- */

  // Appel LLM (fournisseur configuré dans les réglages) qui rend du JSON parsé.
  async genererIA(prompt, jetons) {
    this._diagIA = '';
    const brut = await this.genererJsonRefs(prompt, jetons || 1800);
    if (!brut) {
      const f = this.settings.refsFournisseur || 'ollama';
      new obsidian.Notice(tr('IA (') + f + ') : ' + (this._diagIA
        || tr('aucune réponse. Réglages → Tâches → Assistant IA.')), 10000);
      return null;
    }
    const j = Ariane.extraireJson(brut);
    if (!j) {
      new obsidian.Notice(tr('Réponse de l\'IA illisible (JSON attendu) : ')
        + String(brut).replace(/\s+/g, ' ').slice(0, 160), 10000);
    }
    return j;
  }

  famillesIA() {
    return (Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [])
      .filter((f) => f && f.id);
  }

  // Bloc de contexte « familles » commun à toutes les invites tâches.
  _blocFamilles() {
    const l = ['Familles de tâches disponibles (choisir l\'id EXACT) :'];
    for (const f of this.famillesIA()) {
      l.push('- ' + f.id + ' (« ' + (f.nom || f.id) + ' ») : '
        + (String(f.description || '').replace(/\s+/g, ' ').trim() || 'pas de description.'));
    }
    l.push('Famille par défaut si hésitation : ' + (this.settings.familleTacheDefaut || 'action') + '.');
    return l.join('\n');
  }

  promptStructuration(texte) {
    return [
      'Tu structures un brouillon de tâches en un arbre JSON.',
      this._blocFamilles(),
      '',
      'RÈGLES :',
      '- L\'indentation du brouillon = hiérarchie parent/enfant (champ "enfants").',
      '- « Jalon : … », ou une échéance de type présentation / soutenance / rendu → "jalon": true.',
      '- « BONUS », « si le temps », « optionnel » → "priorite": "basse" et le mets aussi en "note".',
      '- Une parenthèse ou une remarque (ex. « pas le temps pour X ») → "note", ne la perds jamais.',
      '- « Lire <ouvrage> » → famille lecture, et mets le titre de l\'ouvrage dans "source".',
      '- N\'INVENTE AUCUNE DATE. "debut"/"echeance" uniquement si une date explicite est écrite dans le brouillon, au format AAAA-MM-JJ, sinon "".',
      '- Reformule les intitulés en style bref, verbe à l\'infinitif, sans redondance.',
      '',
      'Réponds UNIQUEMENT par un tableau JSON. Chaque nœud :',
      '{"titre": "...", "famille": "id", "jalon": false, "priorite": "", "debut": "", "echeance": "", "note": "", "source": "", "enfants": []}',
      '',
      'BROUILLON :',
      String(texte || '').trim(),
    ].join('\n');
  }

  // Insère un texte de note sous « ## Note de travail » d'une tâche.
  async ajouterNoteTache(ref, texte) {
    const t = String(texte || '').trim();
    if (!t) return;
    const f = this.fichierDeRef(ref);
    if (!f) return;
    this.marquerEcriture(f.path);
    const lignes = (await this.app.vault.read(f)).split('\n');
    const i = lignes.findIndex((l) => /^##\s+Note de travail\s*$/.test(l));
    if (i >= 0) lignes.splice(i + 1, 0, '', t);
    else { lignes.push('', t); }
    await this.app.vault.modify(f, lignes.join('\n'));
  }

  // Corps (sans le titre) de la section « ## Note de travail » d'une tâche.
  async lireNoteTache(ref) {
    const f = this.fichierDeRef(ref);
    if (!f) return '';
    const lignes = (await this.app.vault.read(f)).split('\n');
    const i = lignes.findIndex((l) => /^##\s+Note de travail\s*$/.test(l));
    if (i < 0) return '';
    let j = i + 1;
    while (j < lignes.length && !/^##\s+/.test(lignes[j])) j += 1;
    return lignes.slice(i + 1, j).join('\n').trim();
  }

  // Remplace le corps de « ## Note de travail » (crée la section si absente).
  async ecrireNoteTache(ref, texte) {
    const f = this.fichierDeRef(ref);
    if (!f) return false;
    const corps = String(texte == null ? '' : texte).replace(/\s+$/, '');
    const lignes = (await this.app.vault.read(f)).split('\n');
    const i = lignes.findIndex((l) => /^##\s+Note de travail\s*$/.test(l));
    let sortie;
    if (i < 0) {
      let k = 0;
      if (lignes[0] === '---') { const fin = lignes.indexOf('---', 1); k = fin >= 0 ? fin + 1 : 0; }
      while (k < lignes.length && (lignes[k].trim() === '' || /^# /.test(lignes[k]))) k += 1;
      sortie = lignes.slice(0, k).concat(['## Note de travail', '', corps, ''], lignes.slice(k));
    } else {
      let j = i + 1;
      while (j < lignes.length && !/^##\s+/.test(lignes[j])) j += 1;
      sortie = lignes.slice(0, i + 1).concat(['', corps, ''], lignes.slice(j));
    }
    const texteSortie = sortie.join('\n');
    const avant = await this.app.vault.read(f);
    if (texteSortie === avant) return false;
    this.marquerEcriture(f.path);
    await this.app.vault.modify(f, texteSortie);
    return true;
  }

  // Crée un arbre de specs (déjà normalisées). Renvoie la liste des réfs créées.
  // opts.vue = { fichier, nom } d'une vue articulation où poser les cartes.
  async creerArbreTaches(specs, opts) {
    const o = opts || {};
    const crees = [];
    const poser = async (spec, parentRef) => {
      const chemin = await this.creerTache({
        intitule: spec.titre,
        famille: spec.famille,
        jalon: spec.jalon,
        priorite: spec.priorite,
        debut: spec.debut,
        echeance: spec.echeance,
        source: spec.famille === 'lecture' ? spec.source : undefined,
      });
      const ref = this.refDeChemin(chemin);
      if (!ref) return;
      crees.push(ref);
      if (spec.note) { try { await this.ajouterNoteTache(ref, spec.note); } catch (e) { /* rien */ } }
      if (parentRef) { try { await this.rattacher(ref, parentRef); } catch (e) { /* rien */ } }
      for (const e of spec.enfants || []) await poser(e, ref);
    };
    for (const s of specs || []) await poser(s, o.parentRef || null);
    if (o.vue && o.vue.fichier && crees.length) {
      try {
        const fv = this.app.vault.getAbstractFileByPath(o.vue.fichier);
        if (fv) {
          const txt = await this.app.vault.read(fv);
          const out = Ariane.majPlanArticulationTexte(txt, o.vue.nom || null, crees);
          if (out && out !== txt) await this.app.vault.modify(fv, out);
        }
      } catch (e) { console.debug('[Ariane] pose sur vue', e); }
    }
    return crees;
  }

  // Vues « ariane-articulation » trouvées dans les .base du coffre.
  async vuesArticulation() {
    const out = [];
    for (const f of this.app.vault.getFiles().filter((x) => x && x.extension === 'base')) {
      let base;
      try { base = obsidian.parseYaml(await this.app.vault.read(f)) || {}; } catch (e) { continue; }
      for (const v of (Array.isArray(base.views) ? base.views : [])) {
        if (v && v.type === 'ariane-articulation') {
          out.push({ fichier: f.path, nom: v.name || f.basename });
        }
      }
    }
    return out;
  }

  // Ouvre la modale de découpage pour une tâche donnée.
  ouvrirDecoupage(ref) {
    const t = this.tachesPourGantt().find((x) => x.ref === ref);
    if (!t) { new obsidian.Notice(tr('Tâche introuvable.')); return; }
    const enfants = this.tachesPourGantt()
      .filter((x) => Ariane.refDeLien(x.parent) === ref)
      .map((x) => x.intitule);
    new ModaleStructurerTaches(this, {
      decouper: { ref, titre: t.intitule, famille: t.famille || (this.settings.familleTacheDefaut || 'action'), enfants },
    }).open();
  }

  promptDecoupage(tache, contexte) {
    return [
      'Propose des sous-tâches concrètes pour découper la tâche ci-dessous, en JSON.',
      this._blocFamilles(),
      'Tâche à découper : « ' + tache.titre + ' » (famille ' + tache.famille + ').',
      (tache.enfants && tache.enfants.length)
        ? 'Sous-tâches déjà présentes (ne pas répéter) : ' + tache.enfants.join(' ; ') + '.' : '',
      contexte ? ('Consignes : ' + contexte) : '',
      'RÈGLES : 3 à 8 sous-tâches, intitulés brefs à l\'infinitif, pas de dates, "jalon" seulement pour une étape de validation. Imbrication possible via "enfants".',
      'Réponds UNIQUEMENT par un tableau JSON de nœuds {"titre","famille","jalon":false,"priorite":"","note":"","source":"","enfants":[]}.',
    ].filter(Boolean).join('\n');
  }

  // Passe en lots : réécrit les intitulés en style cohérent. Rend
  // [{ ref, avant, apres }] pour les seuls qui changent.
  async normaliserIntitules(refs) {
    const g = this.tachesPourGantt();
    const parRef = new Map(g.map((t) => [t.ref, t]));
    const cibles = ((refs && refs.length) ? refs : g.map((t) => t.ref))
      .map((r) => parRef.get(r)).filter(Boolean);
    const out = [];
    const LOT = 35;
    for (let i = 0; i < cibles.length; i += LOT) {
      const bout = cibles.slice(i, i + LOT);
      const avis = new obsidian.Notice(tr('Normalisation… ') + (i + bout.length) + '/' + cibles.length, 0);
      const prompt = [
        'Réécris ces intitulés de tâches en style cohérent : verbe à l\'infinitif en tête, bref, sans redondance ni article superflu. Garde le sens et les noms propres, ne traduis pas.',
        'Réponds par un tableau JSON [{"ref":"...","titre":"..."}] ; n\'inclus QUE les intitulés qui changent.',
        '',
        bout.map((t) => t.ref + ' :: ' + t.intitule).join('\n'),
      ].join('\n');
      let j;
      try { j = await this.genererIA(prompt, 1400); } finally { avis.hide(); }
      const arr = Array.isArray(j) ? j : (j && Array.isArray(j.taches) ? j.taches : []);
      for (const e of arr) {
        const ref = String((e && (e.ref || e.id)) || '').trim();
        const titre = String((e && (e.titre || e.title)) || '').trim();
        const t = parRef.get(ref);
        if (t && titre && titre !== t.intitule) out.push({ ref, avant: t.intitule, apres: titre });
      }
    }
    return out;
  }

  // Passe en lots : famille la mieux adaptée d'après l'intitulé + descriptions.
  // Rend [{ ref, avant, apres, titre }] pour les seuls écarts.
  async verifierFamilles(refs) {
    const g = this.tachesPourGantt();
    const parRef = new Map(g.map((t) => [t.ref, t]));
    const ids = new Set(this.famillesIA().map((f) => f.id));
    const cibles = ((refs && refs.length) ? refs : g.map((t) => t.ref))
      .map((r) => parRef.get(r)).filter(Boolean);
    const out = [];
    const LOT = 35;
    for (let i = 0; i < cibles.length; i += LOT) {
      const bout = cibles.slice(i, i + LOT);
      const avis = new obsidian.Notice(tr('Vérification… ') + (i + bout.length) + '/' + cibles.length, 0);
      const prompt = [
        'Pour chaque tâche, indique la famille la plus adaptée d\'après son intitulé et les descriptions ci-dessous.',
        this._blocFamilles(),
        'Réponds par un tableau JSON [{"ref":"...","famille":"id"}], UNIQUEMENT les tâches où ta famille diffère de celle entre crochets.',
        '',
        bout.map((t) => t.ref + ' :: [' + t.famille + '] ' + t.intitule).join('\n'),
      ].join('\n');
      let j;
      try { j = await this.genererIA(prompt, 1200); } finally { avis.hide(); }
      const arr = Array.isArray(j) ? j : [];
      for (const e of arr) {
        const ref = String((e && (e.ref || e.id)) || '').trim();
        const fam = String((e && (e.famille || e.family)) || '').trim().toLowerCase();
        const t = parRef.get(ref);
        if (t && ids.has(fam) && fam !== t.famille) {
          out.push({ ref, avant: t.famille, apres: fam, titre: t.intitule });
        }
      }
    }
    return out;
  }

  // Une phrase -> une tâche créée (famille + dates si écrites + blocage déduit).
  async ajouterTacheLN(phrase) {
    const p = String(phrase || '').trim();
    if (!p) return null;
    const prompt = [
      'Extrais UNE tâche de cette phrase, en JSON : {"titre","famille","debut","echeance","bloque_par"}.',
      this._blocFamilles(),
      '- debut / echeance : AAAA-MM-JJ, uniquement si une date ou une échéance explicite est donnée, sinon "".',
      '- bloque_par : le titre approximatif d\'une tâche existante à finir avant celle-ci, sinon "".',
      '- titre : bref, verbe à l\'infinitif.',
      'Phrase : ' + p,
    ].join('\n');
    const j = await this.genererIA(prompt, 500);
    if (!j) return null;
    const specs = Ariane.normaliserSpecsTaches([j], {
      familles: new Set(this.famillesIA().map((f) => f.id)),
      defaut: this.settings.familleTacheDefaut || 'action',
      dates: Ariane.datesDansTexte(p),
    });
    if (!specs.length) return null;
    const s = specs[0];
    const chemin = await this.creerTache({
      intitule: s.titre, famille: s.famille, debut: s.debut, echeance: s.echeance,
      source: s.famille === 'lecture' ? s.source : undefined,
    });
    const ref = this.refDeChemin(chemin);
    const bp = String((j.bloque_par || j.bloquePar || '')).trim();
    if (ref && bp) {
      const cand = this.tachesPourGantt().filter((t) => t.ref !== ref)
        .map((t) => ({ ref: t.ref, titre: t.intitule }));
      const m = (await this.meilleurTitreSem(bp, cand)) || Ariane.meilleurTitre(bp, cand);
      if (m) await this.creerBlocage(m.ref, ref);
    }
    return ref;
  }

  // Résout les sources en clair des tâches « lecture » vers un [[@citekey]] du
  // coffre. Rend [{ ref, avant, apres, titre }] à passer à ModaleRevueLot.
  async resoudreSourcesLecture(refs) {
    const g = this.tachesPourGantt();
    const parRef = new Map(g.map((t) => [t.ref, t]));
    const cibles = ((refs && refs.length) ? refs : g.map((t) => t.ref))
      .map((r) => parRef.get(r))
      .filter((t) => t && t.famille === 'lecture');
    // Candidats : notes du coffre dont le nom commence par « @ ».
    const cand = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.basename.startsWith('@')) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const al = [].concat(fm.aliases || []).map(String).filter(Boolean);
      cand.push({ ref: f.basename, titre: (al[0] || f.basename) + ' ' + f.basename });
    }
    if (!cand.length) return [];
    const out = [];
    for (const t of cibles) {
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      const src = String(this._lireT(fm, 'source') || '').trim();
      if (!src || /\[\[.*\]\]/.test(src)) continue;
      const m = (await this.meilleurTitreSem(src, cand, 0.5)) || Ariane.meilleurTitre(src, cand, 0.3);
      if (m) out.push({ ref: t.ref, avant: src, apres: '[[' + m.ref + ']]', titre: t.intitule });
    }
    return out;
  }

  // Correspondance SÉMANTIQUE d'un titre parmi des candidats {ref, titre}, via
  // le moteur d'embeddings déjà en place. Encodage à la demande (pas d'index
  // persistant pour l'instant). Rend { ref, score } ou null.
  async meilleurTitreSem(cible, candidats, seuil) {
    if (!candidats || !candidats.length) return null;
    if ((this.settings.suggMoteur || 'hybride') === 'lexical') return null;
    let vs;
    try { vs = await this.encoderTextes([cible].concat(candidats.map((c) => c.titre))); }
    catch (e) { return null; }
    if (!vs || vs.length !== candidats.length + 1) return null;
    let best = null;
    for (let i = 0; i < candidats.length; i += 1) {
      const s = cosinusVecteurs(vs[0], vs[i + 1]);
      if (!best || s > best.score) best = { ref: candidats[i].ref, score: s };
    }
    return (best && best.score >= (seuil == null ? 0.55 : seuil)) ? best : null;
  }

  // Dernier état SAIN de « parent » / « bloque-par » par tâche, pour pouvoir y
  // revenir si une modif manuelle ferme un cycle.
  _rattachDe(ref) {
    const f = this.fichierDeRef(ref);
    const fm = f ? ((this.app.metadataCache.getFileCache(f) || {}).frontmatter || {}) : {};
    return {
      parent: this._lireT(fm, 'parent') || '',
      bloque: [].concat(this._lireT(fm, 'bloque-par') || []),
    };
  }

  semerRattachOk() {
    this._rattachOk = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const ref = this.refDeChemin(f.path);
      if (ref) this._rattachOk.set(ref, this._rattachDe(ref));
    }
  }

  // Rattrape « Sans échéance » sur les tâches qui ne l'ont pas encore (coffres
  // d'avant l'introduction de la propriété) ou dont la valeur a divergé. Après
  // un premier passage, tout est en phase et la boucle n'écrit plus rien.
  async semerSansEcheance() {
    const kSE = this.cleT('sans-echeance');
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.refDeChemin(f.path)) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const v = Ariane.sansEcheanceAEcrire(this._lireT(fm, 'echeance'), this._lireT(fm, 'sans-echeance'));
      if (v === null) continue;
      this.marquerEcriture(f.path);
      try {
        await this.app.fileManager.processFrontMatter(f, (x) => {
          x[kSE] = v;
          x.modifie = new Date().toISOString().slice(0, 10);
        });
      } catch (e) { /* note verrouillée : au prochain passage */ }
    }
  }

  // Complète les propriétés du « noyau » (Ariane.defautsNoyau) sur les notes de
  // tâches qui n'en portent pas encore la clé. Une seule passe, silencieuse,
  // idempotente : jamais d'écriture si rien ne manque, jamais d'écrasement d'une
  // valeur existante, pas de bump de « modifie » (c'est un rattrapage de schéma,
  // pas une modification de sens). Lancée au démarrage — donc toute propriété
  // ajoutée au plugin est rattrapée — et via la commande dédiée. Renvoie le
  // nombre de notes complétées.
  async semerConceptsTache() {
    const defauts = Ariane.defautsNoyau();
    let touchees = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.refDeChemin(f.path)) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const manque = Ariane.conceptsAAmorcer(defauts,
        (c) => this._lireT(fm, c), (c) => this.cleT(c));
      const cles = Object.keys(manque);
      if (!cles.length) continue;
      this.marquerEcriture(f.path);
      try {
        await this.app.fileManager.processFrontMatter(f, (x) => {
          for (const k of cles) if (!(k in x)) x[k] = manque[k];
        });
        touchees += 1;
      } catch (e) { /* note verrouillée : au prochain passage */ }
    }
    return touchees;
  }

  async veillerRattachements(fichier, ref) {
    const actuel = this._rattachDe(ref);
    // Écriture du greffon (déjà validée) : on mémorise et on sort.
    if (this.ecritePlugin(fichier.path)) { this._rattachOk.set(ref, actuel); return; }
    const cycles = Ariane.cyclesDe(this._aretesRattachement());
    const enCycle = cycles.some((c) => c.includes(ref));
    const bon = this._rattachOk.get(ref);
    if (enCycle && bon
      && JSON.stringify([bon.parent, bon.bloque]) !== JSON.stringify([actuel.parent, actuel.bloque])) {
      this.marquerEcriture(fichier.path);
      const kP = this.cleT('parent');
      const kB = this.cleT('bloque-par');
      await this.app.fileManager.processFrontMatter(fichier, (x) => {
        x[kP] = bon.parent;
        x[kB] = bon.bloque;
        x.modifie = new Date().toISOString().slice(0, 10);
      });
      new obsidian.Notice(tr('Modification annulée : ce lien fermait un cycle (rattachements + blocages).'));
      return;
    }
    if (!enCycle) this._rattachOk.set(ref, actuel);
  }

  async creerBlocage(deRef, versRef) {
    if (!deRef || !versRef || deRef === versRef) return false;
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === versRef);
    if (!f) return false;
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const kBP = this.cleT('bloque-par');
    const deja = [].concat(this._lireT(fm, 'bloque-par') || []).map(String);
    if (deja.some((v) => Ariane.refDeLien(v) === deRef)) return false;
    if (this._lienFermeCycle({ de: deRef, vers: versRef, type: 'bloque' })) {
      new obsidian.Notice(tr('Ce lien fermerait un cycle (rattachements + blocages) : refusé.'));
      return false;
    }
    const derive = Ariane.blocageDerive(this._aretesRattachement(), deRef, versRef);
    if (derive) {
      new obsidian.Notice(tr('Blocage dérivé : cette tâche est déjà bloquée par ')
        + derive + tr(' — les filles d’une mère bloquante bloquent avec elle.'));
      return false;
    }
    await this.app.fileManager.processFrontMatter(f, (x) => {
      x[kBP] = deja.concat(['[[' + deRef + ']]']);
      x.modifie = new Date().toISOString().slice(0, 10);
    });
    return true;
  }

  async retirerBlocage(deRef, versRef) {
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === versRef);
    if (!f) return false;
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const kBP = this.cleT('bloque-par');
    const reste = [].concat(this._lireT(fm, 'bloque-par') || []).map(String)
      .filter((v) => Ariane.refDeLien(v) !== deRef);
    await this.app.fileManager.processFrontMatter(f, (x) => {
      x[kBP] = reste;
      x.modifie = new Date().toISOString().slice(0, 10);
    });
    return true;
  }

  // Les incohérences des tâches, lues dans le frontmatter (plus dans les
  // canvas) : cycles de blocage ou de composition, échéances qui se
  // contredisent, liens vers une note absente.
  recalculerIncoherences() {
    const taches = this.tachesPourGantt();
    const refs = new Set(taches.map((t) => t.ref));
    const bloquants = [];
    const compositions = [];
    const dates = {};
    const morts = new Set();
    for (const t of taches) {
      dates[t.ref] = { debut: t.debut || '', echeance: t.echeance || '' };
      const p = Ariane.refDeLien(t.parent || '');
      if (p) {
        if (refs.has(p)) compositions.push({ de: p, vers: t.ref });
        else morts.add(p);
      }
      for (const b of t.bloquePar || []) {
        const x = Ariane.refDeLien(b);
        if (!x) continue;
        if (refs.has(x)) bloquants.push({ de: x, vers: t.ref });
        else morts.add(x);
      }
    }
    const cycles = Ariane.cyclesDe(bloquants).concat(Ariane.cyclesDe(compositions));
    this._incoherencesTaches = {
      cycles,
      dates: Ariane.datesIncoherentes(bloquants, dates),
      conflits: [],
      morts: [...morts],
    };
    return this._incoherencesTaches;
  }

  // Écrit quelques propriétés d'une tâche, sans toucher au reste.
  async majTache(ref, champs) {
    const f = this.fichierDeRef(ref);
    if (!f) return false;
    const conc = new Set(Ariane.CONCEPTS_TACHE);
    await this.app.fileManager.processFrontMatter(f, (x) => {
      for (const [k, v] of Object.entries(champs)) {
        x[conc.has(k) ? this.cleT(k) : k] = v;
      }
      x.modifie = new Date().toISOString().slice(0, 10);
    });
    return true;
  }

  // Valeur ACTUELLE d'un concept de tâche, lue dans le frontmatter (chaîne,
  // '' si absente). Sert aux thématiques des zones d'articulation, qui doivent
  // connaître la valeur d'avant un geste pour l'annulation.
  lireConceptTache(ref, concept) {
    const f = this.fichierDeRef(ref);
    if (!f) return '';
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const v = this._lireT(fm, concept);
    return v == null ? '' : String(v);
  }

  // Le titre d'une tâche EST son premier alias (c'est ce qu'affichent la frise
  // et l'articulation). On aligne aussi le titre H1 du corps s'il existe, pour
  // que la note ne se contredise pas.
  async renommerTitreTache(ref, titre) {
    const t = String(titre == null ? '' : titre).trim();
    if (!t) return false;
    const f = this.fichierDeRef(ref);
    if (!f) return false;
    this.marquerEcriture(f.path);
    await this.app.fileManager.processFrontMatter(f, (x) => {
      x.aliases = [t];
      x.modifie = new Date().toISOString().slice(0, 10);
    });
    const avant = await this.app.vault.read(f);
    const lignes = avant.split('\n');
    for (let i = 0; i < lignes.length; i += 1) {
      if (/^# /.test(lignes[i])) { lignes[i] = '# ' + t; break; }
    }
    const apres = lignes.join('\n');
    if (apres !== avant) {
      this.marquerEcriture(f.path);
      await this.app.vault.modify(f, apres);
    }
    return true;
  }

  // Coche / décoche « terminée » : statut et case écrits ensemble.
  async basculerTermine(ref, coche) {
    return this.majTache(ref, coche
      ? { statut: 'terminée', terminee: true }
      : { statut: 'à faire', terminee: false });
  }

  // Met la note d'une tâche à la corbeille et nettoie les renvois des autres
  // tâches vers elle (parent, bloque-par) pour ne pas laisser de liens morts.
  async supprimerTache(ref) {
    const f = this.fichierDeRef(ref);
    if (!f) return false;
    for (const t of this.tachesPourGantt()) {
      if (t.ref === ref) continue;
      const champs = {};
      if (Ariane.refDeLien(t.parent || '') === ref) champs.parent = '';
      const bp = (t.bloquePar || []).filter((b) => Ariane.refDeLien(b) !== ref);
      if (bp.length !== (t.bloquePar || []).length) champs['bloque-par'] = bp;
      if (Object.keys(champs).length) await this.majTache(t.ref, champs);
    }
    this.marquerEcriture(f.path);
    await this.app.fileManager.trashFile(f);
    return true;
  }

  // Écrit en une passe les dates rendues par decalerSousArbre ou cascadeAval.
  async ecrireDatesTaches(changements) {
    const parRef = new Map(this.tachesPourGantt().map((t) => [t.ref, t.fichier]));
    let n = 0;
    for (const c of changements || []) {
      const f = parRef.get(c.ref);
      if (!f) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const kD = this.cleT('debut');
      const kE = this.cleT('echeance');
      if (String(this._lireT(fm, 'debut') || '') === c.debut
        && String(this._lireT(fm, 'echeance') || '') === c.echeance) continue;
      await this.app.fileManager.processFrontMatter(f, (x) => {
        x[kD] = c.debut ? c.debut : null;
        x[kE] = c.echeance ? c.echeance : null;
        x.modifie = new Date().toISOString().slice(0, 10);
      });
      n += 1;
    }
    return n;
  }

  // La référence d'une tâche, déduite du chemin : toute note du dossier des
  // tâches, plus les anciennes références « T26-xxx » où qu'elles soient.
  refDeChemin(chemin) {
    return Ariane.refDepuisChemin(chemin, this.dossierT);
  }

  // Les fiches Zotero du coffre, prêtes pour une recherche approchée. On les
  // reconnaît à leur clé de citation plutôt qu'à leur dossier, qui varie.
  sourcesZoteroPourChoix() {
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      // Une fiche de source se reconnaît largement : nom en « @… », ou l'une
      // des clés d'identification Zotero, quel que soit le format.
      const estSource = f.basename.charAt(0) === '@'
        || fm.citationKey != null || fm['citation-key'] != null
        || fm.citekey != null || fm['zotero-key'] != null
        || fm.type === 'source' || fm.type === 'reference';
      if (!estSource) continue;
      const alias = [].concat(fm.aliases || []).map(String).filter(Boolean);
      out.push({
        nom: Ariane.libelleSource(fm, f.basename) + (alias.length ? '  ⟨' + alias.join(' · ') + '⟩' : ''),
        cle: f.basename,
      });
    }
    out.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return out;
  }

  // Interroge Spotlight pour les deux dates d'un fichier externe. mdls est
  // fourni par macOS et ne demande aucune installation. Avec -raw les valeurs
  // sont séparées par un octet nul ; un fichier absent ou non indexé ne rend
  // rien qui ressemble à une date, et le filtre le laisse tomber.
  async metadonneesFichier(chemin) {
    const abs = chemin.startsWith('~/')
      ? require('os').homedir() + chemin.slice(1)
      : chemin.replace(/^file:\/\//, '');
    return new Promise((resolve) => {
      require('child_process').execFile('mdls', [
        '-raw', '-name', 'kMDItemContentModificationDate',
        '-name', 'kMDItemLastUsedDate', abs,
      ], (err, sortie) => {
        if (err || !sortie) return resolve(null);
        const dates = String(sortie).split('\0')
          .map((x) => x.trim())
          .map((x) => (/^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : ''));
        if (!dates[0] && !dates[1]) return resolve(null);
        resolve({ modifie: dates[0] || '', ouvert: dates[1] || '' });
      });
    });
  }

  // Rassemble ce que le bloc a besoin de savoir et que seule l'application
  // connaît : les deux URI d'une lecture, les deux dates d'un fichier externe.
  // Le calcul des URI réemploie cleAttachement, déjà écrite pour le volet des
  // références : la clé de la pièce jointe ne se déduit pas de la clé de
  // citation, elle se lit dans la fiche.
  async accesTache(fm) {
    const c = Ariane.champTache(fm);
    if (c.retenu === 'fichier') return this.metadonneesFichier(String(fm.fichier).trim());
    if (c.retenu !== 'source') return null;
    const base = String(fm.source).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === base);
    if (!f) return null;
    const fms = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const out = {};
    const cle = await this.cleAttachement(f);
    if (cle) {
      out.uriPdf = 'obsidian://zotflow?type=open-attachment&libraryID='
        + encodeURIComponent(fms['library-id'] || '') + '&key=' + encodeURIComponent(cle);
    }
    if (fms['zotero-key']) {
      out.uriZotero = 'zotero://select/library/items/' + String(fms['zotero-key']).trim();
    }
    return (out.uriPdf || out.uriZotero) ? out : null;
  }

  // Réécrit le bloc marqué de la note. Il se pose sous le titre s'il n'existe
  // pas encore, et disparaît si la tâche cesse de désigner quoi que ce soit.
  async majBlocTache(file) {
    if (!this.refDeChemin(file.path)) return false;
    const cache = this.app.metadataCache.getFileCache(file);
    const fmBrut = (cache && cache.frontmatter) || {};
    const fm = Object.assign({}, fmBrut, {
      source: this._lireT(fmBrut, 'source'),
      livrable: this._lireT(fmBrut, 'livrable'),
      fichier: this._lireT(fmBrut, 'fichier'),
    });
    const meta = await this.accesTache(fm);
    const interieur = Ariane.blocTache(fm, meta);
    const bloc = interieur ? ZFA_TACHE_DEBUT + '\n' + interieur + '\n' + ZFA_TACHE_FIN : '';
    const avant = await this.app.vault.read(file);
    let texte = avant;
    const debut = texte.indexOf(ZFA_TACHE_DEBUT);
    const fin = texte.indexOf(ZFA_TACHE_FIN);
    if (debut !== -1 && fin > debut) {
      texte = texte.slice(0, debut) + bloc + texte.slice(fin + ZFA_TACHE_FIN.length);
    } else if (bloc) {
      texte = texte.replace(/^(# .*\n)/m, '$1\n' + bloc + '\n');
    }
    // Ne rien écrire quand rien ne change : c'est ce qui empêche l'écoute qui
    // appelle cette méthode de se rappeler elle-même sans fin.
    if (texte === avant) return false;
    await this.app.vault.modify(file, texte);
    return true;
  }

  // Édite la liste des créneaux d'une tâche. { avant } = chaîne de l'entrée
  // ciblée (vide = ajout). { debut, fin } nuls = suppression de `avant`.
  async majCreneau(ref, { avant, debut, fin }) {
    const f = this.fichierDeRef(ref);
    if (!f) return false;
    const cle = this.cleT('creneaux');
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    let liste = [].concat(this._lireT(fm, 'creneaux') || []).map(String).filter(Boolean);
    const nouv = (debut && fin) ? Ariane.formatCreneau(debut, fin) : '';
    if (avant) {
      liste = liste.filter((x) => x.trim() !== String(avant).trim());
      if (nouv) liste.push(nouv);
    } else if (nouv) {
      liste.push(nouv);
    }
    // Dédoublonnage + tri par début.
    liste = Ariane.creneauxDeTache(liste).map((c) => c.brut);
    this.marquerEcriture(f.path);
    await this.app.fileManager.processFrontMatter(f, (x) => {
      if (liste.length) x[cle] = liste; else delete x[cle];
      x.modifie = new Date().toISOString().slice(0, 10);
    });
    // Le commentaire d'une session déplacée la suit ; celui d'une session
    // supprimée disparaît (majBlocCreneaux recueille et re-place).
    await this.majBlocCreneaux(f, { de: avant, vers: nouv });
    // marquerEcriture ci-dessus fait taire l'écoute metadataCache.changed → il
    // faut relancer le push explicitement pour que les gestes de la vue
    // calendrier (glisser / redimensionner / créer un créneau) se synchronisent.
    if (this._relancerPushAgenda) this._relancerPushAgenda(1500);
    return true;
  }

  // Réécrit la section « ## Sessions » balisée de la note (idempotent, sur le
  // modèle de majBlocTache). Se pose sous le bloc d'accès s'il existe, sinon
  // sous le # Titre ; disparaît quand la tâche n'a plus de créneau.
  // opts : { de, vers } fait suivre le commentaire d'une session déplacée
  // (vers vide = session supprimée) ; { coms } remplace la carte complète.
  async majBlocCreneaux(file, opts) {
    if (!this.refDeChemin(file.path)) return false;
    const fm = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || {};
    const liste = [].concat(this._lireT(fm, 'creneaux') || []).map(String).filter(Boolean);
    const stats = Ariane.statsCreneaux(liste, new Date().toISOString());
    // Commentaires relus de l'ancien bloc AVANT réécriture, puis ajustés.
    const avant = await this.app.vault.read(file);
    const coms = Ariane.commentairesDuBloc(avant);
    const o = opts || {};
    if (o.coms) {
      for (const k of Object.keys(coms)) delete coms[k];
      Object.assign(coms, o.coms);
    }
    if (o.de) {
      const deCle = Ariane.cleCommentaire(o.de);
      const versCle = o.vers ? Ariane.cleCommentaire(o.vers) : '';
      if (deCle && deCle !== versCle && coms[deCle] !== undefined) {
        const txt = coms[deCle];
        delete coms[deCle];
        if (versCle) coms[versCle] = txt;
      }
    }
    const interieur = Ariane.blocCreneaux(liste, stats, coms);
    const bloc = interieur ? ZFA_CRENEAUX_DEBUT + '\n' + interieur + '\n' + ZFA_CRENEAUX_FIN : '';
    let texte = avant;
    const d = texte.indexOf(ZFA_CRENEAUX_DEBUT);
    const f = texte.indexOf(ZFA_CRENEAUX_FIN);
    if (d !== -1 && f > d) {
      texte = texte.slice(0, d) + bloc + texte.slice(f + ZFA_CRENEAUX_FIN.length);
      // Bloc vidé : retirer aussi la ligne blanche résiduelle.
      if (!bloc) texte = texte.replace(/\n{3,}/g, '\n\n');
    } else if (bloc) {
      // Après le bloc d'accès s'il existe, sinon après le # Titre.
      if (texte.indexOf(ZFA_TACHE_FIN) !== -1) {
        texte = texte.replace(ZFA_TACHE_FIN, ZFA_TACHE_FIN + '\n\n' + bloc);
      } else {
        texte = texte.replace(/^(# .*\n)/m, '$1\n' + bloc + '\n');
      }
    }
    if (texte === avant) return false;
    this.marquerEcriture(file.path);
    await this.app.vault.modify(file, texte);
    return true;
  }

  // Écrit le commentaire d'une session (cleCommentaire), ou l'efface quand le
  // texte est vide. Ne touche qu'au bloc balisé, pas au frontmatter.
  async majCommentaireCreneau(ref, brut, texte) {
    const f = this.fichierDeRef(ref);
    if (!f) return false;
    const cle = Ariane.cleCommentaire(brut);
    if (!cle) return false;
    const avant = await this.app.vault.read(f);
    const coms = Ariane.commentairesDuBloc(avant);
    const t = String(texte || '').trim();
    if (t) coms[cle] = t; else delete coms[cle];
    return this.majBlocCreneaux(f, { coms });
  }

  // --- Affichage des tâches : habillage des notes de tâche ouvertes (visuel),
  // et harmonisation ponctuelle des noms de colonnes dans les .base. ---
  installerAffichageTaches() {
    let minuteur = null;
    const planifier = () => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => {
        try { this.habillerNotesTache(); } catch (e) { /* sans gravité */ }
      }, 150);
    };
    for (const ev of ['layout-change', 'active-leaf-change', 'file-open']) {
      this.registerEvent(this.app.workspace.on(ev, planifier));
    }
    this.registerEvent(this.app.metadataCache.on('resolved', planifier));
    const cont = this.app.workspace.containerEl;
    if (cont && typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver(planifier);
      obs.observe(cont, { childList: true, subtree: true });
      this.register(() => obs.disconnect());
    }
    this.app.workspace.onLayoutReady(planifier);
    this.app.workspace.onLayoutReady(() => {
      this.harmoniserNomsColonnesBases().catch(() => { /* sans gravité */ });
    });
  }

  // Pose, dans chaque fichier .base du coffre, un `displayName` sans préfixe
  // pour les colonnes de propriété de tâche préfixées. Écrit le fichier une
  // seule fois (idempotent), n'écrase jamais un displayName choisi à la main,
  // et ne touche qu'au bloc `properties:` (le reste du .base reste octet pour
  // octet — indispensable pour arianeArtPlan et consorts).
  async harmoniserNomsColonnesBases() {
    const pre = this.settings.prefixeTaches || '';
    if (!pre) return;
    const fichiers = this.app.vault.getFiles().filter((f) => f && f.extension === 'base');
    for (const f of fichiers) {
      let texte;
      try { texte = await this.app.vault.read(f); } catch (e) { continue; }
      let base;
      try { base = obsidian.parseYaml(texte) || {}; } catch (e) { continue; }
      const plan = Ariane.planHarmonisationBase(base, pre);
      if (!plan.ajouts.length) continue;
      const sortie = Ariane.insererProprietesBase(texte, plan.ajouts);
      if (!sortie || sortie === texte) continue;
      try { await this.app.vault.modify(f, sortie); } catch (e) { /* sans gravité */ }
    }
  }

  // Ajoute la classe zfa-note-tache au conteneur d'une note de tâche ouverte,
  // pour l'habillage CSS optionnel des propriétés + contenu. Vaut aussi pour
  // les fenêtres de survol (« page preview »), qui ne sont pas des vues.
  habillerNotesTache() {
    const masquer = this.settings.masquerPrefixeAffichage !== false;
    const skin = this.settings.styleNoteTache === true;
    // Toutes les formes possibles d'une clé de propriété -> concept (minuscule,
    // Obsidian normalise data-property-key en minuscule).
    const pre = this.settings.prefixeTaches || '';
    const parCle = new Map();
    for (const con of Ariane.CONCEPTS_TACHE) {
      const lab = Ariane.libelleConcept(con);
      for (const v of [this.cleT(con), con, lab, pre + con, pre + lab]) {
        if (v) parCle.set(String(v).toLowerCase(), con);
      }
    }
    const clesFamille = new Set();
    for (const f of (this.settings.famillesTaches || [])) {
      for (const p of (f && f.proprietes) || []) {
        if (p && p.cle) clesFamille.add(String(p.cle).toLowerCase());
      }
    }
    const ctx = { masquer, skin, parCle, clesFamille };

    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const vue = leaf && leaf.view;
      if (!vue || !vue.contentEl) continue;
      const estTache = !!(vue.file && this.refDeChemin(vue.file.path));
      this._habillerConteneur(vue.contentEl, estTache, ctx);
    }
    // Fenêtres de survol : pas de fichier accessible, on reconnaît la tâche à
    // son entête (type: tache, ou au moins deux propriétés de tâche).
    for (const pop of document.querySelectorAll('.hover-popover, .popover')) {
      const cont = pop.querySelector(
        '.markdown-reading-view, .markdown-preview-view, .markdown-source-view') || pop;
      this._habillerConteneur(cont, this._conteneurEstTache(cont, parCle), ctx);
    }
  }

  // Le conteneur ressemble-t-il à une note de tâche ? (utilisé quand on n'a
  // pas le chemin du fichier, p. ex. une fenêtre de survol.)
  _conteneurEstTache(el, parCle) {
    const rows = el.querySelectorAll('.metadata-property');
    if (!rows.length) return false;
    let n = 0;
    for (const row of rows) {
      const k = String(row.dataset.propertyKey || '').toLowerCase();
      if (k === 'type') {
        const v = row.querySelector('.metadata-property-value');
        const t = v ? String(v.textContent || '').trim().toLowerCase() : '';
        if (t === 'tache' || t === 'tâche') return true;
      }
      if (parCle.has(k)) { n += 1; if (n >= 2) return true; }
    }
    return false;
  }

  // Applique (ou retire) l'habillage tâche sur un conteneur : classes, tags de
  // concept sur les lignes de propriété, icônes, regroupement en zones.
  _habillerConteneur(contEl, estTache, ctx) {
    contEl.toggleClass('zfa-note-tache', estTache);
    contEl.toggleClass('zfa-note-tache-skin', estTache && ctx.skin);
    if (!estTache) return;
    for (const row of contEl.querySelectorAll('.metadata-property')) {
      let cle = String(row.dataset.propertyKey || '').toLowerCase();
      if (!ctx.parCle.has(cle)) {
        const kel = row.querySelector('.metadata-property-key-input, .metadata-property-key');
        const txt = kel ? String(kel.value || kel.textContent || '').trim().toLowerCase() : '';
        if (txt && ctx.parCle.has(txt)) cle = txt;
      }
      const con = ctx.parCle.get(cle);
      if (!con) { if (row.dataset.zfaConcept) delete row.dataset.zfaConcept; continue; }
      row.dataset.zfaConcept = con;
      const cleEl = row.querySelector('.metadata-property-key');
      if (cleEl) {
        if (ctx.masquer) cleEl.dataset.zfaLabel = this.libelleColonne(this.cleT(con));
        else if (cleEl.dataset.zfaLabel) delete cleEl.dataset.zfaLabel;
      }
      const icEl = row.querySelector('.metadata-property-icon');
      if (icEl && icEl.dataset.zfaIc !== con) {
        try { obsidian.setIcon(icEl, Ariane.iconeConcept(con)); } catch (e) { /* rien */ }
        icEl.dataset.zfaIc = con;
      }
    }
    if (ctx.skin) {
      for (const cont of contEl.querySelectorAll('.metadata-properties')) {
        try { this._grouperProprietes(cont, ctx.clesFamille); } catch (e) { /* rien */ }
      }
    }
  }

  // Range les lignes de propriétés en zones (via `order`) et insère un en-tête
  // par zone présente. `famille` en tête (distinct). Les champs apportés par la
  // famille en fin, dans un volet dédié.
  _grouperProprietes(cont, clesFamille) {
    const groupes = Ariane.GROUPES_TACHE;
    const NOM_FAMILLE = 'Propriétés de la famille';
    const rang = new Map();
    groupes.forEach((g, gi) => g.concepts.forEach((cpt, ci) => rang.set(cpt, (gi + 1) * 100 + ci)));
    const presents = new Set();
    let aFamille = false;
    for (const row of cont.querySelectorAll('.metadata-property')) {
      const cpt = row.dataset.zfaConcept || '';
      const cleBrute = String(row.dataset.propertyKey || '').toLowerCase();
      row.classList.toggle('zfa-note-tache-cle', cpt === 'famille');
      if (cpt === 'famille') { row.style.order = '0'; continue; }
      if (rang.has(cpt)) {
        row.style.order = String(rang.get(cpt));
        // L'heure est l'heure de l'échéance : on la rattache visuellement
        // juste sous elle, en ligne fine.
        row.classList.toggle('zfa-note-tache-sous', cpt === 'heure');
        const g = groupes.find((x) => x.concepts.includes(cpt));
        if (g) presents.add(g.id);
        continue;
      }
      const estFamille = ['source', 'livrable', 'fichier'].includes(cpt)
        || (clesFamille && clesFamille.has(cleBrute));
      if (estFamille) { row.style.order = '700'; row.dataset.zfaGroupe = 'famille'; aFamille = true; continue; }
      row.style.order = '950';
    }
    const attendus = [...groupes.filter((g) => presents.has(g.id)).map((g) => g.id)];
    if (aFamille) attendus.push('famille');
    const vus = new Set();
    for (const h of cont.querySelectorAll(':scope > .zfa-note-tache-groupe')) {
      if (!attendus.includes(h.dataset.zfaGroupe)) h.remove();
      else vus.add(h.dataset.zfaGroupe);
    }
    groupes.forEach((g, gi) => {
      if (!presents.has(g.id) || vus.has(g.id)) return;
      const h = cont.createDiv({ cls: 'zfa-note-tache-groupe', text: tr(g.nom) });
      h.dataset.zfaGroupe = g.id;
      h.style.order = String((gi + 1) * 100 - 1);
    });
    if (aFamille && !vus.has('famille')) {
      const h = cont.createDiv({ cls: 'zfa-note-tache-groupe', text: tr(NOM_FAMILLE) });
      h.dataset.zfaGroupe = 'famille';
      h.style.order = '699';
    }
  }

  // Feuille de style personnelle (réglage). Injectée / mise à jour dans <head>.
  appliquerCssPersonnalise() {
    let el = document.getElementById('zfa-css-perso');
    const css = this.settings.cssPersonnalise || '';
    if (!css.trim()) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('style');
      el.id = 'zfa-css-perso';
      document.head.appendChild(el);
      this.register(() => el && el.remove());
    }
    el.textContent = css;
  }

  // Les notes que Monsieur peut désigner comme livrable. On écarte ce qui est
  // matière documentaire plutôt que production : fiches Zotero, annotations,
  // notes-filles, références en attente, bibliographies, et les tâches elles-mêmes.
  notesPourChoix() {
    const s = this.settings;
    const exclus = [s.dossierAnnotations, s.dossierNotesLecture, s.dossierReferences,
                    s.dossierBibliographies, s.dossierZotero, this.dossierT]
      .map((d) => String(d || '').trim()).filter(Boolean);
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.basename.charAt(0) === '@') continue;
      if (exclus.some((d) => f.path.startsWith(d + '/'))) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter;
      out.push({ nom: Ariane.libelleNote(fm, f.basename), cle: f.basename });
    }
    out.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return out;
  }

  // Écrit une note de tâche neuve et rend son chemin. La référence se calcule
  // sur les notes déjà présentes, ce qui garantit l'unicité sans compteur
  // conservé dans les réglages, lequel se désynchroniserait du coffre.
  async creerTache(champs) {
    const dossier = this.dossierT;
    await this.assurerDossier(dossier);
    const noms = this.app.vault.getMarkdownFiles()
      .filter((f) => f.path.startsWith(dossier + '/'))
      .map((f) => f.basename);
    let reference = Ariane.referenceTacheSuivante(noms, this.settings.refGabarit);
    while (this.app.vault.getAbstractFileByPath(dossier + '/' + reference + '.md')) {
      reference = Ariane.incrementerRef(reference);
    }
    const chemin = dossier + '/' + reference + '.md';
    const jour = new Date().toISOString().slice(0, 10);
    const cles = {};
    for (const con of Ariane.CONCEPTS_TACHE) cles[con] = this.cleT(con);
    await this.ecrire(chemin, Ariane.corpsNouvelleTache(Object.assign({}, champs, {
      aujourdhui: jour, cles,
      liste: (champs && champs.liste) || this.settings.listeRappelsDefaut,
    })));
    // ecrire() marque l'écriture : l'écoute metadataCache est muette → relancer
    // le push explicitement, pour qu'une tâche créée avec une échéance parte
    // vers Rappels sans attendre la relève périodique.
    this._relancerPushRappels(1500);
    return chemin;
  }

  //#endregion Ariane · tâches
}

//#endregion 11 · class Ariane


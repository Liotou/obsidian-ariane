// ── avecAccueil ───────────────────────────────────────────────────────────
// Domaine : la présentation d'Ariane et son tutoriel.
// À la première installation, une note de présentation s'ouvre, dans la
// langue d'Obsidian : ce qu'est Ariane, le parcours d'une annotation, et des
// zones vivantes (blocs de code dessinés par Ariane) : l'état des
// prérequis, le choix du profil de modules, les portes vers le tutoriel et
// les réglages. Le tutoriel crée un dossier d'exemple (une source fictive au
// format de ZotFlow, un brouillon, un parcours) dont les étapes se cochent
// d'elles-mêmes, puis se supprime d'un bouton.
const avecAccueil = (Base) => class extends Base {
  //#region Ariane · static · accueil

  static get NOMS_ACCUEIL() {
    return {
      fr: { note: 'Bienvenue dans Ariane', dossier: 'Ariane - Tutoriel', parcours: 'Tutoriel Ariane', brouillon: 'Mon brouillon' },
      en: { note: 'Welcome to Ariane', dossier: 'Ariane - Tutorial', parcours: 'Ariane tutorial', brouillon: 'My draft' },
    };
  }

  // La clé de citation de la source d'exemple (ouvrage fictif).
  static get CLE_EXEMPLE() { return 'valmontRisqueOrganisations2010'; }

  static langueAccueil() { return LANGUE === 'fr' ? 'fr' : 'en'; }

  // Le profil que forment ces modules (dépendances comprises), ou ''.
  static profilCourant(modules) {
    const a = Ariane.modulesAvecDependances(modules || []).join('|');
    for (const id of ['zotero', 'these', 'tout']) {
      if (Ariane.modulesAvecDependances(PROFILS_ARIANE[id]).join('|') === a) return id;
    }
    return '';
  }

  static noteAccueil(langue) {
    // La version anglaise puise dans la table anglaise, quelle que soit la
    // langue d'Obsidian.
    const en = (cle) => (TEXTES.en && TEXTES.en[cle]) || cle;
    const modules = MODULES_ARIANE.filter((m) => !m.coeur).map((m) => (langue === 'fr'
      ? '- **' + m.nom + '** : ' + m.description
      : '- **' + en(m.nom) + '**: ' + en(m.description)) + (m.macSeul ? ' (Mac)' : ''));
    if (langue === 'fr') {
      return [
        '---', 'cssclasses:', '  - ariane-accueil', '---',
        '# Bienvenue dans Ariane', '',
        '```ariane-actions', '```', '',
        'Ariane relie vos annotations Zotero à votre écriture. Chaque passage que vous surlignez et commentez dans Zotero devient une note de votre coffre ; vous la glissez dans votre texte pour la citer, et la bibliographie se tient à jour d’elle-même. Tout le reste est facultatif, et s’active à la carte.', '',
        '## Ce qui est prêt', '',
        '```ariane-etat', '```', '',
        '## Le parcours d’une annotation', '',
        '1. **Dans Zotero**, vous surlignez un passage d’un PDF ou d’un EPUB, et vous le commentez.',
        '2. **ZotFlow**, greffon d’Obsidian, amène la source et ses annotations dans le coffre.',
        '3. **Ariane** fait de chaque annotation une note à part, nommée d’après votre commentaire, et verrouillée : c’est Zotero qui fait foi.',
        '4. **Vous écrivez** : glissez une note d’annotation sur une phrase. La citation « (Auteur, année, p. X) » s’y pose. Sur une ligne vide, ou avec la touche Maj pendant le glisser, elle prend la forme « Auteur (année) ».',
        '5. **La bibliographie** de la note se construit en bas de page, à mesure.',
        '6. **L’export Word** produit un document mis en forme, avec des citations Zotero vivantes.', '',
        '## Votre profil', '',
        'Choisissez un point de départ. Ariane se recharge, et chaque module reste réglable ensuite (Réglages, Ariane, onglet Modules).', '',
        '```ariane-profil', '```', '',
        '## Les modules facultatifs', '',
        ...modules, '',
        '## Apprendre en essayant', '',
        'Le tutoriel crée un dossier d’exemple, avec une source fictive et un brouillon, pour faire le parcours en cinq minutes sans toucher à vos notes. Un bouton le supprime ensuite.', '',
        '## Aide', '',
        '- Les réglages d’Ariane commencent par l’onglet **Accueil**, qui redit ce qui est prêt et ce qui manque.',
        '- La palette de commandes (⌘ P ou Ctrl P) liste toutes les commandes d’Ariane : tapez « Ariane » ou le nom d’un module.',
        '- La documentation complète : https://github.com/Liotou/obsidian-ariane',
        '- Cette note peut être supprimée : la commande « Ariane : ouvrir la présentation » la recrée.', '',
      ].join('\n');
    }
    return [
      '---', 'cssclasses:', '  - ariane-accueil', '---',
      '# Welcome to Ariane', '',
      '```ariane-actions', '```', '',
      'Ariane connects your Zotero annotations to your writing. Every passage you highlight and comment on in Zotero becomes a note in your vault; drag it into your text to cite it, and the bibliography keeps itself up to date. Everything else is optional, and can be switched on as you need it.', '',
      '## What is ready', '',
      '```ariane-etat', '```', '',
      '## The life of an annotation', '',
      '1. **In Zotero**, you highlight a passage of a PDF or an EPUB, and comment on it.',
      '2. **ZotFlow**, an Obsidian plugin, brings the source and its annotations into the vault.',
      '3. **Ariane** turns each annotation into a note of its own, named after your comment, and locked: Zotero stays the reference.',
      '4. **You write**: drag an annotation note onto a sentence. The citation "(Author, year, p. X)" lands there. On an empty line, or holding Shift while dragging, it takes the form "Author (year)".',
      '5. **The bibliography** of the note builds itself at the bottom, as you go.',
      '6. **The Word export** produces a formatted document with live Zotero citations.', '',
      '## Your profile', '',
      'Pick a starting point. Ariane reloads, and every module can still be changed later (Settings, Ariane, Modules tab).', '',
      '```ariane-profil', '```', '',
      '## Optional modules', '',
      ...modules, '',
      '## Learn by doing', '',
      'The tutorial creates a sample folder, with a fictional source and a draft, so you can try the whole journey in five minutes without touching your notes. One button removes it afterwards.', '',
      '## Help', '',
      '- Ariane\'s settings open on the **Home** tab, which shows what is ready and what is missing.',
      '- The command palette (Cmd P or Ctrl P) lists every Ariane command: type "Ariane" or the name of a module.',
      '- Full documentation: https://github.com/Liotou/obsidian-ariane',
      '- You may delete this note: the command "Ariane: open the introduction" creates it again.', '',
    ].join('\n');
  }

  // La source d'exemple, au format des notes de ZotFlow : trois annotations
  // commentées, sur un ouvrage fictif.
  static sourceExemple(langue) {
    const fr = langue === 'fr';
    const bloc = (cle, page, couleur, passage, titre, commentaire) => [
      '> [!zotflow-highlight-' + couleur + '] [valmont2010.pdf, p.' + page + '](obsidian://zotflow?type=open-annotation&libraryID=1&key=' + cle + ')',
      '> > ' + passage, '>',
      '> <!-- ZF_ANNO_BEG_' + cle + ' -->',
      '> **' + titre + '**',
      '> ' + commentaire,
      '> <!-- ZF_ANNO_END_' + cle + ' -->',
      '> ', '^' + cle, '',
    ].join('\n');
    return [
      '---',
      'citationKey: ' + Ariane.CLE_EXEMPLE,
      'title: ' + (fr ? '"Le risque dans les organisations"' : '"Risk in organisations"'),
      'itemType: book',
      'creators:', '  - "Hélène Valmont"', '  - "Paul Ferrat"',
      'year: 2010', 'date: "2010"',
      'tutoriel-ariane: true',
      '---',
      '# ' + (fr ? 'Le risque dans les organisations' : 'Risk in organisations'), '',
      fr ? '*Source fictive du tutoriel d’Ariane. Elle imite une note de ZotFlow.*' : '*A fictional source for the Ariane tutorial. It mimics a ZotFlow note.*', '',
      '## Annotations', '### valmont2010.pdf', '',
      bloc('TUTOANN1', '12', '#ffd400',
        fr ? 'Une organisation ne supprime jamais le risque : elle choisit lequel elle accepte.' : 'An organisation never removes risk: it chooses which one it accepts.',
        fr ? 'Le risque comme choix.' : 'Risk as a choice.',
        fr ? 'Le risque n’est pas une fatalité mais un arbitrage : accepter un risque, c’est en écarter un autre.' : 'Risk is not fate but a trade-off: accepting one risk means setting another aside.'),
      bloc('TUTOANN2', '47', '#5fb236',
        fr ? 'Les signaux faibles se perdent moins par ignorance que par excès d’information.' : 'Weak signals are lost less through ignorance than through too much information.',
        fr ? 'Signaux faibles et surcharge.' : 'Weak signals and overload.',
        fr ? 'Ce n’est pas le manque d’alerte qui aveugle, c’est leur nombre : le tri devient le vrai travail de vigilance.' : 'What blinds us is not the lack of warnings but their number: sorting becomes the real work of vigilance.'),
      bloc('TUTOANN3', '103', '#2ea8e5',
        fr ? 'La résilience tient à la marge de manœuvre que l’on s’est ménagée avant la crise.' : 'Resilience depends on the room for manoeuvre secured before the crisis.',
        fr ? 'La résilience se prépare.' : 'Resilience is prepared.',
        fr ? 'La capacité à rebondir se construit en amont : elle tient aux réserves, aux redondances, au temps que l’on garde.' : 'The ability to bounce back is built in advance: it rests on reserves, redundancy, and the time one keeps.'),
    ].join('\n');
  }

  static brouillonExemple(langue) {
    return langue === 'fr'
      ? '# Mon brouillon\n\nLes organisations ne font pas disparaître le risque.\n\nUne vigilance trop sollicitée finit par ne plus rien voir.\n\n'
      : '# My draft\n\nOrganisations do not make risk disappear.\n\nVigilance that is asked too much ends up seeing nothing.\n\n';
  }

  static noteTutoriel(langue) {
    return langue === 'fr'
      ? ['---', 'cssclasses:', '  - ariane-accueil', '---', '# Tutoriel Ariane', '',
        'Six étapes, qui se cochent d’elles-mêmes. Gardez cette note ouverte à côté de votre travail.', '',
        '```ariane-tutoriel', '```', ''].join('\n')
      : ['---', 'cssclasses:', '  - ariane-accueil', '---', '# Ariane tutorial', '',
        'Six steps, which tick themselves. Keep this note open next to your work.', '',
        '```ariane-tutoriel', '```', ''].join('\n');
  }

  // Les étapes du tutoriel et leur état. f : { annotations (nombre de notes
  // d'annotation de la source d'exemple), ouverte, citation, biblio, replie,
  // export, exportPossible }.
  static etapesTutoriel(f) {
    return [
      { id: 'atomiser', fait: (f.annotations || 0) >= 3 },
      { id: 'ouvrir', fait: !!f.ouverte },
      { id: 'citer', fait: !!f.citation },
      { id: 'biblio', fait: !!f.biblio },
      { id: 'replier', fait: !!f.replie },
      { id: 'exporter', fait: !!f.export, facultatif: !f.exportPossible },
    ];
  }

  //#endregion Ariane · static · accueil

  //#region Ariane · accueil et tutoriel

  // Les zones vivantes et l'ouverture au premier lancement.
  installerAccueil() {
    const bloc = (nom, rendu) => this.registerMarkdownCodeBlockProcessor(nom, (_src, el, ctx) => {
      const enfant = new obsidian.MarkdownRenderChild(el);
      ctx.addChild(enfant);
      const dessiner = () => { el.empty(); try { rendu(el, enfant); } catch (e) { console.warn('[Ariane] ' + nom + ' :', e); } };
      enfant.registerEvent(this.app.workspace.on('ariane:accueil', dessiner));
      dessiner();
    });
    bloc('ariane-etat', (el) => this._dessinerEtat(el));
    bloc('ariane-profil', (el) => this._dessinerProfils(el));
    bloc('ariane-actions', (el) => this._dessinerActions(el));
    bloc('ariane-tutoriel', (el, enfant) => {
      this._dessinerTutoriel(el);
      // Les étapes se cochent quand le coffre ou la note ouverte changent.
      const plus = () => this.antirebond('tutoriel', () => this.app.workspace.trigger('ariane:accueil'), 500);
      enfant.registerEvent(this.app.vault.on('create', plus));
      enfant.registerEvent(this.app.vault.on('modify', plus));
      enfant.registerEvent(this.app.vault.on('delete', plus));
    });
    // Une annotation d'exemple ouverte : l'étape 2 est faite.
    this.registerEvent(this.app.workspace.on('file-open', (f) => {
      if (f && f.path.startsWith(this._dossierAnnotationsExemple() + '/')) this.noterEtapeTutoriel('ouverte');
    }));
    this.app.workspace.onLayoutReady(() => {
      if (!this._accueilAOuvrir) return;
      this._accueilAOuvrir = false;
      this.ouvrirPresentation().catch((e) => console.warn('[Ariane] présentation :', e));
    });
  }

  _cheminPresentation(langue) { return Ariane.NOMS_ACCUEIL[langue].note + '.md'; }

  // Ouvre la présentation, en la créant si elle manque.
  async ouvrirPresentation(langue) {
    const l = langue || Ariane.langueAccueil();
    const chemin = this._cheminPresentation(l);
    let f = this.app.vault.getAbstractFileByPath(chemin);
    if (!(f instanceof obsidian.TFile)) {
      await this.ecrire(chemin, Ariane.noteAccueil(l));
      f = this.app.vault.getAbstractFileByPath(chemin);
    }
    if (f instanceof obsidian.TFile) await this.app.workspace.getLeaf('tab').openFile(f);
  }

  ouvrirReglagesAriane() {
    const s = this.app.setting;
    if (!s) return;
    s.open();
    if (typeof s.openTabById === 'function') s.openTabById(this.manifest.id);
  }

  _dessinerActions(el) {
    const l = Ariane.langueAccueil();
    const autre = l === 'fr' ? 'en' : 'fr';
    const boite = el.createDiv({ cls: 'zfa-accueil-actions' });
    const bouton = (texte, cta, faire) => {
      const b = boite.createEl('button', { text: texte, cls: cta ? 'mod-cta' : '' });
      b.addEventListener('click', faire);
    };
    bouton(tr('Lancer le tutoriel'), true, () => this.creerTutoriel());
    bouton(tr('Ouvrir les réglages d’Ariane'), false, () => this.ouvrirReglagesAriane());
    bouton(autre === 'en' ? 'Read in English' : 'Lire en français', false, () => this.ouvrirPresentation(autre));
  }

  _dessinerEtat(el) {
    const liste = el.createDiv({ cls: 'zfa-accueil-etat' });
    for (const e of this.etatPrerequis()) {
      const l = liste.createDiv({ cls: 'zfa-accueil-etat-ligne ' + (e.ok ? 'est-ok' : 'est-manquant') });
      obsidian.setIcon(l.createSpan({ cls: 'zfa-accueil-etat-ic' }), e.ok ? 'check-circle-2' : 'circle-dashed');
      const t = l.createDiv();
      t.createDiv({ cls: 'zfa-accueil-etat-nom', text: tr(e.nom) });
      t.createDiv({ cls: 'zfa-accueil-etat-desc', text: tr(e.ok ? e.siOk : e.sinon) });
    }
    const b = el.createEl('button', { text: tr('Vérifier de nouveau'), cls: 'zfa-accueil-petit' });
    b.addEventListener('click', () => this.app.workspace.trigger('ariane:accueil'));
  }

  _dessinerProfils(el) {
    const courant = Ariane.profilCourant(this.settings.modules);
    const noms = new Map(MODULES_ARIANE.map((m) => [m.id, tr(m.nom)]));
    const profils = [
      ['zotero', 'Zotero et écriture', 'Le cœur, et ce qui sert à écrire : annotations, citations, bibliographie, export Word, familles de notes, typographie.'],
      ['these', 'Gestion de la thèse', 'Le précédent, plus les tâches, le canevas, les rappels et agendas, le temps passé.'],
      ['tout', 'Tout', 'Tous les modules, y compris la barre d’édition, les suggestions, les schémas, Claude et la publication.'],
    ];
    const grille = el.createDiv({ cls: 'zfa-accueil-profils' });
    for (const [id, nom, desc] of profils) {
      const carte = grille.createDiv({ cls: 'zfa-accueil-profil' + (id === courant ? ' est-courant' : '') });
      carte.setAttr('role', 'button');
      carte.setAttr('tabindex', '0');
      carte.createDiv({ cls: 'zfa-accueil-profil-nom', text: tr(nom) + (id === courant ? '  ' + tr('(actuel)') : '') });
      carte.createDiv({ cls: 'zfa-accueil-profil-desc', text: tr(desc) });
      carte.createDiv({ cls: 'zfa-accueil-profil-mods',
        text: Ariane.modulesAvecDependances(PROFILS_ARIANE[id]).filter((m) => !['annotations', 'citations'].includes(m)).map((m) => noms.get(m)).join(', ') });
      const choisir = () => {
        if (id === courant) return;
        new obsidian.Notice(tr('Ariane se recharge avec le profil « ') + tr(nom) + tr(' »…'));
        this.appliquerModules(PROFILS_ARIANE[id]);
      };
      carte.addEventListener('click', choisir);
      carte.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choisir(); } });
    }
    if (!courant) el.createDiv({ cls: 'zfa-accueil-etat-desc', text: tr('Votre choix actuel est personnalisé (onglet Modules des réglages).') });
  }

  // ── le tutoriel ──

  _dossierTutoriel(langue) { return Ariane.NOMS_ACCUEIL[langue || Ariane.langueAccueil()].dossier; }
  _dossierAnnotationsExemple() { return this.dossierA + '/' + this.nettoyerNomFichier('@' + Ariane.CLE_EXEMPLE); }

  // Le dossier du tutoriel existant (l'une ou l'autre langue), ou null.
  _tutorielExistant() {
    for (const l of ['fr', 'en']) {
      const d = this.app.vault.getAbstractFileByPath(this._dossierTutoriel(l));
      if (d instanceof obsidian.TFolder) return { dossier: d, langue: l };
    }
    return null;
  }

  async creerTutoriel() {
    const deja = this._tutorielExistant();
    const l = deja ? deja.langue : Ariane.langueAccueil();
    const n = Ariane.NOMS_ACCUEIL[l];
    const d = this._dossierTutoriel(l);
    await this.assurerDossier(d);
    const poser = async (nom, texte) => {
      const chemin = d + '/' + nom + '.md';
      if (!this.app.vault.getAbstractFileByPath(chemin)) await this.ecrire(chemin, texte);
      return chemin;
    };
    await poser('@' + Ariane.CLE_EXEMPLE, Ariane.sourceExemple(l));
    await poser(n.brouillon, Ariane.brouillonExemple(l));
    const parcours = await poser(n.parcours, Ariane.noteTutoriel(l));
    if (!deja) { this.settings._tutoriel = {}; await this.saveSettings(); }
    const f = this.app.vault.getAbstractFileByPath(parcours);
    if (f instanceof obsidian.TFile) await this.app.workspace.getLeaf('tab').openFile(f);
  }

  // Une étape constatée ailleurs (repli des citations, export, ouverture).
  noterEtapeTutoriel(etape) {
    if (!this._tutorielExistant()) return;
    const t = this.settings._tutoriel || (this.settings._tutoriel = {});
    if (t[etape]) return;
    t[etape] = true;
    this.saveSettings().catch(() => {});
    this.app.workspace.trigger('ariane:accueil');
  }

  async _faitsTutoriel() {
    const ex = this._tutorielExistant();
    const t = this.settings._tutoriel || {};
    const f = { ouverte: !!t.ouverte, replie: !!t.replie, export: !!t.export, annotations: 0, citation: false, biblio: false };
    const dossierAnno = this._dossierAnnotationsExemple();
    const annos = this.app.vault.getMarkdownFiles().filter((x) => x.path.startsWith(dossierAnno + '/'));
    f.annotations = annos.length;
    if (ex) {
      const b = this.app.vault.getAbstractFileByPath(this._dossierTutoriel(ex.langue) + '/' + Ariane.NOMS_ACCUEIL[ex.langue].brouillon + '.md');
      if (b instanceof obsidian.TFile) {
        const texte = await this.app.vault.cachedRead(b);
        f.citation = annos.some((a) => texte.includes('[[' + a.basename));
        f.biblio = /%% ariane:biblio %%/.test(texte) && f.citation;
      }
    }
    let pandoc = '';
    try { pandoc = trouverExecutable(this.settings.exportPandocBin || 'pandoc', envOutils()) || ''; } catch (e) { pandoc = ''; }
    f.exportPossible = this.module('export') && !!pandoc;
    return f;
  }

  _dessinerTutoriel(el) {
    const ex = this._tutorielExistant();
    if (!ex) {
      el.createDiv({ cls: 'zfa-accueil-etat-desc', text: tr('Le dossier du tutoriel n’existe plus.') });
      const b = el.createEl('button', { text: tr('Recréer le tutoriel'), cls: 'mod-cta' });
      b.addEventListener('click', () => this.creerTutoriel());
      return;
    }
    const n = Ariane.NOMS_ACCUEIL[ex.langue];
    const d = this._dossierTutoriel(ex.langue);
    const source = this.app.vault.getAbstractFileByPath(d + '/@' + Ariane.CLE_EXEMPLE + '.md');
    const brouillon = this.app.vault.getAbstractFileByPath(d + '/' + n.brouillon + '.md');
    const ouvrirACote = (f) => { if (f instanceof obsidian.TFile) this.app.workspace.getLeaf('split').openFile(f); };
    const textes = {
      atomiser: ['Atomiser la source d’exemple', 'Ariane fait de chacune de ses trois annotations une note à part, dans votre dossier d’annotations.', 'Atomiser', async () => {
        if (source instanceof obsidian.TFile) await this.atomiseSource(source);
        this.app.workspace.trigger('ariane:accueil');
      }],
      ouvrir: ['Ouvrir une note d’annotation', 'Elle porte le passage, votre commentaire, la source et la page. Elle est verrouillée : c’est Zotero qui fait foi.', 'Ouvrir', () => {
        const a = this.app.vault.getMarkdownFiles().find((x) => x.path.startsWith(this._dossierAnnotationsExemple() + '/'));
        if (a) ouvrirACote(a); else new obsidian.Notice(tr('Atomisez d’abord la source d’exemple.'));
      }],
      citer: ['La glisser dans le brouillon', 'Ouvrez le brouillon, puis glissez une note d’annotation (depuis l’explorateur de fichiers) sur une phrase : la citation s’y pose. Maj pendant le glisser donne « Auteur (année) ».', 'Ouvrir le brouillon', () => ouvrirACote(brouillon)],
      biblio: ['Voir la bibliographie', 'En bas du brouillon, la bibliographie s’est construite d’elle-même, et se tient à jour.', '', null],
      replier: ['Replier les citations', 'Les citations se replient en pastilles, pour relire le texte d’un trait ; un clic sur une pastille la déplie.', 'Replier ou déplier', () => this.basculerCitations(!this.settings.citationsRepliees)],
      exporter: ['Exporter en Word', 'Le brouillon devient un document Word, avec des citations Zotero vivantes (pandoc et Better BibTeX requis).', 'Exporter le brouillon', async () => {
        if (brouillon instanceof obsidian.TFile) await this.app.workspace.getLeaf(false).openFile(brouillon);
        await this.exporterWordZotero();
      }],
    };
    const liste = el.createDiv({ cls: 'zfa-tuto' });
    this._faitsTutoriel().then((faits) => {
      const etapes = Ariane.etapesTutoriel(faits);
      etapes.forEach((e, i) => {
        const [titre, aide, action, faire] = textes[e.id];
        const l = liste.createDiv({ cls: 'zfa-tuto-etape' + (e.fait ? ' est-faite' : '') });
        obsidian.setIcon(l.createSpan({ cls: 'zfa-tuto-ic' }), e.fait ? 'check-circle-2' : 'circle');
        const corps = l.createDiv({ cls: 'zfa-tuto-corps' });
        corps.createDiv({ cls: 'zfa-tuto-titre', text: (i + 1) + '. ' + tr(titre) + (e.facultatif ? ' ' + tr('(facultatif)') : '') });
        corps.createDiv({ cls: 'zfa-tuto-aide', text: tr(aide) });
        if (action && faire && !(e.id === 'exporter' && e.facultatif)) {
          const b = corps.createEl('button', { text: tr(action), cls: e.fait ? '' : 'mod-cta' });
          b.addEventListener('click', () => Promise.resolve(faire()).catch((err) => console.warn('[Ariane] tutoriel :', err)));
        }
      });
      const faites = etapes.filter((e) => e.fait || e.facultatif).length;
      const pied = el.createDiv({ cls: 'zfa-tuto-pied' });
      pied.createDiv({ text: faites === etapes.length ? tr('Bravo : le parcours est fait. Vous pouvez supprimer le tutoriel.') : faites + ' / ' + etapes.length });
      const sup = pied.createEl('button', { text: tr('Supprimer le tutoriel'), cls: 'mod-warning' });
      sup.addEventListener('click', () => this.supprimerTutoriel());
    });
  }

  // Le dossier d'exemple et les annotations atomisées de la source fictive
  // partent à la corbeille d'Obsidian.
  async supprimerTutoriel() {
    const ex = this._tutorielExistant();
    const annos = this.app.vault.getAbstractFileByPath(this._dossierAnnotationsExemple());
    for (const cible of [annos, ex && ex.dossier]) {
      if (!cible) continue;
      this.marquerEcriture(cible.path);
      try { await this.app.fileManager.trashFile(cible); } catch (e) { console.warn('[Ariane] tutoriel :', e); }
    }
    this.settings._tutoriel = {};
    await this.saveSettings();
    new obsidian.Notice(tr('Tutoriel supprimé.'));
  }

  //#endregion Ariane · accueil et tutoriel
};

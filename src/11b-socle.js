
// ── avecSocle ─────────────────────────────────────────────────────────────
// Phase 2 : core.
// Réglages, dates, chemins, garde-fous d'écriture, aiguillage des événements
// du coffre. Tout ce dont les deux greffons auront besoin.
const avecSocle = (Base) => class extends Base {
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
};

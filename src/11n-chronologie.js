// ── avecChronologie ───────────────────────────────────────────────────────
// Domaine : chronologie d'activité du coffre.
// Journal des événements (notes créées ou modifiées, captures, tâches
// terminées ou abandonnées, canevas), tenu par mois dans le dossier du
// greffon, et reconstitution approximative du passé d'avant le journal à
// partir des dates des fichiers. La vue « ariane-chronologie » (section 19)
// le lit.
//
// Ce qui n'est PAS une activité : une écriture d'Ariane elle-même, et une
// modification qui ne touche que l'entête. Le compteur de temps réécrit la
// propriété « temps-passe » toutes les cinq minutes : sans cette règle, la
// chronologie ne parlerait que de lui.
const avecChronologie = (Base) => class extends Base {
  //#region Ariane · static · chronologie
  // ── static · chronologie ─────────────────────────────────────────────────

  // Les types d'événement, dans l'ordre des compteurs de la vue. `filtre` est
  // la pastille qui les montre.
  static get TYPES_CHRONO() {
    return [
      { type: 'note-modifiee', libelle: 'Notes modifiées', etiquette: 'Note modifiée', icone: 'pencil', couleur: 'var(--text-muted)', filtre: 'notes' },
      { type: 'note-creee', libelle: 'Notes créées', etiquette: 'Note créée', icone: 'file-plus', couleur: 'var(--color-purple)', filtre: 'notes' },
      { type: 'capture', libelle: 'Captures', etiquette: 'Capture', icone: 'bookmark', couleur: 'var(--color-blue)', filtre: 'captures' },
      { type: 'tache-terminee', libelle: 'Tâches terminées', etiquette: 'Tâche terminée', icone: 'check', couleur: 'var(--color-cyan)', filtre: 'taches' },
      { type: 'tache-abandonnee', libelle: 'Tâches abandonnées', etiquette: 'Tâche abandonnée', icone: 'x', couleur: 'var(--color-orange)', filtre: 'taches' },
      { type: 'canevas', libelle: 'Canevas & extraits', etiquette: 'Canevas', icone: 'layout-dashboard', couleur: 'var(--color-yellow)', filtre: 'canevas' },
      { type: 'ajouts-auto', libelle: 'Ajouts automatiques', etiquette: 'Ajouts automatiques', icone: 'layers', couleur: 'var(--text-faint)', filtre: 'notes' },
      { type: 'activite', libelle: 'Hors Obsidian', etiquette: 'Hors Obsidian', icone: 'monitor', couleur: 'var(--color-green)', filtre: 'externe' },
    ];
  }

  static typeChrono(type) {
    return Ariane.TYPES_CHRONO.find((d) => d.type === type) || Ariane.TYPES_CHRONO[0];
  }

  // Sources de capture, une par ligne : « Nom (icône) = dossier, dossier ».
  // L'icône (Lucide) est facultative.
  static compilerSourcesCapture(texte) {
    const out = [];
    for (const brute of String(texte || '').split('\n')) {
      const l = brute.trim();
      if (!l || l.startsWith('#')) continue;
      const i = l.indexOf('=');
      if (i <= 0) continue;
      let nom = l.slice(0, i).trim();
      let icone = '';
      const mi = nom.match(/\(([\w-]+)\)\s*$/);
      if (mi) { icone = mi[1]; nom = nom.slice(0, mi.index).trim(); }
      const dossiers = l.slice(i + 1).split(',').map((d) => d.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean);
      if (nom && dossiers.length) out.push({ nom, icone: icone || 'bookmark', dossiers });
    }
    return out;
  }

  // Ce que la chronologie fait d'un chemin : { genre: 'note' | 'capture' |
  // 'canevas', source } ou null s'il ne la concerne pas. `cfg` = { exclus,
  // extraits, sources } (dossiers déjà découpés, sources compilées).
  static genreChrono(chemin, extension, cfg) {
    const c = cfg || {};
    const p = String(chemin || '');
    if (!p || p.startsWith('.') || p.includes('/.')) return null;
    if (Ariane.sousDossier(p, c.exclus || [])) return null;
    const ext = String(extension || '').toLowerCase();
    if (ext === 'canvas') return { genre: 'canevas' };
    if (ext !== 'md') return null;
    if (Ariane.sousDossier(p, c.extraits || [])) return { genre: 'canevas' };
    for (const s of (c.sources || [])) {
      if (Ariane.sousDossier(p, s.dossiers)) return { genre: 'capture', source: s };
    }
    return { genre: 'note' };
  }

  // Corps d'une note, sans son entête YAML.
  static corpsSansEntete(texte) {
    const t = String(texte || '').replace(/\r\n/g, '\n');
    const m = t.match(/^---\n[\s\S]*?\n---(?:\n|$)/);
    return m ? t.slice(m[0].length) : t;
  }

  // Une ligne de Markdown réduite à son texte lisible.
  static texteBrutLigne(l) {
    return String(l || '')
      .replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)+/, '')
      .replace(/!?\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
      .replace(/!?\[\[([^\]]*)\]\]/g, '$1')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__|==|~~|`)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Les premières lignes lisibles d'un texte, coupées net au-delà de `max`.
  static extraitLignes(lignes, max) {
    const garder = [];
    for (const l of lignes) {
      const b = Ariane.texteBrutLigne(l);
      if (!b || /^[-*_=|:\s]+$/.test(b)) continue;
      garder.push(b);
      if (garder.length >= 2) break;
    }
    const t = garder.join('\n');
    const m = max || 280;
    return t.length > m ? t.slice(0, m - 1).trimEnd() + '…' : t;
  }

  // Début lisible d'une note (capture) : les deux premières lignes du corps
  // qui ne sont pas des titres.
  static extraitDebut(texte, max) {
    const lignes = Ariane.corpsSansEntete(texte).split('\n').filter((l) => !/^\s*#{1,6}\s/.test(l));
    return Ariane.extraitLignes(lignes, max);
  }

  // Ce qu'une modification a changé dans le CORPS d'une note : le nombre de
  // lignes touchées et le début de la zone modifiée (lignes nouvelles, ou
  // lignes retirées si rien n'a été ajouté). null si le corps n'a pas bougé
  // (entête seule, ou rien du tout).
  static extraitModification(avant, apres) {
    const A = Ariane.corpsSansEntete(avant).split('\n');
    const B = Ariane.corpsSansEntete(apres).split('\n');
    let i = 0;
    while (i < A.length && i < B.length && A[i] === B[i]) i++;
    let ja = A.length - 1;
    let jb = B.length - 1;
    while (ja >= i && jb >= i && A[ja] === B[jb]) { ja--; jb--; }
    const ajout = B.slice(i, jb + 1);
    const retrait = A.slice(i, ja + 1);
    if (!ajout.length && !retrait.length) return null;
    const plein = (ls) => ls.some((l) => l.trim());
    if (!plein(ajout) && !plein(retrait)) return null;
    return {
      n: Math.max(ajout.length, retrait.length),
      extrait: Ariane.extraitLignes(plein(ajout) ? ajout : retrait),
      retrait: !plein(ajout),
    };
  }

  // Bornes d'une période autour d'un jour : { debut, fin } en jours ISO, fin
  // exclue. La semaine commence le lundi.
  static bornesPeriode(periode, jour) {
    const j = Ariane.jourValide(jour) || jourIsoDe(new Date());
    if (periode === 'jour') return { debut: j, fin: Ariane.decalerJour(j, 1) };
    if (periode === 'mois') {
      const d = j.slice(0, 8) + '01';
      const [a, m] = [Number(j.slice(0, 4)), Number(j.slice(5, 7))];
      const suiv = m === 12 ? (a + 1) + '-01-01' : a + '-' + String(m + 1).padStart(2, '0') + '-01';
      return { debut: d, fin: suiv };
    }
    if (periode === 'annee') {
      const a = Number(j.slice(0, 4));
      return { debut: a + '-01-01', fin: (a + 1) + '-01-01' };
    }
    const dow = (new Date(j + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const lundi = Ariane.decalerJour(j, -dow);
    return { debut: lundi, fin: Ariane.decalerJour(lundi, 7) };
  }

  // Le jour d'ancrage de la période voisine (sens = -1 ou +1).
  static decalerPeriode(periode, jour, sens) {
    const b = Ariane.bornesPeriode(periode, jour);
    if (sens > 0) return b.fin;
    if (periode === 'jour') return Ariane.decalerJour(b.debut, -1);
    if (periode === 'semaine') return Ariane.decalerJour(b.debut, -7);
    return Ariane.bornesPeriode(periode, Ariane.decalerJour(b.debut, -1)).debut;
  }

  // Dossier de premier niveau d'un chemin ('' à la racine).
  static dossierRacine(chemin) {
    const p = String(chemin || '');
    const i = p.indexOf('/');
    return i < 0 ? '' : p.slice(0, i);
  }

  // Filtre de la vue : pastille (tout, notes, taches, captures, canevas) et
  // dossier de premier niveau ('' = tous).
  static filtrerChrono(evts, filtre, dossier) {
    const f = filtre || 'tout';
    return (evts || []).filter((e) => {
      if (f !== 'tout' && Ariane.typeChrono(e.type).filtre !== f) return false;
      if (dossier && Ariane.dossierRacine(e.chemin) !== dossier) return false;
      return true;
    });
  }

  // Nombre d'événements par type.
  static comptesChrono(evts) {
    const c = {};
    for (const d of Ariane.TYPES_CHRONO) c[d.type] = 0;
    for (const e of (evts || [])) if (c[e.type] !== undefined) c[e.type]++;
    return c;
  }

  // Les ajouts automatiques (une synchronisation, ZotFlow, Raindrop… crée
  // d'un coup des dizaines de notes) réunis en un seul lot : au moins
  // `opts.min` créations (4) dans le même dossier de premier niveau, chacune
  // à moins de `opts.ecart` ms (60 s) de la précédente. Personne ne crée
  // quatre notes à la main en si peu de temps. Le lot prend la place de ses
  // éléments, à l'heure du dernier ; le reste garde son ordre (récent d'abord).
  static grouperAjoutsAuto(evts, opts) {
    const o = Object.assign({ min: 4, ecart: 60000 }, opts || {});
    const liste = evts || [];
    const parCle = new Map();
    for (const e of liste) {
      if (e.type !== 'note-creee' && e.type !== 'capture') continue;
      const cle = e.type + '|' + (e.source || Ariane.dossierRacine(e.chemin));
      if (!parCle.has(cle)) parCle.set(cle, []);
      parCle.get(cle).push(e);
    }
    const remplace = new Map();
    for (const groupe of parCle.values()) {
      const tries = groupe.slice().sort((a, b) => a.t - b.t);
      let rafale = [];
      const clore = () => {
        if (rafale.length >= o.min) {
          const der = rafale[rafale.length - 1];
          const lot = { t: der.t, debut: rafale[0].t, type: 'ajouts-auto', n: rafale.length,
            dossier: Ariane.dossierRacine(der.chemin), source: der.source || '', chemin: der.chemin,
            approx: rafale.every((x) => x.approx) ? true : undefined,
            elements: rafale.map((x) => ({ chemin: x.chemin, titre: x.titre })).reverse() };
          for (const x of rafale) remplace.set(x, x === der ? lot : null);
        }
        rafale = [];
      };
      for (const e of tries) {
        if (rafale.length && e.t - rafale[rafale.length - 1].t > o.ecart) clore();
        rafale.push(e);
      }
      clore();
    }
    if (!remplace.size) return liste.slice();
    const out = [];
    for (const e of liste) {
      if (!remplace.has(e)) { out.push(e); continue; }
      const r = remplace.get(e);
      if (r) out.push(r);
    }
    return out;
  }

  // Carte de chaleur : `semaines` colonnes (la dernière contient `aujourdhui`),
  // sept lignes du lundi au dimanche. Chaque case : { jour, n, niveau 0..4 },
  // ou null après aujourd'hui. Le niveau se rapporte au jour le plus chargé.
  static carteChaleur(evts, aujourdhui, semaines) {
    const nb = semaines || 10;
    const parJour = new Map();
    for (const e of (evts || [])) {
      const j = jourIsoDe(new Date(e.t));
      parJour.set(j, (parJour.get(j) || 0) + 1);
    }
    const lundi = Ariane.bornesPeriode('semaine', aujourdhui).debut;
    const depart = Ariane.decalerJour(lundi, -7 * (nb - 1));
    let max = 0;
    const cols = [];
    for (let s = 0; s < nb; s++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const jour = Ariane.decalerJour(depart, s * 7 + d);
        if (jour > aujourdhui) { col.push(null); continue; }
        const n = parJour.get(jour) || 0;
        if (n > max) max = n;
        col.push({ jour, n, niveau: 0 });
      }
      cols.push(col);
    }
    for (const col of cols) {
      for (const c of col) if (c && c.n) c.niveau = Math.max(1, Math.ceil((c.n / max) * 4));
    }
    return { depart, colonnes: cols };
  }

  //#endregion Ariane · static · chronologie

  //#region Ariane · chronologie (journal & lecture)
  // ── chronologie (journal & lecture) ──────────────────────────────────────

  // Réglages compilés, recalculés quand le texte des réglages change.
  _chronoCfg() {
    const s = this.settings;
    const sig = [s.chronoCaptures, s.chronoExtraits, s.chronoDossiersExclus, s.tempsDossierJournal].join('\u0001');
    if (this._chronoCfgCache && this._chronoCfgCache.sig === sig) return this._chronoCfgCache.cfg;
    const lignes = (t) => String(t || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
    const exclus = lignes(s.chronoDossiersExclus);
    // L'ancien journal du temps (s'il reste) est un produit d'Ariane, pas une activité.
    exclus.push(String(s.tempsDossierJournal || '9 - Journal du temps'));
    const cfg = {
      exclus,
      extraits: lignes(s.chronoExtraits),
      sources: Ariane.compilerSourcesCapture(s.chronoCaptures),
    };
    this._chronoCfgCache = { sig, cfg };
    return cfg;
  }

  // Le journal d'un mois ('AAAA-MM') : { jour: [événements] }, assemblé à
  // partir des fichiers du jour (.ariane/jours, voir avecDonneesJour) ;
  // les listes sont celles de ces fichiers, si bien qu'y ajouter un
  // événement l'ajoute au jour. Une seule lecture par mois et par session.
  _chronoMois(mois) {
    const cache = this._chronoMoisCache || (this._chronoMoisCache = new Map());
    if (!cache.has(mois)) {
      cache.set(mois, (async () => {
        const o = {};
        for (const j of await this.joursAvecDonnees()) {
          if (j.slice(0, 7) !== mois) continue;
          const d = await this.donneesJour(j);
          if (d.chronologie && d.chronologie.length) o[j] = d.chronologie;
        }
        return o;
      })());
    }
    return cache.get(mois);
  }

  // Les mois touchés attendent un quart de minute avant d'être écrits : une
  // rafale de modifications ne coûte qu'une écriture.
  _chronoSale(mois) {
    (this._chronoSales || (this._chronoSales = new Set())).add(mois);
    clearTimeout(this._chronoMinuterie);
    this._chronoMinuterie = setTimeout(() => this._chronoEcrire(), 15000);
    this._chronoSignaler();
  }

  async _chronoEcrire() {
    clearTimeout(this._chronoMinuterie);
    const sales = [...(this._chronoSales || [])];
    if (!sales.length) return;
    this._chronoSales = new Set();
    try {
      for (const mois of sales) {
        const o = await this._chronoMois(mois);
        for (const [jour, liste] of Object.entries(o)) {
          const d = await this.donneesJour(jour);
          if (d.chronologie !== liste) d.chronologie = liste;
          this.marquerJourSale(jour);
        }
      }
      await this.ecrireDonneesJours();
    } catch (e) {
      console.error('[Ariane] chronologie non écrite', e);
    }
  }

  // Prévient les vues ouvertes, sans les redessiner à chaque frappe.
  _chronoSignaler() {
    clearTimeout(this._chronoSignalMinuterie);
    this._chronoSignalMinuterie = setTimeout(() => {
      for (const f of this.app.workspace.getLeavesOfType(TYPE_VUE_CHRONOLOGIE)) {
        try { if (f.view && f.view.rafraichir) f.view.rafraichir(); } catch (e) { /* vue fermée */ }
      }
    }, 2000);
  }

  // Consigne un événement. Les modifications d'une même note se fondent en une
  // séance tant qu'elles se suivent à moins d'une demi-heure.
  async chronoNoter(e) {
    if (!this.settings.chronoActif) return;
    // Journal activé après le démarrage : il commence ici, sans quoi la
    // reconstitution doublerait ses premiers événements.
    if (!this.settings.chronoDepuis) {
      this.settings.chronoDepuis = e.t;
      this.saveSettings().catch(() => {});
    }
    const jour = jourIsoDe(new Date(e.t));
    const mois = jour.slice(0, 7);
    const m = await this._chronoMois(mois);
    const liste = m[jour] || (m[jour] = []);
    if (e.type === 'note-modifiee' || (e.type === 'canevas' && e.action === 'modifie')) {
      for (let k = liste.length - 1; k >= 0; k--) {
        const der = liste[k];
        if (der.type !== e.type || der.chemin !== e.chemin || der.action !== e.action) continue;
        if (e.t - (der.fin || der.t) <= 30 * 60000) {
          der.fin = e.t;
          if (e.n) der.n = (der.n || 0) + e.n;
          if (e.extrait) der.extrait = e.extrait;
          if (e.titre) der.titre = e.titre;
          this._chronoSale(mois);
          return;
        }
        break;
      }
    }
    liste.push(Object.assign({ fin: e.t }, e));
    this._chronoSale(mois);
  }

  // Dernier contenu connu du corps des notes ouvertes : c'est contre lui que
  // se mesure une modification. Quarante notes au plus.
  _chronoInstantane(chemin, corps) {
    const m = this._chronoInstantanes || (this._chronoInstantanes = new Map());
    m.delete(chemin);
    m.set(chemin, corps);
    if (m.size > 40) m.delete(m.keys().next().value);
  }

  _chronoTitreFichier(f) {
    const fm = ((this.app.metadataCache.getFileCache(f) || {}).frontmatter) || {};
    const alias = [].concat(fm.aliases || []).map(String).filter(Boolean);
    return alias[0] || f.basename;
  }

  // Écoutes : branchées une fois la disposition prête, sans quoi la création
  // de chaque fichier au chargement du coffre passerait pour une activité.
  brancherChronologie() {
    // Début du journal : avant, la chronologie se reconstitue d'après les
    // dates des fichiers ; après, elle ne lit que le journal.
    if (this.settings.chronoActif && !this.settings.chronoDepuis) {
      this.settings.chronoDepuis = Date.now();
      this.saveSettings().catch(() => {});
    }
    // Statut de chaque tâche, pour reconnaître le passage à « terminée ».
    this._chronoStatuts = new Map();
    try {
      for (const t of this.tachesPourGantt()) this._chronoStatuts.set(t.fichier.path, t.statut);
    } catch (e) { /* tâches indisponibles */ }
    this._chronoUtilisateur = new Set();

    this.registerEvent(this.app.workspace.on('file-open', (f) => {
      if (!this.settings.chronoActif || !(f instanceof obsidian.TFile) || f.extension !== 'md') return;
      this.app.vault.cachedRead(f).then((t) => {
        if (!this._chronoInstantanes || !this._chronoInstantanes.has(f.path)) {
          this._chronoInstantane(f.path, Ariane.corpsSansEntete(t));
        }
      }).catch(() => {});
    }));

    this.registerEvent(this.app.vault.on('create', (f) => {
      if (!this.settings.chronoActif || !(f instanceof obsidian.TFile)) return;
      if (this.ecritePlugin(f.path)) return;
      const g = Ariane.genreChrono(f.path, f.extension, this._chronoCfg());
      if (!g) return;
      const t = Date.now();
      // Le contenu d'une capture arrive souvent juste après sa création
      // (un greffon crée, puis écrit) : on le lit un peu plus tard.
      setTimeout(async () => {
        let texte = '';
        if (f.extension === 'md') {
          try { texte = await this.app.vault.read(f); } catch (e) { return; /* déjà supprimé */ }
          this._chronoInstantane(f.path, Ariane.corpsSansEntete(texte));
        }
        const base = { t, chemin: f.path, titre: f.extension === 'md' ? this._chronoTitreFichier(f) : f.basename };
        if (g.genre === 'capture') {
          await this.chronoNoter(Object.assign(base, { type: 'capture', source: g.source.nom,
            icone: g.source.icone, extrait: Ariane.extraitDebut(texte) }));
        } else if (g.genre === 'canevas') {
          await this.chronoNoter(Object.assign(base, { type: 'canevas', action: 'cree' }));
        } else {
          await this.chronoNoter(Object.assign(base, { type: 'note-creee',
            extrait: Ariane.extraitDebut(texte) }));
        }
      }, 3000);
    }));

    this.registerEvent(this.app.vault.on('modify', (f) => {
      if (!this.settings.chronoActif || !(f instanceof obsidian.TFile)) return;
      const g = Ariane.genreChrono(f.path, f.extension, this._chronoCfg());
      // Une capture se met à jour par sa propre synchronisation : ce n'est
      // pas une activité.
      if (!g || g.genre === 'capture') return;
      if (!this.ecritePlugin(f.path)) this._chronoUtilisateur.add(f.path);
      this.antirebond('chrono:' + f.path, () => this._chronoModification(f, g), 4000);
    }));

    this.registerEvent(this.app.vault.on('rename', (f, ancien) => {
      const m = this._chronoInstantanes;
      if (m && m.has(ancien)) { m.set(f.path, m.get(ancien)); m.delete(ancien); }
      if (this._chronoStatuts && this._chronoStatuts.has(ancien)) {
        this._chronoStatuts.set(f.path, this._chronoStatuts.get(ancien));
        this._chronoStatuts.delete(ancien);
      }
    }));

    this.registerEvent(this.app.metadataCache.on('changed', (f, _d, cache) => {
      if (!this.settings.chronoActif || !f || !this.refDeChemin(f.path)) return;
      const fm = (cache && cache.frontmatter) || {};
      const statut = String(this._lireT(fm, 'statut') || 'à faire');
      const avant = this._chronoStatuts.get(f.path);
      this._chronoStatuts.set(f.path, statut);
      if (avant === undefined || avant === statut) return;
      if (statut !== 'terminée' && statut !== 'abandonnée') return;
      const cleRaison = Object.keys(fm).find((k) => /^(raison|motif)/i.test(k));
      const alias = [].concat(fm.aliases || []).map(String).filter(Boolean);
      this.chronoNoter({
        t: Date.now(), chemin: f.path, titre: alias[0] || f.basename,
        type: statut === 'terminée' ? 'tache-terminee' : 'tache-abandonnee',
        de: avant, vers: statut,
        raison: cleRaison ? String(fm[cleRaison] || '').trim() : '',
      }).catch((e) => console.error('[Ariane] chronologie', e));
    }));
  }

  // Une modification retombée : on relit, on compare au dernier état connu.
  async _chronoModification(f, g) {
    const parUtilisateur = this._chronoUtilisateur.delete(f.path);
    if (g.genre === 'canevas' && f.extension !== 'md') {
      if (parUtilisateur) await this.chronoNoter({ t: Date.now(), chemin: f.path, titre: f.basename, type: 'canevas', action: 'modifie' });
      return;
    }
    let texte;
    try { texte = await this.app.vault.read(f); } catch (e) { return; }
    const corps = Ariane.corpsSansEntete(texte);
    const avant = this._chronoInstantanes ? this._chronoInstantanes.get(f.path) : undefined;
    this._chronoInstantane(f.path, corps);
    if (!parUtilisateur) return;
    const titre = this._chronoTitreFichier(f);
    const type = g.genre === 'canevas' ? 'canevas' : 'note-modifiee';
    const action = g.genre === 'canevas' ? 'modifie' : undefined;
    if (avant === undefined) {
      // Note jamais ouverte ici (synchronisation, éditeur externe) : on sait
      // qu'elle a changé, pas ce qui a changé.
      await this.chronoNoter({ t: Date.now(), chemin: f.path, titre, type, action });
      return;
    }
    const d = Ariane.extraitModification(avant, corps);
    if (!d) return;
    await this.chronoNoter({ t: Date.now(), chemin: f.path, titre, type, action, n: d.n, extrait: d.extrait });
  }

  // Événements de [d0, d1[ (ms) : le journal, plus, pour ce qui précède le
  // journal, une reconstitution d'après les dates des fichiers (création,
  // dernière modification, achèvement des tâches). Ces événements reconstitués
  // portent `approx: true` : sans heure sûre ni extrait de modification.
  async evenementsChronologie(d0, d1) {
    const out = [];
    const j0 = jourIsoDe(new Date(d0));
    const j1 = jourIsoDe(new Date(d1 - 1));
    for (let m = j0.slice(0, 7); m <= j1.slice(0, 7);) {
      const o = await this._chronoMois(m);
      for (const jour of Object.keys(o)) {
        if (jour < j0 || jour > j1) continue;
        for (const e of (o[jour] || [])) if (e.t >= d0 && e.t < d1) out.push(Object.assign({}, e));
      }
      const [a, mm] = [Number(m.slice(0, 4)), Number(m.slice(5, 7))];
      m = mm === 12 ? (a + 1) + '-01' : a + '-' + String(mm + 1).padStart(2, '0');
    }
    const depuis = Number(this.settings.chronoDepuis) || Date.now();
    const borne = Math.min(d1, depuis);
    if (d0 < borne) out.push(...this._chronoReconstituer(d0, borne));
    out.push(...(await this._chronoActiviteExterne(j0, j1)));
    return out.sort((a, b) => b.t - a.t);
  }

  // L'activité hors d'Obsidian (créneaux d'ActivityWatch, avec leur résumé
  // et leur catégorie d'IA, leurs rattachements) comme événements de la
  // chronologie. Quatre-vingt-dix jours au plus : chaque jour est une
  // requête au serveur d'ActivityWatch.
  async _chronoActiviteExterne(j0, j1) {
    if (!this.activiteDisponible || !this.activiteDisponible()) return [];
    const auj = jourIsoDe(new Date());
    const plancher = Ariane.decalerJour(auj, -90);
    const jours = [];
    for (let j = j0 > plancher ? j0 : plancher; j <= j1 && j <= auj; j = Ariane.decalerJour(j, 1)) jours.push(j);
    if (!jours.length) return [];
    let parJour;
    try { parJour = await this.activitePlage(jours); } catch (e) { return []; }
    const out = [];
    for (const [jour, blocs] of parJour) {
      for (const b of (blocs || [])) {
        out.push({ t: new Date(b.debut).getTime(), type: 'activite', chemin: '', jour, bloc: b,
          titre: (b.ia && b.ia.resume) || b.categorie });
      }
    }
    return out;
  }

  _chronoReconstituer(d0, d1) {
    const out = [];
    const cfg = this._chronoCfg();
    const taches = new Set();
    try {
      for (const t of this.tachesPourGantt()) {
        taches.add(t.fichier.path);
        const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
        const mt = t.fichier.stat.mtime;
        let quand = null;
        let approx = true;
        if (t.statut === 'terminée') {
          const j = Ariane.jourValide(String(this._lireT(fm, 'termine-le') || '').slice(0, 10));
          if (j) {
            if (jourIsoDe(new Date(mt)) === j) { quand = mt; } else { quand = new Date(j + 'T12:00:00').getTime(); approx = 'jour'; }
          }
        } else if (t.statut === 'abandonnée') {
          quand = mt;
        }
        if (quand === null || quand < d0 || quand >= d1) continue;
        out.push({ t: quand, fin: quand, chemin: t.fichier.path, titre: t.intitule, approx,
          type: t.statut === 'terminée' ? 'tache-terminee' : 'tache-abandonnee', vers: t.statut });
      }
    } catch (e) { /* tâches indisponibles */ }
    for (const f of this.app.vault.getFiles()) {
      const g = Ariane.genreChrono(f.path, f.extension, cfg);
      if (!g) continue;
      const { ctime, mtime } = f.stat;
      const titre = f.extension === 'md' ? this._chronoTitreFichier(f) : f.basename;
      if (ctime >= d0 && ctime < d1) {
        const e = { t: ctime, fin: ctime, chemin: f.path, titre, approx: true };
        if (g.genre === 'capture') Object.assign(e, { type: 'capture', source: g.source.nom, icone: g.source.icone });
        else if (g.genre === 'canevas') Object.assign(e, { type: 'canevas', action: 'cree' });
        else Object.assign(e, { type: 'note-creee' });
        out.push(e);
      }
      // Dernière modification seulement : l'historique n'existait pas.
      if (g.genre !== 'capture' && !taches.has(f.path) && mtime >= d0 && mtime < d1 && mtime - ctime > 120000) {
        out.push({ t: mtime, fin: mtime, chemin: f.path, titre, approx: true,
          type: g.genre === 'canevas' ? 'canevas' : 'note-modifiee',
          action: g.genre === 'canevas' ? 'modifie' : undefined });
      }
    }
    return out;
  }

  // Au démarrage : une chronologie restée dans un onglet (avant qu'elle ne
  // passe dans la barre latérale) est ramenée à droite, sans prendre le focus.
  async rangerChronologie() {
    const ws = this.app.workspace;
    const ailleurs = ws.getLeavesOfType(TYPE_VUE_CHRONOLOGIE).filter((f) => !(f.getRoot && f.getRoot() === ws.rightSplit));
    if (!ailleurs.length) return;
    const etat = ailleurs[0].getViewState().state;
    for (const f of ailleurs) f.detach();
    if (ws.getLeavesOfType(TYPE_VUE_CHRONOLOGIE).length) return;
    const feuille = ws.getRightLeaf(false);
    if (feuille) await feuille.setViewState({ type: TYPE_VUE_CHRONOLOGIE, active: false, state: etat });
  }

  async ouvrirChronologie() {
    // La chronologie vit dans la barre latérale droite, comme le plan ou les
    // rétroliens : une chronologie ouverte ailleurs (ancien onglet) y est
    // ramenée.
    const ws = this.app.workspace;
    const ex = ws.getLeavesOfType(TYPE_VUE_CHRONOLOGIE);
    const aDroite = ex.find((f) => f.getRoot && f.getRoot() === ws.rightSplit);
    for (const f of ex) if (f !== aDroite) f.detach();
    if (aDroite) { ws.revealLeaf(aDroite); return; }
    const feuille = ws.getRightLeaf(false);
    await feuille.setViewState({ type: TYPE_VUE_CHRONOLOGIE, active: true });
    ws.revealLeaf(feuille);
  }

  //#endregion Ariane · chronologie (journal & lecture)

  //#region Ariane · chronologie (analyses)
  // ── analyses : la colonne latérale de la chronologie ─────────────────────
  //  Une seule lecture par période réunit, jour par jour, le rail du temps
  //  réel (Obsidian, hors Obsidian, personnel, sans double compte), les
  //  catégories, les tâches, les créneaux prévus et ce qui y a été fait. Les
  //  visualisations de la colonne latérale (temps, catégories, tâches, prévu
  //  et réalisé, rythmes) en sont des lectures croisées.

  // L'état d'un créneau révolu d'après la part faite : la même échelle pour
  // le bilan du soir et pour la rubrique « Prévu et réalisé ».
  static etatCreneau(fait, prevu) {
    if (!(fait > 0)) return 'rien';
    const part = prevu ? fait / prevu : 1;
    return part >= 0.8 ? 'tenu' : part >= 0.3 ? 'partie' : 'entame';
  }

  // Les plages de travail continues d'un rail (minutes du jour), les pauses
  // de moins de `pause` minutes ne coupant pas : { n, moyenne, longue }.
  static plagesTravail(rails, pause) {
    const p = Number(pause) >= 0 ? Number(pause) : 5;
    const durees = [];
    for (const rail of (rails || [])) {
      const segs = rail.filter((x) => x.genre !== 'personnel').map((x) => [x.a, x.b]).sort((x, y) => x[0] - y[0]);
      let cour = null;
      for (const [a, b] of segs) {
        if (cour && a - cour[1] <= p) { cour[1] = Math.max(cour[1], b); continue; }
        if (cour) durees.push(cour[1] - cour[0]);
        cour = [a, b];
      }
      if (cour) durees.push(cour[1] - cour[0]);
    }
    const utiles = durees.filter((d) => d >= 5);
    return { n: utiles.length, moyenne: utiles.length ? utiles.reduce((s, d) => s + d, 0) / utiles.length : 0,
      longue: utiles.length ? Math.max(...utiles) : 0 };
  }

  // Minutes de travail (hors personnel) par jour de semaine (0 = lundi) et
  // par heure : une grille 7 × 24.
  static grilleRythmes(jours) {
    const g = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const j of (jours || [])) {
      const js = (new Date(j.jour + 'T12:00:00').getDay() + 6) % 7;
      for (const x of j.rail) {
        if (x.genre === 'personnel') continue;
        for (let h = Math.floor(x.a / 60); h * 60 < x.b && h < 24; h++) {
          g[js][h] += Math.max(0, Math.min(x.b, (h + 1) * 60) - Math.max(x.a, h * 60));
        }
      }
    }
    return g;
  }

  // La concentration d'une période : les micro-interruptions (dont
  // l'iPhone), leur nombre par heure de travail, ce qui distrait le plus, et
  // les plages de concentration (coupées à chaque interruption).
  static syntheseConcentration(jours) {
    const micro = [];
    let travail = 0;
    let plages = 0;
    let cumul = 0;
    let longue = 0;
    for (const j of (jours || [])) {
      micro.push(...(j.micro || []));
      travail += (j.obsidian || 0) + (j.externe || 0);
      const p = Ariane.plagesConcentration(j.rail, j.micro);
      plages += p.n;
      cumul += p.n * p.moyenne;
      longue = Math.max(longue, p.longue);
    }
    const n = micro.length;
    return {
      n, iphone: micro.filter((m) => m.source === 'iphone').length,
      parHeure: travail >= 30 ? n / (travail / 60) : 0,
      principales: Ariane.principalesDistractions(micro, 5),
      moyenne: plages ? cumul / plages : 0,
      longue,
    };
  }

  async analyseChronologie(debut, fin) {
    const auj = jourIsoDe(new Date());
    const jours = [];
    for (let j = debut; j < fin && j <= auj; j = Ariane.decalerJour(j, 1)) jours.push(j);
    const taches = this.tachesPourGantt();
    const parRef = new Map(taches.map((t) => [t.ref, t]));
    const refsDeChemin = new Map();
    const cheminsDe = new Map();
    for (const t of taches) {
      if (!t.fichier) continue;
      const ch = [t.fichier.path].concat(this._cheminsLiesTache(t));
      cheminsDe.set(t.ref, ch);
      for (const c of ch) if (!refsDeChemin.has(c)) refsDeChemin.set(c, t.ref);
    }
    const sessions = this.sessionsTravail ? this.sessionsTravail() : [];
    // Hors Obsidian : quatre-vingt-dix jours au plus, comme le fil.
    let blocs = new Map();
    const plancher = Ariane.decalerJour(auj, -90);
    if (this.activiteDisponible && this.activiteDisponible()) {
      try { blocs = await this.activitePlage(jours.filter((j) => j >= plancher)); } catch (e) { blocs = new Map(); }
    }
    const minutesDe = (iso, jour) => (String(iso).slice(0, 10) < jour ? 0
      : String(iso).slice(0, 10) > jour ? 24 * 60
        : Number(String(iso).slice(11, 13)) * 60 + Number(String(iso).slice(14, 16)));
    const maintenant = Ariane.instantSession(new Date());
    const out = [];
    const cats = new Map();
    const parTache = new Map();
    const tache = (ref) => {
      if (!parTache.has(ref)) parTache.set(ref, { ref, tache: parRef.get(ref), min: 0, prevu: 0, fait: 0, parJour: {} });
      return parTache.get(ref);
    };
    for (const jour of jours) {
      const obs = Ariane.sessionsDuJour(jour, sessions, 1).map((x) => ({ a: x.a, b: x.b, ref: refsDeChemin.get(x.chemin) || '', chemin: x.chemin }));
      const ext = (blocs.get(jour) || []).map((bl) => ({ a: minutesDe(bl.debut, jour), b: minutesDe(bl.fin, jour), bloc: bl }))
        .filter((e) => e.b > e.a);
      const r = Ariane.bilanJourReel(obs, ext);
      const rail = Ariane.fusionnerRailReel(obs, ext).map((p) => {
        if (p.source === 'obsidian') {
          const t = p.item.ref && parRef.get(p.item.ref);
          return { a: p.a, b: p.b, genre: 'obsidian',
            libelle: t ? t.ref + ' ' + t.intitule : String(p.item.chemin || '').split('/').pop().replace(/\.md$/, '') };
        }
        const bl = p.item.bloc;
        const perso = !!(bl.ia && bl.ia.personnel);
        return { a: p.a, b: p.b, genre: perso ? 'personnel' : 'externe', couleur: bl.couleur || '',
          libelle: ((bl.ia && bl.ia.categorie) || bl.categorie || '') + ((bl.ia && bl.ia.resume) ? ' : ' + bl.ia.resume : '') };
      });
      // Catégories : « Obsidian » d'un côté, celles du hors Obsidian de l'autre.
      const ajouterCat = (nom, couleur, min) => {
        if (!(min > 0)) return;
        const c = cats.get(nom) || { nom, couleur, min: 0, parJour: {} };
        c.min += min;
        c.parJour[jour] = (c.parJour[jour] || 0) + min;
        cats.set(nom, c);
      };
      ajouterCat('Obsidian', 'var(--interactive-accent)', r.obsidianMin);
      for (const [nom, x] of r.parCategorie) ajouterCat(nom, x.couleur || 'var(--color-green)', x.min);
      ajouterCat('Personnel et distraction', 'var(--text-faint)', r.personnelMin);
      for (const [ref, x] of r.parTache) {
        if (!parRef.has(ref)) continue;
        const t = tache(ref);
        t.min += x.min;
        t.parJour[jour] = (t.parJour[jour] || 0) + x.min;
      }
      // Créneaux prévus ce jour et ce qui y a été fait.
      const creneaux = [];
      for (const t of taches) {
        for (const c of Ariane.creneauxDeTache([].concat(t.creneaux || []))) {
          if (c.debut.slice(0, 10) !== jour) continue;
          const prevu = Ariane.dureeCreneauMin(c.debut, c.fin);
          const avenir = c.debut > maintenant;
          const fait = avenir ? 0 : Ariane.minutesFaitesCreneau(c.debut, c.fin, sessions, cheminsDe.get(t.ref) || [], t.tempsReel);
          creneaux.push({ ref: t.ref, intitule: t.intitule, statut: t.statut, debut: c.debut, fin: c.fin, prevu, fait,
            etat: avenir ? 'avenir' : Ariane.etatCreneau(fait, prevu) });
          const x = tache(t.ref);
          x.prevu += prevu;
          x.fait += fait;
        }
      }
      creneaux.sort((a, b) => a.debut.localeCompare(b.debut));
      const d0 = new Date(jour + 'T00:00:00').getTime();
      let micro = [];
      if (jour >= plancher && this.microDuJour) { try { micro = await this.microDuJour(jour); } catch (e) { micro = []; } }
      out.push({ jour, rail, creneaux,
        micro: Ariane.microPendantTravail(micro.map((m) => Object.assign({ a: (m.deb - d0) / 60000, b: (m.fin - d0) / 60000 }, m)), rail),
        obsidian: r.obsidianMin, externe: r.externeMin, personnel: r.personnelMin });
    }
    const somme = (k) => out.reduce((s, j) => s + j[k], 0);
    return {
      jours: out,
      obsidian: somme('obsidian'), externe: somme('externe'), personnel: somme('personnel'),
      externeTronque: jours.length > 0 && jours[0] < plancher,
      categories: [...cats.values()].sort((a, b) => b.min - a.min),
      taches: [...parTache.values()].filter((x) => x.tache && (x.min >= 1 || x.prevu > 0)).sort((a, b) => (b.min - a.min) || (b.prevu - a.prevu)),
      rythmes: Ariane.grilleRythmes(out),
      plages: Ariane.plagesTravail(out.map((j) => j.rail)),
      concentration: Ariane.syntheseConcentration(out),
    };
  }

  //#endregion Ariane · chronologie (analyses)
};

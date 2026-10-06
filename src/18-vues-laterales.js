//#region 18 · Vues latérales (ItemView)
// ═══════════════════════════════════════════════════════════════════════════
//  18 · VUES LATÉRALES (ITEMVIEW)
//  Volets latéraux : incohérences de tâches, références en attente,
//  suggestions de voisinage local. Et la chronologie d'activité, vue d'onglet.
// ═══════════════════════════════════════════════════════════════════════════

// Ce volet ne liste que ce qu'Ariane ne peut pas trancher seule. Tout ce qui
// est déterministe est déjà fait au moment où il s'ouvre : il reste les
// contradictions, qui appellent une décision.
class VueIncoherencesTaches extends obsidian.ItemView {
  constructor(feuille, greffon) {
    super(feuille);
    this.greffon = greffon;
  }

  getViewType() { return TYPE_VUE_INCOHERENCES; }
  getDisplayText() { return tr('Incohérences des tâches'); }
  getIcon() { return 'unlink'; }

  async onOpen() {
    this.contentEl.addClass('zfa-refs');
    await this.rafraichir();
  }

  async rafraichir() {
    const c = this.contentEl;
    c.empty();
    this.greffon.recalculerIncoherences();
    this.dessiner();
  }

  bouton(parent, texte, icone, action) {
    const b = parent.createEl('button', { cls: 'zfa-ref-action' });
    if (icone) { const i = b.createSpan(); obsidian.setIcon(i, icone); }
    b.createSpan({ text: texte });
    b.onclick = (e) => { e.stopPropagation(); action(); };
    return b;
  }

  ouvrir(ref) {
    const f = this.greffon.fichierDeRef(ref);
    if (f) this.app.workspace.getLeaf(true).openFile(f);
    else new obsidian.Notice(tr('Note introuvable : ') + ref);
  }

  section(parent, titre, lignes, rendre) {
    if (!lignes.length) return 0;
    parent.createEl('h4', { cls: 'zfa-ref-titre-bloc', text: titre + ' (' + lignes.length + ')' });
    for (const l of lignes) {
      const d = parent.createDiv({ cls: 'zfa-ref' });
      rendre(d, l);
    }
    return lignes.length;
  }

  dessiner() {
    const c = this.contentEl;
    c.empty();
    const etat = this.greffon._incoherencesTaches
      || { cycles: [], dates: [], conflits: [], morts: [] };

    const barre = c.createDiv({ cls: 'zfa-refs-barre' });
    this.bouton(barre, tr('Recalculer'), 'refresh-cw', () => this.rafraichir());

    let total = 0;

    total += this.section(c, tr('Cycles'), etat.cycles, (d, cycle) => {
      d.createDiv({ cls: 'zfa-ref-nom', text: cycle.join('  →  ') });
      d.createDiv({
        cls: 'zfa-ref-faible',
        text: tr("Ces tâches se bloquent en rond : aucune ne peut commencer. Retirez une flèche du cercle."),
      });
      const actes = d.createDiv({ cls: 'zfa-ref-actions' });
      for (const ref of [...new Set(cycle)]) {
        this.bouton(actes, ref, 'file-text', () => this.ouvrir(ref));
      }
    });

    total += this.section(c, tr('Dates contredites'), etat.dates, (d, i) => {
      d.createDiv({ cls: 'zfa-ref-nom', text: i.de + '  →  ' + i.vers });
      d.createDiv({
        cls: 'zfa-ref-faible',
        text: i.vers + ' ' + tr('commence le') + ' ' + i.debut + ', ' + tr('alors que')
          + ' ' + i.de + ' ' + tr("ne s'achève que le") + ' ' + i.fin + '.',
      });
      const actes = d.createDiv({ cls: 'zfa-ref-actions' });
      this.bouton(actes, i.de, 'file-text', () => this.ouvrir(i.de));
      this.bouton(actes, i.vers, 'file-text', () => this.ouvrir(i.vers));
    });

    total += this.section(c, tr('Parents concurrents'), etat.conflits, (d, x) => {
      d.createDiv({ cls: 'zfa-ref-nom', text: x.ref });
      d.createDiv({
        cls: 'zfa-ref-faible',
        text: tr('Deux canvas lui donnent des parents différents :') + ' ' + x.parents.join(', ')
          + '. ' + tr('Le premier dans l ordre alphabétique est retenu, en attendant que vous tranchiez.'),
      });
      const actes = d.createDiv({ cls: 'zfa-ref-actions' });
      this.bouton(actes, x.ref, 'file-text', () => this.ouvrir(x.ref));
      for (const p of x.parents) this.bouton(actes, p, 'file-text', () => this.ouvrir(p));
    });

    total += this.section(c, tr('Liens morts'), etat.morts, (d, ref) => {
      d.createDiv({ cls: 'zfa-ref-nom', text: ref });
      d.createDiv({
        cls: 'zfa-ref-faible',
        text: tr("Un canvas désigne cette tâche, mais sa note n'existe pas. Elle a pu être renommée ou supprimée ; rien n'a été effacé."),
      });
    });

    if (!total) {
      c.createDiv({ cls: 'zfa-refs-vide', text: tr('Rien à signaler : vos tâches sont cohérentes.') });
    }
  }

  async onClose() { this.contentEl.empty(); }
}

class VueReferencesAttente extends obsidian.ItemView {
  constructor(feuille, greffon) {
    super(feuille);
    this.greffon = greffon;
    this.filtre = 'tous';
    this.deplies = new Set();
    this.choisies = new Set();
  }

  getViewType() { return TYPE_VUE_REFS; }
  getDisplayText() { return tr('Références en attente'); }
  // « library » entrait en collision : icon-folder la pose déjà sur le dossier
  // « 98 - Bibliographie », celui-là même qui contient ces références. La
  // balance dit d'ailleurs mieux ce que fait ce volet.
  getIcon() { return 'scale'; }

  async onOpen() {
    this.contentEl.addClass('zfa-refs');
    await this.preparer();
  }

  // Un seul calcul à l'ouverture : résoudre 631 références à chaque clic
  // d'onglet rendrait le volet inutilisable.
  async preparer() {
    const c = this.contentEl;
    c.empty();
    c.createDiv({ cls: 'zfa-refs-vide', text: tr('Analyse des références…') });
    const g = this.greffon;
    const toutes = g.indexReferencesAttente();
    const index = g.construireIndexZotero();
    const passages = g.indexPassages();
    // Le compteur qui guide une acquisition doit porter sur l'ŒUVRE, pas sur le
    // libellé : deux libellés d'un même article diluent le signal, et un libellé
    // qui recouvre deux ouvrages le gonfle à tort.
    const { parRef, parOeuvre } = await g.indexOeuvres(passages);
    this.parOeuvre = parOeuvre;

    this.lignes = [];
    for (const r of toutes) {
      const ref = parseNomReference(r.nom, g.settings);
      const candidats = ref ? candidatsSource(ref, index).map((x) => x.entree) : [];
      const auto = ref ? trouverSourceZotero(ref, index) : null;
      const biblio = await g.resoudreParBibliographie(r, passages);
      const doi = r.doi || (biblio && biblio.doi) || '';
      let dansZotero = null;
      if (doi) {
        const z = index.find((x) => x.doi && x.doi === doi);
        if (z) dansZotero = z.basename;
      }
      const compte = parRef.get(r.nom) || { oeuvres: [], nonResolues: r.citations, total: r.citations };
      const l = { r, ref, candidats, auto, biblio, dansZotero, doi, verdict: null,
        oeuvres: compte.oeuvres, nonResolues: compte.nonResolues };
      // Le rang d'acquisition : la plus citée des œuvres du libellé.
      l.poids = compte.oeuvres.length
        ? Math.max.apply(null, compte.oeuvres.map((o) => o.n))
        : compte.total;
      l.etat = this.classer(l);
      this.lignes.push(l);
    }
    this.lignes.sort((a, b) => b.poids - a.poids || a.r.nom.localeCompare(b.r.nom));
    this.rendre();
  }

  rendre() {
    const c = this.contentEl;
    c.empty();
    const lignes = this.lignes || [];

    const compte = (e) => lignes.filter((l) => l.etat === e).length;
    // Cinq onglets, et chacun dit ce qu'il y a à faire. Les états que le greffon
    // règle seul, détachement et fusion, n'ont plus d'onglet : ils ne demandent
    // rien.
    const onglets = [
      ['tous', tr('Toutes'), lignes.length],
      ['rattachable', tr('À rattacher'), compte('rattachable')],
      ['identifiee', tr('À acquérir'), compte('identifiee')],
      ['inconnue', tr('Non résolues'), compte('inconnue')],
      ['ecartee', tr('Mises de côté'), compte('ecartee') + compte('fusionnee')],
    ];
    const barre = c.createDiv({ cls: 'zfa-refs-barre' });
    for (const [cle, nom, n] of onglets) {
      const b = barre.createEl('button', { cls: 'zfa-refs-onglet', text: nom + ' (' + n + ')' });
      if (this.filtre === cle) b.addClass('zfa-refs-actif');
      b.onclick = () => { this.filtre = cle; this.rendre(); };
    }
    const outils = c.createDiv({ cls: 'zfa-refs-outils' });
    const bMaj = outils.createEl('button', { text: tr('Récupérer les bibliographies') });
    bMaj.onclick = async () => { await this.greffon.rafraichirBibliographies(false); await this.preparer(); };
    const bRe = outils.createEl('button', { text: tr('Recalculer') });
    bRe.onclick = () => this.preparer();
    if (this.enCours) {
      const bStop = outils.createEl('button', { cls: 'mod-warning', text: tr('Arrêter le lot') });
      bStop.onclick = () => { this.enCours = false; };
    }

    const visibles = lignes.filter((l) => this.filtre === 'tous' || l.etat === this.filtre);
    this.rendreSelection(c, visibles);

    const corps = c.createDiv({ cls: 'zfa-refs-liste' });
    if (!visibles.length) {
      corps.createDiv({ cls: 'zfa-refs-vide', text: tr('Rien dans cette catégorie.') });
      return;
    }
    for (const l of visibles) this.rendreLigne(corps, l);
  }

  // Recalcule une seule ligne après une action, plutôt que de refaire les 631.
  async rafraichirLigne(l) {
    const g = this.greffon;
    const index = g.construireIndexZotero();
    const toutes = g.indexReferencesAttente();
    const r = toutes.find((x) => x.nom === l.r.nom);
    if (!r) { // la note a disparu : la ligne aussi
      this.lignes = (this.lignes || []).filter((x) => x !== l);
      this.rendre();
      return;
    }
    l.r = r;
    l.ref = parseNomReference(r.nom, g.settings);
    l.candidats = l.ref ? candidatsSource(l.ref, index).map((x) => x.entree) : [];
    l.auto = l.ref ? trouverSourceZotero(l.ref, index) : null;
    l.biblio = await g.resoudreParBibliographie(r);
    l.doi = r.doi || (l.biblio && l.biblio.doi) || '';
    const z = l.doi ? index.find((x) => x.doi && x.doi === l.doi) : null;
    l.dansZotero = z ? z.basename : null;
    l.etat = this.classer(l);
    this.rendre();
  }

  classer(l) {
    if (l.r.etat === 'fusionnée') return 'fusionnee';
    if (l.r.etat === 'écartée') return 'ecartee';
    if (l.r.etat === 'à acquérir') return 'acquerir';
    if (l.auto || l.dansZotero) return 'rattachable';
    if (l.doi || (l.oeuvres || []).length || (l.biblio && l.biblio.titre)) return 'identifiee';
    return 'inconnue';
  }

  bouton(parent, texte, icone, action, cta) {
    const b = parent.createEl('button', { cls: 'zfa-ref-action' + (cta ? ' mod-cta' : '') });
    if (icone) { const i = b.createSpan(); obsidian.setIcon(i, icone); }
    b.createSpan({ text: texte });
    b.onclick = (e) => { e.stopPropagation(); action(); };
    return b;
  }

  // Sélection multiple : les gestes d'arbitrage sont longs et répétitifs, les
  // enchaîner un par un n'a pas de sens sur six cents références.
  rendreSelection(c, visibles) {
    const g = this.greffon;
    const choisies = visibles.filter((l) => this.choisies.has(l.r.nom));
    const barre = c.createDiv({ cls: 'zfa-refs-selection' });

    const tout = barre.createEl('input', { type: 'checkbox', cls: 'zfa-ref-coche' });
    tout.checked = visibles.length > 0 && choisies.length === visibles.length;
    tout.indeterminate = choisies.length > 0 && choisies.length < visibles.length;
    tout.onclick = () => {
      if (tout.checked) for (const l of visibles) this.choisies.add(l.r.nom);
      else for (const l of visibles) this.choisies.delete(l.r.nom);
      this.rendre();
    };
    barre.createSpan({ cls: 'zfa-ref-faible',
      text: choisies.length
        ? choisies.length + ' / ' + visibles.length + ' ' + tr('sélectionnée(s)')
        : tr('Tout sélectionner dans cet onglet') });
    if (!choisies.length) return;

    // Le geste principal du lot : aller chercher chez Crossref auteurs, revue et
    // éditeur pour tout ce qui porte un DOI.
    const avecDoi = choisies.filter((l) => l.doi && !l.r.complete);
    if (avecDoi.length) {
      this.bouton(barre, tr('Compléter') + ' (' + avecDoi.length + ')', 'download-cloud',
        () => this.enLot(avecDoi, tr('Complétion'), async (l) => {
          const ok = await g.completerReference(l.r, l.doi);
          await new Promise((r) => setTimeout(r, 300));
          return ok;
        }), true);
    }
    const rattachables = choisies.filter((l) => l.dansZotero || l.auto);
    if (rattachables.length) {
      this.bouton(barre, tr('Rattacher') + ' (' + rattachables.length + ')', 'link',
        () => this.enLot(rattachables, tr('Rattachement'), async (l) => {
          await g.rattacherReference(l.r, l.dansZotero || l.auto);
          return true;
        }), true);
    }
    this.bouton(barre, tr('À acquérir'), 'shopping-cart',
      () => this.enLot(choisies, tr('Marquage'), async (l) => {
        await g.marquerReference(l.r, 'à acquérir'); return true;
      }));
    this.bouton(barre, tr('Écarter'), 'eye-off',
      () => this.enLot(choisies, tr('Marquage'), async (l) => {
        await g.marquerReference(l.r, 'écartée'); return true;
      }));
    this.bouton(barre, tr('Désélectionner'), 'x', () => { this.choisies.clear(); this.rendre(); });
  }

  // Un lot avance visiblement et s'interrompt : l'arbitrage prend plusieurs
  // secondes par référence, personne ne doit rester devant une fenêtre figée.
  async enLot(lignes, intitule, action) {
    if (this.enCours) { new obsidian.Notice(tr('Un traitement est déjà en cours.')); return; }
    this.enCours = true;
    const avis = new obsidian.Notice(intitule + ' : 0 / ' + lignes.length, 0);
    let n = 0, ok = 0;
    for (const l of lignes) {
      if (!this.enCours) break;
      try { if (await action(l)) ok += 1; } catch (e) { console.error('[Ariane] lot', e); }
      n += 1;
      avis.setMessage(intitule + ' : ' + n + ' / ' + lignes.length + '  (' + ok + ' ' + tr('aboutis') + ')');
    }
    this.enCours = false;
    avis.hide();
    new obsidian.Notice(intitule + ' — ' + ok + ' / ' + n + ' ' + tr('aboutis') + '.');
    // Les marquages changent l'état lu dans les notes : on recharge.
    await this.preparer();
  }

  rendreLigne(parent, l) {
    const g = this.greffon;
    const el = parent.createDiv({ cls: 'zfa-ref zfa-ref-' + l.etat + '-etat' });
    const ouvert = this.deplies.has(l.r.nom);

    /* ------------------------------ La ligne ------------------------------ */
    const tete = el.createDiv({ cls: 'zfa-ref-tete' });
    const coche = tete.createEl('input', { type: 'checkbox', cls: 'zfa-ref-coche' });
    coche.checked = this.choisies.has(l.r.nom);
    coche.onclick = (e) => {
      e.stopPropagation();
      if (coche.checked) this.choisies.add(l.r.nom); else this.choisies.delete(l.r.nom);
      this.rendre();
    };
    tete.createSpan({ cls: 'zfa-ref-chevron', text: ouvert ? '▾' : '▸' });
    tete.createSpan({ cls: 'zfa-ref-nom', text: l.r.nom });
    const resume = l.r.titre || (l.biblio && l.biblio.titre) || '';
    if (resume) tete.createSpan({ cls: 'zfa-ref-resume', text: resume });
    tete.createSpan({ cls: 'zfa-ref-compteur', text: (l.poids || 0) + '×' });
    if (l.r.etat) tete.createSpan({ cls: 'zfa-ref-etiquette', text: l.r.etat });
    tete.onclick = () => {
      if (ouvert) this.deplies.delete(l.r.nom); else this.deplies.add(l.r.nom);
      this.rendre();
    };
    if (!ouvert) return;

    const d = el.createDiv({ cls: 'zfa-ref-detail' });

    /* --------------------------- 1. Ce que c'est -------------------------- */
    const ident = d.createDiv({ cls: 'zfa-ref-section' });
    ident.createDiv({ cls: 'zfa-ref-num', text: tr('Identification') });
    const cible = l.dansZotero || l.auto;
    const oeuvres = l.oeuvres || [];

    if (cible) {
      const e = g.construireIndexZotero().find((x) => x.basename === cible);
      ident.createDiv({ cls: 'zfa-ref-fort', text: e && e.titre ? e.titre : cible });
      ident.createDiv({ cls: 'zfa-ref-faible', text: tr('Déjà dans votre Zotero : ') + cible });
    } else if (oeuvres.length > 1) {
      ident.createDiv({ cls: 'zfa-ref-fort',
        text: tr('Ce libellé recouvre ') + oeuvres.length + tr(' travaux différents.') });
      for (const o of oeuvres) {
        const li = ident.createDiv({ cls: 'zfa-ref-oeuvre' });
        const t = li.createDiv({ cls: 'zfa-ref-texte' });
        t.createSpan({ cls: 'zfa-ref-compteur', text: o.n + '×  ' });
        t.createSpan({ text: o.titre || o.doi });
        li.createDiv({ cls: 'zfa-ref-faible', text: o.sources.join(', ') });
        if (o.doi) this.ligneDoi(li, o.doi);
      }
    } else if (oeuvres.length === 1) {
      ident.createDiv({ cls: 'zfa-ref-fort', text: oeuvres[0].titre || oeuvres[0].doi });
      if (oeuvres[0].doi) this.ligneDoi(ident, oeuvres[0].doi);
      ident.createDiv({ cls: 'zfa-ref-faible',
        text: oeuvres[0].n + tr(' citation(s), d’après la bibliographie de ') + oeuvres[0].sources.join(', ') });
    } else if (l.r.titre) {
      ident.createDiv({ cls: 'zfa-ref-fort', text: l.r.titre });
      if (l.r.doi) this.ligneDoi(ident, l.r.doi);
    } else {
      ident.createDiv({ cls: 'zfa-ref-faible',
        text: tr('Non identifiée : aucune bibliographie de source citante ne la mentionne.') });
    }

    /* ----------------------- 2. Sur quoi je me fonde ---------------------- */
    const preuve = d.createDiv({ cls: 'zfa-ref-section' });
    preuve.createDiv({ cls: 'zfa-ref-num',
      text: tr('Sources citantes') + '  ·  ' + l.r.sources.length + ' ' + tr('source(s)') });
    const parSource = new Map();
    for (const p of (l.biblio && l.biblio.parSource) || []) parSource.set(p.source, p);
    if (!l.r.sources.length) {
      preuve.createDiv({ cls: 'zfa-ref-faible', text: tr('Aucune source identifiée.') });
    }
    for (const [src, n] of l.r.sources.slice(0, 8)) {
      const ls = preuve.createDiv({ cls: 'zfa-ref-source' });
      const ent = ls.createDiv({ cls: 'zfa-ref-source-tete' });
      ent.createSpan({ cls: 'zfa-ref-source-nom', text: src });
      ent.createSpan({ cls: 'zfa-ref-compteur', text: n + '×' });
      const p = parSource.get(src);
      if (p) {
        const bb = ls.createDiv({ cls: 'zfa-ref-biblio' });
        bb.createDiv({ cls: 'zfa-ref-texte',
          text: (p.sur ? '' : '≈ ') + (p.retenu.titre || p.retenu.doi) });
        if (p.retenu.doi) bb.createDiv({ cls: 'zfa-ref-faible', text: p.retenu.doi });
        if (p.arbitre) {
          bb.createDiv({ cls: 'zfa-ref-arbitre',
            text: tr('Le modèle lit ici : ') + p.arbitre.oeuvre.titre });
        }
      } else {
        ls.createDiv({ cls: 'zfa-ref-faible', text: tr('Bibliographie indisponible pour cette source.') });
      }
      const bs = ls.createDiv({ cls: 'zfa-ref-barre-actions' });
      this.bouton(bs, tr('La source'), 'file-text', () => g.ouvrirNote(src));
      if (p && p.fichier) {
        this.bouton(bs, tr("L'annotation"), 'pen', () => this.app.workspace.getLeaf(true).openFile(p.fichier));
      }
      // Dernier recours : aller lire la bibliographie dans le PDF, quand ni
      // Crossref ni le texte extrait n'ont rien donné.
      this.bouton(bs, tr('Le PDF'), 'file-search', () => g.ouvrirPdfSource(src));
    }

    /* --------------------------- 3. Que faire ----------------------------- */
    const faire = d.createDiv({ cls: 'zfa-ref-section' });
    faire.createDiv({ cls: 'zfa-ref-num', text: tr('Actions') });
    const actes = faire.createDiv({ cls: 'zfa-ref-barre-actions' });

    // Une seule action mise en avant, celle que l'état appelle.
    if (cible) {
      this.bouton(actes, tr('Rattacher à cette fiche'), 'link', async () => {
        await g.rattacherReference(l.r, cible);
        this.lignes = (this.lignes || []).filter((x) => x !== l);
        this.rendre();
      }, true);
    } else if (l.doi && !l.r.complete) {
      this.bouton(actes, tr('Compléter depuis le DOI'), 'download-cloud', async () => {
        await g.completerReference(l.r, l.doi);
        await this.rafraichirLigne(l);
      }, true);
    }

    this.bouton(actes, l.r.etat === 'à acquérir' ? tr('Ne plus marquer') : tr('À acquérir'),
      'shopping-cart', () => g.marquerReference(l.r, l.r.etat === 'à acquérir' ? '' : 'à acquérir')
        .then(() => this.rafraichirLigne(l)));
    this.bouton(actes, l.r.etat === 'écartée' ? tr('Réintégrer') : tr('Écarter'),
      'eye-off', () => g.marquerReference(l.r, l.r.etat === 'écartée' ? '' : 'écartée')
        .then(() => this.rafraichirLigne(l)));
    this.bouton(actes, tr('Ouvrir la note'), 'file',
      () => this.app.workspace.getLeaf(true).openFile(l.r.fichier));

    // Les autres fiches Zotero possibles restent accessibles, sans encombrer.
    const restants = (l.candidats || []).filter((x) => x.basename !== cible);
    if (restants.length) {
      const det = faire.createEl('details', { cls: 'zfa-ref-repli' });
      det.createEl('summary', { text: restants.length + ' ' + tr('autre(s) fiche(s) Zotero possible(s)') });
      for (const cand of restants.slice(0, 5)) {
        const lc = det.createDiv({ cls: 'zfa-ref-candidat' });
        lc.createDiv({ cls: 'zfa-ref-texte', text: cand.titre || cand.basename });
        lc.createDiv({ cls: 'zfa-ref-faible', text: cand.basename });
        const bb = lc.createDiv({ cls: 'zfa-ref-barre-actions' });
        this.bouton(bb, tr('Rattacher'), 'link', async () => {
          await g.rattacherReference(l.r, cand.basename);
          this.lignes = (this.lignes || []).filter((x) => x !== l);
          this.rendre();
        });
        this.bouton(bb, tr('Voir la fiche'), 'file-text', () => g.ouvrirNote(cand.basename));
      }
    }
  }

  // Le verdict d'ensemble : les sources arbitrées désignent-elles la même œuvre ?


  ligneDoi(parent, doi) {
    const el = parent.createDiv({ cls: 'zfa-ref-doi' });
    el.createSpan({ text: doi });
    const c = el.createEl('button', { cls: 'zfa-ref-mini', text: tr('Copier') });
    c.onclick = () => { navigator.clipboard.writeText(doi); new obsidian.Notice(tr('Copié : ') + doi); };
    const o = el.createEl('button', { cls: 'zfa-ref-mini', text: tr('Ouvrir') });
    o.onclick = () => window.open('https://doi.org/' + doi);
  }

  async onClose() { this.contentEl.empty(); }
}

class VueSuggestionsZotflow extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() { return 'zfa-suggestions'; }
  getDisplayText() { return tr('Suggestions (Ariane)'); }
  getIcon() { return 'sparkles'; }

  async onOpen() {
    const c = this.contentEl;
    c.empty();
    c.addClass('zfa-sugg');
    const entete = c.createDiv({ cls: 'zfa-sugg-entete' });
    entete.createSpan({ cls: 'zfa-sugg-titre', text: tr('Suggestions') });
    const rafr = entete.createEl('button', { cls: 'zfa-sugg-refresh', text: tr('⟳') });
    rafr.setAttribute('aria-label', tr('Rafraîchir les suggestions (sans modèle de langue)'));
    rafr.onclick = () => this.plugin.majSuggestions(false, true);
    // Le reclassement par modèle de langue est le poste le plus lourd de tout
    // le greffon. Il ne part plus tout seul : il attend ce bouton.
    this.affiner = entete.createEl('button', { cls: 'zfa-sugg-refresh', text: tr('✨') });
    this.affiner.setAttribute('aria-label', tr('Affiner par le modèle de langue'));
    this.affiner.onclick = () => this.plugin.majSuggestions(true, true);
    this.pause = entete.createEl('button', { cls: 'zfa-sugg-refresh' });
    this.majBoutonPause();
    this.pause.onclick = async () => {
      this.plugin.settings.suggActif = !this.plugin.settings.suggActif;
      await this.plugin.saveSettings();
      this.majBoutonPause();
      this.plugin.majSuggestions(false, true);
    };
    this.filtres = c.createDiv({ cls: 'zfa-sugg-filtres' });
    this.construireFiltres();
    this.info = c.createDiv({ cls: 'zfa-sugg-info' });
    this.ancre = c.createDiv({ cls: 'zfa-sugg-ancre' }); this.ancre.style.display = 'none';
    this.barre = null;
    this.barreJauge = null;
    this.liste = c.createDiv({ cls: 'zfa-sugg-liste' });
    // À l'ouverture, la vue n'a pas encore ses dimensions : on passe outre le
    // test de visibilité, mais sans lancer le modèle de langue.
    this.plugin.majSuggestions(false, true);
  }

  majBoutonPause() {
    if (!this.pause) return;
    const actif = this.plugin.settings.suggActif;
    this.pause.setText(actif ? '⏸' : '▶');
    this.pause.setAttribute('aria-label',
      actif ? tr('Suspendre les suggestions') : tr('Reprendre les suggestions'));
  }

  // Cases à cocher : un type de note par dossier candidat.
  construireFiltres() {
    if (!this.filtres) return;
    this.filtres.empty();
    const s = this.plugin.settings;
    const dossiers = this.plugin.dossiersSuggeres();
    if (dossiers.length < 2) { this.filtres.style.display = 'none'; return; }
    this.filtres.style.display = '';

    for (const dossier of dossiers) {
      const masque = (s.suggDossiersMasques || []).includes(dossier);
      const et = this.filtres.createEl('label', { cls: 'zfa-sugg-filtre' });
      const cb = et.createEl('input', { type: 'checkbox' });
      cb.checked = !masque;
      // Étiquette : le nom que l'utilisateur a donné à la famille, à défaut
      // le nom du dossier débarrassé de son numéro.
      const fam = this.plugin.familles().find((x) => x.dossiers.includes(dossier));
      et.createSpan({ text: (fam && fam.nom) || dossier.replace(/^\d+\s*-\s*/, '').split('/').pop() });
      et.setAttribute('aria-label', dossier);
      cb.onchange = async () => {
        const masques = new Set(s.suggDossiersMasques || []);
        if (cb.checked) masques.delete(dossier); else masques.add(dossier);
        s.suggDossiersMasques = [...masques];
        await this.plugin.saveSettings();
        this.plugin.majSuggestions(false, true);
      };
    }
  }

  montrerAncrage(texte) {
    if (!this.ancre) return;
    this.ancre.empty();
    if (!texte) { this.ancre.style.display = 'none'; return; }
    this.ancre.style.display = '';
    const snip = String(texte).replace(/\s+/g, ' ').trim();
    this.ancre.createSpan({ cls: 'zfa-sugg-ancre-txt', text: '📌 ' + snip.slice(0, 120) + (snip.length > 120 ? '…' : '') });
    const x = this.ancre.createSpan({ cls: 'zfa-sugg-ancre-x', text: tr('✕') });
    x.setAttribute('aria-label', tr("Relâcher l'argument"));
    x.onclick = () => this.plugin.libererAncrage();
  }

  marquerReclassement(actif) {
    if (this.info) this.info.toggleClass('zfa-sugg-occupe', !!actif);
    this._reclassement = !!actif;
  }

  // Affiche l'avancement de l'indexation sémantique.
  // fait === -1 signale un échec (Ollama injoignable).
  marquerIndexation(fait, total, termine) {
    if (!this.info) return;
    if (fait === -1) {
      this.info.setText(tr('Ollama injoignable — repli lexical.'));
      if (this.barre) { this.barre.remove(); this.barre = null; }
      return;
    }
    if (termine || (total && fait >= total)) {
      if (this.barre) { this.barre.remove(); this.barre = null; }
      return;
    }
    const pct = total ? Math.round((fait / total) * 100) : 0;
    this.info.setText('Indexation sémantique… ' + fait + ' / ' + total + ' (' + pct + '%)');
    if (!this.barre) {
      this.barre = this.info.insertAdjacentElement('afterend', createDiv({ cls: 'zfa-sugg-barre' }));
      this.barreJauge = this.barre.createDiv({ cls: 'zfa-sugg-jauge' });
    }
    if (this.barreJauge) this.barreJauge.style.width = pct + '%';
  }

  rendre(suggestions, file, etat) {
    if (!this.liste) return;
    this.liste.empty();
    if (this.info) {
      this.info.removeClass('zfa-sugg-occupe');
      if (etat === 'inactif') this.info.setText(tr('Suggestions désactivées dans les réglages.'));
      else if (file) this.info.setText((file.basename) + (etat ? '  ·  ' + etat : ''));
      else this.info.setText(tr('Ouvrez une note pour voir des suggestions.'));
    }
    if (!suggestions || !suggestions.length) {
      if (etat !== 'inactif') this.liste.createDiv({ cls: 'zfa-sugg-vide', text: tr('Aucune suggestion pertinente.') });
      return;
    }
    const styleDe = (d) => this.plugin.styleDuDossier(d);
    for (const sug of suggestions) {
      const item = this.liste.createDiv({ cls: 'zfa-sugg-item' });
      item.setAttribute('draggable', 'true');
      const style = sug.dossier ? styleDe(sug.dossier) : null;
      if (style && style.couleur) {
        item.addClass('zfa-sugg-colore');
        item.style.setProperty('--zfa-sugg-couleur', style.couleur);
      }
      const tete = item.createDiv({ cls: 'zfa-sugg-tete' });
      if (style && style.icone) {
        const ic = tete.createSpan({ cls: 'zfa-sugg-icone' });
        obsidian.setIcon(ic, style.icone);
        if (style.couleur) ic.style.color = style.couleur;
      }
      tete.createSpan({ cls: 'zfa-sugg-lien', text: sug.titre });
      if (sug.raison) item.createDiv({ cls: 'zfa-sugg-raison', text: sug.raison });
      const pct = typeof sug.score === 'number' ? Math.round(sug.score * 100) + '%  ·  ' : '';
      item.createDiv({ cls: 'zfa-sugg-meta', text: pct + sug.basename });
      item.addEventListener('click', () => {
        this.plugin.app.workspace.openLinkText(sug.basename, '', false);
      });
      // Aperçu natif au survol (« Page preview »).
      item.addEventListener('mouseover', (event) => {
        this.plugin.app.workspace.trigger('hover-link', {
          event,
          source: 'zfa-suggestions',
          hoverParent: this,
          targetEl: item,
          linktext: sug.path || sug.basename,
          sourcePath: '',
        });
      });
      item.addEventListener('dragstart', (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', '[[' + sug.basename + ']]');
          e.dataTransfer.effectAllowed = 'copy';
        }
      });
    }
  }

  async onClose() { this.contentEl.empty(); }
}

// Chronologie d'activité du coffre : le journal tenu par avecChronologie, jour
// par jour, avec une carte de chaleur des dix dernières semaines, les
// comptes par type et un filtre par dossier. Vue d'onglet, non latérale :
// elle se lit comme une page.
class VueChronologie extends obsidian.ItemView {
  constructor(feuille, greffon) {
    super(feuille);
    this.greffon = greffon;
    this.periode = 'semaine';
    this.ancre = jourIsoDe(new Date());
    this.filtre = 'tout';
    this.dossier = '';
    this.limite = 200;
    this._jeton = 0;
  }

  getViewType() { return TYPE_VUE_CHRONOLOGIE; }
  getDisplayText() { return tr("Chronologie d'activité"); }
  getIcon() { return 'history'; }

  getState() {
    return { periode: this.periode, ancre: this.ancre, filtre: this.filtre, dossier: this.dossier };
  }

  async setState(etat, resultat) {
    const e = etat || {};
    if (['jour', 'semaine', 'mois', 'annee'].includes(e.periode)) this.periode = e.periode;
    if (Ariane.jourValide(e.ancre)) this.ancre = e.ancre;
    if (['tout', 'notes', 'taches', 'captures', 'canevas'].includes(e.filtre)) this.filtre = e.filtre;
    if (typeof e.dossier === 'string') this.dossier = e.dossier;
    await super.setState(etat, resultat);
    this.rafraichir();
  }

  async onOpen() {
    this.contentEl.addClass('zfa-chrono');
    await this.rafraichir();
  }

  async onClose() { this._jeton++; this.contentEl.empty(); }

  // Change un critère, revient en tête de liste et redessine.
  _changer(maj) {
    Object.assign(this, maj);
    this.limite = 200;
    this.contentEl.scrollTop = 0;
    this.app.workspace.requestSaveLayout();
    this.rafraichir();
  }

  _locale() { return LANGUE === 'fr' ? 'fr-FR' : 'en-GB'; }

  _date(jour, opts) {
    return new Date(jour + 'T12:00:00').toLocaleDateString(this._locale(), opts);
  }

  _titrePeriode(b) {
    if (this.periode === 'jour') return this._date(b.debut, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (this.periode === 'mois') return this._date(b.debut, { month: 'long', year: 'numeric' });
    if (this.periode === 'annee') return b.debut.slice(0, 4);
    return tr('Semaine du ') + this._date(b.debut, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  async rafraichir() {
    const jeton = ++this._jeton;
    const auj = jourIsoDe(new Date());
    const b = Ariane.bornesPeriode(this.periode, this.ancre);
    // Une seule lecture couvre la période ET les dix semaines de la carte.
    const departChaleur = Ariane.decalerJour(Ariane.bornesPeriode('semaine', auj).debut, -63);
    const debut = b.debut < departChaleur ? b.debut : departChaleur;
    const finChaleur = Ariane.decalerJour(auj, 1);
    const fin = b.fin > finChaleur ? b.fin : finChaleur;
    let evts = [];
    try {
      evts = await this.greffon.evenementsChronologie(
        new Date(debut + 'T00:00:00').getTime(), new Date(fin + 'T00:00:00').getTime());
    } catch (e) {
      console.error('[Ariane] chronologie', e);
    }
    if (jeton !== this._jeton) return;
    this.dessiner(evts, b, auj, departChaleur);
  }

  dessiner(evts, b, auj, departChaleur) {
    const c = this.contentEl;
    // Le journal prévient la vue à chaque nouvel événement : redessiner ne
    // doit pas ramener la lecture en haut de page.
    const defil = c.scrollTop;
    c.empty();
    const grille = c.createDiv({ cls: 'zfa-chrono-grille' });
    const princ = grille.createDiv({ cls: 'zfa-chrono-principal' });
    const cote = grille.createDiv({ cls: 'zfa-chrono-cote' });
    const t0 = new Date(b.debut + 'T00:00:00').getTime();
    const t1 = new Date(b.fin + 'T00:00:00').getTime();
    const dansPeriode = evts.filter((e) => e.t >= t0 && e.t < t1);
    this._dessinerEntete(princ, b, auj);
    this._dessinerFlux(princ, Ariane.filtrerChrono(dansPeriode, this.filtre, this.dossier), auj);
    const t2 = new Date(departChaleur + 'T00:00:00').getTime();
    this._dessinerChaleur(cote, Ariane.filtrerChrono(evts.filter((e) => e.t >= t2), this.filtre, this.dossier), auj);
    this._dessinerComptes(cote, Ariane.filtrerChrono(dansPeriode, 'tout', this.dossier));
    this._dessinerDossier(cote);
    c.scrollTop = defil;
  }

  _dessinerEntete(hote, b, auj) {
    const tete = hote.createDiv({ cls: 'zfa-chrono-tete' });
    tete.createEl('h1', { cls: 'zfa-chrono-titre', text: tr("Chronologie d'activité") });
    const seg = tete.createDiv({ cls: 'zfa-chrono-seg' });
    for (const [p, l] of [['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois'], ['annee', 'Année']]) {
      const o = seg.createEl('button', { cls: 'zfa-chrono-seg-btn' + (this.periode === p ? ' is-active' : ''), text: tr(l) });
      o.onclick = () => this._changer({ periode: p });
    }

    const nav = hote.createDiv({ cls: 'zfa-chrono-nav' });
    const prec = nav.createEl('button', { cls: 'zfa-chrono-nav-btn', attr: { 'aria-label': tr('Précédent') } });
    obsidian.setIcon(prec, 'chevron-left');
    prec.onclick = () => this._changer({ ancre: Ariane.decalerPeriode(this.periode, this.ancre, -1) });
    nav.createSpan({ cls: 'zfa-chrono-periode', text: this._titrePeriode(b) });
    const suiv = nav.createEl('button', { cls: 'zfa-chrono-nav-btn', attr: { 'aria-label': tr('Suivant') } });
    obsidian.setIcon(suiv, 'chevron-right');
    suiv.disabled = b.fin > auj;
    suiv.onclick = () => this._changer({ ancre: Ariane.decalerPeriode(this.periode, this.ancre, 1) });
    if (!(auj >= b.debut && auj < b.fin)) {
      const ici = nav.createEl('button', { cls: 'zfa-chrono-nav-btn zfa-chrono-auj', text: tr("Aujourd'hui") });
      ici.onclick = () => this._changer({ ancre: auj });
    }

    const puces = hote.createDiv({ cls: 'zfa-chrono-puces' });
    for (const [f, l] of [['tout', 'Tout'], ['notes', 'Notes'], ['taches', 'Tâches'],
      ['captures', 'Captures'], ['canevas', 'Canevas & extraits']]) {
      const p = puces.createEl('button', { cls: 'zfa-chrono-puce' + (this.filtre === f ? ' is-active' : ''), text: tr(l) });
      p.onclick = () => this._changer({ filtre: f });
    }
    if (!this.greffon.settings.chronoActif) {
      hote.createDiv({ cls: 'zfa-chrono-avis',
        text: tr("Le journal d'activité est désactivé (réglages, onglet Temps passé) : seule la reconstitution d'après les dates des fichiers s'affiche.") });
    }
  }

  _dessinerFlux(hote, evts, auj) {
    if (!evts.length) {
      hote.createDiv({ cls: 'zfa-chrono-vide', text: tr('Aucune activité sur cette période.') });
      return;
    }
    const montres = evts.slice(0, this.limite);
    const parJour = new Map();
    for (const e of montres) {
      const j = jourIsoDe(new Date(e.t));
      if (!parJour.has(j)) parJour.set(j, []);
      parJour.get(j).push(e);
    }
    const totaux = new Map();
    for (const e of evts) { const j = jourIsoDe(new Date(e.t)); totaux.set(j, (totaux.get(j) || 0) + 1); }
    let moisCourant = '';
    for (const [jour, liste] of parJour) {
      if (jour.slice(0, 7) !== moisCourant) {
        moisCourant = jour.slice(0, 7);
        hote.createDiv({ cls: 'zfa-chrono-mois', text: this._date(jour, { month: 'long', year: 'numeric' }) });
      }
      const tj = hote.createDiv({ cls: 'zfa-chrono-jour' });
      tj.createSpan({ cls: 'zfa-chrono-jour-nom', text: this._date(jour, { weekday: 'short', day: 'numeric', month: 'short' }) });
      const n = totaux.get(jour) || liste.length;
      tj.createSpan({ cls: 'zfa-chrono-jour-info',
        text: ' · ' + (jour === auj ? tr("Aujourd'hui") : n + ' ' + (n > 1 ? tr('événements') : tr('événement'))) });
      const fil = hote.createDiv({ cls: 'zfa-chrono-fil' });
      for (const e of liste) this._dessinerEvenement(fil, e);
    }
    if (evts.length > montres.length) {
      const plus = hote.createEl('button', { cls: 'zfa-chrono-plus',
        text: tr('Afficher plus') + ' (' + (evts.length - montres.length) + ')' });
      plus.onclick = () => { this.limite += 200; this.rafraichir(); };
    }
  }

  _dessinerEvenement(hote, e) {
    const d = Ariane.typeChrono(e.type);
    const ligne = hote.createDiv({ cls: 'zfa-chrono-evt' + (e.approx ? ' est-approx' : '') });
    ligne.style.setProperty('--zfa-chrono-coul', d.couleur);
    const h = new Date(e.t);
    const p = (x) => String(x).padStart(2, '0');
    ligne.createDiv({ cls: 'zfa-chrono-heure', text: e.approx === 'jour' ? '··:··' : p(h.getHours()) + ':' + p(h.getMinutes()) });
    const rail = ligne.createDiv({ cls: 'zfa-chrono-rail' });
    const pastille = rail.createDiv({ cls: 'zfa-chrono-pastille' });
    obsidian.setIcon(pastille, e.type === 'capture' && e.icone ? e.icone : d.icone);

    const carte = ligne.createDiv({ cls: 'zfa-chrono-carte' });
    let etiquette = tr(d.etiquette);
    if (e.type === 'capture' && e.source) etiquette += ' · ' + e.source;
    if (e.type === 'canevas') etiquette += ' · ' + (e.action === 'cree' ? tr('créé') : tr('modifié'));
    carte.createDiv({ cls: 'zfa-chrono-genre', text: etiquette });

    const f = this.app.vault.getAbstractFileByPath(e.chemin);
    const existe = f instanceof obsidian.TFile;
    const titre = existe && f.extension === 'md' ? this.greffon._chronoTitreFichier(f) : (e.titre || e.chemin);
    carte.createDiv({ cls: 'zfa-chrono-nom' + (existe ? '' : ' est-disparu'), text: titre });

    if (e.type === 'tache-terminee' || e.type === 'tache-abandonnee') {
      if (e.raison) {
        const r = carte.createDiv({ cls: 'zfa-chrono-extrait' });
        r.createSpan({ cls: 'zfa-chrono-raison', text: tr('Raison : ') });
        r.createSpan({ text: e.raison });
      }
      carte.createDiv({ cls: 'zfa-chrono-chemin', text: (e.de ? e.de + ' → ' : '→ ') + (e.vers || '') });
    } else {
      const meta = [e.chemin];
      if (e.n) meta.push(e.n + ' ' + (e.n > 1 ? tr('lignes touchées') : tr('ligne touchée')));
      carte.createDiv({ cls: 'zfa-chrono-chemin', text: meta.join(' · ') });
      if (e.extrait) carte.createDiv({ cls: 'zfa-chrono-extrait', text: e.extrait });
    }
    if (e.approx) {
      carte.title = tr("Reconstitué d'après les dates du fichier : antérieur au journal d'activité.");
    }
    if (existe) {
      carte.addClass('est-cliquable');
      carte.addEventListener('click', (ev) => {
        this.app.workspace.getLeaf(!!(ev.metaKey || ev.ctrlKey)).openFile(f);
      });
    }
  }

  _dessinerChaleur(hote, evts, auj) {
    hote.createDiv({ cls: 'zfa-chrono-rubrique', text: tr('Activité · 10 dernières semaines') });
    const carte = Ariane.carteChaleur(evts, auj, 10);
    const g = hote.createDiv({ cls: 'zfa-chrono-chaleur' });
    for (const col of carte.colonnes) {
      for (const c of col) {
        const k = g.createDiv({ cls: 'zfa-chrono-case' + (c ? ' niv-' + c.niveau : ' est-futur') });
        if (!c) continue;
        if (c.jour === auj) k.addClass('est-aujourdhui');
        k.title = this._date(c.jour, { weekday: 'short', day: 'numeric', month: 'short' })
          + ' : ' + c.n + ' ' + (c.n > 1 ? tr('événements') : tr('événement'));
        k.onclick = () => this._changer({ periode: 'jour', ancre: c.jour });
      }
    }
  }

  _dessinerComptes(hote, evts) {
    hote.createDiv({ cls: 'zfa-chrono-rubrique', text: tr('Par type') });
    const comptes = Ariane.comptesChrono(evts);
    const max = Math.max(1, ...Object.values(comptes));
    for (const d of Ariane.TYPES_CHRONO) {
      const l = hote.createDiv({ cls: 'zfa-chrono-compte' + (this.filtre === d.filtre ? ' is-active' : '') });
      l.style.setProperty('--zfa-chrono-coul', d.couleur);
      const tete = l.createDiv({ cls: 'zfa-chrono-compte-tete' });
      tete.createSpan({ text: tr(d.libelle) });
      tete.createSpan({ cls: 'zfa-chrono-compte-n', text: String(comptes[d.type]) });
      const barre = l.createDiv({ cls: 'zfa-chrono-barre' });
      barre.createDiv({ cls: 'zfa-chrono-barre-plein' }).style.width = (comptes[d.type] / max * 100) + '%';
      l.onclick = () => this._changer({ filtre: this.filtre === d.filtre ? 'tout' : d.filtre });
    }
  }

  _dessinerDossier(hote) {
    hote.createDiv({ cls: 'zfa-chrono-rubrique', text: tr('Dossier') });
    const sel = hote.createEl('select', { cls: 'dropdown zfa-chrono-dossier' });
    sel.createEl('option', { value: '', text: tr('Tous les dossiers') });
    const racine = this.app.vault.getRoot();
    const noms = (racine.children || []).filter((x) => x instanceof obsidian.TFolder && !x.name.startsWith('.'))
      .map((x) => x.name).sort((a, b) => a.localeCompare(b));
    if (this.dossier && !noms.includes(this.dossier)) noms.push(this.dossier);
    for (const n of noms) sel.createEl('option', { value: n, text: n });
    sel.value = this.dossier;
    sel.onchange = () => this._changer({ dossier: sel.value });
  }
}

//#endregion 18 · Vues latérales (ItemView)


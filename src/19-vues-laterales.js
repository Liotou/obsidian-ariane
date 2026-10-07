//#region 19 · Vues latérales (ItemView)
// ═══════════════════════════════════════════════════════════════════════════
//  19 · VUES LATÉRALES (ITEMVIEW)
//  Volets latéraux : incohérences de tâches, références en attente,
//  suggestions de voisinage local.
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
    // En-tête : le titre, puis des boutons-icônes à la manière de ceux
    // d'Obsidian (explorateur, recherche) : icônes Lucide, bulle au survol.
    const entete = c.createDiv({ cls: 'zfa-sugg-entete' });
    entete.createSpan({ cls: 'zfa-sugg-titre', text: tr('Suggestions') });
    const outils = entete.createDiv({ cls: 'zfa-sugg-outils' });
    const bouton = (icone, libelle, action) => {
      const b = outils.createDiv({ cls: 'clickable-icon zfa-sugg-outil', attr: { 'aria-label': libelle } });
      obsidian.setIcon(b, icone);
      b.addEventListener('click', () => { if (!b.hasClass('is-disabled')) action(); });
      return b;
    };
    // Le pendant du clic droit « suggestions pour ce passage » : grisé tant
    // qu'aucun passage n'est sélectionné dans la note.
    this.passage = bouton('text-select', '', () => {
      const sel = this.plugin.selectionNote();
      if (sel) this.plugin.suggestionsPourArgument(sel);
    });
    this.majBoutonPassage();
    let prevu = false;
    const planifier = () => {
      if (prevu) return;
      prevu = true;
      requestAnimationFrame(() => { prevu = false; this.majBoutonPassage(); });
    };
    this.registerDomEvent(document, 'selectionchange', planifier);
    this.registerEvent(this.app.workspace.on('window-open', (_w, win) => {
      if (win && win.document) this.registerDomEvent(win.document, 'selectionchange', planifier);
    }));
    this.registerEvent(this.app.workspace.on('active-leaf-change', planifier));
    this.registerEvent(this.app.workspace.on('editor-change', planifier));
    // Le reclassement par modèle de langue est le poste le plus lourd de tout
    // le greffon. Il ne part plus tout seul : il attend ce bouton.
    this.affiner = bouton('sparkles', tr('Affiner par le modèle de langue'),
      () => this.plugin.majSuggestions(true, true));
    bouton('refresh-cw', tr('Rafraîchir les suggestions (sans modèle de langue)'),
      () => this.plugin.majSuggestions(false, true));
    this.pause = bouton('pause', '', async () => {
      this.plugin.settings.suggActif = !this.plugin.settings.suggActif;
      await this.plugin.saveSettings();
      this.majBoutonPause();
      this.plugin.majSuggestions(false, true);
    });
    this.majBoutonPause();
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

  majBoutonPassage() {
    if (!this.passage) return;
    const actif = !!this.plugin.selectionNote();
    this.passage.toggleClass('is-disabled', !actif);
    this.passage.setAttribute('aria-label', actif
      ? tr('Suggestions pour le passage sélectionné')
      : tr('Sélectionnez un passage dans la note pour des suggestions ciblées'));
  }

  majBoutonPause() {
    if (!this.pause) return;
    const actif = this.plugin.settings.suggActif;
    obsidian.setIcon(this.pause, actif ? 'pause' : 'play');
    this.pause.toggleClass('is-active', !actif);
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

// ── Bloc « ariane-organisation » : le tableau de bord des tâches ──────────
//  Un bloc de code ```ariane-organisation``` dans une note ordinaire (par
//  défaut « 00 - Cadrage/Gestion de l'organisation »), rendu par Ariane à
//  partir de Ariane.tableauOrganisation : chiffres clés, la semaine jour par
//  jour, aujourd'hui heure par heure, la matrice urgent / important, ce qui
//  est à surveiller, les échéances à venir, les familles, l'activité récente.
//  Rien n'y est écrit : c'est une vue, qui se redessine quand une tâche
//  change. Chaque section se replie d'un clic ; Ariane retient lesquelles.

const ORGA_JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const ORGA_DIAGNOSTICS = { retard: 'en retard', etire: 's’étire', 'sous-planifiee': 'sous-planifiée', abandon: 'abandon ?' };

class BlocOrganisation extends obsidian.MarkdownRenderChild {
  constructor(greffon, el) {
    super(el);
    this.greffon = greffon;
    this._minuteur = null;
  }

  onload() {
    // Inscrit auprès du greffon : une répartition proposée redessine les
    // tableaux ouverts (rafraichirOrganisation).
    if (!this.greffon._blocsOrganisation) this.greffon._blocsOrganisation = new Set();
    this.greffon._blocsOrganisation.add(this);
    this.rendre();
    this.registerEvent(this.greffon.app.metadataCache.on('changed', (f) => {
      if (!f || !this.greffon.refDeChemin(f.path)) return;
      clearTimeout(this._minuteur);
      this._minuteur = setTimeout(() => this.rendre(), 1500);
    }));
    // Le jour et l'heure changent : aujourd'hui, la semaine aussi.
    this.registerInterval(window.setInterval(() => this.rendre(), 15 * 60000));
  }

  onunload() {
    clearTimeout(this._minuteur);
    if (this.greffon._blocsOrganisation) this.greffon._blocsOrganisation.delete(this);
  }

  // ── Petits outils de mise en forme ─────────────────────────────────────
  _jourCourt(iso) {
    const d = new Date(iso.slice(0, 10) + 'T12:00:00');
    return ORGA_JOURS[(d.getDay() + 6) % 7] + ' ' + d.getDate() + ' '
      + d.toLocaleDateString('fr-FR', { month: 'short' }).replace(/\.$/, '');
  }

  _duree(min) { return min > 0 ? dureeLisible(min) : '0 min'; }

  _couleur(t) {
    const f = (this.greffon.familleDe && this.greffon.familleDe(t.famille)) || {};
    return f.couleur || '';
  }

  _nomFamille(id) {
    const f = (this.greffon.familleDe && this.greffon.familleDe(id)) || {};
    return f.nom || id || tr('(sans famille)');
  }

  _lien(hote, t, cls) {
    const cible = t.fichier ? t.fichier.path : t.ref;
    const a = hote.createEl('a', { cls: 'internal-link ' + (cls || 'zfa-orga-intitule'), text: t.intitule || t.ref,
      attr: { 'data-href': cible, href: cible } });
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const nouveau = obsidian.Keymap && obsidian.Keymap.isModEvent ? obsidian.Keymap.isModEvent(e) : false;
      this.greffon.app.workspace.openLinkText(cible, '', nouveau);
    });
    return a;
  }

  _pastille(hote, texte, genre, titre) {
    const p = hote.createSpan({ cls: 'zfa-orga-pastille' + (genre ? ' est-' + genre : ''), text: texte });
    if (titre) p.setAttribute('title', titre);
    return p;
  }

  // Une tâche, avec tout ce qui la situe : famille, statut, avancement,
  // échéance en clair, prochain créneau, diagnostics. `mode` :
  //   'compacte'   sans échéance ni diagnostics (sous un en-tête de date) ;
  //   'suggestion' sans diagnostics (le conseil, ajouté ensuite, les dit).
  _ligneRiche(hote, x, auj, mode) {
    const compacte = mode === 'compacte';
    const t = x.tache;
    const a = x.analyse;
    const l = hote.createDiv({ cls: 'zfa-orga-ligne' });
    const point = l.createSpan({ cls: 'zfa-orga-point' });
    const c = this._couleur(t);
    if (c) point.style.background = c;
    l.createSpan({ cls: 'zfa-orga-ref', text: t.ref });
    const corps = l.createDiv({ cls: 'zfa-orga-corps' });
    l.zfaCorps = corps;   // pour qui veut y ajouter une ligne (le conseil)
    this._lien(corps, t);
    const meta = corps.createDiv({ cls: 'zfa-orga-meta' });
    if (t.statut && t.statut !== 'à faire') this._pastille(meta, t.statut, 'statut');
    const av = Number(t.avancement) || 0;
    if (av > 0) {
      const b = meta.createSpan({ cls: 'zfa-orga-avancement', attr: { title: av + ' %' } });
      b.createSpan().style.width = Math.min(100, av) + '%';
      meta.createSpan({ cls: 'zfa-orga-discret', text: av + ' %' });
    }
    const ech = compacte ? null : Ariane.echeanceRelative(t.echeance, auj);
    if (ech) this._pastille(meta, tr('échéance ') + ech.texte, ech.genre, t.echeance);
    if (a.prochainCreneau) {
      meta.createSpan({ cls: 'zfa-orga-discret',
        text: tr('prochain créneau ') + this._jourCourt(a.prochainCreneau) + ' ' + a.prochainCreneau.slice(11, 16) });
    } else if (a.dernierCreneau) {
      meta.createSpan({ cls: 'zfa-orga-discret', text: tr('dernier créneau ') + this._jourCourt(a.dernierCreneau) });
    }
    if (a.reports) meta.createSpan({ cls: 'zfa-orga-discret', text: a.reports + ' ' + tr('report(s)') });
    if (compacte || mode === 'suggestion') return l;
    for (const d of a.diagnostics) this._pastille(meta, tr(ORGA_DIAGNOSTICS[d.code] || d.code), 'diag-' + d.code, d.raison);
    if (a.diagnostics.length) {
      corps.createDiv({ cls: 'zfa-orga-raisons', text: a.diagnostics.map((d) => d.raison).join(' ; ') });
    }
    return l;
  }

  // Une section repliable ; l'état est retenu dans les réglages.
  _section(hote, cle, titre, nombre, remplir) {
    const s = this.greffon.settings;
    const replies = new Set(Array.isArray(s.organisationReplies) ? s.organisationReplies : []);
    const bloc = hote.createDiv({ cls: 'zfa-orga-section est-' + cle + (replies.has(cle) ? ' est-repliee' : '') });
    const h = bloc.createDiv({ cls: 'zfa-orga-titre' });
    const chevron = h.createSpan({ cls: 'zfa-orga-chevron' });
    obsidian.setIcon(chevron, 'chevron-down');
    h.createSpan({ text: titre });
    if (nombre != null) h.createSpan({ cls: 'zfa-orga-nombre', text: String(nombre) });
    h.addEventListener('click', async () => {
      const repliee = !bloc.hasClass('est-repliee');
      bloc.toggleClass('est-repliee', repliee);
      const liste = new Set(Array.isArray(s.organisationReplies) ? s.organisationReplies : []);
      if (repliee) liste.add(cle); else liste.delete(cle);
      s.organisationReplies = Array.from(liste);
      await this.greffon.saveSettings();
    });
    remplir(bloc.createDiv({ cls: 'zfa-orga-contenu' }));
    return bloc;
  }

  // ── Le pseudo-calendrier de la semaine ─────────────────────────────────
  //  Une copie de la semaine (jours ouvrés, plage de travail) : ce qui existe
  //  en fond, non modifiable ; les créneaux proposés par la répartition en
  //  fantômes, à valider (✓), écarter (✕), déplacer ou étirer à la souris.
  //  Validé, un créneau s'écrit dans sa tâche au même jour, à la même heure :
  //  il apparaît dans le vrai calendrier. Tout le DOM et les écouteurs vivent
  //  dans le document de la note (volet détaché compris).
  _pseudoCalendrier(hote, d) {
    const g = d.grille;
    const props = d.propositions || [];
    if (!g || !g.jours.length) return;
    const mn = (h) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m ? +m[1] * 60 + +m[2] : 0; };
    const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    const hDeb = mn(g.heureDebut);
    const hFin = mn(g.heureFin);
    const PXH = 44;
    const y = (m) => ((Math.max(hDeb, Math.min(hFin, m)) - hDeb) / 60) * PXH;
    const cal = hote.createDiv({ cls: 'zfa-orga-cal' });

    if (props.length) {
      const barre = cal.createDiv({ cls: 'zfa-orga-cal-barre' });
      barre.createSpan({ cls: 'zfa-orga-cal-compte', text: props.length + ' ' + tr('créneau(x) proposé(s)') });
      barre.createSpan({ cls: 'zfa-orga-discret', text: tr('glisser pour déplacer, tirer le bas pour allonger') });
      const tout = barre.createEl('button', { cls: 'mod-cta', text: tr('Tout valider') });
      tout.addEventListener('click', () => this.greffon.validerPropositionsOrganisation(props.map((p) => p.id)));
      const rien = barre.createEl('button', { text: tr('Tout écarter') });
      rien.addEventListener('click', () => this.greffon.ecarterPropositionsOrganisation(props.map((p) => p.id)));
    }

    const tete = cal.createDiv({ cls: 'zfa-orga-cal-tete' });
    tete.createDiv({ cls: 'zfa-orga-cal-coin' });
    for (const j of g.jours) {
      tete.createDiv({ cls: 'zfa-orga-cal-nom' + (j.aujourdhui ? ' est-aujourdhui' : '') + (j.passe ? ' est-passe' : ''),
        text: this._jourCourt(j.jour) });
    }
    const corps = cal.createDiv({ cls: 'zfa-orga-cal-corps' });
    corps.style.height = Math.round(((hFin - hDeb) / 60) * PXH) + 'px';
    const axe = corps.createDiv({ cls: 'zfa-orga-cal-axe' });
    for (let h = Math.ceil(hDeb / 60); h * 60 < hFin; h += 1) {
      axe.createDiv({ cls: 'zfa-orga-cal-heure', text: h + ' h' }).style.top = y(h * 60) + 'px';
    }
    const grilleCols = corps.createDiv({ cls: 'zfa-orga-cal-cols' });
    const cols = g.jours.map((j) => {
      const col = grilleCols.createDiv({ cls: 'zfa-orga-cal-col' + (j.aujourdhui ? ' est-aujourdhui' : '') + (j.passe ? ' est-passe' : '') });
      for (let h = Math.ceil(hDeb / 60); h * 60 < hFin; h += 1) {
        col.createDiv({ cls: 'zfa-orga-cal-ligne' }).style.top = y(h * 60) + 'px';
      }
      if (g.pauseDebut && g.pauseFin) {
        const p = col.createDiv({ cls: 'zfa-orga-cal-pause', attr: { title: tr('Pause déjeuner') } });
        p.style.top = y(mn(g.pauseDebut)) + 'px';
        p.style.height = (y(mn(g.pauseFin)) - y(mn(g.pauseDebut))) + 'px';
      }
      for (const o of j.occupations) {
        const a = mn(o.debut.slice(11));
        const b = o.fin.slice(0, 10) > j.jour ? hFin : mn(o.fin.slice(11));
        if (b <= hDeb || a >= hFin) continue;
        const bloc = col.createDiv({ cls: 'zfa-orga-cal-bloc est-' + o.genre });
        bloc.style.top = y(a) + 'px';
        bloc.style.height = Math.max(14, y(b) - y(a) - 2) + 'px';
        const coul = o.genre === 'creneau' ? this._couleur({ famille: o.famille }) : o.couleur;
        if (coul) bloc.style.setProperty('--zfa-orga-coul', coul);
        bloc.createDiv({ cls: 'zfa-orga-cal-titre', text: o.titre });
        bloc.setAttribute('title', o.debut.slice(11, 16) + ' → ' + o.fin.slice(11, 16) + ', ' + o.titre
          + (o.calendrier ? ' (' + o.calendrier + ')' : ''));
      }
      if (j.aujourdhui) {
        const n = new Date();
        const m = n.getHours() * 60 + n.getMinutes();
        if (m > hDeb && m < hFin) col.createDiv({ cls: 'zfa-orga-cal-maintenant' }).style.top = y(m) + 'px';
      }
      return col;
    });
    const ctx = { g, cols, props, hDeb, hFin, PXH, y, mn, hm };
    for (const p of props) this._fantome(ctx, p);
    this._marquerConflits(ctx);
  }

  _fantome(ctx, p) {
    const i = ctx.g.jours.findIndex((j) => j.jour === p.debut.slice(0, 10));
    if (i < 0) return;
    const el = ctx.cols[i].createDiv({ cls: 'zfa-orga-fantome' });
    el.zfaProposition = p;
    const coul = this._couleur({ famille: (this.greffon.tachesPourGantt().find((t) => t.ref === p.ref) || {}).famille });
    if (coul) el.style.setProperty('--zfa-orga-coul', coul);
    const place = () => {
      const a = ctx.mn(p.debut.slice(11));
      const b = ctx.mn(p.fin.slice(11));
      el.style.top = ctx.y(a) + 'px';
      el.style.height = Math.max(18, ctx.y(b) - ctx.y(a) - 2) + 'px';
      heures.textContent = p.debut.slice(11, 16) + ' → ' + p.fin.slice(11, 16);
    };
    const titre = el.createDiv({ cls: 'zfa-orga-cal-titre', text: p.ref + ' ' + p.intitule });
    const heures = el.createDiv({ cls: 'zfa-orga-fantome-heures' });
    const taille = { petite: tr('petite tâche'), moyenne: tr('tâche moyenne'), grosse: tr('gros travail') }[p.taille] || '';
    el.setAttribute('title', [p.intitule, [taille, p.raison].filter(Boolean).join(' : ')].filter(Boolean).join('\n'));
    const act = el.createDiv({ cls: 'zfa-orga-fantome-actions' });
    const ok = act.createEl('button', { cls: 'zfa-orga-fantome-ok', text: '✓', attr: { 'aria-label': tr('Valider ce créneau') } });
    const ko = act.createEl('button', { cls: 'zfa-orga-fantome-ko', text: '✕', attr: { 'aria-label': tr('Écarter ce créneau') } });
    for (const b of [ok, ko]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    ok.addEventListener('click', (e) => { e.stopPropagation(); this.greffon.validerPropositionsOrganisation([p.id]); });
    ko.addEventListener('click', (e) => { e.stopPropagation(); this.greffon.ecarterPropositionsOrganisation([p.id]); });
    const poignee = el.createDiv({ cls: 'zfa-orga-fantome-poignee' });
    place();
    titre.setAttribute('draggable', 'false');
    el.addEventListener('pointerdown', (e) => this._saisirFantome(e, ctx, el, p, place, 'bouger'));
    poignee.addEventListener('pointerdown', (e) => { e.stopPropagation(); this._saisirFantome(e, ctx, el, p, place, 'etirer'); });
  }

  // Déplacer (au quart d'heure, d'un jour à l'autre) ou étirer un fantôme.
  // Jamais hors de la plage de travail, jamais dans un jour passé.
  _saisirFantome(e, ctx, el, p, place, mode) {
    if (e.button !== 0) return;
    e.preventDefault();
    const doc = el.ownerDocument;
    const win = doc.defaultView || window;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const a0 = ctx.mn(p.debut.slice(11));
    const b0 = ctx.mn(p.fin.slice(11));
    const duree = b0 - a0;
    const i0 = ctx.g.jours.findIndex((j) => j.jour === p.debut.slice(0, 10));
    const colW = ctx.cols[0].getBoundingClientRect().width || 100;
    let i = i0;
    el.classList.add('est-saisi');
    const bouger = (m) => {
      const dmin = Math.round(((m.clientY - y0) / ctx.PXH) * 60 / 15) * 15;
      if (mode === 'etirer') {
        const b = Math.max(a0 + 15, Math.min(ctx.hFin, b0 + dmin));
        p.fin = p.debut.slice(0, 10) + 'T' + ctx.hm(b);
      } else {
        const a = Math.max(ctx.hDeb, Math.min(ctx.hFin - duree, a0 + dmin));
        let ni = Math.max(0, Math.min(ctx.cols.length - 1, i0 + Math.round((m.clientX - x0) / colW)));
        if (ctx.g.jours[ni].passe) ni = i;
        if (ni !== i) { i = ni; ctx.cols[i].appendChild(el); }
        const jour = ctx.g.jours[i].jour;
        p.debut = jour + 'T' + ctx.hm(a);
        p.fin = jour + 'T' + ctx.hm(a + duree);
      }
      place();
      this._marquerConflits(ctx);
    };
    const lacher = async () => {
      doc.removeEventListener('pointermove', bouger);
      doc.removeEventListener('pointerup', lacher);
      el.classList.remove('est-saisi');
      if (p.debut.slice(11) !== ctx.hm(a0) || p.fin.slice(11) !== ctx.hm(b0) || i !== i0) {
        await this.greffon.deplacerPropositionOrganisation(p.id, p.debut, p.fin);
      }
    };
    doc.addEventListener('pointermove', bouger);
    doc.addEventListener('pointerup', lacher);
    win.getSelection && win.getSelection().removeAllRanges();
  }

  // Un fantôme qui chevauche un créneau, un rendez-vous, la pause ou un autre
  // fantôme est signalé (liseré rouge) : on peut encore le valider, mais on
  // le voit.
  _marquerConflits(ctx) {
    const pause = ctx.g.pauseDebut && ctx.g.pauseFin ? [ctx.mn(ctx.g.pauseDebut), ctx.mn(ctx.g.pauseFin)] : null;
    for (const col of ctx.cols) {
      for (const el of Array.from(col.querySelectorAll('.zfa-orga-fantome'))) {
        const p = el.zfaProposition;
        const jour = ctx.g.jours.find((j) => j.jour === p.debut.slice(0, 10));
        const a = ctx.mn(p.debut.slice(11));
        const b = ctx.mn(p.fin.slice(11));
        const heurte = (x, z) => a < z && x < b;
        let conflit = !!(pause && heurte(pause[0], pause[1]));
        for (const o of (jour ? jour.occupations : [])) {
          if (heurte(ctx.mn(o.debut.slice(11)), o.fin.slice(0, 10) > jour.jour ? ctx.hFin : ctx.mn(o.fin.slice(11)))) conflit = true;
        }
        for (const q of ctx.props) {
          if (q !== p && q.debut.slice(0, 10) === p.debut.slice(0, 10)
            && heurte(ctx.mn(q.debut.slice(11)), ctx.mn(q.fin.slice(11)))) conflit = true;
        }
        el.classList.toggle('est-conflit', conflit);
      }
    }
  }

  // ── Le rendu ───────────────────────────────────────────────────────────
  async rendre() {
    const el = this.containerEl;
    let d;
    try { d = await this.greffon.donneesOrganisation(); } catch (e) {
      el.empty();
      el.createDiv({ cls: 'zfa-orga-vide', text: tr('Le tableau n’a pas pu se calculer : ') + (e && e.message ? e.message : e) });
      return;
    }
    const auj = d.aujourdhuiISO;
    el.empty();
    el.addClass('zfa-orga');

    const tete = el.createDiv({ cls: 'zfa-orga-tete' });
    const jour = new Date(auj + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    tete.createSpan({ cls: 'zfa-orga-date', text: jour.charAt(0).toUpperCase() + jour.slice(1) });
    tete.createSpan({ cls: 'zfa-orga-discret', text: tr('semaine du ') + this._jourCourt(d.lundi) });

    el.createDiv({ cls: 'zfa-orga-partie', text: tr('Pour s’organiser') });

    // Aujourd'hui.
    this._section(el, 'aujourdhui', tr('Aujourd’hui'), d.aujourdhui.length, (c) => {
      if (d.journeeEntiere.length) {
        const j = c.createDiv({ cls: 'zfa-orga-journee' });
        for (const e of d.journeeEntiere) this._pastille(j, e.titre, 'evt', e.calendrier);
      }
      if (!d.aujourdhui.length) {
        c.createDiv({ cls: 'zfa-orga-vide', text: tr('Aucun créneau ni rendez-vous aujourd’hui.') });
        return;
      }
      const maintenant = new Date();
      const hm = String(maintenant.getHours()).padStart(2, '0') + ':' + String(maintenant.getMinutes()).padStart(2, '0');
      for (const x of d.aujourdhui) {
        const passe = x.fin.slice(11, 16) <= hm;
        const encours = !passe && x.debut.slice(11, 16) <= hm;
        const l = c.createDiv({ cls: 'zfa-orga-agenda est-' + x.genre + (passe ? ' est-passe' : '') + (encours ? ' est-encours' : '') });
        l.createSpan({ cls: 'zfa-orga-heure', text: x.debut.slice(11, 16) + ' → ' + x.fin.slice(11, 16) });
        const barre = l.createSpan({ cls: 'zfa-orga-agenda-barre' });
        const coul = x.genre === 'creneau' ? this._couleur(x.tache) : x.couleur;
        if (coul) barre.style.background = coul;
        const corps = l.createDiv({ cls: 'zfa-orga-corps' });
        if (x.genre === 'creneau') {
          const ligne = corps.createDiv();
          ligne.createSpan({ cls: 'zfa-orga-ref', text: x.tache.ref + ' ' });
          this._lien(ligne, x.tache);
        } else {
          corps.createDiv({ cls: 'zfa-orga-evt-titre', text: x.titre });
          if (x.calendrier) corps.createDiv({ cls: 'zfa-orga-discret', text: x.calendrier });
        }
        l.createSpan({ cls: 'zfa-orga-discret', text: this._duree(x.minutes) });
      }
    });

    // Tâches suggérées : ce qui mérite l'attention maintenant, avec un conseil.
    this._section(el, 'suggestions', tr('Tâches suggérées'), d.suggestions.length, (c) => {
      if (!d.suggestions.length) {
        c.createDiv({ cls: 'zfa-orga-vide', text: tr('Rien de pressant en dehors du programme du jour.') });
        return;
      }
      d.suggestions.forEach((x, i) => {
        const l = this._ligneRiche(c, x, auj, 'suggestion');
        l.addClass('est-suggestion');
        // Créé dans la ligne (donc dans le bon document, volet détaché
        // compris), puis mis en tête.
        l.prepend(l.createSpan({ cls: 'zfa-orga-rang', text: String(i + 1) }));
        const k = x.conseil;
        const quand = k.date ? this._jourCourt(k.date) + (k.date.length > 10 ? ' ' + k.date.slice(11, 16) : '') : '';
        const texte = {
          retard: tr('Échéance dépassée : replanifier ou clore'),
          'planifier-avant': tr('Poser un créneau avant le ') + quand,
          decouper: tr('Repoussée plusieurs fois : découper, ou fixer une échéance réaliste'),
          relancer: tr('Sans activité récente : la relancer ou l’abandonner'),
          prevue: tr('Prévue ') + quand,
          'a-planifier': tr('À planifier : aucun créneau prévu'),
        }[k.genre] || '';
        if (l.zfaCorps && texte) l.zfaCorps.createDiv({ cls: 'zfa-orga-conseil est-' + k.genre, text: texte });
      });
    });

    // Temps libre cette semaine : où poser les créneaux que les suggestions
    // réclament.
    const tl = d.tempsLibre;
    this._section(el, 'libre', tr('Temps libre cette semaine'), null, (c) => {
      const tete = c.createDiv({ cls: 'zfa-orga-libre-tete' });
      tete.createSpan({ cls: 'zfa-orga-libre-total', text: this._duree(tl.minutes) });
      tete.createSpan({ cls: 'zfa-orga-discret', text: tr('libres en ') + tl.nbPlages + ' ' + tr('plage(s), sur ')
        + this._duree(tl.capacite) + tr(' de plage de travail restante (') + tl.heureDebut + ' → ' + tl.heureFin + ')' });
      if (tl.capacite > 0) {
        const jauge = c.createDiv({ cls: 'zfa-orga-jauge', attr: { title: Math.round(100 * (1 - tl.minutes / tl.capacite)) + ' % ' + tr('occupé') } });
        jauge.createSpan().style.width = Math.round(100 * (1 - tl.minutes / tl.capacite)) + '%';
      }
      if (!tl.jours.length) { c.createDiv({ cls: 'zfa-orga-vide', text: tr('La semaine de travail est terminée.') }); return; }
      if (tl.minutes > 0) {
        const barre = c.createDiv({ cls: 'zfa-orga-actions' });
        const b = barre.createEl('button', { cls: 'mod-cta', text: tr('Proposer une répartition (IA)') });
        b.setAttribute('title', tr('Claude estime vos tâches, Ariane place leurs créneaux ; vous validez.'));
        b.addEventListener('click', async () => {
          b.disabled = true;
          try { await this.greffon.repartirSemaineIA(); } catch (e) {
            new obsidian.Notice(tr('Répartition impossible : ') + (e && e.message ? e.message : e), 10000);
          } finally { b.disabled = false; }
        });
        barre.createSpan({ cls: 'zfa-orga-discret', text: tr('Claude estime la taille de vos tâches ; Ariane pose les créneaux ; vous validez.') });
      }
      this._pseudoCalendrier(c, d);
    });

    // À surveiller.
    // Temps hors Obsidian pas encore rattaché à une tâche.
    const reel = d.reel;
    if (reel && reel.aRattacher.length) {
      const total = reel.aRattacher.reduce((sm, x) => sm + x.min, 0);
      this._section(el, 'rattacher', tr('Temps hors Obsidian à rattacher'), this._duree(total), (c) => {
        c.createDiv({ cls: 'zfa-orga-discret', text: tr('Du travail relevé par ActivityWatch qui ne compte encore pour aucune tâche.') });
        for (const x of reel.aRattacher) {
          const l = c.createDiv({ cls: 'zfa-orga-ratt' });
          const jl = new Date(x.jour + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
          l.createSpan({ cls: 'zfa-orga-ratt-jour', text: jl.charAt(0).toUpperCase() + jl.slice(1) });
          l.createSpan({ cls: 'zfa-orga-discret', text: this._duree(x.min) + tr(' en ') + x.blocs.length + tr(' créneau(x)') });
          const b = l.createEl('button', { cls: 'zfa-orga-ratt-bt' });
          obsidian.setIcon(b.createSpan({ cls: 'zfa-orga-ratt-ic' }), 'link');
          b.createSpan({ text: tr('Rattacher…') });
          b.onclick = () => new ModaleRattacherActivite(this.greffon, { jour: x.jour, blocs: x.blocs,
            surFait: () => this.greffon.rafraichirOrganisation && this.greffon.rafraichirOrganisation() }).open();
        }
      });
    }

    this._section(el, 'surveiller', tr('À surveiller'), d.surveiller.length, (c) => {
      if (!d.surveiller.length) { c.createDiv({ cls: 'zfa-orga-vide', text: tr('Rien d’inquiétant.') }); return; }
      for (const x of d.surveiller) this._ligneRiche(c, x, auj);
    });

    // Matrice urgent / important.
    const m = d.matrice;
    this._section(el, 'matrice', tr('Urgence et importance'), null, (c) => {
      const g = c.createDiv({ cls: 'zfa-orga-matrice' });
      const case_ = (cle, titre, sous, liste) => {
        const b = g.createDiv({ cls: 'zfa-orga-case est-' + cle });
        const h = b.createDiv({ cls: 'zfa-orga-case-titre' });
        h.createSpan({ text: titre });
        h.createSpan({ cls: 'zfa-orga-nombre', text: String(liste.length) });
        b.createDiv({ cls: 'zfa-orga-discret', text: sous });
        for (const x of liste.slice(0, 5)) {
          const l = b.createDiv({ cls: 'zfa-orga-mini' });
          const point = l.createSpan({ cls: 'zfa-orga-point' });
          const coul = this._couleur(x.tache);
          if (coul) point.style.background = coul;
          this._lien(l, x.tache);
          const ech = Ariane.echeanceRelative(x.tache.echeance, auj);
          if (ech) this._pastille(l, ech.texte, ech.genre, x.tache.echeance);
        }
        if (liste.length > 5) b.createDiv({ cls: 'zfa-orga-discret', text: '+ ' + (liste.length - 5) + ' ' + tr('autres') });
      };
      case_('ui', tr('Urgent et important'), tr('à faire maintenant'), m.urgentImportant);
      case_('i', tr('Important, pas urgent'), tr('à planifier'), m.importantPasUrgent);
      case_('u', tr('Urgent, moins prioritaire'), tr('à expédier'), m.urgentPasImportant);
      case_('n', tr('Sans urgence ni priorité'), tr('à reconsidérer à l’occasion'), m.niUnNiAutre);
    });

    // Échéances à venir.
    this._section(el, 'echeances', tr('Échéances des 30 prochains jours'), d.echeances.length, (c) => {
      if (!d.echeances.length) { c.createDiv({ cls: 'zfa-orga-vide', text: tr('Aucune échéance dans les 30 jours.') }); return; }
      const frise = c.createDiv({ cls: 'zfa-orga-frise' });
      let courant = '';
      for (const x of d.echeances) {
        if (x.tache.echeance !== courant) {
          courant = x.tache.echeance;
          const ech = Ariane.echeanceRelative(courant, auj);
          const date = frise.createDiv({ cls: 'zfa-orga-frise-date' + (ech ? ' est-' + ech.genre : '') });
          date.createSpan({ text: this._jourCourt(courant) });
          if (ech) date.createSpan({ cls: 'zfa-orga-discret', text: ech.texte });
        }
        this._ligneRiche(frise, x, auj, 'compacte');
      }
    });

    el.createDiv({ cls: 'zfa-orga-partie', text: tr('En chiffres') });

    // Chiffres clés.
    const k = d.chiffres;
    const pave = (hote, valeur, libelle, genre) => {
      const p = hote.createDiv({ cls: 'zfa-orga-pave' + (genre ? ' est-' + genre : '') });
      p.createDiv({ cls: 'zfa-orga-pave-valeur', text: valeur });
      p.createDiv({ cls: 'zfa-orga-pave-libelle', text: libelle });
    };
    const paves = el.createDiv({ cls: 'zfa-orga-paves' });
    pave(paves, String(k.actives), tr('tâches actives'));
    pave(paves, String(k.enRetard), tr('en retard'), k.enRetard ? 'retard' : '');
    pave(paves, String(k.echeances7), tr('échéances sous 7 j'), k.echeances7 ? 'proche' : '');
    pave(paves, this._duree(k.minutesPlanifieesSemaine), tr('planifiées cette semaine'));
    pave(paves, this._duree(k.minutesPasseesSemaine), tr('passées (indicatif)'));
    pave(paves, String(k.termineesSemaine), tr('terminées en 7 j'), k.termineesSemaine ? 'bien' : '');

    // La semaine.
    this._section(el, 'semaine', tr('La semaine'), null, (c) => {
      const max = Math.max(8 * 60, ...d.semaine.map((j) => j.minutesPlanifiees + j.minutesEvenements));
      const g = c.createDiv({ cls: 'zfa-orga-semaine' });
      d.semaine.forEach((j, i) => {
        const col = g.createDiv({ cls: 'zfa-orga-jour' + (j.aujourdhui ? ' est-aujourdhui' : '')
          + (j.jour < auj ? ' est-passe' : '') + (i >= 5 ? ' est-weekend' : '') });
        col.createDiv({ cls: 'zfa-orga-jour-nom', text: this._jourCourt(j.jour) });
        const barre = col.createDiv({ cls: 'zfa-orga-jour-barre',
          attr: { title: this._duree(j.minutesPlanifiees) + tr(' de créneaux, ') + this._duree(j.minutesEvenements) + tr(' de rendez-vous') } });
        const ev = barre.createDiv({ cls: 'zfa-orga-jour-evt' });
        ev.style.height = Math.round(100 * j.minutesEvenements / max) + '%';
        const cr = barre.createDiv({ cls: 'zfa-orga-jour-cr' });
        cr.style.height = Math.round(100 * j.minutesPlanifiees / max) + '%';
        col.createDiv({ cls: 'zfa-orga-jour-heures', text: j.minutesPlanifiees ? this._duree(j.minutesPlanifiees) : '·' });
        col.createDiv({ cls: 'zfa-orga-discret', text: j.nbEvenements ? j.nbEvenements + ' ' + tr('rdv') : '' });
        if (j.libre) col.createDiv({ cls: 'zfa-orga-jour-libre', text: this._duree(j.libre.minutes) + ' ' + tr('libres') });
      });
      const legende = c.createDiv({ cls: 'zfa-orga-legende' });
      legende.createSpan({ cls: 'zfa-orga-cle est-cr', text: tr('créneaux de tâches') });
      legende.createSpan({ cls: 'zfa-orga-cle est-evt', text: tr('rendez-vous') });
    });

    // Travail réel : dans Obsidian et hors d'Obsidian, face au prévu.
    if (reel) {
      this._section(el, 'reel', tr('Travail réel cette semaine'), null, (c) => {
        const prevuTotal = d.semaine.reduce((sm, j) => sm + (j.jour <= auj ? j.minutesPlanifiees : 0), 0);
        const travail = reel.obsidian + reel.externe;
        const pv = c.createDiv({ cls: 'zfa-orga-paves' });
        pave(pv, this._duree(travail), tr('de travail réel'));
        pave(pv, this._duree(reel.obsidian), tr('dans Obsidian'));
        if (reel.avecExterne) pave(pv, this._duree(reel.externe), tr('hors Obsidian'));
        if (prevuTotal) {
          const taux = Math.round(100 * travail / prevuTotal);
          pave(pv, taux + ' %', tr('du prévu (') + this._duree(prevuTotal) + ')', taux >= 80 ? 'bien' : (taux < 50 ? 'retard' : ''));
        }
        if (reel.avecExterne) pave(pv, this._duree(reel.personnel), tr('personnel'), reel.personnel > travail / 3 ? 'proche' : '');

        // Par jour : barres empilées (Obsidian, hors Obsidian, personnel), et
        // le prévu en trait.
        const prevuDe = new Map(d.semaine.map((j) => [j.jour, j.minutesPlanifiees]));
        const max = Math.max(4 * 60, ...reel.parJour.map((j) => Math.max(j.obsidian + j.externe + j.personnel, prevuDe.get(j.jour) || 0)));
        const g = c.createDiv({ cls: 'zfa-orga-semaine zfa-orga-reel' });
        for (const j of d.semaine) {
          const rj = reel.parJour.find((x) => x.jour === j.jour);
          const col = g.createDiv({ cls: 'zfa-orga-jour' + (j.aujourdhui ? ' est-aujourdhui' : '') + (rj ? '' : ' est-futur') });
          col.createDiv({ cls: 'zfa-orga-jour-nom', text: this._jourCourt(j.jour) });
          const barre = col.createDiv({ cls: 'zfa-orga-jour-barre' });
          if (rj) {
            barre.setAttribute('aria-label', this._duree(rj.obsidian) + tr(' dans Obsidian\n') + this._duree(rj.externe)
              + tr(' hors Obsidian\n') + this._duree(rj.personnel) + tr(' personnel\nprévu : ') + this._duree(j.minutesPlanifiees));
            for (const [k, cls] of [['obsidian', 'est-obs'], ['externe', 'est-ext'], ['personnel', 'est-perso']]) {
              if (!rj[k]) continue;
              const p = barre.createDiv({ cls: 'zfa-orga-reel-p ' + cls });
              p.style.height = Math.round(100 * rj[k] / max) + '%';
            }
          }
          if (j.minutesPlanifiees) {
            const t = barre.createDiv({ cls: 'zfa-orga-reel-prevu' });
            t.style.bottom = Math.round(100 * j.minutesPlanifiees / max) + '%';
          }
          col.createDiv({ cls: 'zfa-orga-jour-heures', text: rj && (rj.obsidian + rj.externe) ? this._duree(rj.obsidian + rj.externe) : '·' });
        }
        const lg = c.createDiv({ cls: 'zfa-orga-legende' });
        lg.createSpan({ cls: 'zfa-orga-cle est-obs', text: tr('dans Obsidian') });
        if (reel.avecExterne) {
          lg.createSpan({ cls: 'zfa-orga-cle est-ext', text: tr('hors Obsidian') });
          lg.createSpan({ cls: 'zfa-orga-cle est-perso', text: tr('personnel') });
        }
        lg.createSpan({ cls: 'zfa-orga-cle est-prevu', text: tr('prévu') });

        if (reel.parCategorie.length) {
          c.createDiv({ cls: 'zfa-orga-sous-titre', text: tr('Hors Obsidian, par catégorie') });
          const maxC = reel.parCategorie[0].min;
          for (const x of reel.parCategorie) {
            const l = c.createDiv({ cls: 'zfa-orga-famille' });
            const point = l.createSpan({ cls: 'zfa-orga-point' });
            if (x.couleur) point.style.background = x.couleur;
            l.createSpan({ cls: 'zfa-orga-famille-nom', text: x.nom });
            const b = l.createSpan({ cls: 'zfa-orga-avancement est-large' });
            const r = b.createSpan();
            r.style.width = Math.round(100 * x.min / maxC) + '%';
            if (x.couleur) r.style.background = x.couleur;
            l.createSpan({ cls: 'zfa-orga-discret est-droite', text: this._duree(x.min) });
          }
        }
        if (reel.parTache.length) {
          c.createDiv({ cls: 'zfa-orga-sous-titre', text: tr('Les tâches qui ont reçu le plus de temps') });
          for (const x of reel.parTache) {
            const l = c.createDiv({ cls: 'zfa-orga-ligne' });
            const point = l.createSpan({ cls: 'zfa-orga-point' });
            point.style.background = this._couleur(x.tache);
            l.createSpan({ cls: 'zfa-orga-ref', text: x.ref + ' ' });
            this._lien(l, x.tache);
            l.createSpan({ cls: 'zfa-orga-discret est-droite', text: this._duree(x.min) });
          }
        }
      });
    }

    // Familles.
    this._section(el, 'familles', tr('Par famille'), null, (c) => {
      for (const f of d.familles) {
        const l = c.createDiv({ cls: 'zfa-orga-famille' });
        const point = l.createSpan({ cls: 'zfa-orga-point' });
        const fam = (this.greffon.familleDe && this.greffon.familleDe(f.famille)) || {};
        if (fam.couleur) point.style.background = fam.couleur;
        l.createSpan({ cls: 'zfa-orga-famille-nom', text: this._nomFamille(f.famille) });
        l.createSpan({ cls: 'zfa-orga-discret zfa-orga-famille-actives', text: f.actives + ' ' + tr('actives') });
        const b = l.createSpan({ cls: 'zfa-orga-avancement est-large', attr: { title: f.terminees + ' / ' + (f.total - f.abandonnees) } });
        b.createSpan().style.width = f.taux + '%';
        l.createSpan({ cls: 'zfa-orga-discret', text: f.taux + ' % ' + tr('terminées') });
        l.createSpan({ cls: 'zfa-orga-discret est-droite', text: this._duree(f.minutesSemaine) + tr(' cette semaine') });
      }
    });

    // Activité récente.
    this._section(el, 'activite', tr('Activité récente'), null, (c) => {
      if (!d.activite.length) {
        c.createDiv({ cls: 'zfa-orga-vide', text: tr('Le journal des modifications commence le 29 septembre 2026 : il se remplit au fil des jours.') });
        return;
      }
      const hier = Ariane.decalerJour(auj, -1);
      for (const a of d.activite) {
        const l = c.createDiv({ cls: 'zfa-orga-activite' });
        const jourE = String(a.le).slice(0, 10);
        const quand = jourE === auj ? tr('aujourd’hui') : jourE === hier ? tr('hier') : this._jourCourt(jourE);
        l.createSpan({ cls: 'zfa-orga-heure', text: quand + ' ' + String(a.le).slice(11, 16) });
        const corps = l.createDiv({ cls: 'zfa-orga-corps' });
        const t = this.greffon.fichierDeRef && this.greffon.fichierDeRef(a.ref);
        const ligne = corps.createDiv();
        ligne.createSpan({ cls: 'zfa-orga-ref', text: a.ref + ' ' });
        if (t) this._lien(ligne, { ref: a.ref, intitule: a.intitule || a.ref, fichier: t });
        else ligne.createSpan({ text: a.intitule || '' });
        corps.createDiv({ cls: 'zfa-orga-discret', text: a.phrase });
        if (a.origine) this._pastille(l, a.origine, 'origine');
      }
    });

    el.createDiv({ cls: 'zfa-orga-aide',
      text: tr('Pour aller plus loin, demandez à Claude, dans Claudian : « Fais le point sur mes tâches ».') });
  }
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
    // Rubriques repliées de la synthèse, et l'onglet montré quand la vue
    // est étroite (barre latérale) : « fil » ou « synthese ».
    this.replies = [];
    this.onglet = 'fil';
  }

  getViewType() { return TYPE_VUE_CHRONOLOGIE; }
  getDisplayText() { return tr("Chronologie d'activité"); }
  getIcon() { return 'history'; }

  getState() {
    return { periode: this.periode, ancre: this.ancre, filtre: this.filtre, dossier: this.dossier, replies: this.replies, onglet: this.onglet };
  }

  async setState(etat, resultat) {
    const e = etat || {};
    if (['jour', 'semaine', 'mois', 'annee'].includes(e.periode)) this.periode = e.periode;
    if (Ariane.jourValide(e.ancre)) this.ancre = e.ancre;
    if (['tout', 'notes', 'taches', 'captures', 'canevas', 'externe'].includes(e.filtre)) this.filtre = e.filtre;
    if (typeof e.dossier === 'string') this.dossier = e.dossier;
    if (Array.isArray(e.replies)) this.replies = e.replies.filter((x) => typeof x === 'string');
    if (e.onglet === 'fil' || e.onglet === 'synthese') this.onglet = e.onglet;
    await super.setState(etat, resultat);
    this.rafraichir();
  }

  async onOpen() {
    this.contentEl.addClass('zfa-chrono');
    await this.rafraichir();
  }

  _menuPeriode(ev) {
    const m = new obsidian.Menu();
    for (const [p, l, ic] of [['jour', 'Jour', 'calendar-days'], ['semaine', 'Semaine', 'calendar-range'],
      ['mois', 'Mois', 'calendar'], ['annee', 'Année', 'calendar-clock']]) {
      m.addItem((i) => i.setTitle(tr(l)).setIcon(ic).setChecked(this.periode === p).onClick(() => this._changer({ periode: p })));
    }
    m.addSeparator();
    m.addItem((i) => i.setTitle(tr("Aujourd'hui")).setIcon('locate').onClick(() => this._changer({ ancre: jourIsoDe(new Date()) })));
    m.showAtMouseEvent(ev);
  }

  _menuFiltre(ev) {
    const m = new obsidian.Menu();
    const etiquette = (t) => m.addItem((i) => { i.setTitle(t); if (i.setIsLabel) i.setIsLabel(true); else i.setDisabled(true); });
    etiquette(tr('Afficher'));
    for (const [f, l] of [['tout', 'Tout'], ['notes', 'Notes'], ['taches', 'Tâches'],
      ['captures', 'Captures'], ['canevas', 'Canevas et extraits'], ['externe', 'Hors Obsidian']]) {
      m.addItem((i) => i.setTitle(tr(l)).setChecked(this.filtre === f).onClick(() => this._changer({ filtre: f })));
    }
    m.addSeparator();
    etiquette(tr('Dossier'));
    m.addItem((i) => i.setTitle(tr('Tous les dossiers')).setChecked(!this.dossier).onClick(() => this._changer({ dossier: '' })));
    const noms = (this.app.vault.getRoot().children || []).filter((x) => x instanceof obsidian.TFolder && !x.name.startsWith('.'))
      .map((x) => x.name).sort((a, b) => a.localeCompare(b));
    if (this.dossier && !noms.includes(this.dossier)) noms.push(this.dossier);
    for (const n of noms) {
      m.addItem((i) => i.setTitle(n).setIcon('folder').setChecked(this.dossier === n).onClick(() => this._changer({ dossier: n })));
    }
    m.showAtMouseEvent(ev);
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
    let analyse = null;
    await Promise.all([
      this.greffon.evenementsChronologie(new Date(debut + 'T00:00:00').getTime(), new Date(fin + 'T00:00:00').getTime())
        .then((x) => { evts = x; }).catch((e) => console.error('[Ariane] chronologie', e)),
      this.greffon.analyseChronologie(b.debut, b.fin)
        .then((x) => { analyse = x; }).catch((e) => console.error('[Ariane] chronologie (analyses)', e)),
    ]);
    if (jeton !== this._jeton) return;
    this.dessiner(Ariane.grouperAjoutsAuto(evts), b, auj, departChaleur, analyse);
  }

  dessiner(evts, b, auj, departChaleur, analyse) {
    this._evts = evts;
    this._bornes = b;
    const c = this.contentEl;
    // Le journal prévient la vue à chaque nouvel événement : redessiner ne
    // doit pas ramener la lecture en haut de page.
    const defil = c.scrollTop;
    c.empty();
    c.toggleClass('montre-synthese', this.onglet === 'synthese');
    // En tête, comme le plan ou les rétroliens : les boutons de la vue, la
    // période, et (vue étroite) les onglets « Fil » et « Synthèse ». Le
    // reste : le fil et la synthèse côte à côte quand la place le permet.
    this._dessinerEntete(c.createDiv({ cls: 'zfa-chrono-entete' }), b, auj);
    const grille = c.createDiv({ cls: 'zfa-chrono-grille' });
    const princ = grille.createDiv({ cls: 'zfa-chrono-principal' });
    const cote = grille.createDiv({ cls: 'zfa-chrono-cote' });
    const t0 = new Date(b.debut + 'T00:00:00').getTime();
    const t1 = new Date(b.fin + 'T00:00:00').getTime();
    const dansPeriode = evts.filter((e) => e.t >= t0 && e.t < t1);
    this._dessinerFlux(princ, Ariane.filtrerChrono(dansPeriode, this.filtre, this.dossier), auj);
    const t2 = new Date(departChaleur + 'T00:00:00').getTime();
    this._dessinerChaleur(cote, Ariane.filtrerChrono(evts.filter((e) => e.t >= t2), this.filtre, this.dossier), auj);
    if (analyse) {
      this._dessinerTempsPeriode(cote, analyse);
      this._dessinerCategories(cote, analyse);
      this._dessinerTachesPeriode(cote, analyse);
      this._dessinerPrevuRealise(cote, analyse);
      this._dessinerRythmes(cote, analyse);
    }
    this._dessinerComptes(cote, Ariane.filtrerChrono(dansPeriode, 'tout', this.dossier));
    c.scrollTop = defil;
  }

  // L'en-tête : la rangée de boutons des panneaux d'Obsidian (période,
  // filtre, résumé de la période par l'IA), puis le titre de la période, ses
  // flèches, « Aujourd'hui » hors de la période courante, un rappel du
  // filtre quand il restreint, et les onglets de la vue étroite.
  _dessinerEntete(hote, b, auj) {
    const nav = hote.createDiv({ cls: 'nav-header' });
    const btns = nav.createDiv({ cls: 'nav-buttons-container' });
    const action = (ic, libelle, faire, actif) => {
      const x = btns.createDiv({ cls: 'clickable-icon nav-action-button' + (actif ? ' is-active' : ''), attr: { 'aria-label': libelle } });
      obsidian.setIcon(x, ic);
      x.onclick = faire;
    };
    action('calendar-range', tr('Période'), (ev) => this._menuPeriode(ev));
    action('filter', tr('Filtrer'), (ev) => this._menuFiltre(ev), this.filtre !== 'tout' || !!this.dossier);
    if (this.greffon.activiteDisponible && this.greffon.activiteDisponible()) {
      action('sparkles', tr('Résumer la période (IA)'), () => {
        const jours = [];
        for (let j = b.debut; j < b.fin; j = Ariane.decalerJour(j, 1)) jours.push(j);
        this.greffon.resumerJoursActivite(jours);
      });
    }
    action('refresh-cw', tr('Actualiser'), () => this.rafraichir());
    const tete = hote.createDiv({ cls: 'zfa-chrono-tete' });
    const icone = (nom, libelle, faire, inactif) => {
      const x = tete.createDiv({ cls: 'clickable-icon' + (inactif ? ' is-disabled' : ''), attr: { 'aria-label': libelle } });
      obsidian.setIcon(x, nom);
      x.onclick = () => { if (!inactif) faire(); };
      return x;
    };
    const titre = this._titrePeriode(b);
    tete.createDiv({ cls: 'zfa-chrono-titre', text: titre.charAt(0).toUpperCase() + titre.slice(1) });
    icone('chevron-left', tr('Précédent'), () => this._changer({ ancre: Ariane.decalerPeriode(this.periode, this.ancre, -1) }));
    icone('chevron-right', tr('Suivant'), () => this._changer({ ancre: Ariane.decalerPeriode(this.periode, this.ancre, 1) }), b.fin > auj);
    if (!(auj >= b.debut && auj < b.fin)) {
      const ici = tete.createEl('button', { cls: 'zfa-chrono-auj', text: tr("Aujourd'hui") });
      ici.onclick = () => this._changer({ ancre: auj });
    }
    const filtres = [];
    const LIBELLES = { notes: 'Notes', taches: 'Tâches', captures: 'Captures', canevas: 'Canevas et extraits', externe: 'Hors Obsidian' };
    if (this.filtre !== 'tout') filtres.push(tr(LIBELLES[this.filtre] || this.filtre));
    if (this.dossier) filtres.push(this.dossier);
    if (filtres.length) {
      const f = hote.createDiv({ cls: 'zfa-chrono-filtre-actif' });
      obsidian.setIcon(f.createSpan({ cls: 'zfa-chrono-filtre-ic' }), 'filter');
      f.createSpan({ text: filtres.join(', ') });
      const x = f.createSpan({ cls: 'clickable-icon zfa-chrono-filtre-x', attr: { 'aria-label': tr('Retirer le filtre') } });
      obsidian.setIcon(x, 'x');
      x.onclick = () => this._changer({ filtre: 'tout', dossier: '' });
    }
    if (!this.greffon.settings.chronoActif) {
      hote.createDiv({ cls: 'zfa-chrono-avis',
        text: tr("Le journal d'activité est désactivé (réglages, onglet Temps passé) : seule la reconstitution d'après les dates des fichiers s'affiche.") });
    }
    const ong = hote.createDiv({ cls: 'zfa-chrono-onglets' });
    for (const [o, l, ic] of [['fil', 'Fil', 'list'], ['synthese', 'Synthèse', 'chart-column']]) {
      const x = ong.createDiv({ cls: 'zfa-chrono-onglet' + (this.onglet === o ? ' is-active' : '') });
      obsidian.setIcon(x.createSpan({ cls: 'zfa-chrono-onglet-ic' }), ic);
      x.createSpan({ text: tr(l) });
      x.onclick = () => {
        if (this.onglet === o) return;
        this.onglet = o;
        this.contentEl.toggleClass('montre-synthese', o === 'synthese');
        for (const y of ong.children) y.toggleClass('is-active', y === x);
        this.contentEl.scrollTop = 0;
        this.app.workspace.requestSaveLayout();
      };
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
        const m = this._date(jour, { month: 'long', year: 'numeric' });
        hote.createDiv({ cls: 'zfa-chrono-mois', text: m.charAt(0).toUpperCase() + m.slice(1) });
      }
      const tj = hote.createDiv({ cls: 'zfa-chrono-jour' });
      const nom = jour === auj ? tr("Aujourd'hui") : this._date(jour, { weekday: 'long', day: 'numeric', month: 'long' });
      tj.createSpan({ cls: 'zfa-chrono-jour-nom', text: nom.charAt(0).toUpperCase() + nom.slice(1) });
      const n = totaux.get(jour) || liste.length;
      tj.createSpan({ cls: 'zfa-chrono-badge', text: String(n), attr: { 'aria-label': n + ' ' + (n > 1 ? tr('événements') : tr('événement')) } });
      const act = tj.createDiv({ cls: 'zfa-chrono-jour-actions' });
      const bouton = (icone, libelle, faire) => {
        const x = act.createEl('button', { cls: 'zfa-chrono-jour-bt', attr: { 'aria-label': libelle } });
        obsidian.setIcon(x.createSpan({ cls: 'zfa-chrono-jour-bt-ic' }), icone);
        x.createSpan({ text: libelle });
        x.onclick = faire;
        return x;
      };
      // Un jour avec du temps hors Obsidian : résumer ses créneaux, les
      // rattacher.
      if (liste.some((x) => x.type === 'activite')) {
        bouton('sparkles', tr('Résumer les créneaux'), () => this.greffon.resumerActivite(jour));
        bouton('link', tr('Rattacher'), () => this.greffon.ouvrirRattachementActivite(jour,
          this._hoteActivite().blocsDuJour(jour), this._hoteActivite()));
      }
      // Le bilan de la journée par l'IA : affiché sous le titre du jour.
      const bilan = hote.createDiv({ cls: 'zfa-chrono-bilan' });
      const btBilan = bouton('sunset', tr('Bilan de la journée'), async () => {
        btBilan.disabled = true;
        await this.greffon.resumerJournee(jour);
        btBilan.disabled = false;
      });
      this.greffon.resumeDeLaJournee(jour).then((t) => {
        if (!t) { bilan.remove(); return; }
        btBilan.lastChild.setText(tr('Refaire le bilan'));
        obsidian.setIcon(bilan.createSpan({ cls: 'zfa-chrono-bilan-ic' }), 'sunset');
        // Justifié, avec la césure du français pour éviter les lézardes.
        bilan.createDiv({ cls: 'zfa-chrono-bilan-texte', text: t, attr: { lang: 'fr' } });
      }).catch(() => bilan.remove());
      // Le temps passé dans chaque note ce jour-là, replié sur son total.
      const temps = hote.createDiv({ cls: 'zfa-chrono-temps' });
      this.greffon.tempsDuJour(jour).then((notes) => {
        if (!notes.length) { temps.remove(); return; }
        const total = notes.reduce((s, x) => s + x.min, 0);
        const tete = temps.createDiv({ cls: 'zfa-chrono-temps-tete' });
        obsidian.setIcon(tete.createSpan({ cls: 'zfa-chrono-temps-ic' }), 'timer');
        tete.createSpan({ cls: 'zfa-chrono-temps-titre', text: tr('Temps dans Obsidian') });
        tete.createSpan({ cls: 'zfa-chrono-temps-total', text: dureeLisible(total) });
        tete.createSpan({ cls: 'zfa-chrono-temps-n', text: notes.length + ' ' + (notes.length > 1 ? tr('notes') : tr('note')) });
        const chevron = tete.createSpan({ cls: 'zfa-chrono-temps-chevron' });
        obsidian.setIcon(chevron, 'chevron-right');
        const liste = temps.createDiv({ cls: 'zfa-chrono-temps-liste' });
        liste.hide();
        for (const x of notes) {
          const f = this.app.vault.getAbstractFileByPath(x.chemin);
          const l = liste.createDiv({ cls: 'zfa-chrono-temps-ligne' });
          const nom = l.createSpan({ cls: 'zfa-chrono-temps-nom' + (f instanceof obsidian.TFile ? '' : ' est-disparu'),
            text: f instanceof obsidian.TFile ? this.greffon._chronoTitreFichier(f) : x.chemin.replace(/\.md$/, '').split('/').pop() });
          l.createSpan({ cls: 'zfa-chrono-temps-duree', text: dureeLisible(x.min) });
          if (f instanceof obsidian.TFile) {
            nom.addEventListener('click', (ev) => this.app.workspace.getLeaf(!!(ev.metaKey || ev.ctrlKey)).openFile(f));
          }
        }
        tete.addEventListener('click', () => {
          const ouvert = !liste.isShown();
          liste.toggle(ouvert);
          temps.toggleClass('est-ouvert', ouvert);
        });
      }).catch(() => temps.remove());
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
    if (e.type === 'activite') { this._dessinerActivite(hote, e); return; }
    if (e.type === 'ajouts-auto') { this._dessinerLotAuto(hote, e); return; }
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
    const f = this.app.vault.getAbstractFileByPath(e.chemin);
    const existe = f instanceof obsidian.TFile;
    const titre = existe && f.extension === 'md' ? this.greffon._chronoTitreFichier(f) : (e.titre || e.chemin);
    const tete = carte.createDiv({ cls: 'zfa-chrono-carte-tete' });
    tete.createSpan({ cls: 'zfa-chrono-nom' + (existe ? '' : ' est-disparu'), text: titre });
    // Le genre et ses précisions, chacun dans sa propre étiquette.
    tete.createSpan({ cls: 'zfa-chrono-genre', text: tr(d.etiquette) });
    if (e.type === 'capture' && e.source) tete.createSpan({ cls: 'zfa-chrono-etiquette', text: e.source });
    if (e.type === 'canevas') tete.createSpan({ cls: 'zfa-chrono-etiquette', text: e.action === 'cree' ? tr('créé') : tr('modifié') });

    if (e.type === 'tache-terminee' || e.type === 'tache-abandonnee') {
      const st = carte.createDiv({ cls: 'zfa-chrono-chemin' });
      st.setText((e.de ? e.de + ' → ' : '→ ') + (e.vers || ''));
      if (e.raison) {
        const r = carte.createDiv({ cls: 'zfa-chrono-extrait' });
        r.createSpan({ cls: 'zfa-chrono-raison', text: tr('Raison : ') });
        r.createSpan({ text: e.raison });
      }
    } else {
      const meta = carte.createDiv({ cls: 'zfa-chrono-chemin' });
      meta.createSpan({ text: e.chemin });
      if (e.n) meta.createSpan({ cls: 'zfa-chrono-etiquette', text: e.n + ' ' + (e.n > 1 ? tr('lignes touchées') : tr('ligne touchée')) });
      if (e.extrait) carte.createDiv({ cls: 'zfa-chrono-extrait', text: e.extrait });
    }
    if (e.approx) {
      carte.setAttribute('aria-label', tr("Reconstitué d'après les dates du fichier : antérieur au journal d'activité."));
    }
    if (existe) {
      carte.addClass('est-cliquable');
      carte.addEventListener('click', (ev) => {
        this.app.workspace.getLeaf(!!(ev.metaKey || ev.ctrlKey)).openFile(f);
      });
      // Le menu d'Obsidian pour ce fichier (ouvrir, révéler, déplacer…),
      // enrichi par les greffons comme partout ailleurs.
      carte.addEventListener('contextmenu', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const m = new obsidian.Menu();
        m.addItem((i) => i.setTitle(tr('Ouvrir dans un nouvel onglet')).setIcon('file-plus')
          .onClick(() => this.app.workspace.getLeaf('tab').openFile(f)));
        m.addSeparator();
        this.app.workspace.trigger('file-menu', m, f, 'ariane-chronologie');
        m.showAtMouseEvent(ev);
      });
    }
  }

  // Un lot d'ajouts automatiques : une seule ligne, discrète, qui se déplie
  // sur la liste des notes.
  _dessinerLotAuto(hote, e) {
    const d = Ariane.typeChrono(e.type);
    const ligne = hote.createDiv({ cls: 'zfa-chrono-evt est-auto' + (e.approx ? ' est-approx' : '') });
    ligne.style.setProperty('--zfa-chrono-coul', d.couleur);
    const p = (x) => String(x).padStart(2, '0');
    const hm = (t) => { const h = new Date(t); return p(h.getHours()) + ':' + p(h.getMinutes()); };
    ligne.createDiv({ cls: 'zfa-chrono-heure', text: hm(e.t) });
    const rail = ligne.createDiv({ cls: 'zfa-chrono-rail' });
    obsidian.setIcon(rail.createDiv({ cls: 'zfa-chrono-pastille' }), d.icone);
    const carte = ligne.createDiv({ cls: 'zfa-chrono-carte est-cliquable' });
    const tete = carte.createDiv({ cls: 'zfa-chrono-carte-tete' });
    tete.createSpan({ cls: 'zfa-chrono-nom', text: e.n + ' ' + tr('notes ajoutées') });
    tete.createSpan({ cls: 'zfa-chrono-genre', text: tr(d.etiquette) });
    if (e.source || e.dossier) tete.createSpan({ cls: 'zfa-chrono-etiquette', text: e.source || e.dossier });
    const meta = carte.createDiv({ cls: 'zfa-chrono-chemin' });
    meta.setText(e.debut && hm(e.debut) !== hm(e.t) ? tr('de') + ' ' + hm(e.debut) + ' ' + tr('à') + ' ' + hm(e.t) : tr('en une fois'));
    const liste = carte.createDiv({ cls: 'zfa-chrono-lot' });
    liste.hide();
    let rempli = false;
    carte.addEventListener('click', (ev) => {
      if (ev.target.closest('.zfa-chrono-lot-el')) return;
      if (!rempli) {
        rempli = true;
        for (const x of e.elements.slice(0, 100)) {
          const f = this.app.vault.getAbstractFileByPath(x.chemin);
          const el = liste.createDiv({ cls: 'zfa-chrono-lot-el' + (f instanceof obsidian.TFile ? '' : ' est-disparu'), text: x.titre || x.chemin });
          if (f instanceof obsidian.TFile) {
            el.addEventListener('click', (ev2) => this.app.workspace.getLeaf(!!(ev2.metaKey || ev2.ctrlKey)).openFile(f));
          }
        }
        if (e.elements.length > 100) liste.createDiv({ cls: 'zfa-chrono-lot-plus', text: '+ ' + (e.elements.length - 100) });
      }
      liste.toggle(!liste.isShown());
    });
  }

  // Ce que la chronologie apporte aux actions communes sur le temps réel
  // (les mêmes que dans le calendrier, voir greffon 11m) : son
  // rafraîchissement et les créneaux d'un jour qu'elle a lus.
  _hoteActivite() {
    return {
      apres: () => this.rafraichir(),
      blocsDuJour: (jour) => (this._evts || []).filter((x) => x.type === 'activite' && x.jour === jour).map((x) => x.bloc),
    };
  }

  // Un créneau d'activité hors d'Obsidian : son résumé (ou sa catégorie), sa
  // catégorie à sa couleur, son temps actif, ses rattachements, et ce qui l'a
  // occupé. Un clic ouvre sa fiche.
  _dessinerActivite(hote, e) {
    const b = e.bloc;
    const ia = b.ia;
    const ligne = hote.createDiv({ cls: 'zfa-chrono-evt est-externe' + (ia && ia.personnel ? ' est-personnel' : '') });
    ligne.style.setProperty('--zfa-chrono-coul', b.couleur || 'var(--color-green)');
    ligne.createDiv({ cls: 'zfa-chrono-heure', text: b.debut.slice(11, 16) });
    const pastille = ligne.createDiv({ cls: 'zfa-chrono-rail' }).createDiv({ cls: 'zfa-chrono-pastille' });
    obsidian.setIcon(pastille, ia && ia.personnel ? 'coffee' : 'monitor');
    const carte = ligne.createDiv({ cls: 'zfa-chrono-carte est-cliquable' });
    const tete = carte.createDiv({ cls: 'zfa-chrono-carte-tete' });
    tete.createSpan({ cls: 'zfa-chrono-nom', text: (ia && ia.resume) || tr('Activité hors Obsidian') });
    tete.createSpan({ cls: 'zfa-chrono-genre', text: ia ? ia.categorie : b.categorie });
    const meta = carte.createDiv({ cls: 'zfa-chrono-chemin' });
    meta.createSpan({ text: b.debut.slice(11, 16) + ' → ' + b.fin.slice(11, 16) });
    meta.createSpan({ cls: 'zfa-chrono-etiquette', text: dureeLisible(b.actifMin) + tr(' actives') });
    for (const r of (b.rattache || [])) {
      const et = meta.createSpan({ cls: 'zfa-chrono-etiquette est-tache' });
      et.createSpan({ cls: 'zfa-chrono-tache-ref', text: r.ref });
      et.createSpan({ cls: 'zfa-chrono-tache-duree', text: dureeLisible(r.min) });
    }
    const det = (b.details || []).filter((x) => x.min > 0).slice(0, 4);
    if (det.length) carte.createDiv({ cls: 'zfa-chrono-extrait', text: det.map((x) => x.libelle + ' (' + dureeLisible(x.min) + ')').join('\n') });
    carte.addEventListener('click', () => this.greffon.ouvrirFicheActivite(e.jour, b, this._hoteActivite()));
    carte.addEventListener('contextmenu', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const m = new obsidian.Menu();
      this.greffon.remplirMenuActivite(m, e.jour, b, this._hoteActivite());
      m.showAtMouseEvent(ev);
    });
  }

  _dessinerChaleur(hote, evts, auj) {
    this._rubrique(hote, 'chaleur', tr('Activité des 10 dernières semaines'), (corps) => this._remplirChaleur(corps, evts, auj));
  }

  _remplirChaleur(hote, evts, auj) {
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

  _dessinerComptes(hote0, evts) {
    this._rubrique(hote0, 'types', tr('Par type'), (hote) => this._remplirComptes(hote, evts));
  }

  _remplirComptes(hote, evts) {
    const comptes = Ariane.comptesChrono(evts);
    const max = Math.max(1, ...Object.values(comptes));
    for (const d of Ariane.TYPES_CHRONO) {
      const l = hote.createDiv({ cls: 'zfa-chrono-compte' + (this.filtre === d.filtre ? ' is-active' : '') });
      l.style.setProperty('--zfa-chrono-coul', d.couleur);
      const tete = l.createDiv({ cls: 'zfa-chrono-compte-tete' });
      tete.createSpan({ cls: 'zfa-chrono-point' });
      tete.createSpan({ cls: 'zfa-chrono-compte-nom', text: tr(d.libelle) });
      tete.createSpan({ cls: 'zfa-chrono-compte-n', text: String(comptes[d.type]) });
      const barre = l.createDiv({ cls: 'zfa-chrono-barre' });
      barre.createDiv({ cls: 'zfa-chrono-barre-plein' }).style.width = (comptes[d.type] / max * 100) + '%';
      l.onclick = () => this._changer({ filtre: this.filtre === d.filtre ? 'tout' : d.filtre });
    }
  }

  // Une rubrique repliable de la colonne latérale ; l'état replié suit la
  // vue (getState). `remplir` reçoit le corps.
  _rubrique(hote, cle, titre, remplir) {
    const r = hote.createDiv({ cls: 'zfa-chrono-rub' + (this.replies.includes(cle) ? ' est-repliee' : '') });
    const t = r.createDiv({ cls: 'zfa-chrono-rubrique est-repliable' });
    t.createSpan({ text: titre });
    obsidian.setIcon(t.createSpan({ cls: 'zfa-chrono-rub-chevron' }), 'chevron-down');
    t.onclick = () => {
      const rep = !r.hasClass('est-repliee');
      r.toggleClass('est-repliee', rep);
      this.replies = rep ? this.replies.concat([cle]) : this.replies.filter((x) => x !== cle);
      this.app.workspace.requestSaveLayout();
    };
    remplir(r.createDiv({ cls: 'zfa-chrono-rub-corps' }));
  }

  // Une ligne « point, nom, valeur » et sa barre, comme « Par type ».
  _ligneBarre(hote, nom, valeur, part, couleur, opts) {
    const o = opts || {};
    const l = hote.createDiv({ cls: 'zfa-chrono-compte est-mesure' + (o.clic ? '' : ' est-inerte') });
    l.style.setProperty('--zfa-chrono-coul', couleur);
    const tete = l.createDiv({ cls: 'zfa-chrono-compte-tete' });
    tete.createSpan({ cls: 'zfa-chrono-point' + (o.hachure ? ' est-hachure' : '') });
    tete.createSpan({ cls: 'zfa-chrono-compte-nom', text: nom });
    tete.createSpan({ cls: 'zfa-chrono-compte-n', text: valeur });
    const barre = l.createDiv({ cls: 'zfa-chrono-barre' });
    if (o.prevu != null) barre.createDiv({ cls: 'zfa-chrono-barre-prevu' }).style.width = Math.min(100, o.prevu * 100) + '%';
    barre.createDiv({ cls: 'zfa-chrono-barre-plein' + (o.hachure ? ' est-hachure' : '') }).style.width = Math.min(100, part * 100) + '%';
    if (o.titre) l.setAttribute('aria-label', o.titre);
    if (o.clic) l.onclick = o.clic;
    return l;
  }

  // Le temps de la période : une barre empilée (Obsidian, hors Obsidian,
  // personnel) et sa légende.
  _dessinerTempsPeriode(hote, an) {
    const total = an.obsidian + an.externe + an.personnel;
    if (total < 1) return;
    this._rubrique(hote, 'temps', tr('Temps de la période'), (corps) => {
      corps.createDiv({ cls: 'zfa-chrono-total', text: dureeLisible(total) });
      const pile = corps.createDiv({ cls: 'zfa-chrono-pile' });
      const parts = [['obsidian', tr('Dans Obsidian'), an.obsidian], ['externe', tr('Hors Obsidian'), an.externe],
        ['personnel', tr('Personnel et distraction'), an.personnel]].filter((x) => x[2] >= 1);
      for (const [genre, nom, min] of parts) {
        const seg = pile.createDiv({ cls: 'zfa-chrono-pile-seg est-' + genre });
        seg.style.width = (min / total * 100) + '%';
        seg.setAttribute('aria-label', nom + ' : ' + dureeLisible(min));
      }
      const leg = corps.createDiv({ cls: 'zfa-chrono-legende' });
      for (const [genre, nom, min] of parts) {
        const l = leg.createDiv({ cls: 'zfa-chrono-legende-l' });
        l.createSpan({ cls: 'zfa-chrono-pile-seg est-' + genre + ' zfa-chrono-legende-pt' });
        l.createSpan({ cls: 'zfa-chrono-compte-nom', text: nom });
        l.createSpan({ cls: 'zfa-chrono-compte-n', text: dureeLisible(min) + ' (' + Math.round(min / total * 100) + ' %)' });
      }
      if (an.externeTronque) corps.createDiv({ cls: 'zfa-chrono-note', text: tr('Hors Obsidian : les 90 derniers jours seulement.') });
    });
  }

  // Le temps par catégorie : Obsidian, vos catégories d'activité, le personnel.
  _dessinerCategories(hote, an) {
    const cats = an.categories.filter((c) => c.min >= 1);
    if (cats.length < 2) return;
    this._rubrique(hote, 'categories', tr('Par catégorie'), (corps) => {
      const max = Math.max(...cats.map((c) => c.min));
      for (const c of cats.slice(0, 10)) {
        const nom = c.nom === 'Obsidian' ? tr('Dans Obsidian') : c.nom;
        this._ligneBarre(corps, nom, dureeLisible(c.min), c.min / max, c.couleur,
          { hachure: c.nom === 'Personnel et distraction' });
      }
    });
  }

  // Les tâches travaillées : temps réel (plein) face au temps prévu en
  // créneaux (contour) ; un clic ouvre la tâche.
  _dessinerTachesPeriode(hote, an) {
    const t = an.taches.filter((x) => x.min >= 1).slice(0, 8);
    if (!t.length) return;
    this._rubrique(hote, 'taches', tr('Tâches travaillées'), (corps) => {
      const max = Math.max(...t.map((x) => Math.max(x.min, x.prevu)));
      for (const x of t) {
        const f = x.tache.fichier;
        this._ligneBarre(corps, x.ref + ' ' + x.tache.intitule, dureeLisible(x.min), x.min / max, 'var(--interactive-accent)', {
          prevu: x.prevu ? x.prevu / max : null,
          titre: tr('Fait : ') + dureeLisible(x.min) + (x.prevu ? ', ' + tr('prévu en créneaux : ') + dureeLisible(x.prevu) : ''),
          clic: f ? (ev) => this.app.workspace.getLeaf(!!(ev.metaKey || ev.ctrlKey)).openFile(f) : null,
        });
      }
      if (t.some((x) => x.prevu)) {
        const n = corps.createDiv({ cls: 'zfa-chrono-note' });
        n.createSpan({ cls: 'zfa-chrono-barre-prevu est-temoin' });
        n.createSpan({ text: tr('contour : le temps prévu en créneaux') });
      }
    });
  }

  // Prévu et réalisé : la part des créneaux révolus effectivement faite, et
  // leur répartition (tenus, en partie, à peine entamés, laissés de côté).
  _dessinerPrevuRealise(hote, an) {
    const revolus = [];
    for (const j of an.jours) for (const c of j.creneaux) if (c.etat !== 'avenir') revolus.push(c);
    if (!revolus.length) return;
    this._rubrique(hote, 'prevu', tr('Prévu et réalisé'), (corps) => {
      const prevu = revolus.reduce((s2, c) => s2 + c.prevu, 0);
      const fait = revolus.reduce((s2, c) => s2 + Math.min(c.fait, c.prevu), 0);
      const tete = corps.createDiv({ cls: 'zfa-chrono-taux' });
      tete.createSpan({ cls: 'zfa-chrono-total', text: Math.round(fait / Math.max(1, prevu) * 100) + ' %' });
      tete.createSpan({ cls: 'zfa-chrono-compte-n', text: dureeLisible(fait) + ' ' + tr('sur') + ' ' + dureeLisible(prevu) });
      const etats = [['tenu', tr('Tenus'), 'var(--color-green)'], ['partie', tr('En partie'), 'var(--color-yellow)'],
        ['entame', tr('À peine entamés'), 'var(--color-orange)'], ['rien', tr('Laissés de côté'), 'var(--text-faint)']];
      const pile = corps.createDiv({ cls: 'zfa-chrono-pile' });
      for (const [e, nom, coul] of etats) {
        const n = revolus.filter((c) => c.etat === e).length;
        if (!n) continue;
        const seg = pile.createDiv({ cls: 'zfa-chrono-pile-seg' });
        seg.style.width = (n / revolus.length * 100) + '%';
        seg.style.background = coul;
        seg.setAttribute('aria-label', nom + ' : ' + n);
      }
      const leg = corps.createDiv({ cls: 'zfa-chrono-legende' });
      for (const [e, nom, coul] of etats) {
        const n = revolus.filter((c) => c.etat === e).length;
        if (!n) continue;
        const l = leg.createDiv({ cls: 'zfa-chrono-legende-l' });
        l.createSpan({ cls: 'zfa-chrono-legende-pt' }).style.background = coul;
        l.createSpan({ cls: 'zfa-chrono-compte-nom', text: nom });
        l.createSpan({ cls: 'zfa-chrono-compte-n', text: String(n) });
      }
      const avenir = an.jours.reduce((s2, j) => s2 + j.creneaux.filter((c) => c.etat === 'avenir').length, 0);
      if (avenir) corps.createDiv({ cls: 'zfa-chrono-note', text: avenir + ' ' + (avenir > 1 ? tr('créneaux encore à venir') : tr('créneau encore à venir')) });
    });
  }

  // Rythmes : quand le travail a lieu (jour de semaine par heure), et la
  // longueur des plages de travail sans interruption.
  _dessinerRythmes(hote, an) {
    const g = an.rythmes;
    let max = 0;
    let h0 = 24;
    let h1 = -1;
    for (const ligne of g) {
      ligne.forEach((v, h) => { if (v > 0) { max = Math.max(max, v); h0 = Math.min(h0, h); h1 = Math.max(h1, h); } });
    }
    if (!max) return;
    h0 = Math.min(h0, 8);
    h1 = Math.max(h1, 18);
    this._rubrique(hote, 'rythmes', tr('Rythmes'), (corps) => {
      const grille = corps.createDiv({ cls: 'zfa-chrono-rythmes' });
      grille.style.setProperty('--zfa-cols', String(h1 - h0 + 1));
      const jours = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
      const noms = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
      grille.createDiv();
      for (let h = h0; h <= h1; h++) grille.createDiv({ cls: 'zfa-chrono-rythmes-h', text: h % 3 === 0 ? String(h) : '' });
      g.forEach((ligne, js) => {
        grille.createDiv({ cls: 'zfa-chrono-rythmes-j', text: jours[js] });
        for (let h = h0; h <= h1; h++) {
          const v = ligne[h];
          const k = grille.createDiv({ cls: 'zfa-chrono-rythmes-c' });
          if (v > 0) {
            k.style.setProperty('--zfa-int', String(0.15 + 0.85 * v / max));
            k.addClass('est-plein');
            k.setAttribute('aria-label', tr(noms[js]) + ', ' + h + ' h : ' + dureeLisible(v));
          }
        }
      });
      const p = an.plages;
      if (p.n) {
        corps.createDiv({ cls: 'zfa-chrono-note', text: p.n + ' ' + (p.n > 1 ? tr('plages de travail') : tr('plage de travail'))
          + ', ' + dureeLisible(p.moyenne) + ' ' + tr('en moyenne') + ', ' + tr('la plus longue') + ' ' + dureeLisible(p.longue) });
      }
    });
  }

}

//#endregion 19 · Vues latérales (ItemView)


//#region 20 · Modales secondaires
// ═══════════════════════════════════════════════════════════════════════════
//  20 · MODALES SECONDAIRES
//  Choix de liste, rapport de carte, texte, voisinage, styles de modèle,
//  fusion d'auteurs.
// ═══════════════════════════════════════════════════════════════════════════

// Sélecteur générique à filtre (relations, types, concepts).
class ChoixListeModal extends obsidian.FuzzySuggestModal {
  constructor(app, titre, items, onChoix) {
    super(app);
    this.items = items || [];
    this.onChoix = onChoix;
    this.setPlaceholder(titre);
  }
  getItems() { return this.items; }
  getItemText(it) { return it.nom; }
  onChooseItem(it) { if (this.onChoix) this.onChoix(it); }
}

// Rapport de conformité d'une carte.
class RapportCarteModal extends obsidian.Modal {
  constructor(app, nom, analyse) { super(app); this.nom = nom; this.a = analyse; }
  onOpen() {
    const c = this.contentEl;
    c.createEl('h3', { text: 'Carte « ' + this.nom + ' »' });
    const a = this.a;
    const typés = a.blocs.filter((b) => b.type).length;
    const relTypées = a.liens.filter((l) => l.relation).length;
    c.createEl('p', {
      cls: 'zfa-dedup-info',
      text: a.blocs.length + ' bloc(s), dont ' + typés + ' typé(s) · '
        + a.liens.length + ' relation(s), dont ' + relTypées + ' conforme(s).',
    });
    if (!a.problemes.length) { c.createEl('p', { text: tr('Aucun problème détecté.') }); return; }
    const groupes = {
      'lien-muet': tr('Flèches sans étiquette'),
      'hors-vocabulaire': tr('Étiquettes hors vocabulaire'),
      soupape: tr('Liens non typés (soupape)'),
      'bloc-sans-type': tr('Blocs sans type'),
      'type-inconnu': tr('Types inconnus'),
    };
    const liste = c.createDiv();
    liste.style.maxHeight = '50vh';
    liste.style.overflow = 'auto';
    for (const [cle, titre] of Object.entries(groupes)) {
      const items = a.problemes.filter((p) => p.type === cle);
      if (!items.length) continue;
      liste.createEl('h4', { text: titre + ' (' + items.length + ')' });
      const ul = liste.createEl('ul');
      for (const it of items.slice(0, 60)) ul.createEl('li', { text: it.texte });
      if (items.length > 60) liste.createEl('p', { cls: 'zfa-dedup-info', text: '…et ' + (items.length - 60) + ' autre(s).' });
    }
  }
  onClose() { this.contentEl.empty(); }
}

// Affichage d'un texte (DSL) avec copie.
class TexteModal extends obsidian.Modal {
  constructor(app, titre, texte) { super(app); this.titre = titre; this.texte = texte; }
  onOpen() {
    const c = this.contentEl;
    c.createEl('h3', { text: this.titre });
    const ta = c.createEl('textarea', { cls: 'zfa-dsl-zone' });
    ta.value = this.texte;
    ta.rows = 18;
    const pied = c.createDiv({ cls: 'zfa-dedup-pied' });
    const b = pied.createEl('button', { text: tr('Copier') });
    b.onclick = () => { navigator.clipboard.writeText(this.texte); new obsidian.Notice(tr('DSL copié.')); };
  }
  onClose() { this.contentEl.empty(); }
}

// Voisinage d'un concept dans le graphe agrégé.
class VoisinageModal extends obsidian.Modal {
  constructor(app, concept, sortants, entrants, plugin) {
    super(app); this.concept = concept; this.sortants = sortants; this.entrants = entrants; this.plugin = plugin;
  }
  onOpen() {
    const c = this.contentEl;
    c.createEl('h3', { text: this.concept });
    const bloc = (titre, liens, sens) => {
      c.createEl('h4', { text: titre + ' (' + liens.length + ')' });
      if (!liens.length) { c.createEl('p', { cls: 'zfa-dedup-info', text: tr('—') }); return; }
      const ul = c.createEl('ul');
      for (const l of liens) {
        const et = l.etiquette && l.etiquette.trim() ? l.etiquette.trim() : '?';
        const autre = sens === 'sortant' ? l.vers : l.de;
        const li = ul.createEl('li');
        li.createSpan({ text: sens === 'sortant' ? '— ' + et + ' → ' : '← ' + et + ' — ' });
        li.createSpan({ text: autre, cls: 'zfa-voisin-cible' });
        li.createSpan({ cls: 'zfa-dedup-info', text: '   [' + l.carte + ']' });
      }
    };
    const zone = c.createDiv();
    zone.style.maxHeight = '55vh';
    zone.style.overflow = 'auto';
    bloc(tr('Relations sortantes'), this.sortants, 'sortant');
    bloc(tr('Relations entrantes'), this.entrants, 'entrant');
  }
  onClose() { this.contentEl.empty(); }
}

class StylesModeleModal extends obsidian.Modal {
  constructor(app, noms) { super(app); this.noms = Array.isArray(noms) ? noms : []; }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Styles du modèle Word (' + this.noms.length + ')' });
    contentEl.createEl('p', { text: tr('Copiez le nom exact du style voulu dans les champs de mapping des réglages.'), cls: 'zfa-dedup-info' });
    const liste = contentEl.createDiv();
    liste.style.maxHeight = '52vh';
    liste.style.overflow = 'auto';
    for (const n of this.noms) {
      const row = liste.createDiv({ cls: 'zfa-style-row' });
      row.createSpan({ text: n });
      const b = row.createEl('button', { text: tr('Copier') });
      b.onclick = () => { navigator.clipboard.writeText(n); new obsidian.Notice(tr('Copié : ') + n); };
    }
  }
  onClose() { this.contentEl.empty(); }
}

class FusionAuteursModal extends obsidian.Modal {
  constructor(app, plugin, conflits, clusters, dossier) {
    super(app);
    this.plugin = plugin; this.conflits = conflits; this.dossier = dossier;
    this.choix = clusters.map((grp) => ({ membres: grp, inclure: true, canon: meilleurCanonique(grp) }));
  }
  onOpen() {
    const c = this.contentEl;
    c.createEl('h3', { text: tr("Fusionner les doublons d'auteurs") });
    if (this.conflits.length) {
      c.createEl('p', { text: this.conflits.length + ' copie(s) de conflit à supprimer :' });
      const ul = c.createEl('ul');
      for (const cf of this.conflits) ul.createEl('li', { text: cf.nom });
    }
    if (this.choix.length) {
      c.createEl('p', { text: this.choix.length + ' groupe(s) de variantes. Décochez ceux à ne pas fusionner ; choisissez la fiche à conserver.' });
      this.choix.forEach((ch) => {
        const box = c.createDiv({ cls: 'zfa-dedup-ligne' });
        const cb = box.createEl('input', { type: 'checkbox' }); cb.checked = ch.inclure;
        cb.onchange = () => { ch.inclure = cb.checked; };
        const sel = box.createEl('select', { cls: 'dropdown' });
        for (const m of ch.membres) { const o = sel.createEl('option', { text: m, value: m }); if (m === ch.canon) o.selected = true; }
        sel.onchange = () => { ch.canon = sel.value; };
        box.createSpan({ cls: 'zfa-dedup-info', text: ' ← conserver ; fusionne : ' + ch.membres.join(', ') });
      });
    } else {
      c.createEl('p', { text: tr('Aucune variante de nom détectée.') });
    }
    const pied = c.createDiv({ cls: 'zfa-dedup-pied' });
    const ok = pied.createEl('button', { text: tr('Fusionner'), cls: 'mod-cta' });
    ok.onclick = () => this.executer();
    pied.createEl('button', { text: tr('Annuler') }).onclick = () => this.close();
  }
  async executer() {
    this.close();
    const notice = new obsidian.Notice(tr('Fusion des auteurs…'), 0);
    try {
      if (this.conflits.length) await this.plugin.supprimerConflitsAuteurs(this.conflits, this.dossier);
      let n = 0;
      for (const ch of this.choix) {
        if (!ch.inclure) continue;
        const variantes = ch.membres.filter((m) => m !== ch.canon);
        if (variantes.length) { await this.plugin.fusionnerCluster(ch.canon, variantes, this.dossier); n += variantes.length; }
      }
      notice.hide();
      new obsidian.Notice(tr('Auteurs : ') + this.conflits.length + ' conflit(s) supprimé(s), ' + n + ' variante(s) fusionnée(s).');
    } catch (e) { notice.hide(); new obsidian.Notice(tr('Fusion — échec : ') + (e && e.message ? e.message : e)); console.error('[Ariane] fusion auteurs', e); }
  }
  onClose() { this.contentEl.empty(); }
}

// Choix de l'icône d'une vue de base : une grille de toutes les icônes
// qu'Obsidian connaît, filtrée au fil de la frappe. La liste vient du
// logiciel (getIconIds), pas d'un catalogue recopié ici : les icônes
// qu'un autre greffon ajoute s'y trouvent donc aussi.
class ModaleChoixIcone extends obsidian.Modal {
  constructor(app, sujet, valeur, onChoix) {
    super(app);
    this.sujet = String(sujet || '');
    this.valeur = String(valeur || '');
    this.onChoix = onChoix;
    this.PLAFOND = 240;
  }

  // Les noms d'icônes, « lucide- » retiré : c'est ainsi qu'on les écrit.
  static disponibles() {
    const brut = typeof obsidian.getIconIds === 'function' ? obsidian.getIconIds() : [];
    const noms = new Set();
    for (const id of brut) noms.add(String(id).replace(/^lucide-/, ''));
    return [...noms].sort();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('zfa-icones');
    contentEl.createEl('h3', { text: tr('Icône de la vue') });
    contentEl.createEl('p', { cls: 'zfa-aide', text: this.sujet });

    const champ = contentEl.createEl('input', { cls: 'zfa-icones-recherche', type: 'text' });
    champ.placeholder = tr('Chercher une icône : livre, users, flask…');
    const compte = contentEl.createDiv({ cls: 'zfa-aide zfa-icones-compte' });
    const grille = contentEl.createDiv({ cls: 'zfa-icones-grille' });

    const tous = ModaleChoixIcone.disponibles();
    const choisir = (nom) => { this.close(); this.onChoix(nom); };

    const dessiner = () => {
      grille.empty();
      const q = champ.value.trim().toLowerCase();
      const trouves = q ? tous.filter((n) => n.includes(q)) : tous;
      for (const nom of trouves.slice(0, this.PLAFOND)) {
        const b = grille.createEl('button', { cls: 'zfa-icone-case' });
        obsidian.setIcon(b, nom);
        b.setAttribute('aria-label', nom);
        if (typeof obsidian.setTooltip === 'function') obsidian.setTooltip(b, nom);
        b.toggleClass('est-choisie', nom === this.valeur);
        b.onclick = () => choisir(nom);
      }
      compte.textContent = trouves.length > this.PLAFOND
        ? trouves.length + tr(' icônes trouvées, les ') + this.PLAFOND + tr(' premières sont montrées.')
        : trouves.length + tr(' icône(s).');
    };
    champ.addEventListener('input', dessiner);
    champ.addEventListener('keydown', (e) => {
      // Entrée sur une recherche qui ne laisse qu'une icône : on la prend.
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const seule = grille.querySelector('.zfa-icone-case');
      if (seule && grille.children.length === 1) choisir(seule.getAttribute('aria-label'));
    });
    dessiner();

    const boutons = contentEl.createDiv({ cls: 'modal-button-container' });
    boutons.createEl('button', { text: tr('Rendre l’icône d’origine') }).onclick = () => choisir('');
    boutons.createEl('button', { text: tr('Annuler') }).onclick = () => this.close();
    window.setTimeout(() => champ.focus(), 0);
  }

  onClose() { this.contentEl.empty(); }
}

// ── Fiche d'un créneau d'activité réelle (ActivityWatch) ─────────────────
//  Ouverte d'un clic sur la bande d'activité de la vue semaine : ce qui a
//  occupé le créneau, son résumé, et ce qu'on peut en faire. Le corriger
//  (catégorie), le faire résumer, ou le rattacher à une tâche, pour que ce
//  temps réel devienne un créneau de la tâche.
//  o : { jour, bloc, surRattacher() }

class ModaleActiviteReelle extends obsidian.Modal {
  constructor(greffon, o) {
    super(greffon.app);
    this.greffon = greffon;
    this.o = o || {};
  }

  async onOpen() {
    const { contentEl } = this;
    const b = this.o.bloc;
    const jour = this.o.jour;
    if (this.modalEl) this.modalEl.addClass('zfa-act-modale');
    const jl = new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    this.titleEl.setText(jl.charAt(0).toUpperCase() + jl.slice(1) + ', '
      + b.debut.slice(11, 16) + ' → ' + b.fin.slice(11, 16));
    contentEl.empty();

    const tete = contentEl.createDiv({ cls: 'zfa-act-tete' });
    const ia = b.ia;
    const puce = tete.createSpan({ cls: 'zfa-act-cat', text: ia ? ia.categorie : b.categorie });
    puce.style.setProperty('--zfa-cal-coul', b.couleur);
    tete.createSpan({ cls: 'zfa-act-meta', text: dureeLisible(b.actifMin) + tr(' actives')
      + (ia ? (ia.manuel ? tr(', catégorie corrigée') : tr(', classé par l\'IA')) : tr(', classé par vos règles')) });
    if (ia && ia.personnel) tete.createSpan({ cls: 'zfa-act-perso', text: tr('personnel') });

    const res = contentEl.createDiv({ cls: 'zfa-act-resume' });
    if (ia && ia.resume) res.setText(ia.resume);
    else res.createSpan({ cls: 'zfa-act-vide', text: tr('Pas encore résumé.') });

    if (b.rattache && b.rattache.length) {
      contentEl.createDiv({ cls: 'zfa-act-sous-titre', text: tr('Rattaché à') });
      const rt = contentEl.createDiv({ cls: 'zfa-act-survol-ratt' });
      for (const r of b.rattache) {
        const l = rt.createDiv({ cls: 'zfa-act-survol-ratt-l' });
        obsidian.setIcon(l.createSpan({ cls: 'zfa-act-survol-bt-ic' }), 'link');
        l.createSpan({ text: r.ref + ' ' + (r.intitule || '') + ' (' + dureeLisible(r.min) + ')' });
        l.addEventListener('click', () => {
          const f = this.greffon.fichierDeRef && this.greffon.fichierDeRef(r.ref);
          if (f) { this.close(); this.app.workspace.getLeaf(false).openFile(f); }
        });
      }
    }

    // Corriger la catégorie : le choix est gardé comme un résumé, et l'IA ne
    // repasse plus dessus.
    const cats = this.greffon.categoriesIA();
    if (cats.length) {
      new obsidian.Setting(contentEl)
        .setName(tr('Catégorie'))
        .addDropdown((d) => {
          d.addOption('', ia ? '' : tr('(celle des règles : ') + b.categorie + ')');
          for (const c of cats) d.addOption(c.nom, c.nom);
          d.setValue(ia ? ia.categorie : '');
          d.onChange(async (v) => {
            if (!v) return;
            await this.greffon.corrigerCategorieActivite(b.cle, v);
            this.close();
          });
        });
    }

    contentEl.createDiv({ cls: 'zfa-act-sous-titre', text: tr('Ce qui a occupé ce créneau') });
    const liste = contentEl.createDiv({ cls: 'zfa-act-liste' });
    liste.createDiv({ cls: 'zfa-act-vide', text: tr('Lecture du relevé…') });
    try {
      const contenu = await this.greffon.contenuBlocActivite(jour, b);
      liste.empty();
      if (!contenu.length) liste.createDiv({ cls: 'zfa-act-vide', text: tr('Rien dans le relevé.') });
      for (const x of contenu) {
        const l = liste.createDiv({ cls: 'zfa-act-ligne' });
        l.createSpan({ cls: 'zfa-act-min', text: x.min + ' min' });
        l.createSpan({ cls: 'zfa-act-app', text: x.app });
        const t = l.createSpan({ cls: 'zfa-act-titre', text: x.titre && x.titre !== x.app ? x.titre : '' });
        if (x.domaine) t.createSpan({ cls: 'zfa-act-domaine', text: x.domaine });
      }
    } catch (e) {
      liste.empty();
      liste.createDiv({ cls: 'zfa-act-vide', text: tr('Relevé illisible : ') + ((e && e.message) || e) });
    }

    const pied = contentEl.createDiv({ cls: 'zfa-act-pied' });
    const btIA = pied.createEl('button', { text: ia ? tr('Résumer à nouveau (IA)') : tr('Résumer (IA)') });
    btIA.onclick = async () => {
      btIA.disabled = true; btIA.setText(tr('Résumé…'));
      await this.greffon.resumerActivite(jour, { cle: b.cle });
      this.close();
    };
    if (this.o.surRattacher) {
      const btT = pied.createEl('button', { cls: 'mod-cta', text: b.rattache && b.rattache.length ? tr('Modifier les rattachements…') : tr('Rattacher à une tâche…') });
      btT.onclick = () => { this.close(); this.o.surRattacher(); };
    }
  }

  onClose() { this.contentEl.empty(); }
}

// Sommaire de lecture : l'aperçu de la page à imprimer, ses quelques
// réglages, et l'impression (dialogue de macOS, qui enregistre aussi en PDF).
class ModaleSommaireLecture extends obsidian.Modal {
  constructor(app, greffon, source) {
    super(app);
    this.greffon = greffon;
    this.source = source;
    this.tri = 'page';
    this.colonnes = Number(greffon.settings.sommaireColonnes) === 2 ? 2 : 1;
    this.sortie = greffon.settings.sommaireSortie === 'a4' ? 'a4' : 'fiche';
  }

  _html(imprimer) {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const entrees = Ariane.trierSommaire(this.greffon.annotationsPourSommaire(this.source.cle), this.tri);
    return Ariane.pageSommaireLecture({
      titre: Ariane.titreCourtOuvrage(this.source.titre), citation: this.source.citation,
      date: p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear(),
      entrees, colonnes: this.colonnes, sortie: this.sortie, imprimer,
    });
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass('zfa-sommaire-modale');
    this.setTitle ? this.setTitle(tr('Sommaire de lecture')) : contentEl.createEl('h3', { text: tr('Sommaire de lecture') });
    const aide = contentEl.createDiv({ cls: 'setting-item-description zfa-sommaire-aide' });
    const majAide = () => aide.setText(this.sortie === 'a4'
      ? tr('Fiches de 10 × 15 cm, trois par feuille A4 à découper. Imprimez en recto verso, reliure bord long, à 100 % (sans ajustement à la page) : chaque verso tombe au dos de son recto.')
      : tr('Au format des fiches graphiques (10 × 15 cm), une fiche par page, recto verso.'));
    majAide();
    const reglages = contentEl.createDiv({ cls: 'zfa-sommaire-reglages' });
    new obsidian.Setting(reglages).setName(tr('Sortie'))
      .addDropdown((d) => d.addOptions({ fiche: tr('Fiche 10 × 15'), a4: tr('A4 à découper') }).setValue(this.sortie).onChange(async (v) => {
        this.sortie = v;
        this.greffon.settings.sommaireSortie = v;
        await this.greffon.saveSettings();
        majAide();
        this._apercu();
      }));
    new obsidian.Setting(reglages).setName(tr('Colonnes'))
      .addDropdown((d) => d.addOptions({ 1: '1', 2: '2' }).setValue(String(this.colonnes)).onChange(async (v) => {
        this.colonnes = Number(v);
        this.greffon.settings.sommaireColonnes = this.colonnes;
        await this.greffon.saveSettings();
        this._apercu();
      }));
    new obsidian.Setting(reglages).setName(tr('Ordre'))
      .addDropdown((d) => d.addOptions({ page: tr('Par page'), ordre: tr('Ordre de lecture') }).setValue(this.tri)
        .onChange((v) => { this.tri = v; this._apercu(); }));
    this.cadre = contentEl.createEl('iframe', { cls: 'zfa-sommaire-apercu', attr: { title: tr('Aperçu') } });
    this._apercu();
    const pied = contentEl.createDiv({ cls: 'modal-button-container' });
    const nav = pied.createEl('button', { text: tr('Ouvrir dans le navigateur') });
    nav.onclick = () => this._navigateur();
    const imp = pied.createEl('button', { cls: 'mod-cta', text: tr('Imprimer…') });
    imp.onclick = () => {
      try { this.cadre.contentWindow.focus(); this.cadre.contentWindow.print(); } catch (e) { this._navigateur(); }
    };
  }

  _apercu() { this.cadre.srcdoc = this._html(false); }

  // Repli : la page dans le navigateur, qui ouvre aussitôt son impression.
  async _navigateur() {
    try {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      const nom = 'Sommaire ' + this.source.reference.replace(/[\\/:*?"<>|]+/g, ' ') + '.html';
      const chemin = path.join(os.tmpdir(), nom);
      fs.writeFileSync(chemin, this._html(true), 'utf8');
      await require('electron').shell.openPath(chemin);
    } catch (e) {
      new obsidian.Notice(tr('Ouverture impossible : ') + ((e && e.message) || e));
    }
  }

  onClose() { this.contentEl.empty(); }
}

//#endregion 20 · Modales secondaires


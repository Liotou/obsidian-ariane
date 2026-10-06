//#region 13 · Modales de tâche
// ═══════════════════════════════════════════════════════════════════════════
//  13 · MODALES DE TÂCHE
//  Confirmation de rattachement (anti-homonymie), choix de source Zotero,
//  formulaire de tâche (création + édition), saisie de dates.
// ═══════════════════════════════════════════════════════════════════════════

class ConfirmationRattachement extends obsidian.Modal {
  constructor(app, texte, onChoix) {
    super(app);
    this.texte = texte;
    this.onChoix = onChoix;
    this.repondu = false;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: tr('Ariane — rattachement') });
    contentEl.createEl('p', { text: this.texte });
    const row = contentEl.createDiv();
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.justifyContent = 'flex-end';
    row.style.marginTop = '14px';
    const non = row.createEl('button', { text: tr('Ignorer') });
    non.addEventListener('click', () => this.repondre(false));
    const oui = row.createEl('button', { text: tr('Confirmer') });
    oui.addClass('mod-cta');
    oui.addEventListener('click', () => this.repondre(true));
  }
  repondre(v) {
    if (this.repondu) return;
    this.repondu = true;
    this.close();
    this.onChoix(v);
  }
  onClose() {
    this.contentEl.empty();
    if (!this.repondu) {
      this.repondu = true;
      this.onChoix(false);
    }
  }
}

// Fenêtre de choix de la fiche Zotero pour une référence suffixée (2005a/b).
class ChoixSourceModal extends obsidian.Modal {
  constructor(app, refNom, candidats, onChoix) {
    super(app);
    this.refNom = refNom;
    this.candidats = candidats;
    this.onChoix = onChoix;
    this.repondu = false;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Ariane — lier « ' + this.refNom + ' »' });
    contentEl.createEl('p', { text: tr('Choisissez la fiche Zotero correspondante :') });
    for (const c of this.candidats) {
      const etiquette = c.basename +
        (c.creatorsFull && c.creatorsFull.length ? '  —  ' + c.creatorsFull.join(', ') : '') +
        (c.titre ? '  —  ' + c.titre : '');
      const b = contentEl.createEl('button', { text: etiquette });
      b.style.display = 'block';
      b.style.width = '100%';
      b.style.textAlign = 'left';
      b.style.marginBottom = '6px';
      b.addEventListener('click', () => this.choisir(c.basename));
    }
    const row = contentEl.createDiv();
    row.style.textAlign = 'right';
    row.style.marginTop = '10px';
    const annuler = row.createEl('button', { text: tr('Annuler') });
    annuler.addEventListener('click', () => this.choisir(null));
  }
  choisir(v) {
    if (this.repondu) return;
    this.repondu = true;
    this.close();
    this.onChoix(v);
  }
  onClose() {
    this.contentEl.empty();
    if (!this.repondu) {
      this.repondu = true;
      this.onChoix(null);
    }
  }
}

/* ---------------- Tâche d'un créneau tracé dans le calendrier ----------- */

// On vient de tracer un créneau vierge dans la vue semaine : à quelle tâche
// l'attacher ? Sans rien taper, la liste s'ouvre sur les tâches les plus
// probables (Ariane.suggererTachesCreneau : travail récent, frise, échéance),
// chacune avec la raison de sa place ; la première est présélectionnée, et
// Entrée suffit. En tapant, on cherche parmi toutes les tâches actives.
// « Nouvelle tâche » n'est pas dans la liste, où il faudrait la chercher en
// défilant : c'est un bouton fixe de l'en-tête (⌘↵ au clavier), nommé
// d'après la saisie. Échap abandonne le créneau.
class ModaleTacheDuCreneau extends obsidian.SuggestModal {
  // o : { taches, jour, horaire, surChoix(ref), surNouvelle(texte), surAbandon() }
  constructor(app, greffon, o) {
    super(app);
    this.greffon = greffon;
    this.o = o || {};
    this.classees = Ariane.suggererTachesCreneau(this.o.taches || [], this.o.jour);
    this.choisi = false;
    this.limit = 60;
    this.setPlaceholder(tr('À quelle tâche attacher ce créneau ?'));
    if (this.setInstructions) {
      this.setInstructions([
        { command: '↑↓', purpose: tr('parcourir') },
        { command: '↵', purpose: tr('attacher') },
        { command: '⌘↵', purpose: tr('nouvelle tâche') },
        { command: 'échap', purpose: tr('abandonner le créneau') },
      ]);
    }
    this.emptyStateText = tr('Aucune tâche ne correspond : ⌘↵ pour en créer une.');
    if (this.modalEl) {
      this.modalEl.addClass('zfa-tc-modale');
      const tete = this.modalEl.createDiv({ cls: 'zfa-tc-tete' });
      obsidian.setIcon(tete.createSpan({ cls: 'zfa-tc-tete-icone' }), 'calendar-clock');
      tete.createSpan({ cls: 'zfa-tc-tete-horaire', text: this.o.horaire || '' });
      this.boutonNouvelle = tete.createEl('button', { cls: 'zfa-tc-nouvelle' });
      obsidian.setIcon(this.boutonNouvelle.createSpan({ cls: 'zfa-tc-icone' }), 'plus');
      this.libelleNouvelle = this.boutonNouvelle.createSpan();
      this.boutonNouvelle.addEventListener('click', () => this.creerNouvelle());
      this.modalEl.prepend(tete);
      this.majNouvelle();
      // Le libellé suit la saisie : « Nouvelle tâche « rédiger… » ».
      if (this.inputEl) this.inputEl.addEventListener('input', () => this.majNouvelle());
    }
    if (this.scope) this.scope.register(['Mod'], 'Enter', (e) => { e.preventDefault(); this.creerNouvelle(); return false; });
  }

  saisie() { return String((this.inputEl && this.inputEl.value) || '').trim(); }

  majNouvelle() {
    if (!this.libelleNouvelle) return;
    const q = this.saisie();
    this.libelleNouvelle.textContent = q
      ? tr('Nouvelle tâche « {t} »').replace('{t}', q.length > 28 ? q.slice(0, 27) + '…' : q)
      : tr('Nouvelle tâche');
  }

  creerNouvelle() {
    const texte = this.saisie();
    this.choisi = true;
    this.close();
    if (this.o.surNouvelle) this.o.surNouvelle(texte);
  }

  getSuggestions(requete) {
    const q = String(requete || '').trim();
    if (!q) return this.classees.slice(0, 40);
    const cherche = obsidian.prepareFuzzySearch(q);
    const trouvees = [];
    for (const c of this.classees) {
      const m = cherche(String(c.t.intitule || '') + ' ' + c.t.ref);
      if (m) trouvees.push({ c, m: m.score });
    }
    // La correspondance d'abord, la probabilité ensuite : ce qu'on tape prime.
    trouvees.sort((a, b) => (b.m - a.m) || (b.c.score - a.c.score));
    return trouvees.map((x) => x.c);
  }

  renderSuggestion(item, el) {
    el.addClass('zfa-tc-item');
    const t = item.t;
    const fam = (this.greffon.familleDe && this.greffon.familleDe(t.famille)) || {};
    const pastille = el.createSpan({ cls: 'zfa-tc-pastille' });
    if (fam.couleur) pastille.style.background = fam.couleur;
    el.createSpan({ cls: 'zfa-tc-titre', text: t.intitule || t.ref });
    if (item.raison) el.createSpan({ cls: 'zfa-tc-raison', text: item.raison });
    el.createSpan({ cls: 'zfa-tc-ref', text: t.ref });
  }

  onChooseSuggestion(item) {
    this.choisi = true;
    if (item && item.t && this.o.surChoix) this.o.surChoix(item.t.ref);
  }

  // Obsidian ferme la fenêtre AVANT d'annoncer le choix : on attend un tour
  // pour savoir si c'était un choix ou un abandon.
  onClose() {
    if (super.onClose) super.onClose();
    setTimeout(() => { if (!this.choisi && this.o.surAbandon) this.o.surAbandon(); }, 0);
  }
}

/* ---------------- Formulaire de tâche (création et modification) ------- */

class ModaleTache extends obsidian.Modal {
  // opts : { ref?, apres?(ref), defauts? }. Sans ref → création ; avec ref →
  // édition. `defauts` pré-remplit une création (intitule, parent, famille,
  // note…) : le canevas s'en sert pour créer une sous-tâche depuis une
  // connexion tirée d'une carte.
  constructor(app, greffon, opts) {
    super(app);
    this.greffon = greffon;
    this.ref = (opts && opts.ref) || null;
    this.apres = (opts && opts.apres) || null;
    this.repondu = false;
    this.familles = Array.isArray(greffon.settings.famillesTaches)
      ? greffon.settings.famillesTaches : [];
    this.v = {
      intitule: '', statut: 'à faire', priorite: '', debut: '', echeance: '', heure: '',
      avancement: 0, jalon: false, parent: '', note: '',
      famille: greffon.settings.familleTacheDefaut || 'action',
    };
    if (!this.ref && opts && opts.defauts) {
      for (const [k, val] of Object.entries(opts.defauts)) {
        if (val != null && val !== '' && Object.prototype.hasOwnProperty.call(this.v, k)) this.v[k] = val;
      }
    }
    this.props = {};
    this._noteInitiale = '';
  }

  async onOpen() {
    const { contentEl, titleEl } = this;
    contentEl.addClass('zfa-tache-modale');
    if (this.modalEl) this.modalEl.addClass('zfa-tache-fenetre');
    titleEl.setText(this.ref ? tr('Modifier la tâche') : tr('Nouvelle tâche'));
    this._comp = new obsidian.Component();
    this._comp.load();
    if (this.ref) await this._chargerDepuisNote();
    else this._synchroniserProps();
    this.corps = contentEl.createDiv();
    this._dessiner();
  }

  // Rend un aperçu Markdown formaté (comme dans une note) dans `el`.
  _rendreMarkdown(el, md) {
    el.empty();
    const texte = String(md || '').trim();
    if (!texte) { el.createEl('span', { cls: 'zfa-tache-note-vide', text: tr('L\'aperçu formaté apparaît ici.') }); return; }
    const src = this._cheminNote || (this.greffon.dossierT + '/_.md');
    try {
      const R = obsidian.MarkdownRenderer;
      if (R && typeof R.render === 'function') R.render(this.app, texte, el, src, this._comp);
      else if (R && typeof R.renderMarkdown === 'function') R.renderMarkdown(texte, el, src, this._comp);
      else el.setText(texte);
    } catch (e) { el.setText(texte); }
  }

  // Note de travail : la section d'en-tête, puis la zone de texte avec son
  // aperçu formaté dessous (redessiné à la frappe, avec un léger délai).
  _dessinerNote(nb) {
    const nl = nb.createEl('div', { cls: 'zfa-tache-note-tete' });
    const ni = nl.createSpan({ cls: 'zfa-tache-ic' });
    obsidian.setIcon(ni, 'text');
    nl.createSpan({ text: tr('Note de travail') });
    this._repliNote(nb.createDiv({ cls: 'zfa-tache-note-hote' }));
  }

  // La note de travail : une zone de texte et, dessous, l'aperçu formaté
  // (Markdown rendu comme dans une note), retouché à la frappe avec un léger
  // délai. C'est le comportement d'origine : l'essai d'un éditeur Markdown
  // embarqué (vraie MarkdownView dans la modale) a été abandonné —
  // l'éditeur hors espace de travail restait bancal (géométrie, caret,
  // habillage), voir la note du 2026-09-03 dans les mémoires du chantier.
  _repliNote(hote) {
    const na = hote.createEl('textarea', { cls: 'zfa-tache-note-zone' });
    na.rows = 5;
    na.placeholder = tr('Ce que vous voulez garder sous la main pour cette tâche. Markdown : **gras**, listes, [[liens]]…');
    na.value = this.v.note || '';
    const nap = hote.createEl('div', { cls: 'zfa-tache-note-apercu markdown-rendered' });
    this._rendreMarkdown(nap, this.v.note);
    clearTimeout(this._noteDeb);
    na.oninput = () => {
      this.v.note = na.value;
      clearTimeout(this._noteDeb);
      this._noteDeb = setTimeout(() => this._rendreMarkdown(nap, this.v.note), 250);
    };
  }

  async _chargerDepuisNote() {
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === this.ref);
    if (!f) return;
    this._cheminNote = f.path;
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const L = (con) => this.greffon._lireT(fm, con);
    const alias = [].concat(fm.aliases || []).map(String).filter(Boolean);
    this.v.intitule = alias[0] || this.ref;
    this.v.statut = L('statut') || 'à faire';
    this.v.priorite = L('priorite') || '';
    this.v.debut = L('debut') || '';
    this.v.echeance = L('echeance') || '';
    this.v.heure = String(L('heure') || '').trim();
    this.v.avancement = Number(L('avancement')) || 0;
    this.v.jalon = L('jalon') === true;
    this.v.parent = Ariane.refDeLien(L('parent') || '') || '';
    const fmN = Object.assign({}, fm, {
      famille: L('famille'), source: L('source'),
      livrable: L('livrable'), fichier: L('fichier'),
    });
    this.v.famille = Ariane.familleTache(fmN, this.familles,
      this.greffon.settings.familleTacheDefaut);
    this._fm = fm;
    this._synchroniserProps();
    try {
      this._noteInitiale = await this.greffon.lireNoteTache(this.ref);
      this.v.note = this._noteInitiale;
    } catch (e) { /* pas grave */ }
  }

  // Aligne this.props sur les propriétés de la famille courante : on garde ce
  // qui reste valable, on retire le reste, on amorce ce qui manque.
  _synchroniserProps() {
    const fam = this.familles.find((x) => x.id === this.v.famille);
    const conc = new Set(Ariane.CONCEPTS_TACHE);
    const garde = {};
    for (const p of (fam && fam.proprietes) || []) {
      const lu = this._fm
        ? (conc.has(p.cle) ? this.greffon._lireT(this._fm, p.cle) : this._fm[p.cle])
        : undefined;
      if (p.cle in this.props) garde[p.cle] = this.props[p.cle];
      else if (lu != null) garde[p.cle] = lu;
      else garde[p.cle] = '';
    }
    this.props = garde;
  }

  // Une ligne de réglage avec une icône Obsidian devant l'intitulé.
  _setting(parent, nom, icone, large) {
    const s = new obsidian.Setting(parent).setName(nom);
    if (large) s.setClass('zfa-tache-large');
    if (icone) {
      const ic = createSpan({ cls: 'zfa-tache-ic' });
      obsidian.setIcon(ic, icone);
      s.nameEl.prepend(ic);
    }
    return s;
  }

  // Une ligne pour une propriété générique : intitulé personnalisable dans les
  // réglages, icône fixe (Ariane.PROPS_GENERIQUES).
  _settingGen(parent, cle, large) {
    const d = Ariane.PROPS_GENERIQUES.find((p) => p.cle === cle) || {};
    return this._setting(parent, this.greffon.libelleGen(cle), d.icone, large);
  }

  _dessiner() {
    const c = this.corps;
    c.empty();

    // Intitulé : pleine largeur, en tête.
    this._settingGen(c, 'intitule', true)
      .addText((t) => t.setValue(this.v.intitule)
        .onChange((x) => { this.v.intitule = x; }));

    // Note de travail : on édite DANS le rendu — une vraie vue Markdown
    // Obsidian embarquée, comme une note en mode édition.
    const nb = c.createDiv({ cls: 'zfa-tache-note' });
    this._dessinerNote(nb);

    // Le reste des champs génériques, sur deux colonnes.
    const g = c.createDiv({ cls: 'zfa-tache-grille' });

    this._settingGen(g, 'famille').addDropdown((d) => {
      if (!this.familles.length) d.addOption('action', 'Action');
      for (const f of this.familles) d.addOption(f.id, f.nom || f.id);
      d.setValue(this.v.famille).onChange((x) => {
        this.v.famille = x;
        this._synchroniserProps();
        this._dessiner();
      });
    });

    this._settingGen(g, 'statut').addDropdown((d) => {
      for (const st of ['à faire', 'en cours', 'en attente', 'terminée', 'abandonnée']) {
        d.addOption(st, tr(st));
      }
      d.setValue(this.v.statut).onChange((x) => { this.v.statut = x; this._dessiner(); });
    });

    this._settingGen(g, 'terminee').addToggle((t) => t
      .setValue(this.v.statut === 'terminée')
      .onChange((x) => {
        if (x) this.v.statut = 'terminée';
        else if (this.v.statut === 'terminée') this.v.statut = 'à faire';
        this._dessiner();
      }));

    this._settingGen(g, 'priorite').addDropdown((d) => {
      d.addOption('', tr('(aucune)'));
      for (const p of ['haute', 'moyenne', 'basse']) d.addOption(p, tr(p));
      d.setValue(this.v.priorite).onChange((x) => { this.v.priorite = x; });
    });

    this._settingGen(g, 'jalon')
      .addToggle((t) => t.setValue(this.v.jalon)
        .onChange((x) => { this.v.jalon = x; this._dessiner(); }));

    if (!this.v.jalon) {
      this._settingGen(g, 'debut').addText((t) => {
        t.inputEl.type = 'date';
        t.setValue(this.v.debut).onChange((x) => { this.v.debut = x.trim(); });
      });
    }
    this._settingGen(g, 'echeance').addText((t) => {
      t.inputEl.type = 'date';
      t.setValue(this.v.echeance).onChange((x) => { this.v.echeance = x.trim(); });
    });
    if (!this.v.jalon && this.v.echeance) {
      this._settingGen(g, 'heure').setDesc(tr('Facultative — sinon rappel « journée entière ».'))
        .addText((t) => {
          t.inputEl.type = 'time';
          t.setValue(this.v.heure || '').onChange((x) => { this.v.heure = x.trim(); });
        });
    }

    this._settingGen(c, 'avancement', true)
      .addSlider((sl) => sl.setLimits(0, 100, 5).setDynamicTooltip()
        .setValue(Number(this.v.avancement) || 0)
        .onChange((x) => { this.v.avancement = x; }));

    this._settingGen(c, 'parent', true)
      .setDesc(this.v.parent || tr('aucune'))
      .addButton((b) => b.setButtonText(tr('Choisir…')).onClick(() => {
        const items = this.greffon.tachesPourGantt()
          .filter((t) => t.ref !== this.ref)
          .map((t) => ({ nom: t.intitule + '  (' + t.ref + ')', cle: t.ref }));
        if (!items.length) { new obsidian.Notice(tr('Aucune autre tâche.')); return; }
        new ChoixListeModal(this.app, tr('Tâche parente…'), items, (it) => {
          if (it) this.v.parent = it.cle;
          this._dessiner();
        }).open();
      }))
      .addExtraButton((b) => b.setIcon('x').setTooltip(tr('Détacher'))
        .onClick(() => { this.v.parent = ''; this._dessiner(); }));

    const fam = this.familles.find((x) => x.id === this.v.famille);
    const ps = (fam && fam.proprietes) || [];
    if (ps.length) {
      this._setting(c, tr('Propriétés de la famille : ') + (fam.nom || fam.id),
        fam.icone || 'shapes', true).setHeading();
      const gp = c.createDiv({ cls: 'zfa-tache-grille' });
      for (const p of ps) this._champProp(gp, p);
    }

    const pied = c.createDiv({ cls: 'zfa-tache-modale-pied' });
    if (!this.ref) {
      // Décrire la tâche d'une phrase plutôt que remplir les champs : on passe
      // la main à l'invite en langage naturel, l'intitulé déjà tapé en amorce.
      const ln = pied.createEl('button', { cls: 'zfa-tache-ln' });
      const ic = ln.createSpan({ cls: 'zfa-tache-ln-ic' });
      obsidian.setIcon(ic, 'sparkles');
      ln.createSpan({ text: tr('Créer en langage naturel…') });
      ln.onclick = () => {
        const texte = this.v.intitule || '';
        const apres = this.apres;
        this.repondu = true;
        this.close();
        new ModaleAjoutLN(this.greffon, { texte, apres }).open();
      };
    }
    pied.createEl('button', { text: tr('Annuler') }).onclick = () => this.close();
    const ok = pied.createEl('button', {
      cls: 'mod-cta', text: this.ref ? tr('Enregistrer') : tr('Créer') });
    ok.onclick = () => this._valider();
  }

  _champProp(c, p) {
    const type = Ariane.TYPE_FR_VERS_OBSIDIAN[p.type] || 'text';
    const s = new obsidian.Setting(c).setName(p.libelle || p.cle);
    // Les champs à sélecteur ou à liste tiennent mieux sur toute la largeur.
    if (type === 'link' || type === 'multitext') s.setClass('zfa-tache-large');
    const ICONES = { text: 'text', number: 'hash', date: 'calendar',
      checkbox: 'check-square', multitext: 'list', link: 'link' };
    const ic = createSpan({ cls: 'zfa-tache-ic' });
    obsidian.setIcon(ic, ICONES[type] || 'text');
    s.nameEl.prepend(ic);
    const cur = this.props[p.cle];
    if (type === 'checkbox') {
      s.addToggle((t) => t.setValue(cur === true || cur === 'true')
        .onChange((x) => { this.props[p.cle] = x; }));
    } else if (type === 'number') {
      s.addText((t) => {
        t.inputEl.type = 'number';
        t.setValue(cur === '' || cur == null ? '' : String(cur))
          .onChange((x) => { this.props[p.cle] = x === '' ? '' : Number(x); });
      });
    } else if (type === 'date') {
      s.addText((t) => {
        t.inputEl.type = 'date';
        t.setValue(cur ? String(cur) : '').onChange((x) => { this.props[p.cle] = x.trim(); });
      });
    } else if (type === 'multitext') {
      s.setDesc(tr('Valeurs séparées par des virgules.'));
      s.addText((t) => t.setValue(Array.isArray(cur) ? cur.join(', ') : (cur || ''))
        .onChange((x) => {
          this.props[p.cle] = x.split(',').map((z) => z.trim()).filter(Boolean);
        }));
    } else if (type === 'link') {
      s.setDesc(cur ? String(cur) : tr('aucune'));
      // Une « source » se cherche parmi les fiches Zotero (@…) ; le reste
      // parmi les notes ordinaires du coffre. Insensible à la casse : la clé
      // peut avoir été saisie « Source ».
      const zotero = String(p.cle || '').toLowerCase() === 'source';
      s.addButton((b) => b.setButtonText(tr('Choisir…')).onClick(() => {
        const items = zotero
          ? this.greffon.sourcesZoteroPourChoix()
          : this.greffon.notesPourChoix();
        if (!items.length) { new obsidian.Notice(tr('Aucune note à proposer.')); return; }
        new ChoixListeModal(this.app,
          zotero ? tr('Auteur, titre, année ou clé…') : tr('Note…'), items, (it) => {
            if (it) this.props[p.cle] = '[[' + it.cle + ']]';
            this._dessiner();
          }).open();
      }))
      .addExtraButton((b) => b.setIcon('x')
        .onClick(() => { this.props[p.cle] = ''; this._dessiner(); }));
    } else {
      s.addText((t) => t.setValue(cur == null ? '' : String(cur))
        .onChange((x) => { this.props[p.cle] = x; }));
    }
  }

  async _valider() {
    if (this.repondu) return;
    const titre = this.v.intitule.trim();
    if (!titre) {
      new obsidian.Notice(tr('Une tâche sans intitulé ne se retrouve pas.'));
      return;
    }
    this.repondu = true;
    if (this.v.jalon) this.v.debut = '';
    let ref = this.ref;
    if (!ref) {
      const chemin = await this.greffon.creerTache({ intitule: titre });
      ref = this.greffon.refDeChemin(chemin);
    }
    if (ref) {
      await this.greffon.renommerTitreTache(ref, titre);
      const champs = {
        statut: this.v.statut,
        terminee: this.v.statut === 'terminée',
        priorite: this.v.priorite,
        debut: this.v.debut,
        echeance: this.v.echeance,
        heure: this.v.jalon ? '' : (this.v.echeance ? this.v.heure : ''),
        avancement: Number(this.v.avancement) || 0,
        jalon: this.v.jalon === true,
        parent: this.v.parent ? '[[' + this.v.parent + ']]' : '',
        famille: this.v.famille,
      };
      // Un rattachement qui fermerait un cycle n'est pas appliqué (le reste l'est).
      if (this.v.parent && this.v.parent !== ref
        && this.greffon._lienFermeCycle({ de: this.v.parent, vers: ref, type: 'hier' })) {
        new obsidian.Notice(tr('Ce rattachement fermerait un cycle : il n’a pas été appliqué.'));
        delete champs.parent;
      }
      for (const [k, val] of Object.entries(this.props)) champs[k] = val;
      await this.greffon.majTache(ref, champs);
      if (String(this.v.note || '') !== String(this._noteInitiale || '')) {
        try { await this.greffon.ecrireNoteTache(ref, this.v.note); } catch (e) { /* rien */ }
      }
    }
    this.close();
    if (this.apres && ref) this.apres(ref);
  }

  onClose() {
    if (this._comp) { try { this._comp.unload(); } catch (e) { /* rien */ } }
    this.contentEl.empty();
  }
}

/* ---------------- Dater une tâche sans date (depuis la frise) --------- */

class ModaleDaterTache extends obsidian.Modal {
  constructor(app, ligne, sur) {
    super(app);
    this.ligne = ligne;
    this.sur = sur;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(tr('Dater la tâche'));
    contentEl.addClass('zfa-gantt-modale-date');
    contentEl.createEl('p', { cls: 'zfa-gantt-modale-sous',
      text: this.ligne.ref + ' · ' + this.ligne.intitule });

    const champ = (libelle, valeur) => {
      const l = contentEl.createEl('label', { cls: 'zfa-gantt-modale-champ' });
      l.createSpan({ text: libelle });
      const i = l.createEl('input', { type: 'date' });
      if (valeur) i.value = valeur;
      return i;
    };
    const d = champ(tr('Début'), this.ligne.debut || '');
    const e = champ(tr('Échéance'), this.ligne.echeance || '');
    setTimeout(() => d.focus(), 0);

    const pied = contentEl.createDiv({ cls: 'zfa-gantt-modale-pied' });
    const annuler = pied.createEl('button', { text: tr('Annuler') });
    annuler.onclick = () => this.close();
    const ok = pied.createEl('button', { cls: 'mod-cta', text: tr('Enregistrer') });
    ok.onclick = async () => {
      const debut = d.value || '';
      const echeance = e.value || '';
      if (!debut && !echeance) {
        new obsidian.Notice(tr('Indiquez au moins une date.'));
        return;
      }
      this.close();
      await this.sur({ debut, echeance });
    };
  }

  onClose() { this.contentEl.empty(); }
}

/* ---- Commentaire d'une session (créneau) ---------------------------- */

// Saisie du commentaire d'une session : stocké dans le bloc balisé
// <!-- ariane:creneaux --> de la note, colonne « Commentaire ».
class ModaleCommentaire extends obsidian.Modal {
  constructor(app, opts, sur) {
    super(app);
    this.opts = opts || {};
    this.sur = sur;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.opts.titre || tr('Commentaire de la session'));
    const l = contentEl.createEl('label', { cls: 'zfa-gantt-modale-champ' });
    l.createSpan({ text: tr('Commentaire') });
    const i = l.createEl('textarea', { cls: 'zfa-dsl-zone', text: this.opts.valeur || '' });
    i.rows = 3;
    setTimeout(() => { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 0);
    const valider = () => {
      this.close();
      this.sur(i.value.trim());
    };
    i.addEventListener('keydown', (e) => {
      // ⌘/Ctrl+Entrée valide (Entrée seul fait un retour à la ligne).
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); valider(); }
      e.stopPropagation();
    });
    const pied = contentEl.createDiv({ cls: 'zfa-gantt-modale-pied' });
    const annuler = pied.createEl('button', { text: tr('Annuler') });
    annuler.onclick = () => this.close();
    const ok = pied.createEl('button', { cls: 'mod-cta', text: this.opts.bouton || tr('Enregistrer') });
    ok.onclick = valider;
  }

  onClose() { this.contentEl.empty(); }
}

/* ---- Structurer un brouillon de tâches (IA) ------------------------- */

class ModaleStructurerTaches extends obsidian.Modal {
  constructor(greffon, opts) {
    super(greffon.app);
    this.greffon = greffon;
    const o = (typeof opts === 'string') ? { texte: opts } : (opts || {});
    this.texteInitial = o.texte || '';
    this.decouper = o.decouper || null;   // { ref, titre, famille, enfants:[] }
    this.arbre = null;
    this.vues = [];
  }

  async onOpen() {
    const c = this.contentEl;
    if (this.modalEl) this.modalEl.addClass('zfa-struct-modal');
    c.addClass('zfa-struct');
    this.titleEl.setText(this.decouper
      ? tr('Découper : ') + this.decouper.titre
      : tr('Structurer un brouillon de tâches'));
    c.createEl('p', { cls: 'zfa-struct-intro', text: this.decouper
      ? tr('L\'IA propose des sous-tâches ; vous les revoyez avant création.')
      : tr('L\'indentation du texte devient la hiérarchie. « Jalon : » marque un jalon, « BONUS / si le temps » une priorité basse. Aucune date n\'est créée sauf si elle figure dans le texte.') });

    const champ = c.createDiv({ cls: 'zfa-struct-champ' });
    champ.createEl('label', { cls: 'zfa-struct-label',
      text: this.decouper ? tr('Consignes (facultatif)') : tr('Brouillon') });
    this.zone = champ.createEl('textarea', { cls: 'zfa-struct-zone' });
    this.zone.rows = this.decouper ? 3 : 13;
    this.zone.placeholder = this.decouper
      ? tr('Ex. : privilégier des étapes courtes, une par séance de travail.')
      : 'Préparer la réunion trimestrielle\n\tRelire les comptes rendus précédents\n\tRédiger l\'ordre du jour (pas le temps pour les annexes)\n\tJalon : présentation aux partenaires\n\t\tEnvoyer un message pour fixer la date';
    this.zone.value = this.texteInitial;

    if (!this.decouper) {
      const reg = new obsidian.Setting(c)
        .setName(tr('Poser les tâches sur'))
        .setDesc(tr('Une vue articulation reçoit les cartes ; sinon les notes sont seulement créées.'));
      reg.addDropdown(async (d) => {
        d.addOption('', tr('— notes seulement —'));
        try {
          this.vues = await this.greffon.vuesArticulation();
          for (let i = 0; i < this.vues.length; i += 1) d.addOption(String(i), this.vues[i].nom);
        } catch (e) { /* pas grave */ }
        d.onChange((v) => { this._vueChoisie = v; });
      });
    }

    this.pied = c.createDiv({ cls: 'zfa-struct-actions' });
    this.btnAnalyse = this.pied.createEl('button', { cls: 'mod-cta',
      text: this.decouper ? tr('Proposer des sous-tâches') : tr('Analyser le brouillon') });
    this.btnAnalyse.onclick = () => this._analyser();

    this.apercu = c.createDiv({ cls: 'zfa-struct-apercu' });
  }

  async _analyser() {
    const texte = this.zone.value.trim();
    if (!this.decouper && !texte) { new obsidian.Notice(tr('Rien à analyser.')); return; }
    this.btnAnalyse.disabled = true;
    this.btnAnalyse.setText(tr('Analyse…'));
    try {
      const prompt = this.decouper
        ? this.greffon.promptDecoupage(this.decouper, texte)
        : this.greffon.promptStructuration(texte);
      const brut = await this.greffon.genererIA(prompt, 2400);
      const specs = Ariane.normaliserSpecsTaches(brut, {
        familles: new Set(this.greffon.famillesIA().map((f) => f.id)),
        defaut: this.decouper ? this.decouper.famille : (this.greffon.settings.familleTacheDefaut || 'action'),
        dates: Ariane.datesDansTexte(texte),
      });
      if (!specs.length) { new obsidian.Notice(tr('L\'IA n\'a produit aucune tâche exploitable.')); return; }
      const marquer = (n) => { n.inclus = true; (n.enfants || []).forEach(marquer); };
      specs.forEach(marquer);
      this.arbre = specs;
      this._rendreApercu();
    } finally {
      this.btnAnalyse.disabled = false;
      this.btnAnalyse.setText(this.decouper ? tr('Reproposer') : tr('Ré-analyser'));
    }
  }

  _rendreApercu() {
    this.apercu.empty();
    const familles = this.greffon.famillesIA();
    const compter = (l) => l.reduce((s, n) => s + (n.inclus !== false ? 1 + compter(n.enfants || []) : 0), 0);

    const tete = this.apercu.createDiv({ cls: 'zfa-struct-apercu-tete' });
    const compteEl = tete.createSpan({ cls: 'zfa-struct-compte' });
    const majCompte = () => compteEl.setText(compter(this.arbre) + tr(' tâche(s) à créer'));
    majCompte();
    tete.createSpan({ cls: 'zfa-struct-aide',
      text: tr('Glissez la poignée : vertical = l’ordre, horizontal = le niveau.') });

    const liste = this.apercu.createDiv({ cls: 'zfa-struct-liste' });
    this._depose = liste.createDiv({ cls: 'zfa-struct-depose' });
    this._depose.hidden = true;
    let rang = 0;
    const rangee = (n, prof) => {
      const d = liste.createDiv({ cls: 'zfa-struct-noeud' });
      d.dataset.rang = String(rang); rang += 1;
      const profVue = Math.min(prof, 6);
      d.style.setProperty('--struct-prof', String(profVue));
      if (prof > 0) d.addClass('est-enfant');
      const poignee = d.createEl('span', { cls: 'zfa-struct-poignee',
        attr: { draggable: 'true', title: tr('Déplacer : vertical = l’ordre, horizontal = le niveau.') } });
      try { obsidian.setIcon(poignee, 'grip-vertical'); } catch (e) { poignee.setText('⠿'); }
      const inc = d.createEl('input', { type: 'checkbox', cls: 'zfa-struct-inc' });
      inc.checked = n.inclus !== false;
      inc.onchange = () => { n.inclus = inc.checked; d.toggleClass('est-exclu', !inc.checked); majCompte(); };
      const titre = d.createEl('input', { type: 'text', cls: 'zfa-struct-titre' });
      titre.value = n.titre;
      titre.onchange = () => { n.titre = titre.value.trim() || n.titre; };
      const fam = d.createEl('select', { cls: 'zfa-struct-fam dropdown' });
      for (const f of familles) fam.createEl('option', { value: f.id, text: f.nom || f.id });
      fam.value = n.famille;
      fam.onchange = () => { n.famille = fam.value; };
      const jal = d.createEl('label', { cls: 'zfa-struct-jal' });
      const jc = jal.createEl('input', { type: 'checkbox' });
      jc.checked = !!n.jalon;
      jc.onchange = () => { n.jalon = jc.checked; };
      jal.createSpan({ text: tr('jalon') });
      if (n.priorite) d.createSpan({ cls: 'zfa-struct-prio', text: n.priorite });
      if (n.note) d.createEl('div', { cls: 'zfa-struct-note', text: n.note });
      for (const e of n.enfants || []) rangee(e, prof + 1);
    };
    this.arbre.forEach((n) => rangee(n, 0));
    this._brancherGlisser(liste);

    const pied = this.apercu.createDiv({ cls: 'zfa-struct-actions' });
    const b = pied.createEl('button', { cls: 'mod-cta', text: tr('Créer les tâches') });
    b.onclick = () => this._creer();
  }

  // Glisser-déposer dans l'aperçu : la poignée saisit la ligne avec toute sa
  // descendance. Vertical : la place dans la liste. Horizontal : le niveau de
  // hiérarchie (poussée à droite de la ligne précédente = enfant). Une ligne
  // d'insertion accentuée suit le curseur ; à la dépose, l'arbre est refait
  // et l'aperçu rendu à neuf.
  _brancherGlisser(liste) {
    const lignes = () => Array.from(liste.querySelectorAll('.zfa-struct-noeud'));
    const cacher = () => { if (this._depose) this._depose.hidden = true; };

    liste.addEventListener('dragstart', (ev) => {
      const cible = ev.target && ev.target.closest
        ? ev.target.closest('.zfa-struct-noeud') : null;
      if (!cible) { ev.preventDefault(); return; }
      this._glisse = Number(cible.dataset.rang);
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = 'move';
        try { ev.dataTransfer.setData('text/plain', cible.dataset.rang); } catch (e) { /* rien */ }
        // Fantôme à la taille de la rangée : l'image par défaut serait la
        // seule poignée, trop discrète.
        const fantome = cible.cloneNode(true);
        fantome.style.position = 'absolute';
        fantome.style.top = '-1000px';
        fantome.style.left = '0';
        fantome.style.width = cible.offsetWidth + 'px';
        document.body.appendChild(fantome);
        try { ev.dataTransfer.setDragImage(fantome, 16, 14); } catch (e) { /* rien */ }
        setTimeout(() => fantome.remove(), 0);
      }
      cible.addClass('est-glisse');
    });

    liste.addEventListener('dragover', (ev) => {
      if (this._glisse == null) return;
      const ls = lignes();
      let g = ls.length;
      for (let k = 0; k < ls.length; k += 1) {
        const r = ls[k].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { g = k; break; }
      }
      const depot = Ariane.depotSpecTaches(Ariane.aplatirSpecsTaches(this.arbre), this._glisse, g);
      if (!depot) { this._depot = null; cacher(); return; }
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
      // Niveau visé : la position horizontale du curseur, par pas de retrait.
      const cs = getComputedStyle(liste);
      const pas = parseFloat(cs.getPropertyValue('--struct-pas')) || 20;
      const base = parseFloat(cs.getPropertyValue('--struct-base')) || 12;
      const x0 = liste.getBoundingClientRect().left + base;
      const prof = Math.max(0, Math.min(Math.floor((ev.clientX - x0) / pas), depot.profMax, 6));
      this._depot = { g, prof };
      this._depose.style.top = (g < ls.length ? ls[g].offsetTop
        : (ls.length ? ls[ls.length - 1].offsetTop + ls[ls.length - 1].offsetHeight : 0)) + 'px';
      this._depose.style.setProperty('--struct-prof', String(prof));
      this._depose.hidden = false;
    });

    liste.addEventListener('dragleave', (ev) => {
      if (!ev.relatedTarget || !liste.contains(ev.relatedTarget)) cacher();
    });

    liste.addEventListener('drop', (ev) => {
      ev.preventDefault();
      cacher();
      if (this._glisse == null || !this._depot) return;
      const { g, prof } = this._depot;
      const i = this._glisse;
      this._glisse = null; this._depot = null;
      const apres = Ariane.deplacerSpecTaches(Ariane.aplatirSpecsTaches(this.arbre), i, g, prof);
      if (!apres) return;
      this.arbre = Ariane.reconstruireSpecsTaches(apres);
      this._rendreApercu();
    });

    liste.addEventListener('dragend', () => {
      this._glisse = null; this._depot = null;
      cacher();
      const glissee = liste.querySelector('.est-glisse');
      if (glissee) glissee.removeClass('est-glisse');
    });
  }

  _elaguer(liste) {
    return (liste || []).filter((n) => n.inclus !== false).map((n) => ({
      titre: n.titre, famille: n.famille, jalon: n.jalon, priorite: n.priorite,
      debut: n.debut, echeance: n.echeance, note: n.note, source: n.source,
      enfants: this._elaguer(n.enfants),
    }));
  }

  async _creer() {
    const specs = this._elaguer(this.arbre);
    if (!specs.length) { new obsidian.Notice(tr('Aucune tâche sélectionnée.')); return; }
    const vue = (!this.decouper && this._vueChoisie)
      ? this.vues[Number(this._vueChoisie)] : null;
    this.close();
    const avis = new obsidian.Notice(tr('Création des tâches…'), 0);
    try {
      const refs = await this.greffon.creerArbreTaches(specs, {
        vue, parentRef: this.decouper ? this.decouper.ref : null,
      });
      avis.hide();
      new obsidian.Notice(refs.length + tr(' tâche(s) créée(s).'));
    } catch (e) {
      avis.hide();
      console.error('[Ariane] structuration', e);
      new obsidian.Notice(tr('Échec de la création : ') + (e && e.message ? e.message : e));
    }
  }

  onClose() { this.contentEl.empty(); }
}

// Revue d'un lot de changements « avant -> après » (intitulés, familles…).
// opts = { titre, aide, lignes:[{ref, avant, apres, titre?}], editable, appliquer }
class ModaleRevueLot extends obsidian.Modal {
  constructor(app, opts) { super(app); this.o = opts || {}; }
  onOpen() {
    const c = this.contentEl;
    if (this.modalEl) this.modalEl.addClass('zfa-struct-modal');
    c.addClass('zfa-revue');
    this.titleEl.setText(this.o.titre || tr('Revue'));
    if (this.o.aide) c.createEl('p', { cls: 'zfa-struct-intro', text: this.o.aide });
    const lignes = this.o.lignes || [];
    if (!lignes.length) {
      c.createEl('p', { cls: 'zfa-struct-vide', text: tr('Rien à changer — tout semble déjà en ordre.') });
      const p0 = c.createDiv({ cls: 'zfa-struct-actions' });
      p0.createEl('button', { cls: 'mod-cta', text: tr('Fermer') }).onclick = () => this.close();
      return;
    }
    this.rows = lignes.map((l) => Object.assign({ garder: true }, l));
    const liste = c.createDiv({ cls: 'zfa-revue-liste' });
    for (const r of this.rows) {
      const d = liste.createDiv({ cls: 'zfa-revue-l' });
      const cb = d.createEl('input', { type: 'checkbox' });
      cb.checked = true;
      cb.onchange = () => { r.garder = cb.checked; };
      d.createSpan({ cls: 'zfa-revue-av', text: r.avant });
      d.createSpan({ cls: 'zfa-revue-fl', text: '→' });
      if (this.o.editable) {
        const inp = d.createEl('input', { type: 'text', cls: 'zfa-revue-ap' });
        inp.value = r.apres;
        inp.onchange = () => { r.apres = inp.value.trim() || r.apres; };
      } else {
        d.createSpan({ cls: 'zfa-revue-ap', text: r.apres });
      }
      if (r.titre) d.createSpan({ cls: 'zfa-revue-ctx', text: r.titre });
    }
    const pied = c.createDiv({ cls: 'zfa-struct-actions' });
    pied.createSpan({ cls: 'zfa-struct-compte', text: this.rows.length + tr(' changement(s) proposé(s)') });
    const b = pied.createEl('button', { cls: 'mod-cta', text: tr('Appliquer la sélection') });
    b.onclick = async () => {
      const sel = this.rows.filter((r) => r.garder);
      this.close();
      let n = 0;
      try { n = await this.o.appliquer(sel); } catch (e) { console.error('[Ariane] revue', e); }
      new obsidian.Notice((n || 0) + tr(' modification(s) appliquée(s).'));
    };
  }
  onClose() { this.contentEl.empty(); }
}

// Invite « créer en langage naturel » : une description, une ou plusieurs
// tâches. Comme pour « Structurer un brouillon », tout passe par un aperçu où
// l'on décoche, renomme, change la famille ou l'échéance avant de créer.
class ModaleAjoutLN extends obsidian.Modal {
  // opts : { texte?, apres?(ref) } ; `texte` amorce la description (ouverture
  // depuis la fenêtre de création), `apres` prévient la vue qui l'a ouverte.
  constructor(greffon, opts) { super(greffon.app); this.greffon = greffon; this.o = opts || {}; }
  onOpen() {
    const c = this.contentEl;
    if (this.modalEl) this.modalEl.addClass('zfa-struct-modal');
    c.addClass('zfa-struct');
    this.titleEl.setText(tr('Créer des tâches en langage naturel'));
    c.createEl('p', { cls: 'zfa-struct-intro', text: tr('Décrivez ce qu’il y a à faire, en une phrase ou plusieurs : une tâche par action, famille devinée, dates comprises (« lundi prochain », « le 30/10 »), dépendances rattachées.') });
    const inp = c.createEl('textarea', { cls: 'zfa-struct-zone' });
    inp.rows = 4;
    inp.style.minHeight = '6em';
    inp.style.fontFamily = 'var(--font-text)';
    inp.placeholder = tr('Ex. : rédiger le résumé du webinaire pour lundi prochain, puis l’envoyer à Karine.');
    if (this.o.texte) inp.value = this.o.texte;
    const pied = c.createDiv({ cls: 'zfa-struct-actions' });
    const b = pied.createEl('button', { cls: 'mod-cta', text: tr('Analyser') });
    this.apercu = c.createDiv({ cls: 'zfa-struct-apercu' });
    b.onclick = async () => {
      const p = inp.value.trim();
      if (!p || b.disabled) return;
      b.disabled = true; b.setText(tr('Analyse…'));
      let specs = [];
      try {
        specs = await this.greffon.analyserTachesLN(p);
      } catch (e) {
        new obsidian.Notice(tr('Échec : ') + (e && e.message ? e.message : e));
      } finally {
        b.disabled = false; b.setText(tr('Ré-analyser'));
      }
      if (!specs.length) {
        if (!this.apercu.childElementCount) new obsidian.Notice(tr('Rien n\'a pu être créé.'));
        return;
      }
      this._apercu(specs);
    };
    // ⌘↵ analyse sans quitter le clavier.
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); b.click(); }
    });
    setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 30);
  }

  _apercu(specs) {
    const ap = this.apercu;
    ap.empty();
    const familles = this.greffon.famillesIA();
    const tete = ap.createDiv({ cls: 'zfa-struct-apercu-tete' });
    const compte = tete.createSpan({ cls: 'zfa-struct-compte' });
    const majCompte = () => compte.setText(specs.filter((s) => s.inclus !== false).length
      + tr(' tâche(s) à créer'));
    majCompte();
    const liste = ap.createDiv({ cls: 'zfa-struct-liste' });
    specs.forEach((n) => {
      const d = liste.createDiv({ cls: 'zfa-struct-noeud zfa-ln-noeud' });
      const inc = d.createEl('input', { type: 'checkbox', cls: 'zfa-struct-inc' });
      inc.checked = n.inclus !== false;
      inc.onchange = () => { n.inclus = inc.checked; d.toggleClass('est-exclu', !inc.checked); majCompte(); };
      const titre = d.createEl('input', { type: 'text', cls: 'zfa-struct-titre' });
      titre.value = n.titre;
      titre.onchange = () => { n.titre = titre.value.trim() || n.titre; };
      const fam = d.createEl('select', { cls: 'zfa-struct-fam dropdown' });
      for (const f of familles) fam.createEl('option', { value: f.id, text: f.nom || f.id });
      fam.value = n.famille;
      fam.onchange = () => { n.famille = fam.value; };
      const ech = d.createEl('input', { type: 'date', cls: 'zfa-ln-date',
        attr: { title: tr('Échéance') } });
      ech.value = n.echeance || '';
      ech.onchange = () => { n.echeance = ech.value; };
      const liens = [];
      if (n.apres != null && specs[n.apres]) liens.push(tr('après « ') + specs[n.apres].titre + ' »');
      if (n.bloquePar) liens.push(tr('bloquée par « ') + n.bloquePar + ' »');
      if (n.debut) liens.push(tr('début ') + n.debut);
      if (liens.length) d.createDiv({ cls: 'zfa-struct-note', text: liens.join(' · ') });
      if (n.note) d.createDiv({ cls: 'zfa-struct-note', text: n.note });
    });
    const pied = ap.createDiv({ cls: 'zfa-struct-actions' });
    const b = pied.createEl('button', { cls: 'mod-cta', text: tr('Créer les tâches') });
    b.onclick = () => this._creer(specs);
  }

  async _creer(specs) {
    if (!specs.some((s) => s.inclus !== false)) { new obsidian.Notice(tr('Aucune tâche sélectionnée.')); return; }
    this.close();
    const avis = new obsidian.Notice(tr('Création…'), 0);
    try {
      const refs = await this.greffon.creerTachesLN(specs);
      avis.hide();
      if (!refs.length) { new obsidian.Notice(tr('Rien n\'a pu être créé.')); return; }
      new obsidian.Notice(refs.length === 1 ? tr('Tâche créée : ') + refs[0]
        : refs.length + tr(' tâche(s) créée(s) : ') + refs.join(', '));
      if (this.o.apres) { try { this.o.apres(refs[0]); } catch (e) { /* vue fermée */ } }
      const f = this.greffon.fichierDeRef(refs[0]);
      if (f) this.greffon.app.workspace.getLeaf(true).openFile(f);
    } catch (e) {
      avis.hide();
      new obsidian.Notice(tr('Échec : ') + (e && e.message ? e.message : e));
    }
  }

  onClose() { this.contentEl.empty(); }
}

// ── Rattacher du temps réel (hors Obsidian) à des tâches ──────────────────
//  Un ou plusieurs créneaux d'activité d'un même jour. Pour chacun : ses
//  rattachements actuels, les rapprochements évidents (créneau prévu, note
//  ouverte), puis les suggestions de l'IA, qui arrivent en cours de route.
//  Chaque ligne se coche, ses minutes se corrigent ; on ajoute une tâche à la
//  main. Valider écrit les différences (rattacher, corriger, détacher).
//  o : { jour, blocs, surFait(inverse) }

class ModaleRattacherActivite extends obsidian.Modal {
  constructor(greffon, o) {
    super(greffon.app);
    this.greffon = greffon;
    this.o = o || {};
    this.parBloc = (this.o.blocs || []).map((b) => ({ b, lignes: greffon.candidatsRattachement(b) }));
  }

  onOpen() {
    const { contentEl } = this;
    if (this.modalEl) this.modalEl.addClass('zfa-ratt-modale');
    const jl = new Date(this.o.jour + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    this.titleEl.setText(tr('Rattacher le temps réel · ') + jl);
    contentEl.empty();
    this.etat = contentEl.createDiv({ cls: 'zfa-ratt-etat', text: tr('Suggestions de l\'IA en cours…') });
    this.corps = contentEl.createDiv({ cls: 'zfa-ratt-corps' });
    this.rendre();
    const pied = contentEl.createDiv({ cls: 'zfa-ratt-pied' });
    pied.createEl('button', { text: tr('Annuler') }).onclick = () => this.close();
    this.btValider = pied.createEl('button', { cls: 'mod-cta', text: tr('Rattacher') });
    this.btValider.onclick = () => this.valider();
    this.suggerer();
  }

  async suggerer() {
    try {
      const sug = await this.greffon.suggererRattachements(this.o.jour, this.parBloc.map((x) => x.b));
      for (const x of this.parBloc) {
        for (const s of (sug.get(x.b.empreinte) || [])) {
          const deja = x.lignes.find((l) => l.ref === s.ref);
          if (deja) { if (!deja.raisonIA) deja.raisonIA = s.raison; continue; }
          x.lignes.push({ ref: s.ref, min: s.min, raison: s.raison, coche: false, ia: true });
        }
      }
      this.etat.setText(tr('Suggestions de l\'IA ajoutées (à cocher).'));
    } catch (e) {
      this.etat.setText(tr('Suggestions de l\'IA indisponibles : ') + ((e && e.message) || e));
    }
    this.rendre();
  }

  rendre() {
    const c = this.corps;
    c.empty();
    const taches = new Map(this.greffon.tachesPourGantt().map((t) => [t.ref, t]));
    for (const x of this.parBloc) {
      const b = x.b;
      const bloc = c.createDiv({ cls: 'zfa-ratt-bloc' });
      const tete = bloc.createDiv({ cls: 'zfa-ratt-tete' });
      const puce = tete.createSpan({ cls: 'zfa-act-cat', text: b.ia ? b.ia.categorie : b.categorie });
      puce.style.setProperty('--zfa-cal-coul', b.couleur);
      tete.createSpan({ cls: 'zfa-act-meta', text: b.debut.slice(11, 16) + ' → ' + b.fin.slice(11, 16)
        + ' · ' + dureeLisible(b.actifMin) + tr(' actives') });
      if (b.ia && b.ia.resume) bloc.createDiv({ cls: 'zfa-ratt-resume', text: b.ia.resume });
      const total = () => x.lignes.filter((l) => l.coche).reduce((s, l) => s + (Number(l.min) || 0), 0);
      const reste = bloc.createDiv({ cls: 'zfa-ratt-reste' });
      const majReste = () => {
        const t = total();
        reste.setText(t > b.actifMin
          ? tr('Plus que le temps actif : ') + t + ' / ' + b.actifMin + ' min'
          : t + ' / ' + b.actifMin + tr(' min rattachées'));
        reste.toggleClass('est-trop', t > b.actifMin);
      };
      if (!x.lignes.length) bloc.createDiv({ cls: 'zfa-act-vide', text: tr('Aucune suggestion pour l\'instant.') });
      for (const l of x.lignes) {
        const t = taches.get(l.ref);
        const row = bloc.createDiv({ cls: 'zfa-ratt-ligne' + (l.ia ? ' est-ia' : '') });
        const cb = row.createEl('input', { type: 'checkbox' });
        cb.checked = !!l.coche;
        cb.onchange = () => { l.coche = cb.checked; majReste(); };
        const txt = row.createDiv({ cls: 'zfa-ratt-txt' });
        txt.createSpan({ cls: 'zfa-ratt-ref', text: l.ref });
        txt.createSpan({ cls: 'zfa-ratt-intitule', text: t ? t.intitule : '' });
        const pourquoi = [l.raison, l.raisonIA && l.raisonIA !== l.raison ? tr('IA : ') + l.raisonIA : ''].filter(Boolean).join(' · ');
        if (pourquoi) txt.createDiv({ cls: 'zfa-ratt-raison', text: (l.ia ? '✨ ' : '') + pourquoi });
        const min = row.createEl('input', { type: 'number', cls: 'zfa-ratt-min', attr: { min: '1', max: String(b.actifMin) } });
        min.value = String(l.min || 1);
        min.oninput = () => { l.min = Math.max(1, parseInt(min.value, 10) || 1); majReste(); };
        row.createSpan({ cls: 'zfa-ratt-unite', text: 'min' });
      }
      const ajout = bloc.createEl('button', { cls: 'zfa-ratt-ajout', text: tr('+ Autre tâche…') });
      ajout.onclick = () => {
        const items = this.greffon.tachesRattachables()
          .filter((t) => !x.lignes.some((l) => l.ref === t.ref))
          .map((t) => ({ nom: t.ref + ' · ' + t.intitule, ref: t.ref }));
        new ChoixListeModal(this.app, tr('Rattacher à quelle tâche ?'), items, (it) => {
          const libre = Math.max(1, b.actifMin - total());
          x.lignes.push({ ref: it.ref, min: libre, raison: tr('choisie à la main'), coche: true });
          this.rendre();
        }).open();
      };
      majReste();
    }
  }

  async valider() {
    const ops = [];
    for (const x of this.parBloc) {
      const b = x.b;
      const actuels = new Map((b.rattache || []).map((r) => [r.ref, r]));
      const quoi = (b.ia ? b.ia.categorie : b.categorie) + (b.details && b.details[0] ? ', ' + b.details[0].libelle : '');
      for (const l of x.lignes) {
        const ligne = l.coche ? Ariane.formatTempsReel({ debut: b.debut, fin: b.fin,
          min: Math.min(Number(l.min) || 1, b.actifMin), quoi, id: b.empreinte }) : '';
        const av = actuels.get(l.ref);
        if (!ligne && !av) continue;
        if (av && av.ligne === ligne) continue;
        ops.push({ ref: l.ref, id: b.empreinte, apres: ligne });
      }
    }
    this.close();
    if (!ops.length) return;
    const inverse = await this.greffon.appliquerRattachements(ops);
    const n = ops.filter((o) => o.apres).length;
    new obsidian.Notice(n + tr(' rattachement(s) écrit(s)') + (ops.length - n ? ', ' + (ops.length - n) + tr(' retiré(s)') : '') + '.');
    if (this.o.surFait) this.o.surFait(ops, inverse);
  }

  onClose() { this.contentEl.empty(); }
}

//#endregion 13 · Modales de tâche


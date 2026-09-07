//#region 19 · Modales secondaires
// ═══════════════════════════════════════════════════════════════════════════
//  19 · MODALES SECONDAIRES
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

//#endregion 19 · Modales secondaires


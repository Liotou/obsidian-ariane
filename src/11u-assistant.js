// ── avecAssistant ─────────────────────────────────────────────────────────
// Domaine : l'assistant IA, à la manière d'Apple Intelligence (module
// « assistant », section 24). Le moteur d'Apple comme fournisseur d'IA, les
// outils d'écriture sur la sélection, la barre de demande, et la signature
// lumineuse commune (liseré des panneaux, halo au bord de la fenêtre quand
// l'IA travaille, miroitement du passage en cours de réécriture).
const avecAssistant = (Base) => class extends Base {
  //#region Ariane · assistant IA

  // Tout ce que le module enregistre ; appelé seulement s'il est actif.
  brancherAssistant() {
    this.registerEditorExtension(this.extensionAssistant());
    this.addCommand({
      id: 'assistant-outils', module: 'assistant', name: tr('Outils d’écriture (IA)'), icon: 'sparkles',
      editorCallback: (editeur, vue) => this.ouvrirOutilsEcriture(vue),
    });
    this.addCommand({
      id: 'assistant-demander', module: 'assistant', name: tr('Demander à l’assistant (IA)'), icon: 'sparkle',
      callback: () => new BarreAssistantIA(this).ouvrir(),
    });
    for (const [id, action, nom, icone] of [
      ['assistant-relire', 'relire', 'Outils d’écriture : relire la sélection', 'spell-check'],
      ['assistant-reecrire', 'reecrire', 'Outils d’écriture : réécrire la sélection', 'pen-line'],
      ['assistant-resumer', 'resume', 'Outils d’écriture : résumer la sélection', 'align-left']]) {
      this.addCommand({
        id, module: 'assistant', name: tr(nom), icon: icone,
        editorCallback: (editeur, vue) => this.ouvrirOutilsEcriture(vue, action),
      });
    }
    // Au clic droit sur une sélection, comme les Outils d'écriture d'Apple.
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editeur, info) => {
      if (!editeur.somethingSelected() || !(info instanceof obsidian.MarkdownView)) return;
      menu.addItem((i) => {
        i.setTitle(tr('Outils d’écriture')).setIcon('sparkles').setSection('selection');
        const sous = typeof i.setSubmenu === 'function' ? i.setSubmenu() : null;
        if (!sous) { i.onClick(() => this.ouvrirOutilsEcriture(info)); return; }
        sous.addItem((j) => j.setTitle(tr('Ouvrir les outils d’écriture')).setIcon('sparkles')
          .onClick(() => this.ouvrirOutilsEcriture(info)));
        sous.addSeparator();
        for (const a of AssistantEcriture.ACTIONS) {
          sous.addItem((j) => j.setTitle(tr(a.nom)).setIcon(a.icone).onClick(() => this.ouvrirOutilsEcriture(info, a.id)));
        }
      });
    }));
    this.register(() => {
      PanneauEcritureIA.fermerTout();
      BarreAssistantIA.fermerTout();
      this._retirerHalo(true);
    });
  }

  // Le moteur d'Apple, créé à la première demande ; arrêté avec Ariane.
  moteurAppleIA() {
    if (!this._moteurApple) {
      this._moteurApple = new MoteurAppleIA(this);
      this.register(() => this._moteurApple && this._moteurApple.arreter());
    }
    return this._moteurApple;
  }

  // Apple Intelligence comme fournisseur des fonctions d'IA d'Ariane (celles
  // qui attendent du JSON : tâches, activité, découpage des références).
  async genererApple(prompt, max) {
    if (!MoteurAppleIA.disponible()) {
      this._diagIA = tr('Apple Intelligence est réservée au Mac.');
      return null;
    }
    const { fin } = this.moteurAppleIA().lancer({
      instructions: 'Tu réponds en français. Quand on te demande du JSON, tu rends uniquement du JSON valide, sans texte autour.',
      prompt, max: max || 800, temperature: 0,
    });
    const r = await fin;
    if (!r || r.erreur) {
      this._diagIA = 'Apple Intelligence : ' + (MoteurAppleIA.raisonLisible(r && r.code) || (r && r.erreur) || tr('aucune réponse'));
      return null;
    }
    this._diagIA = '';
    return r.texte || null;
  }

  // Le fournisseur de l'assistant : Apple Intelligence quand elle est là
  // (réglage « automatique »), sinon le fournisseur principal d'Ariane.
  fournisseurAssistant() {
    const choix = this.settings.assistantFournisseur || 'auto';
    if (choix === 'apple') return 'apple';
    if (choix === 'auto' && MoteurAppleIA.disponible() && !this._appleIndisponible) return 'apple';
    return this.settings.refsFournisseur || 'ollama';
  }

  // Une génération de texte libre (non du JSON) pour l'assistant, au fil de
  // l'eau quand le fournisseur le permet (Apple). Rend { fin, annuler } ;
  // `fin` : { texte } ou { erreur }. Le halo brille tant qu'elle dure.
  ecrireAvecIA(instructions, consigne, o) {
    const opts = o || {};
    const f = this.fournisseurAssistant();
    let annule = false;
    let annulerApple = null;
    const travail = async () => {
      if (f === 'apple') {
        const l = this.moteurAppleIA().lancer({ instructions, prompt: consigne, max: opts.max,
          temperature: 0.3, surPartiel: opts.surPartiel });
        annulerApple = l.annuler;
        const r = await l.fin;
        // Apple Intelligence absente, en réglage automatique : on passe au
        // fournisseur principal, et on s'en souvient pour la session.
        if (r && r.erreur && (this.settings.assistantFournisseur || 'auto') === 'auto'
          && ['demon', 'appareil-non-eligible', 'apple-intelligence-desactivee', 'modele-pas-pret'].includes(r.code)) {
          this._appleIndisponible = true;
          return this._texteFournisseur(instructions, consigne, opts.max, this.settings.refsFournisseur || 'ollama');
        }
        if (r && r.erreur) return { erreur: MoteurAppleIA.raisonLisible(r.code) || r.erreur };
        return r;
      }
      return this._texteFournisseur(instructions, consigne, opts.max, f);
    };
    const fin = this.avecHaloIA(travail).then((r) => (annule ? { erreur: tr('annulé') } : r))
      .catch((e) => ({ erreur: String((e && e.message) || e) }));
    return { fin, annuler: () => { annule = true; if (annulerApple) annulerApple(); } };
  }

  // Les autres fournisseurs, en texte libre et d'une traite.
  async _texteFournisseur(instructions, consigne, max, f) {
    const s = this.settings;
    const modele = s.refsModele || 'llama3.2';
    const invite = instructions + '\n\n' + consigne;
    this._diagIA = '';
    try {
      if (f === 'claude') {
        const t = await this.genererClaude(invite, max, { parEntree: true, delai: 180000 });
        return t ? { texte: t } : { erreur: this._diagIA || tr('aucune réponse') };
      }
      if (f === 'mistral') {
        const cle = (s.refsCleMistral || '').trim();
        if (!cle) return { erreur: tr('Clé Mistral absente des réglages.') };
        const m = /^(mistral|ministral|magistral|codestral|pixtral|open-)/i.test(modele) ? modele : 'mistral-small-latest';
        const rep = await obsidian.requestUrl({ url: 'https://api.mistral.ai/v1/chat/completions', method: 'POST', throw: false,
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cle },
          body: JSON.stringify({ model: m, temperature: 0.3, max_tokens: max || 1200,
            messages: [{ role: 'system', content: instructions }, { role: 'user', content: consigne }] }) });
        const c = rep && rep.status < 300 && rep.json && rep.json.choices && rep.json.choices[0];
        return c ? { texte: String(c.message.content || '') } : { erreur: 'Mistral HTTP ' + (rep ? rep.status : '?') };
      }
      const lm = f === 'lmstudio';
      const url = this.urlInference(lm) + (lm ? '/v1/chat/completions' : '/api/generate');
      const corps = lm
        ? { model: modele, temperature: 0.3, max_tokens: max || 1200,
          messages: [{ role: 'system', content: instructions }, { role: 'user', content: consigne }] }
        : { model: modele, system: instructions, prompt: consigne, stream: false, keep_alive: '2m',
          options: { temperature: 0.3, num_predict: max || 1200 } };
      const rep = await obsidian.requestUrl({ url, method: 'POST', throw: false,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      if (!rep || rep.status < 200 || rep.status >= 300) return { erreur: 'HTTP ' + (rep ? rep.status : '?') + ', ' + url };
      const j = rep.json;
      const t = lm ? (j && j.choices && j.choices[0] && j.choices[0].message.content) : (j && j.response);
      return t ? { texte: String(t) } : { erreur: tr('aucune réponse') };
    } catch (e) {
      return { erreur: String((e && e.message) || e) };
    }
  }

  // ── La signature lumineuse ──
  //  Tant qu'une demande d'IA faite par Monsieur est en cours, un halo aux
  //  couleurs d'Apple Intelligence borde la fenêtre (chaque fenêtre ouverte).

  async avecHaloIA(fn) {
    const effets = this.module('assistant') && this.settings.assistantEffets !== false;
    if (effets) this._poserHalo();
    try { return await fn(); } finally { if (effets) this._retirerHalo(false); }
  }

  _poserHalo() {
    this._haloIA = (this._haloIA || 0) + 1;
    if (this._haloIA > 1) return;
    const docs = new Set([document]);
    this.app.workspace.iterateAllLeaves((l) => {
      const d = l.view && l.view.containerEl && l.view.containerEl.ownerDocument;
      if (d) docs.add(d);
    });
    this._halos = [];
    for (const d of docs) if (d.body) this._halos.push(d.body.createDiv({ cls: 'zfa-ia-bord' }));
  }

  _retirerHalo(tout) {
    this._haloIA = tout ? 0 : Math.max(0, (this._haloIA || 0) - 1);
    if (this._haloIA > 0) return;
    for (const h of this._halos || []) {
      h.addClass('est-sortant');
      setTimeout(() => h.remove(), 450);
    }
    this._halos = [];
  }

  // Le passage travaillé, dans l'éditeur : « cible » (posé), « miroir »
  // (l'IA écrit), « nouveau » (le texte qui vient d'arriver, qui s'éteint).
  // Un champ d'état de CodeMirror les porte : leurs positions suivent les
  // modifications de la note.
  extensionAssistant() {
    const { StateField, StateEffect } = require('@codemirror/state');
    const { Decoration, EditorView } = require('@codemirror/view');
    const poser = StateEffect.define();
    const retirer = StateEffect.define();
    const classes = { cible: 'zfa-ia-cible', miroir: 'zfa-ia-miroir', nouveau: 'zfa-ia-nouveau' };
    const champ = StateField.define({
      create: () => Decoration.none,
      update(deco, t) {
        let d = deco.map(t.changes);
        for (const e of t.effects) {
          if (e.is(poser)) {
            const { genre, from, to } = e.value;
            const remplaces = genre === 'nouveau' ? ['nouveau'] : ['cible', 'miroir'];
            d = d.update({ filter: (f, a, v) => !remplaces.includes(v.spec.genre) });
            if (from < to) d = d.update({ add: [Decoration.mark({ class: classes[genre], genre }).range(from, to)] });
          } else if (e.is(retirer)) {
            d = d.update({ filter: (f, a, v) => !e.value.includes(v.spec.genre) });
          }
        }
        return d;
      },
      provide: (f) => EditorView.decorations.from(f),
    });
    this._iaCm = { champ, poser, retirer };
    return champ;
  }

  marquerCibleIA(cm, from, to, genre) {
    const k = this._iaCm;
    if (!k || !cm) return;
    const n = cm.state.doc.length;
    const de = Math.max(0, Math.min(from, n));
    const a = Math.max(de, Math.min(to, n));
    try { cm.dispatch({ effects: k.poser.of({ genre, from: de, to: a }) }); } catch (e) { /* éditeur fermé */ }
    if (genre === 'nouveau') {
      setTimeout(() => {
        try { cm.dispatch({ effects: k.retirer.of(['nouveau']) }); } catch (e) { /* éditeur fermé */ }
      }, 2600);
    }
  }

  effacerCibleIA(cm) {
    const k = this._iaCm;
    if (!k || !cm) return;
    try { cm.dispatch({ effects: k.retirer.of(['cible', 'miroir']) }); } catch (e) { /* éditeur fermé */ }
  }

  // Où se trouve maintenant le passage travaillé (il suit les modifications).
  plageCibleIA(cm) {
    const k = this._iaCm;
    if (!k || !cm) return null;
    let p = null;
    try {
      cm.state.field(k.champ).between(0, cm.state.doc.length, (from, to, v) => {
        if (v.spec.genre === 'cible' || v.spec.genre === 'miroir') { p = { from, to }; return false; }
        return undefined;
      });
    } catch (e) { return null; }
    return p;
  }

  ouvrirOutilsEcriture(vue, action) {
    if (!vue || !vue.editor || vue.getMode() !== 'source') {
      new obsidian.Notice(tr('Passez en mode édition et sélectionnez le passage à travailler.'));
      return;
    }
    new PanneauEcritureIA(this, vue).ouvrir(action);
  }

  async verifierAppleIA() {
    if (!MoteurAppleIA.disponible()) { new obsidian.Notice(tr('Apple Intelligence est réservée au Mac.')); return; }
    const avis = new obsidian.Notice(tr('Apple Intelligence : vérification…'), 0);
    const e = await this.moteurAppleIA().etat();
    avis.hide();
    if (e.disponible) { this._appleIndisponible = false; new obsidian.Notice(tr('Apple Intelligence répond, sur ce Mac.')); return; }
    new obsidian.Notice(tr('Apple Intelligence indisponible : ')
      + (MoteurAppleIA.raisonLisible(e.raison) || e.message || e.raison), 10000);
  }

  //#endregion Ariane · assistant IA
};

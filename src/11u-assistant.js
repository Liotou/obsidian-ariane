// ── avecAssistant ─────────────────────────────────────────────────────────
// Domaine : l'assistant IA, à la manière d'Apple Intelligence (module
// « assistant », section 24). Le moteur d'Apple comme fournisseur d'IA, les
// outils d'écriture proposés à la sélection, le filet de sécurité des
// citations (y compris face aux outils d'écriture d'Apple), et la signature
// lumineuse commune (liseré, halo au bord de la fenêtre quand l'IA
// travaille, miroitement du passage en cours de réécriture).
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
      id: 'assistant-outils-apple', module: 'assistant', name: tr('Outils d’écriture d’Apple (natifs)'), icon: 'app-window',
      editorCallback: (editeur, vue) => this.outilsEcritureApple(vue),
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
    // Au clic droit sur une sélection, dans le sous-menu « Ariane ».
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editeur, info) => {
      if (!editeur.somethingSelected() || !(info instanceof obsidian.MarkdownView)) return;
      this.sousMenuAriane(menu).addItem((i) => i.setTitle(tr('Outils d’écriture')).setIcon('sparkles')
        .onClick(() => this.ouvrirOutilsEcriture(info)));
    }));
    this.register(() => {
      PanneauEcritureIA.fermerTout();
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
    return [champ, this._extensionSelectionIA()];
  }

  // Deux veilles sur l'éditeur. Les pastilles des outils d'écriture se
  // proposent quand une sélection se pose (après une courte pause), et
  // s'effacent quand elle disparaît. Le filet de sécurité : une réécriture
  // venue d'ailleurs (les outils d'écriture d'Apple, un collage) qui fait
  // disparaître des liens ou des citations est signalée, avec de quoi
  // l'annuler.
  _extensionSelectionIA() {
    const { ViewPlugin } = require('@codemirror/view');
    const greffon = this;
    return ViewPlugin.fromClass(class {
      constructor() { this.minuteur = null; }
      update(u) {
        if (u.docChanged) greffon._verifierCitations(u);
        if (!u.selectionSet && !u.docChanged) return;
        const ouvert = PanneauEcritureIA.ouvert;
        if (ouvert && ouvert.discret && ouvert.cm === u.view) ouvert.fermer();
        clearTimeout(this.minuteur);
        if (greffon.settings.assistantPastilles === false) return;
        const sel = u.state.selection.main;
        if (sel.empty || u.docChanged) return;
        this.minuteur = setTimeout(() => greffon._proposerPastilles(u.view), 450);
      }
      destroy() { clearTimeout(this.minuteur); }
    });
  }

  _vueDeCm(cm) {
    for (const l of this.app.workspace.getLeavesOfType('markdown')) {
      const v = l.view;
      if (v instanceof obsidian.MarkdownView && v.editor && v.editor.cm === cm) return v;
    }
    return null;
  }

  _proposerPastilles(cm) {
    if (!cm.hasFocus || PanneauEcritureIA.ouvert) return;
    const sel = cm.state.selection.main;
    if (sel.empty || cm.state.sliceDoc(sel.from, sel.to).trim().length < 3) return;
    const vue = this._vueDeCm(cm);
    if (!vue || vue.getMode() !== 'source') return;
    new PanneauEcritureIA(this, vue).ouvrir({ discret: true });
  }

  // Les écritures d'Ariane elle-même ne passent pas par le filet.
  ecritureIA(fn) {
    this._ecritureIA = true;
    try { return fn(); } finally { this._ecritureIA = false; }
  }

  _verifierCitations(u) {
    if (this._ecritureIA || this.settings.assistantFilet === false) return;
    for (const t of u.transactions) {
      if (!t.docChanged || !(t.isUserEvent('input') || t.isUserEvent('paste') || t.isUserEvent('drop'))) continue;
      const perdus = [];
      t.changes.iterChanges((fromA, toA, fromB, toB, insere) => {
        const avant = t.startState.doc.sliceString(fromA, toA);
        if (avant.length < 20 || avant.length > 20000 || insere.length < 10) return;
        perdus.push(...AssistantEcriture.citationsPerdues(avant, insere.toString()));
      });
      if (perdus.length) setTimeout(() => this._alerterCitations(u.view, perdus), 0);
    }
  }

  _alerterCitations(cm, perdus) {
    const vue = this._vueDeCm(cm);
    const frag = createFragment((f) => {
      f.createDiv({ text: tr('Cette réécriture a fait disparaître ') + perdus.length + tr(' lien(s) ou citation(s) :') });
      f.createDiv({ cls: 'zfa-ia-perdus', text: perdus.join('  ') });
    });
    const avis = new obsidian.Notice(frag, 15000);
    if (vue && vue.editor) {
      const b = avis.noticeEl.createEl('button', { cls: 'mod-cta', text: tr('Annuler la réécriture') });
      b.addEventListener('click', (e) => { e.stopPropagation(); vue.editor.undo(); avis.hide(); });
    }
  }

  // « Qu'en pensez-vous ? » : chaque remarque devient un commentaire en
  // marge sur le passage qu'elle cite, signé « Ariane (IA) », en violet. Une
  // seule transaction. Rend le nombre de remarques posées.
  poserRemarquesIA(ed, from, to, original, remarques) {
    const plage = this.plageCibleIA(ed.cm) || { from, to };
    if (ed.getRange(ed.offsetToPos(plage.from), ed.offsetToPos(plage.to)) !== original) return 0;
    const pris = CommentairesMarge.idsExistants(ed.getValue());
    let texte = original;
    let n = 0;
    for (const r of remarques.slice().reverse()) {
      const id = CommentairesMarge.nouvelId(pris);
      pris.add(id);
      const ch = CommentairesMarge.entourer(texte, r.from, r.to, r.remarque, id, 'purple',
        { auteur: tr('Ariane (IA)'), heure: CommentairesMarge.horodatage() });
      if (!ch) continue;
      texte = CommentairesMarge.appliquer(texte, ch);
      n += 1;
    }
    if (!n) return 0;
    this.ecritureIA(() => ed.transaction({ changes: [{ from: ed.offsetToPos(plage.from), to: ed.offsetToPos(plage.to), text: texte }] }));
    if (this.ouvrirVueCommentaires) this.ouvrirVueCommentaires(false);
    return n;
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
    new PanneauEcritureIA(this, vue).ouvrir(action ? { action } : { saisie: true });
  }

  // Les outils d'écriture d'Apple eux-mêmes (macOS 15.2 et suivants) : la
  // même action que leur entrée du clic droit, que macOS ajoute au menu
  // contextuel d'Obsidian (Electron 36 et suivants), envoyée au répondeur
  // actif, c'est-à-dire l'éditeur. Leur fenêtre et leur moteur sont ceux du
  // système ; ils ignorent tout des citations, d'où le filet de sécurité.
  outilsEcritureApple(vue) {
    const remote = window.electron && window.electron.remote;
    const menu = remote && remote.Menu;
    if (!MoteurAppleIA.disponible() || !menu || typeof menu.sendActionToFirstResponder !== 'function') {
      new obsidian.Notice(tr('Les outils d’écriture d’Apple ne sont pas accessibles ici.'));
      return false;
    }
    PanneauEcritureIA.fermerTout();
    if (vue && vue.editor) vue.editor.focus();
    menu.sendActionToFirstResponder('showWritingTools:');
    return true;
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

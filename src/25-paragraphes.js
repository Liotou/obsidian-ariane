//#region 25 · Paragraphes
// ═══════════════════════════════════════════════════════════════════════════
//  25 · PARAGRAPHES
//  Les paragraphes de la note numérotés dans la marge de gauche, et
//  déplaçables : on saisit le numéro (ou la poignée) et on le fait glisser ;
//  un trait guide montre où le paragraphe se posera. Les titres, listes,
//  citations et blocs de code se déplacent de même, par leur poignée, sans
//  numéro. ParagraphesTexte : la logique pure (découpage en blocs,
//  déplacement) ; GlisserParagraphes : l'extension de l'éditeur.
// ═══════════════════════════════════════════════════════════════════════════

class ParagraphesTexte {
  // Le genre d'une ligne : vide, titre, liste, citation, tableau, filet,
  // autre (HTML, intégration, note de bas de page, commentaire) ou
  // paragraphe. Les balises d'un commentaire en marge ne comptent pas.
  static genreLigne(ligne) {
    const brut = String(ligne || '');
    const net = brut.replace(/^([ \t]*)(?:<span\b[^>]*class="ann-[se]"[^>]*><\/span>)+/, '$1').trim();
    if (!net) return brut.trim() ? 'autre' : 'vide';
    if (/^#{1,6}(\s|$)/.test(net)) return 'titre';
    if (/^([-*+]|\d{1,9}[.)])(\s|$)/.test(net)) return 'liste';
    if (net.startsWith('>')) return 'citation';
    if (net.startsWith('|')) return 'tableau';
    if (/^([-*_])([ \t]*\1){2,}$/.test(net)) return 'filet';
    if (/^(%%|<!--|<[a-zA-Z/]|!\[\[|\[\^[^\]]+\]:)/.test(net)) return 'autre';
    return 'paragraphe';
  }

  // Les blocs du texte, dans l'ordre : { from, to, genre, numero }. from est
  // le début de la première ligne, to la fin de la dernière (saut exclu).
  // Chaque ligne de texte est un paragraphe : Monsieur sépare ses
  // paragraphes d'un simple saut de ligne, pas d'une ligne vide. Une puce
  // emporte ses sous-puces et ses lignes en retrait ; une citation, un
  // tableau, un bloc de code ou de formules restent entiers ; un titre, un
  // filet forment un bloc à eux seuls. Seuls les paragraphes sont numérotés
  // (numero 0 pour les autres). L'en-tête YAML est sauté.
  static blocs(texte) {
    const t = String(texte || '');
    const lignes = [];
    for (let i = 0; ;) {
      let j = t.indexOf('\n', i);
      if (j < 0) j = t.length;
      lignes.push({ from: i, to: j, s: t.slice(i, j) });
      if (j >= t.length) break;
      i = j + 1;
    }
    let k = 0;
    if (lignes[0].s === '---') {
      const fin = lignes.findIndex((l, n) => n > 0 && /^(---|\.\.\.)[ \t]*$/.test(l.s));
      if (fin > 0) k = fin + 1;
    }
    const out = [];
    let cur = null;
    const fermer = () => { if (cur) out.push(cur); cur = null; };
    for (; k < lignes.length; k++) {
      const l = lignes[k];
      const cloture = l.s.match(/^[ \t>]*(`{3,}|~{3,})/);
      const net = l.s.trim();
      if (cloture || net === '$$' || (net.startsWith('$$') && !(net.length > 3 && net.endsWith('$$')))) {
        fermer();
        const genre = cloture ? 'code' : 'maths';
        let n = k + 1;
        for (; n < lignes.length; n++) {
          const s = lignes[n].s.replace(/^[ \t>]*/, '');
          if (cloture ? s.startsWith(cloture[1]) : lignes[n].s.trim().endsWith('$$')) break;
        }
        const der = Math.min(n, lignes.length - 1);
        out.push({ from: l.from, to: lignes[der].to, genre });
        k = der;
        continue;
      }
      const g = ParagraphesTexte.genreLigne(l.s);
      if (g === 'vide') { fermer(); continue; }
      if (g === 'titre' || g === 'filet') { fermer(); out.push({ from: l.from, to: l.to, genre: g }); continue; }
      const retrait = /^[ \t]*/.exec(l.s)[0].replace(/\t/g, '    ').length;
      // Sous une puce, ce qui est plus en retrait lui appartient : sous-puces
      // et lignes de suite.
      if (cur && cur.genre === 'liste' && (g === 'liste' || g === 'paragraphe') && retrait > cur.retrait) {
        cur.to = l.to;
        continue;
      }
      // Les lignes d'une même citation, d'un même tableau, restent ensemble.
      if (cur && g === cur.genre && g !== 'liste' && g !== 'paragraphe') {
        cur.to = l.to;
        continue;
      }
      fermer();
      cur = { from: l.from, to: l.to, genre: g, retrait };
    }
    fermer();
    let n = 0;
    for (const b of out) {
      delete b.retrait;
      b.numero = b.genre === 'paragraphe' ? ++n : 0;
    }
    return out;
  }

  // L'indice du bloc qui contient la position, -1 hors de tout bloc.
  static indexA(blocs, pos) {
    let bas = 0;
    let haut = blocs.length - 1;
    while (bas <= haut) {
      const m = (bas + haut) >> 1;
      if (pos < blocs[m].from) haut = m - 1;
      else if (pos > blocs[m].to) bas = m + 1;
      else return m;
    }
    return -1;
  }

  // Déplace le bloc i à l'emplacement « cible » : avant le bloc cible, ou
  // après le dernier si cible vaut blocs.length. Le bloc emporte l'écart qui
  // le suivait (ou le précédait, s'il était le dernier), pour que les deux
  // bords restent séparés comme avant. Rend { changements, debut, fin } (les
  // changements en positions du texte d'origine, debut et fin ceux du bloc
  // dans le texte obtenu), ou null si le bloc ne bouge pas.
  static deplacer(texte, blocs, i, cible) {
    const n = blocs.length;
    if (i < 0 || i >= n || cible < 0 || cible > n || cible === i || cible === i + 1) return null;
    const b = blocs[i];
    const corps = texte.slice(b.from, b.to);
    let retrait;
    let ecart;
    if (i + 1 < n) {
      retrait = { from: b.from, to: blocs[i + 1].from };
      ecart = texte.slice(b.to, blocs[i + 1].from);
    } else {
      retrait = { from: blocs[i - 1].to, to: b.to };
      ecart = texte.slice(blocs[i - 1].to, b.from);
    }
    if (!ecart.includes('\n')) ecart = '\n\n';
    const apresTout = cible === n;
    const pos = apresTout ? blocs[n - 1].to : blocs[cible].from;
    const insertion = { from: pos, to: pos, insert: apresTout ? ecart + corps : corps + ecart };
    const decale = apresTout ? ecart.length : 0;
    const debut = (pos < retrait.from ? pos : pos - (retrait.to - retrait.from)) + decale;
    const changements = [{ from: retrait.from, to: retrait.to, insert: '' }, insertion].sort((x, y) => x.from - y.from);
    return { changements, debut, fin: debut + corps.length };
  }

  // Quelques mots du début d'un bloc, sans balisage, pour le fantôme.
  static extrait(texte, bloc, max) {
    const s = texte.slice(bloc.from, bloc.to)
      .replace(/<span\b[^>]*><\/span>/g, '')
      .replace(/^[ \t>]*(#{1,6}\s+|[-*+]\s+(\[.\]\s+)?|\d+[.)]\s+)?/, '')
      .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
      .replace(/[*_`=~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const m = max || 60;
    return s.length > m ? s.slice(0, m - 1).trimEnd() + '…' : s;
  }
}

class GlisserParagraphes {
  // Les trois affichages : les numéros tout le temps, au survol du
  // paragraphe, ou jamais (une poignée au survol, seulement).
  static get MODES() { return ['toujours', 'survol', 'poignee']; }

  static mode(greffon) {
    const m = greffon.settings && greffon.settings.paragraphesMode;
    return GlisserParagraphes.MODES.includes(m) ? m : 'toujours';
  }

  // L'extension de l'éditeur : un repère au début de chaque bloc (numéro ou
  // poignée), le survol, le glisser-déposer. `effet` redessine.
  static extension(greffon) {
    const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
    const { StateEffect } = require('@codemirror/state');
    const effet = StateEffect.define();
    greffon._effetParagraphes = effet;
    let plugin = null;

    class Repere extends WidgetType {
      constructor(numero, genre) { super(); this.numero = numero; this.genre = genre; }
      eq(o) { return o.numero === this.numero && o.genre === this.genre; }
      toDOM(vue) {
        const d = vue.dom.ownerDocument;
        const el = d.createElement('span');
        el.className = 'zfa-para-repere zfa-para-' + this.genre + (this.numero ? ' a-numero' : '');
        el.setAttribute('contenteditable', 'false');
        el.setAttribute('aria-label', tr('Glisser pour déplacer ; cliquer pour sélectionner'));
        if (this.numero) {
          const n = d.createElement('span');
          n.className = 'zfa-para-num';
          n.textContent = String(this.numero);
          el.appendChild(n);
        }
        const p = d.createElement('span');
        p.className = 'zfa-para-prise';
        obsidian.setIcon(p, 'grip-vertical');
        el.appendChild(p);
        el.addEventListener('mousedown', (e) => e.preventDefault());
        el.addEventListener('pointerdown', (e) => {
          const inst = plugin && vue.plugin(plugin);
          if (inst) inst.commencer(el, e);
        });
        return el;
      }
      ignoreEvent() { return true; }
    }

    plugin = ViewPlugin.fromClass(class {
      constructor(vue) {
        this.vue = vue;
        this.blocs = ParagraphesTexte.blocs(vue.state.doc.toString());
        this.survol = -1;
        this.deplace = -1;
        this.arrive = -1;
        this.decorations = this.decorer();
        this.marquerMode();
        this.surMouvement = (e) => this.survoler(e);
        this.surSortie = () => this.poserSurvol(-1);
        vue.scrollDOM.addEventListener('mousemove', this.surMouvement);
        vue.scrollDOM.addEventListener('mouseleave', this.surSortie);
      }

      update(u) {
        if (u.docChanged) {
          this.blocs = ParagraphesTexte.blocs(u.state.doc.toString());
          if (this.arrive >= 0) this.arrive = u.changes.mapPos(this.arrive);
          this.survol = -1;
        }
        const signal = u.transactions.some((t) => t.effects.some((e) => e.is(effet)));
        if (u.docChanged || u.viewportChanged || signal) this.decorations = this.decorer();
        if (signal) this.marquerMode();
      }

      destroy() {
        this.vue.scrollDOM.removeEventListener('mousemove', this.surMouvement);
        this.vue.scrollDOM.removeEventListener('mouseleave', this.surSortie);
        if (this.finir) this.finir(false);
      }

      marquerMode() { this.vue.dom.setAttribute('data-zfa-para', GlisserParagraphes.mode(greffon)); }

      redessiner() {
        try { this.vue.dispatch({ effects: effet.of(null) }); } catch (e) { /* éditeur fermé */ }
      }

      // Les repères et le marquage des lignes, sur la partie visible.
      decorer() {
        const vue = this.vue;
        const doc = vue.state.doc;
        const arrive = this.arrive >= 0 ? ParagraphesTexte.indexA(this.blocs, this.arrive) : -1;
        const deco = [];
        const vus = new Set();
        for (const { from, to } of vue.visibleRanges) {
          let i = Math.max(0, ParagraphesTexte.indexA(this.blocs, from));
          while (i < this.blocs.length && this.blocs[i].to < from) i += 1;
          for (; i < this.blocs.length && this.blocs[i].from <= to; i++) {
            const b = this.blocs[i];
            if (b.from >= from && !vus.has('w' + i)) {
              vus.add('w' + i);
              deco.push(Decoration.widget({ widget: new Repere(b.numero, b.genre), side: -1 }).range(b.from));
            }
            const cls = 'zfa-para-ligne' + (i === this.deplace ? ' est-deplace' : '') + (i === arrive ? ' est-arrive' : '');
            for (let p = Math.max(b.from, doc.lineAt(from).from); p <= Math.min(b.to, to);) {
              const l = doc.lineAt(p);
              if (!vus.has(l.from)) {
                vus.add(l.from);
                deco.push(Decoration.line({ class: cls, attributes: { 'data-zfa-bloc': String(i) } }).range(l.from));
              }
              p = l.to + 1;
            }
          }
        }
        return Decoration.set(deco, true);
      }

      // Le bloc à la hauteur du pointeur, marge de gauche comprise.
      blocA(clientX, clientY) {
        const r = this.vue.contentDOM.getBoundingClientRect();
        if (clientX < r.left - 96 || clientX > r.right) return -1;
        const ligne = this.vue.lineBlockAtHeight(clientY - this.vue.documentTop);
        return ParagraphesTexte.indexA(this.blocs, ligne.from);
      }

      survoler(e) {
        if (this.finir) return;
        this.poserSurvol(this.blocA(e.clientX, e.clientY));
      }

      poserSurvol(i) {
        if (i === this.survol) return;
        const c = this.vue.contentDOM;
        c.querySelectorAll('.zfa-para-repere.est-survole').forEach((x) => x.classList.remove('est-survole'));
        this.survol = i;
        if (i < 0) return;
        const el = c.querySelector('.cm-line[data-zfa-bloc="' + i + '"] .zfa-para-repere');
        if (el) el.classList.add('est-survole');
      }

      // L'emplacement visé (avant le bloc k, ou après le dernier) et la
      // hauteur du guide, en coordonnées du document de l'éditeur.
      emplacement(yDoc) {
        const vue = this.vue;
        const blocs = this.blocs;
        const n = blocs.length;
        const haut = (k) => vue.lineBlockAt(blocs[k].from).top;
        const bas = (k) => vue.lineBlockAt(blocs[k].to).bottom;
        const ligne = vue.lineBlockAtHeight(yDoc);
        let k = ParagraphesTexte.indexA(blocs, ligne.from);
        let cible;
        if (k >= 0) cible = yDoc < (haut(k) + bas(k)) / 2 ? k : k + 1;
        else {
          k = blocs.findIndex((b) => b.from > ligne.from);
          cible = k < 0 ? n : k;
        }
        let y;
        if (cible === 0) y = haut(0) - 3;
        else if (cible === n) y = bas(n - 1) + 3;
        else y = (bas(cible - 1) + haut(cible)) / 2;
        return { cible, y };
      }

      // Le glisser : un léger mouvement le lance ; un simple clic sélectionne
      // le bloc. Le trait guide suit l'emplacement visé, le fantôme suit le
      // pointeur, la page défile près des bords. Échap annule.
      commencer(el, e) {
        if (e.button !== 0 || this.finir) return;
        e.preventDefault();
        e.stopPropagation();
        const vue = this.vue;
        const i = ParagraphesTexte.indexA(this.blocs, vue.posAtDOM(el));
        if (i < 0) return;
        const doc = vue.dom.ownerDocument;
        const win = doc.defaultView;
        const x0 = e.clientX;
        const y0 = e.clientY;
        let x = x0;
        let y = y0;
        let lance = false;
        let cible = -1;
        let boucle = 0;
        const guide = doc.createElement('div');
        guide.className = 'zfa-para-guide';
        const fantome = doc.createElement('div');
        fantome.className = 'zfa-para-fantome';
        const b = this.blocs[i];
        const morceau = (cls, txt) => {
          const s = doc.createElement('span');
          s.className = cls;
          s.textContent = txt;
          fantome.appendChild(s);
        };
        if (b.numero) morceau('zfa-para-fantome-num', String(b.numero));
        morceau('zfa-para-fantome-texte', ParagraphesTexte.extrait(vue.state.doc.toString(), b, 56) || tr('(bloc)'));

        const suivre = () => {
          const rc = vue.scrollDOM.getBoundingClientRect();
          const marge = 56;
          if (y < rc.top + marge) vue.scrollDOM.scrollTop -= Math.ceil((rc.top + marge - y) / 5);
          else if (y > rc.bottom - marge) vue.scrollDOM.scrollTop += Math.ceil((y - (rc.bottom - marge)) / 5);
          const yVise = Math.min(Math.max(y, rc.top + 1), rc.bottom - 1);
          const e2 = this.emplacement(yVise - vue.documentTop);
          cible = e2.cible;
          const yGuide = e2.y + vue.documentTop;
          const r = vue.contentDOM.getBoundingClientRect();
          const st = win.getComputedStyle(vue.contentDOM);
          const gauche = r.left + parseFloat(st.paddingLeft || '0');
          const largeur = r.width - parseFloat(st.paddingLeft || '0') - parseFloat(st.paddingRight || '0');
          const nul = cible === i || cible === i + 1;
          guide.classList.toggle('est-nul', nul);
          guide.classList.toggle('est-cache', yGuide < rc.top || yGuide > rc.bottom);
          guide.style.transform = 'translate(' + Math.round(gauche) + 'px,' + Math.round(yGuide - 1) + 'px)';
          guide.style.width = Math.round(largeur) + 'px';
          fantome.style.transform = 'translate(' + Math.round(x + 14) + 'px,' + Math.round(y + 12) + 'px)';
          boucle = win.requestAnimationFrame(suivre);
        };
        const lancer = () => {
          lance = true;
          this.poserSurvol(-1);
          this.deplace = i;
          doc.body.classList.add('zfa-para-glisse');
          doc.body.appendChild(guide);
          doc.body.appendChild(fantome);
          this.redessiner();
          suivre();
        };
        const bouger = (ev) => {
          x = ev.clientX;
          y = ev.clientY;
          if (!lance && Math.hypot(x - x0, y - y0) > 4) lancer();
        };
        const lacher = () => this.finir(true);
        const annuler = () => this.finir(false);
        const echap = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.finir(false); } };
        this.finir = (appliquer) => {
          doc.removeEventListener('pointermove', bouger);
          doc.removeEventListener('pointerup', lacher);
          doc.removeEventListener('pointercancel', annuler);
          doc.removeEventListener('keydown', echap, true);
          if (boucle) win.cancelAnimationFrame(boucle);
          guide.remove();
          fantome.remove();
          doc.body.classList.remove('zfa-para-glisse');
          this.finir = null;
          this.deplace = -1;
          if (!lance) {
            if (appliquer) {
              vue.dispatch({ selection: { anchor: b.from, head: b.to } });
              vue.focus();
            }
            return;
          }
          const texte = vue.state.doc.toString();
          const r = appliquer ? ParagraphesTexte.deplacer(texte, this.blocs, i, cible) : null;
          if (!r) { this.redessiner(); return; }
          vue.dispatch({ changes: r.changements, selection: { anchor: r.debut }, userEvent: 'move.paragraphe' });
          this.arrive = r.debut;
          this.redessiner();
          vue.focus();
          win.setTimeout(() => { this.arrive = -1; this.redessiner(); }, 900);
        };
        doc.addEventListener('pointermove', bouger);
        doc.addEventListener('pointerup', lacher);
        doc.addEventListener('pointercancel', annuler);
        doc.addEventListener('keydown', echap, true);
      }
    }, { decorations: (v) => v.decorations });
    return plugin;
  }
}

//#endregion 25 · Paragraphes

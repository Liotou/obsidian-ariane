//#region 23 · Commentaires en marge
// ═══════════════════════════════════════════════════════════════════════════
//  23 · COMMENTAIRES EN MARGE
//  Des commentaires sur un passage, comme dans Word : le passage est
//  surligné, le commentaire tient dans une carte en marge, face au texte,
//  avec réponses, résolution, couleur, auteur et date.
//
//  Repris du greffon Margin Annotations (hex, github.com/aoldiot/
//  margin-annotations, version 0.3.7), sous licence MIT :
//    Copyright (c) 2026 hex. Permission is hereby granted, free of charge,
//    to any person obtaining a copy of this software and associated
//    documentation files (the "Software"), to deal in the Software without
//    restriction, including without limitation the rights to use, copy,
//    modify, merge, publish, distribute, sublicense, and/or sell copies of
//    the Software, and to permit persons to whom the Software is furnished
//    to do so, subject to the following conditions: The above copyright
//    notice and this permission notice shall be included in all copies or
//    substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
//    WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
//    LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
//    PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
//    HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN
//    AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
//    CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//    SOFTWARE.
//
//  Le format dans la note est celui du greffon d'origine, pour qu'une note
//  commentée reste lisible par lui comme par une IA : deux balises vides,
//    <span class="ann-s" data-id="k3f9" data-color="yellow"></span>passage
//    <span class="ann-e" data-id="k3f9" data-color="yellow" data-note="…"></span>
//  la seconde portant le commentaire (data-note), l'auteur, la date, la
//  résolution (data-resolved="1") et les réponses (data-replies, JSON).
//  Différence voulue : Ariane n'écrit pas le guide pour les IA que le
//  greffon d'origine ajoutait en fin de note.
//
//  CommentairesMarge : la logique pure (lecture, pose, retrait), éprouvée
//  par tests/commentaires-marge.test.js. PanneauCommentairesMarge et
//  GestionCommentairesMarge : les cartes en marge. VueCommentairesMarge :
//  le volet latéral qui les porte. Le branchement est dans avecCommentaires
//  (11t).
// ═══════════════════════════════════════════════════════════════════════════

class CommentairesMarge {
  static get COULEURS() {
    return [
      { cle: 'yellow', nom: 'Jaune', css: '#ffd000' },
      { cle: 'green', nom: 'Vert', css: '#3ec06a' },
      { cle: 'blue', nom: 'Bleu', css: '#4a9eff' },
      { cle: 'pink', nom: 'Rose', css: '#ff6fa5' },
      { cle: 'purple', nom: 'Violet', css: '#a67cff' },
      { cle: 'orange', nom: 'Orange', css: '#ff8a3d' },
    ];
  }

  static normaliserCouleur(c) {
    return CommentairesMarge.COULEURS.some((x) => x.cle === c) ? c : 'yellow';
  }

  static couleurCss(c) {
    const t = CommentairesMarge.COULEURS.find((x) => x.cle === c);
    return t ? t.css : CommentairesMarge.COULEURS[0].css;
  }

  // Valeur d'attribut HTML. Neutralise aussi la syntaxe d'Obsidian ([[ ]],
  // $, %%, #étiquette, ==) qui, sinon, s'animerait dans la balise.
  static encoder(s) {
    return String(s).replace(/[&"<>\n\r[\]$%#=~`|]/g, (c) => (c === '\r' ? '' : '&#' + c.charCodeAt(0) + ';'));
  }

  static decoder(s) {
    return String(s)
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  static nouvelId(existants) {
    const pris = existants || new Set();
    for (;;) {
      const id = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
      if (!pris.has(id)) return id;
    }
  }

  static baliseDebut(id, couleur) {
    return '<span class="ann-s" data-id="' + id + '" data-color="' + CommentairesMarge.normaliserCouleur(couleur) + '"></span>';
  }

  // « AAAA-MM-JJ HH:mm », à l'heure locale.
  static horodatage(d) {
    const x = d || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate()) + ' ' + p(x.getHours()) + ':' + p(x.getMinutes());
  }

  static baliseFin(id, couleur, note, meta) {
    const m = meta || {};
    let extra = '';
    if (m.auteur) extra += ' data-author="' + CommentairesMarge.encoder(m.auteur) + '"';
    if (m.heure) extra += ' data-time="' + CommentairesMarge.encoder(m.heure) + '"';
    if (m.resolu) extra += ' data-resolved="1"';
    if (m.reponses && m.reponses.length) {
      extra += ' data-replies="' + CommentairesMarge.encoder(JSON.stringify(
        m.reponses.map((r) => ({ a: r.auteur, t: r.heure, c: r.texte })))) + '"';
    }
    return '<span class="ann-e" data-id="' + id + '" data-color="' + CommentairesMarge.normaliserCouleur(couleur)
      + '" data-note="' + CommentairesMarge.encoder(note) + '"' + extra + '></span>';
  }

  static _reponses(brut) {
    if (!brut) return [];
    try {
      const t = JSON.parse(CommentairesMarge.decoder(brut));
      if (!Array.isArray(t)) return [];
      const ch = (v) => (typeof v === 'string' ? v : '');
      return t.map((r) => ({ auteur: ch((r || {}).a), heure: ch((r || {}).t), texte: ch((r || {}).c) }));
    } catch (e) {
      return [];
    }
  }

  static _attr(balise, nom) {
    const m = new RegExp('\\b' + nom + '="([^"]*)"').exec(balise);
    return m ? m[1] : undefined;
  }

  // Les commentaires de la note, dans l'ordre du texte. Chacun : id,
  // couleur, note, auteur, heure, resolu, reponses, les deux balises
  // (debut, fin : {from, to}), l'étendue entière (from, to) et celle du
  // seul passage (textFrom, textTo). Une balise de fin orpheline est ignorée.
  static lire(doc) {
    const ouverts = new Map();
    const out = [];
    const re = /<span\b[^>]*\bclass="ann-([se])"[^>]*><\/span>/g;
    const attr = CommentairesMarge._attr;
    let m;
    while ((m = re.exec(doc))) {
      const balise = m[0];
      const id = attr(balise, 'data-id');
      if (!id) continue;
      const plage = { from: m.index, to: m.index + balise.length };
      if (m[1] === 's') {
        if (!ouverts.has(id)) ouverts.set(id, plage);
        continue;
      }
      const s = ouverts.get(id);
      if (!s) continue;
      ouverts.delete(id);
      const note = attr(balise, 'data-note');
      out.push({
        id,
        couleur: CommentairesMarge.normaliserCouleur(attr(balise, 'data-color') || attr(doc.slice(s.from, s.to), 'data-color')),
        note: note === undefined ? '' : CommentairesMarge.decoder(note),
        auteur: CommentairesMarge.decoder(attr(balise, 'data-author') || ''),
        heure: CommentairesMarge.decoder(attr(balise, 'data-time') || ''),
        resolu: attr(balise, 'data-resolved') === '1',
        reponses: CommentairesMarge._reponses(attr(balise, 'data-replies')),
        debut: s,
        fin: plage,
        from: s.from,
        to: plage.to,
        textFrom: s.to,
        textTo: plage.from,
      });
    }
    return out.sort((a, b) => a.from - b.from);
  }

  // Le commentaire le plus intérieur qui contient la position.
  static trouverA(doc, pos) {
    let mieux = null;
    for (const a of CommentairesMarge.lire(doc)) {
      if (pos >= a.from && pos <= a.to && (!mieux || a.to - a.from < mieux.to - mieux.from)) mieux = a;
    }
    return mieux;
  }

  static trouverParId(doc, id) {
    return CommentairesMarge.lire(doc).find((a) => a.id === id) || null;
  }

  static idsExistants(doc) {
    return new Set(CommentairesMarge.lire(doc).map((a) => a.id));
  }

  // Position du début de la ligne `ligne` (comptée depuis 0).
  static decalageLigne(texte, ligne) {
    let pos = 0;
    for (let i = 0; i < ligne; i += 1) {
      const nl = texte.indexOf('\n', pos);
      if (nl < 0) return texte.length;
      pos = nl + 1;
    }
    return pos;
  }

  // Un court aperçu, en texte brut, du passage commenté.
  static extrait(doc, a, max) {
    const lim = max || 80;
    let t = doc.slice(a.textFrom, a.textTo)
      .replace(/<span\b[^>]*\bclass="ann-[se]"[^>]*><\/span>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/^\s*(?:>\s?)*(?:(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?|#{1,6}\s+)/gm, '')
      .replace(/[*_~`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length > lim) t = t.slice(0, lim) + '…';
    return t;
  }

  // ── Pose ──

  static get _RE() {
    return {
      prefixe: /^[ \t]*(?:>[ \t]?)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+)?/,
      cloture: /^[ \t]*(```|~~~)/,
      filet: /^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/,
      encadre: /^[ \t]*(?:>[ \t]?)*[ \t]*\[!/,
      separateurTableau: /^[ \t]*\|?[ \t:|-]+\|?[ \t]*$/,
      citation: /^[ \t]*(?:>[ \t]?)*[ \t]*/,
      syntaxe: /<[^>\n]*>|\]\([^)\n]*\)|\[![^\]\n]*\][+-]?/y,
      lettreTombee: /[\s*_~=`\\[\]]/,
    };
  }

  static _dansClotureAvant(doc, pos) {
    let dedans = false;
    const debutLigne = doc.lastIndexOf('\n', pos - 1) + 1;
    for (const l of doc.slice(0, debutLigne).split('\n')) if (CommentairesMarge._RE.cloture.test(l)) dedans = !dedans;
    return dedans;
  }

  // Le bloc de code clôturé qui contient toute la sélection [from, to].
  static _blocCodeAutour(doc, from, to) {
    const RE = CommentairesMarge._RE;
    let ouvert = null;
    let ls = 0;
    while (ls <= doc.length) {
      let le = doc.indexOf('\n', ls);
      if (le < 0) le = doc.length;
      const ligne = doc.slice(ls, le);
      if (RE.cloture.test(ligne)) {
        if (!ouvert) ouvert = { ls, prefixe: /^[ \t>]*/.exec(ligne)[0] };
        else {
          if (from >= ouvert.ls && to <= le) return { from: ouvert.ls, to: le, prefixe: ouvert.prefixe };
          ouvert = null;
        }
      }
      if (le >= doc.length) break;
      ls = le + 1;
    }
    if (ouvert && from >= ouvert.ls) return { from: ouvert.ls, to: doc.length, prefixe: ouvert.prefixe };
    return null;
  }

  // Un bloc de code : les balises sur des lignes à elles, hors des clôtures,
  // pour que le code reste intact.
  static _entourerCode(doc, b, note, id, couleur, meta) {
    const vide = b.prefixe.trimEnd();
    const ecart = b.from > 0 && doc.slice(doc.lastIndexOf('\n', b.from - 2) + 1, b.from - 1).trim() !== '';
    return [
      { from: b.from, to: b.from, insert: (ecart ? vide + '\n' : '') + b.prefixe + CommentairesMarge.baliseDebut(id, couleur) + '\n' + vide + '\n' },
      { from: b.to, to: b.to, insert: '\n' + vide + '\n' + b.prefixe + CommentairesMarge.baliseFin(id, couleur, note, meta) },
    ];
  }

  // Une sélection dans une seule cellule de tableau (même ligne, sans
  // barre) se commente comme du texte ordinaire.
  static _celluleTableau(doc, from, to) {
    const ls = doc.lastIndexOf('\n', from - 1) + 1;
    let le = doc.indexOf('\n', from);
    if (le < 0) le = doc.length;
    if (to > le) return null;
    const ligne = doc.slice(ls, le);
    if (!ligne.trimStart().startsWith('|') || CommentairesMarge._RE.separateurTableau.test(ligne)) return null;
    if (doc.slice(from, to).includes('|')) return null;
    return { from, to };
  }

  // Sans sélection : la cellule de tableau, le bloc de code ou la ligne sous
  // le curseur. null s'il n'y a pas de texte.
  static plageAuCurseur(doc, pos) {
    const RE = CommentairesMarge._RE;
    const bloc = CommentairesMarge._blocCodeAutour(doc, pos, pos);
    if (bloc) return { from: bloc.from, to: bloc.to };
    const ls = doc.lastIndexOf('\n', pos - 1) + 1;
    let le = doc.indexOf('\n', pos);
    if (le < 0) le = doc.length;
    const ligne = doc.slice(ls, le);
    if (RE.separateurTableau.test(ligne)) return null;
    let from = ls;
    let to = le;
    if (ligne.trimStart().startsWith('|')) {
      const rel = pos - ls;
      const g = ligne.lastIndexOf('|', Math.max(rel - 1, 0));
      const d = ligne.indexOf('|', rel);
      from = ls + g + 1;
      to = d < 0 ? le : ls + d;
    }
    const texte = doc.slice(from, to);
    if (texte.trim() === '' || RE.filet.test(texte)) return null;
    return { from, to };
  }

  // ── Du texte rendu à la source ──
  //  L'aperçu en direct dessine les blocs hors du curseur (encadrés…) en
  //  widgets : un texte choisi là n'est qu'une sélection du DOM, et l'éditeur
  //  la voit vide. Ces fonctions retrouvent ce texte dans la source.

  // Le texte rendu, réduit à ce qui survit dans le DOM comme dans la source.
  static texteCompact(s) {
    const tombee = CommentairesMarge._RE.lettreTombee;
    return Array.from(String(s).replace(/💬/gu, '')).filter((c) => !tombee.test(c)).join('');
  }

  // Les lignes non vides autour de la position (encadré, paragraphe, liste).
  static blocAutour(doc, pos) {
    const debutDe = (o) => (o <= 0 ? 0 : doc.lastIndexOf('\n', o - 1) + 1);
    const finDe = (o) => {
      const i = doc.indexOf('\n', o);
      return i < 0 ? doc.length : i;
    };
    let from = debutDe(pos);
    while (from > 0) {
      const prec = debutDe(from - 1);
      if (doc.slice(prec, from - 1).trim() === '') break;
      from = prec;
    }
    let to = finDe(pos);
    while (to < doc.length) {
      const suiv = finDe(to + 1);
      if (doc.slice(to + 1, suiv).trim() === '') break;
      to = suiv;
    }
    return { from, to };
  }

  // La source telle qu'elle se lit une fois rendue (compactée), avec la
  // position dans la source de chaque caractère restant.
  static _vueRendue(src) {
    const RE = CommentairesMarge._RE;
    let texte = '';
    const at = [];
    let dansCode = false;
    let ls = 0;
    for (;;) {
      let le = src.indexOf('\n', ls);
      if (le < 0) le = src.length;
      const ligne = src.slice(ls, le);
      const cit = RE.citation.exec(ligne)[0].length;
      const estCloture = /^(```|~~~)/.test(ligne.slice(cit));
      if (estCloture) dansCode = !dansCode;
      let i = ls + (dansCode || estCloture ? cit : RE.prefixe.exec(ligne)[0].length);
      if (estCloture) i = le;
      while (i < le) {
        RE.syntaxe.lastIndex = i;
        const jeton = dansCode ? null : RE.syntaxe.exec(src);
        if (jeton) { i += jeton[0].length; continue; }
        const c = src[i];
        if (!RE.lettreTombee.test(c)) { texte += c; at.push(i); }
        i += 1;
      }
      if (le >= src.length) break;
      ls = le + 1;
    }
    return { texte, at };
  }

  // Chaque endroit de la source d'où peut venir le texte rendu.
  static trouverTexteRendu(src, rendu) {
    const cible = CommentairesMarge.texteCompact(rendu);
    if (!cible) return [];
    const { texte, at } = CommentairesMarge._vueRendue(src);
    const out = [];
    for (let i = texte.indexOf(cible); i >= 0; i = texte.indexOf(cible, i + cible.length)) {
      out.push({ from: at[i], to: at[i + cible.length - 1] + 1 });
    }
    return out;
  }

  // Combien d'occurrences de `cible` commencent avant `avant` (textes compactés).
  static occurrencesAvant(meule, cible, avant) {
    let n = 0;
    if (!cible) return n;
    for (let i = meule.indexOf(cible); i >= 0 && i < avant; i = meule.indexOf(cible, i + cible.length)) n += 1;
    return n;
  }

  // Les changements qui posent les deux balises autour de doc[from, to).
  // La balise d'ouverture saute les préfixes de liste, de titre et de
  // citation ; l'étendue ne commence ni ne finit dans une clôture de code,
  // un tableau, un filet ou un en-tête d'encadré. Exceptions : une sélection
  // dans une seule cellule s'entoure telle quelle, une sélection dans un
  // bloc de code commente tout le bloc. null si rien n'est commentable.
  static entourer(doc, from, to, note, id, couleur, meta) {
    const RE = CommentairesMarge._RE;
    const c = couleur || 'yellow';
    while (from < to && /\s/.test(doc[from])) from += 1;
    while (to > from && /\s/.test(doc[to - 1])) to -= 1;
    if (from >= to) return null;

    const bloc = CommentairesMarge._blocCodeAutour(doc, from, to);
    if (bloc) return CommentairesMarge._entourerCode(doc, bloc, note, id, c, meta || {});
    const cellule = CommentairesMarge._celluleTableau(doc, from, to);
    if (cellule) {
      return [
        { from: cellule.from, to: cellule.from, insert: CommentairesMarge.baliseDebut(id, c) },
        { from: cellule.to, to: cellule.to, insert: CommentairesMarge.baliseFin(id, c, note, meta) },
      ];
    }

    let dansCode = CommentairesMarge._dansClotureAvant(doc, from);
    let debut = -1;
    let fin = -1;
    let ls = doc.lastIndexOf('\n', from - 1) + 1;
    while (ls < to) {
      let le = doc.indexOf('\n', ls);
      if (le < 0) le = doc.length;
      const ligne = doc.slice(ls, le);
      const net = ligne.trim();
      let ok = true;
      if (RE.cloture.test(ligne)) { dansCode = !dansCode; ok = false; }
      else if (dansCode || net === '' || net.startsWith('|') || RE.filet.test(ligne) || RE.encadre.test(ligne)) ok = false;
      if (ok) {
        const lo = Math.max(ls, from, ls + RE.prefixe.exec(ligne)[0].length);
        let hi = Math.min(le, to);
        while (hi > lo && /\s/.test(doc[hi - 1])) hi -= 1;
        if (lo < hi) {
          if (debut < 0) debut = lo;
          fin = hi;
        }
      }
      ls = le + 1;
    }
    if (debut < 0) return null;
    return [
      { from: debut, to: debut, insert: CommentairesMarge.baliseDebut(id, c) },
      { from: fin, to: fin, insert: CommentairesMarge.baliseFin(id, c, note, meta) },
    ];
  }

  // ── Retrait, modification ──

  static changementsRetrait(a) {
    return [
      { from: a.debut.from, to: a.debut.to, insert: '' },
      { from: a.fin.from, to: a.fin.to, insert: '' },
    ];
  }

  // patch : { note, couleur, auteur, heure, resolu, reponses }, chacun facultatif.
  static changementsMaj(a, patch) {
    const p = patch || {};
    const pris = (k, v) => (p[k] !== undefined ? p[k] : v);
    const couleur = pris('couleur', a.couleur);
    const meta = { auteur: pris('auteur', a.auteur), heure: pris('heure', a.heure),
      resolu: pris('resolu', a.resolu), reponses: pris('reponses', a.reponses) };
    return [
      { from: a.debut.from, to: a.debut.to, insert: CommentairesMarge.baliseDebut(a.id, couleur) },
      { from: a.fin.from, to: a.fin.to, insert: CommentairesMarge.baliseFin(a.id, couleur, pris('note', a.note), meta) },
    ];
  }

  // À positions égales, les changements suivent l'ordre du tableau.
  static appliquer(doc, changements) {
    let out = doc;
    const ordre = changements.map((c, i) => ({ c, i })).sort((a, b) => b.c.from - a.c.from || b.i - a.i);
    for (const { c } of ordre) out = out.slice(0, c.from) + c.insert + out.slice(c.to);
    return out;
  }
}

// Saisie d'un commentaire hors du panneau (lecture, menu) : texte et couleur.
class ModaleCommentaireMarge extends obsidian.Modal {
  constructor(app, titre, note, couleur, valider) {
    super(app);
    this.titre = titre;
    this.note = note;
    this.couleur = CommentairesMarge.normaliserCouleur(couleur);
    this.valider = valider;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText(this.titre);
    const zone = contentEl.createEl('textarea', { cls: 'zfa-com-modale-saisie' });
    zone.placeholder = tr('Votre commentaire (⌘ ou Ctrl + Entrée pour enregistrer)');
    zone.rows = 5;
    zone.value = this.note;
    zone.addEventListener('input', () => { this.note = zone.value; });
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) {
        e.preventDefault();
        this._valider();
      }
    });
    const rangee = contentEl.createDiv({ cls: 'zfa-com-couleurs' });
    rangee.createSpan({ text: tr('Couleur'), cls: 'zfa-com-couleurs-nom' });
    const pastilles = [];
    for (const c of CommentairesMarge.COULEURS) {
      const p = rangee.createSpan({ cls: 'zfa-com-pastille' });
      p.style.setProperty('--zfa-com-pastille', c.css);
      p.setAttribute('aria-label', tr(c.nom));
      p.toggleClass('is-selected', c.cle === this.couleur);
      p.addEventListener('click', () => {
        this.couleur = c.cle;
        pastilles.forEach((x) => x.removeClass('is-selected'));
        p.addClass('is-selected');
      });
      pastilles.push(p);
    }
    new obsidian.Setting(contentEl)
      .addButton((b) => b.setButtonText(tr('Annuler')).onClick(() => this.close()))
      .addButton((b) => b.setButtonText(tr('Enregistrer')).setCta().onClick(() => this._valider()));
    setTimeout(() => { zone.focus(); zone.setSelectionRange(zone.value.length, zone.value.length); }, 0);
  }

  _valider() {
    const note = String(this.note || '').trim();
    if (!note) { new obsidian.Notice(tr('Le commentaire est vide.')); return; }
    this.close();
    this.valider(note, this.couleur);
  }

  onClose() { this.contentEl.empty(); }
}

// ── Les cartes en marge ──
//  Un panneau suit une vue Markdown : chaque carte se tient face à son
//  passage et glisse avec le texte (mode « suivre ») ; sinon, une liste
//  dans l'ordre du texte, où un clic mène au passage.
const COM_MARGE_ECART = 8;

class PanneauCommentairesMarge {
  constructor(greffon, hote) {
    this.greffon = greffon;
    this.anns = [];
    this.doc = '';
    this.chemin = '';
    this.mode = '';
    this.seq = 0;
    this.raf = 0;
    this.actif = null;
    this.edition = null;
    this.brouillon = null;
    this.brouillonEl = null;
    this.brouillonFin = null;
    this.cartes = new Map();
    this.hauteurPiste = '';
    this.vue = null;
    this.el = hote.createDiv({ cls: 'zfa-com-marge' });
    this.piste = this.el.createDiv({ cls: 'zfa-com-piste' });
    this.surDefilement = () => this.planifier();
    this.surClic = (e) => {
      const hl = e.target && e.target.closest ? e.target.closest('.zfa-com-hl, .zfa-com-bouton') : null;
      if (hl && hl.dataset.id) this.activer(hl.dataset.id);
    };
    this.ro = new ResizeObserver(() => this.planifier());
    this.ro.observe(this.el);
    // Mode « suivre » : la molette sur le panneau fait défiler la note ; le
    // panneau ne défile lui-même qu'une fois la note au bout.
    this.el.addEventListener('wheel', (e) => {
      const def = this._defileur();
      if (!this._suivre || !def || e.ctrlKey) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const auBout = def.scrollTop + def.clientHeight >= def.scrollHeight - 1;
      if (dy > 0 && auBout && this.el.scrollTop + this.el.clientHeight < this.el.scrollHeight) return;
      if (dy < 0 && this.el.scrollTop > 0) return;
      e.preventDefault();
      def.scrollTop += dy;
    }, { passive: false });
    this.el.tabIndex = -1;
    this.el.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea') || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
      if (this.supprimerActif()) e.preventDefault();
    });
    this.el.addEventListener('click', (e) => {
      if (!e.target.closest('.zfa-com-carte')) this.activer(null);
      // Le focus reste dans le panneau, pour que Suppr agisse sur la carte.
      if (!e.target.closest('input, textarea, button')) this.el.focus({ preventScroll: true });
    });
  }

  _win() { return this.el.ownerDocument.defaultView || window; }

  get _suivre() { return this.greffon.settings.commentairesSuivre !== false; }

  _cm(vue) { return vue && vue.editor ? vue.editor.cm : null; }

  _defileur() {
    const v = this.vue;
    if (!v) return null;
    if (v.getMode() === 'source') { const cm = this._cm(v); return cm ? cm.scrollDOM : null; }
    return v.contentEl.querySelector('.markdown-preview-view');
  }

  lier(vue) {
    if (this.vue === vue) return;
    this._delier();
    this.vue = vue;
    this.mode = '';
    if (vue) {
      vue.contentEl.addEventListener('scroll', this.surDefilement, true);
      vue.contentEl.addEventListener('click', this.surClic, true);
      this.ro.observe(vue.contentEl);
    }
    this.rafraichir(true);
  }

  _delier() {
    const r = this.vue && this.vue.contentEl;
    if (!r) return;
    r.removeEventListener('scroll', this.surDefilement, true);
    r.removeEventListener('click', this.surClic, true);
    this.ro.unobserve(r);
  }

  detruire() {
    if (this.brouillonFin) this.brouillonFin();
    this._delier();
    this.ro.disconnect();
    this._win().cancelAnimationFrame(this.raf);
    this.el.remove();
  }

  trouver(id) { return this.anns.find((a) => a.id === id); }

  _occupe() {
    if (this.brouillon || this.edition) return true;
    const ae = this.el.ownerDocument.activeElement;
    return !!ae && this.el.contains(ae) && ae.value !== undefined && ae.value !== '';
  }

  async rafraichir(force) {
    const fichier = this.vue && this.vue.file;
    const seq = ++this.seq;
    if (!this.vue || !fichier) {
      this.chemin = '';
      this.anns = [];
      this.cartes.clear();
      this.brouillon = null;
      this.el.empty();
      this.piste = this.el.createDiv({ cls: 'zfa-com-piste' });
      this.piste.createDiv({ cls: 'zfa-com-vide', text: tr('Ouvrez une note pour voir ses commentaires.') });
      return;
    }
    if (fichier.path !== this.chemin) {
      this.chemin = fichier.path;
      this.brouillon = null;
      this.edition = null;
      this.actif = null;
      this.hauteurPiste = '';
      force = true;
    }
    const doc = await this.greffon.texteCommentaires(fichier);
    if (seq !== this.seq) return;
    this.mode = this.vue.getMode();
    this.doc = doc;
    this.anns = CommentairesMarge.lire(doc);
    if (!force && this._occupe()) { this.planifier(); return; }
    this._dessiner(fichier);
  }

  // Chaque seconde : un passage lecture / édition, des sections de lecture
  // dessinées tardivement.
  battement() {
    if (this.vue && this.vue.getMode() !== this.mode) this.rafraichir(true);
    else this.planifier();
  }

  carteActive() { return this.actif ? this.trouver(this.actif) : undefined; }

  supprimerActif() {
    const a = this.carteActive();
    const f = this.vue && this.vue.file;
    if (!a || !f) return false;
    this.actif = null;
    this.greffon.supprimerCommentaireMarge(f, a.id).then(() => this.rafraichir(true));
    return true;
  }

  activer(id) {
    if (this.actif === id) return;
    this.actif = id;
    this.cartes.forEach((c, cid) => c.toggleClass('is-active', cid === id));
    if (id && !this._suivre) { const c = this.cartes.get(id); if (c) c.scrollIntoView({ block: 'nearest' }); }
    this.planifier();
  }

  // Le curseur a bougé dans l'éditeur : le commentaire le plus intérieur
  // sous lui devient actif.
  surCurseur(pos) {
    let mieux = null;
    for (const a of this.anns) {
      if (pos >= a.from && pos <= a.to && (!mieux || a.to - a.from < mieux.to - mieux.from)) mieux = a;
    }
    if (!this.brouillon) this.activer(mieux ? mieux.id : null);
  }

  // ── Brouillon (nouveau commentaire) ──

  async commencer(from, to, texte) {
    this.brouillon = { from, to, texte, couleur: CommentairesMarge.normaliserCouleur(this.greffon.settings.commentairesCouleur) };
    this.actif = null;
    this.edition = null;
    await this.rafraichir(true);
    const z = this.brouillonEl && this.brouillonEl.querySelector('textarea');
    if (z) z.focus();
  }

  _abandonner() {
    this.brouillon = null;
    this.rafraichir(true);
  }

  async _valider(note) {
    const d = this.brouillon;
    const f = this.vue && this.vue.file;
    if (!d || !f || !this.vue) return;
    const texte = String(note || '').trim();
    if (!texte) { new obsidian.Notice(tr('Le commentaire est vide.')); return; }
    const editeur = this.vue.editor;
    const doc = editeur.getValue();
    let { from, to } = d;
    if (doc.slice(from, to) !== d.texte) {
      const i = doc.indexOf(d.texte);
      if (i < 0) { new obsidian.Notice(tr('Le passage a changé : sélectionnez-le de nouveau.')); return; }
      from = i;
      to = i + d.texte.length;
    }
    const id = CommentairesMarge.nouvelId(CommentairesMarge.idsExistants(doc));
    const ch = CommentairesMarge.entourer(doc, from, to, texte, id, d.couleur,
      { auteur: this.greffon.auteurCommentaires(), heure: CommentairesMarge.horodatage() });
    if (!ch) { new obsidian.Notice(tr('Rien à commenter dans la sélection (un tableau ne se commente que cellule par cellule).')); return; }
    this.brouillon = null;
    if (this.brouillonFin) this.brouillonFin();
    this.brouillonFin = null;
    this.actif = id;
    this.greffon.appliquerAEditeurMarge(editeur, ch);
    await this.rafraichir(true);
  }

  modifier(id) {
    this.edition = id;
    this.actif = id;
    this.rafraichir(true).then(() => {
      const c = this.cartes.get(id);
      const z = c && c.querySelector('textarea');
      if (z) z.focus();
    });
  }

  repondre(id) {
    this.activer(id);
    setTimeout(() => {
      const c = this.cartes.get(id);
      const z = c && c.querySelector('.zfa-com-reponse-saisie');
      if (z) z.focus();
    }, 30);
  }

  // ── Dessin ──

  _dessiner(fichier) {
    if (this.brouillonFin) this.brouillonFin();
    this.brouillonFin = null;
    const haut = this.el.scrollTop;
    this.el.empty();
    this.piste = this.el.createDiv({ cls: 'zfa-com-piste' });
    if (this.hauteurPiste) this.piste.style.setProperty('--zfa-com-piste-h', this.hauteurPiste);
    this.el.toggleClass('zfa-com-suivre', this._suivre);
    this.cartes.clear();
    this.brouillonEl = null;
    if (this.brouillon) this.brouillonEl = this._dessinerBrouillon(this.brouillon);
    for (const a of this.anns) this.cartes.set(a.id, this._dessinerCarte(fichier, a));
    if (!this.brouillon && !this.anns.length) {
      this.piste.createDiv({ cls: 'zfa-com-vide',
        text: tr('Aucun commentaire dans cette note. Sélectionnez un passage, puis « Commenter le passage » au clic droit.') });
    }
    this.el.scrollTop = haut;
    this.planifier();
  }

  _entete(carte, auteur, heure, couleur) {
    const tete = carte.createDiv({ cls: 'zfa-com-tete' });
    const av = tete.createDiv({ cls: 'zfa-com-avatar', text: (auteur || tr('Moi')).slice(0, 1) });
    av.style.background = CommentairesMarge.couleurCss(couleur);
    const meta = tete.createDiv({ cls: 'zfa-com-meta' });
    const nom = meta.createDiv({ cls: 'zfa-com-auteur' });
    nom.createSpan({ text: auteur || tr('Commentaire') });
    if (heure) meta.createDiv({ cls: 'zfa-com-heure', text: heure });
    return { tete, nom };
  }

  _pastilles(carte, choisie, choisir) {
    const rangee = carte.createDiv({ cls: 'zfa-com-couleurs' });
    const toutes = [];
    for (const c of CommentairesMarge.COULEURS) {
      const p = rangee.createSpan({ cls: 'zfa-com-pastille' });
      p.style.setProperty('--zfa-com-pastille', c.css);
      p.setAttribute('aria-label', tr(c.nom));
      p.toggleClass('is-selected', c.cle === choisie);
      p.addEventListener('click', () => {
        toutes.forEach((x) => x.removeClass('is-selected'));
        p.addClass('is-selected');
        choisir(c);
      });
      toutes.push(p);
    }
  }

  _dessinerBrouillon(d) {
    const carte = this.piste.createDiv({ cls: 'zfa-com-carte is-draft is-active' });
    carte.style.setProperty('--zfa-com-couleur', CommentairesMarge.couleurCss(d.couleur));
    this._entete(carte, this.greffon.auteurCommentaires(), CommentairesMarge.horodatage(), d.couleur);
    carte.createDiv({ cls: 'zfa-com-citation', text: d.texte.replace(/\s+/g, ' ').trim().slice(0, 60) });
    const zone = carte.createEl('textarea', { cls: 'zfa-com-saisie',
      attr: { placeholder: tr('Votre commentaire (⌘ ou Ctrl + Entrée pour enregistrer)'), rows: '3' } });
    this._pastilles(carte, d.couleur, (c) => {
      d.couleur = c.cle;
      carte.style.setProperty('--zfa-com-couleur', c.css);
    });
    const actions = carte.createDiv({ cls: 'zfa-com-actions' });
    const annuler = actions.createEl('button', { text: tr('Annuler') });
    const enreg = actions.createEl('button', { text: tr('Enregistrer'), cls: 'mod-cta' });
    annuler.addEventListener('click', () => this._abandonner());
    // Un clic hors de la carte enregistre le brouillon, s'il a du texte.
    const doc = this.el.ownerDocument;
    const surAppui = (e) => {
      if (carte.contains(e.target) || !zone.value.trim()) return;
      this._valider(zone.value);
    };
    doc.addEventListener('mousedown', surAppui, true);
    this.brouillonFin = () => doc.removeEventListener('mousedown', surAppui, true);
    enreg.addEventListener('click', () => this._valider(zone.value));
    zone.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enreg.click(); }
      else if (e.key === 'Escape') annuler.click();
    });
    return carte;
  }

  _dessinerCarte(fichier, a) {
    const g = this.greffon;
    const carte = this.piste.createDiv({ cls: 'zfa-com-carte' });
    carte.toggleClass('is-resolved', a.resolu);
    carte.toggleClass('is-active', a.id === this.actif);
    carte.dataset.id = a.id;
    carte.style.setProperty('--zfa-com-couleur', CommentairesMarge.couleurCss(a.couleur));
    carte.addEventListener('click', () => {
      this.activer(a.id);
      if (!this._suivre) this._montrer(a);
    });
    // Un commentaire sans date prend celle de la dernière modification.
    const heure = a.heure || tr('vers ') + CommentairesMarge.horodatage(new Date(fichier.stat.mtime));
    const { tete, nom } = this._entete(carte, a.auteur, heure, a.couleur);
    if (a.resolu) nom.createSpan({ cls: 'zfa-com-badge', text: tr('Résolu') });
    const plus = tete.createEl('button', { cls: 'zfa-com-icone zfa-com-plus', attr: { 'aria-label': tr('Plus') } });
    obsidian.setIcon(plus, 'more-horizontal');
    plus.addEventListener('click', (e) => {
      e.stopPropagation();
      this.activer(a.id);
      const menu = new obsidian.Menu();
      g.remplirMenuCommentaire(menu, fichier, a.id);
      menu.showAtMouseEvent(e);
    });
    const q = CommentairesMarge.extrait(this.doc, a, 60);
    if (q) carte.createDiv({ cls: 'zfa-com-citation', text: q });

    if (this.edition === a.id) {
      const zone = carte.createEl('textarea', { cls: 'zfa-com-saisie', attr: { rows: '3' } });
      zone.value = a.note;
      const actions = carte.createDiv({ cls: 'zfa-com-actions' });
      const annuler = actions.createEl('button', { text: tr('Annuler') });
      const enreg = actions.createEl('button', { text: tr('Enregistrer'), cls: 'mod-cta' });
      const finir = () => { this.edition = null; this.rafraichir(true); };
      annuler.addEventListener('click', finir);
      enreg.addEventListener('click', async () => {
        const note = zone.value.trim();
        if (note) await g.majCommentaireMarge(fichier, a.id, { note });
        finir();
      });
      zone.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enreg.click();
        else if (e.key === 'Escape') annuler.click();
      });
    } else {
      carte.createDiv({ cls: 'zfa-com-note', text: a.note });
    }

    if (a.reponses.length) {
      const liste = carte.createDiv({ cls: 'zfa-com-reponses' });
      a.reponses.forEach((r, i) => {
        const item = liste.createDiv({ cls: 'zfa-com-reponse' });
        const haut = item.createDiv({ cls: 'zfa-com-reponse-tete' });
        haut.createSpan({ cls: 'zfa-com-auteur', text: r.auteur || tr('Réponse') });
        haut.createSpan({ cls: 'zfa-com-heure', text: r.heure || tr('vers ') + CommentairesMarge.horodatage(new Date(fichier.stat.mtime)) });
        const suppr = haut.createEl('button', { cls: 'zfa-com-icone zfa-com-reponse-suppr', attr: { 'aria-label': tr('Supprimer la réponse') } });
        obsidian.setIcon(suppr, 'x');
        suppr.addEventListener('click', (e) => {
          e.stopPropagation();
          g.majCommentaireMarge(fichier, a.id, (cur) => ({ reponses: cur.reponses.filter((_, j) => j !== i) }))
            .then(() => this.rafraichir(true));
        });
        item.createDiv({ cls: 'zfa-com-reponse-texte', text: r.texte });
      });
    }

    const boite = carte.createDiv({ cls: 'zfa-com-repondre' });
    const saisie = boite.createEl('textarea', { cls: 'zfa-com-reponse-saisie', attr: { placeholder: tr('Répondre…'), rows: '1' } });
    const envoi = boite.createEl('button', { text: tr('Envoyer'), cls: 'mod-cta' });
    const envoyer = async () => {
      const texte = saisie.value.trim();
      if (!texte) return;
      saisie.value = '';
      await g.majCommentaireMarge(fichier, a.id, (cur) => ({
        reponses: cur.reponses.concat([{ auteur: g.auteurCommentaires(), heure: CommentairesMarge.horodatage(), texte }]),
      }));
      this.rafraichir(true);
    };
    envoi.addEventListener('click', (e) => { e.stopPropagation(); envoyer(); });
    saisie.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); }
      else if (e.key === 'Escape') saisie.blur();
    });
    return carte;
  }

  // Mode liste : amener le passage commenté à l'écran.
  _montrer(a) {
    const v = this.vue;
    if (!v) return;
    if (v.getMode() === 'source') {
      v.editor.scrollIntoView({ from: v.editor.offsetToPos(a.textFrom), to: v.editor.offsetToPos(a.textTo) }, true);
    } else {
      v.setEphemeralState({ line: this.doc.slice(0, a.textFrom).split('\n').length - 1 });
    }
  }

  // ── Placement ──

  planifier() {
    if (this.raf) return;
    this.raf = this._win().requestAnimationFrame(() => {
      this.raf = 0;
      this._placer();
    });
  }

  // Hauteur, depuis le haut du panneau, d'une position du texte ; null si
  // elle n'est pas connue.
  _ancre(pos, id, hautPanneau) {
    const v = this.vue;
    if (!v) return null;
    if (v.getMode() === 'source') {
      const cm = this._cm(v);
      if (!cm) return null;
      let y;
      try { const c = cm.coordsAtPos(pos); if (c) y = c.top; } catch (e) { /* position non dessinée */ }
      if (y === undefined) {
        try { y = cm.documentTop + cm.lineBlockAt(pos).top; } catch (e) { return null; }
      }
      return y - hautPanneau;
    }
    if (!id) return null;
    const lecture = v.contentEl.querySelector('.markdown-reading-view');
    const sel = '[data-id="' + CSS.escape(id) + '"]';
    const cible = lecture && (lecture.querySelector('.zfa-com-hl' + sel) || lecture.querySelector('.zfa-com-bouton' + sel));
    return cible ? cible.getBoundingClientRect().top - hautPanneau : null;
  }

  _placer() {
    if (!this.vue) return;
    if (!this._suivre) {
      this.cartes.forEach((c) => c.removeClass('is-hidden'));
      return;
    }
    const hautPanneau = this.el.getBoundingClientRect().top;
    const entrees = [];
    const cacher = (el) => el.addClass('is-hidden');
    const poser = (el, ancre, actif) => {
      if (ancre === null) return cacher(el);
      el.removeClass('is-hidden');
      entrees.push({ el, ancre, h: el.offsetHeight, actif, haut: ancre });
      return null;
    };
    if (this.brouillonEl && this.brouillon) {
      const y = this._ancre(this.brouillon.from, null, hautPanneau);
      poser(this.brouillonEl, y === null ? 0 : y, true);
    }
    const parId = new Map(this.anns.map((a) => [a.id, a]));
    this.cartes.forEach((el, id) => {
      const a = parId.get(id);
      if (!a) return cacher(el);
      return poser(el, this._ancre(a.textFrom, id, hautPanneau), id === this.actif);
    });
    entrees.sort((x, y) => x.ancre - y.ancre);
    // La carte active reste face à son passage ; les autres s'écartent.
    const act = entrees.findIndex((e) => e.actif);
    for (let i = 0; i < entrees.length; i += 1) {
      if (i === act || (act >= 0 && i < act)) continue;
      const prec = entrees[i - 1];
      entrees[i].haut = prec ? Math.max(entrees[i].ancre, prec.haut + prec.h + COM_MARGE_ECART) : entrees[i].ancre;
    }
    if (act >= 0) {
      for (let i = act - 1; i >= 0; i -= 1) {
        entrees[i].haut = Math.min(entrees[i].ancre, entrees[i + 1].haut - entrees[i].h - COM_MARGE_ECART);
      }
      for (let i = act + 1; i < entrees.length; i += 1) {
        const prec = entrees[i - 1];
        entrees[i].haut = Math.max(entrees[i].ancre, prec.haut + prec.h + COM_MARGE_ECART);
      }
    }
    let bas = 0;
    for (const e of entrees) {
      e.el.style.setProperty('--zfa-com-y', Math.round(e.haut) + 'px');
      bas = Math.max(bas, e.haut + e.h);
    }
    this.hauteurPiste = (Math.ceil(bas) + 24) + 'px';
    this.piste.style.setProperty('--zfa-com-piste-h', this.hauteurPiste);
    this._surlignagesLecture();
  }

  // En lecture : les commentaires résolus pâlissent, l'actif se renforce.
  _surlignagesLecture() {
    if (!this.vue || this.vue.getMode() === 'source') return;
    const lecture = this.vue.contentEl.querySelector('.markdown-reading-view');
    if (!lecture) return;
    for (const a of this.anns) {
      lecture.querySelectorAll('.zfa-com-hl[data-id="' + CSS.escape(a.id) + '"]').forEach((h) => {
        h.toggleClass('is-resolved', a.resolu);
        h.toggleClass('is-active', a.id === this.actif);
      });
    }
  }
}

// Le panneau unique, rattaché à la note active (garde la précédente tant
// que le volet des commentaires lui-même a le focus).
class GestionCommentairesMarge {
  constructor(greffon) {
    this.greffon = greffon;
    this.panneau = null;
  }

  attacher(hote) {
    if (this.panneau) this.panneau.detruire();
    this.panneau = new PanneauCommentairesMarge(this.greffon, hote);
    this.synchroniser(true);
  }

  detacher() {
    if (this.panneau) this.panneau.detruire();
    this.panneau = null;
  }

  _vues() {
    return this.greffon.app.workspace.getLeavesOfType('markdown')
      .map((l) => l.view).filter((v) => v instanceof obsidian.MarkdownView);
  }

  synchroniser(force) {
    const p = this.panneau;
    if (!p) return;
    const vues = this._vues();
    const active = this.greffon.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    let cible = active && vues.includes(active) ? active : null;
    if (!cible && p.vue && vues.includes(p.vue)) cible = p.vue;
    if (!cible) cible = vues[0] || null;
    if (cible !== p.vue) p.lier(cible);
    else p.rafraichir(force);
  }

  // Ouvre le volet, rattaché à la vue qui porte cet éditeur.
  async panneauPour(editeur) {
    const vue = this._vues().find((v) => v.editor === editeur);
    if (!vue) return null;
    await this.greffon.ouvrirVueCommentaires(true);
    if (this.panneau) this.panneau.lier(vue);
    return this.panneau;
  }

  rafraichirFichier(chemin) {
    const p = this.panneau;
    if (p && p.vue && p.vue.file && p.vue.file.path === chemin) p.rafraichir();
  }

  battement() { if (this.panneau) this.panneau.battement(); }

  supprimerChoisi() { return !!this.panneau && this.panneau.supprimerActif(); }

  panneauDuFichier(chemin) {
    const p = this.panneau;
    return p && p.vue && p.vue.file && p.vue.file.path === chemin ? p : null;
  }

  surCurseur(cm) {
    const p = this.panneau;
    const v = p && p.vue;
    if (v && v.editor && v.editor.cm === cm) p.surCurseur(cm.state.selection.main.head);
  }
}

// Le volet latéral qui porte les cartes.
class VueCommentairesMarge extends obsidian.ItemView {
  constructor(leaf, greffon) {
    super(leaf);
    this.greffon = greffon;
  }

  getViewType() { return TYPE_VUE_COMMENTAIRES; }
  getDisplayText() { return tr('Commentaires'); }
  getIcon() { return 'message-square'; }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('zfa-com-volet');
    this.greffon.margeCommentaires.attacher(this.contentEl);
  }

  async onClose() {
    this.greffon.margeCommentaires.detacher();
  }
}

//#endregion 23 · Commentaires en marge

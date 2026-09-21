//#region 18 · Correcteur Apple
// ═══════════════════════════════════════════════════════════════════════════
//  18 · CORRECTEUR APPLE
//  Le correcteur du système (NSSpellChecker : orthographe et grammaire
//  contextuelle) mis à la portée de l'éditeur d'Obsidian. Un petit programme
//  Swift, compilé une fois à la première utilisation, sert de démon : il
//  reçoit du texte en JSON et rend les fautes avec leurs corrections. Le
//  greffon les souligne en pointillés bleus (grammaire) ou rouges
//  (orthographe) et ouvre une bulle de correction au survol, comme Mail.
//  Mac uniquement ; sans effet ailleurs.
// ═══════════════════════════════════════════════════════════════════════════

// Source du démon. Elle vit ici parce que le greffon n'est livré que sous
// forme de main.js : il l'écrit à côté de lui et la compile (swiftc) une fois.
// Ni accent grave ni « ${ » dans ce texte : il est en gabarit littéral.
const CORRECTEUR_SWIFT = String.raw`import AppKit
import NaturalLanguage

// Correcteur d'Ariane : un démon qui parle en JSON, une ligne par message,
// et met le correcteur du système (NSSpellChecker) à la portée d'Obsidian.
// Entrée  : {"id":1,"cmd":"check","text":"..."} | {"cmd":"checkMany","texts":["..."]} | {"cmd":"learn","word":"..."} | {"cmd":"ignore","word":"..."}
// Sortie  : {"id":1,"items":[{"from":23,"length":8,"kind":"grammar","replace":["expliquer"],"message":"...","category":"..."}]}
// Les positions sont en unités UTF-16, comme les indices d'une chaîne JavaScript.

let verificateur = NSSpellChecker.shared
verificateur.automaticallyIdentifiesLanguages = true
let balise = NSSpellChecker.uniqueSpellDocumentTag()
let types = NSTextCheckingTypes(NSTextCheckingResult.CheckingType.spelling.rawValue
  | NSTextCheckingResult.CheckingType.grammar.rawValue)

func langueDe(_ phrase: String) -> String {
  let r = NLLanguageRecognizer()
  r.languageHints = [.french: 0.6, .english: 0.4]
  r.processString(phrase)
  guard let l = r.dominantLanguage else { return "fr" }
  switch l { case .english: return "en"; case .french: return "fr"; default: return l.rawValue }
}

func verifier(_ texte: String) -> [[String: Any]] {
  var items: [[String: Any]] = []
  let ns = texte as NSString
  ns.enumerateSubstrings(in: NSRange(location: 0, length: ns.length), options: .bySentences) { sous, plage, _, _ in
    guard let phrase = sous, phrase.rangeOfCharacter(from: .letters) != nil else { return }
    let nsPhrase = phrase as NSString
    let langue = langueDe(phrase)
    let resultats = verificateur.check(phrase, range: NSRange(location: 0, length: nsPhrase.length),
      types: types, options: nil, inSpellDocumentWithTag: balise, orthography: nil, wordCount: nil)
    for r in resultats {
      if r.resultType == .spelling {
        let mot = nsPhrase.substring(with: r.range)
        let propositions = verificateur.guesses(forWordRange: r.range, in: phrase, language: langue,
          inSpellDocumentWithTag: balise) ?? []
        items.append(["from": plage.location + r.range.location, "length": r.range.length, "kind": "spelling",
          "word": mot, "replace": Array(propositions.prefix(6)), "message": "", "category": ""])
      } else if r.resultType == .grammar {
        for d in r.grammarDetails ?? [] {
          guard let v = d["NSGrammarRange"] as? NSValue else { continue }
          let pl = v.rangeValue
          items.append(["from": plage.location + r.range.location + pl.location, "length": pl.length,
            "kind": "grammar", "word": nsPhrase.substring(with: NSRange(location: r.range.location + pl.location, length: pl.length)),
            "replace": (d["NSGrammarCorrections"] as? [String]) ?? [],
            "message": (d["NSGrammarUserDescription"] as? String) ?? "",
            "category": (d["NSGrammarUserCategory"] as? String) ?? ""])
        }
      }
    }
  }
  return items
}

func repondre(_ o: [String: Any]) {
  if let d = try? JSONSerialization.data(withJSONObject: o), let s = String(data: d, encoding: .utf8) {
    print(s); fflush(stdout)
  }
}

while let ligne = readLine() {
  guard let d = ligne.data(using: .utf8),
        let m = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { continue }
  let id = m["id"] ?? NSNull()
  switch m["cmd"] as? String ?? "" {
  case "check": repondre(["id": id, "items": verifier(m["text"] as? String ?? "")])
  case "checkMany": repondre(["id": id, "results": (m["texts"] as? [String] ?? []).map { verifier($0) }])
  case "learn": verificateur.learnWord(m["word"] as? String ?? ""); repondre(["id": id, "ok": true])
  case "ignore": verificateur.ignoreWord(m["word"] as? String ?? "", inSpellDocumentWithTag: balise); repondre(["id": id, "ok": true])
  case "ping": repondre(["id": id, "ok": true])
  default: repondre(["id": id, "erreur": "commande inconnue"])
  }
}`;

//  Découpage & masquage : quelles parties d'une note sont du texte à corriger.
//  Les fonctions de ce bloc sont pures (éprouvées par tests/correcteur.test.js).

// Remplace par des espaces de même longueur : les positions restent exactes.
function correcteurBlanc(m) { return ' '.repeat(m.length); }

// La ligne débarrassée de ce qui n'est pas de la prose : marques Markdown,
// code, liens, adresses, balises, formules. Même longueur que l'originale.
function correcteurMasquer(ligne) {
  let t = ligne;
  t = t.replace(/^(\s*)(#{1,6}\s+)/, (m, a, b) => a + correcteurBlanc(b));
  t = t.replace(/^(\s*)((?:>\s?)+)/, (m, a, b) => a + correcteurBlanc(b));
  t = t.replace(/^(\s*)((?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?)/, (m, a, b) => a + correcteurBlanc(b));
  t = t.replace(/\[![\w-]+\][+-]?/g, correcteurBlanc);
  t = t.replace(/`[^`\n]*`/g, correcteurBlanc);
  t = t.replace(/%%.*?%%/g, correcteurBlanc);
  t = t.replace(/\$[^$\n]+\$/g, correcteurBlanc);
  t = t.replace(/!?\[\[[^\]\n]*\]\]/g, correcteurBlanc);
  t = t.replace(/\[\^[^\]\n]+\]/g, correcteurBlanc);
  t = t.replace(/!?\[(?=[^\]\n]*\]\()/g, correcteurBlanc);
  t = t.replace(/\]\([^)\n]*\)/g, correcteurBlanc);
  t = t.replace(/(?:https?:\/\/|www\.)[^\s)>\]]+/g, correcteurBlanc);
  t = t.replace(/<\/?[A-Za-z][^>\n]*>/g, correcteurBlanc);
  t = t.replace(/(^|[\s(])(#[\p{L}\p{N}_\/-]+)/gu, (m, a, b) => a + correcteurBlanc(b));
  t = t.replace(/\s\^[\w-]+\s*$/, correcteurBlanc);
  t = t.replace(/\*+|~~|==/g, correcteurBlanc);
  t = t.replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, correcteurBlanc);
  return t;
}

// Les lignes à vérifier d'un texte de note : [{ from, texte }], `from` étant
// la position absolue du début de la ligne, `texte` la ligne masquée. Sont
// ignorés : l'entête YAML, les blocs de code, les blocs de formule, et les
// lignes sans deux lettres consécutives.
function correcteurBlocs(texte) {
  const blocs = [];
  const lignes = texte.split('\n');
  let pos = 0;
  let i = 0;
  if (lignes[0] && lignes[0].trim() === '---') {
    let j = 1;
    while (j < lignes.length && !/^(---|\.\.\.)\s*$/.test(lignes[j])) j += 1;
    if (j < lignes.length) {
      for (; i <= j; i += 1) pos += lignes[i].length + 1;
    }
  }
  let clos = null; // marque du bloc de code ou de formule en cours
  for (; i < lignes.length; i += 1) {
    const ligne = lignes[i];
    const debut = pos;
    pos += ligne.length + 1;
    const cloture = /^\s*(```|~~~)/.exec(ligne);
    if (clos) {
      if (cloture && cloture[1] === clos) clos = null;
      else if (clos === '$$' && /\$\$\s*$/.test(ligne)) clos = null;
      continue;
    }
    if (cloture) { clos = cloture[1]; continue; }
    if (/^\s*\$\$/.test(ligne)) {
      if (!/\$\$\s*$/.test(ligne.replace(/^\s*\$\$/, ''))) clos = '$$';
      continue;
    }
    const masque = correcteurMasquer(ligne);
    if (!/\p{L}{2}/u.test(masque)) continue;
    blocs.push({ from: debut, texte: masque });
  }
  return blocs;
}

// Les fautes de tout un texte, en positions absolues, d'après les résultats
// du démon par ligne. `parTexte` : Map texte de ligne → fautes de la ligne.
// `ignores` : Set de clés « genre|mot|message » que l'utilisateur a écartées.
// `genres` : { spelling, grammar } dit ce qui est demandé.
function correcteurFautes(blocs, parTexte, ignores, genres) {
  const fautes = [];
  for (const b of blocs) {
    const items = parTexte.get(b.texte) || [];
    for (const it of items) {
      if (!genres[it.kind]) continue;
      if (ignores && ignores.has(correcteurCleIgnore(it))) continue;
      fautes.push({
        from: b.from + it.from, to: b.from + it.from + it.length, kind: it.kind,
        word: it.word, replace: it.replace || [], message: it.message || '', category: it.category || '',
      });
    }
  }
  return fautes;
}

function correcteurCleIgnore(it) { return it.kind + '|' + it.word + '|' + (it.message || ''); }

//  Le démon : compilation, dialogue, redémarrage.

class AssistantApple {
  constructor(greffon) {
    this.greffon = greffon;
    this.enfant = null;
    this.numero = 0;
    this.attentes = new Map();
    this.pret = null;        // promesse du démarrage en cours
    this.indisponible = '';  // raison, quand le démon ne peut pas exister
  }

  static disponible() { return process.platform === 'darwin'; }

  dossier() { return this.greffon.cheminAbsoluVault(this.greffon.manifest.dir); }

  // Compile le démon s'il n'existe pas déjà pour cette version du source.
  async _preparer() {
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const dossier = this.dossier();
    const empreinte = crypto.createHash('md5').update(CORRECTEUR_SWIFT).digest('hex').slice(0, 10);
    const binaire = path.join(dossier, 'correcteur-apple-' + empreinte);
    if (fs.existsSync(binaire)) return binaire;
    const source = path.join(dossier, 'correcteur-apple.swift');
    fs.writeFileSync(source, CORRECTEUR_SWIFT);
    new obsidian.Notice(tr('Correcteur Apple : préparation en cours (une seule fois, une minute environ)…'), 8000);
    await new Promise((resolve, reject) => {
      require('child_process').execFile('/usr/bin/swiftc', ['-O', '-o', binaire, source],
        { timeout: 300000, maxBuffer: 4 * 1024 * 1024 },
        (err, sortie, erreurs) => (err ? reject(new Error((erreurs || err.message || '').toString().slice(0, 400))) : resolve()));
    });
    for (const f of fs.readdirSync(dossier)) { // les binaires d'anciennes versions
      if (f.startsWith('correcteur-apple-') && f !== path.basename(binaire)) {
        try { fs.unlinkSync(path.join(dossier, f)); } catch (e) { /* déjà parti */ }
      }
    }
    new obsidian.Notice(tr('Correcteur Apple : prêt.'), 4000);
    return binaire;
  }

  // Le démon vivant, lancé au besoin. Rend null si c'est impossible.
  async _vivant() {
    if (this.enfant) return this.enfant;
    if (this.indisponible) return null;
    if (!this.pret) {
      this.pret = (async () => {
        try {
          const binaire = await this._preparer();
          const enfant = require('child_process').spawn(binaire, [], { stdio: ['pipe', 'pipe', 'ignore'] });
          let reste = '';
          enfant.stdout.setEncoding('utf8');
          enfant.stdout.on('data', (morceau) => {
            reste += morceau;
            let k;
            while ((k = reste.indexOf('\n')) >= 0) {
              const ligne = reste.slice(0, k);
              reste = reste.slice(k + 1);
              try {
                const m = JSON.parse(ligne);
                const a = this.attentes.get(m.id);
                if (a) { this.attentes.delete(m.id); clearTimeout(a.minuteur); a.resoudre(m); }
              } catch (e) { /* ligne parasite */ }
            }
          });
          const fin = () => {
            if (this.enfant === enfant) this.enfant = null;
            for (const [id, a] of this.attentes) { clearTimeout(a.minuteur); a.resoudre(null); this.attentes.delete(id); }
          };
          enfant.on('exit', fin);
          enfant.on('error', fin);
          enfant.stdin.on('error', () => { /* le démon est parti : 'exit' suit */ });
          this.enfant = enfant;
          return enfant;
        } catch (e) {
          this.indisponible = String((e && e.message) || e);
          const xcode = /xcode|swiftc|No such file|developer tools/i.test(this.indisponible);
          new obsidian.Notice(tr('Correcteur Apple indisponible. ')
            + (xcode ? tr('Installez les outils de ligne de commande : xcode-select --install') : this.indisponible), 12000);
          return null;
        } finally { this.pret = null; }
      })();
    }
    return this.pret;
  }

  // Envoie une commande et attend la réponse ; null si le démon manque ou tarde.
  async demander(msg, delai = 20000) {
    const enfant = await this._vivant();
    if (!enfant) return null;
    const id = ++this.numero;
    return new Promise((resoudre) => {
      const minuteur = setTimeout(() => { this.attentes.delete(id); resoudre(null); }, delai);
      this.attentes.set(id, { resoudre, minuteur });
      try { enfant.stdin.write(JSON.stringify(Object.assign({ id }, msg)) + '\n'); } catch (e) { /* voir 'exit' */ }
    });
  }

  // Les fautes de plusieurs lignes : un tableau de tableaux, ou null.
  async verifier(textes) {
    const r = await this.demander({ cmd: 'checkMany', texts: textes });
    return r && Array.isArray(r.results) ? r.results : null;
  }

  arreter() {
    if (this.enfant) { try { this.enfant.kill(); } catch (e) { /* déjà parti */ } }
    this.enfant = null;
  }
}

//  L'intégration : l'extension CodeMirror et la bulle de correction.

class CorrecteurApple extends obsidian.Component {
  constructor(greffon) {
    super();
    this.greffon = greffon;
    this.assistant = new AssistantApple(greffon);
    this.cache = new Map();      // texte de ligne masqué → fautes
    this.ignores = new Set();    // fautes écartées pour cette session
    this.suivis = new Set();     // les vues d'éditeur qui nous écoutent
  }

  onunload() { this.assistant.arreter(); }

  // Ce qui est demandé, d'après les réglages.
  genres() {
    const s = this.greffon.settings;
    return { grammar: s.correcteurGrammaire !== false, spelling: s.correcteurOrthographe === true };
  }

  actif() {
    const s = this.greffon.settings;
    return AssistantApple.disponible() && s.correcteurApple !== false;
  }

  // Relit toutes les vues d'éditeur ouvertes (réglages changés, commande).
  relancer(viderCache) {
    if (viderCache) this.cache.clear();
    for (const v of this.suivis) v.planifier(0);
  }

  // Les fautes des lignes données : le cache d'abord, le démon pour le reste.
  async _resoudre(blocs) {
    const manque = [];
    const vus = new Set();
    for (const b of blocs) {
      if (!this.cache.has(b.texte) && !vus.has(b.texte)) { vus.add(b.texte); manque.push(b.texte); }
    }
    for (let i = 0; i < manque.length; i += 40) {
      const lot = manque.slice(i, i + 40);
      const res = await this.assistant.verifier(lot);
      if (!res) return false;
      lot.forEach((t, k) => this.cache.set(t, res[k] || []));
    }
    if (this.cache.size > 4000) {
      for (const k of [...this.cache.keys()].slice(0, this.cache.size - 3000)) this.cache.delete(k);
    }
    return true;
  }

  // Une phrase d'essai : dit si le système répond, et ce qu'il trouve.
  async diagnostiquer() {
    if (!AssistantApple.disponible()) { new obsidian.Notice(tr('Le correcteur Apple ne fonctionne que sur Mac.')); return; }
    const essai = ['Ceci est une note pour expliqué si le correcteur d’orthographe fonctionnent bien. Un mot mal ecrit.'];
    const res = await this.assistant.verifier(essai);
    if (!res) { new obsidian.Notice(tr('Correcteur Apple : aucune réponse du démon.') + ' ' + (this.assistant.indisponible || '')); return; }
    const f = res[0] || [];
    const g = f.filter((x) => x.kind === 'grammar').length;
    const o = f.filter((x) => x.kind === 'spelling').length;
    new obsidian.Notice(tr('Correcteur Apple : le démon répond. Orthographe : ') + o + tr(' faute(s) trouvée(s) sur 1. Grammaire : ')
      + g + tr(' sur 2 attendues.') + (g === 0 ? ' ' + tr('Le moteur de grammaire du système ne répond pas pour le moment.') : ''), 12000);
  }

  // L'extension à enregistrer auprès de l'éditeur, ou null hors Mac.
  extension() {
    if (!AssistantApple.disponible()) return null;
    const { StateField, StateEffect } = require('@codemirror/state');
    const { Decoration, EditorView, ViewPlugin, hoverTooltip } = require('@codemirror/view');
    const centre = this;
    const poser = StateEffect.define();
    const marque = { grammar: Decoration.mark({ class: 'zfa-corr-gram' }), spelling: Decoration.mark({ class: 'zfa-corr-orth' }) };

    const champ = StateField.define({
      create() { return { fautes: [] }; },
      update(etat, tr) {
        let fautes = etat.fautes;
        if (tr.docChanged) {
          // Une faute touchée par la frappe disparaît ; les autres suivent le texte.
          const touchees = [];
          tr.changes.iterChangedRanges((a, b) => touchees.push([a, b]));
          fautes = fautes
            .filter((f) => !touchees.some(([a, b]) => a <= f.to && b >= f.from))
            .map((f) => Object.assign({}, f, { from: tr.changes.mapPos(f.from, 1), to: tr.changes.mapPos(f.to, -1) }))
            .filter((f) => f.to > f.from);
        }
        for (const ef of tr.effects) if (ef.is(poser)) fautes = ef.value;
        return fautes === etat.fautes ? etat : { fautes };
      },
      provide: (f) => EditorView.decorations.from(f, (etat) =>
        Decoration.set(etat.fautes.map((x) => marque[x.kind].range(x.from, x.to)), true)),
    });

    const suivi = ViewPlugin.fromClass(class {
      constructor(vue) {
        this.vue = vue;
        this.minuteur = null;
        this.tour = 0;
        centre.suivis.add(this);
        this.planifier(400);
      }
      update(u) { if (u.docChanged) this.planifier(centre.greffon.settings.correcteurDelai || 700); }
      destroy() { clearTimeout(this.minuteur); this.tour += 1; centre.suivis.delete(this); }
      planifier(delai) {
        clearTimeout(this.minuteur);
        this.minuteur = setTimeout(() => this.cycle(), delai);
      }
      async cycle() {
        const tour = ++this.tour;
        const vue = this.vue;
        if (!centre.actif()) {
          if (vue.state.field(champ).fautes.length) vue.dispatch({ effects: poser.of([]) });
          return;
        }
        const doc = vue.state.doc;
        const blocs = correcteurBlocs(doc.toString());
        const ok = await centre._resoudre(blocs);
        // Le texte a bougé pendant l'attente : un autre cycle est déjà prévu.
        if (!ok || tour !== this.tour || vue.state.doc !== doc) return;
        vue.dispatch({ effects: poser.of(correcteurFautes(blocs, centre.cache, centre.ignores, centre.genres())) });
      }
    });

    const bulle = hoverTooltip((vue, pos) => {
      const f = vue.state.field(champ).fautes.find((x) => pos >= x.from && pos <= x.to);
      if (!f) return null;
      return { pos: f.from, end: f.to, above: true, create: () => ({ dom: centre.construireBulle(vue, f) }) };
    }, { hideOnChange: true, hoverTime: 200 });

    return [champ, suivi, bulle];
  }

  // La bulle : explication, propositions, ignorer, ajouter au dictionnaire.
  construireBulle(vue, faute) {
    const doc = vue.dom.ownerDocument;
    const el = (tag, classe, texte) => {
      const e = doc.createElement(tag);
      if (classe) e.className = classe;
      if (texte) e.textContent = texte;
      return e;
    };
    const racine = el('div', 'zfa-corr-bulle');
    if (faute.category || faute.message) {
      const tete = el('div', 'zfa-corr-explication');
      if (faute.category) tete.appendChild(el('strong', '', faute.category + (faute.message ? ' : ' : '')));
      if (faute.message) tete.appendChild(doc.createTextNode(faute.message));
      racine.appendChild(tete);
    }
    const rang = el('div', 'zfa-corr-rang');
    for (const r of faute.replace.slice(0, 5)) {
      const b = el('button', 'zfa-corr-choix', r);
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        vue.dispatch({ changes: { from: faute.from, to: faute.to, insert: r } });
      });
      rang.appendChild(b);
    }
    if (!faute.replace.length) rang.appendChild(el('span', 'zfa-corr-aucune', tr('Aucune proposition')));
    const ignorer = el('button', 'zfa-corr-action', '×');
    ignorer.setAttribute('aria-label', tr('Ignorer cette remarque'));
    ignorer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.ignores.add(correcteurCleIgnore(faute));
      this.relancer(false);
    });
    rang.appendChild(ignorer);
    if (faute.kind === 'spelling') {
      const ajouter = el('button', 'zfa-corr-action', tr('Ajouter au dictionnaire'));
      ajouter.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        await this.assistant.demander({ cmd: 'learn', word: faute.word });
        this.cache.clear();
        this.relancer(true);
      });
      rang.appendChild(ajouter);
    }
    racine.appendChild(rang);
    return racine;
  }
}

//#endregion 18 · Correcteur Apple

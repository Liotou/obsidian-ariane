//#region 24 · Assistant IA
// ═══════════════════════════════════════════════════════════════════════════
//  24 · ASSISTANT IA
//  L'IA d'Ariane à la manière d'Apple Intelligence (module « assistant ») :
//    - MoteurAppleIA : le modèle de langue d'Apple, sur le Mac (cadre
//      Foundation Models, macOS 26 et suivants), par un petit démon Swift
//      compilé une fois, comme celui du correcteur (section 18). Il sert
//      aussi de fournisseur à toutes les fonctions d'IA d'Ariane.
//    - AssistantEcriture : la logique pure (consignes, masquage des liens et
//      citations, nettoyage des réponses, différences mot à mot, intention
//      d'une demande en langage naturel), éprouvée par les tests.
//    - PanneauEcritureIA : les outils d'écriture, sur la sélection, dans un
//      panneau translucide au liseré lumineux.
//    - BarreAssistantIA : une barre de demande, à la manière de Siri.
//  Le branchement est dans avecAssistant (11u).
// ═══════════════════════════════════════════════════════════════════════════

// Source du démon. Elle vit ici parce que le greffon n'est livré que sous
// forme de main.js : il l'écrit à côté de lui et la compile (swiftc) une fois.
// Ni accent grave ni « ${ » dans ce texte : il est en gabarit littéral.
const ASSISTANT_SWIFT = String.raw`import Foundation
import FoundationModels

// Assistant d'Ariane : le modele de langue d'Apple Intelligence, sur le Mac,
// mis a la portee d'Obsidian. Un demon qui parle en JSON, une ligne par
// message.
//
// Entree  : {"id":1,"cmd":"generer","instructions":"...","prompt":"...",
//            "temperature":0.3,"max":800,"flux":true}
//           {"id":2,"cmd":"annuler","cible":1}
//           {"id":3,"cmd":"etat"}
// Sortie  : {"id":1,"partiel":"..."}   (au fil de l'eau, si flux)
//           {"id":1,"texte":"..."}     (a la fin)
//           {"id":1,"erreur":"...","code":"..."}
//           {"id":3,"disponible":true} ou {"id":3,"disponible":false,"raison":"..."}

let sortie = DispatchQueue(label: "sortie")
func ecrire(_ objet: [String: Any]) {
  sortie.sync {
    if let d = try? JSONSerialization.data(withJSONObject: objet),
       let s = String(data: d, encoding: .utf8) {
      FileHandle.standardOutput.write((s + "\n").data(using: .utf8)!)
    }
  }
}

func raisonIndisponible(_ r: SystemLanguageModel.Availability.UnavailableReason) -> String {
  switch r {
  case .deviceNotEligible: return "appareil-non-eligible"
  case .appleIntelligenceNotEnabled: return "apple-intelligence-desactivee"
  case .modelNotReady: return "modele-pas-pret"
  @unknown default: return "inconnue"
  }
}

final class Taches: @unchecked Sendable {
  private var encours: [Int: Task<Void, Never>] = [:]
  private let verrou = NSLock()
  func poser(_ id: Int, _ t: Task<Void, Never>) { verrou.lock(); encours[id] = t; verrou.unlock() }
  func retirer(_ id: Int) { verrou.lock(); encours[id] = nil; verrou.unlock() }
  func annuler(_ id: Int) { verrou.lock(); encours[id]?.cancel(); verrou.unlock() }
}
let taches = Taches()

func generer(_ id: Int, _ m: [String: Any]) {
  let instructions = (m["instructions"] as? String) ?? ""
  let invite = (m["prompt"] as? String) ?? ""
  let flux = (m["flux"] as? Bool) ?? false
  var options = GenerationOptions()
  if let t = m["temperature"] as? Double { options.temperature = t }
  if let n = m["max"] as? Int, n > 0 { options.maximumResponseTokens = n }
  let opts = options
  let t = Task {
    defer { taches.retirer(id) }
    // Des garde-fous permissifs : ceux par defaut bloquent des
    // reformulations anodines ; ici, on transforme le texte de l'utilisateur.
    let modele = SystemLanguageModel(guardrails: .permissiveContentTransformations)
    if case .unavailable(let r) = modele.availability {
      ecrire(["id": id, "erreur": "Apple Intelligence indisponible", "code": raisonIndisponible(r)])
      return
    }
    let session = LanguageModelSession(model: modele, instructions: instructions)
    do {
      if flux {
        var dernier = ""
        for try await instant in session.streamResponse(to: invite, options: opts) {
          dernier = instant.content
          ecrire(["id": id, "partiel": dernier])
        }
        ecrire(["id": id, "texte": dernier])
      } else {
        let r = try await session.respond(to: invite, options: opts)
        ecrire(["id": id, "texte": r.content])
      }
    } catch is CancellationError {
      ecrire(["id": id, "erreur": "annule", "code": "annule"])
    } catch {
      // Le type des erreurs change d'une version de macOS a l'autre : on
      // les reconnait a leur description.
      let d = String(describing: error)
      var code = "autre"
      if d.contains("exceededContextWindowSize") || d.lowercased().contains("context") { code = "contexte-trop-long" }
      else if d.contains("guardrail") || d.lowercased().contains("unsafe") { code = "garde-fou" }
      else if d.contains("unsupportedLanguage") { code = "langue" }
      ecrire(["id": id, "erreur": d, "code": code])
    }
  }
  taches.poser(id, t)
}

DispatchQueue.global().async {
  while let ligne = readLine(strippingNewline: true) {
    guard let d = ligne.data(using: .utf8),
          let m = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { continue }
    let id = (m["id"] as? Int) ?? 0
    switch (m["cmd"] as? String) ?? "" {
    case "generer": generer(id, m)
    case "annuler": taches.annuler((m["cible"] as? Int) ?? -1)
    case "etat":
      if case .unavailable(let r) = SystemLanguageModel.default.availability {
        ecrire(["id": id, "disponible": false, "raison": raisonIndisponible(r)])
      } else {
        ecrire(["id": id, "disponible": true])
      }
    default: ecrire(["id": id, "erreur": "commande inconnue", "code": "commande"])
    }
  }
  exit(0)
}
dispatchMain()
`;

// Les couleurs d'Apple Intelligence, pour les dégradés dessinés en JS.
const IA_COULEURS = ['#ff9f0a', '#ff375f', '#bf5af2', '#5e5ce6', '#0a84ff', '#64d2ff'];

// Une icône « sparkles » peinte du dégradé d'Apple Intelligence.
function iconeIA(el) {
  obsidian.setIcon(el, 'sparkles');
  const svg = el.querySelector('svg');
  if (!svg) return el;
  const ns = 'http://www.w3.org/2000/svg';
  const d = el.ownerDocument;
  const id = 'zfa-ia-degrade-' + Math.random().toString(36).slice(2, 8);
  const defs = d.createElementNS(ns, 'defs');
  const g = d.createElementNS(ns, 'linearGradient');
  g.setAttribute('id', id);
  g.setAttribute('x1', '0'); g.setAttribute('y1', '0'); g.setAttribute('x2', '1'); g.setAttribute('y2', '1');
  IA_COULEURS.slice(0, 4).forEach((c, i) => {
    const s = d.createElementNS(ns, 'stop');
    s.setAttribute('offset', String(i / 3));
    s.setAttribute('stop-color', c);
    g.appendChild(s);
  });
  defs.appendChild(g);
  svg.insertBefore(defs, svg.firstChild);
  svg.setAttribute('stroke', 'url(#' + id + ')');
  el.addClass('zfa-ia-icone');
  return el;
}

// ── Le modèle d'Apple, par le démon ──
class MoteurAppleIA {
  constructor(greffon) {
    this.greffon = greffon;
    this.enfant = null;
    this.numero = 0;
    this.attentes = new Map();   // id -> { resoudre, minuteur, surPartiel }
    this.pret = null;
    this.indisponible = '';
  }

  static disponible() { return process.platform === 'darwin'; }

  _dossier() { return this.greffon.cheminAbsoluVault(this.greffon.manifest.dir); }

  async _preparer() {
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const dossier = this._dossier();
    const empreinte = crypto.createHash('md5').update(ASSISTANT_SWIFT).digest('hex').slice(0, 10);
    const binaire = path.join(dossier, 'assistant-apple-' + empreinte);
    if (fs.existsSync(binaire)) return binaire;
    const source = path.join(dossier, 'assistant-apple.swift');
    fs.writeFileSync(source, ASSISTANT_SWIFT);
    new obsidian.Notice(tr('Apple Intelligence : préparation (une seule fois, quelques secondes)…'), 6000);
    await new Promise((resolve, reject) => {
      require('child_process').execFile('/usr/bin/swiftc', ['-O', '-o', binaire, source],
        { timeout: 300000, maxBuffer: 4 * 1024 * 1024 },
        (err, sortie, erreurs) => (err ? reject(new Error((erreurs || err.message || '').toString().slice(0, 400))) : resolve()));
    });
    for (const f of fs.readdirSync(dossier)) {   // les binaires d'anciennes versions
      if (f.startsWith('assistant-apple-') && f !== path.basename(binaire)) {
        try { fs.unlinkSync(path.join(dossier, f)); } catch (e) { /* déjà parti */ }
      }
    }
    return binaire;
  }

  async _vivant() {
    if (this.enfant) return this.enfant;
    if (this.indisponible || !MoteurAppleIA.disponible()) return null;
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
              let m;
              try { m = JSON.parse(ligne); } catch (e) { continue; }
              const a = this.attentes.get(m.id);
              if (!a) continue;
              if (m.partiel !== undefined) { if (a.surPartiel) a.surPartiel(m.partiel); continue; }
              this.attentes.delete(m.id);
              clearTimeout(a.minuteur);
              a.resoudre(m);
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
          return null;
        } finally { this.pret = null; }
      })();
    }
    return this.pret;
  }

  // Envoie une commande ; la promesse rend la réponse finale, ou null.
  async _envoyer(msg, delai, surPartiel) {
    const enfant = await this._vivant();
    if (!enfant) return { erreur: this.indisponible || tr('Apple Intelligence est réservée au Mac.'), code: 'demon' };
    const id = msg.id;
    return new Promise((resoudre) => {
      const minuteur = setTimeout(() => {
        this.attentes.delete(id);
        try { enfant.stdin.write(JSON.stringify({ id: ++this.numero, cmd: 'annuler', cible: id }) + '\n'); } catch (e) { /* parti */ }
        resoudre({ erreur: tr('Apple Intelligence ne répond pas.'), code: 'delai' });
      }, delai);
      this.attentes.set(id, { resoudre, minuteur, surPartiel });
      try { enfant.stdin.write(JSON.stringify(msg) + '\n'); } catch (e) { /* voir 'exit' */ }
    });
  }

  async etat() {
    const r = await this._envoyer({ id: ++this.numero, cmd: 'etat' }, 20000);
    if (r && r.disponible) return { disponible: true };
    return { disponible: false, raison: (r && (r.raison || r.code)) || 'inconnue', message: r && r.erreur };
  }

  // Une génération. o : { instructions, prompt, temperature, max, surPartiel }.
  // Rend { fin: Promise<{ texte } | { erreur, code }>, annuler() }.
  lancer(o) {
    const id = ++this.numero;
    const msg = { id, cmd: 'generer', instructions: o.instructions || '', prompt: o.prompt || '',
      flux: !!o.surPartiel };
    if (typeof o.temperature === 'number') msg.temperature = o.temperature;
    if (o.max) msg.max = o.max;
    const fin = this._envoyer(msg, o.delai || 120000, o.surPartiel)
      .then((r) => r || { erreur: tr('Apple Intelligence s’est arrêtée.'), code: 'demon' });
    const annuler = () => {
      if (this.enfant) {
        try { this.enfant.stdin.write(JSON.stringify({ id: ++this.numero, cmd: 'annuler', cible: id }) + '\n'); } catch (e) { /* parti */ }
      }
    };
    return { fin, annuler };
  }

  arreter() {
    if (this.enfant) { try { this.enfant.kill(); } catch (e) { /* déjà mort */ } }
    this.enfant = null;
  }

  // Les raisons d'indisponibilité, dites en clair.
  static raisonLisible(code) {
    return ({
      'appareil-non-eligible': tr('ce Mac ne prend pas en charge Apple Intelligence'),
      'apple-intelligence-desactivee': tr('Apple Intelligence est désactivée (Réglages Système, Apple Intelligence et Siri)'),
      'modele-pas-pret': tr('le modèle d’Apple se télécharge encore, réessayez plus tard'),
      'contexte-trop-long': tr('le texte est trop long pour le modèle d’Apple'),
      'garde-fou': tr('le modèle d’Apple a refusé ce contenu'),
      langue: tr('langue non prise en charge par le modèle d’Apple'),
      annule: tr('annulé'),
      delai: tr('Apple Intelligence ne répond pas'),
    })[code] || '';
  }
}

// ── La logique pure ──
class AssistantEcriture {
  // Les outils d'écriture. `sortie` : ce que fait le bouton principal
  // (remplacer la sélection, ou insérer le résultat après elle).
  static get ACTIONS() {
    return [
      { id: 'relire', nom: 'Relire', icone: 'spell-check', sortie: 'remplacer', diff: true,
        consigne: 'Corrige l’orthographe, la grammaire, les accords, la ponctuation et la typographie française (espace insécable avant : ; ! ?, guillemets « »). Ne change ni le sens, ni les mots justes, ni le style, ni la structure. Rends uniquement le texte corrigé.' },
      { id: 'reecrire', nom: 'Réécrire', icone: 'pen-line', sortie: 'remplacer', diff: true,
        consigne: 'Réécris ce texte pour qu’il se lise mieux, en gardant exactement le sens, le registre et à peu près la longueur.' },
      { id: 'clair', nom: 'Plus clair', icone: 'sun', sortie: 'remplacer', diff: true,
        consigne: 'Réécris ce texte pour le rendre plus clair : phrases plus simples, enchaînements explicites, sans perdre d’idée.' },
      { id: 'soutenu', nom: 'Plus soutenu', icone: 'graduation-cap', sortie: 'remplacer', diff: true,
        consigne: 'Réécris ce texte dans un registre académique soutenu, celui d’une thèse en sciences de gestion, sans en changer le sens.' },
      { id: 'concis', nom: 'Plus concis', icone: 'minimize-2', sortie: 'remplacer', diff: true,
        consigne: 'Réécris ce texte de façon plus concise : supprime les redites et les mots inutiles, garde toutes les idées.' },
      { id: 'resume', nom: 'Résumé', icone: 'align-left', sortie: 'inserer',
        consigne: 'Résume ce texte en un court paragraphe.' },
      { id: 'points', nom: 'Points clés', icone: 'list', sortie: 'inserer',
        consigne: 'Dégage les points clés de ce texte, en une liste à puces Markdown (« - »), une idée par puce.' },
      { id: 'liste', nom: 'En liste', icone: 'list-ordered', sortie: 'remplacer',
        consigne: 'Mets ce texte en liste à puces Markdown (« - »), sans rien perdre de son contenu.' },
      { id: 'tableau', nom: 'En tableau', icone: 'table', sortie: 'remplacer',
        consigne: 'Mets le contenu de ce texte dans un tableau Markdown, avec une ligne d’en-tête.' },
    ];
  }

  static action(id) { return AssistantEcriture.ACTIONS.find((a) => a.id === id) || null; }

  // Les consignes communes, données au modèle comme instructions.
  static get INSTRUCTIONS() {
    return 'Tu es l’assistant d’écriture d’un doctorant. Tu rends uniquement le texte demandé, '
      + 'en Markdown, dans la langue du texte reçu, sans préambule, sans guillemets autour, sans commentaire. '
      + 'Les marques ⟦1⟧, ⟦2⟧… remplacent des citations, des liens ou des notes : garde-les toutes, '
      + 'à l’identique et à leur place dans la phrase.';
  }

  // Ce que le modèle ne doit pas toucher (liens, citations, notes, balises,
  // code, formules) devient une marque ⟦n⟧, rendue ensuite telle quelle.
  static masquer(texte) {
    const jetons = [];
    const re = /!?\[\[[^\]\n]*\]\]|\[\^[^\]\n]+\]|\[@[^\]\n]+\]|\[[^\]\n]*\]\([^)\n]*\)|<span\b[^>]*><\/span>|`[^`\n]+`|\$[^$\n]+\$/g;
    const sortie = String(texte).replace(re, (m) => { jetons.push(m); return '⟦' + jetons.length + '⟧'; });
    return { texte: sortie, jetons };
  }

  // Rend les marques ; `manquants` : celles que le modèle a perdues.
  static restaurer(texte, jetons) {
    const vus = new Set();
    // Un appel de note colle au mot qui le précède, même si l'IA l'en a écarté.
    const colle = String(texte).replace(/\s+⟦(\d+)⟧/g, (m, n) => (String(jetons[Number(n) - 1] || '').startsWith('[^') ? '⟦' + n + '⟧' : m));
    const sortie = colle.replace(/⟦(\d+)⟧/g, (m, n) => {
      const i = Number(n) - 1;
      if (i < 0 || i >= jetons.length) return '';
      vus.add(i);
      return jetons[i];
    });
    const manquants = jetons.filter((_, i) => !vus.has(i));
    return { texte: sortie, manquants };
  }

  // La réponse sans ses emballages : bloc de code, préambule, guillemets.
  static nettoyer(t) {
    let s = String(t || '').trim();
    const bloc = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(s);
    if (bloc) s = bloc[1].trim();
    s = s.replace(/^(?:voici|voilà|here is|here's)[^\n]*:\s*\n+/i, '');
    if (/^«[\s\S]*»$/.test(s) && !/»[\s\S]*«/.test(s.slice(1, -1))) s = s.slice(1, -1).trim();
    if (/^"[^"]*"$/.test(s)) s = s.slice(1, -1).trim();
    return s;
  }

  // Les différences mot à mot (plus longue sous-suite commune), pour montrer
  // ce que la relecture a changé. [{ genre: 'egal'|'ajout'|'retrait', texte }].
  static differences(a, b) {
    const ma = String(a).match(/\s+|[^\s]+/g) || [];
    const mb = String(b).match(/\s+|[^\s]+/g) || [];
    if (ma.length * mb.length > 1200000) return [{ genre: 'retrait', texte: a }, { genre: 'ajout', texte: b }];
    const n = ma.length;
    const m = mb.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        L[i][j] = ma[i] === mb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      }
    }
    const out = [];
    const pousser = (genre, texte) => {
      const der = out[out.length - 1];
      if (der && der.genre === genre) der.texte += texte; else out.push({ genre, texte });
    };
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (ma[i] === mb[j]) { pousser('egal', ma[i]); i += 1; j += 1; }
      else if (L[i + 1][j] >= L[i][j + 1]) { pousser('retrait', ma[i]); i += 1; }
      else { pousser('ajout', mb[j]); j += 1; }
    }
    while (i < n) { pousser('retrait', ma[i]); i += 1; }
    while (j < m) { pousser('ajout', mb[j]); j += 1; }
    return out;
  }

  // Ce que veut une demande faite à la barre de l'assistant. Rend
  // { genre, action?, texte } : genre « tache », « journee », « semaine »,
  // « ecriture » (avec une action des outils), « commentaire » ou « question ».
  static intention(demande) {
    const t = String(demande || '').trim();
    const b = t.toLowerCase();
    if (!t) return { genre: 'question', texte: '' };
    const tache = /^(?:ajoute|ajouter|cr[ée]e|cr[ée]er|note|planifie|rappelle-moi(?: de)?)\b[^\n]*?\bt[âa]ches?\b\s*:?\s*(.*)$/i.exec(t)
      || /^(?:nouvelle t[âa]che|t[âa]che)\s*:?\s*(.+)$/i.exec(t)
      || /^rappelle-moi\s+(?:de\s+)?(.+)$/i.exec(t);
    if (tache) return { genre: 'tache', texte: (tache[1] || t).trim() || t };
    if (/r[ée]sum\w*[^\n]*\b(?:journ[ée]e|aujourd)/.test(b)) return { genre: 'journee', texte: t };
    if (/r[ée]sum\w*[^\n]*\bsemaine/.test(b)) return { genre: 'semaine', texte: t };
    if (/^(?:relis|relire|corrige|corriger)\b/.test(b)) return { genre: 'ecriture', action: 'relire', texte: t };
    if (/^(?:r[ée]sume|r[ée]sumer)\b/.test(b)) return { genre: 'ecriture', action: 'resume', texte: t };
    if (/\bpoints? cl[ée]s\b/.test(b)) return { genre: 'ecriture', action: 'points', texte: t };
    if (/\bplus (?:clair|lisible)\b/.test(b)) return { genre: 'ecriture', action: 'clair', texte: t };
    if (/\bplus (?:soutenu|acad[ée]mique|formel)\b/.test(b)) return { genre: 'ecriture', action: 'soutenu', texte: t };
    if (/\bplus (?:concis|court)\b|\braccourcis\b/.test(b)) return { genre: 'ecriture', action: 'concis', texte: t };
    if (/^(?:r[ée][ée]cris|reformule|r[ée][ée]crire|reformuler)\b/.test(b)) return { genre: 'ecriture', action: 'reecrire', texte: t };
    if (/\ben tableau\b/.test(b)) return { genre: 'ecriture', action: 'tableau', texte: t };
    if (/\ben liste\b/.test(b)) return { genre: 'ecriture', action: 'liste', texte: t };
    if (/^(?:commente|commenter)\b/.test(b)) return { genre: 'commentaire', texte: t };
    return { genre: 'question', texte: t };
  }
}

// ── Les outils d'écriture ──
//  Un panneau translucide, au liseré lumineux, posé sous la sélection. On y
//  choisit une action ou on décrit la modification voulue ; le passage
//  miroite pendant que l'IA écrit, le résultat s'affiche au fil de l'eau,
//  avec les différences pour la relecture. Remplacer passe par une seule
//  transaction de l'éditeur : un ⌘Z la défait.
class PanneauEcritureIA {
  constructor(greffon, vue) {
    this.greffon = greffon;
    this.vue = vue;
    this.editeur = vue.editor;
    this.cm = vue.editor && vue.editor.cm;
    this.doc = (this.cm && this.cm.dom.ownerDocument) || document;
    const de = this.editeur.posToOffset(this.editeur.getCursor('from'));
    const a = this.editeur.posToOffset(this.editeur.getCursor('to'));
    this.from = Math.min(de, a);
    this.to = Math.max(de, a);
    this.original = this.editeur.getRange(this.editeur.offsetToPos(this.from), this.editeur.offsetToPos(this.to));
    this.encours = null;
    this.resultat = '';
    this.action = null;
  }

  ouvrir(actionDirecte) {
    if (!this.original.trim()) {
      new obsidian.Notice(tr('Sélectionnez d’abord le passage à travailler.'));
      return;
    }
    PanneauEcritureIA.fermerTout();
    PanneauEcritureIA.ouvert = this;
    this.greffon.marquerCibleIA(this.cm, this.from, this.to, 'cible');
    this.el = this.doc.body.createDiv({ cls: 'zfa-ia-panneau zfa-ia-halo' });
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', tr('Outils d’écriture'));
    this.surAppui = (e) => { if (!this.el.contains(e.target)) this.fermer(); };
    this.surTouche = (e) => { if (e.key === 'Escape') { e.preventDefault(); this.fermer(); } };
    this.doc.addEventListener('mousedown', this.surAppui, true);
    this.doc.addEventListener('keydown', this.surTouche, true);
    if (actionDirecte) this.lancer(AssistantEcriture.action(actionDirecte));
    else this._menu();
  }

  static fermerTout() { if (PanneauEcritureIA.ouvert) PanneauEcritureIA.ouvert.fermer(); }

  fermer() {
    if (this.encours) this.encours.annuler();
    this.encours = null;
    this.doc.removeEventListener('mousedown', this.surAppui, true);
    this.doc.removeEventListener('keydown', this.surTouche, true);
    if (this.el) this.el.remove();
    this.el = null;
    this.greffon.effacerCibleIA(this.cm);
    if (PanneauEcritureIA.ouvert === this) PanneauEcritureIA.ouvert = null;
  }

  // Sous la sélection, ou au-dessus s'il n'y a pas la place.
  _placer() {
    const fen = this.doc.defaultView || window;
    let r = null;
    try {
      const c1 = this.cm.coordsAtPos(this.from);
      const c2 = this.cm.coordsAtPos(this.to);
      if (c1 && c2) r = { gauche: Math.min(c1.left, c2.left), haut: c1.top, bas: c2.bottom };
    } catch (e) { /* hors de la vue */ }
    if (!r) { const b = this.cm.dom.getBoundingClientRect(); r = { gauche: b.left + 40, haut: b.top + 80, bas: b.top + 80 }; }
    const l = this.el.offsetWidth || 360;
    const h = this.el.offsetHeight || 300;
    const x = Math.max(12, Math.min(r.gauche, fen.innerWidth - l - 12));
    let y = r.bas + 10;
    if (y + h > fen.innerHeight - 12) y = Math.max(12, r.haut - h - 10);
    this.el.style.left = Math.round(x) + 'px';
    this.el.style.top = Math.round(y) + 'px';
  }

  _entete(titre, retour) {
    const t = this.el.createDiv({ cls: 'zfa-ia-tete' });
    if (retour) {
      const r = t.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': tr('Retour') } });
      obsidian.setIcon(r, 'chevron-left');
      r.addEventListener('click', () => { if (this.encours) this.encours.annuler(); this.encours = null; this._menu(); });
    } else {
      iconeIA(t.createSpan());
    }
    t.createSpan({ cls: 'zfa-ia-titre', text: titre });
    const x = t.createDiv({ cls: 'clickable-icon zfa-ia-fermer', attr: { 'aria-label': tr('Fermer') } });
    obsidian.setIcon(x, 'x');
    x.addEventListener('click', () => this.fermer());
  }

  _menu() {
    this.el.empty();
    this.el.removeClass('est-resultat');
    this.greffon.marquerCibleIA(this.cm, this.from, this.to, 'cible');
    this._entete(tr('Outils d’écriture'), false);
    const saisie = this.el.createDiv({ cls: 'zfa-ia-saisie' });
    const champ = saisie.createEl('input', { type: 'text', attr: { placeholder: tr('Décrivez la modification…') } });
    const envoi = saisie.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': tr('Envoyer') } });
    obsidian.setIcon(envoi, 'arrow-up');
    const libre = () => {
      const v = champ.value.trim();
      if (v) this.lancer({ id: 'libre', nom: v, sortie: 'remplacer', diff: true, consigne: v });
    };
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); libre(); } });
    envoi.addEventListener('click', libre);
    const A = AssistantEcriture.ACTIONS;
    const gros = this.el.createDiv({ cls: 'zfa-ia-gros' });
    for (const a of A.slice(0, 2)) this._bouton(gros, a, 'zfa-ia-gros-bouton');
    const tons = this.el.createDiv({ cls: 'zfa-ia-tons' });
    for (const a of A.slice(2, 5)) this._bouton(tons, a, 'zfa-ia-ton');
    this.el.createDiv({ cls: 'zfa-ia-trait' });
    const liste = this.el.createDiv({ cls: 'zfa-ia-liste' });
    for (const a of A.slice(5)) this._bouton(liste, a, 'zfa-ia-ligne');
    this._placer();
    setTimeout(() => champ.focus(), 0);
  }

  _bouton(hote, a, cls) {
    const b = hote.createEl('button', { cls });
    obsidian.setIcon(b.createSpan({ cls: 'zfa-ia-bouton-icone' }), a.icone);
    b.createSpan({ text: tr(a.nom) });
    b.addEventListener('click', () => this.lancer(a));
    return b;
  }

  // Lance une action : le passage miroite, le résultat arrive au fil de l'eau.
  lancer(a) {
    if (!a) return;
    this.action = a;
    this.resultat = '';
    this.el.empty();
    this.el.addClass('est-resultat');
    this._entete(tr(a.nom), true);
    const corps = this.el.createDiv({ cls: 'zfa-ia-resultat est-attente' });
    const pied = this.el.createDiv({ cls: 'zfa-ia-pied' });
    this._placer();
    this.greffon.marquerCibleIA(this.cm, this.from, this.to, 'miroir');
    const { texte, jetons } = AssistantEcriture.masquer(this.original);
    const consigne = a.consigne + '\n\nTexte :\n' + texte;
    this.encours = this.greffon.ecrireAvecIA(AssistantEcriture.INSTRUCTIONS, consigne, {
      max: Math.min(3000, Math.max(400, Math.round(texte.length / 2))),
      surPartiel: (p) => {
        corps.removeClass('est-attente');
        corps.setText(AssistantEcriture.restaurer(AssistantEcriture.nettoyer(p), jetons).texte);
        this._placer();
      },
    });
    this.encours.fin.then((r) => {
      if (!this.el || this.action !== a) return;
      this.encours = null;
      corps.removeClass('est-attente');
      if (!r || r.erreur) {
        this.greffon.marquerCibleIA(this.cm, this.from, this.to, 'cible');
        corps.addClass('est-erreur');
        corps.setText(tr('L’IA n’a pas pu répondre : ') + ((r && r.erreur) || tr('aucune réponse')));
        this._pied(pied, false);
        return;
      }
      const rendu = AssistantEcriture.restaurer(AssistantEcriture.nettoyer(r.texte), jetons);
      this.resultat = rendu.texte;
      this.greffon.marquerCibleIA(this.cm, this.from, this.to, 'cible');
      corps.empty();
      if (a.diff && this.resultat !== this.original) {
        for (const d of AssistantEcriture.differences(this.original, this.resultat)) {
          corps.createSpan({ cls: 'zfa-ia-diff-' + d.genre, text: d.texte });
        }
      } else {
        corps.setText(this.resultat);
      }
      if (a.diff && this.resultat === this.original) {
        this.el.createDiv({ cls: 'zfa-ia-note', text: tr('Rien à changer.') });
      }
      if (rendu.manquants.length) {
        this.el.createDiv({ cls: 'zfa-ia-note est-alerte',
          text: tr('Attention : l’IA a perdu ') + rendu.manquants.length + tr(' lien(s) ou citation(s), à reprendre : ') + rendu.manquants.join(' ') });
      }
      this._pied(pied, true);
      this._placer();
    });
  }

  _pied(pied, ok) {
    pied.empty();
    const a = this.action;
    const bouton = (texte, icone, cta, faire) => {
      const b = pied.createEl('button', { cls: cta ? 'mod-cta' : '' });
      if (icone) obsidian.setIcon(b.createSpan({ cls: 'zfa-ia-bouton-icone' }), icone);
      b.createSpan({ text: texte });
      b.addEventListener('click', faire);
      return b;
    };
    const refaire = pied.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': tr('Recommencer') } });
    obsidian.setIcon(refaire, 'rotate-ccw');
    refaire.addEventListener('click', () => this.lancer(a));
    if (!ok) return;
    const copier = pied.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': tr('Copier') } });
    obsidian.setIcon(copier, 'copy');
    copier.addEventListener('click', () => { navigator.clipboard.writeText(this.resultat); new obsidian.Notice(tr('Copié.')); });
    pied.createDiv({ cls: 'zfa-ia-espace' });
    const inserer = a.sortie === 'inserer';
    bouton(inserer ? tr('Remplacer') : tr('Insérer après'), null, false, () => this._appliquer(!inserer));
    bouton(inserer ? tr('Insérer après') : tr('Remplacer'), null, true, () => this._appliquer(inserer));
  }

  // Remplace la sélection, ou insère le résultat après elle, en une seule
  // transaction. Si le passage a bougé entre-temps, on le retrouve.
  _appliquer(inserer) {
    const ed = this.editeur;
    let plage = this.greffon.plageCibleIA(this.cm) || { from: this.from, to: this.to };
    const actuel = ed.getRange(ed.offsetToPos(plage.from), ed.offsetToPos(plage.to));
    if (actuel !== this.original) {
      const i = ed.getValue().indexOf(this.original);
      if (i < 0) { new obsidian.Notice(tr('Le passage a changé : sélectionnez-le de nouveau.')); return; }
      plage = { from: i, to: i + this.original.length };
    }
    const texte = inserer ? '\n\n' + this.resultat : this.resultat;
    const de = inserer ? plage.to : plage.from;
    ed.transaction({ changes: [{ from: ed.offsetToPos(de), to: ed.offsetToPos(plage.to), text: texte }] });
    const debut = inserer ? plage.to + 2 : plage.from;
    this.fermer();
    this.greffon.marquerCibleIA(this.cm, debut, debut + this.resultat.length, 'nouveau');
    ed.focus();
  }
}

// ── La barre de l'assistant ──
//  Une barre flottante, au liseré lumineux, à la manière de Siri : on y
//  écrit ce que l'on veut, Ariane reconnaît la demande (une tâche, un
//  résumé de la journée, un outil d'écriture…) ou y répond directement, à
//  partir de la note ouverte.
class BarreAssistantIA {
  constructor(greffon) {
    this.greffon = greffon;
    this.encours = null;
    this.reponse = '';
  }

  static fermerTout() { if (BarreAssistantIA.ouverte) BarreAssistantIA.ouverte.fermer(); }

  ouvrir() {
    BarreAssistantIA.fermerTout();
    BarreAssistantIA.ouverte = this;
    const ws = this.greffon.app.workspace;
    this.vue = ws.getActiveViewOfType(obsidian.MarkdownView);
    this.doc = (this.vue && this.vue.containerEl.ownerDocument) || document;
    const ed = this.vue && this.vue.editor;
    this.selection = ed && ed.somethingSelected() ? ed.getSelection() : '';
    this.el = this.doc.body.createDiv({ cls: 'zfa-ia-barre zfa-ia-halo' });
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', tr('Demander à l’assistant'));
    const ligne = this.el.createDiv({ cls: 'zfa-ia-barre-ligne' });
    iconeIA(ligne.createSpan({ cls: 'zfa-ia-barre-icone' }));
    this.champ = ligne.createEl('input', { type: 'text',
      attr: { placeholder: this.selection ? tr('Que faire de la sélection ?') : tr('Demandez à Ariane…') } });
    this.zone = this.el.createDiv({ cls: 'zfa-ia-barre-zone' });
    this._suggestions();
    this.champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.envoyer(this.champ.value); }
    });
    this.surAppui = (e) => { if (!this.el.contains(e.target)) this.fermer(); };
    this.surTouche = (e) => { if (e.key === 'Escape') { e.preventDefault(); this.fermer(); } };
    this.doc.addEventListener('mousedown', this.surAppui, true);
    this.doc.addEventListener('keydown', this.surTouche, true);
    setTimeout(() => this.champ.focus(), 0);
  }

  fermer() {
    if (this.encours) this.encours.annuler();
    this.encours = null;
    if (this.doc) {
      this.doc.removeEventListener('mousedown', this.surAppui, true);
      this.doc.removeEventListener('keydown', this.surTouche, true);
    }
    if (this.el) this.el.remove();
    this.el = null;
    if (BarreAssistantIA.ouverte === this) BarreAssistantIA.ouverte = null;
  }

  // Quelques demandes toutes prêtes, selon ce qui est ouvert.
  _suggestions() {
    this.zone.empty();
    const g = this.greffon;
    const idees = [];
    if (this.selection) {
      idees.push(['spell-check', tr('Relire la sélection'), 'Relis la sélection']);
      idees.push(['align-left', tr('Résumer la sélection'), 'Résume la sélection']);
      idees.push(['graduation-cap', tr('Plus soutenu'), 'Rends la sélection plus soutenue']);
    } else if (this.vue) {
      idees.push(['align-left', tr('Résumer cette note'), 'Résume cette note en quelques phrases.']);
    }
    if (g.module('taches')) idees.push(['list-plus', tr('Ajouter une tâche…'), null, 'Ajoute une tâche : ']);
    if (g.module('temps')) idees.push(['sunset', tr('Résumer ma journée'), 'Résume ma journée']);
    if (!idees.length) return;
    const puces = this.zone.createDiv({ cls: 'zfa-ia-puces' });
    for (const [icone, nom, demande, amorce] of idees) {
      const p = puces.createEl('button', { cls: 'zfa-ia-puce' });
      obsidian.setIcon(p.createSpan({ cls: 'zfa-ia-bouton-icone' }), icone);
      p.createSpan({ text: nom });
      p.addEventListener('click', () => {
        if (amorce) { this.champ.value = amorce; this.champ.focus(); return; }
        this.champ.value = demande;
        this.envoyer(demande);
      });
    }
  }

  envoyer(demande) {
    const t = String(demande || '').trim();
    if (!t || this.encours) return;
    const i = AssistantEcriture.intention(t);
    const g = this.greffon;
    if (i.genre === 'ecriture' && this.selection && this.vue) {
      this.fermer();
      g.ouvrirOutilsEcriture(this.vue, i.action);
      return;
    }
    if (i.genre === 'tache' && g.module('taches')) {
      this.fermer();
      new ModaleAjoutLN(g, { texte: i.texte, lancer: true }).open();
      return;
    }
    if (i.genre === 'journee' && g.module('temps') && g.resumerJournee) {
      this.fermer();
      g.avecHaloIA(() => g.resumerJournee(jourIsoDe(new Date())));
      return;
    }
    if (i.genre === 'semaine' && g.module('temps') && g.resumerSemaineAffichee && g.activiteDisponible && g.activiteDisponible()) {
      this.fermer();
      g.avecHaloIA(() => g.resumerSemaineAffichee());
      return;
    }
    if (i.genre === 'commentaire' && this.vue && g.module('commentaires') && this.vue.file) {
      this.fermer();
      g.commenterPassage(this.vue.editor, this.vue.file);
      return;
    }
    this._repondre(t);
  }

  // Une réponse libre, à partir de la sélection ou de la note ouverte.
  async _repondre(question) {
    const g = this.greffon;
    let contexte = this.selection;
    let source = tr('la sélection');
    if (!contexte && this.vue && this.vue.file) {
      contexte = this.vue.editor ? this.vue.editor.getValue() : await g.app.vault.cachedRead(this.vue.file);
      contexte = contexte.replace(/^---\n[\s\S]*?\n---\n?/, '');
      source = tr('la note « ') + this.vue.file.basename + ' »';
    }
    // Le modèle d'Apple a une fenêtre courte : on borne le contexte.
    const borne = 6000;
    if (contexte.length > borne) contexte = contexte.slice(0, borne) + '\n[…]';
    const consigne = contexte
      ? tr('Voici ') + source + ' :\n\n' + contexte + '\n\n' + tr('Demande :') + ' ' + question
      : question;
    const instructions = 'Tu es l’assistant d’Ariane, dans Obsidian, pour un doctorant. Tu réponds en français, '
      + 'brièvement et précisément, en Markdown, sans préambule. Si la demande porte sur le texte fourni, tu t’y tiens.';
    this.zone.empty();
    const tete = this.zone.createDiv({ cls: 'zfa-ia-barre-question', text: question });
    tete.setAttribute('aria-hidden', 'true');
    const corps = this.zone.createDiv({ cls: 'zfa-ia-resultat est-attente' });
    const pied = this.zone.createDiv({ cls: 'zfa-ia-pied' });
    this.champ.value = '';
    this.champ.setAttribute('placeholder', tr('Une autre demande…'));
    this.encours = g.ecrireAvecIA(instructions, consigne, {
      max: 900,
      surPartiel: (p) => { corps.removeClass('est-attente'); corps.setText(AssistantEcriture.nettoyer(p)); },
    });
    const r = await this.encours.fin;
    this.encours = null;
    if (!this.el) return;
    corps.removeClass('est-attente');
    if (!r || r.erreur) {
      corps.addClass('est-erreur');
      corps.setText(tr('L’IA n’a pas pu répondre : ') + ((r && r.erreur) || tr('aucune réponse')));
      return;
    }
    this.reponse = AssistantEcriture.nettoyer(r.texte);
    corps.setText(this.reponse);
    const copier = pied.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': tr('Copier') } });
    obsidian.setIcon(copier, 'copy');
    copier.addEventListener('click', () => { navigator.clipboard.writeText(this.reponse); new obsidian.Notice(tr('Copié.')); });
    pied.createDiv({ cls: 'zfa-ia-espace' });
    if (this.vue && this.vue.editor && this.vue.getMode() === 'source') {
      const b = pied.createEl('button', { cls: 'mod-cta', text: tr('Insérer dans la note') });
      b.addEventListener('click', () => {
        const ed = this.vue.editor;
        const pos = ed.getCursor('to');
        const debut = ed.posToOffset(pos);
        const texte = (this.selection ? '\n\n' : '') + this.reponse;
        ed.transaction({ changes: [{ from: pos, to: pos, text: texte }] });
        this.greffon.marquerCibleIA(ed.cm, debut + (this.selection ? 2 : 0), debut + texte.length, 'nouveau');
        this.fermer();
        ed.focus();
      });
    }
  }
}

//#endregion 24 · Assistant IA

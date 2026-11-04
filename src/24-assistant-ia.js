//#region 24 · Assistant IA
// ═══════════════════════════════════════════════════════════════════════════
//  24 · ASSISTANT IA
//  L'IA d'Ariane à la manière d'Apple Intelligence (module « assistant ») :
//    - MoteurAppleIA : le modèle de langue d'Apple, sur le Mac (cadre
//      Foundation Models, macOS 26 et suivants), par un petit démon Swift
//      compilé une fois, comme celui du correcteur (section 18). Il sert
//      aussi de fournisseur à toutes les fonctions d'IA d'Ariane.
//    - AssistantEcriture : la logique pure (consignes, masquage des liens et
//      citations, nettoyage des réponses, différences mot à mot, remarques
//      placées dans le texte, citations perdues), éprouvée par les tests.
//    - PanneauEcritureIA : les outils d'écriture, à la demande : un menu
//      d'actions (consigne libre, relire, réécrire et ses variantes,
//      « qu'en pensez-vous ? »), puis le résultat dans une carte de verre.
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
      { id: 'avis', nom: 'Qu’en pensez-vous ?', icone: 'message-circle-question', sortie: 'commenter',
        consigne: 'Relis ce texte comme un directeur de thèse exigeant et bienveillant. Donne de une à quatre remarques utiles '
          + '(clarté, argumentation, précision, style). Rends uniquement un tableau JSON : '
          + '[{"extrait": "quelques mots recopiés exactement du texte", "remarque": "ta remarque, en une ou deux phrases"}].' },
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

  // Ce qu'il ne faut jamais perdre en réécrivant : liens, citations, notes,
  // balises des commentaires. Les mêmes motifs que masquer(), sans le code.
  static get MOTIF_PRECIEUX() {
    return /!?\[\[[^\]\n]*\]\]|\[\^[^\]\n]+\]|\[@[^\]\n]+\]|<span\b[^>]*><\/span>/g;
  }

  // Les liens et citations présents avant et absents après (en tenant
  // compte des doublons). Le filet de sécurité des outils d'écriture d'Apple.
  static citationsPerdues(avant, apres) {
    const compter = (t) => {
      const m = new Map();
      for (const x of String(t).match(AssistantEcriture.MOTIF_PRECIEUX) || []) m.set(x, (m.get(x) || 0) + 1);
      return m;
    };
    const a = compter(avant);
    const b = compter(apres);
    const perdus = [];
    for (const [x, n] of a) for (let k = (b.get(x) || 0); k < n; k += 1) perdus.push(x);
    return perdus;
  }

  // Les remarques de « Qu'en pensez-vous ? », placées dans le texte : chacune
  // s'accroche au passage qu'elle cite. Rend [{ from, to, remarque }], sans
  // chevauchement, dans l'ordre du texte ; une remarque dont le passage est
  // introuvable s'accroche à tout le texte.
  static remarques(reponse, texte) {
    const liste = Array.isArray(reponse) ? reponse
      : (reponse && Array.isArray(reponse.remarques) ? reponse.remarques : []);
    const t = String(texte);
    const out = [];
    for (const r of liste.slice(0, 5)) {
      const remarque = String((r && (r.remarque || r.commentaire)) || '').trim();
      if (!remarque) continue;
      const extrait = String((r && (r.extrait || r.passage)) || '').trim();
      let i = extrait ? t.indexOf(extrait) : -1;
      if (i < 0 && extrait) i = t.toLowerCase().indexOf(extrait.toLowerCase());
      const place = i >= 0 ? { from: i, to: i + extrait.length } : { from: 0, to: t.length };
      if (out.some((o) => place.from < o.to && o.from < place.to)) continue;
      out.push(Object.assign(place, { remarque }));
    }
    return out.sort((a, b) => a.from - b.from);
  }
}

// ── Les outils d'écriture ──
//  À la demande seulement (barre d'édition, clic droit, palette) : un menu
//  d'Obsidian propose les actions, puis le résultat arrive dans une carte de
//  verre sous le passage. Le passage miroite pendant que l'IA écrit ; la
//  relecture montre les différences. Remplacer passe par une seule
//  transaction de l'éditeur : un ⌘Z la défait. « Qu'en pensez-vous ? » pose
//  ses remarques en commentaires dans la marge.
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

  // Les actions, dans un menu d'Obsidian (le sien, ou un sous-menu du clic
  // droit). `lancer(action)` et `consigne()` disent quoi faire du choix.
  static remplirMenu(menu, lancer, consigne, greffon, vue) {
    menu.addItem((i) => i.setTitle(tr('Modifier par une consigne…')).setIcon('sparkles').onClick(consigne));
    menu.addSeparator();
    for (const a of AssistantEcriture.ACTIONS) {
      if (a.id === 'resume' || a.id === 'avis') menu.addSeparator();
      menu.addItem((i) => i.setTitle(tr(a.nom)).setIcon(a.icone).onClick(() => lancer(a)));
    }
  }

  // o : { action } lance tout de suite ; { consigne } demande la consigne ;
  // sinon, le menu des actions sous le passage.
  ouvrir(o) {
    const opts = o || {};
    if (!this.original.trim()) {
      new obsidian.Notice(tr('Sélectionnez d’abord le passage à travailler.'));
      return;
    }
    if (!opts.action && !opts.consigne) { this._menu(); return; }
    PanneauEcritureIA.fermerTout();
    PanneauEcritureIA.ouvert = this;
    this.el = this.doc.body.createDiv({ cls: 'zfa-ia-ecriture' });
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', tr('Outils d’écriture'));
    this.surAppui = (e) => { if (!this.el.contains(e.target) && !e.target.closest('.menu')) this.fermer(); };
    this.surTouche = (e) => { if (e.key === 'Escape') { e.preventDefault(); this.fermer(); } };
    this.surDefil = () => this._placer();
    this.doc.addEventListener('mousedown', this.surAppui, true);
    this.doc.addEventListener('keydown', this.surTouche, true);
    if (this.cm) this.cm.scrollDOM.addEventListener('scroll', this.surDefil);
    if (opts.consigne) this._consigne();
    else this.lancer(AssistantEcriture.action(opts.action));
  }

  static fermerTout() { if (PanneauEcritureIA.ouvert) PanneauEcritureIA.ouvert.fermer(); }

  fermer() {
    if (this.encours) this.encours.annuler();
    this.encours = null;
    if (this.surAppui) this.doc.removeEventListener('mousedown', this.surAppui, true);
    if (this.surTouche) this.doc.removeEventListener('keydown', this.surTouche, true);
    if (this.cm && this.surDefil) this.cm.scrollDOM.removeEventListener('scroll', this.surDefil);
    if (this.el) this.el.remove();
    this.el = null;
    this.greffon.effacerCibleIA(this.cm);
    if (PanneauEcritureIA.ouvert === this) PanneauEcritureIA.ouvert = null;
  }

  // Le menu des actions, sous la fin du passage.
  _menu() {
    const menu = new obsidian.Menu();
    PanneauEcritureIA.remplirMenu(menu, (a) => this.ouvrir({ action: a.id }), () => this.ouvrir({ consigne: true }),
      this.greffon, this.vue);
    let p = null;
    try { p = this.cm.coordsAtPos(this.to); } catch (e) { /* hors de la vue */ }
    if (p) menu.showAtPosition({ x: p.left, y: p.bottom + 6 }, this.doc);
    else { const r = this.cm.dom.getBoundingClientRect(); menu.showAtPosition({ x: r.left + 40, y: r.top + 80 }, this.doc); }
  }

  // La carte sous le passage (au-dessus, faute de place dessous).
  _placer() {
    const carte = this.el && this.el.querySelector('.zfa-ia-carte');
    if (!carte) return;
    const fen = this.doc.defaultView || window;
    let haut = null;
    let bas = null;
    try {
      const c1 = this.cm.coordsAtPos(this.from);
      const c2 = this.cm.coordsAtPos(this.to);
      if (c1) haut = c1.top;
      if (c2) bas = c2.bottom;
    } catch (e) { /* hors de la vue */ }
    const colonne = this.cm.contentDOM.getBoundingClientRect();
    const cadre = this.cm.scrollDOM.getBoundingClientRect();
    if (haut === null) haut = cadre.top + 60;
    if (bas === null) bas = haut + 20;
    const l = carte.offsetWidth || 440;
    const h = carte.offsetHeight || 200;
    const x = Math.max(12, Math.min(colonne.left, fen.innerWidth - l - 12));
    let y = bas + 10;
    if (y + h > fen.innerHeight - 12) y = Math.max(12, haut - h - 10);
    carte.style.left = Math.round(x) + 'px';
    carte.style.top = Math.round(y) + 'px';
  }

  // Une consigne libre : « rends ce passage plus vivant », « traduis en anglais »…
  _consigne() {
    const carte = this._carte(tr('Modifier par une consigne'));
    carte.removeClass('zfa-ia-halo');
    const champ = carte.createEl('input', { type: 'text', cls: 'zfa-ia-consigne',
      attr: { placeholder: tr('Décrivez la modification, puis Entrée') } });
    champ.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      const v = champ.value.trim();
      if (v) this.lancer({ id: 'libre', nom: v, sortie: 'remplacer', diff: true, consigne: v });
    });
    this.greffon.marquerCibleIA(this.cm, this.from, this.to, 'cible');
    this._placer();
    setTimeout(() => champ.focus(), 0);
  }

  _carte(titre) {
    this.el.empty();
    const carte = this.el.createDiv({ cls: 'zfa-ia-carte zfa-ia-halo' });
    const t = carte.createDiv({ cls: 'zfa-ia-tete' });
    iconeIA(t.createSpan());
    t.createSpan({ cls: 'zfa-ia-titre', text: titre });
    const x = t.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': tr('Fermer') } });
    obsidian.setIcon(x, 'x');
    x.addEventListener('click', () => this.fermer());
    return carte;
  }

  // Lance une action : le passage miroite, le résultat arrive au fil de l'eau.
  lancer(a) {
    if (!a || !this.el) return;
    if (a.id === 'avis') { this._avis(); return; }
    this.action = a;
    this.resultat = '';
    const carte = this._carte(tr(a.nom));
    const corps = carte.createDiv({ cls: 'zfa-ia-resultat est-attente' });
    const pied = carte.createDiv({ cls: 'zfa-ia-pied' });
    this._placer();
    this.greffon.marquerCibleIA(this.cm, this.from, this.to, 'miroir');
    const { texte, jetons } = AssistantEcriture.masquer(this.original);
    this.encours = this.greffon.ecrireAvecIA(AssistantEcriture.INSTRUCTIONS, a.consigne + '\n\nTexte :\n' + texte, {
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
      carte.removeClass('zfa-ia-halo');
      corps.removeClass('est-attente');
      this.greffon.marquerCibleIA(this.cm, this.from, this.to, 'cible');
      if (!r || r.erreur) {
        corps.addClass('est-erreur');
        corps.setText(tr('L’IA n’a pas pu répondre : ') + ((r && r.erreur) || tr('aucune réponse')));
        this._pied(pied, false);
        return;
      }
      const rendu = AssistantEcriture.restaurer(AssistantEcriture.nettoyer(r.texte), jetons);
      this.resultat = rendu.texte;
      corps.empty();
      if (a.diff && this.resultat !== this.original) {
        for (const d of AssistantEcriture.differences(this.original, this.resultat)) {
          corps.createSpan({ cls: 'zfa-ia-diff-' + d.genre, text: d.texte });
        }
      } else {
        corps.setText(this.resultat);
      }
      if (a.diff && this.resultat === this.original) carte.createDiv({ cls: 'zfa-ia-note', text: tr('Rien à changer.') });
      if (rendu.manquants.length) {
        carte.createDiv({ cls: 'zfa-ia-note est-alerte',
          text: tr('Attention : l’IA a perdu ') + rendu.manquants.length + tr(' lien(s) ou citation(s), à reprendre : ') + rendu.manquants.join(' ') });
      }
      carte.appendChild(pied);
      this._pied(pied, true);
      this._placer();
    });
  }

  // « Qu'en pensez-vous ? » : des remarques sur le passage, posées en
  // commentaires dans la marge (module « commentaires »), sinon listées.
  _avis() {
    const a = AssistantEcriture.action('avis');
    this.action = a;
    const carte = this._carte(tr(a.nom));
    const corps = carte.createDiv({ cls: 'zfa-ia-resultat est-attente' });
    this._placer();
    this.greffon.marquerCibleIA(this.cm, this.from, this.to, 'miroir');
    const { texte } = AssistantEcriture.masquer(this.original);
    this.encours = this.greffon.ecrireAvecIA(AssistantEcriture.INSTRUCTIONS, a.consigne + '\n\nTexte :\n' + texte, { max: 900 });
    this.encours.fin.then((r) => {
      if (!this.el || this.action !== a) return;
      this.encours = null;
      carte.removeClass('zfa-ia-halo');
      corps.removeClass('est-attente');
      this.greffon.marquerCibleIA(this.cm, this.from, this.to, 'cible');
      const j = r && !r.erreur ? Ariane.extraireJson(r.texte) : null;
      const rem = j ? AssistantEcriture.remarques(j, this.original) : [];
      if (!rem.length) {
        corps.addClass('est-erreur');
        corps.setText(r && r.erreur ? tr('L’IA n’a pas pu répondre : ') + r.erreur : tr('L’IA n’a rien trouvé à redire.'));
        return;
      }
      const f = this.vue.file;
      if (this.greffon.module('commentaires') && f && !this.greffon.noteTenueParAriane(f)) {
        const n = this.greffon.poserRemarquesIA(this.editeur, this.from, this.to, this.original, rem);
        if (n) {
          this.fermer();
          new obsidian.Notice(n + tr(' remarque(s) de l’IA ajoutée(s) en marge.'));
          return;
        }
      }
      corps.empty();
      const ul = corps.createEl('ul', { cls: 'zfa-ia-remarques' });
      for (const x of rem) {
        const li = ul.createEl('li');
        li.createDiv({ cls: 'zfa-ia-remarque-passage', text: this.original.slice(x.from, x.to).slice(0, 80) });
        li.createDiv({ text: x.remarque });
      }
      this._placer();
    });
  }

  _pied(pied, ok) {
    pied.empty();
    const a = this.action;
    const refaire = pied.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': tr('Recommencer') } });
    obsidian.setIcon(refaire, 'rotate-ccw');
    refaire.addEventListener('click', () => this.lancer(a));
    if (!ok) return;
    const copier = pied.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': tr('Copier') } });
    obsidian.setIcon(copier, 'copy');
    copier.addEventListener('click', () => { navigator.clipboard.writeText(this.resultat); new obsidian.Notice(tr('Copié.')); });
    pied.createDiv({ cls: 'zfa-ia-espace' });
    const inserer = a.sortie === 'inserer';
    const b1 = pied.createEl('button', { text: inserer ? tr('Remplacer') : tr('Insérer après') });
    b1.addEventListener('click', () => this._appliquer(!inserer));
    const b2 = pied.createEl('button', { cls: 'mod-cta', text: inserer ? tr('Insérer après') : tr('Remplacer') });
    b2.addEventListener('click', () => this._appliquer(inserer));
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
    this.greffon.ecritureIA(() => ed.transaction({ changes: [{ from: ed.offsetToPos(de), to: ed.offsetToPos(plage.to), text: texte }] }));
    const debut = inserer ? plage.to + 2 : plage.from;
    this.fermer();
    this.greffon.marquerCibleIA(this.cm, debut, debut + this.resultat.length, 'nouveau');
    ed.focus();
  }
}

//#endregion 24 · Assistant IA

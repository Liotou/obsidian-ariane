//#region 18 · Correcteur Apple
// ═══════════════════════════════════════════════════════════════════════════
//  18 · CORRECTEUR APPLE
//  Le correcteur du système mis à la portée de l'éditeur d'Obsidian : la
//  relecture contextuelle de Mail (accords, conjugaisons, participes passés,
//  mots erronés, avec l'explication en français) et, en complément, le
//  correcteur orthographique classique pour les mots isolés. Un petit
//  programme Swift, compilé une fois à la première utilisation, sert de
//  démon : il reçoit du texte en JSON et rend les fautes avec leurs
//  corrections. Le greffon les souligne en pointillés bleus (relecture) ou
//  rouges (orthographe) et ouvre une bulle de correction au survol.
//  Mac uniquement ; sans effet ailleurs.
// ═══════════════════════════════════════════════════════════════════════════

// Source du démon. Elle vit ici parce que le greffon n'est livré que sous
// forme de main.js : il l'écrit à côté de lui et la compile (swiftc) une fois.
// Ni accent grave ni « ${ » dans ce texte : il est en gabarit littéral.
const CORRECTEUR_SWIFT = String.raw`import AppKit
import NaturalLanguage

// Correcteur d'Ariane : un demon qui parle en JSON, une ligne par message,
// et met le correcteur du systeme a la portee d'Obsidian.
//
// Deux moteurs, tous deux d'Apple :
//   - la relecture contextuelle (celle de Mail et de Pages) : accords,
//     conjugaisons, participes passes, mots errones, avec une explication
//     en francais. Elle passe par requestProofreadingReviewOfString:, que
//     AppKit n'expose pas dans ses entetes : le demon verifie donc sa
//     presence avant de s'en servir, et s'en passe si elle disparait.
//   - le correcteur orthographique classique (NSSpellChecker), synchrone,
//     pour les mots isoles que la relecture ne couvre pas.
//
// Entree  : {"id":1,"cmd":"checkMany","texts":["...","..."]}
//           {"cmd":"learn","word":"..."}  -> apprend un mot au dictionnaire
//           {"cmd":"ping"}  -> dit quels moteurs repondent
// Sortie  : {"id":1,"items":[{"from":23,"length":8,"kind":"grammar",
//            "word":"explique","replace":["expliquer"],"message":"...",
//            "category":"Forme du verbe"}]}
//
// Les positions sont en unites UTF-16, comme les indices d'une chaine
// JavaScript : elles se reportent telles quelles dans l'editeur.

let verificateur = NSSpellChecker.shared
verificateur.automaticallyIdentifiesLanguages = true
let balise = NSSpellChecker.uniqueSpellDocumentTag()

// La relecture contextuelle, si ce systeme la propose.
@objc protocol RelectureApple {
  @objc(requestProofreadingReviewOfString:range:language:options:completionHandler:)
  func demander(_ texte: NSString, range: NSRange, language: NSString?, options: NSDictionary,
                completionHandler: @escaping (Int, NSArray?) -> Void) -> Int
}
let selRelecture = NSSelectorFromString(
  "requestProofreadingReviewOfString:range:language:options:completionHandler:")
let relectureDispo = verificateur.responds(to: selRelecture)
let relecteur = unsafeBitCast(verificateur, to: RelectureApple.self)

// Au-dela, la relecture n'apporte plus rien et le systeme peine : on tronque.
let TAILLE_MAX = 4000
// Le modele de langue prend quelques secondes ; au-dela, on rend ce qu'on a.
let DELAI_RELECTURE = 20.0

// La langue se devine sur la note entiere, jamais sur la ligne seule : un
// titre de trois mots, une puce, un nom propre, et le systeme croit lire de
// l'anglais — il corrigeait alors « institutionnelle » en « institutional ».
func code(_ l: NLLanguage) -> String {
  switch l {
  case .english: return "en"
  case .french: return "fr"
  default: return l.rawValue
  }
}

// La langue de la note entiere : l'echantillon que le greffon joint.
func langueDe(_ texte: String) -> String {
  let r = NLLanguageRecognizer()
  r.languageHints = [.french: 0.7, .english: 0.3]
  r.processString(texte)
  guard let l = r.dominantLanguage else { return "fr" }
  return code(l)
}

// La langue d'une ligne. Elle ne s'ecarte de celle de la note que si elle est
// assez longue ET que le systeme en est sur : sur trois mots, un titre ou un
// nom propre, il se trompe, et « institutionnelle » devenait « institutional ».
func langueLigne(_ texte: String, _ defaut: String) -> String {
  let mots = texte.split(whereSeparator: { !$0.isLetter && $0 != "'" && $0 != "\u{2019}" && $0 != "-" }).count
  if mots < 8 { return defaut }
  let r = NLLanguageRecognizer()
  r.languageHints = [.french: 0.7, .english: 0.3]
  r.processString(texte)
  guard let l = r.dominantLanguage else { return defaut }
  let hypotheses = r.languageHypotheses(withMaximum: 3)
  if (hypotheses[l] ?? 0) < 0.9 { return defaut }
  return code(l)
}

// L'orthographe, mot a mot : synchrone, et rapide.
func orthographe(_ texte: String, _ langue: String) -> [[String: Any]] {
  var items: [[String: Any]] = []
  let ns = texte as NSString
  var depart = 0
  while depart < ns.length {
    let plage = verificateur.checkSpelling(of: texte, startingAt: depart, language: langue,
      wrap: false, inSpellDocumentWithTag: balise, wordCount: nil)
    if plage.location == NSNotFound || plage.length == 0 { break }
    let mot = ns.substring(with: plage)
    let propositions = verificateur.guesses(forWordRange: plage, in: texte, language: langue,
      inSpellDocumentWithTag: balise) ?? []
    items.append(["from": plage.location, "length": plage.length, "kind": "spelling",
      "word": mot, "replace": Array(propositions.prefix(6)), "message": "", "category": ""])
    depart = plage.location + max(plage.length, 1)
  }
  return items
}

// La relecture contextuelle : asynchrone, un appel par bloc de texte.
func relire(_ texte: String, _ langue: String, _ fini: @escaping ([[String: Any]]) -> Void) {
  guard relectureDispo else { fini([]); return }
  let ns = texte as NSString
  var rendu = false
  let rendre: ([[String: Any]]) -> Void = { items in
    if rendu { return }
    rendu = true
    fini(items)
  }
  DispatchQueue.main.asyncAfter(deadline: .now() + DELAI_RELECTURE) { rendre([]) }
  _ = relecteur.demander(ns, range: NSRange(location: 0, length: ns.length),
    language: langue as NSString, options: [:]) { _, resultats in
    var items: [[String: Any]] = []
    for r in (resultats as? [NSTextCheckingResult]) ?? [] {
      guard r.resultType == .grammar else { continue }
      for d in r.grammarDetails ?? [] {
        guard let v = d["NSGrammarRange"] as? NSValue else { continue }
        let pl = v.rangeValue
        let abs = NSRange(location: r.range.location + pl.location, length: pl.length)
        guard abs.location >= 0, abs.location + abs.length <= ns.length, abs.length > 0 else { continue }
        // La relecture range les fautes d'orthographe parmi ses remarques de
        // grammaire. Sans ce reclassement, un mot mal ecrit serait souligne
        // comme un accord. La categorie systeme est en anglais, quelle que
        // soit la langue du texte ; celle montree a l'utilisateur, non.
        let genre = (d["NSGrammarSystemCategory"] as? String) == "Spelling" ? "spelling" : "grammar"
        items.append(["from": abs.location, "length": abs.length, "kind": genre,
          "word": ns.substring(with: abs),
          "replace": (d["NSGrammarCorrections"] as? [String]) ?? [],
          "message": (d["NSGrammarUserDescription"] as? String) ?? "",
          "category": (d["NSGrammarUserCategory"] as? String) ?? ""])
      }
    }
    DispatchQueue.main.async { rendre(items) }
  }
}

// Les deux moteurs reunis. La relecture prime : quand elle signale deja un
// passage, la faute d'orthographe qui s'y trouve ferait un double soulignement.
func verifier(_ brut: String, _ langue: String, _ fini: @escaping ([[String: Any]]) -> Void) {
  let texte = brut.count > TAILLE_MAX ? String(brut.prefix(TAILLE_MAX)) : brut
  guard texte.rangeOfCharacter(from: .letters) != nil else { fini([]); return }
  let orth = orthographe(texte, langue)
  relire(texte, langue) { revue in
    let couvert: (Int, Int) -> Bool = { de, longueur in
      revue.contains { g in
        let gd = g["from"] as! Int, gl = g["length"] as! Int
        return de < gd + gl && gd < de + longueur
      }
    }
    let restant = orth.filter { !couvert($0["from"] as! Int, $0["length"] as! Int) }
    fini((revue + restant).sorted { ($0["from"] as! Int) < ($1["from"] as! Int) })
  }
}

func repondre(_ o: [String: Any]) {
  if let d = try? JSONSerialization.data(withJSONObject: o), let s = String(data: d, encoding: .utf8) {
    print(s)
    fflush(stdout)
  }
}

func traiter(_ m: [String: Any]) {
  let id = m["id"] ?? NSNull()
  switch m["cmd"] as? String ?? "" {
  case "checkMany":
    let textes = m["texts"] as? [String] ?? []
    // La langue vient du reglage quand il en impose une, sinon de l'echantillon
    // que le greffon joint : toute la note, et non le paquet de lignes en cours.
    let imposee = (m["language"] as? String) ?? ""
    let echantillon = (m["sample"] as? String) ?? textes.joined(separator: " ")
    let langue = imposee.isEmpty ? langueDe(echantillon) : imposee
    var resultats = [[[String: Any]]](repeating: [], count: textes.count)
    let groupe = DispatchGroup()
    for (i, t) in textes.enumerated() {
      groupe.enter()
      verifier(t, langueLigne(t, langue)) { resultats[i] = $0; groupe.leave() }
    }
    groupe.notify(queue: .main) { repondre(["id": id, "results": resultats, "langue": langue]) }
  case "learn":
    verificateur.learnWord(m["word"] as? String ?? "")
    repondre(["id": id, "ok": true])
  case "ping":
    repondre(["id": id, "ok": true, "relecture": relectureDispo,
              "langues": verificateur.availableLanguages])
  default:
    repondre(["id": id, "erreur": "commande inconnue"])
  }
}

// L'entree standard est lue a part : le fil principal tient la boucle
// d'evenements, sans laquelle les reponses du modele de langue n'arrivent pas.
DispatchQueue.global(qos: .userInitiated).async {
  while let ligne = readLine() {
    guard let d = ligne.data(using: .utf8),
          let m = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { continue }
    DispatchQueue.main.async { traiter(m) }
  }
  DispatchQueue.main.async { exit(0) }
}
RunLoop.main.run()`;

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
  t = t.replace(/\|/g, correcteurBlanc);
  t = t.replace(/\*+|~~|==/g, correcteurBlanc);
  t = t.replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, correcteurBlanc);
  return t;
}

// Le réglage des zones exclues, tel que l'utilisateur l'écrit, une par ligne :
//   « %% ariane:biblio %% -> %% /ariane:biblio %% »  une paire de balises ;
//   « ## Bibliographie » ou « Bibliographie »        une section, jusqu'au
//                                                    titre de rang égal ou
//                                                    supérieur qui la suit.
// Rend { paires: [{debut, fin}], titres: [{texte, rang}] }.
function correcteurZonesExclues(reglage) {
  const paires = [];
  const titres = [];
  for (const brute of String(reglage || '').split('\n')) {
    const ligne = brute.trim();
    if (!ligne || ligne.startsWith('//')) continue;
    const coupe = ligne.split(/\s*(?:->|→)\s*/);
    if (coupe.length === 2 && coupe[0] && coupe[1]) {
      paires.push({ debut: coupe[0], fin: coupe[1] });
      continue;
    }
    const diese = /^(#{1,6})\s+(.*)$/.exec(ligne);
    titres.push(diese
      ? { texte: diese[2].trim().toLowerCase(), rang: diese[1].length }
      : { texte: ligne.toLowerCase(), rang: 0 });
  }
  return { paires, titres };
}

// Les lignes à vérifier d'un texte de note : [{ from, texte }], `from` étant
// la position absolue du début de la ligne, `texte` la ligne masquée. Sont
// ignorés : l'entête YAML, les blocs de code, les blocs de formule, les zones
// que l'utilisateur exclut, et les lignes sans deux lettres consécutives.
function correcteurBlocs(texte, zones) {
  const paires = (zones && zones.paires) || [];
  const titres = (zones && zones.titres) || [];
  const tableaux = !zones || zones.tableaux !== false;
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
  let clos = null;   // marque du bloc de code ou de formule en cours
  let exclu = null;  // zone exclue en cours : { fin } ou { rang }
  for (; i < lignes.length; i += 1) {
    const ligne = lignes[i];
    const debut = pos;
    pos += ligne.length + 1;
    const titre = /^(#{1,6})\s+(.*)$/.exec(ligne);
    if (exclu) {
      // Une paire se ferme sur sa balise ; une section, sur le titre suivant
      // de rang égal ou supérieur — celui qui la clôt est lui aussi relu.
      if (exclu.fin !== undefined) { if (ligne.trim() === exclu.fin) exclu = null; continue; }
      if (titre && titre[1].length <= exclu.rang) exclu = null;
      else continue;
    }
    const paire = paires.find((x) => ligne.trim() === x.debut);
    if (paire) { exclu = { fin: paire.fin }; continue; }
    if (titre && titres.some((t) => t.texte === titre[2].trim().toLowerCase() && (!t.rang || t.rang === titre[1].length))) {
      exclu = { rang: titre[1].length };
      continue;
    }
    // Une ligne de tableau : la barre en tête suffit à la reconnaître, c'est
    // ainsi qu'Obsidian les écrit. Un tableau bilingue ferait lire de
    // l'anglais à la note entière, et un tableau rendu n'accueille pas nos
    // soulignements : d'où le réglage qui, par défaut, les laisse de côté.
    if (!tableaux && /^\s*\|/.test(ligne)) continue;
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

// Le nom de la langue dans laquelle la note a été relue. Le volet l'affiche :
// une note relue dans la mauvaise langue produit des remarques absurdes, et
// c'est le premier endroit où l'on pense à regarder.
function correcteurNomLangue(code) {
  const noms = { fr: 'français', en: 'anglais', es: 'espagnol', de: 'allemand', it: 'italien', pt: 'portugais', nl: 'néerlandais' };
  const court = String(code || '').slice(0, 2).toLowerCase();
  return noms[court] || court;
}

//  Le démon : compilation, dialogue, redémarrage.

class AssistantApple {
  constructor(greffon) {
    this.greffon = greffon;
    this.enfant = null;
    this.numero = 0;
    this.attentes = new Map();
    this.pret = null;        // promesse du démarrage en cours
    this.indisponible = '';  // raison, quand le démon ne peut pas exister
    this.relecture = true;   // la relecture contextuelle répond (faux : orthographe seule)
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
          // Un salut d'emblée : le greffon saura dire, sans qu'on le lui
          // demande, si la relecture contextuelle manque à ce système.
          this.demander({ cmd: 'ping' }, 120000).then((r) => { this.relecture = !r || r.relecture !== false; });
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
  // La relecture appelle un modèle de langue : quelques secondes par ligne
  // inédite, rien du tout pour une ligne déjà vue. D'où la longue patience.
  async verifier(textes, echantillon, langue) {
    const msg = { cmd: 'checkMany', texts: textes };
    if (echantillon) msg.sample = echantillon;
    if (langue && langue !== 'auto') msg.language = langue;
    const r = await this.demander(msg, 120000);
    if (r && r.langue) this.derniereLangue = r.langue;
    return r && Array.isArray(r.results) ? r.results : null;
  }

  arreter() {
    if (this.enfant) { try { this.enfant.kill(); } catch (e) { /* déjà parti */ } }
    this.enfant = null;
  }
}

//  L'intégration : l'extension CodeMirror et la bulle de correction.

class CorrecteurApple extends obsidian.Component {
  //#region Correcteur · cycle de vie
  constructor(greffon) {
    super();
    this.greffon = greffon;
    this.assistant = new AssistantApple(greffon);
    this.cache = new Map();      // texte de ligne masqué → fautes
    this.ignores = new Set();    // fautes écartées pour cette session
    this.suivis = new Set();     // les vues d'éditeur qui nous écoutent
    this.guidee = new RelectureGuidee(this);
    this.abonnes = new Set();    // les volets à prévenir quand la liste change
    this._plainte = false;       // la relecture manquante n'est dite qu'une fois
  }

  onunload() { this.guidee.fermer(); this.assistant.arreter(); }

  //#endregion Correcteur · cycle de vie

  //#region Correcteur · volets ouverts
  // Force un tour de vérification sur une vue précise, sans attendre le délai.
  reveiller(vue) { for (const s of this.suivis) if (s.vue === vue) s.planifier(0); }

  // Vrai tant qu'un tour de relecture est en cours sur cette vue : le volet
  // dit « en cours » plutôt que d'annoncer à tort qu'il n'y a rien.
  occupeSur(vue) {
    for (const s of this.suivis) if (s.vue === vue) return s.occupe;
    return false;
  }

  // Ouvre le volet latéral, ou le ramène au premier plan s'il est déjà là.
  async ouvrirVolet() {
    const espace = this.greffon.app.workspace;
    const deja = espace.getLeavesOfType(TYPE_VUE_RELECTURE);
    if (deja.length) { espace.revealLeaf(deja[0]); return; }
    const feuille = espace.getRightLeaf(false);
    if (!feuille) return;
    await feuille.setViewState({ type: TYPE_VUE_RELECTURE, active: true });
    espace.revealLeaf(feuille);
  }

  // Prévient les volets ouverts que la liste des fautes a bougé.
  _prevenir() { for (const f of this.abonnes) { try { f(); } catch (e) { /* volet fermé */ } } }

  //#endregion Correcteur · volets ouverts

  //#region Correcteur · actions sur une faute
  // Amène la faute sous les yeux et la surligne le temps qu'on s'en occupe.
  // Le curseur va s'y poser : sans cela, rendre le focus à l'éditeur le
  // ramènerait aussitôt là où il était, et le défilement serait perdu.
  viser(vue, faute) {
    if (!this._viser) return;
    if (!faute) { vue.dispatch({ effects: [this._viser.of(null)] }); return; }
    vue.dispatch({
      selection: { anchor: faute.from },
      effects: [this._viser.of({ from: faute.from, to: faute.to }), this._scroller(faute.from, { y: 'center' })],
    });
  }

  // Applique la première proposition. Rend false si la faute n'en a pas.
  accepter(vue, faute) {
    if (!faute || !faute.replace.length) return false;
    vue.dispatch({
      changes: { from: faute.from, to: faute.to, insert: faute.replace[0] },
      effects: this._viser.of(null),
    });
    this._prevenir();
    return true;
  }

  // Écarte la remarque pour cette session, sans toucher au texte.
  ignorer(vue, faute) {
    if (!faute) return;
    this.ignores.add(correcteurCleIgnore(faute));
    vue.dispatch({ effects: this._poser.of(this.fautesDe(vue).filter((x) => x !== faute)) });
    this._prevenir();
  }

  // Toutes les corrections d'un coup. Les passages qui se chevauchent sont
  // écartés : deux remplacements sur le même texte se contrediraient.
  accepterTout(vue) {
    const changements = [];
    let fin = -1;
    for (const f of this.fautesDe(vue)) {
      if (!f.replace.length || f.from < fin) continue;
      changements.push({ from: f.from, to: f.to, insert: f.replace[0] });
      fin = f.to;
    }
    if (!changements.length) return 0;
    vue.dispatch({ changes: changements, effects: this._viser.of(null) });
    this._prevenir();
    return changements.length;
  }

  // Les fautes qu'une vue affiche en ce moment, dans l'ordre du texte.
  fautesDe(vue) {
    if (!this._champ) return [];
    const etat = vue.state.field(this._champ, false);
    return etat ? etat.fautes.slice().sort((a, b) => a.from - b.from) : [];
  }

  //#endregion Correcteur · actions sur une faute

  //#region Correcteur · réglages & vérification
  // Ce qui est demandé, d'après les réglages.
  genres() {
    const s = this.greffon.settings;
    return { grammar: s.correcteurGrammaire !== false, spelling: s.correcteurOrthographe === true };
  }

  // Les zones exclues, analysées une fois pour toutes tant que le réglage
  // ne bouge pas : la relecture les redemande à chaque frappe.
  zones() {
    const brut = this.greffon.settings.correcteurZonesExclues || '';
    if (this._zonesBrut !== brut) { this._zonesBrut = brut; this._zones = correcteurZonesExclues(brut); }
    return Object.assign({ tableaux: this.greffon.settings.correcteurTableaux === true }, this._zones);
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
  // `surLot` est appelé après chaque paquet, pour souligner au fur et à
  // mesure plutôt que d'attendre toute une note ; s'il rend false, on arrête.
  async _resoudre(blocs, surLot) {
    const manque = [];
    const vus = new Set();
    for (const b of blocs) {
      if (!this.cache.has(b.texte) && !vus.has(b.texte)) { vus.add(b.texte); manque.push(b.texte); }
    }
    // L'échantillon dit au système quelle langue il lit : la note entière,
    // et non le paquet de lignes en cours, dont une seule suffirait à l'égarer.
    const echantillon = blocs.map((b) => b.texte).join(' ').slice(0, 4000);
    const langue = this.greffon.settings.correcteurLangue || 'auto';
    for (let i = 0; i < manque.length; i += 12) {
      const lot = manque.slice(i, i + 12);
      const res = await this.assistant.verifier(lot, echantillon, langue);
      if (!res) return false;
      lot.forEach((t, k) => this.cache.set(t, res[k] || []));
      if (surLot && surLot() === false) return false;
    }
    if (this.cache.size > 4000) {
      for (const k of [...this.cache.keys()].slice(0, this.cache.size - 3000)) this.cache.delete(k);
    }
    return true;
  }

  //#endregion Correcteur · réglages & vérification

  //#region Correcteur · éditeur
  // L'extension à enregistrer auprès de l'éditeur, ou null hors Mac.
  extension() {
    if (!AssistantApple.disponible()) return null;
    const { StateField, StateEffect } = require('@codemirror/state');
    const { Decoration, EditorView, ViewPlugin, hoverTooltip } = require('@codemirror/view');
    const centre = this;
    const poser = StateEffect.define();
    const viser = StateEffect.define();
    const marque = { grammar: Decoration.mark({ class: 'zfa-corr-gram' }), spelling: Decoration.mark({ class: 'zfa-corr-orth' }) };
    const marqueVisee = Decoration.mark({ class: 'zfa-corr-visee' });

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

    // La faute que la relecture guidée examine : surlignée le temps qu'on
    // s'en occupe, pour la retrouver d'un coup d'oeil dans la page.
    const champVisee = StateField.define({
      create() { return Decoration.none; },
      update(deco, tr) {
        deco = deco.map(tr.changes);
        // Le curseur qui s'en va emporte le surlignage : il ne vaut que pour
        // la remarque qu'on examine. L'effet posé dans la même transaction
        // passe après, de sorte que viser une autre faute la surligne bien.
        if (tr.selection && deco.size) {
          const tete = tr.selection.main.head;
          let dedans = false;
          deco.between(0, tr.newDoc.length, (de, a) => { if (tete >= de && tete <= a) dedans = true; });
          if (!dedans) deco = Decoration.none;
        }
        for (const ef of tr.effects) {
          if (ef.is(viser)) {
            deco = ef.value && ef.value.to > ef.value.from
              ? Decoration.set([marqueVisee.range(ef.value.from, ef.value.to)])
              : Decoration.none;
          }
        }
        return deco;
      },
      provide: (f) => EditorView.decorations.from(f),
    });

    this._champ = champ;
    this._poser = poser;
    this._viser = viser;
    this._scroller = EditorView.scrollIntoView;

    const suivi = ViewPlugin.fromClass(class {
      constructor(vue) {
        this.vue = vue;
        this.minuteur = null;
        this.tour = 0;
        this.occupe = false;
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
        this.occupe = true;
        centre._prevenir();
        const vue = this.vue;
        if (!centre.actif()) {
          if (vue.state.field(champ).fautes.length) vue.dispatch({ effects: poser.of([]) });
          return;
        }
        const doc = vue.state.doc;
        const blocs = correcteurBlocs(doc.toString(), centre.zones());
        // Le texte a bougé pendant l'attente : un autre cycle est déjà prévu.
        const poserCourant = () => {
          if (tour !== this.tour || vue.state.doc !== doc) return false;
          vue.dispatch({ effects: poser.of(correcteurFautes(blocs, centre.cache, centre.ignores, centre.genres())) });
          centre._prevenir();
          if (!centre.assistant.relecture && !centre._plainte) {
            centre._plainte = true;
            new obsidian.Notice(tr("Correcteur Apple : ce système ne propose pas la relecture contextuelle. Seule l'orthographe sera signalée."), 12000);
          }
          return true;
        };
        try {
          if (await centre._resoudre(blocs, poserCourant) === false) return;
          poserCourant();
        } finally {
          if (tour === this.tour) { this.occupe = false; centre._prevenir(); }
        }
      }
    });

    const bulle = hoverTooltip((vue, pos) => {
      const f = vue.state.field(champ).fautes.find((x) => pos >= x.from && pos <= x.to);
      if (!f) return null;
      return {
        pos: f.from,
        end: f.to,
        above: true,
        // La coque que pose CodeMirror autour porte le fond, le liseré et
        // l'ombre des menus d'Obsidian ; styles.css la reconnaît à son
        // contenu, ce qui évite d'aller la marquer après coup.
        create: () => ({ dom: centre.construireBulle(vue, f) }),
      };
    }, { hideOnChange: true, hoverTime: 200 });

    return [champ, champVisee, suivi, bulle];
  }

  // La bulle : catégorie, explication, propositions, actions. Elle reprend
  // les teintes, les rayons et l'ombre des menus d'Obsidian, pour qu'elle
  // passe pour une fenêtre du logiciel et non pour une pièce rapportée.
  construireBulle(vue, faute) {
    const doc = vue.dom.ownerDocument;
    const el = (parent, tag, classe, texte) => {
      const e = doc.createElement(tag);
      if (classe) e.className = classe;
      if (texte) e.textContent = texte;
      parent.appendChild(e);
      return e;
    };
    const racine = doc.createElement('div');
    racine.className = 'zfa-corr-bulle';

    el(racine, 'div', 'zfa-corr-categorie',
      faute.category || (faute.kind === 'spelling' ? tr('Orthographe') : tr('Relecture')));
    // L'explication se lit vite une fois, puis encombre : elle se coupe.
    if (this.greffon.settings.correcteurExplication !== false) {
      el(racine, 'div', 'zfa-corr-texte', faute.message
        || (faute.kind === 'spelling' ? tr('Ce mot ne figure pas dans le dictionnaire.') : ''));
    }

    const rang = el(racine, 'div', 'zfa-corr-rang');
    faute.replace.slice(0, 4).forEach((r) => {
      const b = el(rang, 'button', 'zfa-corr-choix', r);
      canevasInfobulle(b, tr('Remplacer « ') + faute.word + tr(' » par « ') + r + ' »');
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        vue.dispatch({ changes: { from: faute.from, to: faute.to, insert: r } });
      });
    });
    if (!faute.replace.length) el(rang, 'span', 'zfa-corr-aucune', tr('Aucune proposition'));

    const actions = el(rang, 'div', 'zfa-corr-actions');
    const parcourir = el(actions, 'button', 'zfa-corr-action');
    obsidian.setIcon(parcourir, 'chevrons-right');
    canevasInfobulle(parcourir, tr('Reprendre la note à partir d’ici, faute après faute'));
    parcourir.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.guidee.ouvrir(vue, faute);
    });
    if (faute.kind === 'spelling') {
      const ajouter = el(actions, 'button', 'zfa-corr-action');
      obsidian.setIcon(ajouter, 'book-plus');
      canevasInfobulle(ajouter, tr('Ajouter « ') + faute.word + tr(' » au dictionnaire'));
      ajouter.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        await this.assistant.demander({ cmd: 'learn', word: faute.word });
        this.relancer(true);
      });
    }
    const ignorer = el(actions, 'button', 'zfa-corr-action');
    obsidian.setIcon(ignorer, 'x');
    canevasInfobulle(ignorer, tr('Ignorer cette remarque jusqu’à la prochaine session'));
    ignorer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.ignores.add(correcteurCleIgnore(faute));
      this.relancer(false);
    });
    return racine;
  }

  //#endregion Correcteur · éditeur
}

//  La relecture guidée : les fautes une par une, comme la fenêtre de Mail.

// Un panneau flottant posé près de la faute examinée. Il ne garde aucun état
// qui lui soit propre : les fautes restent dans l'éditeur, le panneau n'est
// qu'un curseur qui s'y promène. Une frappe qui efface une faute la retire
// donc aussi d'ici, sans rien à synchroniser.
class RelectureGuidee {
  constructor(centre) {
    this.centre = centre;
    this.vue = null;
    this.el = null;
    this.index = 0;
    this.session = 0;
  }

  _document() { return this.vue.dom.ownerDocument; }

  _fenetre() { return this._document().defaultView; }

  fautes() { return this.vue ? this.centre.fautesDe(this.vue) : []; }

  // Ouvre le panneau sur la vue donnée, à la première faute ou à celle qu'on
  // désigne. Si la note n'a pas encore été relue, le panneau patiente en le
  // disant, plutôt que d'annoncer « aucune faute ».
  async ouvrir(vue, depart) {
    if (!vue) return;
    this.fermer();
    if (!this.centre.actif()) {
      new obsidian.Notice(tr('Le correcteur Apple est désactivé dans les réglages.'));
      return;
    }
    const session = ++this.session;
    this.vue = vue;
    this.index = 0;
    this._construire();
    this.centre.reveiller(vue);
    const debut = Date.now();
    while (this.el && this.session === session && !this.fautes().length && Date.now() - debut < 120000) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!this.el || this.session !== session) return;
    const fautes = this.fautes();
    if (!fautes.length) {
      new obsidian.Notice(tr('Relecture : rien à signaler dans cette note.'));
      this.fermer();
      return;
    }
    if (depart) {
      const i = fautes.findIndex((f) => f.from === depart.from && f.to === depart.to);
      if (i >= 0) this.index = i;
    }
    this.afficher();
  }

  fermer() {
    this.session += 1;
    if (this._debrancher) { this._debrancher(); this._debrancher = null; }
    if (this.vue && this.centre._viser) {
      try { this.vue.dispatch({ effects: this.centre._viser.of(null) }); } catch (e) { /* vue partie */ }
    }
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = null;
    this.vue = null;
  }

  _construire() {
    const doc = this._document();
    const el = (parent, tag, classe, texte) => {
      const e = doc.createElement(tag);
      if (classe) e.className = classe;
      if (texte) e.textContent = texte;
      parent.appendChild(e);
      return e;
    };
    const racine = doc.createElement('div');
    racine.className = 'zfa-relecture';

    const tete = el(racine, 'div', 'zfa-relecture-tete');
    el(tete, 'span', 'zfa-relecture-titre', tr('Relecture'));
    this.elCompte = el(tete, 'span', 'zfa-relecture-compte', tr('en cours…'));
    const fermer = el(tete, 'button', 'zfa-relecture-icone');
    obsidian.setIcon(fermer, 'x');
    canevasInfobulle(fermer, tr('Fermer (Échap)'));
    fermer.addEventListener('click', () => this.fermer());

    const corps = el(racine, 'div', 'zfa-relecture-corps');
    el(corps, 'div', 'zfa-relecture-etiquette', tr('Original'));
    this.elMot = el(corps, 'div', 'zfa-relecture-mot', '…');
    this.elEtiquetteSug = el(corps, 'div', 'zfa-relecture-etiquette', tr('Suggestion'));
    this.elSuggestion = el(corps, 'div', 'zfa-relecture-suggestion');
    this.elTexte = el(corps, 'div', 'zfa-relecture-texte');

    const pied = el(racine, 'div', 'zfa-relecture-pied');
    const nav = el(pied, 'div', 'zfa-relecture-nav');
    const prec = el(nav, 'button', 'zfa-relecture-icone');
    obsidian.setIcon(prec, 'chevron-left');
    canevasInfobulle(prec, tr('Faute précédente (flèche gauche)'));
    prec.addEventListener('click', () => this.aller(-1));
    const suiv = el(nav, 'button', 'zfa-relecture-icone');
    obsidian.setIcon(suiv, 'chevron-right');
    canevasInfobulle(suiv, tr('Faute suivante (flèche droite)'));
    suiv.addEventListener('click', () => this.aller(1));
    const tout = el(nav, 'button', 'zfa-relecture-icone');
    obsidian.setIcon(tout, 'check-check');
    canevasInfobulle(tout, tr('Tout accepter'));
    tout.addEventListener('click', () => this.toutAccepter());

    const ignorer = el(pied, 'button', 'zfa-relecture-bouton', tr('Ignorer'));
    canevasInfobulle(ignorer, tr('Laisser ce passage tel quel'));
    ignorer.addEventListener('click', () => this.ignorer());
    this.elAccepter = el(pied, 'button', 'zfa-relecture-bouton mod-cta', tr('Accepter'));
    canevasInfobulle(this.elAccepter, tr('Appliquer la correction (Entrée)'));
    this.elAccepter.addEventListener('click', () => this.accepter());

    doc.body.appendChild(racine);
    this.el = racine;

    const fen = this._fenetre();
    const touche = (e) => {
      if (!this.el) return;
      const dans = this.el.contains(e.target);
      const editeur = this.vue && this.vue.dom.contains(e.target);
      if (!dans && !editeur) return;
      if (e.key === 'Escape') { e.preventDefault(); this.fermer(); return; }
      if (!dans) return; // dans le texte, les flèches et Entrée restent à l'écriture
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); this.aller(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); this.aller(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); this.accepter(); }
    };
    const replacer = () => this._placer();
    fen.addEventListener('keydown', touche, true);
    fen.addEventListener('resize', replacer);
    this.vue.scrollDOM.addEventListener('scroll', replacer);
    this._debrancher = () => {
      fen.removeEventListener('keydown', touche, true);
      fen.removeEventListener('resize', replacer);
      this.vue.scrollDOM.removeEventListener('scroll', replacer);
    };
    this.el.addEventListener('mousedown', (e) => {
      // Cliquer le panneau ne doit pas voler le curseur à l'éditeur.
      if (e.target.tagName !== 'BUTTON') e.preventDefault();
    });
  }

  aller(pas) {
    const n = this.fautes().length;
    if (!n) { this.fermer(); return; }
    this.index = ((this.index + pas) % n + n) % n;
    this.afficher();
  }

  // Met le panneau à jour sur la faute courante, et va la montrer dans le texte.
  afficher() {
    const fautes = this.fautes();
    if (!this.el) return;
    if (!fautes.length) {
      new obsidian.Notice(tr('Relecture terminée.'));
      this.fermer();
      return;
    }
    if (this.index >= fautes.length) this.index = fautes.length - 1;
    const f = fautes[this.index];
    this.elCompte.textContent = (this.index + 1) + tr(' sur ') + fautes.length;
    this.elMot.textContent = this.vue.state.doc.sliceString(f.from, f.to);
    const propose = f.replace[0] || '';
    this.elEtiquetteSug.style.display = propose ? '' : 'none';
    this.elSuggestion.textContent = '';
    if (propose) {
      const doc = this._document();
      const mot = doc.createElement('span');
      mot.className = 'zfa-relecture-mot-propose';
      mot.textContent = propose;
      this.elSuggestion.appendChild(mot);
      if (f.category) {
        const cat = doc.createElement('span');
        cat.className = 'zfa-relecture-cat';
        cat.textContent = ' (' + f.category + ')';
        this.elSuggestion.appendChild(cat);
      }
    }
    const explique = this.centre.greffon.settings.correcteurExplication !== false;
    this.elTexte.textContent = explique ? (f.message || '') : '';
    this.elAccepter.disabled = !propose;
    this.elAccepter.classList.toggle('est-inerte', !propose);

    this.centre.viser(this.vue, f);
    this._placer();
  }

  // Le panneau se pose sous la faute, ou au-dessus s'il déborderait.
  _placer() {
    if (!this.el || !this.vue) return;
    const fautes = this.fautes();
    const f = fautes[this.index];
    if (!f) return;
    let c = null;
    try { c = this.vue.coordsAtPos(f.from); } catch (e) { c = null; }
    const fen = this._fenetre();
    const marge = 8;
    const large = this.el.offsetWidth || 260;
    const haut = this.el.offsetHeight || 180;
    if (!c) {
      this.el.style.left = Math.max(marge, fen.innerWidth - large - 24) + 'px';
      this.el.style.top = Math.max(marge, fen.innerHeight - haut - 24) + 'px';
      return;
    }
    let x = c.left - 24;
    let y = c.bottom + marge;
    if (y + haut > fen.innerHeight - marge) y = Math.max(marge, c.top - haut - marge);
    x = Math.min(Math.max(marge, x), Math.max(marge, fen.innerWidth - large - marge));
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
  }

  accepter() {
    // La faute corrigée quitte la liste : l'index vise alors la suivante.
    if (this.centre.accepter(this.vue, this.fautes()[this.index])) this.afficher();
  }

  ignorer() {
    this.centre.ignorer(this.vue, this.fautes()[this.index]);
    this.afficher();
  }

  toutAccepter() {
    const n = this.centre.accepterTout(this.vue);
    if (n) new obsidian.Notice(n + tr(' correction(s) appliquée(s).'));
    this.fermer();
  }
}

//  Le volet de relecture : la même chose en fenêtre, à la manière de Word.

// Toutes les remarques d'un coup, rangées par nature, dans un volet latéral
// qui reste ouvert pendant qu'on écrit. Il ne détient rien non plus : il lit
// les fautes de l'éditeur actif et redessine quand elles changent.
class VueRelecture extends obsidian.ItemView {
  constructor(feuille, greffon) {
    super(feuille);
    this.greffon = greffon;
    this.derniereVue = null;
  }

  getViewType() { return TYPE_VUE_RELECTURE; }
  getDisplayText() { return tr('Relecture'); }
  getIcon() { return 'spell-check'; }

  async onOpen() {
    this.contentEl.addClass('zfa-rel-volet');
    this.majLiee = () => this.rafraichir();
    if (this.greffon.correcteur) this.greffon.correcteur.abonnes.add(this.majLiee);
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.majLiee));
    this.registerEvent(this.app.workspace.on('file-open', this.majLiee));
    this.rafraichir();
    const vue = this.editeur();
    if (vue && this.greffon.correcteur) this.greffon.correcteur.reveiller(vue);
  }

  async onClose() {
    if (this.greffon.correcteur) this.greffon.correcteur.abonnes.delete(this.majLiee);
  }

  // L'éditeur relu : celui qui a le focus, ou le dernier vu — car cliquer
  // dans le volet lui prend le focus, et l'éditeur n'est alors plus « actif ».
  editeur() {
    const active = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (active && active.editor && active.editor.cm) this.derniereVue = active.editor.cm;
    else if (this.derniereVue && this.derniereVue.dom && !this.derniereVue.dom.isConnected) this.derniereVue = null;
    return this.derniereVue;
  }

  _mot(parent, classe, texte) { return parent.createSpan({ cls: classe, text: texte }); }

  _rien(parent, texte) { parent.createDiv({ cls: 'zfa-rel-rien', text: texte }); }

  rafraichir() {
    const c = this.contentEl;
    c.empty();
    const correcteur = this.greffon.correcteur;
    if (!correcteur || !correcteur.actif()) { this._rien(c, tr('Le correcteur Apple est désactivé dans les réglages.')); return; }
    const vue = this.editeur();
    if (!vue) { this._rien(c, tr('Ouvrez une note pour la relire.')); return; }

    const fautes = correcteur.fautesDe(vue);
    const tete = c.createDiv({ cls: 'zfa-rel-tete' });
    tete.createSpan({
      cls: 'zfa-rel-compte',
      text: fautes.length ? fautes.length + tr(' remarque(s)') : (correcteur.occupeSur(vue) ? tr('Relecture en cours…') : tr('Rien à signaler')),
    });
    const langue = correcteur.assistant.derniereLangue;
    if (langue) {
      const el = tete.createSpan({ cls: 'zfa-rel-langue', text: correcteurNomLangue(langue) });
      canevasInfobulle(el, tr('Langue dans laquelle la note a été relue. Elle se règle dans les réglages du correcteur.'));
    }
    if (fautes.length) {
      const tout = tete.createEl('button', { cls: 'zfa-rel-tout', text: tr('Tout accepter') });
      canevasInfobulle(tout, tr('Appliquer toutes les corrections proposées'));
      tout.onclick = () => {
        const n = correcteur.accepterTout(vue);
        if (n) new obsidian.Notice(n + tr(' correction(s) appliquée(s).'));
      };
    }
    if (!fautes.length) {
      this._rien(c, correcteur.occupeSur(vue)
        ? tr('Le système relit la note. Les remarques apparaîtront ici.')
        : tr('Cette note ne soulève aucune remarque.'));
      return;
    }
    for (const [genre, titre] of [['grammar', tr('Grammaire')], ['spelling', tr('Orthographe')]]) {
      const lot = fautes.filter((f) => f.kind === genre);
      if (!lot.length) continue;
      c.createEl('h4', { cls: 'zfa-rel-groupe', text: titre + ' (' + lot.length + ')' });
      for (const f of lot) this._ligne(c, vue, f, correcteur);
    }
  }

  _ligne(parent, vue, faute, correcteur) {
    const ligne = parent.createDiv({ cls: 'zfa-rel-ligne zfa-rel-' + faute.kind });
    const mots = ligne.createDiv({ cls: 'zfa-rel-mots' });
    this._mot(mots, 'zfa-rel-avant', vue.state.doc.sliceString(faute.from, faute.to));
    if (faute.replace.length) {
      this._mot(mots, 'zfa-rel-fleche', '→');
      this._mot(mots, 'zfa-rel-apres', faute.replace[0]);
    }
    if (faute.category) ligne.createDiv({ cls: 'zfa-rel-cat', text: faute.category });
    if (faute.message && this.greffon.settings.correcteurExplication !== false) {
      ligne.createDiv({ cls: 'zfa-rel-texte', text: faute.message });
    }

    const actions = ligne.createDiv({ cls: 'zfa-rel-actions' });
    if (faute.replace.length) {
      const ok = actions.createEl('button', { cls: 'zfa-rel-bouton mod-cta', text: tr('Accepter') });
      ok.onclick = (e) => { e.stopPropagation(); correcteur.accepter(vue, faute); };
    }
    const non = actions.createEl('button', { cls: 'zfa-rel-bouton', text: tr('Ignorer') });
    non.onclick = (e) => { e.stopPropagation(); correcteur.ignorer(vue, faute); };
    const parcourir = actions.createEl('button', { cls: 'zfa-rel-icone' });
    obsidian.setIcon(parcourir, 'chevrons-right');
    canevasInfobulle(parcourir, tr('Reprendre la note à partir d’ici, faute après faute'));
    parcourir.onclick = (e) => { e.stopPropagation(); correcteur.guidee.ouvrir(vue, faute); };

    if (this.viseeDebut === faute.from) ligne.addClass('est-visee');
    // Cliquer la ligne va montrer le passage dans la note, sans rien changer.
    ligne.onclick = () => {
      this.viseeDebut = faute.from;
      correcteur.viser(vue, faute);
      vue.focus();
      for (const autre of Array.from(this.contentEl.querySelectorAll('.zfa-rel-ligne'))) autre.removeClass('est-visee');
      ligne.addClass('est-visee');
    };
  }
}

//#endregion 18 · Correcteur Apple

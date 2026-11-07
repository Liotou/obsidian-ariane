//#region 7 · Export Pandoc / Word
// ═══════════════════════════════════════════════════════════════════════════
//  7 · EXPORT PANDOC / WORD
//  Conversion du markdown Obsidian vers un markdown Pandoc : citations en
//  ligne, encadrés, notes de bas de page, insécables français.
// ═══════════════════════════════════════════════════════════════════════════

const ZFA_RE_CIT_GROUPE = /\((\s*\[\[[^[\]\n]+\]\](?:\s*;\s*\[\[[^[\]\n]+\]\])*\s*)\)/g;

// Les notes n'emploient plus de notes de bas de page mais des citations en
// ligne « ([[CLE|Auteur, année, p. 12]]) ». Sans conversion, pandoc n'y voit
// que du texte : c'est pourquoi le document sortait sans le moindre champ
// Zotero. On les rend ici sous la forme attendue par le filtre : « [@clé, p. 12] ».
function citationsEnLigneVersPandoc(texte, resoudre, connecteur) {
  return String(texte).replace(ZFA_RE_CIT_GROUPE, (tout, dedans) => {
    const cles = [...dedans.matchAll(/\[\[([^\]|#\n]+)(?:\|[^\]\n]*)?\]\]/g)].map((x) => cleDeLien(x[1]));
    const entrees = [];
    for (const c of cles) {
      const es = resoudre(c);
      if (es && es.length) for (const e of es) entrees.push(e);
    }
    if (!entrees.length) return tout;            // rien de reconnu : on n'abîme pas
    return '[' + rendreGrappe(entrees, connecteur).join('; ') + ']';
  });
}

// Citations narratives « [[clé|Ackoff (2006, p. 12)]] » -> « @cle [p. 12] »,
// la forme pandoc d'une citation dans le texte : Zotero y écrit l'auteur
// hors de la parenthèse. Une citation qui renvoie à plusieurs travaux, ou de
// seconde main, n'a pas d'équivalent simple : elle reste en texte.
function citationsNarrativesVersPandoc(texte, resoudre) {
  return String(texte).replace(/\[\[([^\]|#\n]+)\|([^\]\n]*)\]\]/g, (tout, cible, alias) => {
    if (!estLibelleNarratif(alias)) return tout;
    const es = resoudre(cleDeLien(cible)) || [];
    if (es.length !== 1 || !es[0]) return tout;
    const e = es[0];
    if (typeof e === 'string') return /^@\S+$/.test(e) ? e : tout;   // note source
    if (!e.cle || (e.travaux || []).length) return tout;
    const page = String(e.page || '').trim();
    return '@' + e.cle + (page ? ' [p. ' + page + ']' : '');
  });
}

// Intégrations « ![[note]] » : Obsidian affiche la note intégrée dans le
// texte, pandoc n'en voyait que le nom, précédé d'un « ! ». On les déplie
// donc avant tout le reste, pour que citations, encadrés et titres de la note
// intégrée suivent le même traitement que le texte qui l'accueille.
//   - « ![[note]] » : le corps de la note, sans propriétés, sans son titre
//     « # », sans la bibliographie d'Ariane (Zotero dresse la sienne) ni les
//     blocs que tient Ariane (sessions d'une tâche, etc.) ;
//   - « ![[note#Titre]] » : cette section seule ; « ![[note#^bloc]] » : ce
//     paragraphe seul ;
//   - « ![[image.png]] » : l'image, si lireImage la situe ;
//   - les titres de la note intégrée se rangent sous le titre qui précède
//     l'intégration : sous un « ### », son « ## » devient « #### ».
// lire(cible) -> texte de la note ou null ; lireImage(cible) -> chemin ou
// null. Les intégrations imbriquées sont dépliées à leur tour, sans boucle.
const ZFA_EXT_IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/i;

function sansBlocsAriane(texte) {
  return String(texte)
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/<!--\s*ariane:([\w-]+)\s*-->[\s\S]*?<!--\s*\/ariane:\1\s*-->\n?/g, '')
    .replace(/<span\b[^>]*\bclass="ann-[se]"[^>]*><\/span>/g, '')
    .replace(/(?:^[ \t]*-{3,}[ \t]*\n+)?%%\s*ariane:biblio\s*%%[\s\S]*?%%\s*\/ariane:biblio\s*%%/gm, '')
    .replace(/(?:^[ \t]*-{3,}[ \t]*\n+)?^#{1,6}[ \t]*Bibliographie[ \t]*$[\s\S]*?(?=^#{1,6}[ \t]|$(?![\s\S]))/gim, '');
}

function extraitIntegre(texte, ancre) {
  const lignes = String(texte).split('\n');
  if (!ancre) {
    // Le titre « # » de la note : l'intégration a déjà le sien.
    const i = lignes.findIndex((l) => l.trim());
    if (i >= 0 && /^#[ \t]+\S/.test(lignes[i])) lignes.splice(i, 1);
    return lignes.join('\n');
  }
  if (ancre.startsWith('^')) {
    const id = ancre.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\s\\^' + id + '\\s*$');
    const k = lignes.findIndex((l) => re.test(l));
    if (k < 0) return '';
    // Un élément de liste vaut seul ; un paragraphe remonte à sa première ligne.
    let a = k;
    if (!/^[ \t]*(?:[-*+]|\d+[.)])[ \t]/.test(lignes[k])) {
      while (a > 0 && lignes[a - 1].trim() && !/^#{1,6}[ \t]/.test(lignes[a - 1])) a--;
    }
    return lignes.slice(a, k + 1).join('\n').replace(re, '');
  }
  const norm = (t) => t.replace(/[\s#]+/g, ' ').trim().toLowerCase();
  const k = lignes.findIndex((l) => /^#{1,6}[ \t]/.test(l) && norm(l.replace(/^#+/, '')) === norm(ancre));
  if (k < 0) return '';
  const niveau = lignes[k].match(/^#+/)[0].length;
  let f = k + 1;
  while (f < lignes.length && !(/^#{1,6}[ \t]/.test(lignes[f]) && lignes[f].match(/^#+/)[0].length <= niveau)) f++;
  return lignes.slice(k + 1, f).join('\n');
}

// Range les titres d'un extrait sous un titre de niveau « base » (0 : aucun).
function titresSous(texte, base) {
  const niveaux = [...String(texte).matchAll(/^(#{1,6})[ \t]+\S/gm)].map((m) => m[1].length);
  if (!niveaux.length) return texte;
  const ecart = base + 1 - Math.min(...niveaux);
  return String(texte).replace(/^(#{1,6})(?=[ \t]+\S)/gm, (d) => '#'.repeat(Math.min(6, Math.max(1, d.length + ecart))));
}

async function deplierIntegrations(texte, lire, lireImage, profondeur, vus) {
  profondeur = profondeur || 0;
  vus = vus || new Set();
  const lignes = String(texte).split('\n');
  const out = [];
  let dansCode = false, base = 0;
  for (const l of lignes) {
    if (/^\s*(?:```|~~~)/.test(l)) dansCode = !dansCode;
    const t = !dansCode && l.match(/^(#{1,6})[ \t]+\S/);
    if (t) base = t[1].length;
    if (dansCode || !l.includes('![[')) { out.push(l); continue; }
    const morceaux = [];
    let reste = l, m;
    const re = /!\[\[([^\]\n]+)\]\]/;
    while ((m = reste.match(re))) {
      if (m.index) morceaux.push(reste.slice(0, m.index));
      const [lien, ...aliases] = m[1].split('|');
      const alias = aliases[0];
      const [cible, ...a] = lien.split('#');
      const ancre = a.join('#').trim();
      let rendu = '';
      if (ZFA_EXT_IMAGE.test(cible.trim())) {
        // La légende (ce qui n'est pas une largeur) devient le texte de
        // l'image : seule dans son paragraphe, pandoc en fait une figure
        // légendée, que la finition numérote.
        const chemin = lireImage ? await lireImage(cible.trim()) : null;
        const leg = aliases.map((x) => x.trim()).filter((x) => x && !/^\d+(x\d+)?$/.test(x)).join(' | ')
          .replace(/([[\]])/g, '\\$1');
        rendu = chemin ? '\n![' + leg + '](<' + chemin + '>)\n' : '';
      } else if (/\.\w{2,4}$/.test(cible.trim()) && !/\.md$/i.test(cible.trim())) {
        rendu = (alias || cible).trim();             // PDF, son… : leur nom
      } else {
        const cle = (cible.trim() + '#' + ancre).toLowerCase();
        const brut = profondeur < 6 && !vus.has(cle) ? await lire(cible.trim()) : null;
        if (brut == null) rendu = (alias || cible.split('/').pop()).trim();
        else {
          const v = new Set(vus); v.add(cle);
          let corps = extraitIntegre(sansBlocsAriane(brut), ancre);
          corps = await deplierIntegrations(corps, lire, lireImage, profondeur + 1, v);
          rendu = '\n' + titresSous(corps.trim(), base) + '\n';
        }
      }
      morceaux.push(rendu);
      reste = reste.slice(m.index + m[0].length);
    }
    if (reste) morceaux.push(reste);
    out.push(morceaux.join(''));
  }
  return out.join('\n');
}

// Prépare le markdown : citations, titres, encadrés, blocs à ne pas exporter.
function preparerMarkdownExport(contenu, resoudre, opts) {
  const o = opts || {};
  let s = String(contenu).replace(/^---\n[\s\S]*?\n---\n?/, '');

  // 1. Bibliographie d'Ariane : Zotero produira la sienne.
  s = s.replace(/%%\s*ariane:biblio\s*%%[\s\S]*?%%\s*\/ariane:biblio\s*%%/g, '');
  s = s.replace(/^\s*---\s*$\n+(?=#{1,6}\s*Bibliographie)/gim, '');
  // « \Z » n'existe pas en JavaScript : il y vaut la lettre Z, si bien que la
  // coupe s'arrêtait au premier Z rencontré. On vise la vraie fin de texte.
  s = s.replace(/^#{1,6}[ \t]*Bibliographie[ \t]*$[\s\S]*?(?=^#{1,6}[ \t]|$(?![\s\S]))/gim, '');

  // 1 bis. Blocs qu'Ariane tient dans la note (sessions d'une tâche…) : ce
  //    sont des relevés, non du texte.
  s = s.replace(/<!--\s*ariane:([\w-]+)\s*-->[\s\S]*?<!--\s*\/ariane:\1\s*-->\n?/g, '');
  // 1 bis bis. Les commentaires en marge (section 23) : des repères inertes
  //    pour l'instant, de vrais commentaires Word à la toute fin.
  const coms = reperesCommentaires(s, o.commentaires || 'tous');
  s = coms.texte;
  // 1 ter. Les filets « --- » : le modèle souligne déjà ses titres, et un
  //    filet de plus se dessinait en double trait. Hors tableaux.
  s = s.replace(/^[ \t]*(?:-[ \t]*){3,}$|^[ \t]*(?:\*[ \t]*){3,}$|^[ \t]*(?:_[ \t]*){3,}$/gm, '');

  // 2. Compteurs de travaux rapportés : ils n'ont pas de sens hors d'Obsidian.
  s = s.replace(/\s*⟨\d+⟩/g, '');

  // 3. Citations en ligne -> syntaxe du filtre Zotero.
  s = citationsEnLigneVersPandoc(s, resoudre, o.citeDans);
  s = citationsNarrativesVersPandoc(s, resoudre);

  // 4. Liens de source isolés « [[@clé]] » -> citation dans le texte.
  s = s.replace(/\[\[@([^\]|#\n]+)(?:\|[^\]\n]*)?\]\]/g, (t, cle) => '@' + cleDeLien(cle));

  // 4 bis. Les liens Obsidian qui restent ne sont pas des citations : on les
  //    aplatit pour un rendu propre dans Word.
  s = s
    .replace(/\[\[[^\]\n]*\|([^\]\n]+)\]\]/g, '$1')   // [[cible|alias]] -> alias
    .replace(/\[\[([^\]|#\n]+)\]\]/g,
      (m, t) => t.split('/').pop().replace(/^@/, '').trim());   // [[note]] -> nom

  // 5. Encadrés Obsidian -> bloc à style Word.
  s = encadresVersPandoc(s, o.styleEncadre || 'Items de réflexion');

  // 6. Titres : « # » est le titre du document, pas une partie. On décale d'un
  //    cran, et l'on retire la numérotation manuelle.
  if (o.decalerTitres !== false) {
    s = s.replace(/^(#{1,6})[ \t]+(.+?)[ \t]*$/gm, (t, diese, txt) => {
      const n = diese.length;
      // Un titre ne prend pas de point final (les points de suspension restent).
      const titre = (o.retirerNumerotation === false ? txt.trim() : titreSansNumerotation(txt)).replace(/([^.])\.$/, '$1');
      if (n === 1) return '';                    // titre global : porté par l'en-tête
      return '#'.repeat(Math.max(1, n - 1)) + ' ' + titre;
    });
  } else if (o.retirerNumerotation !== false) {
    s = s.replace(/^(#{1,6})[ \t]+(.+?)[ \t]*$/gm,
      (t, d, txt) => d + ' ' + titreSansNumerotation(txt));
  }

  // 7. Séparation des blocs : sans cela pandoc avale titres et listes.
  s = normaliserBlocsPandoc(s);

  // 8. Typographie française : les espaces devant la ponctuation double
  //    deviennent insécables, pour que Word ne les rejette pas en début de
  //    ligne.
  if (o.insecables !== false) s = insecablesFrancais(s);

  // 9. Les repères des commentaires deviennent des commentaires Word.
  s = commentairesVersPandoc(s, coms.liste, o);

  return s.replace(/\n{3,}/g, '\n\n').trim();
}

// Commentaires en marge -> vrais commentaires Word. Pandoc en écrit un pour
// chaque paire de spans « comment-start » (qui porte le texte, l'auteur, la
// date) et « comment-end », bornant le passage, même sur plusieurs
// paragraphes. Les balises sont d'abord réduites à des repères inertes, que
// les passes suivantes (citations, liens, titres, insécables) laissent en
// paix ; ils ne deviennent des spans qu'une fois le texte arrêté. Un repère
// dont le jumeau est tombé avec son bloc (titre « # », bibliographie)
// s'efface, plutôt que d'ouvrir un commentaire sans fin.
//
// mode : 'tous', 'ouverts' (sans les résolus) ou 'aucun'.
const COM_REPERE = /([se])(\d+)/g;

function reperesCommentaires(texte, mode) {
  const liste = [];
  const poses = [];
  if (mode !== 'aucun') {
    for (const c of CommentairesMarge.lire(texte)) {
      if (mode === 'ouverts' && c.resolu) continue;
      const n = liste.push(c) - 1;
      poses.push({ from: c.debut.from, to: c.debut.to, par: 's' + n + '' });
      poses.push({ from: c.fin.from, to: c.fin.to, par: 'e' + n + '' });
    }
  }
  let s = String(texte);
  for (const p of poses.sort((a, b) => b.from - a.from)) s = s.slice(0, p.from) + p.par + s.slice(p.to);
  // Ce qui reste : commentaires écartés, balises orphelines.
  s = s.replace(/<span\b[^>]*\bclass="ann-[se]"[^>]*><\/span>/g, '');
  return { texte: s, liste };
}

// Le texte d'un commentaire, en markdown inerte : liens aplatis, symboles
// échappés (un « @ » ferait une citation, un crochet romprait le span), une
// ligne par saut de ligne.
function texteCommentaireWord(t, insecables) {
  let s = String(t || '')
    .replace(/\[\[[^\]\n]*\|([^\]\n]+)\]\]/g, '$1')
    .replace(/\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?\]\]/g, (m, x) => x.split('/').pop().replace(/^@/, '').trim());
  if (insecables) s = insecablesFrancais(s);
  return s.split(/\s*\n\s*/).filter(Boolean)
    .map((l) => l.replace(/[\\`*_[\]{}<>$@^~#|]/g, '\\$&'))
    .join('\\\n');
}

// « AAAA-MM-JJ HH:mm » -> date Word. Word écrit l'heure locale suivie d'un
// « Z » : on fait de même, pour que l'heure lue soit celle de la carte.
function dateCommentaireWord(h) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(String(h || '').trim());
  return m ? m[1] + 'T' + m[2] + ':00Z' : '';
}

// Remplace les repères par les spans de pandoc. Les réponses deviennent des
// commentaires sur le même passage, juste après celui qu'elles suivent ; la
// finition (finition.py --fils) les rattache ensuite en fil de discussion.
// o.fils, s'il est donné, reçoit pour chaque commentaire écrit { id, parent,
// fait } : parent est l'id du commentaire d'origine, fait vaut pour résolu.
function commentairesVersPandoc(texte, liste, opts) {
  const o = opts || {};
  const vus = { s: new Set(), e: new Set() };
  for (const m of String(texte).matchAll(COM_REPERE)) vus[m[1]].add(m[2]);
  const attr = (v) => '"' + String(v).replace(/[\\"]/g, '\\$&') + '"';
  const auteurDefaut = o.auteurCommentaires || '';
  let suivant = 0;
  const ids = new Map();               // rang du commentaire -> ids Word (lui, puis ses réponses)
  const idsDe = (n) => {
    if (!ids.has(n)) {
      const c = liste[n];
      const fil = [c].concat(c.reponses.map((r) => ({ note: r.texte, auteur: r.auteur, heure: r.heure })));
      const v = fil.map((x) => ({ x, id: suivant++ }));
      for (const e of v) {
        if (o.fils) o.fils.push({ id: e.id, parent: e === v[0] ? null : v[0].id, fait: !!c.resolu });
      }
      ids.set(n, v);
    }
    return ids.get(n);
  };
  return String(texte).replace(COM_REPERE, (t, k, n) => {
    if (!liste[n] || !vus.s.has(n) || !vus.e.has(n)) return '';
    const fil = idsDe(n);
    if (k === 'e') return fil.map((e) => '[]{.comment-end id="' + e.id + '"}').join('');
    return fil.map(({ x, id }) => {
      const date = dateCommentaireWord(x.heure);
      return '[' + texteCommentaireWord(x.note, o.insecables !== false) + ']{.comment-start id="' + id + '"'
        + ' author=' + attr(x.auteur || auteurDefaut) + (date ? ' date=' + attr(date) : '') + '}';
    }).join('');
  });
}

// Deux écarts entre Obsidian et pandoc, tous deux dus aux lignes vides que
// que l'on n'écrit pas toujours :
//   - pandoc exige une ligne vide AVANT un titre, une liste, une citation, un
//     tableau ou un bloc « ::: » ; sans elle, il rattache la ligne au
//     paragraphe précédent et les dièses s'affichent en clair ;
//   - pandoc réunit en UN paragraphe des lignes consécutives, là où Obsidian
//     en fait autant de paragraphes. Le saut de paragraphe se perdait, et les
//     amorces en gras qui servent de sous-titres se noyaient dans des blocs
//     de plusieurs milliers de caractères.
// On pose donc les lignes vides manquantes, dans les deux cas.
function normaliserBlocsPandoc(texte) {
  const vide = (l) => !String(l || '').trim();
  const estTitre = (l) => /^#{1,6}[ \t]+\S/.test(l);
  const estListe = (l) => /^[ \t]*(?:[-*+][ \t]+|\d+[.)][ \t]+)\S/.test(l);
  const estCitation = (l) => /^[ \t]*>/.test(l);
  const estDiv = (l) => /^[ \t]*:::/.test(l);
  const estTableau = (l) => /^[ \t]*\|/.test(l);
  const estCloture = (l) => /^[ \t]*(?:```|~~~)/.test(l);

  const lignes = String(texte).split('\n');
  const out = [];
  let dansCode = false;
  for (const l of lignes) {
    if (estCloture(l)) { dansCode = !dansCode; out.push(l); continue; }
    if (dansCode) { out.push(l); continue; }
    const prec = out.length ? out[out.length - 1] : '';
    // Une ligne de texte ordinaire : ni titre, ni liste, ni tableau, ni
    // citation, ni bloc, et sans retrait — un retrait signale la suite d'un
    // élément de liste, qu'il ne faut pas couper.
    const estTexte = (x) => !vide(x) && !estTitre(x) && !estListe(x)
      && !estCitation(x) && !estDiv(x) && !estTableau(x) && !estCloture(x)
      && !/^[ \t]/.test(x);
    const manque =
      (estTitre(l) && !vide(prec)) ||
      (estListe(l) && !vide(prec) && !estListe(prec)) ||
      (estCitation(l) && !vide(prec) && !estCitation(prec)) ||
      (estDiv(l) && !vide(prec)) ||
      (estTableau(l) && !vide(prec) && !estTableau(prec)) ||
      (estTexte(l) && !vide(prec) && !estTitre(prec) && !estDiv(prec));
    if (manque && out.length) out.push('');
    out.push(l);
  }
  // Un titre veut aussi une ligne vide derrière lui.
  const final = [];
  for (let i = 0; i < out.length; i++) {
    final.push(out[i]);
    if (estTitre(out[i]) && !vide(out[i + 1])) final.push('');
  }
  return final.join('\n');
}

// Typographie française. On ne fait que RENDRE INSÉCABLE une espace déjà
// présente ; on n'en ajoute jamais. Ajouter une espace devant un « : » nu
// abîmerait les adresses (« https://… »), les heures (« 14:30 ») et les
// attributs pandoc (« custom-style="…" »), qui n'en ont pas.
//
// Les grappes de citation sont laissées telles quelles : Zotero les réécrit à
// l'actualisation, et le « ; » y sépare les références.
function insecablesFrancais(texte) {
  const NB = '\u00a0';                       // espace insécable
  const lignes = String(texte).split('\n');
  let dansCode = false;
  const sortie = lignes.map((l) => {
    if (/^\s*(?:```|~~~)/.test(l)) { dansCode = !dansCode; return l; }
    if (dansCode) return l;
    if (/^\s*:::/.test(l)) return l;          // délimiteur de bloc pandoc
    if (/^\s*\|[\s|:-]*\|\s*$/.test(l)) return l; // ligne de séparation de tableau
    // split avec groupe capturant : les crochets tombent aux rangs impairs.
    return l.split(/(\[[^\]\n]*\])/).map((bout, i) => (i % 2 ? bout : bout
      // Guillemets droits appariés -> guillemets français. Pas ceux d'un
      // attribut (« ="…" »), ni ceux qui encadrent une balise.
      .replace(/(^|[^=\w])"([^"\n<>=]+)"/g, (t, av, dedans) => av + '«' + NB + dedans.trim() + NB + '»')
      .replace(/ +([;:!?»])/g, NB + '$1')
      .replace(/(«) +/g, '$1' + NB))).join('');
  });
  return sortie.join('\n');
}

// Marques encadrant une mise en avant dans le markdown intermédiaire. La
// finition les retrouve dans le document produit, en tire le titre, et
// remplace le tout par le gabarit d'encadré du modèle. On ne peut pas se fier
// aux styles : pandoc donne aux éléments de liste le style de liste, non celui
// du bloc, et un encadré à puces échapperait à toute détection par le style.
const MARQUE_ENCADRE_DEBUT = '\u27E6ariane:encadre\u27E7';
const MARQUE_ENCADRE_FIN = '\u27E6/ariane:encadre\u27E7';

// « > [!info] Titre » devient un bloc pandoc à style Word, borné par les deux
// marques ci-dessus. Sans gabarit d'encadré dans le modèle, la finition se
// borne à retirer les marques : le bloc reste stylé, ce qui reste lisible.
function encadresVersPandoc(texte, style) {
  const lignes = String(texte).split('\n');
  const out = [];
  let i = 0;
  while (i < lignes.length) {
    const m = lignes[i].match(/^>\s*\[!(\w+)\][-+]?\s*(.*)$/);
    if (!m) { out.push(lignes[i]); i++; continue; }
    const titre = m[2].trim();
    const corps = [];
    i++;
    while (i < lignes.length && /^>/.test(lignes[i])) {
      corps.push(lignes[i].replace(/^>\s?/, ''));
      i++;
    }
    out.push('::: {custom-style="' + style + '"}');
    out.push(MARQUE_ENCADRE_DEBUT + titre);
    out.push('');
    for (const l of corps) out.push(l);
    out.push('');
    out.push(MARQUE_ENCADRE_FIN);
    out.push(':::');
    out.push('');
  }
  return out.join('\n');
}

// Transforme les notes de bas de page « annotations » d'un Markdown Obsidian
// en citations Pandoc [@citekey, p. XX; ...]. resoudre(cible) -> {citekey,page}|null.
// Les notes de bas de page de texte libre sont conservées telles quelles.
function footnotesVersCitations(contenu, resoudre, connecteur) {
  let s = String(contenu).replace(/^---\n[\s\S]*?\n---\n?/, ''); // retire le frontmatter
  const lignes = s.split('\n');
  const defs = {};              // label -> cluster Pandoc
  const aRetirer = new Set();   // indices de lignes de définition (citations) à retirer
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(/^\[\^([^\]]+)\]:(.*)$/);
    if (!m) continue;
    const label = m[1];
    let j = i + 1;
    const corps = [m[2]];
    while (j < lignes.length && /^[ \t]+\S/.test(lignes[j])) { corps.push(lignes[j]); j++; }
    const texte = corps.join('\n');
    const cibles = [...texte.matchAll(/\[\[([^\]|#\n]+)(?:\|[^\]\n]*)?\]\]/g)].map((x) => cleDeLien(x[1]));
    const entrees = [];
    for (const c of cibles) {
      const es = resoudre(c);
      if (es && es.length) for (const e of es) entrees.push(e);
    }
    if (entrees.length) {
      defs[label] = '[' + rendreGrappe(entrees, connecteur).join('; ') + ']';
      for (let k = i; k < j; k++) aRetirer.add(k);
    }
    i = j - 1;
  }
  // Retire le titre de section « Annotations de lecture associées » et son séparateur ---.
  for (let i = 0; i < lignes.length; i++) {
    if (!/^\*\*Annotations de lecture associées\*\*\s*$/.test(lignes[i])) continue;
    aRetirer.add(i);
    let k = i - 1;
    while (k >= 0 && lignes[k].trim() === '') { aRetirer.add(k); k--; }
    if (k >= 0 && /^-{3,}\s*$/.test(lignes[k])) aRetirer.add(k);
  }
  const sortie = [];
  for (let i = 0; i < lignes.length; i++) {
    if (aRetirer.has(i)) continue;
    const l = lignes[i].replace(/\[\^([^\]\s]+)\]/g, (full, lab) => (defs[lab] || full));
    sortie.push(l);
  }
  const texte = sortie.join('\n');
  // Les liens Obsidian ne sont PAS aplatis ici : une citation en ligne s'écrit
  // ([[CLE|Poirier, 2010, p. 5]]), et l'aplatir à cet endroit la réduisait à du
  // texte mort avant que preparerMarkdownExport n'ait pu la convertir en champ
  // Zotero. L'aplatissement a lieu là-bas, une fois les citations converties.
  return texte.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

//#endregion 7 · Export Pandoc / Word


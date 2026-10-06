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

  // 2. Compteurs de travaux rapportés : ils n'ont pas de sens hors d'Obsidian.
  s = s.replace(/\s*⟨\d+⟩/g, '');

  // 3. Citations en ligne -> syntaxe du filtre Zotero.
  s = citationsEnLigneVersPandoc(s, resoudre, o.citeDans);

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
      const titre = o.retirerNumerotation === false ? txt.trim() : titreSansNumerotation(txt);
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

  return s.replace(/\n{3,}/g, '\n\n').trim();
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
  // ([[CLE|Power, 2010, p. 5]]), et l'aplatir à cet endroit la réduisait à du
  // texte mort avant que preparerMarkdownExport n'ait pu la convertir en champ
  // Zotero. L'aplatissement a lieu là-bas, une fois les citations converties.
  return texte.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

//#endregion 7 · Export Pandoc / Word


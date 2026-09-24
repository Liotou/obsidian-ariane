//#region 21 · Barre d'édition
// ═══════════════════════════════════════════════════════════════════════════
//  21 · BARRE D'ÉDITION
//  Une barre de mise en forme par volet de note, posée SOUS la barre
//  d'onglets et AU-DESSUS du titre : elle appartient au volet, pas à la
//  fenêtre. Un volet détaché a donc la sienne, dans son propre document, et
//  rien ne flotte par-dessus le texte.
//
//  Trois pièces :
//    · des fonctions pures « barreXxx » : toute la transformation de texte
//      (titres, entourages, lignes, tableaux, typographie). Elles ne
//      connaissent ni Obsidian ni le DOM, et la suite de tests les éprouve.
//    · des commandes Ariane qui les appliquent à l'éditeur. Elles sont dans
//      la palette comme les autres : la barre n'est qu'un raccourci vers
//      elles.
//    · BarreEdition (le chef d'orchestre, une par greffon) et BarreOutils
//      (une par volet), qui dessinent des boutons à partir d'une simple
//      liste d'identifiants de commande.
//
//  D'où la règle : un bouton de la barre n'exécute JAMAIS de code à lui. Il
//  appelle une commande, la nôtre ou celle d'Obsidian, ou celle d'un autre
//  greffon. Tout ce qui est dans la palette peut donc aller dans la barre,
//  et tout ce qui est dans la barre garde un raccourci clavier possible.
// ═══════════════════════════════════════════════════════════════════════════

// ── Fonctions pures : entourages, titres, lignes ─────────────────────────

// Entoure, ou retire l'entourage s'il est déjà là. Le pivot de la moitié des
// boutons : gras, italique, surlignage, exposant, code…
function barreEntourer(texte, avant, apres) {
  const a = String(avant || '');
  const b = apres === undefined || apres === null ? a : String(apres);
  const t = String(texte === undefined || texte === null ? '' : texte);
  if (a && t.length >= a.length + b.length && t.startsWith(a) && t.endsWith(b)) {
    return t.slice(a.length, t.length - b.length);
  }
  return a + t + b;
}

// Bascule un niveau de titre sur une ligne. Repasser le même niveau enlève le
// titre ; niveau 0 l'enlève toujours.
function barreTitreLigne(ligne, niveau) {
  const l = String(ligne || '');
  const m = /^(\s*)(#{1,6})[ \t]+(.*)$/.exec(l);
  const indent = m ? m[1] : (/^\s*/.exec(l) || [''])[0];
  const corps = m ? m[3] : l.slice(indent.length);
  const n = Math.max(0, Math.min(6, Number(niveau) || 0));
  if (!n || (m && m[2].length === n)) return indent + corps;
  return indent + '#'.repeat(n) + ' ' + corps;
}

// Bascule la citation « > » sur une ligne, en gardant l'indentation.
function barreCitationLigne(ligne) {
  const l = String(ligne || '');
  const indent = (/^\s*/.exec(l) || [''])[0];
  const corps = l.slice(indent.length);
  if (/^>\s?/.test(corps)) return indent + corps.replace(/^>\s?/, '');
  return indent + '> ' + corps;
}

// Les marqueurs de liste reconnus, dans l'ordre où on les cherche.
const BARRE_PUCE = /^(\s*)([-*+])[ \t]+(\[[ xX/-]\][ \t]+)?/;
const BARRE_NUMERO = /^(\s*)(\d+)([.)])[ \t]+(\[[ xX/-]\][ \t]+)?/;

// Décompose une ligne de liste : indentation, marqueur, coche, texte.
function barreLireLigneListe(ligne) {
  const l = String(ligne || '');
  let m = BARRE_PUCE.exec(l);
  if (m) {
    return { indent: m[1], genre: 'puce', marque: m[2], coche: m[3] || '', texte: l.slice(m[0].length) };
  }
  m = BARRE_NUMERO.exec(l);
  if (m) {
    return { indent: m[1], genre: 'numero', marque: m[2] + m[3], coche: m[4] || '',
             texte: l.slice(m[0].length) };
  }
  const indent = (/^\s*/.exec(l) || [''])[0];
  return { indent, genre: '', marque: '', coche: '', texte: l.slice(indent.length) };
}

// Fait tourner une ligne : texte simple → puce → case à cocher → texte simple.
// C'est le geste le plus courant sur une liste, et il tient en un bouton.
function barreCyclerListe(ligne) {
  const p = barreLireLigneListe(ligne);
  if (!p.texte && !p.genre) return String(ligne || '');
  if (!p.genre) return p.indent + '- ' + p.texte;
  if (p.genre === 'puce' && !p.coche) return p.indent + '- [ ] ' + p.texte;
  return p.indent + p.texte;
}

// Renumérote les listes ordonnées d'un texte, niveau d'indentation par niveau
// d'indentation. Une ligne qui n'est pas une liste remet les compteurs à zéro
// pour les niveaux plus profonds : deux listes séparées par un paragraphe ne
// se suivent pas.
function barreRenumeroter(texte, depart) {
  const lignes = String(texte === undefined || texte === null ? '' : texte).split('\n');
  const debut = Number.isFinite(Number(depart)) ? Number(depart) : 1;
  const compteurs = new Map();
  return lignes.map((l) => {
    const p = barreLireLigneListe(l);
    if (p.genre !== 'numero') {
      if (!l.trim()) compteurs.clear();
      return l;
    }
    const prof = p.indent.replace(/\t/g, '    ').length;
    for (const cle of Array.from(compteurs.keys())) if (cle > prof) compteurs.delete(cle);
    const n = compteurs.has(prof) ? compteurs.get(prof) + 1 : debut;
    compteurs.set(prof, n);
    const sep = p.marque.slice(-1);
    return p.indent + n + sep + ' ' + p.coche + p.texte;
  }).join('\n');
}

// ── Fonctions pures : opérations sur les lignes ──────────────────────────

// Intercale une ligne vide entre deux lignes non vides ; ou retire toutes les
// lignes vides. Deux gestes symétriques, un seul point d'entrée.
function barreLignesVides(texte, mode) {
  const lignes = String(texte === undefined || texte === null ? '' : texte).split('\n');
  if (mode === 'retirer') return lignes.filter((l) => l.trim() !== '').join('\n');
  const sortie = [];
  for (const l of lignes) {
    if (sortie.length && sortie[sortie.length - 1].trim() !== '' && l.trim() !== '') sortie.push('');
    sortie.push(l);
  }
  return sortie.join('\n');
}

// Coupe chaque ligne sur un séparateur ; le séparateur vide coupe sur les
// espaces. Les morceaux vides disparaissent.
function barreScinderLignes(texte, separateur) {
  const sep = String(separateur === undefined || separateur === null ? '' : separateur);
  return String(texte === undefined || texte === null ? '' : texte).split('\n')
    .map((l) => (sep ? l.split(sep) : l.split(/\s+/)))
    .reduce((acc, bouts) => acc.concat(bouts), [])
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .join('\n');
}

// Recolle les lignes avec un liant. Les lignes vides séparent des paragraphes
// et sont conservées comme telles : on recolle DANS les paragraphes.
function barreFusionnerLignes(texte, liant) {
  const l = liant === undefined || liant === null ? ' ' : String(liant);
  const paragraphes = String(texte === undefined || texte === null ? '' : texte).split(/\n\s*\n/);
  return paragraphes
    .map((p) => p.split('\n').map((x) => x.trim()).filter((x) => x !== '').join(l))
    .join('\n\n');
}

// Retire les lignes déjà vues, en gardant la première occurrence et l'ordre.
function barreDedoublonnerLignes(texte) {
  const vues = new Set();
  const sortie = [];
  for (const l of String(texte === undefined || texte === null ? '' : texte).split('\n')) {
    const cle = l.trim();
    if (cle !== '' && vues.has(cle)) continue;
    if (cle !== '') vues.add(cle);
    sortie.push(l);
  }
  return sortie.join('\n');
}

// Pose un préfixe et un suffixe sur chaque ligne non vide.
function barreEnvelopperLignes(texte, prefixe, suffixe) {
  const p = String(prefixe === undefined || prefixe === null ? '' : prefixe);
  const s = String(suffixe === undefined || suffixe === null ? '' : suffixe);
  return String(texte === undefined || texte === null ? '' : texte).split('\n')
    .map((l) => (l.trim() === '' ? l : p + l + s)).join('\n');
}

// Numérote les lignes non vides selon un gabarit. « {n} » est le numéro,
// « {t} » le texte de la ligne ; sans « {t} », le gabarit se met devant.
function barreNumeroterLignes(texte, gabarit, depart) {
  const g = String(gabarit === undefined || gabarit === null || gabarit === '' ? '{n}. ' : gabarit);
  let n = Number.isFinite(Number(depart)) ? Number(depart) : 1;
  return String(texte === undefined || texte === null ? '' : texte).split('\n').map((l) => {
    if (l.trim() === '') return l;
    const rendu = g.replace(/\{n\}/g, String(n));
    n += 1;
    return rendu.indexOf('{t}') >= 0 ? rendu.replace(/\{t\}/g, l) : rendu + l;
  }).join('\n');
}

// Trois façons de reprendre les espaces : les bouts de ligne, les suites
// d'espaces, ou tous les espaces sans exception.
function barreEspaces(texte, mode) {
  const t = String(texte === undefined || texte === null ? '' : texte);
  if (mode === 'tout') return t.split('\n').map((l) => l.replace(/[ \t  ]/g, '')).join('\n');
  if (mode === 'compresser') {
    return t.split('\n').map((l) => {
      const indent = (/^[ \t]*/.exec(l) || [''])[0];
      return indent + l.slice(indent.length).replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/, '');
    }).join('\n');
  }
  return t.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n');
}

// Trie les lignes non vides. Le tri suit l'alphabet français (accents à leur
// place), et les lignes vides restent où elles sont : elles bornent des blocs.
function barreTrierLignes(texte, sens) {
  const lignes = String(texte === undefined || texte === null ? '' : texte).split('\n');
  const pleines = lignes.filter((l) => l.trim() !== '');
  const collator = typeof Intl !== 'undefined' && Intl.Collator
    ? new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })
    : null;
  pleines.sort((a, b) => (collator ? collator.compare(a.trim(), b.trim())
                                   : a.trim().localeCompare(b.trim())));
  if (sens === 'descendant') pleines.reverse();
  let i = 0;
  return lignes.map((l) => (l.trim() === '' ? l : pleines[i++])).join('\n');
}

// ── Fonctions pures : casse et typographie ───────────────────────────────

// Quatre casses. « phrase » ne touche qu'à la première lettre de chaque
// phrase ; « capitales » met une majuscule à chaque mot, sauf aux mots outils
// français, parce que « Le Chien De La Voisine » n'est pas du français.
const BARRE_MOTS_OUTILS = new Set([
  'a', 'à', 'au', 'aux', 'de', 'des', 'du', 'd', 'en', 'et', 'l', 'la', 'le', 'les',
  'ou', 'où', 'par', 'pour', 'sur', 'un', 'une', 'dans', 'chez', 'sans', 'sous',
]);

function barreCasse(texte, mode) {
  const t = String(texte === undefined || texte === null ? '' : texte);
  if (mode === 'majuscules') return t.toLocaleUpperCase('fr');
  if (mode === 'minuscules') return t.toLocaleLowerCase('fr');
  if (mode === 'capitales') {
    let premier = true;
    return t.replace(/[\p{L}\p{M}'’-]+/gu, (mot) => {
      const bas = mot.toLocaleLowerCase('fr');
      const garder = !premier && BARRE_MOTS_OUTILS.has(bas.replace(/[’']/g, ''));
      premier = false;
      if (garder) return bas;
      return bas.charAt(0).toLocaleUpperCase('fr') + bas.slice(1);
    });
  }
  // Casse de phrase : tout en bas, puis une majuscule après un point final.
  const bas = t.toLocaleLowerCase('fr');
  return bas.replace(/(^|[.!?…]\s+|\n\s*)(\p{Ll})/gu,
    (_, avant, lettre) => avant + lettre.toLocaleUpperCase('fr'));
}

// Fait tourner la casse : minuscules → MAJUSCULES → Capitales → minuscules.
// Un seul bouton pour les trois, comme le cyclage de liste.
function barreCasseSuivante(texte) {
  const t = String(texte === undefined || texte === null ? '' : texte);
  const lettres = t.replace(/[^\p{L}]/gu, '');
  if (!lettres) return 'minuscules';
  if (lettres === lettres.toLocaleLowerCase('fr')) return 'majuscules';
  if (lettres === lettres.toLocaleUpperCase('fr')) return 'capitales';
  return 'minuscules';
}

// Découpe un texte en tranches « à traiter » et « à laisser tranquille » :
// code en ligne, blocs de code, URL, liens, balises, maths. Toute passe
// typographique s'appuie dessus, sinon elle abîme une URL ou un bout de code.
function barreTranchesTypo(texte) {
  const t = String(texte === undefined || texte === null ? '' : texte);
  const gardes = /(```[\s\S]*?```|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]*\$|<[^>\n]+>|\[\[[^\]]*\]\]|\]\([^)\s]*\)|https?:\/\/\S+|\bwww\.\S+)/g;
  const tranches = [];
  let dernier = 0;
  let m = gardes.exec(t);
  while (m) {
    if (m.index > dernier) tranches.push({ garde: false, texte: t.slice(dernier, m.index) });
    tranches.push({ garde: true, texte: m[0] });
    dernier = m.index + m[0].length;
    m = gardes.exec(t);
  }
  if (dernier < t.length) tranches.push({ garde: false, texte: t.slice(dernier) });
  return tranches;
}

// Typographie française : apostrophes courbes, guillemets « … », points de
// suspension, et l'espace insécable devant la ponctuation double. Le code,
// les URL et les liens sont épargnés. C'est la version française du
// convertisseur de largeur d'Editing toolbar, qui ne servait qu'au chinois.
function barreTypographieFr(texte) {
  return barreTranchesTypo(texte).map((tr_) => {
    if (tr_.garde) return tr_.texte;
    let s = tr_.texte;
    s = s.replace(/\.\.\./g, '…');
    // Guillemets droits par paires, de gauche à droite.
    let ouvert = false;
    s = s.replace(/"/g, () => { ouvert = !ouvert; return ouvert ? '« ' : ' »'; });
    // Apostrophe : seulement entre deux lettres (l'eau), jamais en citation.
    s = s.replace(/(\p{L})'(\p{L})/gu, '$1’$2');
    // Ponctuation double : insécable devant. Fine devant ; ! ? et », normale
    // devant : , qui est la règle de l'Imprimerie nationale.
    s = s.replace(/[   ]*([;!?»])/g, ' $1');
    s = s.replace(/[   ]*:/g, ' :');
    s = s.replace(/«[   ]*/g, '« ');
    return s;
  }).join('');
}

// Le chemin inverse : remet des espaces ordinaires et des signes droits.
// Utile avant de coller ailleurs, ou quand la ponctuation fine passe mal.
function barreTypographieNeutre(texte) {
  return barreTranchesTypo(texte).map((tr_) => {
    if (tr_.garde) return tr_.texte;
    return tr_.texte
      .replace(/[  ]/g, ' ')
      .replace(/[’‘]/g, "'")
      .replace(/«\s*/g, '"').replace(/\s*»/g, '"')
      .replace(/[“”]/g, '"')
      .replace(/…/g, '...')
      .replace(/ +([;:!?])/g, '$1');
  }).join('');
}

// ── Fonctions pures : nettoyage de mise en forme ─────────────────────────

// Retire la mise en forme d'un texte, sans toucher à ce qu'il dit : gras,
// italique, surlignage, barré, code, balises HTML posées par la barre.
function barreEffacerFormat(texte) {
  let t = String(texte === undefined || texte === null ? '' : texte);
  t = t.replace(/<\/?(?:u|sup|sub|mark|b|i|em|strong|span|div|center|font)\b[^>]*>/gi, '');
  t = t.replace(/(\*\*\*|___)(.+?)\1/g, '$2');
  t = t.replace(/(\*\*|__)(.+?)\1/g, '$2');
  t = t.replace(/(\*|_)(.+?)\1/g, '$2');
  t = t.replace(/==(.+?)==/g, '$1');
  t = t.replace(/~~(.+?)~~/g, '$1');
  t = t.replace(/`([^`]+)`/g, '$1');
  return t.split('\n').map((l) => l.replace(/^(\s*)(#{1,6}[ \t]+|>[ \t]?)+/, '$1')).join('\n');
}

// Va plus loin : rend le texte nu, liens résolus en leur libellé, listes et
// tableaux ramenés à leurs mots. Ce qu'on veut coller dans un courriel.
function barreTexteBrut(texte) {
  let t = barreEffacerFormat(texte);
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  t = t.replace(/!?\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');
  t = t.replace(/!?\[\[([^\]]*)\]\]/g, '$1');
  t = t.replace(/\[\^[^\]]*\]/g, '');
  // La rangée de tirets d'abord : une fois les rangées aplaties, elle ne se
  // reconnaîtrait plus (« | --- | --- | » serait devenu « --- --- »).
  t = t.replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, '');
  t = t.replace(/^[ \t]*\|(.*)\|[ \t]*$/gm,
    (_, corps) => corps.split('|').map((c) => c.trim()).filter((c) => c !== '').join(' '));
  t = t.split('\n').map((l) => {
    const p = barreLireLigneListe(l);
    return p.genre ? p.indent + p.texte : l;
  }).join('\n');
  t = t.replace(/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '');
  return t.replace(/\n{3,}/g, '\n\n');
}

// ── Fonctions pures : alignement et couleurs ─────────────────────────────

const BARRE_SENS = { gauche: 'left', centre: 'center', droite: 'right', justifie: 'justify' };

// Enveloppe dans un div aligné, ou retire l'enveloppe si c'est déjà le même
// alignement. Repasser un autre sens remplace au lieu d'empiler.
function barreAligner(texte, sens) {
  const css = BARRE_SENS[sens] || String(sens || 'left');
  const t = String(texte === undefined || texte === null ? '' : texte);
  const deja = /^<div style="text-align:\s*([a-z]+);?">([\s\S]*)<\/div>$/i.exec(t.trim());
  const nu = deja ? deja[2] : t;
  if (deja && deja[1].toLowerCase() === css) return nu;
  return '<div style="text-align: ' + css + ';">' + nu + '</div>';
}

// Couleur de texte ou de fond, en span HTML : c'est ce que rend Obsidian en
// lecture, et c'est ce que Word reprend à l'export. Repasser la même couleur
// retire l'enveloppe ; une couleur vide aussi.
function barreColorer(texte, couleur, quoi) {
  const t = String(texte === undefined || texte === null ? '' : texte);
  const propriete = quoi === 'fond' ? 'background' : 'color';
  const motif = new RegExp('^<span style="' + propriete + ':\\s*([^;"]+);?">([\\s\\S]*)</span>$', 'i');
  const deja = motif.exec(t.trim());
  const nu = deja ? deja[2] : t;
  const c = String(couleur || '').trim();
  if (!c) return nu;
  if (deja && deja[1].trim().toLowerCase() === c.toLowerCase()) return nu;
  return '<span style="' + propriete + ': ' + c + ';">' + nu + '</span>';
}

// ── Fonctions pures : listes, tableaux, extraction ───────────────────────

// Une liste à puces devient un tableau : chaque élément de premier niveau est
// une ligne, ses enfants sont les colonnes suivantes. Le premier élément sert
// d'en-tête, comme le veut la syntaxe des tableaux Markdown.
function barreListeVersTableau(texte) {
  const lignes = String(texte === undefined || texte === null ? '' : texte).split('\n');
  const rangees = [];
  for (const l of lignes) {
    if (l.trim() === '') continue;
    const p = barreLireLigneListe(l);
    const texteNu = p.texte.trim();
    if (!texteNu) continue;
    const prof = p.indent.replace(/\t/g, '    ').length;
    if (!rangees.length || prof === 0 || !p.genre) rangees.push([texteNu]);
    else rangees[rangees.length - 1].push(texteNu);
  }
  if (!rangees.length) return String(texte || '');
  const largeur = rangees.reduce((n, r) => Math.max(n, r.length), 1);
  const ligne = (cellules) => '| ' + Array.from({ length: largeur },
    (_, i) => (cellules[i] === undefined ? '' : cellules[i])).join(' | ') + ' |';
  const sortie = [ligne(rangees[0]), '|' + ' --- |'.repeat(largeur)];
  for (const r of rangees.slice(1)) sortie.push(ligne(r));
  return sortie.join('\n');
}

// Le chemin inverse : chaque rangée devient un élément, ses cellules
// suivantes des sous-éléments. La rangée de tirets est ignorée.
function barreTableauVersListe(texte) {
  const sortie = [];
  for (const l of String(texte === undefined || texte === null ? '' : texte).split('\n')) {
    const nu = l.trim();
    if (!nu.startsWith('|')) continue;
    if (/^\|?[\s:-]*\|[\s|:-]*$/.test(nu) && /-{3,}/.test(nu)) continue;
    const cellules = nu.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (!cellules.length || cellules.every((c) => c === '')) continue;
    sortie.push('- ' + cellules[0]);
    for (const c of cellules.slice(1)) if (c !== '') sortie.push('  - ' + c);
  }
  return sortie.length ? sortie.join('\n') : String(texte || '');
}

// Relève tout ce qui se trouve entre deux repères, une trouvaille par ligne.
// Les repères eux-mêmes sont gardés ou non selon « avecRepere ».
function barreExtraireEntre(texte, debut, fin, avecRepere) {
  const t = String(texte === undefined || texte === null ? '' : texte);
  const d = String(debut === undefined || debut === null ? '' : debut);
  const f = String(fin === undefined || fin === null ? '' : fin);
  if (!d && !f) return t;
  const trouvailles = [];
  let i = 0;
  while (i < t.length) {
    const a = d ? t.indexOf(d, i) : i;
    if (a < 0) break;
    const depart = a + d.length;
    const b = f ? t.indexOf(f, depart) : t.length;
    if (b < 0) break;
    trouvailles.push(avecRepere ? d + t.slice(depart, b) + f : t.slice(depart, b));
    i = b + (f ? f.length : 1);
  }
  return trouvailles.join('\n');
}

// ── Fonctions pures : pinceau de mise en forme ───────────────────────────

// Les marques que le pinceau sait relever et reposer, des plus longues aux
// plus courtes : « ** » doit être reconnu avant « * ».
const BARRE_MARQUES = ['***', '**', '==', '~~', '*', '_', '`', '<u>', '<sup>', '<sub>'];
const BARRE_FERMETURES = { '<u>': '</u>', '<sup>': '</sup>', '<sub>': '</sub>' };

// Relève la mise en forme qui entoure (debut, fin) dans une ligne, en
// s'éloignant du texte marque après marque. Rend { avant, apres } : de quoi
// habiller un autre passage à l'identique.
function barreMarquesAutour(ligne, debut, fin) {
  const l = String(ligne === undefined || ligne === null ? '' : ligne);
  let a = Math.max(0, Math.min(l.length, Number(debut) || 0));
  let b = Math.max(a, Math.min(l.length, Number(fin) === undefined ? a : Number(fin)));
  const avant = [];
  const apres = [];
  let encore = true;
  while (encore) {
    encore = false;
    // Une enveloppe <span style="…"> compte comme une marque, comme les autres.
    const span = /<span style="[^"]*">$/i.exec(l.slice(0, a));
    if (span && l.slice(b, b + 7).toLowerCase() === '</span>') {
      avant.unshift(span[0]); apres.push('</span>');
      a -= span[0].length; b += 7; encore = true; continue;
    }
    for (const m of BARRE_MARQUES) {
      const f = BARRE_FERMETURES[m] || m;
      if (a >= m.length && l.slice(a - m.length, a) === m && l.slice(b, b + f.length) === f) {
        avant.unshift(m); apres.push(f);
        a -= m.length; b += f.length; encore = true; break;
      }
    }
  }
  return { avant: avant.join(''), apres: apres.join('') };
}

// ── Colle avec l'éditeur : ce que chaque commande a sous la main ──────────

// Le bloc de lignes visé par une commande : les lignes touchées par la
// sélection, ou la note entière quand rien n'est sélectionné. Les commandes
// « par lignes » travaillent toujours sur des lignes entières, sinon elles
// couperaient un mot en deux.
function barreBlocLignes(ed, toutSiVide) {
  const rien = !ed.somethingSelected();
  if (rien && toutSiVide !== false) {
    const dernier = ed.lastLine();
    return { de: { line: 0, ch: 0 }, a: { line: dernier, ch: ed.getLine(dernier).length } };
  }
  const a = ed.getCursor('from');
  const b = ed.getCursor('to');
  return { de: { line: a.line, ch: 0 }, a: { line: b.line, ch: ed.getLine(b.line).length } };
}

// Applique une fonction texte → texte au bloc visé, et laisse le résultat
// sélectionné : la commande suivante enchaîne sur le même passage.
function barreSurBloc(ed, transformer, toutSiVide) {
  const b = barreBlocLignes(ed, toutSiVide);
  const avant = ed.getRange(b.de, b.a);
  const apres = transformer(avant);
  if (apres === avant) return;
  ed.replaceRange(apres, b.de, b.a);
  const lignes = apres.split('\n');
  ed.setSelection(b.de, { line: b.de.line + lignes.length - 1,
                          ch: lignes[lignes.length - 1].length });
}

// Applique une fonction ligne → ligne à chaque ligne visée. Le curseur seul
// ne vise que sa ligne : basculer un titre ne doit pas titrer la note.
function barreSurChaqueLigne(ed, transformer) {
  const b = barreBlocLignes(ed, false);
  for (let n = b.de.line; n <= b.a.line; n += 1) {
    const avant = ed.getLine(n);
    const apres = transformer(avant, n);
    if (apres !== avant) ed.setLine(n, apres);
  }
}

// Entoure la sélection, ou la retire si elle l'est déjà. Sans sélection, pose
// les deux marques et place le curseur entre elles : on peut écrire aussitôt.
function barreEntourerSelection(ed, avant, apres) {
  const fin = apres === undefined || apres === null ? avant : apres;
  if (!ed.somethingSelected()) {
    const c = ed.getCursor();
    const ligne = ed.getLine(c.line);
    const deja = barreMarquesAutour(ligne, c.ch, c.ch);
    if (deja.avant.endsWith(avant)) {
      // Le curseur est déjà dans cette marque : la retirer autour du mot.
      const de = { line: c.line, ch: c.ch - avant.length };
      const a = { line: c.line, ch: c.ch + fin.length };
      if (ed.getRange(de, a) === avant + fin) { ed.replaceRange('', de, a); return; }
    }
    ed.replaceRange(avant + fin, c);
    ed.setCursor({ line: c.line, ch: c.ch + avant.length });
    return;
  }
  const sel = ed.getSelection();
  const de = ed.getCursor('from');
  const a = ed.getCursor('to');
  // La marque est peut-être juste à l'extérieur de la sélection : la retirer
  // là plutôt que d'en ajouter une seconde par-dessus.
  const ligne = ed.getLine(de.line);
  if (de.line === a.line && !sel.startsWith(avant)) {
    const dehors = { line: de.line, ch: de.ch - avant.length };
    const dedans = { line: a.line, ch: a.ch + fin.length };
    if (de.ch >= avant.length && ligne.slice(de.ch - avant.length, de.ch) === avant
        && ligne.slice(a.ch, a.ch + fin.length) === fin) {
      ed.replaceRange(sel, dehors, dedans);
      ed.setSelection(dehors, { line: dehors.line, ch: dehors.ch + sel.length });
      return;
    }
  }
  const nouveau = barreEntourer(sel, avant, fin);
  ed.replaceRange(nouveau, de, a);
  const lignes = nouveau.split('\n');
  ed.setSelection(de, lignes.length === 1
    ? { line: de.line, ch: de.ch + nouveau.length }
    : { line: de.line + lignes.length - 1, ch: lignes[lignes.length - 1].length });
}

// Remplace la sélection (ou le mot sous le curseur) par le résultat d'une
// fonction texte → texte. Sans mot ni sélection, ne fait rien.
function barreSurSelection(ed, transformer) {
  if (!ed.somethingSelected()) {
    const c = ed.getCursor();
    const ligne = ed.getLine(c.line);
    const g = /[\p{L}\p{N}_'’-]*$/u.exec(ligne.slice(0, c.ch));
    const d = /^[\p{L}\p{N}_'’-]*/u.exec(ligne.slice(c.ch));
    const de = { line: c.line, ch: c.ch - (g ? g[0].length : 0) };
    const a = { line: c.line, ch: c.ch + (d ? d[0].length : 0) };
    if (de.ch === a.ch) return;
    const apres = transformer(ed.getRange(de, a));
    ed.replaceRange(apres, de, a);
    ed.setSelection(de, { line: de.line, ch: de.ch + apres.length });
    return;
  }
  const de = ed.getCursor('from');
  const a = ed.getCursor('to');
  const apres = transformer(ed.getSelection());
  ed.replaceRange(apres, de, a);
  const lignes = apres.split('\n');
  ed.setSelection(de, lignes.length === 1
    ? { line: de.line, ch: de.ch + apres.length }
    : { line: de.line + lignes.length - 1, ch: lignes[lignes.length - 1].length });
}

// Vrai si le curseur (ou la sélection) est déjà habillé de cette marque :
// c'est ce qui allume le bouton correspondant dans la barre.
function barreMarqueActive(ed, marque) {
  try {
    const de = ed.getCursor('from');
    const a = ed.getCursor('to');
    if (de.line !== a.line) return false;
    const m = barreMarquesAutour(ed.getLine(de.line), de.ch, a.ch);
    return m.avant.indexOf(marque) >= 0;
  } catch (e) { return false; }
}

// ── Le catalogue des commandes d'édition ─────────────────────────────────
//  Ariane n'ajoute que ce qu'Obsidian n'a pas : le gras, l'italique, le
//  barré, le surlignage, les listes, le tableau ou la pièce jointe restent
//  les commandes d'Obsidian, avec les raccourcis que l'utilisateur leur a
//  donnés. La barre sait afficher les unes comme les autres.
//  Chaque entrée : identifiant (sans préfixe), nom de palette, icône, et le
//  geste sur l'éditeur. « marque » sert à allumer le bouton quand le curseur
//  est déjà dans cette mise en forme.

const BARRE_COMMANDES = [
  // Annuler / rétablir : Obsidian n'en fait pas des commandes, seulement des
  // raccourcis. La barre a besoin de boutons.
  { id: 'md-annuler', nom: 'Édition : annuler', icone: 'undo-2', sur: (ed) => ed.undo() },
  { id: 'md-retablir', nom: 'Édition : rétablir', icone: 'redo-2', sur: (ed) => ed.redo() },

  // Mise en forme que le Markdown d'Obsidian ne couvre pas.
  { id: 'md-souligner', nom: 'Mise en forme : souligné', icone: 'underline', marque: '<u>',
    sur: (ed) => barreEntourerSelection(ed, '<u>', '</u>') },
  { id: 'md-exposant', nom: 'Mise en forme : exposant', icone: 'superscript', marque: '<sup>',
    sur: (ed) => barreEntourerSelection(ed, '<sup>', '</sup>') },
  { id: 'md-indice', nom: 'Mise en forme : indice', icone: 'subscript', marque: '<sub>',
    sur: (ed) => barreEntourerSelection(ed, '<sub>', '</sub>') },
  { id: 'md-math-ligne', nom: 'Mise en forme : formule en ligne', icone: 'sigma', marque: '$',
    sur: (ed) => barreEntourerSelection(ed, '$', '$') },
  { id: 'md-ligne-horizontale', nom: 'Insertion : filet horizontal', icone: 'minus',
    sur: (ed) => {
      const c = ed.getCursor();
      const vide = ed.getLine(c.line).trim() === '';
      ed.replaceRange((vide ? '' : '\n') + '\n---\n\n', { line: c.line, ch: ed.getLine(c.line).length });
      ed.setCursor({ line: c.line + (vide ? 3 : 4), ch: 0 });
    } },

  // Titres : une bascule par niveau, plus le retour au texte ordinaire.
  { id: 'md-titre-normal', nom: 'Titre : texte ordinaire', icone: 'pilcrow',
    sur: (ed) => barreSurChaqueLigne(ed, (l) => barreTitreLigne(l, 0)) },
  { id: 'md-titre-1', nom: 'Titre : niveau 1', icone: 'heading-1',
    sur: (ed) => barreSurChaqueLigne(ed, (l) => barreTitreLigne(l, 1)) },
  { id: 'md-titre-2', nom: 'Titre : niveau 2', icone: 'heading-2',
    sur: (ed) => barreSurChaqueLigne(ed, (l) => barreTitreLigne(l, 2)) },
  { id: 'md-titre-3', nom: 'Titre : niveau 3', icone: 'heading-3',
    sur: (ed) => barreSurChaqueLigne(ed, (l) => barreTitreLigne(l, 3)) },
  { id: 'md-titre-4', nom: 'Titre : niveau 4', icone: 'heading-4',
    sur: (ed) => barreSurChaqueLigne(ed, (l) => barreTitreLigne(l, 4)) },
  { id: 'md-titre-5', nom: 'Titre : niveau 5', icone: 'heading-5',
    sur: (ed) => barreSurChaqueLigne(ed, (l) => barreTitreLigne(l, 5)) },
  { id: 'md-titre-6', nom: 'Titre : niveau 6', icone: 'heading-6',
    sur: (ed) => barreSurChaqueLigne(ed, (l) => barreTitreLigne(l, 6)) },

  // Alignement : un div par bloc, ce qu'Obsidian rend en lecture et ce que
  // l'export Word reprend.
  { id: 'md-aligner-gauche', nom: 'Alignement : à gauche', icone: 'align-left',
    sur: (ed) => barreSurSelection(ed, (t) => barreAligner(t, 'gauche')) },
  { id: 'md-aligner-centre', nom: 'Alignement : centré', icone: 'align-center',
    sur: (ed) => barreSurSelection(ed, (t) => barreAligner(t, 'centre')) },
  { id: 'md-aligner-droite', nom: 'Alignement : à droite', icone: 'align-right',
    sur: (ed) => barreSurSelection(ed, (t) => barreAligner(t, 'droite')) },
  { id: 'md-aligner-justifie', nom: 'Alignement : justifié', icone: 'align-justify',
    sur: (ed) => barreSurSelection(ed, (t) => barreAligner(t, 'justifie')) },

  // Nettoyage.
  { id: 'md-effacer-format', nom: 'Mise en forme : tout effacer', icone: 'eraser',
    sur: (ed) => barreSurSelection(ed, barreEffacerFormat) },
  { id: 'md-texte-brut', nom: 'Texte : réduire au texte nu', icone: 'scan-text',
    sur: (ed) => barreSurBloc(ed, barreTexteBrut, false) },

  // Casse : un bouton qui fait tourner, et trois qui imposent.
  { id: 'md-casse', nom: 'Texte : faire tourner la casse', icone: 'case-sensitive',
    sur: (ed) => barreSurSelection(ed, (t) => barreCasse(t, barreCasseSuivante(t))) },
  { id: 'md-casse-majuscules', nom: 'Texte : MAJUSCULES', icone: 'case-upper',
    sur: (ed) => barreSurSelection(ed, (t) => barreCasse(t, 'majuscules')) },
  { id: 'md-casse-minuscules', nom: 'Texte : minuscules', icone: 'case-lower',
    sur: (ed) => barreSurSelection(ed, (t) => barreCasse(t, 'minuscules')) },
  { id: 'md-casse-capitales', nom: 'Texte : Capitales De Titre', icone: 'case-sensitive',
    sur: (ed) => barreSurSelection(ed, (t) => barreCasse(t, 'capitales')) },

  // Typographie française : l'équivalent utile, ici, du convertisseur de
  // largeur d'Editing toolbar, qui ne servait qu'aux langues d'Asie.
  { id: 'md-typographie-fr', nom: 'Texte : typographie française', icone: 'quote',
    sur: (ed) => barreSurBloc(ed, barreTypographieFr, false) },
  { id: 'md-typographie-neutre', nom: 'Texte : typographie neutre (signes droits)', icone: 'type',
    sur: (ed) => barreSurBloc(ed, barreTypographieNeutre, false) },

  // Lignes.
  { id: 'lignes-vides-ajouter', nom: 'Lignes : intercaler une ligne vide', icone: 'rows-3',
    sur: (ed) => barreSurBloc(ed, (t) => barreLignesVides(t, 'ajouter')) },
  { id: 'lignes-vides-retirer', nom: 'Lignes : retirer les lignes vides', icone: 'rows-2',
    sur: (ed) => barreSurBloc(ed, (t) => barreLignesVides(t, 'retirer')) },
  { id: 'lignes-scinder', nom: 'Lignes : couper sur un séparateur…', icone: 'split',
    sur: (ed, vue, greffon) => ModaleBarreTexte.demander(greffon, {
      titre: 'Couper les lignes',
      champs: [{ cle: 'sep', nom: 'Séparateur', valeur: '',
                 aide: 'Vide : coupe sur les espaces.' }],
    }, (v) => barreSurBloc(ed, (t) => barreScinderLignes(t, v.sep))) },
  { id: 'lignes-fusionner', nom: 'Lignes : recoller le paragraphe…', icone: 'wrap-text',
    sur: (ed, vue, greffon) => ModaleBarreTexte.demander(greffon, {
      titre: 'Recoller les lignes',
      champs: [{ cle: 'liant', nom: 'Liant', valeur: ' ',
                 aide: 'Inséré entre deux lignes. Les lignes vides restent des séparations.' }],
    }, (v) => barreSurBloc(ed, (t) => barreFusionnerLignes(t, v.liant))) },
  { id: 'lignes-dedoublonner', nom: 'Lignes : retirer les doublons', icone: 'copy-minus',
    sur: (ed) => barreSurBloc(ed, barreDedoublonnerLignes) },
  { id: 'lignes-trier', nom: 'Lignes : trier', icone: 'arrow-down-a-z',
    sur: (ed) => barreSurBloc(ed, (t) => barreTrierLignes(t, 'ascendant')) },
  { id: 'lignes-envelopper', nom: 'Lignes : préfixe et suffixe…', icone: 'brackets',
    sur: (ed, vue, greffon) => ModaleBarreTexte.demander(greffon, {
      titre: 'Préfixe et suffixe',
      champs: [{ cle: 'prefixe', nom: 'Devant', valeur: '' },
               { cle: 'suffixe', nom: 'Derrière', valeur: '' }],
    }, (v) => barreSurBloc(ed, (t) => barreEnvelopperLignes(t, v.prefixe, v.suffixe))) },
  { id: 'lignes-numeroter', nom: 'Lignes : numéroter…', icone: 'list-ordered',
    sur: (ed, vue, greffon) => ModaleBarreTexte.demander(greffon, {
      titre: 'Numéroter les lignes',
      champs: [{ cle: 'gabarit', nom: 'Gabarit', valeur: '{n}. ',
                 aide: '{n} le numéro, {t} le texte de la ligne.' },
               { cle: 'depart', nom: 'Premier numéro', valeur: '1' }],
    }, (v) => barreSurBloc(ed, (t) => barreNumeroterLignes(t, v.gabarit, Number(v.depart) || 1))) },
  { id: 'espaces-bouts', nom: 'Espaces : nettoyer les fins de ligne', icone: 'chevrons-left-right',
    sur: (ed) => barreSurBloc(ed, (t) => barreEspaces(t, 'bouts')) },
  { id: 'espaces-compresser', nom: 'Espaces : réduire les espaces en trop', icone: 'fold-horizontal',
    sur: (ed) => barreSurBloc(ed, (t) => barreEspaces(t, 'compresser')) },
  { id: 'espaces-supprimer', nom: 'Espaces : tous les retirer', icone: 'remove-formatting',
    sur: (ed) => barreSurBloc(ed, (t) => barreEspaces(t, 'tout')) },

  // Listes et tableaux.
  { id: 'liste-cycler', nom: 'Liste : texte, puce, case à cocher', icone: 'list-todo',
    sur: (ed) => barreSurChaqueLigne(ed, barreCyclerListe) },
  { id: 'liste-renumeroter', nom: 'Liste : renuméroter', icone: 'list-restart',
    sur: (ed) => barreSurBloc(ed, (t) => barreRenumeroter(t, 1)) },
  { id: 'liste-vers-tableau', nom: 'Liste : convertir en tableau', icone: 'table',
    sur: (ed) => barreSurBloc(ed, barreListeVersTableau, false) },
  { id: 'tableau-vers-liste', nom: 'Tableau : convertir en liste', icone: 'list',
    sur: (ed) => barreSurBloc(ed, barreTableauVersListe, false) },
  { id: 'extraire-entre', nom: 'Texte : extraire entre deux repères…', icone: 'scissors',
    sur: (ed, vue, greffon) => ModaleBarreTexte.demander(greffon, {
      titre: 'Extraire entre deux repères',
      champs: [{ cle: 'debut', nom: 'Après', valeur: '' },
               { cle: 'fin', nom: 'Jusqu’à', valeur: '' },
               { cle: 'repere', nom: 'Garder les repères', valeur: '', case: true }],
    }, (v) => barreSurBloc(ed, (t) => barreExtraireEntre(t, v.debut, v.fin, !!v.repere), false)) },

  // Presse-papiers. Obsidian s'en remet aux raccourcis du système ; la barre,
  // elle, a besoin de boutons.
  { id: 'md-couper', nom: 'Édition : couper', icone: 'scissors',
    sur: async (ed) => {
      if (!ed.somethingSelected()) return;
      await barreVersPressePapiers(ed.getSelection());
      ed.replaceSelection('');
    } },
  { id: 'md-copier', nom: 'Édition : copier', icone: 'copy',
    sur: async (ed) => { if (ed.somethingSelected()) await barreVersPressePapiers(ed.getSelection()); } },
  { id: 'md-coller', nom: 'Édition : coller', icone: 'clipboard-paste',
    sur: async (ed) => {
      const t = await barreDepuisPressePapiers();
      if (t) ed.replaceSelection(t);
    } },

  // Couleurs : la palette s'ouvre sous le bouton quand elle vient de la
  // barre, au curseur quand elle vient de la palette de commandes.
  { id: 'md-couleur-texte', nom: 'Mise en forme : couleur du texte…', icone: 'baseline',
    sur: (ed, vue, greffon) => greffon.barre.ouvrirPalette(ed, vue, 'texte', null) },
  { id: 'md-couleur-fond', nom: 'Mise en forme : couleur de fond…', icone: 'paint-bucket',
    sur: (ed, vue, greffon) => greffon.barre.ouvrirPalette(ed, vue, 'fond', null) },

  // Pinceau : relève la mise en forme d'un passage et la repose ailleurs. Il
  // reste armé tant qu'on ne le désarme pas, contrairement au geste unique.
  { id: 'md-pinceau', nom: 'Mise en forme : pinceau (relever, puis reposer)', icone: 'paintbrush',
    sur: (ed, vue, greffon) => greffon.barre.pinceauBasculer(ed) },

  // Pleine page. La note seule (les panneaux s'effacent) ou toute la fenêtre.
  { id: 'note-plein-ecran', nom: 'Volet : la note seule, en pleine page', icone: 'maximize',
    sur: (ed, vue, greffon) => greffon.barre.basculerPleinePage(vue) },
  { id: 'espace-plein-ecran', nom: 'Fenêtre : plein écran', icone: 'expand',
    sur: (ed, vue, greffon) => greffon.barre.basculerPleinEcran(vue) },
];

// Le presse-papiers, en deux fonctions qui ne supposent rien de l'hôte :
// l'API moderne d'abord, l'ancienne commande d'édition en secours.
async function barreVersPressePapiers(texte) {
  try {
    if (navigator && navigator.clipboard) { await navigator.clipboard.writeText(texte); return true; }
  } catch (e) { /* refusé : on tente l'ancienne voie */ }
  try { return document.execCommand('copy'); } catch (e2) { return false; }
}

async function barreDepuisPressePapiers() {
  try {
    if (navigator && navigator.clipboard) return await navigator.clipboard.readText();
  } catch (e) { /* refusé */ }
  return '';
}

// ── La disposition par défaut ────────────────────────────────────────────
//  Trois formes d'entrée, et trois seulement :
//    { cmd: 'identifiant' }           un bouton
//    { separateur: true }             un trait vertical
//    { groupe: 'Nom', icone, elements: [...] }   un bouton à menu déroulant
//  Les identifiants d'Ariane portent leur préfixe : la barre ne fait aucune
//  différence entre une commande à nous, une d'Obsidian et une d'un tiers.

const BARRE_PREFIXE = 'obsidian-ariane:';

function barreDefaut() {
  const a = (suite) => BARRE_PREFIXE + suite;
  return [
    { cmd: a('md-annuler') },
    { cmd: a('md-retablir') },
    { cmd: a('md-pinceau') },
    { cmd: a('md-effacer-format') },
    { separateur: true },
    { cmd: a('md-titre-2') },
    { cmd: a('md-titre-3') },
    { groupe: 'Titres', icone: 'heading', elements: [
      { cmd: a('md-titre-1') }, { cmd: a('md-titre-4') }, { cmd: a('md-titre-5') },
      { cmd: a('md-titre-6') }, { separateur: true }, { cmd: a('md-titre-normal') },
    ] },
    { separateur: true },
    { cmd: 'editor:toggle-bold' },
    { cmd: 'editor:toggle-italics' },
    { cmd: 'editor:toggle-strikethrough' },
    { cmd: a('md-souligner') },
    { cmd: 'editor:toggle-highlight' },
    { cmd: a('md-couleur-texte') },
    { cmd: a('md-couleur-fond') },
    { separateur: true },
    { groupe: 'Markdown', icone: 'code', elements: [
      { cmd: a('md-exposant') }, { cmd: a('md-indice') },
      { cmd: 'editor:toggle-code' }, { cmd: 'editor:toggle-blockquote' },
      { cmd: 'editor:insert-callout' }, { cmd: a('md-ligne-horizontale') },
      { separateur: true },
      { cmd: 'editor:insert-wikilink' }, { cmd: 'editor:insert-embed' },
      { cmd: 'editor:insert-link' },
      { separateur: true },
      { cmd: a('md-math-ligne') }, { cmd: 'editor:insert-mathblock' },
    ] },
    { groupe: 'Listes', icone: 'list', elements: [
      { cmd: a('liste-cycler') }, { cmd: 'editor:toggle-bullet-list' },
      { cmd: 'editor:toggle-numbered-list' }, { cmd: 'editor:toggle-checklist-status' },
      { separateur: true },
      { cmd: a('liste-renumeroter') },
      { cmd: 'editor:indent-list' }, { cmd: 'editor:unindent-list' },
    ] },
    { groupe: 'Alignement', icone: 'align-left', elements: [
      { cmd: a('md-aligner-gauche') }, { cmd: a('md-aligner-centre') },
      { cmd: a('md-aligner-droite') }, { cmd: a('md-aligner-justifie') },
    ] },
    { cmd: 'editor:insert-table' },
    { cmd: 'editor:attach-file' },
    { separateur: true },
    { groupe: 'Outils de texte', icone: 'wand-2', elements: [
      { cmd: a('md-texte-brut') }, { cmd: a('md-casse') },
      { cmd: a('md-typographie-fr') }, { cmd: a('md-typographie-neutre') },
      { separateur: true },
      { cmd: a('lignes-vides-ajouter') }, { cmd: a('lignes-vides-retirer') },
      { cmd: a('lignes-scinder') }, { cmd: a('lignes-fusionner') },
      { cmd: a('lignes-dedoublonner') }, { cmd: a('lignes-trier') },
      { separateur: true },
      { cmd: a('lignes-envelopper') }, { cmd: a('lignes-numeroter') },
      { cmd: a('espaces-bouts') }, { cmd: a('espaces-compresser') },
      { cmd: a('espaces-supprimer') },
      { separateur: true },
      { cmd: a('liste-vers-tableau') }, { cmd: a('tableau-vers-liste') },
      { cmd: a('extraire-entre') },
    ] },
    { groupe: 'Édition', icone: 'clipboard', elements: [
      { cmd: a('md-couper') }, { cmd: a('md-copier') }, { cmd: a('md-coller') },
      { separateur: true },
      { cmd: 'editor:swap-line-up' }, { cmd: 'editor:swap-line-down' },
    ] },
    // Ce qu'Editing toolbar n'avait pas : les gestes d'Ariane, au même rang
    // que la mise en forme, puisqu'ils portent sur la note ouverte.
    { groupe: 'Ariane', icone: 'compass', elements: [
      { cmd: a('correcteur-relire') },
      { separateur: true },
      { cmd: a('creer-tache') }, { cmd: a('atomise-active') }, { cmd: a('biblio-note') },
    ] },
    { separateur: true },
    // Les deux gestes d'Ariane qui servent à chaque relecture : replier les
    // citations pour lire le texte seul, et ouvrir le volet de relecture.
    { cmd: a('citations-basculer') },
    { cmd: a('correcteur-volet') },
    { separateur: true },
    { cmd: a('note-plein-ecran') },
    { cmd: a('espace-plein-ecran') },
  ];
}

// ── BarreEdition : une par greffon, elle pose et retire les barres ────────

class BarreEdition extends obsidian.Component {
  constructor(greffon) {
    super();
    this.greffon = greffon;
    this.barres = new Map();      // MarkdownView -> BarreOutils
    this.pinceau = null;          // { avant, apres } relevé, en attente d'être reposé
    this.pleinePage = null;       // le volet actuellement seul en page
  }

  get reglages() { return this.greffon.settings; }

  onload() {
    const espace = this.greffon.app.workspace;
    this.registerEvent(espace.on('layout-change', () => this.rafraichir()));
    this.registerEvent(espace.on('active-leaf-change', () => this.rafraichir()));
    this.registerEvent(espace.on('window-close', () => this.rafraichir()));
    // L'état des boutons (gras allumé, titre en cours) suit le curseur.
    this.registerEvent(espace.on('editor-change', () => this.majEtats()));
    espace.onLayoutReady(() => this.rafraichir());
  }

  onunload() {
    for (const barre of Array.from(this.barres.values())) barre.demonter();
    this.barres.clear();
    this.quitterPleinePage();
  }

  // Met les barres en accord avec les volets ouverts : une barre par vue
  // Markdown qui en veut une, et rien ailleurs.
  rafraichir() {
    const vivantes = new Set();
    const active = this.reglages.barreActive !== false;
    if (active) {
      this.greffon.app.workspace.iterateAllLeaves((volet) => {
        const vue = volet && volet.view;
        if (!vue || vue.getViewType() !== 'markdown' || !vue.contentEl) return;
        if (!this.barreVoulue(vue)) return;
        vivantes.add(vue);
        let barre = this.barres.get(vue);
        if (!barre) { barre = new BarreOutils(this, vue); this.barres.set(vue, barre); }
        barre.monter();
      });
    }
    for (const [vue, barre] of Array.from(this.barres.entries())) {
      if (vivantes.has(vue)) continue;
      barre.demonter();
      this.barres.delete(vue);
    }
  }

  // Le mode lecture n'a pas d'éditeur : la barre n'y a de sens que si
  // l'utilisateur la veut quand même (pour les boutons de pleine page).
  barreVoulue(vue) {
    const mode = typeof vue.getMode === 'function' ? vue.getMode() : 'source';
    if (mode === 'preview') return this.reglages.barreEnLecture === true;
    return true;
  }

  // Redessine tout : appelé quand les réglages changent.
  redessiner() {
    for (const barre of Array.from(this.barres.values())) barre.demonter();
    this.barres.clear();
    this.rafraichir();
  }

  majEtats() {
    for (const barre of Array.from(this.barres.values())) barre.majEtats();
  }

  // Replier ou déplier : un réglage retenu, appliqué à toutes les barres
  // ouvertes d'un coup, avec l'animation. Une note ouverte ensuite retrouve
  // la barre dans l'état où on l'a laissée.
  async basculerRepli() {
    const s = this.reglages;
    s.barreRepliee = s.barreRepliee !== true;
    for (const barre of Array.from(this.barres.values())) barre.appliquerRepli(true);
    await this.greffon.saveSettings();
  }

  // ── Exécution d'une commande depuis un bouton ──────────────────────────
  // Le volet qui porte le bouton devient actif AVANT l'exécution : une
  // commande d'éditeur agit sur l'éditeur actif, et cliquer la barre du
  // volet de droite doit agir sur le volet de droite.
  executer(id, vue) {
    const app = this.greffon.app;
    const volet = vue && vue.leaf;
    if (volet && app.workspace.getActiveViewOfType(obsidian.MarkdownView) !== vue) {
      app.workspace.setActiveLeaf(volet, { focus: false });
    }
    let fait = false;
    try { fait = app.commands.executeCommandById(id); } catch (e) {
      console.error('[Ariane] barre d’édition, commande ' + id + ' :', e);
    }
    if (fait === false) {
      new obsidian.Notice(tr('Commande indisponible ici : ') + id);
    }
    // Rendre la main au texte : sans cela, la frappe suivante se perd.
    try { if (vue && vue.editor) vue.editor.focus(); } catch (e2) { /* volet parti */ }
    this.majEtats();
    return fait;
  }

  // ── Pinceau de mise en forme ───────────────────────────────────────────
  // Premier clic : relève ce qui entoure la sélection. Clics suivants : le
  // repose sur la sélection. Un clic sans sélection le range.
  pinceauBasculer(ed) {
    if (this.pinceau) {
      if (ed && ed.somethingSelected()) { this.pinceauPoser(ed); return; }
      this.pinceau = null;
      new obsidian.Notice(tr('Pinceau rangé.'));
      this.majEtats();
      return;
    }
    if (!ed) return;
    const de = ed.getCursor('from');
    const a = ed.getCursor('to');
    const marques = de.line === a.line
      ? barreMarquesAutour(ed.getLine(de.line), de.ch, a.ch)
      : { avant: '', apres: '' };
    if (!marques.avant) {
      new obsidian.Notice(tr('Rien à relever ici : placez le curseur dans un passage mis en forme.'));
      return;
    }
    this.pinceau = marques;
    new obsidian.Notice(tr('Mise en forme relevée : ') + marques.avant + ' · '
      + tr('sélectionnez un passage pour la reposer.'));
    this.majEtats();
  }

  pinceauPoser(ed) {
    if (!this.pinceau || !ed.somethingSelected()) return;
    const de = ed.getCursor('from');
    const a = ed.getCursor('to');
    const nu = barreEffacerFormat(ed.getSelection());
    const habille = this.pinceau.avant + nu + this.pinceau.apres;
    ed.replaceRange(habille, de, a);
    ed.setSelection(de, { line: de.line, ch: de.ch + habille.length });
    this.majEtats();
  }

  // ── Palette de couleurs ────────────────────────────────────────────────
  ouvrirPalette(ed, vue, quoi, bouton) {
    const doc = (bouton && bouton.ownerDocument)
      || (vue && vue.containerEl && vue.containerEl.ownerDocument) || document;
    const cle = quoi === 'fond' ? 'barreCouleursFond' : 'barreCouleursTexte';
    const couleurs = Array.isArray(this.reglages[cle]) && this.reglages[cle].length
      ? this.reglages[cle] : DEFAULT_SETTINGS[cle];
    const poser = (couleur) => barreSurSelection(ed, (t) => barreColorer(t, couleur, quoi));
    new BarrePalette(doc, {
      couleurs,
      titre: quoi === 'fond' ? tr('Couleur de fond') : tr('Couleur du texte'),
      ancre: bouton,
      surChoix: (c) => { poser(c); try { ed.focus(); } catch (e) { /* volet parti */ } },
      surRetrait: () => { poser(''); try { ed.focus(); } catch (e) { /* volet parti */ } },
      surMemoriser: async (c) => {
        const liste = (this.reglages[cle] || []).slice();
        if (liste.indexOf(c) < 0) { liste.unshift(c); this.reglages[cle] = liste.slice(0, 12); }
        await this.greffon.saveSettings();
      },
    }).ouvrir();
  }

  // ── Pleine page ────────────────────────────────────────────────────────
  // La note seule : le volet prend toute la fenêtre, panneaux compris. C'est
  // une classe sur le document du volet, donc cela marche aussi dans une
  // fenêtre détachée.
  basculerPleinePage(vue) {
    const cible = vue && vue.containerEl && vue.containerEl.closest('.workspace-leaf');
    if (!cible) return;
    const doc = cible.ownerDocument;
    if (cible.classList.contains('zfa-volet-pleine-page')) { this.quitterPleinePage(); return; }
    this.quitterPleinePage();
    cible.classList.add('zfa-volet-pleine-page');
    doc.body.classList.add('zfa-pleine-page-active');
    this.pleinePage = cible;
    const surEchap = (e) => {
      if (e.key !== 'Escape') return;
      this.quitterPleinePage();
    };
    doc.addEventListener('keydown', surEchap, true);
    this._quitterEchap = () => doc.removeEventListener('keydown', surEchap, true);
  }

  quitterPleinePage() {
    if (this._quitterEchap) { try { this._quitterEchap(); } catch (e) { /* fenêtre partie */ } }
    this._quitterEchap = null;
    const cible = this.pleinePage;
    this.pleinePage = null;
    if (!cible) return;
    try {
      cible.classList.remove('zfa-volet-pleine-page');
      cible.ownerDocument.body.classList.remove('zfa-pleine-page-active');
    } catch (e) { /* fenêtre partie */ }
  }

  basculerPleinEcran(vue) {
    const doc = (vue && vue.containerEl && vue.containerEl.ownerDocument) || document;
    try {
      if (doc.fullscreenElement) doc.exitFullscreen();
      else doc.documentElement.requestFullscreen();
    } catch (e) {
      new obsidian.Notice(tr('Le plein écran a été refusé par la fenêtre.'));
    }
  }
}

// ── BarreOutils : la barre d'un volet ────────────────────────────────────
//  Elle se glisse en tête de .view-content : sous la barre d'onglets, et
//  au-dessus du titre de la note, qui appartient à l'éditeur. Tout son DOM
//  est créé dans le document du volet, donc une fenêtre détachée a sa propre
//  barre, avec ses propres menus.

// Les commandes d'Obsidian ne portent pas toutes une icône exploitable :
// voici celles de l'éditeur, pour que la barre ne montre jamais un trou.
const BARRE_ICONES_OBSIDIAN = {
  'editor:toggle-bold': 'bold',
  'editor:toggle-italics': 'italic',
  'editor:toggle-strikethrough': 'strikethrough',
  'editor:toggle-highlight': 'highlighter',
  'editor:toggle-code': 'code',
  'editor:toggle-blockquote': 'text-quote',
  'editor:toggle-comments': 'percent',
  'editor:insert-callout': 'lightbulb',
  'editor:insert-wikilink': 'brackets',
  'editor:insert-embed': 'file-input',
  'editor:insert-link': 'link',
  'editor:insert-table': 'table',
  'editor:insert-mathblock': 'radical',
  'editor:insert-tag': 'hash',
  'editor:insert-codeblock': 'file-code',
  'editor:attach-file': 'paperclip',
  'editor:toggle-bullet-list': 'list',
  'editor:toggle-numbered-list': 'list-ordered',
  'editor:toggle-checklist-status': 'square-check',
  'editor:cycle-list-checklist': 'circle-check',
  'editor:indent-list': 'indent',
  'editor:unindent-list': 'outdent',
  'editor:swap-line-up': 'arrow-up',
  'editor:swap-line-down': 'arrow-down',
};

// Les marques qui allument un bouton quand le curseur est dedans. Celles
// d'Ariane sont déclarées dans le catalogue ; voici celles d'Obsidian.
const BARRE_MARQUES_OBSIDIAN = {
  'editor:toggle-bold': '**',
  'editor:toggle-italics': '*',
  'editor:toggle-strikethrough': '~~',
  'editor:toggle-highlight': '==',
  'editor:toggle-code': '`',
};

// Le catalogue d'Ariane, indexé par identifiant complet.
let BARRE_PAR_ID = null;
function barreCommandeAriane(id) {
  if (!BARRE_PAR_ID) {
    BARRE_PAR_ID = new Map();
    for (const c of BARRE_COMMANDES) BARRE_PAR_ID.set(BARRE_PREFIXE + c.id, c);
  }
  return BARRE_PAR_ID.get(id) || null;
}

class BarreOutils {
  constructor(chef, vue) {
    this.chef = chef;
    this.greffon = chef.greffon;
    this.vue = vue;
    this.el = null;
    this.boutons = [];       // { el, entree, marque, titre }
    this._surFrappe = null;
  }

  get doc() {
    return (this.vue.containerEl && this.vue.containerEl.ownerDocument) || document;
  }

  get editeur() { return this.vue && this.vue.editor ? this.vue.editor : null; }

  // Posée en PREMIER enfant de .view-content : Obsidian y met ensuite la vue
  // source ou la vue lecture, toutes deux sous la barre.
  monter() {
    const hote = this.vue.contentEl;
    if (!hote) return;
    if (this.el && this.el.parentElement === hote && hote.firstChild === this.el) {
      this.majEtats();
      return;
    }
    if (!this.el) {
      // Trois étages, pour que le repli s'anime sans mesurer quoi que ce soit :
      // la grille passe d'une rangée « 1fr » à « 0fr », le cadre rogne ce qui
      // dépasse, et la rangée garde sa hauteur naturelle pendant ce temps.
      this.el = this.doc.createElement('div');
      this.cadre = this.doc.createElement('div');
      this.cadre.className = 'zfa-barre-cadre';
      this.rangee = this.doc.createElement('div');
      this.rangee.className = 'zfa-barre-boutons';
      this.cadre.appendChild(this.rangee);
      this.el.appendChild(this.cadre);
    }
    this.el.className = 'zfa-barre';
    hote.classList.add('zfa-avec-barre');
    hote.insertBefore(this.el, hote.firstChild);
    this.brancherSuivi();
    this.poserInterrupteur();
    this.dessiner();
    // Première apparition : l'état est posé tel quel, sans animation. Le repli
    // ne s'anime que lorsqu'on le demande, jamais à l'ouverture d'une note.
    this.appliquerRepli(false);
  }

  demonter() {
    this.debrancherSuivi();
    if (this.interrupteur && this.interrupteur.parentElement) {
      this.interrupteur.parentElement.removeChild(this.interrupteur);
    }
    this.interrupteur = null;
    if (this.el && this.el.parentElement) this.el.parentElement.removeChild(this.el);
    const hote = this.vue && this.vue.contentEl;
    if (hote) hote.classList.remove('zfa-avec-barre');
    this.el = null;
    this.cadre = null;
    this.rangee = null;
    this.boutons = [];
  }

  // Le bouton qui replie et déplie la barre, dans l'en-tête du volet (à côté
  // du livre et des trois points). Il appartient au volet comme la barre :
  // une fenêtre détachée a donc le sien.
  poserInterrupteur() {
    if (this.interrupteur && this.interrupteur.isConnected) return;
    if (typeof this.vue.addAction !== 'function') return;
    this.interrupteur = this.vue.addAction('chevron-up', tr('Replier la barre d’édition'),
      () => this.chef.basculerRepli());
    this.interrupteur.classList.add('zfa-barre-interrupteur');
  }

  // Replie ou déplie. `anime` faux : l'état est posé sans transition (montage,
  // redessin), pour ne pas voir la barre se refermer à chaque note ouverte.
  appliquerRepli(anime) {
    if (!this.el) return;
    const repliee = this.greffon.settings.barreRepliee === true;
    const fenetre = this.doc.defaultView || window;
    if (!anime) {
      this.el.classList.add('sans-transition');
      this.el.classList.toggle('est-repliee', repliee);
      // Deux images plus tard, la mise en page est faite : on peut rendre les
      // transitions sans qu'elles rejouent l'état qu'on vient de poser.
      fenetre.requestAnimationFrame(() => fenetre.requestAnimationFrame(() => {
        if (this.el) this.el.classList.remove('sans-transition');
      }));
    } else {
      this.el.classList.toggle('est-repliee', repliee);
    }
    // Barre repliée : ses boutons sortent de l'ordre de tabulation et des
    // lecteurs d'écran, sinon on y entrerait sans les voir.
    this.el.setAttribute('aria-hidden', repliee ? 'true' : 'false');
    if ('inert' in this.cadre) this.cadre.inert = repliee;
    if (this.interrupteur) {
      this.interrupteur.classList.toggle('est-repliee', repliee);
      const libelle = repliee ? tr('Déplier la barre d’édition') : tr('Replier la barre d’édition');
      this.interrupteur.setAttribute('aria-label', libelle);
      if (obsidian.setTooltip) obsidian.setTooltip(this.interrupteur, libelle, { placement: 'bottom' });
    }
  }

  // Le curseur bouge : les boutons de mise en forme se rallument ou
  // s'éteignent. Une frappe et un clic suffisent à le savoir.
  brancherSuivi() {
    if (this._surFrappe || !this.vue.contentEl) return;
    let attendu = null;
    const fenetre = this.doc.defaultView || window;
    this._surFrappe = () => {
      if (attendu) fenetre.clearTimeout(attendu);
      attendu = fenetre.setTimeout(() => { attendu = null; this.majEtats(); }, 120);
    };
    this.vue.contentEl.addEventListener('keyup', this._surFrappe);
    this.vue.contentEl.addEventListener('mouseup', this._surFrappe);
  }

  debrancherSuivi() {
    if (!this._surFrappe || !this.vue || !this.vue.contentEl) { this._surFrappe = null; return; }
    try {
      this.vue.contentEl.removeEventListener('keyup', this._surFrappe);
      this.vue.contentEl.removeEventListener('mouseup', this._surFrappe);
    } catch (e) { /* volet parti */ }
    this._surFrappe = null;
  }

  dessiner() {
    if (!this.el) return;
    this.rangee.textContent = '';
    this.boutons = [];
    const s = this.greffon.settings;
    this.el.classList.toggle('est-compacte', s.barreCompacte === true);
    this.el.classList.toggle('est-enroulee', s.barreDefilement !== 'defiler');
    if (Number(s.barreTailleIcone) > 0) {
      this.el.style.setProperty('--zfa-barre-icone', Number(s.barreTailleIcone) + 'px');
    }
    const entrees = Array.isArray(s.barreBoutons) && s.barreBoutons.length
      ? s.barreBoutons : barreDefaut();
    for (const e of entrees) this.poser(this.rangee, e);
    // Le rang de chaque élément règle son délai d'entrée : à l'ouverture, les
    // boutons arrivent de gauche à droite, en cascade.
    Array.from(this.rangee.children).forEach((x, i) => x.style.setProperty('--zfa-rang', String(i)));
    this.majEtats();
  }

  // Une entrée de la disposition devient un élément de la barre.
  poser(hote, entree) {
    if (!entree) return;
    if (entree.separateur) {
      const sep = this.doc.createElement('div');
      sep.className = 'zfa-barre-separateur';
      hote.appendChild(sep);
      return;
    }
    if (entree.groupe) { this.poserGroupe(hote, entree); return; }
    if (!entree.cmd) return;
    const def = this.definition(entree.cmd);
    if (!def) return;   // commande absente : un greffon désactivé, par exemple
    const b = this.bouton(hote, def.icone, def.nom);
    b.addEventListener('click', (ev) => { ev.preventDefault(); this.lancer(entree.cmd, b); });
    this.boutons.push({ el: b, id: entree.cmd });
  }

  poserGroupe(hote, entree) {
    const b = this.bouton(hote, entree.icone || 'chevron-down', tr(entree.groupe));
    b.classList.add('est-groupe');
    const fleche = this.doc.createElement('span');
    fleche.className = 'zfa-barre-fleche';
    b.appendChild(fleche);
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      const menu = new obsidian.Menu();
      let vide = true;
      for (const sous of (entree.elements || [])) {
        if (sous.separateur) { menu.addSeparator(); continue; }
        const def = this.definition(sous.cmd);
        if (!def) continue;
        vide = false;
        menu.addItem((i) => i.setTitle(def.nom).setIcon(def.icone)
          .onClick(() => this.lancer(sous.cmd, b)));
      }
      if (vide) menu.addItem((i) => i.setTitle(tr('Aucune commande disponible')).setDisabled(true));
      menu.showAtMouseEvent(ev);
    });
  }

  bouton(hote, icone, infobulle) {
    const b = this.doc.createElement('button');
    b.className = 'zfa-barre-bouton';
    b.type = 'button';
    if (icone) obsidian.setIcon(b, icone);
    if (infobulle) {
      if (obsidian.setTooltip) obsidian.setTooltip(b, infobulle, { placement: 'bottom' });
      b.setAttribute('aria-label', infobulle);
    }
    // Sans cela, appuyer sur un bouton retire le focus du texte, et la
    // sélection s'efface avant que la commande ne s'exécute.
    b.addEventListener('mousedown', (ev) => ev.preventDefault());
    hote.appendChild(b);
    return b;
  }

  // Nom et icône d'une commande, qu'elle vienne d'Ariane, d'Obsidian ou d'un
  // autre greffon. Rend null si la commande n'existe pas ici.
  definition(id) {
    const mienne = barreCommandeAriane(id);
    const cmd = this.greffon.app.commands.commands[id];
    if (!cmd && !mienne) return null;
    const nom = cmd ? cmd.name : tr(mienne.nom);
    const icone = (mienne && mienne.icone) || BARRE_ICONES_OBSIDIAN[id]
      || (cmd && cmd.icon) || 'dot';
    return { nom, icone, marque: (mienne && mienne.marque) || BARRE_MARQUES_OBSIDIAN[id] || '' };
  }

  // Les couleurs ouvrent leur palette sous le bouton ; tout le reste passe
  // par la commande, pour que la barre ne double jamais un comportement.
  lancer(id, bouton) {
    const suite = id.startsWith(BARRE_PREFIXE) ? id.slice(BARRE_PREFIXE.length) : '';
    if (suite === 'md-couleur-texte' || suite === 'md-couleur-fond') {
      const ed = this.editeur;
      if (!ed) return;
      this.chef.ouvrirPalette(ed, this.vue, suite === 'md-couleur-fond' ? 'fond' : 'texte', bouton);
      return;
    }
    this.chef.executer(id, this.vue);
  }

  // Allume les boutons dont la mise en forme est déjà sous le curseur.
  majEtats() {
    const ed = this.editeur;
    for (const b of this.boutons) {
      let actif = false;
      const suite = b.id.startsWith(BARRE_PREFIXE) ? b.id.slice(BARRE_PREFIXE.length) : '';
      if (suite === 'md-pinceau') actif = !!this.chef.pinceau;
      else if (suite === 'citations-basculer') actif = this.greffon.settings.citationsRepliees === true;
      else if (suite === 'correcteur-volet') {
        actif = !!(this.greffon.correcteur && this.greffon.correcteur.voletVisible());
      } else if (suite === 'note-plein-ecran') {
        actif = !!(this.vue.containerEl && this.vue.containerEl.closest('.zfa-volet-pleine-page'));
      } else if (ed) {
        const titre = /^md-titre-(\d)$/.exec(suite);
        if (titre) {
          const l = ed.getLine(ed.getCursor().line) || '';
          const m = /^\s*(#{1,6})[ \t]/.exec(l);
          actif = !!m && m[1].length === Number(titre[1]);
        } else {
          const def = this.definition(b.id);
          if (def && def.marque) actif = barreMarqueActive(ed, def.marque);
        }
      }
      b.el.classList.toggle('est-actif', actif);
    }
  }
}

// ── BarrePalette : le choix d'une couleur, sous le bouton ────────────────
//  Un petit panneau construit dans le document du volet (donc juste, même
//  dans une fenêtre détachée), qui se ferme au premier clic ailleurs.

class BarrePalette {
  constructor(doc, options) {
    this.doc = doc;
    this.o = options || {};
    this.el = null;
    this._fermer = null;
  }

  ouvrir() {
    this.el = this.doc.createElement('div');
    this.el.className = 'zfa-barre-palette';
    const titre = this.doc.createElement('div');
    titre.className = 'zfa-barre-palette-titre';
    titre.textContent = this.o.titre || '';
    this.el.appendChild(titre);

    const grille = this.doc.createElement('div');
    grille.className = 'zfa-barre-palette-grille';
    for (const c of (this.o.couleurs || [])) this.pastille(grille, c);
    this.el.appendChild(grille);

    const pied = this.doc.createElement('div');
    pied.className = 'zfa-barre-palette-pied';
    const libre = this.doc.createElement('input');
    libre.type = 'color';
    libre.className = 'zfa-barre-palette-libre';
    libre.setAttribute('aria-label', tr('Autre couleur'));
    libre.addEventListener('change', async () => {
      const c = libre.value;
      if (this.o.surMemoriser) await this.o.surMemoriser(c);
      if (this.o.surChoix) this.o.surChoix(c);
      this.fermer();
    });
    pied.appendChild(libre);
    const retirer = this.doc.createElement('button');
    retirer.type = 'button';
    retirer.className = 'zfa-barre-palette-retirer';
    retirer.textContent = tr('Retirer');
    retirer.addEventListener('click', () => {
      if (this.o.surRetrait) this.o.surRetrait();
      this.fermer();
    });
    pied.appendChild(retirer);
    this.el.appendChild(pied);

    this.doc.body.appendChild(this.el);
    this.placer();
    const dehors = (e) => { if (!this.el || !this.el.contains(e.target)) this.fermer(); };
    const echap = (e) => { if (e.key === 'Escape') this.fermer(); };
    // En capture, et au tour de boucle suivant : sinon le clic qui vient
    // d'ouvrir le panneau le referme aussitôt.
    const fenetre = this.doc.defaultView || window;
    fenetre.setTimeout(() => {
      this.doc.addEventListener('mousedown', dehors, true);
      this.doc.addEventListener('keydown', echap, true);
    }, 0);
    this._fermer = () => {
      this.doc.removeEventListener('mousedown', dehors, true);
      this.doc.removeEventListener('keydown', echap, true);
    };
    return this;
  }

  pastille(hote, couleur) {
    const p = this.doc.createElement('button');
    p.type = 'button';
    p.className = 'zfa-barre-pastille';
    p.style.background = couleur;
    p.setAttribute('aria-label', couleur);
    if (obsidian.setTooltip) obsidian.setTooltip(p, couleur);
    p.addEventListener('mousedown', (e) => e.preventDefault());
    p.addEventListener('click', () => {
      if (this.o.surChoix) this.o.surChoix(couleur);
      this.fermer();
    });
    hote.appendChild(p);
  }

  // Sous le bouton, recadrée pour ne pas sortir de la fenêtre.
  placer() {
    const ancre = this.o.ancre;
    const vue = this.doc.documentElement;
    const cadre = this.el.getBoundingClientRect();
    let x = Math.max(8, (vue.clientWidth - cadre.width) / 2);
    let y = Math.max(8, (vue.clientHeight - cadre.height) / 2);
    if (ancre && ancre.getBoundingClientRect) {
      const r = ancre.getBoundingClientRect();
      x = Math.min(Math.max(8, r.left), vue.clientWidth - cadre.width - 8);
      y = r.bottom + 6;
      if (y + cadre.height > vue.clientHeight - 8) y = Math.max(8, r.top - cadre.height - 6);
    }
    this.el.style.left = Math.round(x) + 'px';
    this.el.style.top = Math.round(y) + 'px';
  }

  fermer() {
    if (this._fermer) { try { this._fermer(); } catch (e) { /* fenêtre partie */ } }
    this._fermer = null;
    if (this.el && this.el.parentElement) this.el.parentElement.removeChild(this.el);
    this.el = null;
  }
}

// ── ModaleBarreTexte : les quelques commandes qui posent une question ─────
//  Couper sur un séparateur, numéroter, extraire entre deux repères. Une
//  seule modale pour les trois, décrite par une liste de champs.

class ModaleBarreTexte extends obsidian.Modal {
  static demander(greffon, options, surValider) {
    new ModaleBarreTexte(greffon, options, surValider).open();
  }

  constructor(greffon, options, surValider) {
    super(greffon.app);
    this.greffon = greffon;
    this.o = options || {};
    this.surValider = surValider;
    this.valeurs = {};
    for (const c of (this.o.champs || [])) this.valeurs[c.cle] = c.case ? false : (c.valeur || '');
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('zfa-barre-modale');
    contentEl.createEl('h3', { text: tr(this.o.titre || '') });
    let premier = null;
    for (const c of (this.o.champs || [])) {
      const reglage = new obsidian.Setting(contentEl).setName(tr(c.nom));
      if (c.aide) reglage.setDesc(tr(c.aide));
      if (c.case) {
        reglage.addToggle((t) => t.setValue(!!this.valeurs[c.cle])
          .onChange((v) => { this.valeurs[c.cle] = v; }));
      } else {
        reglage.addText((t) => {
          t.setValue(this.valeurs[c.cle]).onChange((v) => { this.valeurs[c.cle] = v; });
          if (!premier) premier = t.inputEl;
          t.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.valider(); }
          });
        });
      }
    }
    new obsidian.Setting(contentEl)
      .addButton((b) => b.setButtonText(tr('Annuler')).onClick(() => this.close()))
      .addButton((b) => b.setButtonText(tr('Appliquer')).setCta().onClick(() => this.valider()));
    if (premier) premier.focus();
  }

  valider() {
    const v = this.valeurs;
    this.close();
    try { this.surValider(v); } catch (e) {
      console.error('[Ariane] barre d’édition :', e);
      new obsidian.Notice(tr('L’opération a échoué : ') + (e && e.message ? e.message : e));
    }
  }

  onClose() { this.contentEl.empty(); }
}

// ── ModaleChoixCommande : ajouter un bouton depuis les réglages ──────────
//  Toutes les commandes de la palette y passent, celles d'Ariane comme
//  celles d'Obsidian ou d'un autre greffon : c'est ce qui rend la barre
//  ouverte au reste du coffre.

class ModaleChoixCommande extends obsidian.FuzzySuggestModal {
  constructor(app, surChoix) {
    super(app);
    this.surChoix = surChoix;
    this.setPlaceholder(tr('Chercher une commande à ajouter à la barre…'));
  }

  getItems() {
    const liste = this.app.commands.listCommands ? this.app.commands.listCommands() : [];
    return liste.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
  }

  getItemText(c) { return c.name; }

  onChooseItem(c) { if (c && this.surChoix) this.surChoix(c.id); }
}

//#endregion 21 · Barre d'édition

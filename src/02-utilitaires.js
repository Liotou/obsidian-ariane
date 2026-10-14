//#region 2 · Utilitaires génériques
// ═══════════════════════════════════════════════════════════════════════════
//  2 · UTILITAIRES GÉNÉRIQUES
//  Petits helpers chaîne / date / format sans domaine propre, partagés par
//  plusieurs sections.
// ═══════════════════════════════════════════════════════════════════════════

function echapperRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Nom complet de l'auteur tel qu'utilisé dans Zotero, normalisé en
// « Prénom Nom » (accepte aussi « Nom, Prénom »).
// Retire un éventuel balisage de lien [[...]] (et son alias) d'un nom d'auteur.
// Les « creators » des notes source ZotFlow sont désormais des liens, il faut
// donc les dé-baliser avant de nommer les fiches auteurs ou de comparer.
function sansLien(s) {
  return String(s == null ? '' : s)
    .replace(/^\s*!?\[\[/, '')
    .replace(/\]\]\s*$/, '')
    .replace(/\|.*$/, '')
    .trim();
}

// Normalise un DOI : minuscule, sans préfixe URL ni « doi: ».
// Þórvaldsdóttir, Ylvänen, Mérivel, Santaúl : sans cette normalisation, une simple
// mise en minuscules laisse les diacritiques et l'appariement échoue dès que
// les deux graphies diffèrent d'un accent.
function sansAccents(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normDoi(s) {
  if (!s) return '';
  return String(s)
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    // Tirets Unicode (‐ ‑ ‒ – — −) -> tiret ASCII : Crossref en renvoie parfois,
    // ce qui empêchait la correspondance avec un DOI Zotero écrit normalement.
    .replace(/[‐‑‒–—−]/g, '-')
    .trim()
    .toLowerCase();
}

function jourIsoDe(d) {
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// Horodatage AAAAMMJJhhmm à partir d'un temps (ms), pour NC-AAAAMMJJhhmm.
function horodatageNC(ms) {
  const d = new Date(ms || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes())
  );
}

// « 95 » -> « 1 h 35 ». Les minutes seules restent lisibles jusqu'à 59.
function dureeLisible(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? h + ' h ' + String(r).padStart(2, '0') : h + ' h';
}

// Regroupe les entrées d'une même source : deux annotations d'un même travail
// ne font qu'une citation, et leurs pages se cumulent dans un seul suffixe.
// « a, b et c ». Le dernier terme est amené par « et », ce qui marque la fin
// de l'énumération sans recourir au point-virgule.
function enumererFrancais(liste) {
  if (liste.length <= 1) return liste.join('');
  return liste.slice(0, -1).join(', ') + ' et ' + liste[liste.length - 1];
}

// Dans un tableau, Obsidian échappe la barre verticale du lien :
// « [[@clé\|libellé]] ». La clé capturée emporte alors l'antislash, la note
// n'est plus retrouvée, et la référence disparaissait à la fois de la
// bibliographie de fin de note et des champs Zotero de l'export Word.
function cleDeLien(x) {
  return String(x == null ? '' : x).replace(/\\+$/, '').trim();
}

// Neutralise le contenu des liens [[…]] en conservant la longueur du texte :
// les points d'une citation (« p. 2 ») ne doivent pas passer pour des fins de
// phrase. Les positions calculées restent donc valables sur le texte d'origine.
function masquerLiens(texte) {
  return String(texte).replace(/\[\[[^\]]*\]\]/g, (m) => '·'.repeat(m.length));
}

// Fin de la phrase contenant l'offset (index juste après le point/? /! ).
// Sert au dépôt « par phrase » : place l'appel de note en fin de phrase.
function finDePhrase(texte, off) {
  const re = /[.?!…](?=\s|$)/g;
  re.lastIndex = Math.max(0, Math.min(off, texte.length));
  const m = re.exec(masquerLiens(texte));
  return m ? m.index + 1 : texte.length;
}

// Début de la phrase contenant l'offset : index juste après le dernier
// point/? /! qui précède l'offset, espaces de tête ignorés.
// Comme finDePhrase, mais renvoie l'index DE la ponctuation finale (donc juste
// avant le point), afin de poser l'appel de note avant celui-ci.
function finDePhraseAvantPonct(texte, off) {
  const re = /[.?!…](?=\s|$)/g;
  re.lastIndex = Math.max(0, Math.min(off, texte.length));
  const m = re.exec(masquerLiens(texte));
  if (!m) return texte.length;
  // Typographie française : « … frontière ? » garde son espace avant le point
  // d'interrogation. On remonte donc avant l'espace qui précède la ponctuation.
  let i = m.index;
  while (i > 0 && /[ \t\u00a0\u202f]/.test(texte[i - 1])) i--;
  return i;
}

function debutPhrase(texte, off) {
  const re = /[.?!…](?=\s|$)/g;
  const masque = masquerLiens(texte);
  let start = 0, m;
  while ((m = re.exec(masque)) !== null) {
    if (m.index + 1 <= off) start = m.index + 1;
    else break;
  }
  while (start < texte.length && /\s/.test(texte[start])) start++;
  return start;
}

// ── Ponctuation insécable ──
//  En texte justifié, le navigateur coupait une ligne entre une parenthèse
//  et son mot : « ( » seule en fin de ligne quand une espace la suivait,
//  « ) » seule en début de ligne après un mot en italique (les astérisques
//  masqués de l'éditeur lui laissent un point de coupure). On soude donc la
//  ponctuation au mot qu'elle touche.

const PONCT_FERMANTE = ')»”;:!?.,…';
const PONCT_OUVRANTE = '(«“';
const ESPACE_LIGNE = /[ \t\u00a0\u202f]/;

// Les plages d'une ligne de source à ne jamais couper. Seuls les cas où une
// coupure est possible sont retenus : une espace entre la ponctuation et
// son mot, ou une marque de mise en forme ou de lien (« *éco*) »,
// « ([[clé|Auteur… »). Les plages qui se touchent sont réunies ; une plage
// trop longue, ou qui contient une intégration ou des mathématiques, est
// laissée : mieux vaut une coupure qu'une ligne qui déborde.
function plagesInsecables(ligne) {
  const t = String(ligne == null ? '' : ligne);
  const marqueAvant = /[*_~=`\]>]/;
  const marqueApres = /[*_~=`[<]/;
  const brutes = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (PONCT_FERMANTE.includes(c)) {
      let k = i;
      while (k > 0 && ESPACE_LIGNE.test(t[k - 1])) k--;
      if (k === 0) continue;
      if (k === i && !marqueAvant.test(t[k - 1])) continue;
      let d = k;
      while (d > 0 && !/\s/.test(t[d - 1])) d--;
      if (k - d > 60) d = k - 1;
      let f = i + 1;
      while (f < t.length && PONCT_FERMANTE.includes(t[f])) f++;
      brutes.push([d, f]);
      i = f - 1;
    } else if (PONCT_OUVRANTE.includes(c)) {
      let k = i + 1;
      while (k < t.length && ESPACE_LIGNE.test(t[k])) k++;
      if (k >= t.length) continue;
      if (k === i + 1 && !marqueApres.test(t[k])) continue;
      let f = k;
      while (f < t.length && !/\s/.test(t[f])) f++;
      if (f - k > 60) f = k + 1;
      brutes.push([i, f]);
    }
  }
  brutes.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of brutes) {
    const der = out[out.length - 1];
    if (der && a <= der[1]) der[1] = Math.max(der[1], b);
    else out.push([a, b]);
  }
  return out.filter(([a, b]) => b - a <= 120 && !/!\[\[|\$/.test(t.slice(a, b)));
}

// Le même principe pour un texte déjà rendu (mode lecture) : l'espace qui
// sépare une ponctuation de son mot devient insécable.
function souderPonctuation(texte) {
  return String(texte == null ? '' : texte)
    .replace(/([(«“])[ \t]+(?=\S)/g, '$1\u00a0')
    .replace(/(?<=\S)[ \t]+(?=[)»”;:!?…])/g, '\u00a0');
}

// ── Numérotation des titres ──
//  « ## » vaut 1., « ### » 1.1., « #### » 1.1.1., et ainsi de suite. Les
//  numéros sont écrits dans la note (« ## 1.1. Titre ») et tenus à jour par
//  Ariane ; l'éditeur les grise et les protège de la frappe. Une
//  numérotation saisie à la main (« 1) », « 2.3 », « II - ») est remplacée.
//  Une note sans « ## » part de son plus haut niveau de titre ; un niveau
//  sauté compte zéro. Restent hors numérotation : le code, le titre de la
//  bibliographie d'Ariane et les notes qui portent « numérotation: false ».

// Numérotation en tête d'un texte de titre, saisie à la main ou posée par
// Ariane, collée ou non au texte (« 1.Cadrage »). « 2026 : bilan » ou
// « 3 questions » n'en sont pas.
const RE_NUMERO_TITRE = /^(?:(?:\d+(?:\.\d+)+\.?|\d+[.)])[ \t]*|[IVXLC]+[ \t]*[.)\-\u2013\u2014][ \t]+)(?=\S)/;

// Les titres numérotables d'une note : [{ ligne, niveau, texte }], ou null
// si la note s'en dispense.
function releverTitres(lignes) {
  const l = Array.isArray(lignes) ? lignes : String(lignes == null ? '' : lignes).split('\n');
  let i = 0;
  if (l[0] !== undefined && l[0].trim() === '---') {
    let j = 1;
    while (j < l.length && l[j].trim() !== '---') {
      if (/^num[ée]rotation\s*:\s*["']?(false|non|no)["']?\s*$/i.test(l[j])) return null;
      j++;
    }
    if (j < l.length) i = j + 1;
  }
  const titres = [];
  let cloture = '';
  for (; i < l.length; i++) {
    const t = l[i];
    const f = t.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      if (!cloture) cloture = f[1][0];
      else if (f[1][0] === cloture) cloture = '';
      continue;
    }
    if (cloture) continue;
    const m = t.match(/^(#{2,6})[ \t]+(\S.*)$/);
    if (!m) continue;
    // Le titre que tient Ariane au-dessus de sa bibliographie.
    let k = i + 1;
    while (k < l.length && !l[k].trim()) k++;
    if (k < l.length && l[k].trim() === ZFA_BIBLIO_DEBUT) continue;
    titres.push({ ligne: i, niveau: m[1].length, texte: m[2] });
  }
  return titres;
}

// Le numéro de chaque titre, par indice de ligne (0 en tête).
function numerosTitres(lignes) {
  return numerosDepuisTitres(releverTitres(lignes));
}

// Le calcul lui-même, sur des titres relevés ({ ligne, niveau }).
function numerosDepuisTitres(liste) {
  const titres = (liste || []).filter((x) => x && x.niveau >= 2 && x.niveau <= 6);
  const out = new Map();
  if (!titres.length) return out;
  const base = Math.min(...titres.map((x) => x.niveau));
  const c = [0, 0, 0, 0, 0];
  for (const { ligne, niveau } of titres) {
    const k = niveau - base;
    c[k] += 1;
    for (let j = k + 1; j < c.length; j++) c[j] = 0;
    out.set(ligne, c.slice(0, k + 1).join('.') + '.');
  }
  return out;
}

// Réécrit les titres d'une note avec leur numéro. Rend { texte,
// changements: [{ ligne, ancien, nouveau }] } (textes de titre, pour
// reporter le changement dans les liens « [[note#titre]] »).
function renumeroterTitres(texte) {
  const src = String(texte == null ? '' : texte);
  const lignes = src.split('\n');
  const titres = releverTitres(lignes);
  if (!titres) return { texte: src, changements: [] };
  const numeros = numerosDepuisTitres(titres);
  const changements = [];
  for (const t of titres) {
    const n = numeros.get(t.ligne);
    if (!n) continue;
    const m = lignes[t.ligne].match(/^(#{2,6}[ \t]+)(.*)$/);
    const ancien = m[2];
    const nouveau = n + ' ' + ancien.replace(RE_NUMERO_TITRE, '');
    if (nouveau === ancien) continue;
    lignes[t.ligne] = m[1] + nouveau;
    changements.push({ ligne: t.ligne, ancien: ancien.trim(), nouveau: nouveau.trim() });
  }
  return { texte: changements.length ? lignes.join('\n') : src, changements };
}

// Le numéro posé en tête d'une ligne de titre : { debut, fin } (espaces
// suivantes comprises), ou null.
function numeroDeLigneTitre(ligne) {
  const m = String(ligne || '').match(/^(#{2,6}[ \t]+)(\d+(?:\.\d+)*\.)[ \t]+/);
  return m ? { debut: m[1].length, fin: m[0].length } : null;
}

// Reporte le nouveau texte d'un titre dans les liens qui le visent :
// « [[Note#1.2. Ancien]] », « ![[Note#…|alias]] », et « [[#…]] » quand le
// lien est dans la note même (`memeNote`). `nom` : le nom de la note visée.
function majLiensTitre(texte, nom, ancien, nouveau, memeNote) {
  const re = new RegExp('(!?\\[\\[)([^\\]|#\\n]*)#' + echapperRegex(ancien) + '(?=[\\]|])', 'g');
  return String(texte).replace(re, (tout, ouv, cible) => {
    const c = cible.trim();
    const vise = c ? c.split('/').pop().replace(/\.md$/i, '') === nom : !!memeNote;
    return vise ? ouv + cible + '#' + nouveau : tout;
  });
}

//#endregion 2 · Utilitaires génériques


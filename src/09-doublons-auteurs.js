//#region 9 · Doublons d'auteurs
// ═══════════════════════════════════════════════════════════════════════════
//  9 · DOUBLONS D'AUTEURS
//  Normalisation de noms, détection de personnes identiques, regroupement
//  des œuvres d'un même auteur.
// ═══════════════════════════════════════════════════════════════════════════

function normNom(x) {
  return String(x || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[‐‑‒–—−]/g, '-')
    .toLowerCase().replace(/\./g, ' ').replace(/[^a-z0-9\- ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function tokensNom(x) { return normNom(x).replace(/-/g, ' ').split(' ').filter(Boolean); }
function surnameKey(name) {
  const t = tokensNom(name);
  if (!t.length) return '';
  let sur = t[t.length - 1];
  if (sur.length < 3 && t.length > 1) sur = t[0];
  return sur;
}
// Deux noms partageant le nom de famille désignent-ils la même personne ?
function memePersonne(a, b) {
  const fa = tokensNom(a).slice(0, -1), fb = tokensNom(b).slice(0, -1);
  const fullA = new Set(fa.filter((x) => x.length > 1));
  const fullB = new Set(fb.filter((x) => x.length > 1));
  const initA = fa.filter((x) => x.length === 1);
  const initB = fb.filter((x) => x.length === 1);
  if (!fullA.size && !fullB.size) return true;
  if (fullA.size && fullB.size) {
    for (const w of fullA) if (fullB.has(w)) return true;
    return false;
  }
  const full = fullA.size ? fullA : fullB;
  const inits = initA.length ? initA : initB;
  for (const i of inits) { let ok = false; for (const w of full) if (w[0] === i) ok = true; if (!ok) return false; }
  return true;
}
function meilleurCanonique(membres) {
  const acc = (x) => (/[^\x00-\x7f]/.test(x) ? 1 : 0);
  const hy = (x) => (x.includes('-') ? 1 : 0);
  const pleins = (x) => tokensNom(x).slice(0, -1).filter((t) => t.length > 1).length;
  return membres.slice().sort((a, b) =>
    (pleins(b) - pleins(a)) || (acc(b) - acc(a)) || (hy(b) - hy(a)) || (b.length - a.length))[0];
}
// Regroupe des noms (déjà hors copies de conflit) en clusters de même personne.
function clustersDoublons(noms) {
  const groupes = new Map();
  for (const n of noms) {
    const k = surnameKey(n);
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(n);
  }
  const clusters = [];
  for (const membres of groupes.values()) {
    if (membres.length < 2) continue;
    const used = new Set();
    for (let i = 0; i < membres.length; i++) {
      if (used.has(membres[i])) continue;
      const grp = [membres[i]]; used.add(membres[i]);
      for (let j = i + 1; j < membres.length; j++) {
        if (!used.has(membres[j]) && memePersonne(membres[i], membres[j])) { grp.push(membres[j]); used.add(membres[j]); }
      }
      if (grp.length > 1) clusters.push(grp);
    }
  }
  return clusters;
}

// Rend une grappe de citations. Chaque entrée résolue est soit une chaîne
// déjà prête, soit { cle, page, travaux } : une source consultée, sa page, et
// les travaux qu'elle rapporte.
//
// Le regroupement se fait ici, à l'échelle de la GRAPPE et non de l'annotation.
// Plusieurs annotations d'une même source se retrouvent souvent côte à côte :
// elles produisaient alors autant de citations du même ouvrage, qu'APA
// regroupait en effaçant le nom de l'auteur à partir de la deuxième —
// « … cité dans Dresch et al., 2015, p. 48, 2015, p. 52, … ». Une source ne
// paraît donc plus qu'une fois, ses pages cumulées et ses travaux rapportés
// réunis.
// « Le Moigne, 1994 » et « Le Moigne, 1994, p. 228 » désignent le même travail,
// le second en précisant la page. On garde le plus précis, et jamais les deux.
function ajouterTravail(liste, travail) {
  const t = String(travail || '').trim();
  if (!t) return;
  for (let i = 0; i < liste.length; i++) {
    if (t.indexOf(liste[i]) === 0) { liste[i] = t; return; }   // le nouveau précise
    if (liste[i].indexOf(t) === 0) return;                     // l'ancien précise déjà
  }
  liste.push(t);
}

// Les pages d'une même source, remises en ordre : les liminaires en chiffres
// romains d'abord, puis les pages numérotées par ordre croissant. Sans cela
// elles sortaient dans l'ordre où les annotations se présentent — « 48, vii,
// 62, 52, 50, 53 » — ce qui ne se lit pas.
function ordonnerPages(pages) {
  const rang = (p) => {
    const n = parseInt(String(p).replace(/^\D+/, ''), 10);
    if (/^[ivxlcdm]+$/i.test(String(p).trim())) return [0, 0, String(p).toLowerCase()];
    return isNaN(n) ? [2, 0, String(p)] : [1, n, ''];
  };
  return pages.slice().sort((a, b) => {
    const ra = rang(a), rb = rang(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || String(ra[2]).localeCompare(String(rb[2]));
  });
}

function rendreGrappe(entrees, connecteur) {
  const lien = connecteur || ', cité dans ';
  const ordre = [];
  const parCle = new Map();
  for (const e of entrees) {
    if (typeof e === 'string') { ordre.push(e); continue; }
    if (!e || !e.cle) continue;
    if (!parCle.has(e.cle)) { parCle.set(e.cle, { pages: [], travaux: [] }); ordre.push({ cle: e.cle }); }
    const g = parCle.get(e.cle);
    // « vii,62 » vaut deux pages : on les sépare pour ne pas les redoubler.
    for (const page of String(e.page || '').split(',')) {
      const v = page.trim();
      if (v && g.pages.indexOf(v) === -1) g.pages.push(v);
    }
    for (const t of (e.travaux || [])) ajouterTravail(g.travaux, t);
  }
  return ordre.map((x) => {
    if (typeof x === 'string') return x;
    const g = parCle.get(x.cle);
    const source = '@' + x.cle
      + (g.pages.length ? ', p. ' + ordonnerPages(g.pages).join(', ') : '');
    return g.travaux.length ? enumererFrancais(g.travaux) + lien + source : source;
  });
}

// Retire la numérotation saisie à la main en tête de titre : « 2.1 Titre »,
// « II - Titre », « 3) Titre ». Word la reprendra automatiquement.
function titreSansNumerotation(txt) {
  return String(txt)
    .replace(/^\s*(?:\d+(?:[.)]\d+)*|[IVXLCDM]+)\s*[.)\-–—]\s+/, '')
    .replace(/^\s*(?:\d+(?:\.\d+)*)\s+(?=\S)/, '')
    .trim();
}

//#endregion 9 · Doublons d'auteurs


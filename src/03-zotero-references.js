//#region 3 · Références Zotero — parsing & appariement
// ═══════════════════════════════════════════════════════════════════════════
//  3 · RÉFÉRENCES ZOTERO — parsing & appariement
//  Analyse des noms d'auteurs, appariement d'une référence à une entrée
//  Zotero, import depuis Crossref / OpenAlex, construction d'une note
//  « référence ».
// ═══════════════════════════════════════════════════════════════════════════

function nomCompletAuteur(c) {
  let s = sansLien(c);
  if (!s) return '';
  if (s.includes(',')) {
    const parts = s.split(',');
    s = (parts.slice(1).join(',').trim() + ' ' + parts[0].trim()).trim();
  }
  return s.replace(/\s+/g, ' ');
}

// Remplace la conjonction entre auteurs (« et », « and ») par « & »,
// en préservant « et al. ». Ex. « Bird et Tobin, 2018 » -> « Bird & Tobin, 2018 ».
function normaliserConjAuteurs(s) {
  if (!s) return s;
  let out = String(s).replace(/\bet\s+al\.?/gi, '@@ETAL@@');
  out = out.replace(/\s+et\s+/g, ' & ').replace(/\s+and\s+/gi, ' & ');
  out = out.replace(/@@ETAL@@/g, 'et al.');
  return out;
}

// Analyse "Auteur(s), Année" -> { nom, auteurs[], annee, annee4, premierAuteur }.
// L'année peut porter un suffixe de désambiguïsation (2005a, 2005b) propre à la
// bibliographie de la source : on le conserve pour ne pas fusionner des
// références distinctes. annee4 = les 4 chiffres seuls (pour l'appariement Zotero).
function parseNomReference(nom, cfg) {
  const mc = nom.match(/^(.+?),\s*(\d{4}[a-z]?)/i);
  if (!mc) return null;
  const auteurComplet = mc[1].trim();
  const annee = mc[2].trim();
  const annee4 = (annee.match(/\d{4}/) || [''])[0];
  let auteurs;
  if (/\bet\s+(?:al|coll)\.?/i.test(auteurComplet)) {
    auteurs = [auteurComplet.replace(/\s+et\s+(?:al|coll)\.?.*$/i, '').trim()];
  } else {
    let sep;
    try {
      sep = new RegExp((cfg && cfg.separateurAuteurs) || '\\s+(?:and|et|&)\\s+|\\s*,\\s*', 'i');
    } catch (e) {
      sep = /\s+(?:and|et|&)\s+|\s*,\s*/i;
    }
    auteurs = auteurComplet
      .split(sep)
      .map((a) => a.trim().replace(/^(?:&|and|et)\s+/i, ''))
      .filter((a) => a.length > 0);
  }
  // Page éventuelle après l'année : « , p. 345 », « pp. 12-14 ».
  let page = '';
  const restePage = nom.slice(mc.index + mc[0].length);
  const mp = restePage.match(/pp?\.?\s*([0-9]+(?:\s*[-–—]\s*[0-9]+)?)/i);
  if (mp) page = mp[1].replace(/\s*[-–—]\s*/, '-').trim();
  return {
    nom: normaliserConjAuteurs(`${auteurComplet}, ${annee}`),
    auteurComplet,
    annee,
    annee4,
    etAl: /\bet\s+(?:al|coll)\.?/i.test(auteurComplet),
    auteurs,
    premierAuteur: auteurs[0] || auteurComplet,
    page,
  };
}

// Analyse une citation « auteur seul » (sans année) -> lien direct vers
// l'auteur, sans note de référence intermédiaire. Renvoie null si la chaîne
// contient une année (c'est alors une vraie référence) ou n'a pas de nom propre.
function parseAuteurSeul(nom, cfg) {
  const s = normaliserConjAuteurs(String(nom || '').trim());
  if (!s) return null;
  if (/\d{4}/.test(s)) return null; // contient une année -> pas « auteur seul »
  if (!/[A-ZÀ-Ÿ]/.test(s)) return null; // aucun nom propre capitalisé -> ignorer
  let auteurs;
  if (/\bet\s+(?:al|coll)\.?/i.test(s)) {
    auteurs = [s.replace(/\s+et\s+(?:al|coll)\.?.*$/i, '').trim()];
  } else {
    let sep;
    try {
      sep = new RegExp((cfg && cfg.separateurAuteurs) || '\\s+(?:and|et|&)\\s+|\\s*,\\s*', 'i');
    } catch (e) {
      sep = /\s+(?:and|et|&)\s+|\s*,\s*/i;
    }
    auteurs = s
      .split(sep)
      .map((a) => a.trim().replace(/^(?:&|and|et)\s+/i, ''))
      .filter((a) => a.length > 0);
  }
  if (!auteurs.length) return null;
  return {
    estAuteurSeul: true,
    nom: s,
    auteurComplet: s,
    annee: '',
    annee4: '',
    auteurs,
    premierAuteur: auteurs[0] || s,
  };
}

// Compile les profils (chaînes -> RegExp), en ignorant les profils invalides.
function compilerProfils(cfg) {
  const out = [];
  for (const p of cfg.profils || []) {
    try {
      out.push({
        nom: p.nom,
        titre: new RegExp(p.titreRegex),
        reference: p.referenceRegex ? new RegExp(p.referenceRegex) : null,
      });
    } catch (e) {
      console.error('[Ariane] Profil invalide ignoré :', p.nom, e);
    }
  }
  return out;
}

// Cherche une source Zotero correspondante (1er auteur + année).
// Noms de famille (minuscule) des auteurs cités d'une référence.
function surnamesReference(ref) {
  return (ref && ref.auteurs ? ref.auteurs : [])
    .map((a) => sansAccents(sansLien(String(a)).trim().split(/\s+/).pop()))
    .filter(Boolean);
}

// Force d'appariement entre une référence citée et une entrée d'index Zotero.
// 'fort'   : année + TOUS les auteurs cités présents (haute certitude).
// 'faible' : « et al. » (seul le premier auteur connu) + année + 1er auteur présent.
// null     : pas de correspondance.
function appariementSource(ref, entree) {
  if (!ref || !entree) return null;
  const an = ref.annee4 || ref.annee;
  if (!an || !entree.annee || entree.annee !== an) return null;
  const rs = surnamesReference(ref);
  if (!rs.length) return null;
  const liste = entree.surnames || [];
  const es = new Set(liste);
  if (!es.size) return null;
  if (ref.etAl) {
    // « Renn et al., 2011 » doit désigner une fiche dont Renn est le PREMIER
    // auteur. Se contenter de sa présence quelque part dans la liste rattachait
    // à des travaux où l'auteur cité n'est que co-signataire : vérifié, quatre
    // faux appariements sur vingt-six.
    return rs[0] === liste[0] ? 'fort' : (es.has(rs[0]) ? 'faible' : null);
  }
  return rs.every((s) => es.has(s)) ? 'fort' : null;
}

// Tous les candidats (les 'fort' d'abord) pour une référence citée.
function candidatsSource(ref, indexZotero) {
  const out = [];
  for (const z of indexZotero || []) {
    const m = appariementSource(ref, z);
    if (m) out.push({ entree: z, force: m });
  }
  out.sort((a, b) => (a.force === b.force ? 0 : a.force === 'fort' ? -1 : 1));
  return out;
}

// Source Zotero CERTAINE pour l'auto-rattachement (construireNote) : un unique
// appariement 'fort', jamais pour une référence à suffixe (2005a/b, ambiguë).
// La cible d'un libellé dépend de l'article qui le porte : « Renn, 2008 »
// désigne le chapitre chez l'un et le livre chez l'autre. La table est donc à
// deux étages, { libellé: { source: cible, __defaut: cible } }. L'ancienne forme
// plate, { libellé: cible }, reste lue telle quelle.
function cibleDeReference(table, nom, source) {
  const e = table && table[nom];
  if (!e) return null;
  if (typeof e === 'string') return e;
  if (source && e[source]) return e[source];
  return e.__defaut || null;
}

function migrerCorrespondances(table) {
  const out = {};
  for (const [nom, v] of Object.entries(table || {})) {
    out[nom] = typeof v === 'string' ? { __defaut: v } : v;
  }
  return out;
}

// Clé d'œuvre : le DOI s'il existe, sinon le titre normalisé. Les tirets
// Unicode sont ramenés à l'ASCII, « Co-opetition » et « Co‐opetition » étant le
// même travail. Un titre trop court n'identifie rien.
// Deux libellés qui ne diffèrent que par une conjonction, un accent, un trait
// d'union ou une virgule désignent la même référence : « Garcia-Aristizabal »
// et « GarciaAristizabal », « Castaner » et « Castan~er », « Gentner et al., »
// et « Gentner, et al., ». La normalisation des conjonctions, posée à la
// création, ne les attrape pas.
function cleLibelle(nom) {
  let x = sansAccents(nom || '');
  x = x.replace(/\s+(?:et|and|&)\s+/g, '&');
  x = x.replace(/\bet\s+al\.?/g, 'etal');
  return x.replace(/[^a-z0-9&]+/g, '');
}

// Un « titre » qui commence par un nom suivi d'initiales n'en est pas un : c'est
// une liste d'auteurs tronquée, « Lawrence, M.G., S. Williams… ». La retenir
// fabriquerait une œuvre fantôme et une note au nom absurde.
function titreCredible(t) {
  const x = String(t || '').trim();
  if (x.length < 10) return false;
  if (/^[A-ZÀ-Ý][\wÀ-ÿ'’-]+,\s*(?:[A-Z]\.\s*){1,4}/.test(x)) return false;
  return /[a-zà-ÿ]{3}/.test(x);
}

// « Lawrence, M.G., S. Williams… 2022. Characteristics, potentials… One Earth
// 5: 44–61. » : le titre suit l'année. On le récupère plutôt que de jeter
// l'entrée, et l'on rend une chaîne vide si rien de crédible n'en sort.
function titreDansReference(texte, annee) {
  const t = String(texte || '');
  if (!annee) return '';
  const m = new RegExp(annee + '\\)?\\s*[.,]\\s*(.+?)(?:\\.\\s|\\.$)').exec(t);
  const cand = m ? m[1].trim() : '';
  return titreCredible(cand) ? cand : '';
}

function cleOeuvre(titre, doi) {
  if (doi) return 'doi:' + doi;
  const t = sansAccents(titre || '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return t.length >= 12 ? 'titre:' + t.slice(0, 44) : '';
}

// Nom de note pour une œuvre détachée d'un libellé partagé. Le qualificatif
// vient de l'ŒUVRE, jamais de l'article : le suffixe a/b des styles n'a de sens
// que dans une bibliographie donnée et désignerait deux travaux d'un article à
// l'autre.
function nomOeuvreDetachee(libelle, titre) {
  const t = String(titre || '').replace(/\s+/g, ' ').trim();
  if (!t) return libelle;
  let court = t.split(/\s*[:;–—]\s*|\.\s+/)[0].trim();
  if (court.length < 10) court = t;
  if (court.length > 48) court = court.slice(0, 48).replace(/\s+\S*$/, '');
  court = court.replace(/[\\/:*?"<>|#^\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return court ? libelle + ' (' + court + ')' : libelle;
}

function trouverSourceZotero(ref, indexZotero) {
  if (!ref) return null;
  if (ref.annee && ref.annee4 && ref.annee !== ref.annee4) return null;
  const forts = (indexZotero || []).filter((z) => appariementSource(ref, z) === 'fort');
  return forts.length === 1 ? forts[0].basename : null;
}

// Parse le nom d'une référence en attente (« Auteurs, année ») en objet ref,
// pour tenter un appariement Zotero. Retourne null si non parsable.
function refDepuisNomAttente(nom) {
  const s = String(nom || '').trim();
  const m = s.match(/^(.*?),\s*(\d{4}[a-z]?)\b.*$/);
  if (!m) return null;
  let auts = m[1].trim();
  const annee = m[2];
  const etAl = /\bet\s+al\.?/i.test(auts);
  auts = auts.replace(/\bet\s+al\.?/ig, ' ').replace(/&|\bet\b|,|;/g, ' ').replace(/\s+/g, ' ').trim();
  const auteurs = auts.split(' ').filter(Boolean);
  if (!auteurs.length && !etAl) return null;
  return { auteurs, annee, annee4: annee.replace(/[a-z]$/, ''), etAl };
}

// Nom de famille (dernier mot, minuscule) d'un nom d'auteur libre.
function nomFamille(s) {
  const t = sansLien(String(s || '')).replace(/,.*$/, '').trim(); // « Nom, Prénom » -> « Nom »
  const parts = t.split(/\s+/).filter(Boolean);
  return (parts.length ? parts[parts.length - 1] : t).toLowerCase();
}

// Sépare un nom complet en { nom (famille), prenom }. Gère « Nom, Prénom » et
// l'ordre occidental « Prénom Nom » (dernier mot = nom de famille).
function separerNomPrenom(nomComplet) {
  const s = sansLien(String(nomComplet || '')).trim();
  if (!s) return { nom: '', prenom: '' };
  if (s.includes(',')) {
    const i = s.indexOf(',');
    return { nom: s.slice(0, i).trim(), prenom: s.slice(i + 1).trim() };
  }
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { nom: s, prenom: '' };
  return { nom: parts[parts.length - 1], prenom: parts.slice(0, -1).join(' ') };
}

// --- Références citées via API bibliographique (fonctions pures, testables) ---

// Parse une réponse Crossref /works/{doi} -> liste de références citées.
function refsDepuisCrossref(json) {
  const msg = json && json.message ? json.message : json;
  const refs = (msg && msg.reference) || [];
  const out = [];
  for (const r of refs) {
    const doi = normDoi(r.DOI || r.doi || '');
    const titre = String(
      r['article-title'] || r['volume-title'] || r['journal-title'] || r.unstructured || ''
    ).trim();
    const an = String(r.year || '').match(/\d{4}/);
    const surnames = r.author ? [nomFamille(r.author)].filter(Boolean) : [];
    out.push({ doi, titre, annee: an ? an[0] : '', auteurs: surnames, brut: String(r.unstructured || '') });
  }
  return out;
}

// Parse une liste de works OpenAlex (déjà résolus) -> références citées.
function refsDepuisOpenAlexWorks(works) {
  const out = [];
  for (const w of works || []) {
    const doi = normDoi(w.doi || (w.ids && w.ids.doi) || '');
    const titre = String(w.title || w.display_name || '').trim();
    const annee = w.publication_year ? String(w.publication_year) : '';
    const surnames = [];
    for (const a of w.authorships || []) {
      const nom = (a.author && a.author.display_name) || a.raw_author_name || '';
      const f = nomFamille(nom);
      if (f) surnames.push(f);
    }
    out.push({ doi, titre, annee, auteurs: surnames });
  }
  return out;
}

// Construit le contenu d'une note de référence provisoire (via modèle).
function construireReference(ref, cfg) {
  const authorLinks = ref.auteurs.map((a) => '[[' + a + ']]').join('\n');
  const vars = {
    authorLinks,
    name: ref.nom,
    year: ref.annee,
    firstAuthor: ref.premierAuteur,
  };
  return appliquerModele(cfg.modeleReference, vars) + '\n';
}

//#endregion 3 · Références Zotero — parsing & appariement


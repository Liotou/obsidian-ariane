//#region 8 · Schémas mxgraph / draw.io
// ═══════════════════════════════════════════════════════════════════════════
//  8 · SCHÉMAS MXGRAPH / DRAW.IO
//  Parsing d'un diagramme draw.io / mxGraph, propagation des étiquettes de
//  relation, extrait de schéma injecté dans une note.
// ═══════════════════════════════════════════════════════════════════════════

/* =========================================================================
 * Module Cartes — cartes ontologiques sur Canvas (fonctions pures)
 * =========================================================================
 * Le Canvas d'Obsidian est la surface de dessin (fichier .canvas = JSON).
 *  - Les RELATIONS sont les étiquettes natives des arêtes (visibles, éditables).
 *  - Les TYPES DE BLOCS vivent dans un fichier compagnon « <carte>.ariane.json »
 *    (id de nœud -> id de type), pour ne pas altérer le texte des blocs.
 * ========================================================================= */

function normEtiquette(x) {
  return String(x == null ? '' : x)
    .replace(/\s*\((\+|-|−)\)\s*$/, '')   // retire la polarité « (+) » / « (−) »
    .trim().toLowerCase();
}

// Polarité éventuelle d'une étiquette : '+', '-' ou ''.
function polariteEtiquette(x) {
  const m = String(x == null ? '' : x).match(/\((\+|-|−)\)\s*$/);
  if (!m) return '';
  return m[1] === '+' ? '+' : '-';
}

// Relation du vocabulaire correspondant à une étiquette, ou null.
function relationDeEtiquette(etiquette, relations) {
  const n = normEtiquette(etiquette);
  if (!n) return null;
  for (const r of relations || []) {
    if (normEtiquette(r.nom) === n || String(r.id).toLowerCase() === n) return r;
  }
  return null;
}

// Texte lisible d'un nœud de canvas.
function texteNoeud(n) {
  if (!n) return '';
  if (n.type === 'text') return String(n.text || '').split('\n')[0].replace(/^#+\s*/, '').trim();
  if (n.type === 'file') return String(n.file || '').split('/').pop().replace(/\.md$/, '');
  if (n.type === 'link') return String(n.url || '');
  if (n.type === 'group') return String(n.label || '');
  return '';
}

/* ---- Pont draw.io : lecture des schémas .drawio.svg / .drawio ----------- */

function deshtmlMx(x) {
  return String(x == null ? '' : x)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function texteBrutMx(v) {
  // Les libellés draw.io sont doublement encodés (HTML dans un attribut XML) :
  // deux passes de décodage sont nécessaires.
  return deshtmlMx(deshtmlMx(v))
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function attrsMx(bal) {
  const o = {}; const re = /([\w:-]+)\s*=\s*"([^"]*)"/g; let m;
  while ((m = re.exec(bal)) !== null) o[m[1]] = m[2];
  return o;
}

// XML mxGraph -> { nodes, edges } au même format que le Canvas, afin que
// l'analyse, le DSL et l'export SVG fonctionnent sur les deux surfaces.
function parserMxGraph(xml) {
  const nodes = [], edges = [], labelsArete = {};
  const jetons = [];
  const re = /<(object|UserObject|mxCell|mxGeometry)\b([^>]*?)(\/?)>|<\/(object|UserObject)>/g;
  let m;
  while ((m = re.exec(String(xml || ''))) !== null) {
    if (m[4]) { jetons.push({ t: 'fin-objet' }); continue; }
    jetons.push({ t: m[1], a: attrsMx(m[2]), ferme: m[3] === '/' });
  }
  let objet = null, cell = null;
  const pousser = () => {
    if (!cell) return;
    const c = cell; cell = null;
    const a = c.a, g = c.geo || {};
    if (a.edge === '1') {
      edges.push({ id: c.id, fromNode: a.source || '', toNode: a.target || '', label: texteBrutMx(c.valeur), style: a.style || '' });
    } else if (a.vertex === '1') {
      if (a.parent && c.estEtiquette) { labelsArete[a.parent] = texteBrutMx(c.valeur); return; }
      nodes.push({
        id: c.id, type: 'text', text: texteBrutMx(c.valeur), style: a.style || '', parent: a.parent || '',
        x: Number(g.x || 0), y: Number(g.y || 0),
        width: Number(g.width || 120), height: Number(g.height || 40),
      });
    }
  };
  for (const j of jetons) {
    if (j.t === 'object' || j.t === 'UserObject') { objet = j.a; continue; }
    if (j.t === 'fin-objet') { pousser(); objet = null; continue; }
    if (j.t === 'mxCell') {
      pousser();
      const a = j.a;
      const val = objet ? (objet.label != null ? objet.label : (objet.value || '')) : (a.value || '');
      cell = { a, geo: null, id: (objet && objet.id) || a.id || '', valeur: val, estEtiquette: /edgeLabel/.test(a.style || '') };
      if (j.ferme && !objet) pousser();
      continue;
    }
    if (j.t === 'mxGeometry' && cell) cell.geo = j.a;
  }
  pousser();
  const parId = {};
  for (const e of edges) parId[e.id] = e;
  for (const cle of Object.keys(labelsArete)) {
    if (parId[cle] && !parId[cle].label) parId[cle].label = labelsArete[cle];
  }
  return { nodes, edges };
}

// Décompresse un <diagram> draw.io (base64 + deflate) si nécessaire.
function decompresserDiagramme(contenu) {
  const t = String(contenu || '').trim();
  if (/<mxGraphModel/i.test(t)) return t;
  try {
    const zlib = require('zlib');
    const brut = zlib.inflateRawSync(Buffer.from(t, 'base64')).toString('utf8');
    return decodeURIComponent(brut);
  } catch (e) { return ''; }
}

// Contenu d'un fichier (.drawio.svg ou .drawio) -> pages [{ nom, graphe }].
function pagesDepuisDrawio(contenu) {
  let xml = String(contenu || '');
  if (/^\s*<svg/i.test(xml) || /<svg[\s>]/i.test(xml.slice(0, 400))) {
    const mc = xml.match(/\scontent="([^"]*)"/);
    if (!mc) return [];
    xml = deshtmlMx(mc[1]);
  }
  const pages = [];
  const re = /<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/g;
  let m, trouve = false;
  while ((m = re.exec(xml)) !== null) {
    trouve = true;
    const a = attrsMx(m[1]);
    pages.push({ nom: deshtmlMx(a.name || ''), graphe: parserMxGraph(decompresserDiagramme(m[2])) });
  }
  if (!trouve && /<mxCell/.test(xml)) pages.push({ nom: '', graphe: parserMxGraph(xml) });
  return pages;
}

// Convention de lecture : quand plusieurs flèches partent d'un même bloc (ou
// convergent vers un même bloc) et qu'une seule étiquette a été écrite, elle
// vaut pour toutes. On ne propage que si le groupe ne porte QU'UNE étiquette
// distincte : deux étiquettes différentes rendraient le choix arbitraire.
function propagerEtiquettes(graphe) {
  const nodes = (graphe && graphe.nodes) || [];
  const edges = (graphe && graphe.edges) || [];
  const parId = {};
  for (const n of nodes) parId[n.id] = n;
  const nomme = (id) => (parId[id] ? String(parId[id].text || '').trim() : '');
  const etiq = (e) => String(e.label || '').trim();

  const copie = edges.map((e) => Object.assign({}, e));
  const utiles = copie.filter((e) => nomme(e.fromNode) && nomme(e.toNode));

  for (const cle of ['fromNode', 'toNode']) {
    const groupes = {};
    for (const e of utiles) {
      if (!groupes[e[cle]]) groupes[e[cle]] = [];
      groupes[e[cle]].push(e);
    }
    for (const k of Object.keys(groupes)) {
      const lot = groupes[k];
      if (lot.length < 2) continue;
      const labels = [...new Set(lot.map(etiq).filter(Boolean))];
      if (labels.length !== 1) continue;      // 0 = rien à propager, 2+ = ambigu
      for (const e of lot) {
        if (!etiq(e)) { e.label = labels[0]; e.labelHerite = true; }
      }
    }
  }
  return { nodes: nodes, edges: copie, pages: graphe ? graphe.pages : undefined };
}

// Extrait lisible d'un schéma, destiné à être recopié dans la note associée
// pour rendre son contenu cherchable (recherche Obsidian + index sémantique).
const ZFA_SCHEMA_DEBUT = '%% ariane:schema %%';
const ZFA_SCHEMA_FIN = '%% /ariane:schema %%';

function extraitSchema(graphe, titre) {
  const nodes = (graphe && graphe.nodes) || [];
  const edges = (graphe && graphe.edges) || [];
  const parId = {};
  for (const n of nodes) parId[n.id] = n;

  const relies = new Set();
  const lignes = [];
  for (const e of edges) {
    const a = parId[e.fromNode], b = parId[e.toNode];
    const ta = a ? String(a.text || '').trim() : '';
    const tb = b ? String(b.text || '').trim() : '';
    if (!ta || !tb) continue;
    relies.add(ta); relies.add(tb);
    const et = String(e.label || '').trim();
    lignes.push(ta + (et ? ' --' + et + '--> ' : ' --> ') + tb);
  }
  const isoles = nodes
    .map((n) => String(n.text || '').trim())
    .filter((t) => t && !relies.has(t));

  const out = [];
  out.push(ZFA_SCHEMA_DEBUT);
  out.push('> [!abstract]- Contenu du schéma' + (titre ? ' — ' + titre : ''));
  out.push('> *Synchronisé par Ariane depuis le schéma. Ne pas modifier à la main.*');
  if (lignes.length) {
    out.push('>');
    for (const l of lignes) out.push('> - ' + l);
  }
  if (isoles.length) {
    out.push('>');
    out.push('> **Blocs sans relation** : ' + [...new Set(isoles)].join(' · '));
  }
  if (!lignes.length && !isoles.length) {
    out.push('>');
    out.push('> *(schéma vide)*');
  }
  out.push(ZFA_SCHEMA_FIN);
  return out.join('\n');
}

// Remplace (ou ajoute en fin de note) le bloc synchronisé.
function injecterExtrait(contenu, extrait) {
  const texte = String(contenu == null ? '' : contenu);
  const i = texte.indexOf(ZFA_SCHEMA_DEBUT);
  const j = texte.indexOf(ZFA_SCHEMA_FIN);
  if (i !== -1 && j !== -1 && j > i) {
    const avant = texte.slice(0, i);
    const apres = texte.slice(j + ZFA_SCHEMA_FIN.length);
    return avant + extrait + apres;
  }
  return texte.replace(/\s*$/, '') + '\n\n' + extrait + '\n';
}

//#endregion 8 · Schémas mxgraph / draw.io


#!/usr/bin/env node
'use strict';
/*
 * Serveur MCP « ariane-annotations »
 * ==================================
 * Recherche dans les annotations, notes conceptuelles et fiches graphiques
 * d'Obsidian, à partir de l'index d'embeddings du greffon Ariane
 * (cache-embeddings.json) et d'Ollama (bge-m3) pour vectoriser la requête.
 * Aucune dépendance npm.
 *
 * Deux recherches, fusionnées :
 *   - par le SENS : cosinus entre la requête et chaque note (embeddings) ;
 *   - par les MOTS : les termes de la requête, et ses expressions de deux
 *     mots, dans le titre et le texte de chaque note.
 * La fusion se fait par les rangs (Reciprocal Rank Fusion) : une note très
 * bien placée dans l'une des deux listes remonte, sans qu'il faille accorder
 * des échelles de scores qui n'ont rien à voir. Une formule exacte (« potentiel
 * de crise ») ne dépend donc plus seulement de la proximité de sens.
 *
 * Garde-fous : une entrée dont le fichier n'existe plus est ignorée (index
 * pas encore nettoyé), une même note n'est jamais rendue deux fois, et le
 * titre rendu est toujours le titre lisible, jamais le code de la note.
 *
 * Expose un outil MCP : chercher_annotations(requete, k).
 * Transport : stdio, JSON-RPC 2.0 délimité par des sauts de ligne.
 * Variables d'environnement : ARIANE_CACHE, ARIANE_VAULT (obligatoires),
 * OLLAMA_URL (défaut http://localhost:11434).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
// Chemins fournis par l'environnement : rien n'est codé en dur.
const CACHE = process.env.ARIANE_CACHE;
const VAULT = process.env.ARIANE_VAULT;
if (!CACHE || !VAULT) {
  console.error('Renseignez ARIANE_CACHE et ARIANE_VAULT.');
  process.exit(2);
}

// ── L'index et les notes, relus seulement quand ils ont changé ────────────
let indexMemo = null;
function lireIndex() {
  const mtime = fs.statSync(CACHE).mtimeMs;
  if (!indexMemo || indexMemo.mtime !== mtime) {
    indexMemo = { mtime, donnees: JSON.parse(fs.readFileSync(CACHE, 'utf8')) };
  }
  return indexMemo.donnees;
}

const notesMemo = new Map();   // chemin relatif -> { mtime, titre, contenu }
function lireNote(rel) {
  const p = path.join(VAULT, rel);
  let st;
  try { st = fs.statSync(p); } catch (e) { return null; }   // fichier disparu
  const m = notesMemo.get(rel);
  if (m && m.mtime === st.mtimeMs) return m;
  const s = fs.readFileSync(p, 'utf8');
  let titre = path.basename(rel, '.md');
  let corps = s;
  const fm = s.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    corps = s.slice(fm[0].length);
    const al = fm[1].match(/^aliases:\s*\n\s*-\s*(.+)$/m) || fm[1].match(/^aliases:\s*\[?\s*["']?([^"'\]\n]+)/m);
    if (al) titre = al[1].replace(/^["']|["']$/g, '').trim();
  }
  // Sans alias, le premier titre du corps, en gras ou en titre Markdown,
  // plutôt que le code de la note.
  if (titre === path.basename(rel, '.md')) {
    const h = corps.match(/^#{1,6}\s+(.+)$/m) || corps.match(/^\*\*\[?([^\]*\n]+?)\]?(?:\([^)]*\))?\*\*/m);
    if (h) titre = h[1].replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').trim();
  }
  const note = { mtime: st.mtimeMs, titre, contenu: corps.trim() };
  notesMemo.set(rel, note);
  return note;
}

// ── Recherche par les mots ─────────────────────────────────────────────────
const MOTS_VIDES = new Set(('au aux avec ce ces cet cette dans de des du elle en et est il ils je la le les leur lui '
  + 'ma mais me mes mon ne ni nos notre nous on ou où par pas pour qu que qui sa se ses si son sur ta te tes ton tu '
  + 'un une vos votre vous y a à été être avoir fait faire comme plus moins très entre dont afin sans sous chez '
  + 'est-ce quoi quel quelle quels quelles ceux celle celles celui cela ça aussi alors ainsi donc car or peut '
  + 'exemple point vue annotation annotations note notes lien liens aborde abordent abordant parle parlent '
  + 'the of and to in is for on with as by an be are this that from').split(/\s+/));

function sansAccents(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function termes(texte) {
  return sansAccents(String(texte).toLowerCase()).split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));
}

// Racine grossière : assez pour que « crises » retrouve « crise ».
function racine(m) { return m.length > 5 ? m.replace(/(ements?|ations?|ites?|iques?|elles?|eurs?|ees?|es|s|e)$/, '') : m.replace(/s$/, ''); }

function scoresLexicaux(requete, docs) {
  const q = termes(requete).map(racine);
  if (!q.length) return new Map();
  const uniques = Array.from(new Set(q));
  // Expressions de deux mots consécutifs de la requête (mots vides compris
  // entre les deux : « potentiel de crise » donne « potentiel crise »).
  const paires = [];
  for (let i = 0; i + 1 < q.length; i += 1) paires.push(q[i] + ' ' + q[i + 1]);
  const vus = docs.map((d) => {
    const t = termes(d.titre + ' ' + d.titre + ' ' + d.contenu).map(racine);
    const compte = new Map();
    for (const m of t) compte.set(m, (compte.get(m) || 0) + 1);
    const chaine = ' ' + t.join(' ') + ' ';
    return { d, compte, chaine, long: t.length || 1 };
  });
  const n = vus.length;
  const idf = new Map(uniques.map((m) => {
    const df = vus.filter((v) => v.compte.has(m)).length;
    return [m, Math.log(1 + (n - df + 0.5) / (df + 0.5))];
  }));
  const moyenne = vus.reduce((s, v) => s + v.long, 0) / (n || 1);
  const out = new Map();
  for (const v of vus) {
    let s = 0;
    for (const m of uniques) {
      const tf = v.compte.get(m) || 0;
      if (!tf) continue;
      s += idf.get(m) * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * v.long / moyenne));   // BM25
    }
    for (const p of paires) if (v.chaine.includes(' ' + p + ' ')) s += 2;   // expression exacte
    if (s > 0) out.set(v.d.rel, s);
  }
  return out;
}

// ── Recherche par le sens ──────────────────────────────────────────────────
function normaliser(v) {
  let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i]; n = Math.sqrt(n) || 1;
  const o = new Array(v.length); for (let i = 0; i < v.length; i++) o[i] = v[i] / n; return o;
}
function cosinus(a, b) { const n = Math.min(a.length, b.length); let d = 0; for (let i = 0; i < n; i++) d += a[i] * b[i]; return d; }

function embed(model, texte) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, input: texte });
    const u = new URL(OLLAMA_URL + '/api/embed');
    const req = http.request(
      { hostname: u.hostname, port: u.port || 80, path: u.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => {
        try { const j = JSON.parse(d); const v = (j.embeddings && j.embeddings[0]) || j.embedding;
          if (!v) return reject(new Error('Ollama : réponse sans embedding')); resolve(v);
        } catch (e) { reject(e); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

// ── La recherche, fusionnée ────────────────────────────────────────────────
async function chercher(requete, k) {
  const index = lireIndex();
  const entrees = index.entries || {};
  // Les notes qui existent vraiment, une fois chacune (le même nom de fichier
  // sous deux chemins : on garde celui qui existe).
  const docs = [];
  const parNom = new Set();
  for (const rel of Object.keys(entrees)) {
    const e = entrees[rel];
    if (!e || !Array.isArray(e.vec)) continue;
    const note = lireNote(rel);
    if (!note) continue;
    const nom = path.basename(rel);
    if (parNom.has(nom)) continue;
    parNom.add(nom);
    docs.push({ rel, vec: e.vec, titre: note.titre, contenu: note.contenu });
  }
  let semantique = new Map();
  let sansOllama = false;
  try {
    const q = normaliser(await embed(index.model || 'bge-m3', requete));
    semantique = new Map(docs.map((d) => [d.rel, cosinus(q, d.vec)]));
  } catch (e) { sansOllama = true; }
  const lexical = scoresLexicaux(requete, docs);
  const rangs = (m) => new Map(Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([rel], i) => [rel, i + 1]));
  const rSem = rangs(semantique);
  const rLex = rangs(lexical);
  const K = 60;
  const fusion = docs.map((d) => ({
    d,
    score: (rSem.has(d.rel) ? 1 / (K + rSem.get(d.rel)) : 0) + (rLex.has(d.rel) ? 1 / (K + rLex.get(d.rel)) : 0),
  })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return {
    sansOllama,
    total: docs.length,
    resultats: fusion.slice(0, k || 12).map((x, i) => ({
      rang: i + 1,
      chemin: x.d.rel,
      titre: x.d.titre,
      sens: semantique.has(x.d.rel) ? Math.round(semantique.get(x.d.rel) * 1000) / 1000 : null,
      rangSens: rSem.get(x.d.rel) || null,
      rangMots: rLex.get(x.d.rel) || null,
      contenu: x.d.contenu.slice(0, 1500),
    })),
  };
}

function formater(requete, r) {
  if (!r.resultats.length) {
    return 'Aucune note ne correspond. Relancez avec d\'autres mots (synonymes, auteurs, notions voisines).';
  }
  const tete = 'Résultats pour « ' + requete + ' », CLASSÉS DU PLUS AU MOINS PERTINENT (fusion de la recherche par le sens '
    + 'et par les mots, sur ' + r.total + ' notes). Le n°1 est le plus proche de la requête : ne l\'écartez pas, ni '
    + 'aucun des premiers, sans le dire. Présentez d\'abord les mieux classés, même courts ; relancez avec d\'autres '
    + 'mots avant de conclure qu\'une idée est absente.'
    + (r.sansOllama ? '\n(Ollama injoignable : recherche par les mots seulement.)' : '');
  const corps = r.resultats.map((x) => '### ' + x.rang + '. ' + x.titre
    + '\n[[' + path.basename(x.chemin, '.md') + ']] · ' + x.chemin
    + '\nrang par le sens : ' + (x.rangSens || 'hors liste') + (x.sens != null ? ' (cosinus ' + x.sens + ')' : '')
    + ' · rang par les mots : ' + (x.rangMots || 'aucun mot commun')
    + '\n\n' + x.contenu).join('\n\n---\n\n');
  return tete + '\n\n' + corps;
}

/* ------------------------------- MCP stdio ---------------------------- */
const TOOL = {
  name: 'chercher_annotations',
  description: "Recherche dans les annotations, notes conceptuelles et fiches graphiques d'Obsidian : par le sens (embeddings bge-m3 de l'index Ariane) et par les mots, les deux classements fusionnés. Rend les notes CLASSÉES DU PLUS AU MOINS PERTINENT, avec titre, lien, chemin et contenu : le premier résultat est le plus proche de la requête. Ne jamais écarter les premiers résultats sans le dire, même s'ils sont courts ; relancer avec d'autres formulations (synonymes, auteurs, notions voisines) avant de conclure qu'une idée est absente du corpus.",
  inputSchema: {
    type: 'object',
    properties: {
      requete: { type: 'string', description: "Requête, argument ou passage à documenter" },
      k: { type: 'number', description: "Nombre de résultats (défaut 12)" }
    },
    required: ['requete']
  }
};

function envoyer(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

async function traiter(msg) {
  const id = msg.id, method = msg.method, params = msg.params || {};
  if (method === 'initialize') {
    return envoyer({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'ariane-annotations', version: '2.0.0' } } });
  }
  if (method === 'tools/list') return envoyer({ jsonrpc: '2.0', id, result: { tools: [TOOL] } });
  if (method === 'tools/call') {
    if (params.name !== 'chercher_annotations') return envoyer({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Outil inconnu' } });
    const args = params.arguments || {};
    const requete = String(args.requete || '');
    try {
      const r = await chercher(requete, Number(args.k) > 0 ? Number(args.k) : 12);
      return envoyer({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: formater(requete, r) }] } });
    } catch (e) {
      return envoyer({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Erreur : ' + (e && e.message ? e.message : e) + ' (index Ariane construit ?)' }], isError: true } });
    }
  }
  if (method && method.indexOf('notifications/') === 0) return;
  if (id !== undefined) envoyer({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Méthode non gérée : ' + method } });
}

let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const ligne = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
    if (!ligne) continue;
    let msg; try { msg = JSON.parse(ligne); } catch (e) { continue; }
    traiter(msg);
  }
});
process.stdin.resume();

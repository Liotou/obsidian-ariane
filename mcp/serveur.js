#!/opt/homebrew/bin/node
'use strict';
/*
 * Serveur MCP « ariane-annotations »
 * ==================================
 * Recherche sémantique dans vos annotations et notes conceptuelles Obsidian,
 * en réutilisant l'index d'embeddings du plugin Ariane (cache-embeddings.json)
 * et Ollama (bge-m3) pour vectoriser la requête. Aucune dépendance npm.
 *
 * Expose un outil MCP : chercher_annotations(requete, k) -> top-K pertinents.
 * Transport : stdio, JSON-RPC 2.0 délimité par des sauts de ligne.
 *
 * Config (dans Claudien / Claude Code) :
 *   "ariane-annotations": { "command": "node", "args": ["<chemin>/mcp/serveur.js"] }
 * Variables d'environnement optionnelles : OLLAMA_URL, ARIANE_CACHE, ARIANE_VAULT.
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

function lireCache() { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); }
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
          if (!v) return reject(new Error('Ollama: réponse sans embedding')); resolve(v);
        } catch (e) { reject(e); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

function titreEtContenu(rel) {
  const p = path.join(VAULT, rel);
  let s = ''; try { s = fs.readFileSync(p, 'utf8'); } catch (e) { return { titre: path.basename(rel, '.md'), contenu: '' }; }
  let titre = path.basename(rel, '.md');
  let corps = s;
  const fm = s.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    corps = s.slice(fm[0].length);
    const al = fm[1].match(/^aliases:\s*\n\s*-\s*(.+)$/m) || fm[1].match(/^aliases:\s*\[?\s*["']?([^"'\]\n]+)/m);
    if (al) titre = al[1].replace(/^["']|["']$/g, '').trim();
  }
  return { titre, contenu: corps.trim() };
}

async function chercher(requete, k) {
  const cache = lireCache();
  const entries = cache.entries || {};
  const q = normaliser(await embed(cache.model || 'bge-m3', requete));
  const scores = [];
  for (const rel of Object.keys(entries)) {
    const e = entries[rel];
    if (e && Array.isArray(e.vec)) scores.push([rel, cosinus(q, e.vec)]);
  }
  scores.sort((a, b) => b[1] - a[1]);
  return scores.slice(0, k || 8).map(([rel, sc]) => {
    const tc = titreEtContenu(rel);
    return { chemin: rel, titre: tc.titre, score: Math.round(sc * 1000) / 1000, contenu: tc.contenu.slice(0, 1200) };
  });
}

/* ------------------------------- MCP stdio ---------------------------- */
const TOOL = {
  name: 'chercher_annotations',
  description: "Recherche sémantique dans les annotations et notes conceptuelles d'Obsidian (index Ariane, embeddings bge-m3). Donne une requête ou un argument à appuyer ; renvoie les notes les plus pertinentes avec titre, chemin et contenu, sans avoir à lire tout le coffre.",
  inputSchema: {
    type: 'object',
    properties: {
      requete: { type: 'string', description: "Requête, argument ou passage à documenter" },
      k: { type: 'number', description: "Nombre de résultats (défaut 8)" }
    },
    required: ['requete']
  }
};

function envoyer(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

async function traiter(msg) {
  const id = msg.id, method = msg.method, params = msg.params || {};
  if (method === 'initialize') {
    return envoyer({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'ariane-annotations', version: '1.0.0' } } });
  }
  if (method === 'tools/list') return envoyer({ jsonrpc: '2.0', id, result: { tools: [TOOL] } });
  if (method === 'tools/call') {
    if (params.name !== 'chercher_annotations') return envoyer({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Outil inconnu' } });
    const args = params.arguments || {};
    try {
      const res = await chercher(String(args.requete || ''), args.k);
      const texte = res.length
        ? res.map((r, i) => '### ' + (i + 1) + '. ' + r.titre + '  (' + r.score + ')\n[[' + path.basename(r.chemin, '.md') + ']] — ' + r.chemin + '\n\n' + r.contenu).join('\n\n---\n\n')
        : 'Aucune annotation pertinente.';
      return envoyer({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: texte }] } });
    } catch (e) {
      return envoyer({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Erreur : ' + (e && e.message ? e.message : e) + ' (Ollama lancé ? index Ariane construit ?)' }], isError: true } });
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

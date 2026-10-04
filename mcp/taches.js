#!/usr/bin/env node
'use strict';
/*
 * Serveur MCP « ariane-taches »
 * =============================
 * Donne à Claude (dans Claudian ou Claude Code) les tâches du coffre telles
 * qu'Ariane les comprend : champs, analyse (urgence, importance,
 * diagnostics), journal des modifications, créneaux, charge du calendrier.
 *
 * Ce script ne contient AUCUNE logique de tâches : il relaie chaque appel au
 * « pont Claude » d'Ariane, qui tourne dans Obsidian (section 22 du greffon).
 * Obsidian doit donc être ouvert. Aucune dépendance npm.
 *
 * Transport : stdio, JSON-RPC 2.0 délimité par des sauts de ligne.
 * Le pont s'annonce dans ~/.ariane-mcp/pont.json (port + jeton, par coffre).
 * Variables d'environnement optionnelles :
 *   ARIANE_VAULT  chemin du coffre (utile si plusieurs coffres sont ouverts)
 *   ARIANE_PONT   chemin du fichier d'annonce (défaut ~/.ariane-mcp/pont.json)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ANNONCE = process.env.ARIANE_PONT || path.join(os.homedir(), '.ariane-mcp', 'pont.json');
const COFFRE = process.env.ARIANE_VAULT || '';
const OBSIDIAN_FERME = "Ariane ne répond pas. Obsidian est-il ouvert, avec le greffon Ariane actif ? "
  + "(Réglages d'Ariane : le « pont Claude » doit être activé.)";

// Les outils, tels que Claude les voit. Les descriptions disent à quoi sert
// chacun et ce qu'il rend : c'est ce que Claude lit pour choisir.
const OUTILS = [
  {
    name: 'lister_taches',
    description: "Liste les tâches du coffre avec leur analyse par Ariane : urgence et importance (score, niveau, raison), diagnostics (retard, etire, sous-planifiee, abandon) avec leur raison, dernier et prochain créneau, nombre de reports d'échéance, temps passé récemment. Triées de la plus urgente à la moins urgente. Par défaut, les tâches terminées et abandonnées sont exclues.",
    inputSchema: {
      type: 'object',
      properties: {
        statut: { type: 'string', description: "Filtrer sur un statut : à faire, en cours, en attente, terminée, abandonnée" },
        famille: { type: 'string', description: 'Filtrer sur une famille de tâches (identifiant)' },
        liste: { type: 'string', description: "Filtrer sur la liste Apple Rappels d'origine, par exemple la boîte de réception" },
        diagnostic: { type: 'string', enum: ['retard', 'etire', 'sous-planifiee', 'abandon'], description: 'Ne garder que les tâches portant ce diagnostic' },
        echeance_avant: { type: 'string', description: 'Ne garder que les échéances au plus tard ce jour (AAAA-MM-JJ)' },
        inclure_finies: { type: 'boolean', description: 'Inclure les tâches terminées et abandonnées' },
        limite: { type: 'number', description: 'Nombre maximal de tâches (défaut 100)' },
      },
    },
  },
  {
    name: 'detail_tache',
    description: "Tout sur une tâche : ses champs et son analyse, tous ses créneaux (passés et à venir), son journal complet de modifications (quoi, quand, avant, après, origine : ariane, externe, claude), le temps passé par jour sur deux mois (sa note et les notes qu'elle désigne), et le texte de sa note de travail.",
    inputSchema: {
      type: 'object',
      properties: { ref: { type: 'string', description: 'Référence de la tâche, par exemple T020' } },
      required: ['ref'],
    },
  },
  {
    name: 'charge_calendrier',
    description: "La charge de chaque jour d'une période : créneaux de tâches, événements Apple Calendrier, événements de journée entière, minutes occupées et plages libres (30 minutes au moins) entre une heure de début et de fin de journée. Sert à proposer une replanification réaliste. 42 jours au plus.",
    inputSchema: {
      type: 'object',
      properties: {
        du: { type: 'string', description: "Premier jour (AAAA-MM-JJ), aujourd'hui par défaut" },
        au: { type: 'string', description: 'Dernier jour (AAAA-MM-JJ), deux semaines plus tard par défaut' },
        debut_journee: { type: 'string', description: 'Heure de début de journée, HH:MM (défaut 08:00)' },
        fin_journee: { type: 'string', description: 'Heure de fin de journée, HH:MM (défaut 19:00)' },
      },
    },
  },
  {
    name: 'proposer_modifications',
    description: "LE SEUL MOYEN de modifier les tâches : ne jamais éditer une note de tâche directement. Propose une liste de changements ; Ariane les vérifie, les montre à Monsieur dans Obsidian (avant → après, avec ta justification) et n'applique que ce qu'il accepte. L'appel attend sa décision (dix minutes au plus) et rend ce qui a été accepté, refusé ou écarté (avec la raison). Chaque changement porte sur une tâche existante (ref) ou en crée une (creer). Champs modifiables : intitule, statut (à faire, en cours, en attente, terminée, abandonnée), priorite (vide, basse, moyenne, haute), debut, echeance (AAAA-MM-JJ, vide pour retirer), heure (HH:MM), avancement (0 à 100), jalon (booléen), parent (référence de la tâche mère), famille. Un changement dont une valeur est invalide est écarté en entier.",
    inputSchema: {
      type: 'object',
      properties: {
        motif: { type: 'string', description: "Ce que tu proposes et pourquoi, en une ou deux phrases, pour Monsieur" },
        changements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ref: { type: 'string', description: 'Tâche existante à modifier (omettre si creer)' },
              justification: { type: 'string', description: 'Pourquoi ce changement, en une phrase' },
              champs: { type: 'object', description: 'Champs à modifier et leur nouvelle valeur' },
              ajouter_creneaux: { type: 'array', items: { type: 'object', properties: {
                debut: { type: 'string', description: 'AAAA-MM-JJTHH:MM' }, fin: { type: 'string', description: 'AAAA-MM-JJTHH:MM' } },
                required: ['debut', 'fin'] } },
              retirer_creneaux: { type: 'array', items: { type: 'string' },
                description: 'Créneaux à retirer, tels que detail_tache les rend (« AAAA-MM-JJ HH:MM-HH:MM »)' },
              creer: { type: 'object', description: 'Nouvelle tâche : intitule (obligatoire), famille, statut, priorite, debut, echeance, parent' },
            },
          },
        },
      },
      required: ['changements'],
    },
  },
  {
    name: 'revue',
    description: "La revue prête à l'emploi : tâches en retard, sous-planifiées, qui s'étirent (échéance repoussée plusieurs fois), abandons probables, cette semaine, urgentes et importantes, importantes mais pas urgentes. Point de départ d'un « qu'est-ce qui dérape ? ».",
    inputSchema: { type: 'object', properties: {} },
  },
];

function lireAnnonce() {
  let tout;
  try { tout = JSON.parse(fs.readFileSync(ANNONCE, 'utf8')); } catch (e) { return null; }
  const coffres = (tout && tout.coffres) || {};
  if (COFFRE && coffres[COFFRE]) return coffres[COFFRE];
  const cles = Object.keys(coffres);
  if (cles.length === 1) return coffres[cles[0]];
  if (cles.length > 1 && !COFFRE) {
    throw new Error('Plusieurs coffres ouverts : préciser ARIANE_VAULT dans la configuration MCP.');
  }
  return null;
}

function appelerPont(nom, args, delaiMs) {
  return new Promise((resolve, reject) => {
    let pont;
    try { pont = lireAnnonce(); } catch (e) { reject(e); return; }
    if (!pont) { reject(new Error(OBSIDIAN_FERME)); return; }
    const corps = JSON.stringify({ nom, arguments: args || {} });
    const req = http.request({
      hostname: '127.0.0.1', port: pont.port, path: '/outil', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corps),
                 Authorization: 'Bearer ' + pont.jeton },
    }, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        let j;
        try { j = JSON.parse(d); } catch (e) { reject(new Error('Réponse illisible du pont.')); return; }
        if (res.statusCode === 401) { reject(new Error("Jeton refusé : Obsidian a redémarré ; relancer l'appel.")); return; }
        if (!j.ok) { reject(new Error(j.erreur || 'Erreur du pont.')); return; }
        resolve(j.resultat);
      });
    });
    req.setTimeout(delaiMs || 60000, () => req.destroy(new Error('Ariane met trop de temps à répondre.')));
    req.on('error', (e) => reject(e && e.code === 'ECONNREFUSED' ? new Error(OBSIDIAN_FERME) : e));
    req.write(corps);
    req.end();
  });
}

function envoyer(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

async function traiter(msg) {
  const id = msg.id;
  const method = msg.method;
  const params = msg.params || {};
  if (method === 'initialize') {
    return envoyer({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05',
      capabilities: { tools: {} }, serverInfo: { name: 'ariane-taches', version: '1.0.0' } } });
  }
  if (method === 'tools/list') return envoyer({ jsonrpc: '2.0', id, result: { tools: OUTILS } });
  if (method === 'tools/call') {
    const outil = OUTILS.find((o) => o.name === params.name);
    if (!outil) return envoyer({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Outil inconnu' } });
    try {
      // Une proposition attend la décision de Monsieur : jusqu'à dix minutes.
      const delai = outil.name === 'proposer_modifications' ? 11 * 60000 : 60000;
      const res = await appelerPont(outil.name, params.arguments || {}, delai);
      return envoyer({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(res, null, 1) }] } });
    } catch (e) {
      return envoyer({ jsonrpc: '2.0', id, result: { isError: true,
        content: [{ type: 'text', text: 'Erreur : ' + (e && e.message ? e.message : e) }] } });
    }
  }
  if (method && method.indexOf('notifications/') === 0) return undefined;
  if (id !== undefined) envoyer({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Méthode non gérée : ' + method } });
  return undefined;
}

let tampon = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (morceau) => {
  tampon += morceau;
  let i;
  while ((i = tampon.indexOf('\n')) >= 0) {
    const ligne = tampon.slice(0, i).trim();
    tampon = tampon.slice(i + 1);
    if (!ligne) continue;
    let msg;
    try { msg = JSON.parse(ligne); } catch (e) { continue; }
    traiter(msg);
  }
});
process.stdin.resume();

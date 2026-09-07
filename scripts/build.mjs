// Construit main.js — le fichier qu'Obsidian charge — depuis les fragments de
// src/, dans l'ordre déclaré par src/ordre.json.
//
// C'est une CONCATÉNATION D'OCTETS, pas un empaquetage. Ce choix est délibéré :
//
//   · l'export « frise vivante » sérialise MoteurVue et MoteurFrise par
//     Function.prototype.toString() et réévalue ce texte dans la page produite.
//     Tout empaqueteur qui renomme un identifiant ou réordonne une déclaration
//     casse cet export en silence, chez l'utilisateur, hors de portée des tests ;
//   · esbuild supprime les commentaires : il effacerait le balisage //#region,
//     la carte du fichier et le socle de tests/structure.test.js ;
//   · concaténer se prouve : le fichier produit est comparable octet pour octet
//     à ce qu'il remplace. Aucun empaqueteur ne donne cette garantie.
//
// Conséquence : les fragments partagent une seule portée. Pas d'import/export,
// pas de tree-shaking, et les noms de premier niveau doivent rester uniques.
// Chaque fragment doit être du JavaScript valide au premier niveau, pour que
// « node --check src/*.js » reste un garde-fou utile.
//
//   node scripts/build.mjs             écrit main.js
//   node scripts/build.mjs --verifier  ne l'écrit pas ; sort en erreur s'il
//                                      diverge de src/ (utilisé par les tests)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'main.js');

export function construire() {
  const ordre = JSON.parse(readFileSync(join(RACINE, 'src', 'ordre.json'), 'utf8'));
  return Buffer.concat(ordre.map((f) => readFileSync(join(RACINE, 'src', f))));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const attendu = construire();
  if (process.argv.includes('--verifier')) {
    let actuel;
    try { actuel = readFileSync(SORTIE); } catch { actuel = Buffer.alloc(0); }
    if (!actuel.equals(attendu)) {
      console.error('main.js diverge de src/ — lancer « npm run build ».');
      process.exit(1);
    }
    console.log('main.js est à jour (' + attendu.length + ' octets).');
  } else {
    writeFileSync(SORTIE, attendu);
    console.log('main.js construit : ' + attendu.length + ' octets, '
      + (attendu.toString('binary').split('\n').length - 1) + ' lignes.');
  }
}

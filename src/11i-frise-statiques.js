
// ── avecFriseStatiques ────────────────────────────────────────────────────
// Domaine : tâches (frise, articulation, calendrier).
// Fonctions pures de la frise : disposition Gantt, périodes, regroupement, tri.
const avecFriseStatiques = (Base) => class extends Base {
  //#region Ariane · static · frise / gantt
  // ── static · frise / gantt ───────────────────────────────────────────────

  // Réfs des tâches en retard : une échéance valide, antérieure à `aujourdhui`,
  // sur une tâche ni terminée ni abandonnée. Rien n'est écrit : c'est un état
  // dérivé, relu à chaque dessin.
  static tachesEnRetard(taches, aujourdhui) {
    const out = new Set();
    const auj = Ariane.jourValide(aujourdhui);
    if (!auj) return out;
    for (const t of taches || []) {
      if (!t || !t.ref) continue;
      const e = Ariane.jourValide(t.echeance);
      if (e && e < auj && t.statut !== 'terminée' && t.statut !== 'abandonnée') out.add(t.ref);
    }
    return out;
  }

  // Une plage texte -> { debut, fin } ISO « YYYY-MM-DDTHH:MM », ou null.
  // « 2026-09-08 14:00-16:00 » (même jour) ; « 2026-09-08 22:00 / 2026-09-09 01:30 »
  // (minuit explicite). Séparateurs : - – — / « à ». Heures H:MM ou HH:MM.
  static parseCreneau(str) {
    const s = String(str == null ? '' : str).trim();
    if (!s) return null;
    const jhm = (d, h) => {
      const m = String(h).match(/^(\d{1,2}):(\d{2})$/);
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || !Ariane.jourValide(d)) return null;
      return d + 'T' + String(Number(m[1])).padStart(2, '0') + ':' + m[2];
    };
    let m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*(?:[-–—/]|à)\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})$/);
    if (m) {
      const a = jhm(m[1], m[2]);
      const b = jhm(m[3], m[4]);
      return (a && b && b > a) ? { debut: a, fin: b } : null;
    }
    m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*(?:[-–—/]|à)\s*(\d{1,2}:\d{2})$/);
    if (!m) return null;
    const a = jhm(m[1], m[2]);
    let b = jhm(m[1], m[3]);
    if (!a || !b) return null;
    if (b <= a) b = jhm(Ariane.decalerJour(m[1], 1), m[3]);
    return b > a ? { debut: a, fin: b } : null;
  }

  static formatCreneau(debut, fin) {
    const d = String(debut || '');
    const f = String(fin || '');
    const [jd, hd] = [d.slice(0, 10), d.slice(11, 16)];
    const [jf, hf] = [f.slice(0, 10), f.slice(11, 16)];
    if (!jd || !hd || !jf || !hf) return '';
    return jd === jf ? jd + ' ' + hd + '-' + hf : jd + ' ' + hd + ' / ' + jf + ' ' + hf;
  }

  // Liste de créneaux d'une valeur (tableau, chaîne, ou tâche avec `.creneaux`).
  // Trié par début, entrées invalides écartées, `brut` = chaîne d'origine.
  static creneauxDeTache(v) {
    let brut = v;
    if (v && !Array.isArray(v) && typeof v === 'object') brut = v.creneaux;
    const arr = Array.isArray(brut) ? brut : (brut ? [brut] : []);
    const out = [];
    for (const s of arr) {
      const p = Ariane.parseCreneau(s);
      if (p) out.push({ debut: p.debut, fin: p.fin, brut: String(s) });
    }
    out.sort((a, b) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0));
    const vus = new Set();
    return out.filter((c) => {
      const k = c.debut + '|' + c.fin;
      if (vus.has(k)) return false;
      vus.add(k);
      return true;
    });
  }

  // Compare deux listes de critères de tri natif Bases : { v, s(ens 1|-1) }.
  // Valeur vide toujours après, quel que soit le sens. 0 si tout égal.
  // Reprend, en le mutualisant, le corps de la branche « multi » de disposerGantt.
  static comparerMulti(ma, mb) {
    const a = ma || [];
    const b = mb || [];
    // Invariant : ma et mb ont la même longueur (une config de vue Bases produit un critère _multi par colonne triée).
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const ka = String(a[i] && a[i].v != null ? a[i].v : '');
      const kb = String(b[i] && b[i].v != null ? b[i].v : '');
      if (!ka !== !kb) return ka ? -1 : 1;
      const c = ka.localeCompare(kb, 'fr', { sensitivity: 'base', numeric: true });
      if (c) return c * ((a[i] && a[i].s === -1) ? -1 : 1);
    }
    return 0;
  }

  // Ordre d'empilement des événements dans une cellule/colonne du calendrier :
  // tout-le-jour d'abord, puis heure de début, puis tri natif de la base, puis ref.
  static comparerEmpilement(x, y) {
    const ax = x.ev.allDay ? 0 : 1;
    const ay = y.ev.allDay ? 0 : 1;
    if (ax !== ay) return ax - ay;
    if (x.ev.debut !== y.ev.debut) return x.ev.debut < y.ev.debut ? -1 : 1;
    const r = Ariane.comparerMulti(x.t._multi, y.t._multi);
    if (r) return r;
    return String(x.t.ref).localeCompare(String(y.t.ref), 'fr', { numeric: true });
  }

  // Ancre voisine pour le carrousel : ±1 mois ou ±1 semaine. sens 0 = sur place.
  static ancreCarrousel(ancre, mode, sens) {
    if (!sens) return ancre;
    return mode === 'mois'
      ? Ariane.moisSuivantN(ancre, sens)
      : Ariane.decalerJour(ancre, sens * 7);
  }

  // Jour à pré-dater pour « + Nouveau » : le jour sélectionné s'il existe,
  // sinon aujourd'hui s'il tombe dans la période affichée, sinon son 1er jour.
  static jourSeme(jourSel, periodeDebut, periodeFin, aujourd) {
    if (jourSel) return jourSel;
    if (aujourd >= periodeDebut && aujourd <= periodeFin) return aujourd;
    return periodeDebut;
  }

  // Lignes de propriété à écrire sur une carte : on saute la colonne fichier,
  // les valeurs vides et celle qui répète l'intitulé ; on coupe à maxLignes.
  static lignesProprietes(paires, intitule, maxLignes) {
    if (!Array.isArray(paires) || !(maxLignes > 0)) return [];
    const exclues = new Set(['file', 'file.name', 'file.link', 'file.path']);
    const titre = String(intitule || '').trim();
    const out = [];
    for (const p of paires) {
      if (!p || exclues.has(p.cle)) continue;
      const v = p.valeur == null ? '' : String(p.valeur).trim();
      if (!v || v === titre) continue;
      out.push({ nom: p.nom, valeur: v });
      if (out.length >= maxLignes) break;
    }
    return out;
  }

  // Coupe une liste à `plafond` éléments et dit combien restent cachés.
  // plafond <= 0 → aucun repli.
  static replierListe(items, plafond) {
    const arr = Array.isArray(items) ? items : [];
    if (plafond <= 0 || arr.length <= plafond) return { montres: arr.slice(), reste: 0 };
    return { montres: arr.slice(0, plafond), reste: arr.length - plafond };
  }

  // Instantané note ↔ Apple Agenda : seuls les créneaux deviennent des EKEvent,
  // l'instantané est donc « <créneaux canoniques joints par ';'>|<statut> ».
  // Comparé à `agenda-sync` de la note à la relève : différent → la note a bougé
  // depuis le dernier push, elle fait foi (on repoussera, on ne l'écrase pas).
  static instantAgenda(t) {
    const crs = Ariane.creneauxDeTache(t)
      .map((c) => Ariane.formatCreneau(c.debut, c.fin)).join(';');
    return crs + '|' + ((t && t.statut) || '');
  }

  // Répartit en colonnes les blocs horaires d'UN jour qui se chevauchent ; les
  // groupes disjoints repartent de la colonne 0. `blocs` : [{ deb, fin }] en
  // minutes. Rend, dans l'ordre d'entrée, [{ col, ncols }] : la colonne du bloc
  // et le nombre de colonnes du groupe auquel il appartient.
  static disposerBlocsJour(blocs) {
    const n = (blocs || []).length;
    const ordre = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => blocs[a].deb - blocs[b].deb || blocs[a].fin - blocs[b].fin || a - b);
    const res = Array.from({ length: n }, () => ({ col: 0, ncols: 1 }));
    let groupe = [];
    let finMax = -Infinity;
    const clore = () => {
      const nc = groupe.reduce((m, gg) => Math.max(m, gg.col + 1), 1);
      for (const gg of groupe) res[gg.i].ncols = nc;
      groupe = [];
      finMax = -Infinity;
    };
    for (const i of ordre) {
      if (groupe.length && blocs[i].deb >= finMax) clore();
      const prises = new Set(groupe
        .filter((gg) => blocs[gg.i].fin > blocs[i].deb).map((gg) => gg.col));
      let col = 0;
      while (prises.has(col)) col += 1;
      res[i].col = col;
      groupe.push({ i, col });
      finMax = Math.max(finMax, blocs[i].fin);
    }
    if (groupe.length) clore();
    return res;
  }

  // Statistiques d'une liste de créneaux. `maintenantISO` sert de coupe
  // passé / futur ; les durées sont en minutes. Accepte un tableau de chaînes
  // ou de { debut, fin }. Les entrées invalides sont écartées (creneauxDeTache).
  static statsCreneaux(creneaux, maintenantISO) {
    const now = String(maintenantISO || new Date().toISOString());
    const list = Ariane.creneauxDeTache(Array.isArray(creneaux) ? creneaux
      : (creneaux ? [creneaux] : []));
    let total = 0;
    let passe = 0;
    let futur = 0;
    for (const c of list) {
      const min = (Date.parse(c.fin + ':00') - Date.parse(c.debut + ':00')) / 60000;
      total += min;
      if (c.fin < now) passe += min;
      else if (c.debut >= now) futur += min;
      else { passe += (Date.parse(now) - Date.parse(c.debut + ':00')) / 60000;
             futur += (Date.parse(c.fin + ':00') - Date.parse(now)) / 60000; }
    }
    return {
      nb: list.length, totalMin: Math.round(total),
      passeMin: Math.round(passe), futurMin: Math.round(futur),
      premier: list.length ? list[0].debut : '',
      dernier: list.length ? list[list.length - 1].fin : '',
    };
  }

  static _dureeHumaine(min) {
    const h = Math.floor(min / 60);
    return h + ' h ' + String(min % 60).padStart(2, '0');
  }

  static _jourHumain(iso) {
    // « lun. 8 sept. » — sans dépendance à la locale de la machine.
    const JS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    const MS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.',
      'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const d = String(iso).slice(0, 10);
    if (!Ariane.jourValide(d)) return d;
    const [a, m, j] = d.split('-').map(Number);
    const dow = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
    return JS[dow] + ' ' + j + ' ' + MS[m - 1];
  }

  // Clé d'un commentaire de session : mois-jour + heure de DÉBUT, sans l'année
  // (« MM-JJTHH:MM »). Sans année : le commentaire suit le créneau déplacé même
  // d'une année sur l'autre, et la relecture du bloc (rendu humain, sans année)
  // retrouve la même clé.
  static cleCommentaire(cren) {
    const c = typeof cren === 'string' ? Ariane.parseCreneau(cren) : cren;
    return c && c.debut ? String(c.debut).slice(5, 16) : '';
  }

  // Une cellule de tableau markdown : barre verticale masquée, retour à la
  // ligne rendu comme <br>.
  static echapperCellule(t) {
    return String(t || '').replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|').trim();
  }
  static desechapperCellule(t) {
    return String(t || '').replace(/<br\s*\/?>/gi, '\n').replace(/\\\|/g, '|').trim();
  }

  // Relit les commentaires de session depuis le bloc balisé d'une note.
  // Rendu humain (date « mer. 2 sept. », heures « 09:45 – 12:45 ») relu vers
  // la même clé que cleCommentaire — c'est elle qui fait la jointure.
  static commentairesDuBloc(texte) {
    const s = String(texte || '');
    const d = s.indexOf(ZFA_CRENEAUX_DEBUT);
    const f = s.indexOf(ZFA_CRENEAUX_FIN);
    if (d === -1 || f <= d) return {};
    const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.',
      'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const num = new Map(MOIS.map((m, i) => [m, String(i + 1).padStart(2, '0')]));
    const out = {};
    for (const ligne of s.slice(d + ZFA_CRENEAUX_DEBUT.length, f).split('\n')) {
      // Découpe en ignorant les barres échappées (\|) d'un commentaire.
      const cel = ligne.split(/(?<!\\)\|/);
      // 5 colonnes rendues → 7 cellules éclatées (bords vides compris).
      if (cel.length < 7) continue;
      const dm = (cel[2] || '').trim()
        .match(/^\S+\s+(\d{1,2})\s+(janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.)$/);
      const hm = (cel[3] || '').trim().match(/^(\d{1,2}:\d{2})\s*[-–—]/);
      if (!dm || !hm || !num.has(dm[2])) continue;
      const txt = Ariane.desechapperCellule(cel[5]);
      if (!txt) continue;
      out[num.get(dm[2]) + '-' + String(Number(dm[1])).padStart(2, '0') + 'T' + hm[1]] = txt;
    }
    return out;
  }

  // Rend le corps markdown de la section « ## Sessions » (sans les marqueurs).
  // Chaîne vide quand aucun créneau valide. Les commentaires (clé
  // cleCommentaire) complètent la 5ᵉ colonne ; seuls ceux des sessions
  // présentes s'écrivent — une session supprimée emporte le sien.
  static blocCreneaux(creneaux, stats, commentaires) {
    const list = Ariane.creneauxDeTache(Array.isArray(creneaux) ? creneaux
      : (creneaux ? [creneaux] : []));
    if (!list.length) return '';
    const s = stats || Ariane.statsCreneaux(list, new Date().toISOString());
    const coms = commentaires || {};
    const lignes = list.map((c, i) => {
      const min = Math.round((Date.parse(c.fin + ':00') - Date.parse(c.debut + ':00')) / 60000);
      const cle = Ariane.cleCommentaire(c);
      const com = (cle && coms[cle]) ? Ariane.echapperCellule(coms[cle]) : '';
      return '| ' + (i + 1) + ' | ' + Ariane._jourHumain(c.debut) + ' | '
        + c.debut.slice(11, 16) + ' – ' + c.fin.slice(11, 16) + ' | '
        + Ariane._dureeHumaine(min) + ' | ' + com + ' |';
    });
    const resume = '**' + s.nb + ' session' + (s.nb > 1 ? 's' : '')
      + ' · ' + Ariane._dureeHumaine(s.totalMin) + ' planifiées'
      + (s.futurMin ? ' · ' + Ariane._dureeHumaine(s.futurMin) + ' à venir' : '')
      + (s.dernier ? ' · dernière : ' + Ariane._jourHumain(s.dernier) : '') + '**';
    return ['## Sessions', '',
      '| Session | Date | Heures | Durée | Commentaire |', '|---|---|---|---|---|',
      ...lignes, '', resume].join('\n');
  }

  static lundiDeSemaine(iso) {
    const j = Ariane.jourValide(iso);
    if (!j) return null;
    const dow = new Date(j + 'T00:00:00Z').getUTCDay();
    return Ariane.decalerJour(j, -((dow + 6) % 7));
  }

  static grilleMois(ancreISO) {
    const j = Ariane.jourValide(ancreISO) || new Date().toISOString().slice(0, 10);
    const moisDebut = j.slice(0, 8) + '01';
    const [a, m] = moisDebut.split('-').map(Number);
    const moisFin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    let cur = Ariane.lundiDeSemaine(moisDebut);
    const semaines = [];
    for (let s = 0; s < 6; s += 1) {
      const ligne = [];
      for (let d = 0; d < 7; d += 1) { ligne.push(cur); cur = Ariane.decalerJour(cur, 1); }
      semaines.push(ligne);
    }
    return { moisDebut, moisFin, semaines };
  }

  static grilleSemaine(ancreISO) {
    const lundi = Ariane.lundiDeSemaine(ancreISO)
      || Ariane.lundiDeSemaine(new Date().toISOString().slice(0, 10));
    const jours = [];
    for (let d = 0; d < 7; d += 1) jours.push(Ariane.decalerJour(lundi, d));
    return { lundi, jours };
  }

  static moisSuivantN(iso, n) {
    let [a, m] = String(iso).slice(0, 7).split('-').map(Number);
    m += n;
    a += Math.floor((m - 1) / 12);
    m = ((m - 1) % 12 + 12) % 12 + 1;
    return a + '-' + String(m).padStart(2, '0') + '-01';
  }

  static creneauDepuisDrop(opts) {
    const o = opts || {};
    const jour = Ariane.jourValide(o.jourISO);
    if (!jour || !(o.hauteurHeure > 0)) return null;
    const minutes = Math.max(0, (o.yRel / o.hauteurHeure) + (o.heureDebut || 0)) * 60;
    const cale = Math.round(minutes / 15) * 15;
    const duree = o.dureeMin || 60;
    const iso = (base, min) => {
      const dec = Math.floor(min / 1440);
      const r = min - dec * 1440;
      return (dec ? Ariane.decalerJour(base, dec) : base) + 'T'
        + String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0');
    };
    return { debut: iso(jour, cale), fin: iso(jour, cale + duree) };
  }

  // Hauteur (px) du bandeau « journée entière » de la vue semaine, ajustée par
  // la poignée de redimensionnement : borne 24–320, repli sur 66 si la valeur
  // stockée est absente ou aberrante.
  static clampHauteurBandeau(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 66;
    return Math.max(24, Math.min(320, Math.round(n)));
  }

  // Disposition de la frise : parcours en profondeur, dates remontées sur les
  // méta-tâches. Les dates propres sont conservées à part, le glissé d'une
  // barre devant écrire celles de la note et non celles de sa descendance.
  // Un parent inconnu ou un cycle ne fait pas disparaître la tâche : elle
  // remonte à la racine, ce qui la rend visible plutôt que perdue.
  static disposerGantt(taches, tri, sens, plat) {
    const liste = (taches || []).filter((x) => x && x.ref);
    const parRef = new Map(liste.map((x) => [x.ref, x]));
    const enfants = new Map();
    const racines = [];
    for (const x of liste) {
      const p = Ariane.refDeLien(x.parent);
      // Un cycle se casse à la remontée : dès qu'on repasse par une tâche déjà
      // vue, la parenté est tenue pour invalide et la tâche devient racine.
      let valide = !!p && parRef.has(p) && p !== x.ref;
      if (valide) {
        const vus = new Set([x.ref]);
        let cur = p;
        while (cur && parRef.has(cur)) {
          if (vus.has(cur)) { valide = false; break; }
          vus.add(cur);
          cur = Ariane.refDeLien(parRef.get(cur).parent);
        }
      }
      if (valide) {
        if (!enfants.has(p)) enfants.set(p, []);
        enfants.get(p).push(x);
      } else {
        racines.push(x);
      }
    }
    // Une tâche sans date passe après celles qui en ont : sa place est au
    // tiroir des non planifiées, pas au milieu de la frise.
    const parDate = (a, b) => {
      const da = Ariane.jourValide(a.debut) || Ariane.jourValide(a.echeance);
      const db = Ariane.jourValide(b.debut) || Ariane.jourValide(b.echeance);
      if (da && db && da !== db) return da < db ? -1 : 1;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return a.ref.localeCompare(b.ref);
    };
    const RANGS_PRIORITE = { haute: 0, moyenne: 1, basse: 2 };
    // Le tri s'applique entre frères, jamais à travers la hiérarchie : un
    // enfant reste sous son parent quoi qu'il arrive.
    const trier = (a, b) => {
      if (tri === 'priorite') {
        const pa = RANGS_PRIORITE[a.priorite];
        const pb = RANGS_PRIORITE[b.priorite];
        const ra = pa === undefined ? 3 : pa;
        const rb = pb === undefined ? 3 : pb;
        if (ra !== rb) return ra - rb;
      } else if (tri === 'cle') {
        // La vue prépare _cle : elle seule sait lire une propriété de base.
        // Une clé vide passe après celles qui sont remplies, comme partout
        // ailleurs dans la frise.
        const ka = String(a._cle == null ? '' : a._cle);
        const kb = String(b._cle == null ? '' : b._cle);
        if (!ka !== !kb) return ka ? -1 : 1;
        const c = ka.localeCompare(kb, 'fr', { sensitivity: 'base', numeric: true });
        if (c) return c * (sens === -1 ? -1 : 1);
      } else if (tri === 'intitule') {
        const c = String(a.intitule || a.ref)
          .localeCompare(String(b.intitule || b.ref), 'fr', { sensitivity: 'base' });
        if (c) return c;
      } else if (tri === 'multi') {
        // Tri natif de la base : critères { v, s } préparés par la vue.
        const r = Ariane.comparerMulti(a._multi, b._multi);
        if (r) return r;
      }
      return parDate(a, b);
    };
    // Mode « selon le tri actif » : la frise n'impose plus le regroupement d'une
    // fille sous sa mère. Chaque tâche est une ligne comme les autres, classée
    // par le seul critère de tri. `niveau` reste 0 partout.
    if (plat) {
      return liste.slice().sort(trier).map((x) => {
        const jalon = !!x.jalon;
        const propre = {
          debut: jalon ? '' : Ariane.jourValide(x.debut),
          echeance: Ariane.jourValide(x.echeance),
        };
        return {
          ref: x.ref, intitule: x.intitule || x.ref, niveau: 0,
          statut: x.statut || 'à faire', avancement: Number(x.avancement) || 0,
          famille: x.famille || '', priorite: x.priorite || '',
          parent: Ariane.refDeLien(x.parent) || '',
          jalon, aDesEnfants: (enfants.get(x.ref) || []).length > 0, propre,
          debut: propre.debut, echeance: propre.echeance,
          sansDate: !propre.debut && !propre.echeance,
        };
      });
    }
    const lignes = [];
    const descendre = (x, niveau) => {
      const fils = (enfants.get(x.ref) || []).slice().sort(trier);
      const jalon = !!x.jalon;
      const propre = {
        debut: jalon ? '' : Ariane.jourValide(x.debut),
        echeance: Ariane.jourValide(x.echeance),
      };
      const ligne = {
        ref: x.ref, intitule: x.intitule || x.ref, niveau,
        statut: x.statut || 'à faire', avancement: Number(x.avancement) || 0,
        famille: x.famille || '', priorite: x.priorite || '',
        parent: Ariane.refDeLien(x.parent) || '',
        jalon, aDesEnfants: fils.length > 0, propre,
        debut: propre.debut, echeance: propre.echeance,
      };
      lignes.push(ligne);
      const posees = fils.map((f) => descendre(f, niveau + 1));
      if (posees.length) {
        const debuts = posees.map((p) => p.debut).filter(Boolean);
        const fins = posees.map((p) => p.echeance).filter(Boolean);
        if (!jalon && debuts.length) {
          ligne.debut = [ligne.debut, ...debuts].filter(Boolean).sort()[0];
        }
        if (fins.length) {
          const toutes = [ligne.echeance, ...fins].filter(Boolean).sort();
          ligne.echeance = toutes[toutes.length - 1];
        }
      }
      // « Sans date » se juge après l'enveloppe : une mère qui hérite des dates
      // de ses filles a désormais une barre, ce n'est plus une ligne hachurée.
      ligne.sansDate = !ligne.debut && !ligne.echeance;
      return ligne;
    };
    for (const r of racines.slice().sort(trier)) descendre(r, 0);
    return lignes;
  }

  // Regroupement de la frise. `groupes` = Map<ref, string[]> (les libellés de
  // groupe d'une tâche) ou null. La disposition en arbre est faite par
  // disposerGantt sur les seules tâches de chaque groupe : un parent absent du
  // groupe redevient racine, comme pour un parent inconnu. Une tâche
  // multi-valeur est reprise dans chaque groupe, avec une cleLigne distincte
  // mais le même ref pour l'écriture.
  static disposerFriseGroupee(taches, groupes, tri, sens, groupeDesc, plat) {
    if (!groupes) {
      return Ariane.disposerGantt(taches, tri, sens, plat)
        .map((l) => Object.assign(l, { kind: 'tache', cleLigne: l.ref }));
    }
    const SEP = ' ';
    const grDe = (ref) => {
      const g = groupes.get(ref);
      return g && g.length ? g : [Ariane.SANS_GROUPE];
    };
    const tous = new Set();
    for (const t of taches || []) for (const g of grDe(t.ref)) tous.add(g);
    const ordre = [...tous]
      .filter((g) => g !== Ariane.SANS_GROUPE)
      .sort((a, b) => String(a).localeCompare(String(b), 'fr',
        { sensitivity: 'base', numeric: true }));
    if (groupeDesc) ordre.reverse();
    if (tous.has(Ariane.SANS_GROUPE)) ordre.push(Ariane.SANS_GROUPE);

    const out = [];
    for (const g of ordre) {
      const tachesG = (taches || []).filter((t) => grDe(t.ref).includes(g));
      if (!tachesG.length) continue;
      out.push({ kind: 'groupe', libelle: g, cleGroupe: 'groupe:' + g });
      for (const l of Ariane.disposerGantt(tachesG, tri, sens, plat)) {
        out.push(Object.assign(l, { kind: 'tache', cleLigne: g + SEP + l.ref }));
      }
    }
    return out;
  }

  // Passe de placement. Attribue à chaque ligne visible un `y` et un `h`, en
  // sautant la descendance des méta-tâches repliées (comme l'ancienne
  // MoteurFrise.visibles) et les tâches des groupes repliés. `replies` : Set
  // des `ref` de méta-tâches et des `cleGroupe` repliés.
  static placerLignes(dispo, hEntete, hLigne, replies) {
    const R = replies instanceof Set ? replies : new Set(replies || []);
    const out = [];
    let y = hEntete;
    let sautGroupe = false;
    let seuilMeta = -1;
    for (const it of dispo || []) {
      if (it.kind === 'groupe') {
        sautGroupe = R.has(it.cleGroupe);
        seuilMeta = -1;
        out.push(Object.assign({}, it, { y, h: hEntete }));
        y += hEntete;
        continue;
      }
      if (sautGroupe) continue;
      if (seuilMeta >= 0 && it.niveau > seuilMeta) continue;
      seuilMeta = -1;
      out.push(Object.assign({}, it, { y, h: hLigne }));
      y += hLigne;
      if (it.aDesEnfants && R.has(it.ref)) seuilMeta = it.niveau;
    }
    return { lignes: out, hauteurTotale: y };
  }

  // Le sous-arbre d'une ligne, déduit des niveaux : tout ce qui suit et qui est
  // plus profond, jusqu'à retomber au niveau de départ.
  static _sousArbre(lignes, ref) {
    const l = lignes || [];
    const i = l.findIndex((x) => x.ref === ref);
    if (i === -1) return [];
    const out = [l[i]];
    for (let k = i + 1; k < l.length && l[k].niveau > l[i].niveau; k++) out.push(l[k]);
    return out;
  }

  // Décaler une barre emporte sa descendance : quand un chantier glisse d'un
  // mois, tout ce qu'il contient glisse avec lui.
  // Une tâche sans dates n'est pas planifiée par ricochet : ce serait décider à
  // la place de Monsieur.
  static decalerSousArbre(lignes, ref, jours) {
    const n = Number(jours) || 0;
    if (!n) return [];
    const out = [];
    for (const l of Ariane._sousArbre(lignes, ref)) {
      const d = Ariane.decalerJour(l.propre.debut, n);
      const e = Ariane.decalerJour(l.propre.echeance, n);
      if (!d && !e) continue;
      out.push({ ref: l.ref, debut: d, echeance: e });
    }
    return out;
  }

  // Étend les dates PROPRES des ascendants (`parentRef` puis au-dessus) pour
  // qu'ils contiennent la plage `bas` ({debut, echeance}). S'arrête au premier
  // niveau qui la contient déjà. Chaque niveau étendu devient la nouvelle borne
  // à contenir pour le niveau supérieur. Renvoie [{ref, debut, echeance}].
  static datesAscendants(lignes, parentRef, bas) {
    const parRef = new Map();
    for (const l of lignes || []) if (l && l.ref && !parRef.has(l.ref)) parRef.set(l.ref, l);
    const out = [];
    let borne = { debut: (bas && bas.debut) || '', echeance: (bas && bas.echeance) || '' };
    const vus = new Set();
    let ref = parentRef;
    while (ref && parRef.has(ref) && !vus.has(ref)) {
      vus.add(ref);
      const mere = parRef.get(ref);
      const pd = (mere.propre && mere.propre.debut) || '';
      const pe = (mere.propre && mere.propre.echeance) || '';
      const nd = (pd && (!borne.debut || pd <= borne.debut)) ? pd : (borne.debut || pd);
      const ne = (pe && (!borne.echeance || pe >= borne.echeance)) ? pe : (borne.echeance || pe);
      if (nd === pd && ne === pe) break;
      out.push({ ref: mere.ref, debut: nd, echeance: ne });
      borne = { debut: nd, echeance: ne };
      ref = mere.parent;
    }
    return out;
  }

  // Réordonnancement de l'aval : la tâche et tout ce qu'elle bloque, de proche
  // en proche, du même nombre de jours, descendances comprises. Le parcours
  // retient les tâches déjà vues, sans quoi un cycle de blocage le ferait
  // tourner sans fin.
  static cascadeAval(lignes, bloquants, ref, jours) {
    const n = Number(jours) || 0;
    if (!n) return [];
    const suivants = new Map();
    for (const b of bloquants || []) {
      if (!b || !b.de || !b.vers) continue;
      if (!suivants.has(b.de)) suivants.set(b.de, []);
      suivants.get(b.de).push(b.vers);
    }
    const vus = new Set();
    const file = [ref];
    while (file.length) {
      const cur = file.shift();
      if (vus.has(cur)) continue;
      vus.add(cur);
      for (const s of suivants.get(cur) || []) file.push(s);
    }
    const out = [];
    const deja = new Set();
    for (const r of vus) {
      for (const l of Ariane._sousArbre(lignes, r)) {
        if (deja.has(l.ref)) continue;
        deja.add(l.ref);
        const d = Ariane.decalerJour(l.propre.debut, n);
        const e = Ariane.decalerJour(l.propre.echeance, n);
        if (!d && !e) continue;
        out.push({ ref: l.ref, debut: d, echeance: e });
      }
    }
    return out;
  }

  // Type d'une propriété de base, à la source, sans deviner d'après le nom :
  // « properties[nom].widget » porte le widget assigné (date, checkbox…),
  // « getTypeInfo » sert de repli quand rien n'est assigné. Les colonnes de
  // fichier et de formule n'ont pas de type de propriété. En 1.12
  // « getAssignedType » a disparu : on ne s'appuie plus dessus.
  static typeProprieteBase(gestionnaire, id) {
    const s = String(id == null ? '' : id);
    if (s.startsWith('file.') || s.startsWith('formula.')) return '';
    const nom = s.replace(/^note\./, '');
    try {
      const p = gestionnaire && gestionnaire.properties;
      const assigne = p && p[nom] && p[nom].widget;
      if (assigne) return String(assigne);
      const info = gestionnaire && typeof gestionnaire.getTypeInfo === 'function'
        ? gestionnaire.getTypeInfo(nom) : null;
      const t = info && info.expected && info.expected.type;
      return t ? String(t) : '';
    } catch (e) { return ''; }
  }

  /* ---- Export XLSX (généré à la main, sans dépendance) ---------------- */

  // CRC-32 (polynôme 0xEDB88320), sur un Uint8Array. Sert au conteneur ZIP.
  static crc32(octets) {
    if (!Ariane._crcTable) {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
      }
      Ariane._crcTable = t;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < octets.length; i += 1) {
      crc = (crc >>> 8) ^ Ariane._crcTable[(crc ^ octets[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // Colonne 1 -> « A », 27 -> « AA ». Pour les références de cellule XLSX.
  static _colLettre(n) {
    let s = '';
    let x = n;
    while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
    return s || 'A';
  }

  // Numéro de série Excel d'une date ISO (jours depuis le 1899-12-30).
  static dateSerieExcel(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return Math.round((d - Date.UTC(1899, 11, 30)) / 86400000);
  }

  static _echapXml(v) {
    return String(v == null ? '' : v)
      .replace(/[ --]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Conteneur ZIP « stored » (aucune compression) : suffisant pour un XLSX,
  // et sans dépendance. `entrees` = [{ nom, donnees: Uint8Array | string }].
  static zipStored(entrees) {
    const enc = new TextEncoder();
    const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
    const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
    const morceaux = [];
    const centrale = [];
    let position = 0;
    for (const e of entrees || []) {
      const nom = enc.encode(e.nom);
      const data = e.donnees instanceof Uint8Array ? e.donnees : enc.encode(String(e.donnees));
      const crc = Ariane.crc32(data);
      const enTete = Uint8Array.from([].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nom.length), u16(0)));
      morceaux.push(enTete, nom, data);
      centrale.push({ nom, crc, taille: data.length, position });
      position += enTete.length + nom.length + data.length;
    }
    const debutCentrale = position;
    const cd = [];
    for (const c of centrale) {
      const rec = Uint8Array.from([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c.crc), u32(c.taille), u32(c.taille),
        u16(c.nom.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(c.position)));
      cd.push(rec, c.nom);
      position += rec.length + c.nom.length;
    }
    const tailleCentrale = position - debutCentrale;
    const fin = Uint8Array.from([].concat(
      u32(0x06054b50), u16(0), u16(0),
      u16(centrale.length), u16(centrale.length),
      u32(tailleCentrale), u32(debutCentrale), u16(0)));
    const tout = [...morceaux, ...cd, fin];
    let total = 0;
    for (const p of tout) total += p.length;
    const sortie = new Uint8Array(total);
    let pos = 0;
    for (const p of tout) { sortie.set(p, pos); pos += p.length; }
    return sortie;
  }

  // Lundi (ISO) de la semaine contenant `iso`.
  static _lundiDe(iso) {
    const dow = new Date(iso + 'T00:00:00Z').getUTCDay(); // 0 = dimanche
    return Ariane.decalerJour(iso, -((dow + 6) % 7));
  }

  // Découpe [debutISO, finISO] en périodes selon `unite` ('jour'|'semaine'|
  // 'mois'). Si le nombre de colonnes dépasse `maxCols`, l'unité s'élargit
  // (jour -> semaine -> mois). Chaque période : { debut, fin, label }.
  static periodesGantt(debutISO, finISO, unite, maxCols) {
    const MC = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.',
      'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const max = maxCols || 400;
    const d0 = Ariane.jourValide(debutISO);
    const f0 = Ariane.jourValide(finISO);
    if (!d0 || !f0 || d0 > f0) return { unite: unite || 'mois', periodes: [] };
    const ordre = ['jour', 'semaine', 'mois'];
    let u = ordre.indexOf(unite) >= 0 ? unite : 'mois';
    for (;;) {
      const periodes = [];
      const jj = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
      if (u === 'jour') {
        let j = d0;
        while (j <= f0 && periodes.length <= max) {
          periodes.push({ debut: j, fin: j, label: jj(j) });
          j = Ariane.decalerJour(j, 1);
        }
      } else if (u === 'semaine') {
        let j = Ariane._lundiDe(d0);
        while (j <= f0 && periodes.length <= max) {
          periodes.push({ debut: j, fin: Ariane.decalerJour(j, 6), label: jj(j) });
          j = Ariane.decalerJour(j, 7);
        }
      } else {
        let y = Number(d0.slice(0, 4));
        let m = Number(d0.slice(5, 7));
        const ey = Number(f0.slice(0, 4));
        const em = Number(f0.slice(5, 7));
        while ((y < ey || (y === ey && m <= em)) && periodes.length <= max) {
          const deb = y + '-' + String(m).padStart(2, '0') + '-01';
          const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
          periodes.push({ debut: deb, fin, label: (MC[m - 1] || m) + ' ' + String(y).slice(2) });
          m += 1;
          if (m > 12) { m = 1; y += 1; }
        }
      }
      if (periodes.length <= max || u === 'mois') return { unite: u, periodes };
      u = ordre[ordre.indexOf(u) + 1];
    }
  }

  // Construit un .xlsx d'une feuille. `feuille` :
  //   { nom, titre?, colonnes:[{ titre, largeur? }], lignes:[ [cellule, …] ], figerColonnes? }
  // cellule : { v, t?:'s'|'n'|'d'|'b',
  //             s?:{ b?, color?:'RRGGBB', fill?:'RRGGBB', sz?, fmt?:'date'|'pourcent',
  //                  bord?:'grille'|'entete'|'today', align?:'center' } }
  // Titre fusionné, en-tête figée + colorée, quadrillage discret, filtre auto,
  // largeurs, dates réelles, teintes.
  static classeurXlsx(feuille) {
    const f = feuille || {};
    const cols = f.colonnes || [];
    const lignes = f.lignes || [];
    const nomFeuille = (Ariane._echapXml(f.nom || 'Frise').slice(0, 31)) || 'Frise';
    const titre = f.titre ? String(f.titre) : '';
    const decal = titre ? 1 : 0;            // décalage des lignes si titre
    const ligEntete = 1 + decal;

    const norm = (s) => ({
      b: s && s.b ? 1 : 0, color: (s && s.color) || '', fill: (s && s.fill) || '',
      sz: (s && s.sz) || 11, fmt: (s && s.fmt) || '',
      bord: (s && s.bord) || '', align: (s && s.align) || '' });
    const cleStyle = (s) => JSON.stringify(norm(s));
    const styles = new Map();
    styles.set(cleStyle({}), 0);
    const enteteStyle = { b: true, color: 'FFFFFF', fill: '44546A', bord: 'entete', align: 'center' };
    const titreStyle = { b: true, color: 'FFFFFF', fill: '44546A', sz: 14, align: 'center' };
    const noter = (s) => {
      const k = cleStyle(s);
      if (!styles.has(k)) styles.set(k, styles.size);
      return styles.get(k);
    };
    // Style effectif d'une cellule de données : quadrillage discret par défaut,
    // sauf si la cellule impose déjà une bordure.
    const effData = (c) => Object.assign({ bord: 'grille' }, (c && c.s) || {});
    noter(enteteStyle);
    if (titre) noter(titreStyle);
    for (const c of cols) if (c && c.sEntete) noter(c.sEntete);
    for (const rangee of lignes) {
      for (let i = 0; i < cols.length; i += 1) noter(effData(rangee[i]));
    }

    const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
    const fontIndex = new Map([['0||11', 0]]);
    const fillsHex = [];
    const bordSet = new Set([''].concat([...styles.keys()].map((k) => JSON.parse(k).bord)));
    const bordListe = [...bordSet];
    const bordIndex = new Map(bordListe.map((n, i) => [n, i]));
    const bordXml = (n) => {
      const thin = (c) => '<' + c + ' style="thin"><color rgb="FFD9D9D9"/></' + c + '>';
      if (n === 'grille') {
        return '<border>' + thin('left') + thin('right') + thin('top') + thin('bottom') + '<diagonal/></border>';
      }
      if (n === 'entete') {
        return '<border><left style="thin"><color rgb="FF8EA9DB"/></left>'
          + '<right style="thin"><color rgb="FF8EA9DB"/></right>'
          + '<top style="thin"><color rgb="FF8EA9DB"/></top>'
          + '<bottom style="medium"><color rgb="FF44546A"/></bottom><diagonal/></border>';
      }
      if (n === 'today') {
        return '<border><left style="medium"><color rgb="FFC55A11"/></left>'
          + thin('right') + thin('top') + thin('bottom') + '<diagonal/></border>';
      }
      return '<border><left/><right/><top/><bottom/><diagonal/></border>';
    };
    const numDate = 164;
    const numPct = 165;
    let besoinDate = false;
    let besoinPct = false;
    const xfs = [];
    for (const [k] of styles) {
      const s = JSON.parse(k);
      const fk = s.b + '|' + s.color + '|' + s.sz;
      if (!fontIndex.has(fk)) {
        fontIndex.set(fk, fonts.length);
        fonts.push('<font>' + (s.b ? '<b/>' : '')
          + '<sz val="' + s.sz + '"/>'
          + (s.color ? '<color rgb="FF' + s.color + '"/>' : '')
          + '<name val="Calibri"/></font>');
      }
      let fillId = 0;
      if (s.fill) {
        let idx = fillsHex.indexOf(s.fill);
        if (idx < 0) { fillsHex.push(s.fill); idx = fillsHex.length - 1; }
        fillId = 2 + idx;
      }
      if (s.fmt === 'date') besoinDate = true;
      if (s.fmt === 'pourcent') besoinPct = true;
      const numFmtId = s.fmt === 'date' ? numDate : (s.fmt === 'pourcent' ? numPct : 0);
      const borderId = bordIndex.get(s.bord) || 0;
      const align = s.align === 'center'
        ? '<alignment horizontal="center" vertical="center"/>' : '';
      xfs.push('<xf numFmtId="' + numFmtId + '" fontId="' + fontIndex.get(fk)
        + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0"'
        + (numFmtId ? ' applyNumberFormat="1"' : '')
        + (s.b || s.color || s.sz !== 11 ? ' applyFont="1"' : '')
        + (fillId ? ' applyFill="1"' : '')
        + (borderId ? ' applyBorder="1"' : '')
        + (align ? ' applyAlignment="1"' : '') + '>'
        + align + '</xf>');
    }
    const fills = ['<fill><patternFill patternType="none"/></fill>',
      '<fill><patternFill patternType="gray125"/></fill>']
      .concat(fillsHex.map((h) => '<fill><patternFill patternType="solid"><fgColor rgb="FF'
        + h + '"/><bgColor indexed="64"/></patternFill></fill>'));
    const numFmts = [];
    if (besoinDate) numFmts.push('<numFmt numFmtId="' + numDate + '" formatCode="yyyy\\-mm\\-dd"/>');
    if (besoinPct) numFmts.push('<numFmt numFmtId="' + numPct + '" formatCode="0&quot;%&quot;"/>');

    const styleXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + (numFmts.length ? '<numFmts count="' + numFmts.length + '">' + numFmts.join('') + '</numFmts>' : '')
      + '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>'
      + '<fills count="' + fills.length + '">' + fills.join('') + '</fills>'
      + '<borders count="' + bordListe.length + '">' + bordListe.map(bordXml).join('') + '</borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '<dxfs count="0"/>'
      + '</styleSheet>';

    const cellule = (colNum, ligNum, c, sForce) => {
      const ref = Ariane._colLettre(colNum) + ligNum;
      const s = sForce || (c && c.s) || null;
      const si = s ? styles.get(cleStyle(s)) : 0;
      const attrS = si ? ' s="' + si + '"' : '';
      if (!c || c.v == null || c.v === '') return '<c r="' + ref + '"' + attrS + '/>';
      if (c.t === 'n') return '<c r="' + ref + '"' + attrS + '><v>' + Number(c.v) + '</v></c>';
      if (c.t === 'b') return '<c r="' + ref + '"' + attrS + ' t="b"><v>' + (c.v ? 1 : 0) + '</v></c>';
      if (c.t === 'd') {
        const serie = Ariane.dateSerieExcel(c.v);
        return serie == null
          ? '<c r="' + ref + '"' + attrS + ' t="inlineStr"><is><t>' + Ariane._echapXml(c.v) + '</t></is></c>'
          : '<c r="' + ref + '"' + attrS + '><v>' + serie + '</v></c>';
      }
      return '<c r="' + ref + '"' + attrS + ' t="inlineStr"><is><t xml:space="preserve">'
        + Ariane._echapXml(c.v) + '</t></is></c>';
    };
    const rangs = [];
    if (titre) {
      rangs.push('<row r="1" ht="26" customHeight="1">'
        + cols.map((c, i) => cellule(i + 1, 1, i === 0 ? { v: titre, t: 's' } : { v: '' }, titreStyle)).join('')
        + '</row>');
    }
    rangs.push('<row r="' + ligEntete + '" ht="20" customHeight="1">' + cols.map((c, i) =>
      cellule(i + 1, ligEntete, { v: c.titre, t: 's' }, (c && c.sEntete) || enteteStyle)).join('') + '</row>');
    lignes.forEach((rangee, r) => {
      const y = ligEntete + 1 + r;
      rangs.push('<row r="' + y + '">'
        + cols.map((_, i) => cellule(i + 1, y, rangee[i], effData(rangee[i]))).join('') + '</row>');
    });
    const colsXml = cols.length
      ? '<cols>' + cols.map((c, i) => '<col min="' + (i + 1) + '" max="' + (i + 1)
        + '" width="' + (Math.max(4, Math.min(80, c.largeur || 16))) + '" customWidth="1"/>').join('') + '</cols>'
      : '';
    const derniere = Ariane._colLettre(Math.max(1, cols.length));
    const dernRef = derniere + (ligEntete + lignes.length);
    const xSplit = Math.max(0, Math.min(f.figerColonnes || 0, cols.length));
    const hautGele = ligEntete;             // en-tête (et titre) figés
    const coinBR = Ariane._colLettre(xSplit + 1) + (hautGele + 1);
    const pane = xSplit
      ? '<pane xSplit="' + xSplit + '" ySplit="' + hautGele + '" topLeftCell="' + coinBR
        + '" activePane="bottomRight" state="frozen"/><selection pane="bottomRight"/>'
      : '<pane ySplit="' + hautGele + '" topLeftCell="A' + (hautGele + 1)
        + '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>';
    const merge = titre
      ? '<mergeCells count="1"><mergeCell ref="A1:' + derniere + '1"/></mergeCells>' : '';
    const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView showGridLines="0" workbookViewId="0">' + pane + '</sheetView></sheetViews>'
      + '<sheetFormatPr defaultRowHeight="17"/>'
      + colsXml
      + '<sheetData>' + rangs.join('') + '</sheetData>'
      + '<autoFilter ref="A' + ligEntete + ':' + dernRef + '"/>'
      + merge
      + '</worksheet>';

    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>';
    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
      + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheets><sheet name="' + nomFeuille + '" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>';

    return Ariane.zipStored([
      { nom: '[Content_Types].xml', donnees: contentTypes },
      { nom: '_rels/.rels', donnees: rels },
      { nom: 'xl/workbook.xml', donnees: workbook },
      { nom: 'xl/_rels/workbook.xml.rels', donnees: workbookRels },
      { nom: 'xl/styles.xml', donnees: styleXml },
      { nom: 'xl/worksheets/sheet1.xml', donnees: sheetXml },
    ]);
  }

  //#endregion Ariane · static · frise / gantt
};

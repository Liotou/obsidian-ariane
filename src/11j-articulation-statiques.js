
// ── avecArticulationStatiques ─────────────────────────────────────────────
// Domaine : tâches (frise, articulation, calendrier).
// Fonctions pures de l'articulation : plan, arêtes, routage, zones thématiques.
const avecArticulationStatiques = (Base) => class extends Base {
  //#region Ariane · static · articulation
  // ── static · articulation ────────────────────────────────────────────────

  // Refs des boîtes qu'un rectangle de sélection TOUCHE (chevauchement, pas
  // seulement inclusion). `boites` : [{ ref, x, y, w, h }] ; `rect` : { x, y, w, h }.
  static rectSelection(boites, rect) {
    const r = rect || {};
    const rx = r.x || 0;
    const ry = r.y || 0;
    const rw = r.w || 0;
    const rh = r.h || 0;
    const out = [];
    for (const b of boites || []) {
      if (!b) continue;
      if (b.x < rx + rw && b.x + b.w > rx && b.y < ry + rh && b.y + b.h > ry) out.push(b.ref);
    }
    return out;
  }

  // Plan de travail de l'articulation : outils purs.

  // Les arêtes dont les DEUX extrémités sont dans l'ensemble de refs.
  static aretesEntre(aretes, refs) {
    const s = refs instanceof Set ? refs : new Set(refs || []);
    return (aretes || []).filter((a) => a && s.has(a.de) && s.has(a.vers));
  }

  // Relatifs d'une tâche qui NE SONT PAS sur le plan :
  //  - sousTaches : enfants de `ref` (arête hier `de === ref`) hors plan
  //  - bloquantes : tâches qui bloquent `ref` (arête bloque `vers === ref`) hors plan
  static relativesHorsPlan(ref, aretes, refsPlan) {
    const s = refsPlan instanceof Set ? refsPlan : new Set(refsPlan || []);
    const sousTaches = [];
    const bloquantes = [];
    for (const a of aretes || []) {
      if (!a) continue;
      if (a.type === 'hier' && a.de === ref && !s.has(a.vers)) sousTaches.push(a.vers);
      if (a.type === 'bloque' && a.vers === ref && !s.has(a.de)) bloquantes.push(a.de);
    }
    return { sousTaches, bloquantes };
  }

  // Refs à RETIRER du plan pour « replier » les relatifs de `ref` d'un type :
  //  - 'hier'   : le sous-arbre des sous-tâches sur le plan ;
  //  - 'bloque' : la chaîne des tâches bloquantes sur le plan.
  // Une carte reliée aussi à une AUTRE carte gardée (autre parent / bloque une
  // autre carte du plan) n'est jamais retirée : on ne replie que ce qui
  // n'existe sur le plan QUE par `ref`. Miroir de _deplierRelatifs.
  static replierRelatifs(ref, aretes, refsPlan, type) {
    const plan = refsPlan instanceof Set ? refsPlan : new Set(refsPlan || []);
    if (!plan.has(ref) || (type !== 'hier' && type !== 'bloque')) return [];
    const suivants = new Map();   // r -> relatifs directs « en aval du repli »
    const retenants = new Map();  // r -> cartes du plan qui le retiennent
    for (const a of aretes || []) {
      if (!a || a.type !== type) continue;
      // hier : parent (de) -> enfant (vers), on descend.
      // bloque : bloqué (vers) -> bloqueur (de), on remonte vers les bloqueurs.
      const amont = type === 'hier' ? a.de : a.vers;
      const aval = type === 'hier' ? a.vers : a.de;
      if (!plan.has(amont) || !plan.has(aval) || amont === aval) continue;
      if (!suivants.has(amont)) suivants.set(amont, []);
      suivants.get(amont).push(aval);
      if (!retenants.has(aval)) retenants.set(aval, []);
      retenants.get(aval).push(amont);
    }
    const retrait = new Set();
    const file = (suivants.get(ref) || []).slice();
    while (file.length) {
      const r = file.shift();
      if (r === ref || retrait.has(r)) continue;
      if (!(retenants.get(r) || []).every((p) => p === ref || retrait.has(p))) continue;
      retrait.add(r);
      for (const s of suivants.get(r) || []) file.push(s);
    }
    return [...retrait];
  }

  // Positions en grille pour poser N cartes, en sautant les cellules qui
  // chevaucheraient une boîte déjà occupée. `occupe` : [{ x, y, w, h }].
  static grillePlacement(n, opts) {
    const o = opts || {};
    const ox = (o.origine && o.origine.x) || 0;
    const oy = (o.origine && o.origine.y) || 0;
    const px = (o.pas && o.pas.x) || 240;
    const py = (o.pas && o.pas.y) || 150;
    const w = o.carte && o.carte.w ? o.carte.w : 210;
    const h = o.carte && o.carte.h ? o.carte.h : 58;
    const occupe = o.occupe || [];
    const chevauche = (x, y) => occupe.some((b) =>
      x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
    const out = [];
    let col = 0;
    let ligne = 0;
    const parLigne = Math.max(1, o.parLigne || 4);
    let garde = 0;
    while (out.length < n && garde < 10000) {
      garde++;
      const x = ox + col * px;
      const y = oy + ligne * py;
      if (!chevauche(x, y) && !out.some((p) => p.x === x && p.y === y)) out.push({ x, y });
      col++;
      if (col >= parLigne) { col = 0; ligne++; }
    }
    return out;
  }

  // Détection des cycles par parcours en profondeur. Le tableau « chemin »
  // garde la branche courante : y retomber, c'est boucler.
  // Un cycle n'est retenu qu'une fois, quel que soit le sommet par lequel on y
  // entre, d'où la signature construite sur ses membres triés.
  static cyclesDe(aretes) {
    const sortants = new Map();
    for (const e of aretes || []) {
      if (!e || !e.de || !e.vers) continue;
      if (!sortants.has(e.de)) sortants.set(e.de, []);
      sortants.get(e.de).push(e.vers);
    }
    const trouves = new Map();
    const clos = new Set();
    const chemin = [];
    const dansChemin = new Set();
    const descendre = (n) => {
      if (dansChemin.has(n)) {
        const cycle = chemin.slice(chemin.indexOf(n)).concat([n]);
        const signature = [...new Set(cycle)].sort().join('\u0000');
        if (!trouves.has(signature)) trouves.set(signature, cycle);
        return;
      }
      if (clos.has(n)) return;
      chemin.push(n);
      dansChemin.add(n);
      for (const suivant of sortants.get(n) || []) descendre(suivant);
      dansChemin.delete(n);
      chemin.pop();
      clos.add(n);
    };
    for (const depart of sortants.keys()) descendre(depart);
    return [...trouves.values()];
  }

  // Si A bloque B, B ne peut pas commencer avant que A ne s'achève. Commencer
  // le jour même de l'échéance reste admis : une tâche peut prendre la suite
  // d'une autre dans la journée.
  // Une date manquante ne permet de rien conclure, et ne signale donc rien :
  // mieux vaut taire un doute que crier une fausse erreur sur chaque tâche non
  // encore planifiée.
  static datesIncoherentes(aretes, datesParRef) {
    const d = datesParRef || {};
    const jour = (v) => {
      const x = String(v == null ? '' : v).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : '';
    };
    const out = [];
    for (const e of aretes || []) {
      if (!e) continue;
      const fin = jour(d[e.de] && d[e.de].echeance);
      const debut = jour(d[e.vers] && d[e.vers].debut);
      if (!fin || !debut) continue;
      if (debut < fin) out.push({ de: e.de, vers: e.vers, fin, debut });
    }
    return out;
  }

  // Le graphe des tâches : nœuds + arêtes typées, déduits du frontmatter.
  // Arête hiérarchie : de = parent, vers = enfant. Arête blocage : de =
  // bloquant, vers = bloqué. Un bout absent du jeu, ou un lien vers soi, est
  // ignoré. Chaque paire (de, vers, type) n'apparaît qu'une fois.
  static grapheArticulation(taches) {
    const liste = (taches || []).filter((x) => x && x.ref);
    const dedans = new Set(liste.map((x) => x.ref));
    const noeuds = liste.map((x) => ({
      ref: x.ref, intitule: x.intitule || x.ref, statut: x.statut || 'à faire',
      avancement: Number(x.avancement) || 0, jalon: !!x.jalon,
      famille: x.famille || 'action', echeance: Ariane.jourValide(x.echeance),
      x: x.x, y: x.y,
    }));
    const aretes = [];
    const vues = new Set();
    const pousser = (de, vers, type, libelle) => {
      if (!de || !vers || de === vers || !dedans.has(de) || !dedans.has(vers)) return;
      const cle = de + ' ' + vers + ' ' + type;
      if (vues.has(cle)) return;
      vues.add(cle);
      aretes.push({ de, vers, type, libelle: libelle || '' });
    };
    for (const x of liste) {
      const p = Ariane.refDeLien(x.parent);
      if (p) pousser(p, x.ref, 'hier', '');
      for (const b of x.bloquePar || []) {
        const m = String(b).match(/\|([^\]]*)\]\]$/);
        pousser(Ariane.refDeLien(b), x.ref, 'bloque', m ? m[1].trim() : '');
      }
    }
    return { noeuds, aretes };
  }

  // Statut « bloquée » et « impactée » DÉRIVÉS (jamais écrits dans le frontmatter),
  // renvoyés en deux ensembles disjoints { bloquee, impactee }.
  //  - bloquée (opérationnel) : blocage direct (au moins un bloqueur non clos,
  //    terminé/abandonné) PLUS gel descendant (tout le sous-arbre d'une tâche
  //    à blocage direct) ;
  //  - impactée (attentionnel) : toute tâche ayant une descendante bloquée,
  //    sans être bloquée elle-même — simple remontée d'information vers les
  //    mères, elle ne gèle rien et une sœur d'une tâche bloquée n'est pas gelée.
  // `noeuds` : [{ref, statut}] ; `aretes` : [{de, vers, type}] avec type 'hier'
  // (de = parent) ou 'bloque' (de = bloqueur).
  static propagerBlocage(noeuds, aretes) {
    const parRef = new Map();
    for (const n of noeuds || []) if (n && n.ref && !parRef.has(n.ref)) parRef.set(n.ref, n);
    const parentDe = new Map();
    const enfants = new Map();
    const bloqueursDe = new Map();
    for (const a of aretes || []) {
      if (!a || !a.de || !a.vers || !parRef.has(a.de) || !parRef.has(a.vers)) continue;
      if (a.type === 'hier') {
        parentDe.set(a.vers, a.de);
        if (!enfants.has(a.de)) enfants.set(a.de, []);
        enfants.get(a.de).push(a.vers);
      } else if (a.type === 'bloque') {
        if (!bloqueursDe.has(a.vers)) bloqueursDe.set(a.vers, []);
        bloqueursDe.get(a.vers).push(a.de);
      }
    }
    const clos = (ref) => {
      const s = String((parRef.get(ref) || {}).statut || '');
      return s === 'terminée' || s === 'abandonnée';
    };
    const direct = new Set();
    for (const [ref, bs] of bloqueursDe) {
      if (bs.some((b) => !clos(b))) direct.add(ref);
    }
    const bloquee = new Set(direct);
    const descendre = (ref) => {
      for (const c of enfants.get(ref) || []) {
        if (!bloquee.has(c)) { bloquee.add(c); descendre(c); }
      }
    };
    for (const ref of direct) descendre(ref);
    const impactee = new Set();
    for (const ref of bloquee) {
      let cur = parentDe.get(ref);
      const vus = new Set([ref]);
      while (cur && parRef.has(cur) && !vus.has(cur)) {
        vus.add(cur);
        impactee.add(cur);
        cur = parentDe.get(cur);
      }
    }
    for (const ref of bloquee) impactee.delete(ref);
    return { bloquee, impactee };
  }

  // Avancement EFFECTIF de chaque tâche (dérivé, jamais écrit) :
  //  - feuille : son propre % (terminée = 100, abandonnée = 0) ;
  //  - mère : moyenne des filles pondérée par leur durée en jours. Une fille
  //    abandonnée sort de la moyenne ; si aucune fille n'est datée, moyenne
  //    simple ; si toutes sont abandonnées, on retombe sur le % propre.
  // `taches` : [{ref, parent, statut, avancement, debut, echeance}].
  static avancementsDerives(taches) {
    const parRef = new Map();
    for (const t of taches || []) if (t && t.ref && !parRef.has(t.ref)) parRef.set(t.ref, t);
    const enfants = new Map();
    for (const t of parRef.values()) {
      const p = Ariane.refDeLien(t.parent);
      if (p && parRef.has(p) && p !== t.ref) {
        if (!enfants.has(p)) enfants.set(p, []);
        enfants.get(p).push(t.ref);
      }
    }
    const propre = (t) => {
      const s = String(t.statut || '');
      if (s === 'terminée') return 100;
      if (s === 'abandonnée') return 0;
      return Math.max(0, Math.min(100, Number(t.avancement) || 0));
    };
    const duree = (t) => {
      const d = Ariane.jourValide(t.debut);
      const e = Ariane.jourValide(t.echeance);
      return (d && e) ? Math.max(1, Ariane.ecartJours(d, e) + 1) : 0;
    };
    const cache = new Map();
    const calc = (ref, pile) => {
      if (cache.has(ref)) return cache.get(ref);
      const t = parRef.get(ref);
      if (!t) return 0;
      const kids = enfants.get(ref);
      let v;
      if (!kids || !kids.length || pile.has(ref)) {
        v = propre(t);
      } else {
        const p2 = new Set(pile);
        p2.add(ref);
        let sPoids = 0;
        let sVal = 0;
        let sSimple = 0;
        let n = 0;
        for (const c of kids) {
          const ct = parRef.get(c);
          if (ct && String(ct.statut || '') === 'abandonnée') continue;
          const cv = calc(c, p2);
          const w = ct ? duree(ct) : 0;
          sPoids += w;
          sVal += w * cv;
          sSimple += cv;
          n += 1;
        }
        if (!n) v = propre(t);
        else if (sPoids > 0) v = sVal / sPoids;
        else v = sSimple / n;
      }
      v = Math.round(v);
      cache.set(ref, v);
      return v;
    };
    const out = new Map();
    for (const ref of parRef.keys()) out.set(ref, calc(ref, new Set()));
    return out;
  }

  /* ---- Apple Rappels via EventKit (JXA, macOS) --------------------- */

  // Préambule EventKit commun aux entités Rappels (1) et Événements (0) :
  // utilitaires qui ne dépendent pas de l'entité. EventKit voit TOUT (y compris
  // les listes rangées dans un groupe, invisibles à l'AppleScript de Rappels).
  static _jxaEKCommun() {
    return [
      'ObjC.import("EventKit"); ObjC.import("CoreFoundation");',
      'var ST = $.EKEventStore.alloc.init;',
      'function pompe(ms){ var t=Date.now(); while(Date.now()-t<ms){ $.CFRunLoopRunInMode($.kCFRunLoopDefaultMode,0.03,false); } }',
      'function norm(x){ return String(x==null?"":x).trim().toLowerCase().replace(/\\s+/g," "); }',
      'function net(x){ return String(x==null?"":x).replace(/[\\t\\r\\n]+/g," "); }',
      'function titre(c){ try{ return ObjC.unwrap(c.title()); }catch(e){ try{ return ObjC.unwrap(c.title); }catch(e2){ return ""; } } }',
      'function comps(iso,heure){ var p=String(iso).split("-"); var c=$.NSDateComponents.alloc.init; c.year=parseInt(p[0],10); c.month=parseInt(p[1],10); c.day=parseInt(p[2],10); if(heure){ var q=String(heure).split(":"); c.hour=parseInt(q[0],10)||0; c.minute=parseInt(q[1],10)||0; } return c; }',
      'function isoDe(dc){ if(!dc) return ""; var y,mo,da; try{ y=dc.year; mo=dc.month; da=dc.day; }catch(e){ return ""; } if(!(y>0)) return ""; var z=function(n){return (n<10?"0":"")+n;}; var s=y+"-"+z(mo)+"-"+z(da); var h,mi; try{ h=dc.hour; mi=dc.minute; }catch(e){ h=-1; } if(h>=0 && h<24) s+="T"+z(h)+":"+z(mi>=0?mi:0); return s; }',
    ].join('\n');
  }

  // Préambule Rappels (entité 1). Concatène le commun + les helpers propres à
  // l'entité. Sortie fonctionnellement identique à l'ancien _jxaEK monolithique.
  static _jxaEK() {
    return [
      Ariane._jxaEKCommun(),
      'function acces(){ var d=false; try{ ST.requestFullAccessToRemindersWithCompletion(function(g,e){d=true;}); }catch(e){ try{ ST.requestAccessToEntityTypeCompletion(1,function(g,e){d=true;}); }catch(e2){} } var t=Date.now(); while(!d && Date.now()-t<20000){ $.CFRunLoopRunInMode($.kCFRunLoopDefaultMode,0.05,false); } }',
      'function listes(){ try{ return ST.calendarsForEntityType(1); }catch(e){ return $([]); } }',
      'function listeParNom(nom){ if(!nom) { try{ return ST.defaultCalendarForNewReminders; }catch(e){ return null; } } var L=listes(); for(var i=0;i<L.count;i++){ var c=L.objectAtIndex(i); if(titre(c)===nom) return c; } for(var j=0;j<L.count;j++){ var c2=L.objectAtIndex(j); if(norm(titre(c2))===norm(nom)) return c2; } return null; }',
      'function remById(id){ if(!id) return null; try{ var it=ST.calendarItemWithIdentifier(id); if(it && it.isKindOfClass($.EKReminder)) return it; }catch(e){} return null; }',
      'function fetchListe(cal){ var pred=ST.predicateForRemindersInCalendars($([cal])); var res=null,d=false; ST.fetchRemindersMatchingPredicateCompletion(pred,function(a){res=a;d=true;}); var t=Date.now(); while(!d && Date.now()-t<15000){ $.CFRunLoopRunInMode($.kCFRunLoopDefaultMode,0.05,false); } return res; }',
    ].join('\n');
  }

  // Préambule Événements (entité 0). Jumeau de _jxaEK, helpers propres à EKEvent.
  static _jxaEKEvenements() {
    return [
      Ariane._jxaEKCommun(),
      // Statut TCC Calendriers (SYNCHRONE) : 0 indéterminé, 1 restreint,
      // 2 refusé, 3 autorisé (accès complet), 4 écriture seule.
      // Number() est INDISPENSABLE : authorizationStatusForEntityType renvoie un
      // NSInteger ponté qui n\'est pas === à un littéral JS (=> le garde « !== 3 »
      // se déclenchait toujours et tout renvoyait « __ACCES__ »).
      'function statutAcces(){ try{ return Number($.EKEventStore.authorizationStatusForEntityType(0)); }catch(e){ return -1; } }',
      // N\'ouvre la demande d\'accès QUE si indéterminé ; sinon renvoie le statut
      // tout de suite (pas d\'attente de 20 s inutile quand c\'est déjà refusé).
      'function acces(){ var st=statutAcces(); if(st!==0) return st; var d=false; try{ ST.requestFullAccessToEventsWithCompletion(function(g,e){d=true;}); }catch(e){ try{ ST.requestAccessToEntityTypeCompletion(0,function(g,e){d=true;}); }catch(e2){} } var t=Date.now(); while(!d && Date.now()-t<15000){ $.CFRunLoopRunInMode($.kCFRunLoopDefaultMode,0.05,false); } return statutAcces(); }',
      'function cals(){ try{ return ST.calendarsForEntityType(0); }catch(e){ return $([]); } }',
      'function calParNom(nom){ if(!nom) { try{ return ST.defaultCalendarForNewEvents; }catch(e){ return null; } } var L=cals(); for(var i=0;i<L.count;i++){ var c=L.objectAtIndex(i); if(titre(c)===nom) return c; } for(var j=0;j<L.count;j++){ var c2=L.objectAtIndex(j); if(norm(titre(c2))===norm(nom)) return c2; } return null; }',
      'function evById(id){ if(!id) return null; try{ var e=ST.eventWithIdentifier(id); if(e) return e; }catch(e1){} try{ var it=ST.calendarItemWithIdentifier(id); if(it && it.isKindOfClass($.EKEvent)) return it; }catch(e2){} return null; }',
      'function evId(e){ var s=""; try{ s=ObjC.unwrap(e.eventIdentifier); }catch(x1){} if(!s) try{ s=ObjC.unwrap(e.calendarItemIdentifier); }catch(x2){} return s||""; }',
      'function fmtDate(dc){ try{ return $.NSCalendar.currentCalendar.dateFromComponents(dc); }catch(e){ return null; } }',
      'function isoDeDate(d){ if(!d) return ""; try{ var f=$.NSDateFormatter.alloc.init; f.dateFormat=$("yyyy-MM-dd\'T\'HH:mm"); f.timeZone=$.NSTimeZone.localTimeZone; return ObjC.unwrap(f.stringFromDate(d)); }catch(e){ return ""; } }',
      // NB : pas d\'extraction de couleur ici — passer `EKCalendar.color`
      // (CGColorRef) à NSColor/CIColor fait planter osascript (SIGBUS). Les
      // couleurs sont relevées à part, en AppleScript (genererASCouleursAgendas).
    ].join('\n');
  }

  // AppleScript (pas JXA) : « nom \t r,g,b » (composantes 16 bits) par ligne,
  // pour tous les calendriers. Sert à colorer les événements de fond.
  static genererASCouleursAgendas() {
    return [
      'tell application "Calendar"',
      'set AppleScript\'s text item delimiters to ","',
      'set sortie to ""',
      'repeat with c in calendars',
      'try',
      'set sortie to sortie & (name of c) & (ASCII character 9) & ((color of c) as text) & (ASCII character 10)',
      'end try',
      'end repeat',
      'end tell',
      'return sortie',
    ].join('\n');
  }

  // Sortie de genererASCouleursAgendas → { "Nom du calendrier": "#rrggbb" }.
  // Les composantes AppleScript sont sur 16 bits (0–65535).
  static parseCouleursAgendas(txt) {
    const out = {};
    for (const ligne of String(txt || '').split('\n')) {
      const i = ligne.indexOf('\t');
      if (i < 1) continue;
      const nom = ligne.slice(0, i).trim();
      const m = ligne.slice(i + 1).trim().match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!nom || !m) continue;
      const h = (v) => {
        const n = Math.max(0, Math.min(255, Math.round((Number(v) || 0) * 255 / 65535)));
        return (n < 16 ? '0' : '') + n.toString(16);
      };
      out[nom] = '#' + h(m[1]) + h(m[2]) + h(m[3]);
    }
    return out;
  }

  // Crée / met à jour un rappel par tâche. Rend « ref \t id » (id vide si échec).
  // `taches` : [{ ref, id, titre, notes, liste, echeance, heure, priorite,
  //               termine, dedup }].
  // Dédoublonnage (dedup, calculé côté JS quand la référence se lit dans le
  // titre) : un rappel-id perdu faisait créer une copie à chaque push, sans
  // jamais reprendre l'ancienne — d'où les doublons à l'identique dans Rappels.
  // On scanne la liste cible : le premier homonyme est REPRIS (son id rendu,
  // donc re-mémorisé dans la note), les suivants supprimés ; quand le rappel
  // lié est vivant, les homonymes restants sont de simples restes → supprimés.
  static genererJXARappels(taches) {
    const IN = JSON.stringify({ taches: Array.isArray(taches) ? taches : [] });
    return [
      Ariane._jxaEK(),
      'function run(){',
      '  var IN=' + IN + '; acces();',
      '  var PRIO={haute:1,moyenne:5,basse:9};',
      '  var cacheL={};',
      '  function listeDe(cal){ try{ var k=ObjC.unwrap(cal.calendarIdentifier); if(!cacheL[k]) cacheL[k]=fetchListe(cal); return cacheL[k]; }catch(e){ return null; } }',
      '  var out=[];',
      '  for(var i=0;i<IN.taches.length;i++){',
      '    var t=IN.taches[i];',
      '    var r=remById(t.id);',
      '    var cal=listeParNom(t.liste);',
      '    if(r && cal){ try{ if(ObjC.unwrap(r.calendar.calendarIdentifier)!==ObjC.unwrap(cal.calendarIdentifier)){ ST.removeReminderCommitError(r,true,null); r=null; } }catch(e){} }',
      '    if(t.dedup && cal){',
      '      var L2=listeDe(cal);',
      '      if(L2){',
      '        var mon=""; try{ if(r) mon=ObjC.unwrap(r.calendarItemIdentifier); }catch(e){}',
      '        var prem=null;',
      '        for(var k=0;k<L2.count;k++){',
      '          var rk=L2.objectAtIndex(k);',
      '          if(net(titre(rk))!==t.titre) continue;',
      '          var idr=""; try{ idr=ObjC.unwrap(rk.calendarItemIdentifier); }catch(e){}',
      '          if(mon && idr===mon) continue;',
      '          if(!prem && !mon){ prem=rk; continue; }',
      '          try{ ST.removeReminderCommitError(rk,true,null); }catch(e){}',
      '        }',
      '        if(!r && prem) r=prem;',
      '      }',
      '    }',
      '    if(!r){ r=$.EKReminder.reminderWithEventStore(ST); if(cal) r.calendar=cal; }',
      '    try{ r.title=t.titre; }catch(e){}',
      '    try{ r.notes=t.notes||""; }catch(e){}',
      '    try{ r.completed=!!t.termine; }catch(e){}',
      '    try{ r.priority=PRIO[t.priorite]||0; }catch(e){}',
      '    try{ if(t.echeance){ r.dueDateComponents=comps(t.echeance,t.heure); } else { r.dueDateComponents=false; } }catch(e){}',
      '    var ok=false; try{ ok=ST.saveReminderCommitError(r,true,null); }catch(e){}',
      '    var nid=""; try{ nid=ObjC.unwrap(r.calendarItemIdentifier); }catch(e){}',
      '    out.push(t.ref+"\\t"+(ok?nid:""));',
      '  }',
      '  return out.join("\\n");',
      '}',
    ].join('\n');
  }

  // Titres de toutes les listes (groupes inclus), une par ligne.
  static genererJXAListes() {
    return [
      Ariane._jxaEK(),
      'function run(){ acces(); var L=listes(); var out=[]; for(var i=0;i<L.count;i++){ var n=net(titre(L.objectAtIndex(i))); if(n) out.push(n); } out.sort(); return out.join("\\n"); }',
    ].join('\n');
  }

  // Relève : (1) « ref \t completed \t dueISO » pour les rappels liés ;
  // (2) « NOUVEAU \t id \t nom \t completed \t dueISO \t nomListe » pour ceux
  //     ajoutés à la main dans une liste surveillée, sans référence connue.
  static genererJXAReleve(paires, listes) {
    const IN = JSON.stringify({
      paires: Array.isArray(paires) ? paires : [],
      listes: [...new Set((Array.isArray(listes) ? listes : []).filter(Boolean))],
    });
    return [
      Ariane._jxaEK(),
      'function run(){',
      '  var IN=' + IN + '; acces();',
      '  var connus={}; for(var i=0;i<IN.paires.length;i++) connus[IN.paires[i].id]=1;',
      '  var out=[];',
      '  for(var j=0;j<IN.paires.length;j++){',
      '    var p=IN.paires[j]; var r=remById(p.id);',
      '    if(!r){ out.push(p.ref+"\\tMANQUANT\\t"); continue; }',
      '    var comp=false; try{ comp=r.completed; }catch(e){}',
      '    out.push(p.ref+"\\t"+(comp?"1":"0")+"\\t"+isoDe(r.dueDateComponents));',
      '  }',
      '  var L=listes();',
      '  for(var k=0;k<L.count;k++){',
      '    var cal=L.objectAtIndex(k); var ln=titre(cal); var surv=false;',
      '    for(var w=0;w<IN.listes.length;w++){ if(norm(IN.listes[w])===norm(ln)){ surv=true; break; } }',
      '    if(!surv) continue;',
      '    var rs=fetchListe(cal); if(!rs) continue;',
      '    for(var m=0;m<rs.count;m++){',
      '      var rr=rs.objectAtIndex(m); var rid=""; try{ rid=ObjC.unwrap(rr.calendarItemIdentifier); }catch(e){ continue; }',
      '      if(connus[rid]) continue;',
      '      var comp2=false; try{ comp2=rr.completed; }catch(e){}',
      '      out.push("NOUVEAU\\t"+rid+"\\t"+net(ObjC.unwrap(rr.title))+"\\t"+(comp2?"1":"0")+"\\t"+isoDe(rr.dueDateComponents)+"\\t"+net(ln));',
      '    }',
      '  }',
      '  return out.join("\\n");',
      '}',
    ].join('\n');
  }

  /* ---- Apple Agenda via EventKit (EKEvent, entité 0, macOS) -------- */

  // Crée / met à jour / supprime les EKEvent d'une liste de créneaux.
  // `evenements` : [{ ref, idx, id, titre, notes, calendrier, debut, fin, supprimer }]
  // debut / fin = ISO « YYYY-MM-DDTHH:MM ». Rend, une ligne par entrée :
  //   « ref \t idx \t nouvelId »  (id vide si échec)
  //   « ref \t idx \t SUPPRIME »  (entrée supprimer:true)
  static genererJXAEvenementsPush(evenements) {
    const IN = JSON.stringify({ evenements: Array.isArray(evenements) ? evenements : [] });
    return [
      Ariane._jxaEKEvenements(),
      'function run(){',
      '  var IN=' + IN + '; var ACC=Number(acces());',
      '  if(ACC!==3 && ACC!==4) return "__ACCES__\\t"+ACC;',
      // `pris` : identifiants déjà attribués à un créneau de CE run. Deux
      // créneaux d’une même tâche partagent la même URL de note — sans ce
      // garde, le rattrapage anti-doublon rattachait les deux sessions au
      // même EKEvent, qui se faisait alors battre d’un push à l’autre.
      '  var out=[]; var pris={};',
      '  for(var i=0;i<IN.evenements.length;i++){',
      '    var v=IN.evenements[i];',
      '    if(v.supprimer){',
      '      if(v.id && pris[String(v.id)]){ out.push(v.ref+"\\t"+v.idx+"\\t"+String(v.id)); continue; }',
      '      var er=evById(v.id);',
      '      if(er){ try{ ST.removeEventSpanCommitError(er,0,true,null); }catch(e){} }',
      '      out.push(v.ref+"\\t"+v.idx+"\\tSUPPRIME"); continue;',
      '    }',
      '    var e=evById(v.id);',
      '    if(e && v.id){ var ex0=evId(e); if(ex0 && pris[ex0]) e=null; }',
      '    var cal=calParNom(v.calendrier);',
      '    if(!cal){ out.push(v.ref+"\\t"+v.idx+"\\tERREUR\\tcalendrier introuvable: "+net(v.calendrier)); continue; }',
      // Identifiant non résolu (churn iCloud) : avant de créer un doublon, on
      // cherche dans le calendrier cible un événement du même titre sur la
      // fenêtre du créneau ($([cal]) — un null plante le prédicat en JXA).
      '    if(!e){ try{',
      '      var dd0=fmtDate(comps(String(v.scanDebut||v.debut).slice(0,10),"00:00"));',
      '      var dd1=fmtDate(comps(String(v.scanFin||v.fin).slice(0,10),"23:59"));',
      '      var pr=ST.predicateForEventsWithStartDateEndDateCalendars(dd0,dd1,$([cal]));',
      '      var ex=ST.eventsMatchingPredicate(pr);',
      '      var vu="";',
      '      if(ex){ for(var q=0;q<ex.count;q++){ var ee=ex.objectAtIndex(q);',
      '        var exq=evId(ee); if(exq && pris[exq]) continue;',
      '        if(String(ObjC.unwrap(ee.title))===String(v.titre)){ e=ee; break; }',
      '        try{ vu=String(ObjC.unwrap(ee.URL.absoluteString)||""); }catch(eu){ vu=""; }',
      '        if(v.lien && vu && vu===String(v.lien)){ e=ee; break; } } }',
      '    }catch(eDup){} }',
      '    if(e){ try{ if(ObjC.unwrap(e.calendar.calendarIdentifier)!==ObjC.unwrap(cal.calendarIdentifier)) e.calendar=cal; }catch(er2){} }',
      '    else { e=$.EKEvent.eventWithEventStore(ST); e.calendar=cal; }',
      '    var exi=evId(e); if(exi) pris[exi]=1;',
      '    try{ e.title=v.titre; }catch(er3){}',
      '    try{ e.notes=v.notes||""; }catch(er4){}',
      '    try{ if(v.lien){ var u=$.NSURL.URLWithString(v.lien); if(u) e.URL=u; } }catch(erU){}',
      '    try{ e.isAllDay=false; }catch(er5){}',
      '    var sd=fmtDate(comps(String(v.debut).slice(0,10),String(v.debut).slice(11,16)));',
      '    var ed=fmtDate(comps(String(v.fin).slice(0,10),String(v.fin).slice(11,16)));',
      '    if(!sd || !ed){ out.push(v.ref+"\\t"+v.idx+"\\tERREUR\\tdate invalide "+net(v.debut)+"/"+net(v.fin)); continue; }',
      '    try{ e.startDate=sd; e.endDate=ed; }catch(er6){}',
      // NB : lire un out-param NSError** en JXA fait planter osascript (exit 139).
      // On passe null et on se contente du booléen de retour.
      '    var ok=false;',
      '    try{ ok=ST.saveEventSpanCommitError(e,0,true,null); }catch(er8){}',
      // Un événement dont l’identifiant a été partagé entre deux créneaux peut
      // refuser de se sauver, même une fois la cause réparée : on le reconstruit
      // à neuf ; l’ancien est retiré si possible.
      '    if(!ok && v.id){',
      '      var e2=$.EKEvent.eventWithEventStore(ST); e2.calendar=cal;',
      '      try{ e2.title=v.titre; }catch(er9){}',
      '      try{ e2.notes=v.notes||""; }catch(erA){}',
      '      try{ if(v.lien){ var u2=$.NSURL.URLWithString(v.lien); if(u2) e2.URL=u2; } }catch(erB){}',
      '      try{ e2.isAllDay=false; }catch(erC){}',
      '      try{ e2.startDate=sd; e2.endDate=ed; }catch(erD){}',
      '      try{ ok=ST.saveEventSpanCommitError(e2,0,true,null); }catch(erE){}',
      '      if(ok){ try{ ST.removeEventSpanCommitError(e,0,true,null); }catch(erF){} e=e2; }',
      '    }',
      '    if(!ok){ out.push(v.ref+"\\t"+v.idx+"\\tERREUR\\tsaveEvent a renvoyé false"); continue; }',
      '    var exf=evId(e); if(exf) pris[exf]=1;',
      '    out.push(v.ref+"\\t"+v.idx+"\\t"+exf);',
      '  }',
      '  return out.join("\\n");',
      '}',
    ].join('\n');
  }

  // Relève des EKEvent liés (pas d'import d'événements inconnus).
  // `paires` : [{ ref, idx, id }]. Rend :
  //   « ref \t idx \t isoDebut \t isoFin »   (événement retrouvé)
  //   « ref \t idx \t MANQUANT »             (supprimé côté Calendar)
  static genererJXAEvenementsReleve(paires, fenetreJours) {
    const IN = JSON.stringify({
      paires: Array.isArray(paires) ? paires : [],
      fenetreJours: Number(fenetreJours) || 120,
    });
    return [
      Ariane._jxaEKEvenements(),
      'function run(){',
      '  var IN=' + IN + '; var ACC=Number(acces());',
      '  if(ACC!==3) return "__ACCES__\\t"+ACC;',
      '  var out=[];',
      '  for(var i=0;i<IN.paires.length;i++){',
      '    var p=IN.paires[i]; var e=evById(p.id);',
      '    if(!e){ out.push(p.ref+"\\t"+p.idx+"\\tMANQUANT"); continue; }',
      '    out.push(p.ref+"\\t"+p.idx+"\\t"+isoDeDate(e.startDate)+"\\t"+isoDeDate(e.endDate));',
      '  }',
      '  return out.join("\\n");',
      '}',
    ].join('\n');
  }

  // Diagnostic : statut d'accès Calendriers + liste des calendriers vus.
  static genererJXAAgendas() {
    return [
      Ariane._jxaEKEvenements(),
      'function run(){',
      '  var st0=statutAcces(); var st1=acces();',
      '  var L=cals(); var noms=[];',
      '  if(L && L.count){ for(var i=0;i<L.count;i++) noms.push(net(titre(L.objectAtIndex(i)))); }',
      '  noms.sort();',
      '  var def=""; try{ def=net(titre(ST.defaultCalendarForNewEvents)); }catch(e){}',
      '  return JSON.stringify({ statutAvant:st0, statut:st1, defaut:def, calendriers:noms });',
      '}',
    ].join('\n');
  }

  // Ménage : dans les calendriers de synchro, supprime les EKEvent « à Ariane »
  // (URL obsidian:// ou titre « [ref connue] … ») dont l'identifiant n'est PAS
  // dans la liste des liens légitimes → efface les doublons laissés par une
  // course entre deux push. `idsLegitimes` : { eventId: 1 }. `refs` : liste des
  // références de tâche connues.
  static genererJXAEvenementsMenage(calendriers, idsLegitimes, refs, fenetreJours) {
    const IN = JSON.stringify({
      calendriers: [...new Set((Array.isArray(calendriers) ? calendriers : []).filter(Boolean))],
      ids: idsLegitimes && typeof idsLegitimes === 'object' ? idsLegitimes : {},
      refs: [...new Set((Array.isArray(refs) ? refs : []).map(String))],
      fenetreJours: Math.max(7, Number(fenetreJours) || 180),
    });
    return [
      Ariane._jxaEKEvenements(),
      'function run(){',
      '  var IN=' + IN + '; var ACC=Number(acces());',
      '  if(ACC!==3 && ACC!==4) return "__ACCES__\\t"+ACC;',
      '  if(!IN.calendriers.length) return "";',
      '  var want={}; for(var w=0;w<IN.calendriers.length;w++) want[norm(IN.calendriers[w])]=1;',
      '  var refset={}; for(var r=0;r<IN.refs.length;r++) refset[IN.refs[r]]=1;',
      '  var L=cals(); var arr=[];',
      '  for(var i=0;i<L.count;i++){ var c=L.objectAtIndex(i); if(want[norm(titre(c))]) arr.push(c); }',
      '  if(!arr.length) return "";',
      '  var maintenant=$.NSDate.date;',
      '  var d0=maintenant.dateByAddingTimeInterval(-IN.fenetreJours*86400);',
      '  var d1=maintenant.dateByAddingTimeInterval(IN.fenetreJours*86400);',
      '  var pred=ST.predicateForEventsWithStartDateEndDateCalendars(d0,d1,$(arr));',
      '  var evs=ST.eventsMatchingPredicate(pred); var out=[]; var vus=[];',
      '  if(evs){ for(var k=0;k<evs.count;k++){',
      '    var e=evs.objectAtIndex(k); var id=evId(e); if(!id || IN.ids[id]) continue;',
      '    var url=""; try{ url=String(ObjC.unwrap(e.URL.absoluteString)||""); }catch(eu){}',
      '    var ti=""; try{ ti=String(ObjC.unwrap(e.title)||""); }catch(et){}',
      '    var aNous=(url.indexOf("obsidian://")===0);',
      '    if(!aNous){ var m=ti.match(/\\[([^\\]]+)\\]/); if(m && refset[String(m[1]).trim()]) aNous=true; }',
      '    if(!aNous) continue;',
      '    try{ ST.removeEventSpanCommitError(e,0,true,null); out.push("SUPPRIME\\t"+id+"\\t"+net(ti)); }catch(er){ out.push("ERREUR\\t"+id+"\\t"+net(ti)); }',
      '  } }',
      '  return out.join("\\n");',
      '}',
    ].join('\n');
  }

  // Événements réels des calendriers surveillés, pour l'affichage en fond.
  // Rend, une ligne par événement :
  //   « id \t titre \t isoDebut \t isoFin \t allDay(0/1) \t nomCalendrier »
  //   (la couleur du calendrier est relevée à part, en AppleScript)
  static genererJXAEvenementsFond(calendriers, debutISO, finISO) {
    const IN = JSON.stringify({
      calendriers: [...new Set((Array.isArray(calendriers) ? calendriers : []).filter(Boolean))],
      debut: String(debutISO || ''), fin: String(finISO || ''),
    });
    return [
      Ariane._jxaEKEvenements(),
      'function run(){',
      '  var IN=' + IN + '; var ACC=Number(acces());',
      '  if(ACC!==3) return "__ACCES__\\t"+ACC;',
      '  if(!IN.debut || !IN.fin || !IN.calendriers.length) return "";',
      '  var want={}; for(var w=0;w<IN.calendriers.length;w++) want[norm(IN.calendriers[w])]=1;',
      '  var d0=fmtDate(comps(IN.debut,"00:00")); var d1=fmtDate(comps(IN.fin,"23:59"));',
      '  if(!d0 || !d1) return "";',
      // Tableau d\'EKCalendar filtré par nom, ponté via $() (un tableau JS brut
      // ou un null plantent le prédicat en JXA — testé).
      '  var L=cals(); var arr=[];',
      '  for(var i=0;i<L.count;i++){ var c=L.objectAtIndex(i); if(want[norm(titre(c))]) arr.push(c); }',
      '  if(!arr.length) return "";',
      '  var pred=ST.predicateForEventsWithStartDateEndDateCalendars(d0,d1,$(arr));',
      '  var evs=ST.eventsMatchingPredicate(pred); var out=[];',
      '  if(evs){ for(var k=0;k<evs.count;k++){',
      '    var e=evs.objectAtIndex(k);',
      '    var cn=""; try{ cn=norm(titre(e.calendar)); }catch(ecn){} if(!want[cn]) continue;',
      '    var id=evId(e); if(!id) continue;',
      '    var ad=false; try{ ad=e.isAllDay; }catch(er2){}',
      '    out.push(id+"\\t"+net(ObjC.unwrap(e.title))+"\\t"+isoDeDate(e.startDate)+"\\t"+isoDeDate(e.endDate)+"\\t"+(ad?"1":"0")+"\\t"+net(titre(e.calendar)));',
      '  } }',
      '  return out.join("\\n");',
      '}',
    ].join('\n');
  }

  /* ---- IA : structuration de brouillons de tâches -------------------- */

  // Toutes les dates repérées telles quelles dans un texte, ramenées en ISO.
  // Sert à n'autoriser à l'import QUE les dates réellement présentes.
  static datesDansTexte(txt) {
    const s = String(txt || '');
    const out = new Set();
    let m;
    const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = iso.exec(s))) out.add(m[1] + '-' + m[2] + '-' + m[3]);
    const num = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g;
    while ((m = num.exec(s))) {
      out.add(m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0'));
    }
    return out;
  }

  // Extrait un objet/tableau JSON d'une réponse LLM (tolère un habillage
  // ```json … ``` et du bavardage autour). Rend null si rien d'exploitable.
  static extraireJson(txt) {
    const s = String(txt || '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try { return JSON.parse(s); } catch (e) { /* on tente un sous-bloc */ }
    const a = s.search(/[[{]/);
    if (a < 0) return null;
    const ferme = s[a] === '[' ? ']' : '}';
    const b = s.lastIndexOf(ferme);
    if (b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  }

  // Nettoie l'arbre de specs rendu par l'IA : familles bornées aux ids connus,
  // booléens coercés, priorité normalisée, PROFONDEUR plafonnée, et surtout
  // AUCUNE date qui ne soit déjà dans le texte source (opts.dates : Set ISO).
  // opts = { familles: Set|Array, defaut, dates: Set, profMax }.
  static normaliserSpecsTaches(brut, opts) {
    const o = opts || {};
    const familles = o.familles instanceof Set ? o.familles
      : new Set(Array.isArray(o.familles) ? o.familles : []);
    const defaut = familles.has(o.defaut) ? o.defaut
      : (familles.values().next().value || 'action');
    const dates = o.dates instanceof Set ? o.dates : new Set();
    const profMax = Number.isFinite(o.profMax) ? o.profMax : 8;
    const PRIOS = {
      haute: 'haute', high: 'haute', urgent: 'haute', urgente: 'haute',
      moyenne: 'moyenne', medium: 'moyenne', normale: 'moyenne', normal: 'moyenne',
      basse: 'basse', low: 'basse', bonus: 'basse', optionnel: 'basse',
      optionnelle: 'basse', 'si le temps': 'basse',
    };
    const racine = Array.isArray(brut) ? brut
      : (brut && Array.isArray(brut.taches) ? brut.taches
        : (brut && Array.isArray(brut.tasks) ? brut.tasks : []));
    const dateOk = (v) => {
      const s = String(v == null ? '' : v).trim().slice(0, 10);
      return (/^\d{4}-\d{2}-\d{2}$/.test(s) && dates.has(s)) ? s : '';
    };
    const vrai = (v) => v === true || /^(true|oui|yes|1)$/i.test(String(v == null ? '' : v));
    const un = (n, prof) => {
      if (!n || typeof n !== 'object') return null;
      const titre = String(n.titre || n.title || n.intitule || n.nom || n.name || '').trim();
      if (!titre) return null;
      const fam = String(n.famille || n.family || '').trim().toLowerCase();
      const prio = PRIOS[String(n.priorite || n.priority || '').trim().toLowerCase()] || '';
      const brutEnf = n.enfants || n.children || n.sous || n.sousTaches || n.subtasks || [];
      const enfants = (prof < profMax && Array.isArray(brutEnf))
        ? brutEnf.map((e) => un(e, prof + 1)).filter(Boolean) : [];
      return {
        titre,
        famille: familles.has(fam) ? fam : defaut,
        jalon: vrai(n.jalon != null ? n.jalon : n.milestone),
        priorite: prio,
        debut: dateOk(n.debut != null ? n.debut : n.start),
        echeance: dateOk(n.echeance != null ? n.echeance : (n.due != null ? n.due : n.deadline)),
        note: String(n.note || n.remarque || n.commentaire || n.comment || '').trim(),
        source: String(n.source || n.source_pressentie || n.sourcePressentie || '').trim(),
        enfants,
      };
    };
    return racine.map((n) => un(n, 0)).filter(Boolean);
  }

  // Aplatit un arbre de specs en liste [{ n, prof }] (parcours préfixe) :
  // l'ordre des éléments suit l'ordre visuel des lignes de l'aperçu.
  static aplatirSpecsTaches(arbre) {
    const out = [];
    const voir = (liste, prof) => {
      for (const n of liste || []) { out.push({ n, prof }); voir(n.enfants, prof + 1); }
    };
    voir(arbre, 0);
    return out;
  }

  // Opération inverse : reconstruit l'arbre depuis une liste plate. Chaque
  // profondeur sautée est ramenée sous le parent ouvert le plus proche.
  static reconstruireSpecsTaches(plat) {
    const racine = [];
    const pile = [];
    for (const x of plat) {
      while (pile.length && pile[pile.length - 1].prof >= x.prof) pile.pop();
      x.n.enfants = [];
      (pile.length ? pile[pile.length - 1].n.enfants : racine).push(x.n);
      pile.push(x);
    }
    return racine;
  }

  // Dépôt du bloc plat[i] (nœud et sa descendance) au trou g — « avant
  // plat[g] », g ∈ [0..plat.length]. Rend { h, profMax } : position d'insertion
  // dans la liste amputée du bloc, et profondeur maximale possible là (enfant
  // de la ligne précédente). Rend null si g tombe dans la propre descendance
  // du bloc (déplacement impossible).
  static depotSpecTaches(plat, i, g) {
    const n = plat.length;
    if (!n || i < 0 || i >= n || g < 0 || g > n) return null;
    let fin = i + 1;
    while (fin < n && plat[fin].prof > plat[i].prof) fin += 1;
    if (g > i && g <= fin) return null;
    const h = g <= i ? g : g - (fin - i);
    // Prédécesseur du trou, en coordonnées de la liste d'origine : jamais
    // dans le bloc lui-même (h-1 < i, ou h-1 décalé au-delà de fin-1).
    const j = (h <= i) ? h - 1 : (h - 1) + (fin - i);
    const profMax = (j >= 0 && j < n) ? plat[j].prof + 1 : 0;
    return { h, profMax };
  }

  // Déplace le bloc plat[i] (nœud et toute sa descendance) au trou g, à la
  // profondeur demandée (bornée au maximum possible là, et à 8 comme le
  // normaliseur). Les descendants suivent d'autant. Rend la nouvelle liste
  // plate, ou null si le dépôt est impossible.
  static deplacerSpecTaches(plat, i, g, prof) {
    const depot = Ariane.depotSpecTaches(plat, i, g);
    if (!depot) return null;
    const n = plat.length;
    let fin = i + 1;
    while (fin < n && plat[fin].prof > plat[i].prof) fin += 1;
    const delta = Math.max(0, Math.min(prof, depot.profMax, 8)) - plat[i].prof;
    const bloc = [];
    for (let k = i; k < fin; k += 1) {
      bloc.push({ n: plat[k].n, prof: Math.max(0, Math.min(8, plat[k].prof + delta)) });
    }
    const hors = plat.filter((_, k) => k < i || k >= fin);
    hors.splice(depot.h, 0, ...bloc);
    return hors;
  }

  // Meilleure correspondance d'un titre approximatif parmi des candidats
  // {ref, titre} : recouvrement de mots (minuscule, sans accents ni ponctuation),
  // pondéré par la longueur du plus court. Rend { ref, score } ou null si trop
  // faible (< seuil, défaut 0,34).
  static meilleurTitre(cible, candidats, seuil) {
    const mots = (s) => new Set(String(s || '')
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
    const mc = mots(cible);
    if (!mc.size) return null;
    let best = null;
    for (const c of candidats || []) {
      const m = mots(c && c.titre);
      if (!m.size) continue;
      let inter = 0;
      for (const w of mc) if (m.has(w)) inter += 1;
      const score = inter / Math.min(mc.size, m.size);
      if (!best || score > best.score) best = { ref: c.ref, score };
    }
    return (best && best.score >= (seuil == null ? 0.34 : seuil)) ? best : null;
  }

  // Ajoute des cartes au plan d'une vue « ariane-articulation » dans le TEXTE
  // brut d'un .base, sans re-sérialiser le reste. `nomVue` cible la vue par son
  // name ; à défaut, la première vue articulation. Rend le texte modifié, ou
  // null si aucune vue articulation ou rien à ajouter.
  static majPlanArticulationTexte(texte, nomVue, refs) {
    const aAjouter = [...new Set((refs || []).filter(Boolean))];
    if (!aAjouter.length) return null;
    const eol = texte.includes('\r\n') ? '\r\n' : '\n';
    const lignes = texte.split(/\r?\n/);
    const iViews = lignes.findIndex((l) => /^views:\s*$/.test(l));
    if (iViews === -1) return null;
    // Découpe le bloc views: en entrées (chaque « - type: … » à 2 espaces).
    let debut = -1;
    let fin = lignes.length;
    let dansArticulation = false;
    let nomCourant = '';
    let iPlan = -1;
    let iEntree = -1;
    for (let k = iViews + 1; k < lignes.length; k += 1) {
      const l = lignes[k];
      if (/^\S/.test(l) && l.trim() !== '') { fin = k; break; }
      const mType = l.match(/^ {2}-\s*type:\s*(.+?)\s*$/);
      if (mType) {
        if (dansArticulation && (nomVue == null || nomCourant === nomVue)) { debut = iEntree; break; }
        dansArticulation = /ariane-articulation/.test(mType[1]);
        nomCourant = '';
        iPlan = -1;
        iEntree = k;
        continue;
      }
      const mNom = l.match(/^ {4}name:\s*(.+?)\s*$/);
      if (mNom) nomCourant = mNom[1].replace(/^["']|["']$/g, '');
      if (/^ {4}arianeArtPlan:/.test(l)) iPlan = k;
    }
    if (debut === -1 && dansArticulation && (nomVue == null || nomCourant === nomVue)) {
      debut = iEntree;
    }
    if (debut === -1) return null;
    // Fin de l'entrée ciblée : prochaine « - type: » à 2 espaces, ou fin du bloc.
    let finEntree = fin;
    for (let k = debut + 1; k < fin; k += 1) {
      if (/^ {2}-\s*type:/.test(lignes[k])) { finEntree = k; break; }
    }
    let planLigne = -1;
    for (let k = debut; k < finEntree; k += 1) {
      if (/^ {4}arianeArtPlan:/.test(lignes[k])) { planLigne = k; break; }
    }
    let plan = { cartes: [] };
    if (planLigne !== -1) {
      const m = lignes[planLigne].match(/^ {4}arianeArtPlan:\s*'(.*)'\s*$/)
        || lignes[planLigne].match(/^ {4}arianeArtPlan:\s*"(.*)"\s*$/);
      if (m) { try { plan = JSON.parse(m[1]) || plan; } catch (e) { plan = { cartes: [] }; } }
    }
    if (!Array.isArray(plan.cartes)) plan.cartes = [];
    const deja = new Set(plan.cartes.map((c) => c && c.ref));
    let n = 0;
    for (const r of aAjouter) {
      if (deja.has(r)) continue;
      plan.cartes.push({ ref: r, x: null, y: null, replie: false });
      n += 1;
    }
    if (!n) return null;
    const nouvelle = "    arianeArtPlan: '" + JSON.stringify(plan) + "'";
    if (planLigne !== -1) lignes.splice(planLigne, 1, nouvelle);
    else lignes.splice(debut + 1, 0, nouvelle);
    return lignes.join(eol);
  }

  // Place les nœuds SANS position (x/y non finis). Ceux qui en ont sont laissés
  // tels quels. Rang = profondeur dans le DAG (hiérarchie ∪ blocage) par un
  // parcours de Kahn ; les nœuds d'un cycle retombent au rang 0. Dans un rang,
  // tri par échéance puis ref, et on décale en y pour ne rien chevaucher.
  static placerGraphe(noeuds, aretes, opts) {
    const dx = (opts && opts.dx) || 260;
    const dy = (opts && opts.dy) || 120;
    const refs = new Set((noeuds || []).map((n) => n.ref));
    const out = new Map();
    const inc = new Map();
    for (const n of noeuds || []) { out.set(n.ref, []); inc.set(n.ref, 0); }
    for (const a of aretes || []) {
      if (!a || !refs.has(a.de) || !refs.has(a.vers) || a.de === a.vers) continue;
      out.get(a.de).push(a.vers);
      inc.set(a.vers, inc.get(a.vers) + 1);
    }
    const rang = new Map();
    const reste = new Map(inc);
    const file = (noeuds || []).filter((n) => reste.get(n.ref) === 0).map((n) => n.ref);
    for (const r of file) rang.set(r, 0);
    for (let i = 0; i < file.length; i += 1) {
      const cur = file[i];
      const rc = rang.get(cur);
      for (const v of out.get(cur) || []) {
        reste.set(v, reste.get(v) - 1);
        if (reste.get(v) === 0) {
          rang.set(v, Math.max(rang.has(v) ? rang.get(v) : 0, rc + 1));
          file.push(v);
        }
      }
    }
    for (const n of noeuds || []) if (!rang.has(n.ref)) rang.set(n.ref, 0);

    const pos = new Map();
    const fini = (v) => Number.isFinite(Number(v)) && v !== '' && v !== null;
    for (const n of noeuds || []) {
      if (fini(n.x) && fini(n.y)) pos.set(n.ref, { x: Number(n.x), y: Number(n.y) });
    }
    const chevauche = (x, y) => {
      for (const p of pos.values()) {
        if (Math.abs(p.x - x) < dx * 0.8 && Math.abs(p.y - y) < dy * 0.8) return true;
      }
      return false;
    };
    const parRang = new Map();
    for (const n of noeuds || []) {
      if (pos.has(n.ref)) continue;
      const r = rang.get(n.ref);
      if (!parRang.has(r)) parRang.set(r, []);
      parRang.get(r).push(n);
    }
    // opts.ordre : liste de refs dans l'ordre d'affichage voulu. Quand elle est
    // fournie et non vide, chaque rang suit cet ordre (les refs absentes vont
    // après, dans leur ordre d'origine). Sinon, tri par échéance puis ref.
    const ordreImpose = (opts && Array.isArray(opts.ordre) && opts.ordre.length) ? opts.ordre : null;
    const rangImpose = ordreImpose ? new Map(ordreImpose.map((r, i) => [r, i])) : null;
    // opts.hauteur : (ref) => hauteur réelle du nœud. Fourni, l'empilement
    // vertical d'un rang cumule ces hauteurs (+ une marge) au lieu d'un dy fixe.
    // Absent, comportement d'origine (chaque carte à k * dy).
    const hauteurDe = (opts && typeof opts.hauteur === 'function') ? opts.hauteur : null;
    // Marge entre deux cartes empilées : ce qui, en hauteur fixe, séparait déjà
    // deux rangs (dy − hauteur de carte). ARTIC_H est défini plus bas mais lu au
    // seul appel, jamais au chargement du module.
    const margeRang = dy > ARTIC_H ? dy - ARTIC_H : Math.max(24, dy * 0.25);
    for (const [r, groupe] of [...parRang.entries()].sort((a, b) => a[0] - b[0])) {
      if (rangImpose) {
        groupe.sort((a, b) => (rangImpose.has(a.ref) ? rangImpose.get(a.ref) : 1e9)
          - (rangImpose.has(b.ref) ? rangImpose.get(b.ref) : 1e9));
      } else {
        groupe.sort((a, b) => (Ariane.jourValide(a.echeance) || '~')
          .localeCompare(Ariane.jourValide(b.echeance) || '~') || a.ref.localeCompare(b.ref));
      }
      const x = r * dx;
      if (hauteurDe) {
        let y = 0;
        for (const n of groupe) {
          while (chevauche(x, y)) y += dy;
          pos.set(n.ref, { x, y });
          y += (Number(hauteurDe(n.ref)) || dy) + margeRang;
        }
      } else {
        let k = 0;
        for (const n of groupe) {
          let y = k * dy;
          while (chevauche(x, y)) y += dy;
          pos.set(n.ref, { x, y });
          k += 1;
        }
      }
    }
    return pos;
  }

  // Disposition « au propre » du graphe d'articulation. Couches par plus-long
  // chemin ; ordre intra-couche par médiane des voisins (réduction des
  // croisements, balayages alternés) ; Y redressé vers la moyenne des voisins
  // puis séparé pour qu'AUCUNE carte n'en chevauche une autre ; composantes non
  // connectées empilées en bandes. Les positions manuelles ne sont pas lues :
  // c'est le vrai « re-disposer ».
  //   noeuds : [{ref, echeance}]      aretes : [{de, vers, type}]
  //   opts   : { dx, gapY, gapBande, hauteur:(ref)=>number, passes }
  // Renvoie Map<ref,{x,y}>.
  static disposerArticulation(noeuds, aretes, opts) {
    const o = opts || {};
    const DX = Number.isFinite(o.dx) ? o.dx : 300;
    const GY = Number.isFinite(o.gapY) ? o.gapY : 36;
    const GB = Number.isFinite(o.gapBande) ? o.gapBande : 90;
    const PASSES = Number.isFinite(o.passes) ? o.passes : 6;
    const H = typeof o.hauteur === 'function' ? o.hauteur : () => ARTIC_H;
    const refs = (noeuds || []).map((n) => n && n.ref).filter(Boolean);
    const set = new Set(refs);
    const ech = new Map((noeuds || [])
      .map((n) => [n.ref, Ariane.jourValide(n.echeance) || '~']));

    const E = [];
    for (const a of aretes || []) {
      if (a && set.has(a.de) && set.has(a.vers) && a.de !== a.vers) E.push([a.de, a.vers]);
    }
    const out = new Map(refs.map((r) => [r, []]));
    const inn = new Map(refs.map((r) => [r, []]));
    for (const [u, v] of E) { out.get(u).push(v); inn.get(v).push(u); }

    // 1. Composantes faiblement connectées (union-find sur les deux types).
    const parent = new Map(refs.map((r) => [r, r]));
    const find = (r) => {
      while (parent.get(r) !== r) { parent.set(r, parent.get(parent.get(r))); r = parent.get(r); }
      return r;
    };
    for (const [u, v] of E) {
      const a = find(u); const b = find(v);
      if (a !== b) parent.set(a, b);
    }
    const comps = new Map();
    for (const r of refs) {
      const c = find(r);
      if (!comps.has(c)) comps.set(c, []);
      comps.get(c).push(r);
    }
    const echMin = (g) => g.reduce((m, r) => (ech.get(r) < m ? ech.get(r) : m), '~~');
    const groupes = [...comps.values()].sort((A, B) => B.length - A.length
      || echMin(A).localeCompare(echMin(B)));

    const pos = new Map();
    let bande = 0;
    for (const groupe of groupes) {
      const gset = new Set(groupe);
      const dedans = (r) => gset.has(r);
      // 2. Rangs : Kahn, plus-long chemin ; cycles rattrapés à max(pred)+1.
      const reste = new Map(groupe.map((r) => [r, inn.get(r).filter(dedans).length]));
      const rang = new Map(groupe.map((r) => [r, 0]));
      const file = groupe.filter((r) => reste.get(r) === 0);
      const vus = new Set(file);
      for (let i = 0; i < file.length; i++) {
        const u = file[i];
        for (const v of out.get(u)) {
          if (!dedans(v)) continue;
          if (rang.get(v) < rang.get(u) + 1) rang.set(v, rang.get(u) + 1);
          reste.set(v, reste.get(v) - 1);
          if (reste.get(v) <= 0 && !vus.has(v)) { vus.add(v); file.push(v); }
        }
      }
      for (const r of groupe) {
        if (vus.has(r)) continue;
        let m = 0;
        for (const u of inn.get(r)) if (dedans(u) && vus.has(u)) m = Math.max(m, rang.get(u) + 1);
        rang.set(r, m);
      }
      const rmax = groupe.reduce((m, r) => Math.max(m, rang.get(r)), 0);
      const parRang = [];
      for (let k = 0; k <= rmax; k++) parRang.push([]);
      for (const r of groupe) parRang[rang.get(r)].push(r);
      for (const col of parRang) {
        col.sort((a, b) => ech.get(a).localeCompare(ech.get(b)) || a.localeCompare(b));
      }

      // 3. Réduction des croisements : médiane des voisins, balayages alternés.
      const indices = () => {
        const m = new Map();
        for (const col of parRang) col.forEach((r, i) => m.set(r, i));
        return m;
      };
      const mediane = (arr) => {
        if (!arr.length) return -1;
        const s = arr.slice().sort((x, y) => x - y);
        const h = s.length >> 1;
        return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
      };
      const croisements = () => {
        let n = 0;
        for (let k = 1; k <= rmax; k++) {
          const gi = indices();
          const paires = [];
          for (const v of parRang[k]) {
            for (const u of inn.get(v)) {
              if (gi.has(u) && rang.get(u) === k - 1) paires.push([gi.get(u), gi.get(v)]);
            }
          }
          for (let a = 0; a < paires.length; a++) {
            for (let b = a + 1; b < paires.length; b++) {
              if ((paires[a][0] - paires[b][0]) * (paires[a][1] - paires[b][1]) < 0) n++;
            }
          }
        }
        return n;
      };
      let best = parRang.map((c) => c.slice());
      let bestC = croisements();
      for (let p = 0; p < PASSES; p++) {
        const desc = p % 2 === 0;
        const ks = [];
        for (let k = 0; k <= rmax; k++) ks.push(desc ? k : rmax - k);
        for (const k of ks) {
          const rref = desc ? k - 1 : k + 1;
          if (rref < 0 || rref > rmax) continue;
          const gi = indices();
          const vois = desc ? inn : out;
          parRang[k].sort((a, b) => {
            const ma = mediane(vois.get(a).filter((r) => gi.has(r) && rang.get(r) === rref).map((r) => gi.get(r)));
            const mb = mediane(vois.get(b).filter((r) => gi.has(r) && rang.get(r) === rref).map((r) => gi.get(r)));
            return (ma < 0 ? gi.get(a) : ma) - (mb < 0 ? gi.get(b) : mb) || gi.get(a) - gi.get(b);
          });
        }
        const c = croisements();
        if (c < bestC) { bestC = c; best = parRang.map((col) => col.slice()); }
      }
      for (let k = 0; k <= rmax; k++) parRang[k] = best[k];

      // 4. Y : empilement, redressement vers la moyenne des voisins, séparation.
      const y = new Map();
      for (const col of parRang) {
        let cy = 0;
        for (const r of col) { y.set(r, cy); cy += H(r) + GY; }
      }
      const separer = (col) => {
        col.sort((a, b) => y.get(a) - y.get(b));
        for (let i = 1; i < col.length; i++) {
          const min = y.get(col[i - 1]) + H(col[i - 1]) + GY;
          if (y.get(col[i]) < min) y.set(col[i], min);
        }
      };
      for (let it = 0; it < 4; it++) {
        for (let k = 0; k <= rmax; k++) {
          for (const r of parRang[k]) {
            const vs = out.get(r).concat(inn.get(r)).filter(dedans);
            if (!vs.length) continue;
            const moy = vs.reduce((s, v) => s + y.get(v), 0) / vs.length;
            y.set(r, (y.get(r) + moy) / 2);
          }
          separer(parRang[k]);
        }
      }
      let ymin = Infinity; let ymax = -Infinity;
      for (const r of groupe) { ymin = Math.min(ymin, y.get(r)); ymax = Math.max(ymax, y.get(r) + H(r)); }
      for (const r of groupe) {
        pos.set(r, { x: rang.get(r) * DX, y: Math.round(y.get(r) - ymin + bande) });
      }
      bande += (ymax - ymin) + GB;
    }
    return pos;
  }

  // Un lien proposé est-il licite ? Refus si (a) il referme un cycle sur
  // l'union des arêtes, (b) les dates se contredisent : un blocage dont
  // l'amont s'achève après le début de l'aval ; une hiérarchie dont la mère
  // s'achève avant la fille. On ne bloque que sur une preuve : une date
  // manquante n'interdit rien.
  static lienValide(aretes, dates, ajout) {
    const { de, vers, type } = ajout || {};
    if (!de || !vers || de === vers) return { ok: false, raison: 'soi' };
    const adj = new Map();
    const arc = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
    for (const e of aretes || []) if (e) arc(e.de, e.vers);
    // Cycle ssi « vers » atteint déjà « de » par les arêtes existantes.
    const vus = new Set();
    const pile = [vers];
    while (pile.length) {
      const c = pile.pop();
      if (c === de) return { ok: false, raison: 'cycle' };
      if (vus.has(c)) continue;
      vus.add(c);
      for (const x of adj.get(c) || []) pile.push(x);
    }
    const lire = (k) => (dates && dates.get ? dates.get(k) : (dates || {})[k]) || {};
    const eDe = Ariane.jourValide(lire(de).echeance);
    const dVers = Ariane.jourValide(lire(vers).debut);
    const eVers = Ariane.jourValide(lire(vers).echeance);
    if (type === 'hier') {
      if (eDe && eVers && eDe < eVers) return { ok: false, raison: 'dates-hier' };
    } else if (eDe && dVers && eDe > dVers) {
      return { ok: false, raison: 'dates' };
    }
    return { ok: true };
  }

  // Un lien bloquant est DÉRIVÉ quand un ancêtre du bloqueur proposé bloque
  // déjà la même tâche : une mère bloquante bloque avec toutes ses filles, et
  // la flèche explicite ne ferait que répéter l'héritage. Renvoie la référence
  // de l'ancêtre bloqueur le plus proche, ou '' si le lien porte une
  // information propre. `aretes` : arêtes de rattachement ({de, vers, type}),
  // type 'hier' (de = parent) ou 'bloque' (de = bloqueur).
  static blocageDerive(aretes, de, vers) {
    if (!de || !vers) return '';
    const parentDe = new Map();
    const bloqueurs = new Set();
    for (const e of aretes || []) {
      if (!e || !e.de || !e.vers) continue;
      if (e.type === 'hier') parentDe.set(e.vers, e.de);
      else if (e.type === 'bloque' && e.vers === vers) bloqueurs.add(e.de);
    }
    let cur = parentDe.get(de);
    const vus = new Set([de]);
    while (cur && !vus.has(cur)) {
      if (bloqueurs.has(cur)) return cur;
      vus.add(cur);
      cur = parentDe.get(cur);
    }
    return '';
  }

  // Courbe de Bézier entre deux points : elle se suit mieux à l'œil que le coude
  // quand plusieurs liens se croisent. Partagée par la frise et l'articulation.
  static _cheminFleche(x1, y1, x2, y2) {
    const ecart = Math.max(34, Math.abs(x2 - x1) / 2);
    return 'M ' + x1 + ' ' + y1
      + ' C ' + (x1 + ecart) + ' ' + y1 + ', ' + (x2 - ecart) + ' ' + y2
      + ', ' + x2 + ' ' + y2;
  }

  /* ---- Routage des flèches (batch 2, idée n° 8) ------------------------- */
  // Une flèche ne doit jamais passer sur une carte : dans le SVG, les cartes
  // sont peintes après les flèches, toute portion qui les chevauche disparaît
  // derrière. Et le bord droit d'une carte est réservé aux sorties : on n'y
  // entre jamais. Fonctions pures, éprouvées hors Obsidian ; voir
  // docs/superpowers/specs/2026-09-01-routage-fleches-design.md.

  // Un segment touche-t-il l'une des cartes, gonflées de `marge` ? Les
  // segments obliques sont échantillonnés (les tracés de l'articulation sont
  // sinon verticaux ou horizontaux). Les points posés sur le pourtour ne
  // comptent pas : c'est là que vivent les ancrages.
  static segmentFrappe(x1, y1, x2, y2, cartes, marge) {
    const M = Number(marge) || 0;
    const oblique = x1 !== x2 && y1 !== y2;
    const N = 12;
    for (const c of cartes || []) {
      if (!c) continue;
      const g = c.x - M, h = c.y - M;
      const d = c.x + (c.w || 0) + M, b = c.y + (c.h || 0) + M;
      if (oblique) {
        for (let i = 0; i <= N; i++) {
          const px = x1 + (x2 - x1) * i / N, py = y1 + (y2 - y1) * i / N;
          if (px > g && px < d && py > h && py < b) return true;
        }
      } else if (x1 === x2) {
        if (x1 > g && x1 < d
          && Math.max(Math.min(y1, y2), h) < Math.min(Math.max(y1, y2), b)) return true;
      } else if (y1 > h && y1 < b
        && Math.max(Math.min(x1, x2), g) < Math.min(Math.max(x1, x2), d)) return true;
    }
    return false;
  }

  // Le tracé simple « courbe » passe-t-il sur une carte ? On échantillonne la
  // même Bézier que le rendu (contrôles posés à mx, comme _cheminFleche).
  static flecheEncombee(x1, y1, mx, x2, y2, cartes, marge) {
    const M = Number(marge) || 0;
    const N = 16;
    for (const c of cartes || []) {
      if (!c) continue;
      const g = c.x - M, h = c.y - M;
      const d = c.x + (c.w || 0) + M, b = c.y + (c.h || 0) + M;
      for (let i = 0; i <= N; i++) {
        const t = i / N, u = 1 - t;
        const px = u * u * u * x1 + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * x2;
        const py = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
        if (px > g && px < d && py > h && py < b) return true;
      }
    }
    return false;
  }

  // Polyligne à segments verticaux/horizontaux rendue en `d` SVG. Rayon 0 :
  // angles vifs ; sinon coins arrondis, bornés à la demi-longueur des côtés.
  // Les points identiques ET les points intermédiaires alignés (aucun vrai
  // virage) sont retirés — sinon un coude « arrondi » apparaît sur une droite.
  static cheminPolyligne(points, rayon) {
    const D = [];
    for (const p of points || []) {
      if (p && (D.length === 0 || p.x !== D[D.length - 1].x || p.y !== D[D.length - 1].y)) D.push(p);
    }
    const P = [];
    for (let i = 0; i < D.length; i++) {
      const a = P[P.length - 1], b = D[i], c = D[i + 1];
      if (a && c && (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) === 0
        && (b.x - a.x) * (c.x - b.x) >= 0 && (b.y - a.y) * (c.y - b.y) >= 0) continue;
      P.push(b);
    }
    if (P.length < 2) return '';
    const r = Math.max(0, Number(rayon) || 0);
    let d = 'M ' + P[0].x + ' ' + P[0].y;
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i - 1], b = P[i], c = P[i + 1];
      const rr = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
      if (!rr) { d += ' L ' + b.x + ' ' + b.y; continue; }
      const p1 = { x: b.x - Math.sign(b.x - a.x) * rr, y: b.y - Math.sign(b.y - a.y) * rr };
      const p2 = { x: b.x + Math.sign(c.x - b.x) * rr, y: b.y + Math.sign(c.y - b.y) * rr };
      d += ' L ' + p1.x + ' ' + p1.y + ' Q ' + b.x + ' ' + b.y + ' ' + p2.x + ' ' + p2.y;
    }
    const f = P[P.length - 1];
    return d + ' L ' + f.x + ' ' + f.y;
  }

  /* ---- Ponts aux croisements (batch articulation) --------------------- */
  // Là où deux arêtes se croisent, l'une enjambe l'autre. L'astuce « propre » :
  // on ne pose RIEN par-dessus et on ne ré-échantillonne PAS. On coupe le tracé
  // de l'arête qui saute à l'endroit exact du croisement (subdivision de Bézier
  // par De Casteljau, ou coupe de segment pour les tracés orthogonaux) et on
  // recolle les deux morceaux par un petit demi-cercle. Les morceaux sont
  // l'EXACTE reproduction du tracé d'origine : aucun escalier.

  // Croisements entre polylignes échantillonnées (détection seule, côté vue).
  // Renvoie [{ x, y, type, sur }] : `sur` = indice de la polyligne qui saute
  // (la plus horizontale des deux, sinon celle dessinée au-dessus).
  static pontsAretes(segments, opts) {
    const S = (segments || []).filter((s) => s && Array.isArray(s.pts) && s.pts.length > 1);
    const MAX = (opts && Number.isFinite(opts.max)) ? opts.max : 300;
    const B = S.map((s) => {
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const p of s.pts) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
      return { x0, y0, x1, y1 };
    });
    const inter = (p1, p2, p3, p4) => {
      const ax = p2.x - p1.x; const ay = p2.y - p1.y;
      const bx = p4.x - p3.x; const by = p4.y - p3.y;
      const den = ax * by - ay * bx;
      if (Math.abs(den) < 1e-9) return null;
      // Angle entre les deux segments : deux tracés quasi parallèles qui se
      // superposent ne « se croisent » pas — pas de pont là-dessus.
      const na = Math.hypot(ax, ay) || 1; const nb = Math.hypot(bx, by) || 1;
      if (Math.abs((ax * bx + ay * by) / (na * nb)) > 0.96) return null;
      const t = ((p3.x - p1.x) * by - (p3.y - p1.y) * bx) / den;
      const u = ((p3.x - p1.x) * ay - (p3.y - p1.y) * ax) / den;
      // Segments consécutifs partagent un sommet : on garde toute la plage
      // [0,1] (la déduplication plus bas absorbe le doublon au sommet).
      if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
      return { x: p1.x + ax * t, y: p1.y + ay * t, ax, ay, bx, by };
    };
    const out = [];
    const proche = (x, y, s) => out.some((c) => c.sur === s
      && Math.abs(c.x - x) < 4 && Math.abs(c.y - y) < 4);
    for (let i = 0; i < S.length && out.length < MAX; i++) {
      for (let j = i + 1; j < S.length && out.length < MAX; j++) {
        if (B[i].x1 < B[j].x0 || B[j].x1 < B[i].x0
          || B[i].y1 < B[j].y0 || B[j].y1 < B[i].y0) continue;
        for (let m = 1; m < S[i].pts.length && out.length < MAX; m++) {
          for (let n = 1; n < S[j].pts.length && out.length < MAX; n++) {
            const r = inter(S[i].pts[m - 1], S[i].pts[m], S[j].pts[n - 1], S[j].pts[n]);
            if (!r) continue;
            const sauteA = (Math.abs(r.ax) - Math.abs(r.ay)) > (Math.abs(r.bx) - Math.abs(r.by));
            const sur = sauteA ? i : j;
            if (proche(r.x, r.y, sur)) continue;
            out.push({ x: r.x, y: r.y, type: (sauteA ? S[i].type : S[j].type) || 'hier', sur });
          }
        }
      }
    }
    return out;
  }

  // Réécrit un `d` SVG (cubique unique « M .. C .. » OU polyligne « M/L/Q ») en
  // y insérant un demi-cercle à chaque point de `croisements` situé sur le
  // tracé. `r` = demi-largeur du pont. Renvoie le nouveau `d`, ou null si rien
  // à faire. Fonction pure — la vue lit le `d` rendu et pousse le résultat.
  static cheminAvecPonts(d, croisements, r) {
    const R = Math.max(2, Number(r) || 5);
    const cs = (croisements || []).filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.y));
    if (!cs.length || typeof d !== 'string') return null;
    const nb = (v) => Number(v.toFixed(2));
    const cub = d.trim().match(
      /^M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*C\s*(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+)\s*$/);
    if (cub) {
      const P = [{ x: +cub[1], y: +cub[2] }, { x: +cub[3], y: +cub[4] },
        { x: +cub[5], y: +cub[6] }, { x: +cub[7], y: +cub[8] }];
      return Ariane._cubiqueAvecPonts(P, cs, R, nb);
    }
    return Ariane._polyligneAvecPonts(d, cs, R, nb);
  }

  static _cubiqueAvecPonts(P, cs, R, nb) {
    const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    const pt = (c, t) => {
      const u = 1 - t;
      return {
        x: u * u * u * c[0].x + 3 * u * u * t * c[1].x + 3 * u * t * t * c[2].x + t * t * t * c[3].x,
        y: u * u * u * c[0].y + 3 * u * u * t * c[1].y + 3 * u * t * t * c[2].y + t * t * t * c[3].y,
      };
    };
    const speed = (c, t) => {
      const u = 1 - t;
      const dx = 3 * u * u * (c[1].x - c[0].x) + 6 * u * t * (c[2].x - c[1].x) + 3 * t * t * (c[3].x - c[2].x);
      const dy = 3 * u * u * (c[1].y - c[0].y) + 6 * u * t * (c[2].y - c[1].y) + 3 * t * t * (c[3].y - c[2].y);
      return Math.hypot(dx, dy);
    };
    const split = (c, t) => {
      const ab = lerp(c[0], c[1], t); const bc = lerp(c[1], c[2], t); const cd = lerp(c[2], c[3], t);
      const abbc = lerp(ab, bc, t); const bccd = lerp(bc, cd, t);
      const f = lerp(abbc, bccd, t);
      return { left: [c[0], ab, abbc, f], right: [f, bccd, cd, c[3]] };
    };
    const tNear = (c, Q) => {
      let bt = 0; let bd = Infinity;
      for (let i = 0; i <= 160; i++) {
        const q = pt(c, i / 160);
        const dd = (q.x - Q.x) ** 2 + (q.y - Q.y) ** 2;
        if (dd < bd) { bd = dd; bt = i / 160; }
      }
      let lo = Math.max(0, bt - 1 / 160); let hi = Math.min(1, bt + 1 / 160);
      for (let k = 0; k < 24; k++) {
        const m1 = lo + (hi - lo) / 3; const m2 = hi - (hi - lo) / 3;
        const d1 = (pt(c, m1).x - Q.x) ** 2 + (pt(c, m1).y - Q.y) ** 2;
        const d2 = (pt(c, m2).x - Q.x) ** 2 + (pt(c, m2).y - Q.y) ** 2;
        if (d1 < d2) hi = m2; else lo = m1;
      }
      return (lo + hi) / 2;
    };
    const ts = [];
    for (const Q of cs) {
      const t = tNear(P, Q);
      if (!(t > 0.02 && t < 0.98)) continue;
      const q = pt(P, t);
      // Q vient d'une polyligne échantillonnée : tolérance large, on ne veut
      // que rejeter les points franchement hors du tracé.
      if (Math.hypot(q.x - Q.x, q.y - Q.y) > 16) continue;
      ts.push(t);
    }
    ts.sort((a, b) => a - b);
    if (!ts.length) return null;
    let cur = P; let consomme = 0;
    let d = 'M ' + nb(P[0].x) + ' ' + nb(P[0].y);
    for (const t of ts) {
      const tl = (t - consomme) / (1 - consomme);
      if (!(tl > 0.03 && tl < 0.97)) continue;
      const dt = Math.min(0.45, R / Math.max(1, speed(cur, tl)));
      const t1 = Math.max(0.01, tl - dt); const t2 = Math.min(0.98, tl + dt);
      if (t2 - t1 < 0.02) continue;
      const s1 = split(cur, t1);
      const s2 = split(s1.right, (t2 - t1) / (1 - t1));
      const f1 = s1.left[3];
      d += ' C ' + nb(s1.left[1].x) + ' ' + nb(s1.left[1].y) + ', '
        + nb(s1.left[2].x) + ' ' + nb(s1.left[2].y) + ', ' + nb(f1.x) + ' ' + nb(f1.y);
      const S2 = s2.right[0];
      const rArc = Math.max(2, Math.hypot(S2.x - f1.x, S2.y - f1.y) / 2);
      d += ' A ' + nb(rArc) + ' ' + nb(rArc) + ' 0 0 1 ' + nb(S2.x) + ' ' + nb(S2.y);
      cur = s2.right; consomme = t2;
    }
    d += ' C ' + nb(cur[1].x) + ' ' + nb(cur[1].y) + ', '
      + nb(cur[2].x) + ' ' + nb(cur[2].y) + ', ' + nb(cur[3].x) + ' ' + nb(cur[3].y);
    return d;
  }

  static _polyligneAvecPonts(d, cs, R, nb) {
    // Tokenise « M x y | L x y | Q cx cy x y » en pas.
    const toks = d.trim().match(/[MLQ]|-?[\d.]+/g) || [];
    const pas = [];
    let i = 0; let cur = null;
    while (i < toks.length) {
      const cmd = toks[i++];
      if (cmd === 'M' || cmd === 'L') {
        const p = { x: +toks[i++], y: +toks[i++] };
        pas.push({ cmd, p }); cur = p;
      } else if (cmd === 'Q') {
        const cp = { x: +toks[i++], y: +toks[i++] };
        const p = { x: +toks[i++], y: +toks[i++] };
        pas.push({ cmd, cp, p }); cur = p;
      } else { return null; }
    }
    if (pas.length < 2 || pas[0].cmd !== 'M') return null;
    let touche = false;
    let out = 'M ' + nb(pas[0].p.x) + ' ' + nb(pas[0].p.y);
    let prev = pas[0].p;
    for (let k = 1; k < pas.length; k++) {
      const st = pas[k];
      if (st.cmd !== 'L') {
        out += ' Q ' + nb(st.cp.x) + ' ' + nb(st.cp.y) + ' ' + nb(st.p.x) + ' ' + nb(st.p.y);
        prev = st.p; continue;
      }
      const a = prev; const b = st.p;
      const segL = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / segL; const uy = (b.y - a.y) / segL;
      const hits = cs.map((Q) => {
        const tt = (Q.x - a.x) * ux + (Q.y - a.y) * uy;
        const perp = Math.abs((Q.x - a.x) * uy - (Q.y - a.y) * ux);
        return { tt, perp };
      }).filter((o) => o.perp < 16 && o.tt > R && o.tt < segL - R)
        .sort((p, q) => p.tt - q.tt);
      let cur2 = 0;
      for (const { tt } of hits) {
        if (tt - cur2 < 2 * R) continue;
        out += ' L ' + nb(a.x + ux * (tt - R)) + ' ' + nb(a.y + uy * (tt - R))
          + ' A ' + R + ' ' + R + ' 0 0 1 '
          + nb(a.x + ux * (tt + R)) + ' ' + nb(a.y + uy * (tt + R));
        cur2 = tt + R; touche = true;
      }
      out += ' L ' + nb(b.x) + ' ' + nb(b.y);
      prev = b;
    }
    return touche ? out : null;
  }

  // Routage : sortie au bord droit de la source, entrée par la gauche, le haut
  // ou le bas de la cible — jamais par la droite. Gabarits essayés dans
  // l'ordre ; le premier dont tous les segments sont libres gagne. Renvoie
  // { points, cote, x2, y2 }, ou null si aucun chemin n'existe (l'appelant
  // retombe alors sur le tracé simple).
  //  sortie    : {x, y} — le point de sortie (bord droit de la source).
  //  cible     : {x, y, w, h, ancreGauche} — rect de la carte + hauteur
  //              d'ancre du bord gauche ; l'entrée verticale se fait au centre.
  //  obstacles : les AUTRES cartes {x, y, w, h}.
  //  opts      : {marge, ecart, source}.
  static routeFlecheArticulation(sortie, cible, obstacles, opts) {
    if (!sortie || !cible) return null;
    const o = opts || {};
    const M = Number.isFinite(o.marge) ? o.marge : 12;
    const E = Number.isFinite(o.ecart) ? o.ecart : 22;
    const x1 = sortie.x, y1 = sortie.y;
    const yQ = Number.isFinite(cible.ancreGauche) ? cible.ancreGauche : cible.y + (cible.h || 0) / 2;
    const cx = cible.x + (cible.w || 0) / 2;
    const aDroite = cible.x >= x1 + 24;
    const auDessus = cible.y + (cible.h || 0) / 2 < y1;
    // La source et la cible entrent dans la validation sans marge : le test
    // intérieur strict épargne les ancrages posés sur leurs bords.
    const defence = [o.source, cible].filter(Boolean);
    const libre = (pts) => {
      for (let i = 1; i < pts.length; i++) {
        if (Ariane.segmentFrappe(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, obstacles, M)) return false;
        if (Ariane.segmentFrappe(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, defence, 0)) return false;
      }
      return true;
    };
    // Les cartes qui encombrent le passage repoussent le couloir horizontal :
    // juste au-dessus de la plus haute, ou juste en dessous de la plus basse.
    // La source y compte (contour à rebours) ; la cible non, ses plafonds
    // d'entrée suffisent.
    const passage = (a, b) => [o.source].concat(obstacles || []).filter((c) => c
      && c.x + (c.w || 0) + M > Math.min(a, b) && c.x - M < Math.max(a, b));
    const couloirHaut = (a, b, plafond) => {
      let y = plafond;
      for (const c of passage(a, b)) y = Math.min(y, c.y - M);
      return y;
    };
    const couloirBas = (a, b, plancher) => {
      let y = plancher;
      for (const c of passage(a, b)) y = Math.max(y, c.y + (c.h || 0) + M);
      return y;
    };
    const essais = [];
    // Entrée par la gauche : direct dans l'entre-deux, sinon couloir au-dessus
    // ou en dessous des cartes du passage, puis descente / montée d'approche.
    const parGauche = () => {
      const mx = Math.max(x1 + 16, (x1 + cible.x) / 2);
      const direct = [{ x: x1, y: y1 }, { x: mx, y: y1 }, { x: mx, y: yQ }, { x: cible.x, y: yQ }];
      if (libre(direct)) return direct;
      for (const couloir of [
        couloirHaut(x1 + E, cible.x - E, Math.min(y1, yQ)),
        couloirBas(x1 + E, cible.x - E, Math.max(y1, yQ)),
      ]) {
        const pts = [{ x: x1, y: y1 }, { x: x1 + E, y: y1 }, { x: x1 + E, y: couloir },
          { x: cible.x - E, y: couloir }, { x: cible.x - E, y: yQ }, { x: cible.x, y: yQ }];
        if (libre(pts)) return pts;
      }
      return null;
    };
    const parHaut = () => {
      const couloir = couloirHaut(x1 + E, cx, Math.min(y1, cible.y - M));
      const pts = [{ x: x1, y: y1 }, { x: x1 + E, y: y1 }, { x: x1 + E, y: couloir },
        { x: cx, y: couloir }, { x: cx, y: cible.y }];
      return libre(pts) ? pts : null;
    };
    const parBas = () => {
      const couloir = couloirBas(x1 + E, cx, Math.max(y1, cible.y + (cible.h || 0) + M));
      const pts = [{ x: x1, y: y1 }, { x: x1 + E, y: y1 }, { x: x1 + E, y: couloir },
        { x: cx, y: couloir }, { x: cx, y: cible.y + (cible.h || 0) }];
      return libre(pts) ? pts : null;
    };
    essais.push(['gauche', parGauche]);
    essais.push(auDessus ? ['bas', parBas] : ['haut', parHaut]);
    essais.push(auDessus ? ['haut', parHaut] : ['bas', parBas]);
    if (!aDroite) essais.push(['gauche', parGauche]);
    for (const [cote, essai] of essais) {
      const pts = essai();
      if (pts) {
        const f = pts[pts.length - 1];
        return { points: pts, cote, x2: f.x, y2: f.y };
      }
    }
    return null;
  }

  // Décision complète pour une arête : le tracé simple dès qu'il est libre et
  // qu'il entre à gauche, le routage qui contourne les cartes sinon, le tracé
  // historique en dernier recours (peut passer derrière une carte). Renvoie
  // { d, x2, y2, cote, detour, labX, labY }. `o` : { x1, y1,
  // source:{x,y,w,h}, cible:{x,y,w,h,ancreGauche}, obstacles, mode, marge,
  // ecart }.
  static traceFlecheArticulation(o) {
    const c = o || {};
    const mode = c.mode === 'angulaire' ? 'angulaire' : 'courbe';
    const T = c.cible || {};
    const x1 = c.x1, y1 = c.y1;
    const yQ = Number.isFinite(T.ancreGauche) ? T.ancreGauche : T.y;
    const aDroite = T.x >= x1 + 24;
    const milieux = (x2, y2) => ({ labX: (x1 + x2) / 2, labY: (y1 + y2) / 2 - 4 });
    // Le tracé d'origine, dès qu'il est libre : aucun changement visible dans
    // les cas qui marchaient déjà.
    if (aDroite) {
      const mx = Math.max(x1 + 16, (x1 + T.x) / 2);
      const pris = mode === 'angulaire'
        ? Ariane.segmentFrappe(x1, y1, mx, y1, c.obstacles, c.marge)
          || Ariane.segmentFrappe(mx, y1, mx, yQ, c.obstacles, c.marge)
          || Ariane.segmentFrappe(mx, yQ, T.x, yQ, c.obstacles, c.marge)
        : Ariane.flecheEncombee(x1, y1, mx, T.x, yQ, c.obstacles, c.marge);
      if (!pris) {
        const d = mode === 'angulaire'
          ? Ariane.cheminPolyligne([{ x: x1, y: y1 }, { x: mx, y: y1 },
            { x: mx, y: yQ }, { x: T.x, y: yQ }], R_COUDE_ARTIC)
          : Ariane._cheminFleche(x1, y1, T.x, yQ);
        return Object.assign({ d, x2: T.x, y2: yQ, cote: 'gauche', detour: false }, milieux(T.x, yQ));
      }
    }
    // Routage : contourner les cartes.
    const route = Ariane.routeFlecheArticulation({ x: x1, y: y1 }, T, c.obstacles,
      { marge: c.marge, ecart: c.ecart, source: c.source });
    if (route) {
      const d = Ariane.cheminPolyligne(route.points, mode === 'angulaire' ? R_COUDE_ARTIC : 12);
      let meilleur = null, long = -1;
      for (let i = 1; i < route.points.length; i++) {
        const p = route.points[i - 1], q = route.points[i];
        const l = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
        if (l > long) { long = l; meilleur = { labX: (p.x + q.x) / 2, labY: (p.y + q.y) / 2 - 4 }; }
      }
      return Object.assign({ d, x2: route.x2, y2: route.y2, cote: route.cote, detour: true }, meilleur);
    }
    // Aucun chemin : le tracé historique, entrée à droite comprise.
    const x2 = aDroite ? T.x : T.x + (T.w || 0);
    const mx = aDroite ? Math.max(x1 + 16, (x1 + T.x) / 2) : Math.max(x1, x2) + 26;
    const d = mode === 'angulaire'
      ? Ariane.cheminPolyligne([{ x: x1, y: y1 }, { x: mx, y: y1 },
        { x: mx, y: yQ }, { x: x2, y: yQ }], R_COUDE_ARTIC)
      : 'M ' + x1 + ' ' + y1 + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + yQ + ', ' + x2 + ' ' + yQ;
    return Object.assign({ d, x2, y2: yQ, cote: aDroite ? 'gauche' : 'droite', detour: false },
      milieux(x2, yQ));
  }
  // Lignée révélée au survol : la famille entière. On remonte la chaîne des
  // parents rendus jusqu'à la racine, puis on prend tout son sous-arbre.
  // Qu'on survole la mère ou une de ses filles, le trait se pose alors sur
  // toutes les filles de chaque mère de la lignée. Renvoie un Set de refs.
  static ligneeDe(ref, parRef) {
    const enfants = new Map();
    for (const l of parRef.values()) {
      if (!l.parent) continue;
      if (!enfants.has(l.parent)) enfants.set(l.parent, []);
      enfants.get(l.parent).push(l.ref);
    }
    const lignee = new Set([ref]);
    let cur = (parRef.get(ref) || {}).parent;
    let racine = ref;
    while (cur && parRef.has(cur) && !lignee.has(cur)) {
      lignee.add(cur); racine = cur; cur = parRef.get(cur).parent;
    }
    const file = [racine];
    while (file.length) {
      for (const e of enfants.get(file.shift()) || []) {
        if (!lignee.has(e)) { lignee.add(e); file.push(e); }
      }
    }
    return lignee;
  }

  // Hiérarchie complète des tâches, pour les boutons et panneaux de lignée du
  // calendrier. Renvoie { parRef, meres, filles } : parRef = Map ref → tâche ;
  // meres = Map ref → chaîne [racine, …, mère, ref] ; filles = Map ref →
  // sous-arbre [{ ref, filles: […] }]. Parent inconnu ou cycle : la remontée
  // s'arrête, la descendance coupe au chemin déjà parcouru.
  static hierarchiesTaches(taches) {
    const liste = (taches || []).filter((t) => t && t.ref);
    const parRef = new Map(liste.map((t) => [t.ref, t]));
    const enfants = new Map();
    for (const t of liste) {
      const p = Ariane.refDeLien(t.parent);
      if (!p || !parRef.has(p) || p === t.ref) continue;
      if (!enfants.has(p)) enfants.set(p, []);
      enfants.get(p).push(t.ref);
    }
    const filles = new Map();
    const chemin = new Set();
    // Pas de mémoïsation : un résultat calculé pendant le parcours d'un cycle
    // serait coupé trop tôt et empoisonnerait ensuite la memo. Les hiérarchies
    // réelles sont peu profondes — le recalcul ne coûte rien.
    const sousArbre = (r) => {
      if (chemin.has(r)) return [];            // cycle : coupe ici
      chemin.add(r);
      const out = (enfants.get(r) || []).map((e) => ({ ref: e, filles: sousArbre(e) }));
      chemin.delete(r);
      return out;
    };
    const meres = new Map();
    const chaineDe = (r) => {
      const out = [r];
      const vus = new Set([r]);
      let cur = Ariane.refDeLien((parRef.get(r) || {}).parent);
      while (cur && parRef.has(cur) && !vus.has(cur)) {
        out.unshift(cur); vus.add(cur);
        cur = Ariane.refDeLien((parRef.get(cur) || {}).parent);
      }
      return out;
    };
    for (const t of liste) {
      chemin.clear();
      filles.set(t.ref, sousArbre(t.ref));
      meres.set(t.ref, chaineDe(t.ref));
    }
    return { parRef, meres, filles };
  }

  // Paires de tâches à relier dans la vue semaine du calendrier : mère DIRECTE
  // → fille (parenté) et bloqueur → bloquée. Seules sortent les paires dont
  // les deux bouts figurent dans `taches` (celles qui ont un créneau rendu) ;
  // la grand-mère n'est pas reliée à la petite-fille — la chaîne des traits
  // passe par la mère. Renvoie [{ de, vers, genre }] (de = amont).
  static pairesLigneeCalendrier(taches, hier) {
    const liste = (taches || []).filter((t) => t && t.ref);
    const la = new Set(liste.map((t) => t.ref));
    const vus = new Set();
    const out = [];
    const pousser = (de, vers, genre) => {
      if (!de || de === vers || !la.has(de) || !la.has(vers)) return;
      const cle = de + ' ' + vers + ' ' + genre;
      if (vus.has(cle)) return;
      vus.add(cle);
      out.push({ de, vers, genre });
    };
    for (const t of liste) {
      const chaine = hier && hier.meres ? hier.meres.get(t.ref) : null;
      if (chaine && chaine.length >= 2) pousser(chaine[chaine.length - 2], t.ref, 'hier');
      for (const b of t.bloquePar || []) pousser(Ariane.refDeLien(b), t.ref, 'bloque');
    }
    return out;
  }

  // Associe aux paires de tâches les créneaux rendus (points) : TOUS les
  // créneaux amont sont reliés à TOUS les créneaux aval (une tâche avec
  // plusieurs sessions affiche un trait par paire), mais seulement dans la
  // `portee` — écart en jours, la largeur de la vue. Renvoie [{ a, b, genre }]
  // — indices dans points, a = amont.
  static liensLigneeCalendrier(points, paires, portee) {
    const pts = points || [];
    const temps = (q) => {
      const n = Date.parse(String(q || '').replace(' ', 'T'));
      return Number.isFinite(n) ? n : 0;
    };
    const parRef = new Map();
    pts.forEach((p, i) => {
      if (!p || !p.ref) return;
      if (!parRef.has(p.ref)) parRef.set(p.ref, []);
      parRef.get(p.ref).push(i);
    });
    const maxJours = Number.isFinite(portee) ? portee : 7;
    const out = [];
    for (const paire of paires || []) {
      const cote = (ref) => (parRef.get(ref) || [])
        .map((i) => ({ i, q: String(pts[i].quand || '') }))
        .sort((x, y) => (x.q < y.q ? -1 : x.q > y.q ? 1 : 0));
      for (const u of cote(paire.de)) {
        for (const v of cote(paire.vers)) {
          const jours = Math.abs(temps(u.q.slice(0, 10))
            - temps(v.q.slice(0, 10))) / 86400000;
          if (jours > maxJours) continue;
          out.push({ a: u.i, b: v.i, genre: paire.genre });
        }
      }
    }
    return out;
  }

  // Géométrie d'un trait entre deux créneaux rendus (rects relatifs au SVG) :
  // colonnes différentes → courbe horizontale bord à bord ; même colonne →
  // courbe verticale du bas de l'un au haut de l'autre ; chevauchement
  // horizontal (blocs côte à côte) → court trait bord à bord. Renvoie
  // { d, ax, ay, bx, by } — d pour le path, a/b pour les nœuds d'extrémité.
  static cheminLienCalendrier(ra, rb) {
    const r2 = (v) => Math.round(v * 100) / 100;
    const siHorizontal = (ra.x + ra.w) <= rb.x || (rb.x + rb.w) <= ra.x;
    if (siHorizontal) {
      const [g, dr] = ra.x <= rb.x ? [ra, rb] : [rb, ra];
      const ax = g.x + g.w, ay = g.y + g.h / 2;
      const bx = dr.x, by = dr.y + dr.h / 2;
      const mx = r2((ax + bx) / 2);
      return { d: 'M ' + r2(ax) + ' ' + r2(ay) + ' C ' + mx + ' ' + r2(ay)
        + ' ' + mx + ' ' + r2(by) + ' ' + r2(bx) + ' ' + r2(by),
        ax: r2(ax), ay: r2(ay), bx: r2(bx), by: r2(by) };
    }
    const haut = ra.y <= rb.y ? ra : rb;
    const bas = haut === ra ? rb : ra;
    const ax = haut.x + haut.w / 2, ay = haut.y + haut.h;
    const bx = bas.x + bas.w / 2, by = bas.y;
    const my = r2((ay + by) / 2);
    return { d: 'M ' + r2(ax) + ' ' + r2(ay) + ' C ' + r2(ax) + ' ' + my
      + ' ' + r2(bx) + ' ' + my + ' ' + r2(bx) + ' ' + r2(by),
      ax: r2(ax), ay: r2(ay), bx: r2(bx), by: r2(by) };
  }

  // Colonne de jour visée par l'étirement d'une barre de la frise : la date
  // qui change est celle qui touche le bord tiré — début pour la poignée
  // gauche (bord gauche de sa colonne), échéance pour la droite (la barre
  // couvre son dernier jour en entier, donc bord droit = fin de sa colonne).
  static colonneGuideEtir(x, ppj, cote) {
    const p = Number(ppj) > 0 ? Number(ppj) : 1;
    const i = Math.round(Number(x) / p) - (cote === 'droite' ? 1 : 0);
    return Math.max(0, i);
  }

  // Défilement de l'intitulé d'une barre survolée : décalage (en px, négatif —
  // le texte glisse vers la gauche) et durée d'un aller (vitesse ~20 px/s)
  // quand le texte dépasse la place disponible, null sinon.
  static defileEtiquette(mesure, dispo) {
    const trop = Number(mesure) - Math.max(10, Number(dispo) || 10);
    if (!(trop > 4)) return null;
    return { x: Math.round(-trop * 10) / 10, duree: Math.round(trop / 0.02) };
  }

  // Abscisse de l'épine d'une accolade de lignée : dégagée À GAUCHE de la
  // mère ET de la première fille datée (voir _cheminAccolade). Elle ne
  // traverse donc jamais une barre de la famille, même quand le tri actif ou
  // le regroupement éparpille la mère au milieu de ses filles. Les filles
  // sans date (accrochées au bord gauche visible) ne tirent pas l'épine.
  static _epineAccolade(b, dx, refBouge) {
    const kx = (k) => k.xg + (k.ref === refBouge ? (dx || 0) : 0);
    const xs = b.kids.filter((k) => !k.sansDate).map(kx);
    xs.push(b.mx);
    return Math.max(0, Math.min.apply(null, xs) - b.degage);
  }

  // `d` d'une accolade de lignée : l'épine est un rail vertical dégagé à
  // gauche de la mère et des filles datées, couvrant toute la famille. La mère
  // et chaque fille se raccordent AU CENTRE de l'extrémité gauche de leur
  // barre par un ANGLE DROIT dont le sommet est SUR le trait — c'est là que
  // porte le nœud (la jointure ronde du trait adoucit l'angle, sans courbe
  // qui s'arrêterait avant le point). Une fille sans date rejoint sa bande en
  // trait direct le long de sa ligne. `dx` décale la fille `refBouge`
  // (glissé en direct).
  // b : { mx, pCy, kids:[{ref,xg,cy,sansDate}], degage }
  static _cheminAccolade(b, dx, refBouge) {
    const sx = Ariane._epineAccolade(b, dx, refBouge);
    const kx = (k) => k.xg + (k.ref === refBouge ? (dx || 0) : 0);
    const cys = b.kids.map((k) => k.cy);
    const haut = Math.min.apply(null, cys.concat([b.pCy]));
    const bas = Math.max.apply(null, cys.concat([b.pCy]));
    const dessus = haut < b.pCy - 0.5; // des filles au-dessus de la mère
    const dessous = bas > b.pCy + 0.5; // des filles en dessous
    let d;
    if (dessus && dessous) {
      // Famille éparpillée des deux côtés : rail traversant, la mère le
      // rejoint en trait droit (aucun sens d'angle à privilégier).
      d = 'M ' + sx + ' ' + haut + ' L ' + sx + ' ' + bas
        + ' M ' + b.mx + ' ' + b.pCy + ' L ' + sx + ' ' + b.pCy;
    } else if (dessous) {
      // Filles plus bas : l'angle droit est sous la mère, au ras du rail.
      d = 'M ' + b.mx + ' ' + b.pCy + ' L ' + sx + ' ' + b.pCy
        + ' L ' + sx + ' ' + bas;
    } else {
      // Filles plus haut (ou à hauteur) : le rail descend jusqu'à la mère.
      d = 'M ' + sx + ' ' + haut + ' L ' + sx + ' ' + b.pCy
        + ' L ' + b.mx + ' ' + b.pCy;
    }
    for (const k of b.kids) {
      // Chaque fille part du rail à sa hauteur, en angle droit ; une bande
      // sans date a son bord gauche des deux côtés possibles de l'épine.
      const xg = kx(k);
      d += ' M ' + sx + ' ' + k.cy + ' L ' + xg + ' ' + k.cy;
    }
    return d;
  }

  //#endregion Ariane · static · articulation
};

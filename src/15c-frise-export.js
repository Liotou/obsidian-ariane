// ── Figage des données de l'export HTML ────────────────────────────────────
// Les tâches vivantes portent le TFile du coffre (fichier) : structure
// circulaire (parent → children → …) qui fait échouer JSON.stringify. L'export
// ne part jamais avec les objets bruts — copie blanche des champs que la page
// lit, tous primitifs ou listes de primitifs.
const CHAMPS_TACHE_EXPORT = ['ref', 'intitule', 'parent', 'bloquePar', 'debut', 'echeance',
  'heure', 'creneaux', 'statut', 'priorite', 'avancement', 'jalon', 'famille', 'x', 'y'];

function tachesPourExport(taches) {
  return (taches || []).map((t) => {
    const o = {};
    for (const k of CHAMPS_TACHE_EXPORT) {
      const v = t[k];
      if (v == null || typeof v !== 'object') o[k] = v == null ? null : v;
      else { try { o[k] = JSON.parse(JSON.stringify(v)); } catch (e) { /* valeur vivante : perdue */ } }
    }
    return o;
  });
}

// Valeurs du tri natif multi-critères ({ ref : [{ v, s }] }) relevées sur les
// tâches vivantes : la donnée brute peut être un objet Bases — figé en texte.
function multiPourExport(multi) {
  const out = {};
  for (const ref of Object.keys(multi || {})) {
    const liste = multi[ref];
    out[ref] = Array.isArray(liste)
      ? liste.map((m) => ({
          v: m && typeof m.v === 'object' ? String(m.v) : (m ? m.v : ''),
          s: m && m.s ? m.s : 1,
        }))
      : null;
  }
  return out;
}

// Colonnes du tableau de gauche : les fermetures vivantes de la vue (chemin,
// valeur, valeurBrute) sont appelées ICI, avant d'être remplacées par les
// dictionnaires figés que la page relit — l'ordre compte, sinon cellules vides.
function colonnesPourExport(vivantes, refs) {
  return (vivantes || []).map((col) => {
    const out = { cle: col.cle, nom: col.nom || col.cle, chemin: {}, valeur: {}, valeurBrute: {} };
    const ch = col.chemin, va = col.valeur, vb = col.valeurBrute;
    for (const ref of (refs || [])) {
      try { out.chemin[ref] = ch ? String(ch(ref) || '') : ''; } catch (e) { out.chemin[ref] = ''; }
      try { out.valeur[ref] = va ? String(va(ref) == null ? '' : va(ref)) : ''; } catch (e) { out.valeur[ref] = ''; }
      try {
        const b = vb ? vb(ref) : out.valeur[ref];
        out.valeurBrute[ref] = (b == null || typeof b !== 'object') ? b : String(b);
      } catch (e) { out.valeurBrute[ref] = out.valeur[ref]; }
    }
    return out;
  });
}

// ── Page HTML autonome (« frise vivante ») ──────────────────────────────────
// Fonction pure (éprouvée dans node) : reçoit les données figées préparées par
// MoteurFrise.exporterHtml et renvoie le texte complet d'un fichier HTML.
// Le vrai moteur est embarqué tel quel (source de MoteurFrise) et repose sur
// un petit socle reconstruit dans la page : obsidian factice, Ariane
// (statiques ré-évaluées), polyfills DOM d'Obsidian, greffon et contexte
// factices qui ne touchent jamais le coffre — l'export est un aperçu.
function pageFriseHtml(d) {
  const echap = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // « < » échappé : le contenu ne peut jamais refermer le script hôte.
  const charge = JSON.stringify(d).replace(/</g, '\\u003c');

  const css = `html, body { margin: 0; padding: 0; }
body { padding: 18px 22px 30px; background: var(--background-primary, #ffffff); color: var(--text-normal, #222222); box-sizing: border-box; height: 100vh; overflow: hidden; }
.zfa-export-entete { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; margin: 0 0 14px; border-bottom: 1px solid var(--background-modifier-border, #dddddd); padding-bottom: 10px; }
.zfa-export-titre { font-size: 1.25em; font-weight: 700; }
.zfa-export-meta { font-size: var(--font-ui-smaller, 12px); color: var(--text-muted, #777777); }
#frise { width: 100%; max-width: 1600px; margin: 0 auto; height: calc(100vh - 76px); }
.zfa-toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); background: var(--background-secondary, #f2f2f2); color: var(--text-normal, #222222); border: 1px solid var(--background-modifier-border, #cccccc); border-radius: 8px; padding: 8px 14px; font-size: var(--font-ui-small, 13px); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18); z-index: 99; opacity: 0; transition: opacity 0.18s; pointer-events: none; }
.zfa-toast.visible { opacity: 1; }
/* Gabarit minimal du balisage Bases repris par la colonne de gauche : dans
   Obsidian sa mise en page vient du coeur, absent hors du coffre — la page la
   restitue ici (positionnement seul ; couleurs et bordures restent au
   styles.css du greffon, embarqué par ailleurs). Les cellules portent leur
   left/width/height en style inline posé par le moteur. */
#frise .bases-table { position: relative; }
#frise .bases-thead { position: relative; }
#frise .bases-tbody { position: relative; }
#frise .bases-td { position: absolute; top: 0; box-sizing: border-box; overflow: hidden; }
#frise .bases-tr { position: absolute; left: 0; width: 100%; box-sizing: border-box; }
#frise .bases-table-header { display: flex; align-items: center; gap: 4px; width: 100%; box-sizing: border-box; padding: 0 var(--bases-table-cell-edge-padding, 8px); }
#frise .bases-table-header-label { display: flex; align-items: center; gap: 4px; flex: 1 1 auto; min-width: 0; overflow: hidden; }
#frise .bases-table-header-icon { display: inline-flex; flex: 0 0 auto; color: var(--text-muted, #777777); }
#frise .bases-table-header-icon svg { width: 14px; height: 14px; }
#frise .bases-table-header-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-ui-small, 13px); font-weight: 600; }
#frise .bases-table-header-sort { display: inline-flex; flex: 0 0 auto; color: var(--text-faint, #999999); }
#frise .bases-table-header-sort svg { width: 12px; height: 12px; }
#frise .bases-table-header-resizer { position: absolute; top: 0; right: 0; width: 7px; height: 100%; cursor: col-resize; }
#frise .bases-table-cell { display: flex; align-items: center; height: 100%; overflow: hidden; }
#frise .zfa-gantt-table .metadata-link { display: flex; align-items: center; height: 100%; min-width: 0; }
#frise a.internal-link { color: var(--text-normal, #222222); text-decoration: none; cursor: pointer; }
#frise a.internal-link:hover { text-decoration: underline; }
`;

  const socle = `<script>
const D = ${charge};

// ── Thème figé à l'export + styles du greffon ──
(function () {
  let regles = '';
  for (const k in (D.vars || {})) regles += k + ': ' + D.vars[k] + '; ';
  const th = document.createElement('style');
  th.textContent = ':root { ' + regles + ' }';
  document.head.appendChild(th);
  const st = document.createElement('style');
  st.textContent = D.css || '';
  document.head.appendChild(st);
})();

// ── Obsidian factice ──
const ICONES = D.icones || {};
function zfaToast(msg) {
  let t = document.querySelector('.zfa-toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'zfa-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(zfaToast._h);
  zfaToast._h = setTimeout(function () { t.classList.remove('visible'); }, 3500);
}
const obsidian = {
  setIcon: function (el, nom) { el.innerHTML = ICONES[nom] || ''; },
  Notice: class {
    constructor(msg) { if (msg) zfaToast(String(msg)); }
    hide() {}
  },
  Menu: class {
    addItem(f) {
      try {
        f({
          setTitle: () => this,
          setIcon: () => this,
          setChecked: () => this,
          onClick: () => this,
        });
      } catch (e) { /* rien */ }
      return this;
    }
    addSeparator() { return this; }
    showAtMouseEvent() {}
    showAtPosition() {}
  },
};

// ── Langue ──
const TEXTES = D.textes || {};
const LANGUE = D.langue || 'fr';
function tr(cle) {
  if (LANGUE === 'fr') return cle;
  const t = TEXTES[LANGUE];
  const v = t ? t[cle] : null;
  return v == null ? cle : v;
}

const DEFAUTS_FRISE = D.defauts || {};
const TYPE_VUE_BASE_FRISE = D.typeVue || 'ariane-frise';
const MSG_LECTURE = tr('Aperçu lecture seule : les modifications ne sont pas enregistrées.');

// Constantes de module dont le moteur a besoin (figées à l'export).
const CONSTANTES_FIGEES = D.constantes || {};
const JOURS_MINIMUM_GANTT = CONSTANTES_FIGEES.JOURS_MINIMUM_GANTT || { jour: 30, semaine: 90, mois: 365, trimestre: 365, 'année': 1095 };
const MOIS_COURTS = CONSTANTES_FIGEES.MOIS_COURTS || ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LETTRES = CONSTANTES_FIGEES.MOIS_LETTRES || ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

// Modales factices : toute écriture est refusée par un toast.
class ModaleDaterTache { open() { zfaToast(MSG_LECTURE); } }
class ModaleTache { open() { zfaToast(MSG_LECTURE); } }

// Annulation/rétablissement partagés : sans objet hors du coffre (les
// glissés continuent d'appeler poserAnnulation, qui devient un no-op).
function _toucheAnnuler() { return false; }
function _toucheRetablir() { return false; }
function poserAnnulation() {}
function annulerDernier() {}
function refaireDernier() {}

function svgEl(nom, attrs) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', nom);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
  return e;
}

// ── Aides DOM d'Obsidian dont le moteur a besoin ──
(function (P) {
  const regler = function (el, o) {
    if (!o) return el;
    if (o.cls) el.className = o.cls;
    if (o.text != null) el.textContent = o.text;
    if (o.attr) for (const k of Object.keys(o.attr)) el.setAttribute(k, String(o.attr[k]));
    return el;
  };
  P.createEl = function (tag, o) {
    const el = this.ownerDocument.createElement(tag);
    this.appendChild(el);
    return regler(el, o);
  };
  P.createDiv = function (o) { return this.createEl('div', o); };
  P.createSpan = function (o) { return this.createEl('span', o); };
  P.addClass = function () {
    for (const c of arguments) {
      const x = String(c == null ? '' : c).trim();
      if (x) this.classList.add.apply(this.classList, x.split(/\\s+/));
    }
    return this;
  };
  P.removeClass = function () {
    for (const c of arguments) {
      const x = String(c == null ? '' : c).trim();
      if (x) this.classList.remove.apply(this.classList, x.split(/\\s+/));
    }
    return this;
  };
  P.empty = function () {
    while (this.firstChild) this.removeChild(this.firstChild);
    return this;
  };
})(Element.prototype);

// ── Ariane reconstruite depuis les sources embarquées ──
const Ariane = Object.assign(function Ariane() {}, D.ariane.data || {});
for (const k of Object.keys(D.ariane.fns || {})) {
  try {
    const corps = String(D.ariane.fns[k]).replace(/^static\\s+/, '');
    let valeur = null;
    try {
      // Méthode de classe (raccourci, sans le mot-clé function) : l'objet
      // littéral lui redonne un contexte valide. Le descripteur évite
      // d'exécuter un éventuel accesseur.
      const contenant = (Function('return ({ ' + corps + ' });'))();
      const cle = Object.getOwnPropertyNames(contenant)[0];
      const desc = Object.getOwnPropertyDescriptor(contenant, cle);
      valeur = desc.get || desc.value;
    } catch (e) {
      // Flèche ou function affectée à un champ statique : expression directe.
      valeur = (Function('return (' + corps + ')'))();
    }
    Ariane[k] = valeur;
  } catch (e) { console.warn('[Ariane/HTML] statique ignorée :', k, e); }
}

// ── Le vrai moteur, tel quel (socle MoteurVue compris) ──
const MoteurFrise = (Function(D.moteur + '; return MoteurFrise;'))();

// ── Greffon factice : lit les données figées, ne touche jamais le coffre ──
class GreffonFactice {
  constructor(donnees) {
    this.d = donnees;
    // Les boutons d'export d'Obsidian ne se construisent pas dans la page
    // (dessinerBarreVue consulte ce drapeau à chaque dessin).
    this.estExportHtml = true;
    this.settings = {
      friseBarreCouleur: donnees.barreCouleur,
      friseLignageSurvol: donnees.lignageSurvol,
    };
    const ouvrirRef = function (ref) {
      const cible = (donnees.chemins || {})[ref] || ref;
      const url = 'obsidian://open?vault=' + encodeURIComponent(donnees.coffre || '')
        + '&file=' + encodeURIComponent(cible);
      try { window.open(url, '_blank'); } catch (e) { /* rien */ }
    };
    this.app = {
      vault: {
        getName: function () { return donnees.coffre || ''; },
        getMarkdownFiles: function () {
          const ch = donnees.chemins || {};
          return Object.keys(ch).map(function (r) { return { basename: r, path: ch[r] }; });
        },
        getAbstractFileByPath: function () { return null; },
      },
      workspace: {
        getLeaf: function () {
          return { openFile: function (f) { ouvrirRef(f.basename); } };
        },
        openLinkText: function (l) {
          ouvrirRef(String(l == null ? '' : l)
            .replace(/^\\[\\[/, '').replace(/\\]\\].*$/, '').split('|')[0]);
        },
        trigger: function () {},
      },
      metadataTypeManager: {
        registeredTypeWidgets: {}, properties: {},
        getTypeInfo: function () { return null; },
      },
      fileManager: { getAvailablePathForAttachment: function () { return ''; } },
      loadLocalStorage: function () { return null; },
      saveLocalStorage: function () {},
    };
    this.moteur = null; // branché au démarrage
  }
  cleT(k) { const m = this.d.cleT || {}; return m[k] || k; }
  familleDe(f) { return (this.d.familles || {})[f] || null; }
  tachesPourGantt() { return this.d.taches; }
  _repercuter() {
    zfaToast(MSG_LECTURE);
    const m = this.moteur;
    if (m) setTimeout(function () { try { m.dessiner(); } catch (e) { /* rien */ } }, 0);
  }
  async ecrireDatesTaches() { this._repercuter(); }
  async majTache() { this._repercuter(); }
  async saveSettings() {}
  async creerBlocage(deRef, versRef) {
    if (!deRef || !versRef || deRef === versRef) return false;
    const t = (this.d.taches || []).find(function (x) { return x.ref === versRef; });
    if (!t) return false;
    t.bloquePar = [].concat(t.bloquePar || [], ['[[' + deRef + ']]']);
    this._repercuter();
    return true;
  }
  async retirerBlocage(deRef, versRef) {
    const t = (this.d.taches || []).find(function (x) { return x.ref === versRef; });
    if (!t) return false;
    t.bloquePar = (t.bloquePar || []).filter(function (v) {
      return Ariane.refDeLien(v) !== deRef;
    });
    this._repercuter();
    return true;
  }
  ouvrirDecoupage() { zfaToast(MSG_LECTURE); }
}

// ── Contexte factice : même contrat que la vue Bases, mais en mémoire ──
class CtxFactice {
  constructor(donnees) {
    this.d = donnees;
    this.echelleReglable = true;
    this._valeurs = Object.assign({}, donnees.valeurs);
    this._renoms = Object.assign({}, donnees.renoms || {});
    this._pos = donnees.pos || null;
    this._clePos = 'ariane:friseJour:export:' + donnees.nomVue;
    try {
      const x = window.localStorage.getItem(this._clePos);
      if (x != null) this._pos = x;
    } catch (e) { /* stockage bloqué : valeur figée */ }
  }
  colonnes() {
    return this.d.colonnes.map((c) => ({
      cle: c.cle,
      nom: c.nom,
      chemin: (r) => (c.chemin[r] || ''),
      valeur: (r) => (c.valeur[r] != null ? String(c.valeur[r]) : ''),
      valeurBrute: (r) => (c.valeurBrute[r] != null ? c.valeurBrute[r] : ''),
    }));
  }
  taches() { return this.d.taches; }
  nomVue() { return this.d.nomVue; }
  lire(cle) { return (cle in this._valeurs) ? this._valeurs[cle] : DEFAUTS_FRISE[cle]; }
  async ecrire(cle, v) { this._valeurs[cle] = v; }
  posLire() { return this._pos || ''; }
  posEcrire(jour) {
    this._pos = jour || null;
    try { window.localStorage.setItem(this._clePos, jour || ''); } catch (e) { /* rien */ }
  }
  masquerColonne() {}
  ordreColonnes() { return this.d.colonnes.map((c) => c.cle); }
  async reordonner() {}
  renomColonne(id) { return this._renoms[id] || ''; }
  async renommer(id, nom) {
    if (nom && String(nom).trim()) this._renoms[id] = String(nom).trim();
    else delete this._renoms[id];
  }
  groupes() { return this.d.groupes ? new Map(Object.entries(this.d.groupes)) : null; }
  sensGroupe() { return (this.d.grp && this.d.grp.sens) || 1; }
  nomGroupe() { return (this.d.grp && this.d.grp.nom) || ''; }
  groupeActuel() { return (this.d.grp && this.d.grp.actuel) || null; }
  poserGroupe() {}
  triNatif() {
    const t = this.d.triNatif;
    if (!t) return null;
    return {
      criteres: t.criteres,
      preparer: function (taches) {
        for (const x of taches) x._multi = t.multi[x.ref] || null;
      },
    };
  }
}

// ── Démarrage ──
const racine = document.getElementById('frise');
try {
  const greffon = new GreffonFactice(D);
  const ctx = new CtxFactice(D);
  const moteur = new MoteurFrise(greffon, racine, ctx);
  greffon.moteur = moteur;
  moteur.dessiner();
  // Les boutons d'export n'ont pas de sens dans un fichier déjà exporté.
  racine.querySelectorAll('.zfa-gantt-bv-export, .zfa-gantt-bv-export-html')
    .forEach(function (el) { el.remove(); });
} catch (e) {
  racine.textContent = '';
  const p = document.createElement('p');
  p.style.padding = '1em';
  p.style.color = '#c0392b';
  p.textContent = '[Ariane] Erreur au chargement de la frise exportée : '
    + (e && e.message ? e.message : e);
  racine.appendChild(p);
  console.error('[Ariane/HTML]', e);
}
</script>`;

  return '<!doctype html>\n<html lang="' + (d.langue === 'en' ? 'en' : 'fr') + '">\n'
    + '<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<title>Frise — ' + echap(d.nomVue) + '</title>\n'
    + '<style>\n' + css + '</style>\n</head>\n'
    + '<body>\n'
    + '<header class="zfa-export-entete"><span class="zfa-export-titre">'
    + echap(d.nomVue) + '</span><span class="zfa-export-meta">'
    + echap(d.entete) + '</span></header>\n'
    + '<main id="frise"></main>\n'
    + socle
    + '\n</body>\n</html>\n';
}

//#endregion 15 · Vue Frise


/* ---- La frise comme vue d'une base ----------------------------------- */

// C'est la base qui filtre, qui trie et qui range les réglages, chacun dans sa
// propre vue du fichier .base. Deux frises peuvent donc coexister dans une même
// base, l'une au trimestre et l'autre à l'année, sans se marcher dessus.
function fabriquerVueFriseBase(greffon) {
  return class VueFriseBase extends obsidian.BasesView {
    constructor(controleur, conteneur) {
      super(controleur);
      this.type = TYPE_VUE_BASE_FRISE;
      this.greffon = greffon;
      this.conteneur = conteneur;
    }

    onload() {
      const clePos = () => 'ariane:friseJour:' + ((this.controller && this.controller.file
        && this.controller.file.path)
        || (this.config.serialize && (this.config.serialize() || {}).name) || 'defaut');
      this.moteur = new MoteurFrise(this.greffon, this.conteneur, {
        echelleReglable: true,
        colonnes: () => this.colonnes(),
        taches: () => this.tachesDeLaBase(),
        nomVue: () => {
          try {
            const s = this.config.serialize ? this.config.serialize() : null;
            return (s && s.name) || (this.controller && this.controller.file
              && this.controller.file.basename) || tr('Frise');
          } catch (e) { return tr('Frise'); }
        },
        lire: (cle) => {
          const v = this.config.get(cle);
          return v === undefined || v === null ? DEFAUTS_FRISE[cle] : v;
        },
        ecrire: async (cle, v) => { this.config.set(cle, v); },
        // Position de travail (jour au bord gauche) : stockée dans le
        // localStorage du coffre, par fichier .base — la config de la vue Bases
        // ne persiste pas de façon fiable les clés non déclarées.
        posLire: () => {
          try { return this.greffon.app.loadLocalStorage(clePos()) || ''; } catch (e) { return ''; }
        },
        posEcrire: (jour) => {
          try { this.greffon.app.saveLocalStorage(clePos(), jour || null); } catch (e) { /* rien */ }
        },
        masquerColonne: async (id) => {
          let ordre = [];
          try { ordre = this.config.getOrder() || []; } catch (e) { ordre = []; }
          this.config.setOrder(ordre.filter((x) => x !== id));
        },
        ordreColonnes: () => {
          try { return this.config.getOrder() || []; } catch (e) { return []; }
        },
        reordonner: async (arr) => {
          try { this.config.setOrder(arr); } catch (e) { /* setOrder absent */ }
        },
        renomColonne: (id) => {
          try { return (this.config.get('renoms') || {})[id] || ''; } catch (e) { return ''; }
        },
        renommer: async (id, nom) => {
          let r = {};
          try { r = Object.assign({}, this.config.get('renoms') || {}); } catch (e) { r = {}; }
          if (nom && String(nom).trim()) r[id] = String(nom).trim();
          else delete r[id];
          try { this.config.set('renoms', r); } catch (e) { /* rien */ }
        },
        groupes: () => this.groupesParTache(),
        sensGroupe: () => (this.groupeNatif() || {}).desc ? -1 : 1,
        nomGroupe: () => {
          const g = this.groupeNatif();
          if (!g) return '';
          try {
            return this.config.getDisplayName(g.property)
              || g.property.replace(/^(note|formula|file)\./, '');
          } catch (e) { return g.property; }
        },
        groupeActuel: () => (this.groupeNatif() || {}).property || null,
        poserGroupe: (prop) => {
          try {
            this.config.setGroupBy(prop
              ? { property: prop, direction: 'ASC' } : undefined);
          } catch (e) { /* setGroupBy absent : rien à faire */ }
        },
        triNatif: () => {
          const criteres = this.sortNatif();
          if (!criteres.length) return null;
          return {
            criteres,
            preparer: (taches) => {
              for (const t of taches) {
                const e = this._parRef && this._parRef.get(t.ref);
                t._multi = criteres.map((c) => {
                  let v = null;
                  try { v = e ? e.getValue(c.property) : null; } catch (err) { v = null; }
                  const brut = (v && typeof v === 'object' && 'data' in v && v.data != null)
                    ? v.data : v;
                  return { v: brut == null ? '' : brut, s: c.desc ? -1 : 1 };
                });
              }
            },
          };
        },
      });
    }

    // Le tri NATIF de la base (menu Trier), multi-critères : liste ordonnée de
    // { property, desc }. Lu dans le sérialisé de la vue, comme le groupBy.
    sortNatif() {
      let s = [];
      try { s = (this.config.serialize() || {}).sort || this.config.getSort() || []; }
      catch (e) { s = []; }
      return (Array.isArray(s) ? s : [])
        .filter((x) => x && x.property)
        .map((x) => ({ property: String(x.property),
          desc: String(x.direction || 'ASC').toUpperCase() === 'DESC' }));
    }

    // Le « Grouper par » NATIF de Bases (menu Trier), lu dans le sérialisé de
    // la vue : { property, direction }. C'est là que Bases le range, pas dans
    // le sac data.* de nos réglages ; il n'y a pas de getGroupBy exposé.
    groupeNatif() {
      try {
        const g = (this.config.serialize() || {}).groupBy;
        return g && g.property
          ? { property: String(g.property),
              desc: String(g.direction || 'ASC').toUpperCase() === 'DESC' }
          : null;
      } catch (e) { return null; }
    }

    // Libellés de groupe d'une Value de base : [] si vide, un par élément si
    // tableau. La disposition met les tâches sans libellé dans SANS_GROUPE.
    static libellesGroupe(v) {
      if (v === null || v === undefined || v === '') return [];
      const brut = (typeof v === 'object' && v && 'data' in v && v.data != null) ? v.data : v;
      const arr = Array.isArray(brut) ? brut : [brut];
      return arr.map((x) => VueFriseBase.texteValeur(x)).filter((s) => s !== '');
    }

    // Map<ref, string[]> des groupes de chaque tâche retenue, ou null si aucun
    // regroupement natif. Les ancêtres hors filtre (absents de _parRef) vont en
    // SANS_GROUPE, ce qui les garde visibles sans les rattacher au hasard.
    groupesParTache() {
      const g = this.groupeNatif();
      if (!g) return null;
      const out = new Map();
      for (const [ref, e] of (this._parRef || new Map())) {
        let v = null;
        try { v = e.getValue(g.property); } catch (err) { v = null; }
        const libs = VueFriseBase.libellesGroupe(v);
        out.set(ref, libs.length ? libs : [Ariane.SANS_GROUPE]);
      }
      return out;
    }

    onunload() { if (this.moteur) this.moteur.detruire(); }

    async onDataUpdated() {
      if (this.greffon.settings.famillesTaches && this.greffon.settings.famillesTaches.length) {
        try { await this.greffon.rattraperProprietesFamilles(); } catch (e) { /* sans gravité */ }
      }
      if (this.moteur) this.moteur.dessiner();
    }

    onResize() { if (this.moteur) this.moteur.dessiner(); }

    // Les colonnes de gauche sont exactement les propriétés que la base
    // affiche, dans l'ordre où Monsieur les a rangées. On n'en impose aucune et
    // on n'en écarte aucune : les retirer toutes laisse la frise seule.
    colonnes() {
      // getOrder rend les propriétés dans l'ordre où Monsieur les a rangées ;
      // data.properties ne sert que de repli quand l'ordre n'est pas défini.
      let props = [];
      try { props = this.config.getOrder() || []; } catch (e) { props = []; }
      if (!props.length) props = (this.data && this.data.properties) || [];
      let renoms = {};
      try { renoms = this.config.get('renoms') || {}; } catch (e) { renoms = {}; }
      const out = [];
      for (const id of props) {
        let nom = renoms[id] || '';
        if (!nom) {
          try { nom = this.greffon.libelleColonne(this.config.getDisplayName(id) || id); } catch (e) { nom = id; }
        }
        if (!nom) nom = id;
        const valeurDe = (ref) => {
          const e = this._parRef ? this._parRef.get(ref) : null;
          if (!e) return null;
          try { return e.getValue(id); } catch (err) { return null; }
        };
        out.push({
          cle: id,
          nom,
          // Chemin de la note de la ligne : sert de sourcePath au widget.
          chemin: (ref) => {
            const e = this._parRef ? this._parRef.get(ref) : null;
            return e && e.file ? e.file.path : '';
          },
          // La Value de base elle-même, si un jour on en a besoin telle quelle.
          valeurBase: (ref) => valeurDe(ref),
          // Repli textuel : sert au title=, et quand aucun widget ne convient.
          valeur: (ref) => {
            try { return VueFriseBase.texteValeur(valeurDe(ref)); } catch (err) { return ''; }
          },
          // Clé brute pour le tri : la donnée sous-jacente (chaîne ISO pour une
          // date) plutôt que son rendu localisé, qui se classerait de travers.
          valeurBrute: (ref) => {
            const v = valeurDe(ref);
            if (v == null) return '';
            if (typeof v === 'object' && 'data' in v && v.data != null) return v.data;
            return VueFriseBase.texteValeur(v);
          },
        });
      }

      return out;
    }

    // Une Value de base peut être une primitive, un tableau, ou un objet qui
    // sait se rendre en texte. On ne suppose rien et on retombe sur du vide
    // plutôt que d'afficher « [object Object] ».
    static texteValeur(v) {
      if (v === null || v === undefined) return '';
      if (Array.isArray(v)) return v.map((x) => VueFriseBase.texteValeur(x)).filter(Boolean).join(', ');
      if (typeof v === 'object') {
        if (typeof v.toString === 'function') {
          const t = v.toString();
          return t === '[object Object]' ? '' : t;
        }
        return '';
      }
      return String(v);
    }

    // La base ne rend que les notes retenues par son filtre. Une méta-tâche
    // écartée mais parente d'une tâche retenue manquerait, et l'arbre casserait :
    // on va donc rechercher les ancêtres absents dans le coffre.
    tachesDeLaBase() {
      const dedans = new Set();
      this._parRef = new Map();
      for (const e of (this.data && this.data.data) || []) {
        const chemin = e && e.file ? e.file.path : null;
        const ref = chemin ? this.greffon.refDeChemin(chemin) : null;
        if (!ref) continue;
        dedans.add(ref);
        this._parRef.set(ref, e);
      }
      if (!dedans.size) return [];
      const toutes = this.greffon.tachesPourGantt();
      const parRef = new Map(toutes.map((t) => [t.ref, t]));
      const gardes = new Set(dedans);
      for (const ref of dedans) {
        let p = Ariane.refDeLien((parRef.get(ref) || {}).parent || '');
        const vus = new Set([ref]);
        while (p && parRef.has(p) && !vus.has(p)) {
          gardes.add(p);
          vus.add(p);
          p = Ariane.refDeLien(parRef.get(p).parent || '');
        }
      }
      return toutes.filter((t) => gardes.has(t.ref));
    }
  };
}


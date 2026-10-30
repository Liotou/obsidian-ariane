// La section « Sessions » d'une note de tâche : ses tables et son résumé
// reçoivent les classes de l'habillage, en lecture comme en direct.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

// Un DOM minimal : sélecteurs simples (« tag.classe », listes à virgule).
class El {
  constructor(spec, enfants, texte) {
    const [tag, ...cls] = spec.split('.');
    this.tag = tag || 'div';
    this.classList = new Set(cls);
    this.classList.contains = this.classList.has;
    this.children = enfants || [];
    this.textContent = texte || '';
    this.parentElement = null;
    this.children.forEach((c) => { c.parentElement = this; });
  }
  get nextElementSibling() {
    const f = this.parentElement && this.parentElement.children;
    return f ? f[f.indexOf(this) + 1] || null : null;
  }
  matches(sel) {
    return sel.split(',').some((s) => {
      const [tag, ...cls] = s.trim().split('.');
      return (!tag || tag === this.tag) && cls.every((c) => this.classList.has(c));
    });
  }
  closest(sel) {
    for (let e = this; e; e = e.parentElement) if (e.matches(sel)) return e;
    return null;
  }
  querySelector(sel) {
    for (const c of this.children) {
      if (c.matches(sel)) return c;
      const d = c.querySelector(sel);
      if (d) return d;
    }
    return null;
  }
}

const habiller = (racine, titres) => {
  racine.querySelectorAll = () => titres;
  Ariane.prototype._habillerSessions.call(Object.create(Ariane.prototype), racine);
};

test('lecture : la table et le résumé sous « Sessions »', () => {
  const h2 = new El('h2', [], 'Sessions');
  const table = new El('table');
  const resume = new El('div.el-p', [new El('p', [new El('strong')])]);
  const autre = new El('table');
  const section = new El('div.markdown-preview-section', [
    new El('div.el-h2', [h2]), new El('div.el-div'), new El('div.el-table', [table]), resume,
    new El('div.el-h2', [new El('h2', [], 'Notes')]), new El('div.el-table', [autre]),
  ]);
  habiller(section, [h2]);
  assert.ok(table.classList.has('zfa-sessions-table'));
  assert.ok(resume.classList.has('zfa-sessions-resume'));
  assert.ok(!autre.classList.has('zfa-sessions-table'), 'une table d’une autre section reste native');
});

test('direct : ligne de titre puis widget de table', () => {
  const ligne = new El('div.cm-line.HyperMD-header.HyperMD-header-2', [], '## Sessions');
  const table = new El('table');
  const widget = new El('div.cm-embed-block.cm-table-widget', [new El('div.table-wrapper', [table])]);
  const resume = new El('div.cm-line', [new El('span.cm-strong')]);
  const contenu = new El('div.cm-content', [ligne, new El('div.cm-line'), widget, resume]);
  habiller(contenu, [ligne]);
  assert.ok(table.classList.has('zfa-sessions-table'));
  assert.ok(widget.classList.has('zfa-sessions-bloc'));
  assert.ok(resume.classList.has('zfa-sessions-resume'));
});

test('un titre suivi d’un autre titre avant toute table : rien', () => {
  const h2 = new El('h2', [], 'Sessions');
  const table = new El('table');
  const section = new El('div.markdown-preview-section', [
    new El('div.el-h2', [h2]), new El('div.el-h3', [new El('h3', [], 'Autre')]), new El('div.el-table', [table]),
  ]);
  habiller(section, [h2]);
  assert.ok(!table.classList.has('zfa-sessions-table'));
});

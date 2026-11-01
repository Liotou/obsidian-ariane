// Commentaires en marge (section 23) : la logique pure. Ces cas sont ceux de
// la suite du greffon d'origine, Margin Annotations (hex, licence MIT),
// ramenés aux noms d'Ariane ; ceux du guide pour les IA, qu'Ariane n'écrit
// pas, en sont retirés.
const test = require('node:test');
const assert = require('node:assert/strict');
const Ariane = require('./obsidian-factice.js');
const C = Ariane._test.CommentairesMarge;

const S = (id = "k1", color = "yellow") => `<span class="ann-s" data-id="${id}" data-color="${color}"></span>`;
const E = (note = "N", id = "k1", color = "yellow") =>
  `<span class="ann-e" data-id="${id}" data-color="${color}" data-note="${note}"></span>`;

function annotate(doc, sel, note = "N", id = "k1", color = "yellow") {
  const from = doc.indexOf(sel);
  assert.ok(from >= 0, "selection must exist");
  const ch = C.entourer(doc, from, from + sel.length, note, id, color);
  return ch ? C.appliquer(doc, ch) : null;
}

test("single line", () => {
  assert.equal(annotate("今天讲一个工具。结尾。", "一个工具"), `今天讲${S()}一个工具${E()}。结尾。`);
});

test("color is stored on both markers", () => {
  assert.equal(annotate("abc", "abc", "N", "k1", "green"), `${S("k1", "green")}abc${E("N", "k1", "green")}`);
});

test("multi-line selection: one start, one end", () => {
  const out = annotate("第一行\n第二行\n第三行", "第一行\n第二行");
  assert.equal(out, `${S()}第一行\n第二行${E()}\n第三行`);
});

test("across paragraphs: note sits on the end marker", () => {
  const out = annotate("段一\n\n段二\n\n段三", "段一\n\n段二");
  assert.equal(out, `${S()}段一\n\n段二${E()}\n\n段三`);
  const anns = C.lire(out);
  assert.equal(anns.length, 1);
  assert.equal(anns[0].note, "N");
});

test("start marker moves past list / heading prefixes", () => {
  const doc = "# 标题\n- 条目一\n- [ ] 条目二\n1. 条目三";
  const out = annotate(doc, doc);
  assert.equal(out, `# ${S()}标题\n- 条目一\n- [ ] 条目二\n1. 条目三${E()}`);
});

test("selection starting at a line start including the bullet", () => {
  const doc = "前\n- 条目";
  const from = doc.indexOf("- 条目");
  const out = C.appliquer(doc, C.entourer(doc, from, doc.length, "N", "k1"));
  assert.equal(out, `前\n- ${S()}条目${E()}`);
});

test("code fences, tables and hr never hold a marker", () => {
  const doc = "```js\nlet a = 1\n```\n\n| a | b |\n|---|---|\n\n---\n\n正文";
  const out = annotate(doc, doc);
  assert.equal(out, doc.replace("正文", `${S()}正文${E()}`));
});

test("selection starting inside a code fence", () => {
  const doc = "```\ncode line\n```\n正文";
  const from = doc.indexOf("code line");
  const out = C.appliquer(doc, C.entourer(doc, from, doc.length, "N", "k1"));
  assert.equal(out, `\`\`\`\ncode line\n\`\`\`\n${S()}正文${E()}`);
});

test("selection inside a code block annotates the whole block, code untouched", () => {
  const doc = "前文\n```js\nlet a = 1\n```\n后文";
  const from = doc.indexOf("let");
  const out = C.appliquer(doc, C.entourer(doc, from, from + 3, "N", "k1"));
  assert.equal(out, `前文\n\n${S()}\n\n\`\`\`js\nlet a = 1\n\`\`\`\n\n${E()}\n后文`);
  const [a] = C.lire(out);
  assert.ok(out.slice(a.textFrom, a.textTo).includes("let a = 1"));
});

test("selection inside one table cell is annotated", () => {
  const doc = "| 名称 | 说明 |\n|---|---|\n| 甲 | 这是说明 |";
  const out = annotate(doc, "这是说明");
  assert.equal(out, `| 名称 | 说明 |\n|---|---|\n| 甲 | ${S()}这是说明${E()} |`);
});

test("table: selection across cells or the separator row is not annotated", () => {
  const doc = "| 甲 | 乙 |\n|---|---|\n| 1 | 2 |";
  assert.equal(C.entourer(doc, 2, 7, "N", "k1"), null);
  assert.equal(C.entourer(doc, doc.indexOf("---"), doc.indexOf("---") + 3, "N", "k1"), null);
});

test("pipes in a note are escaped so tables keep working", () => {
  const out = annotate("| a |\n|---|\n| b |", "b", "x|y");
  assert.ok(!out.split("\n")[2].slice(2).replace(/ \|$/, "").includes("|"));
  assert.equal(C.lire(out)[0].note, "x|y");
});

test("trailing whitespace stays outside the end marker", () => {
  const out = annotate("你好世界  \n下一行", "你好世界  ");
  assert.equal(out, `${S()}你好世界${E()}  \n下一行`);
});

test("note escaping round-trips and stays on one line", () => {
  const note = '含"引号" & <尖括号> [[链接]] $x$ 100% #标签 ==高亮== `代码`\n第二行';
  const enc = C.encoder(note);
  assert.ok(!/["<>\n\[\]$%#=`]/.test(enc.replace(/&#\d+;/g, "")), "no raw specials left");
  assert.equal(C.decoder(enc), note);
  const out = annotate("正文", "正文", note);
  assert.equal(C.lire(out)[0].note, note);
  assert.equal(out.split("\n").length, 1);
});

test("parse: ranges, text and excerpt", () => {
  const out = annotate("甲 **乙**\n\n丙", "甲 **乙**\n\n丙", "备注");
  const [a] = C.lire(out);
  assert.equal(a.id, "k1");
  assert.equal(out.slice(a.textFrom, a.textTo), "甲 **乙**\n\n丙");
  assert.equal(C.extrait(out, a), "甲 乙 丙");
});

test("C.trouverA / C.trouverParId", () => {
  const out = annotate("甲\n\n乙\n\n丙", "甲\n\n乙", "N");
  assert.equal(C.trouverA(out, out.indexOf("乙")).id, "k1");
  assert.equal(C.trouverA(out, out.indexOf("丙")), null);
  assert.equal(C.trouverParId(out, "k1").id, "k1");
  assert.equal(C.trouverParId(out, "zz"), null);
});

test("update note and color, then remove restores the original", () => {
  const doc = "甲\n\n乙";
  const out = annotate(doc, doc, "旧");
  const ann = C.lire(out)[0];
  const edited = C.appliquer(out, C.changementsMaj(ann, { note: "新", couleur: "blue" }));
  const [b] = C.lire(edited);
  assert.equal(b.note, "新");
  assert.equal(b.couleur, "blue");
  assert.ok(edited.includes(S("k1", "blue")));
  assert.equal(C.appliquer(edited, C.changementsRetrait(b)), doc);
});

test("orphan markers are ignored; unknown color falls back", () => {
  const doc = `${S("a1")}只有开头 ${E("x", "b2", "weird")}`;
  assert.equal(C.lire(doc).length, 0);
  const ok = `${S("c3")}文${E("x", "c3", "weird")}`;
  assert.equal(C.lire(ok)[0].couleur, "yellow");
});

test("overlapping annotations are independent", () => {
  const first = annotate("一二三四五", "二三四", "A", "a1");
  const second = annotate(first, first, "B", "b2");
  const ids = C.lire(second).map((a) => a.id).sort();
  assert.deepEqual(ids, ["a1", "b2"]);
  const b = C.lire(second).find((a) => a.id === "b2");
  assert.equal(C.appliquer(second, C.changementsRetrait(b)), first);
});

test("C.decalageLigne", () => {
  assert.equal(C.decalageLigne("ab\ncd\nef", 0), 0);
  assert.equal(C.decalageLigne("ab\ncd\nef", 2), 6);
  assert.equal(C.decalageLigne("ab", 5), 2);
});

test("meta: time, author, resolved and replies round-trip", () => {
  const meta = {
    auteur: "李羡阳",
    heure: "2026-10-09 13:36",
    resolu: true,
    reponses: [{ auteur: "我", heure: "2026-10-09 13:37", texte: '回复 "一" [[x]]\n第二行' }],
  };
  const doc = "正文";
  const out = C.appliquer(doc, C.entourer(doc, 0, 2, "首次批注", "k1", "blue", meta));
  const [a] = C.lire(out);
  assert.equal(a.note, "首次批注");
  assert.equal(a.auteur, "李羡阳");
  assert.equal(a.heure, "2026-10-09 13:36");
  assert.equal(a.resolu, true);
  assert.deepEqual(a.reponses, meta.reponses);
  assert.ok(!out.includes('[['), "reply text must not leak raw wiki-link syntax");
});

test("update keeps meta; toggling resolved and adding a reply", () => {
  const doc = C.appliquer("正文", C.entourer("正文", 0, 2, "N", "k1", "yellow", { auteur: "A", heure: "T" }));
  const a = C.lire(doc)[0];
  const next = C.appliquer(doc, C.changementsMaj(a, { resolu: true, reponses: [{ auteur: "B", heure: "T2", texte: "r" }] }));
  const b = C.lire(next)[0];
  assert.equal(b.auteur, "A");
  assert.equal(b.heure, "T");
  assert.equal(b.resolu, true);
  assert.equal(b.reponses.length, 1);
  assert.equal(C.lire(C.appliquer(next, C.changementsMaj(b, { resolu: false })))[0].resolu, false);
});

test("legacy annotation without meta parses with defaults", () => {
  const [a] = C.lire(`${S()}x${E()}`);
  assert.equal(a.heure, "");
  assert.equal(a.resolu, false);
  assert.deepEqual(a.reponses, []);
});

test("no selection: line, table cell and code block under the cursor", () => {
  const doc = "第一行文字\n\n| 甲 | 乙乙 |\n|---|---|\n\n```\ncode\n```";
  const at = (needle, d = 0) => C.plageAuCurseur(doc, doc.indexOf(needle) + d);
  const line = at("第一行");
  assert.equal(doc.slice(line.from, line.to), "第一行文字");
  const cell = at("乙乙", 1);
  assert.equal(doc.slice(cell.from, cell.to).trim(), "乙乙");
  const first = at("甲");
  assert.equal(doc.slice(first.from, first.to).trim(), "甲");
  const code = at("code", 2);
  assert.ok(doc.slice(code.from, code.to).startsWith("```"));
  assert.equal(C.plageAuCurseur(doc, doc.indexOf("\n\n") + 1), null);
  assert.equal(C.plageAuCurseur(doc, doc.indexOf("---") + 1), null);
});

const CALLOUT = "前文\n\n> [!abstract] 一句话定位\n> 杨杰是一名**面向农业**与现代\n> 畜牧业的负责人,关注[规则](http://x.y)。\n\n后文 面向农业";

test("C.blocAutour: the non-blank lines around an offset", () => {
  const b = C.blocAutour(CALLOUT, CALLOUT.indexOf("杨杰"));
  assert.equal(CALLOUT.slice(b.from, b.to), "> [!abstract] 一句话定位\n> 杨杰是一名**面向农业**与现代\n> 畜牧业的负责人,关注[规则](http://x.y)。");
  assert.deepEqual(C.blocAutour("abc", 0), { from: 0, to: 3 });
  assert.deepEqual(C.blocAutour("\nabc", 2), { from: 1, to: 4 });
});

test("rendered selection maps back to the source, skipping markup and quote prefixes", () => {
  const block = C.blocAutour(CALLOUT, CALLOUT.indexOf("杨杰"));
  const src = CALLOUT.slice(block.from, block.to);
  const find = (rendered) => C.trouverTexteRendu(src, rendered).map((r) => src.slice(r.from, r.to));

  assert.deepEqual(find("杨杰是一名"), ["杨杰是一名"]);
  // bold marks inside the range stay in the source slice
  assert.deepEqual(find("面向农业与现代"), ["面向农业**与现代"]);
  // soft line break + blockquote prefix between the two source lines
  assert.deepEqual(find("与现代\n畜牧业"), ["与现代\n> 畜牧业"]);
  // link text without its target
  assert.deepEqual(find("关注规则。"), ["关注[规则](http://x.y)。"]);
  // the callout title renders without "[!abstract]"
  assert.deepEqual(find("一句话定位"), ["一句话定位"]);
  // 💬 buttons and whitespace in the DOM text are ignored
  assert.deepEqual(find(" 杨杰 是一名💬"), ["杨杰是一名"]);
  assert.deepEqual(find("不存在的文字"), []);
});

test("rendered selection can be annotated through C.entourer", () => {
  const [hit] = C.trouverTexteRendu(CALLOUT, "与现代\n畜牧业的负责人");
  const out = C.appliquer(CALLOUT, C.entourer(CALLOUT, hit.from, hit.to, "N", "k1"));
  const [a] = C.lire(out);
  assert.equal(out.slice(a.textFrom, a.textTo), "与现代\n> 畜牧业的负责人");
  assert.ok(out.includes(`${S()}与现代\n> 畜牧业的负责人${E()}`));
});

test("repeated texte: C.occurrencesAvant picks the right hit", () => {
  const src = "> 重复 一 重复 二 重复";
  const hits = C.trouverTexteRendu(src, "重复");
  assert.equal(hits.length, 3);
  const rendered = C.texteCompact("重复 一 重复 二 重复");
  const nth = C.occurrencesAvant(rendered, "重复", C.texteCompact("重复 一 ").length);
  assert.equal(nth, 1);
  assert.equal(hits[nth].from, src.indexOf("重复", src.indexOf("重复") + 1));
});

test("code fences inside a callout: fence lines are not part of the rendered text", () => {
  const src = "> [!note]\n> ```js\n> let a_b = 1;\n> ```";
  const [hit] = C.trouverTexteRendu(src, "let a_b = 1;");
  assert.equal(src.slice(hit.from, hit.to), "let a_b = 1;");
});

test('export Word : le commentaire devient un commentaire Word sur le même passage', () => {
  const { preparerMarkdownExport } = Ariane._test;
  const doc = C.appliquer('Un passage commenté.', C.entourer('Un passage commenté.', 3, 10, 'Note « x »', 'k1', 'blue',
    { auteur: 'Elliot', heure: '2026-10-31 14:20' }));
  assert.ok(doc.includes('ann-s'));
  const sortie = preparerMarkdownExport(doc, () => null);
  assert.ok(!sortie.includes('ann-'), sortie);
  assert.equal(sortie, 'Un [Note «\u00a0x\u00a0»]{.comment-start id="0" author="Elliot" date="2026-10-31T14:20:00Z"}'
    + 'passage[]{.comment-end id="0"} commenté.');
  // Sans commentaire, le passage reste seul.
  assert.equal(preparerMarkdownExport(doc, () => null, { commentaires: 'aucun' }), 'Un passage commenté.');
});

test('export Word : réponses en fil, résolus marqués ou écartés', () => {
  const { preparerMarkdownExport } = Ariane._test;
  const base = 'Premier passage. Second passage.';
  let doc = C.appliquer(base, C.entourer(base, 0, 7, 'À revoir', 'k1', 'yellow', {
    auteur: 'Elliot', heure: '2026-10-31 14:20',
    reponses: [{ auteur: 'Claude', heure: '2026-10-31 15:00', texte: 'Fait.' }],
  }));
  const i = doc.indexOf('Second');
  doc = C.appliquer(doc, C.entourer(doc, i, i + 6, 'Clos', 'k2', 'blue', { auteur: 'Elliot', resolu: true }));
  const fils = [];
  const s = preparerMarkdownExport(doc, () => null, { fils, auteurCommentaires: 'Moi' });
  assert.equal(s, '[À revoir]{.comment-start id="0" author="Elliot" date="2026-10-31T14:20:00Z"}'
    + '[Fait.]{.comment-start id="1" author="Claude" date="2026-10-31T15:00:00Z"}'
    + 'Premier[]{.comment-end id="0"}[]{.comment-end id="1"} passage. '
    + '[Clos]{.comment-start id="2" author="Elliot"}Second[]{.comment-end id="2"} passage.');
  assert.deepEqual(fils, [
    { id: 0, parent: null, fait: false },
    { id: 1, parent: 0, fait: false },
    { id: 2, parent: null, fait: true },
  ]);
  const ouverts = preparerMarkdownExport(doc, () => null, { commentaires: 'ouverts' });
  assert.ok(ouverts.includes('comment-start id="1"') && !ouverts.includes('Clos'), ouverts);
  assert.ok(!ouverts.includes('ann-'));
});

test('export Word : texte du commentaire inerte, commentaire tombé avec son titre', () => {
  const { preparerMarkdownExport, texteCommentaireWord } = Ariane._test;
  assert.equal(texteCommentaireWord('Voir [[@adner2017|Adner]] et @x [y]\nsuite *ici*', false),
    'Voir Adner et \\@x \\[y\\]\\\nsuite \\*ici\\*');
  // L'auteur porte des guillemets : l'attribut reste bien formé.
  const base = 'Texte.';
  const doc = C.appliquer(base, C.entourer(base, 0, 5, 'N', 'k1', 'yellow', { auteur: 'A "B"' }));
  assert.match(preparerMarkdownExport(doc, () => null), /author="A \\"B\\""/);
  // Un commentaire qui court du titre « # » (retiré) au corps ne laisse rien.
  const t = '# Titre\n\nCorps.';
  const d2 = C.appliquer(t, C.entourer(t, 2, t.length - 1, 'N', 'k1', 'yellow'));
  assert.equal(preparerMarkdownExport(d2, () => null), 'Corps.');
});

test('heure lisible : à la façon d’Obsidian, l’heure exacte gardée en infobulle', () => {
  const n = new Date(2026, 9, 31, 18, 30);
  assert.equal(C.heureLisible('2026-10-31 18:30', n), 'à l’instant');
  assert.equal(C.heureLisible('2026-10-31 18:05', n), 'il y a 25 min');
  assert.equal(C.heureLisible('2026-10-31 14:10', n), 'il y a 4 h');
  assert.equal(C.heureLisible('2026-10-30 09:15', n), 'hier, 09:15');
  assert.equal(C.heureLisible('2026-10-12 14:20', n), '12 oct., 14:20');
  assert.equal(C.heureLisible('2025-03-02 08:00', n), '2 mars 2025, 08:00');
  assert.equal(C.heureLisible('vers midi', n), 'vers midi');
});

test('brouillon : ses positions suivent la note, dans la seule vue que suit le volet', () => {
  const { GestionCommentairesMarge } = Ariane._test;
  const cm = {};
  const greffon = { _comBrouillon: { from: 10, to: 20 } };
  const m = new GestionCommentairesMarge(greffon);
  m.panneau = { vue: { editor: { cm } } };
  // Trois caractères insérés en tête de note.
  const changes = { mapPos: (p) => p + 3 };
  m.suivreBrouillon({}, changes);
  assert.deepEqual([greffon._comBrouillon.from, greffon._comBrouillon.to], [10, 20], 'une autre vue : rien');
  m.suivreBrouillon(cm, changes);
  assert.deepEqual([greffon._comBrouillon.from, greffon._comBrouillon.to], [13, 23]);
});

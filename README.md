# Ariane

> **Written by vibe coding with Claude.** This plugin was designed and written
> in conversation with Claude (Anthropic), from the real needs of a doctoral
> student. I am not a developer. I describe what I need, I test, I correct, and
> the code takes shape through the exchange. I say this up front, out of
> honesty, so you know what you are installing. The code is readable, commented,
> and has no dependency: a single `main.js` file, no TypeScript, no bundler, no
> `npm`.
>
> *Français : voir [README.fr.md](README.fr.md).*

**Ariane is the downstream companion of [ZotFlow](https://github.com/zotflow/zotflow).**
ZotFlow brings Zotero into Obsidian: references, attachments, annotations,
notes. Ariane picks up from there and works that material. It atomises it,
links it, cites it and exports it. Without ZotFlow, Ariane has nothing to work
on.

Interface available in **English and French**.

---

## What Ariane does

### Atomise
Every Zotero annotation becomes a standalone note with a stable identity that
survives regeneration. **Zotero child notes**, the ones attached to the whole
reference rather than to a single passage, become "reading notes" in their own
right, citable and linked back to their source.

### Cite Zotero, live
Citations are written in plain sight inside your notes:

```
([[KEY|Dresch et al., 2015, p. 63]] ; [[OTHER|Gibbons, 1994, p. 12]])
```

Ariane maintains the apparatus for **secondary sources**, as in "X, Y and Z, as
cited in Dupont, 2020". It can fold citations into a small badge when they
clutter the reading, and it builds the bibliography at the end of the note.

### Suggest
A side panel proposes the closest notes as you write. Three engines to choose
from: lexical (no dependency), semantic (local embeddings) or hybrid. Works with
**Ollama or LM Studio**, locally, offline, free of charge. Reranking by a
language model stays on demand, and it is bounded in both time and length so
your machine does not start roaring.

### Export to Word
The hardest part, and the most polished: a `.docx` export **with live Zotero
fields**, not frozen text. Reopen the document in Word, click Refresh, and
Zotero redoes the formatting.

Layout is **driven by your own Word template**, not by the code. You place
tokens in it, the plugin fills them in:

| Token | Filled with |
|---|---|
| `{{titre}}` | the note title |
| `{{dossier}}` | its folder, without any leading number |
| `{{date}}` `{{date:long}}` | its creation date |
| `{{réf}}` | its reference |
| `{{propriété:key}}` | a named property |
| `{{propriétés.nom}}` / `{{propriétés.valeur}}` | a row repeated for each property |
| `{{encadré.titre}}` / `{{encadré.contenu}}` | your `> [!info]` callouts |

Move a token, add a row, change a style: all of that happens in Word, without
touching the code. A command checks that your template is still understood.

### Track time
Time spent in each note, in minutes, written back to a property. It pauses on
its own as soon as the keyboard goes quiet or the window loses focus.

### And more
draw.io diagrams mirrored into their notes, drag and drop an annotation to
insert it as a citation, per source bibliographies, attachment of cited
references, merging of duplicate authors.

---

## Fitting your own organisation

Ariane assumes nothing about your vault. You describe your **note families** in
the settings, giving each a label, one or more folders, an optional filename
prefix, and what Ariane should do with them. No note type is named in the code.

One button proposes the families found in your vault and **guesses their
prefixes**. Another detects which folders play each functional role.

You can **export your settings profile** to share it. Paths specific to your
machine never travel with it, and an imported profile never overwrites them.

---

## Installing

Ariane is not in the official Obsidian catalogue. Two ways in:

**With BRAT** (recommended, automatic updates)
1. install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin;
2. run the command "BRAT: Add a beta plugin for testing";
3. paste `Liotou/obsidian-ariane`.

BRAT follows the releases of this repository and offers you updates.

**By hand**
Download `main.js`, `manifest.json` and `styles.css` from the
[latest release](../../releases/latest) and drop them into
`YourVault/.obsidian/plugins/zotflow-atomiser/`.

### For the Word export
- [pandoc](https://pandoc.org/);
- the Lua filter from [Better BibTeX](https://retorque.re/zotero-better-bibtex/)
  (`pandoc-zotero-live-citemarkers.lua`);
- Zotero running, with Better BibTeX;
- your own `.docx` template carrying the tokens.

### For semantic suggestions
[Ollama](https://ollama.com/) or [LM Studio](https://lmstudio.ai/), with an
embedding model. `bge-m3` handles French well.

---

## Thanks

**[ZotFlow](https://github.com/zotflow/zotflow)** first and foremost. Ariane
would be nothing without it. ZotFlow is what makes Zotero live inside Obsidian,
and everything Ariane does starts from what ZotFlow puts there. Thank you to the
people who built it.

Thanks as well to [Better BibTeX](https://retorque.re/zotero-better-bibtex/) and
its pandoc filter, without which live citations in Word would remain wishful
thinking.

---

## Licence

MIT, see [LICENSE](LICENSE).

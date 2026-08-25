# Ariane

> 🤖 **Written by vibe coding with Claude.** This plugin was designed and written
> in conversation with Claude (Anthropic), from the real needs of a doctoral
> student. I am not a developer. I describe what I need, I test, I correct, and
> the code takes shape through the exchange. I say this up front, out of
> honesty, so you know what you are installing. The code is readable, commented,
> and has no dependency: a single `main.js` file, no TypeScript, no bundler, no
> `npm`.
>
> *Français : voir [README.fr.md](README.fr.md).*

🔗 **Ariane is the downstream companion of [ZotFlow](https://github.com/zotflow/zotflow).**
ZotFlow brings Zotero into Obsidian: references, attachments, annotations,
notes. Ariane picks up from there and works that material. It atomises it,
links it, cites it and exports it. Without ZotFlow, Ariane has nothing to work
on.

🌍 Interface available in **English and French**.

---

## 🧭 Table of contents

- [⚛️ Atomising](#-atomising)
- [🔖 Citing Zotero, live](#-citing-zotero-live)
- [🖱️ Drag and drop](#-drag-and-drop)
- [🪗 Folding citations](#-folding-citations)
- [🏷️ The aside](#-the-aside)
- [✨ Suggestions](#-suggestions)
- [↩️ Back to Zotero](#-back-to-zotero)
- [📚 Bibliographies](#-bibliographies)
- [⏳ Pending references](#-pending-references)
- [👥 Authors](#-authors)
- [📝 Exporting to Word](#-exporting-to-word)
- [⏱️ Tracking time](#-tracking-time)
- [🧹 Housekeeping tools](#-housekeeping-tools)
- [🗂️ Fitting your own organisation](#-fitting-your-own-organisation)
- [⌨️ Commands](#-commands)
- [📦 Installing](#-installing)

---

## ⚛️ Atomising

Every Zotero annotation becomes a standalone note with a stable identity that
survives regeneration. Rename the note, edit its paraphrase, move it: the link
to the source holds.

**Zotero child notes**, the ones attached to the whole reference rather than to
a single passage, become reading notes in their own right, citable and linked
back to their source. The Zotero citations they contain are converted into
Ariane citations along the way, so they feed your bibliography like any other.

Three behaviours you can turn on or off:

- **regeneration**: when the source changes, the annotations are rebuilt;
- **deletion propagation**: when an annotation disappears from Zotero, its note
  is deleted and its links are removed. This one is destructive, and off by
  default;
- **locking**: generated notes carry `locked: true` and cannot be edited by
  accident.

Annotations that no note ever cites can be **tagged** automatically, which lets
you colour them in the graph and see at a glance what you have read but never
used.

## 🔖 Citing Zotero, live

Citations are written in plain sight inside your notes:

```
([[KEY|Dresch et al., 2015, p. 63]] ; [[OTHER|Gibbons, 1994, p. 12]])
```

The label is produced from a template you control, for example
`{{auteurs}}, {{annee}}, p. {{page}}`. The citation goes before the closing
punctuation, as French typography wants.

**Secondary sources.** When an annotation reports a work you have not read
yourself, Ariane writes it as "Fan et al., 2022 and Stål et al., 2023, as cited
in Raizada & Sinha, 2025, p. 1". Several works reported by the same source are
gathered into a single citation, so the reference style cannot collapse the
author name of the second one. If the reported work is itself in Zotero, it is
cited directly instead, since you can read it.

Rather than naming every reported work in the running text, the source can carry
a **counter** instead, and hovering it shows them as clickable links.

## 🖱️ Drag and drop

This is the fastest way to cite while writing.

![Dragging annotations onto a sentence, which inserts the citations inline and builds the bibliography](docs/drag-and-drop.gif)

**Drag an annotation, or a source, onto a sentence.** Its reference is inserted
inline, in brackets, before the closing punctuation. You never leave the
keyboard flow for more than a second.

In the recording above, three annotations are dropped one after another onto the
same sentence. Each one inserts its citation before the full stop, and the
bibliography at the end of the note builds itself as they arrive.

The target follows your cursor: hovering the **text** places the citation at the
end of the sentence under the pointer, hovering the **left margin** of the
paragraph places it at the end of the paragraph. The area being targeted is
highlighted while you drag, so you see where it will land before you let go.

The **annotation basket**, opened from the ribbon, lets you gather several
annotations as you read and drop them one after another when you write.

Two details that took some work:

- reusing a citation is a **copy**, never a move. Without forcing that, the
  editor would remove the citation from the paragraph it came from;
- a link rendered outside a markdown view arrives with an empty payload, so
  Ariane records the dragged item at the moment the drag starts, which is the
  only reliable moment.

You can choose whether any note may be dropped or only annotations, and whether
Ariane tells you when a dropped item matches nothing in the vault, rather than
silently doing nothing.

## 🪗 Folding citations

A long citation can crowd the reading. Fold it, and it gives way to a small
badge carrying the number of references it holds.

- click the badge to unfold that one citation;
- use the commands, or the ribbon button, to fold or unfold the whole note;
- while editing, a citation unfolds on its own as soon as the cursor enters it,
  and folds again when you leave.

## 🏷️ The aside

Annotation notes are named after their Zotero key, which is unreadable. The
aside prints the note title just after the link, in reading view and while
editing, without changing a single character of your file.

Its format, colour and size are yours to set, and you decide family by family
which notes get one.

The file explorer can also show the **alias instead of the filename**, and
display chosen folders in a **fixed width font**, which makes coded names much
easier to scan. The text itself is untouched, so search and sorting still work.

## ✨ Suggestions

A side panel proposes the closest notes as you write.

Three engines: **lexical** (shared words, no dependency at all), **semantic**
(meaning, through local embeddings) and **hybrid**, which combines the two and
is the recommended choice. Everything runs locally, offline and free of charge,
through **Ollama or LM Studio**.

- filter the panel by note family, with the colour and icon you gave each one;
- **right click a passage** to get suggestions for that passage alone, rather
  than for the whole note;
- **drag a suggestion** straight into your text to cite it;
- the ✨ button reranks the best candidates with a local language model, on
  demand only.

⚡ That last point matters. Reranking is by far the heaviest thing the plugin does,
so it never starts on its own, it is bounded both in answer length and in time,
and nothing is computed at all while the panel is not actually visible.

## ↩️ Back to Zotero

A button in the ZotFlow reader, and a command, take you back to Zotero at the
right place:

- from the **reader**, Zotero opens the same PDF at the page you were on;
- from an **annotation note**, Zotero opens the PDF and scrolls to that very
  highlight;
- from a **source note**, Zotero opens its attachment, or selects the entry if
  there is none.

## 📚 Bibliographies

**At the end of a note.** Ariane collects the sources cited in the body and
maintains a bibliography between two markers, the way Zotero does in Word. The
formatting is the one ZotFlow already produced, so your citation style is
respected. Each entry gets a clickable link placed after it, never around it,
so the italics of the style survive.

Sort by author or by order of appearance, and rebuild in the active note or
across the whole vault.

**Per source.** Ariane can fetch the works a source itself cites, through
Crossref and OpenAlex, and write them into a dedicated note. Give it an email
address and the two services grant you better rate limits.

## ⏳ Pending references

A reference cited by one of your annotations but absent from Zotero is not lost.
Ariane keeps it as a provisional note, and tries to attach it to a real Zotero
entry by author and year.

Certain matches, where only one pairing is possible, are attached without asking
anything. For **ambiguous** cases you choose the behaviour: skip them, let a
local language model decide, or be asked each time. A decision you make by hand
is remembered and never asked again, and you can wipe those memories in one
click.

There is also a command for the classic **2005a and 2005b** problem, where you
link a given reference to the right Zotero entry yourself.

## 👥 Authors

Ariane can keep one note per author, listing their sources. Author names arrive
in many shapes, so a command finds the **duplicates**, groups the variants, and
lets you tick which ones to merge and which entry to keep.

## 📝 Exporting to Word

The hardest part, and the most polished: a `.docx` export **with live Zotero
fields**, not frozen text. Reopen the document in Word, click Refresh, and
Zotero redoes the formatting.

Layout is **driven by your own Word template**, not by the code. You place
tokens in it, the plugin fills them in:

| Token | Filled with |
|---|---|
| `{{titre}}` | the note title |
| `{{dossier}}` | its folder, without any leading number |
| `{{date}}` `{{date:long}}` | its creation date, short or spelled out |
| `{{réf}}` | its reference, from a property or from the filename |
| `{{propriété:key}}` | a named property |
| `{{propriétés.nom}}` / `{{propriétés.valeur}}` | a row repeated for each remaining property |
| `{{encadré.titre}}` / `{{encadré.contenu}}` | your `> [!info]` callouts, wrapped in the frame you designed |

Move a token, add a row, change a style, redesign the frame: all of that happens
in Word. A command **checks your template** and tells you what it found, which
tokens it does not recognise, and which layouts are missing.

Along the way the export also:

- shifts headings by one level, so `##` becomes Heading 1, and strips numbering
  you typed by hand, leaving Word to number on its own;
- turns `> [!info]` callouts into the framed table from your template;
- converts markdown tables, with borders and your own table styles;
- removes the brackets from property values, so `[[Jane Doe]]` comes out as
  `Jane Doe`;
- turns spaces already present before `;` `:` `!` `?` into non breaking ones,
  without ever adding a space, so URLs and clock times stay intact;
- adds the Zotero bibliography field at the end, so you do not have to insert it
  yourself.

⚠️ Requires pandoc, the Better BibTeX Lua filter, and Zotero running.

## ⏱️ Tracking time

Time spent in each note, in minutes, written back to a property.

It pauses on its own as soon as keyboard and mouse go quiet, or the window
loses focus, so it counts actual work rather than presence in front of the
screen. You set how long the silence must last.

The reference total is kept in seconds and the property is only a rounded view
of it, because rounding at every write, starting from an already rounded value,
inflates the total by several percent. Writes are spaced out so your sync stays
quiet, and pending time is never lost.

A **daily journal** can be written automatically when the day turns, and a
status bar item shows the time on the current note, solid while the timer runs
and hollow when paused.

## 🧹 Housekeeping tools

- **Rename a property** across the whole vault. Changing a name in the settings
  only affects future writes, so this carries the old value over to the new one.
  It counts first, and never overwrites a note that already has the new property.
- **Export and import a settings profile**. Paths specific to your machine never
  travel with it, and an imported profile never touches them.
- **Check the Word template**, before an export rather than after.
- **Restore** any generated note that was edited by hand.

## 🗂️ Fitting your own organisation

Ariane assumes nothing about your vault. You describe your **note families** in
the settings, giving each a label, one or more folders, an optional filename
prefix, and what Ariane should do with them: show the title after links, feed
the suggestions, change the look in the file explorer. Rows are reordered by
dragging them. No note type is named in the code.

One button proposes the families found in your vault and **guesses their
prefixes** from the filenames. Another detects which folders play each
functional role, meaning where annotations are filed, where reading notes go,
where exports land, and so on.

## ⌨️ Commands

| Command | What it does |
|---|---|
| Atomise the active source note | one note per annotation |
| Re-atomise every source | the whole vault |
| Reading notes: atomise Zotero child notes | notes attached to the reference itself |
| Citations: fold all, unfold all, fold or unfold | the badges |
| Citations: refresh labels | after changing the citation template |
| Bibliography: rebuild in the active note, or in every note | end of note bibliography |
| Build the cited bibliography of this source, or of every source | through Crossref and OpenAlex |
| Attach pending references to Zotero sources | by author and year |
| Link this reference to a Zotero entry | the 2005a and 2005b case |
| Merge duplicate authors | groups the name variants |
| Open in Zotero | reader, annotation or source |
| Check the Word template | tokens and layouts |
| Export to Word with live Zotero citations | the whole chain |
| Time: write today's journal, write it into the notes now | the timer |
| Annotation basket: show or hide | for drag and drop |
| Annotation suggestions: open the panel, rebuild the index | the side panel |

---

## 📦 Installing

Ariane is not in the official Obsidian catalogue. Two ways in:

**With BRAT** ✅ (recommended, automatic updates)
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

## 🙏 Thanks

**[ZotFlow](https://github.com/zotflow/zotflow)** first and foremost. Ariane
would be nothing without it. ZotFlow is what makes Zotero live inside Obsidian,
and everything Ariane does starts from what ZotFlow puts there. Thank you to the
people who built it.

Thanks as well to [Better BibTeX](https://retorque.re/zotero-better-bibtex/) and
its pandoc filter, without which live citations in Word would remain wishful
thinking.

---

## ⚖️ Licence

MIT, see [LICENSE](LICENSE).

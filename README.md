# Gene Wolfe Scholarship: Citation Graph

A browsable citation graph of secondary scholarship on Gene Wolfe. For each work of criticism it shows which other criticism it cites, formally (in notes, footnotes and works-cited lists) or informally (when the prose names another critic). It also shows which of Wolfe's books each work discusses.

The site is static: open `index.html` through any web server, or browse it on GitHub Pages.

## What's here

| Path | Contents |
|---|---|
| `index.html`, `app.js`, `style.css` | the browser app (D3 for the graph view, marked for the reports; both bundled in `lib/`) |
| `data/works.json` | works: title, authors, year, container, flags (in corpus, in bibliography, about Wolfe) |
| `data/authors.json` | author IDs and display names |
| `data/cites.json` | one row per citation or mention: citing work, cited work and authors, page, locator, a context under 50 words, method, confidence, match status |
| `data/episodes.json` | short passages discussing selected embedded stories (Cyriaca, Talos's play, the Brown Book, the lazaret contest) |
| `data/missing.json` | works cited in the corpus but absent from the project bibliography |
| `data/wanted.json` | works whose full text is still being sought (the **Wanted** page), with status |
| `lib/` | bundled copies of D3 v7 and marked v12 (no CDN needed) |
| `reports/*.md` | centrality, orphans, attention to Wolfe's works, timeline |

## How it was made

- **Text:** the corpus was OCR'd with marker/surya.
- **Formal references:** notes and bibliographies were parsed with GROBID and rule-based extractors.
- **Messy notes and informal mentions:** discursive notes were re-parsed, and informal mentions extracted, with Claude (Anthropic). Mentions include stance: agrees, disagrees, builds on, or neutral.
- **Matching:** references were matched to a curated bibliography with fuzzy title and author matching. Uncertain matches were sent for human review.
- **Provenance:** every link records its method, its confidence, and the page of the citing work. Fields that could not be read are left blank, never guessed.

## What is *not* here

The corpus itself is copyrighted and private. This repository holds only bibliographic metadata, graph structure, page numbers, and citation contexts of under 50 words. It contains no full text, OCR output, or raw notes.

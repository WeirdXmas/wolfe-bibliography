"use strict";
// Static citation-graph browser. Data: data/*.json written by scripts/export_site.py.
const D = {};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const $ = s => document.querySelector(s);
const EPISODES = {cyriaca: "Cyriaca's story", talos_play: "Talos's play", brown_book: "The Brown Book tales",
                  lazaret_contest: "The lazaret storytelling contest"};
const STANCE = {agrees: "agrees", disagrees: "disagrees", builds_on: "builds on", neutral: "neutral", unclear: ""};

async function load() {
  const names = ["works", "authors", "cites", "episodes", "missing", "wanted", "catalog", "wolfe", "meta"];
  const got = await Promise.all(names.map(n => fetch(`data/${n}.json`).then(r => r.json())));
  names.forEach((n, i) => D[n] = got[i]);
  D.inc = {}; D.out = {}; D.aCites = {}; D.byAuthor = {};
  for (const c of D.cites) {
    if (c.t) (D.inc[c.t] ||= []).push(c);
    (D.out[c.f] ||= []).push(c);
    if (!c.t) for (const a of c.a) (D.aCites[a] ||= []).push(c);
  }
  for (const [id, w] of Object.entries(D.works)) {
    w.id = id;
    const inc = D.inc[id] || [];
    w.ncw = new Set(inc.map(c => c.f)).size;
    w.nc = inc.filter(c => c.k === "c").length;
    w.nm = inc.filter(c => c.k === "m").length;
    w.nout = new Set((D.out[id] || []).map(c => c.t).filter(Boolean)).size;
    for (const a of w.a) (D.byAuthor[a] ||= []).push(w);
  }
  D.critics = Object.entries(D.authors).map(([id, name]) => {
    const ws = (D.byAuthor[id] || []).filter(w => w.k !== "wolfe_primary");
    const citing = new Set();
    ws.forEach(w => (D.inc[w.id] || []).forEach(c => citing.add(c.f)));
    (D.aCites[id] || []).forEach(c => citing.add(c.f));
    return {id, name, nworks: ws.length, ncw: citing.size, ment: (D.aCites[id] || []).length +
            ws.reduce((s, w) => s + w.nm, 0), corpus: ws.some(w => w.inc)};
  }).filter(c => c.id !== "wolfe_g" || true);
  prepCatalog();
  window.addEventListener("hashchange", route);
  setupSearch();
  route();
}

// ---------- helpers
const wlink = id => { const w = D.works[id]; return w ? `<a href="#/work/${encodeURIComponent(id)}">${esc(w.ti || "(untitled)")}</a>` : esc(id || "?"); };
const alink = id => D.authors[id] ? `<a href="#/critic/${encodeURIComponent(id)}">${esc(D.authors[id])}</a>` : "";
const byline = w => w.a.map(alink).filter(Boolean).join(", ");
function badges(w) {
  let b = "";
  if (w.k === "wolfe_primary") b += `<span class="badge wolfe">Wolfe</span>`;
  if (w.inc) b += `<span class="badge corpus">in corpus</span>`;
  if (w.bib) b += `<span class="badge bib">in bibliography</span>`;
  return b;
}
const workLine = w => `${wlink(w.id)} <span class="muted small">${esc(byline(w).replace(/<[^>]+>/g, ""))}${w.y ? " · " + esc(w.y) : ""}</span> ${badges(w)}`;

function table(rows, cols, opts = {}) {
  const id = "t" + Math.random().toString(36).slice(2);
  let key = opts.sort ?? cols.findIndex(c => c.n), dir = -1, limit = opts.limit || 200;
  const render = () => {
    const sorted = rows.slice().sort((a, b) => { const x = cols[key].s(a), y = cols[key].s(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir; });
    $("#" + id).innerHTML = `<table><thead><tr>${cols.map((c, i) => `<th data-i="${i}" class="${c.n ? "n" : ""}">${c.h}${i === key ? (dir < 0 ? " ▾" : " ▴") : ""}</th>`).join("")}</tr></thead>
      <tbody>${sorted.slice(0, limit).map(r => `<tr>${cols.map(c => `<td class="${c.n ? "n" : ""}">${c.f(r)}</td>`).join("")}</tr>`).join("")}</tbody></table>
      ${sorted.length > limit ? `<p class="small muted">${limit} of ${sorted.length} shown. <a href="#" data-more>show all</a></p>` : ""}`;
    $("#" + id).querySelectorAll("th").forEach(th => th.onclick = () => { const i = +th.dataset.i;
      dir = i === key ? -dir : (cols[i].n ? -1 : 1); key = i; render(); });
    const more = $("#" + id).querySelector("[data-more]");
    if (more) more.onclick = e => { e.preventDefault(); limit = 1e9; render(); };
  };
  setTimeout(render);
  return `<div id="${id}"></div>`;
}

function citeCard(c, side) {
  const head = side === "none" ? "" : side === "from" ? wlink(c.f) : (c.t ? wlink(c.t) : c.a.map(alink).join(", ") + ` <span class="muted small">(critic named, no specific work)</span>`);
  const bits = [];
  if (c.p != null) bits.push(`p. ${esc(c.p)} of the citing work`);
  if (c.l) bits.push(`cites ${esc(c.l)}`);
  bits.push(c.k === "m" ? `informal mention${c.mt ? " (" + esc(c.mt.replace("_", " ")) + ")" : ""}` : "formal citation");
  if (c.st && STANCE[c.st]) bits.push(`stance: ${STANCE[c.st]}`);
  bits.push(`${esc(c.me)}${c.cf != null ? ", conf. " + c.cf : ""}${c.ms && c.ms !== "exact" ? ", match " + esc(c.ms) : ""}`);
  return `<div class="cite">${head}${c.k === "m" ? '<span class="badge mention">mention</span>' : ""}
    ${c.x ? `<div class="ctx">“${esc(c.x)}”</div>` : ""}<div class="src">${bits.join(" · ")}</div></div>`;
}

function grouped(list, keyf, side) {
  const g = {};
  list.forEach(c => (g[keyf(c)] ||= []).push(c));
  return Object.entries(g).sort((a, b) => b[1].length - a[1].length).map(([k, cs]) => {
    const target = side === "from" ? cs[0].f : cs[0].t;
    const title = target ? wlink(target) : cs[0].a.map(alink).join(", ") + " <span class='muted small'>(no specific work)</span>";
    return `<details ${cs.length < 4 ? "open" : ""}><summary><b>${title}</b> <span class="muted small">${cs.length} reference${cs.length > 1 ? "s" : ""}</span></summary>
      ${cs.sort((a, b) => (a.p ?? 0) - (b.p ?? 0)).map(c => citeCard(c, "none")).join("")}</details>`;
  }).join("");
}


// ---------- catalogue (search + by Wolfe work)
let Q = {};
const TYPES = {article: "Article / chapter", book: "Book", review: "Review", interview: "Interview", thesis: "Thesis",
               web: "Web / Substack", other: "Other / unknown"};
const SRC = {corpus: "Full text in our collection", bibliography: "In the bibliography", cited: "Known from citations",
             lead: "New lead"};
const WKIND = {novel: "Novels", series: "Novels", omnibus: "Novels", novella: "Stories & novellas",
               story: "Stories & novellas", collection: "Collections, essays & letters", essays: "Collections, essays & letters",
               letters: "Collections, essays & letters"};

function prepCatalog() {
  D.wolfeById = Object.fromEntries(D.wolfe.map(w => [w.id, w]));
  D.wolfeKids = {};
  D.wolfe.forEach(w => { if (w.part) (D.wolfeKids[w.part] ||= []).push(w.id); });
  D.catById = {};
  D.byWolfe = {};
  for (const it of D.catalog) {
    D.catById[it.id] = it;
    it.names = it.a ? it.a.map(a => D.authors[a]).filter(Boolean) : (it.an ? it.an.split(/;\s*/) : []);
    it.wset = new Set();
    for (const [w, p] of it.ww) {
      it.wset.add(w);
      const par = D.wolfeById[w] && D.wolfeById[w].part;
      if (par) it.wset.add(par);
      (D.byWolfe[w] ||= []).push([it, p]);
    }
    it.dec = /^\d{4}/.test(it.y || "") ? it.y.slice(0, 3) + "0s" : "";
    it.ncw = (D.works[it.id] || {}).ncw || 0;
    it.hay = [it.ti, it.names.join(" "), it.v, TYPES[it.ty],
              ...it.ww.map(([w]) => (D.wolfeById[w] || {}).ti), it.sum, ...(it.th || []), ...(it.ap || [])].join(" ").toLowerCase()
              .normalize("NFKD").replace(/[̀-ͯ]/g, "");
  }
}

// every catalogue item that discusses a Wolfe work or one of its volumes: [[item, prominence]]
function aboutWolfe(id) {
  const m = new Map();
  for (const k of [id, ...(D.wolfeKids[id] || [])])
    for (const [it, p] of D.byWolfe[k] || []) m.set(it, Math.max(m.get(it) || 0, p));
  return [...m];
}

const wchip = (w, p) => D.wolfeById[w] ? `<a class="chip${p > 1 ? " main" : ""}" href="#/wolfework/${encodeURIComponent(w)}" title="${p > 1 ? "a main subject" : "also discussed"}">${esc(D.wolfeById[w].ti)}</a>` : "";
function itemTitle(it) {
  if (D.works[it.id]) return `<a href="#/work/${encodeURIComponent(it.id)}">${esc(it.ti || "(untitled)")}</a>`;
  if (it.url) return `<a href="${esc(it.url)}" rel="noopener" target="_blank">${esc(it.ti)}</a> <span class="small muted">↗</span>`;
  return esc(it.ti || "(untitled)");
}
function itemCard(it) {
  const names = it.a ? it.a.map(alink).filter(Boolean).join(", ") : esc(it.an || "");
  const st = it.ft ? `<span class="badge corpus">full text in collection</span>`
    : it.st && it.st !== "wanted" ? `<span class="badge">${esc(it.st.replace("_", " "))}</span>`
    : it.src === "lead" ? `<span class="badge mention">new lead</span>` : it.st === "wanted" ? `<span class="badge">wanted</span>` : "";
  const ww = it.ww.slice().sort((a, b) => b[1] - a[1]);
  return `<div class="item"><div class="it-title">${itemTitle(it)}</div>
    <div class="it-meta">${names || '<span class="muted">author unknown</span>'}${it.y ? " · " + esc(it.y) : ""}${it.v ? ` · <i>${esc(it.v)}</i>` : ""}</div>
    <div class="it-tags"><span class="badge type">${esc(TYPES[it.ty] || it.ty)}</span>${st}${it.bib ? '<span class="badge bib">in bibliography</span>' : ""}
      ${it.ncw ? `<span class="small muted">cited by ${it.ncw} work${it.ncw > 1 ? "s" : ""} in the collection</span>` : ""}</div>
    ${it.sum ? `<div class="it-sum">${esc(it.sum)}</div>` : ""}
    ${it.th && it.th.length ? `<div class="it-th">${it.th.map(t => `<a class="theme" href="#/search?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}${(it.ap || []).length ? `<span class="small muted"> · ${esc(it.ap.join(", "))}</span>` : ""}</div>` : ""}
    ${ww.length ? `<div class="it-wolfe">${ww.slice(0, 8).map(([w, p]) => wchip(w, p)).join("")}${ww.length > 8 ? `<span class="small muted">+${ww.length - 8} more</span>` : ""}</div>` : ""}
  </div>`;
}

function wolfeOptions(sel) {
  const groups = {};
  D.wolfe.filter(w => aboutWolfe(w.id).length).forEach(w => (groups[WKIND[w.kind] || "Other"] ||= []).push(w));
  return `<option value="">any Wolfe work</option>` + Object.entries(groups).map(([g, ws]) =>
    `<optgroup label="${g}">${ws.sort((a, b) => (a.y || "").localeCompare(b.y || "")).map(w =>
      `<option value="${w.id}" ${w.id === sel ? "selected" : ""}>${w.part ? "  " : ""}${esc(w.ti)}${w.y ? " (" + esc(w.y) + ")" : ""}</option>`).join("")}</optgroup>`).join("");
}

const NEW_PAGES = {
  search() {
    const venues = {};
    D.catalog.forEach(it => { if (it.v) venues[it.v] = (venues[it.v] || 0) + 1; });
    const decs = [...new Set(D.catalog.map(it => it.dec).filter(Boolean))].sort();
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`;
    return `<h1>Search Wolfe scholarship</h1>
      <p class="small muted">${D.catalog.length} pieces of writing about Gene Wolfe: criticism, reviews, interviews, theses, books and web essays.
      ${D.catalog.filter(i => i.ft).length} are in our collection in full; the rest come from the bibliography, from citations in those works, or from new leads.</p>
      <div class="searchbar"><input id="sq" type="search" placeholder="title, critic, venue, Wolfe work, theme (e.g. memory, catholicism)…" value="${esc(Q.q || "")}" autofocus></div>
      <div class="filters">
        <select id="sw">${wolfeOptions(Q.w)}</select>
        <select id="st"><option value="">any type</option>${Object.entries(TYPES).map(([k, v]) => opt(k, v, Q.t)).join("")}</select>
        <select id="sd"><option value="">any decade</option>${decs.map(d => opt(d, d, Q.d)).join("")}</select>
        <select id="sv"><option value="">any venue</option>${Object.entries(venues).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).map(([v, n]) => opt(v, `${v} (${n})`, Q.v)).join("")}</select>
        <input id="sc" type="text" placeholder="critic" value="${esc(Q.c || "")}" list="critlist">
        <datalist id="critlist">${[...new Set(D.catalog.flatMap(i => i.names))].sort().map(n => `<option value="${esc(n)}">`).join("")}</datalist>
        <select id="ss"><option value="">any source</option>${Object.entries(SRC).map(([k, v]) => opt(k, v, Q.s)).join("")}</select>
        <label><input type="checkbox" id="sf" ${Q.f ? "checked" : ""}> full text only</label>
        <select id="so">${[["rel", "sort: relevance"], ["new", "newest first"], ["old", "oldest first"], ["cited", "most cited"], ["title", "title A–Z"]].map(([k, v]) => opt(k, v, Q.o || "rel")).join("")}</select>
        <a href="#/search" class="small">clear</a>
      </div>
      <p id="scount" class="small muted"></p><div id="sres"></div>`;
  },

  wolfe() {
    const groups = {};
    D.wolfe.filter(w => !w.part || !D.wolfeById[w.part]).forEach(w => (groups[WKIND[w.kind] || "Other"] ||= []).push(w));
    const row = (w, kid) => {
      const n = aboutWolfe(w.id), main = n.filter(([, p]) => p > 1).length, ft = n.filter(([it]) => it.ft).length;
      const pw = D.works["wolfe:" + w.id];
      return `<tr class="${kid ? "kid" : ""}"><td>${n.length ? `<a href="#/wolfework/${encodeURIComponent(w.id)}">${esc(w.ti)}</a>` : esc(w.ti)}</td><td>${esc(w.y)}</td>
        <td class="n">${n.length || ""}</td><td class="n">${main || ""}</td><td class="n">${ft || ""}</td><td class="n">${pw && pw.ncw ? pw.ncw : ""}</td></tr>`;
    };
    return `<h1>Scholarship by Wolfe work</h1>
      <p class="small muted">For each of Wolfe's books and stories: how many pieces in the catalogue discuss it, and how many have it as a main subject.
      For works in our collection this is read from the full text (titles, character names and formal citations); for the others, from their titles.
      Series pages include their volumes.</p>
      ${Object.entries(groups).map(([g, ws]) => `<h2>${g}</h2><table><thead><tr><th>Work</th><th>Year</th><th class="n">Pieces</th><th class="n">Main subject</th><th class="n">Full text</th><th class="n" title="corpus works citing it formally">Cited by</th></tr></thead><tbody>
        ${ws.sort((a, b) => (a.y || "9").localeCompare(b.y || "9")).map(w => row(w) + (D.wolfeKids[w.id] || []).map(k => row(D.wolfeById[k], true)).join("")).join("")}</tbody></table>`).join("")}
      <p class="small"><a href="#/wolfecites">Formal citations of Wolfe's books, and selected episodes →</a></p>`;
  },

  wolfework(id) {
    const w = D.wolfeById[id];
    if (!w) return `<p>Unknown Wolfe work.</p>`;
    const items = aboutWolfe(id).sort((a, b) => b[1] - a[1] || b[0].ft - a[0].ft || (a[0].y || "9").localeCompare(b[0].y || "9"));
    const main = items.filter(([, p]) => p > 1).map(([it]) => it), sec = items.filter(([, p]) => p <= 1).map(([it]) => it);
    const pw = D.works["wolfe:" + id], par = w.part && D.wolfeById[w.part], kids = D.wolfeKids[id] || [];
    const byType = {};
    items.forEach(([it]) => byType[it.ty] = (byType[it.ty] || 0) + 1);
    let eps = "";
    if (id === "botns") {
      const E = {}; D.episodes.forEach(e => (E[e.e] ||= []).push(e));
      eps = `<h2>Episodes</h2><p class="small muted">Passages in the criticism that discuss these embedded stories (keyword search, so some hits are incidental).</p>
        <ul>${Object.entries(EPISODES).map(([k, n]) => `<li>${n}: ${(E[k] || []).length} passages in ${new Set((E[k] || []).map(e => e.w)).size} works</li>`).join("")}</ul>
        <p class="small"><a href="#/wolfecites">Read the passages →</a></p>`;
    }
    return `<p class="small muted"><a href="#/wolfe">By Wolfe work</a>${par ? ` › <a href="#/wolfework/${encodeURIComponent(par.id)}">${esc(par.ti)}</a>` : ""}</p>
      <h1><i>${esc(w.ti)}</i></h1><p class="muted">${esc(w.y)} · ${esc(w.kind)}</p>
      ${kids.length ? `<p class="small">Volumes: ${kids.map(k => `<a href="#/wolfework/${encodeURIComponent(k)}">${esc(D.wolfeById[k].ti)}</a>`).join(" · ")}</p>` : ""}
      <div class="stats">
        <div class="stat"><b>${items.length}</b><span>pieces discuss it</span></div>
        <div class="stat"><b>${main.length}</b><span>as a main subject</span></div>
        <div class="stat"><b>${items.filter(([it]) => it.ft).length}</b><span>full text in collection</span></div>
        ${pw ? `<div class="stat"><b>${pw.ncw}</b><span><a href="#/work/${encodeURIComponent(pw.id)}">cite it formally</a></span></div>` : ""}
      </div>
      <p class="small muted">${Object.entries(byType).map(([t, n]) => `${TYPES[t]}: ${n}`).join(" · ")} · <a href="#/search?w=${encodeURIComponent(id)}">search within these →</a></p>
      ${main.length ? `<h2>Main subject</h2>${main.map(itemCard).join("")}` : ""}
      ${sec.length ? `<h2>Also discussed in</h2>${sec.map(itemCard).join("")}` : ""}
      ${!items.length ? `<p class="muted">Nothing in the catalogue discusses this work yet.</p>` : ""}${eps}`;
  },
};

const NEW_AFTER = {
  search() {
    const ids = ["sq", "sw", "st", "sd", "sv", "sc", "ss", "sf", "so"], keys = ["q", "w", "t", "d", "v", "c", "s", "f", "o"];
    const norm = s => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
    const upd = (push) => {
      const v = Object.fromEntries(ids.map((id, i) => [keys[i], id === "sf" ? ($("#sf").checked ? "1" : "") : $("#" + id).value.trim()]));
      const terms = norm(v.q).split(/\s+/).filter(Boolean), crit = norm(v.c);
      let rows = D.catalog.filter(it => (!v.w || it.wset.has(v.w)) && (!v.t || it.ty === v.t) && (!v.d || it.dec === v.d) &&
        (!v.v || it.v === v.v) && (!v.s || it.src === v.s) && (!v.f || it.ft) &&
        (!crit || it.names.some(n => norm(n).includes(crit))) && terms.every(t => it.hay.includes(t)));
      const score = it => (terms.filter(t => norm(it.ti || "").includes(t)).length * 3) + (it.ft ? 2 : 0) +
        (v.w ? (it.ww.find(([w]) => w === v.w) || [0, 0])[1] * 2 : 0) + Math.log1p(it.ncw);
      const yr = it => +String(it.y || "").slice(0, 4) || 0;
      const S = {rel: (a, b) => score(b) - score(a), new: (a, b) => yr(b) - yr(a), old: (a, b) => (yr(a) || 9999) - (yr(b) || 9999),
                 cited: (a, b) => b.ncw - a.ncw, title: (a, b) => (a.ti || "").localeCompare(b.ti || "")};
      rows = rows.sort(S[v.o || "rel"]);
      $("#scount").textContent = `${rows.length} result${rows.length === 1 ? "" : "s"}${rows.length > 150 ? " (first 150 shown)" : ""}`;
      $("#sres").innerHTML = rows.slice(0, 150).map(itemCard).join("") || `<p class="muted">Nothing matches.</p>`;
      const qs = new URLSearchParams(Object.entries(v).filter(([k, x]) => x && !(k === "o" && x === "rel"))).toString();
      history.replaceState(null, "", "#/search" + (qs ? "?" + qs : ""));
    };
    ids.forEach(id => $("#" + id).addEventListener(id === "sq" || id === "sc" ? "input" : "change", () => upd()));
    upd();
  },
};

function catBlock(id) {
  const it = D.catById[id];
  if (!it) return "";
  const ww = it.ww.slice().sort((a, b) => b[1] - a[1]);
  const sum = it.sum ? `<div class="summary"><p>${esc(it.sum)}</p>
      <p class="small">${(it.th || []).map(t => `<a class="theme" href="#/search?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}
      ${(it.ap || []).length ? `<span class="muted">Approach: ${esc(it.ap.join(", "))}</span>` : ""}</p>
      <p class="small muted">Summary written by Claude (Anthropic) from the full text, in its own words; check the original before citing.</p></div>` : "";
  return sum + `<p><span class="badge type">${esc(TYPES[it.ty])}</span>${it.ft ? '<span class="badge corpus">full text in collection</span>' : it.st ? `<span class="badge">${esc(it.st.replace("_", " "))}</span>` : ""}</p>
    ${ww.length ? `<p class="small">Discusses: ${ww.map(([w, p]) => wchip(w, p)).join("")}</p>` : ""}`;
}

// ---------- pages
const pages = {
  home() { return pages.search(); },
  overview() {
    const m = D.meta, sec = Object.values(D.works).filter(w => w.k !== "wolfe_primary");
    const top = sec.filter(w => w.ncw > 1).sort((a, b) => b.ncw - a.ncw || b.pr - a.pr).slice(0, 15);
    const prim = Object.values(D.works).filter(w => w.k === "wolfe_primary").sort((a, b) => b.ncw - a.ncw).slice(0, 8);
    return `<h1>Who cites whom in Gene Wolfe criticism</h1>
      <p>A citation graph of secondary scholarship on Gene Wolfe: essays, reviews, theses and books, which
      other criticism each one cites (formally, in notes and bibliographies) or mentions (informally, in the prose),
      and which of Wolfe's books they discuss.</p>
      <div class="stats">
        <div class="stat"><b>${m.n_corpus_works}</b><span>critical works read</span></div>
        <div class="stat"><b>${m.n_works.toLocaleString()}</b><span>works cited</span></div>
        <div class="stat"><b>${m.n_authors.toLocaleString()}</b><span>authors</span></div>
        <div class="stat"><b>${(m.by_kind.c || 0).toLocaleString()}</b><span>formal citations</span></div>
        <div class="stat"><b>${(m.by_kind.m || 0).toLocaleString()}</b><span>informal mentions</span></div>
      </div>
      <h2>Most-cited works</h2><p class="small muted">Ranked by the number of distinct corpus works citing them.</p>
      <ol>${top.map(w => `<li>${workLine(w)} <span class="small muted">— ${w.ncw} citing works</span></li>`).join("")}</ol>
      <p><a href="#/works">All works →</a> · <a href="#/graph">Explore the graph →</a></p>
      <h2>Most-discussed Wolfe books</h2>
      <ol>${prim.map(w => `<li>${wlink(w.id)} <span class="small muted">— ${w.ncw} citing works</span></li>`).join("")}</ol>
      <p><a href="#/wolfecites">All of Wolfe's books, and selected episodes →</a></p>`;
  },

  work(id) {
    const w = D.works[id];
    if (!w) return `<p>Unknown work.</p>`;
    const inc = D.inc[id] || [], out = D.out[id] || [];
    return `<p class="small muted"><a href="#/search">Search</a></p>
      <h1>${esc(w.ti || "(untitled)")}</h1>
      <p>${byline(w) || '<span class="muted">author unknown</span>'}${w.y ? " · " + esc(w.y) : ""}${w.co ? ` · <i>${esc(w.co)}</i>` : ""}</p>
      <p>${badges(w)} <span class="small muted">id ${esc(id)}</span></p>${catBlock(id)}
      <div class="stats">
        <div class="stat"><b>${w.ncw}</b><span>citing works</span></div>
        <div class="stat"><b>${w.nc}</b><span>formal citations</span></div>
        <div class="stat"><b>${w.nm}</b><span>informal mentions</span></div>
        ${w.inc ? `<div class="stat"><b>${w.nout}</b><span>works it cites</span></div>` : ""}
      </div>
      ${inc.length ? `<h2>Cited by</h2>${grouped(inc, c => c.f, "from")}` : ""}
      ${out.length ? `<h2>Cites</h2>${grouped(out, c => c.t || "a:" + c.a.join("|"), "to")}` : ""}
      ${!inc.length && !out.length ? `<p class="muted">No citations of this work were found in the corpus.</p>` : ""}`;
  },

  critic(id) {
    const name = D.authors[id];
    if (!name) return `<p>Unknown critic.</p>`;
    const ws = (D.byAuthor[id] || []).sort((a, b) => b.ncw - a.ncw);
    const named = D.aCites[id] || [];
    const citing = Object.values(D.works).filter(w => w.inc && w.a.includes(id));
    const citedBy = new Map();
    citing.forEach(w => (D.out[w.id] || []).forEach(c => c.t && D.works[c.t] && D.works[c.t].k !== "wolfe_primary" &&
      D.works[c.t].a.forEach(a => a !== id && citedBy.set(a, (citedBy.get(a) || 0) + 1))));
    const tops = [...citedBy].sort((a, b) => b[1] - a[1]).slice(0, 15);
    return `<p class="small muted"><a href="#/critics">Critics</a></p><h1>${esc(name)}</h1>
      <h2>Works</h2>${ws.length ? `<ul>${ws.map(w => `<li>${workLine(w)} <span class="small muted">— cited by ${w.ncw}</span></li>`).join("")}</ul>` : `<p class="muted">None in the graph.</p>`}
      ${named.length ? `<h2>Named without a specific work</h2>${grouped(named, c => c.f, "from")}` : ""}
      ${tops.length ? `<h2>Critics ${esc(name.split(",")[0])} cites most</h2><ul>${tops.map(([a, n]) => `<li>${alink(a)} <span class="small muted">${n}</span></li>`).join("")}</ul>` : ""}`;
  },

  works() {
    const rows = Object.values(D.works).filter(w => w.k !== "wolfe_primary");
    return `<h1>Works</h1><p class="small muted">Every secondary or other work cited at least once, plus every work in the corpus and bibliography. Click a column to sort.</p>
      <div class="filters"><input type="text" id="wf" placeholder="filter title or author">
      <label><input type="checkbox" id="wc"> in corpus</label><label><input type="checkbox" id="wb"> in bibliography</label>
      <label><input type="checkbox" id="ww" checked> about Wolfe</label></div><div id="wt"></div>`;
  },

  critics() {
    return `<h1>Critics</h1><p class="small muted">Authors of cited works, with how many corpus works cite them (any work, or by name).</p>
      <div class="filters"><input type="text" id="cf" placeholder="filter name"><label><input type="checkbox" id="cc"> wrote a corpus work</label></div><div id="ct"></div>`;
  },

  wolfecites() {
    const rows = Object.values(D.works).filter(w => w.k === "wolfe_primary" && (w.ncw || w.nc));
    const eps = {};
    D.episodes.forEach(e => (eps[e.e] ||= []).push(e));
    return `<h1>Wolfe's books in the criticism</h1>
      <p class="small muted">Formal citations of Wolfe's own works (page references, short forms, works-cited entries). A high citation count can come from one citation-dense study; "citing works" is the fairer measure.</p>
      ${table(rows, [
        {h: "Work", f: w => wlink(w.id), s: w => w.ti},
        {h: "Year", f: w => esc(w.y), s: w => w.y || ""},
        {h: "Citing works", n: 1, f: w => w.ncw, s: w => w.ncw},
        {h: "Citations", n: 1, f: w => w.nc, s: w => w.nc}], {sort: 2})}
      <h2>Episodes</h2><p class="small muted">Paragraphs in the criticism that discuss these embedded stories, found by keyword search (so some hits are incidental). Excerpts are trimmed to under 50 words.</p>
      ${Object.entries(EPISODES).map(([k, name]) => { const es = eps[k] || [];
        const byW = {}; es.forEach(e => (byW[e.w] ||= []).push(e));
        return `<h3>${name} <span class="small muted">— ${es.length} passages in ${Object.keys(byW).length} works</span></h3>
          ${Object.entries(byW).sort((a, b) => b[1].length - a[1].length).map(([w, xs]) =>
            `<details><summary>${wlink(w)} <span class="small muted">${xs.length}</span></summary>${xs.map(e =>
              `<div class="cite"><div class="ctx">“${esc(e.x)}”</div><div class="src">p. ${esc(e.p ?? "?")}</div></div>`).join("")}</details>`).join("")}`;
      }).join("")}`;
  },

  missing() {
    return `<h1>Cited, but not in the bibliography</h1>
      <p class="small muted">Works cited in the corpus that do not appear in the project bibliography. Metadata are as parsed from the citing notes and may be incomplete; nothing has been filled in from outside sources.</p>
      <div class="filters"><input type="text" id="mf" placeholder="filter"><label><input type="checkbox" id="mw" checked> Wolfe-related only</label></div><div id="mt"></div>`;
  },

  wanted() {
    const W = D.wanted, c = s => W.filter(r => r.src === s).length;
    const done = W.filter(r => r.st === "obtained").length, open = W.filter(r => r.st === "wanted");
    const c2 = s => open.filter(r => r.src === s).length;
    return `<h1>Wanted: full texts</h1>
      <p>Works whose full text is not yet in the corpus, so their own citations can't be added to the graph.
      When a copy is found and processed, the work joins the corpus and leaves this list.</p>
      <div class="stats">
        <div class="stat"><b>${c2("bibliography")}</b><span>in the bibliography, no copy yet</span></div>
        <div class="stat"><b>${c2("cited")}</b><span>cited by 2+ corpus works, not in the bibliography</span></div>
        <div class="stat"><b>${c2("discovered")}</b><span>new leads from database & web searches</span></div>
        <div class="stat"><b>${done}</b><span>obtained, awaiting processing</span></div>
      </div>
      <div class="filters"><input type="text" id="qf" placeholder="filter">
        <label>source <select id="qs"><option value="">all</option><option value="bibliography">bibliography</option>
          <option value="cited">cited, not in bibliography</option><option value="discovered">new leads</option></select></label>
        <label>status <select id="qt"><option value="">all</option><option value="wanted" selected>wanted</option>
          <option value="requested">requested</option><option value="obtained">obtained</option><option value="in_corpus">in corpus (reprinted)</option><option value="unavailable">unavailable</option></select></label>
        <label><input type="checkbox" id="qw"> hide web posts</label></div>
      <div id="qtab"></div>
      <p class="small muted">Priority = number of corpus works that cite the item. New leads have not been cited yet; they are sorted by year.</p>`;
  },

  reports() {
    const R = {centrality: "Centrality: most-cited works, brokers and critics", primary_attention: "Attention to Wolfe's works",
               timeline: "Timeline: citations by decade", orphans: "Orphans: works nobody cites"};
    return `<h1>Reports</h1><ul>${Object.entries(R).map(([k, v]) => `<li><a href="#/report/${k}">${v}</a></li>`).join("")}</ul>`;
  },

  async report(name) {
    if (!/^[a-z_]+$/.test(name)) return "";
    const md = await fetch(`reports/${name}.md`).then(r => r.text());
    const html = marked.parse(esc(md).replace(/&gt;/g, ">"));   // escape raw HTML, keep markdown quotes
    return `<p class="small muted"><a href="#/reports">Reports</a></p><div class="md">${html}</div>`;
  },

  about() {
    const m = D.meta;
    return `<h1>About</h1>
      <p>This site maps how criticism of Gene Wolfe cites itself. The corpus is a private collection of ${m.n_corpus_works} critical works
      (journal articles, reviews, theses, monographs). Their notes and bibliographies were OCR'd and parsed with
      <a href="https://github.com/kermitt2/grobid">GROBID</a> and rule-based extractors, and informal mentions of other critics in the prose were
      extracted with Claude (Anthropic). Cited works were matched against a curated bibliography of Wolfe scholarship.</p>
      <h2>What the data mean</h2>
      <ul><li><b>Formal citation</b>: an entry in a note, footnote, works-cited list, or a parenthetical reference.</li>
      <li><b>Informal mention</b>: the prose names a critic or a piece of criticism ("as Clute argues…"). Mentions carry a stance (agrees / disagrees / builds on / neutral) as judged by the model.</li>
      <li><b>Citing works</b> counts distinct corpus works, which is fairer than raw citation counts: one study can cite a book hundreds of times.</li>
      <li>Aramini's multi-volume study is counted once per volume, even where both a full volume and its chapter files are in the corpus.</li>
      <li>Every link records its method (grobid, rule, llm, manual), a confidence, and the page of the citing work.</li></ul>
      <h2>Limits</h2>
      <ul><li>OCR and parsing errors remain; a hand-checked sample is described in the project notes. Unmatched or garbled references are left unlinked rather than guessed.</li>
      <li>Bibliographic details are only what the sources print. Missing fields are left blank, not filled in.</li>
      <li>No full text of any work is published here: only metadata, page numbers and citation contexts under 50 words.</li></ul>
      <p class="small muted">Built ${esc(m.built)}. Links by method: ${esc(Object.entries(m.methods).map(([k, v]) => `${k} ${v}`).join(", "))}.</p>`;
  },

  graph() { return `<div id="graphwrap"><div id="gside">
      <p class="small muted">Nodes are works; arrows run from citing to cited. Size = citing works. Dashed = informal mention only. Drag to move, scroll to zoom.</p>
      <div class="legend small"><span style="background:#7a2e1f"></span>corpus<span style="background:#2f5d8a"></span>bibliography<span style="background:#aaa"></span>other<span style="background:#3b7a3b"></span>Wolfe</div>
      <p><label><input type="checkbox" id="gp"> show Wolfe's own books</label><br>
      <label>min. citing works <input type="range" id="gm" min="1" max="8" value="2"> <span id="gmv">2</span></label><br>
      <input type="text" id="gq" placeholder="highlight…" style="width:100%;margin-top:6px"></p>
      <div id="ginfo" class="muted">Click a node.</div></div><div id="gmain"><svg></svg></div></div>`; },
};

// ---------- interactive bits that need the DOM
const after = {
  works() {
    const all = Object.values(D.works).filter(w => w.k !== "wolfe_primary");
    const upd = () => {
      const q = $("#wf").value.toLowerCase(), c = $("#wc").checked, b = $("#wb").checked, ww = $("#ww").checked;
      const rows = all.filter(w => (!c || w.inc) && (!b || w.bib) && (!ww || w.wr || w.inc || w.bib) &&
        (!q || (w.ti || "").toLowerCase().includes(q) || w.a.some(a => (D.authors[a] || "").toLowerCase().includes(q))));
      $("#wt").innerHTML = table(rows, [
        {h: "Title", f: w => `${wlink(w.id)} ${badges(w)}`, s: w => (w.ti || "").toLowerCase()},
        {h: "Author", f: byline, s: w => (D.authors[w.a[0]] || "~").toLowerCase()},
        {h: "Year", f: w => esc(w.y), s: w => w.y || ""},
        {h: "Citing works", n: 1, f: w => w.ncw, s: w => w.ncw},
        {h: "Citations", n: 1, f: w => w.nc, s: w => w.nc},
        {h: "Mentions", n: 1, f: w => w.nm || "", s: w => w.nm}], {sort: 3});
    };
    ["#wf", "#wc", "#wb", "#ww"].forEach(s => $(s).oninput = upd); upd();
  },
  critics() {
    const upd = () => {
      const q = $("#cf").value.toLowerCase(), cc = $("#cc").checked;
      const rows = D.critics.filter(c => c.id !== "wolfe_g" && (c.ncw || c.corpus) && (!cc || c.corpus) && (!q || c.name.toLowerCase().includes(q)));
      $("#ct").innerHTML = table(rows, [
        {h: "Critic", f: c => alink(c.id) + (c.corpus ? ' <span class="badge corpus">in corpus</span>' : ""), s: c => c.name.toLowerCase()},
        {h: "Works cited", n: 1, f: c => c.nworks, s: c => c.nworks},
        {h: "Citing works", n: 1, f: c => c.ncw, s: c => c.ncw},
        {h: "Mentions", n: 1, f: c => c.ment || "", s: c => c.ment}], {sort: 2});
    };
    ["#cf", "#cc"].forEach(s => $(s).oninput = upd); upd();
  },
  missing() {
    const upd = () => {
      const q = $("#mf").value.toLowerCase(), w = $("#mw").checked;
      const rows = D.missing.filter(r => (!w || r.wolfe_related === "True") && (!q || (r.title + r.authors + r.container).toLowerCase().includes(q)));
      $("#mt").innerHTML = table(rows, [
        {h: "Title", f: r => wlink(r.work_id).replace(">?<", ">" + esc(r.title) + "<"), s: r => r.title.toLowerCase()},
        {h: "Author", f: r => esc(r.authors), s: r => r.authors.toLowerCase()},
        {h: "Year", f: r => esc(r.year), s: r => r.year},
        {h: "In", f: r => `<i>${esc(r.container)}</i>`, s: r => r.container},
        {h: "Citing works", n: 1, f: r => r.n_citing_works, s: r => +r.n_citing_works}], {sort: 4});
    };
    ["#mf", "#mw"].forEach(s => $(s).oninput = upd); upd();
  },
  wanted() {
    const SRC = {bibliography: "bibliography", cited: "cited", discovered: "new lead"};
    const ST = {wanted: "", requested: "badge bib", obtained: "badge wolfe", in_corpus: "badge corpus", unavailable: "badge"};
    const upd = () => {
      const q = $("#qf").value.toLowerCase(), s = $("#qs").value, t = $("#qt").value, hw = $("#qw").checked;
      const rows = D.wanted.filter(r => (!s || r.src === s) && (!t || r.st === t) && (!hw || r.k !== "web") &&
        (!q || (r.ti + r.a + r.v).toLowerCase().includes(q)));
      $("#qtab").innerHTML = table(rows, [
        {h: "Title", f: r => (r.w ? wlink(r.w).replace(/>[^<]*</, ">" + esc(r.ti) + "<") : r.url ? `<a href="${esc(r.url)}" rel="noopener">${esc(r.ti)}</a>` : esc(r.ti))
            + (r.n ? `<div class="small muted">${esc(r.n)}</div>` : ""), s: r => r.ti.toLowerCase()},
        {h: "Author", f: r => esc(r.a), s: r => (r.a || "~").toLowerCase()},
        {h: "Year", f: r => esc(r.y), s: r => r.y || ""},
        {h: "In", f: r => `<i>${esc(r.v)}</i>`, s: r => r.v || ""},
        {h: "Source", f: r => `<span class="badge">${SRC[r.src]}</span>${r.k ? ` <span class="small muted">${esc(r.k)}</span>` : ""}`, s: r => r.src},
        {h: "Status", f: r => r.st === "wanted" ? `<span class="small muted">wanted</span>` : `<span class="${ST[r.st]}">${esc(r.st.replace("_", " "))}</span>`, s: r => r.st},
        {h: "Priority", n: 1, f: r => r.ncw || "", s: r => r.ncw * 10000 + (+String(r.y).slice(0, 4) || 0) / 10}], {sort: 6, limit: 500});
    };
    ["#qf", "#qs", "#qt", "#qw"].forEach(s => $(s).oninput = upd); upd();
  },
  graph: drawGraph,
  home() { after.search(); },
  search() { after.search(); },
};

function drawGraph() {
  const color = n => n.k === "wolfe_primary" ? "#3b7a3b" : n.inc ? "#7a2e1f" : n.bib ? "#2f5d8a" : "#aaa";
  const svg = d3.select("#gmain svg"), g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([.1, 8]).on("zoom", e => g.attr("transform", e.transform)));
  const edges = {};
  D.cites.forEach(c => { if (!c.t) return; const k = c.f + "→" + c.t;
    (edges[k] ||= {source: c.f, target: c.t, w: 0, m: 0}).w++; if (c.k === "m") edges[k].m++; });
  let sim;
  const draw = () => {
    const prim = $("#gp").checked, min = +$("#gm").value;
    const keep = new Set(Object.values(D.works).filter(w => (prim || w.k !== "wolfe_primary") && (w.ncw >= min || (w.inc && w.nout))).map(w => w.id));
    const nodes = [...keep].map(id => ({id, ...D.works[id]}));
    const links = Object.values(edges).filter(e => keep.has(e.source) && keep.has(e.target)).map(e => ({...e}));
    g.selectAll("*").remove(); sim && sim.stop();
    const W = svg.node().clientWidth, H = svg.node().clientHeight;
    sim = d3.forceSimulation(nodes).force("link", d3.forceLink(links).id(d => d.id).distance(70).strength(.25))
      .force("charge", d3.forceManyBody().strength(-80)).force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide(d => 5 + Math.sqrt(d.ncw) * 2.4)).force("x", d3.forceX(W / 2).strength(.03)).force("y", d3.forceY(H / 2).strength(.03));
    const link = g.append("g").selectAll("line").data(links).join("line").attr("class", d => d.m === d.w ? "m" : null)
      .attr("stroke-width", d => Math.min(4, .6 + Math.log2(d.w)));
    const node = g.append("g").selectAll("circle").data(nodes).join("circle").attr("r", d => 3 + Math.sqrt(d.ncw) * 2.4).attr("fill", color)
      .on("click", (e, d) => info(d.id))
      .call(d3.drag().on("start", (e, d) => { if (!e.active) sim.alphaTarget(.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; }).on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = d.fy = null; }));
    node.append("title").text(d => d.ti);
    const label = g.append("g").selectAll("text").data(nodes.filter(n => n.ncw >= 4 || n.inc)).join("text").text(d => (d.ti || "").slice(0, 36));
    sim.on("tick", () => {
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("cx", d => d.x).attr("cy", d => d.y); label.attr("x", d => d.x + 6).attr("y", d => d.y + 3);
    });
    function info(id) {
      const w = D.works[id], nb = new Set([id]);
      links.forEach(l => { if (l.source.id === id) nb.add(l.target.id); if (l.target.id === id) nb.add(l.source.id); });
      node.classed("dim", d => !nb.has(d.id)); link.classed("dim", d => d.source.id !== id && d.target.id !== id);
      $("#ginfo").innerHTML = `<h3>${wlink(id)}</h3><div>${byline(w)} ${esc(w.y || "")}</div><p>${badges(w)}</p>
        <p>Cited by ${w.ncw} works${w.inc ? `; cites ${w.nout}` : ""}.</p><p><a href="#/work/${encodeURIComponent(id)}">Full record →</a></p>`;
    }
    $("#gq").oninput = e => { const q = e.target.value.toLowerCase();
      node.classed("dim", d => q && !(d.ti || "").toLowerCase().includes(q)); link.classed("dim", !!q); };
  };
  $("#gp").onchange = draw;
  $("#gm").oninput = e => { $("#gmv").textContent = e.target.value; draw(); };
  draw();
}

Object.assign(pages, NEW_PAGES);
Object.assign(after, NEW_AFTER);

// ---------- router & search
async function route() {
  const [path, qs = ""] = location.hash.slice(1).split("?");
  const [, page = "", ...rest] = path.split("/");
  const arg = decodeURIComponent(rest.join("/"));
  Q = Object.fromEntries(new URLSearchParams(qs));
  const fn = pages[page || "home"] || pages.home;
  $("#app").className = page === "graph" ? "wide" : "";
  $("#app").innerHTML = await fn(arg);
  const tab = page === "" || page === "home" ? "search" : page === "wolfework" ? "wolfe" : page;
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#/" + tab));
  (after[page] || (() => {}))();
  if (page !== "graph") window.scrollTo(0, 0);
  const w = D.works[arg], c = D.authors[arg];
  const ww = page === "wolfework" && D.wolfeById[arg];
  document.title = (w ? w.ti + " — " : c ? c + " — " : ww ? ww.ti + " — " : "") + "Gene Wolfe Scholarship";
}

function setupSearch() {
  const box = $("#search"), res = $("#results");
  box.oninput = () => {
    const q = box.value.trim().toLowerCase();
    if (q.length < 2) { res.style.display = "none"; return; }
    const ws = Object.values(D.works).filter(w => (w.ti || "").toLowerCase().includes(q)).sort((a, b) => b.ncw - a.ncw).slice(0, 12);
    const cs = D.critics.filter(c => c.name.toLowerCase().includes(q)).sort((a, b) => b.ncw - a.ncw).slice(0, 8);
    res.innerHTML = cs.map(c => `<a href="#/critic/${encodeURIComponent(c.id)}">👤 ${esc(c.name)} <span class="muted small">${c.ncw}</span></a>`).join("") +
      ws.map(w => `<a href="#/work/${encodeURIComponent(w.id)}">${esc(w.ti)} <span class="muted small">${esc(w.y || "")} · ${w.ncw}</span></a>`).join("") ||
      `<a class="muted">No matches</a>`;
    res.style.display = "block";
  };
  document.addEventListener("click", e => { if (!res.contains(e.target) && e.target !== box) res.style.display = "none"; });
  res.onclick = () => { res.style.display = "none"; box.value = ""; };
  box.onkeydown = e => { if (e.key === "Enter" && box.value.trim()) {
    location.hash = "#/search?" + new URLSearchParams({q: box.value.trim()}); res.style.display = "none"; box.value = ""; } };
}

load();

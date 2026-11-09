#!/usr/bin/env python3
"""Dedupe discovery candidates against everything the project already knows.

Usage:  python3 discovery/check_known.py < candidates.json > checked.json
Input : JSON list of objects with at least "title"; optional "url", "doi".
Output: the same list, each item gaining "known" (bool), "known_as" and "score".
Known = in data/works.json (bibliography, corpus and every cited work), data/wanted.json,
data/missing.json, or discovery/seen.json (items reported by earlier runs).
Standard library only.
"""
import difflib, json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"<[^>]+>", " ", s)                      # html tags in database titles
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    s = re.sub(r"^(review of |review |rev |the |a |an )+", "", s)
    return s


def norm_url(u):
    u = (u or "").strip().lower()
    u = re.sub(r"^https?://(dx\.)?(www\.)?", "", u).rstrip("/")
    return u.replace("doi.org/", "doi:")


def load():
    titles, urls = {}, set()
    d = ROOT / "data"
    for wid, w in json.load(open(d / "works.json")).items():
        titles[norm(w.get("ti"))] = wid
    for r in json.load(open(d / "wanted.json")):
        titles[norm(r.get("ti"))] = r["id"]
        if r.get("url"):
            urls.add(norm_url(r["url"]))
    for r in json.load(open(d / "missing.json")):
        titles[norm(r.get("title"))] = r["work_id"]
    seen = ROOT / "discovery/seen.json"
    for r in json.load(open(seen)) if seen.exists() else []:
        titles[norm(r.get("title"))] = "seen:" + r.get("first_reported", "")
        for k in ("url", "doi"):
            if r.get(k):
                urls.add(norm_url(r[k]))
    titles.pop("", None)
    return titles, urls


def main():
    titles, urls = load()
    keys = list(titles)
    out = []
    for c in json.load(sys.stdin):
        t = norm(c.get("title"))
        hit, score = None, 0.0
        if any(norm_url(c.get(k)) in urls for k in ("url", "doi") if c.get(k)):
            hit, score = "url/doi", 1.0
        elif t in titles:
            hit, score = titles[t], 1.0
        elif len(t) >= 12:
            for k in difflib.get_close_matches(t, keys, n=1, cutoff=0.9):
                hit, score = titles[k], round(difflib.SequenceMatcher(None, t, k).ratio(), 3)
            if not hit and len(t.split()) >= 3:   # same title with / without subtitle
                k = next((k for k in keys if len(k.split()) >= 3 and (k.startswith(t + " ") or t.startswith(k + " "))), None)
                if k:
                    hit, score = titles[k], 0.9
        out.append({**c, "known": bool(hit), "known_as": hit, "score": score})
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    print(f"\n{sum(not o['known'] for o in out)} new of {len(out)}", file=sys.stderr)


if __name__ == "__main__":
    main()

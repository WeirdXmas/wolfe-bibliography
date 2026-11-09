#!/usr/bin/env python3
"""Recent Wolfe scholarship from OpenAlex and Crossref (no API keys needed).

Usage:  python3 discovery/search_open.py [--days 120] > open.json
Prints a JSON list of {source, title, authors, year, date, venue, type, doi, url} for records
whose TITLE is about Gene Wolfe or one of his works, published in the last N days.
Everything is copied from the database record; nothing is filled in. Standard library only.
"""
import argparse, datetime as dt, json, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = {"User-Agent": "wolfe-bibliography-discovery/1.0 (https://github.com/WeirdXmas/wolfe-bibliography)"}
QUERIES = ['"Gene Wolfe"', '"Book of the New Sun"', '"Fifth Head of Cerberus"', '"Long Sun" Wolfe',
           '"Short Sun" Wolfe', 'Severian Wolfe', '"Soldier of the Mist"', '"Wizard Knight" Wolfe',
           '"Peace" "Gene Wolfe"', '"Death of Doctor Island"']
ABOUT = re.compile(r"gene wolfe|wolfe's (book|new sun|fiction|urth|latro|short fiction)|book of the new sun|"
                   r"fifth head of cerberus|long sun|short sun|wizard knight|soldier of (the mist|arete|sidon)|"
                   r"castleview|there are doors|death of doctor island|death of dr\.? island|island of (doctor|dr\.?) death|"
                   r"shadow of the torturer|claw of the conciliator|sword of the lictor|citadel of the autarch|"
                   r"urth of the new sun|free live free|operation ares|an evil guest|sorcerer's house|"
                   r"borrowed man|lake of the long sun|return to the whorl|in green's jungles|seven american nights", re.I)
SF_VENUE = re.compile(r"science fiction|fantas|extrapolation|foundation|locus|speculative|liverpool university press|"
                      r"strange horizons|vector|journal of the fantastic|mythlore", re.I)


def about_wolfe(title, venue):
    t = re.sub(r"<[^>]+>", "", title or "")
    if re.search(r"severian", t, re.I) and not re.search(r"wolfe|urth|torturer|new sun", t, re.I):
        return False   # Severian of Gabala, the Severan dynasty, ...
    return bool(ABOUT.search(t)) or (bool(re.search(r"\bwolfe\b", t, re.I)) and bool(SF_VENUE.search(venue or "")))


LIMITED = set()   # hosts that rate-limited us this run: skip them instead of waiting


def get(url):
    host = urllib.parse.urlparse(url).netloc
    if host in LIMITED:
        return None
    for k in range(2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            print(f"warn: {e} on {url[:100]}", file=sys.stderr)
            if e.code == 429:
                if k:   # second 429: give up on this host for the rest of the run
                    LIMITED.add(host)
                    print(f"warn: {host} is rate-limiting this machine; skipping it", file=sys.stderr)
                    return None
                time.sleep(15)
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"warn: {e} on {url[:100]}", file=sys.stderr)
            time.sleep(5)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=120)
    a = ap.parse_args()
    since = (dt.date.today() - dt.timedelta(days=a.days)).isoformat()
    out, seen = [], set()

    def add(rec):
        key = (rec["doi"] or "").lower() or re.sub(r"\W+", " ", rec["title"].lower()).strip()
        if key and key not in seen and about_wolfe(rec["title"], rec["venue"]):
            seen.add(key)
            out.append(rec)

    for q in QUERIES:   # OpenAlex: first page only (paging needs an API key)
        d = get("https://api.openalex.org/works?per-page=100&sort=publication_date:desc"
                f"&filter=from_publication_date:{since}&search=" + urllib.parse.quote(q)
                + "&select=id,doi,title,publication_year,publication_date,type,authorships,primary_location")
        for w in (d or {}).get("results", []):
            loc = w.get("primary_location") or {}
            add({"source": "openalex", "title": w.get("title") or "", "year": w.get("publication_year"),
                 "date": w.get("publication_date"), "venue": (loc.get("source") or {}).get("display_name") or "",
                 "type": w.get("type"), "doi": w.get("doi"), "url": loc.get("landing_page_url") or w.get("id"),
                 "authors": [x["author"]["display_name"] for x in w.get("authorships") or []]})
        time.sleep(1)
    for q in QUERIES:
        d = get("https://api.crossref.org/works?rows=100&select=DOI,title,author,issued,container-title,type,URL"
                f"&filter=from-pub-date:{since}&query.bibliographic=" + urllib.parse.quote(q.replace('"', "")))
        for it in ((d or {}).get("message") or {}).get("items", []):
            parts = ((it.get("issued") or {}).get("date-parts") or [[None]])[0]
            add({"source": "crossref", "title": " ".join(it.get("title") or []), "year": parts[0],
                 "date": "-".join(str(p) for p in parts if p), "venue": " ".join(it.get("container-title") or []),
                 "type": it.get("type"), "doi": "https://doi.org/" + it["DOI"], "url": it.get("URL"),
                 "authors": [f"{x.get('given', '')} {x.get('family', '')}".strip() for x in it.get("author") or []]})
        time.sleep(1)
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    print(f"\n{len(out)} Wolfe-titled records since {since}"
          + (f"; rate-limited and skipped: {', '.join(sorted(LIMITED))}" if LIMITED else ""), file=sys.stderr)


if __name__ == "__main__":
    main()

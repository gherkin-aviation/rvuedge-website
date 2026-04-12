#!/usr/bin/env python3
"""
Push all URLs from the site's sitemaps to IndexNow.

IndexNow pings Bing, Yandex, Seznam, Naver, and DuckDuckGo in one POST.
Bing typically crawls submitted URLs within minutes to hours instead of weeks.

Usage:
    python3 _scripts/indexnow-submit.py               # submit everything
    python3 _scripts/indexnow-submit.py --dry-run     # parse + print, no POST
    python3 _scripts/indexnow-submit.py --only pages  # only sitemap-pages.xml

Docs: https://www.indexnow.org/documentation
"""
import argparse
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

HOST = "rvuedge.com"
KEY = "914ddae6c5945672bae23050bdd9ffa2"
KEY_LOCATION = f"https://{HOST}/{KEY}.txt"
ENDPOINT = "https://api.indexnow.org/indexnow"
BATCH_SIZE = 10_000  # IndexNow max per request
SLEEP_BETWEEN_BATCHES = 2  # seconds, to stay polite


def collect_urls(root: Path, only: str | None) -> list[str]:
    """Parse every sitemap-*.xml at the repo root and return unique URLs."""
    pattern = f"sitemap-{only}*.xml" if only else "sitemap-*.xml"
    urls: set[str] = set()
    loc_re = re.compile(r"<loc>([^<]+)</loc>")
    for path in sorted(root.glob(pattern)):
        text = path.read_text()
        found = loc_re.findall(text)
        # skip the index file which lists other sitemaps
        if found and found[0].endswith(".xml"):
            continue
        urls.update(found)
        print(f"  {path.name}: {len(found)} urls")
    return sorted(urls)


def post_batch(batch: list[str]) -> tuple[int, str]:
    payload = {
        "host": HOST,
        "key": KEY,
        "keyLocation": KEY_LOCATION,
        "urlList": batch,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        ENDPOINT,
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, str(e)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="don't POST")
    ap.add_argument("--only", help="restrict to sitemap-<only>*.xml")
    ap.add_argument("--limit", type=int, help="max URLs to submit (debug)")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    print(f"Scanning sitemaps in {root}")
    urls = collect_urls(root, args.only)
    if args.limit:
        urls = urls[: args.limit]
    print(f"\nTotal unique URLs: {len(urls)}")

    if args.dry_run:
        print("\nDry run. First 5 URLs:")
        for u in urls[:5]:
            print(f"  {u}")
        return 0

    if not urls:
        print("Nothing to submit.")
        return 0

    # Confirm the key file is reachable before we start burning API calls
    print(f"\nVerifying key file at {KEY_LOCATION}")
    try:
        with urllib.request.urlopen(KEY_LOCATION, timeout=15) as r:
            body = r.read().decode().strip()
            if body != KEY:
                print(f"  ERROR: key file content mismatch (got {body!r})")
                return 1
            print("  OK")
    except Exception as e:
        print(f"  ERROR: key file unreachable: {e}")
        return 1

    total_batches = (len(urls) + BATCH_SIZE - 1) // BATCH_SIZE
    ok = 0
    for i in range(0, len(urls), BATCH_SIZE):
        batch = urls[i : i + BATCH_SIZE]
        n = i // BATCH_SIZE + 1
        print(f"\nBatch {n}/{total_batches}: posting {len(batch)} urls...")
        status, body = post_batch(batch)
        # 200 = accepted, 202 = accepted but not yet validated
        if status in (200, 202):
            print(f"  OK ({status})")
            ok += 1
        else:
            print(f"  FAIL ({status}): {body[:300]}")
        if n < total_batches:
            time.sleep(SLEEP_BETWEEN_BATCHES)

    print(f"\nDone. {ok}/{total_batches} batches accepted.")
    return 0 if ok == total_batches else 2


if __name__ == "__main__":
    sys.exit(main())

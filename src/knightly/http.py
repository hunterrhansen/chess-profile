"""Tiny stdlib HTTP client with polite rate-limit handling."""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Iterator

USER_AGENT = "knightly/0.1 (+personal data aggregator)"
if contact := os.environ.get("KNIGHTLY_CONTACT"):
    # Chess.com asks API clients to include contact info in the User-Agent.
    USER_AGENT += f" contact: {contact}"

MAX_RETRIES = 5


def _open(url: str, headers: dict | None = None):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    for attempt in range(MAX_RETRIES):
        try:
            return urllib.request.urlopen(req, timeout=60)
        except urllib.error.HTTPError as e:
            # Lichess answers 429 for both rate limits and its one-stream-at-a-time rule;
            # its docs ask clients to wait a full minute.
            if e.code == 429 or e.code >= 500:
                wait = 60 if "lichess" in url else 2 ** attempt * 5
                print(f"  {e.code} from server, waiting {wait}s before retrying...", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError(f"still rate-limited after {MAX_RETRIES} attempts ({url.split('?')[0]}); try again later")


def get_json(url: str, headers: dict | None = None):
    with _open(url, {"Accept": "application/json", **(headers or {})}) as resp:
        return json.load(resp)


def stream_ndjson(url: str, headers: dict | None = None) -> Iterator[dict]:
    with _open(url, {"Accept": "application/x-ndjson", **(headers or {})}) as resp:
        for line in resp:
            line = line.strip()
            if line:
                yield json.loads(line)

"""Placeholder compute entry: market/fund sync will land here (Cloudflare Containers)."""

from __future__ import annotations

import json
from datetime import datetime, timezone


def main() -> None:
    payload = {
        "job": "sync_placeholder",
        "status": "ok",
        "ts": datetime.now(timezone.utc).isoformat(),
        "note": "Wire yfinance / vendor APIs + write to R2/D1 in Phase 1.",
    }
    print(json.dumps(payload))


if __name__ == "__main__":
    main()

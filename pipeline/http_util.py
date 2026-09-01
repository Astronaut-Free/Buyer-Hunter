"""Shared HTTP helpers for the collectors.

Every collector streams responses and stops reading once ``SIZE_CAP`` bytes have
arrived, so an oversized or hostile payload is aborted before it is fully
buffered in memory. docs/02 §3.3 sets the page ceiling at 2 MB.
"""

from __future__ import annotations

import requests


SIZE_CAP = 2 * 1024 * 1024


def read_capped(response: requests.Response, cap: int = SIZE_CAP) -> tuple[bytes, bool]:
    """Stream the body, stopping once ``cap`` bytes have arrived.

    ``response`` must have been requested with ``stream=True``. Returns
    ``(body, truncated)``; when ``truncated`` is True the caller must treat the
    response as oversized and discard it rather than parse or snapshot it.
    """
    chunks: list[bytes] = []
    total = 0
    for chunk in response.iter_content(chunk_size=65536):
        if not chunk:
            continue
        chunks.append(chunk)
        total += len(chunk)
        if total > cap:
            return b"".join(chunks)[: cap + 1], True
    return b"".join(chunks), False

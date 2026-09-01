"""Backward-compatible alias for the unified cleaner.

The parser-quality upgrades that used to live here — platform-specific
country / date / quantity / contact parsing and precise category matching — are
now part of ``clean_and_score_buyer_signals_v1`` and ``parser_quality_v1_1``
directly. There is exactly one ``clean_row`` and one ``truth-v1.1.0`` ruleset.

This module stays only so existing commands and imports keep working. It adds no
behaviour and installs no global patches, so scoring no longer depends on which
module a process happened to import first.
"""

from __future__ import annotations

from clean_and_score_buyer_signals_v1 import clean_row, main
from parser_quality_v1_1 import product_matches

# Historical name, identical to clean_row. Kept for callers and tests that
# still import ``upgraded_clean_row``.
upgraded_clean_row = clean_row

__all__ = ["clean_row", "upgraded_clean_row", "product_matches", "main"]


if __name__ == "__main__":
    raise SystemExit(main())

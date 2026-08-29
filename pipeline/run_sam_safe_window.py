"""Deprecated shim.

collect_sam.py now uses a 364-day window directly, so this wrapper no longer
patches anything. Kept so existing commands keep working; call collect_sam.py.
"""

import collect_sam

raise SystemExit(collect_sam.main())

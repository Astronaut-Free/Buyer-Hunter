"""Run the SAM collector with an inclusive date window below the API limit."""

import collect_sam


_timedelta = collect_sam.timedelta


def _safe_window(*args, **kwargs):
    if kwargs.get("days") == 365:
        kwargs["days"] = 364
    return _timedelta(*args, **kwargs)


collect_sam.timedelta = _safe_window
raise SystemExit(collect_sam.main())

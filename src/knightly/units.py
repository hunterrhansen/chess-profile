"""The improvement path's units: one per KPI on the Progress page, weakest first.

A unit is done when its number hits the target over the unit check: your last CHECK_SIZE
games that count for it (all analysed games for blunders, games you were winning for
conversion, and so on). Units re-sort as the numbers move, so the weakest is always Unit 1,
and a finished unit comes back if its number slips.
"""
from dataclasses import dataclass
from typing import Callable

CHECK_SIZE = 10


@dataclass(frozen=True)
class Unit:
    id: str
    title: str
    kpi: str                  # key in api.kpis()
    target: float
    lower_better: bool
    counts: Callable          # GAME_FACTS row -> does this game count for the unit check?
    hit: Callable             # GAME_FACTS row -> did this game meet the target?
    review: Callable          # GAME_FACTS row -> is this a good game to review for the unit?


UNITS = [
    Unit("blunders", "Stop hanging pieces", "blunders_per_game", 1.5, True,
         counts=lambda r: r["analysed"],
         hit=lambda r: (r["blunders"] or 0) < 1.5,
         review=lambda r: (r["blunders"] or 0) > 0),
    Unit("conversion", "Finish what you start", "conversion", 0.8, False,
         counts=lambda r: r["analysed"] and r["was_winning"],
         hit=lambda r: r["user_outcome"] == "win",
         review=lambda r: r["was_winning"] and r["user_outcome"] != "win"),
    Unit("punish", "Punish their mistakes", "punish_rate", 0.7, False,
         counts=lambda r: r["analysed"] and (r["opp_blunders"] or 0) > 0,
         hit=lambda r: (r["punished"] or 0) >= (r["opp_blunders"] or 0),
         review=lambda r: (r["punished"] or 0) < (r["opp_blunders"] or 0)),
    Unit("comebacks", "Never give up", "comeback_rate", 0.45, False,
         counts=lambda r: r["analysed"] and r["was_lost"],
         hit=lambda r: r["user_outcome"] != "loss",
         review=lambda r: r["was_lost"]),
]


def meets(unit: Unit, value: float | None) -> bool:
    if value is None:
        return False
    return value < unit.target if unit.lower_better else value >= unit.target


def score(unit: Unit, value: float | None) -> float:
    """How close a number is to its target, 1 = on target. Lower is weaker. A unit with no
    number yet sits in the middle rather than first."""
    if value is None:
        return 1.0
    if unit.lower_better:
        return unit.target / value if value else 10.0
    return value / unit.target


def build(rows, recent, kpis: Callable) -> list[dict]:
    """The units in path order: unfinished ones weakest first, then finished ones.
    `rows` are all GAME_FACTS rows oldest first (for the unit check), `recent` the ones the
    shown number covers (the last 90 days, as on Progress); `kpis` is api.kpis."""
    out = []
    current = kpis(recent)
    for unit in UNITS:
        sample = [r for r in rows if unit.counts(r)][-CHECK_SIZE:]
        check_value = kpis(sample)[unit.kpi] if sample else None
        value = current[unit.kpi]
        out.append({
            "id": unit.id,
            "title": unit.title,
            "kpi": unit.kpi,
            "value": value,
            "target": unit.target,
            "lower_better": unit.lower_better,
            "done": len(sample) >= CHECK_SIZE and meets(unit, check_value),
            "check": {"size": CHECK_SIZE, "games": len(sample), "hits": sum(1 for r in sample if unit.hit(r)),
                      "value": check_value},
            "_score": score(unit, value),
        })
    out.sort(key=lambda u: (u["done"], u["_score"]))
    for u in out:
        del u["_score"]
    return out


def unit(unit_id: str) -> Unit:
    return next(u for u in UNITS if u.id == unit_id)

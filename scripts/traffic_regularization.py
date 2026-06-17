"""
Traffic regularization for the eepsite fetch path — a Tamaraw-style
website-fingerprinting (WF) defense.

WHY THIS EXISTS (the real attack):
  I2P encrypts content + hides IPs, but the *shape* of your traffic —
  the sequence of packet sizes and timings — leaks WHICH eepsite you
  loaded. A passive observer of your encrypted link (your ISP, a
  malicious first-hop peer) can train a classifier on these shapes and
  identify your destination with high accuracy. This is the documented
  #1 break against hidden services (Website Fingerprinting). I2P does
  NOT defend against it; Echelon can, at the daemon layer.

THE DEFENSE (Tamaraw, Cai et al. — the information-theoretically analyzed
regularization defense):
  Make every fetch look the same shape regardless of the real content:
    1. CELL PADDING: quantize all data into fixed-size cells. A 1483-byte
       response and a 1517-byte response both become N cells of CELL_SIZE.
    2. LENGTH BUCKETING: pad the total cell count up to the next bucket on
       a fixed schedule, so the *number* of cells only takes a small set
       of values — collapsing many distinct sites into one length class.
    3. CONSTANT-RATE SCHEDULE: emit cells at a fixed inter-cell interval
       so inter-packet timing carries no information.
  Tamaraw's guarantee: the attacker's accuracy is bounded by the size of
  the anonymity set created by the bucketing — provably, not heuristically.

WHAT THIS MODULE IS:
  The pure, deterministic core: given a real payload length (and timing),
  compute the *regularized* shape — cell count, padded length, and the
  emission schedule. This is what the daemon applies when the user enables
  the "cover traffic / padding" privacy option (design-v2 §4.4 Privacy tier).
  It is fully unit-testable: we assert the regularized shape is a function
  ONLY of the bucket, never of the exact input length — which is the
  formal property that defeats WF.

  The daemon-side application (actually padding the bytes on the wire +
  pacing them) wraps this; the math + the anonymity-set property live here
  and are tested in isolation.

Parameters follow Tamaraw's analyzed regime (fixed cell size, fixed rate,
length padded to a multiple of L). Defaults are tunable per design-v2's
"choke" lever for the privacy/overhead tradeoff.
"""
from __future__ import annotations

import dataclasses
import math
from typing import List


# Tamaraw-regime defaults. CELL_SIZE mirrors the I2P/Tor cell granularity
# ballpark; L (the length-bucket multiple) sets the anonymity-set coarseness.
DEFAULT_CELL_SIZE = 512            # bytes per fixed cell
DEFAULT_LENGTH_MULTIPLE_L = 100    # pad cell-count up to a multiple of L
DEFAULT_RATE_INTERVAL_MS = 20      # constant inter-cell emission interval


@dataclasses.dataclass(frozen=True)
class RegularizationParams:
    cell_size: int = DEFAULT_CELL_SIZE
    length_multiple: int = DEFAULT_LENGTH_MULTIPLE_L
    rate_interval_ms: int = DEFAULT_RATE_INTERVAL_MS

    def __post_init__(self):
        if self.cell_size <= 0:
            raise ValueError("cell_size must be positive")
        if self.length_multiple <= 0:
            raise ValueError("length_multiple must be positive")
        if self.rate_interval_ms < 0:
            raise ValueError("rate_interval_ms must be non-negative")


@dataclasses.dataclass(frozen=True)
class RegularizedShape:
    real_bytes: int          # the true payload length (private; for overhead calc)
    cells: int               # number of fixed-size cells emitted (the OBSERVABLE)
    padded_bytes: int        # cells * cell_size (the OBSERVABLE on-wire length)
    schedule_ms: List[int]   # cumulative emit time per cell (the OBSERVABLE timing)
    overhead_bytes: int      # padded_bytes - real_bytes
    overhead_ratio: float    # padded_bytes / real_bytes (>= 1.0)

    @property
    def bucket(self) -> int:
        """The anonymity-set key: every real length in the same bucket
        produces the identical observable (cells, padded_bytes, schedule)."""
        return self.cells


def _cells_for(real_bytes: int, cell_size: int) -> int:
    """Number of fixed cells needed to carry real_bytes (at least 1)."""
    if real_bytes <= 0:
        return 1
    return max(1, math.ceil(real_bytes / cell_size))


def regularize(real_bytes: int, params: RegularizationParams | None = None) -> RegularizedShape:
    """Compute the Tamaraw-regularized shape for a payload of `real_bytes`.

    The OBSERVABLE outputs (cells, padded_bytes, schedule_ms) are a pure
    function of the *bucket* the real length falls into — NOT of the exact
    real length. That invariance is the formal WF defense: an observer
    learns only the bucket, which by construction is shared by many sites.
    """
    p = params or RegularizationParams()
    raw_cells = _cells_for(real_bytes, p.cell_size)
    # Pad cell count UP to the next multiple of L (length bucketing).
    padded_cells = int(math.ceil(raw_cells / p.length_multiple) * p.length_multiple)
    padded_bytes = padded_cells * p.cell_size
    # Constant-rate schedule: cell i emitted at i * interval.
    schedule = [i * p.rate_interval_ms for i in range(1, padded_cells + 1)]
    real = max(0, real_bytes)
    return RegularizedShape(
        real_bytes=real,
        cells=padded_cells,
        padded_bytes=padded_bytes,
        schedule_ms=schedule,
        overhead_bytes=padded_bytes - real,
        overhead_ratio=(padded_bytes / real) if real > 0 else float("inf"),
    )


def same_anonymity_set(a: int, b: int, params: RegularizationParams | None = None) -> bool:
    """True if two real payload lengths regularize to the IDENTICAL
    observable shape (same bucket). This is the property an attacker
    cannot break: same bucket ⇒ indistinguishable on the wire."""
    sa = regularize(a, params)
    sb = regularize(b, params)
    return (sa.cells == sb.cells
            and sa.padded_bytes == sb.padded_bytes
            and sa.schedule_ms == sb.schedule_ms)


def pad_payload(data: bytes, params: RegularizationParams | None = None) -> bytes:
    """Pad a real payload up to its regularized padded_bytes length.

    The padding is appended after a 4-byte big-endian real-length prefix so
    the receiver can recover the original. Layout:
        [4 bytes real_len][real data][zero padding to padded_bytes]
    (The +4 header is itself accounted for in the cell math.)
    """
    p = params or RegularizationParams()
    real_len = len(data)
    framed_len = real_len + 4
    shape = regularize(framed_len, p)
    out = bytearray()
    out += real_len.to_bytes(4, "big")
    out += data
    pad = shape.padded_bytes - len(out)
    if pad > 0:
        out += b"\x00" * pad
    return bytes(out)


def unpad_payload(padded: bytes) -> bytes:
    """Recover the original payload from a pad_payload() result."""
    if len(padded) < 4:
        raise ValueError("padded payload too short to contain length header")
    real_len = int.from_bytes(padded[:4], "big")
    if real_len < 0 or real_len > len(padded) - 4:
        raise ValueError("corrupt length header")
    return padded[4:4 + real_len]


def overhead_report(real_bytes: int, params: RegularizationParams | None = None) -> dict:
    """Human-facing overhead summary for the privacy/cost tradeoff UI."""
    s = regularize(real_bytes, params)
    return {
        "realBytes": s.real_bytes,
        "paddedBytes": s.padded_bytes,
        "cells": s.cells,
        "overheadBytes": s.overhead_bytes,
        "overheadRatio": round(s.overhead_ratio, 3) if s.overhead_ratio != float("inf") else None,
        "bucket": s.bucket,
    }


def iter_cells(data: bytes, params: RegularizationParams | None = None):
    """Yield the regularized payload as fixed-size cells.

    The data is first framed+padded (pad_payload) to the bucket's
    padded_bytes, then sliced into cell_size chunks. Every cell is exactly
    cell_size bytes, and the *number* of cells equals the bucket — so the
    sequence of writes an observer sees is identical for every payload in
    the same bucket. unpad_payload(b"".join(iter_cells(d))) == d.
    """
    p = params or RegularizationParams()
    padded = pad_payload(data, p)
    for off in range(0, len(padded), p.cell_size):
        yield padded[off:off + p.cell_size]


def emit_paced(data: bytes, write, sleep, params: RegularizationParams | None = None) -> int:
    """Write `data` as constant-rate cells: one cell every rate_interval_ms.

    `write(bytes)` and `sleep(seconds)` are injected so this is testable
    without real time or sockets. The observable (cell sizes + inter-cell
    delay) is a pure function of the bucket. Returns the cell count.

    NOTE: this regularizes the byte stream on whatever link `write` targets.
    See docs/anonymity-value-add.md for WHERE this defends (the i2pd↔eepsite
    path in the remote-daemon topology), and where it does not.
    """
    p = params or RegularizationParams()
    interval_s = p.rate_interval_ms / 1000.0
    n = 0
    for i, cell in enumerate(iter_cells(data, p)):
        if i > 0:
            sleep(interval_s)
        write(cell)
        n += 1
    return n

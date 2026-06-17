"""Phase I.2: per-file and per-eepsite size caps on /publish."""
from __future__ import annotations

import pytest


def test_publish_rejects_oversize_single_file(client):
    daemon_client, _ = client
    big = "x" * (4 * 1024 * 1024 + 1)  # 4 MB + 1 byte
    status, _, body = daemon_client.request(
        "/publish",
        method="POST",
        body={"eepsite": "big", "files": {"index.html": big}},
    )
    assert status == 413
    assert "cap is" in body["error"]
    assert "per file" in body["error"]


def test_publish_accepts_4mb_file_at_cap(client):
    daemon_client, root = client
    at_cap = "x" * (4 * 1024 * 1024)  # exactly 4 MB
    status, _, body = daemon_client.request(
        "/publish",
        method="POST",
        body={"eepsite": "atcap", "files": {"index.html": at_cap}},
    )
    assert status == 200
    assert (root / "atcap.i2p" / "index.html").stat().st_size == 4 * 1024 * 1024


def test_publish_rejects_oversize_total_via_many_files(client):
    daemon_client, _ = client
    files = {f"file{i}.html": "y" * (3 * 1024 * 1024) for i in range(25)}
    # Total ~75 MB > 64 MB eepsite cap, but individual files are under 4 MB.
    # Note: the inbound HTTP request itself maxes at 80 MB so this is in range.
    status, _, body = daemon_client.request(
        "/publish",
        method="POST",
        body={"eepsite": "manyfiles", "files": files},
    )
    assert status == 413
    assert "eepsite total exceeds" in body["error"]


def test_publish_accepts_at_eepsite_cap(client):
    daemon_client, root = client
    # 16 files × 4 MB = 64 MB total — exactly at cap
    files = {f"file{i}.html": "y" * (4 * 1024 * 1024) for i in range(16)}
    status, _, _body = daemon_client.request(
        "/publish",
        method="POST",
        body={"eepsite": "atcap2", "files": files},
    )
    assert status == 200
    written = list((root / "atcap2.i2p").glob("*.html"))
    assert len(written) == 16


def test_publish_rejects_non_string_file_content(client):
    daemon_client, _ = client
    status, _, body = daemon_client.request(
        "/publish",
        method="POST",
        body={"eepsite": "weird", "files": {"index.html": 42}},
    )
    assert status == 400
    assert "must be a string" in body["error"]

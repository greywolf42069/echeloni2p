"""Attestation authority server for bandwidth snapshots.

This is a tiny local authority that issues one-time challenges and signs
accepted bandwidth snapshot attestations. It is intentionally separate
from the main daemon so we can keep the trust boundary narrow.
"""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from pathlib import Path
import json
import logging
import os
import sys

log = logging.getLogger('echelon-attest')

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.bandwidth_attestation import AttestationAuthority, AttestationChallenge, AttestationError, hash_snapshot  # noqa: E402
from scripts import auth as auth_mod  # noqa: E402
from scripts.rate_limiter import RateLimiter  # noqa: E402

HOST = os.environ.get('ECHELON_ATTEST_HOST', '127.0.0.1')
PORT = int(os.environ.get('ECHELON_ATTEST_PORT', '7073'))
authority = AttestationAuthority()


def _ensure_localhost_bind() -> None:
    if HOST not in ('127.0.0.1', 'localhost'):
        raise SystemExit('bandwidth attestation server must bind to localhost only')


class Handler(BaseHTTPRequestHandler):
    rate_limiter = RateLimiter(rate=5.0, capacity=10)

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _check_auth(self, path: str) -> bool:
        """Return True if request is allowed, False if a rejection was sent."""
        if not auth_mod.require_auth_enabled():
            return True
        expected = auth_mod.load_or_create_secret()
        submitted = self.headers.get('X-Echelon-Auth')
        result = auth_mod.auth_status_for(path, submitted, expected, require_auth=True)
        if result is not None:
            status, message = result
            self._send_json(status, {'error': message})
            return False
        return True

    def _check_write_guard(self, method: str) -> bool:
        """Return True if request is allowed, False if rejected."""
        origin = self.headers.get('Origin')
        content_type = self.headers.get('Content-Type')
        result = auth_mod.write_request_rejection(
            origin=origin,
            content_type=content_type,
            method=method,
            allow_match=lambda o: o.startswith(('http://localhost', 'http://127.0.0.1', 'https://localhost')),
        )
        if result is not None:
            status, message = result
            self._send_json(status, {'error': message})
            return False
        return True

    def do_GET(self):  # noqa: N802
        path = urlparse(self.path).path
        if not self._check_auth(path):
            return
        if path == '/health':
            self._send_json(200, {'ok': True, 'service': 'bandwidth-attestation'})
            return
        client = self.client_address[0]
        if not self.rate_limiter.allow(client):
            self._send_json(429, {'error': 'rate limited'})
            return
        if path == '/attest/challenge':
            qs = dict([part.split('=', 1) if '=' in part else (part, '') for part in urlparse(self.path).query.split('&') if part])
            wallet = qs.get('wallet')
            if not wallet:
                self._send_json(400, {'error': 'missing wallet'})
                return
            challenge = authority.issue_challenge(wallet)
            self._send_json(200, challenge.to_dict())
            return
        self._send_json(404, {'error': 'not found'})

    def do_POST(self):  # noqa: N802
        path = urlparse(self.path).path
        if not self._check_auth(path):
            return
        if not self._check_write_guard('POST'):
            return
        client = self.client_address[0]
        if not self.rate_limiter.allow(client):
            self._send_json(429, {'error': 'rate limited'})
            return
        if path != '/attest/submit':
            self._send_json(404, {'error': 'not found'})
            return
        length = int(self.headers.get('Content-Length', '0') or '0')
        if length <= 0:
            self._send_json(400, {'error': 'missing body'})
            return
        try:
            raw = self.rfile.read(length)
            body = json.loads(raw.decode('utf-8'))
        except Exception as exc:  # noqa: BLE001
            self._send_json(400, {'error': 'invalid json'})
            log.warning('invalid json in request body: %s', exc)
            return
        try:
            challenge = AttestationChallenge(
                wallet=body['wallet'],
                issued_at=int(body['issued_at']),
                nonce=body['nonce'],
                ttl_sec=int(body.get('ttl_sec', 300)),
            )
            snapshot = body['snapshot']
            sig = body['signature']
            if not isinstance(snapshot, dict):
                raise ValueError('snapshot must be object')
            snap_hash = hash_snapshot(snapshot)
            record = authority.verify_submission(challenge, snap_hash, sig)
            self._send_json(200, {'ok': True, 'attestation': record.to_dict()})
        except AttestationError as exc:
            self._send_json(exc.status, {'error': exc.message})
        except Exception as exc:  # noqa: BLE001
            self._send_json(400, {'error': 'bad request'})
            log.warning('error processing attest/submit: %s', exc)

    def log_message(self, format, *args):  # noqa: A003
        return


def main() -> None:
    _ensure_localhost_bind()
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f'[echelon-bandwidth-attest] listening on http://{HOST}:{PORT}', flush=True)
    srv.serve_forever()


if __name__ == '__main__':
    main()


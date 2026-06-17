"""Sidecar launcher for Echelon bandwidth status.

This is intentionally tiny so the user does not need to manage any extra
steps. The main app can spawn this sidecar automatically when the app
starts, and poll it for live bandwidth status.

We keep it separate from the main daemon to avoid destabilizing the large
request handler while still providing a single, simple service endpoint.
"""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from pathlib import Path
import json
import os
import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.bandwidth_meter import poll_and_record  # noqa: E402
from scripts import auth as auth_mod  # noqa: E402
from scripts.rate_limiter import RateLimiter  # noqa: E402

HOST = os.environ.get('ECHELON_BW_HOST', '127.0.0.1')
PORT = int(os.environ.get('ECHELON_BW_PORT', '7072'))


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

    def do_GET(self):  # noqa: N802
        path = urlparse(self.path).path
        if not self._check_auth(path):
            return
        if path == '/health':
            self._send_json(200, {'ok': True, 'service': 'bandwidth-sidecar'})
            return
        client = self.client_address[0]
        if not self.rate_limiter.allow(client):
            self._send_json(429, {'error': 'rate limited'})
            return
        if path == '/status/bandwidth':
            qs = parse_qs(urlparse(self.path).query)
            wallet = (qs.get('wallet') or [None])[0]
            tier = (qs.get('tier') or ['free'])[0]
            try:
                payload = poll_and_record(wallet, tier)
                self._send_json(200, payload)
            except Exception as exc:  # noqa: BLE001
                self._send_json(500, {'error': 'bandwidth status unavailable', 'detail': str(exc)})
            return
        self._send_json(404, {'error': 'not found'})

    def log_message(self, format, *args):  # noqa: A003
        return


def main() -> None:
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f'[echelon-bandwidth-sidecar] listening on http://{HOST}:{PORT}', flush=True)
    srv.serve_forever()


if __name__ == '__main__':
    main()

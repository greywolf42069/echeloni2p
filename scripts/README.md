# Echelon Sync Daemon

A tiny zero-dependency Python HTTP service that lets the Echelon PWA in your phone's
browser write eepsite files to disk, where i2pd can serve them.

## Why?

A browser cannot host an I2P eepsite by itself — it has no way to listen for inbound
connections. i2pd can do that, but it serves files from a real on-disk directory.
This daemon is the one-line bridge between "files I'm editing in the Echelon IDE"
and "files i2pd is publishing on the I2P network."

## Quickstart (Termux)

```sh
pkg update -y && pkg install -y python i2pd
python3 scripts/echelon_sync_daemon.py
```

Defaults:

| Setting | Default | Override env var |
|---|---|---|
| Listen host | `127.0.0.1` | `ECHELON_SYNC_HOST` |
| Listen port | `7071` | `ECHELON_SYNC_PORT` |
| Webroot | `~/echelon-eepsites` | `ECHELON_SYNC_ROOT` |

In Echelon's **Settings → Local i2pd / Termux Endpoints**, make sure "Echelon Sync
Daemon" points at the same host:port. Click **Test connections** — the dot turns
green when the daemon is reachable.

## API

| Method | Path | Body | Effect |
|---|---|---|---|
| `GET` | `/health` | — | Liveness probe |
| `GET` | `/list` | — | List published eepsites + their files |
| `POST` | `/publish` | `{"eepsite": "x.i2p", "files": {"index.html": "<...>"}}` | Replace `<root>/x.i2p/` with the supplied tree |
| `DELETE` | `/eepsite/<name>` | — | Wipe a published eepsite directory |

### Example

```sh
curl -X POST http://127.0.0.1:7071/publish \
  -H 'Content-Type: application/json' \
  -d '{"eepsite":"hello.i2p","files":{"index.html":"<h1>Hello</h1>"}}'
```

## Pointing i2pd at it

Add a tunnel in `~/.i2pd/tunnels.conf`:

```ini
[hello]
type = http
host = 127.0.0.1
port = 8080
keys = hello.dat
```

…and run a static-file server inside `~/echelon-eepsites/hello.i2p/` on port 8080
(e.g. `cd ~/echelon-eepsites/hello.i2p && python3 -m http.server 8080`). i2pd will
then publish the eepsite at the destination derived from `hello.dat`.

## Security

This daemon is intended to run on the **same device** as the PWA, on `127.0.0.1`.
It rejects requests whose `Origin` is not a localhost-ish origin. Do not expose it
on a LAN or the public internet — there is no auth.

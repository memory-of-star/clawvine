# ClawVine Relay Deployment

Deploy a Nostr relay node for the ClawVine network using strfry.

## Hardware Requirements

- **CPU:** 1 core
- **RAM:** 1 GB
- **Disk:** 10 GB (for event storage)

## Quick Start

```bash
cd relay
docker compose up -d
```

## Verify It's Working

1. **Check container:** `docker compose ps` — should show `clawvine-relay` running
2. **Test WebSocket:** Use a Nostr client (e.g. Damus, Iris) and add `ws://localhost:7777` (or `wss://your-domain:7777`) as a relay
3. **NIP-11 metadata:** `curl http://localhost:7777` — returns relay info JSON

## Announcing to ClawVine

1. Deploy the relay and ensure it's reachable at a public URL (e.g. `wss://relay.yourdomain.com`)
2. Add your relay URL to the ClawVine default relay list (in `src/types.ts` or via config)
3. Share your relay URL with the ClawVine community so clients can discover it

## Notes

- **Standard Nostr relay:** Any Nostr relay implementation (strfry, nostr-rs-relay, etc.) works with ClawVine.
- **ClawVine event kinds:**
  - **Kind 10333** — Heartbeat (presence/liveness)
  - **Kind 4** — Encrypted DMs (direct messages)

## Data Persistence

Event data is stored in `./data`. Back up this directory to preserve relay history.

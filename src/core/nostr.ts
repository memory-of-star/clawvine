import WebSocket from 'ws';
import {
  finalizeEvent,
  type EventTemplate,
  type VerifiedEvent,
} from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import * as nip04 from 'nostr-tools/nip04';
import { CLAWVINE_HEARTBEAT_KIND, CLAWVINE_DM_KIND, type GossipEnvelope } from '../types.js';

type SubCallback = (event: VerifiedEvent) => void;

interface Subscription {
  id: string;
  filters: Filter[];
  callback: SubCallback;
}

export class NostrClient {
  private sockets: Map<string, WebSocket> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private seenEvents: Set<string> = new Set();
  private subCounter = 0;
  private secretKey: Uint8Array;
  private publicKey: string;

  constructor(secretKey: Uint8Array, publicKey: string) {
    this.secretKey = secretKey;
    this.publicKey = publicKey;
  }

  async connectToRelays(relayUrls: string[]): Promise<void> {
    const promises = relayUrls.map((url) => this.connectToRelay(url));
    await Promise.allSettled(promises);
  }

  private connectToRelay(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`Connection to ${url} timed out`));
      }, 10_000);

      ws.on('open', () => {
        clearTimeout(timeout);
        this.sockets.set(url, ws);
        // Re-establish subscriptions on this relay
        for (const sub of this.subscriptions.values()) {
          this.sendSubscription(ws, sub);
        }
        resolve();
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.sockets.delete(url);
        // Auto-reconnect after 30s
        setTimeout(() => this.connectToRelay(url).catch(() => {}), 30_000);
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private handleMessage(msg: unknown[]): void {
    if (!Array.isArray(msg)) return;

    if (msg[0] === 'EVENT' && msg[1] && msg[2]) {
      const subId = msg[1] as string;
      const event = msg[2] as VerifiedEvent;

      // Deduplicate: same event may arrive from multiple relays
      if (this.seenEvents.has(event.id)) return;
      this.seenEvents.add(event.id);
      // Cap memory: keep last 5000 event IDs
      if (this.seenEvents.size > 5000) {
        const first = this.seenEvents.values().next().value!;
        this.seenEvents.delete(first);
      }

      const sub = this.subscriptions.get(subId);
      if (sub) sub.callback(event);
    }
  }

  private sendSubscription(ws: WebSocket, sub: Subscription): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(['REQ', sub.id, ...sub.filters]));
    }
  }

  async publish(template: EventTemplate): Promise<VerifiedEvent> {
    const event = finalizeEvent(template, this.secretKey);
    const msg = JSON.stringify(['EVENT', event]);
    for (const ws of this.sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
    return event;
  }

  subscribe(filters: Filter[], callback: SubCallback): string {
    const id = `cv_${++this.subCounter}`;
    const sub: Subscription = { id, filters, callback };
    this.subscriptions.set(id, sub);
    for (const ws of this.sockets.values()) {
      this.sendSubscription(ws, sub);
    }
    return id;
  }

  unsubscribe(id: string): void {
    this.subscriptions.delete(id);
    const msg = JSON.stringify(['CLOSE', id]);
    for (const ws of this.sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  // ── ClawVine-Specific Helpers ──

  async publishHeartbeat(): Promise<VerifiedEvent> {
    return this.publish({
      kind: CLAWVINE_HEARTBEAT_KIND,
      content: JSON.stringify({
        protocol: 'clawvine',
        version: '0.0.0',
        capabilities: ['paillier-2048'],
      }),
      tags: [['d', 'clawvine-heartbeat']],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  subscribeToHeartbeats(callback: (pubkey: string, content: string) => void): string {
    return this.subscribe(
      [{ kinds: [CLAWVINE_HEARTBEAT_KIND], '#d': ['clawvine-heartbeat'] }],
      (event) => callback(event.pubkey, event.content),
    );
  }

  async sendEncryptedDM(recipientPubkey: string, envelope: GossipEnvelope): Promise<void> {
    const plaintext = JSON.stringify(envelope);
    const ciphertext = await nip04.encrypt(this.secretKey, recipientPubkey, plaintext);
    await this.publish({
      kind: CLAWVINE_DM_KIND,
      content: ciphertext,
      tags: [['p', recipientPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  subscribeToEncryptedDMs(callback: (senderPubkey: string, envelope: GossipEnvelope) => void): string {
    const since = Math.floor(Date.now() / 1000) - 60; // only events from ~1 min ago onward
    return this.subscribe(
      [{ kinds: [CLAWVINE_DM_KIND], '#p': [this.publicKey], since }],
      async (event) => {
        try {
          const plaintext = await nip04.decrypt(this.secretKey, event.pubkey, event.content);
          const envelope = JSON.parse(plaintext) as GossipEnvelope;
          if (envelope.protocol === 'clawvine') {
            callback(event.pubkey, envelope);
          }
        } catch {
          // Not a ClawVine message or decryption failed
        }
      },
    );
  }

  getConnectedRelayCount(): number {
    let count = 0;
    for (const ws of this.sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) count++;
    }
    return count;
  }

  disconnect(): void {
    for (const ws of this.sockets.values()) {
      ws.close();
    }
    this.sockets.clear();
    this.subscriptions.clear();
  }
}

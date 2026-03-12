import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  type ClawVineConfig,
  type StoredIdentity,
  type InterestProfile,
  type AgentContext,
  type AgentMemoryEntry,
  type MatchRecord,
  type PeerRecord,
  type GossipRoundStats,
  type ClawVineNotification,
  type ChatMessage,
  DEFAULT_CONFIG,
} from '../types.js';

const CLAWVINE_DIR = join(homedir(), '.clawvine');
const CONFIG_FILE = join(CLAWVINE_DIR, 'config.json');
const IDENTITY_FILE = join(CLAWVINE_DIR, 'identity.json');
const PROFILE_FILE = join(CLAWVINE_DIR, 'profile.json');
const MATCHES_FILE = join(CLAWVINE_DIR, 'matches.json');
const PEERS_FILE = join(CLAWVINE_DIR, 'peers.json');
const STATS_FILE = join(CLAWVINE_DIR, 'stats.json');
const NOTIFICATIONS_FILE = join(CLAWVINE_DIR, 'notifications.json');
const CHAT_FILE = join(CLAWVINE_DIR, 'chat.json');
const AGENT_CONTEXT_FILE = join(CLAWVINE_DIR, 'agent-context.json');

export function getClawVineDir(): string {
  return CLAWVINE_DIR;
}

export function ensureDir(): void {
  if (!existsSync(CLAWVINE_DIR)) {
    mkdirSync(CLAWVINE_DIR, { recursive: true });
  }
}

export function isInitialized(): boolean {
  return existsSync(IDENTITY_FILE) && existsSync(CONFIG_FILE);
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function writeJson(path: string, data: unknown): void {
  ensureDir();
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Config ──

export function loadConfig(): ClawVineConfig {
  return { ...DEFAULT_CONFIG, ...readJson<Partial<ClawVineConfig>>(CONFIG_FILE, {}) };
}

export function saveConfig(config: ClawVineConfig): void {
  writeJson(CONFIG_FILE, config);
}

// ── Identity ──

export function loadIdentity(): StoredIdentity | null {
  return readJson<StoredIdentity | null>(IDENTITY_FILE, null);
}

export function saveIdentity(identity: StoredIdentity): void {
  writeJson(IDENTITY_FILE, identity);
}

// ── Profile ──

export function loadProfile(): InterestProfile | null {
  return readJson<InterestProfile | null>(PROFILE_FILE, null);
}

export function saveProfile(profile: InterestProfile): void {
  writeJson(PROFILE_FILE, profile);
}

// ── Matches ──

export function loadMatches(): MatchRecord[] {
  return readJson<MatchRecord[]>(MATCHES_FILE, []);
}

export function saveMatches(matches: MatchRecord[]): void {
  writeJson(MATCHES_FILE, matches);
}

export function addMatch(match: MatchRecord): void {
  const matches = loadMatches();

  // Primary dedup: same peer should only have one match record
  const byPeer = matches.findIndex((m) => m.peerNpub === match.peerNpub);
  if (byPeer >= 0) {
    // Keep the higher-status or newer record
    const old = matches[byPeer];
    matches[byPeer] = {
      ...old,
      ...match,
      id: old.id, // preserve original id
      createdAt: old.createdAt, // preserve original creation time
      similarity: Math.max(old.similarity, match.similarity),
    };
    saveMatches(matches);
    return;
  }

  // Secondary dedup: same match id
  const byId = matches.findIndex((m) => m.id === match.id);
  if (byId >= 0) {
    matches[byId] = match;
  } else {
    matches.push(match);
  }
  saveMatches(matches);
}

// ── Peers ──

export function loadPeers(): PeerRecord[] {
  return readJson<PeerRecord[]>(PEERS_FILE, []);
}

export function savePeers(peers: PeerRecord[]): void {
  writeJson(PEERS_FILE, peers);
}

export function upsertPeer(peer: PeerRecord): void {
  const peers = loadPeers();
  const idx = peers.findIndex((p) => p.npub === peer.npub);
  if (idx >= 0) {
    peers[idx] = { ...peers[idx], ...peer };
  } else {
    peers.push(peer);
  }
  savePeers(peers);
}

// ── Stats ──

export function loadStats(): GossipRoundStats[] {
  return readJson<GossipRoundStats[]>(STATS_FILE, []);
}

export function appendStats(stats: GossipRoundStats): void {
  const all = loadStats();
  all.push(stats);
  // keep last 100 rounds
  if (all.length > 100) all.splice(0, all.length - 100);
  writeJson(STATS_FILE, all);
}

// ── Notifications ──

export function loadNotifications(): ClawVineNotification[] {
  return readJson<ClawVineNotification[]>(NOTIFICATIONS_FILE, []);
}

export function pushNotification(notification: ClawVineNotification): void {
  const all = loadNotifications();
  all.push(notification);
  if (all.length > 200) all.splice(0, all.length - 200);
  writeJson(NOTIFICATIONS_FILE, all);
}

export function clearNotifications(): ClawVineNotification[] {
  const all = loadNotifications();
  writeJson(NOTIFICATIONS_FILE, []);
  return all;
}

// ── Chat ──

export function loadChat(): ChatMessage[] {
  return readJson<ChatMessage[]>(CHAT_FILE, []);
}

export function appendChat(msg: ChatMessage): void {
  const all = loadChat();
  all.push(msg);
  if (all.length > 1000) all.splice(0, all.length - 1000);
  writeJson(CHAT_FILE, all);
}

export function loadChatWith(peerNpub: string): ChatMessage[] {
  return loadChat().filter((m) => m.peerNpub === peerNpub);
}

// ── Agent Context (PRIVATE — never transmitted over the network) ──

export function loadAgentContext(): AgentContext {
  return readJson<AgentContext>(AGENT_CONTEXT_FILE, { memories: [], updatedAt: 0 });
}

export function addAgentMemory(entry: AgentMemoryEntry): void {
  const ctx = loadAgentContext();
  ctx.memories.push(entry);
  if (ctx.memories.length > 500) ctx.memories.splice(0, ctx.memories.length - 500);
  ctx.updatedAt = Date.now();
  writeJson(AGENT_CONTEXT_FILE, ctx);
}

export function clearAgentContext(): void {
  writeJson(AGENT_CONTEXT_FILE, { memories: [], updatedAt: 0 });
}

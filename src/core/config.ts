import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  type ClawVineConfig,
  type StoredIdentity,
  type InterestProfile,
  type MatchRecord,
  type PeerRecord,
  type GossipRoundStats,
  DEFAULT_CONFIG,
} from '../types.js';

const CLAWVINE_DIR = join(homedir(), '.clawvine');
const CONFIG_FILE = join(CLAWVINE_DIR, 'config.json');
const IDENTITY_FILE = join(CLAWVINE_DIR, 'identity.json');
const PROFILE_FILE = join(CLAWVINE_DIR, 'profile.json');
const MATCHES_FILE = join(CLAWVINE_DIR, 'matches.json');
const PEERS_FILE = join(CLAWVINE_DIR, 'peers.json');
const STATS_FILE = join(CLAWVINE_DIR, 'stats.json');

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
  const existing = matches.findIndex((m) => m.id === match.id);
  if (existing >= 0) {
    matches[existing] = match;
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

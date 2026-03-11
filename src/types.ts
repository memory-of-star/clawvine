// ── ClawVine Type Definitions ──

export interface ClawVineConfig {
  version: string;
  relays: string[];
  gossipIntervalMs: number;
  peersPerRound: number;
  similarityThreshold: number;
  profileDimensions: number;
  heKeyBits: number;
  scaleFactory: number;
}

export const DEFAULT_CONFIG: ClawVineConfig = {
  version: '0.1.0',
  relays: [
    'wss://relay.clawvine.net',
    'wss://relay2.clawvine.net',
    'wss://nos.lol',
  ],
  gossipIntervalMs: 6 * 60 * 60 * 1000, // 6 hours
  peersPerRound: 20,
  similarityThreshold: 0.6,
  profileDimensions: 128,
  heKeyBits: 2048,
  scaleFactory: 1_000_000,
};

export interface SerializedPaillierPublicKey {
  n: string;
  g: string;
}

export interface SerializedPaillierPrivateKey {
  lambda: string;
  mu: string;
  n: string;
  g: string;
}

export interface AgentIdentity {
  nostrSecretKey: Uint8Array;
  nostrPublicKey: string;
  hePublicKey: SerializedPaillierPublicKey;
  hePrivateKey: SerializedPaillierPrivateKey;
}

export interface StoredIdentity {
  nostrSecretKeyHex: string;
  nostrPublicKeyHex: string;
  hePublicKey: SerializedPaillierPublicKey;
  hePrivateKey: SerializedPaillierPrivateKey;
}

export interface InterestProfile {
  vector: number[];
  tags: string[];
  summary: string;
  updatedAt: number;
}

// ── Gossip Protocol Messages ──

export type GossipMessageType =
  | 'gossip_request'
  | 'gossip_response'
  | 'deep_chat'
  | 'match_proposal'
  | 'referral';

export interface GossipEnvelope {
  protocol: 'clawvine';
  version: string;
  type: GossipMessageType;
  payload: unknown;
  timestamp: number;
}

export interface GossipRequest {
  hePublicKey: SerializedPaillierPublicKey;
  encryptedVector: string[];
  dim: number;
}

export interface GossipResponse {
  encryptedScore: string;
  referrals: string[];
}

export interface DeepChatMessage {
  round: number;
  content: string;
}

export interface MatchProposal {
  matchId: string;
  similarityScore: number;
  report: string;
  agentSummary: string;
}

export interface ReferralMessage {
  peers: ReferredPeer[];
}

export interface ReferredPeer {
  npub: string;
  reason: string;
  estimatedRelevance: number;
}

// ── Match Records ──

export interface MatchRecord {
  id: string;
  peerNpub: string;
  similarity: number;
  status: 'pending_local' | 'approved_local' | 'rejected' | 'mutual' | 'expired';
  report: string;
  createdAt: number;
  updatedAt: number;
}

// ── Network State ──

export interface PeerRecord {
  npub: string;
  lastSeen: number;
  gossipCount: number;
  referredBy?: string;
}

export interface GossipRoundStats {
  roundNumber: number;
  startedAt: number;
  peersContacted: number;
  matchesFound: number;
  referralsReceived: number;
  durationMs: number;
}

// ── Nostr Event Kinds ──

export const CLAWVINE_HEARTBEAT_KIND = 10333;
export const CLAWVINE_DM_KIND = 4;

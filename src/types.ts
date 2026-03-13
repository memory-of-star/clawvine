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
  version: '0.0.0',
  relays: [
    'wss://relay.clawvine.net',
    'wss://relay2.clawvine.net',
    'wss://nos.lol',
  ],
  gossipIntervalMs: 6 * 60 * 60 * 1000, // 6 hours
  peersPerRound: 20,
  similarityThreshold: 0.6,
  profileDimensions: 768,
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

/**
 * Human-authored profile fields. Only these are shared with mutual matches.
 * The `vector` is derived from BOTH human profile AND agent context, but
 * only ever transmitted in Paillier-encrypted form — never plaintext.
 */
export interface InterestProfile {
  vector: number[];
  tags: string[];
  summary: string;
  intro: string;
  updatedAt: number;
}

/**
 * PRIVATE agent context — observations from chat history, files, etc.
 * Used ONLY to enrich the matching vector locally.
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  NEVER include any field from AgentContext in a network message ║
 * ║  NEVER include in ProfileExchange, MatchProposal, or chat      ║
 * ║  NEVER expose to the human's match counterpart in any form     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
export interface AgentContext {
  memories: AgentMemoryEntry[];
  /** Agent-maintained summary of all memories, kept ≤256 tokens for embedding */
  memorySummary: string;
  updatedAt: number;
}

export interface AgentMemoryEntry {
  content: string;
  addedAt: number;
}

// ── Gossip Protocol Messages ──

export type GossipMessageType =
  | 'gossip_request'
  | 'gossip_response'
  | 'deep_chat'
  | 'match_proposal'
  | 'match_approval'
  | 'profile_exchange'
  | 'referral'
  | 'agent_chat';

export interface MatchApproval {
  peerNpub: string;
}

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
  /** Must ONLY contain the human-authored summary, never agent memory content */
  agentSummary: string;
}

export interface ProfileExchange {
  tags: string[];
  summary: string;
  intro: string;
}

export interface PeerProfile {
  tags: string[];
  summary: string;
  intro: string;
  receivedAt: number;
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
  peerProfile?: PeerProfile;
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

export interface AgentChatMessage {
  text: string;
}

// ── Chat Inbox ──

export interface ChatMessage {
  id: string;
  peerNpub: string;
  direction: 'in' | 'out';
  text: string;
  timestamp: number;
}

// ── Notifications ──

export interface ClawVineNotification {
  id: string;
  type: 'new_match' | 'mutual_match' | 'peer_approved' | 'new_message';
  matchId: string;
  peerNpub: string;
  similarity: number;
  summary: string;
  timestamp: number;
}

// ── Nostr Event Kinds ──

export const CLAWVINE_HEARTBEAT_KIND = 10333;
export const CLAWVINE_DM_KIND = 4;

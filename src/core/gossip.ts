import { randomBytes } from 'node:crypto';
import { bytesToHex } from '@noble/hashes/utils';
import type {
  ClawVineConfig,
  AgentIdentity,
  InterestProfile,
  GossipEnvelope,
  GossipRequest,
  GossipResponse,
  MatchProposal,
  MatchApproval,
  ReferralMessage,
  MatchRecord,
  PeerRecord,
  GossipRoundStats,
  ClawVineNotification,
} from '../types.js';
import { NostrClient } from './nostr.js';
import {
  prepareGossipVector,
  handleGossipRequest,
  decryptScore,
  deserializeEncryptedVector,
} from './encryption.js';
import { deserializePaillierPrivate, getNpub } from './identity.js';
import {
  loadPeers,
  upsertPeer,
  addMatch,
  appendStats,
  loadMatches,
  pushNotification,
} from './config.js';

interface PendingGossip {
  peerPubkey: string;
  sentAt: number;
}

export type MatchNotifyCallback = (match: MatchRecord, event: 'new' | 'mutual') => void;

export class GossipEngine {
  private client: NostrClient;
  private config: ClawVineConfig;
  private identity: AgentIdentity;
  private profile: InterestProfile;
  private knownPeers: Map<string, PeerRecord> = new Map();
  private pendingRequests: Map<string, PendingGossip> = new Map();
  private roundNumber = 0;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private onMatchNotify: MatchNotifyCallback | null = null;
  private handlersReady = false;

  constructor(
    client: NostrClient,
    config: ClawVineConfig,
    identity: AgentIdentity,
    profile: InterestProfile,
  ) {
    this.client = client;
    this.config = config;
    this.identity = identity;
    this.profile = profile;

    for (const peer of loadPeers()) {
      this.knownPeers.set(peer.npub, peer);
    }
  }

  onMatch(callback: MatchNotifyCallback): void {
    this.onMatchNotify = callback;
  }

  private notifyMatch(match: MatchRecord, event: 'new' | 'mutual'): void {
    const notification: ClawVineNotification = {
      id: bytesToHex(randomBytes(8)),
      type: event === 'new' ? 'new_match' : 'mutual_match',
      matchId: match.id,
      peerNpub: match.peerNpub,
      similarity: match.similarity,
      summary: match.report.split('\n')[0],
      timestamp: Date.now(),
    };
    pushNotification(notification);
    if (this.onMatchNotify) this.onMatchNotify(match, event);
  }

  /**
   * Set up message handlers so this agent can RECEIVE gossip requests,
   * responses, proposals, and approvals. Must be called before any
   * round for bidirectional communication.
   */
  listen(): void {
    if (this.handlersReady) return;
    this.setupMessageHandlers();
    this.handlersReady = true;
  }

  async start(): Promise<void> {
    this.listen();
    await this.client.publishHeartbeat();

    // Run first round immediately
    await this.runGossipRound();

    // Schedule subsequent rounds
    this.intervalHandle = setInterval(
      () => this.runGossipRound(),
      this.config.gossipIntervalMs,
    );
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  updateProfile(profile: InterestProfile): void {
    this.profile = profile;
  }

  private setupMessageHandlers(): void {
    // Listen for other agents' heartbeats to discover peers
    this.client.subscribeToHeartbeats((pubkey, content) => {
      if (pubkey === this.identity.nostrPublicKey) return;
      try {
        const data = JSON.parse(content);
        if (data.protocol === 'clawvine') {
          this.registerPeer(pubkey);
        }
      } catch { /* ignore */ }
    });

    // Listen for incoming gossip DMs
    this.client.subscribeToEncryptedDMs((senderPubkey, envelope) => {
      this.handleGossipMessage(senderPubkey, envelope);
    });
  }

  private registerPeer(pubkey: string): void {
    const npub = getNpub(pubkey);
    const existing = this.knownPeers.get(npub);
    const peer: PeerRecord = {
      npub,
      lastSeen: Date.now(),
      gossipCount: existing?.gossipCount ?? 0,
      referredBy: existing?.referredBy,
    };
    this.knownPeers.set(npub, peer);
    upsertPeer(peer);
  }

  async runGossipRound(): Promise<GossipRoundStats> {
    this.roundNumber++;
    const startTime = Date.now();
    let matchesFound = 0;
    let referralsReceived = 0;

    // Refresh heartbeat
    await this.client.publishHeartbeat();

    // Send approval notifications for any locally-approved matches
    await this.sendPendingApprovals();

    // Select peers: random + referred
    const selectedPeers = this.selectPeers();

    // Prepare encrypted interest vector
    const { serialized } = prepareGossipVector(
      this.profile.vector,
      deserializePaillierPublic(this.identity.hePublicKey),
    );

    // Send gossip requests to all selected peers
    for (const peerNpub of selectedPeers) {
      const peerPubkey = npubToPubkey(peerNpub);
      if (!peerPubkey) continue;

      const request: GossipRequest = {
        hePublicKey: this.identity.hePublicKey,
        encryptedVector: serialized,
        dim: this.config.profileDimensions,
      };

      const envelope: GossipEnvelope = {
        protocol: 'clawvine',
        version: this.config.version,
        type: 'gossip_request',
        payload: request,
        timestamp: Date.now(),
      };

      try {
        await this.client.sendEncryptedDM(peerPubkey, envelope);
        this.pendingRequests.set(peerPubkey, { peerPubkey, sentAt: Date.now() });
      } catch {
        // peer unreachable, skip
      }
    }

    const stats: GossipRoundStats = {
      roundNumber: this.roundNumber,
      startedAt: startTime,
      peersContacted: selectedPeers.length,
      matchesFound,
      referralsReceived,
      durationMs: Date.now() - startTime,
    };

    appendStats(stats);
    return stats;
  }

  private selectPeers(): string[] {
    const allPeers = Array.from(this.knownPeers.keys()).filter(
      (npub) => npub !== getNpub(this.identity.nostrPublicKey),
    );

    // Already matched peers — lower priority
    const existingMatches = new Set(loadMatches().map((m) => m.peerNpub));

    // Split into referred and general pools
    const referred = allPeers.filter(
      (p) => this.knownPeers.get(p)?.referredBy && !existingMatches.has(p),
    );
    const general = allPeers.filter(
      (p) => !this.knownPeers.get(p)?.referredBy && !existingMatches.has(p),
    );

    const selected: string[] = [];
    const target = Math.min(this.config.peersPerRound, allPeers.length);

    // Prioritize referred peers (up to half the slots)
    const referredSlots = Math.min(Math.floor(target / 2), referred.length);
    shuffle(referred);
    selected.push(...referred.slice(0, referredSlots));

    // Fill remaining with random general peers
    shuffle(general);
    const remaining = target - selected.length;
    selected.push(...general.slice(0, remaining));

    return selected;
  }

  private async handleGossipMessage(senderPubkey: string, envelope: GossipEnvelope): Promise<void> {
    switch (envelope.type) {
      case 'gossip_request':
        await this.handleIncomingRequest(senderPubkey, envelope.payload as GossipRequest);
        break;
      case 'gossip_response':
        await this.handleIncomingResponse(senderPubkey, envelope.payload as GossipResponse);
        break;
      case 'referral':
        this.handleReferral(senderPubkey, envelope.payload as ReferralMessage);
        break;
      case 'match_proposal':
        this.handleMatchProposal(senderPubkey, envelope.payload as MatchProposal);
        break;
      case 'match_approval':
        this.handleMatchApproval(senderPubkey);
        break;
    }
  }

  private async handleIncomingRequest(senderPubkey: string, request: GossipRequest): Promise<void> {
    this.registerPeer(senderPubkey);

    // Compute encrypted similarity using sender's HE public key and our plaintext vector
    const encryptedScoreHex = handleGossipRequest(
      request.encryptedVector,
      request.hePublicKey,
      this.profile.vector,
    );

    // Collect referrals: peers we've interacted with that might match the sender
    const referrals = this.generateReferrals(senderPubkey);

    const response: GossipResponse = {
      encryptedScore: encryptedScoreHex,
      referrals,
    };

    const envelope: GossipEnvelope = {
      protocol: 'clawvine',
      version: this.config.version,
      type: 'gossip_response',
      payload: response,
      timestamp: Date.now(),
    };

    await this.client.sendEncryptedDM(senderPubkey, envelope);
  }

  private async handleIncomingResponse(senderPubkey: string, response: GossipResponse): Promise<void> {
    this.pendingRequests.delete(senderPubkey);

    // Decrypt the similarity score
    const privateKey = deserializePaillierPrivate(this.identity.hePrivateKey);
    const encryptedScore = BigInt('0x' + response.encryptedScore);
    const similarity = decryptScore(encryptedScore, privateKey);

    const peerNpub = getNpub(senderPubkey);

    // Process referrals
    if (response.referrals?.length) {
      for (const refNpub of response.referrals) {
        if (!this.knownPeers.has(refNpub)) {
          const peer: PeerRecord = {
            npub: refNpub,
            lastSeen: 0,
            gossipCount: 0,
            referredBy: peerNpub,
          };
          this.knownPeers.set(refNpub, peer);
          upsertPeer(peer);
        }
      }
    }

    // Check if similarity exceeds threshold
    if (similarity >= this.config.similarityThreshold) {
      // Skip if we already have a match with this peer
      const existingMatch = loadMatches().find((m) => m.peerNpub === peerNpub);
      if (existingMatch) {
        // Update similarity if it improved, but don't create duplicate
        if (similarity > existingMatch.similarity) {
          existingMatch.similarity = similarity;
          existingMatch.updatedAt = Date.now();
          addMatch(existingMatch);
        }
        return;
      }

      const matchId = bytesToHex(randomBytes(16));
      const match: MatchRecord = {
        id: matchId,
        peerNpub,
        similarity,
        status: 'pending_local',
        report: `Cosine similarity: ${similarity.toFixed(4)}. Matched via gossip round #${this.roundNumber}.`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      addMatch(match);
      this.notifyMatch(match, 'new');

      // Send match proposal to the peer
      const proposal: MatchProposal = {
        matchId,
        similarityScore: similarity,
        report: `Our agents found a potential connection (similarity: ${similarity.toFixed(2)}).`,
        agentSummary: this.profile.summary,
      };

      const envelope: GossipEnvelope = {
        protocol: 'clawvine',
        version: this.config.version,
        type: 'match_proposal',
        payload: proposal,
        timestamp: Date.now(),
      };

      await this.client.sendEncryptedDM(senderPubkey, envelope);
    }
  }

  private handleReferral(senderPubkey: string, message: ReferralMessage): void {
    const senderNpub = getNpub(senderPubkey);
    for (const ref of message.peers) {
      if (!this.knownPeers.has(ref.npub)) {
        const peer: PeerRecord = {
          npub: ref.npub,
          lastSeen: 0,
          gossipCount: 0,
          referredBy: senderNpub,
        };
        this.knownPeers.set(ref.npub, peer);
        upsertPeer(peer);
      }
    }
  }

  private handleMatchProposal(senderPubkey: string, proposal: MatchProposal): void {
    const peerNpub = getNpub(senderPubkey);
    const existing = loadMatches().find((m) => m.peerNpub === peerNpub);

    if (!existing) {
      // New match from peer
      const match: MatchRecord = {
        id: proposal.matchId,
        peerNpub,
        similarity: proposal.similarityScore,
        status: 'pending_local',
        report: `${proposal.report}\nPeer summary: ${proposal.agentSummary}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      addMatch(match);
      this.notifyMatch(match, 'new');
      return;
    }

    // Already have a match with this peer — update with peer's info
    if (existing.status === 'approved_local') {
      existing.status = 'mutual';
      existing.updatedAt = Date.now();
      existing.report += `\nMutual match confirmed! Peer summary: ${proposal.agentSummary}`;
      addMatch(existing);
      this.notifyMatch(existing, 'mutual');
    } else if (existing.status === 'pending_local') {
      existing.report += `\nPeer also matched! Peer summary: ${proposal.agentSummary}`;
      existing.updatedAt = Date.now();
      addMatch(existing);
    }
  }

  private handleMatchApproval(senderPubkey: string): void {
    const peerNpub = getNpub(senderPubkey);
    const existing = loadMatches().find((m) => m.peerNpub === peerNpub);
    if (!existing) return;

    if (existing.status === 'approved_local') {
      existing.status = 'mutual';
      existing.updatedAt = Date.now();
      existing.report += '\nMutual match confirmed! Both humans approved.';
      addMatch(existing);
      this.notifyMatch(existing, 'mutual');
    } else if (existing.status === 'pending_local') {
      existing.report += '\nPeer has approved this match! Waiting for your approval.';
      existing.updatedAt = Date.now();
      addMatch(existing);
      pushNotification({
        id: bytesToHex(randomBytes(8)),
        type: 'peer_approved',
        matchId: existing.id,
        peerNpub: existing.peerNpub,
        similarity: existing.similarity,
        summary: 'Peer approved — waiting for your approval.',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Send match_approval notifications for all locally-approved matches
   * that haven't become mutual yet.
   */
  private async sendPendingApprovals(): Promise<void> {
    const approvedMatches = loadMatches().filter((m) => m.status === 'approved_local');

    for (const match of approvedMatches) {
      const peerPubkey = npubToPubkey(match.peerNpub);
      if (!peerPubkey) continue;

      const approval: MatchApproval = { peerNpub: getNpub(this.identity.nostrPublicKey) };
      const envelope: GossipEnvelope = {
        protocol: 'clawvine',
        version: this.config.version,
        type: 'match_approval',
        payload: approval,
        timestamp: Date.now(),
      };

      try {
        await this.client.sendEncryptedDM(peerPubkey, envelope);
      } catch {
        // peer unreachable, will retry next round
      }
    }
  }

  private generateReferrals(forPubkey: string): string[] {
    // Suggest peers we've had high-similarity interactions with
    const matches = loadMatches()
      .filter((m) => m.similarity >= this.config.similarityThreshold)
      .filter((m) => m.peerNpub !== getNpub(forPubkey))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);

    return matches.map((m) => m.peerNpub);
  }
}

// ── Helpers ──

import { decode } from 'nostr-tools/nip19';
import { deserializePaillierPublic } from './identity.js';

function npubToPubkey(npub: string): string | null {
  try {
    if (npub.startsWith('npub1')) {
      const { data } = decode(npub);
      return data as string;
    }
    return npub; // already hex
  } catch {
    return null;
  }
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

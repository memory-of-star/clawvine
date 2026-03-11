import chalk from 'chalk';
import { isInitialized, loadConfig, loadPeers, loadMatches, loadStats } from '../core/config.js';
import { restoreIdentity, getNpub } from '../core/identity.js';
import { getProfile } from '../core/profile.js';

export function statusCommand(): void {
  if (!isInitialized()) {
    console.log(chalk.red('ClawVine is not initialized. Run: clawvine init'));
    return;
  }

  const config = loadConfig();
  const identity = restoreIdentity();
  const profile = getProfile();
  const peers = loadPeers();
  const matches = loadMatches();
  const stats = loadStats();

  console.log(chalk.bold('\n🌿 ClawVine Status\n'));

  // Identity
  if (identity) {
    console.log(chalk.bold('Identity'));
    console.log(`  npub: ${chalk.cyan(getNpub(identity.nostrPublicKey))}`);
    console.log(`  HE key: ${chalk.green('Paillier 2048-bit ✓')}`);
  }

  // Config
  console.log(chalk.bold('\nNetwork'));
  console.log(`  Relays: ${config.relays.join(', ')}`);
  console.log(`  Gossip interval: ${config.gossipIntervalMs / 1000 / 60 / 60}h`);
  console.log(`  Peers per round: ${config.peersPerRound}`);
  console.log(`  Similarity threshold: ${config.similarityThreshold}`);

  // Profile
  console.log(chalk.bold('\nProfile'));
  if (profile) {
    console.log(`  Tags: ${profile.tags.join(', ')}`);
    console.log(`  Summary: ${profile.summary}`);
    console.log(`  Updated: ${new Date(profile.updatedAt).toLocaleString()}`);
    const nonZero = profile.vector.filter((v) => v !== 0).length;
    console.log(`  Vector dimensions: ${nonZero}/${profile.vector.length} active`);
  } else {
    console.log(chalk.yellow('  Not set. Run: clawvine profile --tags "your,interests"'));
  }

  // Network
  console.log(chalk.bold('\nPeers'));
  console.log(`  Known: ${peers.length}`);
  const recentPeers = peers.filter((p) => Date.now() - p.lastSeen < 24 * 60 * 60 * 1000);
  console.log(`  Active (24h): ${recentPeers.length}`);
  const referredPeers = peers.filter((p) => p.referredBy);
  console.log(`  Via referral: ${referredPeers.length}`);

  // Matches
  console.log(chalk.bold('\nMatches'));
  const mutual = matches.filter((m) => m.status === 'mutual');
  const pending = matches.filter((m) => m.status === 'pending_local');
  const approved = matches.filter((m) => m.status === 'approved_local');
  console.log(`  Mutual: ${chalk.green(String(mutual.length))}`);
  console.log(`  Pending your approval: ${chalk.yellow(String(pending.length))}`);
  console.log(`  Approved (waiting for peer): ${approved.length}`);
  console.log(`  Total: ${matches.length}`);

  // Gossip stats
  if (stats.length > 0) {
    const last = stats[stats.length - 1];
    console.log(chalk.bold('\nLast Gossip Round'));
    console.log(`  Round #${last.roundNumber}`);
    console.log(`  Time: ${new Date(last.startedAt).toLocaleString()}`);
    console.log(`  Peers contacted: ${last.peersContacted}`);
    console.log(`  Duration: ${last.durationMs}ms`);
    console.log(`  Total rounds: ${stats.length}`);
  }

  console.log('');
}

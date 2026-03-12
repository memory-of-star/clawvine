import chalk from 'chalk';
import { loadConfig, isInitialized } from '../core/config.js';
import { restoreIdentity } from '../core/identity.js';
import { getProfile } from '../core/profile.js';
import { NostrClient } from '../core/nostr.js';
import { GossipEngine } from '../core/gossip.js';

export async function startCommand(options: { once?: boolean; wait?: number }): Promise<void> {
  if (!isInitialized()) {
    console.log(chalk.red('ClawVine is not initialized. Run: clawvine init'));
    return;
  }

  const identity = restoreIdentity();
  if (!identity) {
    console.log(chalk.red('Failed to load identity. Try reinitializing.'));
    return;
  }

  const profile = getProfile();
  if (!profile) {
    console.log(chalk.red('No profile set. Run: clawvine profile --tags "your,interests"'));
    return;
  }

  const config = loadConfig();

  console.log(chalk.bold('\n🌿 Starting ClawVine gossip engine...\n'));

  const client = new NostrClient(identity.nostrSecretKey, identity.nostrPublicKey);
  console.log(`Connecting to ${config.relays.length} relay(s)...`);
  await client.connectToRelays(config.relays);

  const connected = client.getConnectedRelayCount();
  if (connected === 0) {
    console.log(chalk.red('Failed to connect to any relay. Check your network and relay URLs.'));
    client.disconnect();
    return;
  }
  console.log(chalk.green(`✓ Connected to ${connected} relay(s)`));

  const engine = new GossipEngine(client, config, identity, profile);

  engine.onMatch((match, event) => {
    if (event === 'new') {
      console.log(chalk.bold.yellow(`\n🔔 NEW MATCH FOUND!`));
      console.log(`  ID:         ${match.id}`);
      console.log(`  Peer:       ${match.peerNpub.slice(0, 20)}...`);
      console.log(`  Similarity: ${(match.similarity * 100).toFixed(1)}%`);
      console.log(`  Report:     ${match.report.split('\n')[0]}`);
      console.log(chalk.cyan(`  → Run "clawvine matches" to review, "clawvine approve ${match.id}" to approve\n`));
    } else if (event === 'mutual') {
      console.log(chalk.bold.green(`\n🎉 MUTUAL MATCH!`));
      console.log(`  ID:         ${match.id}`);
      console.log(`  Peer:       ${match.peerNpub.slice(0, 20)}...`);
      console.log(`  Both humans have approved this connection!\n`);
    }
  });

  if (options.once) {
    // --once: set up listeners, run one round, wait for responses, then exit
    engine.listen();
    await client.publishHeartbeat();

    console.log(chalk.cyan('\nRunning single gossip round...'));
    const stats = await engine.runGossipRound();
    console.log(chalk.green(`\n✓ Round #${stats.roundNumber} complete`));
    console.log(`  Peers contacted: ${stats.peersContacted}`);
    console.log(`  Matches found: ${stats.matchesFound}`);
    console.log(`  Duration: ${stats.durationMs}ms`);

    const waitSec = options.wait ?? 30;
    console.log(chalk.cyan(`\nListening for responses for ${waitSec}s...`));
    await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
    console.log(chalk.green('✓ Done.'));
    client.disconnect();
    return;
  }

  // Daemon mode: run continuously
  console.log(chalk.cyan('\nGossip engine running continuously. Press Ctrl+C to stop.\n'));
  console.log(`  Interval: every ${config.gossipIntervalMs / 1000 / 60} minutes`);
  console.log(`  Peers per round: ${config.peersPerRound}`);
  console.log(`  Similarity threshold: ${config.similarityThreshold}`);
  console.log(`  Profile tags: ${profile.tags.join(', ')}`);
  console.log(chalk.dim('  Matches will appear here as they are discovered.\n'));

  await engine.start();

  const shutdown = () => {
    console.log(chalk.yellow('\n\nShutting down ClawVine...'));
    engine.stop();
    client.disconnect();
    console.log(chalk.green('✓ Stopped. Your matches are saved in ~/.clawvine/matches.json'));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise(() => {});
}

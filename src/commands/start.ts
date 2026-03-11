import chalk from 'chalk';
import { loadConfig, isInitialized } from '../core/config.js';
import { restoreIdentity } from '../core/identity.js';
import { getProfile } from '../core/profile.js';
import { NostrClient } from '../core/nostr.js';
import { GossipEngine } from '../core/gossip.js';

export async function startCommand(options: { once?: boolean }): Promise<void> {
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

  // Connect to Nostr relays
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

  // Start gossip engine
  const engine = new GossipEngine(client, config, identity, profile);

  if (options.once) {
    console.log(chalk.cyan('\nRunning single gossip round...'));
    const stats = await engine.runGossipRound();
    console.log(chalk.green(`\n✓ Round #${stats.roundNumber} complete`));
    console.log(`  Peers contacted: ${stats.peersContacted}`);
    console.log(`  Matches found: ${stats.matchesFound}`);
    console.log(`  Duration: ${stats.durationMs}ms`);
    client.disconnect();
    return;
  }

  console.log(chalk.cyan('\nGossip engine running. Press Ctrl+C to stop.\n'));
  console.log(`  Interval: every ${config.gossipIntervalMs / 1000 / 60} minutes`);
  console.log(`  Peers per round: ${config.peersPerRound}`);
  console.log(`  Similarity threshold: ${config.similarityThreshold}`);
  console.log(`  Profile tags: ${profile.tags.join(', ')}`);

  await engine.start();

  // Graceful shutdown
  const shutdown = () => {
    console.log(chalk.yellow('\n\nShutting down ClawVine...'));
    engine.stop();
    client.disconnect();
    console.log(chalk.green('✓ Stopped. Your matches are saved in ~/.clawvine/matches.json'));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep process alive
  await new Promise(() => {});
}

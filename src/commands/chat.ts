import chalk from 'chalk';
import { isInitialized, loadConfig, loadMatches, loadChatWith } from '../core/config.js';
import { restoreIdentity } from '../core/identity.js';
import { getProfile } from '../core/profile.js';
import { NostrClient } from '../core/nostr.js';
import { GossipEngine } from '../core/gossip.js';

export async function chatCommand(matchId: string, message: string): Promise<void> {
  if (!isInitialized()) {
    console.log(chalk.red('ClawVine is not initialized. Run: clawvine init'));
    return;
  }

  const matches = loadMatches();
  const match = matches.find((m) => m.id === matchId || m.id.startsWith(matchId));
  if (!match) {
    console.log(chalk.red(`Match not found: ${matchId}`));
    return;
  }

  if (match.status !== 'mutual') {
    console.log(chalk.red(`Cannot chat: match must be mutual (current status: "${match.status}").`));
    console.log(chalk.dim('Both humans must approve before agents can exchange messages.'));
    return;
  }

  const identity = restoreIdentity();
  if (!identity) {
    console.log(chalk.red('Failed to load identity.'));
    return;
  }

  const profile = getProfile();
  if (!profile) {
    console.log(chalk.red('No profile set.'));
    return;
  }

  const config = loadConfig();
  const client = new NostrClient(identity.nostrSecretKey, identity.nostrPublicKey);
  await client.connectToRelays(config.relays);

  if (client.getConnectedRelayCount() === 0) {
    console.log(chalk.red('Failed to connect to any relay.'));
    client.disconnect();
    return;
  }

  const engine = new GossipEngine(client, config, identity, profile);

  try {
    await engine.sendChat(match.peerNpub, message);
    console.log(chalk.green(`✓ Message sent to ${match.peerNpub.slice(0, 20)}...`));
  } catch (err) {
    console.log(chalk.red(`Failed to send message: ${err}`));
  }

  client.disconnect();
}

export async function messagesCommand(matchId?: string): Promise<void> {
  if (!isInitialized()) {
    console.log(chalk.red('ClawVine is not initialized. Run: clawvine init'));
    return;
  }

  if (!matchId) {
    // Show all conversations grouped by peer
    const matches = loadMatches();
    if (matches.length === 0) {
      console.log(chalk.dim('No matches yet.'));
      return;
    }

    let hasMessages = false;
    for (const match of matches) {
      const msgs = loadChatWith(match.peerNpub);
      if (msgs.length === 0) continue;
      hasMessages = true;

      console.log(chalk.bold(`\n${match.peerNpub.slice(0, 24)}... (match: ${match.id.slice(0, 8)})`));
      console.log(chalk.dim(`  Status: ${match.status} | ${msgs.length} message(s)`));

      const last = msgs[msgs.length - 1];
      const dir = last.direction === 'in' ? chalk.cyan('← in') : chalk.green('→ out');
      const time = new Date(last.timestamp).toLocaleString();
      console.log(`  Last: ${dir} ${last.text.slice(0, 60)}${last.text.length > 60 ? '...' : ''} (${time})`);
    }

    if (!hasMessages) {
      console.log(chalk.dim('No messages yet. Use "clawvine chat <match-id> <message>" to start.'));
    }
    return;
  }

  // Show specific conversation
  const matches = loadMatches();
  const match = matches.find((m) => m.id === matchId || m.id.startsWith(matchId));
  if (!match) {
    console.log(chalk.red(`Match not found: ${matchId}`));
    return;
  }

  const msgs = loadChatWith(match.peerNpub);
  if (msgs.length === 0) {
    console.log(chalk.dim(`No messages with ${match.peerNpub.slice(0, 24)}...`));
    return;
  }

  console.log(chalk.bold(`\nChat with ${match.peerNpub.slice(0, 24)}...\n`));
  for (const msg of msgs) {
    const time = new Date(msg.timestamp).toLocaleString();
    if (msg.direction === 'in') {
      console.log(chalk.cyan(`  ← [${time}] ${msg.text}`));
    } else {
      console.log(chalk.green(`  → [${time}] ${msg.text}`));
    }
  }
  console.log();
}

export async function messagesJsonCommand(options: { matchId?: string }): Promise<void> {
  if (!isInitialized()) {
    console.log(JSON.stringify([]));
    return;
  }

  if (options.matchId) {
    const matches = loadMatches();
    const match = matches.find((m) => m.id === options.matchId || m.id.startsWith(options.matchId!));
    if (!match) {
      console.log(JSON.stringify([]));
      return;
    }
    console.log(JSON.stringify(loadChatWith(match.peerNpub)));
  } else {
    const { loadChat } = await import('../core/config.js');
    console.log(JSON.stringify(loadChat()));
  }
}

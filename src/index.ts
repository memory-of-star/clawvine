#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { matchesCommand, approveCommand, rejectCommand } from './commands/matches.js';
import { profileCommand } from './commands/profile.js';
import { notificationsCommand } from './commands/notifications.js';
import { chatCommand, messagesCommand } from './commands/chat.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('clawvine')
  .description('Decentralized AI agent social discovery network')
  .version(pkg.version);

program
  .command('init')
  .description('Initialize ClawVine: generate Nostr identity and Paillier HE keypair')
  .option('--tags <tags>', 'Comma-separated interest tags for initial profile')
  .option('--relays <urls>', 'Comma-separated Nostr relay URLs')
  .action(initCommand);

program
  .command('start')
  .description('Start the gossip engine (runs continuously by default)')
  .option('--once', 'Run a single gossip round, wait for responses, then exit')
  .option('--wait <seconds>', 'How long to wait for responses in --once mode (default: 30)', parseInt)
  .action(startCommand);

program
  .command('status')
  .description('Show ClawVine status: identity, peers, matches, gossip stats')
  .action(statusCommand);

program
  .command('profile')
  .description('View or update your interest profile')
  .option('--tags <tags>', 'Set interests from comma-separated tags')
  .option('--list', 'List all available interest categories')
  .option('--prompt <summary>', 'Generate LLM prompt to extract profile from chat summary')
  .option('--intro <text>', 'Set a self-introduction (shared with mutual matches only)')
  .option('--memory <text>', 'Add private agent memory (NEVER shared, only improves matching)')
  .option('--memory-source <source>', 'Source label for the memory entry (default: agent-observation)')
  .option('--rebuild-vector', 'Rebuild matching vector from tags + agent context')
  .action(profileCommand);

program
  .command('matches')
  .description('List all matches and their status')
  .action(matchesCommand);

program
  .command('approve <match-id>')
  .description('Approve a pending match')
  .action(approveCommand);

program
  .command('reject <match-id>')
  .description('Reject a pending match')
  .action(rejectCommand);

program
  .command('notifications')
  .description('Check for new match notifications (written by the daemon)')
  .option('--clear', 'Read and clear all pending notifications')
  .option('--json', 'Output as JSON (for agent parsing)')
  .action(notificationsCommand);

program
  .command('chat <match-id> <message>')
  .description('Send an encrypted DM to a matched peer\'s agent')
  .action(chatCommand);

program
  .command('messages [match-id]')
  .description('View chat messages (all conversations or specific match)')
  .option('--json', 'Output as JSON')
  .action((matchId: string | undefined, options: { json?: boolean }) => {
    if (options.json) {
      return import('./commands/chat.js').then(m => m.messagesJsonCommand({ matchId }));
    }
    return messagesCommand(matchId);
  });

program.parse();

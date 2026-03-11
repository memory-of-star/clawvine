#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { matchesCommand, approveCommand, rejectCommand } from './commands/matches.js';
import { profileCommand } from './commands/profile.js';

const program = new Command();

program
  .name('clawvine')
  .description('Decentralized AI agent social discovery network')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize ClawVine: generate Nostr identity and Paillier HE keypair')
  .option('--tags <tags>', 'Comma-separated interest tags for initial profile')
  .option('--relays <urls>', 'Comma-separated Nostr relay URLs')
  .action(initCommand);

program
  .command('start')
  .description('Start the gossip engine to discover and match with peers')
  .option('--once', 'Run a single gossip round then exit')
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

program.parse();

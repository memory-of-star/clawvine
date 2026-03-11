import chalk from 'chalk';
import { isInitialized, loadMatches, addMatch } from '../core/config.js';
import type { MatchRecord } from '../types.js';

export function matchesCommand(): void {
  if (!isInitialized()) {
    console.log(chalk.red('ClawVine is not initialized. Run: clawvine init'));
    return;
  }

  const matches = loadMatches();

  if (matches.length === 0) {
    console.log(chalk.yellow('\nNo matches yet. Start gossip to find connections: clawvine start'));
    return;
  }

  console.log(chalk.bold('\n🌿 ClawVine Matches\n'));

  const grouped: Record<string, MatchRecord[]> = {
    mutual: [],
    pending_local: [],
    approved_local: [],
    rejected: [],
    expired: [],
  };

  for (const match of matches) {
    (grouped[match.status] ??= []).push(match);
  }

  if (grouped.mutual.length > 0) {
    console.log(chalk.green.bold('✨ Mutual Matches (both sides approved!)'));
    for (const m of grouped.mutual) {
      printMatch(m);
    }
  }

  if (grouped.pending_local.length > 0) {
    console.log(chalk.yellow.bold('\n⏳ Pending Your Approval'));
    for (const m of grouped.pending_local) {
      printMatch(m);
      console.log(
        `    → Approve: ${chalk.cyan(`clawvine approve ${m.id}`)}`,
      );
    }
  }

  if (grouped.approved_local.length > 0) {
    console.log(chalk.blue.bold('\n✓ Approved (waiting for peer)'));
    for (const m of grouped.approved_local) {
      printMatch(m);
    }
  }

  if (grouped.rejected.length > 0) {
    console.log(chalk.gray.bold('\n✗ Rejected'));
    for (const m of grouped.rejected) {
      printMatch(m);
    }
  }

  console.log('');
}

function printMatch(m: MatchRecord): void {
  const statusIcon = {
    mutual: chalk.green('✨'),
    pending_local: chalk.yellow('⏳'),
    approved_local: chalk.blue('✓'),
    rejected: chalk.gray('✗'),
    expired: chalk.gray('⏰'),
  }[m.status];

  console.log(`  ${statusIcon} ${chalk.bold(m.id.slice(0, 8))}`);
  console.log(`    Peer: ${m.peerNpub.slice(0, 20)}...`);
  console.log(`    Similarity: ${(m.similarity * 100).toFixed(1)}%`);
  console.log(`    ${m.report.split('\n')[0]}`);
  console.log(`    Time: ${new Date(m.createdAt).toLocaleString()}`);
}

export function approveCommand(matchId: string): void {
  if (!isInitialized()) {
    console.log(chalk.red('ClawVine is not initialized.'));
    return;
  }

  const matches = loadMatches();
  const match = matches.find((m) => m.id === matchId || m.id.startsWith(matchId));

  if (!match) {
    console.log(chalk.red(`Match not found: ${matchId}`));
    return;
  }

  if (match.status !== 'pending_local') {
    console.log(chalk.yellow(`Match ${matchId} is already ${match.status}.`));
    return;
  }

  match.status = 'approved_local';
  match.updatedAt = Date.now();
  addMatch(match);

  console.log(chalk.green(`\n✓ Approved match ${match.id.slice(0, 8)}`));
  console.log('  When the peer also approves, you will become a mutual match.');
  console.log('  Run ' + chalk.cyan('clawvine start') + ' to notify the peer via gossip.');
}

export function rejectCommand(matchId: string): void {
  if (!isInitialized()) {
    console.log(chalk.red('ClawVine is not initialized.'));
    return;
  }

  const matches = loadMatches();
  const match = matches.find((m) => m.id === matchId || m.id.startsWith(matchId));

  if (!match) {
    console.log(chalk.red(`Match not found: ${matchId}`));
    return;
  }

  match.status = 'rejected';
  match.updatedAt = Date.now();
  addMatch(match);

  console.log(chalk.yellow(`✗ Rejected match ${match.id.slice(0, 8)}`));
}

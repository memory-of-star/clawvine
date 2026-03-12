import chalk from 'chalk';
import { isInitialized, loadNotifications, clearNotifications } from '../core/config.js';

export async function notificationsCommand(options: { clear?: boolean; json?: boolean }): Promise<void> {
  if (!isInitialized()) {
    console.log(chalk.red('ClawVine is not initialized. Run: clawvine init'));
    return;
  }

  if (options.clear) {
    const cleared = clearNotifications();
    if (options.json) {
      console.log(JSON.stringify(cleared));
    } else {
      console.log(chalk.green(`✓ Cleared ${cleared.length} notification(s).`));
    }
    return;
  }

  const notifications = loadNotifications();

  if (options.json) {
    console.log(JSON.stringify(notifications));
    return;
  }

  if (notifications.length === 0) {
    console.log(chalk.dim('No new notifications.'));
    return;
  }

  console.log(chalk.bold(`\n📬 ${notifications.length} notification(s):\n`));
  for (const n of notifications) {
    const time = new Date(n.timestamp).toLocaleString();
    if (n.type === 'new_match') {
      console.log(chalk.yellow(`  🔔 New match found`));
    } else if (n.type === 'mutual_match') {
      console.log(chalk.green(`  🎉 Mutual match!`));
    } else if (n.type === 'peer_approved') {
      console.log(chalk.cyan(`  ✋ Peer approved — waiting for you`));
    }
    console.log(`     Match ID:   ${n.matchId}`);
    console.log(`     Peer:       ${n.peerNpub.slice(0, 24)}...`);
    console.log(`     Similarity: ${(n.similarity * 100).toFixed(1)}%`);
    console.log(`     Summary:    ${n.summary}`);
    console.log(chalk.dim(`     Time:       ${time}\n`));
  }

  console.log(chalk.dim(`Run "clawvine notifications --clear" to dismiss all.`));
}

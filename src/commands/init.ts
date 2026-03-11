import chalk from 'chalk';
import { loadConfig, saveConfig, isInitialized, ensureDir } from '../core/config.js';
import { generateIdentity, storeIdentity, getNpub } from '../core/identity.js';
import { buildProfileFromTags, updateProfile } from '../core/profile.js';

export async function initCommand(options: { tags?: string; relays?: string }): Promise<void> {
  if (isInitialized()) {
    console.log(chalk.yellow('ClawVine is already initialized.'));
    console.log('Run ' + chalk.cyan('clawvine status') + ' to see your current state.');
    console.log('To reinitialize, delete ~/.clawvine/ first.');
    return;
  }

  console.log(chalk.bold('\n🌿 Initializing ClawVine...\n'));
  ensureDir();

  // Save config (with optional custom relays)
  const config = loadConfig();
  if (options.relays) {
    config.relays = options.relays.split(',').map((r) => r.trim());
  }
  saveConfig(config);

  // Generate identity: Nostr keypair + Paillier HE keypair
  console.log('Generating Nostr identity...');
  console.log('Generating Paillier HE keypair (2048-bit, this may take a moment)...');
  const identity = await generateIdentity(config.heKeyBits);
  storeIdentity(identity);

  const npub = getNpub(identity.nostrPublicKey);
  console.log(chalk.green('\n✓ Identity created'));
  console.log(`  Nostr npub: ${chalk.cyan(npub)}`);

  // Create initial profile from tags if provided
  if (options.tags) {
    const tags = options.tags.split(',').map((t) => t.trim());
    const profile = buildProfileFromTags(tags);
    updateProfile(profile);
    console.log(chalk.green('✓ Profile created from tags:'), tags.join(', '));
  } else {
    console.log(chalk.yellow('\n⚠ No profile set yet.'));
    console.log('  Set your interests: ' + chalk.cyan('clawvine profile --tags "rust,photography,startup"'));
    console.log('  Or let your OpenClaw agent extract them from your chat history.');
  }

  console.log(chalk.bold('\n✅ ClawVine initialized successfully!\n'));
  console.log('Next steps:');
  console.log(`  1. Set your interests:  ${chalk.cyan('clawvine profile --tags "your,interests,here"')}`);
  console.log(`  2. Start gossip:        ${chalk.cyan('clawvine start')}`);
  console.log(`  3. Check matches:       ${chalk.cyan('clawvine matches')}`);
}

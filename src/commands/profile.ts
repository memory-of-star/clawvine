import chalk from 'chalk';
import { isInitialized, addAgentMemory, loadAgentContext } from '../core/config.js';
import {
  getProfile,
  updateProfile,
  buildProfileFromTags,
  rebuildVector,
  INTEREST_CATEGORIES,
  generateProfileExtractionPrompt,
} from '../core/profile.js';

export function profileCommand(options: {
  tags?: string;
  list?: boolean;
  prompt?: string;
  intro?: string;
  memory?: string;
  memorySource?: string;
  rebuildVector?: boolean;
}): void {
  if (!isInitialized()) {
    console.log(chalk.red('ClawVine is not initialized. Run: clawvine init'));
    return;
  }

  if (options.list) {
    console.log(chalk.bold('\n🌿 Available Interest Categories\n'));
    const groups: Record<string, string[]> = {
      'Tech (0-19)': INTEREST_CATEGORIES.slice(0, 20),
      'Creative (20-39)': INTEREST_CATEGORIES.slice(20, 40),
      'Business (40-59)': INTEREST_CATEGORIES.slice(40, 60),
      'Science (60-79)': INTEREST_CATEGORIES.slice(60, 80),
      'Lifestyle (80-99)': INTEREST_CATEGORIES.slice(80, 100),
      'Seeking / Social (100-127)': INTEREST_CATEGORIES.slice(100, 128),
    };

    for (const [group, cats] of Object.entries(groups)) {
      console.log(chalk.bold.cyan(`  ${group}`));
      console.log(`    ${cats.join(', ')}`);
      console.log('');
    }
    return;
  }

  if (options.prompt) {
    const prompt = generateProfileExtractionPrompt(options.prompt);
    console.log(chalk.bold('\n🌿 LLM Profile Extraction Prompt\n'));
    console.log('Send the following prompt to your LLM:\n');
    console.log(chalk.gray('---'));
    console.log(prompt);
    console.log(chalk.gray('---'));
    console.log('\nThen parse the JSON response with: clawvine profile --from-json <response>');
    return;
  }

  if (options.intro) {
    const existing = getProfile();
    if (!existing) {
      console.log(chalk.red('Set your interest tags first: clawvine profile --tags "..."'));
      return;
    }
    existing.intro = options.intro;
    existing.updatedAt = Date.now();
    updateProfile(existing);
    console.log(chalk.green(`\n✓ Self-introduction updated`));
    console.log(`  "${options.intro}"`);
    console.log(chalk.dim('  This will be shared with mutual matches only.'));
    return;
  }

  // Agent submits private memory — stored locally, NEVER transmitted
  if (options.memory) {
    const source = options.memorySource || 'agent-observation';
    addAgentMemory({
      source,
      content: options.memory,
      addedAt: Date.now(),
    });
    rebuildVector();
    const ctx = loadAgentContext();
    console.log(chalk.green(`\n✓ Agent memory added (${ctx.memories.length} total entries)`));
    console.log(chalk.dim('  This data is stored locally and NEVER shared with anyone.'));
    console.log(chalk.dim('  It only improves matching accuracy via the encrypted vector.'));
    return;
  }

  // Rebuild vector from tags + agent context
  if (options.rebuildVector) {
    rebuildVector();
    console.log(chalk.green('\n✓ Matching vector rebuilt from tags + agent context'));
    return;
  }

  if (options.tags) {
    const tags = options.tags.split(',').map((t) => t.trim());
    const invalid = tags.filter((t) => !INTEREST_CATEGORIES.includes(t));
    if (invalid.length > 0) {
      console.log(chalk.yellow(`Unknown categories: ${invalid.join(', ')}`));
      console.log('Run ' + chalk.cyan('clawvine profile --list') + ' to see available categories.');
    }
    const validTags = tags.filter((t) => INTEREST_CATEGORIES.includes(t));
    if (validTags.length === 0) {
      console.log(chalk.red('No valid tags provided.'));
      return;
    }

    const profile = buildProfileFromTags(validTags);
    updateProfile(profile);
    rebuildVector();
    console.log(chalk.green(`\n✓ Profile updated with ${validTags.length} interest tags`));
    console.log(`  Tags: ${validTags.join(', ')}`);
    return;
  }

  // Show current profile
  const profile = getProfile();
  if (!profile) {
    console.log(chalk.yellow('\nNo profile set.'));
    console.log('Set your interests: ' + chalk.cyan('clawvine profile --tags "rust,photography,startup"'));
    console.log('List categories:    ' + chalk.cyan('clawvine profile --list'));
    return;
  }

  console.log(chalk.bold('\n🌿 Your Interest Profile\n'));
  console.log(`  Tags: ${chalk.cyan(profile.tags.join(', '))}`);
  console.log(`  Summary: ${profile.summary}`);
  if (profile.intro) {
    console.log(`  Intro: ${chalk.green(profile.intro)}`);
  } else {
    console.log(chalk.dim(`  Intro: (not set — use --intro "..." to add a self-introduction for mutual matches)`));
  }
  console.log(`  Updated: ${new Date(profile.updatedAt).toLocaleString()}`);

  const ctx = loadAgentContext();
  if (ctx.memories.length > 0) {
    console.log(chalk.dim(`  Agent context: ${ctx.memories.length} memory entries (private, never shared)`));
  }

  const active = profile.vector
    .map((v, i) => ({ category: INTEREST_CATEGORIES[i] ?? `dim_${i}`, weight: v }))
    .filter((x) => x.weight !== 0)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  if (active.length > 0) {
    console.log(chalk.bold('\n  Active Dimensions:'));
    for (const { category, weight } of active) {
      const bar = weight > 0 ? chalk.green('█'.repeat(Math.round(weight * 10))) : chalk.red('█'.repeat(Math.round(-weight * 10)));
      console.log(`    ${category.padEnd(28)} ${bar} ${weight.toFixed(1)}`);
    }
  }
  console.log('');
}

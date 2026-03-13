import chalk from 'chalk';
import { isInitialized, addAgentMemory, loadAgentContext, saveMemorySummary } from '../core/config.js';
import {
  getProfile,
  updateProfile,
  buildProfileFromTags,
  rebuildVector,
  INTEREST_CATEGORIES,
  generateProfileExtractionPrompt,
} from '../core/profile.js';

export async function profileCommand(options: {
  tags?: string;
  list?: boolean;
  prompt?: string;
  intro?: string;
  memory?: string;
  memorySummary?: string;
  rebuildVector?: boolean;
}): Promise<void> {
  if (!isInitialized()) {
    console.log(chalk.red('ClawVine is not initialized. Run: clawvine init'));
    return;
  }

  if (options.list) {
    console.log(chalk.bold('\n🌿 Suggested Interest Tags\n'));
    console.log(chalk.dim('  You can use any free-text tags — these are just suggestions.\n'));
    const groups: Record<string, string[]> = {
      'Tech': INTEREST_CATEGORIES.slice(0, 20),
      'Creative': INTEREST_CATEGORIES.slice(20, 40),
      'Business': INTEREST_CATEGORIES.slice(40, 60),
      'Science': INTEREST_CATEGORIES.slice(60, 80),
      'Lifestyle': INTEREST_CATEGORIES.slice(80, 100),
      'Seeking / Social': INTEREST_CATEGORIES.slice(100, 128),
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

  // Agent submits raw conversation text — stored locally, NEVER transmitted
  if (options.memory) {
    addAgentMemory({
      content: options.memory,
      addedAt: Date.now(),
    });
    const ctx = loadAgentContext();
    console.log(chalk.green(`✓ Memory recorded (${ctx.memories.length} total entries)`));
    console.log(chalk.dim('  Submit --memory-summary to update the matching vector.'));
    return;
  }

  // Agent submits a ≤256-token summary of all memories → triggers vector rebuild
  if (options.memorySummary) {
    saveMemorySummary(options.memorySummary);
    console.log(chalk.dim('Rebuilding matching vector...'));
    await rebuildVector();
    console.log(chalk.green('✓ Memory summary saved & matching vector rebuilt (768-dim)'));
    return;
  }

  if (options.rebuildVector) {
    console.log(chalk.dim('Rebuilding matching vector...'));
    await rebuildVector();
    console.log(chalk.green('✓ Matching vector rebuilt (768-dim)'));
    return;
  }

  if (options.tags) {
    const tags = options.tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) {
      console.log(chalk.red('No tags provided.'));
      return;
    }

    const profile = buildProfileFromTags(tags);
    updateProfile(profile);
    console.log(chalk.dim('Rebuilding matching vector...'));
    await rebuildVector();
    console.log(chalk.green(`\n✓ Profile updated with ${tags.length} interest tags`));
    console.log(`  Tags: ${tags.join(', ')}`);
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
    console.log(chalk.dim(`  Agent memory: ${ctx.memories.length} entries (private, never shared)`));
  }

  const nonZero = profile.vector.filter((v) => v !== 0).length;
  if (nonZero > 0) {
    console.log(chalk.dim(`  Embedding: ${profile.vector.length}-dim vector (${nonZero} non-zero dims)`));
  } else {
    console.log(chalk.yellow(`  Embedding: not yet generated — run: clawvine profile --rebuild-vector`));
  }
  console.log('');
}

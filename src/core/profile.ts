import type { InterestProfile } from '../types.js';
import { loadProfile, saveProfile, loadConfig, loadAgentContext } from './config.js';

/**
 * Predefined interest categories — each maps to one dimension in the interest vector.
 * The LLM rates the human's interest in each category from -1.0 to 1.0.
 */
export const INTEREST_CATEGORIES: string[] = [
  // Tech (0-19)
  'web-development', 'mobile-development', 'systems-programming', 'machine-learning',
  'data-science', 'devops', 'cybersecurity', 'blockchain', 'game-development', 'open-source',
  'robotics', 'iot', 'cloud-computing', 'databases', 'programming-languages',
  'computer-graphics', 'networking', 'embedded-systems', 'quantum-computing', 'ar-vr',
  // Creative (20-39)
  'photography', 'video-production', 'music-production', 'digital-art', 'writing',
  'graphic-design', 'ui-ux-design', 'animation', 'podcasting', 'crafts',
  'calligraphy', 'fashion-design', 'interior-design', 'architecture', 'filmmaking',
  'creative-coding', 'illustration', 'typography', 'sound-design', 'woodworking',
  // Business (40-59)
  'entrepreneurship', 'startup', 'marketing', 'product-management', 'investing',
  'finance', 'e-commerce', 'management', 'consulting', 'real-estate',
  'venture-capital', 'growth-hacking', 'sales', 'supply-chain', 'hr',
  'legal', 'accounting', 'strategy', 'branding', 'public-relations',
  // Science (60-79)
  'physics', 'mathematics', 'biology', 'chemistry', 'astronomy',
  'neuroscience', 'psychology', 'sociology', 'economics', 'philosophy',
  'linguistics', 'history', 'political-science', 'environmental-science', 'geology',
  'medicine', 'genetics', 'ecology', 'anthropology', 'cognitive-science',
  // Lifestyle (80-99)
  'fitness', 'cooking', 'travel', 'outdoor-sports', 'meditation',
  'reading', 'gardening', 'pets', 'parenting', 'volunteering',
  'board-games', 'video-games', 'esports', 'hiking', 'cycling',
  'yoga', 'martial-arts', 'wine-tasting', 'coffee', 'tea',
  // Social / seeking (100-127)
  'seeking-cofounder', 'seeking-collaborator', 'seeking-mentor', 'seeking-mentee',
  'seeking-friends', 'seeking-study-buddy', 'seeking-hobby-partner', 'seeking-local-meetup',
  'seeking-remote-collab', 'seeking-language-exchange', 'seeking-book-club', 'seeking-sports-partner',
  'seeking-music-jam', 'seeking-travel-buddy', 'seeking-project-partner', 'seeking-investor',
  'seeking-advisor', 'seeking-freelance-work', 'seeking-job', 'seeking-hire',
  'has-expertise-to-share', 'has-resources-to-share', 'has-connections-to-share',
  'open-to-anything', 'introvert-preference', 'extrovert-preference',
  'same-city-preferred', 'remote-ok',
];

/**
 * Generate the LLM prompt that extracts an interest profile from chat history.
 * This prompt is designed to be sent to the human's OpenClaw LLM.
 */
export function generateProfileExtractionPrompt(chatSummary: string): string {
  const categories = INTEREST_CATEGORIES.map((c, i) => `${i}: ${c}`).join('\n');

  return `You are analyzing a person's chat history to build their interest profile for social matching.
Based on the following conversation summary, rate each interest category from -1.0 (actively dislikes/avoids)
to 1.0 (very passionate about). Use 0.0 for neutral/unknown.

Only rate categories where you have evidence from the conversations. Default to 0.0 otherwise.

Categories:
${categories}

Conversation summary:
${chatSummary}

Respond with ONLY a JSON object:
{
  "vector": [128 float values between -1.0 and 1.0],
  "tags": ["top 5-10 most relevant category names"],
  "summary": "2-3 sentence description of this person's key interests and what they're looking for"
}`;
}

/**
 * Parse LLM response into an InterestProfile.
 */
export function parseProfileResponse(llmResponse: string): InterestProfile | null {
  try {
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    const config = loadConfig();
    if (
      !Array.isArray(parsed.vector) ||
      parsed.vector.length !== config.profileDimensions
    ) {
      return null;
    }

    const existing = loadProfile();
    return {
      vector: parsed.vector.map((v: unknown) => {
        const n = Number(v);
        return Math.max(-1, Math.min(1, isNaN(n) ? 0 : n));
      }),
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      intro: existing?.intro ?? '',
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Build a simple profile from explicit tags (no LLM needed — for testing and manual setup).
 */
export function buildProfileFromTags(tags: string[]): InterestProfile {
  const config = loadConfig();
  const vector = new Array<number>(config.profileDimensions).fill(0);

  for (const tag of tags) {
    const idx = INTEREST_CATEGORIES.indexOf(tag);
    if (idx >= 0 && idx < vector.length) {
      vector[idx] = 1.0;
    }
  }

  const existing = loadProfile();
  return {
    vector,
    tags,
    summary: `Interested in: ${tags.join(', ')}`,
    intro: existing?.intro ?? '',
    updatedAt: Date.now(),
  };
}

export function getProfile(): InterestProfile | null {
  return loadProfile();
}

export function updateProfile(profile: InterestProfile): void {
  saveProfile(profile);
}

/**
 * Keyword associations for each interest category.
 * Used to detect interests from agent memory text without an LLM.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'web-development': ['react', 'vue', 'nextjs', 'html', 'css', 'javascript', 'typescript', 'frontend', 'backend', 'web'],
  'mobile-development': ['ios', 'android', 'swift', 'kotlin', 'flutter', 'react native', 'mobile app'],
  'systems-programming': ['rust', 'c++', 'systems', 'kernel', 'operating system', 'low-level', 'memory'],
  'machine-learning': ['ml', 'deep learning', 'neural', 'tensorflow', 'pytorch', 'model training', 'llm', 'gpt', 'transformer'],
  'data-science': ['pandas', 'data analysis', 'statistics', 'visualization', 'jupyter', 'dataset'],
  'devops': ['docker', 'kubernetes', 'ci/cd', 'terraform', 'ansible', 'deployment', 'infrastructure'],
  'cybersecurity': ['security', 'encryption', 'vulnerability', 'penetration', 'firewall', 'hacking'],
  'blockchain': ['crypto', 'ethereum', 'solidity', 'smart contract', 'defi', 'web3', 'bitcoin', 'nft'],
  'game-development': ['unity', 'unreal', 'game engine', 'godot', 'game design', 'gamedev'],
  'open-source': ['open source', 'github', 'contribute', 'oss', 'maintainer', 'pull request'],
  'photography': ['photo', 'camera', 'lens', 'portrait', 'landscape', 'lightroom'],
  'music-production': ['music', 'ableton', 'synthesizer', 'beats', 'mixing', 'audio'],
  'writing': ['writing', 'blog', 'novel', 'essay', 'fiction', 'poetry', 'author'],
  'startup': ['startup', 'founder', 'mvp', 'pitch', 'seed', 'bootstrap'],
  'entrepreneurship': ['entrepreneur', 'business idea', 'side project', 'launch'],
  'investing': ['invest', 'stock', 'portfolio', 'dividend', 'trading'],
  'fitness': ['gym', 'workout', 'exercise', 'running', 'lifting', 'training'],
  'cooking': ['recipe', 'cooking', 'baking', 'cuisine', 'food'],
  'travel': ['travel', 'trip', 'backpack', 'destination', 'flight', 'hostel'],
  'hiking': ['hiking', 'trail', 'mountain', 'camping', 'outdoor'],
  'video-games': ['gaming', 'steam', 'playstation', 'xbox', 'nintendo', 'rpg', 'fps'],
  'reading': ['book', 'reading', 'novel', 'kindle', 'library', 'literature'],
  'coffee': ['coffee', 'espresso', 'latte', 'barista', 'cafe'],
  'tea': ['tea', 'matcha', 'oolong', 'brewing'],
  'meditation': ['meditation', 'mindfulness', 'zen', 'breathing'],
  'yoga': ['yoga', 'asana', 'flexibility', 'vinyasa'],
  'pets': ['dog', 'cat', 'pet', 'puppy', 'kitten'],
};

/**
 * Rebuild the matching vector from human tags + agent context.
 * Human tags contribute weight 1.0 per tag.
 * Agent memory contributes up to 0.5 via keyword matching (softer signal).
 * The resulting vector is used ONLY for encrypted matching — never shared in plaintext.
 */
export function rebuildVector(): void {
  const profile = loadProfile();
  if (!profile) return;

  const config = loadConfig();
  const vector = new Array<number>(config.profileDimensions).fill(0);

  // Layer 1: Human-authored tags (weight 1.0)
  for (const tag of profile.tags) {
    const idx = INTEREST_CATEGORIES.indexOf(tag);
    if (idx >= 0 && idx < vector.length) {
      vector[idx] = 1.0;
    }
  }

  // Layer 2: Agent context keyword matching (weight up to 0.5)
  const ctx = loadAgentContext();
  if (ctx.memories.length > 0) {
    const allText = ctx.memories.map((m) => m.content).join(' ').toLowerCase();
    for (let i = 0; i < INTEREST_CATEGORIES.length && i < vector.length; i++) {
      if (vector[i] >= 1.0) continue; // human tag already maxed this dimension
      const cat = INTEREST_CATEGORIES[i];
      const keywords = CATEGORY_KEYWORDS[cat];
      if (!keywords) continue;
      const hits = keywords.filter((kw) => allText.includes(kw)).length;
      if (hits > 0) {
        const contextWeight = Math.min(0.5, hits * 0.15);
        vector[i] = Math.min(1.0, vector[i] + contextWeight);
      }
    }
  }

  profile.vector = vector;
  profile.updatedAt = Date.now();
  saveProfile(profile);
}

/**
 * Generate an LLM prompt for the agent to analyze its memory and produce
 * a context vector. The agent submits the response via `clawvine profile --agent-vector`.
 * This allows richer extraction than keyword matching.
 */
export function generateAgentContextPrompt(): string {
  const categories = INTEREST_CATEGORIES.map((c, i) => `${i}: ${c}`).join('\n');

  return `You are analyzing your observations about the human you assist to enrich their matching profile.
Based on your memory (conversations, files you've seen, topics discussed), rate each interest category
from 0.0 (no evidence) to 0.5 (strong evidence from your observations).

IMPORTANT: Use at most 0.5 — the human's explicit tags are weighted separately at up to 1.0.
Only rate categories where you have clear evidence. Default to 0.0 otherwise.

Categories:
${categories}

Respond with ONLY a JSON array of 128 float values between 0.0 and 0.5:
[0.0, 0.3, 0.0, 0.5, ...]`;
}

import type { InterestProfile } from '../types.js';
import { loadProfile, saveProfile, loadConfig } from './config.js';

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

    return {
      vector: parsed.vector.map((v: unknown) => {
        const n = Number(v);
        return Math.max(-1, Math.min(1, isNaN(n) ? 0 : n));
      }),
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
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

  return {
    vector,
    tags,
    summary: `Interested in: ${tags.join(', ')}`,
    updatedAt: Date.now(),
  };
}

export function getProfile(): InterestProfile | null {
  return loadProfile();
}

export function updateProfile(profile: InterestProfile): void {
  saveProfile(profile);
}

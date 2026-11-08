// How "Top Dishes For You" gets ordered.
//
// Every published dish gets a score, highest first:
//   + a big boost if it matches one of the user's interests
//   + a little extra when the match is on the dish's category itself, which is
//     a stronger signal than a word that just happens to be in the ingredients
//   + a small boost per like and per bookmark (so popular dishes float up)
//   + a freshness boost for dishes posted this week/this month
//
// Interests are more specific than categories ("Manok", "Inihaw"), so matching
// looks at the category, the title AND the ingredients - see interest-catalog.ts
// for the words behind each interest.
//
// The user's interests come from two places: the ones they picked during
// Account Setup, plus the categories they keep liking and bookmarking - so the
// feed keeps adapting even if they never touch the interests list again.

import { likeCount, saveCount, toMillis } from './featured-dish';
import { normalizeCategoryName } from './category-catalog';
import { interestKeywords } from './interest-catalog';

const INTEREST_WEIGHT = 3;
const CATEGORY_MATCH_BONUS = 1;
const LIKE_WEIGHT = 0.1;
const SAVE_WEIGHT = 0.15;
const FRESH_WEEK_BOOST = 1;
const FRESH_MONTH_BOOST = 0.5;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface InterestProfile {
  matchers: RegExp[];
  isEmpty: boolean;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole words only, so "baka" doesn't fire on "bakasyon"
function buildMatcher(interestName: string): RegExp | null {
  const words = interestKeywords(interestName);
  if (!words.length) return null;
  return new RegExp(`\\b(${words.map(escapeRegExp).join('|')})\\b`, 'i');
}

// Categories of the dishes this user has already liked or bookmarked
export function interestsFromActivity(recipes: any[], userId: string | null): string[] {
  if (!userId) return [];
  const names = new Set<string>();
  for (const recipe of recipes) {
    const engaged = (recipe.likedBy || []).includes(userId) || (recipe.savedBy || []).includes(userId);
    const category = normalizeCategoryName(recipe.category || '');
    if (engaged && category) names.add(category);
  }
  return [...names];
}

// What the ranking actually uses: the chosen interests plus the ones their
// likes and bookmarks imply, each turned into a word matcher
export function buildInterestProfile(
  chosenInterests: string[],
  recipes: any[],
  userId: string | null
): InterestProfile {
  const matchers: RegExp[] = [];
  const seen = new Set<string>();

  for (const name of [...(chosenInterests || []), ...interestsFromActivity(recipes, userId)]) {
    const key = normalizeCategoryName(name).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const matcher = buildMatcher(name);
    if (matcher) matchers.push(matcher);
  }

  return { matchers, isEmpty: matchers.length === 0 };
}

// Where an interest is allowed to match inside a dish
function searchableText(recipe: any): string {
  return [recipe?.category, recipe?.title, recipe?.ingredients]
    .filter((value) => typeof value === 'string')
    .join(' \n ');
}

export function scoreRecipe(recipe: any, profile: InterestProfile, nowMs: number): number {
  let score = 0;

  if (!profile.isEmpty) {
    const text = searchableText(recipe);
    if (profile.matchers.some((matcher) => matcher.test(text))) {
      score += INTEREST_WEIGHT;

      const category = normalizeCategoryName(recipe?.category || '');
      if (category && profile.matchers.some((matcher) => matcher.test(category))) {
        score += CATEGORY_MATCH_BONUS;
      }
    }
  }

  score += likeCount(recipe) * LIKE_WEIGHT;
  score += saveCount(recipe) * SAVE_WEIGHT;

  const postedAt = toMillis(recipe?.createdAt);
  if (postedAt !== null) {
    const age = nowMs - postedAt;
    if (age <= 7 * DAY_IN_MS) score += FRESH_WEEK_BOOST;
    else if (age <= 30 * DAY_IN_MS) score += FRESH_MONTH_BOOST;
  }

  return score;
}

// Returns a new array - the caller's list is left alone. Each dish is scored
// once, not once per comparison. Equal scores keep the newest dish first so the
// order doesn't jump around between renders.
export function rankForYou(recipes: any[], profile: InterestProfile, nowMs: number): any[] {
  return recipes
    .map((recipe) => ({ recipe, score: scoreRecipe(recipe, profile, nowMs) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (toMillis(b.recipe.createdAt) ?? 0) - (toMillis(a.recipe.createdAt) ?? 0);
    })
    .map((entry) => entry.recipe);
}

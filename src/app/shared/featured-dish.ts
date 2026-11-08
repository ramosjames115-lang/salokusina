// How the "Featured Dish" on the Home feed gets chosen.
//
// 1. If an admin pinned a dish (the /settings/featuredDish document), that one
//    wins - until its featuredUntil date passes.
// 2. Otherwise it's the most-liked dish posted in the last 7 days.
// 3. If nothing from this week has a like yet, widen to the last 30 days.
// 4. Still nothing? Fall back to the most-liked dish overall.

// The pinned-dish document: /settings/featuredDish
export const FEATURED_SETTINGS_COLLECTION = 'settings';
export const FEATURED_SETTINGS_DOC_ID = 'featuredDish';

export const FEATURED_WEEK_DAYS = 7;
export const FEATURED_MONTH_DAYS = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

// What an admin saves to pin a dish to the top of everyone's Home feed
export interface AdminFeaturedPick {
  recipeId?: string;
  featuredUntil?: unknown; // Firestore Timestamp, or empty for "no end date"
  note?: string;           // optional label shown under the badge
}

export interface FeaturedPick {
  recipe: any;
  reason: string; // why this dish is featured, shown under the FEATURED badge
}

// Firestore hands timestamps back as Timestamp objects, but a locally created
// draft may still hold a Date or a plain number - accept all of them
export function toMillis(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return null;
}

export function likeCount(recipe: any): number {
  return (recipe?.likedBy || []).length;
}

export function saveCount(recipe: any): number {
  return (recipe?.savedBy || []).length;
}

// Most likes wins; ties are broken by bookmarks, then by whichever was posted
// more recently
function mostLiked(recipes: any[]): any | null {
  if (!recipes.length) return null;
  return [...recipes].sort((a, b) => {
    const byLikes = likeCount(b) - likeCount(a);
    if (byLikes !== 0) return byLikes;
    const bySaves = saveCount(b) - saveCount(a);
    if (bySaves !== 0) return bySaves;
    return (toMillis(b.createdAt) ?? 0) - (toMillis(a.createdAt) ?? 0);
  })[0];
}

export function pickFeaturedDish(
  publishedRecipes: any[],
  adminPick: AdminFeaturedPick | null,
  nowMs: number
): FeaturedPick | null {
  if (!publishedRecipes.length) return null;

  // 1. An admin's pick overrides the algorithm while it's still in date
  if (adminPick?.recipeId) {
    const pinned = publishedRecipes.find((recipe) => recipe.id === adminPick.recipeId);
    const until = toMillis(adminPick.featuredUntil);
    if (pinned && (until === null || until >= nowMs)) {
      return { recipe: pinned, reason: (adminPick.note || '').trim() || "Admin's pick" };
    }
  }

  // 2 & 3. Most-liked dish inside the time window, newest window first. A dish
  // with zero likes doesn't count as "most loved", so the week can come up
  // empty and hand over to the month.
  const windows = [
    { days: FEATURED_WEEK_DAYS, reason: 'Most loved this week' },
    { days: FEATURED_MONTH_DAYS, reason: 'Most loved this month' }
  ];

  for (const window of windows) {
    const cutoff = nowMs - window.days * DAY_IN_MS;
    const inWindow = publishedRecipes.filter((recipe) => {
      const postedAt = toMillis(recipe.createdAt);
      return postedAt !== null && postedAt >= cutoff && likeCount(recipe) > 0;
    });
    const best = mostLiked(inWindow);
    if (best) return { recipe: best, reason: window.reason };
  }

  // 4. Nothing recent to go on - show the all-time favourite, or on a brand new
  // app just the newest dish
  const overall = mostLiked(publishedRecipes);
  if (!overall) return null;
  return {
    recipe: overall,
    reason: likeCount(overall) > 0 ? 'Most loved of all time' : 'Fresh from the kitchen'
  };
}

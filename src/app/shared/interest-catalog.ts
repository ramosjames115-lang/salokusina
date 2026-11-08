// The food interests a user can follow, grouped so the picker stays readable.
//
// Each interest carries the words that count as a match inside a recipe. That's
// what lets an interest be more specific than a category: "Manok" matches a
// dish whose category is Filipino but whose title/ingredients say chicken.

import { CategoryOption, normalizeCategoryName } from './category-catalog';

export interface InterestOption {
  name: string;       // shown on the chip, and what gets saved on the profile
  keywords: string[]; // words that count as a match (lowercase, whole words)
}

export interface InterestGroup {
  title: string;
  interests: InterestOption[];
}

// Where categories that aren't covered by the fixed groups below end up
export const EXTRA_INTERESTS_GROUP_TITLE = 'More from the kitchen';

export const INTEREST_GROUPS: InterestGroup[] = [
  {
    title: 'Cuisine',
    interests: [
      { name: 'Filipino', keywords: ['filipino', 'pinoy', 'lutong bahay'] },
      { name: 'Chinese', keywords: ['chinese', 'tsinoy'] },
      { name: 'Korean', keywords: ['korean', 'kimchi'] },
      { name: 'Japanese', keywords: ['japanese', 'sushi', 'ramen'] },
      { name: 'American', keywords: ['american', 'burger'] },
      { name: 'Italian', keywords: ['italian', 'pizza'] }
    ]
  },
  {
    title: 'Meal',
    interests: [
      { name: 'Almusal', keywords: ['almusal', 'breakfast', 'silog'] },
      { name: 'Merienda', keywords: ['merienda', 'snack', 'snacks'] },
      { name: 'Ulam', keywords: ['ulam', 'main dish', 'viand'] },
      { name: 'Appetizers', keywords: ['appetizer', 'appetizers', 'starter'] },
      { name: 'Salad', keywords: ['salad', 'ensalada'] },
      { name: 'Sweets and Desserts', keywords: ['dessert', 'desserts', 'sweets', 'panghimagas', 'matamis'] },
      { name: 'Pulutan', keywords: ['pulutan'] }
    ]
  },
  {
    title: 'Main ingredient',
    interests: [
      { name: 'Manok', keywords: ['manok', 'chicken'] },
      { name: 'Baboy', keywords: ['baboy', 'pork', 'liempo'] },
      { name: 'Baka', keywords: ['baka', 'beef'] },
      { name: 'Isda', keywords: ['isda', 'fish', 'seafood', 'hipon', 'shrimp', 'pusit'] },
      { name: 'Gulay', keywords: ['gulay', 'vegetable', 'vegetables', 'veggie'] },
      { name: 'Pasta / Noodles', keywords: ['pasta', 'noodles', 'pancit', 'spaghetti', 'bihon', 'miki'] }
    ]
  },
  {
    title: 'Diet / Style',
    interests: [
      { name: 'Vegetarian', keywords: ['vegetarian', 'vegan', 'meatless'] },
      { name: 'Budget-friendly', keywords: ['budget', 'mura', 'tipid'] },
      { name: 'Mabilis lutuin', keywords: ['mabilis', 'madali', 'quick', 'easy'] },
      { name: 'Inihaw', keywords: ['inihaw', 'ihaw', 'grilled', 'barbecue', 'bbq'] },
      { name: 'Prito', keywords: ['prito', 'fried', 'crispy'] },
      { name: 'Nilaga', keywords: ['nilaga', 'sabaw', 'soup', 'sinigang', 'boiled'] }
    ]
  }
];

// Every interest name in the fixed groups, lowercased
const BUILT_IN_NAMES = new Set(
  INTEREST_GROUPS.flatMap((group) => group.interests.map((interest) => interest.name.toLowerCase()))
);

// The full picker: the fixed groups, plus one last group holding any category
// that exists in the database (or that this user already saved) but isn't
// covered above - that's how a category somebody invented becomes followable.
export function buildInterestGroups(
  dbCategories: CategoryOption[],
  savedInterests: string[] = []
): InterestGroup[] {
  const extras: InterestOption[] = [];
  const seen = new Set<string>();

  for (const raw of [...dbCategories.map((cat) => cat.name), ...savedInterests]) {
    const name = normalizeCategoryName(raw);
    const key = name.toLowerCase();
    if (!name || BUILT_IN_NAMES.has(key) || seen.has(key)) continue;
    seen.add(key);
    extras.push({ name, keywords: [key] });
  }

  return extras.length
    ? [...INTEREST_GROUPS, { title: EXTRA_INTERESTS_GROUP_TITLE, interests: extras }]
    : INTEREST_GROUPS;
}

// The words behind a saved interest name. An unknown name - an older save, or a
// category somebody invented - simply matches on itself.
export function interestKeywords(name: string): string[] {
  const key = normalizeCategoryName(name).toLowerCase();
  if (!key) return [];
  for (const group of INTEREST_GROUPS) {
    for (const interest of group.interests) {
      if (interest.name.toLowerCase() === key) return interest.keywords;
    }
  }
  return [key];
}

// Flat list for places that can't show groups (the checkbox dialog), keeping
// the group name as a prefix so the context isn't lost
export function flattenInterests(groups: InterestGroup[]): { label: string; name: string }[] {
  return groups.flatMap((group) =>
    group.interests.map((interest) => ({
      label: `${group.title} · ${interest.name}`,
      name: interest.name
    }))
  );
}

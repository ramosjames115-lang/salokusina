import { Firestore, collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';

export interface CategoryOption {
  name: string;
  icon: string;
}

// The categories the app ships with. These always show up, even on a brand new
// database, so the Browse/Interests screens are never empty.
export const DEFAULT_CATEGORIES: CategoryOption[] = [
  { name: 'Filipino', icon: 'restaurant-outline' },
  { name: 'Appetizers', icon: 'fast-food-outline' },
  { name: 'Sweets and Desserts', icon: 'ice-cream-outline' },
  { name: 'Salad', icon: 'leaf-outline' },
  { name: "Best Chef's Choice", icon: 'ribbon-outline' }
];

// Anything a user typed in themselves gets this generic icon
export const FALLBACK_CATEGORY_ICON = 'pricetag-outline';

const DEFAULT_ICONS = new Map(DEFAULT_CATEGORIES.map((cat) => [cat.name.toLowerCase(), cat.icon]));

export function iconForCategory(name: string): string {
  return DEFAULT_ICONS.get(normalizeCategoryName(name).toLowerCase()) ?? FALLBACK_CATEGORY_ICON;
}

// "  filipino   food " -> "filipino food", so the same category typed with
// stray spaces doesn't become two separate entries
export function normalizeCategoryName(raw: string): string {
  return (raw || '').replace(/\s+/g, ' ').trim();
}

// Document id for the shared /categories list. Case- and symbol-insensitive so
// "Best Chef's Choice" and "best chefs choice" land on the same document.
export function categorySlug(name: string): string {
  const slug = normalizeCategoryName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'other';
}

// Builds the final picker list: the built-in categories first (in their usual
// order), then whatever the users themselves added, A-Z. Duplicates are matched
// case-insensitively, and the built-in spelling always wins.
export function mergeCategories(discoveredNames: string[]): CategoryOption[] {
  const seen = new Set(DEFAULT_CATEGORIES.map((cat) => cat.name.toLowerCase()));
  const extras: CategoryOption[] = [];

  for (const raw of discoveredNames) {
    const name = normalizeCategoryName(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push({ name, icon: FALLBACK_CATEGORY_ICON });
  }

  extras.sort((a, b) => a.name.localeCompare(b.name));
  return [...DEFAULT_CATEGORIES, ...extras];
}

// Reads the shared /categories collection - one tiny document per category that
// somebody has actually used - so the pickers stay in sync with the database
// instead of a hardcoded list. extraNames lets a caller fold in categories it
// already has in memory (e.g. the dishes the Home feed just loaded).
export async function loadCategoryCatalog(db: Firestore, extraNames: string[] = []): Promise<CategoryOption[]> {
  const names = [...extraNames];
  try {
    const snapshot = await getDocs(collection(db, 'categories'));
    snapshot.forEach((docSnap) => {
      const name = docSnap.data()['name'];
      if (typeof name === 'string') names.push(name);
    });
  } catch (error) {
    // A missing collection or a blocked read shouldn't break the picker -
    // the built-in categories are enough to keep going
    console.error('Could not load the shared category list:', error);
  }
  return mergeCategories(names);
}

// Called right after a recipe is saved, so a category somebody typed in by hand
// becomes available to everyone else. Never fatal: the recipe is already saved.
export async function rememberCategory(db: Firestore, name: string): Promise<void> {
  const clean = normalizeCategoryName(name);
  if (!clean) return;
  try {
    await setDoc(
      doc(db, 'categories', categorySlug(clean)),
      { name: clean, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (error) {
    console.error('Could not add the category to the shared list:', error);
  }
}

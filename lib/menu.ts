import seed from './menu-seed.json';

export interface MenuSeedItem {
  name: string;
  price: number;
  category: string;
  image: string;
}

/**
 * The starter menu. Kept in `menu-seed.json` so the demo seed script can read
 * the same list without importing TypeScript.
 */
export const MENU_SEED: MenuSeedItem[] = seed;

export const MENU_CATEGORIES = ['Drinks', 'Snacks', 'Meals', 'Desserts'];
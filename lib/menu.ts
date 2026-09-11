export interface MenuSeedItem {
  name: string;
  price: number;
  category: string;
  image: string;
}

const img = (id: string) => `https://images.unsplash.com/${id}?w=800&q=80`;

export const MENU_SEED: MenuSeedItem[] = [
  { name: 'Tea', price: 20, category: 'Drinks', image: img('photo-1544787219-7f47ccb76574') },
  { name: 'Coffee', price: 40, category: 'Drinks', image: img('photo-1509042239860-f550ce710b93') },
  { name: 'Venom Smoothie', price: 120, category: 'Drinks', image: img('photo-1553530666-ba11a7da3888') },
  { name: 'Jungle Frost', price: 180, category: 'Drinks', image: img('photo-1544145945-f90425340c7e') },
  { name: 'Zoo Delight', price: 150, category: 'Drinks', image: img('photo-1551503766-ac63dfa6401c') },
  { name: 'Fang Cookies', price: 30, category: 'Snacks', image: img('photo-1499636136210-6f4ee915583e') },
  { name: 'Marshmallow', price: 25, category: 'Snacks', image: img('photo-1542990253-0d0f5be5f0ed') },
  { name: 'Cobra Burger', price: 150, category: 'Snacks', image: img('photo-1568901346375-23c9450c58cd') },
  { name: 'Shedded Pizza', price: 280, category: 'Meals', image: img('photo-1513104890138-7c749659a591') },
  { name: 'Venomous Pasta', price: 220, category: 'Meals', image: img('photo-1621996346565-e3dbc646d9a9') },
];

export const MENU_CATEGORIES = ['Drinks', 'Snacks', 'Meals', 'Desserts'];
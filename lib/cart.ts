export interface CartItem {
  name: string;
  price: number;
  quantity: number;
}

export const CART_CHANGED_EVENT = 'snake:cart-changed';

const STORAGE_KEY = 'snake_cart';

function valid(item: unknown): item is CartItem {
  if (typeof item !== 'object' || item === null) return false;
  const i = item as Record<string, unknown>;
  return (
    typeof i.name === 'string' &&
    typeof i.price === 'number' &&
    Number.isInteger(i.quantity) &&
    (i.quantity as number) > 0
  );
}

export function getCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(valid) : [];
  } catch {
    return [];
  }
}

export function setCart(items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage unavailable; ignore
  }
  window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
}

export function addToCart(item: { name: string; price: number; quantity?: number }): void {
  const items = getCart();
  const existing = items.find((i) => i.name === item.name);
  if (existing) {
    existing.quantity += item.quantity ?? 1;
  } else {
    items.push({ name: item.name, price: item.price, quantity: item.quantity ?? 1 });
  }
  setCart(items);
}

export function updateCartQuantity(name: string, quantity: number): void {
  if (quantity <= 0) {
    setCart(getCart().filter((i) => i.name !== name));
    return;
  }
  setCart(
    getCart().map((i) => (i.name === name ? { ...i, quantity } : i))
  );
}

export function clearCart(): void {
  setCart([]);
}

export function cartTotals(items: CartItem[]) {
  const subtotal = Math.round(items.reduce((sum, i) => sum + i.price * i.quantity, 0) * 100) / 100;
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  return { subtotal, count };
}

export function subscribeCart(cb: () => void): () => void {
  window.addEventListener(CART_CHANGED_EVENT, cb);
  return () => window.removeEventListener(CART_CHANGED_EVENT, cb);
}
export interface MemberPublic {
  id: number;
  username: string; // member ID used to log in
  name: string;
  sc: number; // Snake Coins: earned from games, used as order discount
  money: number; // rupees (₹): used to pay for orders
  phone: string;
  address: string;
  upiId: string;
}

export interface StoreSettings {
  storeName: string;
  currencyName: string;
  currencySymbol: string;
  welcomeBonus: number;
  timezone: string;
  /** Highest share of an order that loyalty coins may pay for. */
  maxDiscountPercent: number;
  /** GST rate printed on the invoice. Menu prices are treated as GST-inclusive. */
  gstPercent: number;
  /** FSSAI licence number printed on the invoice (optional). */
  fssaiNumber: string;
  /** GSTIN printed on the invoice (optional). */
  gstin: string;
  /** Extra line printed at the bottom of an invoice (optional). */
  invoiceNote: string;
}

export interface MenuItem {
  id: number;
  name: string;
  price: number;
  category: string;
  active: boolean;
  image: string;
}

export const DEFAULT_STORE_NAME = 'Snake Cafe';
export const DEFAULT_CURRENCY_NAME = 'Snake Coins';
export const DEFAULT_CURRENCY_SYMBOL = 'SC';
export const DEFAULT_WELCOME_BONUS = 20;

/** 100 Snake Coins = 1 ₹ */
export const SC_PER_RUPEE = 100;

export function formatCoins(amount: number, symbol = DEFAULT_CURRENCY_SYMBOL): string {
  return `${amount.toFixed(2)} ${symbol}`;
}

export function formatRupees(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

export function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
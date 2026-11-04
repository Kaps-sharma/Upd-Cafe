/**
 * Order status + type vocabulary.
 *
 * This module is deliberately client-safe (no database imports) so both the
 * server (lib/db.ts) and the browser components can share one definition of
 * what an order is and which statuses may follow which.
 */

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export interface OrderLine {
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: number;
  orderNo: string;
  memberId: number;
  memberName: string;
  status: OrderStatus;
  orderType: OrderType;
  tableNumber: string;
  items: OrderLine[];
  subtotal: number;
  coinDiscount: number;
  total: number;
  coinsUsed: number;
  paymentMethod: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'preparing',
  'ready',
  'completed',
  'cancelled',
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'New order',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const ORDER_STATUS_HINT: Record<OrderStatus, string> = {
  pending: 'Waiting for the kitchen to accept it.',
  preparing: 'The kitchen is making it now.',
  ready: 'Ready for pickup or service.',
  completed: 'Served and closed. Thanks!',
  cancelled: 'Cancelled. The amount was refunded to your wallet.',
};

/** Every status an order may legally be moved *to* from the current one. */
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** The next step on the happy path, or null when the order is closed. */
export const ORDER_NEXT: Record<OrderStatus, OrderStatus | null> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'completed',
  completed: null,
  cancelled: null,
};

/** Button text for the next happy-path step. */
export const ORDER_NEXT_ACTION: Record<OrderStatus, string> = {
  pending: 'Start preparing',
  preparing: 'Mark ready',
  ready: 'Complete order',
  completed: '',
  cancelled: '',
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

export const ORDER_TYPE_HINT: Record<OrderType, string> = {
  dine_in: 'Eat at the café — pick your table',
  takeaway: 'Pick it up at the counter',
  delivery: 'We bring it to your saved address',
};

/** The four steps shown to the customer as a progress bar. */
export const PROGRESS_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'pending', label: 'Placed' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready', label: 'Ready' },
  { status: 'completed', label: 'Completed' },
];

export function orderNo(id: number): string {
  return `#${String(id).padStart(4, '0')}`;
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as string[]).includes(value);
}

export function isOrderType(value: unknown): value is OrderType {
  return value === 'dine_in' || value === 'takeaway' || value === 'delivery';
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_FLOW[from].includes(to);
}

export function isOrderClosed(status: OrderStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

/** 0-3 for the happy path, -1 when cancelled. */
export function progressStep(status: OrderStatus): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'preparing':
      return 1;
    case 'ready':
      return 2;
    case 'completed':
      return 3;
    default:
      return -1;
  }
}

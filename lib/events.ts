export const BALANCE_CHANGED_EVENT = 'snake:balance-changed';

export function emitBalanceChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BALANCE_CHANGED_EVENT));
  }
}
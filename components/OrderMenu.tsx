'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { MenuItem } from '@/lib/store';
import { formatCoins, formatRupees, DEFAULT_CURRENCY_SYMBOL } from '@/lib/store';
import { BALANCE_CHANGED_EVENT } from '@/lib/events';
import {
  type CartItem,
  getCart,
  addToCart,
  updateCartQuantity,
  cartTotals,
  subscribeCart,
} from '@/lib/cart';

interface OrderMember {
  money: number;
  sc: number;
}

interface OrderMenuProps {
  storeName: string;
  currencyName: string;
  currencySymbol?: string;
  items: MenuItem[];
  member: OrderMember;
}

export default function OrderMenu({
  storeName,
  currencyName,
  currencySymbol = DEFAULT_CURRENCY_SYMBOL,
  items,
  member,
}: OrderMenuProps) {
  const [money, setMoney] = useState(member.money);
  const [sc, setSc] = useState(member.sc);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [category, setCategory] = useState('All');
  const [added, setAdded] = useState<string | null>(null);

  const refreshBalance = async () => {
    const res = await fetch('/api/me', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setMoney(data.member.money);
      setSc(data.member.sc);
    }
  };

  useEffect(() => {
    refreshBalance();
    const balanceHandler = () => refreshBalance();
    window.addEventListener(BALANCE_CHANGED_EVENT, balanceHandler);
    const sync = () => setCartItems(getCart());
    sync();
    const unsub = subscribeCart(sync);
    return () => {
      window.removeEventListener(BALANCE_CHANGED_EVENT, balanceHandler);
      unsub();
    };
  }, []);

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const item of items) {
      if (item.active && !seen.includes(item.category)) seen.push(item.category);
    }
    return seen;
  }, [items]);

  const visibleItems = useMemo(
    () => items.filter((item) => item.active && (category === 'All' || item.category === category)),
    [items, category]
  );

  const { subtotal, count } = cartTotals(cartItems);

  const handleAdd = (item: MenuItem) => {
    addToCart({ name: item.name, price: item.price });
    setAdded(item.name);
    window.setTimeout(() => setAdded(null), 900);
  };

  return (
    <div className="container order-page">
      <div className="page-head-row">
        <div>
          <h1>Order from {storeName}</h1>
          <p className="subtitle">
            Add items to your cart, then pay from the cart. Spend your {currencyName} for a
            discount (100 {currencySymbol} = ₹1).
          </p>
        </div>
        <div className="wallet-pills">
          <Link href="/profile" className="balance-pill balance-pill-link">
            <span className="balance-pill-label">Wallet</span>
            <strong>{formatRupees(money)}</strong>
          </Link>
          <div className="balance-pill">
            <span className="balance-pill-label">{currencyName}</span>
            <strong>{formatCoins(sc, currencySymbol)}</strong>
          </div>
        </div>
      </div>

      <div className="filter-chips" role="tablist" aria-label="Menu categories">
        {['All', ...categories].map((cat) => (
          <button
            key={cat}
            className={category === cat ? 'chip active' : 'chip'}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="menu-grid">
        {visibleItems.map((item) => {
          const qty = cartItems.find((i) => i.name === item.name)?.quantity ?? 0;
          return (
            <div key={item.id} className="card menu-item">
              <div className="menu-item-media">
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 300px"
                    priority={false}
                  />
                ) : (
                  <span aria-hidden="true">{item.name.charAt(0)}</span>
                )}
              </div>
              <div className="menu-item-info">
                <div>
                  <span className="menu-item-name">{item.name}</span>
                  <span className="menu-item-category">{item.category}</span>
                </div>
                <div className="menu-item-price-box">
                  <span className="menu-item-price">{formatRupees(item.price)}</span>
                  {qty > 0 && (
                    <span className="menu-item-subtotal">= {formatRupees(item.price * qty)}</span>
                  )}
                </div>
              </div>
              {qty === 0 ? (
                <button
                  className="btn btn-sm add-to-cart-btn"
                  onClick={() => handleAdd(item)}
                  disabled={added === item.name}
                >
                  {added === item.name ? 'Added ✓' : 'Add to cart'}
                </button>
              ) : (
                <div className="stepper">
                  <button
                    className="btn btn-sm"
                    onClick={() => updateCartQuantity(item.name, qty - 1)}
                    aria-label={`Remove one ${item.name}`}
                  >
                    -
                  </button>
                  <span className="stepper-value">{qty}</span>
                  <button
                    className="btn btn-sm"
                    onClick={() => updateCartQuantity(item.name, qty + 1)}
                    aria-label={`Add one ${item.name}`}
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {visibleItems.length === 0 && (
        <p className="muted">Nothing on the menu in this category yet.</p>
      )}

      {count > 0 && (
        <Link href="/cart" className="cart-bar" aria-label={`View cart with ${count} items`}>
          <span className="cart-bar-count">{count}</span>
          <span>View cart</span>
          <strong>{formatRupees(subtotal)}</strong>
        </Link>
      )}
    </div>
  );
}
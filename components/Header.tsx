'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BALANCE_CHANGED_EVENT } from '@/lib/events';
import { formatCoins, formatRupees, DEFAULT_CURRENCY_SYMBOL } from '@/lib/store';
import { getCart, cartTotals, subscribeCart } from '@/lib/cart';

interface HeaderMember {
  name: string;
  sc: number;
  money: number;
}

interface HeaderProps {
  storeName: string;
  currencyName?: string;
  currencySymbol?: string;
  member?: HeaderMember | null;
}

const SHOW_CART_PAGES = ['/menu', '/cart'];

export default function Header({
  storeName,
  currencySymbol = DEFAULT_CURRENCY_SYMBOL,
  member,
}: HeaderProps) {
  const [money, setMoney] = useState(member?.money ?? 0);
  const [sc, setSc] = useState(member?.sc ?? 0);
  const [cartCount, setCartCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const homeHref = '/';
  const showCart = !!member && SHOW_CART_PAGES.includes(pathname);

  const refreshBalance = async () => {
    if (!member) return;
    const res = await fetch('/api/me', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setMoney(data.member.money);
      setSc(data.member.sc);
    }
  };

  useEffect(() => {
    if (!member) return;
    const handler = () => refreshBalance();
    window.addEventListener(BALANCE_CHANGED_EVENT, handler);
    const updateCart = () => setCartCount(cartTotals(getCart()).count);
    updateCart();
    const unsub = subscribeCart(updateCart);
    return () => {
      window.removeEventListener(BALANCE_CHANGED_EVENT, handler);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member]);

  const navActive = (href: string) => {
    if (href === '/menu') return pathname === '/menu' || pathname === '/cart';
    if (href === '/games') return ['/games', '/quiz', '/guess', '/tictactoe'].includes(pathname);
    return pathname === href;
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await fetch('/api/logout', { method: 'POST' });
    } finally {
      setBusy(false);
    }
    router.push('/');
    router.refresh();
  };

  return (
    <header className="site-header" role="banner">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label={`${storeName} home`}>
          <span className="brand-mark" aria-hidden="true">SC</span>
          <span>{storeName}</span>
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <Link
            href={homeHref}
            className={navActive('/') ? 'nav-link active' : 'nav-link'}
            aria-current={navActive('/') ? 'page' : undefined}
          >
            Home
          </Link>
          <Link
            href="/menu"
            className={navActive('/menu') ? 'nav-link active' : 'nav-link'}
            aria-current={navActive('/menu') ? 'page' : undefined}
          >
            Menu
          </Link>
          <Link
            href="/book"
            className={navActive('/book') ? 'nav-link active' : 'nav-link'}
            aria-current={navActive('/book') ? 'page' : undefined}
          >
            Book
          </Link>
          <Link
            href="/games"
            className={navActive('/games') ? 'nav-link active' : 'nav-link'}
            aria-current={navActive('/games') ? 'page' : undefined}
          >
            Games
          </Link>
        </nav>
        <div className="header-user">
          {member ? (
            <>
              {showCart && (
                <Link href="/cart" className="cart-chips" aria-label={`Cart with ${cartCount} items`}>
                  <span className="cart-chip-icon" aria-hidden="true">🛒</span>
                  {cartCount > 0 && <span className="cart-chip-count">{cartCount}</span>}
                </Link>
              )}
              {showCart && <span className="header-balance">{formatCoins(sc, currencySymbol)}</span>}
              <Link href="/profile" className="header-money" title="Tap to add money">
                {formatRupees(money)}
              </Link>
              <Link href="/profile" className="header-name-link">
                Profile
              </Link>
              <button className="btn btn-ghost btn-sm" onClick={handleLogout} disabled={busy} aria-label="Log out">
                Log out
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn-primary btn-sm">
              Log in / Sign up
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
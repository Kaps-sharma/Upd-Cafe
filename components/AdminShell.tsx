'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AdminShell({ storeName }: { storeName: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const logout = async () => {
    setBusy(true);
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="site-header" role="banner">
      <div className="site-header-inner">
        <Link href="/admin" className="brand" aria-label="Admin panel">
          <span className="brand-mark" aria-hidden="true">SC</span>
          <span>
            {storeName}
            <span className="brand-admin">Admin</span>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Admin navigation">
          <Link href="/" className="nav-link">
            Back to store
          </Link>
        </nav>
        <div className="header-user">
          <button className="btn btn-ghost btn-sm" onClick={logout} disabled={busy}>
            Admin log out
          </button>
        </div>
      </div>
    </header>
  );
}
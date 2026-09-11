import type { Metadata } from 'next';
import { getStoreSettings } from '@/lib/db';
import AdminLoginForm from '@/components/AdminLoginForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Login',
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const settings = getStoreSettings();
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="brand-large">
          <span className="brand-mark">SC</span>
        </div>
        <h1>{settings.storeName} Admin</h1>
        <p className="auth-subtitle">Enter the admin passcode to manage the store.</p>
        <AdminLoginForm />
      </div>
    </main>
  );
}
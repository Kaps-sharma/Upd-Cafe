import type { Metadata } from 'next';
import Link from 'next/link';
import { getAuthMember } from '@/lib/auth';
import { getStoreSettings } from '@/lib/db';
import Header from '@/components/Header';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'What data this café app collects, why it is needed, and how to access, correct or delete it.',
};

export default async function PrivacyPage() {
  const member = await getAuthMember();
  const settings = await getStoreSettings();

  return (
    <main>
      <Header
        storeName={settings.storeName}
        currencyName={settings.currencyName}
        currencySymbol={settings.currencySymbol}
        member={member}
        signedIn={!!member}
      />

      <div className="container legal-page">
        <h1>Privacy policy</h1>
        <p className="subtitle">
          How {settings.storeName} handles your personal data, in plain language.
        </p>

        <div className="card legal-card">
          <p className="muted">Last updated: 4 November 2026</p>

          <h2>1. Who we are</h2>
          <p>
            {settings.storeName} runs this ordering, loyalty and table-booking app. The café is the
            data controller for the information described below. You can reach the café using the
            contact details printed on your bill or displayed in the café.
          </p>

          <h2>2. What we collect</h2>
          <ul>
            <li>
              <strong>Account details:</strong> your member ID, display name, and a salted password
              hash. We never store your password itself.
            </li>
            <li>
              <strong>Contact details you choose to add:</strong> a phone number and delivery
              address. These are optional unless you order delivery.
            </li>
            <li>
              <strong>Order and booking records:</strong> items, amounts, order type, table, date
              and time, plus any kitchen note you write.
            </li>
            <li>
              <strong>Loyalty records:</strong> your wallet balance, coin balance and the coin
              ledger that explains every change.
            </li>
            <li>
              <strong>Game records:</strong> the games you play, your score or result, and the
              server-side game state needed to stop cheating.
            </li>
            <li>
              <strong>Session cookie:</strong> a signed, HTTP-only cookie that keeps you logged in
              for up to seven days. It is not used for advertising or cross-site tracking.
            </li>
          </ul>

          <h2>3. Why we use it</h2>
          <ul>
            <li>To create and secure your account, and to recognise you when you return.</li>
            <li>To prepare and hand over your order, and to hold the table you booked.</li>
            <li>To run the wallet and loyalty-coin scheme you asked to join.</li>
            <li>To print a correct invoice and keep the sales records a café must keep.</li>
            <li>To prevent abuse, such as replaying a game or tampering with an order total.</li>
          </ul>

          <h2>4. Consent and your choices</h2>
          <p>
            When you create an account you tick a box confirming that you have read this policy and
            consent to your data being used for the purposes above. Under India&apos;s Digital
            Personal Data Protection Act, 2023 (DPDP Act) you may withdraw that consent at any time
            by deleting your account, or by asking café staff to do it for you. Withdrawing consent
            means we can no longer run your account, wallet or bookings.
          </p>

          <h2>5. Who can see it</h2>
          <p>
            Your data is visible to you and to authorised café staff who need it to take orders,
            manage bookings and correct a wallet or coin balance. The app and database are hosted by
            service providers acting on the café&apos;s instructions; they do not use your data for
            their own purposes. We do not sell your data or use it for third-party advertising.
          </p>

          <h2>6. How long we keep it</h2>
          <p>
            Account, order and coin records are kept while your account exists. Session cookies
            expire after seven days. When you delete your account, your member profile, orders,
            bookings, coin history and game sessions are removed from the live database. Backup
            copies, if any, are overwritten on the hosting provider&apos;s normal backup cycle.
          </p>

          <h2>7. Your rights</h2>
          <ul>
            <li>Ask what personal data we hold about you.</li>
            <li>Correct your name, phone number or address from your profile page.</li>
            <li>Ask for a copy of your order and loyalty history.</li>
            <li>
              Delete your account and personal data. Signed-in members can do this themselves from{' '}
              <Link href="/profile">your profile</Link>; café staff can also do it on request.
            </li>
            <li>Complain to the café first, and to the Data Protection Board of India if needed.</li>
          </ul>

          <h2>8. Children</h2>
          <p>
            The app is not intended for children under 18. If you believe a child has created an
            account, contact the café and we will delete it.
          </p>

          <h2>9. Security</h2>
          <p>
            Passwords are stored as salted scrypt hashes. Sessions are signed and sent in HTTP-only
            cookies, and admin access is passcode-protected with a lockout after repeated failures.
            No system is perfectly secure, so please use a password you do not reuse elsewhere.
          </p>

          <h2>10. Changes</h2>
          <p>
            If this policy changes in a way that affects what we collect or why, we will update this
            page and ask you to accept the new version the next time you sign in.
          </p>

          <div className="actions">
            <Link href={member ? '/profile' : '/'} className="btn">
              {member ? 'Back to your profile' : 'Back to home'}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

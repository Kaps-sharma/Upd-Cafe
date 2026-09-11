import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getAuthMember } from '@/lib/auth';
import { getStoreSettings } from '@/lib/db';
import Header from '@/components/Header';

export const dynamic = 'force-dynamic';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1600&q=80';
const ABOUT_IMAGE = 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=800&q=80';

const REVIEWS = [
  {
    name: 'Ananya S.',
    text: 'The Venom Smoothie is honestly the best thing I’ve had this year. I ordered, played a quick game while waiting, and my coffee was already up.',
    rating: 5,
  },
  {
    name: 'Rahul M.',
    text: 'Came for the menu, stayed for the games. Won enough Snake Coins to get my whole order discounted. This place is dangerously fun.',
    rating: 5,
  },
  {
    name: 'Priya K.',
    text: 'Booked a table for dinner on a busy Saturday and it was ready in a minute. The staff remembered our names the second visit.',
    rating: 5,
  },
  {
    name: 'Dev A.',
    text: 'A coffee shop where your loyalty is actually rewarded. 100 coins off a rupee and a wallet on tap. Genuinely clever.',
    rating: 4,
  },
  {
    name: 'Meera D.',
    text: 'The Cobra Burger and a quick round of Tic Tac Toe? My new Friday ritual. Cozy corner tables too.',
    rating: 5,
  },
];

export const metadata: Metadata = {
  title: 'Cafe with a bite',
  description:
    'Order snacks, book a table, and play games to earn coins at Snake Cafe. Good food with a little fun on the side.',
};

export default async function LandingPage() {
  const member = await getAuthMember();
  const settings = await getStoreSettings();
  const currency = settings.currencySymbol;

  return (
    <main>
      <Header
        storeName={settings.storeName}
        currencyName={settings.currencyName}
        currencySymbol={settings.currencySymbol}
        member={member}
      />

      <section className="landing-hero">
        <div className="landing-hero-media">
          <Image
            src={HERO_IMAGE}
            alt="Inside Snake Cafe, warm lights and busy tables"
            fill
            priority
            sizes="100vw"
          />
        </div>
        <div className="landing-hero-overlay" aria-hidden="true" />
        <div className="landing-hero-content">
          <span className="landing-badge">{settings.storeName}</span>
          <h1>Good coffee, hot food, and a game on the side.</h1>
          <p className="landing-hero-sub">
            Order at the counter, book a corner table, or play a quick game to earn {currency} —
            100 {currency} takes ₹1 off your order. Every visit deserves a little fun.
          </p>
          <div className="landing-cta-row">
            <Link href="/menu" className="btn btn-primary btn-lg">
              Order from the menu
            </Link>
            <Link href="/games" className="btn btn-ghost btn-lg btn-light">
              Play games &amp; earn
            </Link>
          </div>
          <p className="landing-hero-note">
            {member ? `Welcome back, ${member.name}.` : 'New here? Sign up and get ₹20 in your wallet.'}
          </p>
        </div>
      </section>

      <section className="landing-section">
        <div className="container">
          <div className="landing-head">
            <h2>Your neighbourhood spot, reimagined</h2>
            <p className="subtitle">
              See the menu, reserve a table, gain wallet, and earn your discount — all from one
              little cafe in the corner shop.
            </p>
          </div>

          <div className="landing-about">
            <div className="landing-about-media">
              <Image src={ABOUT_IMAGE} alt="Fresh food being prepared at Snake Cafe" fill sizes="(max-width: 640px) 100vw, 480px" />
            </div>
            <div className="landing-about-text">
              <h3>Treat yourself</h3>
              <p>
                From a quiet morning tea to the famous Venomous Pasta, our menu is made fresh
                through the day. Pick your table on the floor plan, add notes, and skip the
                counter queues altogether.
              </p>
              <p>
                Play Quiz, Guess the Number, or Tic Tac Toe to earn up to 200 {currency} a day.
                Redeem them at checkout — 100 {currency} wipes ₹1 off your bill. Fancy a snack
                before your game? The kitchen has you covered.
              </p>
              <Link href="/menu" className="btn btn-primary">
                See the full menu
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-tint">
        <div className="container">
          <div className="landing-head">
            <h2>Everything, right here</h2>
            <p className="subtitle">Three reasons you’ll want to come back.</p>
          </div>
          <div className="feature-strip">
            <div className="card feature-card">
              <h3>🍴 Fresh on the menu</h3>
              <p>Drinks, snacks and meals made to order, with prices in rupees on every plate.</p>
            </div>
            <div className="card feature-card">
              <h3>🎮 Games pay real discounts</h3>
              <p>Three quick games. Win {currency} every day and spend them like cash.</p>
            </div>
            <div className="card feature-card">
              <h3>🪑 Book a table</h3>
              <p>See the floor plan, pick your seats and time, and walk in to a table that’s ready.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="container">
          <div className="landing-head">
            <h2>What our regulars say</h2>
            <p className="subtitle">Unsponsored, unedited, and definitely returning for more.</p>
          </div>
          <div className="reviews-grid">
            {REVIEWS.map((review) => (
              <div key={review.name} className="card review-card">
                <div className="stars" aria-label={`${review.rating} out of 5 stars`}>
                  {'★'.repeat(review.rating)}
                  <span className="stars-empty">{'★'.repeat(5 - review.rating)}</span>
                </div>
                <p className="review-text">“{review.text}”</p>
                <span className="review-name">— {review.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <div className="container">
          <h2>Your table’s waiting.</h2>
          <p className="landing-hero-sub">
            Sign up now and we’ll drop ₹20 in your wallet to get you started.
          </p>
          <div className="landing-cta-row">
            <Link href={member ? '/menu' : '/login'} className="btn btn-primary btn-lg">
              {member ? 'Start your order' : 'Sign up & get ₹20'}
            </Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="container">
          <div className="landing-footer-grid">
            <div className="landing-footer-col landing-footer-brand">
              <span className="brand-mark" aria-hidden="true">SC</span> {settings.storeName}
              <p className="muted">
                {settings.currencyName} · 100 {currency} = ₹1 every day.
                Good coffee, hot food, and a game on the side.
              </p>
            </div>
            <div className="landing-footer-col">
              <h4>Explore</h4>
              <Link href="/menu">Menu</Link>
              <Link href="/book">Book a table</Link>
              <Link href="/games">Games &amp; rewards</Link>
              <Link href={member ? '/profile' : '/login'}>
                {member ? 'My profile' : 'Sign up & get ₹20'}
              </Link>
            </div>
            <div className="landing-footer-col">
              <h4>Services</h4>
              <span>Order at the counter</span>
              <span>Table reservations</span>
              <span>Earn {currency} from games</span>
              <span>₹1 off per 100 {currency}</span>
            </div>
            <div className="landing-footer-col">
              <h4>Contact</h4>
              <span>12, Market Lane, Sector 14, Gurugram</span>
              <span>+91 98000 12345</span>
              <span>hello@snakecafe.in</span>
              <span>Open every day · 8 AM – 11 PM</span>
            </div>
          </div>
          <div className="landing-footer-bottom">
            <span className="muted">
              © {new Date().getFullYear()} {settings.storeName}. All rights reserved.
            </span>
            <div className="landing-social">
              <a href="https://instagram.com/" target="_blank" rel="noreferrer">
                Instagram
              </a>
              <a href="https://facebook.com/" target="_blank" rel="noreferrer">
                Facebook
              </a>
              <a href="https://x.com/" target="_blank" rel="noreferrer">
                X
              </a>
              <Link href="/admin" className="landing-admin-link">
                Admin
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
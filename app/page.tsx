import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getAuthMember } from '@/lib/auth';
import { getStoreSettings } from '@/lib/db';
import Header from '@/components/Header';
import Reveal from '@/components/Reveal';

export const dynamic = 'force-dynamic';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1600&q=80';
const ABOUT_IMAGE = 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=800&q=80';

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
        signedIn={!!member}
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
        <div className="hero-scroll" aria-hidden="true">
          <span className="hero-scroll-track" />
          <span className="hero-scroll-label">Scroll to enter</span>
        </div>
      </section>

      <section className="landing-section">
        <div className="container">
          <Reveal>
            <div className="landing-head">
              <span className="section-index">01</span>
              <h2>Your neighbourhood spot, reimagined</h2>
              <p className="subtitle">
                See the menu, reserve a table, gain wallet, and earn your discount — all from one
                little cafe in the corner shop.
              </p>
            </div>
          </Reveal>

          <Reveal>
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
          </Reveal>
        </div>
      </section>

      <section className="landing-section landing-section-tint">
        <div className="container">
          <Reveal>
            <div className="landing-head">
              <span className="section-index">02</span>
              <h2>Everything, right here</h2>
              <p className="subtitle">Three reasons you’ll want to come back.</p>
            </div>
          </Reveal>
          <div className="ledger-list">
            {[
              { title: '🍴 Fresh on the menu', text: 'Drinks, snacks and meals made to order, with prices in rupees on every plate.' },
              { title: '🎮 Games pay real discounts', text: 'Three quick games. Win {currency} every day and spend them like cash.' },
              { title: '🪑 Book a table', text: 'See the floor plan, pick your seats and time, and walk in to a table that’s ready.' },
            ].map((feature, i) => (
              <Reveal key={feature.title} delay={i * 90}>
                <div className="ledger-item">
                  <span className="ledger-index">0{i + 1}</span>
                  <h3>{feature.title}</h3>
                  <p>
                    {feature.text.replace('{currency}', String(currency))}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <div className="container">
          <Reveal>
            <span className="section-index section-index-center">03</span>
            <h2>Your table’s waiting.</h2>
            <p className="landing-hero-sub">
              Sign up now and we’ll drop ₹20 in your wallet to get you started.
            </p>
            <div className="landing-cta-row">
              <Link href={member ? '/menu' : '/login'} className="btn btn-primary btn-lg">
                {member ? 'Start your order' : 'Sign up & get ₹20'}
              </Link>
            </div>
          </Reveal>
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
              <h4>Good to know</h4>
              <span>Order at the table or counter</span>
              <span>Reservations up to 14 days ahead</span>
              <span>Walk-ins welcome</span>
              <Link href="/privacy">Privacy policy</Link>
            </div>
          </div>
          <div className="landing-footer-bottom">
            <span className="muted">
              © {new Date().getFullYear()} {settings.storeName}. All rights reserved.
            </span>
            <div className="landing-social">
              <Link href="/privacy">Privacy</Link>
              <Link href="/admin" className="landing-admin-link">
                Staff login
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="not-found">
      <div>
        <h1>404</h1>
        <p>This page doesn&apos;t exist yet.</p>
        <Link href="/" className="btn btn-primary">
          Back to Snake Cafe
        </Link>
      </div>
    </div>
  );
}
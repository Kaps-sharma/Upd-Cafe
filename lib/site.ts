const LOCAL_FALLBACK = 'http://localhost:3000';

/**
 * The public address of this deployment, normalised and always a valid URL.
 *
 * `NEXT_PUBLIC_SITE_URL` is the explicit setting. On Vercel, an empty value is
 * stored as an empty string, which used to crash `new URL('')` at build time,
 * so blank values are ignored. If the variable is missing we fall back to the
 * URL Vercel assigns automatically, then to localhost for development.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const vercelDeployment = process.env.VERCEL_URL?.trim();

  const candidate =
    explicit ||
    (vercelProduction ? `https://${vercelProduction}` : '') ||
    (vercelDeployment ? `https://${vercelDeployment}` : '') ||
    LOCAL_FALLBACK;

  try {
    return new URL(candidate).toString().replace(/\/+$/, '');
  } catch {
    return LOCAL_FALLBACK;
  }
}

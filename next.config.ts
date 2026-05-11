import type {NextConfig} from 'next';

/**
 * 🛡️ HTTP Security Headers
 *
 * Applied to every response. Provides defense-in-depth for a clinical app
 * that handles patient data (PHI). Each header addresses a specific threat:
 *
 * X-Frame-Options        → Blocks clickjacking (credential harvesting via iframe overlay).
 *                           SAMEORIGIN permits same-origin frames, blocks all external embeds.
 *
 * X-Content-Type-Options → Prevents MIME-type confusion attacks where a browser
 *                           executes a resource as a different type than declared.
 *
 * X-XSS-Protection       → Legacy XSS auditor for older browsers (IE, Chrome < 78).
 *                           mode=block halts rendering instead of attempting sanitization.
 *
 * Referrer-Policy        → Prevents patient IDs or session tokens that appear in URLs
 *                           from leaking via the HTTP Referer header to external services
 *                           (e.g., Firebase Console links, document URLs).
 *                           strict-origin-when-cross-origin: full path to same origin,
 *                           origin-only to cross-origin HTTPS, nothing to HTTP.
 *
 * Permissions-Policy     → Denies hardware APIs the app does not use.
 *                           microphone=(self) is explicitly allowed: NavigatorLog uses
 *                           the Web Speech API for voice-to-text. All others denied.
 *
 * Intentionally omitted:
 * - Content-Security-Policy: requires per-source tuning for Firebase + localforage + icons.
 *   A misconfigured CSP silently breaks the app; add with dedicated testing.
 * - Strict-Transport-Security: set by infrastructure (reverse proxy / CDN) to avoid
 *   HSTS misconfiguration locking out non-HTTPS dev/staging environments.
 */
const SECURITY_HEADERS = [
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    // microphone=(self): required for NavigatorLog Web Speech API voice recognition.
    // All other hardware/sensor APIs denied: camera, geolocation, payment, usb.
    value: 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone',
  transpilePackages: ['motion'],

  // Attach security headers to every route response.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },

  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;

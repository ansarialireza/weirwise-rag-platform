/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const sharedSecurityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";

// The browser talks to the API directly when NEXT_PUBLIC_API_URL is absolute.
let apiOrigin = "";
try {
  if (process.env.NEXT_PUBLIC_API_URL) {
    apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL).origin;
  }
} catch {
  apiOrigin = "";
}
const connectSrc = ["'self'", "ws:", "wss:", "https:", apiOrigin].filter(Boolean).join(" ");

const baseCsp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const dashboardHeaders = [
  ...sharedSecurityHeaders,
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: `${baseCsp}; frame-ancestors 'none'` },
];

// The embeddable assistant is intentionally frameable by customer sites.
const embedHeaders = [
  ...sharedSecurityHeaders,
  { key: 'Content-Security-Policy', value: `${baseCsp}; frame-ancestors *` },
];

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  async headers() {
    return [
      { source: '/embed/:path*', headers: embedHeaders },
      { source: '/((?!embed).*)', headers: dashboardHeaders },
    ];
  },
  async rewrites() {
    const backendUrl =
      process.env.INTERNAL_BACKEND_URL ||
      process.env.BACKEND_URL ||
      'http://dev-backend:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/health/:path*',
        destination: `${backendUrl}/health/:path*`,
      },
    ];
  },
};

export default nextConfig;

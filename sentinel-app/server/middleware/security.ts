export default defineEventHandler((event) => {
  const res = event.node.res;

  // 1. Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // 2. Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 3. Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 4. Force HTTPS (Strict-Transport-Security)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // 5. Restrict permissions (e.g. only allow geolocation on our origin, since we use browser geolocation)
  res.setHeader('Permissions-Policy', 'geolocation=(self)');

  // 6. Content Security Policy (CSP)
  // Allows loading assets from self, Google Fonts, and inline styles for Tailwind/animations
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com", // Nuxt dev server needs inline scripts and eval, in prod unsafe-eval should be disabled
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' ws: wss: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com", // Allow OpenStreetMap and CartoDB for maps, plus websockets for dev
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
});

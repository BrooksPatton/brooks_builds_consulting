/*
 * Sentry init. Loaded after the vendored /assets/sentry.min.js (both deferred).
 * Kept in its own file so the CSP can stay script-src 'self' with no 'unsafe-inline'.
 *
 * TODO(brooks): replace the DSN below with your real one (Sentry -> project settings).
 * The DSN's ingest host must ALSO be set in the CSP connect-src in infra/template.yaml —
 * change both together or events will be silently blocked by the browser.
 */
// Guarded: if sentry.min.js failed to load (blocker, network), don't add a
// ReferenceError of our own on top.
if (typeof Sentry !== "undefined") {
  Sentry.init({
    dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
    sampleRate: 1.0,
    // Only report errors originating from our own pages; keeps browser-extension
    // noise off the free-tier quota.
    allowUrls: [/https?:\/\/(www\.)?brooksbuilds\.com/],
  });
}

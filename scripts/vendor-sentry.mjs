/*
 * Vendors the pinned @sentry/browser into site/assets/sentry.min.js.
 * Run `npm run vendor:sentry` after any @sentry/browser version bump and commit the result.
 * The banner carries the version so CI can detect drift between the pin and the vendored file.
 */
import { build } from "esbuild";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("@sentry/browser/package.json");

await build({
  stdin: {
    // Named exports keep the bundle tree-shaken to error monitoring only —
    // add exports here if sentry-init.js ever needs more of the API.
    contents: 'export { init, captureException, captureMessage } from "@sentry/browser";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "Sentry",
  target: ["es2020"],
  banner: { js: `/* @sentry/browser@${version} vendored - do not edit; npm run vendor:sentry */` },
  outfile: "site/assets/sentry.min.js",
});

console.log(`vendored @sentry/browser@${version} -> site/assets/sentry.min.js`);

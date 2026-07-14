/*
 * CI guard: fails if the vendored site/assets/sentry.min.js was not rebuilt after
 * the @sentry/browser pin changed in package.json.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pinned = require("@sentry/browser/package.json").version;
const firstLine = readFileSync("site/assets/sentry.min.js", "utf8").split("\n", 1)[0];

if (!firstLine.includes(`@sentry/browser@${pinned} `)) {
  console.error(
    `sentry drift: package.json pins @sentry/browser@${pinned} but the vendored bundle says:\n  ${firstLine}\n` +
      "Run `npm run vendor:sentry` and commit site/assets/sentry.min.js.",
  );
  process.exit(1);
}
console.log(`vendored sentry matches pin (${pinned})`);

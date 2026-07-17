import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import { redirectFunctionCode } from "../wrappers/redirect_function";

// Executes the exact JavaScript that ships to CloudFront (via node:vm) against the
// host/uri/query matrix the original CloudFormation function was verified with. The
// cloudfront-js-2.0 runtime supports everything this code uses (ES5 + endsWith/includes),
// so passing here means the deployed behavior matches.

interface QueryEntry {
  value: string;
  multiValue?: { value: string }[];
}

interface CloudFrontRequest {
  uri: string;
  querystring: Record<string, QueryEntry>;
  headers: { host: { value: string } };
}

type HandlerResult = CloudFrontRequest & {
  statusCode?: number;
  headers: { location?: { value: string }; host?: { value: string } };
};

function makeHandler(
  canonicalHost: string,
): (event: { request: CloudFrontRequest }) => HandlerResult {
  return runInNewContext(`${redirectFunctionCode(canonicalHost)}; handler`, {});
}

function event(
  host: string,
  uri: string,
  querystring: Record<string, QueryEntry> = {},
): { request: CloudFrontRequest } {
  return { request: { uri, querystring, headers: { host: { value: host } } } };
}

function expectRedirect(result: HandlerResult, location: string) {
  assert.equal(result.statusCode, 301);
  assert.equal(result.headers.location?.value, location);
}

function expectServe(result: HandlerResult, uri: string) {
  assert.equal(result.statusCode, undefined, "expected a served request, not a redirect");
  assert.equal(result.uri, uri);
}

const environments = [
  { label: "production", canonical: "brooksbuilds.com", wrongHost: "www.brooksbuilds.com" },
  { label: "beta", canonical: "beta.brooksbuilds.com", wrongHost: "brooksbuilds.com" },
];

for (const { label, canonical, wrongHost } of environments) {
  describe(`redirect function (${label}: canonical host ${canonical})`, () => {
    const handler = makeHandler(canonical);

    it("serves / from index.html (rewrite, not redirect)", () => {
      expectServe(handler(event(canonical, "/")), "/index.html");
    });

    it("serves directory URIs from their index object", () => {
      expectServe(handler(event(canonical, "/services/")), "/services/index.html");
    });

    it("passes file URIs through untouched", () => {
      expectServe(handler(event(canonical, "/css/styles.css")), "/css/styles.css");
    });

    it("passes dotted root files through untouched", () => {
      expectServe(handler(event(canonical, "/favicon.ico")), "/favicon.ico");
    });

    it("301s /index.html to /", () => {
      expectRedirect(handler(event(canonical, "/index.html")), `https://${canonical}/`);
    });

    it("301s extensionless paths to their trailing-slash canonical form", () => {
      expectRedirect(handler(event(canonical, "/services")), `https://${canonical}/services/`);
    });

    it("301s /dir/index.html to /dir/", () => {
      expectRedirect(
        handler(event(canonical, "/services/index.html")),
        `https://${canonical}/services/`,
      );
    });

    it("301s the wrong host to the canonical host", () => {
      expectRedirect(handler(event(wrongHost, "/")), `https://${canonical}/`);
    });

    it("301s the raw *.cloudfront.net host to the canonical host", () => {
      expectRedirect(handler(event("d111111abcdef8.cloudfront.net", "/")), `https://${canonical}/`);
    });

    it("collapses wrong host + non-canonical URI into a single hop", () => {
      expectRedirect(handler(event(wrongHost, "/index.html")), `https://${canonical}/`);
    });

    it("preserves a single-value query string across redirects", () => {
      expectRedirect(
        handler(event(canonical, "/index.html", { utm_source: { value: "newsletter" } })),
        `https://${canonical}/?utm_source=newsletter`,
      );
    });

    it("preserves multi-value query keys across redirects", () => {
      expectRedirect(
        handler(
          event(canonical, "/services", {
            a: { value: "1", multiValue: [{ value: "1" }, { value: "2" }] },
          }),
        ),
        `https://${canonical}/services/?a=1&a=2`,
      );
    });

    it("preserves valueless query keys across redirects", () => {
      expectRedirect(
        handler(event(canonical, "/index.html", { draft: { value: "" } })),
        `https://${canonical}/?draft`,
      );
    });

    it("leaves the query string alone on rewrites (CloudFront forwards it unchanged)", () => {
      const result = handler(event(canonical, "/services/", { x: { value: "1" } }));
      expectServe(result, "/services/index.html");
      assert.deepEqual(result.querystring, { x: { value: "1" } });
    });

    it("collapses wrong host + extensionless path + query into a single hop", () => {
      expectRedirect(
        handler(event(wrongHost, "/services", { x: { value: "y" } })),
        `https://${canonical}/services/?x=y`,
      );
    });
  });
}

// The CloudFront viewer-request function: canonical-host 301s (www + *.cloudfront.net →
// canonical), /index.html → /, and directory-style URI rewrites to index.html objects.
// Ported VERBATIM from the reviewed CloudFormation template — only the canonical host is
// injected. tests/redirect_function.test.ts executes this code against the full
// host/uri/query matrix; run it after any edit.
export function redirectFunctionCode(canonicalHost: string): string {
  return `function handler(event) {
  var request = event.request;
  var host = request.headers.host.value;
  var uri = request.uri;

  // Preserve the query string across redirects (UTM tags on shared links).
  var qs = '';
  var keys = Object.keys(request.querystring);
  if (keys.length) {
    qs = '?' + keys.map(function (k) {
      var entry = request.querystring[k];
      if (entry.multiValue) {
        return entry.multiValue.map(function (v) { return k + '=' + v.value; }).join('&');
      }
      return entry.value ? k + '=' + entry.value : k;
    }).join('&');
  }

  // Canonical URI: strip any trailing index.html, give extensionless
  // paths a trailing slash. Normalizing BEFORE the host check keeps
  // every non-canonical URL to a single redirect hop.
  if (uri.endsWith('/index.html')) {
    uri = uri.slice(0, uri.length - 'index.html'.length);
  }
  if (uri !== '/' && !uri.endsWith('/') && !uri.includes('.')) {
    uri += '/';
  }

  // Any non-canonical host -> canonical, and any non-canonical URI -> canonical.
  if (host !== '${canonicalHost}' || uri !== request.uri) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://${canonicalHost}' + uri + qs } }
    };
  }

  // Serve directory URIs from their index object (rewrite, not redirect).
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  }
  return request;
}
`;
}

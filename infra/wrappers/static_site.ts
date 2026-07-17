import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { ValidatedCertificate } from "./certificates";
import { redirectFunctionCode } from "./redirect_function";
import { Tags, transformTags } from "./utils";

// AWS-managed "CachingOptimized" cache policy — same ID in every account.
const CACHING_OPTIMIZED_POLICY_ID = "658327ea-f89d-4fab-a63d-7e88639e58f6";

export interface CreateStaticSiteOptions {
  pulumiName: string;
  // Every other host (www, *.cloudfront.net, …) 301s to this one.
  canonicalHost: string;
  // All hostnames the distribution answers for (prod: apex + www; beta: one host).
  domains: string[];
  // Beta must never be indexed — the same site artifact deploys to both environments, so
  // the noindex lives in a response header, not in robots.txt.
  noindex: boolean;
  // Ingest host of the DSN in site/assets/sentry-init.js — the CSP connect-src. If the DSN
  // ever changes, change both together (config: sentry_ingest_host).
  sentryIngestHost: string;
  certificate: ValidatedCertificate;
  tags: Tags;
}

export interface StaticSite {
  bucket: aws.s3.Bucket;
  distribution: aws.cloudfront.Distribution;
}

// One concept: the site as served — private versioned bucket, CloudFront distribution with
// OAC, the canonical-host/clean-URL viewer function, security headers, and the bucket
// policy that lets exactly this distribution read.
export function createStaticSite({
  pulumiName,
  canonicalHost,
  domains,
  noindex,
  sentryIngestHost,
  certificate,
  tags,
}: CreateStaticSiteOptions): StaticSite {
  // Versioning is the rollback story: deploys are `aws s3 sync --delete` with no build
  // artifacts, so prior object versions are the only undo.
  const bucket = new aws.s3.Bucket(`${pulumiName}_bucket`, {
    // The deterministic prefix is load-bearing: the pulumi CI role's S3 permissions are
    // scoped to brooksbuilds-site-* (see github.ts).
    bucketPrefix: `brooksbuilds-site-${tags.stack}-`,
    tags: transformTags(tags),
  });

  new aws.s3.BucketVersioning(`${pulumiName}_bucket_versioning`, {
    bucket: bucket.id,
    versioningConfiguration: { status: "Enabled" },
  });

  new aws.s3.BucketPublicAccessBlock(`${pulumiName}_bucket_public_access_block`, {
    bucket: bucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  });

  const originAccessControl = new aws.cloudfront.OriginAccessControl(`${pulumiName}_oac`, {
    name: `brooksbuilds-site-${tags.stack}-oac`,
    originAccessControlOriginType: "s3",
    signingBehavior: "always",
    signingProtocol: "sigv4",
  });

  const redirectFunction = new aws.cloudfront.Function(`${pulumiName}_redirect`, {
    name: `brooksbuilds-site-${tags.stack}-redirect`,
    runtime: "cloudfront-js-2.0",
    // Without publish, updates land in the DEVELOPMENT stage and do nothing.
    publish: true,
    comment: "Canonical host + clean URL handling",
    code: redirectFunctionCode(canonicalHost),
  });

  const securityHeaders = new aws.cloudfront.ResponseHeadersPolicy(
    `${pulumiName}_security_headers`,
    {
      name: `brooksbuilds-site-${tags.stack}-security-headers`,
      securityHeadersConfig: {
        contentSecurityPolicy: {
          contentSecurityPolicy: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src https://${sentryIngestHost}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests`,
          override: true,
        },
        // Deliberately NO includeSubDomains: learning.brooksbuilds.com shares the zone. Add
        // it (and preload) only after every subdomain is HTTPS-only.
        strictTransportSecurity: {
          accessControlMaxAgeSec: 31536000,
          includeSubdomains: false,
          preload: false,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: "DENY", override: true },
        referrerPolicy: { referrerPolicy: "strict-origin-when-cross-origin", override: true },
      },
      customHeadersConfig: {
        items: [
          {
            header: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
            override: true,
          },
          ...(noindex
            ? [{ header: "X-Robots-Tag", value: "noindex, nofollow", override: true }]
            : []),
        ],
      },
    },
  );

  const distribution = new aws.cloudfront.Distribution(`${pulumiName}_distribution`, {
    enabled: true,
    comment: canonicalHost,
    aliases: domains,
    defaultRootObject: "index.html",
    httpVersion: "http2and3",
    isIpv6Enabled: true, // remember: AAAA ALIAS records as well as A (dns.ts creates both)
    priceClass: "PriceClass_100",
    origins: [
      {
        originId: "s3-site",
        domainName: bucket.bucketRegionalDomainName,
        originAccessControlId: originAccessControl.id,
        // With OAC there is no s3OriginConfig — the empty-OAI dance is CloudFormation-only.
      },
    ],
    defaultCacheBehavior: {
      targetOriginId: "s3-site",
      viewerProtocolPolicy: "redirect-to-https",
      compress: true,
      allowedMethods: ["GET", "HEAD"],
      cachedMethods: ["GET", "HEAD"],
      // A managed cache policy replaces forwardedValues/TTLs — the provider rejects mixing them.
      cachePolicyId: CACHING_OPTIMIZED_POLICY_ID,
      responseHeadersPolicyId: securityHeaders.id,
      functionAssociations: [{ eventType: "viewer-request", functionArn: redirectFunction.arn }],
    },
    customErrorResponses: [
      // Real 404s (the bucket policy's ListBucket makes S3 answer 404, not 403) map to the
      // styled page but keep their status code.
      { errorCode: 404, responseCode: 404, responsePagePath: "/404.html", errorCachingMinTtl: 60 },
    ],
    restrictions: { geoRestriction: { restrictionType: "none" } },
    viewerCertificate: {
      // validation.certificateArn (not certificate.arn): waits for the cert to issue.
      acmCertificateArn: certificate.validation.certificateArn,
      sslSupportMethod: "sni-only",
      minimumProtocolVersion: "TLSv1.2_2021",
    },
    tags: transformTags(tags),
  });

  // Sibling resource on purpose (mirrors the reviewed template): the policy references the
  // distribution and the distribution references the bucket — as siblings the dependency
  // chain is a straight line, not a cycle.
  new aws.s3.BucketPolicy(`${pulumiName}_bucket_policy`, {
    bucket: bucket.id,
    policy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowCloudFrontGet",
          Effect: "Allow",
          Principal: { Service: "cloudfront.amazonaws.com" },
          Action: "s3:GetObject",
          Resource: pulumi.interpolate`${bucket.arn}/*`,
          Condition: { StringEquals: { "AWS:SourceArn": distribution.arn } },
        },
        // Without ListBucket, S3 answers 403 (not 404) for missing keys, and the
        // distribution's 404 -> /404.html mapping would have to swallow real permission
        // errors. With it, missing pages are genuine 404s.
        {
          Sid: "AllowCloudFrontList",
          Effect: "Allow",
          Principal: { Service: "cloudfront.amazonaws.com" },
          Action: "s3:ListBucket",
          Resource: bucket.arn,
          Condition: { StringEquals: { "AWS:SourceArn": distribution.arn } },
        },
      ],
    }),
  });

  return { bucket, distribution };
}

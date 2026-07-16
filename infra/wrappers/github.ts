import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { Tags, transformTags } from "./utils";

const GITHUB_OIDC_URL = "https://token.actions.githubusercontent.com";

// AWS allows exactly one OIDC provider per URL per account, so the beta stack creates the
// GitHub provider and prod looks it up (config: create_github_oidc_provider).
export function ensureGithubOidcProvider(create: boolean): pulumi.Output<string> {
  if (!create) {
    // Look up by ARN (derivable from the account ID) rather than by URL: the URL form
    // enumerates via iam:ListOpenIDConnectProviders, which the pulumi CI role deliberately
    // lacks — the ARN form only needs the Get permission it has.
    const accountId = aws.getCallerIdentityOutput().accountId;

    return aws.iam.getOpenIdConnectProviderOutput({
      arn: pulumi.interpolate`arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`,
    }).arn;
  }

  const provider = new aws.iam.OpenIdConnectProvider("github_oidc_provider", {
    url: GITHUB_OIDC_URL,
    clientIdLists: ["sts.amazonaws.com"],
    // AWS validates GitHub's OIDC against trusted root CAs and ignores this value, but the
    // API still requires a non-empty list.
    thumbprintLists: ["6938fd4d98bab03faadb97b34396831e3780aea1"],
  });

  return provider.arn;
}

export interface CreateSiteDeployRoleOptions {
  pulumiName: string;
  githubRepo: string;
  oidcProviderArn: pulumi.Input<string>;
  bucket: aws.s3.Bucket;
  distribution: aws.cloudfront.Distribution;
  tags: Tags;
}

// The role the site deploy workflows assume (deploy-reusable.yml): just enough to sync
// site/ into the bucket and invalidate the distribution — nothing else.
export function createSiteDeployRole({
  pulumiName,
  githubRepo,
  oidcProviderArn,
  bucket,
  distribution,
  tags,
}: CreateSiteDeployRoleOptions): aws.iam.Role {
  const role = new aws.iam.Role(pulumiName, {
    name: `brooksbuilds-site-${tags.stack}-deploy`,
    assumeRolePolicy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Federated: oidcProviderArn },
          Action: "sts:AssumeRoleWithWebIdentity",
          Condition: {
            StringEquals: {
              "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
              // Exact, case-sensitive. Breaks (on purpose) if a workflow adds
              // `environment:` — that changes the sub claim's shape; update here if so.
              "token.actions.githubusercontent.com:sub": `repo:${githubRepo}:ref:refs/heads/main`,
            },
          },
        },
      ],
    }),
    tags: transformTags(tags),
  });

  new aws.iam.RolePolicy(`${pulumiName}_policy`, {
    role: role.id,
    policy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        { Sid: "SyncDiff", Effect: "Allow", Action: "s3:ListBucket", Resource: bucket.arn },
        {
          Sid: "SyncWrite",
          Effect: "Allow",
          Action: ["s3:PutObject", "s3:DeleteObject"],
          Resource: pulumi.interpolate`${bucket.arn}/*`,
        },
        {
          Sid: "Invalidate",
          Effect: "Allow",
          Action: "cloudfront:CreateInvalidation",
          Resource: distribution.arn,
        },
      ],
    }),
  });

  return role;
}

export interface CreatePulumiCiRoleOptions {
  pulumiName: string;
  githubRepo: string;
  oidcProviderArn: pulumi.Input<string>;
  zone: aws.route53.GetZoneResult;
  tags: Tags;
}

// The role infra.yml assumes to run `pulumi preview` (on PRs) and `pulumi up` (on merges).
// Created once, by the beta stack (config: create_pulumi_ci_role); it manages BOTH stacks'
// resources. Scoping is pragmatic for a single-tenant account:
// - S3 and IAM are name-scoped to brooksbuilds-site-* (the deterministic prefixes exist
//   exactly for this),
// - Route53 writes are limited to the one hosted zone,
// - CloudFront and ACM are service-wide (their ARNs are opaque generated IDs).
// Accepted, documented risks for a solo account: the role matches its own name prefix (it
// can modify itself), and it can write any record in the zone (the no-allowOverwrite
// convention in dns.ts/certificates.ts is the guard). The OIDC provider is deliberately
// read-only — changing the account-wide singleton stays a run-it-yourself operation.
export function createPulumiCiRole({
  pulumiName,
  githubRepo,
  oidcProviderArn,
  zone,
  tags,
}: CreatePulumiCiRoleOptions): aws.iam.Role {
  const accountId = aws.getCallerIdentityOutput().accountId;

  const role = new aws.iam.Role(pulumiName, {
    name: "brooksbuilds-site-pulumi-ci",
    assumeRolePolicy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Federated: oidcProviderArn },
          Action: "sts:AssumeRoleWithWebIdentity",
          Condition: {
            StringEquals: {
              "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
              // main ref for `pulumi up` on merges; pull_request for previews on PRs.
              "token.actions.githubusercontent.com:sub": [
                `repo:${githubRepo}:ref:refs/heads/main`,
                `repo:${githubRepo}:pull_request`,
              ],
            },
          },
        },
      ],
    }),
    tags: transformTags(tags),
  });

  new aws.iam.RolePolicy(`${pulumiName}_policy`, {
    role: role.id,
    policy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "SiteBuckets",
          Effect: "Allow",
          Action: "s3:*",
          Resource: ["arn:aws:s3:::brooksbuilds-site-*", "arn:aws:s3:::brooksbuilds-site-*/*"],
        },
        { Sid: "ListBuckets", Effect: "Allow", Action: "s3:ListAllMyBuckets", Resource: "*" },
        { Sid: "CdnAndCerts", Effect: "Allow", Action: ["cloudfront:*", "acm:*"], Resource: "*" },
        {
          Sid: "ZoneRecords",
          Effect: "Allow",
          Action: [
            "route53:ChangeResourceRecordSets",
            "route53:ListResourceRecordSets",
            "route53:GetHostedZone",
          ],
          Resource: `arn:aws:route53:::hostedzone/${zone.zoneId}`,
        },
        {
          Sid: "RecordChanges",
          Effect: "Allow",
          Action: "route53:GetChange",
          Resource: "arn:aws:route53:::change/*",
        },
        {
          Sid: "ZoneLookups",
          Effect: "Allow",
          Action: ["route53:ListHostedZones", "route53:ListTagsForResource"],
          Resource: "*",
        },
        {
          Sid: "SiteRoles",
          Effect: "Allow",
          Action: [
            "iam:CreateRole",
            "iam:DeleteRole",
            "iam:GetRole",
            "iam:TagRole",
            "iam:UntagRole",
            "iam:UpdateRole",
            "iam:UpdateAssumeRolePolicy",
            "iam:PutRolePolicy",
            "iam:GetRolePolicy",
            "iam:DeleteRolePolicy",
            "iam:ListRolePolicies",
            "iam:ListAttachedRolePolicies",
            "iam:ListInstanceProfilesForRole",
          ],
          Resource: pulumi.interpolate`arn:aws:iam::${accountId}:role/brooksbuilds-site-*`,
        },
        {
          Sid: "ReadOidcProvider",
          Effect: "Allow",
          Action: "iam:GetOpenIDConnectProvider",
          Resource: pulumi.interpolate`arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`,
        },
      ],
    }),
  });

  return role;
}

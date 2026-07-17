import { Config, getProject } from "@pulumi/pulumi";
import { createValidatedCertificate } from "./wrappers/certificates";
import { createAliasRecords, lookupZone } from "./wrappers/dns";
import {
  createPulumiCiRole,
  createSiteDeployRole,
  ensureGithubOidcProvider,
} from "./wrappers/github";
import { createStaticSite } from "./wrappers/static_site";
import { requireStack, Tags } from "./wrappers/utils";

const PROJECT = getProject();
const config = new Config();

async function main() {
  const stack = requireStack();
  const isProduction = stack === "prod";
  const domain = config.require("domain_name");
  // Production serves the apex + www (www 301s to the apex); beta is a single hostname.
  const domains = isProduction ? [domain, `www.${domain}`] : [domain];
  const githubRepo = config.require("github_repo");
  const tags: Tags = { Name: `brooksbuilds site ${stack}`, project: PROJECT, stack };

  const zone = await lookupZone(config.require("zone_name"));

  const certificate = createValidatedCertificate({
    pulumiName: "site_certificate",
    domains,
    zone,
    tags,
  });

  const site = createStaticSite({
    pulumiName: "site",
    canonicalHost: domain,
    domains,
    noindex: !isProduction,
    sentryIngestHost: config.require("sentry_ingest_host"),
    certificate,
    tags,
  });

  createAliasRecords({
    pulumiName: "site_alias",
    names: domains,
    distribution: site.distribution,
    zone,
  });

  const oidcProviderArn = ensureGithubOidcProvider(
    config.requireBoolean("create_github_oidc_provider"),
  );

  const deployRole = createSiteDeployRole({
    pulumiName: "deploy_role",
    githubRepo,
    oidcProviderArn,
    bucket: site.bucket,
    distribution: site.distribution,
    tags,
  });

  const ciRole = config.requireBoolean("create_pulumi_ci_role")
    ? createPulumiCiRole({ pulumiName: "pulumi_ci_role", githubRepo, oidcProviderArn, zone, tags })
    : undefined;

  return {
    bucketName: site.bucket.bucket,
    distributionId: site.distribution.id,
    distributionDomainName: site.distribution.domainName,
    deployRoleArn: deployRole.arn,
    pulumiCiRoleArn: ciRole?.arn,
  };
}

const result = main();

// Individual named outputs so `pulumi stack output <name>` maps 1:1 onto the GitHub Actions
// variables the workflows consume: bucketName → BETA_/PROD_S3_BUCKET, distributionId →
// BETA_/PROD_CF_DISTRIBUTION_ID, deployRoleArn → BETA_/PROD_AWS_DEPLOY_ROLE_ARN, and
// pulumiCiRoleArn (beta only) → PULUMI_CI_ROLE_ARN. distributionDomainName is informational
// (it is also the ALIAS target, but dns.ts already manages those records).
export const bucketName = result.then((outputs) => outputs.bucketName);
export const distributionId = result.then((outputs) => outputs.distributionId);
export const distributionDomainName = result.then((outputs) => outputs.distributionDomainName);
export const deployRoleArn = result.then((outputs) => outputs.deployRoleArn);
export const pulumiCiRoleArn = result.then((outputs) => outputs.pulumiCiRoleArn);

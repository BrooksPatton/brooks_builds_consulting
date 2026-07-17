import * as aws from "@pulumi/aws";

// Data lookup only — the hosted zone itself is never managed by this project. It also
// hosts learning.brooksbuilds.com, hasura, and MX/TXT records that must not be disturbed.
export async function lookupZone(name: string): Promise<aws.route53.GetZoneResult> {
  return aws.route53.getZone({ name, privateZone: false });
}

export interface CreateAliasRecordsOptions {
  pulumiName: string;
  names: string[];
  distribution: aws.cloudfront.Distribution;
  zone: aws.route53.GetZoneResult;
}

// A + AAAA ALIAS pair per hostname — the distribution serves IPv6, so without the AAAA
// records v6-only visitors would miss the site. Deliberately NO allowOverwrite: if the old
// platform stack still owns these names, `pulumi up` must fail loudly rather than hijack
// records whose teardown would later delete them (the cutover-ordering guard; see PLAN.md).
export function createAliasRecords({
  pulumiName,
  names,
  distribution,
  zone,
}: CreateAliasRecordsOptions): aws.route53.Record[] {
  const types = ["A", "AAAA"] as const;

  return names.flatMap((name) =>
    types.map(
      (type) =>
        new aws.route53.Record(`${pulumiName}_${name}_${type}`, {
          name,
          type,
          zoneId: zone.zoneId,
          aliases: [
            {
              name: distribution.domainName,
              zoneId: distribution.hostedZoneId,
              evaluateTargetHealth: false,
            },
          ],
        }),
    ),
  );
}

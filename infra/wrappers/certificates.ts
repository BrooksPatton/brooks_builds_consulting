import * as aws from "@pulumi/aws";
import { Tags, transformTags } from "./utils";

export interface CreateValidatedCertificateOptions {
  pulumiName: string;
  // domains[0] becomes the certificate's primary name; the rest become SANs.
  domains: string[];
  zone: aws.route53.GetZoneResult;
  tags: Tags;
}

export interface ValidatedCertificate {
  certificate: aws.acm.Certificate;
  // The distribution consumes validation.certificateArn (not certificate.arn) so it waits
  // for the certificate to actually issue instead of failing on a pending one.
  validation: aws.acm.CertificateValidation;
}

// One concept: a certificate that is issued and usable — the cert, its DNS validation
// records, and the wait-for-issuance marker together. The domains list is statically known
// per stack, so every validation record is a real resource visible in `pulumi preview`;
// no resources are created inside .apply() (the records' name/type/value are Outputs, which
// the Record resource accepts natively).
export function createValidatedCertificate({
  pulumiName,
  domains,
  zone,
  tags,
}: CreateValidatedCertificateOptions): ValidatedCertificate {
  const certificate = new aws.acm.Certificate(pulumiName, {
    domainName: domains[0],
    subjectAlternativeNames: domains.slice(1),
    validationMethod: "DNS",
    tags: transformTags(tags),
  });

  // Deliberately NO allowOverwrite: if another stack (the old platform app) still owns
  // validation records for these names, fail loudly instead of adopting records that the
  // other stack's teardown would later delete out from under us.
  const validationRecords = domains.map((domain) => {
    const option = certificate.domainValidationOptions.apply((options) =>
      options.find((candidate) => candidate.domainName === domain)!,
    );

    return new aws.route53.Record(`${pulumiName}_validation_${domain}`, {
      zoneId: zone.zoneId,
      name: option.resourceRecordName,
      type: option.resourceRecordType,
      records: [option.resourceRecordValue],
      ttl: 604800, // one week
    });
  });

  const validation = new aws.acm.CertificateValidation(`${pulumiName}_issued`, {
    certificateArn: certificate.arn,
    validationRecordFqdns: validationRecords.map((record) => record.fqdn),
  });

  return { certificate, validation };
}

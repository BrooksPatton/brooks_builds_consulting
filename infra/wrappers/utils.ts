import { getStack } from "@pulumi/pulumi";

// Required on every resource — same tagging convention as the brooks_builds project.
export interface Tags {
  Name: string;
  project: string;
  stack: string;
}

export function transformTags(tags: Tags): { [key: string]: string } {
  const { Name, project, stack } = tags;

  return { Name, project, stack };
}

export type StackName = "beta" | "prod";

// The stack name IS the environment: it decides www+apex vs single beta host, the noindex
// header, and which stack owns the account-level singletons. Fail fast on anything else
// rather than provisioning half-configured infrastructure under a typo'd stack.
export function requireStack(): StackName {
  const stack = getStack();

  if (stack !== "beta" && stack !== "prod") {
    throw new Error(`Unknown stack "${stack}" — this project only defines beta and prod`);
  }

  return stack;
}

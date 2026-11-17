import type { DeskClient } from './client';
import type { DeskAuditFinding } from './types';

export interface ConformanceOptions {
  /** Rules to ignore, by rule name. */
  allow?: string[];
  /** Only these paths (prefix match). Default: everything open. */
  under?: string;
}

export interface ConformanceReport {
  ok: boolean;
  findings: DeskAuditFinding[];
  nodes: number;
}

/**
 * Whether the open screen can be driven: every surface named, no duplicate path, no interactive control outside a
 * node, every dialog registered, plus each node's own checks. Run it on each screen a spec visits.
 */
export async function runDeskConformance(client: DeskClient, options: ConformanceOptions = {}): Promise<ConformanceReport> {
  const all = await client.audit();
  const findings = all.filter((finding) => !(options.allow ?? []).includes(finding.rule) && (!options.under || (finding.path ?? '').startsWith(options.under)));
  const tree = JSON.stringify(await client.snapshot({ depth: 12 }));
  const nodes = (tree.match(/"kind":/g) ?? []).length;
  return { ok: findings.length === 0, findings, nodes };
}

/** A readable list of findings for a failed assertion. */
export function formatFindings(findings: DeskAuditFinding[]): string {
  return findings.map((finding) => `- ${finding.rule}${finding.path ? ` at ${finding.path}` : ''}: ${finding.detail}`).join('\n');
}

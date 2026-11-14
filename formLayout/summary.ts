export interface DeskSummaryPart {
  label: string;
  value: string;
  /** Required and empty, or the field has a problem. */
  problem?: boolean;
}

export interface DeskSectionSummary {
  /** One line, empty when nothing is filled and nothing is wrong. */
  text: string;
  problem: boolean;
}

/** The strip text. Problems come first so they stay visible when the line is cut off. */
export function sectionSummary(parts: readonly DeskSummaryPart[]): DeskSectionSummary {
  const bits: string[] = [];
  let problem = false;
  for (const part of parts) {
    if (!part.problem) continue;
    problem = true;
    bits.push(part.value.trim() ? `${part.label} ${part.value.trim()}` : `${part.label} *`);
  }
  for (const part of parts) {
    if (part.problem || !part.value.trim()) continue;
    bits.push(`${part.label} ${part.value.trim()}`);
  }
  return { text: bits.join(' · '), problem };
}

import type { Rdl2Stage, Rdl2StageBase } from '../language';
import type { ColumnInfo } from './schema';
import type { StepKindInfo } from './steps';

/** The checks a project step runs on its own settings, each said under the setting (`path`). */
export interface StudioStepCheck {
  /** A column of the step's input, required (`message` when it is empty). */
  column(path: string, value: string | undefined, message: string): void;
  /** A formula over the input columns; `message` when it is required and empty, null when it may be empty. */
  formula(path: string, value: string | undefined, message: string | null): void;
  /** A column name it adds (letters, digits and _), when set. */
  name(path: string, value: string | undefined): void;
  problem(path: string, message: string): void;
}

/**
 * A step kind a project adds to the designer (`defineStudioStep`), beside its server side (`@ops/framework`
 * `defineReportStage`): its card in the gallery and its settings form (`info`, the same fields the framework's
 * steps use), its sentence on the flow card, the columns it hands on with their types, and its checks.
 */
export interface StudioStep<S extends Rdl2StageBase = Rdl2StageBase> {
  info: Omit<StepKindInfo, 'kind' | 'make'> & { kind: S['kind']; make: (id: string, from: string | null) => S };
  /** One line for the flow card: `Adds unitCost and cost of qty`. */
  describe(stage: S): string;
  /** The columns it hands on: its input's and what it adds. */
  columns(stage: S, input: ColumnInfo[]): ColumnInfo[];
  check?(stage: S, check: StudioStepCheck): void;
}

const STEPS = new Map<string, StudioStep>();

/** Adds a step to the designer. Call once at boot, with `configureReports`. */
export function defineStudioStep<S extends Rdl2StageBase>(step: StudioStep<S>): void {
  STEPS.set(step.info.kind, step as unknown as StudioStep);
}

export function studioStep(kind: string): StudioStep | undefined {
  return STEPS.get(kind);
}

/** The project's steps as gallery entries. */
export function studioStepInfos(): StepKindInfo[] {
  return [...STEPS.values()].map((step) => ({ ...step.info, make: (id, from) => step.info.make(id, from) as unknown as Rdl2Stage }) as StepKindInfo);
}

import type { Component } from 'vue';
import type { DeskLookupConfig } from '../grid/types';

/** The studio's server actions (ops `ReportsModule`): what `call` sends. */
export type ReportsAction = 'catalog' | 'list' | 'run' | 'lookup' | 'save' | 'delete';

/** A studio page: the list, a report's viewer, its pivot, the designer (a report by name, or a new one). */
export type ReportsPage = 'list' | 'run' | 'pivot' | 'design';

/** One of the app's own lookups an input may name (`lookup.preset`): the designer lists them, the viewer builds them. */
export interface ReportsLookupPreset {
  id: string;
  title: string;
  /** Shown under the title in the designer's picker. */
  hint?: string;
  /** The catalog model and label field it lists, so a viewer without the preset still lists the same records. */
  model: string;
  label: string;
}

/**
 * What a host app gives the report studio (`configureReports`, once at boot). The studio draws everything; the app
 * says how to reach its server, its pages, its lookups and its records. Guide: `docs/reports.md`.
 */
export interface ReportsHost {
  /** POST one studio action with its body; answers `{ data }`. `shared`: a load every page keeps (the catalog, the list), not aborted when the page that started it is left. */
  call<T>(action: ReportsAction, body: unknown, options?: { shared?: boolean }): Promise<{ data: T }>;
  /** The company the studio is open in: kept data (the list, pivot rows) is per company. */
  companyKey(): string | number;
  /** The words for a refusal or a failed call. */
  failure(error: unknown): string;
  /** The app's own lookups inputs may name (`lookup.preset`). Without them inputs list `model`'s `label` field. */
  lookupPresets?: readonly ReportsLookupPreset[];
  /** Record types a column may drill to (`drill.voucher.type`), for the designer. */
  recordTypes?(): ReadonlyArray<{ value: string; label: string }>;
  /** The product's name in the studio's words (`System reports ship with <product>`). Default `the system`. */
  product?: string;
  /** A panel beside the designer's actions (an AI assistant): it reads the open report with `useReportDraftContext()`. */
  assistant?: Component;
  /**
   * Called in each studio page's setup (a composable: it may inject and read the route): the place the page is open
   * in. Its functions are then called at any time.
   */
  use(): ReportsPlace;
}

/** What a studio page needs from the place it is open in (`ReportsHost.use`). */
export interface ReportsPlace {
  /** The address of a studio page, for the router. */
  path(page: ReportsPage, name?: string): string;
  /** First day of the user's financial year (`YYYY-MM-DD`), for `fyStart` defaults and period choices. */
  yearStart(): string;
  /** The lookup a preset draws (with the company and branches the page is open in), or null for a plain list. */
  lookup?(preset: string): DeskLookupConfig | null;
  /** Opens a record's page (`drill.voucher`); false when it has none. */
  openRecord?(type: string, id: number): boolean;
}

let host: ReportsHost | null = null;

/** Call once at boot, before a studio page opens. */
export function configureReports(given: ReportsHost): void {
  host = given;
}

export function reportsHost(): ReportsHost {
  if (!host) throw new Error('Report studio: call configureReports(host) at boot');
  return host;
}

/** In a studio page's setup: the place it is open in. */
export function useReportsPlace(): ReportsPlace {
  return reportsHost().use();
}

/** `today` and the financial year's first day, for date words and period choices. */
export function reportsPeriod(place: ReportsPlace): { yearStart: string; today: string } {
  return { yearStart: place.yearStart(), today: new Date().toISOString().slice(0, 10) };
}

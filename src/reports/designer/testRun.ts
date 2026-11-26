import { reportsHost } from '../host';
import type { Rdl2Report } from '../language';
import { runReport } from '../studioApi';
import { studioDefaults, studioParams } from '../studioFilter';
import type { RunCheck } from './draftTools';

/** The whole report with its inputs' starting values, as the preview runs it: the first rows, or the server's error. */
export async function testReportRun(report: Rdl2Report, period: { yearStart: string; today: string }, rows = 3): Promise<RunCheck> {
  try {
    const result = await runReport({ definition: report, params: studioParams(report, studioDefaults(report, period)), limit: rows });
    return { ok: true, count: result.count, rows: result.rows.slice(0, rows) };
  } catch (caught) {
    return { ok: false, error: reportsHost().failure(caught) };
  }
}

import { configureReports, type ReportsHost } from '../src/reports/host';

/**
 * A report studio host for tests: answers nothing unless `call` is given, page paths `reports/<page>/<name>`, a
 * financial year from 1 April 2026, refusals as the error's message.
 */
export function fakeReportsHost(given: Partial<ReportsHost> = {}): void {
  configureReports({
    call: () => Promise.resolve({ data: {} as never }),
    companyKey: () => 1,
    failure: (error) => (error instanceof Error ? error.message : String(error)),
    use: () => ({ path: (page, name) => `reports/${page}${name ? `/${name}` : ''}`, yearStart: () => '2026-04-01' }),
    ...given,
  });
}

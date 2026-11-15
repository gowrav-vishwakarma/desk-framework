# Desk testkit

Node-side helpers for driving a desk framework app from Playwright, Vitest or an agent. It has **no runtime
imports**: it never loads the app. It talks to the page only through `window.__desk`, the driver in
`../automation/`.

| File | What it gives |
| --- | --- |
| `client.ts` | `createDeskClient(page)`: `snapshot`, `describe`, `read`, `act`, `fill`, `fillForm`, `press`, `navigate`, `audit`, `sets`, `prefs`. |
| `grid.ts` | `deskGrid`, `deskPageSize`, `deskCountRows`, `deskFindRow`, `deskActions`. The column id and the expected count come from the caller. |
| `user.ts` | `createDeskUser(client)`: strict steps (`go`, `fillForm`, `save`, `answer`, `rows`, `invalid`). A refused op throws with the page's reason. |
| `locators.ts` | `deskLocators`: CSS for `data-desk-node` / `data-desk-path`, tabs, panes, pivot wells. |
| `fixtures.ts` | `deskFixtureDefs()` for `test.extend`: turns automation on before the page loads. |
| `conformance.ts` | `runDeskConformance(client)`: the screen is drivable (audit rules). |
| `scenario.ts` | `defineScenarioSuite`, `runScenario`, `deskProperty` (seeded), `screenChecklist` (names a done screen that navigates the document away, then `again` reopens the desk), `runIntegritySweep`. |
| `mcp.ts` | `deskMcpTools(client)`: the driver as agent tools (same surface as the in-app Support AI). |

```ts
import { test as base } from '@playwright/test';
import { deskFixtureDefs, type DeskFixtures } from '<framework>/testkit';

export const test = base.extend<DeskFixtures>(deskFixtureDefs());

test('open the account list', async ({ page, user, desk }) => {
  await page.goto('/#/company/1/branch/1/desk');
  await user.go('account-list');
  const rows = await user.rows('grid:account-list-grid');
  expect(rows.length).toBeGreaterThan(0);
});
```

Nothing here is specific to a product. A product's own helpers (voucher steps, company setup, SQL) live in its own
test project and build on these.

A list grid exposes `pageSize` (`{ size: 50 }`). `deskCountRows` checks the paginator's count on one page. `deskPageSize` runs that op.
`deskCountRows` then checks a numeric page and All against a total the caller already knows.
`deskFindRow(client, grid, columnId, text)` filters that column and returns the row.
`deskActions` reads that row's actions. It uses the row index, because a numeric string is an index, not a key.

Ankpal adds a `session` set adapter (`sets.apply` part `session`) that overwrites the open company's settings
and license in the Pinia auth store. It is compiled only when the app is built or served with `E2E_API_URL`
set (`DESK_E2E_SESSION` is `1`). A production bundle leaves it out. The auto-tester calls it through
`src/session-overrides.ts`.

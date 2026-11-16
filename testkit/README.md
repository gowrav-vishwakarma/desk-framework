# Desk testkit

Node-side helpers for driving a desk framework app from Playwright, Vitest or an agent. It has **no runtime
imports**: it never loads the app. It talks to the page only through `window.__desk`, the driver in
`../automation/`.

**Two kinds of helper.** A plain name acts as a person does: it finds what to click with the selectors in `locators.ts` and clicks or types (`deskRunRowAction`). A `…Direct` name does the same through the driver's ops (`act`, `fill`, `answer`), which is fast: use it for steps a person-like test has already covered, so later specs do not pay for typing again. Reading (`deskSettingsRows`, `deskRowActionStates`, `snapshot`) always goes through the driver.

| File | What it gives |
| --- | --- |
| `client.ts` | `createDeskClient(page)`: `snapshot`, `describe`, `read`, `act`, `fill`, `fillForm`, `press`, `navigate`, `audit`, `sets`, `prefs`. |
| `grid.ts` | `deskGrid`, `deskPageSize`, `deskCountRows`, `deskFindRow`, `deskExpectNoRow` (after a delete: filters the column until the list answers without the row), `deskActions`, `deskRowActionStates` (a row's actions as `{ name: enabled }`), `deskRunRowAction` (as a person: wait for the row, filter its column when it is not on screen, click the row's action button or ⋮ then the menu item, then click the confirm's Yes/No), `deskFilterColumn` (as a person: type in a column's filter box, Enter), `deskOffers` / `deskWithholds` / `deskToolbarOffers` (the one rule for "is the user offered this action": a disabled or undrawn action is withheld, a button or a menu item is offered — change it here when the desk's display choice changes), `deskRunRowActionDirect` (the same through the driver's ops, for a step a person-like test already covered), `deskClickCell` (as a person: scroll the grid just enough to see the cell between the sticky header and pinned totals, then click its middle; every cell helper clicks through it), `deskPickInCell` (as a person: click a grid cell by row and column id, type, pick the lookup row showing the text), `deskEditCell` (the one to use: edits any cell as a person, by the editor the grid reports — text/number/date typed, select/check chosen by label, lookup picked, a multiple lookup picks each and moves on), `deskEnterRow` (a whole line in an entry grid: the blank row, then each column in order through `deskEditCell`, the row followed by its key), `deskTypeInCell` (a text cell: click, type, Tab to commit), `deskChooseInCell` (a select or check cell: click, type the label, Enter), `deskPickManyInCell` (a multi-select cell: pick each row, then move on; the keys are `DESK_MULTI_PICK_KEYS`, the one place to change when the desk lets the user choose Enter/Tab or Space/Enter). The column id and the expected count come from the caller. |
| `locators.ts` | `deskLocators`, CSS for what a person clicks: `node` (`data-desk-node` / `data-desk-path`), `field` (`data-desk-field`), `rowAction` (`data-desk-action`), `rowMore` (⋮), `menuItem` (`data-desk-menu-item`), `gridRow`, `gridCell(row, column)` (`data-cell` + `data-col`), `filterCell(column)` (`data-filter`), `cellValue`, `lookupActive`, `tab`, `pane`, pivot wells. Helpers that act click and type on these. |
| `settings.ts` | `deskSettingsRows` (a settings sheet's rows by key: value, shown, editor, issue), `deskSettingsIssues` (its problems by key), `deskFormValues` + `deskFormDiff` (the round trip: capture every row and grid before a save, reopen, list what differs — lookups by their shown text). |
| `user.ts` | `createDeskUser(client)`: strict steps (`go`, `fillForm`, `save`, `answer`, `rows`, `invalid`). A refused op throws with the page's reason. |
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

A list grid exposes `pageSize` (`{ size: 50 }`); `deskPageSize` runs that op. `deskCountRows` checks one page against a total the caller already knows: the page shows `min(total, size)` rows and the paginator reports `total` (server lists page; they are never read all at once).

**Dialogs.** A confirm (`deskConfirm`) has `confirm-yes` / `confirm-no`; a danger action focuses No, so Enter backs out. The leave guard (a form with unsaved changes) has `leave-keep` / `leave-save` / `leave-lose`. A person clicks them (`deskLocators.field('confirm-yes')`); the fast form is the dialog's `answer` op (`client.act('top', 'answer', { choice: 'yes' | 'no' | 'keep' | 'save' | 'lose' })`).

**Form problems.** `deskSettingsIssues(client, sheet)` and a field's `issue` (snapshot) read what the form shows under each field; problems no field can show are in the form's header strip (`.desk-form-issue`) or toasts, per `form/issueDisplay.ts`.
`deskFindRow(client, grid, columnId, text)` filters that column and returns the row.
`deskActions` reads that row's actions. It uses the row index, because a numeric string is an index, not a key.

Ankpal adds a `session` set adapter (`sets.apply` part `session`) that overwrites the open company's settings
and license in the Pinia auth store. It is compiled only when the app is built or served with `E2E_API_URL`
set (`DESK_E2E_SESSION` is `1`). A production bundle leaves it out. The auto-tester calls it through
`src/session-overrides.ts`.

# Desk framework

[![tests](https://github.com/gowrav-vishwakarma/desk-framework/actions/workflows/test.yml/badge.svg)](https://github.com/gowrav-vishwakarma/desk-framework/actions/workflows/test.yml)

Keyboard-first UI for a Quasar app: shortcuts, focus order, dialogs, menu bar, and the spreadsheet grid. A product's pages, records, and API calls live in its own folder and are not part of this one.

**Examples in these docs.** Paths under `ankpal/` and words like voucher, party or ledger name the reference app this framework was built in (the Ankpal desk). They show one way to use a feature. Nothing here imports them, and a project that uses this package does not need them.

The framework always runs inside Quasar. `vue` and `quasar` are peer dependencies. It also uses `vue-router`, `@tanstack/vue-virtual`, `@tanstack/vue-table`, `xlsx-js-style` and `echarts` (peers too). The testkit (`@desk/framework/testkit`) has no runtime imports: it runs in Node beside Playwright, Vitest or an MCP server without pulling them in.

## Package

`@desk/framework` ships its source (`.ts`, `.vue`, `.css`); the host's Vite and Quasar build compile it, so there is no build step here. Exports: `.` (`src/index.ts`), `./testkit` (`src/testkit/index.ts`), and `./*` for deep paths into `src/`.

A host installs it from a local checkout next to its own repository, as the ops backend does with `@ops/framework`:

```sh
git clone git@github.com:gowrav-vishwakarma/desk-framework.git
# in the host
npm install ../desk-framework   # "@desk/framework": "file:../desk-framework"
```

The host sets `install-links=true` in its `.npmrc` (npm copies the package into `node_modules`, so there is one vue and one quasar), aliases `@desk/framework` to `node_modules/@desk/framework/src` (Quasar: `build.alias`, which also writes the tsconfig paths), and adds `@desk/framework` to Vite's `optimizeDeps.exclude`. The Ankpal desk (`ankpal-erp/ankpal-desk-frontend`) does all three, pins the commit it is tested with in `.desk-framework-ref`, and copies a new commit in with `npm run fw:update`.

Here: `npm test` runs the unit tests (Vitest, happy-dom, Quasar plugin) in `test/`, and `npm run typecheck` runs `vue-tsc` over `src/` and `test/`. CI runs both.

## Import rule

Files under `src/` may import Vue, Quasar, those libraries, and other files of this package. They must not import a host app: a host's behavior comes in through `configureDesk`, props and callbacks.

## For agents

Whenever you change a product that uses this framework, split the work. Enrich the framework with the generic part, and leave the product's own meaning in the app. The framework is shared by every project that uses it, so a product name, a folder name, or a business word must not become part of it.

**Framework.** How a control behaves for any product: focus, keys, dialogs, grids, lists, layout, themes. If a second product would want the same behavior, put the mechanism here as a prop, a callback, or a `configureDesk` hook, and export a new host-facing symbol from `index.ts`. The host passes in the labels, the rows, and the decisions.

**App.** What this product means: its screens, its field names, its rules for when something opens or is required, its API, and its save shape. That code lives in the product's own folder and calls the framework. It does not belong in this package.

If one change needs both, implement the mechanism in the framework and pass the product's rule in from the app. Update this README in the same change when that boundary moves.

## Driving a page

Support AI and any other agent drive an open desk page through `window.__desk` (`automation/driver.ts`); an agent does not click grid cells. Tests use the testkit (`testkit/README.md`) both ways: a page's own test acts as a person (clicks and keys on the stable selectors the framework stamps: `data-desk-path`, `data-desk-field`, `data-setting`, `data-desk-action`, `data-desk-menu-item`), and later tests that only need the page as a step use the driver's ops (`…Direct` helpers) to go fast. Reading state always goes through the driver.

The driver is installed only while the host's `automation.enabled()` is true. Ankpal's company shell sets `window.__DESK_AUTOMATION__ = true` before setup, so `__desk` is there after sign-in. A test can also open `?deskAutomation=1` (kept for the tab) or set `localStorage.deskAutomation = '1'`.

Call `waitIdle()` after a navigation or a save. Start with `snapshot({ format: 'outline', depth: 2 })`. Every later call takes a path from that snapshot (`page:payment-add/form:form/grid:payment-party`). A short name that matches more than one node is refused, and `error` plus `reason` name the exact paths and the legal values.

| Call | Use |
| --- | --- |
| `describe(path)` | The ops that node accepts, and their arguments. |
| `fields(path)` | Flat list of fields under a form: path, editor, value, options. |
| `fill(path, value)` / `fillForm(path, values)` | Set `DeskField`s. A lookup value is the label (or the only match). |
| `act(path, 'set', { key, value })` | One cell of a settings grid. Same lookup and select rules. |
| `act(grid, 'setCell', { row, col, value })` | Type into an entry-grid cell and commit it. `row` is the index. |
| `act(grid, 'openCellDialog', { row, col })` | Open the cell's dialog. `rows(grid, { limit, columns })` reads what is on screen. |
| `act(dialog, 'accept')` / `'cancel'` | OK or Cancel. `press` with `{ id }` runs a named button or page action (`action-form-save`). |
| `navigate(target)` | A route the host knows (`payment/add`). |
| `prefs.read` / `prefs.write` | The desk preference store. |

A call returns `{ ok: false, error, reason }` when it cannot do what was asked. Read `reason` and try the path or value it lists. Do not guess a second path.

**Readouts.** Figures a page shows that are not fields (a footer's totals, a running balance) are read, not filled: the page passes `DeskForm :readout` (a function returning a plain object), merged into the form node's `read()`. Ankpal's voucher form gives `footer`: `taxable`, `tax`, `roundOff`, `grandTotal`, `payable` (null when that line is not on screen) and `lines` (each footer line by id).

## Public entry

A new app imports only `@desk/framework` (`src/index.ts`). That import also loads the theme stylesheets. Ankpal pages keep the deep paths they already use (`@desk/framework/grid/...` once they import the package). A new host-facing symbol is added to `index.ts`. Form layout, pivot, and spreadsheet export stay off that list until a host needs them.

## Host

Call `configureDesk` once, before `loadDeskKeymap` and before a lookup opens. Ankpal does this in `ankpal/layout/DeskLayout.vue`.

```ts
configureDesk({
  presets, // action id -> key list
  presetLabels, // { id, label } shown in the keys dialog
  defaultPreset,
  label: (actionId) => 'Human name',
  initialPreset: () => null, // used only when this user has no stored preset
  searchLookup: async (lookup, query) => [],
  extraBindings: { 'my-page-action': ['alt', 'l'] }, // optional default keys for the host's own actions
  locale: () => 'en-US', // optional number locale; the browser's without it ('en-IN' gives 1,00,000.00)
  companyCurrency: () => 'USD', // optional code; without it every row is company currency (one amount)
  companyCurrencySymbol: () => '$', // optional; the browser's symbol for the code is used without it
  companyCurrencyId: () => 7, // optional; rows that name their currency by id match on it
  decimals: () => ({ qty: 3, money: 2 }), // company places, 0 to 8; default 2 each
  prefs, // optional DeskPrefStore; the IndexedDB default is used without it
});

registerDeskTheme({ id, label, swatches }); // optional extra theme, CSS under :root[data-desk-theme='<id>']
```

### Numbers and currencies

`currency/money.ts` is the one formatter. Do not write `toFixed(2)` or a local `Intl.NumberFormat` on a page.

- `formatDeskDecimal(value, places)`: grouping from the host's `locale`, padded to `places`, and saved digits beyond it are kept up to 8 (`10.5` → `10.50`, `10.1256` → `10.1256`). `formatDeskNumber(value, 'qty' | 'money' | n)` reads the host's decimals.
- A grid column with `decimals: 'qty' | 'money' | n` shows its number that way. The page footer sums in the column's places (money by default). Editors still open on the raw value, so focusing a cell does not rewrite it.
- A currency column is `type: 'currency'` with the row's currency in `money` (values) or `moneyFrom` (row keys, such as `{ code: 'currency', rate: 'conversionRate' }`). Do not give it a `format`, which skips all of this.
- A row in the company currency shows one plain amount. A row in another currency shows two lines. The company amount is `amount × rate`, rounded to money places; a missing or non-positive rate counts as 1. The document amount is the saved number. Each line carries its symbol, or the code when there is none.
- Which line is on top is the **face**: `company` (default) or `document`. There is no per-person setting. A column sets it with `moneyView`: `{ face?: 'document', symbol?: 'auto' | 'always' | 'never', second?: false }`. `symbol: 'always'` adds the symbol to company rows too; `second: false` drops the second line.

The shell is `layout/DeskShell.vue` (`q-layout`). It is one viewport tall. The header, toolbar and status bar keep their own height, and the page slot fills what is left and is the only part that scrolls. The host fills those slots and installs keys with `installDeskKeys`.

`DeskMenuBar` draws a menu from `DeskMenuNode`. A node with `route` navigates. A node with `value` is picked instead: the bar emits `pick` and the host decides what to do. Enter picks a value. Right still opens that node's children. `checked` draws a tick. `icon` draws an icon before the label and `endIcon` one at the end of the row, as a mark (names in `menu/menuIcons.ts`, inline strokes in the text colour); rows of a submenu line up when any has an icon, and `hint` is the row's tooltip. `up` opens the menus above the bar, which a footer menu needs. `open(index)` opens one top menu, for a shortcut.

Enter and Tab move to the next field that is on screen and can be edited. A field that is hidden, read-only, or disabled is skipped. Shift+Tab skips those the same way, going back. A text input or textarea selects its value when it takes focus, so typing replaces it and Enter moves on.

## Required fields and errors

Any page can use this. It does not know what a page is about.

- **Required:** pass `required` to `DeskField`. The label shows `*`. After focus leaves an empty required field, it turns reddish (`--desk-invalid-bg`, `--desk-error` in `theme/desk-tokens.css`).
- **Errors:** the page builds a list of `DeskIssue` (`{ message, fieldId? }`, see `form/issues.ts`) and passes it to `DeskForm` as `:issues`.
  - An issue whose `fieldId` is on screen shows under that field.
  - Any other issue (no `fieldId`, or its field is not mounted, like a closed tab) shows as a stacked toast. Toasts have no timeout. An issue leaves the toasts when its field mounts, and disappears when it leaves the list.
- **When to check:** the page decides. The usual pattern is a `checked` ref set by the first Save, and `computed(() => checked.value ? validate(...) : [])`, so the list rechecks as the user types and a fresh form is not red.
- **Server errors:** pass them as `:server-issues`. `issuesFromErrors` in `form/issues.ts` turns a qnatk `errors` map (`{ key: string[] }`) into that list. A full path is tried, then its last segment (`bankDetail.bankName` looks up `bankName`), then the key itself. A key no field uses, such as `Error`, never mounts, so it shows in the form's header strip. Editing a field hides its server error until the page replaces the list (the next save); a settings row counts as its `key`, a `DeskGrid` as its `field-id` (a cell changed or a row deleted), so a grid-wide refusal such as `Visit 2: …` steps aside once the grid is edited. Pages never clear these by hand. A load or autofill does not count as an edit. When the list arrives, the first issue's field takes the focus; a field in a closed tab first has its tab opened (each `DeskTabItem` names its pane's field ids in `fields`). Pages call `applySaveFailure(caught, serverIssues)` (`erp/data/saveFailure.ts`): ops' field `errors` go under their fields, its `blockers` to the header strip, and the page header gets a message only when the answer named neither.
- **Where unplaced problems show:** one switch for every form, `DESK_UNPLACED_ISSUES` in `form/issueDisplay.ts`: `header` (a strip at the top of the form, default) or `toast`.

Examples: `validateAccount` (`ankpal/pages/accounts/accountForm.ts`) and `validateVoucher` (`ankpal/voucher/validate.ts`). A settings cell mounts its `key`, so an issue with that `fieldId` shows on the cell. An entry-grid cell does not mount a field id, so a line-grid problem stays an issue without `fieldId`.

## Unsaved changes

**One form, one dirty flag.** A form is one record. However many settings sheets, grids and tabs show it, it has one unsaved-changes state, owned by the form, never by a grid or a tab. Switching tabs inside one form keeps every edit and asks nothing. Only dropping the page asks: leaving the route, closing its dialog, a reload, the GUI | Desk switch.

**Start every form page like this** (`form/formDirty.ts`):

```ts
const form = ref(emptyRecord());
const changes = useDeskFormDirty(() => form.value, { ignore: ['ready'] });
// after a load:  form.value = loaded; changes.reset();
// after a save:  changes.reset();
```

```vue
<DeskForm :dirty="changes" :issues="issues" @save="save"> … </DeskForm>
```

- `DeskForm :dirty` registers the page's one leave check and arms the tracker on the first pointer or key input inside the form. Do not also call `useDeskDirty` on that page; the check on top of the stack is the one that counts.
- **Quiet start.** Until the first input, every change becomes the baseline: defaults, a company currency that arrives late, a pane filling in what it needs. A change the page makes from outside the form (a dialog in the footer, such as GST autofill) calls `changes.arm()` first, so it counts.
- **Per-key baselines.** The tracker keeps one baseline per top-level key of the record. `changes.isDirty('inventory')` tells a save which sections to send. `changes.rebase('rates')` takes a section loaded late, or saved by its own call, as clean without touching the others.
- **Lazy sections.** `await changes.settle(['inventory'], async () => { await loadSection(); tab.value = 'inventory'; })` loads and shows a section, waits a tick for the pane to mount, and re-baselines the listed keys that were clean before. Opening a tab is not an edit, and an edit the user made earlier stays dirty.
- **Do not navigate on a tab switch.** A route or query change runs the leave check. Keep the selected tab in component state. The one exception is `?tab=`: `DeskTabs` writes it so a reload opens the same tab, and the leave check lets an update that changes only `tab` through.
- **Grids hold rows, not dirtiness.** An entry grid edits an array on the record (`useGridRows` / an entry-rows helper with a blank starter row). Blank rows never reach the record, so they are neither dirty nor saved.

**Sub-forms that save on their own** (opening balance lines, opening stock) join the form instead of tracking themselves:

```ts
useDeskFormPart({ dirty: () => linesTyped.value, save: saveLines, guard: 'page' });
```

- `guard: 'page'` (default): the part keeps its work while hidden (`KeepAlive`, or the lines live on the record), so only leaving the page asks.
- `guard: 'swap'`: the part loses its work when it unmounts. `DeskTabs` inside the form asks before a switch that would unmount it (only parts inside that tab pane), with **Save**, **Keep editing** and **Lose changes**.
- `save` resolves `true` when it went through. When it is given, the question offers **Save**: on a swap for the parts being dropped, and on page leave when the record is clean and every dirty part can save itself. A failed save keeps the user where they are with the part's own message.

**Pages whose tabs are separate records** (Company Setup, Master Setup) are not one form. Each tab saves on its own, so the page calls `askDeskLeave()` before it swaps a tab, and registers `useDeskDirty(() => tabDirty)` itself without `DeskForm :dirty`. A simple single-record page may still call `useDeskDirty(() => dirty)` directly; new form pages use the tracker.

**The question.** `form/leaveGuard.ts`. A page with something to save calls `useDeskDirty(() => isDirty)` (DeskForm does it for a tracked form). While that is true, leaving the route (including a change of route params), a browser reload and `askDeskLeave()` all ask first. The GUI | Desk toggle calls `askDeskLeave()` itself, and so does a page whose tabs each save on their own (Company Setup, Master Setup) before it swaps a tab. Tabs that are parts of one form switch freely (see above). It resolves `true` at once when nothing is dirty. Otherwise `DeskLeaveDialog` (mounted once by the host) asks, and it resolves `true` for **Lose changes** and `false` for **Keep editing** or Escape. It shows **Save** only when the check came with a save (`useDeskDirty(check, save)`, or a tracked form whose dirty parts can all save themselves); that resolves `true` once the save went through. Otherwise the user saves with the page's own button or Ctrl+S. `confirmDeskDiscard({ what, save })` asks the same question about part of a page. The hooks are route-scoped (`onBeforeRouteLeave`, `onBeforeRouteUpdate`) so there is no global guard, and they go away with the page. Pages stack: a page opened in a dialog sits on top of the page under it, the question is about the page on top, and a page in a dialog adds no route hooks. A dialog host registers a never-dirty check below the page it shows, so a page that tracks nothing never asks about the page underneath.

## Buttons that run once

Save, OK, Apply and the like take one click at a time. Use `DeskButton` for them, not a bare `<button>`.
While the work runs the button shows a spinner and ignores clicks, then takes clicks again.
It stays focusable while busy (`aria-disabled`, not `disabled`), so keyboard focus is not lost mid-save.

- `:task="saveTask"`: the page makes `const saveTask = useDeskTask(save)` and binds the same
  `saveTask.run` to the button, `DeskForm @save` and its `action-save` handler, so a double click
  or a repeated Ctrl+S runs once.
- `:action="fn"`: the button makes its own task. Fine when nothing else starts the same work.
- `:loading="saving" @click="save"`: the page already keeps a `saving` flag. The button draws it and
  ignores clicks while it is on.
- `repeat`: take every click (a stepper, a "next" button).
- `after="dirty"`: after a success, wait until the form has unsaved changes again before taking a
  click. A failure unlocks at once. The dirty source is `:dirty` (a `useDeskFormDirty` tracker or
  `() => boolean`), or the enclosing `DeskForm`'s tracker. Without one it behaves like `done`.

The work fails when it throws or returns `false`; anything else is a success. Return `false` when
validation stops a save, so `after="dirty"` does not lock a form the user still has to fix.

## Pages in a dialog

`page/`. A desk page is a plain component, so the same one runs as a route and inside a dialog. The page asks `useDeskPage({ routeClose, routeSaved })` where it runs:

- `params`: the route params when routed, the `params` of the open call in a dialog (`{ id: '12' }`, `{ id: 'new' }`).
- `close()`: in a dialog it asks `askDeskLeave()` and closes with nothing. Routed, it calls `routeClose`.
- `saved({ response, data })`: in a dialog it closes and hands the result to the opener. Routed, it calls `routeSaved` (for example back to the list). The page calls it after the save went through and its own dirty state is cleared.

`openDeskPage({ page, params, title, result })` opens a page in a dialog and resolves with the save, or null when the user closed it. `result` is `'response'` (default, the API reply), `'data'` (what the page holds) or `'both'`. `DeskPageDialogHost` draws the open pages and each host mounts it once, beside `DeskConfirmHost`. The page loads before the dialog shows, so focus lands on its first field. A page in a dialog joins the dialog's key layer, so Ctrl+S, Escape and the field jump keys work as on the routed page, and a page leaves out keys that would replace it (the account page drops New).

**Lookups with an editor.** `DeskLookupConfig.editor` (`DeskLookupEditor`) names the page, the params for New (`create`) and Edit (`edit`, which receives the row picked here or null), the `result` mode and `toRow`, which turns the save into the row to pick. The lookup then answers the preset's `action-new` and `action-edit` keys and adds New and Edit rows to its right-click menu. A lookup without an editor leaves those keys alone, which matters because Ctrl+Enter is Edit in some presets and the section jump everywhere else. In a form the box picks the returned row through its normal `pick` path. A grid cell and a settings cell run the editor themselves and write the row like a picked one, because they rebuild the cell when focus leaves. The product supplies the editor (`accountEditor` and `productEditor` in `ankpal/data/pageEditors.ts`) and the framework never imports its pages. A column whose `commit` stores the id under another name sets `lookupId`, so Edit on a resting cell can open that record.

`panel-class="is-full"` makes a dialog almost the whole window, and the grid inside it takes the remaining height. `is-sheet`, `is-page`, `is-link` and `is-wide` are the narrower sizes.

**Stacking.** Every dialog draws above the host header (`.desk-dialog`, z-index 2100; the Quasar header is 2000). A question opened over a dialog (`front`, 2200) draws above it. Lookup lists, calendars, currency pickers, context menus, column menus and the jump peek draw above those (2300), so a list opened inside a dialog is not hidden.

## Settings grid

A screen of named fields is a `DeskSettingsGrid` (`grid/DeskSettingsGrid.vue`, rows from `grid/settings.ts`). It is not `DeskGrid`. Two settings to a row: label, value, label, value. The page builds `rows` with `sectionRows(id, title, settings)`, passes `read(key)`, and handles `change(key, value)`. The grid keeps no values. Do not add a second field layout, and do not restyle the grid for one page. A behavior every such form needs is added here once.

`DeskSetting` is `{ key, label, editor, required?, options?, lookup?, numeric?, readonly?, hint? }`. `key` is the field id the page's validation and server field map already use. `editor` is `check` (Yes/No), `select`, `number`, `text`, `date`, `lookup`, `file`, `chips`, or `currency`.

- A section title is one bold row. The cursor never lands on a title, a label, an empty half, or a `readonly` value.
- A setting that is hidden is left out of the array passed to `sectionRows`, so the pairs close up. The page decides which settings exist.
- `required` paints `*` on the label. The page decides which keys are required.
- Inside a `DeskForm`, each visible key is mounted. An issue for that key marks the cell and uses the message as its title. A page with no `DeskForm` leaves this unused.
- `currency` opens `DeskCurrencyInput`. `read` returns `{ code, name?, symbol?, currencyRate? }`. `change` sends that object back, including the rate. An empty value becomes the company currency with factor 1, the same rule as the control. That fill is not an edit. The closed cell shows the code or the name, following the currency show-as preference. `lookup` is the currency list.
- `chips` is a lookup that stores a list of records. `lookup.labelKey` is the chip text. Its editor is `DeskLookupBox` with `multiple`. The list opens with the chosen records on top, checked, and Enter or a click selects or unselects the highlighted row without closing the list. Rows keep their place while you toggle. Typing searches, and found rows that are already chosen show checked. Tab finishes and moves on, and so do Left and Right when the caret is at the edge of the search (an empty search always is). A caret in the middle of a search still moves through that text. Escape closes the list. Delete on a closed chips cell clears it, and × on a chip removes that one. Right-click the closed cell, or the open list, and Show as chooses how a long list is drawn: `A +4` (the default), `A, B +3`, every name wrapped inside the column so the row grows, or every name on one line. The choice is saved for this browser. The cell title is the full list.
- `file` stores the chosen `File`.
- Arrows, Tab, and Enter move only between value cells. Arrows move and never open a list. Enter on a closed cell opens the list with the current value highlighted, or starts editing. Enter in an open list picks the highlighted value, closes it, and moves to the next cell, closed. Escape closes and keeps the old value.
- `enterJump` makes Enter on the last cell run the section jump, the same place Ctrl+Enter goes. It is off unless the page sets it. `exitTo` still wins when the page passes one. When there is no next cell and no section jump, Enter focuses the layer's `data-form-save-btn` (Save or OK).
- `ctrlArrows` makes Ctrl+Arrow move one cell, the same as Arrow. At the edge it continues into the nearest cell of the next grid, and a Ctrl+Arrow that enters this sheet lands on the cell in line with where it came from. It is on for both `DeskSettingsGrid` and `DeskGrid`. Pass `:ctrl-arrows="false"` when that grid should stay one field.
- `arrowLeave` makes a plain arrow do that same step out when there is no further cell in this grid. It is off unless the page stacks grids in one block and sets `:arrow-leave="true"`.
- `displayOnly` shows a dimmed, non-interactive grid (no tab stop, focus square, or desk field). Use it with `mode="report"` for embedded history or reference tables inside a dialog.
- When settings appear or disappear, the cursor stays on its setting or the closest earlier one.
- The sheet is as tall as its rows. A page that wants it to fill the pane sets `flex: 1` and `min-height: 0` on `.desk-settings`.
- `initial` is the page's first focus, on the first editable cell. `autofocus` takes focus when the grid is shown. Before saving, the page calls the exposed `commitOpen()` so an open editor is written.

## Filter panel

`filter/DeskFilterPanel.vue` is the filter strip of a report page. The report passes a `DeskFilterSpec` (`fields` as `DeskSetting`, `defaults`, `phrases`, optional `validate` and `onChange`) and binds the applied values with `v-model:values`. The framework knows nothing about a report's payload or response: the page turns the values into its own request.

- Closed, it shows one sentence from `phrases` (for example "Showing Sales of HO branch for this year till date"). A phrase rule is `{ id, when?, text }`. Rules run in order and every rule whose `when` passes adds its text, so a rule can depend on several fields. `deskListPhrase` and `deskPeriodPhrase` write the common pieces. The closed panel draws the chosen values bold and the words around them quieter: wrap a value in `deskValue(text)` (the two helpers and `{key}` placeholders already do). `describeDeskFilter` still returns plain text for titles and exports.
- Ctrl+F (`action-filter`) opens it on its first field. Ctrl+S applies, closes and emits `apply`, then `applied` so the page can focus its grid (`focusFirstRow()`). Escape throws away the draft and closes, from any cell, including one being edited. If a list or calendar is open, the first Escape closes only that. While open, the panel takes Ctrl+S and the cancel action from the page and gives them back on close.
- The sheet uses `ctrl-arrows` and `enter-jump`, the same as an account or product form. Ctrl+Arrow moves one cell, and at the edge it continues to Apply or Cancel. Ctrl+Enter, and Enter leaving the last cell, land on Apply.
- A list `DeskGrid` with `show-filter` answers Ctrl+F by moving to its filter row. A page with a panel sets `:filter-shortcut="false"` on its grid.

## Filter panel in layout tabs

A page with a `DeskFilterPanel` can keep its filter in grid layouts, so people save tabs such as
"Debtors this year". The layout's `view.panel` holds the values and `view.options` the page toggles.

**Spec.** Give the filter spec `saved`: `period` turns a date pair into a named range ("This year
till date") so a tab does not go stale; `restore` drops what the user can no longer use; `skip`
keeps keys out. Lookup values are stored as the objects the panel holds (id and name), never typed ids.

**Page.** `useDeskFilterLayouts` does the wiring:

```ts
const toggles = createDeskToggles('report-view', [{ id: 'showZero', label: 'Show zero values', default: false }]);
const { layouts, designer, panelFilter, viewModified } = useDeskFilterLayouts({
  storageKey: 'report-cols',
  columns, // the Default layout and the designer's fields
  extraFields, // optional catalog fields, such as numbers behind formatted text, for rules
  spec,
  applied, // Ref of the values the rows were loaded with
  toggles, // optional
  ready: () => pageSizeReady.value, // optional extra gate
  onOpen: (values) => { filterValues.value = values; void load(1); },
});
```

Then bind, in the page:

- `DeskGridLayoutTabs :layouts :active :modified="viewModified" @select="layouts.select"`
- `DeskGrid :key :storage-key="layouts.gridStorageKey.value" :columns="layouts.columns.value"
  :layout-designer="layouts.menu.value" @update:hidden="layouts.onHidden" @layout="designer.onCommand"`
- `DeskGridDesigner ... :panel-filter="panelFilter"`. "Opens with" then shows the page's own filter
  fields (`DeskFilterSavedFields`), with a Period choice for the dates.
- `DeskToolbarMenu id label icon="settings" :menu="deskTogglesMenu(toggles)"` for a gear on the toolbar.

The layout menu then offers Save current filters, Reset to saved filters and New tab from current
filters, and the open tab shows a dot while the screen differs from it. Saved values are starting
values: people change the filter on a tab as usual; reopening the tab or reloading goes back to
what it saved. Cells that depend on a toggle read `toggles.screen[id]` in their column `format`.

Lower-level pieces, for a page that wires it differently: `freezeDeskFilter` / `thawDeskFilter` /
`sameDeskFilter`, `deskSavedFilter`, `useDeskGridLayouts({ viewModified })` with `viewPanel`,
`saveView` and `resetView`, and `useDeskGridDesigner(layouts, { currentView })`.

A list page whose filter is the grid's own column boxes uses `DeskLayoutGrid`: the tabs, note,
grid and designer in one, given `layouts`, `designer`, the paging bind (`DeskGridPagingBind`) and
row actions. `catalogFromColumns(columns)` gives such a list a catalog from its columns.

## Focus is the framework's job

A page or dialog does not move focus by hand. Mark the first field or grid `initial` (or pass `initial-focus`) and the layer focuses it when it opens. A `DeskDialog` returns focus to the field that opened it when it closes. A click on blank space is recovered by Enter and Escape (see Focus recovery in `keys/README.md`). Call `focusFirstRow()` only for a change the layer cannot know about, such as new rows after a filter.

## Grouped rows

A report whose rows come in sets (a document's header line, then its detail lines) returns
`desk-group-head` or `desk-group-line` from `DeskGrid`'s `rowClass`. A set then reads as one block:
no rules between its lines, a heavier rule above the next head, and the lines indented. Pass
`rowNumber` to number the sets instead of every line. Detail lines are drawn dimmer; mark a column `quiet: true` to
dim it on head lines too, so the eye goes to the main columns first.

**Repeated values.** `repeats: 'hide' | 'dim'` on a column (or "Same as the row above" in the
layout designer) blanks or dims a value equal to the row above. Such columns chain left to right:
when an earlier one changes, the later ones show again. The row where the leftmost one changes is
`desk-block-start` and gets a stronger line above it, so each block (a group's accounts) reads apart.

**Report figures.** `zeros: 'dim' | 'hide'` on a number column draws zeros faint or leaves the
cell blank (copy and export keep the 0). `captionField` names a row field shown small under the
value; unlike a `caption` function, grid layouts keep it as a muted second line. `DeskGrid totals`
takes values for the summary line, such as server totals over every page; each column formats its
own, the first column shows `totalsLabel` when it has none, and a column's `tone` colours its total.
`footLines` adds lines under it, drawn the same way, each a record with its label in `__label`
(an MIS total without one category). A column's `cellTone(row)` colours one body cell, such as a
negative profit in `danger`.
`DeskStatCards` draws figures above a grid (`{ id, label, value, tone, line }`), one row per line.
Tones are `success`, `info`, `warning`, `alert`, `danger` (`--desk-tone-*` tokens).

**Lines that flow down.** A head's cell may hold more than one line (a type with its narration
under it). Mark the column `spill` (in code, or "Let extra lines flow into the rows below" in the
layout designer) and pass `DeskGrid :spill-rows="(row) => n"`, the free rows under that row (its
detail lines). The head keeps its height and the extra lines draw over the cells below, capped at
`n` rows so they stop before the next group. This is drawing, not a row span: it stays correct
when the grid paints only the rows on screen.

## Quick filter on a report grid

**Typed filters wait for Enter.** Typing on a cell (or in the filter row box) drafts that column's
filter: the box turns dashed and the footer says `Filter Party: "acm" · Enter to filter · Esc to
cancel`. Nothing is emitted while typing, so a slow typist on a large report does not start a
request per key. Enter applies the draft (one `filter` emit, none when the text did not change).
Escape drops it; Escape with no draft clears the applied filter, as before. Moving away drops it
too: an arrow or any other non-typing key (which then does its usual job), a click on another
cell, focus leaving the grid, or leaving the filter row box. The header filter dialog's Apply
still applies at once. This lives in `DeskGrid`, so every list, report and dialog grid gets it.

**On the server (preferred).** `useDeskColumnFilters({ onChange })` holds the filter-row text and
calls `onChange` when it changes (no wait by default, as the grid emits only on Enter). The page turns it into its request
next to its own filter and reloads page 1, so paging and the count follow the filter. Bind
`:filter-values="cf.start.value"` (the text survives a remount) and `@filter="cf.onFilter"`. How the
text becomes a request is the product's job, as with `layouts.query`.

**On loaded rows.** For a server that takes no column filters:

A report whose server takes no column filters can still offer the filter row. `useDeskLocalFilter(rows,
columns, { groupOf?, enabled? })` filters what is loaded (one page), on top of the page's own filter,
in the filter box syntax (`contains`, `= x`, `^= x`, `in: a, b`, `> 200 <= 500` on number or
right-aligned columns). With `groupOf`, a group (a head and its lines) is kept whole when its rows
together meet every filter. Bind `:rows="quick.rows.value"` and `@filter="quick.onFilter"` on a
`DeskGrid mode="list" show-filter`, so typing on a cell starts that column's filter.

Such a report usually moves by row. When the filter is on it moves by cell instead
(`selection="cell"`, Enter still emits `open`); add `soft-cursor` for a lighter cell frame with no
fill handle. Key the grid on the mode, so it remounts cleanly when the user switches.

## Row selection

`fit-width` on `DeskGrid` shares the panel across the columns, so the table does not scroll sideways. Text that does not fit is cut with an ellipsis.

`DeskGrid selection="row"` selects the whole row instead of a cell. Up and Down move rows, Left and Right scroll, Enter emits `open`, and Ctrl+Enter (`grid-cell-dialog`) emits `open-page` when the page listens for it. Double-click emits `open`, Ctrl+double-click emits `open-page` (`pointerGestures.ts`). Typing does nothing unless the grid has a filter row. Use it with `mode="list"` for paged reports so paging keys work.

**Page size.** Pass `pageSizes` and `v-model:pageSizeChoice` on `DeskGrid`, or spread `gridPaging` from `useDeskList(source, { storageKey, sizes?, initial? })`. The select sits before the row count in the footer. Choices are `10`, `20`, `50`, `100`, `500`, `1000`, `dynamic`, `infinite`, and `all`; each page passes a subset with `sizes` or `deskPageSizesExcept('all', …)`. The choice is saved under `grid-page-size:<storageKey>`. Server lists send `limit` / `offset` through `buildDeskListBody`; `all` omits both. All is a null limit. A list with no page-size control still uses its default page, and that default must not replace the null. The grid op `pageSize` sets the same choice (`{ size: 1000 }` or `{ size: 'all' }`). The testkit wraps it: `deskPageSize`, `deskCountRows`, `deskFindRow`, `deskActions`. `dynamic` measures how many rows fit the body (minus one row so nothing is clipped), saves `grid-page-fit:<storageKey>`, reloads, and remeasures when the grid body is resized. `infinite` appends batches and shows `N of M rows` in the footer. Paged modes (fixed size, **Dynamic**, and so on) show a range and total (`1–20 of 1,234 items`) plus **Page X of Y** when Prev/Next are shown; `gridPaging` passes `itemCount` from the server `count`.

## Grid corner menu

`DeskGrid` puts `≡` in the top-left header cell when there is something to choose. The menu holds:

- **Pin totals**, when the page fills the `#foot` slot. Bind it with `v-model:pin-foot`. Pinned totals stick to the grid's bottom only while a body row still fits above them (`footPinFits` in `grid/footPin.ts`); in a shorter grid they scroll with the rows, so they never cover the row being typed in.

Total lines with an `edit` in the `foot` prop are keyboard targets. Arrow Down from the last row reaches them, and Enter emits `foot` with that edit. With `foot-entry`, Enter that finishes the rows lands on the first such line instead of the next field. On a line, Enter moves to the next one (Shift+Enter back), and past the last one it goes to the next field. Ctrl+Enter emits `foot`.
- **Page toggles**, from the `options` prop (`{ id, label, checked }`). Choosing one emits `option` with that id. The page stores the checked state.
- **Columns**, when `columnPicker` is on (the default). Hidden columns are remembered in the settings store under `storageKey`.

Arrow keys move in the menu. Enter or Space toggles the highlighted row. Escape closes it.

## Column resize and reorder

`resizeColumns` is on by default. Drag the right edge of a header to change width. With `storageKey`, widths are saved under `grid-widths:<storageKey>`.

`reorderColumns` is off by default. Turn it on for list grids that should remember layout. Drag the ⠿ grip on a **middle** header (not pinned columns). Reorder is disabled when any column has `group`. Saved order is middle columns only, under `grid-order:<storageKey>`.

`DeskColumn.pin` is `start` or `end`. Pinned columns stay at the left or right in definition order; only unpinned columns reorder. Resize still applies to pinned columns unless the grid sets `:resize-columns="false"`.

## Column header menu

Right-click a list header when the column allows it: list mode with `show-filter`, or `textLayoutMenu`, or sort (`sortable` is true by default in list mode). The filter row still opens the filter dialog directly on right-click.

The header menu offers:

- **Filter…** when `show-filter` is on (same dialog as the filter row).
- **Sort ascending / descending**, and **Clear sort** when this column is sorted, in list mode unless `sortable: false`.
- A separator, then **Cell text** (wrap, clip, ellipsis at end, ellipsis in middle) only when the column sets `textLayoutMenu: true`.

`@sort` receives an optional second argument: `'asc'`, `'desc'`, or `'clear'`. A header click still toggles direction and sends only the column id. List pages should use `applyColumnSort` from `useDeskList.ts`.

With `storageKey`, text layout is saved under `grid-text-layout:<storageKey>` (same IndexedDB prefs bag as widths and column order).

## Column header filter

The filter dialog writes the same text the filter row accepts, and typing in the row still works.

- A number or amount shows two comparisons, **Greater than** and **Less or equal** until you change them. Fill either blank, or both, then Apply. `>=` with `<=` is written as `100..200`. One blank is `> 200`.
- A date uses those same two blanks for a comparison such as `> oct 2026`. A period chip (`today`, `last month`, `last fy`, `-15 days`, and the rest) sets that whole period, so `last month` is the month itself.
- Any other column offers Contains, Equals, Starts with, Ends with, Does not equal, and Does not contain. Contains stays plain text. The others are written as `=`, `^=`, `$=`, `!=`, and `!~`.

Clear empties that column. Escape or a click outside closes without applying. Enter applies.

A row action is `{ name, label, disabled, title?, tone?, class? }`. The host decides which actions exist. `title` is the button tooltip, used for a reason the button is disabled. The label stays the short name. `tone` adds `desk-tone-<tone>` (`deskActionClass` does this for a toolbar button too). `danger` uses `--desk-danger` and `--desk-danger-bg`, which follow `--desk-error` and `--desk-invalid-bg` unless a theme sets them. A disabled danger button stays muted. `class` is extra classes the host passes through.

`askDeskConfirm({ title, message, details?, okLabel?, cancelLabel?, tone? })` returns a promise: `true` for OK, `false` for Cancel, Escape, or a second ask while one is open. `details` is a list of lines under the message. The host mounts `DeskConfirmHost` once, next to `DeskLeaveDialog`. A `danger` question focuses Cancel, so Enter backs out, and Ctrl+S does not confirm it. The framework does not know what an action payload looks like. The product decides which actions are danger and which questions to ask.

A select column's `options` is either a list or a function of the row. The function runs for the row being edited, so each line can offer its own units. A resting cell still shows the matching label.

Enter on a resting lookup, select, or check follows that column's `opensOnEnter`. `true` opens the list. `false` leaves the cell and moves to the next one. A function is called with the row, so one column can open on some lines and skip others. When the column omits it, a select or check opens, and a lookup opens only if that lookup's own `opensOnEnter` is set. A select with one option or none never opens. The next Enter, once the list is open, keeps or changes the value and moves on. Alt+Down still opens a lookup when Enter is set to move on.

A select sets `blank`, and a lookup sets `blank` on `DeskLookupConfig` or on the column. The list then starts with "---". Choosing it stores null and Enter moves to the next cell. `afterBlank` can be `exit` to leave the grid instead, or a function of the row, so one column can leave on some lines and move on others. An empty box still opens that "---" row when focus does not search, so the next Enter can choose it without waiting. A form select uses the same `blank` prop on `DeskField`. The resting cell stays empty; "---" is only in the open list.

A column may set `commit(row, text, record)`. When it does, the grid calls that function and does not store the column id, or an id ending in `Id`, on the row. Quantity and rate omit `commit` because those ids are the real fields. A lookup without `commit` still writes the label and `${id}Id`. A lookup with `acceptTyped` calls `commit(row, draft, null)` when Enter is pressed and nothing was picked, so a new name can be typed. Its list ends with `+ New “text”` once a search finds no row labelled exactly that text, and rests on it when nothing matched, so Enter keeps the typed name instead of choosing "---". Without that flag, free text is ignored.

`rowKey` is an optional function. Without it the grid uses `row.id`, then the row index. Pass `rowKey` when `id` means something else, such as a saved database id, and the grid still needs a stable key for a new row.

The `#drawer` slot is a second line under a row. `drawerFor(row)` decides which rows may have one. `drawerRows` is `cursor` (the default, only the current item row while the grid has focus) or `all` (every row `drawerFor` allows, including after focus leaves). Cursor mode also closes the drawer when the totals have focus. A dialog or lookup list opened from the grid keeps the drawer, so focus can return to it. Each drawer row carries `data-drawer-row`, so keyboard moves stay in the drawer that has focus. Focusing a drawer moves the cursor to that row and leaves focus in the drawer.

A list of fewer than 80 rows is drawn in full. A longer list is a window. Arrow keys and PageDown scroll that window to the cursor, so the rest of the list stays reachable.

## Split grid

`DeskSplitDialog` (`split/DeskSplitDialog.vue`) is a sheet dialog with a `DeskGrid` in entry mode. The page passes a target quantity, `exact` or `atMost`, a `policy`, columns, `blank(remaining, previous)`, and optional fillers. `match` (the default) requires the rows to add up to the target, and `exact` or `atMost` applies only then. Enter stays in the grid and adds a row while the entered quantity is short of the target. When the quantities match, Enter on the last cell moves to OK. `follow` lets the rows set the quantity. The status line reads "Item quantity becomes 12 (was 10)". Enter on the last cell adds a row with an empty quantity, and Enter on that empty quantity moves to OK. Rows with no quantity are dropped. `confirm` edits the same way, then OK asks "Change item quantity from 10 to 12?" through `DeskConfirmDialog`. Enter or Yes accepts. Escape or No returns to the grid. OK stays disabled while a `match` check fails. Escape and Cancel emit `cancel` and do not write the rows. OK is the button. Whether Enter opens a lookup is that column's `opensOnEnter`, described above. Focus moves into the dialog when it opens, and closing it puts focus back on the field that opened it. Escape closes the top dialog, not one below it. `fillRemaining` puts the unassigned quantity on the last empty row, or adds one. `distributeEqually` repeats a chunk until the target is filled (10 with a chunk of 3 is 3, 3, 3, 1). A filler is `{ id, label, fill(target, rows) }`. The page decides what a filler means. An optional `beforeDone(rows)` runs on OK before `done`, for saving masters the rows name. OK reads "Saving…" meanwhile; a returned message keeps the dialog open and shows in the bar until the rows change.

`DeskCodeListDialog` is the same idea for one code per row. It opens on the first code cell. Enter on a filled code adds a row. Enter on an empty code moves to OK, and so does Enter once the list already holds `max` codes. A paste of several tokens (newline, comma, or tab) is split and appended. A range is a prefix plus from, to, and a digit width. A repeated code, or more codes than `max`, blocks OK. `max` of 0 means no cap. Extra columns can sit beside the code.

## Hosting

`DeskShell` is the standalone host. Both it and the in-app embed host call `useDeskShellLayer()` (`layout/useDeskShellLayer.ts`), which owns the field-move and section-jump keys. A page that builds URLs must not write `/desk` itself. It asks `useDeskBase()` (`ankpal/router/deskBase.ts`) for a `deskUrl('accounts/new')`, so the same page works under `.../desk` and inside the classic app. See `../ankpal/README.md`.

## Lookup menu

A lookup list is drawn on the page, under the cell, using the cell's screen position. A dialog's blur would otherwise shift that list down and to the right. While that list is open, the arrow keys move through it. They do not change the grid row. A lookup can also set `fetch(query)`. When it does, that function returns the rows and the host's `searchLookup` is not called.

`DeskLookupConfig` holds only what the box needs: `labelKey`, `valueKey`, `columns`, `minChars`, `opensOnEnter`, `menu`, `fetch`, `acceptTyped`, `blank`, and optional `browseOnFocus`, `localRows`, `onPick`, and `star`. How a query reaches data is the host's business. A host extends the type with its own fields (Ankpal adds `AnkpalLookup` in `ankpal/data/lookupTypes.ts`) and reads them in the `searchLookup` it passes to `configureDesk`. The framework never reads those fields. When `browseOnFocus` is omitted, an empty box searches if `minChars` is 0. A lookup that returns false waits until the user types. `localRows` are shown first. A box with `browseOnFocus` or `localRows` that already has a value (an edit page, a default party) does not open on focus; Down opens the list on its value (local rows, with the value highlighted; a search for it when there are none), and typing searches. A list that focus opened closes if a value arrives while it loads, so an edit page whose record lands after the first focus shows no list. Grid cells keep opening on Enter. `onPick` runs when a real row is chosen. `star` adds a column: `keys` is read when the list opens, and `toggle` stores or drops the row. Ctrl+D (`lookup-star`) toggles the highlighted row. The list is a light grid that grows with its text.

## Field menus

Right-click menus are one facility, `menu/fieldMenu.ts`. A menu is a `DeskFieldMenu`: `groups()` returns `DeskMenuGroup[]` (`id`, optional `label`, `mode`, `items`) and `choose(groupId, itemId)` runs when a row is picked. `check` groups toggle and stay open. `radio` and `action` groups close the menu. The menu is read each time it draws, so it must read current state.

- `DeskField` takes `menu`, and so does a `DeskColumn` for a cell being edited. It reaches every control: text, number, textarea, select, lookup, and date.
- A date control has a default menu (`date/dateMenu.ts`: format, typing, auto year, calendar, weekday). A `menu` on a date field or column adds groups after it. Auto year select fills a missing year from the calendar year or the company's selected financial year.
- A lookup shows its own `lookup.menu`, then the field's or column's `menu`.
- A control with no menu keeps the browser menu.
- `mergeDeskMenus(a, b)` joins menus. `createDeskChecklist(prefKey, items, { label })` is a saved `check` group; its `selected()` returns the checked ids. The framework does not know what the ids mean.
- `DeskContextMenu` draws the menu. Up and Down move, Enter or Space picks, Escape closes, and a click outside closes. It claims those keys, so the field underneath does not also act on them.

Which fields a party or product search matches is product code: Ankpal's lists are in `ankpal/data/partySearch.ts` and `productSearch.ts`. Each menu starts with Search by, then a List section: last 10 picks, the autocomplete cache, and search on type only (on by default, so focus does not call the list API). Browse-on-focus stays available by turning that check off. Those two lookups always show the star column. Starred rows appear on an empty box only when Open cached is checked, and the cache key follows the cache preferences. Other lookups omit the list hooks and keep searching on focus when `minChars` is 0.

## Preferences

Every UI setting goes through a `DeskPrefStore` (`read`, `write`, `readAll`, `replaceAll`; `storage/prefStore.ts`). Without a host store the framework uses `createIndexedDbPrefStore({ dbName })`, which keeps one record, `ui`, in IndexedDB. A host passes its own as `configureDesk({ prefs })`, for example one that loads settings from an API once with `readAll` and sends changes back with `write`. Set it before the first setting is read. Ankpal passes the IndexedDB store with `dbName: 'ankpal-desk-prefs'`, the name saved settings already use.

Entries are keyed by the page or control: a form layout (`voucher:SI:<user id>`), the item-grid corner menu (`voucher-grid:SI`), a checklist (`lookup:party`, with list choices at `lookup:party:list`), hidden grid columns (`grid-columns:<storageKey>`), column widths (`grid-widths:<storageKey>`), middle-column order (`grid-order:<storageKey>`), per-column cell text layout (`grid-text-layout:<storageKey>`), a pivot layout (`pivot:<storageKey>`). Hidden columns and the pivot layout were once in `localStorage` under the bare `storageKey`; that value is copied into the store the first time it is read. `readDeskUi` returns the whole object for a download. `replaceDeskUi` puts a transferred copy back. `readDeskPref` returns null when nothing is saved or the store fails. These values are not cleared on logout.

Shortcuts (`desk.keys.<user id>`), the chosen theme (`desk-theme`), and UI font scale (`desk-font-size`, a percent such as `90`) stay in `localStorage`, because the first paint needs them at once. Font scale sets root `rem` and `--desk-ui-scale` on the document; grid chrome, shell toolbar buttons, and `DeskFKeyBar` icons use the scale tokens in `desk-tokens.css`. A few hardcoded `px` in individual pages may not follow. Embedded desk shares the same document root as the classic shell.

## Framework or product

| Framework                                                                   | Product (`ankpal/`)                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Menu mechanism, default date menu, `DeskContextMenu`, `createDeskChecklist` | Which checks exist and what they search: party and product fields  |
| `DeskPrefStore`, the IndexedDB store                                        | Which store is used, its database name, and any server store       |
| `DeskLookupConfig`: how a box looks and behaves                             | `AnkpalLookup`: model, endpoint, where, attributes, `searchLookup` |
| The theme list, `registerDeskTheme`, and `--desk-danger`                    | The Ankpal theme and its CSS                                       |
| `askDeskConfirm` and `DeskConfirmHost`                                      | Which actions confirm, and the words on the question               |
| `PivotDesigner` and its engine                                              | The fields, their labels and formats, the starting layout, drill   |

**Pivot calculated fields.** "ƒx Calculated field…" in the field pane opens `PivotCalcEditor`: a name, a formula over other number fields (`[Gross profit] / [Taxable value] * 100`; fields by label or id in brackets, numbers, `+ - * /`, brackets), a live check that marks the mistake, field and operator buttons, Number or Percent, and the grand total over the loaded rows. A calculated field lives in the layout (`layout.calculated`, `pivotCalc.ts`) and goes to Values only. Each cell works it out from that cell's own sums, so a group's GP % is its GP over its sales, never a sum of percentages; dividing by zero leaves the cell empty. Totals, subtotals, "show as" shares and the colour scale apply as for any value. `pivotLayoutFields` lists the fields its formula reads (`refs`), so a page that loads only used fields loads those. **Grouped facts.** `PivotDesigner` takes `grouped` (key column ids) when its facts are grouped rows, such as a server's summary: each stands for `__rows` rows, a key's value counts once per row, and a value column brings its sum, count, min and max (`<f>`, `<f>__n`, `<f>__min`, `<f>__max`). Every figure, calculated fields and shares included, comes out as from the rows themselves, as long as a distinct count's field is a key. **Kept data.** `storage/deskDataCache.ts` keeps large page data (one IndexedDB record per key with `savedAt`, at most 40, oldest dropped); unlike `deskPrefs` it is company data, which the host clears at logout. The host gets `start` (a starting layout, such as a saved pivot's), `remember` (off: never read or write the user's layout) and the `layout` event (the layout on screen, at first and after each change).

## Busy indicator

`DeskBusy` (`layout/DeskBusy.vue`) says something is loading over the content it covers: a moving bar along the top, a chip with the label and the seconds so far, and a light veil over what is already shown. It appears only after 250 ms, so a quick load does not flicker. `DeskGrid` shows it whenever its `loading` prop is on, so every list and report grid has it; a page with no grid wraps its content in `.desk-busy-host` and adds `<DeskBusy :active="…" />`, as the report pivot and the Studio preview do.

## Grid layouts

`grid/layout/` is the list designer. A page gives it a field catalog and its own columns. A user then names layouts, picks fields, and styles each field. The framework draws the grid and returns `DeskGridQueryState`: which fields are on screen, how to sort, and which filters are typed. The page turns that into its own request. The framework does not know qnatk, REST, GraphQL, or any other backend.

Layout tabs on a list carry a pin (`DeskGridLayoutTabs` with `live`, from `layouts.live` and `layouts.togglePin`). Pinned is the default: switching back to a pinned layout shows the rows it last loaded, with no request, as long as its query, sort, filters and page size are unchanged. An unpinned layout loads again on every switch. Rows are kept only while the page is open, so a reload or a new visit loads afresh. Pins are saved with the layouts (`refetch` lists the unpinned ones). A `dynamic` page size keeps its measured rows per page for each layout (`useDeskPageSize({ scope })`), so layouts with different row heights do not reload each other.

A project that already has a list page keeps that fetch. It replaces "always send these columns" with "send what `layouts.query` asks for". Ankpal does that in `ankpal/data/qnatkGridQuery.ts`. Another project writes the same kind of function against its own API. The catalog, the designer, and the saved layouts stay the same.

### Catalog

`DeskFieldCatalog` is plain JSON. `key` is the dot path of the value in a response row.

```ts
const ITEM_CATALOG: DeskFieldCatalog = {
  relations: [
    { path: 'brand', label: 'Brand' },
    { path: 'aliases', label: 'Aliases', many: true, maxItems: 5 },
  ],
  fields: [
    { key: 'id', label: 'Id', type: 'number', sortable: false, filterable: false },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'price', label: 'Price', type: 'currency' },
    { key: 'status', label: 'Status', type: 'text', format: 'statusLabel' },
    { key: 'brand.name', label: 'Brand', type: 'text' },
    { key: 'aliases.alias', label: 'Alias', type: 'text', sortable: false, filterable: false },
  ],
  // Fetched even when no cell shows them. Row actions and the row id belong here.
  always: ['id', 'status'],
  locked: [
    {
      id: 'name',
      header: 'Name',
      pin: 'start',
      lines: [['name']],
      sortField: 'name',
      filterField: 'name',
    },
  ],
};

const ITEM_FORMATTERS: DeskFieldFormatters = {
  statusLabel: (value) => (value === 'live' ? 'Live' : 'Draft'),
};
```

- `type` is `text`, `number`, `currency`, `date`, or `boolean`. `format` names a function in the page's `formatters`. The formatter receives the raw value and the row.
- A `currency` field names where its row's currency lives with `moneyFrom: { code, rate, id?, symbol? }` (row keys). Those keys are fetched with the amount even when no cell shows them. In a cell the face's amount stays on its line and the other currency becomes a small muted line under it. A `number` field can set `decimals: 'qty' | 'money' | n`. `catalogFromColumns` copies both from the page's columns.
- A layout column's `money` is the same view as `moneyView` (`face`, `symbol`, `second`). The designer shows it as a Currency group on any column with a currency field. Left unset, the company amount is on top.
- A `many` relation is a child collection. The designer offers it as comma separated, space separated, one per line, or a small table, at most `maxItems` items per row (default 5). Child fields cannot be a sort field. They can be a filter field only when marked `filterable: true`.
- `always` does not need a cell. The user cannot remove these keys by hiding a column.
- `locked` columns are written like a layout column, with `pin: 'start' | 'end'`. Every designed layout shows them as written. The user cannot edit, move, hide, or remove them, and the column picker does not list them.
- `meta` on a field or relation is opaque. The framework hands it back to the adapter, so a project can store a model name or a join hint there.
- `virtual` marks a field a formatter draws from other values on the row. The shipped layout can show it. The adapter does not select that key.

The built-in Default layout is shipped from the page's visible `DeskColumn[]` (`shippedLayout`). It is always in the list. The user can edit it; that edit is saved under the id `default`. Reset throws the edit away and shows the shipped columns again. Delete does nothing to it. A column that formats a value puts the keys it reads in `DeskColumn.fields` (`fields: ['brand.name']`). Without that list the shipped layout cannot tell which catalog fields the column uses. A seed column with `textLayoutMenu` keeps that menu when the layout column uses the same id.

### What the user can put on a field

A cell line holds bare keys (`'sku'`), field objects, and list parts. A bare key shows the value only. Saving strips defaults, so an old layout of bare strings still loads.

```ts
{
  id: 'price',
  header: 'Price',
  align: 'right',
  lines: [[
    { field: 'sku', style: { place: 'left' } },
    {
      field: 'price',
      label: 'Price',
      style: { place: 'right', size: 'normal', pad: { top: 2 } },
      rules: [{ op: 'gt', value: '500', tone: 'danger' }],
    },
  ]],
}
```

- **Label** is drawn before that field's value (`Price: 120`). The column header stays the header.
- **Look** is `text`, `chip`, or `box`. **Color** is default, muted, green, amber, red, or blue. **Size** `normal` is the grid's own text. `small` is the quiet second line (such as a converted amount under a price). `large` is slightly bigger. **Bold** is optional.
- **Place** is `left` or `right`. Two fields on one line can sit at opposite ends. The column's Align still aligns the whole cell when no field on that line has its own place.
- **Padding** is top, right, bottom, left, in pixels, each from 0 to 32. The default is 1, 4, 1, 4. A saved field stores a side only when it differs from that default. Every drawn field span uses the default for the sides it does not set.
- **Rules**, at most five. The first match replaces that row's look, color, and bold. Each rule has a `when` condition, for example `sellingPrice > mrp`, `sellingPrice < 5000`, or `mrp > sellingPrice * 2 and this contains "bolt"`. A condition may use catalog fields, `this` (the styled field), numbers, quoted text, `+ - * / ( )`, `and`, `or`, `not`, `between`, `in`, `contains`, `starts`, and `is empty`. Greater and less read the number. Equals and not-equals use the number when both sides are numeric, and the formatted text otherwise. `contains` and `starts` ignore case. The text is parsed against the catalog. It is never run as code, so a name that is not a field is rejected. A saved rule with only `op` and `value` still compares this field. A rule does not change place, size, or padding. Fields a condition reads are fetched with the row even when the cell does not show them. List fields cannot be named.
- Parts on one line with no label, look, color, size, bold, place, or custom padding join into one text run, separated by the column separator (default a space). Any of those settings draws each part on that line as its own span.

In the designer the user selects a column, then clicks or drops fields into that column. Move a field down past the end of its line, or split the line, to open a new line under it. The New line target at the bottom of the cell always appends.

### Page

```vue
<DeskGridLayoutTabs :layouts="layouts.layouts.value" :active="layouts.active.value" @select="layouts.select" />
<DeskGrid
  :key="layouts.gridStorageKey.value"
  :columns="layouts.columns.value"
  :storage-key="layouts.gridStorageKey.value"
  :sort-column="layouts.sortColumn.value"
  :sort-descending="layouts.sortDescending.value"
  :filter-values="layouts.filterValues.value"
  :row-actions="layouts.hideActions.value ? undefined : rowActions"
  :layout-designer="layouts.menu.value"
  @sort="layouts.onSort"
  @filter="layouts.onFilter"
  @update:hidden="layouts.onHidden"
  @layout="designer.onCommand"
/>
<DeskGridDesigner
  v-if="designer.open.value"
  v-model:open="designer.open.value"
  :layout="designer.draft.value"
  :catalog="ITEM_CATALOG"
  :formatters="ITEM_FORMATTERS"
  :sample="rows[0] ?? null"
  :is-new="designer.isNew.value"
  @save="designer.onSave"
  @delete="designer.onDelete"
/>
```

```ts
const layouts = useDeskGridLayouts({
  storageKey: 'items',
  catalog: ITEM_CATALOG,
  columns: () => itemColumns,
  formatters: ITEM_FORMATTERS,
});
const designer = useDeskGridDesigner(layouts);

watch(layouts.query, () => {
  if (layouts.ready.value) void fetchPage();
});
```

Key the grid by `gridStorageKey`. Each layout keeps its own widths, order, and hidden columns, and the grid reads them on mount. `ready` waits for the saved layouts and for the grid's first `update:hidden`, so the first request already leaves out hidden columns. Layouts are saved under `grid-layouts:<storageKey>` as `{ version: 1, active, layouts }`. `kind: 'menu'` lists the layout in the footer menu. `kind: 'tab'` also draws it in `DeskGridLayoutTabs`.

### What a layout opens with

A layout can save one sort and several column filters in `view`, plus `hideActions`:

```ts
{
  id: 'open-orders',
  name: 'Open orders',
  kind: 'tab',
  columns: [/* ... */],
  view: { sort: { column: 'amount', direction: 'desc' }, filters: { status: '= open', date: 'this month' } },
  hideActions: true,
}
```

- `view.sort.column` and the keys of `view.filters` are column ids of that layout, locked columns included. `cleanLayout` keeps a sort only on a column with a `sortField`, and a filter only on a column with a `filterField`. Empty filter text is dropped.
- Filter text uses the filter box syntax (`= x`, `> 200 <= 500`, `this month`). The page's adapter parses it the same way as typed text, and the grid shows it in the filter box through `filter-values`.
- `select`, `save`, Reset, Delete of the active layout, and the first prefs load apply the view. Prefs are part of `ready`, so the first request already carries it. Without a saved sort the list is `id` descending.
- The view holds starting values only. The user can change or clear them; opening the layout again brings them back. The saved layout does not change.
- `hideActions` hides the row actions column. Default can never set it. Enter, double-click, and toolbar actions still work.
- Each row action button carries `data-desk-action="<action name>"` and each context-menu item `data-desk-menu-item="<item id>"`, so tests click them by name (testkit `deskLocators.rowAction`, `deskLocators.menuItem`, `deskRunRowAction`).
- In the designer, "When this layout opens" picks the sort from columns that can sort and the filters from columns that can filter, with the same form as the header filter popup (`DeskFilterEditor`). Removing a column, or clearing its Sort by or Filter on, removes the view entries that used it.

### Export and import

Pass `:list-key="layouts.storageKey"`, `:all-layouts="layouts.layouts.value"`, and `@import-all="designer.onImportAll"` to `DeskGridDesigner` to show Export and Import (`grid/layout/transfer.ts`).

- Export ▾ → **This layout** saves the layout on screen, unsaved edits included. **All layouts** saves every saved layout, Default included under the id `default`.
- The file is JSON: `{ format: 'desk-grid-layout', version: 1, list, page, exportedAt, layout | layouts }`. `list` is the storage key. Import refuses a file from another list, a different format or version, damaged JSON, or a file over 256 KB. Fields this list does not have are dropped, and a layout with nothing left is refused.
- A file with one layout loads into the designer in place of the layout being edited. Nothing is saved until Save.
- A file with all layouts asks first. **Overwrite** replaces Default and layouts with the same name (case ignored), keeps their ids, and adds the rest. **Add** keeps everything and adds the file's layouts under new ids; Default comes in as "Default (imported)" and a taken name gets a number. Both save at once through `layouts.replaceAll`.

`layouts.loadedFields` is the set of root field names in `query.selection.fields` (the page query, plus `always`). A row action whose condition reads `status` should stay disabled, and say which field is missing, when that name is not in the set. `always` is how a developer keeps that field loaded without giving it a cell.

### Adapter

`layouts.query` is a `DeskGridQueryState`:

- `layoutId` — the active layout, or `default`.
- `selection` — `{ fields, relations }`. Each relation is the same shape and may set `many: true` and `limit`. It contains only what visible columns, the sort, and active filters read, plus `always`.
- `sort` — `{ field, direction }`, or null for the backend's own order. `field` is a catalog key such as `brand.name`.
- `filters` — `{ field, type, text }`. `text` is what the user typed. The adapter parses it for its API.

A `many` node is a second query, only for the parent ids on that page, at most `limit` children per parent. Joining the children into the page query repeats parent rows and breaks the page limit and the count.

```ts
function itemRequest(state: DeskGridQueryState, page: { limit: number; offset: number }) {
  const brand = state.selection.relations.brand;
  const aliases = state.selection.relations.aliases;
  return {
    page: {
      fields: state.selection.fields,
      include: brand ? { brand: brand.fields } : {},
      sort: state.sort,
      filters: state.filters,
      limit: page.limit,
      offset: page.offset,
    },
    // Fetch after the page returns, with those row ids. Omit when the layout shows no aliases.
    aliases: aliases?.many ? { fields: aliases.fields, limit: aliases.limit ?? 5 } : null,
  };
}
```

A REST adapter can send the page part as:

```
GET /items?fields=id,name,sku,status&include=brand&brand.fields=name&sort=price:desc&filter[sku]=abc&limit=20&offset=0
```

and the aliases as `GET /item-aliases?itemId=1,2,3&fields=alias&limit=5`. Attach the children onto the page rows before the grid renders. The cell reads `aliases.alias` on each row, the same path as the catalog key.

## Form layout

`formLayout/` draws a form as named zones. A zone has sections. A section marked open shows its fields in a grid. Each field is a slot `{ id, span? }`. A missing span is one column. A span greater than 1 sets `grid-column: span` on that slot. A save from before slots listed ids as strings; `resolveFormLayout` reads those as span 1. The designer does not edit span yet. The other sections sit in one wrapping row of summary strips, and one of them can open as a full-width panel under that row. The page draws each field itself through the `#field` slot, so this folder never imports a voucher.

`resolveFormLayout` merges a saved layout with the fields that exist now. Unknown ids are dropped, new ids go back to their default section, and a locked field cannot be hidden. A page can also pass layout options (`DeskLayoutOption`: an id, a label, choices, a default, and an optional `tab`). Without tabs, the designer shows each option as a select under Labels. With a `tabs` prop, the first tab holds Labels, options that name no tab, and the zones. Each later tab lists the options whose `tab` matches. Chosen values stay in the same `options` record. A saved value that is not a choice falls back to the default, and an old save with no options gets the defaults. `useDeskFormLayout` reads and writes that save through `deskPrefs`. `option(id)` returns the current choice, including an unsaved designer change. While the designer is open, the form shows the draft. `layoutOptionsOnTab` in `formLayout/options.ts` is the grouping the designer uses.

A page can pass `presets` (`DeskLayoutPreset`: id, label, optional tab, and an `options` map). The designer shows them as a Preset select on the matching tab. Choosing one writes each option through the same save as a single choice.

`form/DeskTabs.vue` is the tab strip (role `tablist`). Ctrl+Shift+Left and Ctrl+Shift+Right move between tabs and wrap. The account page and the layout designer both use it. The strip owns those two keys, so the page does not register them again. On a routed page, the outermost strip writes the open tabs to `?tab=outer` and nested strips add segments (`?tab=places/racks`). A refresh opens the same tabs. Dialog-hosted pages and modal layers skip this. Pass `:in-url="false"` when the page owns other query keys or the strip is a wizard that must not jump steps from the URL.

Label styles are Side (label beside the input, 4 columns), Above (caption above, 5 columns), and Placeholder (the label is the empty placeholder and the hover title, 6 columns). In Placeholder style a field can keep its label inside the input. A date always does, because a date input cannot show a placeholder. On a voucher, Branch and Warehouse always do too, because a filled name does not say which of the two it is. The layout designer shows them as "label inside". Columns fall to 3 at 1200px and to 2 at 860px.

`layout/toolbar.ts` (`useDeskToolbar`) adds buttons to the shell's `DeskFKeyBar`. A click runs that action. A button with `icon` is only that picture, and its label is the tooltip. Icons are `layout` and `scan`. A button without an icon shows its label, and a shortcut only when the action has keys. `visible` is an optional function; when it returns false the button stays off the bar. Form layout is the layout icon and has no shortcut.

# Feature development in project

**No id column by default.** A list grid does not show the record `id` (the "Sr" column) unless the task asks for it. The grid's own row-number cell is enough.

**Use desk components first.** A date, select, lookup, currency or check on a page is the desk control (`DeskDateInput`, `DeskCombo`, `DeskLookupBox`, `DeskCurrencyInput`) in a `DeskField`, a `DeskSettingsGrid` cell or a grid column. Never a native `<input type="date">` or a Quasar control. If the desk control misses something, add it to the framework, not to the page. A `date` setting shows the formatted date at rest (per the date display preference) and opens `DeskDateInput` on edit. A corner triangle is the cell's warning, from `column.error`, and is not drawn just because the cell is a date.

If you are an LLM or AI Agent and reading this, be sure that you can identified what is reusable things and make them as framework update so every project gets benefited from that (unless you are said not to touch framework files elsewhere). Any change in grid/fields/dialogon page is possible should be an option in components so they get mature and robust with time.

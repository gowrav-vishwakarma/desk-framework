# Desk keys

One small keyboard system for the desk ERP. It handles shortcuts, focus order (Enter and Tab), and first focus when a page or dialog opens.

It does not use or change the classic app's shortcut code. Presets and action labels come from the host through `configureDesk` in `../host.ts`. The reference app keeps its preset JSON files in `src/tenant/keys/presets/`. Names such as voucher, party or sales invoice below are that app's screens, used as examples.

## Words used here

- **Action id**: a name such as `action-save` or `nav-sales-invoice-add`. Presets map action ids to keys.
- **Combo**: a key string such as `ctrl+s` or `alt+f2`. Letters and digits come from `event.code`, so the keyboard layout does not matter.
- **Layer**: one level of keys and fields. The shell, each routed page, and each open dialog are layers. They stack like this: shell, then page, then dialog.
- **Modal layer**: a dialog. Keys and fields below it are off, except handlers marked `always`.

## Files

| File | What it does |
|------|--------------|
| `combo.ts` | Turns a key event or preset array into a combo, and formats combos for display |
| `keymap.ts` | Pure helpers: merge a preset with overrides, find conflicts |
| `deskKeymap.ts` | The active keymap for the signed-in user, stored in `localStorage` |
| `../host.ts` | Presets, labels, and lookup search supplied by the host app |
| `layers.ts` | The layer stack and handler lookup |
| `useDeskLayer.ts` | `provideDeskLayer` for layer owners, `useDeskLayer` for children |
| `dispatcher.ts` | The only key listeners (installed once by `DeskLayout`), and `dispatchDeskKey` for hosts with their own global keys |
| `altTap.ts` | Tap Alt, then a letter, to open a menu |
| `DeskKeysDialog.vue` | Lets the user pick a preset and change keys (Ctrl+Alt+K) |

## How a key press is handled

`installDeskKeys` adds a keydown listener on `window` (bubble phase), so focused widgets such as the grid, combo and lookup see the key first. If a widget calls `preventDefault`, the shortcut does not run.

Then the dispatcher:

1. Builds the combo. It skips repeated and IME keys.
2. While you type in an input, it skips bare keys (no Ctrl, Alt or Meta, and not F1 to F12) and copy, paste, cut, undo and redo.
3. Finds the action ids bound to the combo.
4. Walks the layers from the top down. The first layer with a handler for one of those ids wins. Below a modal layer, only `always` handlers count. A handler with `when: () => boolean` that answers false is passed by, so the key reaches the layers below (a grid without a filter row leaves Ctrl+F to its page's filter panel).

Ctrl+R and Ctrl+Shift+R are never taken.

There are two more listeners (keydown and keyup in capture phase) for the Alt tap, plus a `blur` listener that resets it. That is all.

### Inside another shell

The steps above live in `dispatchDeskKey(event)`. It returns `handled` (a desk handler ran), `blocked` (a dialog is open, the user is typing, or the key repeated) or `pass` (desk has no use for it). The standalone shell calls it from its own listener.

A host that has its own global keys, such as the classic app, calls `installDeskKeys({ embedded: true })` and calls `dispatchDeskKey` itself. Embedded mode keeps only the jump preview. There is no Alt tap and no bubble listener, because the host keeps its own menu bar and runs its global keys only on `pass`. See the Ankpal desk's `README.md`. Shift+Enter is handled by the focused field or grid, which calls `preventDefault`, so the classic shortcut manager skips it. It is not a keymap action.

## Menus: the Alt tap

Press and release Alt on its own to focus the top menu for the page you are on, the same as tabbing to that menu and pressing Enter. Left and Right move across the top menus. Down or Enter opens the highlighted menu. A letter still opens that menu directly (Alt, then M, opens Masters). While a menu is open, the arrow keys stay in the menu and do not move the grid. Esc closes it. Alt+key combos still go to the preset. The Alt tap is off while a dialog is open.

## Registering keys

A page registers its keys with `useDeskLayer`. Each routed page already has its own layer (`DeskPageLayer` in `DeskLayout`).

```ts
useDeskLayer({
  handlers: {
    'action-save': save,
    'action-cancel': () => router.push(listPath()),
  },
});
```

A dialog passes extra keys with the `keys` prop. `DeskDialog` already binds `action-save` and `action-form-save` to accept, and `action-cancel` to close.

```vue
<DeskDialog v-model:open="open" :keys="{ 'action-delete': clearCurrent }" @accept="apply" />
```

List actions from `useDeskActions` bind themselves: create goes to `action-new`, edit to `action-edit`, delete to `action-delete`, plus the action's own `shortcutKeyCode`.

Global shortcuts live in the shell layer. `nav-*` ids open the matching desk page from `router/desk-nav.ts`, and ids with no desk page do nothing.

To run an action from a button, call `runDeskAction(id)`. To show its keys, use `deskKeyLabel(id)`.

## Focus order: Enter and Tab

Fields are elements with `data-desk-field`. The order is their DOM order inside the top layer. Fields inside a nested layer (such as an open dialog) are left out.

- **Enter** goes to the field's `onEnter` target, otherwise to the next field.
- **Shift+Enter** goes back one field on a text, number, or date input. A textarea keeps Shift+Enter as a new line. A combo or lookup already goes back on Shift+Enter.
- **Tab** goes to the field's `onTab` target, otherwise it acts like Enter.
- **Shift+Tab** goes back one field.
- In a dialog, Enter on the last field accepts the dialog, and Tab wraps to the first field.

You add field options with `useDeskLayer({ fields: [...] })`:

```ts
useDeskLayer({
  fields: [
    { id: 'party', onEnter: 'date' },
    { id: 'notes', onTab: 'save' },
  ],
});
```

A target can be a list. The first one that can take focus wins.

### Date fields

A date field stores `YYYY-MM-DD`. What you type and what you see follow one choice for every date field on every desk page, saved in this browser. Right-click a date field to change it. Grid date cells use the same choice.

**Show as** is `dd/mm/yyyy` (the default), `dd-mm-yyyy`, `dd MMM yyyy`, or `yyyy-mm-dd`. Digits with no month name are read in that order, so `03/04` is 3 April unless you chose `yyyy-mm-dd`.

**Week days** chooses where that text goes and when it shows. **Show beside** puts `Sat, 12 Sep 2026` next to the field. **Show as a tooltip** puts it on hover instead. **On focus** shows it only while the field is focused. **Always** leaves it up. A grid cell uses the tooltip, because the cell has no room beside the value.

**Typing** is either digits, which fill the date as you type (`12092026` becomes `12/09/2026`), or free text. Free text is read on Enter, Tab, or when focus leaves. You can type `12`, `12/9`, `12/09/26`, `12/09/2026` (with `/`, `-`, `.`, or a space), `120926`, `12 sep`, `12 sept 26`, `12sep`, `sep 12 2026`, `t` or `today`, `y` or `yesterday`, and `+3` or `-1` for days from today. A missing month uses today. A two-digit year is 20yy. `31/02` is not a date: Enter stays in the field. An empty field stores nothing and moves on.

**Auto year select** chooses the year when the typed date has none. **Calendar year** (the default) uses this year's number, so on 10 Oct 2026 `2 feb` is 2 Feb 2026. **Financial year** uses the company's selected year, April to March: in FY 2026-27 that same `2 feb` is 2 Feb 2027, and `2 oct` is 2 Oct 2026. A typed year, such as `2 feb 2026`, is kept either way. Today, yesterday, and `+3` still count from today.

Enter and Tab move to the next field. Shift+Enter and Shift+Tab move to the previous one. Alt+Down or F4 opens the calendar. Choose **Open when the field is focused** if you want it open as soon as you land there; you can still type. While it is open, and before you type, Left and Right move one day, Up and Down move one week, and PageUp and PageDown move one month. Esc closes it. A click picks that day, and Enter then moves on.

### Grids

`DeskGrid` is a single field (its `field-id`). The `tab-flow` prop decides what Tab does inside it:

- `enter` (default): in entry mode Tab acts like Enter. In list and report mode Tab moves one cell right. Shift+Tab and Shift+Enter move to the previous cell, wrapping onto the end of the previous row. From the first cell both leave the grid for the field before it.
- `field`: Tab leaves the grid to the next field (or `exit-field`). Shift+Tab goes to the field before the grid. Use this only when Tab should leave the grid. By default Tab stays in the grid and moves like Enter, including the contacts grid and invoice lines.

`min-rows` keeps at least that many rows. Delete still removes a row while more than that remain. On the last kept row, Delete clears the cells and any related ids (a lookup's `${column}Id`, and other keys ending in `Id`) and leaves the row in place. The contacts grid and the sales invoice lines use `min-rows="1"`.

**Empty first cell.** In an entry grid, Enter (or Tab, with `tab-flow="enter"`) on the gate cell when it is empty leaves the grid for the next field, instead of walking through a blank row. The gate cell is the `exit-when-blank` column, or the first column. Enter on the last cell of a row with an empty gate cell also leaves.

**New row at the top.** `new-row-at="start"` makes row 0 the entry row, so a person typing sees every entry at the same place on screen. When row 0 is finished, Enter on its last cell inserts a new blank row above it and puts the cursor on its first cell. The finished row moves down. When the cursor is on any other row (just looking around), Enter on the last cell goes to the first cell of the next row, and from the bottom row back to the entry row. The default `end` is the old behavior: a new row at the bottom.

- `new-row` is an optional function that builds a blank row. Use it when rows need more than empty columns (voucher lines pass `blankLine`).
- With `start`, the entry row has no row number while its gate cell is empty, and the rows below count from 1.
- The page keeps one blank entry row at the top. Rows are saved in the order shown (newest first).
- The grid exposes `advanceRow(index)`, which applies the same Enter rules from the last cell of a row. The line drawer uses it, so leaving a drawer behaves like Enter in the grid.
- The voucher line drawer is one header of column names and one row of values. Enter on a closed select, check, lookup, or action opens it. Enter on a closed Free qty, Description, Warehouse, or HSN cell moves to the next cell. Typing in those cells opens the editor with that character. HSN searches codes after four characters, and a 4, 6, or 8 digit code can be kept on the line. Enter inside the editor commits and moves to the next cell. Shift+Enter moves to the previous drawer cell, and from the first one returns to the item row. A column that opens a dialog shows the dialog mark in its header. A list shows the dropdown mark and a lookup shows the search mark, the same as the item row. Tab walks cells without that extra step. Arrow Left and Arrow Right move between closed drawer cells. Arrow Down from an item cell enters the drawer on the cell underneath it, and another Down moves to the next item row, again on the cell underneath. Arrow Up from the drawer returns to this item row. Arrow Up from an item row goes to the item row above, because that row's drawer is not on screen. Esc on a closed cell returns to the row. Saving a line dialog, including discount, moves to the next cell.
- The sales invoice item grid (and the other vouchers on the same page) offers this as **New items** on the Item rows tab of Form layout. At the top is off until that layout says otherwise. It is saved with the form layout for that user and voucher type.

On a list with more than one page, ArrowDown on the last row loads the next page and ArrowUp on the first row loads the previous page. PageDown and PageUp do the same from any row and keep the row index. There is no wrap at the first or last page: PageDown on the last page moves to the last row, and PageUp on the first page moves to the first row. These keys do nothing while a page is still loading, so holding a key does not queue extra requests. The first column numbers rows across pages (`(page - 1) * page size + row`), so page 2 of 20 starts at 21. Entry and report grids are unchanged: PageUp and PageDown still move within the loaded rows, and their row numbers start at 1.

When the grid footer shows a page-size select (`pageSizes` on `DeskGrid`, usually through `useDeskList` `gridPaging`), **Infinite scroll** drops Prev/Next and loads the next batch when you scroll near the bottom or press ArrowDown on the last row. **All** loads without a server `limit` and hides Prev/Next. **Dynamic** measures how many rows fit the visible body (one row less than the raw count so the last line is not clipped), saves that count under `grid-page-fit:<storageKey>`, and reloads; it remeasures when the grid body is resized.

### Line dialogs

A column can open a dialog on Enter with `enter: { type: 'dialog', dialog, returnTo, when }`.

- `when: 'always'` (the default) opens on every Enter.
- `when: 'change'` opens only when the committed value differs from the value when editing started. Enter on an unchanged cell moves to the next cell.
- `when: 'never'` stays closed on Enter. The open-dialog shortcut still opens it.
- `when: (ctx) => boolean` opens when the function returns true. `ctx.row` is the whole row, so the decision can use this cell or any other field. Enter moves on when it returns false.

The open-dialog shortcut still opens the dialog when `when` would move on.

**Shift+Enter** walks back along the same cells. It does not add a row. In a list it moves to the previous row and does not open the record. A closed dropdown is not opened.

Landing on a dialog cell is `back-dialog` on the grid, or `back` on that column's `enter`. The column wins.

- `select` (the default) only moves there. Plain Enter then uses the rules above. Ctrl+Enter still opens the dialog.
- `when` asks that column's own `when`, with no edit (`changed` is false) and without the page's `@next-focus` hook. `always` opens. `change` and `never` stay closed. A function is asked again. OK returns to that same cell, not to `returnTo`.

A page can override Enter per cell with `@next-focus`. The function receives the row, the column, whether the value changed, and `force` (the open-dialog shortcut). Return a target to use it, `null` to move to the next cell, or `undefined` to keep the column's `enter`. The header mark reads the column's `enter` only. Quantity declares the parameter dialog there, and the voucher page returns `null` when that line does not need the box.

A column whose Enter opens a dialog shows a small dialog mark in its header, on the opposite side of the title. Ctrl+Enter (`grid-cell-dialog`) opens the dialog even when the value did not change. A double-click on the cell runs the same open when the pointer map binds `grid-cell-dialog` to `dblclick` (the default). Rebind or clear that gesture with `setDeskPointerGestures` in `pointerGestures.ts`. On a cell that has a dialog, that wins over the section jump, which uses the same keys by default. Change those keys in the Keys dialog. The grid takes the dialog shortcut only on a cell that has a dialog, so list pages still use Ctrl+Enter to edit a record.

`action-filter` (Ctrl+F in the Ankpal preset) opens the page's `DeskFilterPanel`, or moves a list grid to its filter row. Global search is Ctrl+Shift+F there. In a grid with `selection="row"`, Enter emits `open` and the `grid-cell-dialog` keys emit `open-page`.

## Jump and Ctrl+Arrow

Hold the jump key (Ctrl, from `desk-jump`) for a moment and one outline shows where Ctrl+Enter will land. A quick Ctrl+S never shows it. Releasing the key, scrolling, or clicking hides it. Turn the outline off with "Jump preview" in the Keys dialog. That choice is saved with your other keys.

**Ctrl+Enter** (`desk-jump`) jumps to the next section. A section is any element with `data-desk-section` in the current page or dialog. The jump lands on the element marked `data-desk-entry`, or on the first field in that section that can take focus. A field can name its own target with `onJump`, the same way as `onEnter`.

Ctrl+Enter opens what the focused thing owns. A Qty cell that has a dialog opens that dialog. A closed form section opens that section. Anywhere else, it jumps. Holding Ctrl shows the same outline on the strip as on a Qty cell.

A closed section is one strip (`section:<id>`). Space, Ctrl+Enter, or a click opens it. Enter and Tab move past it, so it is one stop. Inside the open panel, Enter or Tab on the last field closes it and moves on. Shift+Tab on the first field returns to the strip. Esc closes the panel and focuses the strip. Focus outside the panel closes it.

On a sales invoice the sections are the header zone, the item grid, and the footer zone. From any open header field, including party, the jump lands on the Item cell of the first blank line. From an item cell it lands on the first footer field.

The Form layout button is an icon in the toolbar. Its tooltip says Form layout. It is not a shortcut, so Ctrl+Alt+L stays free.

A grid decides the exact cell:

- `jumpTo` picks the landing cell. The voucher grid uses the `jump-column` prop (Item).
- `jumpFrom` runs while the grid itself is focused. On a cell that opens a line dialog, and only when that shortcut is the same keys as the jump, the outline sits on that cell and Ctrl+Enter opens the dialog.
- `focusNear` picks the cell when Ctrl+Arrow enters the grid from outside: Up and Down take the column under your X position (first row going down, last row going up), Left and Right take the row beside your Y position.

**Ctrl+Arrow** (`desk-move-up`, `desk-move-down`, `desk-move-left`, `desk-move-right`) moves to the nearest field in that direction, using where the fields actually sit on screen. On a Mac, Control+Arrow is taken by the system, so Command+Arrow does this move instead. The Keys dialog shows Cmd there. Left and Right stay on the same row. Up and Down go to the nearest field that lines up with the current one (their sides overlap), and only fall back to the nearest diagonal field when nothing lines up, so a field above an empty slot still reaches the grid below it. A field that takes focus itself (has `tabindex`, like the grid) is measured as a whole, not by the first button inside it. A grid is one field when it sets `ctrlArrows` to false. `DeskGrid` and `DeskSettingsGrid` leave it on, so inside a grid Ctrl+Arrow moves one cell, including the total lines, and at the edge it continues to the nearest cell outside: Ctrl+Up from the first item row reaches the header cell above that column, and Ctrl+Down from the last total line reaches the next grid's cell, or Terms. Turn `ctrlArrows` off on that grid when it should stay one field. A page that sets `arrow-leave` lets a plain arrow take that same step out of the grid when the cell has nowhere further to go inside it. A sheet always accepts that landing on the cell in line with the field you left.

**Enter on the last cell.** Ctrl+Enter is the section jump. A grid can set `enterJump` so plain Enter on the cell that would leave the grid runs that same jump. It is off unless the page sets it. Mapping keeps Ctrl+Enter. The account header sets it, so Enter on its last cell lands on the first cell of the open tab.

These actions are registered on the shell. On a list page, that page's Edit action still wins when it uses the same keys, because the page sits above the shell.

**Turning Ctrl+Arrow off.** The shell owns the move, so a page or widget only says when it should not happen:

- A whole page, form or dialog: `disable-spatial-move` on `DeskForm` or `DeskDialog` (or `disableSpatialMove` in `useDeskLayer`). The top layer decides, so a dialog over a normal page turns it off only while it is open.
- One widget: put `data-desk-no-move` on it, or use `no-move` on a `DeskField`. Ctrl+Arrow is then left to the widget while it has focus.

The check runs before the key is claimed, so a page that turns it off keeps the native Ctrl+Arrow (word jumps in a text box).

**New and Edit on a lookup.** A lookup that has an `editor` answers `action-new` and `action-edit` while it has focus, before the section jump is considered. Alt+Enter is Edit in the Ankpal and Tally presets. Ctrl+Enter stays `desk-jump`, so only a lookup with an editor takes the Edit key, and it takes it only while that lookup is focused. A list grid does not take modified Enter, so the page's Edit shortcut runs there too. A grid lookup cell handles the keys on a resting cell, and its open editor hands them to the grid. See `Pages in a dialog` in the framework README.

## Tab keys

Ctrl+Shift+Left and Ctrl+Shift+Right (`desk-tab-prev`, `desk-tab-next`) switch tabs on a page that has them. They appear in the Keys dialog like any other action. Only a page that registers a handler for them claims the keys; on every other page they stay native, so text selection by word still works.

The account form registers both handlers and wraps around at either end. After a switch, focus lands on the first field of the new tab, and Ctrl+Arrow then moves between the fields of that tab (only fields that are mounted are seen). Ctrl+Enter still jumps between the top fields and the open tab.

`DeskGrid` skips tab keys with `isDeskTabKey`, so a grid never uses Ctrl+Shift+Arrow to extend a selection on a page that has tabs.

### Keys inside a field widget

A field widget (`DeskCombo`, `DeskLookupBox`, `DeskCellEditor`, the grid corner menu) never calls `stopPropagation`. If it did, Ctrl+S, F2 and every other shortcut would never reach the listeners above it, and the browser would run its own action (Ctrl+S opens "Save page").

Instead the widget calls `claimDeskKey(event)` for a key it handles. A claim is a mark on the event. It does not stop the event.

- Parent widgets that treat every key in their subtree as their own check `isClaimedDeskKey(event)` and skip it. `DeskGrid.onKey` does this, so typing in a cell editor never copies, pastes, deletes or moves rows.
- Shortcut listeners (`dispatcher.ts`, the classic `ShortcutManagerSimple`) still see the key. A key the widget consumed (arrows, Enter, Escape, Tab) is `preventDefault`ed, so they skip it. Any other key (Ctrl+S, F-keys, Alt+letter, nav keys) runs its shortcut. `mayDispatch` still blocks bare keys and native text combos while you type.
- `isDeskNavKey` keys (section jump, Ctrl+Arrow, tab change) are not claimed, so the grid can act on them.

When you write a new field widget, claim the keys you handle and let everything else bubble.

## First focus

When a page or dialog opens, its layer focuses one field. The choice goes in this order:

1. `initialFocus` (a `DeskForm` or `DeskDialog` prop).
2. The first field marked initial (`initial` prop on `DeskField` or `DeskGrid`).
3. The first field that can take focus.

A grid counts as a field, so a page whose first field is a grid opens on its first cell. To leave a grid out, use `disable-auto-focus`. To turn first focus off for a whole dialog or form, use `disable-initial-focus`.

First focus runs once, when the layer opens. Reloading data does not move focus.

## Focus recovery

A click on blank space (dialog padding, a heading, the page background) leaves nothing focused, and a key then has no widget to reach. While nothing is focused, two plain keys (no Ctrl, Alt, Meta or Shift) are handled by the top layer:

- **Escape** closes the top dialog, through the same path as Escape inside it (`confirmClose` and `beforeClose` still ask about unsaved changes). Turn it off with `:escape-cancels="false"` on `DeskDialog`. Pages are unchanged.
- **Enter** puts focus back on the layer's last focused field, or its first field. Desktop pointers only (`hover: hover` and `pointer: fine`). Turn it off with `:refocus-on-enter="false"` on `DeskDialog` or `DeskForm`.

Both run at the top of `dispatchDeskKey`, so the standalone shell and a desk page inside the classic app behave alike, and a recovered key never reaches the classic global shortcuts. A host with its own dialogs passes `installDeskKeys({ canRecover })` and returns false while one is open. `DeskEmbedHost` does this for Quasar dialogs and menus.

## Custom keys

Open the keys dialog with Ctrl+Alt+K or the Keys button. Pick a preset, select an action, press Enter, then press the new keys. Del clears a binding, and "Reset to preset" removes all changes.

Changes are saved per user in `localStorage` as `desk.keys.<userId>` (`{ preset, bindings }`). If no preset is saved yet, the classic `shortcutSet` value is used as the default. Desk only reads that value and never writes it.

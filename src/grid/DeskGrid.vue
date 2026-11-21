<template>
  <div
    ref="rootEl"
    class="desk-grid component-content"
    :class="{ 'pin-foot': footPinned, 'grid-focused': gridActive && !displayOnly, 'desk-grid-display-only': displayOnly, 'is-fit': fitWidth, 'is-soft-cursor': softCursor }"
    @mousedown="settingsOpen = false; headerFilter = null; headerMenu = null"
  >
    <div
      ref="scroller"
      class="table-content"
      v-bind="scrollerFieldAttrs"
      @keydown.capture="onArrowCapture"
      @keydown="onKey"
      @mousedown="onScrollerMouseDown"
      @focus="onGridFocus"
      @focusout="onGridBlur"
      @scroll="onScrollerScroll"
      @copy.prevent="copyRange"
    >
      <table class="systable">
        <thead>
          <tr v-for="(group, groupIndex) in headerGroups" :key="group.id">
            <th
              v-if="groupIndex === 0"
              class="first-col"
              :class="{ 'column-picker': hasMenu }"
              :rowspan="headerGroups.length + (showFilter ? 1 : 0)"
              v-bind="hasMenu ? { title: 'Grid options', 'aria-expanded': settingsOpen } : {}"
              @mousedown.stop
              @click.stop="hasMenu && toggleMenu()"
            >
              <template v-if="hasMenu">≡</template>
            </th>
            <th
              v-for="header in group.headers"
              :key="header.id"
              :colspan="header.colSpan"
              :data-desk-col-id="header.isPlaceholder ? undefined : header.column.id"
              :class="[
                headerClass(header.column.id, header.isPlaceholder, groupIndex),
                {
                  'desk-col-drop-before': isDropBefore(header.column.id),
                  'desk-col-reorderable': headerReorderEnabled(header.isPlaceholder, header.column.id),
                },
              ]"
              :style="colStyle(header.column.id)"
              @click="onHeaderClick(header)"
              @contextmenu="onHeaderMenu(header, $event)"
            >
              <template v-if="!header.isPlaceholder">
                <span class="desk-col-head">
                  <button
                    v-if="headerReorderEnabled(false, header.column.id)"
                    type="button"
                    class="desk-col-grip"
                    title="Drag to reorder"
                    aria-label="Drag to reorder column"
                    @mousedown.stop="onColumnDragStart(header.column.id, $event)"
                  >
                    ⠿
                  </button>
                  <span>{{ headerLabel(header) }}<span v-if="mode === 'list' && sortColumn === header.column.id">{{ sortDescending ? ' ▼' : ' ▲' }}</span></span>
                  <span v-if="columnHasDialog(header.column.id)" class="desk-col-dialog" title="Dialog">
                    <svg viewBox="0 0 12 12" aria-hidden="true">
                      <rect x="1.2" y="1.6" width="9.6" height="8.8" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
                      <path d="M1.2 4.4h9.6" fill="none" stroke="currentColor" stroke-width="1.2" />
                    </svg>
                  </span>
                </span>
                <span
                  v-if="headerResizeEnabled(header.isPlaceholder)"
                  class="desk-col-resize-handle"
                  aria-hidden="true"
                  @mousedown.stop="onResizeStart(header.column.id, $event)"
                />
              </template>
            </th>
            <th v-if="rowActions" class="actions-col">Actions</th>
          </tr>
          <tr v-if="showFilter">
            <td
              v-for="column in visibleColumns"
              :key="column.id"
              class="column-filter"
              :data-filter="column.id"
              :class="{ 'desk-filter-pending': filterDraft?.id === column.id }"
              @contextmenu="openHeaderFilter(column.id, $event)"
            >
              <select
                v-if="column.filterChoices"
                :value="filters[column.id] ?? ''"
                style="width: 100%; border: 0; background: transparent; font-size: 0.88rem"
                @change="onFilterSelect(column, $event)"
                @keydown="onFilterInputKey"
              >
                <option value="">All</option>
                <option v-if="otherChoiceFilter(column)" :value="filters[column.id]">{{ filters[column.id] }}</option>
                <option v-for="choice in column.filterChoices" :key="choice.value" :value="choiceFilter(choice.label)">{{ choice.label }}</option>
              </select>
              <input
                v-else
                :value="shownFilter(column.id)"
                :title="filterDraft?.id === column.id ? 'Enter to filter · Esc to cancel' : ''"
                style="width: 100%; border: 0; background: transparent; font-size: 0.88rem"
                @input="onFilterInput(column.id, $event)"
                @keydown="onFilterInputKey"
                @blur="onFilterInputBlur(column.id)"
              />
            </td>
            <td v-if="rowActions" />
          </tr>
        </thead>
        <tbody>
          <tr v-if="gridWindow.padTop > 0" class="desk-pad" aria-hidden="true">
            <td :colspan="padSpan" :style="{ height: `${gridWindow.padTop}px` }" />
          </tr>
          <template v-for="item in windowRows" :key="item.key">
          <tr
            :class="[rowClass?.(item.row), { select: gridActive && selectedRows.has(item.index), 'row-cursor': selection === 'row' && gridActive && cursor.row === item.index, 'desk-block-start': item.index > 0 && repeatInfo?.blockStart.has(item.index) }]"
          >
            <td class="first-col" :class="{ focus: gridActive && cursor.row === item.index }">{{ shownRowNumber(item.row, item.index) }}</td>
            <template v-for="(column, colIndex) in visibleColumns" :key="column.id">
              <td
                v-if="spanOf(item.row, column, item.index) !== 0"
                :rowspan="spanOf(item.row, column, item.index)"
                :data-cell="`${item.index}-${colIndex}`"
                :data-col="column.id"
                :class="cellClass(item.row, column, item.index, colIndex)"
                :style="colStyle(column.id)"
                :title="errorOf(item.row, column) ?? ''"
                @mousedown.prevent="onCellMouse(item.index, colIndex, $event)"
                @dblclick="onCellDoubleClick($event)"
              >
                <template v-if="column.blocks">
                  <!-- Spill: the lines sit in a box that may run into the empty cells below (see `spillRows`). -->
                  <div
                    v-if="spillOf(item.row, column, item.index) > 0"
                    class="desk-cell-spill"
                    :style="{ '--desk-spill-rows': String(spillOf(item.row, column, item.index)) }"
                  >
                    <DeskCellBlocks :blocks="column.blocks(item.row)" />
                  </div>
                  <DeskCellBlocks v-else :blocks="column.blocks(item.row)" />
                </template>
                <span v-else class="desk-cell-value" :title="cellTitle(column, item.row)">{{ cellDisplay(column, item.row) }}</span>
                <span
                  v-if="cellCheckOf(column, item.row)"
                  class="desk-cell-check"
                  :class="`is-${cellCheckOf(column, item.row)}`"
                  aria-hidden="true"
                />
                <DeskMark v-if="markOf(column, item.row)" decorative :kind="markOf(column, item.row) === 'search' ? 'search' : 'select'" />
                <span v-if="captionOf(column, item.row)" class="desk-cell-caption">{{ captionOf(column, item.row) }}</span>
                <span v-if="tagsOf(column, item.row).length" class="desk-cell-tags">
                  <button
                    v-for="tag in tagsOf(column, item.row)"
                    :key="tag.id"
                    type="button"
                    class="desk-tag"
                    :class="tag.tone"
                    @mousedown.stop.prevent="onTag(item.index, tag.focus)"
                  >
                    {{ tag.text }}
                  </button>
                </span>
              </td>
            </template>
            <td
              v-if="rowActions"
              class="actions-col"
              :data-actions-row="item.index"
              @mousedown.stop
              @focusin="actionFocus = true"
              @focusout="actionFocus = false"
            >
              <DeskGridRowActions
                :actions="rowActions(item.row)"
                @action="(name) => emit('action', { name, row: item.row })"
              />
            </td>
          </tr>
          <tr
            v-if="showDrawer(item.row, item.index)"
            class="desk-row-drawer"
            :data-drawer-row="item.index"
            @focusin="onDrawerFocus(item.index)"
          >
            <td class="first-col" />
            <td :colspan="visibleColumns.length + (rowActions ? 1 : 0)" @mousedown.stop>
              <slot name="drawer" :row="item.row" :index="item.index" />
            </td>
          </tr>
          </template>
          <tr v-if="gridWindow.padBottom > 0" class="desk-pad" aria-hidden="true">
            <td :colspan="padSpan" :style="{ height: `${gridWindow.padBottom}px` }" />
          </tr>
          <tr v-if="footSticks && padHeight > 0" class="desk-pad" aria-hidden="true">
            <td :colspan="padSpan" :style="{ height: `${padHeight}px` }" />
          </tr>
        </tbody>
        <tfoot v-if="hasSummary || footTexts.length || slots.foot">
          <tr v-if="hasSummary">
            <td class="first-col row-summary" />
            <td
              v-for="column in visibleColumns"
              :key="column.id"
              class="row-summary"
              :class="[alignClass(column), column.tone ? `is-tone-${column.tone}` : '']"
            >
              {{ summaryText(column) }}
            </td>
            <td v-if="rowActions" />
          </tr>
          <tr v-for="(line, lineIndex) in footTexts" :key="`foot-${lineIndex}`" class="row-foot-line">
            <td class="first-col row-summary" />
            <td
              v-for="column in visibleColumns"
              :key="column.id"
              class="row-summary"
              :class="alignClass(column)"
            >
              {{ line.get(column.id) }}
            </td>
            <td v-if="rowActions" />
          </tr>
          <slot name="foot" />
        </tfoot>
      </table>
      <div v-show="square.visible && gridActive && !actionFocus && !displayOnly && selection !== 'row'" class="input-square" :class="{ editing, idle: !editing }" :style="square.style">
        <DeskCellEditor
          v-if="editing && activeColumn && activeColumn.editor !== 'lookup'"
          :key="`${cursor.row}-${cursor.col}`"
          v-model="draft"
          :kind="activeColumn.editor || activeColumn.type || 'text'"
          :options="columnOptions(activeColumn, rowAt(cursor.row))"
          :select-all="editSelectAll"
          v-bind="activeColumn.menu ? { menu: activeColumn.menu } : {}"
          @commit="commitEdit(true)"
          @back="onEditorBack"
          @tab="onEditorTab"
          @cancel="cancelEdit"
          @dialog="openCellDialog"
        />
        <DeskLookupBox
          v-else-if="editing && activeLookup"
          :key="`${cursor.row}-${cursor.col}`"
          v-model="draft"
          v-model:picked="lookupPick"
          variant="grid"
          :lookup="activeLookup"
          :blank="activeColumn?.blank === true"
          :multiple="activeColumn?.multiple === true"
          :selected="lookupSelected"
          :seed="lookupSeed"
          :select-all="editSelectAll"
          v-bind="activeColumn?.menu ? { menu: activeColumn.menu } : {}"
          @advance="commitLookup"
          @back="onLookupBack"
          @toggle="toggleLookup"
          @cancel="cancelEdit"
          @editor="runCellEditor"
        />
        <div class="rb-square" title="Fill down" @mousedown.stop.prevent="fillDown" />
      </div>
      <div
        v-if="settingsOpen"
        ref="menuEl"
        class="desk-grid-menu"
        tabindex="-1"
        role="menu"
        @mousedown.stop
        @keydown="onMenuKey"
      >
        <button
          v-for="(item, index) in menuItems"
          :key="item.id"
          type="button"
          class="desk-grid-menu-item"
          role="menuitemcheckbox"
          :class="{ on: menuIndex === index }"
          :aria-checked="item.checked"
          @mouseenter="menuIndex = index"
          @click="chooseMenu(item)"
        >
          <span class="desk-grid-menu-check">{{ item.checked ? '✓' : '' }}</span>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </div>
    <DeskHeaderColumnMenu
      v-if="headerMenu && headerMenuColumn"
      :header="headerMenuColumn.header"
      :x="headerMenu.x"
      :y="headerMenu.y"
      :show-filter="showFilter === true"
      :show-sort="headerMenuSortEnabled"
      :show-text-layout="headerMenuTextLayoutEnabled"
      :sort-active="mode === 'list' && sortColumn === headerMenu.id"
      :text-layout="columnLayout.effectiveTextLayout(headerMenu.id)"
      @filter="openHeaderFilterFromMenu"
      @sort="onHeaderMenuSort"
      @text-layout="onHeaderMenuTextLayout"
      @close="headerMenu = null"
    />
    <DeskHeaderFilter
      v-if="headerFilter && headerFilterColumn"
      :header="headerFilterColumn.header"
      :kind="headerFilterKind(headerFilterColumn.type)"
      :choices="headerFilterColumn.filterChoices"
      :value="filters[headerFilterColumn.id] ?? ''"
      :x="headerFilter.x"
      :y="headerFilter.y"
      @apply="applyHeaderFilter"
      @close="headerFilter = null"
    />
    <DeskBusy :active="loading === true" />
    <div class="footer">
      <template v-if="pageSizeOptions.length > 0">
        <DeskPageSizeSelect
          :options="pageSizeOptions"
          :model-value="pageSizeChoice ?? 20"
          @update:model-value="emit('update:pageSizeChoice', $event)"
        />
      </template>
      <span>{{ statusText }}</span>
      <template v-if="showPagerLinks">
        <a :class="{ disabled: (page ?? 1) <= 1 }" @click="emit('page', (page ?? 1) - 1)">Prev</a>
        <span>Page {{ page ?? 1 }} of {{ pageCount ?? 1 }}</span>
        <a :class="{ disabled: (page ?? 1) >= (pageCount ?? 1) }" @click="emit('page', (page ?? 1) + 1)">Next</a>
      </template>
      <span v-if="filterDraft" class="desk-filter-draft" role="status">
        Filter <strong>{{ filterDraftHeader }}</strong>: “{{ filterDraft.text }}” · <kbd>Enter</kbd> to filter · <kbd>Esc</kbd> to cancel
      </span>
      <span class="footer-end">
        <span v-if="refusal" class="desk-grid-refusal" role="status" data-desk-grid-refusal>{{ refusal }}</span>
        <slot v-else name="status">{{ loading ? 'Loading…' : hint }}</slot>
        <DeskGridLayoutMenu v-if="layoutDesigner" :state="layoutDesigner" @command="emit('layout', $event)" />
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, inject, nextTick, onMounted, onUnmounted, reactive, ref, useSlots, watch } from 'vue';
import { DESK_FORM_ISSUES } from '../form/issues';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { deskHost } from '../host';
import { plainText } from '../automation/text';
import { DESK_GRID_ROWS_MAX, deskGridRows } from './gridRows';
import { useDeskAutomationNode } from '../automation/registry';
import { shownText } from '../automation/visible';
import { pressDeskKey } from '../automation/keys';
import { beginDeskWork } from '../automation/busy';
import DeskCellBlocks from './DeskCellBlocks.vue';
import DeskGridRowActions from './DeskGridRowActions.vue';
import DeskGridLayoutMenu from './layout/DeskGridLayoutMenu.vue';
import type { DeskGridLayoutCommand, DeskGridLayoutMenuState } from './layout/types';
import { isDeskDialogTarget, type DeskBackDialog, type DeskCellTag, type DeskColumn, type DeskColumnTextLayout, type DeskCursor, type DeskGridApi, type DeskGridMode, type DeskGridOption, type DeskGridRow, type DeskGridSortAction, type DeskLookupConfig, type DeskNextFocus, type DeskRange, type DeskRowAction } from './types';
import { afterBlankMove, cellOpensOnEnter, cellText, columnOptions, currencyCaption, editorText, isReadonly, optionLabel, parseEditorValue, resolveColumnLookup, summaryValue, asNumber, typedCellValue } from './display';
import { isDeskBlankHit } from '../form/blank';
import { lookupField } from '../form/lookupField';
import { registerOpenEditor } from '../form/openEditors';
import { deskEditorMode, runLookupEditor, type DeskLookupEditorMode } from '../form/lookupEditor';
import { cellToTheLeft, resolveBackLanding, resolveCellEnter, resolveGridKey, type DeskNewRowAt, type DeskTabFlow, type GridKeyAction } from './keyboard';
import { resolveDrawerKey, type DrawerPlace } from './drawerKey';
import { footCellBottoms, footPinFits, scrollDeltaToClear } from './footPin';
import { clearRowData, emptyColumnValue } from './rows';
import { DESK_GRID_VIRTUAL_AT, deskGridWindow } from './window';
import { normalizeRange, parseTsv, rangeToTsv } from './clipboard';
import { useDeskTable } from './useDeskTable';
import { deskJumpLabel, pickToward, type DeskBox, type DeskDir, type DeskJumpStop } from '../focus/jump';
import { deskMoveDir, focusDeskField, focusDeskToward, focusFormSaveForField, focusNextDeskField, focusPrevDeskField, claimDeskKey, isClaimedDeskKey, isDeskJumpKey, isDeskTabKey, resolveDeskJump } from '../focus/useDeskFocus';
import { keyInputOf, toCombo } from '../keys/combo';
import { deskActionsFor, deskComboFor } from '../keys/deskKeymap';
import { deskActionsForGesture } from '../keys/pointerGestures';
import { autoDeskFieldId } from '../keys/layers';
import { useDeskFields, useDeskLayer } from '../keys/useDeskLayer';
import { readDeskPref, readDeskPrefOrLocal, writeDeskPref } from '../storage/deskPrefs';
import { formatDeskDecimal, placesFor } from '../currency/money';
import DeskHeaderColumnMenu from './DeskHeaderColumnMenu.vue';
import DeskHeaderFilter from './DeskHeaderFilter.vue';
import { formatCellTextForLayout, textLayoutClass } from './cellTextLayout';
import { columnSortMenuEnabled } from './listSort';
import { headerFilterKind } from './headerFilter';
import DeskPageSizeSelect from './DeskPageSizeSelect.vue';
import { pageSizeLabel, type DeskPageSize } from './pageSize';
import DeskMark from '../form/DeskMark.vue';
import DeskCellEditor from './editors/DeskCellEditor.vue';
import DeskLookupBox from '../form/DeskLookupBox.vue';
import DeskBusy from '../layout/DeskBusy.vue';
import { canReorderColumn, gridHasColumnGroups } from './deskColumnLayout';
import { useDeskColumnLayout } from './useDeskColumnLayout';
import { deskFontSizePercent } from '../theme/deskFontSize';

const rows = defineModel<DeskGridRow[]>('rows', { required: true });

const props = withDefaults(
  defineProps<{
    columns: DeskColumn[];
    mode?: DeskGridMode;
    loading?: boolean;
    showFilter?: boolean;
    /** Prev / page / next, including an entry grid that pages its rows. */
    showPager?: boolean;
    /** Extra class for a body row, for example a band shared by one document's lines. */
    rowClass?: (row: DeskGridRow) => string;
    /** A lighter cell frame and no fill handle, for a read-only report that moves by cell. */
    softCursor?: boolean;
    /**
     * How many rows under this one are free for a `spill` column's extra lines, such as a group
     * head's detail lines. Lines beyond the cell's own height draw into those rows instead of
     * making the row taller. 0 (default) keeps the cell in its own row.
     */
    spillRows?: (row: DeskGridRow, index: number) => number;
    /**
     * Values for the summary line, such as totals the server summed over every page. Each column
     * shows its own value through its `format`; columns without one stay empty. Replaces the
     * columns' `summary` sums of the rows on screen.
     */
    totals?: Record<string, unknown> | null;
    /** Text in the first empty cell of the `totals` line. */
    totalsLabel?: string;
    /**
     * More lines under the totals, drawn like it: each a record of values by column id, with its
     * label in `__label` (shown in the first column when that has no value), such as a total
     * without one product category.
     */
    footLines?: readonly Record<string, unknown>[];
    /**
     * The number in the first column. Default: position in the list, page included. A page that
     * groups rows (a header line and its detail lines) numbers the groups and leaves the rest blank.
     */
    rowNumber?: (row: DeskGridRow, index: number) => number | string;
    page?: number;
    pageCount?: number;
    /** Rows per page. List row numbers start at `(page - 1) * pageSize + 1`. 0 keeps numbers at 1. */
    pageSize?: number;
    /** When set, a page-size select is shown before the row count. */
    pageSizes?: readonly DeskPageSize[];
    pageSizeChoice?: DeskPageSize;
    /** Server row count for infinite-scroll status (`N of M rows`). */
    totalRowCount?: number | null;
    storageKey?: string;
    /** Saved layouts for the footer layout menu. The menu is not drawn without it. */
    layoutDesigner?: DeskGridLayoutMenuState | null;
    hint?: string;
    /** Column that must be filled before Enter starts another row. Defaults to the first column. */
    exitWhenBlank?: string;
    /**
     * When false, Enter on an empty gate cell or the last cell stays in the grid and adds a row.
     * A split dialog uses this so Enter never closes it.
     */
    exitOnBlank?: boolean;
    /** When this returns true, Enter on the last cell leaves the grid instead of adding a row. */
    blockNewRow?: () => boolean;
    /** Where to put focus when Enter leaves the grid. Return true when it took focus. */
    exitTo?: () => boolean;
    /**
     * Enter that finishes the rows lands on the first total line that can be changed, before the next field.
     * On a total line Enter then moves on (Shift+Enter back) and Ctrl+Enter runs the line's edit.
     * Off keeps Enter running the edit and only Arrow Down reaching the totals.
     */
    footEntry?: boolean;
    /**
     * Enter that leaves the grid jumps to the next section, the same place Ctrl+Enter goes.
     * Off unless a page wants that jump without the modifier.
     */
    enterJump?: boolean;
    /**
     * Ctrl+Arrow moves one cell, the same as Arrow, and at the edge continues into the
     * nearest cell of the next grid. On by default. Turn it off when this grid should stay one field.
     */
    ctrlArrows?: boolean;
    /**
     * A plain arrow that has no further cell continues into the nearest cell of the next grid,
     * the same place Ctrl+Arrow goes. Off unless the page stacks grids in one block.
     */
    arrowLeave?: boolean;
    /** Desk field to focus when Enter leaves the grid instead of adding a row. */
    exitField?: string;
    /** Column a section jump lands on. Defaults to `exitWhenBlank`, then the first column. */
    jumpColumn?: string;
    /** Field id in the page focus order. Omit for an automatic id. */
    fieldId?: string;
    /** `enter` (default): Tab does what Enter does. `field`: Tab leaves the grid for the next field. */
    tabFlow?: DeskTabFlow;
    /** Takes focus when the page or dialog opens, ahead of earlier fields. */
    initial?: boolean;
    /** Row the cursor lands on the first time the grid takes focus, such as the record already open. Later entries start at the top. */
    startRow?: number;
    /** Leave this grid out of the initial-focus pass. */
    disableAutoFocus?: boolean;
    /**
     * Lines under the items, such as discount and tax. Down from the last item
     * row moves here. Enter on a line with `edit` opens that dialog.
     */
    foot?: { id: string; edit?: string }[];
    /**
     * Never go below this many rows. Delete on the last of them clears the row
     * (including lookup ids) instead of removing it. 0 means rows can all be deleted.
     */
    minRows?: number;
    /**
     * Entry mode: whether Delete may remove (or, under `minRows`, clear) this row. Return `true` to allow it,
     * or the reason it is kept; the reason shows in the status line until the cursor moves.
     */
    rowDeletable?: (row: DeskGridRow, index: number) => true | string;
    /**
     * Entry mode. `end` (default) adds rows at the bottom. `start` keeps row 0 as the entry row:
     * when it is finished, Enter on its last cell inserts a new blank row above it, so the person
     * typing stays at the same place on screen.
     */
    newRowAt?: DeskNewRowAt;
    /** Builds a blank row. Use it when rows need more than the column defaults, such as document lines. */
    newRow?: () => DeskGridRow;
    /** Show the column list in the corner menu. Off when the page already decides which columns exist. */
    columnPicker?: boolean;
    /** Drag header edges to change column width. */
    resizeColumns?: boolean;
    /** Drag middle column headers to reorder. Respects `DeskColumn.pin`. Off when any column has `group`. */
    reorderColumns?: boolean;
    /** Extra toggles in the corner menu. The page owns the checked state. */
    options?: DeskGridOption[];
    /** When set, the status line counts these items instead of every row. */
    itemCount?: number | null;
    /** What `itemCount` counts, as `[one, many]`, such as a report paged by party. Default items. */
    itemNoun?: readonly [string, string] | null;
    /** Column id currently sorted on the server. */
    sortColumn?: string;
    sortDescending?: boolean;
    /**
     * Text the filter boxes start with, by column id. A saved layout view sets this. Typing still
     * emits `filter`. A new object replaces what the boxes hold.
     */
    filterValues?: Record<string, string> | undefined;
    /** Without it the actions column is not drawn. */
    rowActions?: ((row: DeskGridRow) => DeskRowAction[]) | undefined;
    /**
     * Where Enter goes from a cell. A target replaces the column's `enter`.
     * `null` moves to the next cell. `undefined` keeps the column's `enter`.
     */
    onNextFocus?: DeskNextFocus;
    /**
     * Shift+Enter lands on the previous cell. `select` (default) only moves there.
     * `when` asks that column's own `when`. A column's `enter.back` wins.
     */
    backDialog?: DeskBackDialog;
    /** When this returns true for the cursor row, the drawer slot is shown under that row. */
    drawerFor?: (row: DeskGridRow) => boolean;
    /**
     * `cursor` (default) shows the drawer under the current item row while that row is active.
     * It closes when focus leaves the grid or moves to the totals.
     * `all` keeps a drawer under every row `drawerFor` allows, including after focus leaves.
     */
    drawerRows?: 'cursor' | 'all';
    /** Stable row key. Defaults to `row.id`, then the row index. */
    rowKey?: (row: DeskGridRow) => string;
    /**
     * `cell` (default) puts the cursor on one cell. `row` selects the whole row: Up and Down move rows,
     * Left and Right scroll, Enter emits `open`, and the open-dialog shortcut emits `open-page`.
     */
    selection?: 'cell' | 'row';
    /** Ctrl+F (`action-filter`) moves to the filter row of a list grid. Off when the page has its own filter panel. */
    filterShortcut?: boolean;
    /** Columns share the grid width, so the table does not scroll sideways. Text that does not fit is cut with an ellipsis. */
    fitWidth?: boolean;
    /** Passive read-only display: report-like cells, no focus, keyboard, or desk field. */
    displayOnly?: boolean;
    /** Name in the automation tree. Defaults to `fieldId`. A repeated grid on a page must have one of the two. */
    name?: string;
  }>(),
  {
    mode: 'entry',
    displayOnly: false,
    selection: 'cell',
    filterShortcut: true,
    fitWidth: false,
    loading: false,
    showFilter: false,
    softCursor: false,
    totals: null,
    totalsLabel: 'Total',
    footLines: () => [],
    showPager: false,
    page: 1,
    pageCount: 1,
    pageSize: 0,
    totalRowCount: null,
    storageKey: '',
    hint: 'Enter moves right · F2 edit · Ctrl+C/V · Ctrl+D fill',
    exitWhenBlank: '',
    exitOnBlank: true,
    enterJump: false,
    footEntry: false,
    ctrlArrows: true,
    arrowLeave: false,
    exitField: '',
    jumpColumn: '',
    fieldId: '',
    tabFlow: 'enter',
    initial: false,
    disableAutoFocus: false,
    minRows: 0,
    newRowAt: 'end',
    backDialog: 'select',
    columnPicker: true,
    resizeColumns: true,
    reorderColumns: false,
    options: () => [],
    itemCount: null,
    itemNoun: null,
    sortColumn: '',
    sortDescending: true,
    foot: () => [],
    drawerRows: 'cursor',
  },
);

const emit = defineEmits<{
  open: [row: DeskGridRow];
  'edit-record': [row: DeskGridRow];
  'open-page': [row: DeskGridRow];
  change: [payload: { row: number; columnId: string; value: unknown; record: DeskGridRow }];
  page: [page: number];
  more: [];
  fit: [rows: number];
  'update:pageSizeChoice': [choice: DeskPageSize];
  filter: [filters: Record<string, string>];
  sort: [columnId: string, action?: DeskGridSortAction];
  action: [payload: { name: string; row: DeskGridRow }];
  dialog: [payload: { dialog: string; row: DeskGridRow; rowIndex: number; columnId: string }];
  'create-lookup': [payload: { columnId: string; rowIndex: number }];
  lookup: [payload: { columnId: string; rowIndex: number; record: Record<string, unknown>; row: DeskGridRow }];
  cursor: [payload: { rowIndex: number; columnId: string; record: DeskGridRow }];
  exit: [];
  foot: [edit: string];
  option: [id: string];
  /** Hidden column ids, once after the saved choice loads and on each toggle. */
  'update:hidden': [ids: string[]];
  layout: [command: DeskGridLayoutCommand];
}>();

/** Keep the table foot at the bottom of the scroller, with a blank pad above it. */
const footPinned = defineModel<boolean>('pinFoot', { default: false });

/** Columns the user hid. */
const userHidden = ref<Set<string>>(new Set());
/** Columns marked `defaultHidden` that the user chose to show. */
const userShown = ref<Set<string>>(new Set());
/** Hidden prefs have loaded; `update:hidden` follows every change after that. */
const hiddenLoaded = ref(false);
const hidden = computed((): Set<string> => {
  const next = new Set(userHidden.value);
  for (const column of props.columns) {
    if (column.defaultHidden && !column.locked && !userShown.value.has(column.id)) next.add(column.id);
  }
  return next;
});
const hiddenKey = computed(() => [...hidden.value].sort().join('|'));
watch(hiddenKey, () => {
  if (hiddenLoaded.value) emit('update:hidden', [...hidden.value]);
});
const filters = reactive<Record<string, string>>({ ...props.filterValues });
const headerFilter = ref<{ id: string; x: number; y: number } | null>(null);
const headerMenu = ref<{ id: string; x: number; y: number } | null>(null);
const settingsOpen = ref(false);
const menuEl = ref<HTMLElement | null>(null);
const menuIndex = ref(0);
const cursor = ref<DeskCursor>({ row: 0, col: 0 });
/** Row to land on after a list page change. Cleared when the new rows arrive or the user clicks. */
const pendingCursor = ref<{ row: number | 'last'; col: number } | null>(null);
/** Index into `foot` when the cursor is on a total line. Null while it is on an item row. */
const footIndex = ref<number | null>(null);
const range = ref<DeskRange | null>(null);
const editing = ref(false);
const gridActive = ref(false);
/** A row action button has focus, so the cell square is hidden and the button is the cursor. */
const actionFocus = ref(false);
const editSelectAll = ref(true);
const draft = ref('');
/** The character that opened a lookup. It is a search, not a saved cell value. */
const lookupSeed = ref('');
/** Cell value when editing started, so Enter can tell a real change from a re-commit. */
let editStart: unknown;
const lookupPick = ref<Record<string, unknown> | null>(null);
const selectedRows = ref<Set<number>>(new Set());
const scroller = ref<HTMLElement | null>(null);
const gridId = props.fieldId || autoDeskFieldId('grid');

/** The form around the grid: a server refusal under the grid's field id steps aside once the user edits the grid (as a settings row's does). */
const formIssues = inject(DESK_FORM_ISSUES, null);
function userEdited(): void {
  if (props.fieldId) formIssues?.edited(props.fieldId);
}
/** A cell the user changed: tell the page, and the form. */
function changed(payload: { row: number; columnId: string; value: unknown; record: DeskGridRow }): void {
  emit('change', payload);
  userEdited();
}
const displayOnly = computed(() => props.displayOnly === true);

const focusAttrs = computed(() => {
  const attrs: Record<string, string> = {};
  if (props.initial) attrs['data-desk-initial'] = '';
  if (props.disableAutoFocus) attrs['data-desk-noauto'] = '';
  return attrs;
});

const scrollerFieldAttrs = computed(() => {
  const attrs: Record<string, string> = { ...focusAttrs.value };
  if (displayOnly.value) return attrs;
  attrs.tabindex = '0';
  attrs['data-desk-field'] = gridId;
  attrs['data-desk-entry'] = '';
  return attrs;
});
const square = reactive({
  visible: false,
  bottom: 0,
  left: 0,
  style: {} as Record<string, string>,
});

const columnsRef = computed(() => props.columns);
const storageKeyRef = computed(() => props.storageKey);
const columnLayout = useDeskColumnLayout({ columns: columnsRef, storageKey: storageKeyRef });
const reorderEnabled = computed(() => props.reorderColumns && !gridHasColumnGroups(props.columns));

const visibleColumns = computed(() =>
  columnLayout.layoutColumns.value.filter(
    (column) => (column.locked === true || !hidden.value.has(column.id)) && (column.visible ? column.visible() : true),
  ),
);

const resizing = ref<{ id: string; startX: number; startWidth: number } | null>(null);
const columnDrag = ref<{ id: string; overBefore: string | null | undefined } | null>(null);

function columnById(id: string): DeskColumn | undefined {
  return props.columns.find((item) => item.id === id);
}

function headerResizeEnabled(isPlaceholder: boolean): boolean {
  return props.resizeColumns && !isPlaceholder;
}

function headerReorderEnabled(isPlaceholder: boolean, columnId: string): boolean {
  if (isPlaceholder || !reorderEnabled.value) return false;
  return canReorderColumn(columnById(columnId));
}

function onResizeStart(columnId: string, event: MouseEvent): void {
  if (!props.resizeColumns) return;
  resizing.value = {
    id: columnId,
    startX: event.clientX,
    startWidth: columnLayout.effectiveWidth(columnId),
  };
  document.body.classList.add('desk-col-resizing');
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
  event.preventDefault();
}

function onResizeMove(event: MouseEvent): void {
  const state = resizing.value;
  if (!state) return;
  // Saved widths are at 100%; the pointer moves in scaled pixels.
  columnLayout.setWidth(state.id, state.startWidth + (event.clientX - state.startX) / uiScale.value);
}

function onResizeEnd(): void {
  resizing.value = null;
  document.body.classList.remove('desk-col-resizing');
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
}

function dropTargetFromPoint(clientX: number, clientY: number): string | null | undefined {
  const el = document.elementFromPoint(clientX, clientY);
  const cell = el?.closest<HTMLElement>('[data-desk-col-id]');
  if (!cell) return undefined;
  const id = cell.dataset.deskColId;
  if (!id || !canReorderColumn(columnById(id))) return undefined;
  const rect = cell.getBoundingClientRect();
  const before = clientX < rect.left + rect.width / 2;
  if (before) return id;
  const middle = middleColumnIdsFromLayout();
  const index = middle.indexOf(id);
  if (index < 0) return undefined;
  return middle[index + 1] ?? null;
}

function middleColumnIdsFromLayout(): string[] {
  return columnLayout.layoutColumns.value.filter((column) => canReorderColumn(column)).map((column) => column.id);
}

function onColumnDragStart(columnId: string, event: MouseEvent): void {
  if (!headerReorderEnabled(false, columnId)) return;
  columnDrag.value = { id: columnId, overBefore: undefined };
  document.body.classList.add('desk-col-dragging');
  document.addEventListener('mousemove', onColumnDragMove);
  document.addEventListener('mouseup', onColumnDragEnd);
  event.preventDefault();
}

function onColumnDragMove(event: MouseEvent): void {
  const drag = columnDrag.value;
  if (!drag) return;
  drag.overBefore = dropTargetFromPoint(event.clientX, event.clientY);
}

function onColumnDragEnd(): void {
  const drag = columnDrag.value;
  if (drag && drag.overBefore !== undefined) columnLayout.moveColumn(drag.id, drag.overBefore);
  columnDrag.value = null;
  document.body.classList.remove('desk-col-dragging');
  document.removeEventListener('mousemove', onColumnDragMove);
  document.removeEventListener('mouseup', onColumnDragEnd);
}

function isDropBefore(columnId: string): boolean {
  return columnDrag.value?.overBefore === columnId;
}

// A new array, so a row added or removed in place shows at once. The table keeps its old
// rows when it is handed the same array again.
const sortedView = computed(() => rows.value.slice());
const { headerGroups, rows: tableRows } = useDeskTable(visibleColumns, sortedView, props.mode !== 'entry');

const orderedRows = computed(() => tableRows.value.map((row) => row.original));
const slots = useSlots();

function showDrawer(row: DeskGridRow | undefined, index: number): boolean {
  if (!row || !slots.drawer || !props.drawerFor) return false;
  if (props.drawerRows !== 'all' && (!rowDrawerOpen() || index !== cursor.value.row)) return false;
  return props.drawerFor(row);
}

/** Cursor mode follows the active item row. Totals and a grid that lost focus close it. `all` does not. */
function rowDrawerOpen(): boolean {
  return props.drawerRows === 'all' || (gridActive.value && footIndex.value === null);
}

function onDrawerFocus(index: number): void {
  if (cursor.value.row === index && footIndex.value === null) return;
  void moveTo(index, cursor.value.col, false);
}

const uiScale = computed(() => deskFontSizePercent.value / 100);

const virtualizer = useVirtualizer(
  computed(() => {
    const open = rowDrawerOpen();
    const at = cursor.value.row;
    return {
      count: orderedRows.value.length,
      getScrollElement: () => scroller.value,
      estimateSize: (index: number) => {
        void open;
        void at;
        const row = orderedRows.value[index];
        if (row && showDrawer(row, index)) return Math.round(100 * uiScale.value);
        return Math.round(rowHeightEstimate(row) * uiScale.value);
      },
      overscan: 12,
    };
  }),
);

const gridWindow = computed(() => {
  const count = orderedRows.value.length;
  const virtual = count < DESK_GRID_VIRTUAL_AT ? [] : virtualizer.value.getVirtualItems();
  return deskGridWindow({
    count,
    cursor: cursor.value.row,
    virtual: virtual.map((item) => ({ index: item.index, start: item.start, end: item.end })),
    totalSize: count < DESK_GRID_VIRTUAL_AT ? 0 : virtualizer.value.getTotalSize(),
  });
});

const windowRows = computed(() =>
  gridWindow.value.indexes.flatMap((index) => {
    const row = orderedRows.value[index];
    if (!row) return [];
    return [{ row, index, key: props.rowKey ? props.rowKey(row) : String(row.id ?? index) }];
  }),
);

const activeColumn = computed(() => visibleColumns.value[cursor.value.col] ?? null);
const activeLookup = computed(() => {
  const column = activeColumn.value;
  if (!column) return undefined;
  return resolveColumnLookup(column, rowAt(cursor.value.row));
});
const lookupSelected = computed((): Record<string, unknown>[] => {
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (!column?.multiple || !column.selected || !row) return [];
  return [...column.selected(row)];
});
const hasSummary = computed(() => (props.totals ? true : visibleColumns.value.some((column) => column.summary)));

/** The `totals` line: each column's own value, and the label in the first column when it has none. */
const totalsText = computed((): Map<string, string> | null => {
  const totals = props.totals;
  if (!totals) return null;
  const out = new Map<string, string>();
  visibleColumns.value.forEach((column, index) => {
    const value = totals[column.id];
    const text = value === undefined || value === null ? '' : column.format ? column.format(value, totals as DeskGridRow) : String(value as string | number);
    out.set(column.id, !text && index === 0 ? (props.totalsLabel ?? '') : text);
  });
  return out;
});

/** The `footLines`, as the totals line draws them. */
const footTexts = computed((): Map<string, string>[] =>
  (props.footLines ?? []).map((line) => {
    const out = new Map<string, string>();
    visibleColumns.value.forEach((column, index) => {
      const value = line[column.id];
      const text = value === undefined || value === null ? '' : column.format ? column.format(value, line as DeskGridRow) : String(value as string | number);
      const label = typeof line.__label === 'string' ? line.__label : '';
      out.set(column.id, !text && index === 0 ? label : text);
    });
    return out;
  }),
);

interface GridMenuItem {
  id: string;
  label: string;
  checked: boolean;
  kind: 'pin' | 'option' | 'column';
}

const menuItems = computed((): GridMenuItem[] => {
  const items: GridMenuItem[] = [];
  if (slots.foot) items.push({ id: 'pin-foot', label: 'Pin totals', checked: footPinned.value === true, kind: 'pin' });
  for (const option of props.options) {
    items.push({ id: option.id, label: option.label, checked: option.checked, kind: 'option' });
  }
  if (props.columnPicker) {
    for (const column of props.columns) {
      if (column.locked) continue;
      items.push({ id: `column:${column.id}`, label: column.header, checked: !hidden.value.has(column.id), kind: 'column' });
    }
  }
  return items;
});
const hasMenu = computed(() => !displayOnly.value && menuItems.value.length > 0);

function toggleMenu(): void {
  settingsOpen.value = !settingsOpen.value;
}

function chooseMenu(item: GridMenuItem): void {
  if (item.kind === 'pin') footPinned.value = !footPinned.value;
  else if (item.kind === 'option') emit('option', item.id);
  else toggleColumn(item.id.slice('column:'.length));
}

function onMenuKey(event: KeyboardEvent): void {
  claimDeskKey(event);
  const items = menuItems.value;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    menuIndex.value = Math.min(items.length - 1, menuIndex.value + 1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    menuIndex.value = Math.max(0, menuIndex.value - 1);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const item = items[menuIndex.value];
    if (item) chooseMenu(item);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    settingsOpen.value = false;
    focusGrid();
  }
}

watch(settingsOpen, (open) => {
  if (!open) return;
  menuIndex.value = 0;
  void nextTick(() => menuEl.value?.focus());
});
const padHeight = ref(0);
const padSpan = computed(() => visibleColumns.value.length + 1 + (props.rowActions ? 1 : 0));
const pageSizeOptions = computed(() => props.pageSizes ?? []);

const showPagerLinks = computed(() => {
  if (!(props.mode === 'list' || props.showPager)) return false;
  const choice = props.pageSizeChoice;
  if (choice === 'infinite' || choice === 'all') return false;
  return true;
});

const statusText = computed(() => {
  if (props.totalRowCount !== null && props.totalRowCount !== undefined && props.pageSizeChoice === 'infinite') {
    const total = props.totalRowCount;
    const loaded = rows.value.length;
    return total === 1 ? '1 of 1 row' : `${loaded.toLocaleString()} of ${total.toLocaleString()} rows`;
  }
  const total = props.itemCount;
  if (total === null || total === undefined) {
    const n = rows.value.length;
    return n === 1 ? '1 row' : `${n.toLocaleString()} rows`;
  }
  const [one, many] = props.itemNoun ?? ['item', 'items'];
  if (total === 0) return `0 ${many}`;
  if (total === 1) return `1 ${one}`;
  const paged = (props.mode === 'list' || props.showPager) && props.pageSizeChoice !== 'all';
  const limit = props.pageSize > 0 ? props.pageSize : 0;
  if (paged && limit > 0) {
    const pageNo = props.page ?? 1;
    const start = (pageNo - 1) * limit + 1;
    const end = Math.min(pageNo * limit, total);
    return `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} ${many}`;
  }
  return `${total.toLocaleString()} ${many}`;
});

let dynamicFitSent = false;
let dynamicResizeObs: ResizeObserver | null = null;
let dynamicResizeTimer: ReturnType<typeof setTimeout> | null = null;

function measureDynamicFit(force = false): void {
  if (props.pageSizeChoice !== 'dynamic' || (dynamicFitSent && !force)) return;
  if (rows.value.length === 0) return;
  const host = scroller.value;
  if (!host) return;
  const bodyRow = host.querySelector<HTMLTableRowElement>('tbody tr:not(.desk-pad-row)');
  if (!bodyRow) return;
  const rowHeight = bodyRow.getBoundingClientRect().height;
  if (rowHeight <= 0) return;
  const thead = host.querySelector('thead');
  const filterRow = host.querySelector('tr.column-filter');
  let chrome = thead?.getBoundingClientRect().height ?? 0;
  if (filterRow) chrome += filterRow.getBoundingClientRect().height;
  const available = Math.max(0, host.clientHeight - chrome);
  const fit = Math.max(1, Math.floor(available / rowHeight) - 1);
  dynamicFitSent = true;
  emit('fit', fit);
}

function scheduleDynamicRemeasure(): void {
  if (dynamicResizeTimer) clearTimeout(dynamicResizeTimer);
  dynamicResizeTimer = setTimeout(() => {
    dynamicResizeTimer = null;
    measureDynamicFit(true);
  }, 120);
}

function syncDynamicResizeObserver(): void {
  const host = scroller.value;
  if (props.pageSizeChoice !== 'dynamic' || !host) {
    dynamicResizeObs?.disconnect();
    dynamicResizeObs = null;
    return;
  }
  if (dynamicResizeObs) return;
  dynamicResizeObs = new ResizeObserver(() => scheduleDynamicRemeasure());
  dynamicResizeObs.observe(host);
}

function onScrollerScroll(): void {
  if (props.pageSizeChoice !== 'infinite' || props.loading) return;
  const host = scroller.value;
  if (!host) return;
  const remaining = host.scrollHeight - host.scrollTop - host.clientHeight;
  const row = host.querySelector<HTMLTableRowElement>('tbody tr:not(.desk-pad-row)');
  const threshold = row ? row.getBoundingClientRect().height * 2 : 80;
  if (remaining <= threshold) emit('more');
}

function setFootCell(cell: HTMLTableCellElement, bottom: number | null): void {
  if (bottom === null) {
    cell.style.position = '';
    cell.style.bottom = '';
    cell.style.zIndex = '';
    return;
  }
  const next = `${bottom}px`;
  if (cell.style.position !== 'sticky') cell.style.position = 'sticky';
  if (cell.style.bottom !== next) cell.style.bottom = next;
  if (cell.style.zIndex !== '4') cell.style.zIndex = '4';
}

/** The pinned totals stick now: pinned, and the grid has room for a body row above them (`footPinFits`). */
const footSticks = ref(false);

/** Stick the whole totals block, from the first footer line through the last, plus any rowspan beside it. */
function pinFootRows(): void {
  const host = scroller.value;
  const foot = host?.querySelector('tfoot');
  if (!host || !foot) {
    footSticks.value = false;
    return;
  }
  const rows = [...foot.querySelectorAll<HTMLTableRowElement>(':scope > tr')];
  const head = host.querySelector('thead')?.getBoundingClientRect().height ?? 0;
  const bodyRow = host.querySelector('tbody tr:not(.desk-pad)')?.getBoundingClientRect().height || 24;
  footSticks.value = footPinned.value && footPinFits(host.clientHeight, head, foot.getBoundingClientRect().height, bodyRow);
  if (!footSticks.value) {
    rows.forEach((row) => {
      for (const cell of row.cells) setFootCell(cell, null);
    });
    return;
  }
  const bottoms = footCellBottoms(
    rows.map((row) => ({
      height: row.getBoundingClientRect().height,
      spans: [...row.cells].map((cell) => (cell.rowSpan > 1 ? cell.rowSpan : 1)),
    })),
  );
  rows.forEach((row, index) => {
    const line = bottoms[index] ?? [];
    [...row.cells].forEach((cell, cellIndex) => setFootCell(cell, line[cellIndex] ?? 0));
  });
}

function syncPad(): void {
  pinFootRows();
  const host = scroller.value;
  if (!footSticks.value || !host || orderedRows.value.length >= DESK_GRID_VIRTUAL_AT) {
    padHeight.value = 0;
    return;
  }
  const thead = host.querySelector('thead')?.getBoundingClientRect().height ?? 0;
  const tfoot = host.querySelector('tfoot')?.getBoundingClientRect().height ?? 0;
  let body = 0;
  host.querySelectorAll<HTMLElement>('tbody tr:not(.desk-pad)').forEach((row) => {
    body += row.getBoundingClientRect().height;
  });
  const next = Math.max(0, Math.floor(host.clientHeight - thead - body - tfoot));
  if (next !== padHeight.value) padHeight.value = next;
}

function headerLabel(header: { column: { columnDef: { header?: unknown } } }): string {
  const value = header.column.columnDef.header;
  return typeof value === 'string' ? value : '';
}

function columnHasDialog(id: string): boolean {
  const column = visibleColumns.value.find((item) => item.id === id);
  return Boolean(column?.enter && isDeskDialogTarget(column.enter));
}

function headerClass(id: string, placeholder: boolean, groupIndex: number): string[] {
  const column = visibleColumns.value.find((item) => item.id === id);
  return [
    groupIndex === 0 && column?.group ? 'group-head' : '',
    !placeholder && gridActive.value && activeColumn.value?.id === id ? 'focus' : '',
    column ? alignClass(column) : '',
  ];
}

function alignClass(column: DeskColumn): string {
  if (column.align === 'right' || column.type === 'number' || column.type === 'currency') return 'align-right';
  if (column.align === 'center' || column.type === 'check') return 'align-center';
  return '';
}

function colStyle(id: string): Record<string, string> {
  const width = columnLayout.effectiveWidth(id);
  if (props.fitWidth) {
    const total = visibleColumns.value.reduce((sum, column) => sum + columnLayout.effectiveWidth(column.id), 0) || 1;
    // The row-number column keeps its own width. These shares use only what is left, so the last column stays in view.
    return { width: `calc((100% - var(--desk-index-width)) * ${width / total})` };
  }
  const scaled = Math.round(width * uiScale.value);
  return { width: `${scaled}px`, minWidth: `${scaled}px`, maxWidth: `${scaled}px` };
}

/** Rows a `spill` column's cell may draw into below this row. */
function spillOf(row: DeskGridRow | undefined, column: DeskColumn, index: number): number {
  if (!row || !column.spill || !props.spillRows) return 0;
  return Math.max(0, Math.floor(props.spillRows(row, index)));
}

function spanOf(row: DeskGridRow | undefined, column: DeskColumn, index: number): number {
  if (!row || !column.rowspan) return 1;
  return column.rowspan(row, index);
}

function errorOf(row: DeskGridRow | undefined, column: DeskColumn): string | null {
  if (!row || !column.error) return null;
  return column.error(row);
}

/** Search or dropdown, for a cell that opens one when you edit it. */
function markOf(column: DeskColumn, row: DeskGridRow | undefined): 'search' | 'select' | null {
  if (!row || props.mode !== 'entry' || isReadonly(column, row)) return null;
  const kind = column.editor || column.type;
  if (kind === 'lookup' || column.lookup) return 'search';
  if (kind === 'select' || kind === 'check') return 'select';
  return null;
}

function cellCheckOf(column: DeskColumn, row: DeskGridRow | undefined): 'full' | 'partial' | null {
  if (!row || !column.cellCheck) return null;
  return column.cellCheck(row);
}

function cellClass(row: DeskGridRow | undefined, column: DeskColumn, rowIndex: number, colIndex: number): string[] {
  const classes = [alignClass(column)];
  if (column.textLayoutMenu) classes.push(textLayoutClass(columnLayout.effectiveTextLayout(column.id)));
  if (column.quiet) classes.push('is-quiet');
  if (column.repeats && repeatInfo.value?.repeated.get(column.id)?.has(rowIndex)) classes.push(`is-repeat-${column.repeats}`);
  if (column.zeros && row && asNumber(row[column.id]) === 0) classes.push(`is-zero-${column.zeros}`);
  const tone = row && column.cellTone ? column.cellTone(row) : null;
  if (tone) classes.push(`is-cell-tone-${tone}`);
  if (row && spillOf(row, column, rowIndex) > 0) classes.push('is-spill');
  if (!row) return classes;
  const mark = markOf(column, row);
  if (mark === 'search') classes.push('marker-lookup');
  if (mark === 'select') classes.push('marker-select');
  if (errorOf(row, column)) classes.push('cell-error');
  if (column.blocks || captionOf(column, row) || tagsOf(column, row).length) classes.push('desk-cell-stack');
  if (row.__group === true) classes.push('group-row');
  if (gridActive.value && rowIndex === cursor.value.row && colIndex === cursor.value.col) classes.push('cell-cursor');
  const box = gridActive.value ? range.value : null;
  if (box) {
    const boxRange = normalizeRange(box.r1, box.c1, box.r2, box.c2);
    if (rowIndex >= boxRange.top && rowIndex <= boxRange.bottom && colIndex >= boxRange.left && colIndex <= boxRange.right) {
      classes.push('in-range');
    }
  }
  return classes;
}

function captionOf(column: DeskColumn, row: DeskGridRow | undefined): string {
  if (!row || column.blocks) return '';
  if (column.caption) return column.caption(row);
  if (column.captionField) {
    const value = row[column.captionField];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }
  return currencyCaption(column, row);
}

function tagsOf(column: DeskColumn, row: DeskGridRow | undefined): DeskCellTag[] {
  if (!row || !column.detail) return [];
  return column.detail(row);
}

function summaryText(column: DeskColumn): string {
  if (totalsText.value) return totalsText.value.get(column.id) ?? '';
  if (!column.summary) return '';
  const values = orderedRows.value
    .map((row) => asNumber(row[column.id]))
    .filter((value): value is number => value !== null);
  const total = summaryValue(column.summary, values);
  if (column.summary === 'count') return String(total);
  // Rows on one page can mix currencies, so the sum is plain document amounts in money places.
  return formatDeskDecimal(total, placesFor(column.decimals ?? 'money'));
}

const headerFilterColumn = computed(() => props.columns.find((column) => column.id === headerFilter.value?.id) ?? null);
const headerMenuColumn = computed(() => props.columns.find((column) => column.id === headerMenu.value?.id) ?? null);
const headerMenuSortEnabled = computed(() => columnSortMenuEnabled(props.mode, headerMenuColumn.value));
const headerMenuTextLayoutEnabled = computed(() => headerMenuColumn.value?.textLayoutMenu === true);

function columnDef(id: string): DeskColumn | undefined {
  return props.columns.find((column) => column.id === id);
}

function headerContextMenuEnabled(id: string): boolean {
  const column = columnDef(id);
  if (props.showFilter) return true;
  if (columnSortMenuEnabled(props.mode, column)) return true;
  return column?.textLayoutMenu === true;
}

function onHeaderClick(
  header: { isPlaceholder: boolean; column: { id: string } },
): void {
  if (displayOnly.value || header.isPlaceholder || props.mode !== 'list') return;
  if (columnSortMenuEnabled(props.mode, columnDef(header.column.id))) {
    emit('sort', header.column.id);
  }
}

function onHeaderMenu(header: { isPlaceholder: boolean; column: { id: string } }, event: MouseEvent): void {
  if (displayOnly.value || header.isPlaceholder || !headerContextMenuEnabled(header.column.id)) return;
  event.preventDefault();
  settingsOpen.value = false;
  headerFilter.value = null;
  headerMenu.value = { id: header.column.id, x: event.clientX, y: event.clientY };
}

function openHeaderFilter(id: string, event: MouseEvent): void {
  if (!props.showFilter) return;
  event.preventDefault();
  settingsOpen.value = false;
  headerMenu.value = null;
  headerFilter.value = { id, x: event.clientX, y: event.clientY };
}

function openHeaderFilterFromMenu(): void {
  const menu = headerMenu.value;
  if (!menu || !props.showFilter) return;
  headerMenu.value = null;
  headerFilter.value = { id: menu.id, x: menu.x, y: menu.y };
}

function onHeaderMenuSort(action: DeskGridSortAction): void {
  const id = headerMenu.value?.id;
  headerMenu.value = null;
  if (!id) return;
  emit('sort', id, action);
}

function onHeaderMenuTextLayout(layout: DeskColumnTextLayout): void {
  const id = headerMenu.value?.id;
  if (!id) return;
  columnLayout.setTextLayout(id, layout);
}

/** A one-line row is 28px; every further block line adds a caption-size line. */
function rowHeightEstimate(row: DeskGridRow | undefined): number {
  if (!row) return 28;
  let lines = 1;
  for (const column of visibleColumns.value) {
    if (column.lineCount) lines = Math.max(lines, column.lineCount(row));
  }
  return 28 + (lines - 1) * 14;
}

/**
 * Cells equal to the row above in `repeats` columns, chained left to right, and the rows where
 * the leftmost such column changes (a new block). Null when no column asks for it.
 */
const repeatInfo = computed((): { repeated: Map<string, Set<number>>; blockStart: Set<number> } | null => {
  const columns = visibleColumns.value.filter((column) => column.repeats);
  if (!columns.length) return null;
  const repeated = new Map(columns.map((column) => [column.id, new Set<number>()]));
  const blockStart = new Set<number>();
  let previous: string[] | null = null;
  orderedRows.value.forEach((row, index) => {
    const texts = columns.map((column) => cellText(column, row));
    let chain = previous !== null;
    columns.forEach((column, at) => {
      if (chain && texts[at] === previous![at]) repeated.get(column.id)!.add(index);
      else chain = false;
    });
    if (previous === null || texts[0] !== previous[0]) blockStart.add(index);
    previous = texts;
  });
  return { repeated, blockStart };
});

function cellTextFull(column: DeskColumn, row: DeskGridRow | undefined): string {
  if (!row) return '';
  return optionLabel(column, row);
}

function cellDisplay(column: DeskColumn, row: DeskGridRow | undefined): string {
  const text = cellTextFull(column, row);
  if (!column.textLayoutMenu) return text;
  return formatCellTextForLayout(text, columnLayout.effectiveTextLayout(column.id), columnLayout.effectiveWidth(column.id));
}

function cellTitle(column: DeskColumn, row: DeskGridRow | undefined): string {
  const err = errorOf(row, column);
  if (err) return err;
  if (!column.textLayoutMenu) return '';
  const layout = columnLayout.effectiveTextLayout(column.id);
  if (layout === 'wrap') return '';
  return cellTextFull(column, row);
}

watch(
  () => props.filterValues,
  (next) => {
    cancelFilterDraft();
    for (const id of Object.keys(filters)) delete filters[id];
    Object.assign(filters, next ?? {});
  },
);

function applyHeaderFilter(text: string): void {
  const id = headerFilter.value?.id;
  headerFilter.value = null;
  if (!id) return;
  cancelFilterDraft();
  filters[id] = text;
  emit('filter', { ...filters });
}

function toggleColumn(id: string): void {
  const startsHidden = props.columns.some((column) => column.id === id && column.defaultHidden);
  const hiddenNow = new Set(userHidden.value);
  const shownNow = new Set(userShown.value);
  if (hidden.value.has(id)) {
    hiddenNow.delete(id);
    if (startsHidden) shownNow.add(id);
  } else if (startsHidden) {
    shownNow.delete(id);
  } else {
    hiddenNow.add(id);
  }
  userHidden.value = hiddenNow;
  userShown.value = shownNow;
  if (!props.storageKey) return;
  void writeDeskPref(`grid-columns:${props.storageKey}`, [...hiddenNow]);
  void writeDeskPref(`grid-shown:${props.storageKey}`, [...shownNow]);
}

function rowAt(index: number): DeskGridRow | undefined {
  return orderedRows.value[index];
}

/** Scroll a body cell, and the drawer under it, out from under the sticky header or the pinned totals. */
function revealPastPinned(node: HTMLElement): void {
  const host = scroller.value;
  if (!host) return;
  const hostBox = host.getBoundingClientRect();
  const cell = node.getBoundingClientRect();
  const row = node.closest('tr');
  const next = row?.nextElementSibling;
  const drawer = next instanceof HTMLElement && next.classList.contains('desk-row-drawer') ? next.getBoundingClientRect() : null;
  const header = host.querySelector('thead')?.getBoundingClientRect().height ?? 0;
  const coveredByFoot = footSticks.value && !node.closest('tfoot');
  const footer = coveredByFoot ? (host.querySelector('tfoot')?.getBoundingClientRect().height ?? 0) : 0;
  host.scrollTop += scrollDeltaToClear(cell.top, drawer?.bottom ?? cell.bottom, hostBox.top + header, hostBox.bottom - footer);
  revealPastStickyStart(node, host, hostBox);
}

/** Scroll left until the cell is not under the row-number cell or a pinned start column in its row. */
function revealPastStickyStart(node: HTMLElement, host: HTMLElement, hostBox: DOMRect): void {
  const row = node.closest('tr');
  if (!row || getComputedStyle(node).position === 'sticky') return;
  let covered = hostBox.left;
  for (const sibling of Array.from(row.children)) {
    if (sibling === node) break;
    if (!(sibling instanceof HTMLElement) || getComputedStyle(sibling).position !== 'sticky') continue;
    covered = Math.max(covered, sibling.getBoundingClientRect().right);
  }
  const left = node.getBoundingClientRect().left;
  if (left < covered) host.scrollLeft -= covered - left;
}

function placeSquare(): void {
  const lines = props.foot ?? [];
  const onFoot = footIndex.value;
  const footLine = onFoot === null ? undefined : lines[onFoot];
  const node = scroller.value?.querySelector<HTMLElement>(
    footLine ? `[data-foot-line="${footLine.id}"]` : `[data-cell="${cursor.value.row}-${cursor.value.col}"]`,
  );
  if (!node || !scroller.value) {
    square.visible = false;
    return;
  }
  const drawerHasFocus = document.activeElement?.closest('.desk-row-drawer');
  if (!drawerHasFocus) {
    node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    revealPastPinned(node);
  }
  const host = scroller.value.getBoundingClientRect();
  const cell = node.getBoundingClientRect();
  square.visible = true;
  square.left = cell.left;
  square.bottom = cell.bottom;
  square.style = {
    top: `${cell.top - host.top + scroller.value.scrollTop}px`,
    left: `${cell.left - host.left + scroller.value.scrollLeft}px`,
    width: `${cell.width}px`,
    height: `${cell.height}px`,
  };
}

/** Next total line the user can change. Display lines such as sub-total and grand total are skipped. */
function editableFoot(from: number, dir: 1 | -1): number | null {
  const lines = props.foot ?? [];
  for (let index = from + dir; index >= 0 && index < lines.length; index += dir) {
    if (lines[index]?.edit) return index;
  }
  return null;
}

/** Down from the last item row walks editable total lines. Enter runs the line edit and stays; Down or Ctrl+Enter on the last line leaves the grid. */
function onFootKey(event: KeyboardEvent): boolean {
  const lines = props.foot ?? [];
  if (lines.length === 0 || editing.value) return false;
  const lastRow = Math.max(0, orderedRows.value.length - 1);
  if (footIndex.value === null) {
    if (event.key !== 'ArrowDown' || cursor.value.row < lastRow) return false;
    const next = editableFoot(-1, 1);
    if (next === null) return false;
    event.preventDefault();
    footIndex.value = next;
    placeSquare();
    return true;
  }
  event.preventDefault();
  // With `footEntry`, Enter walks the total lines like the arrows; Ctrl+Enter (handled before this) runs the edit.
  const walkDown = event.key === 'ArrowDown' || (props.footEntry && event.key === 'Enter' && !event.shiftKey);
  const walkUp = event.key === 'ArrowUp' || (props.footEntry && event.key === 'Enter' && event.shiftKey);
  if (walkDown) {
    const next = editableFoot(footIndex.value, 1);
    if (next !== null) {
      footIndex.value = next;
      placeSquare();
    } else {
      footIndex.value = null;
      leaveGrid('enter', false, true);
    }
    return true;
  }
  if (walkUp) {
    const next = editableFoot(footIndex.value, -1);
    if (next === null) {
      footIndex.value = null;
      void moveTo(lastRow, cursor.value.col, false);
    } else {
      footIndex.value = next;
      placeSquare();
    }
    return true;
  }
  if (event.key === 'Enter') {
    const line = lines[footIndex.value];
    if (line?.edit) emit('foot', line.edit);
    return true;
  }
  if (event.key === 'Escape') {
    footIndex.value = null;
    void moveTo(lastRow, cursor.value.col, false);
    return true;
  }
  return true;
}

/** A click on a total line lands there, the same place ArrowDown reaches. */
function onScrollerMouseDown(event: MouseEvent): void {
  if (displayOnly.value) {
    event.preventDefault();
    return;
  }
  onFootMouse(event);
}

function onFootMouse(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const host = target.closest<HTMLElement>('[data-foot-line]');
  if (!host || !scroller.value?.contains(host)) return;
  const id = host.getAttribute('data-foot-line');
  const index = (props.foot ?? []).findIndex((line) => line.id === id);
  if (index < 0) return;
  commitInPlace();
  editing.value = false;
  footIndex.value = index;
  if (!target.closest('button')) focusGrid();
  placeSquare();
}

function focusGrid(): void {
  const active = document.activeElement;
  const editorHasFocus =
    (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
    active !== scroller.value &&
    Boolean(scroller.value?.contains(active));
  // The lookup input is already focused. Focusing the grid would close its list.
  if (editorHasFocus) return;
  scroller.value?.focus();
}

/** The enabled buttons in a row's Actions cell, left to right. Empty when the row is not drawn. */
function actionButtons(row: number): HTMLButtonElement[] {
  const cell = scroller.value?.querySelector(`td.actions-col[data-actions-row="${row}"]`);
  return cell ? [...cell.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')] : [];
}

/** Focus an enabled action button on this row. False when the row has none. */
function enterActions(row: number, at = 0): boolean {
  const buttons = actionButtons(row);
  const button = buttons[Math.min(at, buttons.length - 1)];
  if (!button) return false;
  button.focus();
  return true;
}

/** Leave the Actions cell for the last data cell of a row. */
function leaveActions(row: number): void {
  void moveTo(row, Math.max(0, visibleColumns.value.length - 1), false).then(() => focusGrid());
}

/**
 * Keys while a row action button has focus. Left and Right step through the enabled buttons,
 * Up and Down go to the same button on the next row, and Left on the first button or Escape
 * returns to the data cells. Enter and Space are left alone so the button's own click runs.
 * Returns true when the grid should not handle the key any further.
 */
function onActionKey(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  const cell = target.closest<HTMLElement>('td.actions-col[data-actions-row]');
  if (!cell || !scroller.value?.contains(cell)) return false;
  if (event.key === 'Enter' || event.key === ' ') return true;
  if (event.altKey || event.shiftKey) return false;
  const row = Number(cell.dataset.actionsRow);
  const buttons = actionButtons(row);
  const button = target.closest('button');
  const at = button ? buttons.indexOf(button) : -1;
  const handled = (): void => {
    claimDeskKey(event);
    event.preventDefault();
    event.stopPropagation();
  };
  if (event.key === 'ArrowRight') {
    handled();
    buttons[at + 1]?.focus();
    return true;
  }
  if (event.key === 'ArrowLeft') {
    handled();
    if (at > 0) buttons[at - 1]?.focus();
    else leaveActions(row);
    return true;
  }
  if (event.key === 'Escape') {
    handled();
    leaveActions(row);
    return true;
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    handled();
    const next = row + (event.key === 'ArrowUp' ? -1 : 1);
    if (next < 0 || next >= orderedRows.value.length) return true;
    const lastCol = Math.max(0, visibleColumns.value.length - 1);
    void moveTo(next, lastCol, false).then(() => {
      if (!enterActions(next, Math.max(0, at))) focusGrid();
    });
    return true;
  }
  return false;
}

function onGridFocus(): void {
  if (displayOnly.value) return;
  gridActive.value = true;
  void nextTick(() => placeSquare());
}

/** Lists and dialogs are drawn on the page body, but they still belong to the open grid. */
function focusInGridPopup(node: EventTarget | null): boolean {
  return node instanceof Element
    && node.closest('.desk-dialog, .desk-suggest, .desk-calendar-pop, .desk-lookup-menu, .desk-currency-pop, .desk-context-menu') !== null;
}

function onGridBlur(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (next instanceof Node && scroller.value?.contains(next)) return;
  // A dialog or list can take focus a tick later. Closing the drawer before that unmounts the field it returns to.
  if (next == null) {
    void nextTick(() => {
      const active = document.activeElement;
      if (active instanceof Node && scroller.value?.contains(active)) return;
      if (focusInGridPopup(active)) return;
      commitInPlace();
      gridActive.value = false;
    });
    return;
  }
  commitInPlace();
  if (focusInGridPopup(next)) return;
  gridActive.value = false;
}

/** Cursor on the first cell, not editing, so the gray line shows until the user types. */
/** The first entry uses `startRow`; after that the grid starts at the top as before. */
let entered = false;

function focusEntry(): void {
  editing.value = false;
  draft.value = '';
  const wanted = entered ? 0 : (props.startRow ?? 0);
  entered = true;
  const row = Math.min(Math.max(0, wanted), Math.max(0, orderedRows.value.length - 1));
  void moveTo(row, 0, false).then(() => focusGrid());
}

async function moveTo(row: number, col: number, extend: boolean): Promise<void> {
  footIndex.value = null;
  cursor.value = { row, col };
  const column = visibleColumns.value[col];
  const record = rowAt(row);
  if (column && record) emit('cursor', { rowIndex: row, columnId: column.id, record });
  if (extend) {
    const anchor = range.value ?? { r1: row, c1: col, r2: row, c2: col };
    range.value = { r1: anchor.r1, c1: anchor.c1, r2: row, c2: col };
  } else {
    range.value = { r1: row, c1: col, r2: row, c2: col };
  }
  selectedRows.value = new Set([row]);
  if (orderedRows.value.length >= DESK_GRID_VIRTUAL_AT) virtualizer.value.scrollToIndex(row, { align: 'auto' });
  await nextTick();
  syncPad();
  await nextTick();
  placeSquare();
  if (!extend) arriveEdit();
}

/**
 * A read-only column on a grid that filters (the link list) takes typed keys the same way a list does:
 * the character, Backspace, and Escape go into that column's filter instead of an editor.
 */
function onReadonlyFilterKey(event: KeyboardEvent): boolean {
  if (props.showFilter !== true || props.mode === 'list' || props.mode === 'report' || editing.value) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (!column || !row || !isReadonly(column, row)) return false;
  if (event.key === 'Escape') {
    if (!filters[column.id] && !filterDraft.value) return false;
    event.preventDefault();
    applyFilterKey({ clear: true });
    return true;
  }
  if (event.key === 'Backspace') {
    event.preventDefault();
    applyFilterKey({ backspace: true });
    return true;
  }
  if (event.key.length !== 1) return false;
  event.preventDefault();
  applyFilterKey({ seed: event.key });
  return true;
}

/**
 * Typed keys build a draft of the cursor column's filter. Nothing is sent while typing, so a slow
 * typist on a large report does not start a request per key: Enter applies the draft, Escape drops
 * it, and so does moving away. Escape with no draft clears the applied filter, as before.
 */
function applyFilterKey(action: { seed?: string; backspace?: boolean; clear?: boolean }): void {
  const column = activeColumn.value;
  if (!column) return;
  if (action.clear) {
    if (filterDraft.value) {
      cancelFilterDraft();
      return;
    }
    filters[column.id] = '';
    emit('filter', { ...filters });
    return;
  }
  const draft = filterDraft.value?.id === column.id ? filterDraft.value : { id: column.id, text: filters[column.id] ?? '', from: 'cells' as const };
  if (action.backspace && !filterDraft.value && draft.text === '') return;
  const text = action.backspace ? draft.text.slice(0, -1) : draft.text + (action.seed ?? '');
  filterDraft.value = { ...draft, text };
}

/** The filter text one pick-list choice stands for, as the header filter writes it. */
function choiceFilter(label: string): string {
  return `in: ${label}`;
}

/** The column holds a filter no single choice matches (several picked in the header filter). */
function otherChoiceFilter(column: DeskColumn): boolean {
  const text = filters[column.id] ?? '';
  return text !== '' && !(column.filterChoices ?? []).some((choice) => choiceFilter(choice.label) === text);
}

/** Any filter box holds an applied filter. */
function hasFilters(): boolean {
  return Object.values(filters).some((text) => text !== '');
}

/** Empties every filter box, one `filter` emit. */
function clearFilters(): void {
  filterDraft.value = null;
  for (const id of Object.keys(filters)) filters[id] = '';
  emit('filter', { ...filters });
}

/**
 * Escape while filtered and not editing clears the filters first, so a filter that left no rows
 * does not let Escape close the dialog or page around the grid. A second Escape does that.
 * The read-only cell case (clear only this column) runs before it.
 */
function onEscapeClearFilters(event: KeyboardEvent): boolean {
  if (event.key !== 'Escape' || props.showFilter !== true || editing.value || !hasFilters()) return false;
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (column && row && filters[column.id] && isReadonly(column, row) && props.mode !== 'list' && props.mode !== 'report') return false;
  event.preventDefault();
  clearFilters();
  return true;
}

/** A filter box that is a pick list (`filterChoices`): choosing applies at once. */
function onFilterSelect(column: DeskColumn, event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  filterDraft.value = null;
  if ((filters[column.id] ?? '') === value) return;
  filters[column.id] = value;
  emit('filter', { ...filters });
}

/** Filter text typed but not applied yet. `cells`: typed on the grid; `row`: in the filter row box. */
const filterDraft = ref<{ id: string; text: string; from: 'cells' | 'row' } | null>(null);

function shownFilter(id: string): string {
  return filterDraft.value?.id === id ? filterDraft.value.text : (filters[id] ?? '');
}

/** Enter: the draft becomes the column's filter, one `filter` emit, and only when it changed. */
function commitFilterDraft(): void {
  const draft = filterDraft.value;
  if (!draft) return;
  filterDraft.value = null;
  if ((filters[draft.id] ?? '') === draft.text) return;
  filters[draft.id] = draft.text;
  emit('filter', { ...filters });
}

function cancelFilterDraft(): void {
  filterDraft.value = null;
}

const filterDraftHeader = computed(() => {
  const id = filterDraft.value?.id;
  return props.columns.find((column) => column.id === id)?.header ?? id ?? '';
});

/**
 * While a draft typed on the cells is open: Enter applies it, Escape drops it, typing goes on.
 * Any other key (a move, a shortcut) drops it and then does what it always does.
 */
function onFilterDraftKey(event: KeyboardEvent): boolean {
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) return false;
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
  if (event.key === 'Enter' && plain && !event.shiftKey) {
    event.preventDefault();
    commitFilterDraft();
    return true;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelFilterDraft();
    return true;
  }
  if (plain && (event.key === 'Backspace' || event.key.length === 1)) return false;
  cancelFilterDraft();
  return false;
}

/** The filter row box: typing drafts, Enter applies, Escape drops the draft, leaving the box drops it. */
function onFilterInput(id: string, event: Event): void {
  filterDraft.value = { id, text: (event.target as HTMLInputElement).value, from: 'row' };
}

function onFilterInputKey(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    commitFilterDraft();
  } else if (event.key === 'Escape' && filterDraft.value) {
    event.preventDefault();
    cancelFilterDraft();
  } else if (event.key === 'Escape' && hasFilters()) {
    event.preventDefault();
    clearFilters();
  }
}

function onFilterInputBlur(id: string): void {
  if (filterDraft.value?.from === 'row' && filterDraft.value.id === id) cancelFilterDraft();
}

// A click on another cell, or focus leaving the grid, drops a draft typed on the cells.
watch(
  () => [cursor.value.row, cursor.value.col, gridActive.value] as const,
  () => {
    if (filterDraft.value?.from === 'cells') cancelFilterDraft();
  },
);

/**
 * A cell marked `openOnFocus` opens its editor as soon as the cursor lands on it.
 * Deferred so a caller that focuses the grid after `moveTo` does not take the editor's focus back.
 */
function arriveEdit(): void {
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (!column?.openOnFocus || !row || editing.value || isReadonly(column, row)) return;
  const rowIndex = cursor.value.row;
  const col = cursor.value.col;
  void nextTick(() => {
    if (editing.value || cursor.value.row !== rowIndex || cursor.value.col !== col) return;
    const landed = activeColumn.value;
    const landedRow = rowAt(rowIndex);
    if (!landed?.openOnFocus || !landedRow || isReadonly(landed, landedRow)) return;
    openWhenShown(rowIndex, col, 0);
  });
}

/**
 * The lookup input cannot take focus in the same paint that reveals the square.
 * Wait until the square is actually shown, then open the editor.
 */
function openWhenShown(rowIndex: number, col: number, attempt: number): void {
  if (editing.value || cursor.value.row !== rowIndex || cursor.value.col !== col) return;
  placeSquare();
  if (!gridActive.value) scroller.value?.focus();
  const squareEl = scroller.value?.querySelector('.input-square');
  const display = squareEl ? getComputedStyle(squareEl).display : 'missing';
  if (!gridActive.value || !square.visible) return;
  if (display === 'none' && attempt < 2) {
    void nextTick(() => openWhenShown(rowIndex, col, attempt + 1));
    return;
  }
  startEdit();
}

function startEdit(seed?: string): void {
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (!column || !row || isReadonly(column, row) || props.mode === 'report' || props.mode === 'list') return;
  if (hasNoChoice(column, row)) return;
  editSelectAll.value = seed === undefined;
  editStart = row[column.id];
  lookupSeed.value = column.lookup ? (seed ?? '') : '';
  // A multiple list opens empty so the rows already chosen stay on top, the same as chips.
  draft.value = column.multiple ? (seed ?? '') : column.lookup ? editorText(column, row) : (seed ?? editorText(column, row));
  editing.value = true;
  void nextTick(() => placeSquare());
}

function writeCell(rowIndex: number, column: DeskColumn, typed: unknown): void {
  const row = rowAt(rowIndex);
  if (!row || isReadonly(column, row)) return;
  // A number column with `decimals` keeps what is typed at its places (typedCellValue).
  const value = typedCellValue(column, typed);
  if (column.commit) {
    const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    column.commit(row, typeof value === 'string' ? value : '', record);
  } else {
    row[column.id] = value;
  }
  changed({ row: rowIndex, columnId: column.id, value, record: row });
}

function commitEdit(advance: boolean, force = false, refocus = true): void {
  if (!editing.value) {
    if (advance) void applyEnter(false, force);
    else if (refocus) focusGrid();
    return;
  }
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  let changed = false;
  if (column && row) {
    const value = parseEditorValue(column.editor ?? column.type, draft.value);
    changed = value !== editStart;
    const blank = column.blank === true && (column.editor === 'select' || column.type === 'select') && (value === '' || value === null);
    writeCell(cursor.value.row, column, blank ? null : value);
    if (blank && afterBlankMove(column, row) === 'exit') {
      editing.value = false;
      draft.value = '';
      leaveGrid();
      return;
    }
  }
  editing.value = false;
  draft.value = '';
  if (advance) void applyEnter(changed, force);
  else if (refocus) focusGrid();
}

/** Add or remove one row in a multiple lookup. The list stays open. */
function toggleLookup(record: Record<string, unknown>): void {
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (!column?.commit || !row) return;
  column.commit(row, '', record);
  changed({ row: cursor.value.row, columnId: column.id, value: record, record: row });
}

function commitLookup(via: 'enter' | 'tab' | 'back' | 'backEnter' | 'stay' = 'enter'): void {
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  const pick = lookupPick.value;
  const blank = isDeskBlankHit(pick);
  const typed = !pick && Boolean(column && resolveColumnLookup(column, row)?.acceptTyped && column.commit && draft.value.trim());
  if (column && row && (pick || typed)) {
    if (column.commit) {
      column.commit(row, blank ? '' : draft.value, blank ? null : pick);
      changed({ row: cursor.value.row, columnId: column.id, value: blank ? null : draft.value, record: row });
    } else if (blank) {
      row[column.id] = null;
      row[`${column.id}Id`] = null;
      changed({ row: cursor.value.row, columnId: column.id, value: null, record: row });
    } else if (pick) {
      writeCell(cursor.value.row, column, pick);
      const valueKey = resolveColumnLookup(column, row)?.valueKey ?? 'id';
      row[`${column.id}Id`] = pick['id'] ?? pick[valueKey];
      row[column.id] = draft.value;
    }
    if (pick && !blank) {
      emit('lookup', { columnId: column.id, rowIndex: cursor.value.row, record: pick, row });
    }
  }
  editing.value = false;
  lookupPick.value = null;
  draft.value = '';
  if (via === 'stay') return;
  if (blank && column && row && afterBlankMove(column, row) === 'exit') {
    leaveGrid(via === 'tab' ? 'tab' : 'enter', via === 'back' || via === 'backEnter');
    return;
  }
  if (via === 'enter') void applyEnter();
  else if (via === 'backEnter') void moveBack(true);
  else afterTab(via === 'back');
}

/** The id already on the row, for Edit when this cell was filled earlier. */
function storedLookupRow(column: DeskColumn, row: DeskGridRow, lookup: DeskLookupConfig): Record<string, unknown> | null {
  const companion = row[`${column.id}Id`];
  const named = column.lookupId ? row[column.lookupId] : undefined;
  const id = companion ?? named;
  if (id === undefined || id === null || id === '') return null;
  const label = row[column.id];
  return {
    [lookup.valueKey]: id,
    ...(typeof label === 'string' || typeof label === 'number' ? { [lookup.labelKey]: label } : {}),
  };
}

/**
 * New or Edit on a lookup cell that has an editor. The page opens in a dialog, which ends this
 * edit when focus leaves, so the row it returns is written through the normal lookup commit.
 */
async function runCellEditor(mode: DeskLookupEditorMode, typed = ''): Promise<void> {
  const column = activeColumn.value;
  const lookup = activeLookup.value;
  const row = rowAt(cursor.value.row);
  if (!column || !lookup?.editor || !row || isReadonly(column, row) || props.mode !== 'entry') return;
  const picked = lookupPick.value ?? storedLookupRow(column, row, lookup);
  const record = await runLookupEditor(lookup, mode, { picked, typed });
  if (!record) {
    focusGrid();
    return;
  }
  lookup.onPick?.(record);
  lookupPick.value = record;
  draft.value = lookupField(record, lookup.labelKey);
  commitLookup('stay');
  focusGrid();
}

/** Write the open cell and leave the cursor where it is. Used when focus leaves without Enter. */
function commitInPlace(): void {
  if (!editing.value) return;
  const column = activeColumn.value;
  if (column?.lookup) commitLookup('stay');
  else commitEdit(false, false, false);
}

/** Shift+Tab or Shift+Enter from a lookup cell. Enter also asks the landing dialog rule. */
function onLookupBack(via: 'tab' | 'enter' = 'tab'): void {
  commitLookup(via === 'enter' ? 'backEnter' : 'back');
}

/** Shift+Enter in a cell editor commits, then moves to the previous cell. */
function onEditorBack(): void {
  commitEdit(false, false, false);
  void moveBack(true);
}

/** Tab from a cell editor, after the edit is written. */
function onEditorTab(back: boolean): void {
  const row = rowAt(cursor.value.row);
  const last = cursor.value.col >= visibleColumns.value.length - 1;
  if (!back && row && last && showDrawer(row, cursor.value.row)) {
    commitEdit(false, false, false);
    focusDrawer(cursor.value.row, '');
    return;
  }
  if (!back && props.tabFlow === 'enter') {
    commitEdit(true);
    return;
  }
  commitEdit(false);
  afterTab(back);
}

function afterTab(back: boolean): void {
  if (props.tabFlow === 'field') {
    leaveGrid('tab', back);
    return;
  }
  if (!back) {
    void applyEnter();
    return;
  }
  if (cursor.value.row === 0 && cursor.value.col === 0) {
    leaveGrid('tab', true);
    return;
  }
  const prev = cellToTheLeft(keyState());
  void moveTo(prev.row, prev.col, false).then(() => focusGrid());
}

/** Previous cell. `land` asks the cell's Shift+Enter dialog rule after the move. */
async function moveBack(land: boolean): Promise<void> {
  if (cursor.value.row === 0 && cursor.value.col === 0) {
    leaveGrid('enter', true);
    return;
  }
  const prev = cellToTheLeft(keyState());
  await moveTo(prev.row, prev.col, false);
  focusGrid();
  if (land) openBackLanding();
}

/** A dialog opened while walking backward returns focus to the cell it opened from. */
function openBackLanding(): void {
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (!column || !row) return;
  const decision = resolveBackLanding(column, row, cursor.value.row, props.backDialog);
  if (decision.type !== 'dialog') return;
  emit('dialog', {
    dialog: decision.dialog,
    row,
    rowIndex: cursor.value.row,
    columnId: column.id,
  });
  focusGrid();
}

function cancelEdit(): void {
  editing.value = false;
  focusGrid();
}

async function applyEnter(changed = false, force = false): Promise<void> {
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (column && row) {
    const decision = resolveCellEnter(
      { row, rowIndex: cursor.value.row, changed, force },
      column,
      props.onNextFocus,
    );
    if (decision.type === 'dialog') {
      emit('dialog', {
        dialog: decision.dialog,
        row,
        rowIndex: cursor.value.row,
        columnId: decision.returnTo ?? column.id,
      });
      focusGrid();
      return;
    }
    if (decision.type === 'cell') {
      const col = visibleColumns.value.findIndex((item) => item.id === decision.columnId);
      if (col >= 0) {
        const rowIndex = Math.max(0, Math.min(rows.value.length - 1, cursor.value.row + (decision.rowDelta ?? 0)));
        await moveTo(rowIndex, col, false);
        focusGrid();
        return;
      }
    }
  }
  await runEnter({ ...keyState(), editing: false, dropdown: false });
}

/** Plain Enter from a state: next cell, next row, a new entry row, or out of the grid. */
async function runEnter(state: ReturnType<typeof keyState>): Promise<void> {
  const action = resolveGridKey({ key: 'Enter', ctrl: false, meta: false, shift: false, alt: false }, state);
  if (action.type === 'move') await moveTo(action.row, action.col, false);
  if (action.type === 'exitGrid') {
    leaveGrid();
    return;
  }
  if (action.type === 'commitMove') {
    if (action.addRow) addRow();
    await moveTo(action.row, action.col, false);
  }
  focusGrid();
}

/** Leaving a row's drawer is Enter on that row's last cell. Same rules as the keyboard path. */
async function advanceRow(rowIndex: number): Promise<void> {
  const lastCol = Math.max(0, visibleColumns.value.length - 1);
  await runEnter({
    ...keyState(),
    cursor: { row: rowIndex, col: lastCol },
    editing: false,
    dropdown: false,
    onGate: false,
    blankOnNewRow: gateEmptyAt(rowIndex),
  });
}

/** Puts the cursor on the first total line that can be changed. False when there is none. */
function enterFoot(): boolean {
  if (!props.foot?.length) return false;
  const next = editableFoot(-1, 1);
  if (next === null) return false;
  footIndex.value = next;
  // Not focusGrid: Enter often comes from the item lookup, whose input still has focus and is about to close.
  scroller.value?.focus();
  placeSquare();
  return true;
}

/** `fromFoot` is a leave from the total lines themselves, which goes on to the next field. */
function leaveGrid(via: 'enter' | 'tab' = 'enter', back = false, fromFoot = false): void {
  editing.value = false;
  if (props.footEntry && via === 'enter' && !back && !fromFoot && enterFoot()) return;
  emit('exit');
  if (back) {
    focusPrevDeskField(gridId);
    return;
  }
  if (via === 'enter' && props.enterJump) {
    focusGrid();
    if (resolveDeskJump()?.go()) return;
  }
  if (props.exitTo?.()) return;
  if (props.exitField && focusDeskField(props.exitField)) return;
  if (focusFormSaveForField(gridId)) return;
  focusNextDeskField(gridId, via);
}

/** Adds the next entry row: at the top when `newRowAt` is `start`, otherwise at the bottom. */
function addRow(): void {
  const fresh = blankRow(rows.value.length);
  rows.value = props.newRowAt === 'start' ? [fresh, ...rows.value] : [...rows.value, fresh];
}

function insertRow(): void {
  const next = [...rows.value];
  next.splice(cursor.value.row, 0, { id: `new-${Date.now()}` });
  rows.value = next;
}

function blankRow(index: number): DeskGridRow {
  if (props.newRow) return props.newRow();
  const row: DeskGridRow = { id: `row-${Date.now()}-${index}` };
  for (const column of props.columns) row[column.id] = emptyColumnValue(column);
  return row;
}

/** Keep `minRows` rows on screen. Delete of a kept row clears it instead. */
watch(
  () => rows.value.length,
  (length) => {
    if (props.minRows < 1 || length >= props.minRows) return;
    const next = rows.value.slice();
    while (next.length < props.minRows) next.push(blankRow(next.length));
    rows.value = next;
  },
  { immediate: true },
);

/** Why the last Delete kept its row (`rowDeletable`); cleared when the cursor moves to another row. */
const refusal = ref('');
watch(
  () => cursor.value.row,
  () => {
    refusal.value = '';
  },
);

function deleteRow(): void {
  if (rows.value.length === 0) return;
  const index = Math.min(cursor.value.row, rows.value.length - 1);
  const target = rows.value[index];
  const allowed = target && props.rowDeletable ? props.rowDeletable(target, index) : true;
  if (allowed !== true) {
    refusal.value = allowed;
    return;
  }
  refusal.value = '';
  if (props.minRows > 0 && rows.value.length <= props.minRows) {
    const current = rows.value[index];
    if (!current) return;
    const cleared = clearRowData(current, props.columns);
    const next = rows.value.slice();
    next[index] = cleared;
    rows.value = next;
    changed({ row: index, columnId: props.columns[0]?.id ?? '', value: null, record: cleared });
    return;
  }
  const next = rows.value.slice();
  next.splice(index, 1);
  rows.value = next;
  userEdited();
  void moveTo(Math.max(0, index - 1), cursor.value.col, false);
}

/** The column that must be filled before a row counts as entered. */
function gateColumnId(): string {
  return props.exitWhenBlank || visibleColumns.value[0]?.id || '';
}

function gateEmptyAt(rowIndex: number): boolean {
  const id = gateColumnId();
  if (!id) return false;
  const column = props.columns.find((item) => item.id === id);
  const row = rowAt(rowIndex);
  if (!column || !row) return true;
  return cellText(column, row).trim() === '';
}

function gateColumnEmpty(): boolean {
  return gateEmptyAt(cursor.value.row);
}

/** A zero or blank number has not been entered, so the last cell can leave instead of adding a row. */
function numberGateEmpty(): boolean {
  const id = gateColumnId();
  const column = props.columns.find((item) => item.id === id);
  const row = rowAt(cursor.value.row);
  if (!column || !row || (column.editor ?? column.type) !== 'number') return false;
  const value = asNumber(row[column.id]);
  return value === null || value === 0;
}

/** With `newRowAt="start"`, row 0 waiting for input has no number yet. */
const entryRowBlank = computed(() => props.mode === 'entry' && props.newRowAt === 'start' && gateEmptyAt(0));

function shownRowNumber(row: DeskGridRow, index: number): number | string {
  return props.rowNumber ? props.rowNumber(row, index) : positionNumber(index);
}

function positionNumber(index: number): number | string {
  const size = props.pageSize ?? 0;
  if ((props.mode === 'list' || props.showPager) && size > 0) return ((props.page ?? 1) - 1) * size + index + 1;
  if (!entryRowBlank.value) return index + 1;
  return index === 0 ? '' : index;
}

function keyState() {
  const pageCount = props.pageCount ?? 1;
  return {
    mode: props.mode,
    rowCount: orderedRows.value.length,
    colCount: visibleColumns.value.length,
    cursor: cursor.value,
    editing: editing.value,
    pageSize: props.pageSize && props.pageSize > 0 ? props.pageSize : 12,
    blankOnNewRow: props.exitOnBlank && gateColumnEmpty(),
    blockNewRow: props.blockNewRow?.() === true,
    numberGateEmpty: props.exitOnBlank && numberGateEmpty(),
    onGate: activeColumn.value?.id === gateColumnId(),
    newRowAt: props.newRowAt,
    tabFlow: props.tabFlow,
    dropdown: dropdownCell(),
    ...(showPagerLinks.value && pageCount > 1
      ? { pagination: { page: props.page ?? 1, pageCount, loading: props.loading } }
      : {}),
  };
}

/** Enter opens this cell's list. The column, or its lookup, decides. Otherwise Enter moves on. */
function dropdownCell(): boolean {
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (!column || !row) return false;
  return cellOpensOnEnter(column, row);
}

/** A select with one option or none has nothing to pick, so it never opens. Enter moves on. */
function hasNoChoice(column: DeskColumn, row: DeskGridRow): boolean {
  return (column.editor || column.type) === 'select' && columnOptions(column, row).length <= 1;
}

function readCell(rowIndex: number, colIndex: number): string {
  const column = visibleColumns.value[colIndex];
  const row = rowAt(rowIndex);
  if (!column || !row) return '';
  return editorText(column, row);
}

function copyRange(): void {
  const box = range.value ?? {
    r1: cursor.value.row,
    c1: cursor.value.col,
    r2: cursor.value.row,
    c2: cursor.value.col,
  };
  const text = rangeToTsv(
    orderedRows.value.length,
    visibleColumns.value.length,
    box.r1,
    box.c1,
    box.r2,
    box.c2,
    readCell,
  );
  void navigator.clipboard.writeText(text);
}

async function pasteRange(): Promise<void> {
  const text = await navigator.clipboard.readText();
  const grid = parseTsv(text);
  grid.forEach((line, rowOffset) => {
    line.forEach((value, colOffset) => {
      const column = visibleColumns.value[cursor.value.col + colOffset];
      if (!column) return;
      writeCell(cursor.value.row + rowOffset, column, parseEditorValue(column.type, value));
    });
  });
}

function fillDown(): void {
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (!column || !row) return;
  const value = row[column.id];
  const box = range.value;
  const bottom = box ? Math.max(box.r1, box.r2) : cursor.value.row;
  for (let index = cursor.value.row; index <= bottom; index += 1) writeCell(index, column, value);
}

function onCellMouse(rowIndex: number, colIndex: number, event: MouseEvent): void {
  pendingCursor.value = null;
  commitInPlace();
  void moveTo(rowIndex, colIndex, event.shiftKey);
  focusGrid();
}

function onCellDoubleClick(event: MouseEvent): void {
  if (props.selection === 'row') {
    const row = rowAt(cursor.value.row);
    if (!row) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      if (deskActionsForGesture('ctrl+dblclick').includes('grid-open-page')) emit('open-page', row);
    } else if (!event.altKey && !event.shiftKey) emit('open', row);
    return;
  }
  if (props.mode === 'list') return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (!deskActionsForGesture('dblclick').includes('grid-cell-dialog')) return;
  if (!cellHasDialog(true)) return;
  event.preventDefault();
  openCellDialog();
}

function landsOnBack(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/** A plain arrow already on the edge leaves this grid when the page stacked another grid beside it. */
function leaveOnArrow(action: GridKeyAction, event: KeyboardEvent): boolean {
  if (!props.arrowLeave || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
  // An open editor commits and stays on the cell; the next arrow leaves.
  if (action.type !== 'move' || action.extend) return false;
  if (action.row !== cursor.value.row || action.col !== cursor.value.col) return false;
  const dir =
    event.key === 'ArrowUp' ? 'up'
    : event.key === 'ArrowDown' ? 'down'
    : event.key === 'ArrowLeft' ? 'left'
    : event.key === 'ArrowRight' ? 'right'
    : null;
  if (!dir) return false;
  const from = activeBox();
  return Boolean(from && focusDeskToward(dir, gridId, from));
}

function applyAction(action: GridKeyAction, event: KeyboardEvent): void {
  if (action.type === 'none') return;
  // Escape with nothing to clear is left for the dialog or page around the grid.
  if (action.type === 'filterKey' && action.clear && !filterDraft.value && !filters[activeColumn.value?.id ?? '']) return;
  if (leaveOnArrow(action, event)) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  if (action.type === 'move') {
    const land = landsOnBack(event);
    void moveTo(action.row, action.col, action.extend).then(() => {
      if (land) openBackLanding();
    });
  }
  if (action.type === 'filterKey') applyFilterKey(action);
  if (action.type === 'startEdit') startEdit(action.seed);
  if (action.type === 'cancelEdit') cancelEdit();
  if (action.type === 'exitGrid') {
    if (editing.value) commitEdit(false);
    leaveGrid(action.via, action.back);
  }
  if (action.type === 'commitMove') {
    commitEdit(false);
    if (action.addRow) addRow();
    const land = landsOnBack(event);
    void moveTo(action.row, action.col, false).then(() => {
      if (land) openBackLanding();
    });
  }
  if (action.type === 'insertRow') insertRow();
  if (action.type === 'deleteRow') deleteRow();
  if (action.type === 'copy') copyRange();
  if (action.type === 'paste' && props.mode !== 'list') void pasteRange();
  if (action.type === 'fillDown' && props.mode !== 'list') fillDown();
  if (action.type === 'openRecord') {
    const row = rowAt(cursor.value.row);
    if (row) emit('open', row);
  }
  if (action.type === 'editRecord') {
    const row = rowAt(cursor.value.row);
    if (row) emit('edit-record', row);
  }
  if (action.type === 'paginate') {
    pendingCursor.value = { row: action.row, col: action.col };
    emit('page', action.page);
  }
}

/** The open-dialog shortcut commits an edit, then opens even when the value did not change. */
function openCellDialog(): void {
  if (editing.value) {
    commitEdit(true, true);
    return;
  }
  void applyEnter(false, true);
}

/** Enter on a resting dialog cell. Opens when the column's `when` says so, otherwise the grid moves on. */
function restingDialogEnter(event: KeyboardEvent): boolean {
  const tabAsEnter = event.key === 'Tab' && props.tabFlow !== 'field';
  if (event.key !== 'Enter' && !tabAsEnter) return false;
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (editing.value || dropdownCell()) return false;
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (!column || !row) return false;
  const decision = resolveCellEnter(
    { row, rowIndex: cursor.value.row, changed: false, force: false },
    column,
    props.onNextFocus,
  );
  if (decision.type === 'next') return false;
  event.preventDefault();
  void applyEnter(false, false);
  return true;
}

function cellHasDialog(force: boolean): boolean {
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (!column || !row) return false;
  return (
    resolveCellEnter({ row, rowIndex: cursor.value.row, changed: false, force }, column, props.onNextFocus).type ===
    'dialog'
  );
}

function cellBox(row: number, col: number): DeskBox | null {
  const node = scroller.value?.querySelector<HTMLElement>(`[data-cell="${row}-${col}"]`);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function activeBox(): DeskBox | null {
  const line = footIndex.value === null ? undefined : props.foot?.[footIndex.value];
  if (!line) return cellBox(cursor.value.row, cursor.value.col);
  const node = scroller.value?.querySelector<HTMLElement>(`[data-foot-line="${line.id}"]`);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function jumpColumnId(): string {
  return props.jumpColumn || props.exitWhenBlank || visibleColumns.value[0]?.id || '';
}

/** Section jump lands on the first blank row of the jump column, or a new row when every row is filled. */
function gridJumpTo(): DeskJumpStop | null {
  const columnId = jumpColumnId();
  const col = visibleColumns.value.findIndex((column) => column.id === columnId);
  const column = col < 0 ? undefined : visibleColumns.value[col];
  if (!column || col < 0) return null;
  const atStart = props.newRowAt === 'start';
  const first = orderedRows.value[0];
  const blank = atStart
    ? (first && cellText(column, first).trim() === '' ? 0 : -1)
    : orderedRows.value.findIndex((row) => cellText(column, row).trim() === '');
  const row = blank >= 0 ? blank : atStart ? 0 : Math.max(0, orderedRows.value.length - 1);
  const rect = cellBox(Math.min(row, Math.max(0, orderedRows.value.length - 1)), col);
  if (!rect) return null;
  const height = rect.bottom - rect.top;
  const shown = blank >= 0
    ? rect
    : atStart
      ? { ...rect, top: rect.top - height, bottom: rect.top }
      : { ...rect, top: rect.bottom, bottom: rect.bottom + height };
  return {
    rect: shown,
    label: 'Items',
    go: () => {
      if (blank < 0) addRow();
      focusCell(blank >= 0 ? blank : atStart ? 0 : rows.value.length - 1, columnId);
      return true;
    },
  };
}

/** On a dialog cell, the jump key opens that dialog when both shortcuts share a combo. */
function gridJumpFrom(): DeskJumpStop | null {
  if (footIndex.value !== null || props.mode === 'list') return null;
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (!column || !row) return null;
  const decision = resolveCellEnter({ row, rowIndex: cursor.value.row, changed: false, force: true }, column, props.onNextFocus);
  if (decision.type !== 'dialog' || deskComboFor('desk-jump') !== deskComboFor('grid-cell-dialog')) return null;
  const rect = cellBox(cursor.value.row, cursor.value.col);
  if (!rect) return null;
  return {
    rect,
    label: deskJumpLabel(decision.dialog),
    go: () => {
      openCellDialog();
      return true;
    },
  };
}

function gridFocusNear(from: DeskBox, dir: DeskDir): boolean {
  const columns = visibleColumns.value;
  const host = scroller.value;
  if (!host || columns.length === 0) return false;
  const vertical = dir === 'up' || dir === 'down';
  const at = vertical ? (from.left + from.right) / 2 : (from.top + from.bottom) / 2;
  const lastRow = Math.max(0, orderedRows.value.length - 1);
  let bestRow = 0;
  let bestCol = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  // Up and Down take the column under the origin's X. Left and Right take the row beside its Y.
  for (const node of host.querySelectorAll<HTMLElement>('[data-cell]')) {
    const [row, col] = (node.dataset.cell ?? '').split('-').map(Number);
    if (row === undefined || col === undefined || Number.isNaN(row) || Number.isNaN(col)) continue;
    const rect = node.getBoundingClientRect();
    const dist = Math.abs((vertical ? rect.left + rect.right : rect.top + rect.bottom) / 2 - at);
    if (dist < bestDist) {
      bestDist = dist;
      bestRow = row;
      bestCol = col;
    }
  }
  if (bestDist === Number.POSITIVE_INFINITY) return false;
  const lastCol = columns.length - 1;
  const row = vertical ? (dir === 'up' ? lastRow : 0) : bestRow;
  const col = vertical ? bestCol : dir === 'left' ? lastCol : 0;
  editing.value = false;
  void moveTo(row, col, false).then(() => focusGrid());
  return true;
}

/** Keep a typed cell. A lookup search is dropped, the same as leaving the cell. */
function releaseEdit(): void {
  if (!editing.value) return;
  const column = activeColumn.value;
  const row = rowAt(cursor.value.row);
  if (column && row && !column.lookup) writeCell(cursor.value.row, column, parseEditorValue(column.editor ?? column.type, draft.value));
  editing.value = false;
  if (column && row && !column.lookup) {
    const kind = column.editor ?? column.type;
    let value = parseEditorValue(kind, draft.value);
    if ((kind === 'number' || kind === 'currency') && (value === null || value === '')) value = 0;
    writeCell(cursor.value.row, column, value);
  }
  draft.value = '';
  focusGrid();
}

function boxOf(node: HTMLElement): DeskBox {
  const rect = node.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function drawerFieldBoxes(): { id: string; box: DeskBox }[] {
  return drawerFields().flatMap((field) => {
    const id = field.getAttribute('data-drawer-field') ?? '';
    if (!id) return [];
    return [{ id, box: boxOf(field) }];
  });
}

/** Ctrl+Arrow inside the open drawer. Left and Right walk its fields. Up returns to the cell. */
function moveDrawerByDirection(dir: DeskDir): void {
  const active = document.activeElement;
  const host = active instanceof HTMLElement ? active.closest<HTMLElement>('[data-drawer-field]') : null;
  if (!host) return;
  const currentId = host.getAttribute('data-drawer-field') ?? '';
  const nextId = pickToward(
    boxOf(host),
    drawerFieldBoxes().filter((field) => field.id !== currentId),
    dir,
  );
  if (nextId) {
    focusControl(drawerFields().find((field) => field.getAttribute('data-drawer-field') === nextId));
    return;
  }
  if (dir === 'up') {
    focusGrid();
    return;
  }
  if (dir === 'down') {
    const next = cursor.value.row + 1;
    if (next < orderedRows.value.length) {
      void moveTo(next, cursor.value.col, false).then(() => focusGrid());
      return;
    }
    const lines = props.foot ?? [];
    const foot = lines.length > 0 ? editableFoot(-1, 1) : null;
    if (foot !== null) {
      footIndex.value = foot;
      placeSquare();
      focusGrid();
      return;
    }
  }
  focusDeskToward(dir, gridId, boxOf(host));
}

function moveByDirection(dir: DeskDir): void {
  if (drawerPlace(document.activeElement)) {
    moveDrawerByDirection(dir);
    return;
  }
  releaseEdit();
  const lines = props.foot ?? [];
  const lastRow = Math.max(0, orderedRows.value.length - 1);
  const lastCol = Math.max(0, visibleColumns.value.length - 1);
  const onFoot = footIndex.value;
  if (onFoot !== null) {
    if (dir === 'down') {
      const next = editableFoot(onFoot, 1);
      if (next !== null) {
        footIndex.value = next;
        placeSquare();
        focusGrid();
        return;
      }
    }
    if (dir === 'up') {
      const next = editableFoot(onFoot, -1);
      if (next !== null) {
        footIndex.value = next;
        placeSquare();
      } else {
        footIndex.value = null;
        void moveTo(lastRow, cursor.value.col, false);
      }
      focusGrid();
      return;
    }
  } else {
    const { row, col } = cursor.value;
    if (dir === 'left' && col > 0) {
      void moveTo(row, col - 1, false).then(() => focusGrid());
      return;
    }
    if (dir === 'right' && col < lastCol) {
      void moveTo(row, col + 1, false).then(() => focusGrid());
      return;
    }
    if (dir === 'right' && props.rowActions && enterActions(row)) return;
    if (dir === 'up' && row > 0) {
      void moveTo(row - 1, col, false).then(() => focusGrid());
      return;
    }
    if (dir === 'down') {
      const record = rowAt(row);
      const from = record && showDrawer(record, row) ? cellBox(row, col) : null;
      const fieldId = from ? pickToward(from, drawerFieldBoxes(), 'down') : null;
      if (fieldId) {
        focusDrawer(row, fieldId);
        return;
      }
    }
    if (dir === 'down' && row < lastRow) {
      void moveTo(row + 1, col, false).then(() => focusGrid());
      return;
    }
    if (dir === 'down' && lines.length > 0) {
      const next = editableFoot(-1, 1);
      if (next !== null) {
        footIndex.value = next;
        placeSquare();
        focusGrid();
        return;
      }
    }
  }
  const from = activeBox();
  if (from) focusDeskToward(dir, gridId, from);
}

/** The open list is drawn on the page, outside the cell, so it is not inside the editor. */
function suggestOpen(): boolean {
  return document.querySelector('.desk-suggest, .desk-lookup-menu') !== null;
}

/** A combo or lookup list is open, so Up and Down belong to that list. */
function menuOpen(target: EventTarget | null): boolean {
  if (!suggestOpen() || !(target instanceof Element)) return false;
  return target.closest('.desk-combo, .desk-lookup') !== null;
}

/**
 * Down from an item cell drops into the open drawer, on the cell under this one.
 * Capture runs before a cell editor claims the key, so an edit is kept and focus moves.
 */
function onArrowCapture(event: KeyboardEvent): void {
  if (displayOnly.value) return;
  if (event.key !== 'ArrowDown') return;
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
  if (editing.value && suggestOpen()) return;
  if (drawerPlace(event.target) || menuOpen(event.target)) return;
  if (!focusDrawerBelow()) return;
  event.preventDefault();
  event.stopPropagation();
}

/** Whether the page listens for `open-page`, so Ctrl+Enter stays the section jump when it does not. */
const instance = getCurrentInstance();
function listensForOpenPage(): boolean {
  return Boolean(instance?.vnode.props?.onOpenPage);
}

/** Row selection: Enter opens, the open-dialog key opens the page, Left and Right scroll, typing does nothing. */
function onRowKey(event: KeyboardEvent): boolean {
  if (editing.value) return false;
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  const row = rowAt(cursor.value.row);
  if (event.key === 'Enter' && plain) {
    event.preventDefault();
    if (row) emit('open', row);
    return true;
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && listensForOpenPage()) {
    const combo = toCombo(keyInputOf(event));
    if (combo && deskActionsFor(combo).includes('grid-cell-dialog')) {
      event.preventDefault();
      if (row) emit('open-page', row);
      return true;
    }
  }
  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && plain) {
    event.preventDefault();
    scroller.value?.scrollBy({ left: event.key === 'ArrowLeft' ? -120 : 120 });
    return true;
  }
  if (event.key.length === 1 && plain && !props.showFilter) {
    event.preventDefault();
    return true;
  }
  return false;
}

/** Ctrl+F: the filter row of the cursor column. */
function focusFilterRow(): void {
  if (props.mode !== 'list' || !props.showFilter || !props.filterShortcut) return;
  const inputs = scroller.value?.querySelectorAll<HTMLInputElement>('td.column-filter input');
  inputs?.[Math.min(cursor.value.col, inputs.length - 1)]?.focus();
}
if (props.filterShortcut) useDeskLayer({ handlers: { 'action-filter': focusFilterRow } });

function focusFirstRow(): void {
  void moveTo(0, cursor.value.col, false).then(() => focusGrid());
}

function onKey(event: KeyboardEvent): void {
  if (displayOnly.value) return;
  // A cell editor, combo or the corner menu below already handled this key.
  if (isClaimedDeskKey(event)) return;
  if (
    editing.value
    && suggestOpen()
    && (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')
  ) {
    event.preventDefault();
    const input = scroller.value?.querySelector<HTMLInputElement>('.desk-lookup input, .desk-combo input');
    if (input && document.activeElement !== input) input.focus();
    return;
  }
  if (event.target instanceof HTMLElement && event.target.closest('.column-filter')) return;
  if (filterDraft.value?.from === 'cells' && onFilterDraftKey(event)) return;
  if (onEscapeClearFilters(event)) return;
  const editorMode = editing.value || props.mode !== 'entry' ? null : deskEditorMode(event, activeLookup.value);
  if (editorMode) {
    event.preventDefault();
    event.stopPropagation();
    void runCellEditor(editorMode);
    return;
  }
  if (props.selection === 'row' && onRowKey(event)) return;
  if (onActionKey(event)) return;
  if (
    event.key === 'ArrowRight'
    && props.rowActions
    && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
    && !editing.value
    && footIndex.value === null
    && event.target === scroller.value
    && cursor.value.col >= visibleColumns.value.length - 1
    && enterActions(cursor.value.row)
  ) {
    event.preventDefault();
    return;
  }
  if (event.ctrlKey || event.metaKey) {
    if (
      event.key === 'Enter'
      && !event.shiftKey
      && !event.altKey
      && footIndex.value !== null
      && !editing.value
    ) {
      if (props.footEntry) {
        // Enter walks the totals here, so Ctrl+Enter is the key that opens the line's edit.
        const line = props.foot?.[footIndex.value];
        if (line?.edit) emit('foot', line.edit);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const next = editableFoot(footIndex.value, 1);
      if (next !== null) {
        footIndex.value = next;
        placeSquare();
      } else {
        footIndex.value = null;
        leaveGrid('enter', false, true);
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // A page that changes tabs with this key owns it. The grid does not extend a selection.
    if (isDeskTabKey(event)) return;
    const dir = deskMoveDir(event);
    if (dir && props.ctrlArrows) {
      event.preventDefault();
      event.stopPropagation();
      moveByDirection(dir);
      return;
    }
    if (dir) return;
    if (props.mode !== 'list' && isDeskJumpKey(event)) {
      const combo = toCombo(keyInputOf(event));
      if (combo && deskActionsFor(combo).includes('grid-cell-dialog') && cellHasDialog(true)) {
        event.preventDefault();
        openCellDialog();
        return;
      }
      releaseEdit();
      return;
    }
  }
  const place = drawerPlace(event.target);
  if (place) {
    const action = resolveDrawerKey({ key: event.key, shift: event.shiftKey }, place, drawerCellClosed(event.target));
    if (
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
      && event.target instanceof HTMLSelectElement
    ) {
      return;
    }
    if (action.type === 'to-grid') {
      event.preventDefault();
      const host = event.target instanceof Element ? event.target.closest('[data-drawer-field]') : null;
      crossDrawer(action.dir, host?.getAttribute('data-drawer-field') ?? '');
    } else if (action.type === 'move-field') {
      event.preventDefault();
      focusDrawerStep(action.dir, true);
    } else if (action.type === 'edit') {
      event.preventDefault();
      const field = event.target instanceof Element ? event.target.closest('[data-drawer-field]') : null;
      if (field instanceof HTMLElement) field.click();
    } else if (action.type === 'next-field') {
      event.preventDefault();
      focusDrawerStep(1);
    } else if (action.type === 'next-row') {
      event.preventDefault();
      void advanceRow(cursor.value.row);
    } else if (action.type === 'leave-drawer') {
      event.preventDefault();
      focusGrid();
    } else if (event.key === 'Enter') {
      event.preventDefault();
    }
    return;
  }
  if (onFootKey(event)) return;
  if (restingDialogEnter(event)) return;
  const combo = toCombo(keyInputOf(event));
  if (combo && deskActionsFor(combo).includes('grid-cell-dialog') && cellHasDialog(true)) {
    event.preventDefault();
    openCellDialog();
    return;
  }
  if (event.key === 'F3' && activeColumn.value?.lookup) {
    event.preventDefault();
    emit('create-lookup', { columnId: activeColumn.value.id, rowIndex: cursor.value.row });
    return;
  }
  if (event.altKey && event.key === 'ArrowDown' && activeColumn.value?.lookup) {
    event.preventDefault();
    startEdit('');
    return;
  }
  if (onReadonlyFilterKey(event)) return;
  if (
    props.pageSizeChoice === 'infinite'
    && !editing.value
    && event.key === 'ArrowDown'
    && !event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && footIndex.value === null
  ) {
    const last = orderedRows.value.length - 1;
    if (last >= 0 && cursor.value.row >= last) {
      event.preventDefault();
      emit('more');
      return;
    }
  }
  const action = resolveGridKey(
    {
      key: event.key,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      shift: event.shiftKey,
      alt: event.altKey,
    },
    keyState(),
  );
  applyAction(action, event);
}

watch(cursor, () => {
  void nextTick(() => {
    syncPad();
    requestAnimationFrame(() => placeSquare());
  });
});

watch(rows, () => {
  const pending = pendingCursor.value;
  if (!pending) return;
  pendingCursor.value = null;
  const last = Math.max(0, orderedRows.value.length - 1);
  const row = pending.row === 'last' ? last : Math.min(pending.row, last);
  void moveTo(row, pending.col, false);
});

watch(
  () => orderedRows.value.length,
  () => {
    void nextTick(() => placeSquare());
  },
);

watch(
  () => props.pageSizeChoice,
  () => {
    dynamicFitSent = false;
    void nextTick(() => syncDynamicResizeObserver());
  },
);

watch(deskFontSizePercent, () => {
  if (props.pageSizeChoice !== 'dynamic') return;
  dynamicFitSent = false;
  scheduleDynamicRemeasure();
});

watch(
  () => [rows.value.length, props.pageSizeChoice, props.loading] as const,
  () => {
    if (props.loading) return;
    void nextTick(() => {
      measureDynamicFit();
      syncDynamicResizeObserver();
    });
  },
  { flush: 'post' },
);

function currentRow(): DeskGridRow | null {
  return rowAt(cursor.value.row) ?? null;
}

/** Put the cursor on a cell by column id and focus the grid, e.g. after a line dialog closes. */
function focusCell(rowIndex: number, columnId: string): void {
  const col = Math.max(0, visibleColumns.value.findIndex((column) => column.id === columnId));
  editing.value = false;
  void moveTo(rowIndex, col, false).then(() => focusGrid());
}

function focusDrawer(rowIndex: number, fieldId: string): void {
  editing.value = false;
  footIndex.value = null;
  void moveTo(rowIndex, cursor.value.col, false).then(() => {
    void nextTick(() => {
      const root = drawerOf(rowIndex);
      const named = fieldId ? root?.querySelector<HTMLElement>(`[data-drawer-field="${fieldId}"]`) : null;
      const first = root?.querySelector<HTMLElement>('[data-drawer-field]');
      focusControl(named ?? first);
    });
  });
}

function onTag(rowIndex: number, fieldId: string): void {
  focusDrawer(rowIndex, fieldId);
}

/** The drawer under one item row. Several can be on screen when `drawerRows` is `all`. */
function drawerOf(rowIndex: number): HTMLElement | null {
  return scroller.value?.querySelector<HTMLElement>(`tr.desk-row-drawer[data-drawer-row="${rowIndex}"]`) ?? null;
}

/** Fields of the drawer that has focus, or the cursor row's drawer. */
function drawerFields(): HTMLElement[] {
  const root = drawerOf(focusedDrawerRow());
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('[data-drawer-field]')];
}

function focusedDrawerRow(): number {
  const active = document.activeElement;
  if (active instanceof Element) {
    const raw = active.closest('tr.desk-row-drawer')?.getAttribute('data-drawer-row');
    const index = raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isInteger(index)) return index;
  }
  return cursor.value.row;
}

function focusControl(node: HTMLElement | null | undefined): void {
  if (!node) return;
  const inner = node.matches('input, select, textarea, button')
    ? node
    : node.querySelector<HTMLElement>('input, select, textarea, button');
  (inner ?? node).focus();
}

/** The column on `rowIndex` whose cell lines up with `from`. */
function columnAligned(from: DeskBox, rowIndex: number, dir: 'up' | 'down'): number {
  const candidates = visibleColumns.value.flatMap((_, col) => {
    const box = cellBox(rowIndex, col);
    return box ? [{ id: col, box }] : [];
  });
  return pickToward(from, candidates, dir) ?? cursor.value.col;
}

/** Down from the current item cell into the drawer cell underneath it. */
function focusDrawerBelow(): boolean {
  if (footIndex.value !== null) return false;
  const record = rowAt(cursor.value.row);
  if (!record || !showDrawer(record, cursor.value.row)) return false;
  const from = cellBox(cursor.value.row, cursor.value.col);
  if (!from) return false;
  const fieldId = pickToward(from, drawerFieldBoxes(), 'down');
  if (!fieldId) return false;
  if (editing.value) {
    if (activeColumn.value?.lookup) {
      editing.value = false;
      lookupPick.value = null;
      draft.value = '';
    } else {
      commitEdit(false, false, false);
    }
  }
  focusDrawer(cursor.value.row, fieldId);
  return true;
}

/**
 * Up from a drawer cell returns to this item row.
 * Down goes to the next item row. Both land on the column under the drawer cell.
 */
function crossDrawer(dir: 1 | -1, fieldId: string): void {
  const field = drawerFields().find((item) => item.getAttribute('data-drawer-field') === fieldId);
  const from = field ? boxOf(field) : cellBox(cursor.value.row, cursor.value.col);
  if (dir < 0) {
    const col = from ? columnAligned(from, cursor.value.row, 'up') : cursor.value.col;
    void moveTo(cursor.value.row, col, false).then(() => focusGrid());
    return;
  }
  const next = cursor.value.row + 1;
  if (next >= orderedRows.value.length) return;
  const col = from ? columnAligned(from, next, 'down') : cursor.value.col;
  void moveTo(next, col, false).then(() => focusGrid());
}

function focusDrawerStep(dir: 1 | -1, stay = false): void {
  const fields = drawerFields();
  const active = document.activeElement;
  const index = fields.findIndex((field) => field === active || field.contains(active));
  const next = fields[index + dir];
  if (next) focusControl(next);
  else if (dir < 0 && !stay) focusGrid();
}

/** After a drawer dialog is saved, focus the cell to the right of `fieldId`. */
function focusDrawerAfter(fieldId: string): void {
  editing.value = false;
  footIndex.value = null;
  void nextTick(() => {
    const fields = drawerFields();
    const index = fields.findIndex((field) => field.getAttribute('data-drawer-field') === fieldId);
    focusControl(fields[index + 1] ?? fields[index]);
  });
}

function focusColumn(columnId: string): void {
  focusCell(cursor.value.row, columnId);
}

function drawerCellClosed(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const field = target.closest('[data-drawer-field]');
  return field?.getAttribute('data-drawer-open') !== 'true';
}

function drawerPlace(target: EventTarget | null): DrawerPlace | null {
  if (!(target instanceof HTMLElement)) return null;
  const host = target.closest('.desk-row-drawer');
  if (!host) return null;
  const fields = [...host.querySelectorAll<HTMLElement>('[data-drawer-field]')];
  const index = fields.findIndex((field) => field === target || field.contains(target));
  if (fields.length === 0 || index <= 0) return 'drawer-first';
  if (index === fields.length - 1) return 'drawer-last';
  return 'drawer-mid';
}

useDeskFields(() => {
  if (displayOnly.value) return [];
  return [
    {
      id: gridId,
      focus: () => {
        focusEntry();
        return true;
      },
      jumpTo: gridJumpTo,
      jumpFrom: gridJumpFrom,
      focusNear: gridFocusNear,
    },
  ];
});

let padObserver: ResizeObserver | null = null;

onMounted(() => {
  if (scroller.value) {
    padObserver = new ResizeObserver(() => syncPad());
    padObserver.observe(scroller.value);
    void nextTick(() => {
      const table = scroller.value?.querySelector('table');
      if (table) padObserver?.observe(table);
      syncPad();
    });
  }
  void columnLayout.loadPrefs();
  if (props.storageKey) {
    const key = props.storageKey;
    const strings = (ids: unknown): Set<string> => new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []);
    void Promise.all([readDeskPrefOrLocal<unknown>(`grid-columns:${key}`, key), readDeskPref<unknown>(`grid-shown:${key}`)]).then(([ids, shown]) => {
      if (key !== props.storageKey) return;
      userHidden.value = strings(ids);
      userShown.value = strings(shown);
      hiddenLoaded.value = true;
      emit('update:hidden', [...hidden.value]);
    });
  } else {
    hiddenLoaded.value = true;
    emit('update:hidden', [...hidden.value]);
  }
  void nextTick(() => {
    placeSquare();
    // Only a grid that already has the focus opens its cell: one mounting while the user works elsewhere (a form
    // loading its rows) must not take the focus.
    if (gridActive.value) arriveEdit();
    syncDynamicResizeObserver();
  });
});

watch(
  () => [footPinned.value, rows.value.length, props.foot.length, visibleColumns.value.length, hasSummary.value, cursor.value.row],
  () => {
    void nextTick(() => syncPad());
  },
);

// While a cell is being typed in, Ctrl+S or a dialog's OK writes it first (`openEditors`).
let releaseOpenEditor: (() => void) | null = null;
watch(editing, (open) => {
  releaseOpenEditor?.();
  releaseOpenEditor = open ? registerOpenEditor(commitInPlace) : null;
});

onUnmounted(() => {
  releaseOpenEditor?.();
  releaseOpenEditor = null;
  padObserver?.disconnect();
  dynamicResizeObs?.disconnect();
  dynamicResizeObs = null;
  if (dynamicResizeTimer) clearTimeout(dynamicResizeTimer);
  onResizeEnd();
  onColumnDragEnd();
});

const rootEl = ref<HTMLElement | null>(null);

// A loading grid is pending work, so `waitIdle` waits for it.
let endLoading: (() => void) | null = null;
watch(
  () => props.loading,
  (loading) => {
    if (loading && !endLoading) endLoading = beginDeskWork(`grid ${props.name || props.fieldId || 'grid'} loading`);
    if (!loading && endLoading) {
      endLoading();
      endLoading = null;
    }
  },
  { immediate: true },
);
onUnmounted(() => endLoading?.());

/** A row by index, `#index`, or its key. */
function automationRowIndex(spec: unknown): number {
  if (typeof spec === 'number') return spec;
  const text = plainText(spec);
  if (/^#?\d+$/.test(text)) return Number(text.replace('#', ''));
  return orderedRows.value.findIndex((row, index) => (props.rowKey ? props.rowKey(row) : String(row.id ?? index)) === text);
}

function automationColIndex(spec: unknown): number {
  if (typeof spec === 'number') return spec;
  return visibleColumns.value.findIndex((column) => column.id === String(spec));
}

function sameLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

interface CellTarget {
  row: number;
  col: number;
}

function automationTarget(rowSpec: unknown, colSpec: unknown): CellTarget | { error: string } {
  const row = automationRowIndex(rowSpec);
  const col = automationColIndex(colSpec);
  if (row < 0 || row >= orderedRows.value.length) return { error: `no row ${String(rowSpec)} (rows: ${orderedRows.value.length})` };
  if (col < 0) return { error: `no visible column ${String(colSpec)}`, } as { error: string };
  return { row, col };
}

async function automationSetCell(rowSpec: unknown, colSpec: unknown, value: unknown): Promise<unknown> {
  const target = automationTarget(rowSpec, colSpec);
  if ('error' in target) return { ok: false, error: target.error, reason: `columns: ${visibleColumns.value.map((column) => column.id).join(', ')}` };
  await moveTo(target.row, target.col, false);
  focusGrid();
  const column = activeColumn.value;
  const row = rowAt(target.row);
  if (!column || !row) return { ok: false, error: 'cell not available' };
  if (isReadonly(column, row)) return { ok: false, error: `${column.id} is read only on row ${target.row}` };
  startEdit();
  if (!editing.value) return { ok: false, error: `${column.id} cannot be edited here` };
  const lookup = column.lookup ? resolveColumnLookup(column, row) : undefined;
  if (lookup) {
    const text = value === null ? '' : typeof value === 'object' ? plainText((value as Record<string, unknown>).label) : plainText(value);
    if (text === '') {
      draft.value = '';
      lookupPick.value = column.blank ? ({ __deskBlank: true } as Record<string, unknown>) : null;
      commitLookup('enter');
      return { ok: true };
    }
    const search = deskHost().searchLookup;
    const hits = search ? await search(lookup, text) : [];
    const label = (hit: Record<string, unknown>): string => lookupField(hit, lookup.labelKey);
    const hit = hits.find((item) => sameLabel(label(item), text) || plainText(item.id) === text) ?? (hits.length === 1 ? hits[0] : undefined);
    if (!hit) {
      if (lookup.acceptTyped && column.commit) {
        draft.value = text;
        lookupPick.value = null;
        commitLookup('enter');
        return { ok: true, typed: true };
      }
      cancelEdit();
      return { ok: false, error: `no single match for "${text}"`, reason: `candidates: ${hits.slice(0, 8).map(label).join(' | ')}` };
    }
    lookup.onPick?.(hit);
    lookupPick.value = hit;
    draft.value = label(hit);
    commitLookup('enter');
    return { ok: true, value: label(hit) };
  }
  draft.value = value === null || value === undefined ? '' : plainText(value);
  commitEdit(true);
  return { ok: true };
}

function automationCell(row: DeskGridRow, column: DeskColumn): { value: unknown; shown: string } {
  const raw = column.relation ? (row[column.relation.as] as Record<string, unknown> | undefined)?.[column.relation.field] : row[column.id];
  let text: string;
  try {
    text = cellText(column, row);
  } catch {
    text = '';
  }
  return { value: raw ?? null, shown: text };
}

function automationRowActions(row: DeskGridRow): { name: string; label: string; enabled: boolean; reason: string; denied?: true }[] {
  return (props.rowActions?.(row) ?? []).map((action) => ({
    name: action.name,
    label: action.label,
    ...(action.denied ? { denied: true as const } : {}),
    enabled: !action.disabled && action.missingData !== true,
    reason: action.disabled || action.missingData ? (action.title ?? (action.missingData ? 'the active layout does not load a field this action needs' : 'not available')) : '',
  }));
}

function automationDrawer(rowSpec: unknown): { root: HTMLElement | null; index: number } {
  const index = automationRowIndex(rowSpec);
  return { root: drawerOf(index), index };
}

useDeskAutomationNode({
  kind: 'grid',
  name: () => props.name || props.fieldId || props.storageKey || gridId,
  el: () => rootEl.value,
  audit: () => {
    const out: string[] = [];
    if (!props.name && !props.fieldId && !props.storageKey) out.push('grid has no name, fieldId or storageKey');
    if (props.columns.some((column) => !column.id)) out.push('a column has no id');
    return out;
  },
  read: (options) => {
    const offset = options.rows?.offset ?? 0;
    const limit = options.rows?.limit ?? 20;
    const cols = visibleColumns.value;
    const all = orderedRows.value;
    const slice = all.slice(offset, offset + limit);
    return {
      mode: props.mode,
      rowCount: all.length,
      totalRowCount: props.totalRowCount,
      loading: props.loading,
      page: props.page,
      pageCount: props.pageCount,
      pageSize: props.pageSize,
      pageSizeChoice: props.pageSizeChoice ?? null,
      itemCount: props.itemCount,
      editing: editing.value,
      cursor: { row: cursor.value.row, col: cursor.value.col, columnId: cols[cursor.value.col]?.id ?? null, foot: footIndex.value },
      selected: [...selectedRows.value],
      sort: props.sortColumn ? { column: props.sortColumn, descending: props.sortDescending } : null,
      filters: { ...filters },
      columns: cols.map((column, index) => {
        const enter = column.enter as { type?: string; dialog?: string; when?: unknown } | undefined;
        return {
          index,
          id: column.id,
          header: column.header,
          editor: column.editor ?? column.type ?? 'text',
          ...(column.multiple === true ? { multiple: true } : {}),
          readonly: typeof column.readonly === 'function' ? 'by row' : column.readonly === true,
          pinned: column.pin ?? null,
          width: columnLayout.effectiveWidth(column.id),
          ...(enter?.type === 'dialog' ? { dialog: enter.dialog, when: typeof enter.when === 'function' ? 'custom' : (enter.when ?? 'change') } : {}),
        };
      }),
      hiddenColumns: [...hidden.value],
      rows: slice.map((row, i) => {
        const index = offset + i;
        const cells: Record<string, unknown> = {};
        for (const column of cols) cells[column.id] = automationCell(row, column);
        return { index, key: props.rowKey ? props.rowKey(row) : String(row.id ?? index), ...(row.__group === true ? { group: true } : {}), cells };
      }),
      totals: props.totals ?? null,
      footLines: props.foot?.map((line) => ({ id: line.id, editable: line.edit !== undefined })) ?? [],
      summary: hasSummary.value,
    };
  },
  brief: () => ({ rows: orderedRows.value.length, cursor: `${cursor.value.row},${cursor.value.col}`, editing: editing.value, page: props.page, loading: props.loading }),
  ops: () => ({
    rows: {
      description: 'Read rows as shown: a sample, a page, rows matching text, or rows by key. JSON or CSV. Changes nothing.',
      args: {
        offset: { type: 'number', optional: true },
        limit: { type: 'number', optional: true, description: `default 20, at most ${DESK_GRID_ROWS_MAX}` },
        columns: { type: 'any', optional: true, description: 'column ids or headers; default all visible' },
        match: { type: 'any', optional: true, description: 'text found in any cell, or { column: text }' },
        keys: { type: 'any', optional: true, description: 'row keys' },
        format: { type: 'string', optional: true, description: 'json (default) or csv' },
      },
      run: (args) => {
        const cols = visibleColumns.value;
        return deskGridRows(
          {
            rows: orderedRows.value.filter((row) => row.__group !== true),
            columns: cols.map((column) => ({ id: column.id, header: column.header })),
            text: (row, columnId) => {
              const column = cols.find((item) => item.id === columnId);
              return column ? automationCell(row, column).shown : '';
            },
            key: (row, index) => (props.rowKey ? props.rowKey(row) : plainText(row.id ?? index)),
            totalRowCount: props.totalRowCount,
          },
          args,
        );
      },
    },
    focus: {
      description: 'Move the cursor to a cell',
      args: { row: { type: 'any' }, col: { type: 'any' } },
      run: async (args) => {
        const target = automationTarget(args.row, args.col);
        if ('error' in target) return { ok: false, error: target.error };
        await moveTo(target.row, target.col, false);
        focusGrid();
        return { ok: true };
      },
    },
    setCell: {
      description: 'Type a value into a cell and commit it, as Enter would (lookups are searched and picked)',
      args: { row: { type: 'any', description: 'index, #index or row key' }, col: { type: 'string' }, value: { type: 'any' } },
      run: (args) => automationSetCell(args.row, args.col, args.value),
    },
    enter: {
      description: 'Press Enter on a cell: moves on or opens the cell dialog the column asks for',
      args: { row: { type: 'any' }, col: { type: 'any' } },
      run: async (args) => {
        const target = automationTarget(args.row, args.col);
        if ('error' in target) return { ok: false, error: target.error };
        await moveTo(target.row, target.col, false);
        focusGrid();
        await applyEnter(false, false);
        return { ok: true };
      },
    },
    openCellDialog: {
      description: 'Ctrl+Enter on a cell: opens its dialog even when Enter would not',
      args: { row: { type: 'any' }, col: { type: 'any' } },
      run: async (args) => {
        const target = automationTarget(args.row, args.col);
        if ('error' in target) return { ok: false, error: target.error };
        await moveTo(target.row, target.col, false);
        focusGrid();
        if (!cellHasDialog(true)) return { ok: false, error: 'this cell has no dialog', reason: `column ${String(args.col)} does not open a dialog on Ctrl+Enter` };
        openCellDialog();
        return { ok: true };
      },
    },
    back: {
      description: 'Shift+Enter from a cell: go to the previous cell',
      args: { row: { type: 'any' }, col: { type: 'any' } },
      run: async (args) => {
        const target = automationTarget(args.row, args.col);
        if ('error' in target) return { ok: false, error: target.error };
        await moveTo(target.row, target.col, false);
        focusGrid();
        await moveBack(true);
        return { ok: true };
      },
    },
    addRow: { description: 'Add a blank entry row', run: () => addRow() },
    select: {
      description: 'Select rows (row selection grids)',
      args: { rows: { type: 'array' } },
      run: (args) => {
        const next = new Set<number>();
        for (const spec of (args.rows ?? []) as unknown[]) {
          const index = automationRowIndex(spec);
          if (index >= 0 && index < orderedRows.value.length) next.add(index);
        }
        selectedRows.value = next;
        return { ok: true, selected: [...next] };
      },
    },
    open: {
      description: 'Open a row, as Enter does in a list',
      args: { row: { type: 'any' } },
      run: (args) => {
        const row = rowAt(automationRowIndex(args.row));
        if (!row) return { ok: false, error: `no row ${String(args.row)}` };
        emit('open', row);
        return { ok: true };
      },
    },
    rowActions: {
      description: 'List the actions of a row with enabled and the reason when not',
      args: { row: { type: 'any' } },
      run: (args) => {
        const row = rowAt(automationRowIndex(args.row));
        return row ? automationRowActions(row) : { ok: false, error: `no row ${String(args.row)}` };
      },
    },
    runRowAction: {
      description: 'Run a row action by name',
      args: { row: { type: 'any' }, name: { type: 'string' } },
      run: (args) => {
        const row = rowAt(automationRowIndex(args.row));
        if (!row) return { ok: false, error: `no row ${String(args.row)}` };
        const action = automationRowActions(row).find((item) => item.name === String(args.name));
        if (!action) return { ok: false, error: `no action ${String(args.name)}`, reason: `actions: ${automationRowActions(row).map((item) => item.name).join(', ')}` };
        if (!action.enabled) return { ok: false, error: `${action.name} is not available`, reason: action.reason };
        emit('action', { name: action.name, row });
        return { ok: true };
      },
    },
    sort: {
      description: 'Sort a list by a column',
      args: { col: { type: 'string' } },
      run: (args) => {
        emit('sort', String(args.col));
        return { ok: true };
      },
    },
    filter: {
      description: 'Set a column filter text (list grids)',
      args: { col: { type: 'string' }, text: { type: 'string' } },
      run: (args) => {
        filters[String(args.col)] = plainText(args.text);
        emit('filter', { ...filters });
        return { ok: true };
      },
    },
    page: {
      description: 'Go to a page of a paged list',
      args: { page: { type: 'number' } },
      run: (args) => {
        const page = Number(args.page);
        if (!(page >= 1 && page <= Math.max(1, props.pageCount))) return { ok: false, error: `page must be 1 to ${props.pageCount}` };
        emit('page', page);
        return { ok: true };
      },
    },
    pageSize: {
      description: 'Choose a page size the footer offers: a number, dynamic, infinite, or all',
      args: { size: { type: 'any', description: 'one of the sizes this grid lists, such as 1000 or all' } },
      run: (args) => {
        const offered = pageSizeOptions.value;
        if (offered.length === 0) return { ok: false, error: 'this grid has no page-size menu' };
        const wanted = args.size;
        const match = offered.find((size) => size === wanted || String(size) === String(wanted));
        if (match === undefined) {
          return {
            ok: false,
            error: `page size ${String(wanted)} is not offered`,
            reason: offered.map((size) => pageSizeLabel(size)).join(', '),
          };
        }
        emit('update:pageSizeChoice', match);
        return { ok: true, size: match };
      },
    },
    drawer: {
      description: 'Read the drawer of a row: its fields and what they show',
      args: { row: { type: 'any' } },
      run: (args) => {
        const { root } = automationDrawer(args.row);
        if (!root) return { ok: false, error: 'no drawer is open for that row', reason: 'move the cursor to the row first (drawerRows=cursor)' };
        return [...root.querySelectorAll('[data-desk-field]')].map((el) => ({ id: el.getAttribute('data-desk-field'), shown: shownText(el) }));
      },
    },
    drawerSet: {
      description: 'Type into a drawer field of a row',
      args: { row: { type: 'any' }, field: { type: 'string' }, value: { type: 'any' } },
      run: async (args) => {
        const index = automationRowIndex(args.row);
        if (index < 0 || index >= orderedRows.value.length) return { ok: false, error: `no row ${String(args.row)}` };
        if (!drawerOf(index)) {
          await moveTo(index, 0, false);
          await nextTick();
        }
        const root = drawerOf(index);
        const el = [...(root?.querySelectorAll('[data-desk-field]') ?? [])].find((item) => item.getAttribute('data-desk-field') === String(args.field));
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return { ok: false, error: `no drawer input ${String(args.field)}` };
        focusDrawer(index, String(args.field));
        const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, args.value === null || args.value === undefined ? '' : plainText(args.value));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      },
    },
    drawerEnter: {
      description: 'Press Enter in a drawer field',
      args: { row: { type: 'any' }, field: { type: 'string' } },
      run: async (args) => {
        const index = automationRowIndex(args.row);
        focusDrawer(index, String(args.field));
        await pressDeskKey('enter');
        return { ok: true };
      },
    },
    footEdit: {
      description: 'Open the edit dialog of a total line',
      args: { id: { type: 'string' } },
      run: (args) => {
        const line = props.foot?.find((item) => item.id === String(args.id));
        if (!line) return { ok: false, error: `no total line ${String(args.id)}`, reason: `lines: ${(props.foot ?? []).map((item) => item.id).join(', ')}` };
        if (!line.edit) return { ok: false, error: `${line.id} has no editor` };
        emit('foot', line.edit);
        return { ok: true };
      },
    },
    toggleColumn: { description: 'Show or hide a column', args: { col: { type: 'string' } }, run: (args) => toggleColumn(String(args.col)) },
    setWidth: { description: 'Set a column width in pixels', args: { col: { type: 'string' }, px: { type: 'number' } }, run: (args) => columnLayout.setWidth(String(args.col), Number(args.px)) },
    moveColumn: {
      description: 'Move a column before another one (null: to the end)',
      args: { col: { type: 'string' }, before: { type: 'string', optional: true } },
      run: (args) => (columnLayout.moveColumn(plainText(args.col), args.before ? plainText(args.before) : null) ? { ok: true } : { ok: false, error: 'that move is not allowed (pinned or unknown column)' }),
    },
    textLayout: {
      description: 'Set how a column wraps text',
      args: { col: { type: 'string' }, layout: { type: 'string' } },
      run: (args) => columnLayout.setTextLayout(String(args.col), args.layout as DeskColumnTextLayout),
    },
  }),
});

defineExpose<DeskGridApi>({ focusFirstRow, focusGrid, focusEntry, focusCell, focusColumn, moveTo, addRow, advanceRow, currentRow, focusDrawer, focusDrawerAfter, crossDrawer });
</script>

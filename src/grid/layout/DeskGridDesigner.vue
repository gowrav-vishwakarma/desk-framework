<template>
  <DeskDialog v-model:open="open" page panel-class="is-wide desk-grid-designer-panel" initial-focus="grid-layout-name" @close="emit('cancel')" @accept="save">
    <div class="desk-designer-frame desk-grid-studio" @keydown.capture="onStudioKey">
      <header class="desk-grid-studio-bar">
        <h3>Grid layout</h3>
        <label class="desk-grid-studio-name">
          <span class="sr-only">Name</span>
          <input v-model="draft.name" type="text" placeholder="Layout name" data-desk-field="grid-layout-name" />
        </label>
        <DesignerSelect label="Show as" field-id="grid-layout-kind" :value="draft.kind" :choices="KIND_CHOICES" @change="draft.kind = $event === 'tab' ? 'tab' : 'menu'" />
        <span class="desk-grid-studio-spacer" />
        <template v-if="listKey">
          <details ref="exportMenu" class="desk-grid-studio-menu">
            <summary data-desk-field="grid-layout-export" title="Save layouts to a file you can share">Export ▾</summary>
            <div class="desk-grid-studio-menu-list" role="menu">
              <button type="button" role="menuitem" @click="exportLayout">This layout</button>
              <button type="button" role="menuitem" :disabled="layoutCount === 0" @click="exportAll">All layouts ({{ layoutCount }})</button>
            </div>
          </details>
          <button type="button" title="Load a layout exported from this same list" data-desk-field="grid-layout-import" @click="pickImport">Import</button>
          <input ref="importInput" type="file" accept=".json,application/json" hidden @change="onImportFile" />
        </template>
        <button v-if="!isNew && draft.id !== DESK_DEFAULT_LAYOUT_ID" type="button" class="is-danger" data-desk-field="grid-layout-designer-delete" @click="emit('delete', draft.id)">Delete</button>
        <button type="button" data-desk-field="grid-layout-designer-cancel" @click="open = false; emit('cancel')">Cancel</button>
        <button type="button" class="is-primary" data-desk-field="grid-layout-save" @click="save">Save</button>
      </header>
      <div v-if="pendingAll" class="desk-grid-studio-import" role="alertdialog" aria-label="Import layouts">
        <p>
          <strong>{{ pendingAll.layouts.length }} layout{{ pendingAll.layouts.length > 1 ? 's' : '' }} in this file:</strong>
          {{ pendingAll.layouts.map((layout) => layout.name).join(', ') }}
        </p>
        <p v-if="pendingAll.dropped" class="hint">{{ pendingAll.dropped }} column{{ pendingAll.dropped > 1 ? 's' : '' }} used fields this list does not have and will be left out.</p>
        <p class="hint">
          <strong>Overwrite</strong> replaces
          <template v-if="pendingAll.replaces.length">{{ pendingAll.replaces.join(', ') }}</template>
          <template v-else>nothing here (no names match)</template>
          and adds the rest. <strong>Add</strong> keeps every layout you have and adds these as new ones. Both save at once, and unsaved changes in this editor are dropped.
        </p>
        <div class="desk-grid-studio-import-actions">
          <button type="button" class="is-primary" data-desk-field="grid-layout-import-overwrite" @click="confirmImportAll('overwrite')">Overwrite</button>
          <button type="button" @click="confirmImportAll('add')">Add as new</button>
          <button type="button" data-desk-field="grid-layout-apply-all-cancel" @click="pendingAll = null">Cancel</button>
        </div>
      </div>
      <p v-if="notice" class="desk-designer-note">{{ notice }}</p>
      <p v-else-if="info" class="desk-grid-studio-info">{{ info }}</p>

      <div class="desk-grid-studio-body" :style="{ '--studio-fields': `${fieldsWidth}px`, '--studio-settings': `${settingsWidth}px` }">
        <!-- Fields -->
        <aside class="desk-grid-studio-fields">
          <input v-model="search" type="search" placeholder="Search fields" data-desk-field="grid-layout-search" />
          <p class="desk-grid-studio-legend"><span class="is-used">●</span> on grid · <span>⇅</span> sorts · <span>⌕</span> filters</p>
          <section v-for="group in groups" :key="group.id">
            <h4 :class="{ 'is-list': group.many }" :draggable="group.many" @dragend="onDragEnd" @dragstart="group.many && onDragStart($event, { type: 'list', path: group.id })">
              {{ group.label }}<span v-if="group.many" class="hint"> list</span>
            </h4>
            <button
              v-for="field in group.fields"
              :key="field.key"
              type="button"
              class="desk-designer-chip desk-grid-studio-field"
              :class="{ 'is-used': usedKeys.has(field.key) }"
              draggable="true"
              :title="`${field.key} (${field.type})${usedKeys.has(field.key) ? ' · already on the grid' : ''}`"
              @dragend="onDragEnd" @dragstart="onDragStart($event, { type: 'field', key: field.key })"
              @click="addToSelected({ type: 'field', key: field.key })"
            >
              <span class="desk-grid-studio-dot" aria-hidden="true">●</span>
              <span class="desk-grid-studio-field-name">{{ field.label }}</span>
              <span class="desk-grid-studio-icons" aria-hidden="true">
                <span v-if="fieldSortable(catalog, field.key)" title="Can sort">⇅</span>
                <span v-if="fieldFilterable(catalog, field.key)" title="Can filter">⌕</span>
              </span>
            </button>
          </section>
        </aside>

        <div
          class="desk-grid-studio-split"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the fields list"
          tabindex="0"
          title="Drag to resize. Double-click to reset."
          @pointerdown="startResize('fields', $event)"
          @dblclick="resetPanes"
          @keydown="onSplitKey('fields', $event)"
        />

        <!-- Preview -->
        <div class="desk-grid-studio-preview" :class="{ 'is-drop-target': dragging }" @dragenter="onDragOver" @dragover="onDragOver" @drop="onDrop">
          <div class="desk-grid-designer-scroll">
            <table class="desk-grid-designer-preview">
              <thead>
                <tr>
                  <th v-for="column in lockedStart" :key="column.id" class="is-locked" title="Fixed by the list">
                    <span class="desk-grid-studio-head">{{ column.header }} 🔒<span class="desk-grid-studio-badges">{{ headBadges(column) }}</span></span>
                  </th>
                  <th
                    v-for="(column, columnIndex) in draft.columns"
                    :key="column.id"
                    :class="{ on: column.id === selected, 'is-drop-before': columnDrop === columnIndex, 'is-hidden-column': column.hidden }"
                    :style="column.width ? { minWidth: `${column.width}px` } : {}"
                    @click="selectColumn(column.id)"
                    @dragover="onColumnDragOver(columnIndex, $event)"
                    @drop.stop="onColumnDrop(columnIndex, $event)"
                  >
                    <span class="desk-grid-studio-head">
                      <span
                        class="desk-grid-studio-grip"
                        draggable="true"
                        title="Drag to move the column"
                        @dragstart.stop="onColumnDragStart(column.id, $event)"
                        @dragend="onColumnDragEnd"
                      >⠿</span>
                      <input
                        :value="column.header"
                        type="text"
                        :data-desk-field="`grid-layout-head-${column.id}`"
                        @focus="selectColumn(column.id)"
                        @input="patch(column.id, { header: ($event.target as HTMLInputElement).value })"
                      />
                      <span v-if="column.hidden" class="desk-grid-studio-hidden-mark" title="Hidden on the grid">hidden</span>
                      <span class="desk-grid-studio-badges" :title="headTitle(column)">{{ headBadges(column) }}</span>
                    </span>
                  </th>
                  <th v-for="column in lockedEnd" :key="column.id" class="is-locked" title="Fixed by the list">
                    <span class="desk-grid-studio-head">{{ column.header }} 🔒<span class="desk-grid-studio-badges">{{ headBadges(column) }}</span></span>
                  </th>
                  <th
                    class="desk-grid-designer-add"
                    :class="{ 'is-drop-before': columnDrop === draft.columns.length }"
                    @dragover="onColumnDragOver(draft.columns.length, $event)"
                    @drop.stop="onColumnDrop(draft.columns.length, $event)"
                  >
                    <button type="button" data-desk-field="grid-layout-add-column" @click="newColumn">+ Column</button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr class="desk-grid-studio-design">
                  <td v-for="column in lockedStart" :key="column.id" class="is-locked" />
                  <td v-for="column in draft.columns" :key="column.id" :class="{ on: column.id === selected }" @click="selectColumn(column.id)">
                    <div v-for="(line, lineIndex) in column.lines" :key="lineIndex" class="desk-grid-designer-line">
                      <span
                        v-for="(part, partIndex) in line"
                        :key="partIndex"
                        class="desk-grid-designer-part"
                        :class="{ 'is-list': typeof part !== 'string', on: isEditing(column.id, lineIndex, partIndex) }"
                        @click.stop="selected = column.id; editing = { column: column.id, line: lineIndex, index: partIndex }"
                      >
                        {{ partLabel(part) }}
                        <span v-if="column.id === selected" class="desk-grid-designer-part-tools">
                          <button v-if="partIndex > 0" type="button" title="Move left" @click.stop="move(column.id, lineIndex, partIndex, 'left')">‹</button>
                          <button v-if="partIndex < line.length - 1" type="button" title="Move right" @click.stop="move(column.id, lineIndex, partIndex, 'right')">›</button>
                          <button
                            v-if="lineIndex > 0 || line.length > 1"
                            type="button"
                            :title="lineIndex > 0 ? 'Move to the line above' : 'Put on its own line above'"
                            @click.stop="move(column.id, lineIndex, partIndex, 'up')"
                          >↑</button>
                          <button
                            v-if="lineIndex < column.lines.length - 1 || line.length > 1"
                            type="button"
                            :title="lineIndex < column.lines.length - 1 ? 'Move to the line below' : 'Put on its own line below'"
                            @click.stop="move(column.id, lineIndex, partIndex, 'down')"
                          >↓</button>
                          <button v-if="partIndex > 0" type="button" title="Start a new line here (this field and the ones after it)" @click.stop="split(column.id, lineIndex, partIndex)">↵</button>
                        </span>
                        <button type="button" title="Remove" @click.stop="apply(removePart(draft, column.id, lineIndex, partIndex))">×</button>
                      </span>
                    </div>
                    <div v-if="!column.lines.length" class="desk-grid-designer-line is-new">
                      {{ column.id === selected ? 'Click or drop fields here' : 'Empty column' }}
                    </div>
                  </td>
                  <td v-for="column in lockedEnd" :key="column.id" class="is-locked" />
                  <td />
                </tr>
                <tr v-for="(row, rowIndex) in previewRows" :key="rowIndex" class="desk-grid-studio-row">
                  <td v-for="column in lockedStart" :key="column.id" class="is-locked">{{ previewText(column, row) }}</td>
                  <td v-for="column in draft.columns" :key="column.id" :class="{ on: column.id === selected }" :style="column.align ? { textAlign: column.align } : {}" @click="selectColumn(column.id)">
                    <template v-for="(block, blockIndex) in previewBlocks(column, row)" :key="blockIndex">
                      <div v-if="block.kind === 'text'">{{ block.text }}</div>
                      <div v-else-if="block.kind === 'line'" class="desk-cell-line" :class="{ 'has-place': block.spans.some((span) => span.place === 'right') }">
                        <span v-for="(span, spanIndex) in block.spans" :key="spanIndex" :class="spanClass(span)" :style="spanStyle(span)">{{ span.text }}</span>
                      </div>
                      <div v-else>{{ blocksText([block]) }}</div>
                    </template>
                  </td>
                  <td v-for="column in lockedEnd" :key="column.id" class="is-locked">{{ previewText(column, row) }}</td>
                  <td />
                </tr>
                <tr v-if="previewRows.length === 0">
                  <td :colspan="lockedStart.length + draft.columns.length + lockedEnd.length + 1" class="desk-grid-studio-empty">
                    No rows loaded yet. The preview fills in once the list has rows.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="hint desk-grid-studio-tip">
            Select a column, then click or drag fields in. Click a field chip to style it. Drag ⠿ or press Alt+←/→ to move the selected column.
          </p>
        </div>

        <div
          class="desk-grid-studio-split"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the settings"
          tabindex="0"
          title="Drag to resize. Double-click to reset."
          @pointerdown="startResize('settings', $event)"
          @dblclick="resetPanes"
          @keydown="onSplitKey('settings', $event)"
        />

        <!-- Settings -->
        <aside class="desk-grid-studio-settings">
          <details class="desk-grid-studio-section" open>
            <summary>Opens with<span v-if="viewSummary" class="hint"> · {{ viewSummary }}</span></summary>
            <div class="desk-grid-studio-section-body">
              <p class="hint">Where the list starts. People can still change it.</p>
              <DeskFilterSavedFields
                v-if="panelFilter"
                :filter="panelFilter"
                :stored="draft.view?.panel ?? null"
                field-id="grid-layout-view-panel"
                @update="setViewPanel"
              />
              <template v-else>
              <div class="desk-grid-studio-pair">
                <DesignerSelect label="Sort by" field-id="grid-layout-view-sort" :value="draft.view?.sort?.column ?? ''" :choices="viewSortChoices" @change="setViewSort" />
                <DesignerSelect
                  v-if="draft.view?.sort"
                  label="Order"
                  field-id="grid-layout-view-direction"
                  :value="draft.view.sort.direction"
                  :choices="DIRECTION_CHOICES"
                  @change="setViewDirection"
                />
              </div>
              <div v-for="row in viewFilterRows" :key="row.id" class="desk-grid-designer-view-filter">
                <button type="button" class="desk-grid-studio-icon desk-grid-studio-corner" title="Remove filter" aria-label="Remove filter" @click="removeFilter(row.id)">×</button>
                <DesignerSelect label="Filter" :field-id="`grid-layout-view-filter-${row.id}`" :value="row.id" :choices="filterColumnChoices(row.id)" @change="setFilterColumn(row.id, $event)" />
                <DeskFilterEditor compact :kind="row.kind" :value="row.text" :choices="row.choices" @change="setFilterText(row.id, $event)" @chip="setFilterText(row.id, $event)" />
                <p class="hint">{{ row.summary }}</p>
              </div>
              <button v-if="filterColumnChoices('').length > 0" type="button" data-desk-field="grid-layout-view-add-filter" @click="addFilter">+ Filter</button>
              <p v-else-if="viewFilterRows.length === 0" class="hint">No column can filter. Set "Filter on" for a column first.</p>
              </template>
              <label v-if="draft.id !== DESK_DEFAULT_LAYOUT_ID" class="desk-grid-designer-checks">
                <input type="checkbox" :checked="draft.hideActions === true" data-desk-field="grid-layout-hide-actions" @change="onHideActions" />
                Hide row actions
              </label>
            </div>
          </details>

          <details class="desk-grid-studio-section" :open="Boolean(draft.note)">
            <summary>Note above grid<span v-if="draft.note" class="hint"> · {{ draft.note }}</span></summary>
            <div class="desk-grid-studio-section-body">
              <textarea
                class="desk-grid-studio-note"
                rows="3"
                :maxlength="DESK_LAYOUT_NOTE_MAX"
                placeholder="For example: Red MRP means the selling price is above MRP."
                data-desk-field="grid-layout-note"
                :value="draft.note ?? ''"
                @input="onNote"
              />
              <p class="hint">Shown above the list while this layout is open. {{ (draft.note ?? '').length }}/{{ DESK_LAYOUT_NOTE_MAX }}</p>
            </div>
          </details>

          <details v-if="current" class="desk-grid-studio-section" open>
            <summary>Column “{{ current.header }}”</summary>
            <div class="desk-grid-studio-section-body">
              <div class="desk-grid-studio-pair">
                <label class="desk-designer-style">
                  <span>Width</span>
                  <input type="number" min="40" max="800" placeholder="Auto" :value="current.width ?? ''" @change="onWidth" />
                </label>
                <DesignerSelect label="Align" field-id="grid-layout-align" :value="current.align ?? 'left'" :choices="ALIGN_CHOICES" @change="onAlign" />
              </div>
              <label class="desk-designer-style">
                <span>Between fields</span>
                <input type="text" :value="current.separator ?? ' '" @input="patch(current.id, { separator: ($event.target as HTMLInputElement).value })" />
              </label>
              <label class="desk-grid-designer-checks" title="Still fetched for its filter and sort. People can show it from the column picker.">
                <input type="checkbox" :checked="current.hidden === true" data-desk-field="grid-layout-column-hidden" @change="onColumnHidden" />
                Hidden on the grid (filter and sort still work)
              </label>
              <label class="desk-grid-designer-checks" title="Where the list groups rows (a head and its lines), a second line here draws into the lines below instead of making the head taller.">
                <input type="checkbox" :checked="current.spill === true" data-desk-field="grid-layout-column-spill" @change="onColumnSpill" />
                Let extra lines flow into the rows below
              </label>
              <DesignerSelect
                label="Same as the row above"
                field-id="grid-layout-column-repeats"
                :value="current.repeats ?? ''"
                :choices="REPEAT_CHOICES"
                @change="setRepeats(current.id, $event)"
              />
              <DesignerSelect label="Sort by" field-id="grid-layout-sort" :value="current.sortField ?? ''" :choices="sortChoices" @change="patch(current.id, { sortField: $event || null })" />
              <DesignerSelect label="Filter on" field-id="grid-layout-filter" :value="current.filterField ?? ''" :choices="filterChoices" @change="patch(current.id, { filterField: $event || null })" />
              <p v-if="current.filterField" class="hint">Filter type: {{ fieldOf(current.filterField)?.type ?? 'text' }}</p>
              <div v-if="hasCurrency(current)" class="desk-grid-studio-money">
                <h5>Currency</h5>
                <DesignerSelect label="On top" field-id="grid-layout-money-face" :value="current.money?.face ?? 'company'" :choices="FACE_CHOICES" @change="onMoney({ face: $event === 'document' ? 'document' : undefined })" />
                <DesignerSelect label="Symbols" field-id="grid-layout-money-symbol" :value="current.money?.symbol ?? 'auto'" :choices="SYMBOL_CHOICES" @change="onMoney({ symbol: $event === 'always' || $event === 'never' ? $event : undefined })" />
                <label class="desk-grid-designer-checks">
                  <input type="checkbox" :checked="current.money?.second !== false" data-desk-field="grid-layout-money-second" @change="onMoney({ second: ($event.target as HTMLInputElement).checked ? undefined : false })" />
                  Show the other currency under it
                </label>
                <p class="hint">Rows in the company currency show one amount. Rows in another currency show both: the company amount (converted at the row's rate) and the row's own amount. This decides which is on top.</p>
              </div>
              <div class="desk-grid-designer-buttons">
                <button type="button" title="Move left" @click="apply(moveColumn(draft, current.id, -1))">←</button>
                <button type="button" title="Move right" @click="apply(moveColumn(draft, current.id, 1))">→</button>
                <button type="button" class="is-danger" @click="dropColumn(current.id)">Remove column</button>
              </div>
            </div>
          </details>
          <p v-else class="hint desk-grid-studio-nothing">Select a column in the preview to change its width, sort, and filter.</p>

          <details v-if="editingPart" class="desk-grid-studio-section" open>
            <summary>List “{{ relationLabel(editingPart.list) }}”</summary>
            <div class="desk-grid-studio-section-body">
              <div class="desk-grid-designer-checks">
                <label v-for="field in listFields(editingPart.list)" :key="field.key">
                  <input type="checkbox" :checked="editingPart.fields.includes(field.key)" @change="toggleListField(field.key)" />
                  {{ field.label }}
                </label>
              </div>
              <DesignerSelect label="Show as" field-id="grid-layout-list-show" :value="editingPart.show" :choices="SHOW_CHOICES" @change="patchList({ show: showOf($event) })" />
              <label class="desk-designer-style">
                <span>Label before values</span>
                <input type="text" :value="editingPart.label ?? ''" placeholder="None" @input="onPartLabel" />
              </label>
              <label class="desk-designer-style">
                <span>At most (up to {{ maxOf(editingPart.list) }})</span>
                <input type="number" min="1" :max="maxOf(editingPart.list)" :value="editingPart.max" @change="onMax" />
              </label>
            </div>
          </details>

          <template v-if="editingField">
            <details class="desk-grid-studio-section" open>
              <summary>Field “{{ editingField.name }}”</summary>
              <div class="desk-grid-studio-section-body">
                <label class="desk-designer-style">
                  <span>Label</span>
                  <span class="desk-grid-studio-inline">
                    <input type="text" :value="editingField.label" placeholder="None" data-desk-field="grid-layout-field-label" @input="onPartLabel" />
                    <button type="button" @click="onPartLabelText(editingField.label ? '' : editingField.suggest)">
                      {{ editingField.label ? 'Clear' : `Use “${editingField.suggest}”` }}
                    </button>
                  </span>
                </label>
                <div class="desk-grid-studio-pair">
                  <DesignerSelect label="Look" field-id="grid-layout-look" :value="editingField.look" :choices="LOOK_CHOICES" @change="onLook" />
                  <DesignerSelect label="Color" field-id="grid-layout-tone" :value="editingField.tone" :choices="TONE_CHOICES" @change="onTone" />
                  <DesignerSelect label="Size" field-id="grid-layout-size" :value="editingField.size" :choices="SIZE_CHOICES" @change="onSize" />
                  <DesignerSelect label="Place" field-id="grid-layout-place" :value="editingField.place" :choices="PLACE_CHOICES" @change="onPlace" />
                </div>
                <label class="desk-grid-designer-checks"><input type="checkbox" :checked="editingField.bold" @change="onBold" /> Bold</label>
              </div>
            </details>
            <details class="desk-grid-studio-section">
              <summary>Padding<span class="hint"> · {{ padSummary(editingField.pad) }}</span></summary>
              <div class="desk-grid-studio-section-body">
                <div class="desk-grid-designer-pad">
                  <label>Top<input type="number" min="0" max="32" :placeholder="String(DESK_FIELD_PAD.top)" :value="padValue(editingField.pad.top)" @change="onPad('top', $event)" /></label>
                  <label>Right<input type="number" min="0" max="32" :placeholder="String(DESK_FIELD_PAD.right)" :value="padValue(editingField.pad.right)" @change="onPad('right', $event)" /></label>
                  <label>Bottom<input type="number" min="0" max="32" :placeholder="String(DESK_FIELD_PAD.bottom)" :value="padValue(editingField.pad.bottom)" @change="onPad('bottom', $event)" /></label>
                  <label>Left<input type="number" min="0" max="32" :placeholder="String(DESK_FIELD_PAD.left)" :value="padValue(editingField.pad.left)" @change="onPad('left', $event)" /></label>
                </div>
                <p class="hint">Empty keeps the default.</p>
              </div>
            </details>
            <details class="desk-grid-studio-section" :open="editingField.rules.length > 0">
              <summary>Rules<span class="hint"> · {{ editingField.rules.length }}/5</span></summary>
              <div class="desk-grid-studio-section-body">
                <p class="hint">The first matching rule changes look, color, and bold on that row. <code>this</code> is this field. Checked as data, never run as code.</p>
                <div v-for="(rule, ruleIndex) in editingField.rules" :key="ruleIndex" class="desk-grid-designer-rule">
                  <label class="desk-designer-style">
                    <span>When</span>
                    <span class="desk-rule-expr">
                      <input type="text" spellcheck="false" autocomplete="off" placeholder="sellingPrice > mrp" :data-desk-field="`grid-layout-rule-when-${ruleIndex}`" :value="ruleSource(rule)" @input="onRuleWhen(ruleIndex, $event)" />
                      <DesignerSelect bare button-label="Field" label="Insert field" :field-id="`grid-layout-rule-insert-${ruleIndex}`" value="" :choices="insertFieldChoices" @change="onInsertField(ruleIndex, $event)" />
                    </span>
                  </label>
                  <p v-if="ruleProblem(rule)" class="desk-designer-note">{{ ruleProblem(rule) }}</p>
                  <div class="desk-grid-studio-pair">
                    <DesignerSelect label="Then look" :field-id="`grid-layout-rule-look-${ruleIndex}`" :value="rule.look ?? editingField.look" :choices="LOOK_CHOICES" @change="patchRule(ruleIndex, { look: lookOf($event) })" />
                    <DesignerSelect label="Then color" :field-id="`grid-layout-rule-tone-${ruleIndex}`" :value="rule.tone ?? 'danger'" :choices="TONE_CHOICES" @change="patchRule(ruleIndex, { tone: toneOf($event) })" />
                  </div>
                  <div class="desk-grid-studio-filter-head">
                    <label class="desk-grid-designer-checks"><input type="checkbox" :checked="rule.bold === true" @change="onRuleBold(ruleIndex, $event)" /> Bold</label>
                    <button type="button" class="desk-grid-studio-icon" title="Remove rule" @click="removeRule(ruleIndex)">×</button>
                  </div>
                </div>
                <button v-if="editingField.rules.length < 5" type="button" @click="addRule">+ Rule</button>
              </div>
            </details>
          </template>
        </aside>
      </div>
    </div>
  </DeskDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import DeskDialog from '../../form/DeskDialog.vue';
import DesignerSelect from '../../formLayout/designer/DesignerSelect.vue';
import DeskFilterEditor from '../DeskFilterEditor.vue';
import DeskFilterSavedFields from '../../filter/DeskFilterSavedFields.vue';
import type { DeskSavedFilter } from '../../filter/saved';
import { describeFilter, type HeaderFilterKind } from '../headerFilter';
import type { DeskMoneyView } from '../../currency/money';
import { blocksText, catalogField, cloneLayout, catalogRelation, cellBlocks, fieldFilterable, fieldSortable, listMaxItems, lockedColumns, manyRelationOf, partKeys, ruleFieldKeys, spanClass, spanStyle } from './compile';
import { parseRule, ruleSource } from './ruleExpr';
import { applyImported, exportLayoutFile, exportLayoutsFile, layoutFileName, layoutsFileName, overwrittenNames, readLayoutFile, type DeskLayoutImportMode } from './transfer';
import {
  addColumn,
  dropPart,
  moveColumn,
  moveColumnTo,
  movePart,
  pruneLayoutView,
  removeColumn,
  removePart,
  replacePart,
  splitLine,
  setPartLabel,
  updateColumn,
  updateFieldPart,
  type DeskDesignerPayload,
  type DeskDesignerSpot,
  type DeskPartMove,
} from './edit';
import { newLayoutId } from './useDeskGridLayouts';
import type { DeskCellBlock } from '../types';
import type { DeskCatalogField, DeskCellPart, DeskFieldCatalog, DeskFieldFormatters, DeskGridLayout, DeskGridLayoutView, DeskLayoutColumn, DeskListPart, DeskListShow, DeskPartLook, DeskPartPad, DeskPartPlace, DeskPartSize, DeskPartStyle, DeskPartTone, DeskStyleRule } from './types';
import { DESK_DEFAULT_LAYOUT_ID, DESK_FIELD_PAD, DESK_LAYOUT_NOTE_MAX, isFieldPart, isListPart, partFieldKey } from './types';

const open = defineModel<boolean>('open', { required: true });
const props = withDefaults(
  defineProps<{
    layout: DeskGridLayout;
    catalog: DeskFieldCatalog;
    formatters?: DeskFieldFormatters;
    /** A loaded row, for the preview line under each cell. */
    sample?: Record<string, unknown> | null;
    /** Loaded rows for the preview. The first three are shown. Wins over `sample`. */
    samples?: readonly Record<string, unknown>[];
    /** The list's storage key. Turns on Export and Import; a file imports only into the same list. */
    listKey?: string;
    /** Every layout of the list, Default included, for Export all and the import choice. */
    allLayouts?: readonly DeskGridLayout[];
    isNew?: boolean;
    /**
     * The page's filter panel, for a page that saves panel values in its layouts (see
     * `deskSavedFilter`). "Opens with" then shows those fields in place of column filters.
     */
    panelFilter?: DeskSavedFilter | null;
  }>(),
  { formatters: () => ({}), sample: null, samples: () => [], allLayouts: () => [], isNew: false, panelFilter: null },
);
const emit = defineEmits<{
  save: [layout: DeskGridLayout];
  cancel: [];
  delete: [id: string];
  /** A file of all layouts, with the user's choice. The host saves them. */
  importAll: [payload: { layouts: DeskGridLayout[]; mode: DeskLayoutImportMode }];
}>();

const REPEAT_CHOICES = [
  { value: '', label: 'Show the value' },
  { value: 'hide', label: 'Leave blank' },
  { value: 'dim', label: 'Show it dimmed' },
];
const KIND_CHOICES = [
  { value: 'menu', label: 'Designer menu' },
  { value: 'tab', label: 'Tab' },
];
const ALIGN_CHOICES = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];
const LOOK_CHOICES = [
  { value: 'text', label: 'Text' },
  { value: 'chip', label: 'Chip' },
  { value: 'box', label: 'Box' },
];
const TONE_CHOICES = [
  { value: 'default', label: 'Default' },
  { value: 'muted', label: 'Muted' },
  { value: 'success', label: 'Green' },
  { value: 'warning', label: 'Amber' },
  { value: 'danger', label: 'Red' },
  { value: 'info', label: 'Blue' },
];
const PLACE_CHOICES = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];
const SIZE_CHOICES = [
  { value: 'small', label: 'Small' },
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Large' },
];
const FACE_CHOICES = [
  { value: 'company', label: 'Company currency' },
  { value: 'document', label: 'Document currency' },
];
const SYMBOL_CHOICES = [
  { value: 'auto', label: 'Only on other currencies' },
  { value: 'always', label: 'On every amount' },
  { value: 'never', label: 'Never' },
];
const DIRECTION_CHOICES = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
];
const SHOW_CHOICES = [
  { value: 'comma', label: 'Comma separated' },
  { value: 'space', label: 'Space separated' },
  { value: 'lines', label: 'One per line' },
  { value: 'table', label: 'Small table' },
];

const draft = ref<DeskGridLayout>(cloneLayout(props.layout));
const selected = ref<string>(draft.value.columns[0]?.id ?? '');
const editing = ref<{ column: string; line: number; index: number } | null>(null);
const search = ref('');
const notice = ref('');
/** A neutral message, such as what an import did. */
const info = ref('');
const importInput = ref<HTMLInputElement | null>(null);
const exportMenu = ref<HTMLDetailsElement | null>(null);
const layoutCount = computed(() => props.allLayouts?.length ?? 0);
/** A file of all layouts waiting for Overwrite, Add, or Cancel. */
const pendingAll = ref<{ layouts: DeskGridLayout[]; dropped: number; replaces: string[] } | null>(null);

watch(
  () => props.layout,
  (next) => {
    draft.value = cloneLayout(next);
    selected.value = next.columns[0]?.id ?? '';
    editing.value = null;
    notice.value = '';
  },
);

const lockedStart = computed(() => lockedColumns(props.catalog, 'start'));
const lockedEnd = computed(() => lockedColumns(props.catalog, 'end'));
const current = computed(() => draft.value.columns.find((column) => column.id === selected.value) ?? null);

const editingPart = computed((): DeskListPart | null => {
  const part = partAt(editing.value);
  return part && isListPart(part) ? part : null;
});

const editingField = computed((): {
  name: string;
  label: string;
  suggest: string;
  look: DeskPartLook;
  tone: DeskPartTone;
  size: DeskPartSize;
  bold: boolean;
  place: DeskPartPlace;
  pad: DeskPartPad;
  rules: DeskStyleRule[];
} | null => {
  const part = partAt(editing.value);
  const key = part ? partFieldKey(part) : null;
  if (!part || !key) return null;
  const name = fieldOf(key)?.label ?? key;
  const style = isFieldPart(part) ? part.style : undefined;
  return {
    name,
    label: isFieldPart(part) ? (part.label ?? '') : '',
    suggest: name,
    look: style?.look ?? 'text',
    tone: style?.tone ?? 'default',
    size: style?.size ?? 'normal',
    bold: style?.bold === true,
    place: style?.place ?? 'left',
    pad: { ...style?.pad },
    rules: isFieldPart(part) ? [...(part.rules ?? [])] : [],
  };
});

interface FieldGroup {
  id: string;
  label: string;
  many: boolean;
  fields: DeskCatalogField[];
}

const groups = computed((): FieldGroup[] => {
  const text = search.value.trim().toLowerCase();
  const byGroup = new Map<string, FieldGroup>();
  const root: FieldGroup = { id: '', label: 'Main', many: false, fields: [] };
  byGroup.set('', root);
  for (const relation of props.catalog.relations) {
    byGroup.set(relation.path, { id: relation.path, label: relation.label, many: relation.many === true, fields: [] });
  }
  for (const field of props.catalog.fields) {
    if (text && !field.label.toLowerCase().includes(text) && !field.key.toLowerCase().includes(text)) continue;
    const many = manyRelationOf(props.catalog, field.key);
    const parent = field.key.includes('.') ? field.key.slice(0, field.key.lastIndexOf('.')) : '';
    const group = byGroup.get(many?.path ?? parent) ?? byGroup.get(parent) ?? root;
    group.fields.push(field);
  }
  return [...byGroup.values()].filter((group) => group.fields.length > 0);
});

const keysOf = (column: DeskLayoutColumn): string[] => column.lines.flat().flatMap((part) => partKeys(part, props.catalog));

const sortChoices = computed(() => [
  { value: '', label: 'None' },
  ...(current.value ? keysOf(current.value) : [])
    .filter((key) => fieldSortable(props.catalog, key))
    .map((key) => ({ value: key, label: fieldOf(key)?.label ?? key })),
]);

const filterChoices = computed(() => [
  { value: '', label: 'None' },
  ...(current.value ? keysOf(current.value) : [])
    .filter((key) => fieldFilterable(props.catalog, key))
    .map((key) => ({ value: key, label: fieldOf(key)?.label ?? key })),
]);

const insertFieldChoices = computed(() => [
  { value: 'this', label: 'This field' },
  ...ruleFieldKeys(props.catalog).map((key) => ({ value: key, label: fieldOf(key)?.label ?? key })),
]);

function fieldOf(key: string): DeskCatalogField | undefined {
  return catalogField(props.catalog, key);
}

function relationLabel(path: string): string {
  return catalogRelation(props.catalog, path)?.label ?? path;
}

function listFields(path: string): DeskCatalogField[] {
  return props.catalog.fields.filter((field) => manyRelationOf(props.catalog, field.key)?.path === path);
}

function maxOf(path: string): number {
  return listMaxItems(catalogRelation(props.catalog, path));
}

function partAt(spot: { column: string; line: number; index: number } | null): DeskCellPart | undefined {
  if (!spot) return undefined;
  return draft.value.columns.find((column) => column.id === spot.column)?.lines[spot.line]?.[spot.index];
}

function partLabel(part: DeskCellPart): string {
  const key = partFieldKey(part);
  if (key) {
    const name = fieldOf(key)?.label ?? key;
    const label = isFieldPart(part) ? part.label?.trim() : '';
    return label ? `${label}: ${name}` : name;
  }
  if (!isListPart(part)) return '';
  const names = part.fields.map((field) => fieldOf(field)?.label ?? field).join(', ');
  const prefix = part.label?.trim();
  return prefix ? `${prefix}: ${names}` : `${relationLabel(part.list)}: ${names}`;
}

const previewRows = computed((): Record<string, unknown>[] => {
  if (props.samples.length > 0) return props.samples.slice(0, 3);
  return props.sample ? [props.sample] : [];
});

function previewText(column: DeskLayoutColumn, row: Record<string, unknown>): string {
  return blocksText(cellBlocks(column, row, props.catalog, props.formatters));
}

function previewBlocks(column: DeskLayoutColumn, row: Record<string, unknown>): DeskCellBlock[] {
  return cellBlocks(column, row, props.catalog, props.formatters);
}

const PANE_KEY = 'desk-grid-designer-panes';
const PANE_DEFAULT = { fields: 240, settings: 352 };
const PANE_LIMITS = { fields: [160, 560], settings: [260, 640] } as const;

function loadPanes(): { fields: number; settings: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(PANE_KEY) ?? 'null') as { fields?: unknown; settings?: unknown } | null;
    return {
      fields: typeof raw?.fields === 'number' ? clampPane('fields', raw.fields) : PANE_DEFAULT.fields,
      settings: typeof raw?.settings === 'number' ? clampPane('settings', raw.settings) : PANE_DEFAULT.settings,
    };
  } catch {
    return { ...PANE_DEFAULT };
  }
}

function clampPane(pane: 'fields' | 'settings', width: number): number {
  const [min, max] = PANE_LIMITS[pane];
  return Math.round(Math.min(max, Math.max(min, width)));
}

const initialPanes = loadPanes();
const fieldsWidth = ref(initialPanes.fields);
const settingsWidth = ref(initialPanes.settings);

function savePanes(): void {
  try {
    localStorage.setItem(PANE_KEY, JSON.stringify({ fields: fieldsWidth.value, settings: settingsWidth.value }));
  } catch {
    // Private windows can refuse storage. The sizes then last until the dialog closes.
  }
}

function setPane(pane: 'fields' | 'settings', width: number): void {
  if (pane === 'fields') fieldsWidth.value = clampPane('fields', width);
  else settingsWidth.value = clampPane('settings', width);
}

function startResize(pane: 'fields' | 'settings', event: PointerEvent): void {
  event.preventDefault();
  const startX = event.clientX;
  const start = pane === 'fields' ? fieldsWidth.value : settingsWidth.value;
  // The fields pane grows to the right, the settings pane to the left.
  const sign = pane === 'fields' ? 1 : -1;
  const move = (next: PointerEvent): void => setPane(pane, start + sign * (next.clientX - startX));
  const stop = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    document.body.classList.remove('desk-grid-studio-resizing');
    savePanes();
  };
  document.body.classList.add('desk-grid-studio-resizing');
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}

function onSplitKey(pane: 'fields' | 'settings', event: KeyboardEvent): void {
  if (event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
  event.preventDefault();
  event.stopPropagation();
  const step = event.shiftKey ? 48 : 16;
  const sign = (event.key === 'ArrowRight' ? 1 : -1) * (pane === 'fields' ? 1 : -1);
  setPane(pane, (pane === 'fields' ? fieldsWidth.value : settingsWidth.value) + sign * step);
  savePanes();
}

function resetPanes(): void {
  fieldsWidth.value = PANE_DEFAULT.fields;
  settingsWidth.value = PANE_DEFAULT.settings;
  savePanes();
}

function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function closeExportMenu(): void {
  if (exportMenu.value) exportMenu.value.open = false;
}

function pageTitle(): string {
  return typeof document === 'undefined' ? '' : document.title.trim();
}

/** The layout on screen, unsaved edits included. */
function exportLayout(): void {
  closeExportMenu();
  const list = props.listKey;
  if (!list) return;
  const text = exportLayoutFile({ ...draft.value, name: draft.value.name.trim() || 'Layout' }, list, props.catalog, pageTitle());
  download(text, layoutFileName(draft.value, list));
  notice.value = '';
  info.value = 'Exported this layout. The file imports only into this list.';
}

/** Every saved layout, Default included. Unsaved edits in the editor are not in it. */
function exportAll(): void {
  closeExportMenu();
  const list = props.listKey;
  if (!list || layoutCount.value === 0) return;
  download(exportLayoutsFile(props.allLayouts ?? [], list, props.catalog, pageTitle()), layoutsFileName(list));
  notice.value = '';
  info.value = `Exported ${layoutCount.value} saved layouts, Default included. Unsaved changes here are not in the file.`;
}

function confirmImportAll(mode: DeskLayoutImportMode): void {
  const pending = pendingAll.value;
  if (!pending) return;
  pendingAll.value = null;
  emit('importAll', { layouts: pending.layouts, mode });
}

function onDocDown(event: Event): void {
  const menu = exportMenu.value;
  if (!menu?.open) return;
  if (event.target instanceof Node && menu.contains(event.target)) return;
  menu.open = false;
}

onMounted(() => document.addEventListener('mousedown', onDocDown));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocDown));

function pickImport(): void {
  const input = importInput.value;
  if (!input) return;
  input.value = '';
  input.click();
}

async function onImportFile(event: Event): Promise<void> {
  const list = props.listKey;
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!list || !file) return;
  let text: string;
  try {
    text = await file.text();
  } catch {
    notice.value = 'Could not read that file.';
    return;
  }
  const result = readLayoutFile(text, list, props.catalog);
  if (!result.ok) {
    info.value = '';
    notice.value = result.error;
    return;
  }
  if (result.kind === 'all') {
    notice.value = '';
    info.value = '';
    pendingAll.value = { layouts: result.layouts, dropped: result.dropped, replaces: overwrittenNames(props.allLayouts ?? [], result.layouts) };
    return;
  }
  apply(applyImported(draft.value, result.layout));
  selected.value = draft.value.columns[0]?.id ?? '';
  editing.value = null;
  const dropped = result.dropped ? ` ${result.dropped} column${result.dropped > 1 ? 's' : ''} used fields this list does not have and were left out.` : '';
  info.value = `Imported "${draft.value.name}". Check it, then Save.${dropped}`;
}

/** Every catalog key a grid column already reads, locked columns included. */
const usedKeys = computed(() => new Set([...lockedStart.value, ...draft.value.columns, ...lockedEnd.value].flatMap((column) => keysOf(column))));

/** ⇅ sorts, ↑ / ↓ opens sorted, ⌕ filters, ⏷ opens filtered. */
function headBadges(column: DeskLayoutColumn): string {
  const sort = draft.value.view?.sort;
  const marks: string[] = [];
  if (sort?.column === column.id) marks.push(sort.direction === 'asc' ? '↑' : '↓');
  else if (column.sortField) marks.push('⇅');
  if (draft.value.view?.filters?.[column.id] !== undefined) marks.push('⏷');
  else if (column.filterField) marks.push('⌕');
  return marks.join(' ');
}

function headTitle(column: DeskLayoutColumn): string {
  const parts: string[] = [];
  parts.push(column.sortField ? `Sorts on ${fieldOf(column.sortField)?.label ?? column.sortField}` : 'Does not sort');
  parts.push(column.filterField ? `filters on ${fieldOf(column.filterField)?.label ?? column.filterField}` : 'does not filter');
  return parts.join(', ');
}

const viewSummary = computed(() => {
  const view = draft.value.view;
  const parts: string[] = [];
  if (view?.sort) parts.push(`sorted`);
  const count = Object.values(view?.filters ?? {}).filter((text) => text.trim()).length;
  if (count) parts.push(`${count} filter${count > 1 ? 's' : ''}`);
  if (view?.panel) parts.push('saved filters');
  if (draft.value.hideActions && draft.value.id !== DESK_DEFAULT_LAYOUT_ID) parts.push('no actions');
  return parts.join(', ');
});

function padSummary(pad: DeskPartPad): string {
  const side = (key: keyof DeskPartPad): number => pad[key] ?? DESK_FIELD_PAD[key];
  return `${side('top')} ${side('right')} ${side('bottom')} ${side('left')}`;
}

function selectColumn(id: string): void {
  if (selected.value !== id) editing.value = null;
  selected.value = id;
}

/** Column being dragged by its grip, and the slot it would land before. */
const dragColumn = ref<string | null>(null);
const columnDrop = ref<number | null>(null);

function onColumnDragStart(id: string, event: DragEvent): void {
  dragColumn.value = id;
  if (!event.dataTransfer) return;
  event.dataTransfer.setData('text/plain', id);
  event.dataTransfer.effectAllowed = 'move';
}

function onColumnDragOver(index: number, event: DragEvent): void {
  if (!dragColumn.value) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  columnDrop.value = index;
}

function onColumnDrop(index: number, event: DragEvent): void {
  const id = dragColumn.value;
  onColumnDragEnd();
  if (!id) return;
  event.preventDefault();
  apply(moveColumnTo(draft.value, id, index));
  selected.value = id;
}

function onColumnDragEnd(): void {
  dragColumn.value = null;
  columnDrop.value = null;
}

function isEditing(column: string, line: number, index: number): boolean {
  const spot = editing.value;
  return Boolean(spot && spot.column === column && spot.line === line && spot.index === index);
}

function apply(next: DeskGridLayout): void {
  draft.value = pruneLayoutView(next, props.catalog);
  notice.value = '';
  info.value = '';
  if (editing.value && partAt(editing.value) === undefined) editing.value = null;
}

function onPartLabelText(label: string): void {
  const spot = editing.value;
  if (!spot) return;
  apply(setPartLabel(draft.value, spot.column, spot.line, spot.index, label));
}

function onPartLabel(event: Event): void {
  onPartLabelText((event.target as HTMLInputElement).value);
}

function writeField(patch: { style?: DeskFieldStylePatch; rules?: DeskStyleRule[] }): void {
  const spot = editing.value;
  const field = editingField.value;
  if (!spot || !field) return;
  apply(updateFieldPart(draft.value, spot.column, spot.line, spot.index, patch));
}

interface DeskFieldStylePatch {
  look?: DeskPartLook;
  tone?: DeskPartTone;
  size?: DeskPartSize;
  bold?: boolean;
  place?: DeskPartPlace;
  pad?: DeskPartPad;
}

function styleOf(field: { look: DeskPartLook; tone: DeskPartTone; size: DeskPartSize; bold: boolean; place: DeskPartPlace; pad: DeskPartPad }, patch: DeskFieldStylePatch = {}): DeskPartStyle {
  const look = patch.look ?? field.look;
  const tone = patch.tone ?? field.tone;
  const size = patch.size ?? field.size;
  const bold = patch.bold ?? field.bold;
  const place = patch.place ?? field.place;
  const pad = patch.pad ?? field.pad;
  const style: DeskPartStyle = { look, tone, size };
  if (bold) style.bold = true;
  if (place === 'right') style.place = 'right';
  if (pad.top !== undefined || pad.right !== undefined || pad.bottom !== undefined || pad.left !== undefined) style.pad = pad;
  return style;
}

function onLook(value: string): void {
  const field = editingField.value;
  if (!field) return;
  writeField({ style: styleOf(field, { look: lookOf(value) }) });
}

function onTone(value: string): void {
  const field = editingField.value;
  if (!field) return;
  writeField({ style: styleOf(field, { tone: toneOf(value) }) });
}

function onSize(value: string): void {
  const field = editingField.value;
  if (!field) return;
  writeField({ style: styleOf(field, { size: sizeOf(value) }) });
}

function onBold(event: Event): void {
  const field = editingField.value;
  if (!field) return;
  writeField({ style: styleOf(field, { bold: (event.target as HTMLInputElement).checked }) });
}

function onPlace(value: string): void {
  const field = editingField.value;
  if (!field) return;
  writeField({ style: styleOf(field, { place: value === 'right' ? 'right' : 'left' }) });
}

function padValue(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function onPad(side: keyof DeskPartPad, event: Event): void {
  const field = editingField.value;
  if (!field) return;
  const raw = (event.target as HTMLInputElement).value.trim();
  const pad: DeskPartPad = { ...field.pad };
  if (raw === '') delete pad[side];
  else {
    const next = Number(raw);
    if (Number.isFinite(next)) pad[side] = Math.min(32, Math.max(0, Math.round(next)));
  }
  writeField({ style: styleOf(field, { pad }) });
}

function lookOf(value: string): DeskPartLook {
  return value === 'chip' || value === 'box' ? value : 'text';
}

function toneOf(value: string): DeskPartTone {
  return value === 'muted' || value === 'success' || value === 'warning' || value === 'danger' || value === 'info' ? value : 'default';
}

function sizeOf(value: string): DeskPartSize {
  return value === 'small' || value === 'large' ? value : 'normal';
}

function patchRule(index: number, patch: Partial<DeskStyleRule>): void {
  const field = editingField.value;
  if (!field) return;
  writeField({ rules: field.rules.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule)) });
}

function replaceRule(index: number, rule: DeskStyleRule): void {
  const field = editingField.value;
  if (!field) return;
  writeField({ rules: field.rules.map((item, ruleIndex) => (ruleIndex === index ? rule : item)) });
}

function keptStyle(rule: DeskStyleRule): DeskStyleRule {
  const next: DeskStyleRule = {};
  if (rule.look) next.look = rule.look;
  if (rule.tone) next.tone = rule.tone;
  if (rule.bold) next.bold = true;
  return next;
}

function ruleProblem(rule: DeskStyleRule): string {
  if (typeof rule.when !== 'string') return '';
  return parseRule(rule.when, ruleFieldKeys(props.catalog)).error;
}

function onRuleWhen(index: number, event: Event): void {
  const rule = editingField.value?.rules[index];
  if (!rule) return;
  const next = keptStyle(rule);
  next.when = (event.target as HTMLInputElement).value.slice(0, 240);
  replaceRule(index, next);
}

function onInsertField(index: number, key: string): void {
  const rule = editingField.value?.rules[index];
  if (!rule || !key) return;
  const input = document.querySelector(`[data-desk-field="grid-layout-rule-when-${index}"]`);
  const source = input instanceof HTMLInputElement ? input.value : ruleSource(rule);
  const start = input instanceof HTMLInputElement ? input.selectionStart ?? source.length : source.length;
  const end = input instanceof HTMLInputElement ? input.selectionEnd ?? start : start;
  const before = source.slice(0, start);
  const after = source.slice(end);
  const lead = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const trail = after.length > 0 && !/^\s/.test(after) ? ' ' : '';
  const when = `${before}${lead}${key}${trail}${after}`.slice(0, 240);
  const caret = Math.min(before.length + lead.length + key.length, when.length);
  const next = keptStyle(rule);
  next.when = when;
  replaceRule(index, next);
  void nextTick(() => {
    const field = document.querySelector(`[data-desk-field="grid-layout-rule-when-${index}"]`);
    if (!(field instanceof HTMLInputElement)) return;
    field.focus();
    field.setSelectionRange(caret, caret);
  });
}

function onRuleBold(index: number, event: Event): void {
  const rule = editingField.value?.rules[index];
  if (!rule) return;
  const next = keptStyle(rule);
  if (typeof rule.when === 'string') next.when = rule.when;
  else {
    if (rule.op) next.op = rule.op;
    if (rule.left) next.left = rule.left;
    if (rule.right) next.right = rule.right;
    if (rule.value !== undefined) next.value = rule.value;
  }
  if ((event.target as HTMLInputElement).checked) next.bold = true;
  else delete next.bold;
  replaceRule(index, next);
}

function addRule(): void {
  const field = editingField.value;
  if (!field || field.rules.length >= 5) return;
  writeField({ rules: [...field.rules, { when: 'this > 0', tone: 'danger' }] });
}

function removeRule(index: number): void {
  const field = editingField.value;
  if (!field) return;
  writeField({ rules: field.rules.filter((_, ruleIndex) => ruleIndex !== index) });
}

function patch(id: string, value: Partial<DeskLayoutColumn>): void {
  apply(updateColumn(draft.value, id, value));
}

function place(payload: DeskDesignerPayload, spot: DeskDesignerSpot): void {
  const result = dropPart(draft.value, props.catalog, payload, spot);
  apply(result.layout);
  selected.value = spot.column;
  const at = result.at;
  const part = at ? result.layout.columns.find((column) => column.id === at.column)?.lines[at.line]?.[at.index] : undefined;
  editing.value = at && part && typeof part !== 'string' ? at : null;
}

/** Some browsers drop custom MIME types and hide drag data until `drop`, so the payload stays here. */
const dragging = ref<DeskDesignerPayload | null>(null);

function onDragStart(event: DragEvent, payload: DeskDesignerPayload): void {
  dragging.value = payload;
  if (!event.dataTransfer) return;
  event.dataTransfer.setData('text/plain', payload.type === 'field' ? payload.key : payload.type);
  event.dataTransfer.effectAllowed = 'copy';
}

function onDragOver(event: DragEvent): void {
  if (!dragging.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function onDragEnd(): void {
  dragging.value = null;
}

/** A field dropped anywhere on the preview goes to a new line of the selected column. */
function onDrop(event: DragEvent): void {
  const payload = dragging.value;
  dragging.value = null;
  if (!payload) return;
  event.preventDefault();
  addToSelected(payload);
}

function move(column: string, line: number, index: number, direction: DeskPartMove): void {
  apply(movePart(draft.value, column, line, index, direction));
  editing.value = null;
}

function split(column: string, line: number, index: number): void {
  apply(splitLine(draft.value, column, line, index));
  editing.value = null;
}

function newColumn(): void {
  const id = newLayoutId('col');
  apply(addColumn(draft.value, id));
  selected.value = id;
}

function addToSelected(payload: DeskDesignerPayload): void {
  if (!current.value) newColumn();
  if (current.value) place(payload, { column: current.value.id, line: null });
}

function dropColumn(id: string): void {
  const index = draft.value.columns.findIndex((column) => column.id === id);
  apply(removeColumn(draft.value, id));
  editing.value = null;
  selected.value = draft.value.columns[Math.max(0, index - 1)]?.id ?? '';
}

/**
 * Alt+Left and Alt+Right move the selected column from anywhere in the designer. The browser
 * reads them as Back and Forward, so they are always stopped here.
 */
function onStudioKey(event: KeyboardEvent): void {
  if (!event.altKey || event.ctrlKey || event.metaKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
  event.preventDefault();
  event.stopPropagation();
  const id = selected.value;
  if (!id || !draft.value.columns.some((column) => column.id === id)) return;
  apply(moveColumn(draft.value, id, event.key === 'ArrowLeft' ? -1 : 1));
  void nextTick(() => {
    const head = document.querySelector(`[data-desk-field="grid-layout-head-${id}"]`);
    if (head instanceof HTMLElement && document.activeElement === head) return;
    document.querySelector('.desk-grid-designer-preview th.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

function onWidth(event: Event): void {
  if (!current.value) return;
  const value = Number((event.target as HTMLInputElement).value);
  const width = Number.isFinite(value) && value >= 40 ? Math.min(800, Math.round(value)) : undefined;
  const next = { ...current.value };
  if (width) next.width = width;
  else delete next.width;
  apply({ ...draft.value, columns: draft.value.columns.map((column) => (column.id === next.id ? next : column)) });
}

function onAlign(value: string): void {
  if (!current.value) return;
  patch(current.value.id, { align: value === 'right' ? 'right' : value === 'center' ? 'center' : 'left' });
}

function showOf(value: string): DeskListShow {
  return value === 'space' || value === 'lines' || value === 'table' ? value : 'comma';
}

function patchList(value: Partial<DeskListPart>): void {
  const spot = editing.value;
  const part = editingPart.value;
  if (!spot || !part) return;
  apply(replacePart(draft.value, spot.column, spot.line, spot.index, { ...part, ...value }));
}

function toggleListField(key: string): void {
  const part = editingPart.value;
  if (!part) return;
  const fields = part.fields.includes(key) ? part.fields.filter((item) => item !== key) : [...part.fields, key];
  if (fields.length === 0) {
    notice.value = 'A list needs at least one field.';
    return;
  }
  patchList({ fields });
}

function onMax(event: Event): void {
  const part = editingPart.value;
  if (!part) return;
  const cap = maxOf(part.list);
  const value = Math.round(Number((event.target as HTMLInputElement).value));
  if (!Number.isFinite(value) || value < 1 || value > cap) {
    notice.value = `Show between 1 and ${cap} items.`;
    (event.target as HTMLInputElement).value = String(part.max);
    return;
  }
  patchList({ max: value });
}

/** Every column the grid will show, locked ones included, in grid order. */
const viewColumns = computed((): DeskLayoutColumn[] => [...lockedStart.value, ...draft.value.columns, ...lockedEnd.value]);

const viewSortChoices = computed(() => [
  { value: '', label: 'None (newest first)' },
  ...viewColumns.value.filter((column) => column.sortField).map((column) => ({ value: column.id, label: column.header || column.id })),
]);

function filterKindOf(column: DeskLayoutColumn | undefined): HeaderFilterKind {
  const field = column?.filterField ? fieldOf(column.filterField) : undefined;
  const type = field?.filterAs ?? field?.type;
  if (type === 'number' || type === 'currency') return 'number';
  if (type === 'date') return 'date';
  return 'text';
}

const viewFilterRows = computed(() =>
  Object.entries(draft.value.view?.filters ?? {}).map(([id, text]) => {
    const column = viewColumns.value.find((item) => item.id === id);
    const kind = filterKindOf(column);
    const choices = column?.filterField ? fieldOf(column.filterField)?.options : undefined;
    return { id, text, kind, choices, summary: describeFilter(column?.header || id, kind, text) };
  }),
);

/** Columns that filter and no other row uses yet. `own` keeps this row's column in its list. */
function filterColumnChoices(own: string): { value: string; label: string }[] {
  const used = new Set(Object.keys(draft.value.view?.filters ?? {}));
  return viewColumns.value
    .filter((column) => column.filterField && (column.id === own || !used.has(column.id)))
    .map((column) => ({ value: column.id, label: column.header || column.id }));
}

function setView(view: DeskGridLayoutView): void {
  const next: DeskGridLayout = { ...draft.value };
  if (view.sort || (view.filters && Object.keys(view.filters).length > 0) || view.panel || view.options) next.view = view;
  else delete next.view;
  apply(next);
}

function setViewSort(column: string): void {
  const view = { ...draft.value.view };
  if (column) view.sort = { column, direction: draft.value.view?.sort?.direction ?? 'asc' };
  else delete view.sort;
  setView(view);
}

function setViewDirection(value: string): void {
  const sort = draft.value.view?.sort;
  if (!sort) return;
  setView({ ...draft.value.view, sort: { column: sort.column, direction: value === 'desc' ? 'desc' : 'asc' } });
}

function setViewPanel(panel: Record<string, unknown>): void {
  setView({ ...draft.value.view, panel });
}

function setFilters(filters: Record<string, string>): void {
  setView({ ...draft.value.view, filters });
}

function setFilterText(id: string, text: string): void {
  setFilters({ ...draft.value.view?.filters, [id]: text });
}

/** Swap a row's column in place, so the row keeps its position. Its text starts empty. */
function setFilterColumn(id: string, next: string): void {
  if (!next || next === id) return;
  const filters: Record<string, string> = {};
  for (const [key, text] of Object.entries(draft.value.view?.filters ?? {})) {
    if (key === id) filters[next] = '';
    else filters[key] = text;
  }
  setFilters(filters);
}

function removeFilter(id: string): void {
  const filters = { ...draft.value.view?.filters };
  delete filters[id];
  setFilters(filters);
}

function addFilter(): void {
  const first = filterColumnChoices('')[0];
  if (!first) return;
  setFilterText(first.value, '');
}

function onNote(event: Event): void {
  const text = (event.target as HTMLTextAreaElement).value.slice(0, DESK_LAYOUT_NOTE_MAX);
  const next: DeskGridLayout = { ...draft.value };
  if (text.trim()) next.note = text;
  else delete next.note;
  apply(next);
}

/** A column whose cell shows a currency field gets the currency choices. */
function hasCurrency(column: DeskLayoutColumn): boolean {
  return column.lines.flat().some((part) => {
    const key = partFieldKey(part);
    return Boolean(key && fieldOf(key)?.type === 'currency');
  });
}

/** Merge one currency choice into the selected column. An empty view is removed. */
function onMoney(patchMoney: { [K in keyof DeskMoneyView]?: DeskMoneyView[K] | undefined }): void {
  const id = current.value?.id;
  if (!id) return;
  apply({
    ...draft.value,
    columns: draft.value.columns.map((column) => {
      if (column.id !== id) return column;
      const merged: DeskMoneyView = { ...column.money };
      for (const [key, value] of Object.entries(patchMoney) as [keyof DeskMoneyView, DeskMoneyView[keyof DeskMoneyView]][]) {
        if (value === undefined) delete merged[key];
        else (merged as Record<string, unknown>)[key] = value;
      }
      const next = { ...column };
      if (Object.keys(merged).length > 0) next.money = merged;
      else delete next.money;
      return next;
    }),
  });
}

/** Hide or dim a value equal to the row above; empty shows it as usual. */
function setRepeats(id: string, value: string): void {
  apply({
    ...draft.value,
    columns: draft.value.columns.map((column) => {
      if (column.id !== id) return column;
      if (value === 'hide' || value === 'dim') return { ...column, repeats: value };
      const rest = { ...column };
      delete rest.repeats;
      return rest;
    }),
  });
}

function onColumnSpill(event: Event): void {
  const id = current.value?.id;
  if (!id) return;
  const on = (event.target as HTMLInputElement).checked;
  patch(id, { spill: on });
}

function onColumnHidden(event: Event): void {
  const id = current.value?.id;
  if (!id) return;
  const hide = (event.target as HTMLInputElement).checked;
  apply({
    ...draft.value,
    columns: draft.value.columns.map((column) => {
      if (column.id !== id) return column;
      const next = { ...column };
      if (hide) next.hidden = true;
      else delete next.hidden;
      return next;
    }),
  });
}

function onHideActions(event: Event): void {
  const next: DeskGridLayout = { ...draft.value };
  if ((event.target as HTMLInputElement).checked) next.hideActions = true;
  else delete next.hideActions;
  apply(next);
}

function save(): void {
  const name = draft.value.name.trim();
  if (!name) {
    notice.value = 'Give the layout a name.';
    return;
  }
  const columns = draft.value.columns.filter((column) => column.lines.length > 0);
  if (columns.length === 0) {
    notice.value = 'Add at least one field to a column.';
    return;
  }
  for (const column of columns) {
    for (const part of column.lines.flat()) {
      if (!isFieldPart(part)) continue;
      for (const rule of part.rules ?? []) {
        if (typeof rule.when !== 'string') continue;
        const parsed = parseRule(rule.when, ruleFieldKeys(props.catalog));
        if (!parsed.ok) {
          notice.value = parsed.error;
          return;
        }
      }
    }
  }
  emit('save', { ...draft.value, name, columns });
}
</script>

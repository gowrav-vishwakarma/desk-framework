/**
 * Public entry for an app that copies this folder.
 * Import this file, not the files under it. A host that grew up with the folder may keep deep paths.
 */
import './theme/desk-tokens.css';
import './theme/desk-grid.css';
import './theme/desk-form-layout.css';
import './theme/themes';
import './theme/deskFontSize';

export { default as DeskShell } from './layout/DeskShell.vue';
export { default as DeskMenuBar } from './layout/DeskMenuBar.vue';
export { default as DeskThemeMenu } from './layout/DeskThemeMenu.vue';
export { default as DeskFKeyBar } from './layout/DeskFKeyBar.vue';
export { default as DeskPageLayer } from './layout/DeskPageLayer.vue';
export { default as DeskPageHeader } from './layout/DeskPageHeader.vue';
export { default as DeskStatCards } from './layout/DeskStatCards.vue';
export type { DeskStatCard } from './layout/statCards';
export { default as DeskKeysDialog } from './keys/DeskKeysDialog.vue';
export { default as DeskJumpPeek } from './focus/DeskJumpPeek.vue';
export { default as DeskForm } from './form/DeskForm.vue';
export { default as DeskButton } from './form/DeskButton.vue';
export { useDeskTask, type DeskTask, type DeskTaskAfter, type DeskTaskOptions, type DeskButtonApi } from './form/deskTask';
export { default as DeskSection } from './form/DeskSection.vue';
export { default as DeskField } from './form/DeskField.vue';
export { default as DeskCombo } from './form/DeskCombo.vue';
export { default as DeskLookupBox } from './form/DeskLookupBox.vue';
export { default as DeskDateInput } from './date/DeskDateInput.vue';
export { default as DeskCurrencyInput } from './currency/DeskCurrencyInput.vue';
export { default as DeskContextMenu } from './menu/DeskContextMenu.vue';
export { default as DeskDialog } from './form/DeskDialog.vue';
export { default as DeskFilterPanel } from './filter/DeskFilterPanel.vue';
export { describeDeskFilter, deskListPhrase, deskPeriodPhrase, deskPhraseParts, deskValue, markedDeskFilter, plainDeskPhrase, type DeskPhrasePart } from './filter/describe';
export { default as DeskGrid } from './grid/DeskGrid.vue';
export { default as DeskSplitDialog } from './split/DeskSplitDialog.vue';
export { default as DeskCodeListDialog } from './split/DeskCodeListDialog.vue';
export { default as DeskSettingsGrid } from './grid/DeskSettingsGrid.vue';
export { default as DeskConfirmDialog } from './form/DeskConfirmDialog.vue';
export { default as DeskConfirmHost } from './form/DeskConfirmHost.vue';
export { default as DeskLeaveDialog } from './form/DeskLeaveDialog.vue';
export { askDeskConfirm } from './form/confirm';
export { askDeskLeave, confirmDeskDiscard, useDeskDirty } from './form/leaveGuard';
export { useDeskFormDirty, useDeskFormPart, type DeskFormDirty, type DeskFormPart } from './form/formDirty';
export { default as DeskPageDialogHost } from './page/DeskPageDialogHost.vue';
export { openDeskPage } from './page/openDeskPage';
export { useDeskPage } from './page/pageContext';
export { runLookupEditor } from './form/lookupEditor';
export { deskActionClass } from './grid/actionClass';
export { sectionRows } from './grid/settings';
export { DESK_PAGE_SIZES, deskPageSizesExcept, pageSizeLabel, type DeskPageSize } from './grid/pageSize';
export { default as DeskGridDesigner } from './grid/layout/DeskGridDesigner.vue';
export { default as DeskGridLayoutMenu } from './grid/layout/DeskGridLayoutMenu.vue';
export { default as DeskGridLayoutTabs } from './grid/layout/DeskGridLayoutTabs.vue';
export { useDeskGridLayouts, type DeskGridLayoutsApi, type DeskGridLayoutsOptions } from './grid/layout/useDeskGridLayouts';
export { useDeskGridDesigner, type DeskGridDesignerOptions } from './grid/layout/useDeskGridDesigner';
export { catalogField, catalogRelation, readPath, selectionOf } from './grid/layout/compile';
export { DESK_DEFAULT_LAYOUT_ID } from './grid/layout/types';
export type {
  DeskCatalogField,
  DeskCatalogRelation,
  DeskCellPart,
  DeskFieldCatalog,
  DeskFieldFormatters,
  DeskFieldSelection,
  DeskFieldType,
  DeskGridLayout,
  DeskGridLayoutView,
  DeskGridQueryFilter,
  DeskGridQuerySort,
  DeskGridQueryState,
  DeskLayoutColumn,
  DeskListPart,
  DeskLockedColumn,
} from './grid/layout/types';

export { configureDesk } from './host';
export { installDeskDriver, createDeskDriver, type DeskDriver } from './automation/driver';
export { useDeskAutomationNode, deskAutomationEnabled } from './automation/registry';
export { trackDeskWork, beginDeskWork, waitDeskIdle } from './automation/busy';
export { deskEvent } from './automation/events';
export { applyDeskSet, captureDeskSet, diffDeskSet, mergeSets, deepMerge, substituteVars, invalidateDeskPref, onDeskPrefInvalidate } from './automation/sets';
export type {
  DeskAutomationHost,
  DeskNodeKind,
  DeskNodeSpec,
  DeskOpDef,
  DeskOutcome,
  DeskSet,
  DeskSetAdapter,
  DeskSetContext,
} from './automation/types';
export { registerDeskTheme } from './theme/themes';
export {
  applyDeskFontSize,
  applyDeskFontSizePreset,
  deskFontSizeLabel,
  deskFontSizePercent,
  deskFontSizePresetId,
  DESK_FONT_SIZE_PRESETS,
} from './theme/deskFontSize';
export { createIndexedDbPrefStore } from './storage/indexedDbPrefStore';
export { readDeskPref, writeDeskPref, readDeskUi, replaceDeskUi } from './storage/deskPrefs';
export { mergeDeskMenus, useDeskContextMenu } from './menu/fieldMenu';
export { createDeskChecklist } from './menu/checklist';
export { dateFieldMenu } from './date/dateMenu';
export { chipsFieldMenu } from './form/chipsShow';
export { currencyFieldMenu } from './currency/currencyMenu';
export { currencyLines, deskCompanyCurrency } from './currency/money';
export { deskMenuArmed, installDeskKeys } from './keys/dispatcher';
export { deskKeyLabel, loadDeskKeymap } from './keys/deskKeymap';
export { provideDeskLayer, useDeskLayer } from './keys/useDeskLayer';
export { DESK_FORM_ISSUES, issuesFromErrors } from './form/issues';
export { YES_NO } from './form/yesNo';
export { parseDeskDate, formatDeskDate } from './date/deskDate';
export { focusNextDeskField, focusPrevDeskField } from './focus/useDeskFocus';

export type { DeskFilterPeriod, DeskFilterSaved, DeskFilterSpec, DeskFilterValues, DeskPhraseRule, DeskPhraseContext } from './filter/types';
export type { DeskIssue } from './form/issues';
export type { DeskPageResultMode, DeskPageSpec } from './page/openDeskPage';
export type { DeskPageContext, DeskPageOptions, DeskPageSaved } from './page/pageContext';
export type { DeskSetting, DeskSettingsRow } from './grid/settings';
export type { DeskSplitCheck, DeskSplitFiller, DeskSplitMode, DeskSplitPolicy, DeskSplitRow } from './split/math';
export type { DeskCodeRow } from './split/codes';
export type { DeskLayoutPreset } from './formLayout/types';
export type { DeskHandlerInput } from './keys/layers';
export type { DeskBindings } from './keys/keymap';
export type { DeskTheme } from './theme/themes';
export type { DeskFontSizePreset, DeskFontSizePresetId } from './theme/deskFontSize';
export type { DeskPrefStore } from './storage/prefStore';
export type { DeskMenuNode } from './menu/deskMenu';
export type { DeskFieldMenu, DeskMenuGroup, DeskMenuItem } from './menu/fieldMenu';
export type { DeskChecklist, DeskChecklistItem, DeskChecklistOptions } from './menu/checklist';
export type {
  DeskColumn,
  DeskColumnRelation,
  DeskDialogWhen,
  DeskDialogWhenContext,
  DeskBackDialog,
  DeskEnterTarget,
  DeskGridApi,
  DeskGridRow,
  DeskLookupColumn,
  DeskLookupConfig,
  DeskLookupEditor,
  DeskNextFocus,
  DeskNextFocusContext,
  DeskActionTone,
  DeskRowAction,
  DeskSelectOption,
  DeskMoney,
  DeskCurrencyValue,
} from './grid/types';
export { deskSavedFilter, freezeDeskFilter, thawDeskFilter, sameDeskFilter, type DeskSavedFilter } from './filter/saved';
export { default as DeskFilterSavedFields } from './filter/DeskFilterSavedFields.vue';

// Also used by the reference app; exported so a copied folder offers every feature from here.
export { deskDecimals, formatDeskDecimal, formatDeskNumber } from './currency/money';
export type { DeskMoneyFrom } from './currency/money';
export { datePrefs } from './date/datePrefs';
export { deskMonthNumber } from './date/deskDate';
export { useDeskFilterLayouts } from './filter/useDeskFilterLayouts';
export { claimDeskKey, focusLayerInitial, isDeskNavKey, onDeskCheckboxKey } from './focus/useDeskFocus';
export { default as DeskMark } from './form/DeskMark.vue';
export { default as DeskSheetDialog } from './form/DeskSheetDialog.vue';
export { default as DeskTabs } from './form/DeskTabs.vue';
export { TAB_QUERY_KEY, joinTabPath, splitTabPath } from './form/deskTabRoute';
export { default as DeskFormZone } from './formLayout/DeskFormZone.vue';
export { default as DeskLayoutDesigner } from './formLayout/designer/DeskLayoutDesigner.vue';
export { layoutOptionsOnTab } from './formLayout/options';
export { layoutSlots } from './formLayout/types';
export type { DeskFormLayout, DeskLayoutFieldInfo, DeskLayoutOption } from './formLayout/types';
export { useDeskFormLayout } from './formLayout/useDeskFormLayout';
export { cellText } from './grid/display';
export { drawerEnterOpens, drawerTypingSeed } from './grid/drawerKey';
export { default as DeskCellEditor } from './grid/editors/DeskCellEditor.vue';
export { exportGridXlsx } from './grid/exportGrid';
export { default as DeskGridLayoutNote } from './grid/layout/DeskGridLayoutNote.vue';
export { default as DeskLayoutGrid } from './grid/layout/DeskLayoutGrid.vue';
export { catalogFromColumns } from './grid/layout/catalogFromColumns';
export { applyDeskGridSort } from './grid/listSort';
export { useDeskPageSize } from './grid/pageSize';
export type { DeskGridPagingBind } from './grid/pageSize';
export { resolveRowActionDisplayMode } from './grid/rowActions';
export { singleSettingRow } from './grid/settings';
export type { DeskCellTag, DeskGridSortAction, DeskSortDirection, DeskTone } from './grid/types';
export { deskPresetId, setDeskPreset } from './keys/deskKeymap';
export { dispatchDeskKey } from './keys/dispatcher';
export { addDeskHandlers } from './keys/layers';
export { default as DeskThemeFontSizeSection } from './layout/DeskThemeFontSizeSection.vue';
export { default as DeskToolbarMenu } from './layout/DeskToolbarMenu.vue';
export { useDeskToolbar } from './layout/toolbar';
export { useDeskShellLayer } from './layout/useDeskShellLayer';
export { deskTogglesMenu } from './menu/togglesMenu';
export { default as PivotDesigner } from './pivot/PivotDesigner.vue';
export { buildPivotCube } from './pivot/pivotCube';
export type { PivotAggregate, PivotField, PivotLayout } from './pivot/pivotTypes';
export { newCodeRow } from './split/codes';
export { distributeEqually, fillRemaining, splitPolicyFor } from './split/math';
export { createDeskToggles } from './storage/deskToggles';
export { DESK_THEMES, applyDeskTheme, deskTheme } from './theme/themes';
export type { DeskToggle, DeskToggles } from './storage/deskToggles';
export type { DeskFilterLayoutsApi, DeskFilterLayoutsOptions } from './filter/useDeskFilterLayouts';
export type { DeskToolbarItem } from './layout/toolbar';
export { deskGroupNumbers } from './grid/groupNumbers';
export { deskCellMatches, useDeskLocalFilter, type DeskLocalFilter, type DeskLocalFilterOptions } from './grid/localFilter';
export { useDeskColumnFilters, type DeskColumnFilters, type DeskColumnFiltersOptions } from './grid/columnFilters';
export { default as DeskTestSetsDialog } from './automation/DeskTestSetsDialog.vue';

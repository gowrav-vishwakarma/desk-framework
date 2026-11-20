export { createDeskClient, type DeskClient } from './client';
export {
  deskActions,
  deskCellShown,
  deskCountRows,
  deskFindRow,
  deskExpectNoRow,
  deskGrid,
  deskFilterColumn,
  deskOffers,
  deskToolbarOffers,
  deskWithholds,
  deskPageSize,
  deskPickInCell,
  deskPickManyInCell,
  DESK_MULTI_PICK_KEYS,
  deskTypeInCell,
  deskChooseInCell,
  deskClickCell,
  deskEditCell,
  deskEnterRow,
  deskRowActionStates,
  deskRunRowAction,
  deskRunRowActionDirect,
  deskUntilRowCount,
  type DeskActionState,
  type DeskGridView,
  type DeskShownRow,
} from './grid';
export { deskLocators } from './locators';
export { deskMenuBarPick, type DeskMenuBarPickOptions } from './menuBar';
export { deskChooseLayoutOptions, deskLayoutOption, deskLayoutOptions, type DeskLayoutOptionView } from './formLayout';
export { deskOpenTab, deskOpenTabDirect, deskTabIds, type DeskTabsView } from './tabs';
export { deskFormDiff, deskFormValues, deskFormWith, deskSettingsIssues, deskSettingsRows, type DeskFormValues, type DeskSettingsRowView } from './settings';
export { createDeskUser, describeOutcome, expectOk, type DeskUser } from './user';
export { deskFixtureDefs, type DeskFixtures, type ExtendableTest } from './fixtures';
export { deskMcpTools, type DeskMcpTool } from './mcp';
export { formatFindings, runDeskConformance, type ConformanceOptions, type ConformanceReport } from './conformance';
export {
  defineScenarioSuite,
  deskProperty,
  runIntegritySweep,
  runScenario,
  screenChecklist,
  seeded,
  type DeskScenario,
  type DeskScenarioSuite,
  type IntegrityCheck,
  type PropertyOptions,
  type ScreenCheck,
  type ScreenResult,
} from './scenario';
export type * from './types';

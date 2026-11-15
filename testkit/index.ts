export { createDeskClient, type DeskClient } from './client';
export {
  deskActions,
  deskCellShown,
  deskCountRows,
  deskFindRow,
  deskGrid,
  deskPageSize,
  deskPickInCell,
  deskRowActionStates,
  deskRunRowAction,
  deskRunRowActionDirect,
  deskUntilRowCount,
  type DeskActionState,
  type DeskGridView,
  type DeskShownRow,
} from './grid';
export { deskLocators } from './locators';
export { deskSettingsIssues, deskSettingsRows, type DeskSettingsRowView } from './settings';
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

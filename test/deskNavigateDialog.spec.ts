import { afterEach, describe, expect, it } from 'vitest';
import { configureDesk } from '../src/host';
import { createDeskDriver } from '../src/automation/driver';
import { registerDeskNode, unregisterDeskNode } from '../src/automation/registry';
import type { DeskNode } from '../src/automation/types';

const made: DeskNode[] = [];
afterEach(() => {
  for (const node of made.splice(0)) unregisterDeskNode(node);
  configureDesk({ presets: {}, presetLabels: [], defaultPreset: '', label: (id) => id });
});

describe('driver navigate', () => {
  it('refuses while a modal dialog is open (a person cannot reach the menu), and goes once it is closed', async () => {
    const went: string[] = [];
    configureDesk({ presets: {}, presetLabels: [], defaultPreset: '', label: (id) => id, automation: { navigate: async (to: string) => (went.push(to), to) } as never });
    const page = registerDeskNode({ kind: 'page', name: 'category-list' }, null);
    let open = true;
    const dialog = registerDeskNode({ kind: 'dialog', name: 'page-1', modal: true, open: () => open }, page);
    made.push(page, dialog);
    const driver = createDeskDriver();

    const refused = await driver.navigate('employeemaster');
    expect(refused).toEqual({ ok: false, error: 'a dialog is open (page:category-list/dialog:page-1): close it first, as a person would' });
    expect(went).toEqual([]);

    open = false;
    expect(await driver.navigate('employeemaster')).toMatchObject({ ok: true });
    expect(went).toEqual(['employeemaster']);
  });
});

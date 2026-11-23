import { describe, expect, it } from 'vitest';
import { createDeskChecklist } from '../src/menu/checklist';

describe('a checklist menu (Search by / Show)', () => {
  it('starts with its defaults; defaults given as a function follow what it reads (a company setting that loads later)', () => {
    const items = [{ id: 'name', label: 'Name' }, { id: 'accountCode', label: 'Code' }, { id: 'aliasName', label: 'Alias' }];
    expect(createDeskChecklist('test:fixed', items, { defaults: ['name', 'accountCode'] }).selected()).toEqual(['name', 'accountCode']);
    expect(createDeskChecklist('test:all', items).selected()).toEqual(['name', 'accountCode', 'aliasName']);
    let aliases = false;
    const following = createDeskChecklist('test:following', items, { defaults: () => (aliases ? ['name', 'accountCode', 'aliasName'] : ['name', 'accountCode']) });
    expect(following.selected()).toEqual(['name', 'accountCode']);
    aliases = true;
    expect(following.selected()).toEqual(['name', 'accountCode', 'aliasName']);
  });
});

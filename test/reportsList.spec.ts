import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeReportsHost } from './reportsHost';

fakeReportsHost();

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../src/reports/studioApi', () => ({
  listReports: () =>
    Promise.resolve([
      { name: 'stock.transfer.register', title: 'Stock Transfer Register', category: 'Stock', origin: 'system', description: '' },
      { name: 'stock.item.ledger', title: 'Item-wise Stock Register', category: 'Stock', origin: 'system', description: '' },
      { name: 'accounts.receivables', title: 'Receivables Outstanding', category: 'Accounts', origin: 'system', description: '' },
      { name: 'my.sales', title: 'My Sales', category: 'Sales', origin: 'company', description: '' },
    ]),
  listPivots: () => Promise.resolve([{ id: 9, name: 'sales.by.brand', title: 'Sales by Brand', category: 'Sales', description: '' }]),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Report Studio list filter', () => {
  it('filters the loaded list from the grid, on Enter, without asking the server', async () => {
    vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
    const { default: ReportListPage } = await import('../src/reports/ReportListPage.vue');
    const wrapper = mount(ReportListPage, { attachTo: document.body });
    await flushPromises();
    const titles = () => wrapper.findAll('tbody tr').map((row) => row.text()).filter((text) => text.includes('Register') || text.includes('Sales') || text.includes('Outstanding'));
    expect(titles()).toHaveLength(5);
    // A saved pivot is listed with the reports, as a pivot.
    expect(wrapper.findAll('tbody tr').find((row) => row.text().includes('Sales by Brand'))?.text()).toContain('Pivot');
    const grid = wrapper.get('.table-content');
    for (const key of 'stock') await grid.trigger('keydown', { key });
    // Typed, not applied yet.
    expect(titles()).toHaveLength(5);
    await grid.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(titles()).toHaveLength(2);
    expect(wrapper.text()).toContain('2 of 5 reports');
    wrapper.unmount();
  });
});

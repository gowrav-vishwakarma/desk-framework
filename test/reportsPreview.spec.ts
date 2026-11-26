import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeReportsHost } from './reportsHost';
import { defineComponent, h, ref } from 'vue';

fakeReportsHost();

const runReport = vi.fn((request: { previewStage?: string }) =>
  Promise.resolve({ columns: [{ name: 'x', label: 'x' }], rows: [{ x: request.previewStage }], count: 1, totals: null, meta: { ms: 5, report: 't' } }),
);
vi.mock('../src/reports/studioApi', () => ({ runReport: (request: { previewStage?: string }) => runReport(request) }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  runReport.mockClear();
  document.body.innerHTML = '';
});

async function mountPanel() {
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  const { provideReportDraft } = await import('../src/reports/designer/useReportDraft');
  const { default: PreviewPanel } = await import('../src/reports/designer/PreviewPanel.vue');
  let draft!: ReturnType<typeof provideReportDraft>;
  const Host = defineComponent({
    setup() {
      draft = provideReportDraft();
      draft.load({
        lang: 'rdl2',
        name: 't',
        title: 'T',
        params: [],
        stages: [
          { kind: 'source', id: 'bills', model: 'SalesInvoice', fields: [{ as: 'x', path: 'id' }] },
          { kind: 'filter', id: 'big', from: 'bills', where: 'x > 1' },
        ],
        output: { stage: 'big', columns: [{ column: 'x', label: 'X' }] },
      });
      return () => h(PreviewPanel);
    },
  });
  const wrapper = mount(Host, { attachTo: document.body });
  return { wrapper, draft };
}

async function select(draft: { selected: { value: string } }, id: string) {
  draft.selected.value = id;
  await flushPromises();
  await vi.advanceTimersByTimeAsync(1000);
  await flushPromises();
}

describe('report designer preview', () => {
  it('asks the server once per step state, and shows the kept rows when a step comes back', async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    const { wrapper, draft } = await mountPanel();
    await select(draft, 'bills');
    await select(draft, 'big');
    expect(runReport.mock.calls.map(([request]) => request.previewStage)).toEqual(['bills', 'big']);
    await select(draft, 'bills');
    expect(runReport).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('kept from the last run');
    // A change to a later step leaves the earlier one kept, and runs only the changed one.
    const big = draft.report.stages[1] as { where: string };
    big.where = 'x > 2';
    await select(draft, 'bills');
    expect(runReport).toHaveBeenCalledTimes(2);
    await select(draft, 'big');
    expect(runReport).toHaveBeenCalledTimes(3);
    // Undo back to the first version: kept, no request.
    big.where = 'x > 1';
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runReport).toHaveBeenCalledTimes(3);
    // Run always asks again.
    const runButton = wrapper.findAll('button').find((button) => button.text().includes('Run'))!;
    await runButton.trigger('click');
    await flushPromises();
    expect(runReport).toHaveBeenCalledTimes(4);
    wrapper.unmount();
  }, 15000);

  it('keeps an answer that arrives after the user moved to another step', async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    let release!: () => void;
    runReport.mockImplementationOnce((request) =>
      new Promise((resolve) => {
        release = () => resolve({ columns: [{ name: 'x', label: 'x' }], rows: [{ x: request.previewStage }], count: 1, totals: null, meta: { ms: 5, report: 't' } });
      }),
    );
    const { wrapper, draft } = await mountPanel();
    await select(draft, 'bills');
    await select(draft, 'big');
    release();
    await flushPromises();
    await select(draft, 'bills');
    expect(runReport.mock.calls.map(([request]) => request.previewStage)).toEqual(['bills', 'big']);
    expect(wrapper.text()).toContain('kept from the last run');
    wrapper.unmount();
  });
});

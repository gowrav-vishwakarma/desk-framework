import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import DeskGrid from '../src/grid/DeskGrid.vue';
import { DESK_FORM_ISSUES, type DeskFormIssues } from '../src/form/issues';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** A grid inside a form (a stand-in that records what the grid reports). */
function gridInForm(fieldId: string) {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  const form = { edited: vi.fn(), issueFor: () => null, mount: () => () => undefined } as unknown as DeskFormIssues;
  const wrapper = mount(DeskGrid, {
    props: {
      fieldId,
      mode: 'entry',
      rows: [{ id: 1, taskName: '' }],
      columns: [{ id: 'taskName', header: 'Task', width: 120, editor: 'text', type: 'text' }],
    },
    global: { provide: { [DESK_FORM_ISSUES as symbol]: form } },
    attachTo: document.body,
  });
  return { wrapper, form };
}

async function press(wrapper: ReturnType<typeof mount>, key: string): Promise<void> {
  await wrapper.get('.table-content').trigger('keydown', { key });
  await flushPromises();
}

describe('desk grid in a form: server refusals step aside when the grid is edited', () => {
  it('reports an edited cell to the form under the grid field id, as a settings row does', async () => {
    const { wrapper, form } = gridInForm('stops');
    expect(form.edited).not.toHaveBeenCalled();
    await press(wrapper, 'x');
    await press(wrapper, 'Enter');
    expect(form.edited).toHaveBeenCalledWith('stops');
    wrapper.unmount();
  });
});

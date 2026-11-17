import { defineComponent, nextTick, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/', fullPath: '/', params: {}, query: {}, meta: {} }),
  useRouter: () => ({ replace: () => Promise.resolve(), push: () => Promise.resolve() }),
}));
import DeskDialog from '../src/form/DeskDialog.vue';
import DeskTabs from '../src/form/DeskTabs.vue';
import DeskForm from '../src/form/DeskForm.vue';
import DeskField from '../src/form/DeskField.vue';
import DeskGrid from '../src/grid/DeskGrid.vue';
import DeskPageLayer from '../src/layout/DeskPageLayer.vue';
import { runDeskAction } from '../src/keys/layers';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const OUTER = [
  { id: '1', label: 'One' },
  { id: '2', label: 'Two' },
];
const INNER = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
];

beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.isConnected ? [{}] : []) as unknown as DOMRectList;
  });
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  document.body.innerHTML = '';
});

async function settle(): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
}

describe('nested desk tabs', () => {
  it('walks inner tabs first, then the outer tab, and wraps at both ends', async () => {
    const outer = ref('1');
    const left = ref('a');
    const right = ref('a');
    const Page = defineComponent({
      components: { DeskPageLayer, DeskTabs },
      setup() {
        return { outer, left, right, OUTER, INNER };
      },
      template: `
        <DeskPageLayer>
          <DeskTabs :model-value="outer" :tabs="OUTER" @update:model-value="outer = $event">
            <DeskTabs v-if="outer === '1'" :model-value="left" :tabs="INNER" @update:model-value="left = $event">
              <span data-where="1">{{ left }}</span>
            </DeskTabs>
            <DeskTabs v-else :model-value="right" :tabs="INNER" @update:model-value="right = $event">
              <span data-where="2">{{ right }}</span>
            </DeskTabs>
          </DeskTabs>
        </DeskPageLayer>
      `,
    });
    const host = mount(Page, { attachTo: document.body });
    await settle();

    expect(runDeskAction('desk-tab-next')).toBe(true);
    await settle();
    expect(outer.value).toBe('1');
    expect(left.value).toBe('b');

    expect(runDeskAction('desk-tab-next')).toBe(true);
    await settle();
    expect(outer.value).toBe('2');
    expect(right.value).toBe('a');

    expect(runDeskAction('desk-tab-prev')).toBe(true);
    await settle();
    expect(outer.value).toBe('1');
    expect(left.value).toBe('b');

    expect(runDeskAction('desk-tab-next')).toBe(true);
    await settle();
    expect(outer.value).toBe('2');
    expect(right.value).toBe('a');
    expect(runDeskAction('desk-tab-next')).toBe(true);
    await settle();
    expect(outer.value).toBe('2');
    expect(right.value).toBe('b');
    expect(runDeskAction('desk-tab-next')).toBe(true);
    await settle();
    expect(outer.value).toBe('1');
    expect(left.value).toBe('a');

    expect(runDeskAction('desk-tab-prev')).toBe(true);
    await settle();
    expect(outer.value).toBe('2');
    expect(right.value).toBe('b');
    host.unmount();
  });

  it('leaves the outer tab keys working after the inner group unmounts', async () => {
    const outer = ref('1');
    const inner = ref('a');
    const Page = defineComponent({
      components: { DeskPageLayer, DeskTabs },
      setup() {
        return { outer, inner, OUTER, INNER };
      },
      template: `
        <DeskPageLayer>
          <DeskTabs :model-value="outer" :tabs="OUTER" @update:model-value="outer = $event">
            <DeskTabs v-if="outer === '1'" :model-value="inner" :tabs="INNER" @update:model-value="inner = $event">
              <span>inner</span>
            </DeskTabs>
            <span v-else>solo</span>
          </DeskTabs>
        </DeskPageLayer>
      `,
    });
    const host = mount(Page, { attachTo: document.body });
    await settle();
    outer.value = '2';
    await settle();
    expect(runDeskAction('desk-tab-next')).toBe(true);
    await settle();
    expect(outer.value).toBe('1');
    host.unmount();
  });

  it('does not chain dialog tabs to the page tabs', async () => {
    const page = ref('p1');
    const dialog = ref('d1');
    const open = ref(true);
    const Page = defineComponent({
      components: { DeskPageLayer, DeskTabs, DeskDialog },
      setup() {
        return { page, dialog, open };
      },
      template: `
        <DeskPageLayer>
          <DeskTabs :model-value="page" :tabs="[{ id: 'p1', label: 'P1' }, { id: 'p2', label: 'P2' }]" @update:model-value="page = $event">
            <button type="button" data-desk-field="page-field">Page</button>
            <DeskDialog v-model:open="open" disable-initial-focus>
              <DeskTabs :model-value="dialog" :tabs="[{ id: 'd1', label: 'D1' }, { id: 'd2', label: 'D2' }]" @update:model-value="dialog = $event">
                <button type="button" data-desk-field="dialog-field">Dialog</button>
              </DeskTabs>
            </DeskDialog>
          </DeskTabs>
        </DeskPageLayer>
      `,
    });
    const host = mount(Page, { attachTo: document.body });
    await settle();
    expect(runDeskAction('desk-tab-next')).toBe(true);
    await settle();
    expect(dialog.value).toBe('d2');
    expect(page.value).toBe('p1');
    open.value = false;
    await settle();
    expect(runDeskAction('desk-tab-next')).toBe(true);
    await settle();
    expect(page.value).toBe('p2');
    host.unmount();
  });

  it('focuses the first field or grid when a tab is chosen, including a field that arrives later', async () => {
    const tab = ref('fields');
    const late = ref(false);
    const Page = defineComponent({
      components: { DeskPageLayer, DeskTabs, DeskGrid },
      setup() {
        return { tab, late };
      },
      template: `
        <DeskPageLayer>
          <button type="button" data-desk-field="stay" @click="tab = 'fields'">Stay</button>
          <DeskTabs
            :model-value="tab"
            :tabs="[{ id: 'fields', label: 'Fields' }, { id: 'grid', label: 'Grid' }, { id: 'late', label: 'Late' }]"
            @update:model-value="tab = $event"
          >
            <button v-if="tab === 'fields'" type="button" data-desk-field="first">First</button>
            <input v-if="tab === 'fields'" data-desk-field="second" />
            <DeskGrid
              v-if="tab === 'grid'"
              mode="list"
              :rows="[{ id: 1, name: 'Pen' }]"
              :columns="[{ id: 'name', header: 'Name', width: 80 }]"
            />
            <input v-if="tab === 'late' && late" data-desk-field="late-field" />
          </DeskTabs>
        </DeskPageLayer>
      `,
    });
    const host = mount(Page, { attachTo: document.body });
    await settle();

    const gridTab = [...document.body.querySelectorAll('button')].find((button) => button.textContent === 'Grid');
    gridTab?.click();
    await settle();
    expect(tab.value).toBe('grid');
    expect(document.activeElement?.classList.contains('table-content')).toBe(true);

    const fieldsTab = [...document.body.querySelectorAll('button')].find((button) => button.textContent === 'Fields');
    fieldsTab?.click();
    await settle();
    expect(document.activeElement?.getAttribute('data-desk-field')).toBe('first');

    const lateTab = [...document.body.querySelectorAll('button')].find((button) => button.textContent === 'Late');
    lateTab?.click();
    await settle();
    expect(document.activeElement?.getAttribute('data-desk-field')).not.toBe('late-field');
    late.value = true;
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement?.getAttribute('data-desk-field')).toBe('late-field');

    const stay = document.body.querySelector('[data-desk-field="stay"]');
    if (!(stay instanceof HTMLButtonElement)) throw new Error('missing stay');
    stay.focus();
    stay.click();
    await settle();
    expect(tab.value).toBe('fields');
    expect(document.activeElement).toBe(stay);
    host.unmount();
  });
});

describe('server issues and tabs', () => {
  it('opens the closed tab holding the field of a server issue and focuses the field', async () => {
    const tab = ref('main');
    const issues = ref<Array<{ message: string; fieldId?: string }>>([]);
    const TABS = [
      { id: 'main', label: 'Main', fields: ['name'] },
      { id: 'bank', label: 'Bank', fields: ['ifsc'] },
    ];
    const Page = defineComponent({
      components: { DeskPageLayer, DeskForm, DeskTabs, DeskField },
      setup() {
        return { tab, issues, TABS };
      },
      template: `
        <DeskPageLayer>
          <DeskForm :server-issues="issues">
            <DeskTabs :model-value="tab" :tabs="TABS" :in-url="false" @update:model-value="tab = $event">
              <DeskField v-if="tab === 'main'" model-value="" field-id="name" label="Name" />
              <DeskField v-else model-value="" field-id="ifsc" label="IFSC" />
            </DeskTabs>
          </DeskForm>
        </DeskPageLayer>`,
    });
    const host = mount(Page, { attachTo: document.body });
    await settle();
    issues.value = [{ message: 'IFSC is not valid', fieldId: 'ifsc' }];
    await settle();
    await settle();
    expect(tab.value).toBe('bank');
    expect(host.get('.desk-field-msg').text()).toBe('IFSC is not valid');
    expect(document.activeElement).toBe(host.get('input').element);
    expect(document.querySelectorAll('.desk-form-issue')).toHaveLength(0);
    host.unmount();
  });

  it('shows an issue no tab names in the form header strip', async () => {
    const Page = defineComponent({
      components: { DeskPageLayer, DeskForm, DeskTabs, DeskField },
      setup() {
        return { TABS: [{ id: 'main', label: 'Main', fields: ['name'] }] };
      },
      template: `
        <DeskPageLayer>
          <DeskForm :server-issues="[{ message: 'Party is blocked', fieldId: 'partyId' }]">
            <DeskTabs model-value="main" :tabs="TABS" :in-url="false"><DeskField model-value="" field-id="name" label="Name" /></DeskTabs>
          </DeskForm>
        </DeskPageLayer>`,
    });
    const host = mount(Page, { attachTo: document.body });
    await settle();
    expect([...document.querySelectorAll('.desk-form-issue')].map((n) => n.textContent)).toEqual(['Party is blocked']);
    host.unmount();
  });
});

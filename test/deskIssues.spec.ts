import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import DeskField from '../src/form/DeskField.vue';
import DeskForm from '../src/form/DeskForm.vue';
import { selectDeskControl } from '../src/focus/useDeskFocus';
import { issuesFromErrors, unplacedIssues, type DeskIssue } from '../src/form/issues';

/** A form with one field on screen. `issues` and `showField` are the page's state. */
function page(issues: DeskIssue[], required = false) {
  const list = ref(issues);
  const showField = ref(true);
  const Host = defineComponent({
    setup: () => () =>
      h(DeskForm, { issues: list.value }, () => (showField.value ? h(DeskField, { modelValue: '', fieldId: 'name', label: 'Name', required }) : [])),
  });
  const wrapper = mount(Host, { attachTo: document.body });
  return { wrapper, list, showField };
}

/** The form's header strip (`issueDisplay.ts` default): problems no field on screen can show. */
const toasts = (): string[] => [...document.querySelectorAll('.desk-form-issue')].map((node) => node.textContent ?? '');

describe('desk issues', () => {
  it('keeps one header issue per message and skips issues a mounted field can show', () => {
    const issues = [{ message: 'A', fieldId: 'a' }, { message: 'B' }, { message: 'B' }, { message: 'C', fieldId: 'c' }];
    expect(unplacedIssues(issues, (id) => id === 'a')).toEqual([{ message: 'B' }, { message: 'C', fieldId: 'c' }]);
  });

  it('shows an issue on its field and not in the header strip', async () => {
    const { wrapper } = page([{ message: 'Name is required', fieldId: 'name' }]);
    await nextTick();
    expect(wrapper.get('.desk-field-msg').text()).toBe('Name is required');
    expect(wrapper.get('.desk-field').classes()).toContain('is-invalid');
    expect(toasts()).toEqual([]);
    wrapper.unmount();
  });

  it('shows an issue in the header strip while its field is not on screen, then moves it onto the field', async () => {
    const { wrapper, showField } = page([{ message: 'Name is required', fieldId: 'name' }]);
    showField.value = false;
    await nextTick();
    expect(toasts()).toEqual(['Name is required']);
    showField.value = true;
    await nextTick();
    expect(toasts()).toEqual([]);
    expect(wrapper.get('.desk-field-msg').text()).toBe('Name is required');
    wrapper.unmount();
  });

  it('drops the header issue once the issue is gone', async () => {
    const { wrapper, list } = page([{ message: 'Add an item' }]);
    await nextTick();
    expect(toasts()).toEqual(['Add an item']);
    list.value = [];
    await nextTick();
    expect(toasts()).toEqual([]);
    wrapper.unmount();
  });

  it('maps a server key to a field, then its last segment, then the key', () => {
    const fieldFor = (key: string): string | undefined => (key === 'bankName' ? 'bankName' : undefined);
    expect(issuesFromErrors({
      'bankDetail.bankName': ['cannot be null', 'too short'],
      printName: 'bad print name',
      Error: ['loadBy not found'],
      'items[0].qty': ['bad qty'],
    }, fieldFor)).toEqual([
      { message: 'cannot be null; too short', fieldId: 'bankName' },
      { message: 'bad print name', fieldId: 'printName' },
      { message: 'loadBy not found', fieldId: 'Error' },
      { message: 'bad qty', fieldId: 'items[0].qty' },
    ]);
  });

  it('shows a server issue on its field, hides it after typing, and brings it back on the next save', async () => {
    const server = ref<DeskIssue[]>([{ message: 'Name cannot be null', fieldId: 'name' }]);
    const model = ref('');
    const Host = defineComponent({
      setup: () => () =>
        h(DeskForm, { serverIssues: server.value }, () =>
          h(DeskField, {
            modelValue: model.value,
            'onUpdate:modelValue': (value: string | number | null) => {
              model.value = value === null ? '' : String(value);
            },
            fieldId: 'name',
            label: 'Name',
          }),
        ),
    });
    const wrapper = mount(Host, { attachTo: document.body });
    await nextTick();
    expect(wrapper.get('.desk-field-msg').text()).toBe('Name cannot be null');
    expect(toasts()).toEqual([]);
    await wrapper.get('input').setValue('A');
    expect(wrapper.find('.desk-field-msg').exists()).toBe(false);
    server.value = [{ message: 'Still required', fieldId: 'name' }];
    await nextTick();
    expect(wrapper.get('.desk-field-msg').text()).toBe('Still required');
    wrapper.unmount();
  });

  it('shows a server error that names no field in the header strip', async () => {
    const Host = defineComponent({
      setup: () => () =>
        h(DeskForm, { serverIssues: [{ message: 'loadBy not found', fieldId: 'Error' }] }, () =>
          h(DeskField, { modelValue: '', fieldId: 'name', label: 'Name' }),
        ),
    });
    const wrapper = mount(Host, { attachTo: document.body });
    await nextTick();
    expect(toasts()).toEqual(['loadBy not found']);
    expect(wrapper.find('.desk-field-msg').exists()).toBe(false);
    wrapper.unmount();
  });

  it('focuses the field of the first server issue when the issues arrive', async () => {
    const server = ref<DeskIssue[]>([]);
    const Host = defineComponent({
      setup: () => () =>
        h(DeskForm, { serverIssues: server.value }, () => [
          h(DeskField, { modelValue: '', fieldId: 'code', label: 'Code' }),
          h(DeskField, { modelValue: '', fieldId: 'name', label: 'Name' }),
        ]),
    });
    const wrapper = mount(Host, { attachTo: document.body });
    await nextTick();
    server.value = [{ message: 'The name must be unique.', fieldId: 'name' }];
    await nextTick();
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(wrapper.findAll('input')[1]!.element);
    expect(toasts()).toEqual([]);
    wrapper.unmount();
  });

  it('marks an empty required field on blur without a header issue', async () => {
    const { wrapper } = page([], true);
    expect(wrapper.get('.desk-req').text()).toBe('*');
    expect(wrapper.get('.desk-field').classes()).not.toContain('is-invalid');
    await wrapper.get('input').trigger('focusout');
    expect(wrapper.get('.desk-field').classes()).toContain('is-invalid');
    expect(wrapper.find('.desk-field-msg').exists()).toBe(false);
    expect(toasts()).toEqual([]);
    wrapper.unmount();
  });
});

describe('desk field focus', () => {
  it('selects the value when a text field takes focus', async () => {
    const wrapper = mount(DeskField, {
      props: { modelValue: 0, fieldId: 'disc-value-0', label: 'Discount', kind: 'number' },
      attachTo: document.body,
    });
    const input = wrapper.get('input').element as HTMLInputElement;
    input.focus();
    await nextTick();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    wrapper.unmount();
  });

  it('leaves a date input unselected', () => {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = '2026-10-10';
    expect(() => selectDeskControl(input)).not.toThrow();
  });
});

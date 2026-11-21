import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import DeskCombo from '../src/form/DeskCombo.vue';

afterEach(() => {
  document.querySelectorAll('.desk-suggest').forEach((node) => node.remove());
});

/** The option list is teleported to `document.body`, outside the component wrapper. */
function suggestList(): HTMLElement | null {
  return document.querySelector('.desk-suggest');
}

function suggestHits(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.desk-suggest .hit')];
}

const options = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

function mountStatus(model = 'active'): VueWrapper {
  const wrapper = mount(DeskCombo, {
    props: {
      modelValue: model,
      options,
      fieldId: 'status',
      'onUpdate:modelValue': (value: string) => {
        void wrapper.setProps({ modelValue: value });
      },
    },
  });
  return wrapper;
}

describe('desk select', () => {
  it('opens on every focus, confirms with Enter, and moves on the next Enter', async () => {
    const wrapper = mountStatus();
    const input = wrapper.get('input');

    await input.trigger('focus');
    expect(suggestList()).not.toBeNull();
    expect(document.querySelector('.desk-suggest .hit.active')?.textContent).toBe('Active');

    await input.trigger('keydown', { key: 'Enter' });
    expect(suggestList()).toBeNull();
    expect(wrapper.emitted('advance')).toBeUndefined();

    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('advance')?.[0]).toEqual(['enter']);

    await input.trigger('focus');
    expect(suggestList()).not.toBeNull();
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('advance')).toHaveLength(1);
  });

  it('typing the value it already holds and Enter keeps that value (not the first option)', async () => {
    const wrapper = mountStatus('inactive');
    const input = wrapper.get('input');

    await input.trigger('focus');
    await input.setValue('');
    await input.setValue('Inactive');
    expect(document.querySelector('.desk-suggest .hit.active')?.textContent).toBe('Inactive');

    await input.trigger('keydown', { key: 'Enter' });
    // Unchanged: nothing is emitted, or the same value (before the fix: 'active', the first option).
    expect(wrapper.emitted('update:modelValue')?.at(-1) ?? ['inactive']).toEqual(['inactive']);
  });

  it('a grid dropdown confirms the highlighted row and moves on the same Enter', async () => {
    const wrapper = mount(DeskCombo, {
      props: {
        modelValue: 'msmeNo',
        variant: 'grid',
        options: [
          { label: 'MSME Number', value: 'msmeNo' },
          { label: 'FSSAI Number', value: 'fssaiNo' },
        ],
        'onUpdate:modelValue': (value: string) => {
          void wrapper.setProps({ modelValue: value });
        },
      },
    });
    await nextTick();
    expect(suggestList()).not.toBeNull();
    expect(document.querySelector('.desk-suggest .hit.active')?.textContent).toBe('MSME Number');

    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' });
    expect(document.querySelector('.desk-suggest .hit.active')?.textContent).toBe('FSSAI Number');

    await wrapper.get('input').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['fssaiNo']);
    expect(wrapper.emitted('advance')?.[0]).toEqual(['enter']);
  });

  it('a grid dropdown commits a clicked row on the same gesture', async () => {
    const wrapper = mount(DeskCombo, {
      props: {
        modelValue: '',
        variant: 'grid',
        blank: true,
        options,
        'onUpdate:modelValue': (value: string) => {
          void wrapper.setProps({ modelValue: value });
        },
      },
    });
    await nextTick();
    const hit = suggestHits().find((row) => row.textContent === 'Active');
    expect(hit).toBeTruthy();
    hit!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['active']);
    expect(wrapper.emitted('advance')?.[0]).toEqual(['enter']);
  });

  it('hides the list when focus moves to another field', async () => {
    const wrapper = mountStatus();
    await wrapper.get('input').trigger('focus');
    expect(suggestList()).not.toBeNull();

    const other = document.createElement('input');
    document.body.appendChild(other);
    wrapper.element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: other }));
    await nextTick();

    expect(suggestList()).toBeNull();
    other.remove();
  });

  it('does not keep text that is not one of the options', async () => {
    const wrapper = mountStatus();
    const input = wrapper.get('input');
    await input.trigger('focus');

    const el = input.element as HTMLInputElement;
    el.value = 'zzzz';
    await input.trigger('input');
    expect(el.value).toBe('Active');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    el.value = 'in';
    await input.trigger('input');
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['inactive']);
    expect((input.element as HTMLInputElement).value).toBe('Inactive');
  });

  it('moves through the open list with the arrow keys', async () => {
    const wrapper = mountStatus();
    const input = wrapper.get('input');
    await input.trigger('focus');
    await input.trigger('keydown', { key: 'ArrowDown' });
    const hits = suggestHits();
    expect(hits).toHaveLength(2);
    expect(hits[1]?.classList.contains('active')).toBe(true);
  });
});

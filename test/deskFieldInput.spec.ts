import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DeskField from '../src/form/DeskField.vue';

function field(props: Record<string, unknown>) {
  return mount(DeskField, {
    props: { modelValue: '', fieldId: 'code', label: 'Code', ...props },
    attachTo: document.body,
  });
}

async function type(wrapper: ReturnType<typeof field>, text: string) {
  const input = wrapper.get('input');
  (input.element as HTMLInputElement).value = text;
  await input.trigger('input');
  return input.element as HTMLInputElement;
}

function stored(wrapper: ReturnType<typeof field>): unknown {
  const updates = wrapper.emitted('update:modelValue') ?? [];
  return updates[updates.length - 1]?.[0];
}

describe('desk field input shaping', () => {
  it('shows its own placeholder, which wins over the placeholder label style', () => {
    const plain = field({ placeholder: 'Leave blank for auto' });
    expect(plain.get('input').attributes('placeholder')).toBe('Leave blank for auto');
    plain.unmount();
    const styled = field({ labelStyle: 'placeholder', required: true });
    expect(styled.get('input').attributes('placeholder')).toBe('Code *');
    styled.unmount();
    const both = field({ labelStyle: 'placeholder', placeholder: 'e.g. 42' });
    expect(both.get('input').attributes('placeholder')).toBe('e.g. 42');
    both.unmount();
  });

  it('runs the formatter on every input and shows and stores what it returns', async () => {
    const wrapper = field({ formatter: (value: string) => value.toUpperCase() });
    const input = await type(wrapper, 'abc');
    expect(input.value).toBe('ABC');
    expect(stored(wrapper)).toBe('ABC');
    wrapper.unmount();
  });

  it('caps the value at maxlength after the formatter, so a paste with spaces is not cut early', async () => {
    const wrapper = field({
      maxlength: '5',
      formatter: (value: string) => value.replace(/\s/g, ''),
    });
    const input = await type(wrapper, 'AB CD EF');
    expect(input.value).toBe('ABCDE');
    expect(stored(wrapper)).toBe('ABCDE');
    expect(input.getAttribute('maxlength')).toBeNull();
    wrapper.unmount();
  });

  it('keeps storing typed text for a number field unless it is numeric', async () => {
    const text = field({ kind: 'number' });
    await type(text, '42');
    expect(stored(text)).toBe('42');
    await type(text, '');
    expect(stored(text)).toBe('');
    text.unmount();

    const numeric = field({ kind: 'number', numeric: true });
    await type(numeric, '42.5');
    expect(stored(numeric)).toBe(42.5);
    await type(numeric, '');
    expect(stored(numeric)).toBeNull();
    await type(numeric, '4x');
    expect(stored(numeric)).toBe('4x');
    numeric.unmount();
  });
});

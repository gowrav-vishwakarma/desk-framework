import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DeskField from '../src/form/DeskField.vue';
import { applyDeskMask } from '../src/form/fieldMask';

describe('desk field mask', () => {
  it('fills each position with the next character that fits and drops the rest', () => {
    expect(applyDeskMask('abcde 1234 f', 'AAAAA9999A')).toBe('ABCDE1234F');
    expect(applyDeskMask('1abcde', 'AAAAA9999A')).toBe('ABCDE');
    expect(applyDeskMask('AB-12-x9', 'AA99**')).toBe('AB12X9');
    expect(applyDeskMask('ABCDE1234FZZZ', 'AAAAA9999A')).toBe('ABCDE1234F');
  });

  it('is stable: applying it again changes nothing', () => {
    const once = applyDeskMask('ab12 cd', 'AA99**');
    expect(applyDeskMask(once, 'AA99**')).toBe(once);
  });

  it('upper-cases only when the pattern takes letters', () => {
    expect(applyDeskMask('12ab34', '9999')).toBe('1234');
    expect(applyDeskMask('ab', '**')).toBe('AB');
  });

  it('shapes what is typed in a field; the pattern length caps it unless maxlength is given', async () => {
    const wrapper = mount(DeskField, {
      props: { modelValue: '', fieldId: 'code', label: 'Code', mask: 'AA99' },
      attachTo: document.body,
    });
    const input = wrapper.get('input');
    (input.element as HTMLInputElement).value = 'ab 1234';
    await input.trigger('input');
    expect((input.element as HTMLInputElement).value).toBe('AB12');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe('AB12');
    wrapper.unmount();
  });
});

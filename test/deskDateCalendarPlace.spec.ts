import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeskDateInput from '../src/date/DeskDateInput.vue';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function calendarSized(width: number, height: number): void {
  const real = (name: 'offsetWidth' | 'offsetHeight') =>
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)!.get!;
  const realWidth = real('offsetWidth');
  const realHeight = real('offsetHeight');
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('desk-calendar-pop') ? width : realWidth.call(this);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('desk-calendar-pop') ? height : realHeight.call(this);
  });
}

function inputAt(rect: { left: number; top: number; bottom: number }): void {
  vi.spyOn(HTMLInputElement.prototype, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    right: rect.left + 120,
    width: 120,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  } as DOMRect);
}

async function openCalendar(): Promise<HTMLElement> {
  const wrapper = mount(DeskDateInput, {
    props: { modelValue: null, fieldId: 'dueOn' },
    attachTo: document.body,
  });
  await wrapper.get('.desk-affix').trigger('mousedown');
  await flushPromises();
  const pop = document.querySelector<HTMLElement>('.desk-calendar-pop');
  if (!pop) throw new Error('calendar did not open');
  return pop;
}

describe('date calendar placement', () => {
  it('goes above an input near the bottom by its real height, inside the window', async () => {
    calendarSized(260, 300);
    inputAt({
      left: window.innerWidth - 50,
      top: window.innerHeight - 30,
      bottom: window.innerHeight - 10,
    });
    const pop = await openCalendar();
    expect(pop.style.top).toBe(`${window.innerHeight - 30 - 300 - 2}px`);
    expect(pop.style.left).toBe(`${window.innerWidth - 260 - 4}px`);
  });

  it('sits under an input with room below', async () => {
    calendarSized(260, 300);
    inputAt({ left: 40, top: 100, bottom: 120 });
    const pop = await openCalendar();
    expect(pop.style.top).toBe('122px');
    expect(pop.style.left).toBe('40px');
  });
});

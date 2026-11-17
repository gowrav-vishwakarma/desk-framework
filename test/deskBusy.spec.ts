import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import DeskBusy from '../src/layout/DeskBusy.vue';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('busy indicator', () => {
  it('stays hidden for a quick load', async () => {
    const wrapper = mount(DeskBusy, { props: { active: true } });
    vi.advanceTimersByTime(200);
    await wrapper.setProps({ active: false });
    vi.advanceTimersByTime(500);
    await nextTick();
    expect(wrapper.find('.desk-busy').exists()).toBe(false);
  });

  it('shows after a moment and counts the seconds of a slow load', async () => {
    const wrapper = mount(DeskBusy, { props: { active: true, label: 'Running…' } });
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(wrapper.find('.desk-busy').text()).toBe('Running…');
    vi.advanceTimersByTime(3000);
    await nextTick();
    expect(wrapper.find('.desk-busy-time').text()).toBe('3s');
    await wrapper.setProps({ active: false });
    expect(wrapper.find('.desk-busy').exists()).toBe(false);
  });
});

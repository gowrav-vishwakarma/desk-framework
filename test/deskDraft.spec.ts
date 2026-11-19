import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, reactive } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { configureDesk } from '../src/host';
import { useDeskDraft, type DeskDraft } from '../src/form/draft';
import { useDeskFormDirty, type DeskFormDirty } from '../src/form/formDirty';
import { useDeskSubmission, type DeskSubmission } from '../src/request/submission';
import { createMemoryDraftStore, DESK_DRAFT_MAX_AGE_MS, type DeskDraftStore } from '../src/storage/deskDrafts';

let store: DeskDraftStore;
let scope = 'c1:u1';

beforeEach(() => {
  store = createMemoryDraftStore();
  scope = 'c1:u1';
  configureDesk({ presets: {}, presetLabels: [], defaultPreset: '', label: (id) => id, draftScope: () => scope, drafts: store });
});

interface Opened {
  wrapper: VueWrapper;
  form: { name: string; amount: number };
  changes: DeskFormDirty;
  submission: DeskSubmission;
  draft: DeskDraft;
  ask: ReturnType<typeof vi.fn>;
}

/** The payment form of `record`, as a page opens it (a reload is opening it again on the same store). */
async function open(record: string, restore = true): Promise<Opened> {
  const ask = vi.fn(() => Promise.resolve(restore));
  let made!: Omit<Opened, 'wrapper' | 'ask'>;
  const Page = defineComponent({
    setup() {
      const form = reactive({ name: '', amount: 0 });
      const changes = useDeskFormDirty(() => form);
      const submission = useDeskSubmission();
      const draft = useDeskDraft({
        page: 'payment',
        record: () => record,
        ready: () => true,
        read: () => ({ ...form }),
        apply: (saved) => void Object.assign(form, saved),
        dirty: changes,
        submission,
        ask,
        delay: 0,
      });
      made = { form, changes, submission, draft };
      return () => null;
    },
  });
  // Never unmounted unless a test means it: unmounting is leaving the page (a reload is opening it again).
  const wrapper = mount(Page);
  await settle();
  return { wrapper, ask, ...made };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function type(page: Opened, name: string): Promise<void> {
  page.changes.arm();
  page.form.name = name;
  page.form.amount = 250;
  await settle();
  await page.draft.flush();
}

describe('desk drafts', () => {
  it('keeps the unsent form and the pending key, and restores both after a reload', async () => {
    const first = await open('new');
    expect(first.ask).not.toHaveBeenCalled();
    await type(first, 'Rent');
    const key = first.submission.take();
    await settle();
    await first.draft.flush();
    expect((await store.read('c1:u1|payment|new'))?.value).toEqual({ name: 'Rent', amount: 250 });

    const reloaded = await open('new');
    expect(reloaded.ask).toHaveBeenCalledTimes(1);
    expect(reloaded.form).toEqual({ name: 'Rent', amount: 250 });
    expect(reloaded.submission.key.value).toBe(key);
    expect(reloaded.changes.dirty.value).toBe(true);
    expect(reloaded.draft.restoredAt.value).not.toBeNull();
  });

  it('a clean form keeps nothing: a save (reset) clears the draft', async () => {
    const page = await open('7');
    await type(page, 'Rent');
    expect(await store.read('c1:u1|payment|7')).not.toBeNull();
    page.changes.reset();
    await settle();
    await page.draft.flush();
    expect(await store.read('c1:u1|payment|7')).toBeNull();
  });

  it('Discard at the question drops the draft; so does an explicit discard and leaving the page', async () => {
    const page = await open('7');
    await type(page, 'Rent');
    const declined = await open('7', false);
    expect(declined.ask).toHaveBeenCalledTimes(1);
    expect(declined.form.name).toBe('');
    expect(await store.read('c1:u1|payment|7')).toBeNull();

    const again = await open('8');
    await type(again, 'Water');
    await again.draft.discard();
    expect(await store.read('c1:u1|payment|8')).toBeNull();

    const left = await open('9');
    await type(left, 'Power');
    left.wrapper.unmount();
    await settle();
    expect(await store.read('c1:u1|payment|9')).toBeNull();
  });

  it('is kept apart per company, user and record', async () => {
    const page = await open('7');
    await type(page, 'Rent');
    scope = 'c2:u1';
    expect((await open('7')).ask).not.toHaveBeenCalled();
    scope = 'c1:u2';
    expect((await open('7')).ask).not.toHaveBeenCalled();
    scope = 'c1:u1';
    expect((await open('8')).ask).not.toHaveBeenCalled();
    expect((await open('7')).ask).toHaveBeenCalledTimes(1);
  });

  it('drops expired drafts, this one and any other', async () => {
    const old = Date.now() - DESK_DRAFT_MAX_AGE_MS - 1000;
    await store.write({ key: 'c1:u1|payment|7', savedAt: old, value: { name: 'Old', amount: 1 }, submissionKey: null });
    await store.write({ key: 'c1:u1|receipt|3', savedAt: old, value: {}, submissionKey: null });
    const page = await open('7');
    expect(page.ask).not.toHaveBeenCalled();
    expect(page.form.name).toBe('');
    expect(await store.read('c1:u1|receipt|3')).toBeNull();
  });

  it('keeps nothing without a scope (signed out)', async () => {
    scope = '';
    const page = await open('7');
    await type(page, 'Rent');
    expect(await store.read('|payment|7')).toBeNull();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, nextTick, reactive } from 'vue';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { configureDesk } from '../src/host';
import { useDeskFormDirty, type DeskFormDirty } from '../src/form/formDirty';
import { createMemoryDraftStore, DESK_DRAFT_MAX_AGE_MS, type DeskDraftStore } from '../src/storage/deskDrafts';

let store: DeskDraftStore;
let scope = 'c1:u1';
let answered: (error: unknown) => boolean = () => false;

beforeEach(() => {
  store = createMemoryDraftStore();
  scope = 'c1:u1';
  answered = () => false;
  configureDesk({ presets: {}, presetLabels: [], defaultPreset: '', label: (id) => id, draftScope: () => scope, drafts: store, submitAnswered: (error) => answered(error) });
});

/** What the server holds for each record. */
const SERVER: Record<string, { name: string; amount: number }> = { '7': { name: 'Saved rent', amount: 100 }, '8': { name: 'Saved water', amount: 40 } };

interface Opened {
  router: Router;
  form: { name: string; amount: number };
  changes: DeskFormDirty;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Opens `url` in a fresh app, as a reload or a new visit does; the page loads its record, then resets its tracker. */
async function open(url: string, draft?: false): Promise<Opened> {
  let made!: Omit<Opened, 'router'>;
  const Page = defineComponent({
    setup() {
      const form = reactive({ name: '', amount: 0 });
      const changes = useDeskFormDirty(() => form, draft === false ? { draft } : {});
      const id = String(router.currentRoute.value.params.id ?? 'new');
      void Promise.resolve().then(() => {
        if (SERVER[id]) Object.assign(form, SERVER[id]);
        changes.reset();
      });
      made = { form, changes };
      return () => null;
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/c/:company/payment/add', component: Page },
      { path: '/c/:company/payment/edit/:id', component: Page },
    ],
  });
  await router.push(url);
  // Never unmounted: a reload is a new app on the same store.
  mount(Page, { global: { plugins: [router] } });
  await settle();
  return { router, ...made };
}

async function type(page: Opened, name: string): Promise<void> {
  page.changes.arm();
  page.form.name = name;
  page.form.amount = 250;
  await settle();
  await page.changes.draft.flush();
  await settle();
}

const draftKey = (page: Opened): string | undefined => page.router.currentRoute.value.query.draft as string | undefined;
const kept = async (path: string, key: string | undefined) => (await store.read(`${scope}|${path}|${key ?? ''}`))?.value;

describe('desk drafts: a new record', () => {
  it('the first change puts a key in the URL; a reload with it restores the form and its idempotency key', async () => {
    const page = await open('/c/1/payment/add');
    expect(draftKey(page)).toBeUndefined();
    await type(page, 'Rent');
    const key = draftKey(page);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(await kept('/c/1/payment/add', key)).toEqual({ name: 'Rent', amount: 250 });
    // A save whose answer never came: its key stays with the draft.
    let sent = '';
    await page.changes.draft
      .submit((idempotencyKey) => {
        sent = idempotencyKey;
        return Promise.reject(new Error('Network Error'));
      })
      .catch(() => undefined);
    await settle();
    await page.changes.draft.flush();

    const reloaded = await open(`/c/1/payment/add?draft=${key}`);
    expect(reloaded.form).toEqual({ name: 'Rent', amount: 250 });
    expect(reloaded.changes.dirty.value).toBe(true);
    expect(reloaded.changes.draft.restoredAt.value).not.toBeNull();
    expect(reloaded.changes.draft.pendingKey.value).toBe(sent);
  });

  it('opening Add again without the key starts empty and drops the old add drafts', async () => {
    const page = await open('/c/1/payment/add');
    await type(page, 'Rent');
    const key = draftKey(page);
    const again = await open('/c/1/payment/add');
    expect(again.form).toEqual({ name: '', amount: 0 });
    expect(again.changes.draft.restoredAt.value).toBeNull();
    expect(await kept('/c/1/payment/add', key)).toBeUndefined();
  });

  it('a save (the form clean again) removes the draft and the key leaves the URL', async () => {
    const page = await open('/c/1/payment/add');
    await type(page, 'Rent');
    const key = draftKey(page);
    const reloaded = await open(`/c/1/payment/add?draft=${key}`);
    await reloaded.changes.draft.submit(() => Promise.resolve('saved'));
    reloaded.changes.reset();
    await settle();
    await reloaded.changes.draft.flush();
    await settle();
    expect(await kept('/c/1/payment/add', key)).toBeUndefined();
    expect(draftKey(reloaded)).toBeUndefined();
    expect(reloaded.changes.draft.pendingKey.value).toBeNull();
  });
});

describe('desk drafts: an existing record', () => {
  it('a reload with the key restores the change over the server record', async () => {
    const page = await open('/c/1/payment/edit/7');
    expect(page.form.name).toBe('Saved rent');
    await type(page, 'Rent, corrected');
    const key = draftKey(page);
    expect(key).toBeDefined();
    const reloaded = await open(`/c/1/payment/edit/7?draft=${key}`);
    expect(reloaded.form).toEqual({ name: 'Rent, corrected', amount: 250 });
  });

  it('opening it through Edit (no key) starts from the server record and removes its old drafts', async () => {
    const page = await open('/c/1/payment/edit/7');
    await type(page, 'Rent, corrected');
    const key = draftKey(page);
    const fresh = await open('/c/1/payment/edit/7');
    expect(fresh.form).toEqual(SERVER['7']);
    expect(await kept('/c/1/payment/edit/7', key)).toBeUndefined();
  });

  it('Discard puts the saved record back and removes the draft and the key', async () => {
    const page = await open('/c/1/payment/edit/7');
    await type(page, 'Rent, corrected');
    const key = draftKey(page);
    const reloaded = await open(`/c/1/payment/edit/7?draft=${key}`);
    await reloaded.changes.draft.discard();
    await settle();
    await reloaded.changes.draft.flush();
    await settle();
    expect(reloaded.form).toEqual(SERVER['7']);
    expect(reloaded.changes.dirty.value).toBe(false);
    expect(await kept('/c/1/payment/edit/7', key)).toBeUndefined();
    expect(draftKey(reloaded)).toBeUndefined();
  });
});

describe('desk drafts: scope and limits', () => {
  it('is kept apart per company, user and record', async () => {
    const page = await open('/c/1/payment/edit/7');
    await type(page, 'Rent, corrected');
    const key = draftKey(page)!;
    scope = 'c2:u1';
    expect((await open(`/c/1/payment/edit/7?draft=${key}`)).form).toEqual(SERVER['7']);
    scope = 'c1:u2';
    expect((await open(`/c/1/payment/edit/7?draft=${key}`)).form).toEqual(SERVER['7']);
    scope = 'c1:u1';
    expect((await open(`/c/1/payment/edit/8?draft=${key}`)).form).toEqual(SERVER['8']);
    expect((await open(`/c/1/payment/edit/7?draft=${key}`)).form.name).toBe('Rent, corrected');
  });

  it('a page that opts out keeps nothing and puts no key in its URL', async () => {
    const page = await open('/c/1/payment/add', false);
    await type(page, 'Rent');
    expect(draftKey(page)).toBeUndefined();
    expect(await store.read(`${scope}|/c/1/payment/add|`)).toBeNull();
  });

  it('drops expired drafts', async () => {
    await store.write({ key: `${scope}|/c/1/payment/edit/7|old`, savedAt: Date.now() - DESK_DRAFT_MAX_AGE_MS - 1000, value: { name: 'Old', amount: 1 }, submissionKey: null });
    const page = await open('/c/1/payment/edit/7?draft=old');
    expect(page.form).toEqual(SERVER['7']);
    expect(await store.read(`${scope}|/c/1/payment/edit/7|old`)).toBeNull();
  });

  it('leaves files out of a draft', async () => {
    const page = await open('/c/1/payment/add');
    page.changes.arm();
    (page.form as Record<string, unknown>).image = new File(['x'], 'qr.png');
    await type(page, 'Rent');
    expect(await kept('/c/1/payment/add', draftKey(page))).toEqual({ name: 'Rent', amount: 250 });
  });

  it('one idempotency key per submission: the same on a retry with no answer, new after success or an answer', async () => {
    const page = await open('/c/1/payment/add');
    const keys: string[] = [];
    const fail = (error: Error) => (key: string) => {
      keys.push(key);
      return Promise.reject(error);
    };
    const succeed = (key: string) => {
      keys.push(key);
      return Promise.resolve('saved');
    };
    const { draft } = page.changes;
    await draft.submit(fail(new Error('Network Error'))).catch(() => undefined);
    await expect(draft.submit(succeed)).resolves.toBe('saved');
    await draft.submit(succeed);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
    answered = (error) => (error as Error).message === 'Refused';
    await draft.submit(fail(new Error('Refused'))).catch(() => undefined);
    expect(draft.pendingKey.value).toBeNull();
    await draft.submit(fail(new Error('Network Error'))).catch(() => undefined);
    expect(draft.pendingKey.value).toBe(keys[4]);
  });
});

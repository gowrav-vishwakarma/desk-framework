import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { deskIsAborted, deskPageSignal, deskSharedSignal, installDeskPageAbort } from '../src/request/pageAbort';
import { useDeskLatest } from '../src/request/latest';
import { deskUuid, useDeskSubmission } from '../src/request/submission';

const page = { render: () => null };

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/report', component: page },
      { path: '/list', component: page },
      { path: '/voucher/:id', component: page },
    ],
  });
}

let uninstall: (() => void) | null = null;
afterEach(() => {
  uninstall?.();
  uninstall = null;
});

describe('page abort', () => {
  it('a call made before any page carries no signal', () => {
    expect(deskPageSignal()).toBeUndefined();
  });

  it('leaving a page aborts its calls; the next page gets a fresh signal; a shared load survives', async () => {
    const router = makeRouter();
    uninstall = installDeskPageAbort(router);
    await router.push('/report');
    const report = deskPageSignal()!;
    expect(report).toBe(deskPageSignal());
    expect(report.aborted).toBe(false);

    await router.push('/list');
    expect(report.aborted).toBe(true);
    expect(deskIsAborted(report.reason)).toBe(true);
    const list = deskPageSignal()!;
    expect(list.aborted).toBe(false);
    expect(deskSharedSignal().aborted).toBe(false);
  });

  it('a query or hash change is the same page; a param change is another page', async () => {
    const router = makeRouter();
    uninstall = installDeskPageAbort(router);
    await router.push('/voucher/7');
    const seven = deskPageSignal()!;
    await router.push('/voucher/7?tab=lines');
    expect(seven.aborted).toBe(false);
    expect(deskPageSignal()).toBe(seven);
    await router.push('/voucher/8');
    expect(seven.aborted).toBe(true);
  });

  it("a guard loading for the page being opened gets that page's signal, which survives the arrival", async () => {
    const router = makeRouter();
    uninstall = installDeskPageAbort(router);
    let loaded: AbortSignal | undefined;
    router.beforeEach((to) => {
      if (to.path === '/list') loaded = deskPageSignal();
    });
    await router.push('/report');
    const report = deskPageSignal()!;
    await router.push('/list');
    expect(loaded).toBeDefined();
    expect(loaded).not.toBe(report);
    expect(loaded!.aborted).toBe(false);
    expect(report.aborted).toBe(true);
  });

  it('a refused navigation aborts what was started for the page that never opened, and keeps the page on screen', async () => {
    const router = makeRouter();
    uninstall = installDeskPageAbort(router);
    let started: AbortSignal | undefined;
    router.beforeEach((to) => {
      if (to.path !== '/list') return true;
      started = deskPageSignal();
      return false;
    });
    await router.push('/report');
    const report = deskPageSignal()!;
    await router.push('/list');
    expect(started!.aborted).toBe(true);
    expect(report.aborted).toBe(false);
    expect(deskPageSignal()).toBe(report);
  });

  it('knows an abort from an answer', () => {
    expect(deskIsAborted(new DOMException('x', 'AbortError'))).toBe(true);
    expect(deskIsAborted({ name: 'CanceledError', code: 'ERR_CANCELED' })).toBe(true);
    expect(deskIsAborted(new Error('Request failed'))).toBe(false);
    expect(deskIsAborted(null)).toBe(false);
  });
});

/** A call that answers when told, or rejects when its signal aborts (as axios and fetch do). */
function call<T>(signal: AbortSignal) {
  let answer!: (value: T) => void;
  const promise = new Promise<T>((resolve, reject) => {
    answer = resolve;
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  return { promise, answer };
}

describe('latest run', () => {
  it("a new run aborts the one before it; the old one's answer never lands", async () => {
    const latest = useDeskLatest();
    let first!: ReturnType<typeof call<string>>;
    let second!: ReturnType<typeof call<string>>;
    const one = latest.run((signal) => (first = call<string>(signal)).promise);
    const two = latest.run((signal) => (second = call<string>(signal)).promise);
    await expect(one).rejects.toSatisfy(deskIsAborted);
    expect(latest.busy.value).toBe(true);
    second.answer('fresh');
    await expect(two).resolves.toBe('fresh');
    expect(latest.busy.value).toBe(false);
  });

  it('an answer that arrives after the run was replaced is dropped', async () => {
    const latest = useDeskLatest();
    let release!: (value: string) => void;
    const stale = latest.run(() => new Promise<string>((resolve) => (release = resolve)));
    const fresh = latest.run(() => Promise.resolve('fresh'));
    release('stale');
    await expect(stale).rejects.toSatisfy(deskIsAborted);
    await expect(fresh).resolves.toBe('fresh');
  });

  it('abort() stops the run in flight; leaving the page stops it too', async () => {
    const router = makeRouter();
    uninstall = installDeskPageAbort(router);
    await router.push('/report');
    const latest = useDeskLatest();
    const own = latest.run((signal) => call<string>(signal).promise);
    latest.abort();
    await expect(own).rejects.toSatisfy(deskIsAborted);
    expect(latest.busy.value).toBe(false);

    const running = latest.run((signal) => call<string>(signal).promise);
    await router.push('/list');
    await expect(running).rejects.toSatisfy(deskIsAborted);
  });
});

describe('submission key', () => {
  it('one key per submission: kept until cleared, restored from a draft, new after clear', () => {
    const submission = useDeskSubmission();
    expect(submission.key.value).toBeNull();
    const first = submission.take();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(submission.take()).toBe(first);
    submission.clear();
    const second = submission.take();
    expect(second).not.toBe(first);
    submission.restore(first);
    expect(submission.take()).toBe(first);
  });

  it('makes v4 UUIDs without randomUUID (an http page on the LAN)', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const made = new Set(Array.from({ length: 50 }, () => deskUuid()));
      expect(made.size).toBe(50);
      for (const uuid of made) expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});

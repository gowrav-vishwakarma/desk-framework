import { createDeskClient, type DeskClient } from './client';
import { createDeskUser, type DeskUser } from './user';
import type { DeskPage } from './types';

/** The part of Playwright's `test.extend` the fixtures need, so this file imports nothing. */
export interface ExtendableTest<Fixtures> {
  extend<Extra>(fixtures: {
    [K in keyof Extra]: (args: Fixtures & { page: DeskPage }, use: (value: Extra[K]) => Promise<void>) => Promise<void>;
  }): unknown;
}

export interface DeskFixtures {
  desk: DeskClient;
  user: DeskUser;
}

/**
 * `desk` and `user` fixtures for Playwright. Before the first page script runs they turn automation on, so the
 * page registers its node tree from the start.
 *
 *     export const test = base.extend<DeskFixtures>(deskFixtureDefs());
 */
export function deskFixtureDefs() {
  return {
    desk: async ({ page }: { page: DeskPage & { addInitScript?: (script: () => void) => Promise<void> } }, use: (value: DeskClient) => Promise<void>) => {
      await page.addInitScript?.(() => {
        (window as unknown as { __DESK_AUTOMATION__?: boolean }).__DESK_AUTOMATION__ = true;
      });
      await use(createDeskClient(page));
    },
    user: async ({ desk }: { desk: DeskClient }, use: (value: DeskUser) => Promise<void>) => {
      await use(createDeskUser(desk));
    },
  };
}

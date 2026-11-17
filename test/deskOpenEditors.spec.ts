import { describe, expect, it, vi } from 'vitest';
import { commitEditorsBefore, commitOpenEditors, registerOpenEditor } from '../src/form/openEditors';

describe('desk open editors', () => {
  it('writes every open editor, and none after it is released', () => {
    const grid = vi.fn();
    const header = vi.fn();
    const releaseGrid = registerOpenEditor(grid);
    const releaseHeader = registerOpenEditor(header);
    commitOpenEditors();
    expect(grid).toHaveBeenCalledTimes(1);
    expect(header).toHaveBeenCalledTimes(1);
    releaseGrid();
    releaseHeader();
    commitOpenEditors();
    expect(grid).toHaveBeenCalledTimes(1);
  });

  it('writes before save or OK, and leaves the editor alone for cancel, close and moves', () => {
    const commit = vi.fn();
    const release = registerOpenEditor(commit);
    commitEditorsBefore(['action-save', 'action-form-save']);
    expect(commit).toHaveBeenCalledTimes(1);
    commitEditorsBefore(['settlement-config']);
    expect(commit).toHaveBeenCalledTimes(2);
    commitEditorsBefore(['action-cancel']);
    commitEditorsBefore(['dialog-close']);
    commitEditorsBefore(['desk-move-down']);
    commitEditorsBefore(['desk-tab-next']);
    expect(commit).toHaveBeenCalledTimes(2);
    release();
  });

  it('keeps going when one editor throws', () => {
    const bad = registerOpenEditor(() => {
      throw new Error('broken');
    });
    const good = vi.fn();
    const releaseGood = registerOpenEditor(good);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    commitOpenEditors();
    expect(good).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    bad();
    releaseGood();
  });
});

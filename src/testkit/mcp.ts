import type { DeskClient } from './client';

/** One tool an MCP server (or any agent loop) can offer. `inputSchema` is JSON Schema. */
export interface DeskMcpTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

const str = (description: string) => ({ type: 'string', description });
const obj = (description: string) => ({ type: 'object', description });

/**
 * The desk driver as agent tools. The same surface the in-app Support AI has, so an external agent
 * and the Support AI read and act on the page the same way.
 */
export function deskMcpTools(client: DeskClient): DeskMcpTool[] {
  return [
    {
      name: 'desk_snapshot',
      description: 'Read the open Desk page as a tree of nodes. path limits it ("top" is the topmost dialog or page); depth bounds it; rows {offset, limit} pages grids.',
      inputSchema: { type: 'object', properties: { path: str('node path'), depth: { type: 'number' }, rows: obj('{offset, limit}') } },
      run: (args) => client.snapshot(args as { path?: string; depth?: number }),
    },
    {
      name: 'desk_describe',
      description: 'List what one node can do: ops with argument names, and child paths.',
      inputSchema: { type: 'object', properties: { path: str('node path') } },
      run: (args) => client.describe(typeof args.path === 'string' ? args.path : ''),
    },
    {
      name: 'desk_read',
      description: 'Read one node in full: a grid\'s rows, a field\'s value and error, a pivot\'s cells.',
      inputSchema: { type: 'object', properties: { path: str('node path'), rows: obj('{offset, limit}') }, required: ['path'] },
      run: (args) => client.read(String(args.path), args.rows as { offset?: number; limit?: number } | undefined),
    },
    {
      name: 'desk_act',
      description: 'Run an op on a node as a user would. Returns changed, opened, closed, focus, issues and toasts. A refused op returns ok=false with the reason.',
      inputSchema: { type: 'object', properties: { path: str('node path'), op: str('op name from desk_describe'), args: obj('op arguments') }, required: ['path', 'op'] },
      run: (args) => client.act(String(args.path), String(args.op), (args.args as Record<string, unknown> | undefined) ?? {}),
    },
    {
      name: 'desk_fill',
      description: 'Set one field by path, as typing would.',
      inputSchema: { type: 'object', properties: { path: str('field path'), value: { description: 'the value' } }, required: ['path', 'value'] },
      run: (args) => client.fill(String(args.path), args.value),
    },
    {
      name: 'desk_fill_form',
      description: 'Fill several fields of a form: values maps field name to value. Never saves.',
      inputSchema: { type: 'object', properties: { path: str('form path'), values: obj('field name to value') }, required: ['path', 'values'] },
      run: (args) => client.fillForm(String(args.path), args.values as Record<string, unknown>),
    },
    {
      name: 'desk_press',
      description: 'Press a key combination such as Enter, Ctrl+Enter or Alt+S.',
      inputSchema: { type: 'object', properties: { combo: str('key combination') }, required: ['combo'] },
      run: (args) => client.press(String(args.combo)),
    },
    {
      name: 'desk_rows',
      description: 'Read grid rows as shown: a sample, a page (offset, limit up to 100), rows whose text matches (match: text or {column: text}), or rows by key. columns picks columns; format csv returns CSV text. path may be the page or a report holding one grid.',
      inputSchema: {
        type: 'object',
        properties: { path: str('grid path, or a node holding one grid'), offset: { type: 'number' }, limit: { type: 'number' }, columns: { type: 'array', items: { type: 'string' } }, match: { description: 'text or {column: text}' }, keys: { type: 'array', items: { type: 'string' } }, format: { type: 'string', enum: ['json', 'csv'] } },
      },
      run: (args) => {
        const { path, ...rest } = args;
        return client.rows(typeof path === 'string' && path ? path : 'top', rest);
      },
    },
    {
      name: 'desk_fields',
      description: 'List every field on the open page or dialog (or under path): the exact path to fill, label, editor, current value, issue and select options. Use it before desk_fill and whenever a fill is refused.',
      inputSchema: { type: 'object', properties: { path: str('node path, default the topmost page or dialog') } },
      run: (args) => client.fields(typeof args.path === 'string' && args.path ? args.path : 'top'),
    },
    {
      name: 'desk_targets',
      description: 'List the Desk pages desk_navigate can open.',
      inputSchema: { type: 'object', properties: {} },
      run: () => client.targets(),
    },
    {
      name: 'desk_navigate',
      description: 'Open a Desk page by target id or by path under the Desk root.',
      inputSchema: { type: 'object', properties: { target: str('id or path') }, required: ['target'] },
      run: (args) => client.navigate(String(args.target)),
    },
    {
      name: 'desk_wait_idle',
      description: 'Wait until nothing is loading.',
      inputSchema: { type: 'object', properties: {} },
      run: () => client.waitIdle(),
    },
    {
      name: 'desk_audit',
      description: 'Find nodes and controls an agent cannot see or reach: unnamed surfaces, duplicate paths, interactive DOM outside any node.',
      inputSchema: { type: 'object', properties: {} },
      run: () => client.audit(),
    },
    {
      name: 'desk_events',
      description: 'Events since an id: dialogs opening, toasts, navigation.',
      inputSchema: { type: 'object', properties: { since: { type: 'number' } } },
      run: (args) => client.events(Number(args.since ?? 0)),
    },
    {
      name: 'desk_apply_set',
      description: 'Apply a named test set (settings, rows, layouts) registered on the page, or a full set object.',
      inputSchema: { type: 'object', properties: { set: { description: 'name or {name, extends, parts}' } }, required: ['set'] },
      run: (args) => client.sets.apply(args.set as string),
    },
  ];
}

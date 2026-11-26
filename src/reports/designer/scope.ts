import type { Rdl2Param } from '../language';
import type { ExprScope, ValueType } from './expr';
import { resolvePath, valueTypeOf, type Catalog, type ColumnInfo } from './schema';

/**
 * What a formula or condition may name where it is edited: the columns of the step it reads, or,
 * in a "Read records" step, any field of the model and of the records it links to.
 */
export interface NameScope {
  columns: readonly ColumnInfo[];
  /** Set in a source step: names are catalog paths of this model. */
  model?: string;
}

export function scopeType(scope: NameScope, catalog: Catalog, name: string): ValueType {
  if (scope.model) {
    const found = resolvePath(catalog, scope.model, name);
    return 'error' in found ? 'unknown' : valueTypeOf(found.field.type);
  }
  return scope.columns.find((col) => col.name === name)?.type ?? 'unknown';
}

export function scopeValues(
  scope: NameScope,
  catalog: Catalog,
  name: string,
): string[] | undefined {
  if (scope.model) {
    const found = resolvePath(catalog, scope.model, name);
    return 'error' in found ? undefined : found.field.values;
  }
  return scope.columns.find((col) => col.name === name)?.values;
}

export function exprScopeOf(
  scope: NameScope,
  catalog: Catalog,
  params: readonly Rdl2Param[],
  functions: readonly string[],
): ExprScope {
  const ids = params.map((param) => param.id).filter(Boolean);
  if (scope.model) {
    const model = scope.model;
    return {
      hasName: (name) => !('error' in resolvePath(catalog, model, name)),
      params: ids,
      functions,
    };
  }
  const names = new Set(scope.columns.map((col) => col.name));
  return { hasName: (name) => names.has(name), params: ids, functions, suggest: [...names] };
}

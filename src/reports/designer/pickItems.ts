import type { Rdl2Param, Rdl2Stage } from '../language';
import type { CatalogModel } from '../studioApi';
import type { ValueType } from './expr';
import type { IconName } from './icons';
import type { ColumnInfo } from './schema';
import { stepInfo, type StepGroup } from './steps';

/** One choice in a `PickList`. `group` puts it under a heading; `sub` is a quiet second text. */
export interface PickItem {
  value: string;
  label: string;
  sub?: string;
  icon?: IconName;
  /** Colour of the icon: a value type or a step group. */
  tone?: string;
  group?: string;
  hint?: string;
  disabled?: boolean;
}

export const TYPE_ICON: Record<ValueType, IconName> = {
  number: 'number',
  text: 'text',
  date: 'date',
  boolean: 'boolean',
  unknown: 'unknown',
};
export const TYPE_WORD: Record<ValueType, string> = {
  number: 'number',
  text: 'text',
  date: 'date',
  boolean: 'yes / no',
  unknown: 'value',
};

export const GROUP_TONE: Record<StepGroup, string> = {
  'Get data': 'get',
  'Narrow rows': 'narrow',
  'Add columns': 'add',
  Summarize: 'summarize',
  Combine: 'combine',
};

export function stepTone(stage: Rdl2Stage): string {
  const info = stepInfo(stage.kind);
  return info ? GROUP_TONE[info.group] : 'get';
}

export function columnItems(columns: readonly ColumnInfo[]): PickItem[] {
  return columns.map((col) => ({
    value: col.name,
    label: col.name,
    sub: col.origin === col.name ? '' : col.origin,
    icon: TYPE_ICON[col.type],
    tone: col.type,
    hint: `${TYPE_WORD[col.type]} · ${col.origin}`,
  }));
}

export function stepItems(stages: readonly Rdl2Stage[]): PickItem[] {
  return stages.map((stage, index) => {
    const info = stepInfo(stage.kind);
    return {
      value: stage.id,
      label: stage.id,
      sub: `${index + 1}. ${info?.label ?? stage.kind}`,
      icon: info?.icon ?? 'native',
      tone: stepTone(stage),
    };
  });
}

const PARAM_TYPE: Record<Rdl2Param['type'], ValueType> = {
  date: 'date',
  number: 'number',
  text: 'text',
  boolean: 'boolean',
  select: 'text',
  lookup: 'number',
};

export function paramType(param: Rdl2Param): ValueType {
  return PARAM_TYPE[param.type];
}

/** Inputs a value of this type can come from; a lookup gives ids, so it suits number columns. */
export function paramItems(
  params: readonly Rdl2Param[],
  type: ValueType = 'unknown',
  list = false,
): PickItem[] {
  return params
    .filter((param) => param.id)
    .filter((param) => (list ? param.multi === true || param.type === 'select' : !param.multi))
    .map((param) => {
      const kind = paramType(param);
      const fits =
        type === 'unknown' ||
        kind === 'unknown' ||
        kind === type ||
        (type === 'text' && param.type === 'select');
      return {
        value: param.id,
        label: param.label || param.id,
        sub: `@${param.id}`,
        icon: TYPE_ICON[kind],
        tone: kind,
        group: fits ? 'Inputs' : 'Other inputs',
      };
    })
    .sort((a, b) => (a.group === b.group ? 0 : a.group === 'Inputs' ? -1 : 1));
}

export function modelItems(models: readonly CatalogModel[]): PickItem[] {
  return [...models]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((model) => ({
      value: model.name,
      label: model.label,
      sub: model.label === model.name ? '' : model.name,
      icon: 'source' as const,
      tone: 'get',
    }));
}

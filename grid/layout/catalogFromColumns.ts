import type { DeskColumn, DeskEditorKind } from '../types';
import type { DeskCatalogField, DeskCatalogRelation, DeskFieldCatalog, DeskFieldFormatters, DeskFieldType } from './types';

function fieldType(type: DeskEditorKind | undefined): DeskFieldType {
  if (type === 'number' || type === 'currency' || type === 'date') return type;
  return 'text';
}

/**
 * A catalog for a list that has columns and no hand-written catalog.
 * A column with `fields: []` is virtual: the formatter reads the row, and the key is not selected.
 * `always` is fetched even when no cell shows it. `id` is included.
 */
export function catalogFromColumns(
  columns: readonly DeskColumn[],
  always: readonly string[] = ['id'],
): { catalog: DeskFieldCatalog; formatters: DeskFieldFormatters } {
  const relations: DeskCatalogRelation[] = [];
  const fields: DeskCatalogField[] = [];
  const formatters: DeskFieldFormatters = {};
  const seenRelations = new Set<string>();
  const seenFields = new Set<string>();

  for (const column of columns) {
    if (column.fields && column.fields.length === 0) {
      if (seenFields.has(column.id)) continue;
      seenFields.add(column.id);
      const field: DeskCatalogField = {
        key: column.id,
        label: column.header,
        type: 'text',
        virtual: true,
        sortable: false,
        filterable: false,
      };
      if (column.format) {
        field.format = column.id;
        const format = column.format;
        formatters[column.id] = (value, row) => format(value, row);
      }
      fields.push(field);
      continue;
    }

    const relation = column.relation;
    if (relation && !seenRelations.has(relation.as)) {
      seenRelations.add(relation.as);
      relations.push({
        path: relation.as,
        label: column.header,
        meta: { model: relation.model, as: relation.as },
      });
    }

    const keys = relation ? [`${relation.as}.${relation.field}`] : column.fields?.length ? [...column.fields] : [column.id];
    keys.forEach((key, index) => {
      if (seenFields.has(key)) return;
      seenFields.add(key);
      const field: DeskCatalogField = { key, label: index === 0 ? column.header : key, type: index === 0 ? fieldType(column.type) : 'text' };
      if (column.sortable === false) field.sortable = false;
      // A currency amount knows where its row's currency lives; a number keeps its decimals.
      if (index === 0 && column.moneyFrom && field.type === 'currency') field.moneyFrom = { ...column.moneyFrom };
      if (index === 0 && column.decimals !== undefined && field.type === 'number') field.decimals = column.decimals;
      if (index === 0 && column.format) {
        field.format = column.id;
        const format = column.format;
        formatters[column.id] = (value, row) => format(value, row);
      }
      fields.push(field);
    });
    // The second line's field, so layouts can show it.
    const caption = column.captionField;
    if (caption && !seenFields.has(caption)) {
      seenFields.add(caption);
      fields.push({ key: caption, label: `${column.header} (second line)`, type: 'text', sortable: false });
    }
  }

  const needed = ['id', ...always.filter((key) => key !== 'id')];
  return { catalog: { relations, fields, always: needed }, formatters };
}

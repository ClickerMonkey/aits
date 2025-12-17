import { formatName, pluralize } from '../../shared';
import { createRenderer } from './render';

const renderer = createRenderer({
  borderColor: "border-neon-cyan/30",
  bgColor: "bg-neon-cyan/5",
  labelColor: "text-neon-cyan",
});

export const type_info = renderer<'type_info'>(
  (op) => `${op.cache?.typeName || formatName(op.input.name)}Info()`,
  (op) => op.output?.type
    ? `Found type: ${op.output.type.friendlyName}`
    : op.output?.type === null
    ? 'Type not found'
    : op.analysis,
);

export const type_list = renderer<'type_list'>(
  () => 'TypeList()',
  (op) => op.output?.types?.length
    ? `Found ${op.output.types.length} type${op.output.types.length !== 1 ? 's' : ''}`
    : op.output?.types
    ? 'No types found'
    : op.analysis,
);

export const type_create = renderer<'type_create'>(
  (op) => `${op.cache?.typeName || formatName(op.input.name)}Create()`,
  (op) => op.output?.created ? 'Created type successfully' : op.analysis,
);

export const type_update = renderer<'type_update'>(
  (op) => `${op.cache?.typeName || formatName(op.input.name)}Update(${op.input.update ? Object.keys(op.input.update).join(', ') : ''})`,
  (op) => op.output?.updated ? 'Updated type successfully' : op.analysis,
);

export const type_delete = renderer<'type_delete'>(
  (op) => `${op.cache?.typeName || formatName(op.input.name)}Delete()`,
  (op) => op.output?.deleted ? 'Deleted type successfully' : op.analysis,
);

export const type_import = renderer<'type_import'>(
  (op) => `TypeImport("${op.input.glob}")`,
  (op) => op.output?.discovered
    ? `Imported ${pluralize(op.output.discovered.length, 'type')}`
    : op.analysis,
);
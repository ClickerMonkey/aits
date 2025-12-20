import { abbreviate, pluralize } from '../../shared';
import { createRenderer } from './render';

const renderer = createRenderer({
  borderColor: "border-yellow-400/30",
  bgColor: "bg-yellow-400/5",
  labelColor: "text-yellow-400",
});

export const assistant_switch = renderer<'assistant_switch'>(
  (op) => `AssistantSwitch("${op.input.name}")`,
  (op) => op.output ? `Switched to assistant: ${op.input.name}` : null
);

export const assistant_update = renderer<'assistant_update'>(
  (op) => `AssistantUpdate("${op.input.name}")`,
  (op) => op.output ? `Updated assistant: ${op.input.name}` : null
);

export const assistant_add = renderer<'assistant_add'>(
  (op) => `AssistantAdd("${op.input.name}")`,
  (op) => op.output ? `Created assistant: ${op.input.name}` : null
);

export const memory_list = renderer<'memory_list'>(
  (op) => 'MemoryList()',
  (op) => {
    if (op.output) {
      return pluralize(op.output.memories.length, 'memory', 'memories');
    }
    return null;
  }
);

export const memory_update = renderer<'memory_update'>(
  (op) => `MemoryUpdate("${abbreviate(op.input.content, 30)}")`,
  (op) => op.output ? `Added: "${abbreviate(op.input.content, 50)}"` : null
);

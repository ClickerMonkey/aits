import { abbreviate, pluralize } from "../common";
import { renderOperation } from "../helpers/render";
import { operationOf } from "./types";

export const assistant_switch = operationOf<
  { name: string },
  { switched: boolean }
>({
  mode: 'update',
  signature: 'assistant_switch(name: string)',
  status: (input) => `Switching to assistant: ${input.name}`,
  analyze: async ({ input }, { config, chat }) => {
    const assistant = config.getData().assistants.find((a) => a.name === input.name);
    if (!assistant) {
      return {
        analysis: `This would fail - assistant "${input.name}" not found.`,
        doable: false,
      };
    }
    return {
      analysis: `This will switch the current chat to use the "${input.name}" assistant.`,
      doable: !!chat,
    };
  },
  do: async ({ input }, { config, chat }) => {
    const assistant = config.getData().assistants.find((a) => a.name === input.name);
    if (!assistant) {
      throw new Error(`Assistant not found: ${input.name}`);
    }

    if (!chat) {
      throw new Error('No active chat');
    }

    await config.updateChat(chat.id, { assistant: input.name });
    return { switched: true };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `AssistantSwitch("${op.input.name}")`,
    (op) => {
      if (op.output) {
        return `Switched to assistant: ${op.input.name}`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

export const assistant_update = operationOf<
  { name: string; prompt: string },
  { updated: boolean }
>({
  mode: 'update',
  signature: 'assistant_update(name: string, prompt: string)',
  status: (input) => `Updating assistant: ${input.name}`,
  analyze: async ({ input }, { config }) => {
    const assistant = config.getData().assistants.find((a) => a.name === input.name);
    if (!assistant) {
      return {
        analysis: `This would fail - assistant "${input.name}" not found.`,
        doable: false,
      };
    }

    return {
      analysis: `This will update assistant "${input.name}" prompt to: "${abbreviate(input.prompt, 50)}"`,
      doable: true,
    };
  },
  do: async ({ input }, { config }) => {
    const assistants = config.getData().assistants;
    const assistant = assistants.find((a) => a.name === input.name);

    if (!assistant) {
      throw new Error(`Assistant not found: ${input.name}`);
    }

    await config.save((data) => {
      const asst = data.assistants.find((a) => a.name === input.name);
      if (asst) {
        asst.prompt = input.prompt;
      }
    });

    return { updated: true };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `AssistantUpdate("${op.input.name}")`,
    (op) => {
      if (op.output) {
        return `Updated assistant: ${op.input.name}`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

export const assistant_add = operationOf<
  { name: string; prompt: string },
  { created: boolean }
>({
  mode: 'create',
  signature: 'assistant_add(name: string, prompt: string)',
  status: (input) => `Adding assistant: ${input.name}`,
  analyze: async ({ input }, { config }) => {
    const existing = config.getData().assistants.find((a) => a.name === input.name);
    if (existing) {
      return {
        analysis: `This would fail - assistant "${input.name}" already exists.`,
        doable: false,
      };
    }

    return {
      analysis: `This will create a new assistant "${input.name}" with prompt: "${abbreviate(input.prompt, 50)}"`,
      doable: true,
    };
  },
  do: async ({ input }, { config }) => {
    const existing = config.getData().assistants.find((a) => a.name === input.name);
    if (existing) {
      throw new Error(`Assistant already exists: ${input.name}`);
    }

    await config.addAssistant({
      name: input.name,
      prompt: input.prompt,
    });

    return { created: true };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `AssistantAdd("${op.input.name}")`,
    (op) => {
      if (op.output) {
        return `Created assistant: ${op.input.name}`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

export const memory_list = operationOf<
  {},
  { memories: { text: string; created: string }[] }
>({
  mode: 'local',
  signature: 'memory_list()',
  status: () => 'Listing user memories',
  analyze: async ({ input }, { config }) => {
    const memoryCount = config.getData().user.memory.length;
    return {
      analysis: `This will list ${memoryCount} user memories.`,
      doable: true,
    };
  },
  do: async ({ input }, { config }) => {
    const user = config.getData().user;
    return { memories: user.memory.map((m) => ({
      text: m.text,
      created: new Date(m.created).toLocaleString(),
    }))};
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    'MemoryList()',
    (op) => {
      if (op.output) {
        return pluralize(op.output.memories.length, 'memory', 'memories');
      }
      return null;
    },
    showInput, showOutput
  ),
});

export const memory_update = operationOf<
  { content: string },
  { added: boolean }
>({
  mode: 'update',
  signature: 'memory_update(content: string)',
  status: (input) => `Adding memory: ${abbreviate(input.content, 35)}`,
  analyze: async ({ input }, { config }) => {
    return {
      analysis: `This will add a new user memory: "${abbreviate(input.content, 50)}"`,
      doable: true,
    };
  },
  do: async ({ input }, { config }) => {
    await config.addMemory(input.content);
    return { added: true };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `MemoryUpdate("${abbreviate(op.input.content, 30)}")`,
    (op) => {
      if (op.output) {
        return `Added: "${abbreviate(op.input.content, 50)}"`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

import React from "react";
import { operationOf } from "./types";
import { renderOperation } from "./render-helpers";
import { abbreviate } from "../common";

export const assistant_switch = operationOf<
  { name: string },
  { assistant: string }
>({
  mode: 'update',
  status: (input) => `Switching to assistant: ${input.name}`,
  analyze: async (input, { config, chat }) => {
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
  do: async (input, { config, chat }) => {
    const assistant = config.getData().assistants.find((a) => a.name === input.name);
    if (!assistant) {
      throw new Error(`Assistant not found: ${input.name}`);
    }

    if (!chat) {
      throw new Error('No active chat');
    }

    await config.updateChat(chat.id, { assistant: input.name });
    return { assistant: input.name };
  },
  render: (op) => renderOperation(
    op,
    `AssistantSwitch("${op.input.name}")`,
    (op) => {
      if (op.output) {
        return `Switched to assistant: ${op.output.assistant}`;
      }
      return null;
    }
  ),
});

export const assistant_update = operationOf<
  { name: string; prompt: string },
  { name: string; updated: boolean }
>({
  mode: 'update',
  status: (input) => `Updating assistant: ${input.name}`,
  analyze: async (input, { config }) => {
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
  do: async (input, { config }) => {
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

    return { name: input.name, updated: true };
  },
  render: (op) => renderOperation(
    op,
    `AssistantUpdate("${op.input.name}")`,
    (op) => {
      if (op.output) {
        return `Updated assistant: ${op.output.name}`;
      }
      return null;
    }
  ),
});

export const assistant_add = operationOf<
  { name: string; prompt: string },
  { name: string; created: boolean }
>({
  mode: 'create',
  status: (input) => `Adding assistant: ${input.name}`,
  analyze: async (input, { config }) => {
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
  do: async (input, { config }) => {
    const existing = config.getData().assistants.find((a) => a.name === input.name);
    if (existing) {
      throw new Error(`Assistant already exists: ${input.name}`);
    }

    await config.addAssistant({
      name: input.name,
      prompt: input.prompt,
    });

    return { name: input.name, created: true };
  },
  render: (op) => renderOperation(
    op,
    `AssistantAdd("${op.input.name}")`,
    (op) => {
      if (op.output) {
        return `Created assistant: ${op.output.name}`;
      }
      return null;
    }
  ),
});

export const memory_list = operationOf<
  {},
  { memories: { text: string; created: string }[] }
>({
  mode: 'local',
  status: () => 'Listing user memories',
  analyze: async (input, { config }) => {
    const memoryCount = config.getData().user.memory.length;
    return {
      analysis: `This will list ${memoryCount} user memories.`,
      doable: true,
    };
  },
  do: async (input, { config }) => {
    const user = config.getData().user;
    return { memories: user.memory.map((m) => ({
      text: m.text,
      created: new Date(m.created).toLocaleString(),
    }))};
  },
  render: (op) => renderOperation(
    op,
    'MemoryList()',
    (op) => {
      if (op.output) {
        const count = op.output.memories.length;
        return `${count} memor${count !== 1 ? 'ies' : 'y'}`;
      }
      return null;
    }
  ),
});

export const memory_update = operationOf<
  { content: string },
  { content: string; added: boolean }
>({
  mode: 'update',
  status: (input) => `Adding memory: ${abbreviate(input.content, 35)}`,
  analyze: async (input, { config }) => {
    return {
      analysis: `This will add a new user memory: "${abbreviate(input.content, 50)}"`,
      doable: true,
    };
  },
  do: async (input, { config }) => {
    await config.addMemory(input.content);
    return { content: input.content, added: true };
  },
  render: (op) => renderOperation(
    op,
    `MemoryUpdate("${abbreviate(op.input.content, 30)}")`,
    (op) => {
      if (op.output) {
        return `Added: "${abbreviate(op.output.content, 50)}"`;
      }
      return null;
    }
  ),
});

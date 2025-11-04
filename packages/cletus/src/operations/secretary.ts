import { CletusCoreContext } from "../ai";
import { operationOf } from "./types";

export const assistant_switch = operationOf<
  { name: string },
  { assistant: string }
>({
  mode: 'update',
  analyze: async (input, { config, chat }) => {
    const assistant = config.getData().assistants.find((a) => a.name === input.name);
    if (!assistant) {
      return `This would fail - assistant "${input.name}" not found.`;
    }
    return `This will switch the current chat to use the "${input.name}" assistant.`;
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
});

export const assistant_update = operationOf<
  { name: string; prompt: string },
  { name: string; updated: boolean }
>({
  mode: 'update',
  analyze: async (input, { config }) => {
    const assistant = config.getData().assistants.find((a) => a.name === input.name);
    if (!assistant) {
      return `This would fail - assistant "${input.name}" not found.`;
    }

    const promptPreview = input.prompt.length > 50
      ? input.prompt.substring(0, 50) + '...'
      : input.prompt;

    return `This will update assistant "${input.name}" prompt to: "${promptPreview}"`;
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
});

export const assistant_add = operationOf<
  { name: string; prompt: string },
  { name: string; created: boolean }
>({
  mode: 'create',
  analyze: async (input, { config }) => {
    const existing = config.getData().assistants.find((a) => a.name === input.name);
    if (existing) {
      return `This would fail - assistant "${input.name}" already exists.`;
    }

    const promptPreview = input.prompt.length > 50
      ? input.prompt.substring(0, 50) + '...'
      : input.prompt;

    return `This will create a new assistant "${input.name}" with prompt: "${promptPreview}"`;
  },
  do: async (input, { config }) => {
    const existing = config.getData().assistants.find((a) => a.name === input.name);
    if (existing) {
      throw new Error(`Assistant already exists: ${input.name}`);
    }

    await config.addAssistant({
      name: input.name,
      prompt: input.prompt,
      created: Date.now(),
    });

    return { name: input.name, created: true };
  },
});

export const memory_list = operationOf<
  {},
  { memories: string[] }
>({
  mode: 'local',
  analyze: async (input, { config }) => {
    const memoryCount = config.getData().user.memory.length;
    return `This will list ${memoryCount} user memories.`;
  },
  do: async (input, { config }) => {
    const user = config.getData().user;
    return { memories: user.memory };
  },
});

export const memory_update = operationOf<
  { content: string },
  { content: string; added: boolean }
>({
  mode: 'create',
  analyze: async (input, { config }) => {
    const preview = input.content.length > 50
      ? input.content.substring(0, 50) + '...'
      : input.content;

    return `This will add a new user memory: "${preview}"`;
  },
  do: async (input, { config }) => {
    await config.addMemory(input.content);
    return { content: input.content, added: true };
  },
});

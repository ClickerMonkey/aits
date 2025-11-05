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
});

export const assistant_update = operationOf<
  { name: string; prompt: string },
  { name: string; updated: boolean }
>({
  mode: 'update',
  analyze: async (input, { config }) => {
    const assistant = config.getData().assistants.find((a) => a.name === input.name);
    if (!assistant) {
      return {
        analysis: `This would fail - assistant "${input.name}" not found.`,
        doable: false,
      };
    }

    const promptPreview = input.prompt.length > 50
      ? input.prompt.substring(0, 50) + '...'
      : input.prompt;

    return {
      analysis: `This will update assistant "${input.name}" prompt to: "${promptPreview}"`,
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
});

export const assistant_add = operationOf<
  { name: string; prompt: string },
  { name: string; created: boolean }
>({
  mode: 'create',
  analyze: async (input, { config }) => {
    const existing = config.getData().assistants.find((a) => a.name === input.name);
    if (existing) {
      return {
        analysis: `This would fail - assistant "${input.name}" already exists.`,
        doable: false,
      };
    }

    const promptPreview = input.prompt.length > 50
      ? input.prompt.substring(0, 50) + '...'
      : input.prompt;

    return {
      analysis: `This will create a new assistant "${input.name}" with prompt: "${promptPreview}"`,
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
});

export const memory_list = operationOf<
  {},
  { memories: { text: string; created: string }[] }
>({
  mode: 'local',
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

    return {
      analysis: `This will add a new user memory: "${preview}"`,
      doable: true,
    };
  },
  do: async (input, { config }) => {
    await config.addMemory(input.content);
    return { content: input.content, added: true };
  },
});

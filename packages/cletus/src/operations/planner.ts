import { CletusCoreContext } from "../ai";
import { operationOf } from "./types";


export const todos_clear = operationOf<{}, string>({
  mode: 'update',
  analyze: async (input, { chat, config }: CletusCoreContext) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    const todoCount = chatObject?.todos.length || 0;
    const doneCount = chatObject?.todos.filter((t) => t.done).length || 0;
    const undoneCount = todoCount - doneCount;
    
    return `This will clear ${todoCount} todos (${doneCount} done, ${undoneCount} not done).`;
  },
  do: async (input, { chat, config }: CletusCoreContext) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    if (chatObject) {
      await config.updateChat(chatObject.id, { todos: [] });
    }
    
    return 'All todos cleared.';
  },
});
import { renderOperation } from "../helpers/render";
import type { Question } from "../schemas";
import { operationOf } from "./types";

export const ask = operationOf<
  { questions: Question[] },
  { asked: boolean }
>({
  mode: 'local',
  signature: 'ask(questions: Question[])',
  status: (input) => `Asking ${input.questions.length} question${input.questions.length !== 1 ? 's' : ''}`,
  analyze: async ({ input }, { chat }) => {
    const count = input.questions.length;
    return {
      analysis: `This will ask the user ${count} question${count !== 1 ? 's' : ''} with a special UI. The questions will be added to the chat meta and the user will need to answer them before continuing.`,
      doable: !!chat && count > 0,
    };
  },
  do: async ({ input }, { config, chat }) => {
    if (!chat) {
      throw new Error('No active chat');
    }

    // Update the chat meta with the questions
    await config.updateChat(chat.id, { questions: input.questions });
    
    return { asked: true };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `Ask(${op.input.questions.length} question${op.input.questions.length !== 1 ? 's' : ''})`,
    (op) => {
      if (op.output) {
        return `Asked ${op.input.questions.length} question${op.input.questions.length !== 1 ? 's' : ''}`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

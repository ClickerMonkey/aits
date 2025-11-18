import { getStoredOperationOutput } from "../common";
import { renderOperation } from "../helpers/render";
import { operationOf } from "./types";

export const get_operation_output = operationOf<
  { key: string },
  { content: string }
>({
  mode: 'local',
  signature: 'getOperationOutput(key: string)',
  status: (input) => `Retrieving operation output: ${input.key}`,
  analyze: async (input) => {
    const content = getStoredOperationOutput(input.key);
    if (!content) {
      return {
        analysis: `This would fail - no stored operation output found for key "${input.key}".`,
        doable: false,
      };
    }
    return {
      analysis: `This will retrieve the full output for operation key "${input.key}".`,
      doable: true,
    };
  },
  do: async (input) => {
    const content = getStoredOperationOutput(input.key);
    if (!content) {
      throw new Error(`No stored operation output found for key: ${input.key}`);
    }

    return { content };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `GetOperationOutput("${op.input.key}")`,
    (op) => {
      if (op.output) {
        return `Retrieved full operation output (${op.output.content.length} characters)`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

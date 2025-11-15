/**
 * An Agent component that orchestrates complex workflows by composing other AI components.
 * Agents can utilize tools, prompts, and other agents to accomplish sophisticated tasks.
 *
 * @template TContext - The context type needed for the agent's operation.
 * @template TMetadata - The metadata type needed during execution/streaming.
 * @template TName - The name of the agent, typed for inference in parent components.
 * @template TInput - The input parameters type for the agent.
 * @template TOutput - The output type for the agent.
 * @template TRefs - References to other components that this agent depends on.
 *
 * @example
 * const researchAgent = new Agent({
 *   name: 'researcher',
 *   description: 'Conducts research using multiple tools',
 *   refs: [searchTool, summarizeTool, analyzePrompt],
 *   call: async (input, [search, summarize, analyze], ctx) => {
 *     const results = await search.run({ query: input.topic }, ctx);
 *     const summary = await summarize.get({ text: results });
 *     return analyze.get({ summary, topic: input.topic });
 *   }
 * });
 */
export class Agent {
    input;
    /**
     * Creates a new Agent instance.
     *
     * @param input - The agent input configuration.
     */
    constructor(input) {
        this.input = input;
    }
    get kind() {
        return 'agent';
    }
    get name() {
        return this.input.name;
    }
    get description() {
        return this.input.description;
    }
    get refs() {
        return this.input.refs;
    }
    /**
     * Executes the agent with the provided context and input.
     * If a custom runner is provided in the context, it will be used instead of direct execution.
     *
     * @param input - The input parameters for the agent.
     * @param ctx - The execution context.
     * @returns The output of the agent's operation.
     */
    run(...[inputMaybe, contextMaybe]) {
        const input = (inputMaybe || {});
        const ctx = (contextMaybe || {});
        const agent = this;
        return ctx.runner
            ? ctx.runner(agent, input, ctx, (innerCtx) => this.input.call(input, this.input.refs, innerCtx))
            : this.input.call(input, this.input.refs, ctx);
    }
    /**
     * Determines whether the agent is applicable in the given context.
     * By default, checks if any of its referenced components are applicable.
     *
     * @param ctx - The context to check applicability against.
     * @returns A promise that resolves to true if the agent is applicable, false otherwise.
     */
    async applicable(...[contextMaybe]) {
        const ctx = (contextMaybe || {});
        if (this.input.applicable) {
            return this.input.applicable(ctx);
        }
        // If there are no refs, the agent is self-contained and applicable
        if (this.refs.length === 0) {
            return true;
        }
        return await Promise.all(this.refs.map(ref => ref.applicable(ctx))).then(results => results.some(r => r));
    }
}
//# sourceMappingURL=agent.js.map
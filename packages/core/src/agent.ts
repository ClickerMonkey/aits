import { Component, ComponentCompatible, Context, OptionalParams, Tuple } from "./types";

/**
 * Configuration for creating an Agent component.
 * Agents orchestrate complex workflows by composing other components (tools, prompts, and agents).
 *
 * @template TContext - The context type needed for the agent's operation.
 * @template TMetadata - The metadata type needed during execution/streaming.
 * @template TName - The name of the agent, typed for inference in parent components.
 * @template TInput - The input parameters type for the agent.
 * @template TOutput - The output type for the agent.
 * @template TRefs - References to other components that this agent depends on.
 */
export interface AgentInput<
  TContext = {},
  TMetadata = {},
  TName extends string = string,
  TInput extends object = {},
  TOutput = string,
  TRefs extends Tuple<ComponentCompatible<TContext, TMetadata>> = [],
> {
  /** The unique name of the agent */
  name: TName;
  /** Brief description of the agent's purpose (informational only) */
  description: string;
  /** References to other components (tools, prompts, agents) that this agent utilizes */
  refs: TRefs;
  /** The function that implements the agent's behavior */
  call: (input: TInput, refs: TRefs, ctx: Context<TContext, TMetadata>) => TOutput;
  /** Optional function to determine if the component is applicable in the given context */
  applicable?: (ctx: Context<TContext, TMetadata>) => boolean | Promise<boolean>;
  /** Optional way to explicitly declare the types used in this component */
  types?: {
    input?: TInput;
    output?: TOutput;
    context?: TContext;
    metadata?: TMetadata;
  },
}

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
export class Agent<
  TContext = {},
  TMetadata = {},
  TName extends string = string,
  TInput extends object = {},
  TOutput = string,
  TRefs extends Tuple<ComponentCompatible<TContext, TMetadata>> = [],
> implements Component<TContext, TMetadata, TName, TInput, TOutput, TRefs> {

  /**
   * Creates a new Agent instance.
   *
   * @param input - The agent input configuration.
   */
  constructor(
    public input: AgentInput<TContext, TMetadata, TName, TInput, TOutput, TRefs>,
  ) { }

  get kind(): 'agent' {
    return 'agent';
  }

  get name(): TName {
    return this.input.name;
  }

  get description(): string {
    return this.input.description;
  }

  get refs(): TRefs {
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
  run(...[inputMaybe, contextMaybe]: OptionalParams<[TInput, Context<TContext, TMetadata>]>): TOutput {
    const input = (inputMaybe || {}) as TInput;
    const ctx = (contextMaybe || {}) as Context<TContext, TMetadata>;
    const agent = this as Component<TContext, TMetadata, TName, TInput, TOutput, TRefs>;

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
  async applicable(...[contextMaybe]: OptionalParams<[Context<TContext, TMetadata>]>): Promise<boolean> {
    const ctx = (contextMaybe || {}) as Context<TContext, TMetadata>;

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
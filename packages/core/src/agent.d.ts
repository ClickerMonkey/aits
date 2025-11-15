import { AnyComponent, Component, ComponentCompatible, Context, OptionalParams, Tuple } from "./types";
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
export interface AgentInput<TContext = {}, TMetadata = {}, TName extends string = string, TInput extends object = {}, TOutput = string, TRefs extends Tuple<AnyComponent> = []> {
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
    };
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
export declare class Agent<TContext = {}, TMetadata = {}, TName extends string = string, TInput extends object = {}, TOutput = string, TRefs extends Tuple<ComponentCompatible<TContext, TMetadata>> = []> implements Component<TContext, TMetadata, TName, TInput, TOutput, TRefs> {
    input: AgentInput<TContext, TMetadata, TName, TInput, TOutput, TRefs>;
    /**
     * Creates a new Agent instance.
     *
     * @param input - The agent input configuration.
     */
    constructor(input: AgentInput<TContext, TMetadata, TName, TInput, TOutput, TRefs>);
    get kind(): 'agent';
    get name(): TName;
    get description(): string;
    get refs(): TRefs;
    /**
     * Executes the agent with the provided context and input.
     * If a custom runner is provided in the context, it will be used instead of direct execution.
     *
     * @param input - The input parameters for the agent.
     * @param ctx - The execution context.
     * @returns The output of the agent's operation.
     */
    run<TRuntimeContext extends TContext, TRuntimeMetadata extends TMetadata, TCoreContext extends Context<TRuntimeContext, TRuntimeMetadata>>(...[inputMaybe, contextMaybe]: OptionalParams<[TInput, TCoreContext]>): TOutput;
    /**
     * Determines whether the agent is applicable in the given context.
     * By default, checks if any of its referenced components are applicable.
     *
     * @param ctx - The context to check applicability against.
     * @returns A promise that resolves to true if the agent is applicable, false otherwise.
     */
    applicable<TRuntimeContext extends TContext, TRuntimeMetadata extends TMetadata, TCoreContext extends Context<TRuntimeContext, TRuntimeMetadata>>(...[contextMaybe]: OptionalParams<[TCoreContext]>): Promise<boolean>;
}
//# sourceMappingURL=agent.d.ts.map
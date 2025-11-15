import Handlebars from 'handlebars';
import { resolveFn } from './common';
/**
 * A Tool component that performs specific functions, often interacting with external systems or APIs.
 * Tools can be called by AI models to extend their capabilities beyond text generation.
 *
 * @template TContext - The context type needed for the tool's operation.
 * @template TMetadata - The metadata type needed during execution/streaming.
 * @template TName - The name of the tool, typed for inference in parent components.
 * @template TParams - The input parameters type for the tool.
 * @template TOutput - The output type for the tool.
 * @template TRefs - References to other components that this tool depends on.
 *
 * @example
 * const weatherTool = new Tool({
 *   name: 'getWeather',
 *   description: 'Get current weather for a location',
 *   instructions: 'Use this tool to get weather information for {{location}}',
 *   schema: z.object({ location: z.string() }),
 *   call: async (input) => {
 *     const response = await fetch(`/api/weather?loc=${input.location}`);
 *     return response.json();
 *   }
 * });
 */
export class Tool {
    input;
    instructions;
    schema;
    translate;
    descriptionFn;
    instructionsFn;
    /**
     * Compiles the instructions template with or without input variables.
     *
     * @param instructions - The instructions template string.
     * @param hasInput - Whether the tool has input variables.
     * @returns A compiled Handlebars template function or a simple string returner.
     */
    static compileInstructions(instructions, hasInput) {
        return hasInput ? Handlebars.compile(instructions) : () => instructions;
    }
    /**
     * Creates a new Tool instance.
     *
     * @param input - The tool input configuration.
     */
    constructor(input, instructions = input.instructions ? Tool.compileInstructions(input.instructions, !!input.input) : undefined, schema = resolveFn(input.schema), translate = resolveFn(input.input), descriptionFn = resolveFn(input.descriptionFn), instructionsFn = resolveFn(input.instructionsFn, (r) => r ? Tool.compileInstructions(r, !!input.input) : undefined)) {
        this.input = input;
        this.instructions = instructions;
        this.schema = schema;
        this.translate = translate;
        this.descriptionFn = descriptionFn;
        this.instructionsFn = instructionsFn;
    }
    get kind() {
        return 'tool';
    }
    get name() {
        return this.input.name;
    }
    get description() {
        return this.input.description;
    }
    get refs() {
        return this.input.refs || [];
    }
    /**
     * Parses and validates the input arguments using the tool's Zod schema.
     * Also runs any custom validation defined in the tool configuration.
     *
     * @param ctx - The context for parsing.
     * @param args - The input arguments as a JSON string.
     * @param schema - Optional pre-compiled schema to use instead of resolving it again.
     * @returns The parsed and validated input parameters.
     * @throws Error if schema is not available or parsing/validation fails.
     */
    async parse(ctx, args, schema) {
        const resolvedSchema = schema || await this.schema(ctx);
        if (!resolvedSchema) {
            throw new Error(`Not able to build a schema to parse arguments for ${this.input.name}`);
        }
        const parsed = resolvedSchema.parse(JSON.parse(args));
        // Run post-validation hook if provided
        if (this.input.validate) {
            await this.input.validate(parsed, ctx);
        }
        return parsed;
    }
    /**
     * Compiles the tool's instructions and schema into a ToolDefinition.
     * This creates the format needed to pass tool information to AI models.
     *
     * @param ctx - The context for compilation.
     * @returns A tuple of [instructions, toolDefinition] or undefined if not applicable.
     */
    async compile(ctx) {
        const schema = await this.schema(ctx);
        if (!schema) {
            return undefined;
        }
        // Get instructions template
        const instructionsTemplate = this.input.instructionsFn
            ? await this.instructionsFn(ctx)
            : this.instructions;
        // If no instructions function/template, return undefined
        if (!instructionsTemplate) {
            return undefined;
        }
        // Get template variables if input function is provided
        const templateVars = await this.translate(ctx) || {};
        const instructions = instructionsTemplate(templateVars);
        // Get dynamic description if function is provided
        const description = await this.descriptionFn(ctx) || this.input.description;
        return [
            instructions,
            {
                name: this.input.name,
                description,
                parameters: schema,
            },
        ];
    }
    /**
     * Executes the tool with the given context and input.
     * If a custom runner is provided in the context, it will be used instead of direct execution.
     *
     * @param input - The input parameters for the tool.
     * @param ctx - The execution context.
     * @returns The output of the tool's execution.
     */
    run(...[inputMaybe, contextMaybe]) {
        const input = (inputMaybe || {});
        const ctx = (contextMaybe || {});
        const tool = this;
        return ctx.runner
            ? ctx.runner(tool, input, ctx, (innerCtx) => this.input.call(input, this.refs, innerCtx))
            : this.input.call(input, this.refs, ctx);
    }
    /**
     * Determines whether the tool is applicable in the given context.
     * By default, checks if the schema is available and if any referenced components are applicable.
     *
     * @param ctx - The context to check applicability against.
     * @returns A promise that resolves to true if the tool is applicable, false otherwise.
     */
    async applicable(...[contextMaybe]) {
        const ctx = (contextMaybe || {});
        if (this.input.applicable) {
            return this.input.applicable(ctx);
        }
        if (await this.schema(ctx) === undefined) {
            return false;
        }
        // If there are no refs, the tool is self-contained and applicable
        if (this.refs.length === 0) {
            return true;
        }
        return await Promise.all(this.refs.map(ref => ref.applicable(ctx))).then(results => results.some(r => r));
    }
}
//# sourceMappingURL=tool.js.map
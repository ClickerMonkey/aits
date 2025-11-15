/**
* Type guard to check if a ModelInput is a ModelInfo object.
*
* @param input - The model input to check.
* @returns True if the input is a ModelInfo object, false otherwise.
*/
export function isModelInfo(input) {
    return typeof input === 'object'
        && ('id' in input)
        && ('provider' in input)
        && ('name' in input)
        && ('capabilities' in input)
        && ('tier' in input)
        && ('pricing' in input)
        && ('contextWindow' in input);
}
//# sourceMappingURL=common.js.map
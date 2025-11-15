import { ModelInput } from "@aits/core";
import { ModelInfo } from "./types";
/**
* Type guard to check if a ModelInput is a ModelInfo object.
*
* @param input - The model input to check.
* @returns True if the input is a ModelInfo object, false otherwise.
*/
export declare function isModelInfo<TProvider extends string = string>(input: ModelInput): input is ModelInfo<TProvider>;
//# sourceMappingURL=common.d.ts.map
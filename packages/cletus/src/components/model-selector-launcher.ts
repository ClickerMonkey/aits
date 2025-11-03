import fs from 'fs';
import { render } from 'ink';
import React from 'react';
import { ModelSelector } from './ModelSelector.js';
import type { CletusAI } from '../ai.js';
import type { AIBaseMetadata, ModelInfo } from '@aits/ai';
import { ReadStream } from 'tty';

/**
 * Launch the model selector UI and return the selected model
 */
export async function launchModelSelector(
  ai: CletusAI,
  baseMetadata?: Partial<AIBaseMetadata<any>>,
  currentModelId?: string,
): Promise<ModelInfo | null> {
  let inkInstance: ReturnType<typeof render> | null = null;
  let modelSelected: ModelInfo | null = null;

  inkInstance = render(
    React.createElement(ModelSelector, {
      ai,
      baseMetadata,
      onSelect: (model) => {
        modelSelected = model;
      },
      onCancel: () => {
        modelSelected = null;
      },
    }), {
      exitOnCtrlC: false,
    }
  );

  await inkInstance.waitUntilExit();

  return modelSelected;
}

import { render } from 'ink';
import React from 'react';
import { ModelSelector } from './ModelSelector.js';
import type { CletusAI } from '../ai.js';
import type { AIBaseMetadata, ModelInfo } from '@aits/ai';

/**
 * Launch the model selector UI and return the selected model
 */
export async function launchModelSelector(
  ai: CletusAI,
  baseMetadata?: Partial<AIBaseMetadata<any>>
): Promise<ModelInfo | null> {
  return new Promise((resolve) => {
    let hasResolved = false;

    const { waitUntilExit, unmount } = render(
      React.createElement(ModelSelector, {
        ai,
        baseMetadata,
        onSelect: (model) => {
          if (!hasResolved) {
            hasResolved = true;
            unmount();
            resolve(model);
          }
        },
        onCancel: () => {
          if (!hasResolved) {
            hasResolved = true;
            unmount();
            resolve(null);
          }
        },
      })
    );

    waitUntilExit().then(() => {
      if (!hasResolved) {
        hasResolved = true;
        resolve(null);
      }
    });
  });
}

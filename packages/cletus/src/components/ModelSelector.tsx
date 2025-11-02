import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import React, { useState, useEffect } from 'react';
import type { CletusAI } from '../ai.js';
import type { AIBaseMetadata, ModelInfo, ScoredModel } from '@aits/ai';
import { format } from 'path';

interface ModelSelectorProps {
  ai: CletusAI;
  baseMetadata?: Partial<AIBaseMetadata<any>>;
  onSelect: (model: ModelInfo | null) => void;
  onCancel: () => void;
}

type WeightKey = 'cost' | 'speed' | 'accuracy' | 'contextWindow';

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  ai,
  baseMetadata = {},
  onSelect,
  onCancel,
}) => {
  const [mode, setMode] = useState<'weights' | 'models'>('models');
  const [weights, setWeights] = useState({
    cost: baseMetadata.weights?.cost ?? 0.4,
    speed: baseMetadata.weights?.speed ?? 0.3,
    accuracy: baseMetadata.weights?.accuracy ?? 0.2,
    contextWindow: baseMetadata.weights?.contextWindow ?? 0.1,
  });
  const [editingWeight, setEditingWeight] = useState<WeightKey | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [selectedWeightIndex, setSelectedWeightIndex] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [scoredModels, setScoredModels] = useState<ScoredModel[]>([]);

  const weightKeys: WeightKey[] = ['cost', 'speed', 'accuracy', 'contextWindow'];

  // Search models when entering model selection mode
  useEffect(() => {
    if (mode === 'models') {
      const metadata: AIBaseMetadata<any> = {
        ...baseMetadata,
        weights,
      };

      try {
        const models = ai.registry.searchModels(metadata);
        setScoredModels(models);
      } catch (error) {
        console.error('[ModelSelector] Failed to search models:', error);
        setScoredModels([]);
      }
    }
  }, [mode, weights]);

  // Filter models based on filter text
  const filteredModels = scoredModels.filter((scored) => {
    if (!filterText) return true;
    const model = scored.model;
    const searchText = filterText.toLowerCase();
    return (
      model.id.toLowerCase().includes(searchText) ||
      model.name.toLowerCase().includes(searchText) ||
      model.provider.toLowerCase().includes(searchText)
    );
  });

  // Handle keyboard input
  useInput((input, key) => {
    if (key.escape) {
      if (editingWeight) {
        setEditingWeight(null);
        setWeightInput('');
      } else if (mode === 'models' && filterText) {
        setFilterText('');
      } else if (mode === 'models') {
        // ESC in models mode with no filter - go back to weights
        setMode('weights');
      } else {
        // ESC in weights mode - cancel
        onCancel();
      }
      return;
    }

    if (editingWeight) {
      // Editing a weight value
      return; // Let TextInput handle it
    }

    if (mode === 'weights') {
      if (key.upArrow) {
        setSelectedWeightIndex((prev) => (prev > 0 ? prev - 1 : weightKeys.length - 1));
      } else if (key.downArrow) {
        setSelectedWeightIndex((prev) => (prev < weightKeys.length - 1 ? prev + 1 : 0));
      } else if (key.return && !editingWeight) {
        // Enter without editing a weight - go to model selection
        setMode('models');
      } else if (input === 'e' || input === 'E') {
        // Press 'e' to edit weights
        const key = weightKeys[selectedWeightIndex];
        setEditingWeight(key);
        setWeightInput(weights[key].toString());
      }
    } else if (mode === 'models') {
      if (input === 'w' || input === 'W') {
        // Switch back to weight editing
        setMode('weights');
        setFilterText('');
      } else if (key.upArrow && !filterText) {
        setSelectedModelIndex((prev) => (prev > 0 ? prev - 1 : filteredModels.length - 1));
      } else if (key.downArrow && !filterText) {
        setSelectedModelIndex((prev) => (prev < filteredModels.length - 1 ? prev + 1 : 0));
      } else if (key.return && !filterText) {
        // Select the model
        if (filteredModels.length > 0) {
          onSelect(filteredModels[selectedModelIndex].model);
        }
      } else if (key.backspace) {
        // Allow backspace in filter mode
        if (filterText.length > 0) {
          setFilterText(filterText.slice(0, -1));
          setSelectedModelIndex(0);
        }
      } else if (input && input.length === 1 && !key.ctrl && !key.meta && !key.return && input !== 'w' && input !== 'W') {
        // Start filtering
        setFilterText(filterText + input);
        setSelectedModelIndex(0);
      }
    }
  });

  const handleWeightSubmit = () => {
    if (editingWeight && weightInput) {
      const value = parseFloat(weightInput);
      if (!isNaN(value) && value >= 0 && value <= 1) {
        setWeights({ ...weights, [editingWeight]: value });
      }
      setEditingWeight(null);
      setWeightInput('');
    }
  };

  const formatCost = (model: ModelInfo): string => {
    let costs: string[] = [];
    if (model.pricing.text) {
      const { input , output  } = model.pricing.text;
      if (input !== undefined && output !== undefined) {
        costs.push(`$${input.toFixed(2)}/$${output.toFixed(2)}/M`);
      } else if (input !== undefined) {
        costs.push(`$${input.toFixed(2)}/M input`);
      } else if (output !== undefined) {
        costs.push(`$${output.toFixed(2)}/M output`);
      }
    }
    if (model.pricing.audio) {
      const { input , output, perSecond } = model.pricing.audio;
      if (perSecond !== undefined) {
        costs.push(`$${perSecond.toFixed(2)}/s 🎵`);
      }
      if (output !== undefined && input !== undefined) {
        costs.push(`$${input.toFixed(1)}/${output.toFixed(2)}/M 🎵`);
      } else if (output !== undefined) {
        costs.push(`$${output.toFixed(2)}/M 🎵`);
      } else if (input !== undefined) {
        costs.push(`$${input.toFixed(2)}/M 👂`);
      }
    }
    if (model.pricing.image) {
      const { input , output  } = model.pricing.image;
      if (input !== undefined) {
        costs.push(`$${input.toFixed(2)}/M 👁 in`);
      } else if (output !== undefined) {
        for (const out of output) {
          const { quality, sizes } = out;
          costs.push(`${quality}:`);
          for (const size of sizes) {
            costs.push(`${size.width}x${size.height}=$${size.cost.toFixed(2)}/M`);
          }
        }
      }
    }
    if (model.pricing.embeddings) {
      const { cost  } = model.pricing.embeddings;
      if (cost !== undefined) {
        costs.push(`$${cost.toFixed(2)}/M embed`);
      }
    }
    if (model.pricing.perRequest) {
      costs.push(`$${model.pricing.perRequest.toFixed(4)}/req`);
    }
    if (model.pricing.reasoning) {
      const { input, output, cached } = model.pricing.reasoning;
      if (input !== undefined && output !== undefined) {
        costs.push(`$${input.toFixed(2)}/$${output.toFixed(2)}/M 🧠`);
      } else if (output !== undefined) {
        costs.push(`$${output.toFixed(2)}/M 🧠 out`);
      } else if (input !== undefined) {
        costs.push(`$${input.toFixed(2)}/M 🧠 in`);
      }
      if (cached !== undefined) {
        costs.push(`$${cached.toFixed(2)}/M cached 🧠`);
      }
    }
    
    return costs.join(', ');
  };

  const formatMetrics = (model: ModelInfo): string => {
    const parts: string[] = [];
    if (model.metrics?.tokensPerSecond) {
      parts.push(`${model.metrics.tokensPerSecond.toFixed(0)} tok/s`);
    }
    if (model.metrics?.timeToFirstToken) {
      parts.push(`${model.metrics.timeToFirstToken.toFixed(0)}ms TTFT`);
    }
    return parts.join(', ');
  };

  if (mode === 'weights') {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);

    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
          <Text bold color="cyan">
            Model Selection - Configure Weights
          </Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Adjust weights for model scoring (should sum to ~1.0):</Text>
          <Text dimColor>↑↓ to navigate, E to edit weight, Enter to continue to models</Text>
        </Box>

        {weightKeys.map((key, index) => (
          <Box key={key} marginBottom={1}>
            <Text color={index === selectedWeightIndex ? 'cyan' : 'white'}>
              {index === selectedWeightIndex ? '▶ ' : '  '}
              {key.charAt(0).toUpperCase() + key.slice(1)}:{' '}
            </Text> 
            {editingWeight === key ? (
              <TextInput
                value={weightInput}
                onChange={setWeightInput}
                onSubmit={handleWeightSubmit}
                placeholder="0.0-1.0"
              />
            ) : (
              <Text color={index === selectedWeightIndex ? 'cyan' : 'white'}>
                {weights[key].toFixed(2)}
              </Text>
            )}
          </Box>
        ))}

        <Box marginTop={1}>
          <Text color={total > 0.9 && total < 1.1 ? 'green' : 'yellow'}>
            Total: {total.toFixed(2)} {total > 0.9 && total < 1.1 ? '✓' : '⚠️'}
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>ESC to cancel</Text>
        </Box>
      </Box>
    );
  }

  // Model selection mode
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          Model Selection - Choose Model
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>
          {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} found
        </Text>
        {filterText && (
          <Text dimColor>Filter: {filterText} (Backspace to edit, ESC to clear)</Text>
        )}
        {!filterText && <Text dimColor>Type to filter, ↑↓ to navigate, Enter to select</Text>}
      </Box>

      <Box flexDirection="column">
        {filteredModels.slice(0, 15).map((scored, index) => {
          const model = scored.model;
          const isSelected = index === selectedModelIndex && !filterText;
          const cost = formatCost(model);
          const metrics = formatMetrics(model);
          const score = (scored.score * 100).toFixed(0) + '%';
          const context = model.contextWindow ? `${(model.contextWindow / 1000).toFixed(0)}k ctx` : '';
          const maxOutput = model.maxOutputTokens ? `${(model.maxOutputTokens / 1000).toFixed(0)}k out` : '';
          const capabilities = Array.from(model.capabilities).join(' ');

          return (
            <Box
              key={model.id}
              flexDirection="column"
              borderStyle="round"
              borderColor={isSelected ? 'cyan' : 'gray'}
              paddingX={1}
            >
              <Box>
                <Text bold color={isSelected ? 'cyan' : 'white'}>
                  {isSelected ? '▶ ' : '  '}
                  {model.name}
                </Text>
                <Text dimColor> {score}  {model.provider}  {cost}</Text>
              </Box>
              <Box paddingLeft={3}>
                <Text dimColor>
                  {context}  {maxOutput}  {metrics}  {model.tier}  {capabilities}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {filteredModels.length === 0 && (
        <Box justifyContent="center" marginTop={2}>
          <Text color="yellow">No models match the current criteria</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>ESC to go back to weights | W to edit weights | Type to filter</Text>
      </Box>
    </Box>
  );
};

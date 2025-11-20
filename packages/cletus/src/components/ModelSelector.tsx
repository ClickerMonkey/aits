import type { AIBaseMetadata, ModelInfo, ScoredModel } from '@aeye/ai';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import React, { useEffect, useState } from 'react';
import type { CletusAI } from '../ai';
import { getAltKeyLabel } from '../common';

interface ModelSelectorProps {
  ai: CletusAI;
  baseMetadata?: Partial<AIBaseMetadata<any>>;
  current?: string;
  onSelect: (model: ModelInfo | null) => void;
  onCancel: () => void;
}

type WeightKey = 'cost' | 'speed' | 'accuracy' | 'contextWindow';
type SortMode = 'score' | 'cost-asc' | 'cost-desc' | 'speed-desc' | 'speed-asc' | 'context-desc' | 'context-asc' | 'capable-desc' | 'capable-asc';

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  ai,
  baseMetadata = {},
  current,
  onSelect,
  onCancel,
}) => {
  const altKeyLabel = getAltKeyLabel();
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
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showCostMetrics, setShowCostMetrics] = useState(false);
  const [showTierCapabilities, setShowTierCapabilities] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('score');

  const weightKeys: WeightKey[] = ['cost', 'speed', 'accuracy', 'contextWindow'];
  const sortModes: SortMode[] = ['score', 'cost-asc', 'cost-desc', 'speed-desc', 'speed-asc', 'context-desc', 'context-asc', 'capable-desc', 'capable-asc'];

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

  // Helper functions for sorting
  const getModelCost = (model: ModelInfo): number | null => {
    let totalCost = 0;
    let costCount = 0;

    // Text pricing
    if (model.pricing.text) {
      const { input, output } = model.pricing.text;
      if (input !== undefined) {
        totalCost += input;
        costCount++;
      }
      if (output !== undefined) {
        totalCost += output;
        costCount++;
      }
    }

    // Audio pricing
    if (model.pricing.audio) {
      const { input, output, perSecond } = model.pricing.audio;
      if (perSecond !== undefined) {
        totalCost += perSecond * 1000; // Convert per-second to comparable scale
        costCount++;
      }
      if (input !== undefined) {
        totalCost += input;
        costCount++;
      }
      if (output !== undefined) {
        totalCost += output;
        costCount++;
      }
    }

    // Image pricing
    if (model.pricing.image) {
      const { input, output } = model.pricing.image;
      if (input !== undefined) {
        totalCost += input;
        costCount++;
      }
      if (output !== undefined) {
        // Average cost across all output sizes
        let imageOutputCost = 0;
        let imageOutputCount = 0;
        for (const out of output) {
          for (const size of out.sizes) {
            imageOutputCost += size.cost;
            imageOutputCount++;
          }
        }
        if (imageOutputCount > 0) {
          totalCost += imageOutputCost / imageOutputCount;
          costCount++;
        }
      }
    }

    // Embeddings pricing
    if (model.pricing.embeddings?.cost !== undefined) {
      totalCost += model.pricing.embeddings.cost;
      costCount++;
    }

    // Per-request pricing
    if (model.pricing.perRequest !== undefined) {
      totalCost += model.pricing.perRequest * 1000; // Scale up to be comparable
      costCount++;
    }

    // Reasoning pricing
    if (model.pricing.reasoning) {
      const { input, output, cached } = model.pricing.reasoning;
      if (input !== undefined) {
        totalCost += input;
        costCount++;
      }
      if (output !== undefined) {
        totalCost += output;
        costCount++;
      }
      if (cached !== undefined) {
        totalCost += cached;
        costCount++;
      }
    }

    return costCount > 0 ? totalCost / costCount : null;
  };

  const getModelSpeed = (model: ModelInfo): number | null => {
    return model.metrics?.tokensPerSecond ?? null;
  };

  const getModelContext = (model: ModelInfo): number | null => {
    return model.contextWindow ?? null;
  };

  const getModelCapable = (model: ModelInfo): number => {
    return model.capabilities.size + (model.supportedParameters?.size ?? 0);
  };

  // Filter and sort models
  const filteredModels = (() => {
    let filtered = scoredModels.filter((scored) => {
      if (!filterText) return true;
      const model = scored.model;
      const searchText = filterText.toLowerCase();
      return (
        model.id.toLowerCase().includes(searchText) ||
        model.name.toLowerCase().includes(searchText) ||
        model.provider.toLowerCase().includes(searchText)
      );
    });

    // Sort based on current sort mode
    if (sortMode !== 'score') {
      filtered = [...filtered].sort((a, b) => {
        const modelA = a.model;
        const modelB = b.model;

        let valueA: number | null;
        let valueB: number | null;
        let descending = true;

        switch (sortMode) {
          case 'cost-asc':
            valueA = getModelCost(modelA);
            valueB = getModelCost(modelB);
            descending = false;
            break;
          case 'cost-desc':
            valueA = getModelCost(modelA);
            valueB = getModelCost(modelB);
            break;
          case 'speed-desc':
            valueA = getModelSpeed(modelA);
            valueB = getModelSpeed(modelB);
            break;
          case 'speed-asc':
            valueA = getModelSpeed(modelA);
            valueB = getModelSpeed(modelB);
            descending = false;
            break;
          case 'context-desc':
            valueA = getModelContext(modelA);
            valueB = getModelContext(modelB);
            break;
          case 'context-asc':
            valueA = getModelContext(modelA);
            valueB = getModelContext(modelB);
            descending = false;
            break;
          case 'capable-desc':
            valueA = getModelCapable(modelA);
            valueB = getModelCapable(modelB);
            break;
          case 'capable-asc':
            valueA = getModelCapable(modelA);
            valueB = getModelCapable(modelB);
            descending = false;
            break;
          default:
            return 0;
        }

        // Handle null values - always sort to bottom
        if (valueA === null && valueB === null) return 0;
        if (valueA === null) return 1;
        if (valueB === null) return -1;

        // Sort by value
        if (descending) {
          return valueB - valueA;
        } else {
          return valueA - valueB;
        }
      });
    }

    return filtered;
  })();

  // Reset selection to top when filter or sort changes
  useEffect(() => {
    setSelectedModelIndex(0);
    setScrollOffset(0);
  }, [filterText, sortMode]);

  // Handle keyboard input
  useInput((input, key) => {
    // Handle Ctrl+C as cancel
    if (key.ctrl && input === 'c') {
      if (editingWeight) {
        setEditingWeight(null);
        setWeightInput('');
      } else if (mode === 'models' && filterText) {
        setFilterText('');
      } else if (mode === 'models') {
        // Ctrl+C in models mode - go back to weights
        setMode('weights');
      } else {
        // Ctrl+C in weights mode - cancel
        onCancel();
      }
      return;
    }

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
      if (key.meta && input === 'c') {
        // Toggle cost/metrics visibility
        setShowCostMetrics(!showCostMetrics);
      } else if (key.meta && input === 't') {
        // Toggle tier/capabilities visibility
        setShowTierCapabilities(!showTierCapabilities);
      } else if (key.meta && input === 'w') {
        // Switch back to weight editing
        setMode('weights');
        setFilterText('');
      } else if (key.meta && input === 's') {
        // Cycle through sort modes
        const currentIndex = sortModes.indexOf(sortMode);
        const nextIndex = (currentIndex + 1) % sortModes.length;
        setSortMode(sortModes[nextIndex]);
      } else if (key.upArrow) {
        if (filteredModels.length > 0) {
          const newIndex = selectedModelIndex > 0 ? selectedModelIndex - 1 : filteredModels.length - 1;
          setSelectedModelIndex(newIndex);
        }
      } else if (key.downArrow) {
        if (filteredModels.length > 0) {
          const newIndex = selectedModelIndex < filteredModels.length - 1 ? selectedModelIndex + 1 : 0;
          setSelectedModelIndex(newIndex);
        }
      } else if (key.return) {
        // Select the model
        if (filteredModels.length > 0 && selectedModelIndex < filteredModels.length) {
          onSelect(filteredModels[selectedModelIndex].model);
        }
      } else if (key.backspace) {
        // Allow backspace in filter mode
        if (filterText.length > 0) {
          setFilterText(filterText.slice(0, -1));
        }
      } else if (input && input.length === 1 && !key.ctrl && !key.meta && !key.return) {
        // Start filtering
        setFilterText(filterText + input);
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

      {current && (
        <Box marginBottom={1}>
          <Text dimColor>Current: </Text>
          <Text color="green">{current}</Text>
        </Box>
      )}

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>
          {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} found
          {filteredModels.length > 0 && ` (${selectedModelIndex + 1}/${filteredModels.length})`}
          {' | Sort: '}
          <Text color="cyan">
            {sortMode === 'score' && 'Score'}
            {sortMode === 'cost-asc' && 'Cheapest'}
            {sortMode === 'cost-desc' && 'Expensive'}
            {sortMode === 'speed-desc' && 'Fastest'}
            {sortMode === 'speed-asc' && 'Slowest'}
            {sortMode === 'context-desc' && 'Largest Context'}
            {sortMode === 'context-asc' && 'Smallest Context'}
            {sortMode === 'capable-desc' && 'Most Capable'}
            {sortMode === 'capable-asc' && 'Least Capable'}
          </Text>
        </Text>
        {filterText && (
          <Text dimColor>Filter: "{filterText}" (Backspace to edit, ESC to clear)</Text>
        )}
        {!filterText && <Text dimColor>Type to filter, ↑↓ to navigate, Enter to select</Text>}
      </Box>

      <Box flexDirection="column" key={`models-${sortMode}-${filterText}`}>
        {(() => {
          if (filteredModels.length === 0) {
            return null;
          }

          // Calculate viewport - simpler approach, each model is ~3 lines
          const terminalHeight = process.stdout.rows || 30;
          // Header (3) + filter info (3) + footer (2) + scroll indicators (4) = 12 lines reserved
          const reservedLines = 16;
          // Base: name line (1) + margin (1) = 2, plus optional rows
          let linesPerModel = 2;
          if (showCostMetrics) linesPerModel += 1;
          if (showTierCapabilities) linesPerModel += 1;
          const maxVisibleModels = Math.max(2, Math.floor((terminalHeight - reservedLines) / linesPerModel));

          // Calculate viewport based on selected index
          let startIndex = 0;
          let endIndex = Math.min(filteredModels.length, maxVisibleModels);

          // If selected index is beyond the visible range, adjust viewport
          if (selectedModelIndex >= maxVisibleModels) {
            const padding = Math.floor(maxVisibleModels / 3);
            startIndex = Math.max(0, selectedModelIndex - padding);
            endIndex = Math.min(filteredModels.length, startIndex + maxVisibleModels);

            // Adjust if we're near the end
            if (endIndex === filteredModels.length && filteredModels.length > maxVisibleModels) {
              startIndex = Math.max(0, filteredModels.length - maxVisibleModels);
            }
          }

          const visibleModels = filteredModels.slice(startIndex, endIndex);
          const hasMore = endIndex < filteredModels.length || startIndex > 0;

          return (
            <>
              {startIndex > 0 && (
                <Box marginBottom={1}>
                  <Text dimColor>  ↑ {startIndex} more above...</Text>
                </Box>
              )}
              {visibleModels.map((scored, visibleIndex) => {
                const actualIndex = startIndex + visibleIndex;
                const model = scored.model;
                const isSelected = actualIndex === selectedModelIndex;
                const cost = formatCost(model);
                const metrics = formatMetrics(model);
                const score = sortMode === 'score' ? `${(scored.score * 100).toFixed(0)}%` : `#${actualIndex + 1}`;
                const context = model.contextWindow ? `${(model.contextWindow / 1000).toFixed(0)}k ctx` : '';
                const maxOutput = model.maxOutputTokens ? `${(model.maxOutputTokens / 1000).toFixed(0)}k out` : '';
                const capabilities = Array.from(model.capabilities).slice(0, 6).join(' ');

                return (
                  <Box key={`${actualIndex}-${model.id}`} flexDirection="column" marginBottom={1}>
                    <Box>
                      <Text bold color={isSelected ? 'cyan' : 'white'}>
                        {isSelected ? '▶ ' : '  '}
                        {model.id}
                      </Text>
                      <Text dimColor> [{score}] {model.provider} | {context} {maxOutput && `| ${maxOutput}`}</Text>
                    </Box>
                    {showCostMetrics && (
                      <Box paddingLeft={3}>
                        <Text dimColor>
                          {cost} | {metrics}
                        </Text>
                      </Box>
                    )}
                    {showTierCapabilities && (
                      <Box paddingLeft={3}>
                        <Text dimColor>
                           {model.tier} | {capabilities}
                        </Text>
                      </Box>
                    )}
                  </Box>
                );
              })}
              {endIndex < filteredModels.length && (
                <Box marginTop={1}>
                  <Text dimColor>  ↓ {filteredModels.length - endIndex} more below...</Text>
                </Box>
              )}
            </>
          );
        })()}
      </Box>

      {filteredModels.length === 0 && (
        <Box justifyContent="center" marginTop={2}>
          <Text color="yellow">No models match the current criteria</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>ESC to go back | {altKeyLabel}+W weights | {altKeyLabel}+C cost/metrics | {altKeyLabel}+T tier/caps | {altKeyLabel}+S sort</Text>
      </Box>
    </Box>
  );
};

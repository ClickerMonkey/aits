import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '../lib/utils';
import { ModelCapability } from '@aeye/ai';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  tier?: string;
  capabilities?: Set<ModelCapability>;
  supportedParameters?: Set<ModelCapability>;
  pricing: {
    text?: { input?: number; output?: number; cached?: number };
    audio?: { input?: number; output?: number; perSecond?: number };
    image?: {
      input?: number;
      output?: Array<{
        quality: string;
        sizes: Array<{ width: number; height: number; cost: number }>;
      }>;
    };
    embeddings?: { cost?: number };
    perRequest?: number;
    reasoning?: { input?: number; output?: number; cached?: number };
  };
  metrics?: {
    tokensPerSecond?: number;
    timeToFirstToken?: number;
  };
}

interface ScoredModel {
  model: ModelInfo;
  score: number;
}

interface ModelSelectorProps {
  currentModel: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
  onFetchModels: () => Promise<ScoredModel[]>;
}

type SortMode = 'score' | 'cost-asc' | 'cost-desc' | 'speed-desc' | 'speed-asc' | 'context-desc' | 'context-asc' | 'capable-desc' | 'capable-asc';

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  currentModel,
  onSelect,
  onClose,
  onFetchModels,
}) => {
  const [models, setModels] = useState<ScoredModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('score');
  const [filterVision, setFilterVision] = useState(false);
  const [filterReasoning, setFilterReasoning] = useState(false);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const fetchId = ++fetchIdRef.current;

    const fetchModels = async () => {
      try {
        setLoading(true);
        const fetchedModels = await onFetchModels();

        // Only update if this is still the latest fetch
        if (fetchId === fetchIdRef.current) {
          setModels(fetchedModels);
        }
      } catch (error) {
        console.error('Failed to fetch models:', error);
        if (fetchId === fetchIdRef.current) {
          setModels([]);
        }
      } finally {
        if (fetchId === fetchIdRef.current) {
          setLoading(false);
        }
      }
    };

    fetchModels();
  }, [onFetchModels]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const getModelCost = (model: ModelInfo): number | null => {
    let totalCost = 0;
    let costCount = 0;

    if (model.pricing.text) {
      const { input, output } = model.pricing.text;
      if (input !== undefined) { totalCost += input; costCount++; }
      if (output !== undefined) { totalCost += output; costCount++; }
    }
    if (model.pricing.audio) {
      const { input, output, perSecond } = model.pricing.audio;
      if (perSecond !== undefined) { totalCost += perSecond * 1000; costCount++; }
      if (input !== undefined) { totalCost += input; costCount++; }
      if (output !== undefined) { totalCost += output; costCount++; }
    }
    if (model.pricing.reasoning) {
      const { input, output } = model.pricing.reasoning;
      if (input !== undefined) { totalCost += input; costCount++; }
      if (output !== undefined) { totalCost += output; costCount++; }
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
    return (model.capabilities?.size ?? 0) + (model.supportedParameters?.size ?? 0);
  };

  // Memoize filtered and sorted models to prevent excessive recalculation
  const filteredModels = useMemo(() => {
    // First, deduplicate models by ID
    const uniqueModels = Array.from(
      new Map(models.map(scored => [scored.model.id, scored])).values()
    );

    // Filter by search and capabilities
    const filtered = uniqueModels.filter((scored) => {
      const model = scored.model;

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch = (
          (model.id && model.id.toLowerCase().includes(searchLower)) ||
          (model.name && model.name.toLowerCase().includes(searchLower)) ||
          (model.provider && model.provider.toLowerCase().includes(searchLower))
        );
        if (!matchesSearch) return false;
      }

      // Capability filters
      if (filterVision && !model.capabilities?.has('vision')) {
        return false;
      }
      if (filterReasoning && !model.capabilities?.has('reasoning')) {
        return false;
      }

      return true;
    });

    // Sort
    if (sortMode === 'score') {
      return filtered; // Keep original order
    }

    return [...filtered].sort((a, b) => {
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

      if (valueA === null && valueB === null) return 0;
      if (valueA === null) return 1;
      if (valueB === null) return -1;

      return descending ? valueB - valueA : valueA - valueB;
    });
  }, [models, search, sortMode, filterVision, filterReasoning]);

  const formatCost = (model: ModelInfo): string => {
    const costs: string[] = [];

    if (model.pricing.text) {
      const { input, output } = model.pricing.text;
      if (input !== undefined && output !== undefined) {
        costs.push(`$${input.toFixed(2)}/$${output.toFixed(2)}/M`);
      } else if (input !== undefined) {
        costs.push(`$${input.toFixed(2)}/M in`);
      } else if (output !== undefined) {
        costs.push(`$${output.toFixed(2)}/M out`);
      }
    }

    if (model.pricing.audio) {
      const { input, output, perSecond } = model.pricing.audio;
      if (perSecond !== undefined) {
        costs.push(`$${perSecond.toFixed(4)}/s 🎵`);
      }
      if (input !== undefined && output !== undefined) {
        costs.push(`$${input.toFixed(2)}/$${output.toFixed(2)}/M 🎵`);
      }
    }

    if (model.pricing.reasoning) {
      const { input, output, cached } = model.pricing.reasoning;
      if (input !== undefined && output !== undefined) {
        costs.push(`$${input.toFixed(2)}/$${output.toFixed(2)}/M 🧠`);
      }
      if (cached !== undefined) {
        costs.push(`$${cached.toFixed(2)}/M cached 🧠`);
      }
    }

    if (model.pricing.perRequest) {
      costs.push(`$${model.pricing.perRequest.toFixed(4)}/req`);
    }

    return costs.length > 0 ? costs.join(', ') : '-';
  };

  const formatMetrics = (model: ModelInfo): string => {
    const parts: string[] = [];
    if (model.metrics?.tokensPerSecond) {
      parts.push(`${model.metrics.tokensPerSecond.toFixed(0)} tok/s`);
    }
    if (model.metrics?.timeToFirstToken) {
      parts.push(`${model.metrics.timeToFirstToken.toFixed(0)}ms TTFT`);
    }
    return parts.length > 0 ? parts.join(', ') : '-';
  };

  const sortModes: Array<{ value: SortMode; label: string }> = [
    { value: 'score', label: 'Score' },
    { value: 'cost-asc', label: 'Cheapest' },
    { value: 'cost-desc', label: 'Expensive' },
    { value: 'speed-desc', label: 'Fastest' },
    { value: 'speed-asc', label: 'Slowest' },
    { value: 'context-desc', label: 'Largest Context' },
    { value: 'context-asc', label: 'Smallest Context' },
    { value: 'capable-desc', label: 'Most Capable' },
    { value: 'capable-asc', label: 'Least Capable' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl max-h-[90vh] bg-card rounded-lg border border-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-2xl font-bold neon-text-cyan">Select Model</h2>
            {currentModel && (
              <p className="text-sm text-muted-foreground mt-1">
                Current: <span className="text-neon-cyan">{currentModel}</span>
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Search and Sort */}
        <div className="p-6 border-b border-border space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search models by id, name, or provider..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 text-foreground"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Sort by:</span>
            {sortModes.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setSortMode(value)}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-colors',
                  sortMode === value
                    ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50'
                    : 'bg-muted text-foreground hover:bg-muted/80',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Filter by:</span>
            <button
              onClick={() => setFilterVision(!filterVision)}
              className={cn(
                'px-3 py-1 text-xs rounded-md transition-colors',
                filterVision
                  ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/50'
                  : 'bg-muted text-foreground hover:bg-muted/80',
              )}
            >
              👁️ Vision
            </button>
            <button
              onClick={() => setFilterReasoning(!filterReasoning)}
              className={cn(
                'px-3 py-1 text-xs rounded-md transition-colors',
                filterReasoning
                  ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50'
                  : 'bg-muted text-foreground hover:bg-muted/80',
              )}
            >
              🧠 Reasoning
            </button>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Model List */}
        <ScrollArea className="flex-1 p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="spinner"></div>
              <span className="ml-3 text-muted-foreground">Loading models...</span>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No models found matching "{search}"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredModels.map((scored, index) => {
                const model = scored.model;
                const isSelected = model.id === currentModel;
                const score = `${(scored.score * 100).toFixed(0)}%`;
                const context = model.contextWindow ? `${(model.contextWindow / 1000).toFixed(0)}k ctx` : '';
                const maxOutput = model.maxOutputTokens ? `${(model.maxOutputTokens / 1000).toFixed(0)}k out` : '';
                const capabilities = model.capabilities ? Array.from(model.capabilities).slice(0, 8).join(' ') : '';
                const cost = formatCost(model);
                const metrics = formatMetrics(model);

                return (
                  <button
                    key={model.id}
                    onClick={() => {
                      onSelect(model.id);
                      onClose();
                    }}
                    className={cn(
                      'w-full text-left p-4 rounded-lg border transition-all',
                      isSelected
                        ? 'border-neon-cyan bg-neon-cyan/10'
                        : 'border-border bg-card/50 hover:bg-card hover:border-neon-cyan/50',
                    )}
                  >
                    <div className="space-y-2">
                      {/* Main line: ID, score, provider, context */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <span className={cn(
                            'font-mono text-sm font-semibold',
                            isSelected ? 'text-neon-cyan' : 'text-foreground'
                          )}>
                            {model.id}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            [{sortMode === 'score' ? score : `#${index + 1}`}]
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground text-right">
                          {model.provider} | {context} {maxOutput && `| ${maxOutput}`}
                        </div>
                      </div>

                      {/* Cost line */}
                      {cost !== '-' && (
                        <div className="text-xs text-muted-foreground">
                          <span className="text-foreground/70">Cost:</span> {cost}
                        </div>
                      )}

                      {/* Metrics line */}
                      {metrics !== '-' && (
                        <div className="text-xs text-muted-foreground">
                          <span className="text-foreground/70">Metrics:</span> {metrics}
                        </div>
                      )}

                      {/* Tier and capabilities */}
                      <div className="text-xs text-muted-foreground">
                        {model.tier && <span className="text-foreground/70">{model.tier}</span>}
                        {model.tier && capabilities && ' | '}
                        {capabilities}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t border-border text-xs text-muted-foreground">
          Press ESC to close | Click outside to close
        </div>
      </div>
    </div>
  );
};

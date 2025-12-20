import React, { useState, useEffect, useRef } from 'react';
import { X, Download, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { cn } from '../lib/utils';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface ChartViewerProps {
  option: EChartsOption;
  isOpen: boolean;
  onClose: () => void;
  availableVariants?: string[];
  currentVariant?: string;
  onVariantChange?: (variant: string) => void;
}

export const ChartViewer: React.FC<ChartViewerProps> = ({ option, isOpen, onClose, availableVariants, currentVariant, onVariantChange }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  // Initialize chart when opened
  useEffect(() => {
    if (isOpen && chartRef.current && !chartInstanceRef.current) {
      const chart = echarts.init(chartRef.current);
      chartInstanceRef.current = chart;
      chart.setOption(option);

      // Handle resize
      const handleResize = () => chart.resize();
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        chart.dispose();
        chartInstanceRef.current = null;
      };
    }
  }, [isOpen, option]);

  // Update chart when option changes
  useEffect(() => {
    if (chartInstanceRef.current && isOpen) {
      chartInstanceRef.current.setOption(option, true);
    }
  }, [option, isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Download chart as PNG
  const downloadChart = () => {
    if (!chartInstanceRef.current) return;

    try {
      const url = chartInstanceRef.current.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#000',
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = `chart-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download chart:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Variant Toggle */}
      {availableVariants && availableVariants.length > 1 && currentVariant && onVariantChange && (
        <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
          <span className="text-sm font-medium text-white">Type:</span>
          <div className="flex gap-1 flex-wrap max-w-xl">
            {availableVariants.map((variant) => (
              <button
                key={variant}
                onClick={() => onVariantChange(variant)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  currentVariant === variant
                    ? 'bg-neon-pink text-black font-semibold'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {variant}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button
          onClick={downloadChart}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          title="Download"
        >
          <Download className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={onClose}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          title="Close (ESC)"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Chart */}
      <div className="relative w-full h-full p-8">
        <div
          ref={chartRef}
          className="w-full h-full"
        />
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-white/10 rounded-lg text-white text-xs text-center">
        ESC or click outside to close
      </div>
    </div>
  );
};

interface ClickableChartProps {
  option: EChartsOption;
  className?: string;
  style?: React.CSSProperties;
  availableVariants?: string[];
  currentVariant?: string;
  onVariantChange?: (variant: string) => void;
}

export const ClickableChart: React.FC<ClickableChartProps> = ({ option, className, style, availableVariants, currentVariant, onVariantChange }) => {
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;
    chart.setOption(option);

    // Handle resize
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, []);

  // Update chart when option changes
  useEffect(() => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.setOption(option, true);
    }
  }, [option]);

  return (
    <>
      <div className={cn('relative group', className)} style={style}>
        <div
          ref={chartRef}
          className="w-full h-full"
        />
        {/* Fullscreen button overlay */}
        <button
          onClick={() => setIsViewerOpen(true)}
          className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
          title="View Fullscreen"
        >
          <Maximize2 className="w-4 h-4 text-white" />
        </button>
      </div>
      <ChartViewer
        option={option}
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        availableVariants={availableVariants}
        currentVariant={currentVariant}
        onVariantChange={onVariantChange}
      />
    </>
  );
};

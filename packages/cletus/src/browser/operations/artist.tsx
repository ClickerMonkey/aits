import * as echarts from 'echarts';
import React, { useEffect, useRef, useState } from 'react';
import { abbreviate, deepMerge, pluralize } from '../../shared';
import { ClickableImage } from '../components/ImageViewer';
import { createRenderer } from './render';
import { ChartDataPoint, ChartVariant } from '../../helpers/artist';
import { type EChartsOption } from 'echarts';


const renderer = createRenderer({
  borderColor: "border-neon-pink/30",
  bgColor: "bg-neon-pink/5",
  labelColor: "text-neon-pink",
});

export const image_generate = renderer<'image_generate'>(
  (op) => `ImageGenerate("${abbreviate(op.input.prompt, 30)}", n=${op.input.n || 1})`,
  (op): string | React.ReactNode | null => {
    if (op.output) {
      const count = op.output.count;
      // For browser, we can show the image inline if we have URLs
      if (op.output.images && op.output.images.length > 0) {
        return (
          <div className="ml-6 mt-2">
            <div className="text-sm mb-2">Generated {count} image{count !== 1 ? 's' : ''}</div>
            <div className="flex gap-2 flex-wrap">
              {op.output.images.map((img: string, i: number) => (
                <ClickableImage
                  key={i}
                  src={`/file?path=${encodeURIComponent(img)}`}
                  alt="Generated"
                  className="max-w-sm rounded border border-neon-pink/30"
                />
              ))}
            </div>
          </div>
        );
      }
      return `Generated ${pluralize(count, 'image')}`;
    }
    return null;
  }
);

export const image_edit = renderer<'image_edit'>(
  (op) => `ImageEdit("${op.input.path}", "${abbreviate(op.input.prompt, 20)}")`,
  (op): string | React.ReactNode | null => {
    if (op.output) {
      // For browser, we can show the edited image inline if we have a URL
      if (op.output.editedLink) {
        return (
          <div className="ml-6 mt-2">
            <div className="text-sm mb-2">Edited image saved</div>
            <ClickableImage
              src={`/file?path=${encodeURIComponent(op.output.editedLink)}`}
              alt="Edited"
              className="max-w-sm rounded border border-neon-pink/30"
            />
          </div>
        );
      }
      return 'Edited image saved';
    }
    return null;
  }
);

export const image_analyze = renderer<'image_analyze'>(
  (op) => {
    const pathCount = op.input.paths?.length || 1;
    const firstPath = op.input.paths?.[0] || '';
    const label = pathCount === 1 ? firstPath : `${pathCount} images`;
    return `ImageAnalyze(${label}, "${abbreviate(op.input.prompt, 20)}")`;
  },
  (op) => {
    if (op.output) {
      return abbreviate(op.output.analysis, 60);
    }
    return null;
  }
);

export const image_describe = renderer<'image_describe'>(
  (op) => `ImageDescribe("${op.input.path}")`,
  (op) => {
    if (op.output) {
      return abbreviate(op.output.description, 60);
    }
    return null;
  }
);

export const image_find = renderer<'image_find'>(
  (op) => `ImageFind("${abbreviate(op.input.query, 50)}", "${op.input.glob}")`,
  (op) => {
    if (op.output) {
      const resultCount = op.output.results.length;
      const searched = op.output.searched;
      return `Found ${pluralize(resultCount, 'matching image')} (searched ${searched})`;
    }
    return null;
  }
);

export const image_attach = renderer<'image_attach'>(
  (op) => `ImageAttach("${op.input.path}")`,
  (op) => {
    if (op.output?.attached) {
      return `Attached image: ${op.output.fullPath}`;
    }
    return null;
  }
);

// ============================================================================
// Chart Display Component
// ============================================================================

const ChartDisplay: React.FC<{
  chartGroup: string;
  availableVariants: ChartVariant[];
  currentVariant: ChartVariant;
  option: EChartsOption;
  data: ChartDataPoint[];
  variantOptions: Partial<Record<ChartVariant, Partial<EChartsOption>>>;
}> = ({ chartGroup, availableVariants, currentVariant: initialVariant, option: initialOption, data, variantOptions }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [currentVariant, setCurrentVariant] = useState(initialVariant);

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;

    // Set initial option
    chart.setOption(initialOption);

    // Handle resize
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, []);

  // Update chart when variant changes
  useEffect(() => {
    if (!chartInstanceRef.current) return;

    const newOption = buildOptionForVariant(currentVariant, data, variantOptions[currentVariant] || {});
    chartInstanceRef.current.setOption(newOption, true);
  }, [currentVariant, data, variantOptions]);

  const handleVariantChange = (variant: ChartVariant) => {
    setCurrentVariant(variant);
  };

  return (
    <div className="ml-6 mt-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium">Variant:</span>
        <div className="flex gap-1 flex-wrap">
          {availableVariants.map((variant) => (
            <button
              key={variant}
              onClick={() => handleVariantChange(variant)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                currentVariant === variant
                  ? 'bg-neon-pink text-black font-semibold'
                  : 'bg-neon-pink/20 text-neon-pink hover:bg-neon-pink/30'
              }`}
            >
              {variant}
            </button>
          ))}
        </div>
      </div>
      <div 
        ref={chartRef} 
        className="w-full border border-neon-pink/30 rounded bg-black/20"
        style={{ height: '400px' }}
      />
    </div>
  );
};

/**
 * Build ECharts option for a specific variant
 * 
 * Note: This function is duplicated from operations/artist.tsx because:
 * 1. The browser code cannot import from Node.js-specific files
 * 2. Extracting to shared.ts would require moving all chart logic there
 * 3. The logic needs to be in sync for server-side and client-side rendering
 * 
 * If making changes here, ensure the same changes are made in operations/artist.tsx
 */
function buildOptionForVariant(variant: ChartVariant, data: ChartDataPoint[], variantOption: Partial<EChartsOption>): EChartsOption {
  const baseOption: EChartsOption = {
    tooltip: { trigger: 'item' },
    legend: {},
    series: [],
  };

  // Apply variant-specific series configuration
  switch (variant) {
    case 'pie':
      baseOption.series = [{
        type: 'pie',
        radius: '50%',
        data,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      }];
      break;

    case 'donut':
      baseOption.series = [{
        type: 'pie',
        radius: ['40%', '70%'],
        data,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      }];
      break;

    case 'treemap':
      baseOption.series = [{
        type: 'treemap',
        data,
      }];
      break;

    case 'sunburst':
      baseOption.series = [{
        type: 'sunburst',
        data,
        radius: [0, '90%'],
      }];
      break;

    case 'bar':
      baseOption.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      baseOption.yAxis = { type: 'value' };
      baseOption.series = [{
        type: 'bar',
        data: data.map((d: any) => d.value),
      }];
      break;

    case 'horizontalBar':
      baseOption.yAxis = { type: 'category', data: data.map((d: any) => d.name) };
      baseOption.xAxis = { type: 'value' };
      baseOption.series = [{
        type: 'bar',
        data: data.map((d: any) => d.value),
      }];
      break;

    case 'pictorialBar':
      baseOption.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      baseOption.yAxis = { type: 'value' };
      baseOption.series = [{
        type: 'pictorialBar',
        data: data.map((d: any) => d.value),
        symbol: 'rect',
      }];
      break;

    case 'line':
      baseOption.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      baseOption.yAxis = { type: 'value' };
      baseOption.series = [{
        type: 'line',
        data: data.map((d: any) => d.value),
      }];
      break;

    case 'area':
      baseOption.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      baseOption.yAxis = { type: 'value' };
      baseOption.series = [{
        type: 'line',
        data: data.map((d: any) => d.value),
        areaStyle: {},
      }];
      break;

    case 'step':
      baseOption.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      baseOption.yAxis = { type: 'value' };
      baseOption.series = [{
        type: 'line',
        data: data.map((d: any) => d.value),
        step: 'start',
      }];
      break;

    case 'smoothLine':
      baseOption.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      baseOption.yAxis = { type: 'value' };
      baseOption.series = [{
        type: 'line',
        data: data.map((d: any) => d.value),
        smooth: true,
      }];
      break;

    case 'histogram':
    case 'boxplot':
    case 'scatter':
    case 'effectScatter':
    case 'heatmap':
    case 'tree':
    case 'sankey':
    case 'funnel':
    case 'map':
    case 'radar':
    case 'parallel':
      // Use the variant name directly as ECharts type (these are already correct)
      baseOption.series = [{
        type: variant,
        data,
      }];
      break;
      
    case 'orderedBar':
    case 'horizontalOrderedBar':
      // Ordered bars are just bars with sorted data
      const sortedData = [...data].sort((a: any, b: any) => b.value - a.value);
      if (variant === 'horizontalOrderedBar') {
        baseOption.yAxis = { type: 'category', data: sortedData.map((d: any) => d.name) };
        baseOption.xAxis = { type: 'value' };
      } else {
        baseOption.xAxis = { type: 'category', data: sortedData.map((d: any) => d.name) };
        baseOption.yAxis = { type: 'value' };
      }
      baseOption.series = [{
        type: 'bar',
        data: sortedData.map((d: any) => d.value),
      }];
      break;
      
    case 'groupedBar':
    case 'stackedBar':
      // Grouped and stacked bars need multiple series
      // For now, treat as regular bar - requires more complex data structure
      baseOption.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      baseOption.yAxis = { type: 'value' };
      baseOption.series = [{
        type: 'bar',
        data: data.map((d: any) => d.value),
        stack: variant === 'stackedBar' ? 'total' : undefined,
      }];
      break;
  }

  // Deep merge variant-specific options
  return deepMerge(baseOption, variantOption);
}

// ============================================================================
// Chart Display Renderer
// ============================================================================

export const chart_display = renderer<'chart_display'>(
  (op) => `ChartDisplay(${op.input.chart.chartGroup}, ${op.input.chart.data?.length || 0} points)`,
  (op): string | React.ReactNode | null => {
    if (op.output) {
      return (
        <ChartDisplay
          chartGroup={op.output.chartGroup}
          availableVariants={op.output.availableVariants}
          currentVariant={op.output.currentVariant}
          option={op.output.option}
          data={op.output.data}
          variantOptions={op.output.variantOptions}
        />
      );
    }
    return null;
  }
);

import { z } from 'zod';

// ============================================================================
// Chart Display Schemas
// ============================================================================

export const ChartDataPointSchema = z.object({
  name: z.string().describe('Name/label for the data point'),
  value: z.number().describe('Numeric value for the data point'),
});

export type ChartDataPoint = z.infer<typeof ChartDataPointSchema>;

export const PartToWholeChartSchema = z.object({
  chartGroup: z.literal('partToWhole'),
  title: z.string().optional().describe('Optional chart title'),
  data: z.array(ChartDataPointSchema).describe('Array of data points showing parts of a whole'),
  variantOptions: z.record(
    z.enum(['pie', 'donut', 'treemap', 'sunburst']),
    z.record(z.unknown())
  ).optional().describe('Optional variant-specific ECharts options'),
  defaultVariant: z.enum(['pie', 'donut', 'treemap', 'sunburst']).optional().describe('Default variant to display'),
});

export const CategoryComparisonChartSchema = z.object({
  chartGroup: z.literal('categoryComparison'),
  title: z.string().optional().describe('Optional chart title'),
  data: z.array(ChartDataPointSchema).describe('Array of data points for category comparison'),
  variantOptions: z.record(
    z.enum(['bar', 'horizontalBar', 'pictorialBar']),
    z.record(z.unknown())
  ).optional().describe('Optional variant-specific ECharts options'),
  defaultVariant: z.enum(['bar', 'horizontalBar', 'pictorialBar']).optional().describe('Default variant to display'),
});

export const TimeSeriesChartSchema = z.object({
  chartGroup: z.literal('timeSeries'),
  title: z.string().optional().describe('Optional chart title'),
  data: z.array(ChartDataPointSchema).describe('Array of time-series data points'),
  variantOptions: z.record(
    z.enum(['line', 'area', 'step', 'smoothLine']),
    z.record(z.unknown())
  ).optional().describe('Optional variant-specific ECharts options'),
  defaultVariant: z.enum(['line', 'area', 'step', 'smoothLine']).optional().describe('Default variant to display'),
});

export const DistributionChartSchema = z.object({
  chartGroup: z.literal('distribution'),
  title: z.string().optional().describe('Optional chart title'),
  data: z.array(ChartDataPointSchema).describe('Array of data points for distribution analysis'),
  variantOptions: z.record(
    z.enum(['histogram', 'boxplot']),
    z.record(z.unknown())
  ).optional().describe('Optional variant-specific ECharts options'),
  defaultVariant: z.enum(['histogram', 'boxplot']).optional().describe('Default variant to display'),
});

export const CorrelationChartSchema = z.object({
  chartGroup: z.literal('correlation'),
  title: z.string().optional().describe('Optional chart title'),
  data: z.array(ChartDataPointSchema).describe('Array of data points for correlation analysis'),
  variantOptions: z.record(
    z.enum(['scatter', 'effectScatter', 'heatmap']),
    z.record(z.unknown())
  ).optional().describe('Optional variant-specific ECharts options'),
  defaultVariant: z.enum(['scatter', 'effectScatter', 'heatmap']).optional().describe('Default variant to display'),
});

export const RankingChartSchema = z.object({
  chartGroup: z.literal('ranking'),
  title: z.string().optional().describe('Optional chart title'),
  data: z.array(ChartDataPointSchema).describe('Array of data points to rank'),
  variantOptions: z.record(
    z.enum(['orderedBar', 'horizontalOrderedBar']),
    z.record(z.unknown())
  ).optional().describe('Optional variant-specific ECharts options'),
  defaultVariant: z.enum(['orderedBar', 'horizontalOrderedBar']).optional().describe('Default variant to display'),
});

export const HierarchicalChartSchema = z.object({
  chartGroup: z.literal('hierarchical'),
  title: z.string().optional().describe('Optional chart title'),
  data: z.array(ChartDataPointSchema).describe('Array of hierarchical data points'),
  variantOptions: z.record(
    z.enum(['treemap', 'sunburst', 'tree']),
    z.record(z.unknown())
  ).optional().describe('Optional variant-specific ECharts options'),
  defaultVariant: z.enum(['treemap', 'sunburst', 'tree']).optional().describe('Default variant to display'),
});

export const FlowChartSchema = z.object({
  chartGroup: z.literal('flow'),
  title: z.string().optional().describe('Optional chart title'),
  data: z.array(ChartDataPointSchema).describe('Array of flow/funnel data points'),
  variantOptions: z.record(
    z.enum(['sankey', 'funnel']),
    z.record(z.unknown())
  ).optional().describe('Optional variant-specific ECharts options'),
  defaultVariant: z.enum(['sankey', 'funnel']).optional().describe('Default variant to display'),
});

export const GeospatialChartSchema = z.object({
  chartGroup: z.literal('geospatial'),
  title: z.string().optional().describe('Optional chart title'),
  data: z.array(ChartDataPointSchema).describe('Array of geographic data points'),
  variantOptions: z.record(
    z.enum(['map']),
    z.record(z.unknown())
  ).optional().describe('Optional variant-specific ECharts options'),
  defaultVariant: z.enum(['map']).optional().describe('Default variant to display'),
});

export const MultivariateComparisonChartSchema = z.object({
  chartGroup: z.literal('multivariateComparison'),
  title: z.string().optional().describe('Optional chart title'),
  data: z.array(ChartDataPointSchema).describe('Array of data points for multivariate comparison'),
  variantOptions: z.record(
    z.enum(['groupedBar', 'stackedBar', 'radar', 'parallel']),
    z.record(z.unknown())
  ).optional().describe('Optional variant-specific ECharts options'),
  defaultVariant: z.enum(['groupedBar', 'stackedBar', 'radar', 'parallel']).optional().describe('Default variant to display'),
});

// Union of all chart schemas
export const ChartConfigSchema = z.union([
  PartToWholeChartSchema,
  CategoryComparisonChartSchema,
  TimeSeriesChartSchema,
  DistributionChartSchema,
  CorrelationChartSchema,
  RankingChartSchema,
  HierarchicalChartSchema,
  FlowChartSchema,
  GeospatialChartSchema,
  MultivariateComparisonChartSchema,
]);

export type ChartConfig = z.infer<typeof ChartConfigSchema>;

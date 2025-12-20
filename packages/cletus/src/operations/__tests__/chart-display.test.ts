import { describe, it, expect } from '@jest/globals';
import { chart_display } from '../artist';

describe('chart_display operation', () => {
  it('should create a chart with partToWhole group', async () => {
    const input = {
      chartGroup: 'partToWhole' as const,
      title: 'Test Chart',
      data: [
        { name: 'A', value: 10 },
        { name: 'B', value: 20 },
        { name: 'C', value: 30 },
      ],
      defaultVariant: 'pie' as const,
    };

    const output = await chart_display.do({ input } as any, {} as any);

    expect(output.chartGroup).toBe('partToWhole');
    expect(output.currentVariant).toBe('pie');
    expect(output.availableVariants).toEqual(['pie', 'donut', 'treemap', 'sunburst']);
    expect(output.data).toEqual(input.data);
    expect(output.option).toBeDefined();
    expect(output.option.series).toBeDefined();
    expect(output.option.series.length).toBeGreaterThan(0);
  });

  it('should create a chart with categoryComparison group', async () => {
    const input = {
      chartGroup: 'categoryComparison' as const,
      data: [
        { name: 'X', value: 15 },
        { name: 'Y', value: 25 },
      ],
    };

    const output = await chart_display.do({ input } as any, {} as any);

    expect(output.chartGroup).toBe('categoryComparison');
    expect(output.currentVariant).toBe('bar');
    expect(output.availableVariants).toEqual(['bar', 'horizontalBar', 'pictorialBar']);
  });

  it('should use default variant when not specified', async () => {
    const input = {
      chartGroup: 'timeSeries' as const,
      data: [
        { name: '2023', value: 100 },
        { name: '2024', value: 150 },
      ],
    };

    const output = await chart_display.do({ input } as any, {} as any);

    expect(output.currentVariant).toBe('line'); // First variant in timeSeries group
  });

  it('should include title in option when provided', async () => {
    const input = {
      chartGroup: 'ranking' as const,
      title: 'Top Items',
      data: [
        { name: 'Item 1', value: 50 },
        { name: 'Item 2', value: 30 },
      ],
    };

    const output = await chart_display.do({ input } as any, {} as any);

    expect(output.option.title).toBeDefined();
    expect(output.option.title.text).toBe('Top Items');
  });

  it('should merge variant options', async () => {
    const input = {
      chartGroup: 'partToWhole' as const,
      data: [
        { name: 'A', value: 10 },
      ],
      defaultVariant: 'pie' as const,
      variantOptions: {
        pie: {
          series: [{
            label: {
              show: true,
              position: 'outside',
            },
          }],
        },
      },
    };

    const output = await chart_display.do({ input } as any, {} as any);

    expect(output.variantOptions.pie).toBeDefined();
  });
});

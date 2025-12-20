# Chart Display Operation

The `chart_display` operation allows you to visualize data as interactive charts in the browser UI using ECharts.

## Usage

The operation is browser-only and displays charts with the ability to switch between different visualization variants.

### Basic Example

```typescript
{
  "chartGroup": "partToWhole",
  "title": "Market Share by Company",
  "data": [
    { "name": "Apple", "value": 28 },
    { "name": "Samsung", "value": 22 },
    { "name": "Xiaomi", "value": 13 },
    { "name": "Oppo", "value": 10 },
    { "name": "Others", "value": 27 }
  ],
  "defaultVariant": "pie"
}
```

## Chart Groups and Variants

Each chart group represents a category of related visualizations that display similar types of data:

### Part to Whole (`partToWhole`)
Shows how individual parts contribute to a whole.
- **Variants**: `pie`, `donut`, `treemap`, `sunburst`

### Category Comparison (`categoryComparison`)
Compares values across different categories.
- **Variants**: `bar`, `horizontalBar`, `pictorialBar`

### Time Series (`timeSeries`)
Displays data trends over time.
- **Variants**: `line`, `area`, `step`, `smoothLine`

### Distribution (`distribution`)
Shows how data is distributed.
- **Variants**: `histogram`, `boxplot`

### Correlation (`correlation`)
Shows relationships between variables.
- **Variants**: `scatter`, `effectScatter`, `heatmap`

### Ranking (`ranking`)
Displays ordered/ranked data.
- **Variants**: `orderedBar`, `horizontalOrderedBar`

### Hierarchical (`hierarchical`)
Represents hierarchical data structures.
- **Variants**: `treemap`, `sunburst`, `tree`

### Flow (`flow`)
Shows flow or funnel processes.
- **Variants**: `sankey`, `funnel`

### Geospatial (`geospatial`)
Displays geographic data.
- **Variants**: `map`, `scatter`

### Multivariate Comparison (`multivariateComparison`)
Compares multiple variables simultaneously.
- **Variants**: `groupedBar`, `stackedBar`, `radar`, `parallel`

## Data Format

Data should be an array of objects with `name` and `value` properties:

```json
[
  { "name": "Category A", "value": 10 },
  { "name": "Category B", "value": 20 },
  { "name": "Category C", "value": 30 }
]
```

## Advanced Usage

### Custom Variant Options

You can customize each variant with ECharts-specific options:

```typescript
{
  "chartGroup": "partToWhole",
  "data": [...],
  "variantOptions": {
    "pie": {
      "series": [{
        "label": {
          "show": true,
          "position": "outside"
        }
      }]
    },
    "donut": {
      "series": [{
        "label": {
          "show": false
        }
      }]
    }
  }
}
```

## Browser UI

In the browser, the chart will be displayed with:
1. A visual representation of the data
2. Variant selector buttons above the chart
3. Click any variant button to instantly switch the chart type
4. All variants in the same chart group display the same underlying data

## Example Use Cases

### Sales Data
```typescript
{
  "chartGroup": "categoryComparison",
  "title": "Monthly Sales",
  "data": [
    { "name": "Jan", "value": 1200 },
    { "name": "Feb", "value": 1500 },
    { "name": "Mar", "value": 1800 }
  ],
  "defaultVariant": "bar"
}
```

### Time Series Analysis
```typescript
{
  "chartGroup": "timeSeries",
  "title": "Temperature Over Time",
  "data": [
    { "name": "00:00", "value": 20 },
    { "name": "06:00", "value": 18 },
    { "name": "12:00", "value": 25 },
    { "name": "18:00", "value": 22 }
  ],
  "defaultVariant": "smoothLine"
}
```

### Budget Breakdown
```typescript
{
  "chartGroup": "partToWhole",
  "title": "Budget Allocation",
  "data": [
    { "name": "Engineering", "value": 50000 },
    { "name": "Marketing", "value": 30000 },
    { "name": "Sales", "value": 25000 },
    { "name": "Operations", "value": 20000 }
  ],
  "defaultVariant": "treemap"
}
```

## Implementation Details

- **Mode**: `local` (no approval needed)
- **Toolset**: Artist
- **Browser Only**: Yes (requires browser UI to display)
- **Library**: ECharts 5.x

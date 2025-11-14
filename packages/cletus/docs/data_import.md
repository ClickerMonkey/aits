# Data Import Tool

The `data_import` tool allows you to import structured data from files into custom data types using AI-powered extraction.

## Overview

The data import tool:
1. Finds files matching a glob pattern
2. Processes each file in chunks with configurable overlap
3. Uses AI to extract structured data matching your type definition
4. Automatically determines unique fields to avoid duplicates
5. Merges data by updating existing records or creating new ones
6. Updates the knowledge base with imported records

## Usage

### Basic Import

```typescript
// Import from all CSV files in the data directory
{
  "glob": "data/*.csv"
}
```

### Custom Chunk Settings

```typescript
// Import with custom chunk size and overlap
{
  "glob": "import/*.txt",
  "chunkSize": 3000,  // Characters per chunk
  "overlap": 300      // Overlap between chunks
}
```

## Parameters

- **glob** (required): Glob pattern for files to import (e.g., `"data/*.csv"`, `"**/*.txt"`)
- **chunkSize** (optional): Characters per chunk for AI processing (default: 4000)
- **overlap** (optional): Character overlap between chunks to avoid missing data at boundaries (default: 200)

## How It Works

### 1. File Discovery
The tool uses glob patterns to find all matching files in your current working directory.

### 2. Chunked Processing
Large files are split into overlapping chunks to:
- Stay within AI token limits
- Avoid missing records that span chunk boundaries
- Enable parallel processing for better performance

### 3. AI Extraction
For each chunk, the AI extracts structured data matching your type definition:
- Respects field types (string, number, boolean, date, enum)
- Handles required vs optional fields
- Uses enum options when specified

### 4. Uniqueness Determination
The AI analyzes sample records to determine which fields should be used for uniqueness:
- ID fields (id, userId, email, etc.)
- Natural keys (combinations that make records unique)
- Returns empty array if no reliable uniqueness criteria exists

### 5. Data Merging
Records are merged intelligently:
- **New records**: Created if no match found
- **Existing records**: Updated only if there are changes
- **Duplicates**: Skipped if identical to existing record

### 6. Knowledge Base Update
After import, the knowledge base is updated with the new/modified records for semantic search.

## Example Workflow

Let's say you have a `Product` type with fields:
- name (string, required)
- sku (string, required)
- price (number)
- description (string)

And files containing product data:
```
products/
  catalog1.txt
  catalog2.csv
```

The tool will:
1. Find both files
2. Extract product records from each
3. Determine that `sku` should be used for uniqueness
4. Create new products or update existing ones
5. Update the knowledge base

## Progress Tracking

The import process provides real-time progress updates via `chatStatus`:
- Files discovered
- Current file being processed
- Chunks extracted per file
- Records processed
- Final import statistics

## Output

The operation returns:
```typescript
{
  imported: number,      // New records created
  updated: number,       // Existing records updated
  skipped: number,       // Duplicates skipped
  libraryKnowledgeUpdated: boolean  // Knowledge base updated
}
```

## Best Practices

1. **Use specific globs**: `"data/products*.csv"` rather than `"**/*.*"`
2. **Adjust chunk size**: Larger chunks for simple data, smaller for complex structures
3. **Add overlap**: Use at least 200 characters to avoid missing records at boundaries
4. **Test with samples**: Try with a few files first before bulk import
5. **Review unique fields**: Check the AI's choice of unique fields makes sense for your data

## Limitations

- Text files only (no binary formats)
- AI extraction quality depends on file structure and clarity
- Large files may take time to process
- Unique field determination is heuristic-based

## Error Handling

The tool handles errors gracefully:
- Skips unreadable files
- Continues on chunk extraction failures
- Logs warnings for debugging
- Returns partial results if some files fail

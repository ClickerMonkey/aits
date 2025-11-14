# Data Import Tool

The `data_import` tool allows you to import structured data from files into custom data types using AI-powered extraction.

## Overview

The data import tool:
1. Finds files matching a glob pattern
2. Filters readable files (text, PDF, Excel, Word documents)
3. Processes files in parallel using the file processing pipeline
4. Uses AI to extract structured data matching your type definition with schema validation
5. Automatically determines unique fields to avoid duplicates
6. Merges data by updating existing records or creating new ones
7. Updates the knowledge base with imported records

## Usage

### Basic Import

```typescript
// Import from all CSV files in the data directory
{
  "glob": "data/*.csv"
}
```

### Import with Image Text Extraction

```typescript
// Import from PDFs and extract text from images
{
  "glob": "documents/**/*.pdf",
  "transcribeImages": true
}
```

## Parameters

- **glob** (required): Glob pattern for files to import (e.g., `"data/*.csv"`, `"**/*.txt"`)
- **transcribeImages** (optional): Extract text from images in documents using OCR (default: false)

## How It Works

### 1. File Discovery
The tool uses glob patterns with `searchFiles` to find and categorize all matching files:
- Identifies file types (text, PDF, Excel, Word, images, etc.)
- Filters out unreadable and unknown file types
- Excludes image files unless `transcribeImages` is enabled

### 2. File Processing
Uses the `processFile` pipeline for robust file handling:
- **Text files**: Direct text extraction
- **PDFs**: Text extraction with optional image rendering
- **Excel**: Row-by-row data extraction
- **Word docs**: HTML to markdown conversion
- **Images**: OCR text extraction (when `transcribeImages` is enabled)
- Files are processed in parallel for better performance
- Automatic text chunking with smart overlap

### 3. AI Extraction with Schema Validation
The AI extracts structured data with type-safe schema validation:
- Builds Zod schema from your type definition
- Uses structured output format for reliable parsing
- Respects field types (string, number, boolean, date, enum)
- Validates required vs optional fields
- Enforces enum options when specified

### 4. Uniqueness Determination
The AI analyzes sample records to determine which fields should be used for uniqueness:
- ID fields (id, userId, email, etc.)
- Natural keys (combinations that make records unique)
- Returns empty array if no reliable uniqueness criteria exists
- Uses structured output for reliable field selection

### 5. Data Merging (Single Transaction)
All record changes happen in one efficient database save operation:
- **New records**: Created if no match found
- **Existing records**: Updated only if there are changes
- **Duplicates**: Skipped if identical to existing record
- Progress updates every 10 records

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
2. **Test with samples**: Try with a few files first before bulk import
3. **Review unique fields**: Check the AI's choice of unique fields makes sense for your data
4. **Enable OCR when needed**: Set `transcribeImages: true` for documents with embedded images containing data
5. **Supported file types**: Text, CSV, PDF, Excel (xlsx), Word (docx), and images (with transcribeImages)

## Improvements Over Original Implementation

- **Better file handling**: Reuses proven file processing pipeline from clerk operations
- **Type safety**: Zod schemas ensure extracted data matches type definition
- **Performance**: Single database transaction instead of multiple save operations
- **Reliability**: Structured output eliminates JSON parsing errors
- **Flexibility**: Supports more file formats (PDF, Excel, Word) with proper extraction

## Limitations

- Binary formats require supported processors (PDF, Excel, Word)
- AI extraction quality depends on file structure and clarity
- Large files may take time to process
- Unique field determination is heuristic-based

## Error Handling

The tool handles errors gracefully:
- Skips unreadable, unknown, and unsupported files
- Continues on file processing failures
- Logs warnings for debugging
- Returns partial results if some files fail
- Validates structured output against schema automatically

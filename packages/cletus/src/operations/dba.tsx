import Handlebars from "handlebars";
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { CletusAIContext, transcribe } from "../ai";
import { abbreviate, formatName, pluralize } from "../common";
import { ConfigFile } from "../config";
import { CONSTS } from "../constants";
import { DataManager } from "../data";
import { canEmbed, embed } from "../embed";
import { getAssetPath } from "../file-manager";
import { processFile, searchFiles } from "../helpers/files";
import { renderOperation } from "../helpers/render";
import { buildFieldsSchema, getType, getTypeName } from "../helpers/type";
import { KnowledgeFile } from "../knowledge";
import { KnowledgeEntry, TypeDefinition, TypeField } from "../schemas";
import { operationOf } from "./types";
import { executeQuery, executeQueryWithoutCommit, commitQueryChanges, canCommitQueryResult, QueryResult, QueryExecutionPayload, CanCommitResult } from '../helpers/dba-query';
import type { Query } from '../helpers/dba';

export const data_index = operationOf<
  { name: string },
  { libraryKnowledgeUpdated: boolean },
  {},
  { typeName: string }
>({
  mode: 'update',
  signature: 'data_index()',
  status: ({ name }) => `Indexing ${name}`,
  analyze: async ({ input: { name } }, { config }) => {
    const type = getType(config, name);
    
    return {
      analysis: `This will update the knowledge for type "${type.friendlyName}".`,
      doable: true,
      cache: { typeName: type.friendlyName },
    };
  },
  do: async ({ input: { name } }, ctx) => {
    const dataManager = new DataManager(name);
    await dataManager.load();

    const allRecords = dataManager.getAll();
    const recordIds = allRecords.map(r => r.id);

    const libraryKnowledgeUpdated = await updateKnowledge(ctx, name, recordIds, []);

    return { libraryKnowledgeUpdated };
  },
  render: (op, ai, showInput, showOutput) => {
    // Use cached typeName for consistent rendering even if type is deleted
    const typeName = op.cache?.typeName ?? getTypeName(ai.config.defaultContext!.config!, op.input.name);

    return renderOperation(
      op,
      `${formatName(typeName)}Index()`,
      (op) => {
        if (op.output?.libraryKnowledgeUpdated) {
          return `Knowledge updated for type: ${typeName}`;
        }
        return null;
      },
      showInput, showOutput
    );
  },
});

export const data_import = operationOf<
  { name: string; glob: string; transcribeImages?: boolean },
  { imported: number; failed: number; updated: number; updateSkippedNoChanges: number; libraryKnowledgeUpdated: boolean },
  {},
  { typeName: string; importableCount: number }
>({
  mode: 'create',
  signature: 'data_import(glob: string, transcribeImages?)',
  status: ({ name, glob }) => `Importing ${name} from ${glob}`,
  analyze: async ({ input: { name, glob } }, { config, cwd, signal }) => {
    const type = getType(config, name);
    const files = await searchFiles(cwd, glob, signal);
    
    const unreadable = files.filter(f => f.fileType === 'unreadable').map(f => f.file);
    const images = files.filter(f => f.fileType === 'image').map(f => f.file);
    const unknown = files.filter(f => f.fileType === 'unknown').map(f => f.file);
    const importable = files.filter(f => f.fileType !== 'unknown' && f.fileType !== 'unreadable' && f.fileType !== 'image').map(f => f.file);
    
    let analysis = '';
    if (unreadable.length > 0) {
      analysis += `Found ${unreadable.length} unreadable file(s): ${unreadable.join(', ')}\n`;
    }
    if (images.length > 0) {
      analysis += `Found ${images.length} image file(s) (images will be skipped unless transcribeImages is enabled)\n`;
    }
    if (unknown.length > 0) {
      analysis += `Found ${unknown.length} file(s) of unknown/unsupported format: ${unknown.join(', ')}.\n`;
    }
    analysis += `This will import ${type.friendlyName} records from ${importable.length} file(s) matching "${glob}". Files will be processed with AI extraction.`;
    
    return {
      analysis,
      doable: importable.length > 0,
      cache: { typeName: type.friendlyName, importableCount: importable.length },
    };
  },
  do: async ({ input: { name, glob, transcribeImages = false } }, ctx) => {
    const { chatStatus, ai, config, cwd, log, signal } = ctx;
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();
    
    // Find and filter files
    const files = await searchFiles(cwd, glob, signal);
    const importableFiles = files.filter(f => {
      if (f.fileType === 'unknown' || f.fileType === 'unreadable') {
        return false;
      }
      // Include images only if transcribeImages is enabled
      if (f.fileType === 'image' && !transcribeImages) {
        return false;
      }
      return true;
    });

    log(`data_import: found ${files.length} files, ${importableFiles.length} importable`);
    
    chatStatus(`Found ${importableFiles.length} files to process`);
    
    // Create prompt for extraction
    const extractor = ai.prompt({
      name: 'extractor',
      description: 'Extract structured data from text',
      content: `You are an expert data extraction assistant. Your task is to extract structured data from unstructured text based on the provided type definition.
Provide only the extracted data in JSON format as specified, without any additional commentary or explanation.
    
You are extracting all instances of {{type.friendlyName}} from the provided text.
Return an array of objects with the fields defined above. If no instances are found, return an empty array.

<typeInformation>
Type: {{type.friendlyName}}
{{#if type.description}}Description: {{type.description}}{{/if}}

Fields:
{{#each type.fields}}
- {{this.name}} ({{this.type}}{{#if this.required}}, required{{/if}}{{#if this.enumOptions}}, options: {{this.enumOptions}}{{/if}}{{#if this.default}}, default: {{this.default}}{{/if}})
{{/each}}
</typeInformation>

<text>
{{text}}
</text>`,
      schema: z.object({ 
        results: z.array(buildFieldsSchema(type)),
      }),
      input: ({ text }: { text: string }) => ({ type, text }),
      metadataFn: () => ({
        model: config.getData().user.models?.chat,
      }),
      excludeMessages: true,
    });

    
    let allExtractedRecords: Record<string, any>[] = [];
    
    // Process files in parallel
    let filesProcessed = 0;
    let filesExtracted = 0;
    let filesFailed = 0;
    await Promise.all(importableFiles.map(async (file) => {
      if (signal?.aborted) {
        return;
      }

      const fullPath = path.resolve(cwd, file.file);
      
      try {
        // Process file to get sections
        const parsed = await processFile(fullPath, file.file, {
          assetPath: await getAssetPath(true),
          sections: true,
          transcribeImages: transcribeImages,
          describeImages: false,
          extractImages: false,
          summarize: false,
          transcriber: (image) => transcribe(ai, image, signal),
          signal,
        });
        
        // Status update
        filesProcessed++;
        chatStatus(`Processed/extracted ${filesProcessed}/${filesExtracted} out of ${pluralize(importableFiles.length, 'file')}`);
        
        // Group sections to minimize LLM calls (combine sections up to MAX_EXTRACTION_CHUNK_SIZE)
        const sectionGroups: string[] = [];
        let currentGroup = '';
        
        for (const section of parsed.sections) {
          if (!section || section.trim().length === 0) {
            continue;
          }
          
          // If adding this section would exceed the limit, save current group and start new one
          if (currentGroup.length > 0 && currentGroup.length + section.length + 2 > CONSTS.MAX_EXTRACTION_CHUNK_SIZE) {
            sectionGroups.push(currentGroup);
            currentGroup = section;
          } else {
            // Add section to current group with separator
            currentGroup = currentGroup.length > 0 ? currentGroup + '\n\n' + section : section;
          }
        }
        
        // Add final group if not empty
        if (currentGroup.length > 0) {
          sectionGroups.push(currentGroup);
        }
        
        // Extract data from grouped sections
        const extractedResults = await Promise.allSettled(sectionGroups.map(async (group, index) => {
          try {
            const { results } = await extractor.get('result', { text: group }, ctx) || { results: [] };

            return results;
          } catch (error) {
            log(`Warning: Failed to extract from section group in ${file.file}: ${(error as Error).message}`);
            return [];
          }
        }));

        // Collect successful extractions
        allExtractedRecords.push(...extractedResults.flatMap(p => p.status === 'fulfilled' ? p.value : []));

        // Status update
        filesExtracted++;
        chatStatus(`Processed/extracted ${filesProcessed}/${filesExtracted} out of ${pluralize(importableFiles.length, 'file')}`)
      } catch (error) {
        log(`Warning: Failed to process file ${file.file}: ${(error as Error).message}`);
        filesFailed++;
      }
    }));

    log(`data_import: extracted ${allExtractedRecords.length} records from ${importableFiles.length} files`);
    
    // If no records extracted, return early
    if (allExtractedRecords.length === 0) {
      return { imported: 0, updated: 0, failed: filesFailed, updateSkippedNoChanges: 0, libraryKnowledgeUpdated: false };
    }

    chatStatus(`Extracted ${allExtractedRecords.length} potential records`);
    
    // Get sample records for uniqueness determination
    const sampleSize = Math.min(10, allExtractedRecords.length);
    const sampleRecords = allExtractedRecords.slice(0, sampleSize);
    
    // Ask AI to determine unique fields
    chatStatus('Determining unique fields...');
    const uniqueFields = await determineUniqueFields(ai, config, type, sampleRecords);
    chatStatus(`Importing data${uniqueFields.length > 0 ? ` using unique fields ${uniqueFields.join(', ')}` : ''}`);
    
    log(`data_import: using unique fields: ${uniqueFields.join(', ')}`);

    // Merge data based on unique fields
    let imported = 0;
    let updated = 0;
    let updateSkippedNoChanges = 0;
    const updatedIds: string[] = [];

    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }
    
    // Use single save operation for all changes
    await dataManager.save((dataFile) => {
      for (const record of allExtractedRecords) {
        // Find existing record by unique fields
        let existingRecord = null;
        if (uniqueFields.length > 0) {
          existingRecord = dataFile.data.find(existing => 
            uniqueFields.every(field => existing.fields[field] === record[field])
          );
        }
        
        if (existingRecord) {
          // Check if there are actual changes
          const hasChanges = Object.keys(record).some(
            field => JSON.stringify(existingRecord!.fields[field]) !== JSON.stringify(record[field])
          );
          
          if (hasChanges) {
            Object.assign(existingRecord.fields, record);
            existingRecord.updated = Date.now();
            updatedIds.push(existingRecord.id);
            updated++;
          } else {
            updateSkippedNoChanges++;
          }
        } else {
          // Create new record
          const id = uuidv4();
          const now = Date.now();
          dataFile.data.push({
            id,
            created: now,
            updated: now,
            fields: record,
          });
          updatedIds.push(id);
          imported++;
        }
      }
    });
    
    chatStatus('Updating knowledge base...');
    
    // Update knowledge base
    let libraryKnowledgeUpdated = true;
    try {
      libraryKnowledgeUpdated = await updateKnowledge(ctx, name, updatedIds, []);
    } catch (e) {
      log(`Warning: failed to update knowledge base after import: ${(e as Error).message}`);
      libraryKnowledgeUpdated = false;
    }
    
    return { imported, updated, updateSkippedNoChanges, libraryKnowledgeUpdated, failed: filesFailed };
  },
  render: (op, ai, showInput, showOutput) => {
    // Use cached typeName for consistent rendering even if type is deleted
    const typeName = op.cache?.typeName ?? getTypeName(ai.config.defaultContext!.config!, op.input.name);
    return renderOperation(
      op,
      `${formatName(typeName)}Import("${op.input.glob}")`,
      (op) => {
        if (op.output) {
          return `Imported ${op.output.imported} new, updated ${op.output.updated}, skipped ${op.output.updateSkippedNoChanges} duplicate(s)`;
        } else if (op.cache?.importableCount !== undefined) {
          return `Will import from ${op.cache.importableCount} file(s)`;
        }
        return null;
      },
      showInput, showOutput
    );
  },
});

export const data_search = operationOf<
  { name: string; query: string; n?: number },
  { query: string; results: Array<{ source: string; text: string; similarity: number }> },
  {},
  { typeName: string; limit: number }
>({
  mode: 'local',
  signature: 'data_search(query: string, n?)',
  status: ({ name, query }) => `Searching ${name}: ${abbreviate(query, 25)}`,
  analyze: async ({ input: { name, query, n } }, { config }) => {
    const type = getType(config, name);
    const limit = n || 10;

    if (!await canEmbed()) {
      return {
        analysis: 'Embedding model is not configured, cannot perform vector search.',
        doable: false,
      };
    }

    return {
      analysis: `This will search ${type.friendlyName} knowledge for "${query}", returning up to ${limit} results.`,
      doable: true,
      cache: { typeName: type.friendlyName, limit },
    };
  },
  do: async ({ input: { name, query, n } }, { ai }) => {
    if (!await canEmbed()) {
      throw new Error('Embedding model is not configured');
    }

    const knowledge = new KnowledgeFile();
    await knowledge.load();

    const limit = n || 10;
    
    // Generate embedding for query
    const [queryVector] = await embed([query]) || [];
    if (!queryVector) {
      throw new Error('Failed to generate embedding for query');
    }

    // Search for similar entries with source prefix matching the type name
    const sourcePrefix = `${name}:`;
    const similarEntries = knowledge.searchBySimilarity(queryVector, limit, sourcePrefix);

    return {
      query,
      results: similarEntries.map((result) => ({
        source: result.entry.source,
        text: result.entry.text,
        similarity: result.similarity,
      })),
    };
  },
  render: (op, ai, showInput, showOutput) => {
    // Use cached typeName for consistent rendering even if type is deleted
    const typeName = op.cache?.typeName ?? getTypeName(ai.config.defaultContext!.config!, op.input.name);
    return renderOperation(
      op,
      `${formatName(typeName)}Search("${abbreviate(op.input.query, 20)}")`,
      (op) => {
        if (op.output) {
          const count = op.output.results.length;
          return `Found ${count} result${count !== 1 ? 's' : ''}`;
        }
        return null;
      },
      showInput, showOutput
    );
  },
});

/**
 * Get the kind of a query statement for display
 */
function getQueryKind(query: Query): string {
  if ('kind' in query) {
    if (query.kind === 'withs') {
      return 'CTE';
    }
    return query.kind.toUpperCase();
  }
  return 'QUERY';
}

/**
 * Get a brief description of the query for display
 */
function describeQuery(query: Query): string {
  if ('kind' in query) {
    switch (query.kind) {
      case 'select':
        const selectParts: string[] = [];
        if (query.from?.kind === 'table') {
          selectParts.push(`from ${query.from.table}`);
        }
        if (query.joins?.length) {
          selectParts.push(`${query.joins.length} join(s)`);
        }
        if (query.where?.length) {
          selectParts.push('filtered');
        }
        if (query.groupBy?.length) {
          selectParts.push('grouped');
        }
        return selectParts.length > 0 ? selectParts.join(', ') : 'simple';
        
      case 'insert':
        return `into ${query.table}`;
        
      case 'update':
        return `${query.table}`;
        
      case 'delete':
        return `from ${query.table}`;
        
      case 'union':
      case 'intersect':
      case 'except':
        return `${query.kind}`;
        
      case 'withs':
        const cteNames = query.withs.map(w => w.name).join(', ');
        return `CTEs: ${cteNames}`;
        
      default:
        return '';
    }
  }
  return '';
}

/**
 * Collect all table names referenced in a query
 */
function collectReferencedTables(query: Query, tables: Set<string>): void {
  if (!query || typeof query !== 'object') return;
  
  if ('kind' in query) {
    switch (query.kind) {
      case 'select':
        if (query.from?.kind === 'table') {
          tables.add(query.from.table);
        } else if (query.from?.kind === 'subquery') {
          collectReferencedTables(query.from.subquery, tables);
        }
        if (query.joins) {
          for (const join of query.joins) {
            if (join.source.kind === 'table') {
              tables.add(join.source.table);
            } else if (join.source.kind === 'subquery') {
              collectReferencedTables(join.source.subquery, tables);
            }
          }
        }
        break;
        
      case 'insert':
        tables.add(query.table);
        if (query.select) {
          collectReferencedTables(query.select, tables);
        }
        break;
        
      case 'update':
        tables.add(query.table);
        if (query.from?.kind === 'table') {
          tables.add(query.from.table);
        } else if (query.from?.kind === 'subquery') {
          collectReferencedTables(query.from.subquery, tables);
        }
        if (query.joins) {
          for (const join of query.joins) {
            if (join.source.kind === 'table') {
              tables.add(join.source.table);
            } else if (join.source.kind === 'subquery') {
              collectReferencedTables(join.source.subquery, tables);
            }
          }
        }
        break;
        
      case 'delete':
        tables.add(query.table);
        if (query.joins) {
          for (const join of query.joins) {
            if (join.source.kind === 'table') {
              tables.add(join.source.table);
            } else if (join.source.kind === 'subquery') {
              collectReferencedTables(join.source.subquery, tables);
            }
          }
        }
        break;
        
      case 'union':
      case 'intersect':
      case 'except':
        collectReferencedTables(query.left, tables);
        collectReferencedTables(query.right, tables);
        break;
        
      case 'withs':
        for (const withStmt of query.withs) {
          if (withStmt.kind === 'cte') {
            collectReferencedTables(withStmt.statement, tables);
          } else if (withStmt.kind === 'cte-recursive') {
            collectReferencedTables(withStmt.statement, tables);
            collectReferencedTables(withStmt.recursiveStatement, tables);
          }
        }
        collectReferencedTables(query.final, tables);
        break;
    }
  }
}

export interface QueryOperationCache {
  payload?: QueryExecutionPayload;
  canCommit?: CanCommitResult;
  referencedTables?: string[];
}

export const query = operationOf<
  { query: Query; commit?: boolean },
  QueryResult,
  {},
  QueryOperationCache
>({
  mode: 'update', // Can modify data, so requires update mode
  signature: 'query(query: Query, commit?: boolean = true)',
  status: ({ query }) => `Executing ${getQueryKind(query)} query`,
  inputFormat: 'json',
  outputFormat: 'json',
  analyze: async ({ input: { query: queryInput } }, { config }) => {
    const types = config.getData().types;

    // Validate that referenced tables exist
    const referencedTables = new Set<string>();
    collectReferencedTables(queryInput, referencedTables);

    const missingTables = Array.from(referencedTables).filter(
      table => !types.some(t => t.name === table)
    );

    if (missingTables.length > 0) {
      return {
        analysis: `This would fail - referenced tables not found: ${missingTables.join(', ')}`,
        doable: false,
      };
    }

    const kind = getQueryKind(queryInput);
    const description = describeQuery(queryInput);

    // Execute the query without committing to see what would happen
    const payload = await executeQueryWithoutCommit(
      queryInput,
      () => config.getData().types,
      (typeName: string) => new DataManager(typeName)
    );

    // Describe what the query would do based on the results
    const result = payload.result;

    // Check for validation errors
    if (!result.canCommit && result.validationErrors && result.validationErrors.length > 0) {
      const errorSummary = result.validationErrors
        .map((err, i) => `[${i + 1}] ${err.path}: ${err.message}`)
        .join('\n');

      return {
        analysis: `This would fail due to validation errors:\n${errorSummary}`,
        doable: false,
        cache: { payload, referencedTables: Array.from(referencedTables) },
      };
    }

    const parts: string[] = [];

    if (result.rows.length > 0) {
      parts.push(`return ${pluralize(result.rows.length, 'row')}`);
    }
    if (result.inserted?.length) {
      const count = result.inserted.reduce((a, b) => a + b.ids.length, 0);
      parts.push(`insert ${pluralize(count, 'record')}`);
    }
    if (result.updated?.length) {
      const count = result.updated.reduce((a, b) => a + b.ids.length, 0);
      parts.push(`update ${pluralize(count, 'record')}`);
    }
    if (result.deleted?.length) {
      const count = result.deleted.reduce((a, b) => a + b.ids.length, 0);
      parts.push(`delete ${pluralize(count, 'record')}`);
    }

    const action = result.affectedCount === 0 ? 'did' : 'will';
    const detailedAnalysis = parts.length > 0
      ? `This ${action} ${parts.join(', ')}.`
      : `This ${action} execute a ${kind} query${description ? ` (${description})` : ''}.`;

    return {
      analysis: detailedAnalysis,
      doable: result.canCommit,
      cache: { payload, referencedTables: Array.from(referencedTables) },
      ...(result.affectedCount === 0 ? {
        done: true,
        output: result
      } : {}),
    };
  },
  do: async ({ input: { query: queryInput, commit = true }, cache }, ctx) => {
    const { config, log } = ctx;
    const getManager = (typeName: string) => new DataManager(typeName);

    // If we have a cached payload and commit is true, try to use it
    if (cache?.payload && commit) {
      // Check if the cached payload can still be committed
      const canCommitResult = await canCommitQueryResult(cache.payload, getManager);
      if (canCommitResult.canCommit) {
        // Commit the cached payload
        const output = await commitQueryChanges(cache.payload, getManager);
        
        // Update knowledge base for affected records
        await updateKnowledgeFromQueryResult(ctx, output);
        
        return {
          output,
          cache: { ...cache, canCommit: canCommitResult },
        };
      } else {
        // Store the canCommit result in cache so render can show why it failed
        const newCache = { ...cache, canCommit: canCommitResult };
        // Try to re-execute the query
        try {
          const output = await executeQuery(
            queryInput,
            () => config.getData().types,
            getManager
          );
          
          // Update knowledge base for affected records
          await updateKnowledgeFromQueryResult(ctx, output);
          
          return {
            output,
            cache: newCache,
          };
        } catch (error: any) {
          // If re-execution also fails, throw with the canCommit reason
          throw new Error(`Cannot commit query: ${canCommitResult.reason}`);
        }
      }
    }

    // Execute the query fresh
    if (commit) {
      const output = await executeQuery(
        queryInput,
        () => config.getData().types,
        getManager
      );
      
      // Update knowledge base for affected records
      await updateKnowledgeFromQueryResult(ctx, output);
      
      // Get referenced tables for cache
      const referencedTables = new Set<string>();
      collectReferencedTables(queryInput, referencedTables);
      
      return {
        output,
        cache: { referencedTables: Array.from(referencedTables) },
      };
    } else {
      // Execute without committing (for testing)
      const payload = await executeQueryWithoutCommit(
        queryInput,
        () => config.getData().types,
        getManager
      );
      
      // Get referenced tables for cache
      const referencedTables = new Set<string>();
      collectReferencedTables(queryInput, referencedTables);
      
      return {
        output: payload.result,
        cache: { payload, referencedTables: Array.from(referencedTables) },
      };
    }
  },
  render: (op, ai, showInput, showOutput) => {
    const kind = getQueryKind(op.input.query);
    const description = describeQuery(op.input.query);
    
    // Determine render name based on referenced tables
    const referencedTables = op.cache?.referencedTables || [];
    let renderName: string;
    if (referencedTables.length === 1) {
      // Single table - use typeName format
      const typeName = getTypeName(ai.config.defaultContext!.config!, referencedTables[0]);
      renderName = `${formatName(typeName)}Query(${kind}${description ? `: ${description}` : ''})`;
    } else {
      // Multiple tables or unknown - just use Query
      renderName = `Query(${kind}${description ? `: ${description}` : ''})`;
    }

    return renderOperation(
      op,
      renderName,
      (op) => {
        if (op.output) {
          const parts: string[] = [];
          if (op.output.rows.length > 0) {
            parts.push(`${pluralize(op.output.rows.length, 'row')}`);
          }
          if (op.output.inserted?.length) {
            parts.push(`${op.output.inserted.reduce((a, b) => a + b.ids.length, 0)} inserted`);
          }
          if (op.output.updated?.length) {
            parts.push(`${op.output.updated.reduce((a, b) => a + b.ids.length, 0)} updated`);
          }
          if (op.output.deleted?.length) {
            parts.push(`${op.output.deleted.reduce((a, b) => a + b.ids.length, 0)} deleted`);
          }
          return parts.length > 0 ? parts.join(', ') : 'Query executed';
        }

        // If no output, check if we have canCommit status in cache
        if (op.cache?.canCommit && !op.cache.canCommit.canCommit) {
          return `Cannot execute: ${op.cache.canCommit.reason}`;
        }

        return null;
      },
      showInput, showOutput
    );
  },
});

/**
 * Update knowledge base after a query with affected rows.
 * 
 * For each type that had records inserted, updated, or deleted,
 * this function updates the knowledge base entries accordingly.
 * Inserted and updated records are re-indexed, while deleted records
 * are removed from the knowledge base.
 * 
 * @param ctx - The Cletus AI context containing config and logging
 * @param result - The query result containing affected rows by type
 */
async function updateKnowledgeFromQueryResult(ctx: CletusAIContext, result: QueryResult): Promise<void> {
  // Collect all affected record IDs by type
  const updatedByType = new Map<string, string[]>();
  const deletedByType = new Map<string, string[]>();
  
  // Process inserted records
  if (result.inserted) {
    for (const { typeName, ids } of result.inserted) {
      if (!updatedByType.has(typeName)) {
        updatedByType.set(typeName, []);
      }
      updatedByType.get(typeName)!.push(...ids);
    }
  }
  
  // Process updated records
  if (result.updated) {
    for (const { typeName, ids } of result.updated) {
      if (!updatedByType.has(typeName)) {
        updatedByType.set(typeName, []);
      }
      updatedByType.get(typeName)!.push(...ids);
    }
  }
  
  // Process deleted records
  if (result.deleted) {
    for (const { typeName, ids } of result.deleted) {
      if (!deletedByType.has(typeName)) {
        deletedByType.set(typeName, []);
      }
      deletedByType.get(typeName)!.push(...ids);
    }
  }
  
  // Update knowledge base for each affected type
  for (const [typeName, ids] of updatedByType.entries()) {
    try {
      await updateKnowledge(ctx, typeName, ids, []);
    } catch (e) {
      ctx.log(`Warning: failed to update knowledge base for ${typeName}: ${(e as Error).message}`);
    }
  }
  
  for (const [typeName, ids] of deletedByType.entries()) {
    try {
      await updateKnowledge(ctx, typeName, [], ids);
    } catch (e) {
      ctx.log(`Warning: failed to update knowledge base for deleted ${typeName} records: ${(e as Error).message}`);
    }
  }
}

/**
 * Updates knowledge entries for a given type.
 * 
 * @param ctx 
 * @param type 
 * @param update 
 * @param remove 
 */
async function updateKnowledge(ctx: CletusAIContext, typeName: string, update: string[], remove: string[]): Promise<boolean> {
  const type = ctx.config.getData().types.find(t => t.name === typeName);
  if (!type) {
    throw new Error(`Data type not found: ${typeName}`);
  }
  if (!type.knowledgeTemplate && remove.length === 0) {
    return false;
  }

  if (!await canEmbed()) {
    return false;
  }

  const dataFile = new DataManager(type.name);
  await dataFile.load();
  
  const typeTemplate = type.knowledgeTemplate ? Handlebars.compile(type.knowledgeTemplate, { noEscape: true }) : () => '';
  const updateTemplates = update
    .map(id => {
      const record = dataFile.getById(id);
      if (record) {
        return { id, text: typeTemplate(record.fields) };
      }
      return null;
    })
    .filter(t => t !== null && t.text.trim().length > 0) as { id: string; text: string }[];

  const embeddings = await embed(updateTemplates.map(t => t.text)) || [];
  const knowledge: KnowledgeEntry[] = embeddings.map((vector, i) => ({
    source: `${typeName}:${updateTemplates[i].id}`,
    text: updateTemplates[i].text,
    vector: vector,
    created: Date.now()
  }));

  const removing = new Set(remove.map(id => `${typeName}:${id}`));

  const knowledgeFile = new KnowledgeFile();
  await knowledgeFile.load();
  await knowledgeFile.save(async (data) => {
    // Do delete first, check all models.
    data.knowledge = data.knowledge.filter(e => !removing.has(e.source));
  
    // Do update/insert
    for (const entry of knowledge) {
      const existing = data.knowledge.find(e => e.source === entry.source);
      if (existing) {
        existing.updated = Date.now();
        existing.text = entry.text;
        existing.vector = entry.vector;
      } else {
        data.knowledge.push(entry);
      }
    }
  });

  return true;
} 

/**
 * Determine which fields should be used for uniqueness checking
 */
async function determineUniqueFields(
  ai: CletusAIContext['ai'],
  config: ConfigFile,
  type: TypeDefinition,
  sampleRecords: Record<string, any>[]
): Promise<string[]> {
  const models = config.getData().user.models;
  const model = models?.chat;
  
  const fieldDescriptions = type.fields.map(field => {
    let desc = `- ${field.name} (${field.type})`;
    if (field.required) desc += ' [required]';
    if (field.enumOptions) desc += ` [options: ${field.enumOptions.join(', ')}]`;
    return desc;
  }).join('\n');
  
  const prompt = `Given the following type definition and sample records, determine which field(s) should be used to identify unique records and avoid duplicates.

Type: ${type.friendlyName}
${type.description || ''}

Fields:
${fieldDescriptions}

Sample records (up to 10):
${JSON.stringify(sampleRecords, null, 2)}

Respond with a JSON array of field names that should be used for uniqueness checking. For example: ["email"] or ["firstName", "lastName"] or [] if all records should be considered unique.

Consider:
- ID fields (id, userId, email, etc.)
- Natural keys (combinations of fields that make a record unique)
- Return empty array [] if there's no reliable way to determine uniqueness`;
  
  try {
    const response = await ai.chat.get({
      model,
      messages: [
        { role: 'system', content: 'You are a database design assistant. Analyze data schemas and identify unique key fields.' },
        { role: 'user', content: prompt },
      ],
      responseFormat: { type: z.object({ fields: z.array(z.string()) }), strict: true },
    });
    
    // Parse JSON from content
    const results = JSON.parse(response.content) as { fields: string[] };
    
    // Validate that all fields exist in the type
    const validFields = results.fields.filter(field => 
      type.fields.some(f => f.name === field)
    );
    
    return validFields;
  } catch (error) {
    return [];
  }
}
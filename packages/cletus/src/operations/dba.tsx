import Handlebars from "handlebars";
import { getModel } from "@aits/core";
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { CletusAIContext, transcribe } from "../ai";
import { abbreviate, chunkArray, formatName } from "../common";
import { ConfigFile } from "../config";
import { CONSTS } from "../constants";
import { DataManager } from "../data";
import { KnowledgeFile } from "../knowledge";
import { KnowledgeEntry, TypeDefinition, TypeField } from "../schemas";
import { renderOperation } from "./render-helpers";
import { operationOf } from "./types";
import { FieldCondition, WhereClause, countByWhere, filterByWhere } from "./where-helpers";
import { searchFiles, processFile } from "./file-helper";
import { getAssetPath } from "../file-manager";
import { buildFieldsSchema } from "../tools/dba";


function getType(config: ConfigFile, typeName: string): TypeDefinition {
  const type = config.getData().types.find((t) => t.name === typeName);
  if (!type) {
    throw new Error(`Data type not found: ${typeName}`);
  }
  return type;
}


export const data_create = operationOf<
  { name: string; fields: Record<string, any> },
  { id: string; name: string, libraryKnowledgeUpdated: boolean }
>({
  mode: 'create',
  status: ({ name }) => `Creating ${name} record`,
  analyze: async ({ name, fields }, { config })=> {
    const type = getType(config, name);
    const fieldNames = Object.keys(fields);
    return {
      analysis: `This will create a new ${type.friendlyName} record with fields: ${fieldNames.join(', ')}.`,
      doable: true,
    };
  },
  do: async ({ name, fields }, ctx) => {
    const dataManager = new DataManager(name);
    await dataManager.load();
    const id = await dataManager.create(fields);

    // Update knowledge base
    let libraryKnowledgeUpdated = true;
    try {
      libraryKnowledgeUpdated = await updateKnowledge(ctx, name, [id], []); 
    } catch (e) {
      ctx.log(`Warning: failed to update knowledge base after creating record: ${(e as Error).message}`);
      libraryKnowledgeUpdated = false;
    }

    return { id, name, libraryKnowledgeUpdated };
  },
  render: (op, config) => {
    const type = getType(config, op.input.name);
    const firstField = Object.keys(op.input.fields)[0];
    const additionalCount = Object.keys(op.input.fields).length - 1;
    const more = additionalCount > 0 ? `, +${additionalCount} more` : '';
    
    return renderOperation(
      op,
      `${formatName(type.friendlyName)}Create("${op.input.fields[firstField]}"${more})`,
      (op) => {
        if (op.output) {
          return `Created record ID: ${op.output.id}`;
        }
        return null;
      }
    );
  },
});

export const data_update = operationOf<
  { name: string; id: string; fields: Record<string, any> },
  { id: string; updated: boolean, libraryKnowledgeUpdated: boolean }
>({
  mode: 'update',
  status: ({ name, id }) => `Updating ${name}: ${id.slice(0, 8)}`,
  analyze: async ({ name, id, fields }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(type.name);
    await dataManager.load();
    const record = dataManager.getById(id);

    if (!record) {
      return {
        analysis: `This would fail - ${type.friendlyName} record "${id}" not found.`,
        doable: false,
      };
    }

    const fieldNames = Object.keys(fields);
    return {
      analysis: `This will update ${type.friendlyName} record "${id}" with fields: ${fieldNames.join(', ')}.`,
      doable: true,
    };
  },
  do: async ({ name, id, fields }, ctx) => {
    const dataManager = new DataManager(name);
    await dataManager.load();
    await dataManager.update(id, fields);

    // Update knowledge base
    let libraryKnowledgeUpdated = true;
    try {
      libraryKnowledgeUpdated = await updateKnowledge(ctx, name, [id], []); 
    } catch (e) {
      ctx.log(`Warning: failed to update knowledge base after updating record: ${(e as Error).message}`);
      libraryKnowledgeUpdated = false;
    }

    return { id, updated: true, libraryKnowledgeUpdated };
  },
  render: (op, config) => {
    const type = getType(config, op.input.name);
    const fields = type.fields.filter(f => f.name in op.input.fields).map(f => f.friendlyName);
    
    return renderOperation(
      op,
      `${formatName(type.friendlyName)}Update(${fields.map(f => `"${f}"`).join(', ')})`,
      (op) => {
        if (op.output?.updated) {
          return `Updated record ID: ${op.output.id}`;
        }
        return null;
      }
    );
  },
});

export const data_delete = operationOf<
  { name: string; id: string },
  { id: string; deleted: boolean, libraryKnowledgeUpdated: boolean }
>({
  mode: 'delete',
  status: ({ name, id }) => `Deleting ${name}: ${id.slice(0, 8)}`,
  analyze: async ({ name, id }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();
    const record = dataManager.getById(id);

    if (!record) {
      return {
        analysis: `This would fail - ${type.friendlyName} record "${id}" not found.`,
        doable: false,
      };
    }

    return {
      analysis: `This will delete ${type.friendlyName} record "${id}".`,
      doable: true,
    };
  },
  do: async ({ name, id }, ctx) => {
    const dataManager = new DataManager(name);
    await dataManager.load();
    await dataManager.delete(id);

    // Update knowledge base
    let libraryKnowledgeUpdated = true;
    try {
      libraryKnowledgeUpdated = await updateKnowledge(ctx, name, [], [id]); 
    } catch (e) {
      ctx.log(`Warning: failed to update knowledge base after deleting record: ${(e as Error).message}`);
      libraryKnowledgeUpdated = false;
    }

    return { id, deleted: true, libraryKnowledgeUpdated };
  },
  render: (op, config) => {
    const type = getType(config, op.input.name);

    return renderOperation(
      op,
      `${formatName(type.friendlyName)}Delete("${op.input.id.slice(0, 8)}")`,
      (op) => {
        if (op.output?.deleted) {
          return `Deleted record ID: ${op.output.id}`;
        }
        return null;
      }
    );
  },
});

export const data_select = operationOf<
  { name: string; where?: WhereClause; offset?: number; limit?: number; orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }> },
  { count: number; results: any[] }
>({
  mode: 'local',
  status: ({ name }) => `Selecting ${name} records`,
  analyze: async ({ name, where, offset, limit, orderBy }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();

    let records = dataManager.getAll();
    if (where) {
      records = filterByWhere(records, where);
    }

    const recordOffset = offset || 0;
    const recordLimit = limit || (records.length - recordOffset);

    return {
      analysis: `This will query ${type.friendlyName} records: ${records.length} matching records, returning ${Math.min(recordLimit, Math.max(0, records.length - recordOffset))} (limit: ${recordLimit}, offset: ${recordOffset}).`,
      doable: true,
    };
  },
  do: async ({ name, where, offset, limit, orderBy }) => {
    const dataManager = new DataManager(name);
    await dataManager.load();

    let results = dataManager.getAll();

    // Apply where clause
    if (where) {
      results = filterByWhere(results, where);
    }

    // Apply ordering
    if (orderBy?.length) {
      results.sort((a, b) => {
        for (const order of orderBy!) {
          const aVal = a.fields[order.field];
          const bVal = b.fields[order.field];

          if (aVal < bVal) return order.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return order.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    const recordOffset = offset || 0;
    const recordLimit = limit || (results.length - recordOffset);

    return {
      count: results.length,
      results: results.slice(recordOffset, recordOffset + recordLimit),
    };
  },
  render: (op, config) => {
    const type = getType(config, op.input.name);
    const where = op.input.where ? `where=${whereString(op.input.where)}` : ''
    const limit = op.input.limit ? `limit=${op.input.limit}` : '';
    const offset = op.input.offset ? `offset=${op.input.offset}` : '';
    const orderBy = op.input.orderBy ? `orderBy=${op.input.orderBy.map(o => o.field).join(',')}` : '';
    const params = [where, limit, offset, orderBy].filter(p => p).join(', ');

    return renderOperation(
      op,
      `${formatName(type.friendlyName)}Select(${params})`,
      (op) => {
        if (op.output) {
          return `Returned ${op.output.results.length} of ${op.output.count} record(s)`;
        }
        return null;
      }
    );
  },
});

export const data_update_many = operationOf<
  { name: string; set: Record<string, any>; where: WhereClause; limit?: number },
  { updated: number, libraryKnowledgeUpdated: boolean }
>({
  mode: 'update',
  status: ({ name }) => `Updating multiple ${name} records`,
  analyze: async ({ name, limit, set, where }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();

    const matchingCount = countByWhere(dataManager.getAll(), where);
    const actualCount = limit ? Math.min(matchingCount, limit) : matchingCount;

    const setFields = Object.keys(set);
    const limitText = limit ? ` (limited to ${limit})` : '';
    return {
      analysis: `This will bulk update ${actualCount} ${type.friendlyName} record(s) matching criteria${limitText}, setting: ${setFields.join(', ')}.`,
      doable: true,
    };
  },
  do: async ({ name, limit, set, where }, ctx) => {
    const dataManager = new DataManager(name);
    await dataManager.load();

    let matchingRecords = filterByWhere(dataManager.getAll(), where);

    // Apply limit if specified
    if (limit) {
      matchingRecords = matchingRecords.slice(0, limit);
    }

    // Update all matching records
    await Promise.all(matchingRecords.map((record) =>
      dataManager.update(record.id, set)
    ));

    // Update knowledge base
    let libraryKnowledgeUpdated = true;
    try {
      libraryKnowledgeUpdated = await updateKnowledge(ctx, name, matchingRecords.map(r => r.id), []); 
    } catch (e) {
      ctx.log(`Warning: failed to update knowledge base after updating records: ${(e as Error).message}`);
      libraryKnowledgeUpdated = false;
    }

    return { updated: matchingRecords.length, libraryKnowledgeUpdated };
  },
  render: (op, config) => {
    const type = getType(config, op.input.name);
    const set = 'set=' + Object.keys(op.input.set).join(',');
    const where = op.input.where ? `where=${whereString(op.input.where)}` : ''
    const limit = op.input.limit ? `limit=${op.input.limit}` : '';
    const params = [set, where, limit].filter(p => p).join(', ');

    return renderOperation(
      op,
      `${formatName(type.friendlyName)}UpdateMany(${params})`,
      (op) => {
        if (op.output) {
          return `Updated ${op.output.updated} record(s)`;
        }
        return null;
      }
    );
  },
});

export const data_delete_many = operationOf<
  { name: string; where: WhereClause; limit?: number },
  { deleted: number, libraryKnowledgeUpdated: boolean }
>({
  mode: 'delete',
  status: ({ name }) => `Deleting multiple ${name} records`,
  analyze: async ({ name, where, limit }, { config }) => {
    const type = getType(config, name);
    
    const dataManager = new DataManager(name);
    await dataManager.load();

    const matchingCount = countByWhere(dataManager.getAll(), where);
    const actualCount = limit ? Math.min(matchingCount, limit) : matchingCount;

    const limitText = limit ? ` (limited to ${limit})` : '';
    return {
      analysis: `This will bulk delete ${actualCount} ${type.friendlyName} record(s) matching the specified criteria${limitText}.`,
      doable: true,
    };
  },
  do: async ({ name, where, limit }, ctx) => {
    const dataManager = new DataManager(name);
    await dataManager.load();

    let matchingRecords = filterByWhere(dataManager.getAll(), where);

    // Apply limit if specified
    if (limit) {
      matchingRecords = matchingRecords.slice(0, limit);
    }
    
    // If no matching records, return early
    if (matchingRecords.length === 0) {
      return { deleted: 0, libraryKnowledgeUpdated: false };
    }

    // Delete all matching records
    await Promise.all(matchingRecords.map((record) =>
      dataManager.delete(record.id)
    ));

    // Also remove from knowledge base
    let libraryKnowledgeUpdated = true;
    try {
      await updateKnowledge(ctx, name, [], matchingRecords.map(r => r.id)); 
    } catch (e) {
      ctx.log(`Warning: failed to update knowledge base after deleting records: ${(e as Error).message}`);
      libraryKnowledgeUpdated = false;
    }

    return { deleted: matchingRecords.length, libraryKnowledgeUpdated };
  },
  render: (op, config) => {
    const type = getType(config, op.input.name);
    const where = op.input.where ? `where=${whereString(op.input.where)}` : ''
    const limit = op.input.limit ? `limit=${op.input.limit}` : '';
    const params = [where, limit].filter(p => p).join(', ');

    return renderOperation(
      op,
      `${formatName(type.friendlyName)}DeleteMany(${params})`,
      (op) => {
        if (op.output) {
          return `Deleted ${op.output.deleted} record(s)`;
        }
        return null;
      }
    );
  },
});

export const data_aggregate = operationOf<
  {
    name: string;
    where?: WhereClause;
    having?: WhereClause;
    groupBy?: string[];
    orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }>;
    select: Array<{ function: 'count' | 'sum' | 'avg' | 'min' | 'max'; field?: string; alias?: string }>;
  },
  { results: any[] }
>({
  mode: 'local',
  status: ({ name }) => `Aggregating ${name} records`,
  analyze: async ({ name, where }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();

    let records = dataManager.getAll();
    if (where) {
      records = filterByWhere(records, where);
    }

    // TODO better summarize the input

    return {
      analysis: `This will perform an aggregation query on ${records.length} ${type.friendlyName} record(s).`,
      doable: true,
    };
  },
  do: async ({ name, where, having, groupBy, select, orderBy }) => {
    const dataManager = new DataManager(name);
    await dataManager.load();

    let records = dataManager.getAll();

    // Apply where clause
    if (where) {
      records = filterByWhere(records, where);
    }

    // Group records if groupBy is specified
    const groups: Map<string, any[]> = new Map();

    if (groupBy?.length) {
      for (const record of records) {
        const key = groupBy.map((field) => record.fields[field]).join('|||');
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(record);
      }
    } else {
      groups.set('*', records);
    }

    // Compute aggregations for each group
    const results: any[] = [];

    for (const [key, groupRecords] of groups.entries()) {
      const result: any = {};

      // Add group by fields
      if (groupBy?.length) {
        const keyParts = key.split('|||');
        groupBy.forEach((field, i) => {
          result[field] = keyParts[i];
        });
      }

      // Compute aggregation functions
      for (const agg of select) {
        const alias = agg.alias || `${agg.function}_${agg.field || '*'}`;
        const numbers = groupRecords
          .map((r) => agg.field ? r.fields[agg.field] : null)
          .filter((v) => v !== null && v !== undefined)
          .map((v) => Number(v))
          .filter((v) => isFinite(v));

        switch (agg.function) {
          case 'count':
            if (agg.field) {
              // Count non-null values for specific field
              result[alias] = groupRecords.filter((r) => r.fields[agg.field!] !== null && r.fields[agg.field!] !== undefined).length;
            } else {
              // Count all records in group (count(*))
              result[alias] = groupRecords.length;
            }
            break;

          case 'sum':
            if (agg.field) {
              result[alias] = numbers.reduce((sum, n) => sum + n, 0);
            }
            break;

          case 'avg':
            if (agg.field) {
              const sum = numbers.reduce((sum, n) => sum + n, 0);
              result[alias] = numbers.length > 0 ? sum / numbers.length : 0;
            }
            break;

          case 'min':
            if (agg.field) {
              result[alias] = numbers.length > 0 ? Math.min(...numbers) : null;
            }
            break;

          case 'max':
            if (agg.field) {
              result[alias] = numbers.length > 0 ? Math.max(...numbers) : null;
            }
            break;
        }
      }

      results.push(result);
    }

    // TODO having

    // Apply ordering
    if (orderBy?.length) {
      results.sort((a, b) => {
        for (const order of orderBy) {
          const aVal = a[order.field];
          const bVal = b[order.field];

          if (aVal < bVal) return order.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return order.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return { results };
  },
  render: (op, config) => {
    const type = getType(config, op.input.name);
    const where = op.input.where ? `where=${whereString(op.input.where)}` : ''
    const having = op.input.having ? `having=${whereString(op.input.having)}` : ''
    const groupBy = op.input.groupBy ? `groupBy=${op.input.groupBy.join(',')}` : ''
    const orderBy = op.input.orderBy ? `orderBy=${op.input.orderBy.map(o => o.field).join(',')}` : ''
    const select = 'select=' + op.input.select.map(s => s.function + (s.field ? `(${s.field})` : '')).join(',');
    const params = [where, having, groupBy, orderBy, select].filter(p => p).join(', ');
    
    return renderOperation(
      op,
      `${formatName(type.friendlyName)}Aggregate(${params})`,
      (op) => {
        if (op.output?.results) {
          const resultCount = op.output.results.length;
          const aggregations = op.input.select?.map((s: any) => s.function).join(', ') || 'aggregation';
          return `${resultCount} result${resultCount !== 1 ? 's' : ''} (${aggregations})`;
        }
        return null;
      }
    );
  },
});

export const data_index = operationOf<
  { name: string },
  { libraryKnowledgeUpdated: boolean }
>({
  mode: 'update',
  status: ({ name }) => `Indexing ${name}`,
  analyze: async ({ name }, { config }) => {
    const type = getType(config, name);
    
    return {
      analysis: `This will update the knowledge for type "${type.friendlyName}".`,
      doable: true,
    };
  },
  do: async ({ name }, ctx) => {
    const dataManager = new DataManager(name);
    await dataManager.load();

    const allRecords = dataManager.getAll();
    const recordIds = allRecords.map(r => r.id);

    const libraryKnowledgeUpdated = await updateKnowledge(ctx, name, recordIds, []);

    return { libraryKnowledgeUpdated };
  },
  render: (op, config) => {
    const type = getType(config, op.input.name);
    return renderOperation(
      op,
      `${formatName(type.friendlyName)}Index()`,
      (op) => {
        if (op.output?.libraryKnowledgeUpdated) {
          return `Knowledge updated for type: ${type.friendlyName}`;
        }
        return null;
      },
    );
  },
});

export const data_import = operationOf<
  { name: string; glob: string; transcribeImages?: boolean },
  { imported: number; updated: number; skipped: number; libraryKnowledgeUpdated: boolean }
>({
  mode: 'create',
  status: ({ name, glob }) => `Importing ${name} from ${glob}`,
  analyze: async ({ name, glob }, { config, cwd }) => {
    const type = getType(config, name);
    const files = await searchFiles(cwd, glob);
    
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
    };
  },
  do: async ({ name, glob, transcribeImages = false }, ctx) => {
    const { chatStatus, ai, config, cwd, log } = ctx;
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();
    
    // Find and filter files
    const files = await searchFiles(cwd, glob);
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
    
    chatStatus(`Found ${importableFiles.length} files to process`);
    
    // Build zod schema for extraction
    const recordSchema = buildFieldsSchema(type);
    const arraySchema = z.array(recordSchema) as z.ZodType<object, object>;
    
    let allExtractedRecords: Record<string, any>[] = [];
    
    // Process files in parallel
    let filesProcessed = 0;
    await Promise.allSettled(importableFiles.map(async (file) => {
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
          transcriber: (image) => transcribe(ai, image),
        });
        
        filesProcessed++;
        chatStatus(`Processing file ${filesProcessed}/${importableFiles.length}: ${file.file}`);
        
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
        for (const group of sectionGroups) {
          try {
            const extracted = await extractDataFromText(ai, config, type, arraySchema, group);
            allExtractedRecords.push(...extracted);
          } catch (error) {
            log(`Warning: Failed to extract from section group in ${file.file}: ${(error as Error).message}`);
          }
        }
      } catch (error) {
        log(`Warning: Failed to process file ${file.file}: ${(error as Error).message}`);
      }
    }));
    
    chatStatus(`Extracted ${allExtractedRecords.length} potential records`);
    
    // Get sample records for uniqueness determination
    const sampleSize = Math.min(10, allExtractedRecords.length);
    const sampleRecords = allExtractedRecords.slice(0, sampleSize);
    
    // Ask AI to determine unique fields
    let uniqueFields: string[] = [];
    if (allExtractedRecords.length > 0) {
      chatStatus('Determining unique fields...');
      uniqueFields = await determineUniqueFields(ai, config, type, sampleRecords);
    }
    
    chatStatus(`Using unique fields: ${uniqueFields.length > 0 ? uniqueFields.join(', ') : 'none (all records will be imported)'}`);
    
    // Merge data based on unique fields
    const existingRecords = dataManager.getAll();
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const updatedIds: string[] = [];
    
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
            skipped++;
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
        
        // Update progress periodically
        const total = imported + updated + skipped;
        if (total % 10 === 0) {
          chatStatus(`Progress: ${total}/${allExtractedRecords.length} records processed`);
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
    
    return { imported, updated, skipped, libraryKnowledgeUpdated };
  },
  render: (op, config) => {
    const type = getType(config, op.input.name);
    return renderOperation(
      op,
      `${formatName(type.friendlyName)}Import("${op.input.glob}")`,
      (op) => {
        if (op.output) {
          return `Imported ${op.output.imported} new, updated ${op.output.updated}, skipped ${op.output.skipped} duplicate(s)`;
        }
        return null;
      },
    );
  },
});

export const data_search = operationOf<
  { name: string; query: string; n?: number },
  { query: string; results: Array<{ source: string; text: string; similarity: number }> }
>({
  mode: 'read',
  status: ({ name, query }) => `Searching ${name}: ${abbreviate(query, 25)}`,
  analyze: async ({ name, query, n }, { config }) => {
    const type = getType(config, name);
    const limit = n || 10;
    return {
      analysis: `This will search ${type.friendlyName} knowledge for "${query}", returning up to ${limit} results.`,
      doable: true,
    };
  },
  do: async ({ name, query, n }, { ai }) => {
    const knowledge = new KnowledgeFile();
    await knowledge.load();

    const limit = n || 10;
    
    // Generate embedding for query
    const embeddingResult = await ai.embed.get({ texts: [query] });
    const modelId = getModel(embeddingResult.model).id;
    const queryVector = embeddingResult.embeddings[0].embedding;

    // Search for similar entries with source prefix matching the type name
    const sourcePrefix = `${name}:`;
    const similarEntries = knowledge.searchBySimilarity(modelId, queryVector, limit, sourcePrefix);

    return {
      query,
      results: similarEntries.map((result) => ({
        source: result.entry.source,
        text: result.entry.text,
        similarity: result.similarity,
      })),
    };
  },
  render: (op, config) => {
    const type = getType(config, op.input.name);
    return renderOperation(
      op,
      `${formatName(type.friendlyName)}Search("${abbreviate(op.input.query, 20)}")`,
      (op) => {
        if (op.output) {
          const count = op.output.results.length;
          return `Found ${count} result${count !== 1 ? 's' : ''}`;
        }
        return null;
      }
    );
  },
});

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

  const dataFile = new DataManager(type.name);
  await dataFile.load();
  
  const typeTemplate = type.knowledgeTemplate ? Handlebars.compile(type.knowledgeTemplate) : () => '';
  const updateTemplates = update
    .map(id => {
      const record = dataFile.getById(id);
      if (record) {
        return { id, text: typeTemplate(record.fields) };
      }
      return null;
    })
    .filter(t => t !== null && t.text.trim().length > 0) as { id: string; text: string }[];

  const knowledge: KnowledgeEntry[] = [];
  const templateChunks = chunkArray(updateTemplates, CONSTS.EMBED_CHUNK_SIZE);

  let embeddingModel: string | null = null;

  await Promise.all(templateChunks.map(async (records) => {
    const texts = records.map(r => r.text);
    const { embeddings, model } = await ctx.ai.embed.get({ texts });
    embeddings.forEach(({ embedding: vector, index }, i) => {
      knowledge.push({
        source: `${typeName}:${records[index].id}`,
        text: texts[index],
        vector: vector,
        created: Date.now()
      });
    });
    embeddingModel = getModel(model).id;
  }));

  const removing = new Set(remove.map(id => `${typeName}:${id}`));

  const knowledgeFile = new KnowledgeFile();
  await knowledgeFile.load();
  await knowledgeFile.save(async (data) => {
    // Do delete first, check all models.
    for (const [model, entries] of Object.entries(data.knowledge)) {
      data.knowledge[model] = entries.filter(e => !removing.has(e.source));
    }
    // Do update/insert
    if (embeddingModel) {
      let entryList = data.knowledge[embeddingModel];
      if (!entryList) {
        entryList = data.knowledge[embeddingModel] = [];
      }
      for (const entry of knowledge) {
        const existing = entryList.find(e => e.source === entry.source);
        if (existing) {
          existing.updated = Date.now();
          existing.text = entry.text;
          existing.vector = entry.vector;
        } else {
          entryList.push(entry);
        }
      }
    }
  });

  return true;
} 

function valueString(value: FieldCondition[keyof FieldCondition]): string {
  if (Array.isArray(value)) {
    return `(${value.map(v => typeof v === 'string' ? `"${v}"` : `${v}`).join(', ')})`;
  } else {
    return typeof value === 'string' ? `"${value}"` : `${value}`;
  }
}

function whereString(where: WhereClause | undefined): string {
  if (!where) {
    return '';
  }

  const conditions: string[] = [];
  for (const [field, condition] of Object.entries(where)) {
    switch (field) {
      case 'and':
      case 'or':
        const subConditions = (condition as WhereClause[]).map(subWhere => whereString(subWhere));
        conditions.push(`(${subConditions.join(` ${field.toUpperCase()} `)})`);
        break;
      case 'not':
        conditions.push(`NOT (${whereString(condition as WhereClause)})`);
        break;
      default:
        const fieldCondition = condition as FieldCondition;
        for (const [op, value] of Object.entries(fieldCondition)) {
          conditions.push(`${field} ${OPERATOR_MAP[op]} ${valueString(value)}`);
        }
        break;
    }
  }

  return conditions.length > 1
   ? `(${conditions.join(' AND ')})`
   : conditions[0];
}

const OPERATOR_MAP: Record<string, string> = {
  equals: "=",
  contains: " CONTAINS ",
  startsWith: " STARTS WITH ",
  endsWith: " ENDS WITH ", 
  lt: "<",
  lte: "≤",
  gt: ">",
  gte: "≥",
  before: "≤",
  after: "≥",
  oneOf: " ONE OF ",
  isEmpty: "IS EMPTY",
};

/**
 * Extract data records from text using AI with structured output
 */
async function extractDataFromText(
  ai: CletusAIContext['ai'],
  config: ConfigFile,
  type: TypeDefinition,
  arraySchema: z.ZodType<object, object>,
  text: string
): Promise<Record<string, any>[]> {
  const models = config.getData().user.models;
  const model = models?.chat;
  
  const fieldDescriptions = type.fields.map(field => {
    let desc = `- ${field.name} (${field.type})`;
    if (field.required) desc += ' [required]';
    if (field.enumOptions) desc += ` [options: ${field.enumOptions.join(', ')}]`;
    if (field.default !== undefined) desc += ` [default: ${field.default}]`;
    return desc;
  }).join('\n');
  
  const prompt = `Extract all instances of ${type.friendlyName} from the following text.

Type: ${type.friendlyName}
${type.description || ''}

Fields:
${fieldDescriptions}

Text:
${text}

Return an array of objects with the fields defined above. If no instances are found, return an empty array.`;
  
  try {
    const response = await ai.chat.get({
      model,
      messages: [
        { role: 'system', content: 'You are a data extraction assistant. Extract structured data from text.' },
        { role: 'user', content: prompt },
      ],
      responseFormat: arraySchema,
    });
    
    // Parse JSON from content
    const records = JSON.parse(response.content);
    
    if (!Array.isArray(records)) {
      return [];
    }
    
    return records;
  } catch (error) {
    // If structured output fails, return empty array
    return [];
  }
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
      responseFormat: z.array(z.string()),
    });
    
    // Parse JSON from content
    const fields = JSON.parse(response.content);
    
    if (!Array.isArray(fields)) {
      return [];
    }
    
    // Validate that all fields exist in the type
    const validFields = fields.filter(field => 
      type.fields.some(f => f.name === field)
    );
    
    return validFields;
  } catch (error) {
    return [];
  }
}
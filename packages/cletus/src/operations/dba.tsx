import Handlebars from "handlebars";
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { CletusAIContext, transcribe } from "../ai";
import { abbreviate, formatName, groupMap, pluralize } from "../common";
import { ConfigFile } from "../config";
import { CONSTS } from "../constants";
import { DataManager } from "../data";
import { canEmbed, embed } from "../embed";
import { getAssetPath } from "../file-manager";
import { FieldCondition, WhereClause, countByWhere, filterByWhere } from "../helpers/data";
import { processFile, searchFiles } from "../helpers/files";
import { renderOperation } from "../helpers/render";
import { buildFieldsSchema } from "../helpers/type";
import { KnowledgeFile } from "../knowledge";
import { KnowledgeEntry, TypeDefinition, TypeField } from "../schemas";
import { operationOf } from "./types";


function getType(config: ConfigFile, typeName: string, optional?: false): TypeDefinition
function getType(config: ConfigFile, typeName: string, optional: true): TypeDefinition | undefined
function getType(config: ConfigFile, typeName: string, optional: boolean = false): TypeDefinition | undefined {
  const type = config.getData().types.find((t) => t.name === typeName);
  if (!type && !optional) {
    throw new Error(`Data type not found: ${typeName}`);
  }
  return type;
}

function getTypeName(config: ConfigFile, typeName: string): string {
  return getType(config, typeName, true)?.friendlyName || typeName;
}

/**
 * Check if a field type is a reference to another type
 */
function isReferenceType(fieldType: string, config: ConfigFile): boolean {
  const primitiveTypes = ['string', 'number', 'boolean', 'date', 'enum'];
  if (primitiveTypes.includes(fieldType)) {
    return false;
  }
  // Check if it's an existing type
  return config.getData().types.some(t => t.name === fieldType);
}

/**
 * Validate that related field values are valid instance IDs
 * Optimized to minimize DataManager loads by loading each unique reference type once
 */
async function validateRelatedFields(
  fields: Record<string, any>,
  type: TypeDefinition,
  config: ConfigFile
): Promise<void> {
  // Find all reference fields being set
  const referenceFields = type.fields.filter(f => 
    f.name in fields && isReferenceType(f.type, config)
  );
  
  if (referenceFields.length === 0) {
    return;
  }

  // Group reference fields by type to minimize data manager loads
  const refTypeMap = new Map<string, TypeField[]>();
  for (const field of referenceFields) {
    if (!refTypeMap.has(field.type)) {
      refTypeMap.set(field.type, []);
    }
    refTypeMap.get(field.type)!.push(field);
  }

  // Load all unique reference types in parallel and validate
  await Promise.all(
    Array.from(refTypeMap.entries()).map(async ([refTypeName, refFields]) => {
      const refType = getType(config, refTypeName);
      const refDataManager = new DataManager(refTypeName);
      await refDataManager.load();
      
      // Create a set of all valid IDs for quick lookup
      const validIds = new Set(refDataManager.getAll().map(r => r.id));
      
      // Validate each field referencing this type
      for (const field of refFields) {
        const refId = fields[field.name];
        
        // Skip if field is null/undefined/empty (these are allowed for non-required fields)
        if (refId === null || refId === undefined || refId === '') {
          continue;
        }
        
        // Check if the reference ID is valid
        if (!validIds.has(refId as string)) {
          throw new Error(
            `Invalid reference: field "${field.friendlyName}" references ${refType.friendlyName} with ID "${refId}", but no such record exists`
          );
        }
      }
    })
  );
}

/**
 * Join related records for reference fields
 * Optimized to minimize DataManager loads by loading each unique reference type once
 */
async function joinRelatedRecords(
  records: any[],
  type: TypeDefinition,
  config: ConfigFile,
  depth: number = 0,
  maxDepth: number = 3
): Promise<any[]> {
  // Prevent infinite recursion
  if (depth >= maxDepth || records.length === 0) {
    return records;
  }

  // Find all reference fields
  const referenceFields = type.fields.filter(f => isReferenceType(f.type, config));
  
  if (referenceFields.length === 0) {
    return records;
  }

  // Group reference fields by type to minimize data manager loads
  const refTypeMap = new Map<string, TypeField[]>();
  for (const field of referenceFields) {
    if (!refTypeMap.has(field.type)) {
      refTypeMap.set(field.type, []);
    }
    refTypeMap.get(field.type)!.push(field);
  }

  // Load all unique reference types in parallel
  const refDataMap = new Map<string, { type: TypeDefinition; manager: DataManager; records: Map<string, any> }>();
  
  await Promise.all(
    Array.from(refTypeMap.keys()).map(async (refTypeName) => {
      try {
        const refType = getType(config, refTypeName);
        const refDataManager = new DataManager(refTypeName);
        await refDataManager.load();
        
        // Create a map of all records for quick lookup
        const recordsMap = new Map<string, any>();
        for (const record of refDataManager.getAll()) {
          recordsMap.set(record.id, record);
        }
        
        refDataMap.set(refTypeName, {
          type: refType,
          manager: refDataManager,
          records: recordsMap,
        });
      } catch (error) {
        // If we can't load the reference type, skip it
      }
    })
  );

  // Now join all records
  const joinedRecords = records.map((record) => {
    const joinedRecord = { ...record, fields: { ...record.fields } };

    // Process each reference field
    for (const field of referenceFields) {
      const refId = record.fields[field.name];
      
      // Skip if field is null/undefined
      if (refId === null || refId === undefined || refId === '') {
        continue;
      }

      const refData = refDataMap.get(field.type);
      if (refData) {
        const refRecord = refData.records.get(refId as string);
        if (refRecord) {
          // Store for recursive joining
          joinedRecord.fields[field.name] = refRecord;
        }
      }
    }

    return joinedRecord;
  });

  // Recursively join nested references for each unique reference type
  for (const [refTypeName, refData] of refDataMap.entries()) {
    // Collect all unique referenced records that need recursive joining
    const recordsToJoin = new Set<any>();
    
    for (const record of joinedRecords) {
      const fields = refTypeMap.get(refTypeName)!;
      for (const field of fields) {
        const refRecord = record.fields[field.name];
        if (refRecord && typeof refRecord === 'object' && refRecord.id) {
          recordsToJoin.add(refRecord);
        }
      }
    }
    
    if (recordsToJoin.size > 0) {
      // Recursively join nested references
      const nestedJoined = await joinRelatedRecords(
        Array.from(recordsToJoin),
        refData.type,
        config,
        depth + 1,
        maxDepth
      );
      
      // Create a map for quick lookup
      const nestedMap = new Map<string, any>();
      for (const nested of nestedJoined) {
        nestedMap.set(nested.id, nested);
      }
      
      // Update the records with nested joins
      for (const record of joinedRecords) {
        const fields = refTypeMap.get(refTypeName)!;
        for (const field of fields) {
          const refRecord = record.fields[field.name];
          if (refRecord && typeof refRecord === 'object' && refRecord.id) {
            const nestedRecord = nestedMap.get(refRecord.id);
            if (nestedRecord) {
              record.fields[field.name] = nestedRecord;
            }
          }
        }
      }
    }
  }

  return joinedRecords;
}

/**
 * Find all records that reference specific records
 * Optimized to minimize DataManager loads by batching operations
 */
async function findReferencingRecords(
  targetTypeName: string,
  targetRecordIds: string[],
  config: ConfigFile
): Promise<Array<{ typeName: string; records: any[]; field: TypeField; targetRecordId: string }>> {
  const allTypes = config.getData().types;
  const referencingData: Array<{ typeName: string; records: any[]; field: TypeField; targetRecordId: string }> = [];

  // Find all types that have fields referencing the target type
  const typesWithReferences = allTypes.filter(type => 
    type.fields.some(f => f.type === targetTypeName)
  );

  // Load data managers for all referencing types at once
  const typeDataMap = new Map<string, { type: TypeDefinition; records: any[] }>();
  
  await Promise.all(
    typesWithReferences.map(async (type) => {
      const dataManager = new DataManager(type.name);
      await dataManager.load();
      typeDataMap.set(type.name, {
        type,
        records: dataManager.getAll(),
      });
    })
  );

  // Now find all matching records
  for (const [typeName, { type, records }] of typeDataMap.entries()) {
    const referenceFields = type.fields.filter(f => f.type === targetTypeName);
    
    for (const field of referenceFields) {
      for (const targetRecordId of targetRecordIds) {
        const matchingRecords = records.filter(r => 
          r.fields[field.name] === targetRecordId
        );
        
        if (matchingRecords.length > 0) {
          referencingData.push({
            typeName,
            records: matchingRecords,
            field,
            targetRecordId,
          });
        }
      }
    }
  }

  return referencingData;
}

/**
 * Handle cascade delete logic for a set of records
 * Returns statistics about cascaded deletes and setNull updates
 * Optimized to minimize DataManager loads by batching operations
 */
async function handleCascadeDeletes(
  typeName: string,
  recordIds: string[],
  config: ConfigFile,
  ctx: CletusAIContext
): Promise<{
  cascadedDeletes: number;
  setNullUpdates: number;
  deletedIds: string[];
  updatedIds: string[];
}> {
  let cascadedDeletes = 0;
  let setNullUpdates = 0;
  const deletedIds: string[] = [];
  const updatedIds: string[] = [];

  // Find all referencing records for all target records at once
  const referencingData = await findReferencingRecords(typeName, recordIds, config);
  
  // Group referencing data by type and field to minimize data manager loads
  const refTypeGroups = new Map<string, Map<string, Array<{ records: any[]; field: TypeField }>>>();
  
  for (const { typeName: refTypeName, records, field, targetRecordId } of referencingData) {
    if (!refTypeGroups.has(refTypeName)) {
      refTypeGroups.set(refTypeName, new Map());
    }
    const fieldMap = refTypeGroups.get(refTypeName)!;
    const fieldKey = `${field.name}:${field.onDelete || 'restrict'}`;
    
    if (!fieldMap.has(fieldKey)) {
      fieldMap.set(fieldKey, []);
    }
    fieldMap.get(fieldKey)!.push({ records, field });
  }
  
  // Process each referencing type - load data manager once per type
  for (const [refTypeName, fieldMap] of refTypeGroups.entries()) {
    const refDataManager = new DataManager(refTypeName);
    await refDataManager.load();
    
    for (const [fieldKey, groups] of fieldMap.entries()) {
      const field = groups[0].field;
      const onDelete = field.onDelete || 'restrict';
      
      // Collect all unique records to process
      const recordsToProcess = new Map<string, any>();
      for (const { records } of groups) {
        for (const record of records) {
          recordsToProcess.set(record.id, record);
        }
      }
      const uniqueRecords = Array.from(recordsToProcess.values());
      
      if (onDelete === 'restrict') {
        const refType = getType(config, refTypeName);
        throw new Error(`Cannot delete record - ${refType.friendlyName} has ${uniqueRecords.length} referencing record(s) with onDelete=restrict`);
      } else if (onDelete === 'cascade') {
        // Delete all referencing records
        for (const refRecord of uniqueRecords) {
          await refDataManager.delete(refRecord.id);
          deletedIds.push(`${refTypeName}:${refRecord.id}`);
          cascadedDeletes++;
        }
      } else if (onDelete === 'setNull') {
        // Set the reference field to null
        for (const refRecord of uniqueRecords) {
          await refDataManager.update(refRecord.id, { [field.name]: null });
          updatedIds.push(`${refTypeName}:${refRecord.id}`);
          setNullUpdates++;
        }
      }
    }
  }

  // Group deleted and updated IDs by ref type name for batch knowledge update
  const deletedByType = groupMap(deletedIds, id => id.split(':')[0], id => id.split(':')[1]);
  const updatedByType = groupMap(updatedIds, id => id.split(':')[0], id => id.split(':')[1]);
  
  // Batch update knowledge base by type
  for (const [refTypeName, recordIds] of deletedByType.entries()) {
    try {
      await updateKnowledge(ctx, refTypeName, [], recordIds);
    } catch (e) {
      ctx.log(`Warning: failed to update knowledge base for deleted records in ${refTypeName}: ${(e as Error).message}`);
    }
  }
  
  for (const [refTypeName, recordIds] of updatedByType.entries()) {
    try {
      await updateKnowledge(ctx, refTypeName, recordIds, []);
    } catch (e) {
      ctx.log(`Warning: failed to update knowledge base for updated records in ${refTypeName}: ${(e as Error).message}`);
    }
  }

  return { cascadedDeletes, setNullUpdates, deletedIds, updatedIds };
}


export const data_create = operationOf<
  { name: string; fields: Record<string, any> },
  { id: string; libraryKnowledgeUpdated: boolean },
  {},
  { typeName: string }
>({
  mode: 'create',
  signature: 'data_create(fields)',
  status: ({ name }) => `Creating ${name} record`,
  analyze: async ({ input: { name, fields } }, { config })=> {
    const type = getType(config, name);
    const fieldNames = Object.keys(fields);
    return {
      analysis: `This will create a new ${type.friendlyName} record with fields: ${fieldNames.join(', ')}.`,
      doable: true,
      cache: { typeName: type.friendlyName },
    };
  },
  do: async ({ input: { name, fields }, cache }, ctx) => {
    const type = getType(ctx.config, name);
    const typeName = cache?.typeName ?? type.friendlyName;
    
    // Validate related field values
    await validateRelatedFields(fields, type, ctx.config);
    
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

    return {
      output: { id, libraryKnowledgeUpdated },
      cache: { typeName },
    };
  },
  render: (op, ai, showInput, showOutput) => {
    // Use cached typeName for consistent rendering even if type is deleted
    const typeName = op.cache?.typeName ?? getTypeName(ai.config.defaultContext!.config!, op.input.name);
    const firstField = Object.keys(op.input.fields)[0];
    const additionalCount = Object.keys(op.input.fields).length - 1;
    const more = additionalCount > 0 ? `, +${additionalCount} more` : '';
    
    return renderOperation(
      op,
      `${formatName(typeName)}Create("${op.input.fields[firstField]}"${more})`,
      (op) => {
        if (op.output) {
          return `Created record ID: ${op.output.id}`;
        }
        return null;
      },
      showInput, showOutput
    );
  },
});

export const data_update = operationOf<
  { name: string; id: string; fields: { field: string, value: any }[] },
  { updated: boolean, libraryKnowledgeUpdated: boolean },
  {},
  { typeName: string; fieldNames: string[] }
>({
  mode: 'update',
  signature: 'data_update(id: string, fields)',
  status: ({ name, id }) => `Updating ${name}: ${id.slice(0, 8)}`,
  analyze: async ({ input: { name, id, fields } }, { config }) => {
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

    const fieldNames = fields.map(f => {
      const field = type.fields.find(tf => tf.name === f.field);
      return field?.friendlyName || f.field;
    });
    return {
      analysis: `This will update ${type.friendlyName} record "${id}" with fields: ${fieldNames.join(', ')}.`,
      doable: true,
      cache: { typeName: type.friendlyName, fieldNames },
    };
  },
  do: async ({ input: { name, id, fields }, cache }, ctx) => {
    const type = getType(ctx.config, name);
    const typeName = cache?.typeName ?? type.friendlyName;
    const fieldNames = cache?.fieldNames ?? fields.map(f => f.field);

    // Verify record still exists
    const dataManager = new DataManager(name);
    await dataManager.load();
    const record = dataManager.getById(id);
    if (!record) {
      throw new Error(`Record "${id}" no longer exists. State has changed since analysis.`);
    }

    const updates = Object.fromEntries(fields.map(f => [f.field, f.value]));
    
    // Validate related field values
    await validateRelatedFields(updates, type, ctx.config);

    await dataManager.update(id, updates);

    // Update knowledge base
    let libraryKnowledgeUpdated = true;
    try {
      libraryKnowledgeUpdated = await updateKnowledge(ctx, name, [id], []); 
    } catch (e) {
      ctx.log(`Warning: failed to update knowledge base after updating record: ${(e as Error).message}`);
      libraryKnowledgeUpdated = false;
    }

    return {
      output: { updated: true, libraryKnowledgeUpdated },
      cache: { typeName, fieldNames },
    };
  },
  render: (op, ai, showInput, showOutput) => {
    // Use cached typeName for consistent rendering even if type is deleted
    const typeName = op.cache?.typeName ?? getTypeName(ai.config.defaultContext!.config!, op.input.name);
    const fieldNames = op.cache?.fieldNames ?? op.input.fields.map(f => f.field);
    
    return renderOperation(
      op,
      `${formatName(typeName)}Update(${fieldNames.map(f => `"${f}"`).join(', ')})`,
      (op) => {
        if (op.output?.updated) {
          return `Updated record ID: ${op.input.id}`;
        }
        return null;
      },
      showInput, showOutput
    );
  },
});

export const data_delete = operationOf<
  { name: string; id: string },
  { deleted: boolean, libraryKnowledgeUpdated: boolean; cascadedDeletes?: number; setNullUpdates?: number },
  {},
  { typeName: string }
>({
  mode: 'delete',
  signature: 'data_delete(id: string)',
  status: ({ name, id }) => `Deleting ${name}: ${id.slice(0, 8)}`,
  analyze: async ({ input: { name, id } }, { config }) => {
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

    // Check for referencing records
    const referencingData = await findReferencingRecords(name, [id], config);
    
    if (referencingData.length > 0) {
      const restrictions: string[] = [];
      const cascades: string[] = [];
      const setNulls: string[] = [];
      
      for (const { typeName, records, field } of referencingData) {
        const refType = getType(config, typeName);
        const onDelete = field.onDelete || 'restrict';
        const count = records.length;
        
        if (onDelete === 'restrict') {
          restrictions.push(`${refType.friendlyName} (${pluralize(count, 'record')})`);
        } else if (onDelete === 'cascade') {
          cascades.push(`${refType.friendlyName} (${pluralize(count, 'record')})`);
        } else if (onDelete === 'setNull') {
          setNulls.push(`${refType.friendlyName} (${pluralize(count, 'record')})`);
        }
      }
      
      if (restrictions.length > 0) {
        return {
          analysis: `This would fail - ${type.friendlyName} record "${id}" is referenced by: ${restrictions.join(', ')}. These fields have onDelete=restrict.`,
          doable: false,
          cache: { typeName: type.friendlyName },
        };
      }
      
      let analysis = `This will delete ${type.friendlyName} record "${id}".`;
      if (cascades.length > 0) {
        analysis += ` Will cascade delete: ${cascades.join(', ')}.`;
      }
      if (setNulls.length > 0) {
        analysis += ` Will set null in: ${setNulls.join(', ')}.`;
      }
      
      return { analysis, doable: true, cache: { typeName: type.friendlyName } };
    }

    return {
      analysis: `This will delete ${type.friendlyName} record "${id}".`,
      doable: true,
      cache: { typeName: type.friendlyName },
    };
  },
  do: async ({ input: { name, id }, cache }, ctx) => {
    const { config } = ctx;
    const typeName = cache?.typeName ?? getTypeName(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();

    // Verify record still exists
    const record = dataManager.getById(id);
    if (!record) {
      throw new Error(`Record "${id}" no longer exists. State has changed since analysis.`);
    }
    
    // Handle cascade deletes using reusable function
    const { cascadedDeletes, setNullUpdates } = await handleCascadeDeletes(name, [id], config, ctx);
    
    // Delete the target record
    await dataManager.delete(id);

    // Update knowledge base for the deleted record
    let libraryKnowledgeUpdated = true;
    try {
      libraryKnowledgeUpdated = await updateKnowledge(ctx, name, [], [id]);
    } catch (e) {
      ctx.log(`Warning: failed to update knowledge base after deleting record: ${(e as Error).message}`);
      libraryKnowledgeUpdated = false;
    }

    return {
      output: { 
        deleted: true, 
        libraryKnowledgeUpdated,
        cascadedDeletes: cascadedDeletes > 0 ? cascadedDeletes : undefined,
        setNullUpdates: setNullUpdates > 0 ? setNullUpdates : undefined,
      },
      cache: { typeName },
    };
  },
  render: (op, ai, showInput, showOutput) => {
    // Use cached typeName for consistent rendering even if type is deleted
    const typeName = op.cache?.typeName ?? getTypeName(ai.config.defaultContext!.config!, op.input.name);

    return renderOperation(
      op,
      `${formatName(typeName)}Delete("${op.input.id.slice(0, 8)}")`,
      (op) => {
        if (op.output?.deleted) {
          let msg = `Deleted record ID: ${op.input.id}`;
          if (op.output.cascadedDeletes) {
            msg += `, cascaded ${pluralize(op.output.cascadedDeletes, 'record')}`;
          }
          if (op.output.setNullUpdates) {
            msg += `, set null in ${pluralize(op.output.setNullUpdates, 'record')}`;
          }
          return msg;
        }
        return null;
      },
      showInput, showOutput
    );
  },
});

export const data_select = operationOf<
  { name: string; where?: WhereClause; offset?: number; limit?: number; orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }> },
  { count: number; results: any[] },
  {},
  { typeName: string; matchingCount: number }
>({
  mode: 'local',
  signature: 'data_select(where?, offset?, limit?, orderBy?)',
  status: ({ name }) => `Selecting ${name} records`,
  analyze: async ({ input: { name, where, offset, limit, orderBy } }, { config }) => {
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
      cache: { typeName: type.friendlyName, matchingCount: records.length },
    };
  },
  do: async ({ input: { name, where, offset, limit, orderBy } }, ctx) => {
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
    
    // Slice before joining to avoid loading unnecessary records
    const slicedResults = results.slice(recordOffset, recordOffset + recordLimit);

    // Join related records for reference fields
    const type = getType(ctx.config, name);
    const joinedResults = await joinRelatedRecords(slicedResults, type, ctx.config);

    return {
      count: results.length,
      results: joinedResults,
    };
  },
  render: (op, ai, showInput, showOutput) => {
    // Use cached typeName for consistent rendering even if type is deleted
    const typeName = op.cache?.typeName ?? getTypeName(ai.config.defaultContext!.config!, op.input.name);
    const where = op.input.where ? `where=${whereString(op.input.where)}` : ''
    const limit = op.input.limit ? `limit=${op.input.limit}` : '';
    const offset = op.input.offset ? `offset=${op.input.offset}` : '';
    const orderBy = op.input.orderBy ? `orderBy=${op.input.orderBy.map(o => o.field).join(',')}` : '';
    const params = [where, limit, offset, orderBy].filter(p => p).join(', ');

    return renderOperation(
      op,
      `${formatName(typeName)}Select(${params})`,
      (op) => {
        const count = op.output?.count ?? op.cache?.matchingCount;
        if (op.output) {
          return `Returned ${op.output.results.length} of ${count} record(s)`;
        } else if (count !== undefined) {
          return `Will return from ${count} matching record(s)`;
        }
        return null;
      },
      showInput, showOutput
    );
  },
});

export const data_update_many = operationOf<
  { name: string; set: { field: string, value: any }[]; where?: WhereClause; limit?: number },
  { updated: number, libraryKnowledgeUpdated: boolean },
  {},
  { typeName: string; matchingCount: number }
>({
  mode: 'update',
  signature: 'data_update_many(set, where, limit?)',
  status: ({ name }) => `Updating multiple ${name} records`,
  analyze: async ({ input: { name, limit, set, where } }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();

    const matchingCount = where ? countByWhere(dataManager.getAll(), where) : dataManager.getAll().length;
    const actualCount = limit ? Math.min(matchingCount, limit) : matchingCount;

    const setFields = set.map(f => f.field);
    const limitText = limit ? ` (limited to ${limit})` : '';
    return {
      analysis: `This will bulk update ${pluralize(actualCount, `${type.friendlyName} record`)} matching criteria${limitText}, setting: ${setFields.join(', ')}.`,
      doable: true,
      cache: { typeName: type.friendlyName, matchingCount: actualCount },
    };
  },
  do: async ({ input: { name, limit, set, where }, cache }, ctx) => {
    const type = getType(ctx.config, name);
    const typeName = cache?.typeName ?? type.friendlyName;
    const updates = Object.fromEntries(set.map(f => [f.field, f.value]));
    
    // Validate related field values
    await validateRelatedFields(updates, type, ctx.config);
    
    const dataManager = new DataManager(name);
    await dataManager.load();

    const records = dataManager.getAll();
    let matchingRecords = where ? filterByWhere(records, where) : records;

    // Apply limit if specified
    if (limit) {
      matchingRecords = matchingRecords.slice(0, limit);
    }

    // Update all matching records
    await Promise.all(matchingRecords.map((record) =>
      dataManager.update(record.id, updates)
    ));

    // Update knowledge base
    let libraryKnowledgeUpdated = true;
    try {
      libraryKnowledgeUpdated = await updateKnowledge(ctx, name, matchingRecords.map(r => r.id), []); 
    } catch (e) {
      ctx.log(`Warning: failed to update knowledge base after updating records: ${(e as Error).message}`);
      libraryKnowledgeUpdated = false;
    }

    return {
      output: { updated: matchingRecords.length, libraryKnowledgeUpdated },
      cache: { typeName, matchingCount: matchingRecords.length },
    };
  },
  render: (op, ai, showInput, showOutput) => {
    // Use cached typeName for consistent rendering even if type is deleted
    const typeName = op.cache?.typeName ?? getTypeName(ai.config.defaultContext!.config!, op.input.name);
    const set = 'set=' + op.input.set.map(f => f.field).join(',');
    const where = op.input.where ? `where=${whereString(op.input.where)}` : ''
    const limit = op.input.limit ? `limit=${op.input.limit}` : '';
    const params = [set, where, limit].filter(p => p).join(', ');

    return renderOperation(
      op,
      `${formatName(typeName)}UpdateMany(${params})`,
      (op) => {
        const count = op.output?.updated ?? op.cache?.matchingCount;
        if (count !== undefined) {
          return op.output
            ? `Updated ${pluralize(count, 'record')}`
            : `Will update ${pluralize(count, 'record')}`;
        }
        return null;
      },
      showInput, showOutput
    );
  },
});

export const data_delete_many = operationOf<
  { name: string; where: WhereClause; limit?: number },
  { deleted: number; libraryKnowledgeUpdated: boolean; cascadedDeletes?: number; setNullUpdates?: number },
  {},
  { typeName: string; matchingCount: number }
>({
  mode: 'delete',
  signature: 'data_delete_many(where, limit?)',
  status: ({ name }) => `Deleting multiple ${name} records`,
  analyze: async ({ input: { name, where, limit } }, { config }) => {
    const type = getType(config, name);
    
    const dataManager = new DataManager(name);
    await dataManager.load();

    const matchingCount = countByWhere(dataManager.getAll(), where);
    const actualCount = limit ? Math.min(matchingCount, limit) : matchingCount;

    const limitText = limit ? ` (limited to ${limit})` : '';
    return {
      analysis: `This will bulk delete ${pluralize(actualCount, `${type.friendlyName} record`)} matching the specified criteria${limitText}.`,
      doable: true,
      cache: { typeName: type.friendlyName, matchingCount: actualCount },
    };
  },
  do: async ({ input: { name, where, limit }, cache }, ctx) => {
    const { config } = ctx;
    const typeName = cache?.typeName ?? getTypeName(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();

    let matchingRecords = filterByWhere(dataManager.getAll(), where);

    // Apply limit if specified
    if (limit) {
      matchingRecords = matchingRecords.slice(0, limit);
    }
    
    // If no matching records, return early
    if (matchingRecords.length === 0) {
      return {
        output: { deleted: 0, libraryKnowledgeUpdated: false },
        cache: { typeName, matchingCount: 0 },
      };
    }

    // Handle cascade deletes for all matching records using reusable function
    const recordIds = matchingRecords.map(r => r.id);
    const { cascadedDeletes, setNullUpdates } = await handleCascadeDeletes(name, recordIds, config, ctx);

    // Delete all matching records
    await Promise.all(matchingRecords.map((record) =>
      dataManager.delete(record.id)
    ));

    // Also remove from knowledge base
    let libraryKnowledgeUpdated = true;
    try {
      await updateKnowledge(ctx, name, [], recordIds); 
    } catch (e) {
      ctx.log(`Warning: failed to update knowledge base after deleting records: ${(e as Error).message}`);
      libraryKnowledgeUpdated = false;
    }

    return {
      output: { 
        deleted: matchingRecords.length, 
        libraryKnowledgeUpdated,
        cascadedDeletes: cascadedDeletes > 0 ? cascadedDeletes : undefined,
        setNullUpdates: setNullUpdates > 0 ? setNullUpdates : undefined,
      },
      cache: { typeName, matchingCount: matchingRecords.length },
    };
  },
  render: (op, ai, showInput, showOutput) => {
    // Use cached typeName for consistent rendering even if type is deleted
    const typeName = op.cache?.typeName ?? getTypeName(ai.config.defaultContext!.config!, op.input.name);
    const where = op.input.where ? `where=${whereString(op.input.where)}` : ''
    const limit = op.input.limit ? `limit=${op.input.limit}` : '';
    const params = [where, limit].filter(p => p).join(', ');

    return renderOperation(
      op,
      `${formatName(typeName)}DeleteMany(${params})`,
      (op) => {
        const count = op.output?.deleted ?? op.cache?.matchingCount;
        if (count !== undefined) {
          let msg = op.output
            ? `Deleted ${pluralize(count, 'record')}`
            : `Will delete ${pluralize(count, 'record')}`;
          if (op.output?.cascadedDeletes) {
            msg += `, cascaded ${pluralize(op.output.cascadedDeletes, 'record')}`;
          }
          if (op.output?.setNullUpdates) {
            msg += `, set null in ${pluralize(op.output.setNullUpdates, 'record')}`;
          }
          return msg;
        }
        return null;
      },
      showInput, showOutput
    );
  },
});

export const data_count = operationOf<
  { name: string; where?: WhereClause },
  { count: number },
  {},
  { typeName: string; count: number }
>({
  mode: 'local',
  signature: 'data_count(where?)',
  status: ({ name }) => `Counting ${name} records`,
  analyze: async ({ input: { name, where } }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();
    let records = dataManager.getAll();
    if (where) {
      records = filterByWhere(records, where);
    } 
    return {
      analysis: `This will count ${records.length} ${type.friendlyName} record(s) matching the specified criteria.`,
      doable: true,
      cache: { typeName: type.friendlyName, count: records.length },
    };
  },
  do: async ({ input: { name, where }, cache }) => {
    // For local mode operations (read-only), use cached count if available.
    // This ensures consistency between analysis and execution, which is especially
    // important when the user has approved an operation based on the analysis.
    if (cache?.count !== undefined) {
      return { count: cache.count };
    }

    const dataManager = new DataManager(name);
    await dataManager.load();

    let records = dataManager.getAll();
    if (where) {
      records = filterByWhere(records, where);
    }
    return { count: records.length };
  },
  render: (op, ai, showInput, showOutput) => {
    // Use cached typeName for consistent rendering even if type is deleted
    const typeName = op.cache?.typeName ?? getTypeName(ai.config.defaultContext!.config!, op.input.name);
    const where = op.input.where ? `where=${whereString(op.input.where)}` : ''

    return renderOperation(
      op,
      `${formatName(typeName)}Count(${where})`,
      (op) => {
        const count = op.output?.count ?? op.cache?.count;
        if (count !== undefined) {
          return `Count: ${count}`;
        }
        return null;
      }
      , showInput, showOutput
    );
  },
});

export const data_aggregate = operationOf<
  {
    name: string;
    select: Array<{ function: 'count' | 'sum' | 'avg' | 'min' | 'max'; field?: string; alias?: string }>;
    where?: WhereClause;
    having?: WhereClause;
    groupBy?: string[];
    orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  },
  { results: any[] },
  {},
  { typeName: string; recordCount: number }
>({
  mode: 'local',
  signature: 'data_aggregate(select, where?, having?, groupBy?, orderBy?)',
  status: ({ name }) => `Aggregating ${name} records`,
  analyze: async ({ input: { name, where } }, { config }) => {
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
      cache: { typeName: type.friendlyName, recordCount: records.length },
    };
  },
  do: async ({ input: { name, where, having, groupBy, select, orderBy } }) => {
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
  render: (op, ai, showInput, showOutput) => {
    // Use cached typeName for consistent rendering even if type is deleted
    const typeName = op.cache?.typeName ?? getTypeName(ai.config.defaultContext!.config!, op.input.name);
    const where = op.input.where ? `where=${whereString(op.input.where)}` : ''
    const having = op.input.having ? `having=${whereString(op.input.having)}` : ''
    const groupBy = op.input.groupBy ? `groupBy=${op.input.groupBy.join(',')}` : ''
    const orderBy = op.input.orderBy ? `orderBy=${op.input.orderBy.map(o => o.field).join(',')}` : ''
    const select = 'select=' + op.input.select.map(s => s.function + (s.field ? `(${s.field})` : '')).join(',');
    const params = [where, having, groupBy, orderBy, select].filter(p => p).join(', ');
    
    return renderOperation(
      op,
      `${formatName(typeName)}Aggregate(${params})`,
      (op) => {
        if (op.output?.results) {
          const resultCount = op.output.results.length;
          const aggregations = op.input.select?.map((s: any) => s.function).join(', ') || 'aggregation';

          return `${pluralize(resultCount, 'result')} (${aggregations})`;
        }
        return null;
      },
      showInput, showOutput
    );
  },
});

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
  analyze: async ({ input: { name, glob } }, { config, cwd }) => {
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
      cache: { typeName: type.friendlyName, importableCount: importable.length },
    };
  },
  do: async ({ input: { name, glob, transcribeImages = false } }, ctx) => {
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
    if (!condition) {
      continue;
    }
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
          if (value === undefined) {
            continue;
          }
          conditions.push(`${field}${OPERATOR_MAP[op]}${valueString(value)}`);
        }
        break;
    }
  }

  const text = `(${conditions.join(' AND ')})`;
  return text.replace(/\s+/g, ' ').trim();
}

const OPERATOR_MAP: Record<string, string> = {
  equals: "=",
  contains: " contains ",
  startsWith: " startsWith ",
  endsWith: " endsWith ", 
  lt: "<",
  lte: "≤",
  gt: ">",
  gte: "≥",
  before: "≤",
  after: "≥",
  oneOf: " oneOf ",
  isEmpty: " isEmpty ",
};

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
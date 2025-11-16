import Handlebars from 'handlebars';
import path from 'path';
import { z } from 'zod';
import { formatName } from "../common";
import { ConfigFile } from "../config";
import type { TypeDefinition, TypeField } from "../schemas";
import { operationOf } from "./types";
import { renderOperation } from '../helpers/render';
import { searchFiles, processFile } from '../helpers/files';
import { getAssetPath } from '../file-manager';


function validateTemplate(template: string, fields: TypeField[]): string | true {
  try {
    const compiled = Handlebars.compile(template);
    // Test with sample data based on fields
    const testData: Record<string, any> = {};

    for (const field of fields) {
      testData[field.name] = field.default ?? (
        field.type === 'string' ? '' :
        field.type === 'number' ? 0 :
        field.type === 'boolean' ? false :
        field.type === 'date' ? new Date().toISOString() :
        field.type === 'enum' ? (field.enumOptions?.[0] ?? '') :
        ''
      );
    }

    compiled(testData);

    return true;
  } catch (error: any) {
    return `Invalid knowledge template: ${error.message}`;
  }
}


export const type_info = operationOf<
  { name: string },
  { type: TypeDefinition | null }
>({
  mode: 'local',
  signature: 'type_info(name: string)',
  status: (input) => `Getting type info: ${input.name}`,
  analyze: async (input, { config }) => {
    return {
      analysis: `This will get information about data type "${input.name}".`,
      doable: true,
    };
  },
  do: async (input, { config }) => {
    const types = config.getData().types;
    const type = types.find((t) => t.name === input.name);
    
    return { type: type || null };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `${formatName(op.input.name)}Info()`,
    (op) => {
      if (op.output?.type) {
        return `Found type: ${op.output.type.friendlyName}`;
      } else if (op.output?.type === null) {
        return `Type not found`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

type TypeUpdate = { name: string; update: { friendlyName?: string; description?: string; knowledgeTemplate?: string; fields?: Record<string, Partial<TypeField> | null> } };

export const type_update = operationOf<
  TypeUpdate,
  { name: string; updated: boolean },
  { validate: (input: TypeUpdate, config: ConfigFile) => string; fieldify(input: TypeUpdate, fields: TypeField[]): TypeField[] }
>({
  mode: 'update',
  signature: 'type_update(name: string, update...)',
  status: (input) => `Updating type: ${input.name}`,
  validate(input: TypeUpdate, config: ConfigFile): string {
    const existing = config.getData().types.find((t) => t.name === input.name);
    if (!existing) {
      return `Type not found: ${input.name}`;
    }

    // Validate field updates if provided
    if (input.update.fields) {
      for (const [fieldName, fieldUpdate] of Object.entries(input.update.fields)) {
        if (fieldName !== fieldName.toLowerCase()) {
          return `Field name "${fieldName}" must be lowercase`;
        }

        if (fieldUpdate === null) {
          // Deleting a field - check if it's required (breaking change)
          const existingField = existing.fields.find((f) => f.name === fieldName);
          if (existingField?.required) {
            return `Cannot delete required field "${fieldName}" - this is a breaking change`;
          }
        } else {
          // Adding or updating a field
          const existingField = existing.fields.find((f) => f.name === fieldName);

          if (existingField) {
            // Updating existing field - check for breaking changes
            if (fieldUpdate.type && fieldUpdate.type !== existingField.type) {
              return `Cannot change type of field "${fieldName}" from "${existingField.type}" to "${fieldUpdate.type}" - this is a breaking change`;
            }
            if (fieldUpdate.required && !existingField.required && !fieldUpdate.default && !existingField.default) {
              return `Cannot make field "${fieldName}" required without a default value - this is a breaking change`;
            }
          } else {
            // Adding new field - ensure it has required properties
            if (!fieldUpdate.type) {
              return `New field "${fieldName}" must have a type`;
            }
            if (fieldUpdate.friendlyName === undefined) {
              return `New field "${fieldName}" must have a friendlyName`;
            }
            if (fieldUpdate.required && !fieldUpdate.default) {
              return `New required field "${fieldName}" must have a default value`;
            }
          }
        }
      }
    }

    const templateFields = this.fieldify(input, existing.fields);
    const template = input.update.knowledgeTemplate || existing?.knowledgeTemplate;
    if (template) {
      const validation = validateTemplate(template, templateFields);
      if (validation !== true) {
        return validation;
      }
    }

    return '';
  },
  fieldify(input: TypeUpdate, fields: TypeField[]): TypeField[] {
    const newFields = fields.slice();
    // Handle field updates
    if (input.update.fields) {
      for (const [fieldName, fieldUpdate] of Object.entries(input.update.fields)) {
        if (fieldUpdate === null) {
          // Delete field
          const fieldIndex = newFields.findIndex((f) => f.name === fieldName);
          if (fieldIndex !== -1) {
            newFields.splice(fieldIndex, 1);
          }
        } else {
          // Update or add field
          const existingField = newFields.find((f) => f.name === fieldName);
          if (existingField) {
            // Update existing field
            Object.assign(existingField, fieldUpdate);
          } else {
            // Add new field (must provide full field definition)
            if (fieldUpdate.type && fieldUpdate.friendlyName !== undefined) {
              newFields.push({
                name: fieldName,
                friendlyName: fieldUpdate.friendlyName,
                type: fieldUpdate.type,
                required: fieldUpdate.required ?? false,
                default: fieldUpdate.default,
                enumOptions: fieldUpdate.enumOptions,
              });
            }
          }
        }
      }
    }
    return newFields;
  },
  async analyze(input, { config }) {
    const validation = this.validate(input, config);
    if (validation) {
      return {
        analysis: `This would fail - ${validation}`,
        doable: false,
      };
    }
    
    const changes: string[] = [];
    if (input.update.friendlyName) {
      changes.push(`friendlyName to "${input.update.friendlyName}"`);
    }
    if (input.update.description) {
      changes.push(`description to "${input.update.description}"`);
    }
    if (input.update.knowledgeTemplate) {
      changes.push(`knowledgeTemplate to "${input.update.knowledgeTemplate}"`);
    }
    if (input.update.fields) {
      changes.push(`field updates`);
    }

    return {
      analysis: `This will update type "${input.name}": ${changes.join(', ')}.`,
      doable: true,
    };
  },
  async do(input, { config }) {
    const validation = this.validate(input, config);
    if (validation) {
      throw new Error(`Type update failed - ${validation}`);
    }

    await config.save((data) => {
      const dataType = data.types.find((t) => t.name === input.name);
      if (dataType) {
        if (input.update.friendlyName) {
          dataType.friendlyName = input.update.friendlyName;
        }
        if (input.update.description) {
          dataType.description = input.update.description;
        }
        if (input.update.knowledgeTemplate) {
          dataType.knowledgeTemplate = input.update.knowledgeTemplate;
        }

        // Handle field updates
        if (input.update.fields) {
          dataType.fields = this.fieldify(input, dataType.fields);
        }
      }
    });

    return { name: input.name, updated: true };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `${formatName(op.input.name)}Update(${Object.keys(op.input.update).join(', ')})`,
    (op) => op.output?.updated ? 'Updated type successfully' : null,
    showInput, showOutput
  ),
});

export const type_create = operationOf<
  TypeDefinition,
  { type: TypeDefinition; created: boolean },
  { validate: (input: TypeDefinition, config: ConfigFile) => string; }
>({
  mode: 'create',
  signature: 'type_create(type: TypeDefinition)',
  status: (input) => `Creating type: ${input.name}`,
  validate(input: TypeDefinition, config: ConfigFile): string {
    const existing = config.getData().types.find((t) => t.name === input.name);
    if (existing) {
      return `Type already exists: ${input.name}`;
    }

    // Validate fields for duplicates and required properties
    const fieldNames = new Set<string>();
    for (const field of input.fields) {
      if (fieldNames.has(field.name)) {
        return `Duplicate field name: "${field.name}"`;
      }
      fieldNames.add(field.name);

      if (!field.name) {
        return `Field must have a name`;
      }
      if (!field.friendlyName) {
        return `Field "${field.name}" must have a friendlyName`;
      }
      if (!field.type) {
        return `Field "${field.name}" must have a type`;
      }
      if (field.type === 'enum' && (!field.enumOptions || field.enumOptions.length === 0)) {
        return `Enum field "${field.name}" must have enumOptions`;
      }
    }

    // Validate knowledgeTemplate
    if (input.knowledgeTemplate) {
      const validation = validateTemplate(input.knowledgeTemplate, input.fields);
      if (validation !== true) {
        return validation;
      }
    }

    return '';
  },
  async analyze(input, { config }) {
    const validation = this.validate(input, config);
    
    if (validation) {
      return {
        analysis: `This would fail - ${validation}`,
        doable: false,
      };
    }

    return {
      analysis: `This will create a new data type: ${JSON.stringify(input, undefined, 2)}`,
      doable: true,
    };
  },
  async do(input, { config }) {
    const validation = this.validate(input, config);
    if (validation) {
      throw new Error(`Type creation failed - ${validation}`);
    }

    await config.addType(input);

    return { type: input, created: true };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `${formatName(op.input.name)}Create(fields: [${op.input.fields.map(f => f.friendlyName).join(', ')}])`,
    (op) => op.output?.created ? `Created type: ${op.output.type.friendlyName}` : null,
    showInput, showOutput
  ),
});

// Type import constants
const TYPE_IMPORT_CONSTS = {
  BATCH_SIZE: 128_000, // Characters to accumulate before processing
  MAX_QUEUE_SIZE: 1_000_000_000, // 1GB memory limit for queue
  SECTION_SIZE: 64_000, // Size to split files into sections
};

// Discovered type during import
export interface DiscoveredType {
  name: string;
  friendlyName: string;
  description?: string;
  fields: TypeField[];
  instanceCount: number;
}

export const type_import = operationOf<
  { glob: string; hints?: string[]; max?: number },
  { discovered: DiscoveredType[]; filesProcessed: number }
>({
  mode: 'read',
  signature: 'type_import(glob: string, hints?, max?)',
  status: ({ glob }) => `Importing types from ${glob}`,
  analyze: async ({ glob, hints, max }, { config, cwd }) => {
    const files = await searchFiles(cwd, glob);
    const importable = files.filter(f => f.fileType !== 'unknown' && f.fileType !== 'unreadable' && f.fileType !== 'image');
    
    let analysis = `This will scan ${importable.length} file(s) matching "${glob}" to discover type definitions.`;
    
    if (hints && hints.length > 0) {
      analysis += ` Will focus on types matching: ${hints.join(', ')}.`;
    }
    if (max) {
      analysis += ` Will discover up to ${max} types.`;
    }
    
    analysis += ` Results will be presented for review - no types will be automatically added.`;
    
    return {
      analysis,
      doable: importable.length > 0,
    };
  },
  do: async ({ glob, hints, max }, ctx) => {
    const { ai, config, cwd, log, chatStatus } = ctx;
    
    // Find and filter files
    const files = await searchFiles(cwd, glob);
    const importableFiles = files.filter(f => 
      f.fileType !== 'unknown' && f.fileType !== 'unreadable' && f.fileType !== 'image'
    );
    
    log(`type_import: found ${files.length} files, ${importableFiles.length} importable`);
    chatStatus(`Found ${importableFiles.length} files to process`);
    
    // Get existing types
    const existingTypes = config.getData().types;
    const existingTypeNames = existingTypes.map(t => t.name);
    
    // Initialize discovered types storage
    const discoveredTypes = new Map<string, DiscoveredType>();
    
    // Create extraction prompt with tools for type manipulation
    const extractor = ai.prompt({
      name: 'type_extractor',
      description: 'Extract and manage type definitions from text',
      content: `You are an expert data modeling assistant. Your task is to extract structured type definitions from the provided text.

<existingTypes>
{{#if existingTypes.length}}
Existing types already defined:
{{#each existingTypes}}
- {{this.name}}: {{this.friendlyName}}{{#if this.description}} - {{this.description}}{{/if}}
  Fields: {{#each this.fields}}{{this.name}} ({{this.type}}){{#unless @last}}, {{/unless}}{{/each}}
{{/each}}
{{else}}
No existing types defined yet.
{{/if}}
</existingTypes>

<discoveredTypes>
{{#if discoveredTypes.length}}
Types discovered so far in this import:
{{#each discoveredTypes}}
- {{this.name}}: {{this.friendlyName}}{{#if this.description}} - {{this.description}}{{/if}}
  Fields: {{#each this.fields}}{{this.name}} ({{this.type}}){{#unless @last}}, {{/unless}}{{/each}}
  Instance count: {{this.instanceCount}}
{{/each}}
{{else}}
No types discovered yet in this import.
{{/if}}
</discoveredTypes>

<constraints>
{{#if hints}}
Focus on discovering types that match these hints: {{hints}}
{{/if}}
{{#if maxTypes}}
Maximum types to discover: {{maxTypes}}
{{#if discoveredTypes.length}}
Already discovered: {{discoveredTypes.length}}
Remaining slots: {{remainingSlots}}
{{/if}}
{{/if}}
</constraints>

<instructions>
Analyze the text below and extract type definitions. Use the provided tools to manage discovered types:
- add_discovered: Add a new discovered type with fields
- rename_discovered: Rename a discovered type
- add_fields: Add fields to an existing or discovered type
- update_discovered: Update properties of a discovered type
- add_instances: Track instance count for a type
- remove_discovered: Remove a discovered type (e.g., if it's too infrequent)

When managing types:
- Use estimated instance counts to prioritize important types
- If max types is specified and reached, remove less frequent types to make room for more important ones
- Merge similar types using add_fields and remove_discovered
- Field names must be lowercase with no spaces
- For existing types, only use add_fields to suggest field additions
</instructions>

<text>
{{text}}
</text>`,
      tools: [
        ai.tool({
          name: 'add_discovered',
          description: 'Add a new discovered type definition',
          schema: z.object({
            name: z.string().describe('Type name (lowercase, no spaces)'),
            friendlyName: z.string().describe('Display name'),
            description: z.string().optional().describe('Type description'),
            fields: z.array(
              z.object({
                name: z.string().describe('Field name (lowercase, no spaces)'),
                friendlyName: z.string().describe('Field display name'),
                type: z.enum(['string', 'number', 'boolean', 'date', 'enum', ...existingTypeNames]).describe('Field type'),
                required: z.boolean().optional().describe('Is field required?'),
                enumOptions: z.array(z.string()).optional().describe('Valid enum values (required for enum type)'),
              })
            ).describe('Field definitions'),
            instanceCount: z.number().optional().describe('Estimated number of instances found'),
          }),
          call: async (input) => {
            const existing = discoveredTypes.get(input.name);
            if (existing) {
              return { success: false, message: `Type "${input.name}" already discovered. Use update_discovered or add_fields instead.` };
            }
            
            discoveredTypes.set(input.name, {
              name: input.name,
              friendlyName: input.friendlyName,
              description: input.description,
              fields: input.fields as TypeField[],
              instanceCount: input.instanceCount || 1,
            });
            
            return { success: true, message: `Added discovered type: ${input.friendlyName}` };
          },
        }),
        ai.tool({
          name: 'rename_discovered',
          description: 'Rename a discovered type',
          schema: z.object({
            oldName: z.enum([...Array.from(discoveredTypes.keys())] as [string, ...string[]]).describe('Current type name'),
            newName: z.string().describe('New type name (lowercase, no spaces)'),
          }),
          call: async (input) => {
            const type = discoveredTypes.get(input.oldName);
            if (!type) {
              return { success: false, message: `Type "${input.oldName}" not found in discovered types.` };
            }
            
            discoveredTypes.delete(input.oldName);
            type.name = input.newName;
            discoveredTypes.set(input.newName, type);
            
            return { success: true, message: `Renamed type from ${input.oldName} to ${input.newName}` };
          },
        }),
        ai.tool({
          name: 'add_fields',
          description: 'Add fields to an existing or discovered type',
          schema: z.object({
            typeName: z.enum([...existingTypeNames, ...Array.from(discoveredTypes.keys())] as [string, ...string[]]).describe('Type name'),
            fields: z.array(
              z.object({
                name: z.string().describe('Field name (lowercase, no spaces)'),
                friendlyName: z.string().describe('Field display name'),
                type: z.enum(['string', 'number', 'boolean', 'date', 'enum', ...existingTypeNames]).describe('Field type'),
                required: z.boolean().optional().describe('Is field required?'),
                enumOptions: z.array(z.string()).optional().describe('Valid enum values (required for enum type)'),
              })
            ).describe('Fields to add'),
          }),
          call: async (input) => {
            const type = discoveredTypes.get(input.typeName);
            if (!type) {
              return { success: false, message: `Type "${input.typeName}" not found in discovered types. Use add_discovered first or check existing types.` };
            }
            
            // Add new fields, avoiding duplicates
            for (const field of input.fields) {
              const existingField = type.fields.find(f => f.name === field.name);
              if (!existingField) {
                type.fields.push(field as TypeField);
              }
            }
            
            return { success: true, message: `Added ${input.fields.length} field(s) to ${input.typeName}` };
          },
        }),
        ai.tool({
          name: 'update_discovered',
          description: 'Update properties of a discovered type',
          schema: z.object({
            name: z.enum([...Array.from(discoveredTypes.keys())] as [string, ...string[]]).describe('Type name'),
            friendlyName: z.string().optional().describe('New friendly name'),
            description: z.string().optional().describe('New description'),
          }),
          call: async (input) => {
            const type = discoveredTypes.get(input.name);
            if (!type) {
              return { success: false, message: `Type "${input.name}" not found in discovered types.` };
            }
            
            if (input.friendlyName) type.friendlyName = input.friendlyName;
            if (input.description) type.description = input.description;
            
            return { success: true, message: `Updated type: ${input.name}` };
          },
        }),
        ai.tool({
          name: 'add_instances',
          description: 'Track instance count for a type',
          schema: z.object({
            typeName: z.enum([...Array.from(discoveredTypes.keys())] as [string, ...string[]]).describe('Type name'),
            count: z.number().describe('Number of instances to add'),
          }),
          call: async (input) => {
            const type = discoveredTypes.get(input.typeName);
            if (!type) {
              return { success: false, message: `Type "${input.typeName}" not found in discovered types.` };
            }
            
            type.instanceCount += input.count;
            
            return { success: true, message: `Added ${input.count} instances to ${input.typeName}, total: ${type.instanceCount}` };
          },
        }),
        ai.tool({
          name: 'remove_discovered',
          description: 'Remove a discovered type',
          schema: z.object({
            name: z.enum([...Array.from(discoveredTypes.keys())] as [string, ...string[]]).describe('Type name to remove'),
            reason: z.string().optional().describe('Reason for removal'),
          }),
          call: async (input) => {
            discoveredTypes.delete(input.name);
            return { success: true, message: `Removed type: ${input.name}${input.reason ? ` (${input.reason})` : ''}` };
          },
        }),
      ],
      input: ({ text }: { text: string }) => ({
        text,
        existingTypes,
        discoveredTypes: Array.from(discoveredTypes.values()),
        hints: hints?.join(', '),
        maxTypes: max,
        remainingSlots: max ? Math.max(0, max - discoveredTypes.size) : undefined,
      }),
      metadataFn: () => ({
        model: config.getData().user.models?.chat,
      }),
      excludeMessages: true,
    });
    
    // Process files with batching
    let filesProcessed = 0;
    let currentBatch = '';
    let currentBatchFiles: string[] = [];
    
    for (const file of importableFiles) {
      const fullPath = path.resolve(cwd, file.file);
      
      try {
        // Read and process file
        const parsed = await processFile(fullPath, file.file, {
          assetPath: await getAssetPath(true),
          sections: true,
          transcribeImages: false,
          describeImages: false,
          extractImages: false,
          summarize: false,
        });
        
        // Combine sections for this file
        const fileText = parsed.sections.join('\n\n');
        
        // Add file header and content to batch
        const fileContent = `\n\n=== File: ${file.file} ===\n${fileText}`;
        
        // Check if adding this file would exceed batch size
        if (currentBatch.length > 0 && currentBatch.length + fileContent.length > TYPE_IMPORT_CONSTS.BATCH_SIZE) {
          // Process current batch
          chatStatus(`Processing batch (${currentBatchFiles.length} files, ${currentBatch.length} chars)...`);
          
          try {
            await extractor.get('result', { text: currentBatch }, ctx);
          } catch (error) {
            log(`Warning: Failed to process batch: ${(error as Error).message}`);
          }
          
          // Start new batch
          currentBatch = fileContent;
          currentBatchFiles = [file.file];
        } else {
          currentBatch += fileContent;
          currentBatchFiles.push(file.file);
        }
        
        filesProcessed++;
        chatStatus(`Processed ${filesProcessed}/${importableFiles.length} files`);
        
        // Check if we've reached max types (if specified)
        if (max && discoveredTypes.size >= max && hints && hints.length === 0) {
          log(`Reached max type limit of ${max}, stopping file processing`);
          break;
        }
      } catch (error) {
        log(`Warning: Failed to process file ${file.file}: ${(error as Error).message}`);
      }
    }
    
    // Process final batch if any content remains
    if (currentBatch.length > 0) {
      chatStatus(`Processing final batch (${currentBatchFiles.length} files, ${currentBatch.length} chars)...`);
      
      try {
        await extractor.get('result', { text: currentBatch }, ctx);
      } catch (error) {
        log(`Warning: Failed to process final batch: ${(error as Error).message}`);
      }
    }
    
    // Convert discovered types to array and sort by instance count
    const discovered = Array.from(discoveredTypes.values())
      .sort((a, b) => b.instanceCount - a.instanceCount);
    
    log(`type_import: discovered ${discovered.length} types from ${filesProcessed} files`);
    
    return {
      discovered,
      filesProcessed,
    };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `TypeImport("${op.input.glob}"${op.input.hints ? `, hints=[${op.input.hints.join(',')}]` : ''}${op.input.max ? `, max=${op.input.max}` : ''})`,
    (op) => {
      if (op.output) {
        const count = op.output.discovered.length;
        return `Discovered ${count} type${count !== 1 ? 's' : ''} from ${op.output.filesProcessed} file(s)`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

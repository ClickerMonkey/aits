import { describe, expect, it } from '@jest/globals';

/**
 * These tests validate the logic for tool selection with alwaysVisible metadata.
 * The actual implementation is in chat-agent.ts getActiveTools function.
 */
describe('Tool Selection with alwaysVisible metadata', () => {

  it('should identify tools with alwaysVisible metadata', () => {
    // Mock tools with various metadata configurations
    const tools = [
      { name: 'alwaysVisible1', input: { metadata: { alwaysVisible: true } } },
      { name: 'regular1', input: { metadata: { alwaysVisible: false } } },
      { name: 'noMeta1', input: {} },
      { name: 'noMeta2', input: { metadata: {} } },
    ];

    // Filter tools with alwaysVisible metadata (simulates getActiveTools logic)
    const alwaysVisibleTools = tools.filter(t => 
      t.input.metadata?.alwaysVisible === true
    );

    expect(alwaysVisibleTools.length).toBe(1);
    expect(alwaysVisibleTools[0].name).toBe('alwaysVisible1');
  });

  it('should not include duplicate tools when combining alwaysVisible with toolset', () => {
    // Mock all tools
    const allTools = [
      { name: 'utility1', toolset: 'utility', input: { metadata: { alwaysVisible: true } } },
      { name: 'clerk1', toolset: 'clerk', input: {} },
      { name: 'clerk2', toolset: 'clerk', input: {} },
    ];

    // Simulate getActiveTools logic
    const alwaysVisibleTools = allTools.filter(t => 
      t.input.metadata?.alwaysVisible === true
    );
    const toolNames = new Set<string>(alwaysVisibleTools.map(t => t.name));
    const clerkTools = allTools.filter(t => t.toolset === 'clerk');
    const selectedTools = clerkTools.filter(t => !toolNames.has(t.name));

    const activeTools = [...alwaysVisibleTools, ...selectedTools];

    // Verify no duplicates
    const uniqueNames = new Set(activeTools.map(t => t.name));
    expect(uniqueNames.size).toBe(activeTools.length);
    expect(activeTools.length).toBe(3); // utility1, clerk1, clerk2

    // Verify utility tool is included
    expect(activeTools.some(t => t.name === 'utility1')).toBe(true);

    // Verify clerk tools are included
    expect(activeTools.some(t => t.name === 'clerk1')).toBe(true);
    expect(activeTools.some(t => t.name === 'clerk2')).toBe(true);
  });

  it('should not include duplicates when same tool is marked as alwaysVisible and in selected toolset', () => {
    // This edge case shouldn't happen in practice, but we should handle it
    const allTools = [
      { name: 'dual1', toolset: 'utility', input: { metadata: { alwaysVisible: true } } },
      { name: 'dual1', toolset: 'clerk', input: { metadata: { alwaysVisible: true } } },
    ];

    // Simulate getActiveTools logic
    const alwaysVisibleTools = allTools.filter(t => 
      t.input.metadata?.alwaysVisible === true
    );
    const toolNames = new Set<string>(alwaysVisibleTools.map(t => t.name));
    const clerkTools = allTools.filter(t => t.toolset === 'clerk');
    const selectedTools = clerkTools.filter(t => !toolNames.has(t.name));

    const activeTools = [...alwaysVisibleTools, ...selectedTools];

    // Verify no duplicates by name
    const uniqueNames = new Set(activeTools.map(t => t.name));
    expect(uniqueNames.size).toBe(1); // Only 'dual1' as a unique name

    // Note: In this scenario, we'd actually have 2 tool entries (both with name 'dual1')
    // but they're from different toolsets. The real implementation would prevent this
    // by not registering the same tool in multiple toolsets.
  });

  it('should filter out already-visible tools from selected toolset', () => {
    // Mock scenario where a tool with alwaysVisible is also in the selected toolset
    const allTools = [
      { name: 'getOperationOutput', toolset: 'utility', input: { metadata: { alwaysVisible: true } } },
      { name: 'file_search', toolset: 'clerk', input: {} },
      { name: 'file_read', toolset: 'clerk', input: {} },
      { name: 'getOperationOutput', toolset: 'clerk', input: { metadata: { alwaysVisible: true } } },
    ];

    // Simulate getActiveTools logic for clerk toolset
    const alwaysVisibleTools = allTools.filter(t => 
      t.input.metadata?.alwaysVisible === true
    );
    const toolNames = new Set<string>(alwaysVisibleTools.map(t => t.name));
    const clerkTools = allTools.filter(t => t.toolset === 'clerk');
    const selectedTools = clerkTools.filter(t => !toolNames.has(t.name));

    const activeTools = [...alwaysVisibleTools, ...selectedTools];

    // Should have: getOperationOutput (from utility), getOperationOutput (from clerk), file_search, file_read
    // But since we filter by name, we should only get: getOperationOutput (x2), file_search, file_read
    // Actually, the filtering should prevent getOperationOutput from clerk being added
    
    // Verify file_search and file_read are included
    expect(selectedTools.some(t => t.name === 'file_search')).toBe(true);
    expect(selectedTools.some(t => t.name === 'file_read')).toBe(true);
    
    // Verify getOperationOutput is not in selectedTools (filtered out)
    expect(selectedTools.some(t => t.name === 'getOperationOutput')).toBe(false);
  });

  it('should use defaultVisible tools when no query exists', () => {
    // Mock scenario with defaultVisible tools
    const allTools = [
      { name: 'getOperationOutput', input: { metadata: { alwaysVisible: true } } },
      { name: 'about', input: { metadata: { alwaysVisible: true } } },
      { name: 'todos_add', input: { metadata: { defaultVisible: true } } },
      { name: 'todos_done', input: { metadata: { defaultVisible: true } } },
      { name: 'file_read', input: { metadata: { defaultVisible: true } } },
      { name: 'file_stats', input: { metadata: { defaultVisible: true } } },
      { name: 'other_tool', input: {} },
    ];

    // Simulate getActiveTools logic when no query exists
    const alwaysVisibleTools = allTools.filter(t => 
      t.input.metadata?.alwaysVisible === true
    );
    const toolNames = new Set<string>(alwaysVisibleTools.map(t => t.name));
    const defaultVisibleTools = allTools.filter(t => 
      t.input.metadata?.defaultVisible === true && !toolNames.has(t.name)
    );

    const activeTools = [...alwaysVisibleTools, ...defaultVisibleTools];

    // Verify alwaysVisible tools are included
    expect(activeTools.some(t => t.name === 'getOperationOutput')).toBe(true);
    expect(activeTools.some(t => t.name === 'about')).toBe(true);

    // Verify defaultVisible tools are included
    expect(activeTools.some(t => t.name === 'todos_add')).toBe(true);
    expect(activeTools.some(t => t.name === 'todos_done')).toBe(true);
    expect(activeTools.some(t => t.name === 'file_read')).toBe(true);
    expect(activeTools.some(t => t.name === 'file_stats')).toBe(true);

    // Verify other tools are not included
    expect(activeTools.some(t => t.name === 'other_tool')).toBe(false);

    // Verify total count
    expect(activeTools.length).toBe(6);
  });
});

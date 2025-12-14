import React from 'react';
import { Operation, OperationKind } from '../../schemas';
import { OperationDisplay as DefaultOperationDisplay } from './render';

// Import operation-specific renderers
import * as clerk from './clerk';
import * as planner from './planner';
import * as architect from './architect';
import * as dba from './dba';
import * as artist from './artist';
import * as internet from './internet';
import * as librarian from './librarian';
import * as secretary from './secretary';

/**
 * Registry of operation renderers
 */
const OperationRenderers: Partial<Record<OperationKind, React.FC<{
  operation: Operation;
}>>> = {
  // Clerk operations
  ...clerk,

  // Planner operations
  ...planner,

  // Architect operations
  ...architect,

  // DBA operations
  ...dba,

  // Artist operations
  ...artist,

  // Internet operations
  ...internet,

  // Librarian operations
  ...librarian,

  // Secretary operations
  ...secretary,
};

interface OperationDisplayProps {
  operation: Operation;
}

/**
 * Main operation display component that delegates to specific renderers
 */
export const OperationDisplay: React.FC<OperationDisplayProps> = (props) => {
  const Renderer = OperationRenderers[props.operation.type as OperationKind];

  if (Renderer) {
    return <Renderer {...props} />;
  }

  // Fall back to default renderer
  return <DefaultOperationDisplay {...props} />;
};

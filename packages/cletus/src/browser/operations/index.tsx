import React from 'react';
import { Operation, OperationKind } from '../../schemas';
import { OperationDisplayProps } from './render';

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
const OperationRenderers: Record<OperationKind, React.FC<{
  operation: Operation;
}>> = {
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

/**
 * Main operation display component that delegates to specific renderers
 */
export const OperationDisplay: React.FC<OperationDisplayProps> = (props) => {
  const Renderer = OperationRenderers[props.operation.type];

  return <Renderer {...props} />;
};

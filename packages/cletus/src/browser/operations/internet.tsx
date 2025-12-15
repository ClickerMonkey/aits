import React from 'react';
import { Operation } from '../../schemas';
import { abbreviate } from '../../shared';
import { BaseOperationDisplay } from './BaseOperationDisplay';
import { OperationRendererProps } from './types';

function createRenderer(getLabel: (op: Operation) => string, getSummary?: (op: Operation) => string | null) {
  return (props: OperationRendererProps) => {
    const { operation } = props;
    const label = getLabel(operation);
    const summary = operation.error || (getSummary ? getSummary(operation) : null) || operation.analysis;

    return (
      <BaseOperationDisplay
        {...props}
        label={label}
        summary={summary}
        borderColor="border-neon-green/30"
        bgColor="bg-neon-green/5"
        labelColor="text-neon-green"
      />
    );
  };
}

export const web_search = createRenderer(
  (op) => `WebSearch("${abbreviate(op.input.query, 30)}")`,
  (op) => {
    if (op.output) {
      return `Found ${op.output.results.length} result${op.output.results.length !== 1 ? 's' : ''}`;
    }
    return null;
  }
);

export const web_get_page = createRenderer(
  (op) => `WebGetPage("${abbreviate(op.input.url, 30)}", ${op.input.type})`,
  (op) => {
    if (op.output) {
      const parts: string[] = [`${op.output.totalLines} lines`];
      if (op.output.matches) {
        parts.push(`${op.output.matches.length} matches`);
      }
      return parts.join(', ');
    }
    return null;
  }
);

export const web_api_call = createRenderer(
  (op) => `WebApiCall(${op.input.method} "${abbreviate(op.input.url, 60)}")`,
  (op) => {
    if (op.output) {
      return `${op.output.status} ${op.output.statusText} (${op.output.body.length} bytes)`;
    }
    return null;
  }
);

export const web_download = createRenderer(
  (op) => `WebDownload("${abbreviate(op.input.url, 30)}")`,
  (op) => {
    if (op.output) {
      const sizeKB = (op.output.size / 1024).toFixed(2);
      return `${sizeKB} KB saved to ${op.output.path}`;
    }
    return null;
  }
);

import { abbreviate, pluralize } from '../../shared';
import { createRenderer } from './render';

const renderer = createRenderer({
  borderColor: "border-purple-400/30",
  bgColor: "bg-purple-400/5",
  labelColor: "text-purple-400",
});

export const knowledge_search = renderer<'knowledge_search'>(
  (op) => `KnowledgeSearch("${abbreviate(op.input.query, 25)}")`,
  (op) => {
    if (op.output) {
      return `Found ${pluralize(op.output.results.length, 'result')}`;
    }
    return null;
  }
);

export const knowledge_sources = renderer<'knowledge_sources'>(
  (op) => 'KnowledgeSources()',
  (op) => {
    if (op.output) {
      return `Listed ${pluralize(op.output.sources.length, 'source')}`;
    }
    return null;
  }
);

export const knowledge_add = renderer<'knowledge_add'>(
  (op) => `KnowledgeAdd("${abbreviate(op.input.text, 30)}")`,
  (op) => op.output?.added ? `Added: "${abbreviate(op.input.text, 50)}"` : null
);

export const knowledge_delete = renderer<'knowledge_delete'>(
  (op) => `KnowledgeDelete("${op.input.sourcePattern}")`,
  (op) => {
    if (op.output) {
      return `Deleted ${pluralize(op.output.deletedCount, 'entry', 'entries')}`;
    }
    return null;
  }
);

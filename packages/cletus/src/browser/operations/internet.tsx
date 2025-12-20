import { abbreviate, pluralize } from '../../shared';
import { createRenderer } from './render';

const renderer = createRenderer({
  borderColor: "border-neon-green/30",
  bgColor: "bg-neon-green/5",
  labelColor: "text-neon-green",
});

export const web_search = renderer<'web_search'>(
  (op) => `WebSearch("${abbreviate(op.input.query, 30)}")`,
  (op) => {
    if (op.output) {
      return `Found ${pluralize(op.output.results.length, 'result')}`;
    }
    return null;
  }
);

export const web_get_page = renderer<'web_get_page'>(
  (op) => `WebGetPage("${abbreviate(op.input.url, 30)}", ${op.input.type})`,
  (op) => {
    if (op.output) {
      const parts: string[] = [pluralize(op.output.totalLines, 'line')];
      if (op.output.matches) {
        parts.push(pluralize(op.output.matches.length, 'match', 'matches'));
      }
      return parts.join(', ');
    }
    return null;
  }
);

export const web_api_call = renderer<'web_api_call'>(
  (op) => `WebApiCall(${op.input.method} "${abbreviate(op.input.url, 60)}")`,
  (op) => {
    if (op.output) {
      return `${op.output.status} ${op.output.statusText} (${op.output.body.length} bytes)`;
    }
    return null;
  }
);

export const web_download = renderer<'web_download'>(
  (op) => `WebDownload("${abbreviate(op.input.url, 30)}")`,
  (op) => {
    if (op.output) {
      const sizeKB = (op.output.size / 1024).toFixed(2);
      return `${sizeKB} KB saved to ${op.output.path}`;
    }
    return null;
  }
);

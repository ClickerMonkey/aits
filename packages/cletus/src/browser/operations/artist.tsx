import { abbreviate, pluralize } from '../../shared';
import { createRenderer } from './render';

const renderer = createRenderer({
  borderColor: "border-neon-pink/30",
  bgColor: "bg-neon-pink/5",
  labelColor: "text-neon-pink",
});

export const image_generate = renderer<'image_generate'>(
  (op) => `ImageGenerate("${abbreviate(op.input.prompt, 30)}", n=${op.input.n || 1})`,
  (op) => {
    if (op.output) {
      const count = op.output.count;
      // For browser, we can show the image inline if we have URLs
      if (op.output.images && op.output.images.length > 0) {
        return (
          <div className="ml-6 mt-2">
            <div className="text-sm mb-2">Generated {count} image{count !== 1 ? 's' : ''}</div>
            <div className="flex gap-2 flex-wrap">
              {op.output.images.map((img: string, i: number) => (
                <img key={i} src={img} alt="Generated" className="max-w-sm rounded border border-neon-pink/30" />
              ))}
            </div>
          </div>
        );
      }
      return `Generated ${pluralize(count, 'image')}`;
    }
    return null;
  }
);

export const image_edit = renderer<'image_edit'>(
  (op) => `ImageEdit("${op.input.path}", "${abbreviate(op.input.prompt, 20)}")`,
  (op) => {
    if (op.output) {
      // For browser, we can show the edited image inline if we have a URL
      if (op.output.editedLink) {
        return (
          <div className="ml-6 mt-2">
            <div className="text-sm mb-2">Edited image saved</div>
            <img src={op.output.editedLink} alt="Edited" className="max-w-sm rounded border border-neon-pink/30" />
          </div>
        );
      }
      return 'Edited image saved';
    }
    return null;
  }
);

export const image_analyze = renderer<'image_analyze'>(
  (op) => {
    const pathCount = op.input.paths?.length || 1;
    const firstPath = op.input.paths?.[0] || '';
    const label = pathCount === 1 ? firstPath : `${pathCount} images`;
    return `ImageAnalyze(${label}, "${abbreviate(op.input.prompt, 20)}")`;
  },
  (op) => {
    if (op.output) {
      return abbreviate(op.output.analysis, 60);
    }
    return null;
  }
);

export const image_describe = renderer<'image_describe'>(
  (op) => `ImageDescribe("${op.input.path}")`,
  (op) => {
    if (op.output) {
      return abbreviate(op.output.description, 60);
    }
    return null;
  }
);

export const image_find = renderer<'image_find'>(
  (op) => `ImageFind("${abbreviate(op.input.query, 50)}", "${op.input.glob}")`,
  (op) => {
    if (op.output) {
      const resultCount = op.output.results.length;
      const searched = op.output.searched;
      return `Found ${pluralize(resultCount, 'matching image')} (searched ${searched})`;
    }
    return null;
  }
);

export const image_attach = renderer<'image_attach'>(
  (op) => `ImageAttach("${op.input.path}")`,
  (op) => {
    if (op.output?.attached) {
      return `Attached image: ${op.output.fullPath}`;
    }
    return null;
  }
);

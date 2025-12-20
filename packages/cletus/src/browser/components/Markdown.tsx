import React, { useMemo } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { ClickableImage } from './ImageViewer';


// Preprocess content to convert LaTeX delimiters to markdown math delimiters
const preprocessLatex = (text: string): string => {
  // Convert \[...\] to $$...$$ (display math)
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => `$$${content}$$`);
  // Convert \(...\) to $...$ (inline math)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => `$${content}$`);
  // Convert standalone [... ] patterns that look like display math (with array/equation content)
  // Only convert if it contains LaTeX commands like \begin, \text, etc.
  text = text.replace(/\[\s*(\\begin|\\text|\\frac|\\int|\\sum|\\prod)([\s\S]*?)\s*\]/g, (match, cmd, rest) => `$$${cmd}${rest}$$`);
  return text;
};

// Stable markdown components reference - created once and reused
const markdownComponents: Components = {
  p: ({ children }) => <p className="text-foreground mb-2">{children}</p>,
  ul: ({ children }) => <ul className="text-foreground list-disc ml-6 mb-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="text-foreground list-decimal ml-6 mb-2 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="text-foreground ml-2">{children}</li>,
  code: ({ inline, children, ...props }: any) => {
    return inline ? (
      <code className="text-foreground bg-muted px-1 py-0.5 rounded" {...props}>
        {children}
      </code>
    ) : (
      <code className="text-foreground" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="text-foreground bg-muted p-3 rounded mb-2 overflow-x-auto">{children}</pre>,
  a: ({ href, children }) => (
    <a href={href} className="text-neon-cyan hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ src, alt, ...props }: any) => {
    // Transform local file paths to use the /file route
    const imageSrc = src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')
      ? `/file?path=${encodeURIComponent(src)}`
      : src;
    return <ClickableImage src={imageSrc} alt={alt} className="max-w-full rounded" {...props} />;
  },
};

// Memoized markdown content renderer
export const MarkdownContent = React.memo<{ content: string }>(({ content }) => {
  const processedContent = useMemo(() => preprocessLatex(content), [content]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={markdownComponents}
    >
      {processedContent}
    </ReactMarkdown>
  );
});
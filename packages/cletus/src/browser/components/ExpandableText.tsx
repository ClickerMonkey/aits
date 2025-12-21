import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { MarkdownContent } from './Markdown';

interface ExpandableTextProps {
  content: string;
  isUser: boolean;
  isAssistant: boolean;
  isSystem: boolean;
  maxHeight?: number; // in pixels, default 96 (6rem)
}

export const ExpandableText: React.FC<ExpandableTextProps> = ({
  content,
  isUser,
  isAssistant,
  isSystem,
  maxHeight = 132,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkOverflow = () => {
      if (contentRef.current) {
        const element = contentRef.current;
        // Check if content height exceeds maxHeight
        setHasOverflow(element.scrollHeight > maxHeight);
      }
    };

    // Check on mount and whenever content changes
    checkOverflow();

    // Also check after a short delay to account for any async rendering
    const timer = setTimeout(checkOverflow, 100);

    return () => clearTimeout(timer);
  }, [content, maxHeight]);

  const needsExpansion = isUser && hasOverflow;

  return (
    <div className="relative max-w-3xl">
      <div
        ref={contentRef}
        className={cn(
          'rounded-lg p-4 !pb-1',
          'prose prose-invert prose-sm max-w-none',
          'prose-p:text-foreground prose-headings:text-foreground',
          'prose-strong:text-foreground prose-code:text-foreground',
          'prose-pre:bg-muted prose-pre:text-foreground',
          'prose-a:text-neon-cyan prose-a:no-underline hover:prose-a:underline',
          'prose-li:text-foreground prose-ul:text-foreground prose-ol:text-foreground',
          'text-foreground',
          isUser && 'bg-neon-purple/10 border border-neon-purple/30',
          isAssistant && 'bg-card',
          isSystem && 'bg-muted/50 border border-muted italic',
          needsExpansion && !isExpanded && 'overflow-hidden'
        )}
        style={needsExpansion && !isExpanded ? { maxHeight: `${maxHeight}px` } : undefined}
      >
        <MarkdownContent content={content} />
      </div>

      {needsExpansion && !isExpanded && (
        <div
          className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-neon-purple/30 via-neon-purple/20 to-transparent flex items-end justify-center pb-2 cursor-pointer"
          onClick={() => setIsExpanded(true)}
        >
          <div className="flex items-center gap-1 text-white text-xs font-semibold bg-neon-purple/60 hover:bg-neon-purple/80 px-3 py-1.5 rounded shadow-lg border border-neon-purple transition-colors">
            <ChevronDown className="w-3 h-3" />
            Show More
          </div>
        </div>
      )}

      {needsExpansion && isExpanded && (
        <div
          className="flex items-center justify-center mt-2 cursor-pointer"
          onClick={() => setIsExpanded(false)}
        >
          <div className="flex items-center gap-1 text-white text-xs font-semibold bg-neon-purple/60 hover:bg-neon-purple/80 px-3 py-1.5 rounded shadow-lg border border-neon-purple transition-colors">
            <ChevronDown className="w-3 h-3 rotate-180" />
            Show Less
          </div>
        </div>
      )}
    </div>
  );
};

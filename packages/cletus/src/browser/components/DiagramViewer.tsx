import React, { useState, useEffect, useRef } from 'react';
import { X, Download, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { cn } from '../lib/utils';
import mermaid from 'mermaid';

interface DiagramViewerProps {
  spec: string;
  isOpen: boolean;
  onClose: () => void;
}

export const DiagramViewer: React.FC<DiagramViewerProps> = ({ spec, isOpen, onClose }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
    });
  }, []);

  // Render diagram when spec changes or when opened
  useEffect(() => {
    if (isOpen && spec) {
      renderDiagram();
    }
  }, [isOpen, spec]);

  const renderDiagram = async () => {
    try {
      setError(null);
      const { svg } = await mermaid.render(`mermaid-fullscreen-${Date.now()}`, spec);
      setSvgContent(svg);
    } catch (err) {
      console.error('Mermaid render error:', err);
      setError(err instanceof Error ? err.message : 'Failed to render diagram');
    }
  };

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => Math.max(0.5, Math.min(5, prev + delta)));
  };

  // Handle mouse drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom controls
  const zoomIn = () => setScale((prev) => Math.min(5, prev + 0.25));
  const zoomOut = () => setScale((prev) => Math.max(0.5, prev - 0.25));
  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Download diagram as SVG
  const downloadDiagram = () => {
    try {
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagram-${Date.now()}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download diagram:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button
          onClick={zoomOut}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={zoomIn}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={resetZoom}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          title="Reset Zoom"
        >
          <Maximize2 className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={downloadDiagram}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          title="Download"
        >
          <Download className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={onClose}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          title="Close (ESC)"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Zoom indicator */}
      <div className="absolute top-4 left-4 px-3 py-1 bg-white/10 rounded-lg text-white text-sm">
        {Math.round(scale * 100)}%
      </div>

      {/* Diagram or Error */}
      {error ? (
        <div className="text-red-400 text-center px-4">
          <p className="text-lg mb-2">Failed to render diagram</p>
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className={cn(
            'relative max-w-[90vw] max-h-[90vh] overflow-hidden',
            isDragging ? 'cursor-grabbing' : scale > 1 ? 'cursor-grab' : 'cursor-default'
          )}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className="select-none"
            style={{
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-white/10 rounded-lg text-white text-xs text-center">
        Scroll to zoom • Drag to pan • ESC or click outside to close
      </div>
    </div>
  );
};

interface ClickableDiagramProps {
  spec: string;
  className?: string;
}

export const ClickableDiagram: React.FC<ClickableDiagramProps> = ({ spec, className }) => {
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
    });
  }, []);

  // Render diagram
  useEffect(() => {
    if (spec) {
      renderDiagram();
    }
  }, [spec]);

  const renderDiagram = async () => {
    try {
      setError(null);
      const { svg } = await mermaid.render(`mermaid-preview-${Date.now()}`, spec);
      setSvgContent(svg);
    } catch (err) {
      console.error('Mermaid render error:', err);
      setError(err instanceof Error ? err.message : 'Failed to render diagram');
    }
  };

  if (error) {
    return (
      <div className={cn('text-red-400 text-xs p-2 border border-red-400/30 rounded', className)}>
        Error: {error}
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className={cn('cursor-pointer hover:opacity-90 transition-opacity', className)}
        onClick={() => setIsViewerOpen(true)}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
      <DiagramViewer spec={spec} isOpen={isViewerOpen} onClose={() => setIsViewerOpen(false)} />
    </>
  );
};

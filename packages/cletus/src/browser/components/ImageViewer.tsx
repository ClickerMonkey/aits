import React, { useState, useEffect, useRef } from 'react';
import { X, Download, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface ImageViewerProps {
  src: string;
  alt?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ src, alt, isOpen, onClose }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

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

  // Download image
  const downloadImage = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Extract filename from src or use default
      const filename = src.split('/').pop() || 'image.png';
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download image:', error);
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
          onClick={downloadImage}
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

      {/* Image */}
      <div
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
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          className="select-none pointer-events-none"
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            maxWidth: '90vw',
            maxHeight: '90vh',
            objectFit: 'contain',
          }}
          draggable={false}
        />
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-white/10 rounded-lg text-white text-xs text-center">
        Scroll to zoom • Drag to pan • ESC or click outside to close
      </div>
    </div>
  );
};

interface ClickableImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt?: string;
  className?: string;
}

export const ClickableImage: React.FC<ClickableImageProps> = ({ src, alt, className, ...props }) => {
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={cn('cursor-pointer hover:opacity-90 transition-opacity', className)}
        onClick={() => setIsViewerOpen(true)}
        {...props}
      />
      <ImageViewer src={src} alt={alt} isOpen={isViewerOpen} onClose={() => setIsViewerOpen(false)} />
    </>
  );
};

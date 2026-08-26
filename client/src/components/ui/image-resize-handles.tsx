import { useEffect, useRef, useState } from 'react';

interface ImageResizeHandlesProps {
  image: HTMLImageElement;
  onResize: (width: number, height: number) => void;
  onResizeEnd: () => void;
  aspectRatioLocked?: boolean;
}

export function ImageResizeHandles({ image, onResize, onResizeEnd, aspectRatioLocked = true }: ImageResizeHandlesProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ width: 0, height: 0 });
  const aspectRatio = useRef(1);

  useEffect(() => {
    if (image) {
      aspectRatio.current = image.naturalWidth / image.naturalHeight;
    }
  }, []);

  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    setResizeHandle(handle);

    startPos.current = { x: e.clientX, y: e.clientY };
    startSize.current = {
      width: image.offsetWidth,
      height: image.offsetHeight
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing || !resizeHandle) return;

    const deltaX = e.clientX - startPos.current.x;
    const deltaY = e.clientY - startPos.current.y;
    
    let newWidth = startSize.current.width;
    let newHeight = startSize.current.height;

    switch (resizeHandle) {
      case 'se': // Southeast corner
        newWidth = Math.max(20, startSize.current.width + deltaX);
        if (aspectRatioLocked) {
          newHeight = newWidth / aspectRatio.current;
        } else {
          newHeight = Math.max(20, startSize.current.height + deltaY);
        }
        break;
      case 'sw': // Southwest corner
        newWidth = Math.max(20, startSize.current.width - deltaX);
        if (aspectRatioLocked) {
          newHeight = newWidth / aspectRatio.current;
        } else {
          newHeight = Math.max(20, startSize.current.height + deltaY);
        }
        break;
      case 'ne': // Northeast corner
        newWidth = Math.max(20, startSize.current.width + deltaX);
        if (aspectRatioLocked) {
          newHeight = newWidth / aspectRatio.current;
        } else {
          newHeight = Math.max(20, startSize.current.height - deltaY);
        }
        break;
      case 'nw': // Northwest corner
        newWidth = Math.max(20, startSize.current.width - deltaX);
        if (aspectRatioLocked) {
          newHeight = newWidth / aspectRatio.current;
        } else {
          newHeight = Math.max(20, startSize.current.height - deltaY);
        }
        break;
      case 'e': // East side
        newWidth = Math.max(20, startSize.current.width + deltaX);
        if (aspectRatioLocked) {
          newHeight = newWidth / aspectRatio.current;
        }
        break;
      case 'w': // West side
        newWidth = Math.max(20, startSize.current.width - deltaX);
        if (aspectRatioLocked) {
          newHeight = newWidth / aspectRatio.current;
        }
        break;
      case 'n': // North side
        if (!aspectRatioLocked) {
          newHeight = Math.max(20, startSize.current.height - deltaY);
        }
        break;
      case 's': // South side
        if (!aspectRatioLocked) {
          newHeight = Math.max(20, startSize.current.height + deltaY);
        }
        break;
    }

    onResize(Math.round(newWidth), Math.round(newHeight));
  };

  const handleMouseUp = () => {
    setIsResizing(false);
    setResizeHandle(null);
    
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    onResizeEnd();
  };

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: '#007cba',
    border: '1px solid #fff',
    borderRadius: '2px',
    width: '8px',
    height: '8px',
    cursor: 'pointer',
    zIndex: 10000,
    pointerEvents: 'auto',
    userSelect: 'none'
  };

  const getHandlePosition = (handle: string) => {
    const rect = image.getBoundingClientRect();
    const editor = image.closest('[contenteditable]') as HTMLElement;
    const editorRect = editor?.getBoundingClientRect();

    if (!editorRect || !editor) return {};

    const relativeRect = {
      top: rect.top - editorRect.top + editor.scrollTop,
      left: rect.left - editorRect.left + editor.scrollLeft,
      width: rect.width,
      height: rect.height
    };

    switch (handle) {
      case 'nw':
        return { top: relativeRect.top - 4, left: relativeRect.left - 4, cursor: 'nw-resize' };
      case 'n':
        return { top: relativeRect.top - 4, left: relativeRect.left + relativeRect.width / 2 - 4, cursor: 'n-resize' };
      case 'ne':
        return { top: relativeRect.top - 4, left: relativeRect.left + relativeRect.width - 4, cursor: 'ne-resize' };
      case 'e':
        return { top: relativeRect.top + relativeRect.height / 2 - 4, left: relativeRect.left + relativeRect.width - 4, cursor: 'e-resize' };
      case 'se':
        return { top: relativeRect.top + relativeRect.height - 4, left: relativeRect.left + relativeRect.width - 4, cursor: 'se-resize' };
      case 's':
        return { top: relativeRect.top + relativeRect.height - 4, left: relativeRect.left + relativeRect.width / 2 - 4, cursor: 's-resize' };
      case 'sw':
        return { top: relativeRect.top + relativeRect.height - 4, left: relativeRect.left - 4, cursor: 'sw-resize' };
      case 'w':
        return { top: relativeRect.top + relativeRect.height / 2 - 4, left: relativeRect.left - 4, cursor: 'w-resize' };
      default:
        return {};
    }
  };

  const handles = aspectRatioLocked 
    ? ['nw', 'ne', 'se', 'sw', 'e', 'w'] // Skip north and south handles when aspect ratio is locked
    : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  return (
    <>
      {handles.map(handle => {
        const position = getHandlePosition(handle);
        return (
          <div
            key={handle}
            className="image-resize-handle"
            style={{
              ...handleStyle,
              ...position,
              cursor: position.cursor
            }}
            onMouseDown={(e) => handleMouseDown(e, handle)}
          />
        );
      })}
    </>
  );
}

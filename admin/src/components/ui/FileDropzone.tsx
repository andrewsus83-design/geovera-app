'use client';

import { useState, useCallback, DragEvent, useRef } from 'react';
import { Upload, File, Image, Video, FileText, X } from 'lucide-react';

interface FileItem {
  file: File;
  type: string;
  preview?: string;
}

interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  maxSize?: number;
  multiple?: boolean;
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return Image;
  if (type.startsWith('video/')) return Video;
  if (type.includes('pdf') || type.includes('document')) return FileText;
  return File;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileDropzone({ onFiles, accept, maxSize = 500 * 1024 * 1024, multiple = true }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileQueue, setFileQueue] = useState<FileItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const arr = Array.from(files).filter((f) => f.size <= maxSize);
      const items: FileItem[] = arr.map((file) => ({ file, type: file.type }));
      setFileQueue((prev) => [...prev, ...items]);
      onFiles(arr);
    },
    [maxSize, onFiles]
  );

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    setFileQueue((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          flex flex-col items-center justify-center gap-2 p-8
          border-2 border-dashed rounded-[var(--r5)] cursor-pointer
          transition-colors duration-150
          ${isDragging ? 'border-[var(--g5)] bg-[var(--ga8)]' : 'border-[var(--b2)] hover:border-[var(--b3)] bg-[var(--s1)]'}
        `}
      >
        <Upload className={`w-8 h-8 ${isDragging ? 'text-[var(--g5)]' : 'text-[var(--t3)]'}`} />
        <p className="text-[var(--fs-2xs)] text-[var(--t2)]">
          Drag & drop file atau <span className="text-[var(--g5)] font-medium">klik untuk browse</span>
        </p>
        <p className="text-[var(--fs-3xs)] text-[var(--t3)]">
          Maks {formatSize(maxSize)} per file
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {fileQueue.length > 0 && (
        <div className="space-y-2">
          {fileQueue.map((item, i) => {
            const Icon = getFileIcon(item.file.type);
            return (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)]"
              >
                <Icon className="w-4 h-4 text-[var(--t3)] shrink-0" />
                <span className="text-[var(--fs-2xs)] text-[var(--t1)] flex-1 truncate">{item.file.name}</span>
                <span className="text-[var(--fs-3xs)] text-[var(--t3)] shrink-0">{formatSize(item.file.size)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                  className="text-[var(--t3)] hover:text-[var(--red)] shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

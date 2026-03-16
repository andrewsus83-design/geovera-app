'use client';

import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export default function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', handleEsc);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleEsc);
      };
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`
          relative w-full ${sizeClasses[size]}
          bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r6)]
          shadow-2xl animate-in fade-in zoom-in-95 duration-200
        `}
      >
        {(title || true) && (
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              {title && <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--t1)]">{title}</h2>}
              {description && <p className="text-[var(--fs-3xs)] text-[var(--t3)] mt-1">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-[var(--r4)] hover:bg-[var(--s2)] text-[var(--t3)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 pb-5 flex items-center justify-end gap-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

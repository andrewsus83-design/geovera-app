import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface CardProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
}

export default function Card({ title, description, icon: Icon, children, className = '', headerAction }: CardProps) {
  return (
    <div className={`bg-[var(--s0)] border border-[var(--b1)] rounded-[var(--r6)] ${className}`}>
      {(title || headerAction) && (
        <div className="flex items-center justify-between px-5 pt-5 pb-0">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="w-9 h-9 rounded-[var(--r4)] bg-[var(--b1)] flex items-center justify-center">
                <Icon className="w-4 h-4 text-[var(--t2)]" />
              </div>
            )}
            <div>
              {title && <h3 className="text-[var(--fs-2xs)] font-semibold text-[var(--t1)]">{title}</h3>}
              {description && <p className="text-[var(--fs-3xs)] text-[var(--t3)] mt-0.5">{description}</p>}
            </div>
          </div>
          {headerAction}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

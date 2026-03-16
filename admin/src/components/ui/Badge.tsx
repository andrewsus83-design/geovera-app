import { ReactNode } from 'react';

type Variant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'violet';
type Size = 'sm' | 'md';

interface BadgeProps {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-[var(--b1)] text-[var(--t2)]',
  success: 'bg-[var(--ga15)] text-[var(--g4)]',
  warning: 'bg-[rgba(252,211,77,.15)] text-[var(--au)]',
  error: 'bg-[rgba(248,113,113,.15)] text-[var(--red)]',
  info: 'bg-[rgba(56,189,248,.15)] text-[var(--di)]',
  violet: 'bg-[rgba(129,140,248,.15)] text-[var(--vi)]',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-[var(--fs-3xs)]',
};

export default function Badge({ variant = 'default', size = 'md', children }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-[var(--full)]
        ${variantClasses[variant]}
        ${sizeClasses[size]}
      `}
    >
      {children}
    </span>
  );
}

'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { LucideIcon, Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-[var(--g6)] hover:bg-[var(--g7)] text-white',
  secondary: 'bg-[var(--s2)] border border-[var(--b2)] hover:bg-[var(--s3)] text-[var(--t1)]',
  ghost: 'bg-transparent hover:bg-[var(--s1)] text-[var(--t2)]',
  danger: 'bg-[rgba(248,113,113,.1)] text-[var(--red)] hover:bg-[rgba(248,113,113,.2)]',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-[var(--fs-3xs)] gap-1.5',
  md: 'h-9 px-4 text-[var(--fs-2xs)] gap-2',
  lg: 'h-11 px-6 text-[var(--fs-xs)] gap-2',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon: Icon, children, className = '', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          inline-flex items-center justify-center font-medium
          rounded-[var(--r4)] transition-colors duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
        `}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Memproses...</span>
          </>
        ) : (
          <>
            {Icon && <Icon className="w-4 h-4" />}
            {children}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;

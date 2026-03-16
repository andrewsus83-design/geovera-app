'use client';

import { InputHTMLAttributes, forwardRef, useState } from 'react';
import { LucideIcon, Eye, EyeOff } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon: Icon, type, className = '', ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-[var(--fs-3xs)] font-medium text-[var(--t2)]">
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t3)]" />
          )}
          <input
            ref={ref}
            type={inputType}
            className={`
              w-full h-9 bg-[var(--s1)] border border-[var(--b1)] rounded-[var(--r4)]
              text-[var(--fs-2xs)] text-[var(--t1)] placeholder:text-[var(--t3)]
              transition-colors duration-150
              focus:border-[var(--g6)] focus:outline-none focus:ring-1 focus:ring-[var(--g6)]
              ${Icon ? 'pl-10' : 'px-3'}
              ${isPassword ? 'pr-10' : 'pr-3'}
              ${error ? 'border-[var(--red)]' : ''}
              ${className}
            `}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t3)] hover:text-[var(--t2)]"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
        {error && <p className="text-[var(--fs-3xs)] text-[var(--red)]">{error}</p>}
        {hint && !error && <p className="text-[var(--fs-3xs)] text-[var(--t3)]">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;

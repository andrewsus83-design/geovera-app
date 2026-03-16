'use client';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export default function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <label className={`flex items-center justify-between gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      {(label || description) && (
        <div className="flex-1">
          {label && <span className="text-[var(--fs-2xs)] text-[var(--t1)] font-medium">{label}</span>}
          {description && <p className="text-[var(--fs-3xs)] text-[var(--t3)] mt-0.5">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200
          ${checked ? 'bg-[var(--g6)]' : 'bg-[var(--s3)]'}
        `}
      >
        <span
          className={`
            inline-block h-4 w-4 rounded-full bg-white shadow-sm
            transform transition-transform duration-200 mt-0.5
            ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}
          `}
        />
      </button>
    </label>
  );
}

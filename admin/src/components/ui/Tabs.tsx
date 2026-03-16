'use client';

import { LucideIcon } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export default function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--b1)]">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              relative flex items-center gap-2 px-4 py-2.5 text-[var(--fs-2xs)] font-medium
              transition-colors duration-150
              ${isActive ? 'text-[var(--g4)]' : 'text-[var(--t2)] hover:text-[var(--t1)]'}
            `}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`
                  px-1.5 py-0.5 rounded-[var(--full)] text-[10px] font-medium
                  ${isActive ? 'bg-[var(--ga15)] text-[var(--g4)]' : 'bg-[var(--b1)] text-[var(--t3)]'}
                `}
              >
                {tab.count}
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--g5)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}

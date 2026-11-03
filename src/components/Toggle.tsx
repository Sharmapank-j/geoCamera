// src/components/Toggle.tsx
import React from 'react';
import { triggerHaptic } from '@/lib/feedback';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  badge?: string;
  size?: 'sm' | 'md';
}

export default function Toggle({
  checked,
  onChange,
  label,
  description,
  icon,
  disabled = false,
  badge,
  size = 'md',
}: ToggleProps) {
  const handleToggle = () => {
    if (disabled) return;
    triggerHaptic('selection');
    onChange(!checked);
  };

  const isSmall = size === 'sm';
  const trackWidth = isSmall ? 'w-9 h-5' : 'w-12 h-6.5';
  const thumbSize = isSmall ? 'w-4 h-4' : 'w-5 h-5';
  const thumbTranslate = isSmall ? 'translate-x-4' : 'translate-x-5.5';

  return (
    <div
      onClick={handleToggle}
      role="switch"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handleToggle();
        }
      }}
      className={`group flex items-center justify-between select-none py-1.5 transition-all ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      {(label || icon) && (
        <div className="flex items-center gap-3 pr-4">
          {icon && (
            <div
              className={`p-2 rounded-xl transition-colors ${
                checked
                  ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-400/20 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              {icon}
            </div>
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {label}
              </span>
              {badge && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                {description}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Pill Switch */}
      <div
        className={`relative inline-flex items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out shrink-0 ${trackWidth} ${
          checked
            ? 'bg-blue-600 shadow-sm shadow-blue-500/30'
            : 'bg-gray-300 dark:bg-gray-700'
        }`}
      >
        <span
          className={`pointer-events-none inline-block rounded-full bg-white shadow-md transform transition-transform duration-200 ease-spring ${thumbSize} ${
            checked ? thumbTranslate : 'translate-x-0.5'
          }`}
        />
      </div>
    </div>
  );
}

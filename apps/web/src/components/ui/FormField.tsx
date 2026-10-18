import React from 'react';

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  id,
  label,
  error,
  helperText,
  required = false,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-slate-800 tracking-tight"
        >
          {label}
          {required && <span className="ml-1 text-red-600 font-bold">*</span>}
        </label>
      </div>

      <div>{children}</div>

      {helperText && !error && (
        <p id={`${id}-helper`} className="text-[11px] text-slate-500">
          {helperText}
        </p>
      )}

      {error && (
        <p id={`${id}-error`} className="text-[11px] font-medium text-red-600 flex items-center gap-1">
          <span className="inline-block h-1 w-1 rounded-full bg-red-600" />
          {error}
        </p>
      )}
    </div>
  );
};

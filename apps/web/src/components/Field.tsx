import type { ChangeEvent, ReactNode } from 'react';

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'datetime-local';
  suffix?: ReactNode;
  step?: string;
}

export function Field({ label, value, onChange, type = 'text', suffix, step }: FieldProps) {
  const id = `field-${label.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      <div className="field-input-wrap">
        <input id={id} value={value} type={type} step={step} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)} />
        {suffix ? <span className="field-suffix">{suffix}</span> : null}
      </div>
    </div>
  );
}

interface ToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <label className="toggle-row">
      <span className="toggle-copy"><strong>{label}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle" aria-hidden="true"><span /></span>
    </label>
  );
}

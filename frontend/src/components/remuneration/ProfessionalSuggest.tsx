'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Professional } from '@/types/remuneration';
import { Input } from '@/components/ui/Field';

type Props = {
  value: string;
  onChange: (name: string) => void;
  onSelect: (professional: Professional) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
};

export function ProfessionalSuggest({
  value,
  onChange,
  onSelect,
  label = 'Name of the Examiner / Paper Setter',
  error,
  disabled,
}: Props) {
  const [suggestions, setSuggestions] = useState<Professional[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      void api
        .suggestProfessionals(q, 8)
        .then((rows) => {
          setSuggestions(rows);
          setOpen(rows.length > 0);
        })
        .catch(() => {
          setSuggestions([]);
          setOpen(false);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  return (
    <div ref={wrapRef} className="relative">
      <Input
        label={label}
        value={value}
        disabled={disabled}
        error={error}
        hint={
          loading
            ? 'Searching professionals…'
            : 'Type a name to suggest saved professionals and pre-fill details'
        }
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length) setOpen(true);
        }}
      />
      {open && suggestions.length > 0 ? (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-white py-1 shadow-[var(--shadow-md)]">
          {suggestions.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-[var(--primary-soft)]"
                onClick={() => {
                  onSelect(p);
                  setOpen(false);
                }}
              >
                <span className="text-xs font-semibold text-slate-900">
                  {p.name}
                </span>
                <span className="text-[0.6875rem] text-[var(--muted)]">
                  {[p.designation, p.organization].filter(Boolean).join(' · ') ||
                    'No designation on file'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

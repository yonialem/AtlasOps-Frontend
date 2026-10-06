/**
 * ============================================================================
 * AtlasOps Incident Management Console - Debounced Search Input
 * ============================================================================
 * File: src/components/filters/SearchInput.tsx
 * High-performance search input with 300ms debounce, external prop sync,
 * clear button (×), debouncing indicator, and global '/' shortcut focus.
 */

import { useState, useEffect, useRef } from "react";
import { Search, RefreshCw } from "lucide-react";

export interface SearchInputProps {
  value: string;
  onChange: (query: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search incidents by ID, title, service, assignee... (Press '/' to focus)",
  disabled = false,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState<string>(value);
  const [isDebouncing, setIsDebouncing] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localValueRef = useRef<string>(localValue);
  localValueRef.current = localValue;

  // Synchronize internal local value when external value changes (e.g. URL update or Clear All)
  useEffect(() => {
    const isFocused =
      typeof document !== "undefined" && document.activeElement === inputRef.current;

    // Only synchronize if value changed and either input is not focused or it's an external clear
    if (value !== localValueRef.current && (!isFocused || value === "")) {
      setLocalValue(value);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setIsDebouncing(false);
    }
  }, [value]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Global '/' keyboard shortcut focus management
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activeEl = document.activeElement;
        const tagName = activeEl?.tagName?.toUpperCase();
        const isEditable =
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT" ||
          (activeEl as HTMLElement | null)?.isContentEditable;

        if (!isEditable) {
          e.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [disabled]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    setLocalValue(nextVal);
    setIsDebouncing(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setIsDebouncing(false);
      debounceTimerRef.current = null;
      onChange(nextVal);
    }, 300);
  };

  const handleClear = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setIsDebouncing(false);
    setLocalValue("");
    onChange("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setIsDebouncing(false);
      setLocalValue("");
      onChange("");
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative flex items-center w-full" role="search">
      <Search
        className="absolute left-3.5 w-4 h-4 text-txt-secondary pointer-events-none select-none"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Search incidents"
        className="w-full pl-10 pr-16 py-2 bg-surface-elevated border border-border-subtle rounded-lg text-xs sm:text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[44px]"
      />
      <div className="absolute right-2.5 flex items-center gap-1.5">
        {isDebouncing && (
          <RefreshCw
            className="w-3.5 h-3.5 text-blue-400 animate-spin"
            aria-hidden="true"
            data-testid="search-debounce-spinner"
          />
        )}
        {localValue.length > 0 && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            title="Clear search"
            className="p-1 rounded-md text-txt-secondary hover:text-txt-primary hover:bg-surface focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
          >
            <span aria-hidden="true" className="text-base leading-none font-bold select-none">
              &times;
            </span>
            <span className="sr-only">Clear search</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default SearchInput;

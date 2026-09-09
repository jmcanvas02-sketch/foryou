/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from "react";
import type { AddressOption } from "../../types/address";

type SearchableAddressSelectProps = {
  label: string;
  value: string;
  options: AddressOption[];
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  onChange: (value: string) => void;
  onTouched: () => void;
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .trim();
}

export default function SearchableAddressSelect({
  label,
  value,
  options,
  placeholder,
  disabled = false,
  loading = false,
  error = "",
  onChange,
  onTouched,
}: SearchableAddressSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const filteredOptions = useMemo(() => {
    const keyword = normalizeSearch(query);

    if (!keyword || query === value) {
      return options.slice(0, 100);
    }

    return options
      .filter((option) => normalizeSearch(option.name).includes(keyword))
      .slice(0, 100);
  }, [options, query, value]);

  return (
    <div ref={rootRef} className="relative">
      <label className="block text-sm font-bold">
        {label} <span className="text-[#a43c12]">*</span>
      </label>

      <div className="relative mt-2">
        <input
          value={query}
          disabled={disabled || loading}
          autoComplete="off"
          onFocus={(event) => {
            onTouched();
            setOpen(true);
            event.currentTarget.select();
          }}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(true);

            if (nextQuery !== value) {
              onChange("");
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className={`h-12 w-full rounded-2xl border bg-[#f7f9ff] px-4 pr-11 font-normal outline-none transition ${
            error
              ? "border-[#d9512c] focus:border-[#d9512c]"
              : "border-[#bfc7d2] focus:border-[#006397]"
          } disabled:cursor-not-allowed disabled:bg-[#edf0f3] disabled:text-[#8a929a]`}
          placeholder={
            loading
              ? "Đang tải dữ liệu..."
              : disabled
                ? "Chọn cấp trước"
                : placeholder
          }
          aria-invalid={Boolean(error)}
        />

        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || loading}
          onClick={() => {
            onTouched();
            setOpen((current) => !current);
          }}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#006397] disabled:text-[#9aa1a8]"
          aria-label={`Mở danh sách ${label}`}
        >
          ▾
        </button>
      </div>

      {open && !disabled && !loading && (
        <div className="absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-[#cbd5df] bg-white p-2 shadow-[0_18px_45px_-18px_rgba(0,41,64,0.45)]">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option.code}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuery(option.name);
                  onChange(option.name);
                  onTouched();
                  setOpen(false);
                }}
                className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[#edf4ff] ${
                  option.name === value
                    ? "bg-[#edf4ff] font-bold text-[#006397]"
                    : "text-[#20272d]"
                }`}
              >
                {option.name}
              </button>
            ))
          ) : (
            <p className="px-3 py-4 text-center text-sm text-[#707881]">
              Không tìm thấy địa chỉ phù hợp.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs font-semibold text-[#a43c12]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
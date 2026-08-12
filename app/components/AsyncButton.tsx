"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type AsyncButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingText?: ReactNode;
};

export default function AsyncButton({
  children,
  disabled,
  loading = false,
  loadingText = "Memproses...",
  ...props
}: AsyncButtonProps) {
  return (
    <button {...props} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading && <span className="loading-spinner" aria-hidden="true" />}
      <span>{loading ? loadingText : children}</span>
    </button>
  );
}

export const ADMIN_VIEWS = ["summary", "stations", "products", "accounts", "locks", "qc", "audit"] as const;

export type AdminView = (typeof ADMIN_VIEWS)[number];

export function adminViewFromSearchParam(value: string | null): AdminView {
  return ADMIN_VIEWS.includes(value as AdminView) ? value as AdminView : "summary";
}

export function adminViewHref(view: AdminView) {
  return `/admin?view=${view}`;
}

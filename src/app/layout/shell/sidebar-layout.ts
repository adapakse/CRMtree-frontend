export interface NavItem {
  id: string;
  route: string;
  labelKey: string;
  tipKey?: string;
  isVisible: () => boolean;
  badge?: () => number;
  /** Replaces routerLinkActive for routes whose prefix belongs to another item. */
  isActive?: () => boolean;
}

export interface NavSection {
  id: string;
  labelKey: string;
  isVisible: () => boolean;
  items: NavItem[];
}

/** A user's own menu: item order inside each section and the items they hid. */
export interface SidebarLayout {
  order: Record<string, string[]>;
  hidden: string[];
}

const EMPTY_LAYOUT: SidebarLayout = { order: {}, hidden: [] };
const storageKey = (userId: string) => `sidebar_layout_${userId}`;

export function loadSidebarLayout(userId: string | undefined): SidebarLayout {
  if (!userId) return EMPTY_LAYOUT;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return EMPTY_LAYOUT;
    const order = parsed.order && typeof parsed.order === 'object' ? parsed.order : {};
    const hidden = Array.isArray(parsed.hidden) ? parsed.hidden.filter((id: unknown) => typeof id === 'string') : [];
    return { order, hidden };
  } catch {
    return EMPTY_LAYOUT;
  }
}

export function saveSidebarLayout(userId: string | undefined, layout: SidebarLayout): void {
  if (!userId) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(layout));
  } catch { /* storage blocked: the change lasts only for this page view */ }
}

/** Saved order first; items the user never ordered (e.g. a module enabled later) keep their default order at the end. */
export function orderItems(items: NavItem[], savedOrder: string[] | undefined): NavItem[] {
  if (!savedOrder?.length) return items;
  const rank = new Map(savedOrder.map((id, index) => [id, index]));
  return items
    .map((item, defaultIndex) => ({ item, key: rank.get(item.id) ?? savedOrder.length + defaultIndex }))
    .sort((a, b) => a.key - b.key)
    .map(entry => entry.item);
}

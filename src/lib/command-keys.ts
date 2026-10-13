// Slash focuses the box, the way a search field does. It stays out of the way
// when a modifier is held, or when the key would land in something already
// being typed.
type KeyTarget = EventTarget | { tagName?: unknown; isContentEditable?: unknown } | null;

const isTyping = (target: KeyTarget): boolean => {
  if (target === null || typeof target !== "object") return false;
  if (!("tagName" in target) || typeof target.tagName !== "string") return false;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  return "isContentEditable" in target && target.isContentEditable === true;
};

export const wantsCommand = (event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  target: KeyTarget;
}): boolean => {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return false;
  return !isTyping(event.target);
};

// Moment search already advertises `/`. The box must not take that key.
export const commandTakesSlash = (
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    target: KeyTarget;
  },
  searchClaimsSlash: boolean,
): boolean => {
  return wantsCommand(event) && !searchClaimsSlash;
};

type ShortcutRoot = {
  querySelectorAll: (selector: string) => Iterable<{ getAttribute: (name: string) => string | null }>;
};

export const pageClaimsSlash = (root: ShortcutRoot | undefined = globalThis.document): boolean => {
  if (root === undefined || typeof root.querySelectorAll !== "function") return false;
  const nodes = root.querySelectorAll("[aria-keyshortcuts]");
  for (const node of nodes) {
    const shortcuts = node.getAttribute("aria-keyshortcuts") ?? "";
    if (shortcuts.split(/\s+/).includes("/")) return true;
  }
  return false;
};

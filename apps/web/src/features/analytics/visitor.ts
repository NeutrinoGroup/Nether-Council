const storageKey = "nc_visitor_id";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Without persistent storage there is no reliable cross-session device identity.
export function getVisitorId(): string | undefined {
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing && uuid.test(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(storageKey, id);
    return localStorage.getItem(storageKey) === id ? id : undefined;
  } catch {
    return undefined;
  }
}

import Fuse from "fuse.js";

export function fuzzyFilter<T>(items: T[], keys: Array<keyof T & string>, query: string): T[] {
  if (!query) return items;
  const fuse = new Fuse(items, { keys, threshold: 0.4, includeScore: false });
  return fuse.search(query).map((r) => r.item);
}

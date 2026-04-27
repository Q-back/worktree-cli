import Fuse from "fuse.js";
import { useMemo } from "react";

export function useFuzzy<T>(items: T[], keys: Array<keyof T & string>, query: string): T[] {
  const fuse = useMemo(
    () => new Fuse(items, { keys, threshold: 0.4, includeScore: false }),
    [items, keys],
  );

  return useMemo(() => {
    if (!query) return items;
    return fuse.search(query).map((r) => r.item);
  }, [fuse, query, items]);
}

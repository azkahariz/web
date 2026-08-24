export function createStationCompletionDetailCache<T>() {
  const values = new Map<string, T>();
  const requests = new Map<string, Promise<T>>();

  return {
    get(stationId: string) {
      return values.get(stationId);
    },
    load(stationId: string, loader: () => Promise<T>, force = false) {
      const cached = values.get(stationId);
      if (!force && values.has(stationId)) return Promise.resolve(cached as T);
      const pending = requests.get(stationId);
      if (pending) return pending;

      const request = loader().then((value) => {
        values.set(stationId, value);
        return value;
      }).finally(() => requests.delete(stationId));
      requests.set(stationId, request);
      return request;
    },
    invalidate(stationId?: string) {
      if (stationId) values.delete(stationId);
      else values.clear();
    },
  };
}

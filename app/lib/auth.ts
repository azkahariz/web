export const STATION_EMAIL_DOMAIN = "stations.aloptama.internal";

export function normalizeUsername(value: string) {
  return value.trim().toLocaleLowerCase("id-ID").replace(/[^a-z0-9._-]+/g, "-");
}

export function stationEmailForUsername(username: string) {
  return `${normalizeUsername(username)}@${STATION_EMAIL_DOMAIN}`;
}

export type StationAccount = {
  id: string;
  stationId: string;
  stationName: string;
  username: string;
};


export type Coordinates = [number, number];

export type SignalCategory = "good" | "medium" | "bad" | "deadzone";
export type StabilityCategory = "stable" | "good" | "unregular" | "0";
export type ViewMode = "markers" | "heatmap" | "hexagon";
export type CalculationMode = "stabilized" | "raw";

export type PingProperties = {
  boardID: number | string;
  counter: number;
  gateway?: string;
  rssi: number;
  snr?: number;
  time: string;
  rssi_stabilized?: number;
  rssi_bonus?: number;
};

export type PingFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: Coordinates;
  };
  properties: PingProperties;
};

export type PingFeatureCollection = {
  type: "FeatureCollection";
  features: PingFeature[];
};

export type RestrictedHexagon = {
  corners: Coordinates[];
  avg: number;
  fillColor: string;
};

export type PingSummary = {
  totalFeatures: number;
  validFeatures: number;
  boardCounts: Record<string, number>;
  gatewayCounts: Record<string, number>;
  latestTimestamp: string | null;
  earliestTimestamp: string | null;
};

export type UpdateResult = {
  status: "ok" | "cached" | "error";
  added: number;
  updated: number;
  total: number;
  features?: PingFeature[];
  message?: string;
};

export type UserRole = "admin" | "user";

export type SessionUser = {
  id: number;
  username: string;
  role: UserRole;
  assignedBoardIds: string[];
};

export type ManagedUser = SessionUser & {
  createdAt: string;
  auth_type: "local" | "oauth";
  oauth_provider: string | null;
  oauth_subject: string | null;
};

export type CreateUserPayload = {
  username: string;
  password: string;
  role: UserRole;
  assignedBoardIds: string[];
};

export type UpdateUserPayload = {
  username: string;
  role: UserRole;
  assignedBoardIds: string[];
};

export type AuthenticatedDatasetResponse = {
  accessMode: "authenticated";
  collection: PingFeatureCollection;
  summary: PingSummary;
  nextUpdateInSeconds: number;
};

export type GuestDatasetResponse = {
  accessMode: "guest";
  restrictedHexagons: RestrictedHexagon[];
  summary: PingSummary;
  nextUpdateInSeconds: number;
};

export type DatasetResponse = AuthenticatedDatasetResponse | GuestDatasetResponse;


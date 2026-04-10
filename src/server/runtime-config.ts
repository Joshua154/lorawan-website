import { listAppConfigEntries, saveAppConfigEntries } from "@/server/database";

export type RuntimeConfigDefinition = {
  key: string;
  label: string;
  description: string;
  sensitive?: boolean;
  requiresRestart?: boolean;
};

export const RUNTIME_CONFIG_DEFINITIONS: RuntimeConfigDefinition[] = [
  {
    key: "DATABASE_URL",
    label: "Database URL",
    description: "PostgreSQL connection string.",
    sensitive: true,
    requiresRestart: true,
  },
  {
    key: "APP_URL",
    label: "App URL",
    description: "Trusted origin for request origin validation.",
  },
  {
    key: "NEXT_PUBLIC_APP_URL",
    label: "Public App URL",
    description: "Fallback trusted origin when APP_URL is unset.",
  },
  {
    key: "NEXTAUTH_URL",
    label: "NextAuth URL",
    description: "Canonical public URL used by Auth.js.",
    requiresRestart: true,
  },
  {
    key: "AUTH_URL",
    label: "Auth URL",
    description: "Optional explicit Auth.js URL including auth path.",
    requiresRestart: true,
  },
  {
    key: "AUTH_TRUST_HOST",
    label: "Auth Trust Host",
    description: "Trust forwarded host/proto headers for Auth.js.",
    requiresRestart: true,
  },
  {
    key: "NEXT_PUBLIC_BASE_PATH",
    label: "Base Path",
    description: "Application base path (e.g. /lorawan).",
    requiresRestart: true,
  },
  {
    key: "AUTH_SECRET",
    label: "Auth Secret",
    description: "Secret used by Auth.js/NextAuth.",
    sensitive: true,
    requiresRestart: true,
  },
  {
    key: "KEYCLOAK_ID",
    label: "Keycloak Client ID",
    description: "OIDC client id for Keycloak provider.",
    requiresRestart: true,
  },
  {
    key: "KEYCLOAK_SECRET",
    label: "Keycloak Client Secret",
    description: "OIDC client secret for Keycloak provider.",
    sensitive: true,
    requiresRestart: true,
  },
  {
    key: "KEYCLOAK_ISSUER",
    label: "Keycloak Issuer",
    description: "Keycloak realm issuer URL.",
    requiresRestart: true,
  },
  {
    key: "KEYCLOAK_ADMIN_ROLE",
    label: "Keycloak Admin Role",
    description: "Role mapped to admin privileges (default: lorawan-admin).",
  },
  {
    key: "LORAWAN_ADMIN_USERNAME",
    label: "Bootstrap Admin Username",
    description: "Initial admin username used when no admin user exists.",
    requiresRestart: true,
  },
  {
    key: "LORAWAN_ADMIN_PASSWORD",
    label: "Bootstrap Admin Password",
    description: "Initial admin password used when no admin user exists.",
    sensitive: true,
    requiresRestart: true,
  },
  {
    key: "LORAWAN_LOG_URL",
    label: "Remote Log URL",
    description: "Remote log endpoint used by fallback ingestion.",
  },
  {
    key: "MQTT_BROKER",
    label: "ChirpStack MQTT Broker",
    description: "ChirpStack MQTT broker hostname.",
    requiresRestart: true,
  },
  {
    key: "MQTT_PORT",
    label: "ChirpStack MQTT Port",
    description: "ChirpStack MQTT broker port.",
    requiresRestart: true,
  },
  {
    key: "MQTT_USERNAME",
    label: "ChirpStack MQTT Username",
    description: "ChirpStack MQTT username.",
    requiresRestart: true,
  },
  {
    key: "MQTT_PASSWORD",
    label: "ChirpStack MQTT Password",
    description: "ChirpStack MQTT password.",
    sensitive: true,
    requiresRestart: true,
  },
  {
    key: "MQTT_TOPIC",
    label: "ChirpStack MQTT Topic",
    description: "ChirpStack MQTT subscription topic.",
    requiresRestart: true,
  },
  {
    key: "TTN_MQTT_BROKER",
    label: "TTN MQTT Broker",
    description: "TTN MQTT broker hostname.",
    requiresRestart: true,
  },
  {
    key: "TTN_MQTT_PORT",
    label: "TTN MQTT Port",
    description: "TTN MQTT broker port.",
    requiresRestart: true,
  },
  {
    key: "TTN_MQTT_USERNAME",
    label: "TTN MQTT Username",
    description: "TTN MQTT username.",
    requiresRestart: true,
  },
  {
    key: "TTN_MQTT_PASSWORD",
    label: "TTN MQTT Password",
    description: "TTN MQTT password/API key.",
    sensitive: true,
    requiresRestart: true,
  },
  {
    key: "TTN_MQTT_TOPIC",
    label: "TTN MQTT Topic",
    description: "TTN MQTT subscription topic.",
    requiresRestart: true,
  },
  {
    key: "RELEASE_TIMESTAMP",
    label: "Release Timestamp",
    description: "ISO timestamp controlling guest visibility release.",
  },
];

const VALID_KEYS = new Set(RUNTIME_CONFIG_DEFINITIONS.map((entry) => entry.key));
const CACHE_TTL_MS = 10_000;
const BASE_ENV_VALUES = new Map(
  RUNTIME_CONFIG_DEFINITIONS.map((entry) => [entry.key, process.env[entry.key]?.trim()]),
);

let cachedOverrides: Map<string, string> | null = null;
let cacheExpiresAt = 0;

export type RuntimeConfigEntry = RuntimeConfigDefinition & {
  value: string;
  source: "database" | "environment" | "default";
};

function sanitizeConfigValue(value: string): string {
  return value.trim();
}

async function loadOverrides(force = false): Promise<Map<string, string>> {
  const now = Date.now();

  if (!force && cachedOverrides && now < cacheExpiresAt) {
    return cachedOverrides;
  }

  const rows = await listAppConfigEntries();
  const map = new Map<string, string>();

  for (const row of rows) {
    if (!VALID_KEYS.has(row.key)) {
      continue;
    }

    const sanitized = sanitizeConfigValue(row.value);

    if (!sanitized) {
      continue;
    }

    map.set(row.key, sanitized);
    process.env[row.key] = sanitized;
  }

  cachedOverrides = map;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return map;
}

export function isRuntimeConfigKey(key: string): boolean {
  return VALID_KEYS.has(key);
}

export async function getRuntimeConfigValue(key: string): Promise<string | undefined> {
  if (!isRuntimeConfigKey(key)) {
    return process.env[key]?.trim();
  }

  const overrides = await loadOverrides();
  const override = overrides.get(key);

  if (override) {
    process.env[key] = override;
    return override;
  }

  const envValue = process.env[key]?.trim();
  return envValue || undefined;
}

export async function listRuntimeConfigEntries(): Promise<RuntimeConfigEntry[]> {
  const overrides = await loadOverrides();

  return RUNTIME_CONFIG_DEFINITIONS.map((definition) => {
    const databaseValue = overrides.get(definition.key);
    const envValue = process.env[definition.key]?.trim();
    const value = databaseValue ?? envValue ?? "";

    return {
      ...definition,
      value,
      source: databaseValue ? "database" : envValue ? "environment" : "default",
    };
  });
}

export async function saveRuntimeConfigEntries(entries: Array<{ key: string; value: string }>): Promise<void> {
  const normalizedEntries: Array<{ key: string; value: string }> = [];

  for (const entry of entries) {
    if (!isRuntimeConfigKey(entry.key)) {
      throw new Error(`Unsupported configuration key: ${entry.key}`);
    }

    const sanitized = sanitizeConfigValue(entry.value ?? "");

    if (!sanitized) {
      continue;
    }

    normalizedEntries.push({ key: entry.key, value: sanitized });
  }

  await saveAppConfigEntries(normalizedEntries);

  const nextOverrides = new Map(normalizedEntries.map((entry) => [entry.key, entry.value]));

  for (const definition of RUNTIME_CONFIG_DEFINITIONS) {
    const override = nextOverrides.get(definition.key);

    if (override) {
      process.env[definition.key] = override;
      continue;
    }

    const baseValue = BASE_ENV_VALUES.get(definition.key);

    if (baseValue) {
      process.env[definition.key] = baseValue;
      continue;
    }

    delete process.env[definition.key];
  }

  cachedOverrides = nextOverrides;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
}

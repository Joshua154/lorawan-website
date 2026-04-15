import mqtt from "mqtt";
import { uploadManualPings } from "@/server/ping-service";
import { queryPingTimes } from "@/server/database";
import type { PingFeature, PingNetwork } from "@/lib/types";

// ── Common intermediate type ────────────────────────────────────────────────

type ParsedMqttUplink = {
  network: PingNetwork;
  boardID: number;
  gatewayId: string;
  rssi: number;
  snr: number | null;
  baseTime: number;
  pings: Array<{ counter: number; latitude: number; longitude: number }>;
};

// ── Parsers ─────────────────────────────────────────────────────────────────

function parseChirpStackMessage(raw: unknown): ParsedMqttUplink | null {
  const payload = raw as Record<string, any>;
  const decoded = payload.object;
  if (!decoded?.pings || decoded.pings.length === 0) return null;

  return {
    network: "chirpstack",
    boardID: decoded.boardID,
    gatewayId: payload.rxInfo?.[0]?.gatewayId ?? "chirpstack",
    rssi: payload.rxInfo?.[0]?.rssi ?? -1,
    snr: payload.rxInfo?.[0]?.snr ?? null,
    baseTime: Date.parse(payload.time ?? "") || Date.now(),
    pings: decoded.pings,
  };
}

function parseTtnMessage(raw: unknown): ParsedMqttUplink | null {
  const payload = raw as Record<string, any>;
  const uplink = payload.uplink_message;
  if (!uplink) return null;

  const decoded = uplink.decoded_payload;
  if (!decoded?.pings || decoded.pings.length === 0) return null;

  const rxMeta = uplink.rx_metadata?.[0];

  return {
    network: "ttn",
    boardID: decoded.boardID,
    gatewayId: rxMeta?.gateway_ids?.gateway_id ?? "ttn",
    rssi: rxMeta?.rssi ?? -1,
    snr: rxMeta?.snr ?? null,
    baseTime: Date.parse(payload.received_at ?? "") || Date.now(),
    pings: decoded.pings,
  };
}

// ── Shared processing ───────────────────────────────────────────────────────

async function processUplink(uplink: ParsedMqttUplink, topic: string, label: string): Promise<void> {
  const { network, boardID, gatewayId, rssi, snr, baseTime, pings } = uplink;

  const validPings = pings
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.latitude !== 0 || p.longitude !== 0);

  const funklochCounters = validPings.filter(({ i }) => i > 0).map(({ p }) => Number(p.counter));
  const existingTimes = await queryPingTimes(String(boardID), funklochCounters, network);

  // DEBUG: Log what's happening with historic pings
  console.log(`[DEBUG-MQTT] board=${boardID} network=${network} current=${validPings[0]?.p.counter} historic=[${funklochCounters.join(",")}] inDB=[${[...existingTimes.keys()].join(",")}] willFunkloch=[${funklochCounters.filter((c) => !existingTimes.has(c)).join(",")}]`);

  let anchor = baseTime;
  let funklochOffset = 0;

  const features: PingFeature[] = validPings.map(({ p, i }) => {
    let time: string;

    if (i === 0) {
      anchor = baseTime;
      funklochOffset = 0;
      time = new Date(baseTime).toISOString();
    } else if (existingTimes.has(Number(p.counter))) {
      anchor = existingTimes.get(Number(p.counter))!;
      funklochOffset = 0;
      time = new Date(anchor).toISOString();
    } else {
      funklochOffset += 1;
      time = new Date(anchor - funklochOffset * 1000).toISOString();
    }

    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
      properties: {
        boardID,
        counter: p.counter,
        gateway: i === 0 ? gatewayId : "Funkloch-Upload (LoRaWAN)",
        rssi: i === 0 ? rssi : -1,
        snr: i === 0 ? (snr ?? undefined) : undefined,
        time,
        network,
      },
    };
  });

  const result = await uploadManualPings(features);
  console.log(`${label} [${topic}]: +${result.added} neu, ${result.updated} aktualisiert (features sent: ${features.length})`);
}

// ── Client factory ──────────────────────────────────────────────────────────

type MqttListenerConfig = {
  name: string;
  broker: string;
  port: string;
  username: string;
  password: string;
  topic: string;
  rejectUnauthorized: boolean;
  parseMessage: (raw: unknown) => ParsedMqttUplink | null;
};

function createMqttListener(config: MqttListenerConfig): void {
  const client = mqtt.connect(`mqtts://${config.broker}:${config.port}`, {
    username: config.username,
    password: config.password,
    rejectUnauthorized: config.rejectUnauthorized,
  });

  client.on("connect", () => {
    console.log(`${config.name} verbunden mit ${config.broker}:${config.port}`);
    client.subscribe(config.topic);
  });

  client.on("message", async (topic, message) => {
    try {
      const raw = JSON.parse(message.toString());
      const uplink = config.parseMessage(raw);
      if (!uplink) return;
      await processUplink(uplink, topic, config.name);
    } catch (err) {
      console.error(`${config.name} Verarbeitungsfehler:`, err);
    }
  });

  client.on("error", (err) => {
    console.error(`${config.name} Fehler:`, err);
  });
}

// ── Initialization ──────────────────────────────────────────────────────────

// ChirpStack
const CS_BROKER   = process.env.MQTT_BROKER;
const CS_PORT     = process.env.MQTT_PORT ?? "8883";
const CS_USERNAME = process.env.MQTT_USERNAME;
const CS_PASSWORD = process.env.MQTT_PASSWORD;
const CS_TOPIC    = process.env.MQTT_TOPIC ?? "application/57d96532-0c82-4f98-98f1-1778323c3e08/#";

if (!CS_BROKER || !CS_USERNAME || !CS_PASSWORD) {
  console.warn("ChirpStack MQTT: MQTT_BROKER, MQTT_USERNAME oder MQTT_PASSWORD fehlen – Listener wird nicht gestartet.");
} else {
  createMqttListener({
    name: "ChirpStack MQTT",
    broker: CS_BROKER,
    port: CS_PORT,
    username: CS_USERNAME,
    password: CS_PASSWORD,
    topic: CS_TOPIC,
    rejectUnauthorized: false,
    parseMessage: parseChirpStackMessage,
  });
}

// TTN
const TTN_BROKER   = process.env.TTN_MQTT_BROKER;
const TTN_PORT     = process.env.TTN_MQTT_PORT ?? "8883";
const TTN_USERNAME = process.env.TTN_MQTT_USERNAME;
const TTN_PASSWORD = process.env.TTN_MQTT_PASSWORD;
const TTN_TOPIC    = process.env.TTN_MQTT_TOPIC;

if (!TTN_BROKER || !TTN_USERNAME || !TTN_PASSWORD || !TTN_TOPIC) {
  console.warn("TTN MQTT: TTN_MQTT_BROKER, TTN_MQTT_USERNAME, TTN_MQTT_PASSWORD oder TTN_MQTT_TOPIC fehlen – Listener wird nicht gestartet.");
} else {
  createMqttListener({
    name: "TTN MQTT",
    broker: TTN_BROKER,
    port: TTN_PORT,
    username: TTN_USERNAME,
    password: TTN_PASSWORD,
    topic: TTN_TOPIC,
    rejectUnauthorized: true,
    parseMessage: parseTtnMessage,
  });
}

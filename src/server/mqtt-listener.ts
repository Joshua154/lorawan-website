import mqtt from "mqtt";
import { uploadManualPings } from "@/server/ping-service";
import { queryPingTimes } from "@/server/database";
import type { PingFeature } from "@/lib/types";

const MQTT_BROKER   = process.env.MQTT_BROKER;
const MQTT_PORT     = process.env.MQTT_PORT ?? "8883";
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const MQTT_TOPIC    = process.env.MQTT_TOPIC ?? "application/57d96532-0c82-4f98-98f1-1778323c3e08/#";

if (!MQTT_BROKER || !MQTT_USERNAME || !MQTT_PASSWORD) {
  console.warn("MQTT: MQTT_BROKER, MQTT_USERNAME oder MQTT_PASSWORD fehlen in .env.local – MQTT-Listener wird nicht gestartet.");
} else {

const client = mqtt.connect(`mqtts://${MQTT_BROKER}:${MQTT_PORT}`, {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  rejectUnauthorized: false,
});

client.on("connect", () => {
  console.log(`MQTT verbunden mit ${MQTT_BROKER}:${MQTT_PORT}`);
  client.subscribe(MQTT_TOPIC);
});

client.on("message", async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());

    const decoded = payload.object;
    if (!decoded?.pings || decoded.pings.length === 0) return;

    const gatewayId = payload.rxInfo?.[0]?.gatewayId ?? "chirpstack";
    const rssi      = payload.rxInfo?.[0]?.rssi ?? -1;
    const snr       = payload.rxInfo?.[0]?.snr ?? null;
    const baseTime  = Date.parse(payload.time ?? "") || Date.now();
    const boardID   = decoded.boardID;

    const validPings: Array<{ p: any; i: number }> = decoded.pings
      .map((p: any, i: number) => ({ p, i }))
      .filter(({ p }: { p: any }) => p.latitude !== 0 || p.longitude !== 0);

    const funklochCounters = validPings.filter(({ i }) => i > 0).map(({ p }) => Number(p.counter));
    const existingTimes = await queryPingTimes(String(boardID), funklochCounters, "chirpstack");

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
          rssi:    i === 0 ? rssi : -1,
          snr:     i === 0 ? snr : undefined,
          time,
          network: "chirpstack" as const,
        },
      };
    });

    const result = await uploadManualPings(features);
    console.log(`MQTT [${topic}]: +${result.added} neu, ${result.updated} aktualisiert`);

  } catch (err) {
    console.error("MQTT Verarbeitungsfehler:", err);
  }
});

client.on("error", (err) => {
  console.error("MQTT Fehler:", err);
});

}
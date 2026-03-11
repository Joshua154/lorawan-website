"use client";

import type {
  CircleMarker,
  CircleMarkerOptions,
  DivIcon,
  Layer,
  LayerGroup,
  LeafletMouseEvent,
  Map as LeafletMap,
} from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";

import { buildFeatureKey, getSignalCategory, getSignalColor } from "@/lib/pings";
import { useTranslation } from "@/i18n/useTranslation";
import type { CalculationMode, PingFeature, RestrictedHexagon, ViewMode } from "@/lib/types";

type MarkerWithRssi = CircleMarker & {
  options: CircleMarkerOptions & {
    rssiValue?: number;
  };
};

type ClusterNode = {
  options: {
    fillColor?: string;
    rssiValue?: number;
  };
};

type ClusterGroup = Layer & {
  addLayer: (layer: Layer) => void;
  addTo: (map: LeafletMap) => void;
};

type MarkerCluster = {
  getAllChildMarkers: () => ClusterNode[];
};

type HeatLayer = Layer & {
  addTo: (map: LeafletMap) => void;
};

type LeafletWithPlugins = typeof import("leaflet") & {
  heatLayer: (points: number[][], options?: Record<string, unknown>) => HeatLayer;
  markerClusterGroup: (options?: Record<string, unknown>) => ClusterGroup;
};

type LoraWanMapProps = {
  features: PingFeature[];
  mode: ViewMode;
  calculationMode: CalculationMode;
  followedFeature: PingFeature | null;
  newFeatureKeys: string[];
  hexSize: number;
  minHexPoints: number;
  restrictedHexagons?: RestrictedHexagon[];
};

function getPopupHtml(feature: PingFeature, calculationMode: CalculationMode, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const gateway = feature.properties.gateway ?? t("map.sources.offlineImport");
  const realRssi = feature.properties.rssi === -1 ? t("dashboard.quality.categories.deadzone") : `${feature.properties.rssi} dBm`;
  const effectiveRssi =
    calculationMode === "stabilized"
      ? `${feature.properties.rssi_stabilized ?? feature.properties.rssi} dBm`
      : `${feature.properties.rssi} dBm`;
  const bonus = feature.properties.rssi_bonus ? ` (+${feature.properties.rssi_bonus} Bonus)` : "";

  return `
    <div style="font-family: system-ui, sans-serif; min-width: 200px; line-height: 1.5;">
      <strong style="font-size: 1rem;">${t("map.popup.point")}${feature.properties.counter}</strong>
      <hr style="margin: 6px 0; border: 0; border-top: 1px solid #e5e7eb;" />
      <div><strong>${t("map.popup.boardId")}</strong> ${feature.properties.boardID}</div>
      <div><strong>${t("map.popup.signalReal")}</strong> ${realRssi}${bonus}</div>
      <div><strong>${t("map.popup.signalEffective")}</strong> ${effectiveRssi}</div>
      <div><strong>${t("map.popup.gateway")}</strong> ${gateway}</div>
      <div><strong>${t("map.popup.time")}</strong> ${new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(feature.properties.time))}</div>
    </div>
  `;
}

export function LoraWanMap({
  features,
  mode,
  calculationMode,
  followedFeature,
  newFeatureKeys,
  hexSize,
  minHexPoints,
  restrictedHexagons = [],
}: LoraWanMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletWithPlugins | null>(null);
  const dynamicLayersRef = useRef<Layer[]>([]);
  const radarLayerRef = useRef<LayerGroup | null>(null);
  const animatedKeysRef = useRef<Set<string>>(new Set());
  const [isMapReady, setIsMapReady] = useState(false);

  const featureKeySet = useMemo(() => new Set(newFeatureKeys), [newFeatureKeys]);

  useEffect(() => {
    let mounted = true;

    async function initMap() {
      if (!containerRef.current || mapRef.current) {
        return;
      }

      const leafletModule = await import("leaflet");
      await import("leaflet.heat");
      await import("leaflet.markercluster");

      if (!mounted || !containerRef.current) {
        return;
      }

      const L = (leafletModule.default ?? leafletModule) as LeafletWithPlugins;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        preferCanvas: true,
      }).setView([52.41, 13.05], window.matchMedia("(max-width: 600px)").matches ? 13 : 12);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        keepBuffer: 2,
      }).addTo(map);

      radarLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setIsMapReady(true);
    }

    void initMap();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setIsMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const radarLayer = radarLayerRef.current;

    if (!isMapReady || !map || !L || !radarLayer) {
      return;
    }

    for (const layer of dynamicLayersRef.current) {
      map.removeLayer(layer);
    }
    dynamicLayersRef.current = [];
    radarLayer.clearLayers();

    const isStabilized = calculationMode === "stabilized";

    if (mode === "markers") {
      const clusterLayer = L.markerClusterGroup({
        disableClusteringAtZoom: 18,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        maxClusterRadius: 50,
        iconCreateFunction(cluster: MarkerCluster): DivIcon {
          const markers = cluster.getAllChildMarkers();
          let red = 0;
          let green = 0;
          let blue = 0;
          let totalWeight = 0;
          const bestRssi = Math.max(...markers.map((marker) => marker.options.rssiValue || -130));

          for (const marker of markers) {
            const color = marker.options.fillColor;
            const currentRssi = marker.options.rssiValue || -130;
            const weight = currentRssi === bestRssi ? 5 : 1;
            totalWeight += weight;

            if (color === "#2e7d32") {
              red += 46 * weight;
              green += 125 * weight;
              blue += 50 * weight;
            } else if (color === "#f59e0b") {
              red += 245 * weight;
              green += 158 * weight;
              blue += 11 * weight;
            } else if (color === "#dc2626") {
              red += 220 * weight;
              green += 38 * weight;
              blue += 38 * weight;
            }
          }

          const clusterColor = `rgb(${Math.round(red / totalWeight || 0)}, ${Math.round(green / totalWeight || 0)}, ${Math.round(blue / totalWeight || 0)})`;

          return L.divIcon({
            html: `<div class="custom-cluster" style="background:${clusterColor}"><span>${markers.length}</span></div>`,
            className: "",
            iconSize: L.point(40, 40),
          });
        },
      });

      for (const feature of features) {
        const category = getSignalCategory(
          feature.properties.rssi,
          isStabilized ? feature.properties.rssi_stabilized : undefined,
        );
        const color = getSignalColor(category);
        const [longitude, latitude] = feature.geometry.coordinates;
        const key = buildFeatureKey(feature);

        const marker = L.circleMarker([latitude, longitude], {
          radius: window.matchMedia("(max-width: 600px)").matches ? 8 : 6,
          color: featureKeySet.has(key) ? "#ffffff" : "#1f2937",
          weight: featureKeySet.has(key) ? 3 : 1,
          fillColor: color,
          fillOpacity: 0.88,
        }) as MarkerWithRssi;

        marker.options.rssiValue = isStabilized
          ? feature.properties.rssi_stabilized ?? feature.properties.rssi
          : feature.properties.rssi;
        marker.on("click", (event: LeafletMouseEvent) => {
          L.popup().setLatLng(event.latlng).setContent(getPopupHtml(feature, calculationMode, t)).openOn(map);
        });
        clusterLayer.addLayer(marker);

        if (featureKeySet.has(key) && !animatedKeysRef.current.has(key)) {
          animatedKeysRef.current.add(key);
          const pulse = L.circle([latitude, longitude], {
            radius: 0,
            color: "white",
            weight: 2,
            fillOpacity: 0,
            opacity: 0.9,
            interactive: false,
          }).addTo(radarLayer);

          const highlight = L.circleMarker([latitude, longitude], {
            radius: 10,
            color: "white",
            weight: 3,
            fillOpacity: 0,
            interactive: false,
          }).addTo(radarLayer);

          const start = performance.now();
          const duration = 14_000;
          const maxRadius = 3_000;

          const animate = (time: number) => {
            const progress = Math.min((time - start) / duration, 1);
            pulse.setRadius(maxRadius * progress);
            pulse.setStyle({ opacity: 1 - progress });
            if (progress < 1) {
              requestAnimationFrame(animate);
            }
          };

          requestAnimationFrame(animate);
          window.setTimeout(() => {
            radarLayer.removeLayer(pulse);
            radarLayer.removeLayer(highlight);
          }, 12_000);
        }
      }

      clusterLayer.addTo(map);
      dynamicLayersRef.current.push(clusterLayer);
    }

    if (mode === "heatmap") {
      const heatPoints = features.map((feature) => {
        const [longitude, latitude] = feature.geometry.coordinates;
        return [latitude, longitude, 1];
      });

      if (heatPoints.length > 0) {
        const heatLayer = L.heatLayer(heatPoints, { radius: 25, blur: 20, max: 0.8 });
        heatLayer.addTo(map);
        dynamicLayersRef.current.push(heatLayer);
      }
    }

    if (mode === "hexagon" && restrictedHexagons.length > 0) {
      const layerGroup = L.layerGroup();

      for (const hexagon of restrictedHexagons) {
        const polygon = L.polygon(hexagon.corners, {
          fillColor: hexagon.fillColor,
          fillOpacity: 0.78,
          weight: 0.5,
          color: "#ffffff",
        }).bindPopup(`
          <div style="text-align:center;font-family:system-ui,sans-serif;line-height:1.45;">
            <strong>${t("map.hexagon.title")}</strong><br />
            <hr style="margin:6px 0;border:0;border-top:1px solid #e5e7eb;" />
            ${t("map.hexagon.pointAvg", { avg: hexagon.avg })}<br />
          </div>
        `);
            // ${t("map.hexagon.restricted")}

        polygon.addTo(layerGroup);
      }

      layerGroup.addTo(map);
      dynamicLayersRef.current.push(layerGroup);
    }

    if (mode === "hexagon" && restrictedHexagons.length === 0) {
      const aspect = 0.61;
      const dx = hexSize * Math.sqrt(3);
      const dy = hexSize * 1.5 * aspect;
      const bins = new Map<string, { points: PingFeature[]; center: [number, number] }>();

      for (const feature of features) {
        const [longitude, latitude] = feature.geometry.coordinates;
        const row = Math.round(latitude / dy);
        const offset = row % 2 === 0 ? 0 : dx / 2;
        const col = Math.round((longitude - offset) / dx);
        const key = `${col},${row}`;

        if (!bins.has(key)) {
          bins.set(key, { points: [], center: [row * dy, col * dx + offset] });
        }

        bins.get(key)?.points.push(feature);
      }

      const layerGroup = L.layerGroup();

      for (const [, bin] of bins) {
        if (bin.points.length < minHexPoints) {
          continue;
        }

        let red = 0;
        let green = 0;
        let blue = 0;
        let totalWeight = 0;
        let realRssiSum = 0;
        let effectiveRssiSum = 0;

        const bestRssi = Math.max(
          ...bin.points.map((feature) => {
            const value = isStabilized
              ? feature.properties.rssi_stabilized ?? feature.properties.rssi
              : feature.properties.rssi;
            return value === -1 ? -130 : value;
          }),
        );

        for (const feature of bin.points) {
          const effectiveRssi = isStabilized
            ? feature.properties.rssi_stabilized ?? feature.properties.rssi
            : feature.properties.rssi;
          const weightedRssi = effectiveRssi === -1 ? -130 : effectiveRssi;
          const category = getSignalCategory(
            feature.properties.rssi,
            isStabilized ? feature.properties.rssi_stabilized : undefined,
          );
          const color = getSignalColor(category);
          const weight = weightedRssi === bestRssi ? 5 : 1;
          totalWeight += weight;
          realRssiSum += feature.properties.rssi === -1 ? -130 : feature.properties.rssi;
          effectiveRssiSum += weightedRssi;

          if (color === "#2e7d32") {
            red += 46 * weight;
            green += 125 * weight;
            blue += 50 * weight;
          } else if (color === "#f59e0b") {
            red += 245 * weight;
            green += 158 * weight;
            blue += 11 * weight;
          } else if (color === "#dc2626") {
            red += 220 * weight;
            green += 38 * weight;
            blue += 38 * weight;
          }
        }

        const fillColor = `rgb(${Math.round(red / totalWeight || 0)}, ${Math.round(green / totalWeight || 0)}, ${Math.round(blue / totalWeight || 0)})`;
        const corners: [number, number][] = [];

        for (let index = 0; index < 6; index += 1) {
          const angle = (Math.PI / 3) * index + Math.PI / 6;
          corners.push([
            bin.center[0] + hexSize * Math.sin(angle) * aspect,
            bin.center[1] + hexSize * Math.cos(angle),
          ]);
        }

        const polygon = L.polygon(corners, {
          fillColor,
          fillOpacity: 0.78,
          weight: 0.5,
          color: "#ffffff",
        }).bindPopup(`
          <div style="text-align:center;font-family:system-ui,sans-serif;line-height:1.45;">
            <strong>${t("map.hexagon.title")}</strong><br />
            <hr style="margin:6px 0;border:0;border-top:1px solid #e5e7eb;" />
            ${t("map.hexagon.realAverage")} <strong>${Math.round(realRssiSum / bin.points.length)} dBm</strong><br />
            ${isStabilized ? `${t("map.hexagon.effectiveAverage")} <strong>${Math.round(effectiveRssiSum / bin.points.length)} dBm</strong><br />` : ""}
            ${t("map.hexagon.pointCount", { count: bin.points.length })}
          </div>
        `);

        polygon.addTo(layerGroup);
      }

      layerGroup.addTo(map);
      dynamicLayersRef.current.push(layerGroup);
    }

    if (followedFeature) {
      const [longitude, latitude] = followedFeature.geometry.coordinates;
      map.flyTo([latitude, longitude], 18, { duration: 1.5 });
    }
  }, [calculationMode, featureKeySet, features, followedFeature, hexSize, isMapReady, minHexPoints, mode, restrictedHexagons, t]);

  return <div className="map-canvas" ref={containerRef} />;
}

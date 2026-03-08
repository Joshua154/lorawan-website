from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
import requests
import json
import re
import os
import time
import math
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)
last_log_update = 0
CACHE_DURATION = 30 # Sekunden, die gewartet werden muss, bis ein neuer Download erlaubt ist

LOG_URL = "http://stadtrandelfen.dsmynas.org:8008/test/2026_gps.log"
# Relativer Pfad zum gemounteten Ordner im Docker-Container
GEOJSON_FILE = "data/pings.geojson"

# Sicherstellen, dass der Ordner existiert
if not os.path.exists("data"):
    os.makedirs("data")

def load_master_geojson():
    if os.path.exists(GEOJSON_FILE):
        try:
            with open(GEOJSON_FILE, "r") as f:
                return json.load(f)
        except:
            pass
    return {"type": "FeatureCollection", "features": []}

def save_master_geojson(data):
    # Die Bonus-Berechnung erfolgt nun inkrementell vor dem Speichern in den Routen
    with open(GEOJSON_FILE, "w") as f:
        json.dump(data, f, indent=2)

def is_duplicate(new_feat, master_features):
    new_p = new_feat["properties"]
    new_c = new_feat["geometry"]["coordinates"]
    
    # Da die Liste groß ist, prüfen wir vor allem die letzten Einträge (Performance)
    for old_f in reversed(master_features):
        old_p = old_f["properties"]
        old_c = old_f["geometry"]["coordinates"]
        
        if (str(old_p.get("boardID")) == str(new_p.get("boardID")) and
            str(old_p.get("counter")) == str(new_p.get("counter")) and
            round(float(old_c[0]), 6) == round(float(new_c[0]), 6) and
            round(float(old_c[1]), 6) == round(float(new_c[1]), 6)):
            return True
        # Wenn wir zeitlich zu weit zurückgehen, können wir abbrechen (optional)
    return False

def get_distance_meters(lon1, lat1, lon2, lat2):
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2)**2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def apply_stability_bonus(features):
    features.sort(key=lambda x: x["properties"]["time"])
    
    for i in range(len(features)):
        curr = features[i]
        p = curr["properties"]
        curr_coords = curr["geometry"]["coordinates"]
        
        if p.get("rssi") == -1 or p.get("rssi", 0) <= -129:
            p["rssi_stabilized"] = p.get("rssi")
            p["rssi_bonus"] = 0
            continue
            
        board_id = str(p.get("boardID"))
        curr_counter = int(p.get("counter"))
        
        try:
            curr_time = datetime.fromisoformat(p["time"].replace('Z', '+00:00'))
        except:
            continue

        found_prev = 0
        lookback_limit = curr_time - timedelta(hours=6)
        last_valid_counter = curr_counter
        
        for j in range(i - 1, -1, -1):
            prev = features[j]
            prev_p = prev["properties"]
            prev_coords = prev["geometry"]["coordinates"]
            
            try:
                prev_time = datetime.fromisoformat(prev_p["time"].replace('Z', '+00:00'))
            except:
                continue
            if prev_time < lookback_limit:
                break 

            if str(prev_p.get("boardID")) != board_id:
                continue

            prev_counter = int(prev_p.get("counter"))

            if prev_counter >= last_valid_counter or prev_counter < (curr_counter - 5):
                break

            dist = get_distance_meters(curr_coords[0], curr_coords[1], 
                                      prev_coords[0], prev_coords[1])
            
            if dist <= 175.0:
                if not (prev_p.get("rssi") == -1 or prev_p.get("rssi", 0) <= -129):
                    found_prev += 1
                    last_valid_counter = prev_counter
            
            if found_prev >= 5:
                break

        bonus_map = {5: 15, 4: 10, 3: 5, 2: 2, 1: 1}
        bonus = bonus_map.get(found_prev, 0)
        p["rssi_stabilized"] = p["rssi"] + bonus
        p["rssi_bonus"] = bonus

def update_master_with_incremental_bonus(new_features, master_data):
    if not master_data["features"]:
        master_data["features"] = new_features
        apply_stability_bonus(master_data["features"])
        return len(new_features), 0

    latest_time_str = master_data["features"][-1]["properties"]["time"]
    latest_time = datetime.fromisoformat(latest_time_str.replace('Z', '+00:00'))
    
    buffer_limit = latest_time - timedelta(hours=6)
    
    # Kontext-Puffer (Punkte der letzten 6h)
    context_buffer = [f for f in master_data["features"] 
                      if datetime.fromisoformat(f["properties"]["time"].replace('Z', '+00:00')) >= buffer_limit]
    
    actually_new = []
    updated_count = 0
    
    # Wir sortieren neue Features chronologisch, um Duplikate sauber zu finden
    new_features.sort(key=lambda x: x["properties"]["time"])

    for nf in new_features:
        # Hier nutzen wir die bestehende update_master_with_features Logik für Funklöcher
        new_p = nf["properties"]
        new_c = nf["geometry"]["coordinates"]
        if new_c[0] == 0: continue 

        found_index = -1
        is_exact_duplicate = False

        # Inkrementelle Prüfung gegen die Master-Daten
        for i in range(len(master_data["features"]) - 1, -1, -1):
            old_f = master_data["features"][i]
            old_p = old_f["properties"]
            old_c = old_f["geometry"]["coordinates"]

            if (str(old_p.get("boardID")) == str(new_p.get("boardID")) and
                str(old_p.get("counter")) == str(new_p.get("counter"))):
                
                same_gps = (round(float(old_c[0]), 6) == round(float(new_c[0]), 6) and
                            round(float(old_c[1]), 6) == round(float(new_c[1]), 6))
                
                if same_gps:
                    if old_p.get("rssi") == -1 and new_p.get("rssi") != -1:
                        found_index = i
                    else:
                        is_exact_duplicate = True
                    break
            
            # Zeitlicher Abbruch der Suche nach Duplikaten nach 24h
            old_time = datetime.fromisoformat(old_p["time"].replace('Z', '+00:00'))
            if (latest_time - old_time).total_seconds() > 86400:
                break

        if found_index != -1:
            master_data["features"][found_index] = nf
            updated_count += 1
        elif not is_exact_duplicate:
            actually_new.append(nf)

    if not actually_new:
        # Auch wenn nichts neu ist, könnten Funklöcher aktualisiert worden sein
        if updated_count > 0:
            apply_stability_bonus(master_data["features"])
        return 0, updated_count

    # Bonus nur für den notwendigen Puffer berechnen
    processing_queue = context_buffer + actually_new
    apply_stability_bonus(processing_queue)
    
    # Neue Punkte an Master hängen
    master_data["features"].extend(actually_new)
    # Finale Sortierung zur Sicherheit
    master_data["features"].sort(key=lambda x: x["properties"]["time"])
    
    return len(actually_new), updated_count

def parse_log_to_features(log_text, limit_timestamp=None):
    """
    Parses Log. Wenn limit_timestamp gesetzt ist (UTC datetime), 
    stoppt das Parsing, wenn Zeilen älter als limit_timestamp - 6h sind.
    """
    features = []
    payload_pattern = re.compile(r'^payload:(\{.*\})$')
    gateway_pattern = re.compile(r'^gateway:(\{.*\})$')
    gatewayname_pattern = re.compile(r'^gatewayname:(.+)$')

    lines = log_text.splitlines()
    # Wir verarbeiten die Zeilen von UNTEN nach OBEN (Reverse)
    # Ein Block besteht aus Name, Gateway, Payload (in dieser Reihenfolge im Log, also umgekehrt beim Rückwärtslesen)
    
    temp_payload = temp_gw = temp_name = None
    
    stop_at = None
    if limit_timestamp:
        stop_at = limit_timestamp - timedelta(hours=7)

    # Da Blöcke im Log von oben nach unten gelesen Name -> Gateway -> Payload sind,
    # müssen wir beim Rückwärtslesen die Reihenfolge beachten.
    for line in reversed(lines):
        line = line.strip()
        if not line: continue

        # Wir fangen beim Rückwärtslesen mit gatewayname an
        m_n = gatewayname_pattern.match(line)
        if m_n: temp_name = m_n.group(1).strip()
        
        m_g = gateway_pattern.match(line)
        if m_g: temp_gw = json.loads(m_g.group(1))
        
        m_p = payload_pattern.match(line)
        if m_p: temp_payload = json.loads(m_p.group(1))

        if temp_payload and temp_gw and temp_name:
            timestamp_str = temp_gw.get("time") or temp_gw.get("received_at")
            if not timestamp_str:
                timestamp_str = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
            
            current_dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            
            # Abbruch-Bedingung: Wir sind weit genug in der Vergangenheit
            if stop_at and current_dt < stop_at:
                break

            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [temp_payload["lang"], temp_payload["breit"]]},
                "properties": {
                    "boardID": temp_payload.get("boardID"),
                    "counter": temp_payload.get("counter"),
                    "gateway": temp_name,
                    "rssi": temp_gw.get("rssi"),
                    "snr": temp_gw.get("snr"),
                    "time": timestamp_str
                }
            })
            temp_payload = temp_gw = temp_name = None
            
    # Da wir von hinten gelesen haben, müssen wir die Features für die Bonus-Logik wieder umdrehen
    features.reverse()
    return features

@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/pings.geojson")
def serve_geojson():
    return send_from_directory(os.path.join(app.static_folder, "data"), "pings.geojson")

last_log_update = 0
last_added_count = 0    # NEU: Merkt sich das letzte Ergebnis
last_updated_count = 0  # NEU: Merkt sich das letzte Ergebnis


def get_valid_count(master_data):
    return len([
        f for f in master_data["features"] 
        if not (f["geometry"]["coordinates"][0] == 0 and f["geometry"]["coordinates"][1] == 0)
    ])

@app.route("/update-now")
def update_now():
    global last_log_update, last_added_count, last_updated_count
    current_time = time.time()
    
    master_data = load_master_geojson()

    # FALL 1: CACHE (Client B kommt kurz nach Client A)
    if current_time - last_log_update < CACHE_DURATION:
        return jsonify({
            "status": "cached", 
            "added": last_added_count,    # Wir geben die Zahlen von Client A weiter!
            "updated": last_updated_count, 
            "total": get_valid_count(master_data),
            "features": master_data["features"]
        })

    # FALL 2: ECHTES UPDATE (Client A löst es aus)
    try:
        r = requests.get(LOG_URL, timeout=10)
        r.raise_for_status()
        
        master_data = load_master_geojson()
        
        # Zeitlimit für Reverse-Parsing bestimmen
        limit_dt = None
        if master_data["features"]:
            # Wir suchen den letzten validen Punkt für die Qualität
            latest_valid_ping = None
            for feat in reversed(master_data["features"]):
                r_val = feat["properties"].get("rssi", -1)
                if r_val is not None and r_val != -1 and r_val > -129:
                    latest_valid_ping = feat
                    break
            
            # Sicherheit: Wir nehmen die Zeit des letzten validen Pings, 
            # aber falls dieser EXTREM weit zurückliegt, nehmen wir den 
            # absolut letzten Punkt im GeoJSON als Zeitanker.
            abs_last_ts_str = master_data["features"][-1]["properties"]["time"]
            abs_last_dt = datetime.fromisoformat(abs_last_ts_str.replace('Z', '+00:00'))
            
            if latest_valid_ping:
                valid_ts_str = latest_valid_ping["properties"]["time"]
                valid_dt = datetime.fromisoformat(valid_ts_str.replace('Z', '+00:00'))
                # Wir nehmen den validen Punkt, es sei denn, er ist mehr als 1 Stunde 
                # älter als der absolut letzte Punkt im File.
                if (abs_last_dt - valid_dt).total_seconds() < 3600:
                    limit_dt = valid_dt
                else:
                    limit_dt = abs_last_dt
            else:
                limit_dt = abs_last_dt

        new_features = parse_log_to_features(r.text, limit_timestamp=limit_dt)
        
        # Inkrementelle Bonus-Logik anwenden
        added, updated = update_master_with_incremental_bonus(new_features, master_data)
        
        if added > 0 or updated > 0:
            save_master_geojson(master_data)

        
        
        # JETZT WICHTIG: Die Zahlen für den nächsten "Cached"-Aufrufer speichern
        last_log_update = current_time
        last_added_count = added
        last_updated_count = updated
        
        return jsonify({
            "status": "ok", 
            "added": added, 
            "updated": updated, 
            "total": get_valid_count(master_data)
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/upload-manual", methods=["POST"])
def upload_manual():
    try:
        manual_pings = request.json 
        master_data = load_master_geojson()
        
        added, updated = update_master_with_incremental_bonus(manual_pings, master_data)
        
        if added > 0 or updated > 0:
            save_master_geojson(master_data)
            
        return jsonify({
            "status": "ok", 
            "added": added, 
            "updated": updated
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4000)
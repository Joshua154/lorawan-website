# Basisimage mit Python 3.11
FROM python:3.11-slim

# Arbeitsverzeichnis im Container
WORKDIR /app

# Abhängigkeiten installieren
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Alle Projektdateien kopieren
COPY . .

RUN mkdir -p data

# Port 4000 im Container
EXPOSE 4000

# Flask Server starten auf Port 4000
CMD ["python", "update_geojson_server.py", "--port", "4000"]

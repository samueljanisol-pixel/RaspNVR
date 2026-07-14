# RaspNVR

NVR edge pour Raspberry Pi — caméras IP RTSP/ONVIF (Annke I91BN), enregistrement local, live HLS, central Vercel optionnel.

## Installation rapide (Pi edge)

```bash
sudo bash deploy/install.sh
```

Interface web : `http://<ip-pi>:8080`

## Central Vercel (sans Raspberry central)

Voir [docs/central-vercel.md](docs/central-vercel.md) — dashboard, agent sortant, tunnel Cloudflare, upload enregistrements.

Mock local : `http://<ip-pi>:8080/admin` (avec `RASPNVR_CENTRAL_MOCK=true`)

## Déploiement depuis Windows

```bash
python scripts/deploy_remote.py --host 192.168.0.17
```

## Stack

- FastAPI + SQLite
- FFmpeg (enregistrement passthrough substream)
- MediaMTX (live HLS)

## Caméra Annke I91BN

- Substream : `rtsp://user:pass@IP:554/Streaming/Channels/102`
- Main : `rtsp://user:pass@IP:554/Streaming/Channels/101`

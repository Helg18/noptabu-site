#!/usr/bin/env python3
# =============================================================================
# SCRAPE_BCV.PY — Obtiene la tasa oficial del dólar del Banco Central de
# Venezuela desde https://www.bcv.org.ve/ y guarda data/bcv.json.
# Se ejecuta en GitHub Actions (ver .github/workflows/bcv-scrape.yml).
#
# VALIDADO (octubre 2026) contra el HTML real del BCV:
#   - La tasa vive en el div con id="dolar": "USD 872,39270000"
#   - El BCV publica hasta 8 decimales y usa separador de miles
#   - El regex admite 2-8 decimales y SOLO busca dentro de #dolar:
#     fuera de ese bloque el primer número similar es el EURO, no el USD.
# =============================================================================
import datetime
import json
import math
import os
import re
import sys
import time
import urllib3

import requests
from bs4 import BeautifulSoup

URL_BCV = "https://www.bcv.org.ve/"
RUTA_SALIDA = "data/bcv.json"

# Verificacion SSL activada por defecto (seguro). Solo para pruebas locales
# fallidas por certificados rotos o ISP que intercepta HTTPS:
#     BCV_SSL_INSEGURO=1 python scripts/scrape_bcv.py
SSL_VERIFICAR = os.environ.get("BCV_SSL_INSEGURO", "0") != "1"
if not SSL_VERIFICAR:
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Admite "85,50" | "872,39" | "872,39270000" | "1.234,56" | "1.234,56789012"
REGEX_TASA = r"(\d{1,3}(?:\.\d{3})*,\d{2,8})"

# Rotacion de User-Agent entre intentos (algunos WAF bloquean agents raros)
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Safari/605.1.15",
]


def _obtener_tasa(user_agent):
    """Un intento de descarga y extracción. Lanza excepción si falla."""
    respuesta = requests.get(
        URL_BCV,
        timeout=30,
        verify=SSL_VERIFICAR,
        headers={
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "es-VE,es;q=0.9",
        },
    )
    respuesta.raise_for_status()
    soup = BeautifulSoup(respuesta.text, "html.parser")

    # SOLO el bloque del dólar: fuera de él el primer número con formato
    # similar es el EURO (977,21...) y capturarlo sería un error grave.
    bloque_dolar = soup.find(id="dolar")
    if not bloque_dolar:
        raise RuntimeError('El BCV cambio su web: no existe el div id="dolar"')
    texto = bloque_dolar.get_text(" ", strip=True)

    coincidencia = re.search(REGEX_TASA, texto)
    if not coincidencia:
        raise RuntimeError(
            f"No se encontro la tasa del dolar en el bloque #dolar: {texto!r}")

    # Formato venezolano -> float: "872,39270000" -> 872.3927
    return float(coincidencia.group(1).replace(".", "").replace(",", "."))


def obtener_tasa():
    """Hasta 3 intentos con pausa y rotación de User-Agent."""
    ultimo_error = None
    for intento in range(1, 4):
        try:
            return _obtener_tasa(USER_AGENTS[(intento - 1) % len(USER_AGENTS)])
        except Exception as e:
            ultimo_error = e
            print(f"Intento {intento}/3 fallido: {type(e).__name__}: {e}",
                  file=sys.stderr)
            if intento < 3:
                time.sleep(5 * intento)
    raise ultimo_error


def actualizar_fallback_config(tasa):
    """Sincroniza CONFIG.tasaBcvFallback en js/config.js con la tasa válida.

    Así, si mañana el scraper falla o bcv.json queda viejo, el sitio usará
    SIEMPRE la última tasa oficial conocida. Solo reescribe la línea
    tasaBcvFallback; el resto del config.js queda intacto.
    """
    ruta_config = "js/config.js"
    with open(ruta_config, encoding="utf-8") as f:
        contenido = f.read()
    nuevo, n = re.subn(
        r"(tasaBcvFallback\s*:\s*)[\d.]+",
        lambda m: f"{m.group(1)}{truncar2(tasa)}",
        contenido,
    )
    if n != 1:
        raise RuntimeError("No se encontro tasaBcvFallback en js/config.js")
    with open(ruta_config, "w", encoding="utf-8") as f:
        f.write(nuevo)


def truncar2(tasa):
    """Conserva solo 2 decimales SIN redondear: 872.3927 -> 872.39.
    (Se corta, nunca se redondea: 872.399 seguiria siendo 872.39)"""
    return math.floor(tasa * 100) / 100.0


def main():
    tasa = truncar2(obtener_tasa())
    # Validacion de rango: la tasa BCV debe ser un valor plausible.
    # Si el parseo extrajera basura (pagina de error, mantenimiento, etc.),
    # esto lo detecta y NO toca bcv.json.
    if not (1 <= tasa <= 1_000_000):
        raise RuntimeError(f"Tasa fuera de rango plausible: {tasa}")

    hoy = datetime.datetime.now(
        datetime.timezone(datetime.timedelta(hours=-4))).date().isoformat()

    with open(RUTA_SALIDA, "w", encoding="utf-8") as f:
        json.dump({"fecha": hoy, "usd_bcv": tasa, "fuente": URL_BCV}, f,
                  ensure_ascii=False, indent=2)

    actualizar_fallback_config(tasa)

    print(f"OK — Tasa BCV guardada: {tasa:.4f} Bs/USD ({hoy})")
    print("OK — js/config.js → tasaBcvFallback actualizado con la misma tasa")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Salir con código de error: el workflow queda en rojo y NO
        # sobreescribe bcv.json, así el sitio conserva la tasa anterior.
        print(f"ERROR — {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)

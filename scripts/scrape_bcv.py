# =============================================================================
# SCRAPE_BCV.PY — Obtiene la tasa oficial del dólar del Banco Central de
# Venezuela desde https://www.bcv.org.ve/ y guarda data/bcv.json.
# Se ejecuta en GitHub Actions (ver .github/workflows/bcv-scrape.yml).
#
# VALIDADO (octubre 2026) contra el HTML real del BCV:
#   - La tasa vive en el div con id="dolar": "USD 872,39270000"
#   - El BCV publica hasta 8 decimales y usa separador de miles ("977,21940683")
#   - Por eso el regex admite 2-8 decimales y SOLO busca dentro de #dolar:
#     fuera de ese bloque el primer número similar es el EURO, no el USD.
# =============================================================================
import datetime
import json
import os
import re
import sys
import urllib3

import requests
from bs4 import BeautifulSoup

URL_BCV = "https://www.bcv.org.ve/"
RUTA_SALIDA = "data/bcv.json"

# Verificación SSL: activada por defecto (seguro en GitHub Actions).
# SOLO para pruebas locales fallidas por certificados rotos o ISP que
# intercepta HTTPS (común en Venezuela), desactívala así:
#     BCV_SSL_INSEGURO=1 python scripts/scrape_bcv.py
SSL_VERIFICAR = os.environ.get("BCV_SSL_INSEGURO", "0") != "1"
if not SSL_VERIFICAR:
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Admite "85,50" · "872,39" · "872,39270000" · "1.234,56" · "1.234,56789012"
# Miles con punto (opcional y repetible) + decimales con coma (2 a 8)
REGEX_TASA = r"(\d{1,3}(?:\.\d{3})*,\d{2,8})"


def obtener_tasa():
    """Descarga el home del BCV y extrae el valor oficial del dólar (USD)."""
    respuesta = requests.get(
        URL_BCV,
        timeout=30,
        headers={"User-Agent": "Mozilla/5.0 (compatible; NoptabuBot/1.0)"},
        verify=SSL_VERIFICAR,
    )
    respuesta.raise_for_status()
    soup = BeautifulSoup(respuesta.text, "html.parser")

    # SOLO el bloque del dólar: fuera de él el primer número con formato
    # similar es el EURO (977,21...) y capturarlo sería un error grave.
    bloque_dolar = soup.find(id="dolar")
    if not bloque_dolar:
        raise RuntimeError('El BCV cambió su web: no existe el div id="dolar"')
    texto = bloque_dolar.get_text(" ", strip=True)

    coincidencia = re.search(REGEX_TASA, texto)
    if not coincidencia:
        raise RuntimeError(f"No se encontró la tasa del dólar en el bloque #dolar: {texto!r}")

    # Formato venezolano → float: "872,39270000" → 872.3927 · "1.234,56" → 1234.56
    return float(coincidencia.group(1).replace(".", "").replace(",", "."))


def actualizar_fallback_config(tasa):
    """Sincroniza CONFIG.tasaBcvFallback en js/config.js con la tasa válida.

    Así, si mañana el scraper falla o bcv.json queda viejo, el sitio usará
    SIEMPRE la última tasa oficial conocida en lugar de un valor manual
    desactualizado. Solo reescribe la línea tasaBcvFallback (regex acotada);
    el resto del config.js queda intacto.
    """
    ruta_config = "js/config.js"
    with open(ruta_config, encoding="utf-8") as f:
        contenido = f.read()
    nuevo, n = re.subn(
        r"(tasaBcvFallback\s*:\s*)[\d.]+",
        lambda m: f"{m.group(1)}{round(tasa, 4)}",
        contenido,
    )
    if n != 1:
        raise RuntimeError("No se encontró tasaBcvFallback en js/config.js")
    with open(ruta_config, "w", encoding="utf-8") as f:
        f.write(nuevo)


def main():
    tasa = obtener_tasa()
    if tasa <= 0:
        raise RuntimeError(f"Tasa inválida obtenida: {tasa}")

    # Fecha en hora de Venezuela (UTC-4), sin horario de verano
    hoy = datetime.datetime.now(
        datetime.timezone(datetime.timedelta(hours=-4))).date().isoformat()

    with open(RUTA_SALIDA, "w", encoding="utf-8") as f:
        json.dump({"fecha": hoy, "usd_bcv": tasa, "fuente": URL_BCV}, f,
                  ensure_ascii=False, indent=2)

    # Sincronizamos el fallback del sitio con la última tasa válida
    actualizar_fallback_config(tasa)

    print(f"OK — Tasa BCV guardada: {tasa:.4f} Bs/USD ({hoy})")
    print("OK — js/config.js → tasaBcvFallback actualizado con la misma tasa")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Salir con código de error: el workflow queda en rojo y NO
        # sobreescribe bcv.json, así el sitio conserva la tasa anterior.
        print(f"ERROR — {e}", file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
# =============================================================================
# SERVIDOR LOCAL DE DESARROLLO - NOPTABU
# -----------------------------------------------------------------------------
# Sustituto de `python -m http.server` que imita a GitHub Pages:
#
#   1. URLs limpias:  /catalogo  ->  catalogo.html
#   2. 404.html personalizada para rutas inexistentes.
#   3. Sin cache: cada recarga trae los JS/CSS nuevos (evita 304 en desarrollo).
#
# `python -m http.server` NO puede hacer esto: solo entrega rutas que
# coincidan con un archivo real, por eso /catalogo devuelve 404 aunque en
# GitHub Pages funcione. Usa SIEMPRE este script para previsualizar el sitio.
#
# Uso:
#     python3 servidor_local.py              (puerto 8080)
#     python3 servidor_local.py 8090         (puerto personalizado)
#     python3 servidor_local.py -p 8090      (idem)
#     python3 servidor_local.py -p 8090 -b 127.0.0.1
#
# Abre http://localhost:8080 (o la IP de tu PC para probar desde el celular,
# p. ej. http://192.168.1.50:8080).
# =============================================================================
import argparse
import http.server
import os
import urllib.parse

RAIZ = os.path.dirname(os.path.abspath(__file__))
RUTA_404 = os.path.join(RAIZ, "404.html")

# Rutas limpias publicas (solo para el mensaje de arranque)
RUTAS = [
    "/", "/catalogo", "/mayoreo", "/pagos", "/envios",
    "/politicas", "/terminos", "/contacto",
]


class Manejador(http.server.SimpleHTTPRequestHandler):
    """Sirve archivos estaticos resolviendo URLs limpias como GitHub Pages."""

    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    # ------------------------------------------------------------------
    # Resolucion de rutas
    # ------------------------------------------------------------------
    def do_GET(self):
        if not self._redirigir_barra_final():
            super().do_GET()

    def do_HEAD(self):
        if not self._redirigir_barra_final():
            super().do_HEAD()

    def _redirigir_barra_final(self):
        """/catalogo/ -> 301 -> /catalogo (evita romper rutas relativas)."""
        partes = urllib.parse.urlsplit(self.path)
        ruta = partes.path
        if ruta.endswith("/") and ruta != "/":
            limpia = ruta.rstrip("/")
            fisico = super().translate_path(limpia)
            if not os.path.exists(fisico) and os.path.isfile(fisico + ".html"):
                destino = limpia
                if partes.query:
                    destino += "?" + partes.query
                self.send_response(301)
                self.send_header("Location", destino)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return True
        return False

    def translate_path(self, ruta):
        """/catalogo -> catalogo.html, igual que GitHub Pages."""
        # Ruta fisica normal (super ya limpia query string y normaliza "..")
        destino = super().translate_path(ruta)

        # Si ya existe un archivo o directorio real, se respeta tal cual
        if os.path.exists(destino):
            return destino

        # Sin extension -> probar con .html
        if not os.path.splitext(destino)[1]:
            candidato = destino + ".html"
            if os.path.isfile(candidato):
                return candidato

        return destino

    # ------------------------------------------------------------------
    # Cabeceras: nada de cache en desarrollo
    # ------------------------------------------------------------------
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # ------------------------------------------------------------------
    # 404 con la pagina del sitio
    # ------------------------------------------------------------------
    def send_error(self, codigo, mensaje=None, explica=None):
        if codigo == 404 and os.path.isfile(RUTA_404):
            with open(RUTA_404, "rb") as f:
                contenido = f.read()
            self.send_response(404)                 # status real 404
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(contenido)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(contenido)
            return
        super().send_error(codigo, mensaje, explica)


class Servidor(http.server.ThreadingHTTPServer):
    allow_reuse_address = True   # evita "Address already in use" al reiniciar
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(
        description="Servidor local de NOPTABU (URLs limpias + 404 personalizada)"
    )
    parser.add_argument("puerto_posicional", nargs="?", type=int,
                        help="puerto (atajo de -p)")
    parser.add_argument("-p", "--port", type=int, default=8080,
                        help="puerto de escucha (por defecto 8080)")
    parser.add_argument("-b", "--bind", default="",
                        help="interfaz de escucha (por defecto todas)")
    args = parser.parse_args()

    puerto = args.puerto_posicional or args.port

    with Servidor((args.bind, puerto), Manejador) as httpd:
        print()
        print(f"  NOPTABU en linea -> http://localhost:{puerto}")
        for ruta in RUTAS:
            print(f"     http://localhost:{puerto}{ruta}")
        print(f"  404 personalizada: {'activa' if os.path.isfile(RUTA_404) else 'NO ENCONTRADA'}")
        print("  Ctrl+C para detener.")
        print()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Servidor detenido.")


if __name__ == "__main__":
    os.chdir(RAIZ)   # servir siempre desde la raiz del proyecto
    main()

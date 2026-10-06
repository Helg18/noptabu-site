#!/usr/bin/env python3
# =============================================================================
# SERVIDOR LOCAL DE DESARROLLO - NOPTABU
# -----------------------------------------------------------------------------
# Reemplazo de `python -m http.server` que ADEMAS sirve tu 404.html
# personalizada para rutas inexistentes, igual que GitHub Pages.
#
# Uso:
#     python servidor_local.py          (puerto 8080 por defecto)
#     python servidor_local.py 3000     (puerto personalizado)
#
# Luego abre http://localhost:8080  (o la IP local de tu PC para probar
# desde el celular, p. ej. http://192.168.1.50:8080)
# =============================================================================
import http.server
import os
import socketserver
import sys

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
RAIZ = os.path.dirname(os.path.abspath(__file__))
RUTA_404 = os.path.join(RAIZ, "404.html")


class Manejador(http.server.SimpleHTTPRequestHandler):
    """Sirve archivos estaticos; ante un 404 devuelve la pagina personalizada."""

    def send_error(self, codigo, mensaje=None, explica=None):
        if codigo == 404 and os.path.exists(RUTA_404):
            with open(RUTA_404, "rb") as f:
                contenido = f.read()
            self.send_response(404)                     # status real 404
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(contenido)))
            self.end_headers()
            self.wfile.write(contenido)
            return
        super().send_error(codigo, mensaje, explica)


class Servidor(socketserver.ThreadingTCPServer):
    allow_reuse_address = True   # evita "Address already in use" al reiniciar rapido
    daemon_threads = True


if __name__ == "__main__":
    os.chdir(RAIZ)   # servir siempre desde la raiz del proyecto
    with Servidor(("", PUERTO), Manejador) as httpd:
        print(f"NOPTABU en linea -> http://localhost:{PUERTO}")
        print("404 personalizada:", "activa" if os.path.exists(RUTA_404) else "NO ENCONTRADA")
        print("Ctrl+C para detener.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.")

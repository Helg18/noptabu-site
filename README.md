# 🛍️ NOPTABÚ — Sitio web estático (GitHub Pages)

Tienda en línea **100% estática** para una sexshop discreta y profesional.
Sin backend, sin base de datos, sin pasarela de pago: el checkout envía el
pedido completo por **WhatsApp**. Multi-idioma (ES/EN), multi-moneda
($ y Bs a tasa BCV), carrito persistente y catálogo alimentado por JSON.

---

## 📁 Estructura del proyecto

```
noptabu-site/
├── index.html              # Inicio (hero, destacados, beneficios, banner mayoreo)
├── catalogo.html           # Catálogo al DETAL (con modal de mayoría de edad)
├── mayoreo.html            # Catálogo al MAYOREO (−20% configurable, con age-gate)
├── pagos.html              # Métodos de pago
├── envios.html             # Métodos de envío
├── politicas.html         # Políticas de privacidad
├── contacto.html           # Contacto (formulario → WhatsApp)
├── 404.html                # Página no encontrada (GitHub Pages la usa sola)
├── robots.txt              # Indexación para buscadores
├── sitemap.xml             # Mapa del sitio (¡cambia el dominio!)
├── manifest.json           # PWA instalable
├── css/
│   └── styles.css          # Design system completo (mobile-first)
├── js/
│   ├── config.js           # ★ CONFIGURACIÓN CENTRAL (WhatsApp, % mayoreo, tasa fallback)
│   ├── i18n.js             # Sistema multi-idioma
│   ├── bcv.js              # Tasa BCV (lee data/bcv.json, fallback a config)
│   ├── products.js         # Carga y normalización de data/products.json
│   ├── cart.js             # Carrito persistente + checkout por WhatsApp
│   ├── catalog.js          # Render de catálogos, filtros, buscador, vista rápida
│   └── main.js             # Orquestador: menú, modales, age-gate, footer BCV
├── lang/
│   ├── es.json             # Todos los textos en español
│   └── en.json             # Todos los textos en inglés
├── data/
│   ├── products.json       # ★ CATÁLOGO DE PRODUCTOS (edita este archivo)
│   └── bcv.json            # Tasa del día (lo actualiza la GitHub Action)
├── fotos/                  # ★ FOTOS LOCALES de los productos (prioritarias)
├── assets/img/             # Logo original, favicon, placeholder SVG
├── scripts/
│   └── scrape_bcv.py       # Scraper de la tasa del BCV
└── .github/workflows/
    └── bcv-scrape.yml      # GitHub Action: scraping diario a las 8 AM (VE)
```

---

## 🚀 Despliegue en GitHub Pages (paso a paso)

1. **Crea un repositorio** en GitHub (público) y sube todo el contenido
   de esta carpeta (la raíz del repo debe ser la raíz del sitio).
2. En el repo: **Settings → Pages**.
3. En **Source** elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
4. Guarda. En 1–2 minutos tu sitio estará en:
   `https://TU-USUARIO.github.io/noptabu-site/`
5. **Importante:** el sitio carga JSON con `fetch()`, que exige HTTPS o
   `localhost`. Si lo pruebas localmente, usa un servidor, por ejemplo:
   ```bash
   cd noptabu-site
   python -m http.server 8080
   # Abre http://localhost:8080
   ```
   (Abrir `index.html` con doble clic NO funcionará por las políticas CORS.)

   **Mejor aún**, usa el servidor incluido (igual que `http.server` pero con tu
   `404.html` personalizada para rutas inexistentes, como GitHub Pages):

   ```bash
   python servidor_local.py        # http://localhost:8080
   ```

---

## ⚙️ Configuración central — `js/config.js`

Todo lo que necesitas cambiar día a día está en **un solo archivo**:

| Opción | Qué hace | Valor por defecto |
|---|---|---|
| `whatsapp` | Número que recibe los pedidos y consultas (formato internacional sin `+`) | `"584146693604"` |
| `whatsappMensaje` | Mensaje inicial del chat | `"Hola NOPTABÚ…"` |
| `mostrarAgotados` | Muestra/oculta los agotados en los catálogos | `false` (ocultos) |
| `campoDestacado` | Campo del JSON que marca destacados | `"destacado"` |
| `descuentoMayoreo` | Descuento del catálogo mayorista (0.20 = 20%) | `0.20` |
| `monedaDefault` | `usd` · `ves` · `both` | `both` |
| `idiomaDefault` | `es` · `en` | `es` |
| `rateB` | **Nueva lógica:** Bs = `precio_venta_numero × rateB`; USD = Bs ÷ tasa BCV | `990` |
| `tasaBcvFallback` | Tasa usada solo si `data/bcv.json` falla o es viejo | `872.3927` |

> ✏️ **Cambia el número de WhatsApp SOLO aquí.** Los enlaces del footer,
> contacto y hero se sincronizan automáticamente al cargar la página.

---

## 🏦 Tasa BCV automática (GitHub Action)

El navegador **no puede** scrapear bcv.org.ve (bloqueo CORS). La solución:
un workflow de GitHub Actions que corre **en el servidor de GitHub** a las
**8:00 AM (hora Venezuela)** todos los días:

- Ejecuta `scripts/scrape_bcv.py` (requests + BeautifulSoup).
- Actualiza `data/bcv.json` con la tasa y la fecha.
- Hace commit y push automático → el sitio publicado se actualiza solo.

**Activarla:** al subir el repo, la Action ya está en
`.github/workflows/bcv-scrape.yml`. Ve a la pestaña **Actions** del repo,
aparecerá "Actualizar tasa BCV". Haz clic en **Run workflow** para probarla
en cualquier momento.

**Si falla** (el BCV cambió su web o está caído): el sitio usa
`CONFIG.tasaBcvFallback` y lo indica en el footer ("Tasa de respaldo").
El sitio **nunca** se rompe.

**Si quieres desactivar la Action** y manejar la tasa a mano: solo edita
`data/bcv.json` directamente (y ajusta también el fallback en `config.js`).

---

## 🧸 Agregar / editar productos — `data/products.json`

Cada producto sigue el formato de Treinta Shops:

```json
{
  "id": 10,
  "id_treinta": "...",
  "codigo": null,
  "nombre": "Producto Nuevo",
  "cantidad_disponible": 5,
  "cantidad_minima": null,
  "precio_venta": "$ 18",
  "precio_venta_numero": 18,
  "costo_compra": null,
  "costo_compra_numero": null,
  "categoria": "Juguetes",
  "descripcion": "Descripción breve y respetuosa.",
  "impuestos": null,
  "en_catalogo_virtual": "SI",
  "tipo_producto": "PRODUCTO",
  "fotos": ["fotos/prod_10.png"],
  "fotos_urls": ["https://...aws.../prod_10.png"]
}
```

**Reglas del sistema:**

- Solo aparecen los que tienen `"en_catalogo_virtual": "SI"` y
  `"tipo_producto": "PRODUCTO"` (sirve para ocultar productos sin borrarlos).
- **Prioridad de fotos:** primero `fotos` (local) → si no hay, `fotos_urls`
  (AWS) → si tampoco, placeholder elegante con el logo.
- Sube la imagen a la carpeta `fotos/` y referencia la ruta exacta
  (ej. `"fotos/prod_10.png"`). Tamaño recomendado: **800×800 px**.
- **Multi-categoría:** un producto puede tener varias categorías. En el JSON
  usa un string separado por comas: `"categoria": "Lenceria, Novedades"` o un
  array: `"categoria": ["Lenceria", "Novedades"]`. En el catálogo el cliente
  puede seleccionar varias categorías a la vez (el producto entra si coincide
  con **alguna** de ellas).
- `cantidad_disponible: 0` → el producto se muestra como **AGOTADO** con el
  botón deshabilitado.
- **Destacados:** agrega `"destacado": "SI"` (o `true`) al producto para que
  aparezca en la sección de destacados del inicio. Si ninguno lo tiene, se usan
  los primeros `destacadosLimite` del JSON.
- **Agotados:** con `mostrarAgotados: false` los productos sin stock no
  aparecen en ningún catálogo (con `true` se ven con su badge "Agotado").
- El **precio en $ es `precio_venta_numero`**; el precio en Bs se calcula
  automáticamente con la tasa BCV. En mayoreo se aplica el % del config.

**Cálculo de precios (nueva lógica):** el `precio_venta_numero` del JSON es la
**base**. Los bolívares se calculan con tu `rateB` y el dólar se deriva de la
tasa BCV del día:

| Catálogo | Bolívares | Dólares |
|---|---|---|
| Detal | `base × rateB` | `Bs ÷ tasa BCV` |
| Mayoreo | `Bs detal × (1 − descuentoMayoreo)` | `Bs mayoreo ÷ tasa BCV` |

---

## 🌐 Multi-idioma y multi-moneda

- **Idioma:** selector ES/EN en el header. Todos los textos viven en
  `lang/es.json` y `lang/en.json` (diccionario clave-valor). Para añadir
  otro idioma: crea `lang/pt.json`, agrega la opción al selector del header
  y traduce el JSON.
- **Moneda:** selector $ / Bs / Ambas. Los precios en las tarjetas se
  muestran u ocultan con clases CSS según la elección. El carrito y el
  checkout **siempre muestran ambos totales** (el pedido por WhatsApp lleva
  los dos montos).

---

## 🔞 Modal de mayoría de edad

`catalogo.html` y `mayoreo.html` tienen `data-agegate` en el `<body>`.
Al entrar se muestra el modal (una vez por sesión, `sessionStorage`).
Edita los textos en `lang/*.json` → sección `agegate`.

---

## 🛒 Checkout por WhatsApp (sin pasarela)

1. El cliente agrega productos al carrito (persistente en su navegador).
2. "Finalizar pedido" abre el resumen con totales en $ y Bs.
3. Completa nombre, teléfono, método de entrega (retiro/envío) y notas.
4. "Enviar pedido por WhatsApp" abre `wa.me` con un mensaje organizado:
   artículos, cantidades, subtotales, totales, tasa BCV del día y datos
   de entrega. Tú confirmas pago y envío por el chat.

---

## 🎨 Personalización de estilos

Todo el design system está en las variables de `css/styles.css` (inicio del
archivo): colores, tipografías, radios y sombras. La paleta magenta/negro
está derivada del logo de NOPTABÚ. Tipografías: **Playfair Display**
(títulos) + **Inter** (cuerpo), cargadas desde Google Fonts.

---

## ✅ Checklist antes de publicar

- [ ] Cambiar `whatsapp` en `js/config.js` (número real)
- [ ] Cambiar `noptabu@gmail.com` en `contacto.html` y `footer` (o buscar y reemplazar)
- [ ] Reemplazar `TUDOMINIO` en `robots.txt` y `sitemap.xml` por tu dominio
- [ ] Revisar textos de pagos/envíos/privacidad con tus datos reales
- [ ] Sustituir `data/products.json` y las fotos de `fotos/` por el catálogo real
- [ ] Probar la GitHub Action del BCV en la pestaña Actions
- [ ] Probar el flujo completo de compra hasta el mensaje de WhatsApp

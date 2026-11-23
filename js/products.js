/* ==========================================================================
 * PRODUCTS.JS ? Carga y normalizacion de data/products.json
 * --------------------------------------------------------------------------
 * - Filtra solo productos activos (en_catalogo_virtual == "SI",
 *   tipo_producto == "PRODUCTO").
 * - Normaliza cada producto a un objeto uniforme para toda la app.
 * - Prioriza fotos locales ("fotos/..."); usa las URLs de AWS solo como
 *   respaldo, y si tampoco hay, usa un placeholder con el logo.
 * - Conserva TODAS las fotos del producto en `fotos` para la galería del
 *   modal, manteniendo `foto` como imagen principal para tarjetas/carrito.
 * ========================================================================== */

const PRODUCTOS = {
    lista: [],

    /* Imagen de respaldo cuando un producto no tiene ninguna foto */
    PLACEHOLDER: "assets/img/placeholder-producto.svg",

    /* ------------------------------------------------------------------
     * cargar() ? Descarga y normaliza el JSON de productos
     * ------------------------------------------------------------------ */
    async cargar() {
        const respuesta = await fetch("data/products.json", { cache: "no-cache" });
        const crudos = await respuesta.json();

        this.lista = crudos
            /* Solo productos visibles en el catalogo virtual */
            /* Visibles: en catalogo, tipo PRODUCTO y NO eliminados
               (el admin marca "eliminado": "SI" en vez de borrar) */
            .filter((p) => p.en_catalogo_virtual === "SI"
                && p.tipo_producto === "PRODUCTO"
                && p.eliminado !== "SI")
            /* Normalizamos a un objeto uniforme y seguro */
            .map((p) => {
                const fotos = this.fotosDe(p);
                return {
                    id: p.id,
                    codigo: p.codigo ? String(p.codigo) : null,
                    nombre: String(p.nombre || `Producto ${p.id}`).trim(),
                    /* Multi-categoria: admite array ["A","B"], string separado
                       por comas "A, B" o string simple. Siempre queda como array */
                    categorias: Array.isArray(p.categoria)
                        ? p.categoria.map((c) => String(c).trim()).filter(Boolean)
                        : String(p.categoria || "General").split(",").map((c) => c.trim()).filter(Boolean),
                    descripcion: p.descripcion || "",
                    /* precioBase: precio_venta_numero del JSON (base para
                       la nueva logica: VES = base x rateB) */
                    precioBase: parseFloat(p.precio_venta_numero) || 0,
                    stock: parseInt(p.cantidad_disponible) || 0,
                    /* Foto principal + galeria completa: local primero,
                       AWS como respaldo */
                    foto: fotos[0] || this.PLACEHOLDER,
                    fotos,
                    agotado: (parseInt(p.cantidad_disponible) || 0) <= 0,
                    /* Destacado: marca configurable (campoDestacado en config.js) */
                    destacado: p[CONFIG.campoDestacado || "destacado"] === "SI"
                        || p[CONFIG.campoDestacado || "destacado"] === true,
                    /* Nuevos campos del formato Treinta 2026 */
                    url: p.url || null,
                    stock_status: p.stock_status || "IN_STOCK",
                    oferta: p.oferta === "SI" ? "SI" : "NO",
                    creado_el: p.creado_el || null,
                    actualizado_el: p.actualizado_el || null,
                    eliminado_el: p.eliminado_el || null,
                };
            });
        return this.lista;
    },

    /* ------------------------------------------------------------------
     * fotosDe(p) ? Lista normalizada de fotos del producto.
     * Prioridad: todas las fotos locales > todas las URLs de AWS.
     * Acepta "fotos/x.png" o el nombre suelto "x.png" (export de Treinta).
     * ------------------------------------------------------------------ */
    fotosDe(p) {
        const locales = (Array.isArray(p.fotos) ? p.fotos : (p.fotos ? [p.fotos] : []))
            .filter(Boolean)
            .map((f) => String(f).trim())
            .filter(Boolean)
            .map((ruta) => (ruta.includes("/") ? ruta : `fotos/${ruta}`));

        if (locales.length > 0) return [...new Set(locales)];

        if (CONFIG.fotosExternas !== false) {
            const externas = (Array.isArray(p.fotos_urls) ? p.fotos_urls : (p.fotos_urls ? [p.fotos_urls] : []))
                .filter(Boolean)
                .map((url) => String(url).trim())
                .filter(Boolean);
            if (externas.length > 0) return [...new Set(externas)];
        }

        return [];
    },

    /* ------------------------------------------------------------------
     * categorias() ? Lista unica de categorias para los filtros
     * ------------------------------------------------------------------ */
    categorias() {
        return [...new Set(this.lista.flatMap((p) => p.categorias))].sort();
    },

    /* ------------------------------------------------------------------
     * buscar(id) ? Encuentra un producto por su id
     * ------------------------------------------------------------------ */
    buscar(id) {
        return this.lista.find((p) => p.id === Number(id));
    },
};

window.PRODUCTOS = PRODUCTOS;

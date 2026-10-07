/* ==========================================================================
 * PRODUCTS.JS ? Carga y normalizacion de data/products.json
 * --------------------------------------------------------------------------
 * - Filtra solo productos activos (en_catalogo_virtual == "SI",
 *   tipo_producto == "PRODUCTO").
 * - Normaliza cada producto a un objeto uniforme para toda la app.
 * - Prioriza fotos locales ("fotos/..."); usa las URLs de AWS solo como
 *   respaldo, y si tampoco hay, usa un placeholder con el logo.
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
            .map((p) => ({
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
                /* Foto principal: local primero, AWS como respaldo */
                foto: this.elegirFoto(p),
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
            }));
        return this.lista;
    },

    /* ------------------------------------------------------------------
     * elegirFoto(p) ? Prioridad: fotos locales > fotos_urls AWS > placeholder
     * ------------------------------------------------------------------ */
    elegirFoto(p) {
        if (Array.isArray(p.fotos) && p.fotos.length > 0 && p.fotos[0]) {
            /* Ruta local: acepta "fotos/x.png" o el nombre suelto "x.png"
               (el export nuevo de Treinta trae solo el nombre de archivo) */
            const ruta = p.fotos[0];
            return ruta.includes("/") ? ruta : `fotos/${ruta}`;
        }
        if (CONFIG.fotosExternas !== false && Array.isArray(p.fotos_urls) && p.fotos_urls.length > 0) {
            return p.fotos_urls[0]; /* Respaldo: URL de AWS */
        }
        return this.PLACEHOLDER;
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

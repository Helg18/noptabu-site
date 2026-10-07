/* ==========================================================================
 * BCV.JS ? Tasa de cambio del Banco Central de Venezuela
 * --------------------------------------------------------------------------
 * 1. Intenta leer data/bcv.json (archivo ESTATICO generado cada dia por la
 *    GitHub Action que hace scraping de bcv.org.ve ? ver .github/workflows).
 * 2. Si falla o tiene mas de 48 horas, usa CONFIG.tasaBcvFallback.
 * 3. Ofrece funciones de formato venezolano (miles con ".", decimales con ",")
 *    y de calculo de precios al detal y al mayoreo.
 * ========================================================================== */

const BCV = {
    /* Tasa vigente en bolivares por 1 dolar */
    tasa: 0,

    /* Fecha de la tasa vigente (string "AAAA-MM-DD") */
    fecha: "",

    /* Indica si la tasa viene del fallback manual (true) o del BCV (false) */
    esRespaldo: true,

    /* ------------------------------------------------------------------
     * cargar() ? Lee data/bcv.json y decide si es usable o se usa el fallback
     * ------------------------------------------------------------------ */
    async cargar() {
        try {
            /* "cache: no-cache" fuerza a verificar si el json cambio en el repo */
            const respuesta = await fetch("data/bcv.json", { cache: "no-cache" });
            if (!respuesta.ok) throw new Error("bcv.json no disponible");

            const datos = await respuesta.json();
            const tasa = parseFloat(datos.usd_bcv);
            if (!tasa || tasa <= 0) throw new Error("Tasa inv\u{E1}lida en bcv.json");

            /* Revisar antiguedad: si tiene mas de 48 h se considera "vieja" */
            const antiguedadHoras = (Date.now() - new Date(datos.fecha + "T12:00:00")) / 36e5;
            this.esRespaldo = antiguedadHoras > 48;

            /* Truncar a 2 decimales SIN redondear (872.3927 -> 872.39) */
            this.tasa = Math.floor(tasa * 100) / 100;
            /* La fecha se muestra tal cual venga; si es vieja, se indica */
            this.fecha = datos.fecha || "";
        } catch (error) {
            /* Cualquier problema ? usar la tasa de respaldo del config */
            console.warn("[BCV] Usando tasa de respaldo:", error.message);
            this.tasa = Math.floor((parseFloat(CONFIG.tasaBcvFallback) || 0) * 100) / 100;
            this.fecha = new Date().toISOString().slice(0, 10);
            this.esRespaldo = true;
        }
    },

    /* ------------------------------------------------------------------
     * NUEVA LOGICA DE PRECIOS (configurable en config.js):
     *   precio_ves = rateB x precio_base
     *   precio_usd = precio_ves / tasa BCV del dia
     * ------------------------------------------------------------------ */

    /* precioVes(base, modo) - Bolivares: base del JSON x rateB.
       En mayoreo se aplica el % de descuento (igual que antes) */
    precioVes(base, modo = "detal") {
        const ves = base * CONFIG.rateB;
        return modo === "mayoreo" ? ves * (1 - CONFIG.descuentoMayoreo) : ves;
    },

    /* precioUsd(ves) - Dolares: bolivares entre la tasa BCV del dia */
    precioUsd(ves) {
        return this.tasa > 0 ? ves / this.tasa : 0;
    },

    /* ------------------------------------------------------------------
     * fmtUsd(n) ? Formato dolar: "$ 10.00" (estandar anglosajon)
     * ------------------------------------------------------------------ */
    fmtUsd(n) {
        return "$ " + Number(n).toLocaleString("en-US", {
            minimumFractionDigits: 2, maximumFractionDigits: 2,
        });
    },

    /* ------------------------------------------------------------------
     * fmtVes(n) ? Formato bolivar venezolano: "Bs 850,00"
     *             (miles con punto, decimales con coma)
     * ------------------------------------------------------------------ */
    fmtVes(n) {
        return "Bs " + Number(n).toLocaleString("de-DE", {
            minimumFractionDigits: 2, maximumFractionDigits: 2,
        });
    },

    /* ------------------------------------------------------------------
     * etiquetaFooter() ? Texto corto con tasa y fecha para el footer
     * ------------------------------------------------------------------ */
    etiquetaFooter() {
        const fechaBonita = this.fecha.split("-").reverse().join("/");
        return `Tasa BCV (${fechaBonita}): ${this.fmtVes(this.tasa).replace("Bs ", "Bs ")}`;
    },
};

/* Exponer globalmente */
window.BCV = BCV;

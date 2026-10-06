/* ==========================================================================
 * MAIN.JS ? Orquestador general del sitio
 * --------------------------------------------------------------------------
 * ORDEN DE ARRANQUE (importante):
 *   1. PRIMERO se conecta toda la UI critica (menu movil, modales, carrito,
 *      WhatsApp) ? sin depender de ningun fetch. Asi el sitio nunca queda
 *      "muerto" aunque un JSON falle (p. ej. al abrirlo con file://).
 *   2. DESPUES cargan los datos (tasa BCV, idioma, productos). Cada carga
 *      es independiente: si una falla, las demas igual funcionan.
 *   3. Al final: footer con tasa BCV y modal de mayoria de edad.
 * ========================================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    /* ==================================================================
     * BLOQUE A ? UI CRITICA (sincronica, sin dependencias de red)
     * ================================================================== */

    /* ---- A1. Menu movil (hamburguesa) ---- */
    const botonMenu = document.getElementById("menu-toggle");
    if (botonMenu) {
        botonMenu.addEventListener("click", () => {
            document.body.classList.toggle("nav-abierto");
            botonMenu.setAttribute("aria-expanded",
                document.body.classList.contains("nav-abierto"));
        });
        /* Cerrar el menu al elegir un enlace */
        document.querySelectorAll("#nav-principal a").forEach((enlace) =>
            enlace.addEventListener("click", () =>
                document.body.classList.remove("nav-abierto")));
    }

    /* ---- A2. Panel del carrito (abrir/cerrar) ---- */
    const btnCarrito = document.getElementById("btn-carrito");
    if (btnCarrito) {
        btnCarrito.addEventListener("click", () => {
            document.getElementById("carrito-panel").classList.add("abierto");
            document.getElementById("overlay").classList.add("visible");
            document.body.classList.add("carrito-abierto");
        });
    }
    const btnCerrarCarrito = document.getElementById("carrito-cerrar");
    if (btnCerrarCarrito) btnCerrarCarrito.addEventListener("click", cerrarPanelCarrito);

    /* ---- A3. Boton flotante de WhatsApp ---- */
    const btnWhatsapp = document.getElementById("btn-whatsapp");
    if (btnWhatsapp) {
        btnWhatsapp.href = `https://api.whatsapp.com/send?phone=${CONFIG.whatsapp}&text=${encodeURIComponent(CONFIG.whatsappMensaje)}`;
    }


    /* Enlace de WhatsApp del hero de la pagina de inicio */
    const heroWhatsapp = document.getElementById("hero-whatsapp");
    if (heroWhatsapp) {
        heroWhatsapp.href = `https://api.whatsapp.com/send?phone=${CONFIG.whatsapp}&text=${encodeURIComponent(CONFIG.whatsappMensaje)}`;
    }

    /* Sincroniza los enlaces wa.me escritos en el HTML (footer, contacto)
       con el numero real del config ? asi solo cambias el numero en un sitio */
    document.querySelectorAll(
        'a[href^="https://wa.me/"]:not(#btn-whatsapp), a[href^="https://api.whatsapp.com/"]:not(#btn-whatsapp)'
    ).forEach((enlace) => {
        enlace.href = `https://api.whatsapp.com/send?phone=${CONFIG.whatsapp}`;
    });

    /* ---- A4. Formulario de contacto ? WhatsApp ---- */
    const formContacto = document.getElementById("form-contacto");
    if (formContacto) {
        formContacto.addEventListener("submit", (e) => {
            e.preventDefault();
            const nombre = document.getElementById("ct-nombre").value.trim();
            const telefono = document.getElementById("ct-telefono").value.trim();
            const mensaje = document.getElementById("ct-mensaje").value.trim();
            if (!nombre || !mensaje) {
                mostrarToast(t("js.contacto_faltan_datos"));
                return;
            }
            const texto = [
                `\u{1F4AC} *${t("js.contacto_asunto")} NOPTAB\u{DA}*`,
                `\u{1F464} ${t("js.wa_nombre")}: ${nombre}`,
                telefono ? `\u{1F4F1} ${t("js.wa_telefono")}: ${telefono}` : null,
                `\u{1F4DD} ${t("js.wa_notas")}: ${mensaje}`,
            ].filter(Boolean).join("\n");
            window.open(`https://api.whatsapp.com/send?phone=${CONFIG.whatsapp}&text=${encodeURIComponent(texto)}`,
                "_blank", "noopener");
            formContacto.reset();
        });
    }

    /* ---- A5. Cierre con tecla Escape ---- */
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            document.querySelectorAll(".modal.visible").forEach((m) =>
                m.classList.remove("visible"));
            cerrarPanelCarrito();
        }
    });

    /* ==================================================================
     * BLOQUE B ? CARGA DE DATOS (cada una tolerante a fallos)
     * ================================================================== */

    /* ---- B1. Tasa BCV: si falla, se usa el fallback del config ---- */
    try {
        await BCV.cargar();
    } catch (e) {
        console.error("[BCV] Fall\u{F3} la carga:", e);
        BCV.tasa = parseFloat(CONFIG.tasaBcvFallback) || 0;
        BCV.fecha = new Date().toISOString().slice(0, 10);
        BCV.esRespaldo = true;
    }

    /* ---- B2. Traducciones: si falla, se queda el idioma por defecto ---- */
    try {
        await I18N.cargar();
    } catch (e) {
        console.error("[I18N] Fall\u{F3} la carga:", e);
    }

    /* ---- B3. Productos: si falla, el sitio sigue vivo pero sin catalogo ---- */
    try {
        await PRODUCTOS.cargar();
    } catch (e) {
        console.error("[PRODUCTOS] Fall\u{F3} la carga:", e);
        PRODUCTOS.lista = [];
        mostrarToast(t("js.error_datos"));
    }

    /* ---- B4. Carrito y catalogos (ya con datos disponibles) ---- */
    CARRITO.init();
    /* CATALOGO solo existe en paginas que cargan catalog.js (inicio y
       catalogos). En las demas (pagos, envios, politicas, contacto) este
       guard evita el ReferenceError que abortaba actualizarFooterBCV() */
    window.CATALOGO?.init();
    actualizarFooterBCV();

    /* ==================================================================
     * BLOQUE C ? Selectores y modal de edad
     * ================================================================== */

    /* ---- C1. Selector de idioma ---- */
    const selectorIdioma = document.getElementById("selector-idioma");
    if (selectorIdioma) {
        selectorIdioma.value = I18N.idioma;
        selectorIdioma.addEventListener("change", async () => {
            await I18N.cambiar(selectorIdioma.value);
            actualizarFooterBCV();
            CARRITO.render();
        });
    }

    /* ---- C2. Selector de moneda ---- */
    const selectorMoneda = document.getElementById("selector-moneda");
    if (selectorMoneda) {
        selectorMoneda.value = localStorage.getItem("noptabu_moneda") || CONFIG.monedaDefault;
        selectorMoneda.addEventListener("change", () => {
            localStorage.setItem("noptabu_moneda", selectorMoneda.value);
            window.CATALOGO?.aplicarMoneda();
        });
    }

    /* ---- C3. Modal de mayoria de edad (solo paginas con data-agegate) ---- */
    if (document.body.dataset.agegate !== undefined) {
        initAgeGate();
    }
});

/* ==========================================================================
 * Gestion de modales generica
 * ========================================================================== */

/* abrirModal(id) ? Muestra un modal por su id */
window.abrirModal = (id) => {
    document.getElementById(id)?.classList.add("visible");
    document.getElementById("overlay")?.classList.add("visible");
};

/* cerrarModal(id) ? Oculta un modal por su id */
window.cerrarModal = (id) => {
    document.getElementById(id)?.classList.remove("visible");
    if (id === "modal-checkout") document.body.classList.remove("checkout-abierto");
    if (!document.querySelector(".modal.visible")) {
        document.getElementById("overlay")?.classList.remove("visible");
    }
};

/* cerrarPanelCarrito() ? Oculta el panel lateral del carrito */
window.cerrarPanelCarrito = () => {
    document.getElementById("carrito-panel")?.classList.remove("abierto");
    document.body.classList.remove("carrito-abierto");
    if (!document.querySelector(".modal.visible")) {
        document.getElementById("overlay")?.classList.remove("visible");
    }
};

/* Clic en el overlay: cierra carrito y cualquier modal abierto */
document.addEventListener("click", (e) => {
    if (e.target.id === "overlay") {
        document.querySelectorAll(".modal.visible").forEach((m) =>
            m.classList.remove("visible"));
        cerrarPanelCarrito();
    }
    /* Botones con data-cerrar-modal cierran su modal padre */
    if (e.target.closest("[data-cerrar-modal]")) {
        cerrarModal(e.target.closest(".modal").id);
    }
});

/* ==========================================================================
 * mostrarToast(mensaje) ? Aviso breve tipo "snackbar" abajo al centro
 * ========================================================================== */
window.mostrarToast = (mensaje) => {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = mensaje;
    toast.classList.add("visible");
    clearTimeout(toast._temporizador);
    toast._temporizador = setTimeout(() => toast.classList.remove("visible"), 2600);
};

/* ==========================================================================
 * actualizarFooterBCV() ? Escribe tasa y fecha en el footer
 * ========================================================================== */
function actualizarFooterBCV() {
    const info = document.getElementById("bcv-info");
    const fecha = document.getElementById("bcv-fecha");
    if (info) info.textContent = BCV.etiquetaFooter();
    if (fecha) {
        fecha.textContent = BCV.esRespaldo
            ? t("js.bcv_respaldo")
            : t("js.bcv_oficial");
    }
    const anio = document.getElementById("anio");
    if (anio) anio.textContent = new Date().getFullYear();
}

/* ==========================================================================
 * initAgeGate() ? Modal de confirmacion de mayoria de edad
 * --------------------------------------------------------------------------
 * - Se muestra UNA VEZ por sesion (sessionStorage).
 * - "Entrar" guarda la aceptacion y deja pasar.
 * - "Salir" redirige fuera del sitio (por defecto a Google).
 * ========================================================================== */
function initAgeGate() {
    const CLAVE = "noptabu_mayor_edad";

    /* Si ya confirmo en esta sesion, no se muestra de nuevo */
    if (sessionStorage.getItem(CLAVE) === "si") return;

    abrirModal("modal-edad");

    document.getElementById("edad-entrar").addEventListener("click", () => {
        sessionStorage.setItem(CLAVE, "si");
        cerrarModal("modal-edad");
    });

    document.getElementById("edad-salir").addEventListener("click", () => {
        window.location.href = "https://www.google.com";
    });
}

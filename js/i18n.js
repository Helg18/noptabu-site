/* ==========================================================================
 * I18N.JS ? Sistema multi-idioma (espanol / ingles)
 * --------------------------------------------------------------------------
 * - Lee lang/es.json o lang/en.json segun la preferencia guardada.
 * - Traduce cualquier elemento con el atributo data-i18n="clave.anidada".
 * - data-i18n-ph traduce el placeholder de inputs.
 * - data-i18n-html permite insertar HTML traducido (usar con cuidado).
 * - Las traducciones usadas dentro de JS viven en la seccion "js" del JSON
 *   y se acceden con t("js.clave").
 * - El idioma elegido persiste en localStorage.
 * ========================================================================== */

const I18N = {
    idioma: "es",
    diccionario: {},

    /* ------------------------------------------------------------------
     * detectar() ? Idioma guardado o el por defecto del config
     * ------------------------------------------------------------------ */
    detectar() {
        return localStorage.getItem("noptabu_idioma") || CONFIG.idiomaDefault;
    },

    /* ------------------------------------------------------------------
     * cargar() ? Descarga el diccionario del idioma activo
     * ------------------------------------------------------------------ */
    async cargar() {
        this.idioma = this.detectar();
        try {
            const respuesta = await fetch(`lang/${this.idioma}.json`, { cache: "no-cache" });
            this.diccionario = await respuesta.json();
        } catch (error) {
            console.error("[I18N] No se pudo cargar el idioma:", error);
            this.diccionario = {};
        }
        document.documentElement.lang = this.idioma;
        this.aplicar();
    },

    /* ------------------------------------------------------------------
     * obtener(clave) ? Busca una clave anidada tipo "cart.titulo"
     * ------------------------------------------------------------------ */
    obtener(clave) {
        return clave.split(".").reduce((obj, parte) => obj?.[parte], this.diccionario)
            ?? clave;
    },

    /* ------------------------------------------------------------------
     * aplicar() ? Traduce todos los elementos marcados en el DOM
     * ------------------------------------------------------------------ */
    aplicar() {
        /* Texto plano */
        document.querySelectorAll("[data-i18n]").forEach((el) => {
            el.textContent = this.obtener(el.dataset.i18n);
        });
        /* Placeholders de inputs y textareas */
        document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
            el.placeholder = this.obtener(el.dataset.i18nPh);
        });
        /* Contenido HTML (solo para textos con etiquetas internas) */
        document.querySelectorAll("[data-i18n-html]").forEach((el) => {
            el.innerHTML = this.obtener(el.dataset.i18nHtml);
        });
    },

    /* ------------------------------------------------------------------
     * cambiar(idioma) ? Cambia de idioma y recarga las traducciones
     * ------------------------------------------------------------------ */
    async cambiar(idioma) {
        localStorage.setItem("noptabu_idioma", idioma);
        await this.cargar();
        /* Disparar evento para que otros modulos (carrito, catalogo) se re-rendericen */
        document.dispatchEvent(new CustomEvent("idioma:cambiado"));
    },
};

/* Atajo global: t("js.algo") dentro de cualquier modulo */
window.t = (clave) => I18N.obtener(clave);
window.I18N = I18N;

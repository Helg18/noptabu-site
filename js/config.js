/* ==========================================================================
 * CONFIG.JS ? Configuracion central de NOPTABU
 * --------------------------------------------------------------------------
 * Este es el UNICO archivo que deberias editar para:
 *   - Cambiar el numero de WhatsApp
 *   - Cambiar el descuento de mayoreo
 *   - Cambiar la tasa BCV de respaldo (fallback)
 *   - Ajustar idioma y moneda por defecto
 * ========================================================================== */

const CONFIG = {
    /* Numero de WhatsApp en formato internacional SIN "+" ni espacios.
       Ejemplo Venezuela: "584121234567" */
    whatsapp: "584146693604",

    /* Mensaje inicial cuando alguien escribe por WhatsApp flotante */
    whatsappMensaje: "Hola NOPTAB\u{DA}, quisiera informaci\u{F3}n sobre sus productos.",

    /* Muestra los productos AGOTADOS en los catalogos (detal, mayoreo e
       inicio). false = los oculta por completo; true = los muestra con
       su badge "Agotado" y boton deshabilitado */
    mostrarAgotados: false,

    /* Campo del products.json que marca un producto como DESTACADO
       (aparece en la seccion de destacados del inicio).
       Acepta como valor: "SI" o true. Si NINGUN producto tiene la marca,
       el inicio usa los primeros "destacadosLimite" del JSON (orden actual) */
    campoDestacado: "destacado",

    /* Cuantos productos destacados muestra maximo la pagina de inicio */
    destacadosLimite: 8,

    /* --- NUEVA LOGICA DE PRECIOS ---
       El precio del JSON (precio_venta_numero) es la BASE:
         precio_ves = rateB x precio_base
         precio_usd = precio_ves / tasa BCV del dia
       Ejemplo con rateB 1090 y BCV 872,39: base 15 -> Bs 16.350,00 -> $ 18,74 */
    rateB: 1090,

    /* Descuento aplicado al catalogo de MAYOREO (0.20 = 20%).
       Se descuenta del precio en bolivares (equivale a la base) */
    descuentoMayoreo: 0.20,

    /* Moneda por defecto: "usd" | "ves" | "both" (ambas) */
    monedaDefault: "both",

    /* Idioma por defecto: "es" | "en" */
    idiomaDefault: "es",

    /* Tasa BCV de RESPALDO: se usa solo si data/bcv.json no existe,
       esta danado o es muy antiguo (p. ej. fallo la GitHub Action).
       Actualizala manualmente aqui si lo necesitas. */
    tasaBcvFallback: 873.86,

    /* Edad minima para entrar al catalogo (no editar salvo cambio legal) */
    edadMinima: 18,

    /* Cantidad maxima por producto en el carrito */
    cantidadMaxima: 99,

    /* Correo de contacto mostrado en la pagina de contacto */
    correo: "noptabu@gmail.com",

    /* Ubicacion mostrada en contacto */
    ubicacion: "San Francisco, Estado Zulia, Venezuela",
};

/* Exponer la configuracion de forma global para los demas modulos */
window.CONFIG = CONFIG;

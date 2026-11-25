/* ==========================================================================
 * CART.JS ? Carrito de compras con persistencia y checkout por WhatsApp
 * --------------------------------------------------------------------------
 * - Persiste en localStorage (sobrevive recargas y cambios de pagina).
 * - Cada item guarda: id del producto, cantidad y modo ("detal"|"mayoreo").
 * - El carrito tiene UN solo modo: si agregas un producto del catalogo de
 *   mayoreo estando en modo detal (o viceversa), se pide confirmacion
 *   antes de cambiar todo el carrito.
 * - El checkout NO usa pasarela de pago: arma un mensaje de WhatsApp
 *   organizado con el detalle completo del pedido y abre api.whatsapp.com.
 * ========================================================================== */

const CARRITO = {
    CLAVE: "noptabu_carrito_v1",
    items: [],          /* [{ id, cantidad, modo }] */
    modo: "detal",      /* Modo vigente del carrito completo */
    pendiente: null,    /* Cambio de modo pendiente de confirmacion */

    /* ------------------------------------------------------------------
     * init() ? Restaura el carrito guardado y conecta los eventos del DOM
     * ------------------------------------------------------------------ */
    init() {
        try {
            const guardado = JSON.parse(localStorage.getItem(this.CLAVE) || "null");
            if (guardado && Array.isArray(guardado.items)) {
                this.items = guardado.items;
                this.modo = guardado.modo || "detal";
            }
        } catch { this.items = []; }

        /* Limpia items huerfanos (productos eliminados) y ajusta al stock */
        this.depurar();

        this.conectarEventos();
        this.render();
    },

    /* ------------------------------------------------------------------
     * guardar() ? Persiste el estado actual en localStorage
     * ------------------------------------------------------------------ */
    guardar() {
        localStorage.setItem(this.CLAVE, JSON.stringify({
            items: this.items, modo: this.modo,
        }));
    },

    /* ------------------------------------------------------------------
     * depurar() ? Quita items de productos inexistentes o agotados y
     * ajusta cantidades al stock actual
     * ------------------------------------------------------------------ */
    depurar() {
        /* Si el JSON de productos no cargo (red/CORS), no borrar el carrito */
        if (!PRODUCTOS.lista.length) return;

        const antes = this.items.length;
        const unidadesAntes = this.items.reduce((s, i) => s + i.cantidad, 0);

        this.items = this.items
            .filter((item) => {
                const p = PRODUCTOS.buscar(item.id);
                return p && !p.agotado && item.cantidad > 0;
            })
            .map((item) => {
                const p = PRODUCTOS.buscar(item.id);
                return { ...item, cantidad: Math.min(item.cantidad, this.maxStock(p)) };
            });

        const unidadesDespues = this.items.reduce((s, i) => s + i.cantidad, 0);
        if (this.items.length !== antes || unidadesDespues !== unidadesAntes) {
            if (this.items.length === 0) this.modo = "detal";
            this.guardar();
            /* Solo avisamos si se quitaron productos, no por reajustes */
            if (this.items.length < antes) mostrarToast(t("js.carrito_depurado"));
        }
    },

    /* ------------------------------------------------------------------
     * maxStock(p) ? Maximo permitido para un producto (stock y tope global)
     * ------------------------------------------------------------------ */
    maxStock(p) {
        const stock = parseInt(p?.stock, 10) || 0;
        return Math.max(1, Math.min(CONFIG.cantidadMaxima, stock));
    },

    /* ------------------------------------------------------------------
     * textoLimite(max) ? Mensaje "Solo hay N unidades disponibles"
     * ------------------------------------------------------------------ */
    textoLimite(max) {
        const clave = Number(max) === 1 ? "js.stock_limite_uno" : "js.stock_limite";
        return t(clave).replace("{n}", max);
    },

    /* ------------------------------------------------------------------
     * agregar(id, cantidad, modo) ? Anade un producto al carrito.
     * Si el carrito ya tiene otro modo, primero pide confirmacion.
     * ------------------------------------------------------------------ */
    agregar(id, cantidad = 1, modo = "detal") {
        const producto = PRODUCTOS.buscar(id);
        if (!producto || producto.agotado) return;

        if (this.items.length > 0 && this.modo !== modo) {
            this.pedirConfirmacionModo(id, cantidad, modo);
            return;
        }
        this.aplicarAgregado(id, cantidad, modo);
    },

    /* ------------------------------------------------------------------
     * aplicarAgregado() ? Agrega respetando el stock disponible
     * ------------------------------------------------------------------ */
    aplicarAgregado(id, cantidad, modo) {
        const p = PRODUCTOS.buscar(id);
        if (!p || p.agotado) return;

        /* Carrito vacio o cambio ya confirmado: fija el modo vigente */
        this.modo = modo;

        const maximo = this.maxStock(p);
        const pedida = Math.max(1, parseInt(cantidad, 10) || 1);
        const existente = this.items.find((i) => i.id === Number(id));
        let limitado = false;

        if (existente) {
            const nueva = Math.min(existente.cantidad + pedida, maximo);
            limitado = nueva === existente.cantidad;  /* no se pudo sumar nada */
            existente.cantidad = nueva;
        } else {
            limitado = pedida > maximo;
            this.items.push({
                id: Number(id),
                cantidad: Math.min(pedida, maximo),
                modo,
            });
        }

        this.guardar();
        this.render();
        mostrarToast(limitado
            ? this.textoLimite(maximo)
            : t("js.carrito_agregado"));
        this.animarBotonCarrito();
    },

    /* ------------------------------------------------------------------
     * pedirConfirmacionModo() ? Avisa que TODO el carrito cambiara de modo
     * ------------------------------------------------------------------ */
    pedirConfirmacionModo(id, cantidad, modo) {
        this.pendiente = { id, cantidad, modo };

        const modal = this.crearModalConfirmacion();
        const modoTexto = modo === "mayoreo"
            ? t("js.modo_mayoreo_corto") : t("js.modo_detal_corto");

        modal.querySelector("#confirmar-titulo").textContent =
            t("js.cambiar_modo_titulo");
        modal.querySelector("#confirmar-texto").textContent =
            t("js.cambiar_modo_aviso").replace("{modo}", modoTexto);

        abrirModal("modal-confirmar");
    },

    /* ------------------------------------------------------------------
     * crearModalConfirmacion() ? Crea (una sola vez) el modal de confirmacion
     * ------------------------------------------------------------------ */
    crearModalConfirmacion() {
        let modal = document.getElementById("modal-confirmar");
        if (modal) return modal;

        modal = document.createElement("div");
        modal.id = "modal-confirmar";
        modal.className = "modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "confirmar-titulo");
        modal.innerHTML = `
            <div class="modal-fondo"></div>
            <div class="modal-caja modal-centrado">
                <h2 id="confirmar-titulo"></h2>
                <p id="confirmar-texto"></p>
                <div class="modal-botones">
                    <button type="button" id="confirmar-si" class="btn btn-primario"></button>
                    <button type="button" id="confirmar-no" class="btn btn-fantasma"></button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        modal.querySelector("#confirmar-si").textContent = t("js.cambiar_modo_si");
        modal.querySelector("#confirmar-no").textContent = t("js.cambiar_modo_no");
        modal.querySelector("#confirmar-si").addEventListener("click", () =>
            this.resolverConfirmacion(true));
        modal.querySelector("#confirmar-no").addEventListener("click", () =>
            this.resolverConfirmacion(false));

        /* Escape u overlay cancelan la operacion (fase de captura para
           resolver antes de que main.js cierre el modal) */
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.pendiente) this.resolverConfirmacion(false);
        }, true);
        document.addEventListener("click", (e) => {
            if (e.target.id === "overlay" && this.pendiente) this.resolverConfirmacion(false);
        }, true);

        return modal;
    },

    /* ------------------------------------------------------------------
     * resolverConfirmacion() ? Aplica o descarta el cambio de modo
     * ------------------------------------------------------------------ */
    resolverConfirmacion(aceptar) {
        const pendiente = this.pendiente;
        this.pendiente = null;
        cerrarModal("modal-confirmar");
        if (aceptar && pendiente) {
            this.aplicarAgregado(pendiente.id, pendiente.cantidad, pendiente.modo);
        }
    },

    /* ------------------------------------------------------------------
     * quitar(id) ? Elimina un item del carrito
     * ------------------------------------------------------------------ */
    quitar(id) {
        this.items = this.items.filter((i) => i.id !== Number(id));
        if (this.items.length === 0) this.modo = "detal";
        this.guardar();
        this.render();
    },

    /* ------------------------------------------------------------------
     * fijarCantidad(id, cantidad) ? Cambia la cantidad de un item
     * ------------------------------------------------------------------ */
    fijarCantidad(id, cantidad) {
        const item = this.items.find((i) => i.id === Number(id));
        if (!item) return;

        const p = PRODUCTOS.buscar(id);
        const maximo = p ? this.maxStock(p) : CONFIG.cantidadMaxima;
        const solicitada = parseInt(cantidad, 10) || 1;
        const nueva = Math.max(1, Math.min(solicitada, maximo));

        /* Avisar cuando se intenta superar el stock disponible */
        if (solicitada > maximo) mostrarToast(this.textoLimite(maximo));

        item.cantidad = nueva;
        this.guardar();
        this.render();
    },

    /* ------------------------------------------------------------------
     * vaciar() ? Limpia todo el carrito
     * ------------------------------------------------------------------ */
    vaciar() {
        this.items = [];
        this.modo = "detal";
        this.guardar();
        this.render();
    },

    /* ------------------------------------------------------------------
     * totalVes() ? Suma de subtotales en BOLIVARES segun el modo vigente
     * ------------------------------------------------------------------ */
    totalVes() {
        return this.items.reduce((suma, item) => {
            const producto = PRODUCTOS.buscar(item.id);
            if (!producto) return suma;
            return suma + BCV.precioVes(producto.precioBase, this.modo) * item.cantidad;
        }, 0);
    },

    /* ------------------------------------------------------------------
     * render() ? Pinta el contenido del carrito en el panel lateral
     * ------------------------------------------------------------------ */
    render() {
        const contenedor = document.getElementById("carrito-items");
        const contador = document.getElementById("contador-carrito");
        if (!contenedor) return;

        /* Contador del icono del header */
        const totalUnidades = this.items.reduce((s, i) => s + i.cantidad, 0);
        contador.textContent = totalUnidades;
        contador.classList.toggle("oculto", totalUnidades === 0);

        /* Estado vacio */
        if (this.items.length === 0) {
            contenedor.innerHTML = `
                <div class="carrito-vacio">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none"
                         stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                        <circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>
                        <path d="M3 3h2l2.4 12.4a1.5 1.5 0 0 0 1.5 1.1h7.9a1.5 1.5 0 0 0 1.5-1.2L20 8H6"/>
                    </svg>
                    <p>${t("js.carrito_vacio")}</p>
                </div>`;
        } else {
            /* Lista de items con foto, nombre, cantidades y subtotal */
            contenedor.innerHTML = this.items.map((item) => {
                const p = PRODUCTOS.buscar(item.id);
                if (!p) return "";
                const unitVes = BCV.precioVes(p.precioBase, this.modo);
                const subtotalVes = unitVes * item.cantidad;
                return `
                <article class="carrito-item" data-id="${p.id}">
                    <img src="${p.foto}" alt="${escaparHtml(p.nombre)}" loading="lazy"
                         onerror="this.src='${PRODUCTOS.PLACEHOLDER}'">
                    <div class="carrito-item-info">
                        <h4>${escaparHtml(p.nombre)}</h4>
                        <p class="carrito-item-precio">${BCV.fmtUsd(BCV.precioUsd(unitVes))} / ${BCV.fmtVes(unitVes)}</p>
                        <div class="carrito-item-controles">
                            <button class="btn-cantidad" data-accion="restar" aria-label="-">\u{2212}</button>
                            <span class="carrito-cantidad">${item.cantidad}</span>
                            <button class="btn-cantidad" data-accion="sumar" aria-label="+">+</button>
                            <span class="carrito-subtotal">${BCV.fmtUsd(BCV.precioUsd(subtotalVes))}</span>
                        </div>
                    </div>
                    <button class="btn-quitar" data-accion="quitar" aria-label="${t("js.quitar")}">\u{2715}</button>
                </article>`;
            }).join("");
        }

        /* Totales en el pie del panel */
        const granTotalVes = this.totalVes();
        document.getElementById("carrito-total-usd").textContent = BCV.fmtUsd(BCV.precioUsd(granTotalVes));
        document.getElementById("carrito-total-ves").textContent = BCV.fmtVes(granTotalVes);
        document.getElementById("carrito-modo").textContent =
            this.modo === "mayoreo" ? t("js.modo_mayoreo") : t("js.modo_detal");

        const botonCheckout = document.getElementById("btn-checkout");
        if (botonCheckout) botonCheckout.disabled = this.items.length === 0;
    },

    /* ------------------------------------------------------------------
     * conectarEventos() ? Delegacion de clics dentro del panel del carrito
     * ------------------------------------------------------------------ */
    conectarEventos() {
        const contenedor = document.getElementById("carrito-items");
        if (contenedor) {
            contenedor.addEventListener("click", (e) => {
                const boton = e.target.closest("[data-accion]");
                if (!boton) return;
                const item = boton.closest(".carrito-item");
                const id = Number(item.dataset.id);
                const accion = boton.dataset.accion;
                const actual = this.items.find((i) => i.id === id);

                if (accion === "sumar") this.fijarCantidad(id, actual.cantidad + 1);
                if (accion === "restar") this.fijarCantidad(id, actual.cantidad - 1);
                if (accion === "quitar") this.quitar(id);
            });
        }

        const btnVaciar = document.getElementById("btn-vaciar");
        if (btnVaciar) btnVaciar.addEventListener("click", () => this.vaciar());

        const btnCheckout = document.getElementById("btn-checkout");
        if (btnCheckout) btnCheckout.addEventListener("click", () => this.abrirCheckout());

        /* Envio del pedido por WhatsApp */
        const btnEnviar = document.getElementById("btn-enviar-wa");
        if (btnEnviar) btnEnviar.addEventListener("click", () => this.enviarWhatsApp());

        /* Mostrar/ocultar campo de direccion segun el metodo de entrega */
        /* Telefono: solo digitos, +, espacios, guiones y parentesis.
           Se bloquean las letras mientras se escribe */
        const tel = document.getElementById("co-telefono");
        if (tel) tel.addEventListener("input", () => {
            tel.value = tel.value.replace(/[^\d+\s()-]/g, "");
        });

        const selEntrega = document.getElementById("co-entrega");
        if (selEntrega) {
            selEntrega.addEventListener("change", () => {
                document.getElementById("co-direccion-grupo").classList.toggle(
                    "oculto", selEntrega.value !== "envio");
            });
        }
    },

    /* ------------------------------------------------------------------
     * abrirCheckout() ? Abre el modal con el resumen del pedido
     * ------------------------------------------------------------------ */
    abrirCheckout() {
        /* Resumen de items dentro del modal de checkout */
        document.getElementById("co-resumen").innerHTML = this.items.map((item) => {
            const p = PRODUCTOS.buscar(item.id);
            if (!p) return "";
            const unitVes = BCV.precioVes(p.precioBase, this.modo);
            return `<div class="co-linea">
                        <span>${item.cantidad} \u{D7} ${escaparHtml(p.nombre)}</span>
                        <span>${BCV.fmtUsd(BCV.precioUsd(unitVes * item.cantidad))}</span>
                    </div>`;
        }).join("");

        const granTotalVes = this.totalVes();
        document.getElementById("co-total-usd").textContent = BCV.fmtUsd(BCV.precioUsd(granTotalVes));
        document.getElementById("co-total-ves").textContent = BCV.fmtVes(granTotalVes);
        document.getElementById("co-modo").textContent =
            this.modo === "mayoreo" ? t("js.modo_mayoreo") : t("js.modo_detal");

        cerrarPanelCarrito();
        document.body.classList.add("checkout-abierto");
        abrirModal("modal-checkout");
    },

    /* ------------------------------------------------------------------
     * enviarWhatsApp() ? Construye el mensaje organizado y abre api.whatsapp.com
     * ------------------------------------------------------------------ */
    enviarWhatsApp() {
        /* Validacion minima del formulario */
        const campoNombre = document.getElementById("co-nombre");
        const campoTelefono = document.getElementById("co-telefono");
        const nombre = campoNombre.value.trim();
        const telefono = campoTelefono.value.trim();
        if (!nombre || !telefono) {
            mostrarToast(t("js.checkout_faltan_datos"));
            (!nombre ? campoNombre : campoTelefono).focus();
            return;
        }

        const entrega = document.getElementById("co-entrega").value;
        const campoDireccion = document.getElementById("co-direccion");
        const direccion = campoDireccion.value.trim();
        const notas = document.getElementById("co-notas").value.trim();

        /* Si eligio envio a domicilio, la direccion es obligatoria */
        if (entrega === "envio" && !direccion) {
            mostrarToast(t("js.checkout_falta_direccion"));
            campoDireccion.focus();
            return;
        }

        /* Encabezado del mensaje */
        const modoTexto = this.modo === "mayoreo" ? t("js.modo_mayoreo") : t("js.modo_detal");
        const lineas = [
            `\u{1F6CD}\u{FE0F} *${t("js.wa_titulo")} NOPTAB\u{DA}*`,
            `\u{1F464} ${t("js.wa_nombre")}: ${nombre}`,
            `\u{1F4F1} ${t("js.wa_telefono")}: ${telefono}`,
            `\u{1F6D2} ${t("js.wa_modo")}: ${modoTexto}`,
            `\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}`,
            `\u{1F9FE} *${t("js.wa_articulos")}:*`,
        ];

        /* Detalle de cada articulo */
        this.items.forEach((item) => {
            const p = PRODUCTOS.buscar(item.id);
            if (!p) return;
            const unitVes = BCV.precioVes(p.precioBase, this.modo);
            const subtotalVes = unitVes * item.cantidad;
            lineas.push(
                `\u{25AA} ${item.cantidad} \u{D7} ${p.nombre} \u{2014} ${BCV.fmtUsd(BCV.precioUsd(unitVes))} = ${BCV.fmtUsd(BCV.precioUsd(subtotalVes))}`
            );
        });

        /* Totales, tasa y entrega */
        lineas.push(
            `\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}`,
            `*${t("js.wa_total")}:* ${BCV.fmtUsd(BCV.precioUsd(this.totalVes()))}`,
            `*${t("js.wa_total_ves")}:* ${BCV.fmtVes(this.totalVes())}`,
            `\u{1F4CA} ${BCV.etiquetaFooter()}`,
            entrega === "envio"
                ? `\u{1F69A} ${t("js.wa_envio")}: ${direccion || "\u{2014}"}`
                : `\u{1F3EA} ${t("js.wa_retiro")}`,
        );
        if (notas) lineas.push(`\u{1F4DD} ${t("js.wa_notas")}: ${notas}`);

        /* Abrir WhatsApp con el mensaje codificado */
        /* api.whatsapp.com DIRECTO: wa.me hace una redireccion que en Firefox
           corrompe los emojis del mensaje (los convierte en U+FFFD) */
const url = `https://api.whatsapp.com/send?phone=${CONFIG.whatsapp}&text=${encodeURIComponent(lineas.join("\n"))}`;
        window.open(url, "_blank", "noopener");
    },

    /* ------------------------------------------------------------------
     * animarBotonCarrito() ? Pequeno "pop" en el icono del carrito
     * ------------------------------------------------------------------ */
    animarBotonCarrito() {
        const btn = document.getElementById("btn-carrito");
        if (!btn) return;
        btn.classList.remove("pop");
        void btn.offsetWidth; /* Reinicia la animacion */
        btn.classList.add("pop");
    },
};

/* Funciones auxiliares globales compartidas con otros modulos */
window.CARRITO = CARRITO;

/* escaparHtml() ? Evita inyeccion de HTML al pintar nombres de productos */
window.escaparHtml = (texto) => {
    const div = document.createElement("div");
    div.textContent = texto;
    return div.innerHTML;
};

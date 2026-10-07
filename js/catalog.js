/* ==========================================================================
 * CATALOG.JS ? Renderizado del catalogo de productos
 * --------------------------------------------------------------------------
 * - Busca en la pagina cualquier contenedor con [data-catalogo] y lo llena
 *   con tarjetas de producto.
 * - Atributos del contenedor:
 *       data-modo   = "detal" | "mayoreo"   (define los precios)
 *       data-limite = numero (opcional, solo para destacados en el inicio)
 * - Incluye filtros por categoria y buscador (si existen en el DOM):
 *       #filtro-categorias  y  #buscador
 * - Cada tarjeta abre una vista rapida (#modal-producto) al hacer clic.
 * - Al agregar al carrito se respeta el stock (productos agotados se
 *   muestran con badge y boton deshabilitado).
 * ========================================================================== */

const CATALOGO = {
    filtrosSeleccionados: new Set(),
    textoBusqueda: "",

    /* ------------------------------------------------------------------
     * init() ? Renderiza cada contenedor de catalogo encontrado
     * ------------------------------------------------------------------ */
    init() {
        document.querySelectorAll("[data-catalogo]").forEach((contenedor) => {
            const modo = contenedor.dataset.modo || "detal";
            const limite = contenedor.dataset.limite
                ? (contenedor.dataset.limite === "config"
                    ? CONFIG.destacadosLimite          /* valor de config.js */
                    : parseInt(contenedor.dataset.limite))
                : null;
            this.pintar(contenedor, modo, limite);
        });
        this.conectarFiltros();
        this.conectarBusqueda();
        this.conectarVistaRapida();
    },

    /* ------------------------------------------------------------------
     * pintar(contenedor, modo, limite) ? Genera las tarjetas de producto
     * ------------------------------------------------------------------ */
    pintar(contenedor, modo, limite = null) {
        let lista = PRODUCTOS.lista;

        /* Config: ocultar productos agotados en todos los catalogos */
        if (!CONFIG.mostrarAgotados) {
            lista = lista.filter((p) => !p.agotado);
        }

        /* Filtros activos (solo en paginas de catalogo completo) */
        if (!limite) {
            /* Multi-categoria: el producto entra si coincide con ALGUNA
               de las categorias seleccionadas */
            if (this.filtrosSeleccionados.size > 0) {
                lista = lista.filter((p) =>
                    p.categorias.some((c) => this.filtrosSeleccionados.has(c)));
            }
            if (this.textoBusqueda) {
                const q = this.textoBusqueda.toLowerCase();
                /* Busca por nombre, categorias, ID y codigo del producto */
                lista = lista.filter((p) =>
                    p.nombre.toLowerCase().includes(q) ||
                    p.categorias.join(" ").toLowerCase().includes(q) ||
                    String(p.codigo || "").toLowerCase().includes(q));
            }
        }

        /* Destacados del inicio: solo los marcados como destacados.
           Si ninguno tiene la marca, respaldo: los primeros N del JSON */
        if (limite) {
            const destacados = lista.filter((p) => p.destacado);
            lista = destacados.length > 0
                ? destacados.slice(0, limite)
                : lista.slice(0, limite);
        }

        /* Mensaje cuando no hay resultados */
        if (lista.length === 0) {
            contenedor.innerHTML = `
                <div class="catalogo-vacio">
                    <p>${t("js.catalogo_vacio")}</p>
                </div>`;
            return;
        }

        /* Generamos el HTML de cada tarjeta */
        contenedor.innerHTML = lista.map((p) => {
            /* Precio segun el modo del catalogo */
            /* Nueva logica: VES = base x rateB (mayoreo: -%), USD = VES / BCV */
            const precioVes = BCV.precioVes(p.precioBase, modo);
            const precioUsd = BCV.precioUsd(precioVes);

            /* Badge de descuento en mayoreo */
            const badgeDescuento = modo === "mayoreo"
                ? `<span class="badge-descuento">\u{2212}${Math.round(CONFIG.descuentoMayoreo * 100)}%</span>`
                : "";

            /* Badge de agotado (si aplica) */
            const badgeAgotado = p.agotado
                ? `<span class="badge-agotado">${t("js.agotado")}</span>` : "";

            return `
            <article class="tarjeta-producto ${p.agotado ? "agotado" : ""}"
                     data-id="${p.id}" data-modo="${modo}" tabindex="0"
                     aria-label="${escaparHtml(p.nombre)}">
                <div class="tarjeta-imagen">
                    <img src="${p.foto}" alt="${escaparHtml(p.nombre)}" loading="lazy"
                         onerror="this.src='${PRODUCTOS.PLACEHOLDER}'">
                    ${badgeDescuento}${badgeAgotado}
                </div>
                <div class="tarjeta-info">
                    <span class="tarjeta-categoria">${escaparHtml(p.categorias.join(" \u{B7} "))}</span>
                    <h3 class="tarjeta-nombre">${escaparHtml(p.nombre)}</h3>
                    <div class="tarjeta-precios">
                        <span class="precio precio-usd">${BCV.fmtUsd(precioUsd)}</span>
                        <span class="precio precio-ves">${BCV.fmtVes(precioVes)}</span>
                    </div>
                    <button class="btn btn-primario btn-agregar"
                            ${p.agotado ? "disabled" : ""}>
                        ${p.agotado ? t("js.agotado") : t("js.agregar_carrito")}
                    </button>
                </div>
            </article>`;
        }).join("");

        this.aplicarMoneda();
    },

    /* ------------------------------------------------------------------
     * aplicarMoneda() ? Muestra/oculta precios segun la moneda elegida
     * ------------------------------------------------------------------ */
    aplicarMoneda() {
        const moneda = localStorage.getItem("noptabu_moneda") || CONFIG.monedaDefault;
        document.body.classList.remove("moneda-usd", "moneda-ves", "moneda-both");
        document.body.classList.add(`moneda-${moneda}`);
    },

    /* ------------------------------------------------------------------
     * conectarFiltros() ? Botones de categoria (paginas de catalogo)
     * ------------------------------------------------------------------ */
    conectarFiltros() {
        const contenedorFiltros = document.getElementById("filtro-categorias");
        if (!contenedorFiltros) return;

        /* Boton "Todas" + uno por cada categoria existente */
        contenedorFiltros.innerHTML =
            `<button class="btn-filtro activo" data-cat="todas">${t("js.filtro_todas")}</button>`
            + PRODUCTOS.categorias().map((cat) =>
                `<button class="btn-filtro" data-cat="${escaparHtml(cat)}">${escaparHtml(cat)}</button>`
            ).join("");

        contenedorFiltros.addEventListener("click", (e) => {
            const boton = e.target.closest(".btn-filtro");
            if (!boton) return;
            const cat = boton.dataset.cat;

            if (cat === "todas") {
                /* "Todas" limpia cualquier seleccion previa */
                this.filtrosSeleccionados.clear();
            } else if (this.filtrosSeleccionados.has(cat)) {
                this.filtrosSeleccionados.delete(cat);   /* quitar de la seleccion */
            } else {
                this.filtrosSeleccionados.add(cat);      /* sumar a la seleccion */
            }

            /* Pintar el estado activo de cada boton ("Todas" solo si no
               hay nada seleccionado) */
            contenedorFiltros.querySelectorAll(".btn-filtro").forEach((b) => {
                const c = b.dataset.cat;
                b.classList.toggle("activo",
                    c === "todas" ? this.filtrosSeleccionados.size === 0
                                  : this.filtrosSeleccionados.has(c));
            });

            this.repintarCatalogos();
        });
    },

    /* ------------------------------------------------------------------
     * conectarBusqueda() ? Campo de busqueda en tiempo real
     * ------------------------------------------------------------------ */
    conectarBusqueda() {
        const buscador = document.getElementById("buscador");
        if (!buscador) return;
        buscador.addEventListener("input", () => {
            this.textoBusqueda = buscador.value.trim();
            this.repintarCatalogos();
        });
    },

    /* ------------------------------------------------------------------
     * repintarCatalogos() ? Vuelve a pintar solo los catalogos SIN limite
     * ------------------------------------------------------------------ */
    repintarCatalogos() {
        document.querySelectorAll("[data-catalogo]").forEach((contenedor) => {
            if (!contenedor.dataset.limite) {
                this.pintar(contenedor, contenedor.dataset.modo || "detal");
            }
        });
    },

    /* ------------------------------------------------------------------
     * conectarVistaRapida() ? Clic en tarjeta ? modal de detalle
     * ------------------------------------------------------------------ */
    conectarVistaRapida() {
        /* Delegacion global: funciona para tarjetas pintadas en cualquier pagina */
        document.addEventListener("click", (e) => {
            const tarjeta = e.target.closest(".tarjeta-producto");
            if (!tarjeta) return;

            /* El boton "Agregar" tiene su propio comportamiento */
            if (e.target.closest(".btn-agregar")) {
                const id = Number(tarjeta.dataset.id);
                const modo = tarjeta.dataset.modo || "detal";
                const p = PRODUCTOS.buscar(id);
                if (p && !p.agotado) CARRITO.agregar(id, 1, modo);
                return;
            }

            /* Clic en cualquier otra zona de la tarjeta ? vista rapida */
            this.abrirVistaRapida(Number(tarjeta.dataset.id), tarjeta.dataset.modo || "detal");
        });

        /* Teclado: Enter en la tarjeta abre la vista rapida */
        document.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                const tarjeta = e.target.closest?.(".tarjeta-producto");
                if (tarjeta) this.abrirVistaRapida(Number(tarjeta.dataset.id), tarjeta.dataset.modo || "detal");
            }
        });

        /* Controles de cantidad dentro de la vista rapida */
        const menos = document.getElementById("mp-menos");
        const mas = document.getElementById("mp-mas");
        const agregar = document.getElementById("mp-agregar");
        if (menos) menos.addEventListener("click", () => {
            const input = document.getElementById("mp-cantidad");
            input.value = Math.max(1, parseInt(input.value) - 1);
        });
        if (mas) mas.addEventListener("click", () => {
            const input = document.getElementById("mp-cantidad");
            input.value = Math.min(CONFIG.cantidadMaxima, parseInt(input.value) + 1);
        });
        if (agregar) agregar.addEventListener("click", () => {
            const id = Number(agregar.dataset.id);
            const modo = agregar.dataset.modo || "detal";
            const cantidad = parseInt(document.getElementById("mp-cantidad").value) || 1;
            CARRITO.agregar(id, cantidad, modo);
            cerrarModal("modal-producto");
        });
    },

    /* ------------------------------------------------------------------
     * abrirVistaRapida(id, modo) ? Rellena y muestra el modal de producto
     * ------------------------------------------------------------------ */
    abrirVistaRapida(id, modo) {
        const p = PRODUCTOS.buscar(id);
        if (!p) return;

        /* Nueva logica: VES = base x rateB (mayoreo: -%), USD = VES / BCV */
        const precioVes = BCV.precioVes(p.precioBase, modo);
        const precioUsd = BCV.precioUsd(precioVes);

        document.getElementById("mp-img").src = p.foto;
        document.getElementById("mp-img").alt = p.nombre;
        document.getElementById("mp-img").onerror =
            function () { this.src = PRODUCTOS.PLACEHOLDER; };
        document.getElementById("mp-nombre").textContent = p.nombre;
        document.getElementById("mp-categoria").textContent = p.categorias.join(" \u{B7} ");
        document.getElementById("mp-descripcion").textContent =
            p.descripcion || t("js.sin_descripcion");
        document.getElementById("mp-precio-usd").textContent = BCV.fmtUsd(precioUsd);
        document.getElementById("mp-precio-ves").textContent =
            BCV.fmtVes(precioVes);
        document.getElementById("mp-cantidad").value = 1;

        const btnAgregar = document.getElementById("mp-agregar");
        btnAgregar.dataset.id = p.id;
        btnAgregar.dataset.modo = modo;
        btnAgregar.disabled = p.agotado;
        btnAgregar.textContent = p.agotado ? t("js.agotado") : t("js.agregar_carrito");

        abrirModal("modal-producto");
    },
};

window.CATALOGO = CATALOGO;

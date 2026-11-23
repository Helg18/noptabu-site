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

    /* Estado de la galería de la vista rápida */
    galeriaFotos: [],
    galeriaIndice: 0,
    galeriaNombre: "",
    galeriaConectada: false,

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

            /* Badges de estado: agotado o por agotarse (stock_status LOW) */
            const badgeStock = p.agotado
                ? `<span class="badge-agotado">${t("js.agotado")}</span>`
                : (p.stock_status === "LOW"
                    ? `<span class="badge-low">${t("js.por_agotarse")}</span>` : "");

            /* Badge de OFERTA (el admin marca "oferta": "SI") */
            const badgeOferta = p.oferta === "SI"
                ? `<span class="badge-oferta">${t("js.badge_oferta")}</span>` : "";

            return `
            <article class="tarjeta-producto ${p.agotado ? "agotado" : ""}"
                     data-id="${p.id}" data-modo="${modo}" tabindex="0"
                     aria-label="${escaparHtml(p.nombre)}">
                <div class="tarjeta-imagen">
                    <img src="${p.foto}" alt="${escaparHtml(p.nombre)}" loading="lazy"
                         onerror="this.src='${PRODUCTOS.PLACEHOLDER}'">
                    <div class="tarjeta-badges-izq">${badgeDescuento}${badgeOferta}</div>
                    ${badgeStock}
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

        this.conectarGaleria();
    },

    /* ------------------------------------------------------------------
     * conectarGaleria() ? Eventos de miniaturas, flechas, swipe y teclado
     * ------------------------------------------------------------------ */
    conectarGaleria() {
        if (this.galeriaConectada) return;
        this.galeriaConectada = true;

        const miniaturas = document.getElementById("mp-miniaturas");
        if (miniaturas) {
            miniaturas.addEventListener("click", (e) => {
                const boton = e.target.closest(".galeria-miniatura");
                if (!boton) return;
                this.mostrarFoto(Number(boton.dataset.indice));
            });
        }

        const anterior = document.getElementById("mp-prev");
        const siguiente = document.getElementById("mp-next");
        if (anterior) anterior.addEventListener("click", () => this.fotoAnterior());
        if (siguiente) siguiente.addEventListener("click", () => this.fotoSiguiente());

        /* Swipe horizontal sobre la imagen principal */
        const principal = document.getElementById("mp-img");
        if (principal) {
            let inicioX = 0;
            let inicioY = 0;
            principal.addEventListener("touchstart", (e) => {
                const toque = e.changedTouches[0];
                inicioX = toque.clientX;
                inicioY = toque.clientY;
            }, { passive: true });
            principal.addEventListener("touchend", (e) => {
                const toque = e.changedTouches[0];
                const dx = toque.clientX - inicioX;
                const dy = toque.clientY - inicioY;
                if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
                    dx < 0 ? this.fotoSiguiente() : this.fotoAnterior();
                }
            }, { passive: true });
        }

        /* Flechas del teclado solo mientras el modal está abierto */
        document.addEventListener("keydown", (e) => {
            const modal = document.getElementById("modal-producto");
            if (!modal || !modal.classList.contains("visible")) return;
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                this.fotoAnterior();
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                this.fotoSiguiente();
            }
        });
    },

    /* ------------------------------------------------------------------
     * iniciarGaleria(p) ? Prepara fotos y miniaturas para un producto
     * ------------------------------------------------------------------ */
    iniciarGaleria(p) {
        this.galeriaFotos = (p.fotos && p.fotos.length > 0) ? p.fotos : [p.foto];
        this.galeriaIndice = 0;
        this.galeriaNombre = p.nombre;

        const multi = this.galeriaFotos.length > 1;
        const miniaturas = document.getElementById("mp-miniaturas");
        const anterior = document.getElementById("mp-prev");
        const siguiente = document.getElementById("mp-next");
        const contador = document.getElementById("mp-contador");

        if (miniaturas) {
            miniaturas.innerHTML = "";
            miniaturas.hidden = !multi;
            miniaturas.setAttribute("aria-label", t("js.galeria_fotos"));

            this.galeriaFotos.forEach((foto, indice) => {
                const boton = document.createElement("button");
                boton.type = "button";
                boton.className = "galeria-miniatura";
                boton.dataset.indice = String(indice);
                boton.setAttribute("aria-label",
                    `${t("js.galeria_ver_foto")} ${indice + 1} ${t("js.galeria_de")} ${this.galeriaFotos.length}`);
                boton.setAttribute("aria-pressed", indice === 0 ? "true" : "false");

                const imagen = document.createElement("img");
                imagen.src = foto;
                imagen.alt = "";
                imagen.loading = "lazy";
                imagen.decoding = "async";
                imagen.addEventListener("error", () => { boton.hidden = true; });

                boton.appendChild(imagen);
                miniaturas.appendChild(boton);
            });
        }

        if (anterior) {
            anterior.hidden = !multi;
            anterior.setAttribute("aria-label", t("js.galeria_anterior"));
        }
        if (siguiente) {
            siguiente.hidden = !multi;
            siguiente.setAttribute("aria-label", t("js.galeria_siguiente"));
        }
        if (contador) contador.hidden = !multi;

        this.mostrarFoto(0);
    },

    /* ------------------------------------------------------------------
     * mostrarFoto(indice) ? Cambia la imagen principal (con vuelta cíclica)
     * ------------------------------------------------------------------ */
    mostrarFoto(indice) {
        const fotos = this.galeriaFotos;
        if (!fotos.length) return;

        const total = fotos.length;
        const i = ((indice % total) + total) % total;
        this.galeriaIndice = i;

        const imagen = document.getElementById("mp-img");
        if (imagen) {
            imagen.src = fotos[i];
            imagen.alt = total > 1
                ? `${this.galeriaNombre} — ${t("js.galeria_foto")} ${i + 1}`
                : this.galeriaNombre;
            imagen.onerror = function () { this.src = PRODUCTOS.PLACEHOLDER; };
        }

        document.querySelectorAll("#mp-miniaturas .galeria-miniatura").forEach((boton) => {
            const activo = Number(boton.dataset.indice) === i;
            boton.classList.toggle("activa", activo);
            boton.setAttribute("aria-pressed", activo ? "true" : "false");
        });

        const contador = document.getElementById("mp-contador");
        if (contador) contador.textContent = `${i + 1} / ${total}`;
    },

    fotoAnterior() { this.mostrarFoto(this.galeriaIndice - 1); },
    fotoSiguiente() { this.mostrarFoto(this.galeriaIndice + 1); },

    /* ------------------------------------------------------------------
     * abrirVistaRapida(id, modo) ? Rellena y muestra el modal de producto
     * ------------------------------------------------------------------ */
    abrirVistaRapida(id, modo) {
        const p = PRODUCTOS.buscar(id);
        if (!p) return;

        /* Nueva logica: VES = base x rateB (mayoreo: -%), USD = VES / BCV */
        const precioVes = BCV.precioVes(p.precioBase, modo);
        const precioUsd = BCV.precioUsd(precioVes);

        this.iniciarGaleria(p);
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

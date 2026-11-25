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

    /* Producto abierto en la vista rápida (para re-traducir el modal) */
    productoActual: null,

    /* Selección aleatoria de destacados, estable durante la sesión */
    _destacadosCache: null,

    /* Evita registrar dos veces el listener de idioma */
    idiomaConectado: false,

    /* ------------------------------------------------------------------
     * init() ? Renderiza cada contenedor de catalogo encontrado
     * ------------------------------------------------------------------ */
    init() {
        document.querySelectorAll("[data-catalogo]").forEach((contenedor) => {
            this.pintar(contenedor, contenedor.dataset.modo || "detal",
                this.limiteDe(contenedor));
        });
        this.conectarFiltros();
        this.conectarBusqueda();
        this.conectarVistaRapida();

        /* Al cambiar ES/EN hay que repintar tarjetas, filtros y modal:
           los textos generados por JS no se actualizan solos */
        if (!this.idiomaConectado) {
            this.idiomaConectado = true;
            document.addEventListener("idioma:cambiado", () => this.alCambiarIdioma());
        }
    },

    /* ------------------------------------------------------------------
     * limiteDe(contenedor) ? Lee data-limite ("config" o numero)
     * ------------------------------------------------------------------ */
    limiteDe(contenedor) {
        if (!contenedor.dataset.limite) return null;
        if (contenedor.dataset.limite === "config") return CONFIG.destacadosLimite;
        return parseInt(contenedor.dataset.limite, 10) || null;
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
           Se eligen al azar una vez por sesión para dar variedad.
           Si ninguno tiene la marca, respaldo: los primeros N del JSON */
        if (limite) {
            const destacados = lista.filter((p) => p.destacado);
            lista = destacados.length > 0
                ? this.destacadosAleatorios(destacados, limite)
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

            return `
            <article class="tarjeta-producto ${p.agotado ? "agotado" : ""}"
                     data-id="${p.id}" data-modo="${modo}" tabindex="0"
                     aria-label="${escaparHtml(p.nombre)}">
                <div class="tarjeta-imagen">
                    <img src="${p.foto}" alt="${escaparHtml(p.nombre)}" loading="lazy"
                         onerror="this.src='${PRODUCTOS.PLACEHOLDER}'">
                    <div class="tarjeta-badges-izq">${badgeDescuento}</div>
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
     * destacadosAleatorios(lista, limite) ? Elige destacados al azar.
     * La selección se guarda durante la sesión para que no cambie al
     * filtrar, buscar o cambiar de idioma.
     * ------------------------------------------------------------------ */
    destacadosAleatorios(lista, limite) {
        if (!this._destacadosCache) {
            const copia = [...lista];
            /* Barajado Fisher-Yates */
            for (let i = copia.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [copia[i], copia[j]] = [copia[j], copia[i]];
            }
            this._destacadosCache = copia
                .slice(0, limite)
                .map((p) => p.id);
        }
        return this._destacadosCache
            .map((id) => lista.find((p) => p.id === id))
            .filter(Boolean);
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
     * pintarFiltros() ? Dibuja los botones de categoria conservando estado
     * ------------------------------------------------------------------ */
    pintarFiltros() {
        const contenedorFiltros = document.getElementById("filtro-categorias");
        if (!contenedorFiltros) return;

        const activoTodas = this.filtrosSeleccionados.size === 0 ? " activo" : "";
        contenedorFiltros.innerHTML =
            `<button class="btn-filtro${activoTodas}" data-cat="todas">${t("js.filtro_todas")}</button>`
            + PRODUCTOS.categorias().map((cat) => {
                const activo = this.filtrosSeleccionados.has(cat) ? " activo" : "";
                return `<button class="btn-filtro${activo}" data-cat="${escaparHtml(cat)}">${escaparHtml(cat)}</button>`;
            }).join("");
    },

    /* ------------------------------------------------------------------
     * conectarFiltros() ? Botones de categoria (paginas de catalogo)
     * ------------------------------------------------------------------ */
    conectarFiltros() {
        const contenedorFiltros = document.getElementById("filtro-categorias");
        if (!contenedorFiltros) return;

        this.pintarFiltros();

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

            this.pintarFiltros();
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

        /* Teclado: Enter SOLO cuando la tarjeta misma tiene el foco.
           Asi Enter sobre "Agregar al carrito" no abre tambien el modal */
        document.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            const tarjeta = e.target.closest?.(".tarjeta-producto");
            if (!tarjeta || e.target !== tarjeta) return;
            e.preventDefault();
            this.abrirVistaRapida(Number(tarjeta.dataset.id), tarjeta.dataset.modo || "detal");
        });

        /* Controles de cantidad dentro de la vista rapida */
        const menos = document.getElementById("mp-menos");
        const mas = document.getElementById("mp-mas");
        const agregar = document.getElementById("mp-agregar");
        if (menos) menos.addEventListener("click", () => {
            const input = document.getElementById("mp-cantidad");
            input.value = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
        });
        if (mas) mas.addEventListener("click", () => {
            const input = document.getElementById("mp-cantidad");
            /* El maximo real es el stock disponible (o el tope del config) */
            const maximo = parseInt(input.max, 10) || CONFIG.cantidadMaxima;
            input.value = Math.min(maximo, (parseInt(input.value, 10) || 1) + 1);
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
     * iniciarGaleria(p, indice) ? Prepara fotos y miniaturas para un producto
     * ------------------------------------------------------------------ */
    iniciarGaleria(p, indice = 0) {
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

        this.mostrarFoto(indice);
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
     * abrirVistaRapida(id, modo, opciones) ? Rellena y muestra el modal
     * opciones: { indice, cantidad } para conservar la galería y la
     * cantidad al cambiar de idioma.
     * ------------------------------------------------------------------ */
    abrirVistaRapida(id, modo, opciones = {}) {
        const p = PRODUCTOS.buscar(id);
        if (!p) return;

        /* Nueva logica: VES = base x rateB (mayoreo: -%), USD = VES / BCV */
        const precioVes = BCV.precioVes(p.precioBase, modo);
        const precioUsd = BCV.precioUsd(precioVes);

        this.productoActual = { id: p.id, modo };
        this.iniciarGaleria(p, opciones.indice || 0);
        document.getElementById("mp-nombre").textContent = p.nombre;
        document.getElementById("mp-categoria").textContent = p.categorias.join(" \u{B7} ");
        document.getElementById("mp-descripcion").textContent =
            p.descripcion || t("js.sin_descripcion");
        document.getElementById("mp-precio-usd").textContent = BCV.fmtUsd(precioUsd);
        document.getElementById("mp-precio-ves").textContent =
            BCV.fmtVes(precioVes);

        /* Cantidad limitada por stock real (y por el tope del config) */
        const inputCantidad = document.getElementById("mp-cantidad");
        const maximo = Math.max(1, Math.min(CONFIG.cantidadMaxima, p.stock));
        inputCantidad.max = String(maximo);
        inputCantidad.value = Math.min(
            Math.max(1, parseInt(opciones.cantidad, 10) || 1), maximo);

        const btnAgregar = document.getElementById("mp-agregar");
        btnAgregar.dataset.id = p.id;
        btnAgregar.dataset.modo = modo;
        btnAgregar.disabled = p.agotado;
        btnAgregar.textContent = p.agotado ? t("js.agotado") : t("js.agregar_carrito");

        abrirModal("modal-producto");
    },

    /* ------------------------------------------------------------------
     * alCambiarIdioma() ? Repinta todo lo generado por JS al cambiar ES/EN
     * ------------------------------------------------------------------ */
    alCambiarIdioma() {
        /* Filtros y catalogos (incluye destacados) */
        this.pintarFiltros();
        document.querySelectorAll("[data-catalogo]").forEach((contenedor) => {
            this.pintar(contenedor, contenedor.dataset.modo || "detal",
                this.limiteDe(contenedor));
        });

        /* Vista rapida abierta: conserva producto, foto y cantidad */
        const modal = document.getElementById("modal-producto");
        if (modal && modal.classList.contains("visible") && this.productoActual) {
            const input = document.getElementById("mp-cantidad");
            this.abrirVistaRapida(this.productoActual.id, this.productoActual.modo, {
                indice: this.galeriaIndice,
                cantidad: parseInt(input?.value, 10) || 1,
            });
        }
    },
};

window.CATALOGO = CATALOGO;

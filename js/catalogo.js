// Catálogo público.
(function () {
  'use strict';
  const { rpc, h, dinero, foto, brindis, guardarLocal, leerLocal, copiar, sinAcentos, CONDICION } = B;
  const $ = id => document.getElementById(id);

  const S = {
    productos: [], config: {}, demo: false,
    cat: '', q: '', talla: '', marca: '', cond: '', orden: 'nuevo', soloFavs: false,
    favs: new Set(leerLocal('hx_favs', [])),
    lista: new Set(leerLocal('hx_lista', [])),
    abierto: null, fotos: new Map(), vistos: new Set()
  };

  // ---------- Carga ----------
  async function cargar(silencioso) {
    try {
      const d = await rpc('hx_catalogo');
      S.productos = d.productos || []; S.config = d.config || {}; S.demo = false;
    } catch (e) {
      if (e.sinInstalar) {
        // La base todavía no está instalada: se muestra el catálogo de muestra.
        try {
          const r = await fetch('datos/demo.json', { cache: 'no-store' });
          const d = await r.json();
          S.productos = d.productos; S.config = d.config; S.demo = true;
        } catch (e2) { return fallo('No se pudo cargar el catálogo.'); }
      } else {
        if (!silencioso) fallo(e.message);
        return;
      }
    }
    pintarTodo();
  }

  function fallo(msg) {
    $('conteo').textContent = '';
    const r = $('rejilla'); r.replaceChildren(
      h('div', { class: 'vacio' }, h('h2', null, 'No se pudo cargar'), h('p', null, msg),
        h('button', { class: 'btn btn--lleno', type: 'button', on: { click: () => cargar() } }, 'Reintentar')));
  }

  // ---------- Pintado ----------
  function pintarTodo() {
    const c = S.config;
    const nombre = c.nombre || 'Catálogo';
    document.title = nombre + ' · Catálogo';
    $('marca').textContent = nombre; $('titulo').textContent = nombre;
    $('lema').textContent = c.lema || '';
    $('pie-entrega').textContent = c.entrega || 'Se acuerda por mensaje.';
    $('pie-pagos').textContent = c.pagos || 'Se acuerda por mensaje.';
    $('aviso').hidden = !c.aviso; $('aviso').textContent = c.aviso || '';
    $('aviso-demo').hidden = !S.demo;

    // Limpia favoritos y lista de piezas que ya no existen.
    const ids = new Set(S.productos.map(p => p.id));
    for (const set of [S.favs, S.lista]) for (const id of [...set]) if (!ids.has(id)) set.delete(id);
    for (const id of [...S.lista]) { const p = porId(id); if (p && p.estado === 'vendido') S.lista.delete(id); }

    pintarChips(); pintarSelects(); pintarRejilla(); pintarContadores();
    if (S.abierto != null) { const p = porId(S.abierto); if (p) pintarPieza(p); }
  }

  const porId = id => S.productos.find(p => p.id === id);
  const unicos = campo => [...new Set(S.productos.map(p => (p[campo] || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

  function pintarChips() {
    const cats = unicos('categoria');
    if (S.cat && !cats.includes(S.cat)) S.cat = '';
    $('chips').replaceChildren(...['', ...cats].map(c =>
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(S.cat === c), on: { click: () => { S.cat = c; pintarChips(); pintarRejilla(); } } }, c || 'Todo')));
  }

  function pintarSelects() {
    const llenar = (id, campo, todas, val) => {
      const ops = unicos(campo);
      $(id).replaceChildren(h('option', { value: '' }, todas), ...ops.map(o => h('option', { value: o, selected: o === val }, o)));
    };
    llenar('f-talla', 'talla', 'Todas', S.talla);
    llenar('f-marca', 'marca', 'Todas', S.marca);
  }

  function filtrados() {
    const q = sinAcentos(S.q.trim());
    let l = S.productos.filter(p =>
      (!S.cat || p.categoria === S.cat) && (!S.talla || p.talla === S.talla) &&
      (!S.marca || p.marca === S.marca) && (!S.cond || p.condicion === S.cond) &&
      (!S.soloFavs || S.favs.has(p.id)) &&
      (!q || sinAcentos([p.nombre, p.marca, p.talla, p.categoria, p.descripcion].join(' ')).includes(q)));
    const peso = p => (p.estado === 'vendido' ? 2 : p.estado === 'apartado' ? 1 : 0);
    const orden = {
      nuevo: (a, b) => (b.destacado - a.destacado) || (new Date(b.creado) - new Date(a.creado)),
      menor: (a, b) => a.precio - b.precio,
      mayor: (a, b) => b.precio - a.precio
    }[S.orden];
    return l.sort((a, b) => (peso(a) - peso(b)) || orden(a, b));
  }

  function descuento(p) {
    return p.precio_antes && Number(p.precio_antes) > Number(p.precio)
      ? Math.round((1 - p.precio / p.precio_antes) * 100) : 0;
  }

  function tarjeta(p) {
    const fuera = p.estado !== 'disponible';
    const caja = foto(p.miniatura, p.nombre, p.categoria);
    const d = descuento(p);
    caja.append(h('span', { class: 'etiqueta' }, d ? h('s', null, dinero(p.precio_antes)) : null, dinero(p.precio)));
    if (p.estado === 'apartado') caja.append(h('span', { class: 'sello sello--apartado' }, 'Apartado'));
    else if (p.estado === 'vendido') caja.append(h('span', { class: 'sello sello--vendido' }, 'Vendido'));
    else if (p.condicion === 'nuevo') caja.append(h('span', { class: 'sello' }, 'Nuevo'));
    const dato = [p.marca, p.talla && 'talla ' + p.talla].filter(Boolean).join(', ');
    return h('article', { class: 'pieza' + (fuera ? ' pieza--fuera' : '') },
      h('button', { class: 'pieza__abrir', type: 'button', on: { click: () => abrir(p.id) } },
        caja, h('h3', null, p.nombre), dato ? h('span', { class: 'pieza__dato' }, dato) : null),
      h('button', { class: 'corazon', type: 'button', 'aria-pressed': String(S.favs.has(p.id)),
        'aria-label': 'Guardar ' + p.nombre + ' en favoritos', on: { click: () => alternarFav(p.id) } }, S.favs.has(p.id) ? '♥' : '♡'));
  }

  function pintarRejilla() {
    const l = filtrados();
    const disp = S.productos.filter(p => p.estado === 'disponible').length;
    $('conteo').textContent = S.productos.length
      ? (disp === 1 ? '1 pieza disponible hoy' : disp + ' piezas disponibles hoy') : '';
    if (!S.productos.length) {
      return $('rejilla').replaceChildren(h('div', { class: 'vacio' }, h('h2', null, 'Pronto habrá piezas nuevas'),
        h('p', null, 'El catálogo se está surtiendo. Vuelve en unos días.')));
    }
    if (!l.length) {
      return $('rejilla').replaceChildren(h('div', { class: 'vacio' }, h('h2', null, 'Nada con esos filtros'),
        h('p', null, 'Prueba con otra talla o quita la búsqueda para ver todo.'),
        h('button', { class: 'btn', type: 'button', on: { click: limpiar } }, 'Quitar filtros')));
    }
    $('rejilla').replaceChildren(...l.map(tarjeta));
  }

  function limpiar() {
    Object.assign(S, { cat: '', q: '', talla: '', marca: '', cond: '', soloFavs: false });
    $('q').value = ''; $('f-cond').value = ''; $('btn-favs').setAttribute('aria-pressed', 'false');
    pintarChips(); pintarSelects(); pintarRejilla();
  }

  function pintarContadores() {
    $('n-favs').textContent = S.favs.size; $('n-lista').textContent = S.lista.size;
    guardarLocal('hx_favs', [...S.favs]); guardarLocal('hx_lista', [...S.lista]);
  }

  function alternarFav(id) {
    S.favs.has(id) ? S.favs.delete(id) : S.favs.add(id);
    pintarContadores(); pintarRejilla();
  }

  // ---------- Detalle ----------
  function enlace(p) { return location.origin + location.pathname + '#p' + p.id; }

  async function abrir(id) {
    const p = porId(id); if (!p) return;
    S.abierto = id; pintarPieza(p);
    const dlg = $('dlg-pieza'); if (!dlg.open) dlg.showModal();
    history.replaceState(null, '', '#p' + id);
    if (S.demo) return;
    if (!S.vistos.has(id)) { S.vistos.add(id); rpc('hx_vista', { p_id: id }).catch(() => {}); }
    if (!S.fotos.has(id) && Number(p.nfotos) > 0) {
      try { S.fotos.set(id, await rpc('hx_fotos_de', { p_id: id })); if (S.abierto === id) pintarPieza(p); } catch (e) { /* queda la miniatura */ }
    }
  }

  function pintarPieza(p) {
    const fotos = S.fotos.get(p.id);
    const gal = h('div', { class: 'galeria', tabindex: '0', 'aria-label': 'Fotos de ' + p.nombre });
    if (fotos && fotos.length) fotos.forEach((f, i) => gal.append(foto(f, p.nombre + ', foto ' + (i + 1), p.categoria)));
    else gal.append(foto(p.miniatura, p.nombre, p.categoria));

    const d = descuento(p);
    const enLista = S.lista.has(p.id);
    const info = h('div', { class: 'detalle__info' },
      h('h2', null, p.nombre),
      h('div', { class: 'precio' }, dinero(p.precio), d ? h('s', null, dinero(p.precio_antes)) : null, d ? h('em', null, d + '% menos') : null),
      h('dl', { class: 'ficha' },
        p.marca ? [h('dt', null, 'Marca'), h('dd', null, p.marca)] : null,
        p.talla ? [h('dt', null, 'Talla'), h('dd', null, p.talla)] : null,
        [h('dt', null, 'Condición'), h('dd', null, CONDICION[p.condicion] || p.condicion)],
        [h('dt', null, 'Categoría'), h('dd', null, p.categoria)]),
      p.descripcion ? h('p', { class: 'descripcion' }, p.descripcion) : null);

    if (p.estado === 'vendido') {
      info.append(h('p', { class: 'estado-nota' }, 'Esta pieza ya se vendió. Revisa el catálogo: llegan piezas nuevas seguido.'));
    } else {
      if (p.estado === 'apartado') info.append(h('p', { class: 'estado-nota' }, 'Alguien ya apartó esta pieza. Puedes preguntar: si no se concreta, te avisamos.'));
      info.append(h('div', { class: 'acciones' },
        h('button', { class: 'btn btn--sticker btn--ancho', type: 'button', on: { click: () => contactar([p]) } }, 'Preguntar por esta pieza'),
        h('button', { class: 'btn btn--ancho', type: 'button', on: { click: () => { enLista ? S.lista.delete(p.id) : S.lista.add(p.id); pintarContadores(); pintarPieza(p); brindis(enLista ? 'Se quitó de tu lista' : 'Se agregó a tu lista'); } } },
          enLista ? 'Quitar de mi lista' : 'Agregar a mi lista')));
    }
    $('dlg-pieza-t').textContent = p.categoria;
    $('pieza-cuerpo').replaceChildren(h('div', { class: 'detalle' }, gal, info));
  }

  // ---------- Contacto ----------
  function mensaje(items) {
    const lineas = items.map(p => '• ' + p.nombre + (p.talla ? ' (talla ' + p.talla + ')' : '') + ', ' + dinero(p.precio) + '\n  ' + enlace(p));
    return (items.length > 1 ? 'Hola, me interesan estas piezas:\n' : 'Hola, me interesa esta pieza:\n') + lineas.join('\n') + '\n¿Siguen disponibles?';
  }

  async function contactar(items) {
    const txt = mensaje(items), c = S.config;
    if (/^[0-9]{10,15}$/.test(c.whatsapp || '')) {
      window.open('https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent(txt), '_blank', 'noopener,noreferrer');
      return;
    }
    const ok = await copiar(txt);
    if (/^https:\/\/(m\.me|www\.facebook\.com|facebook\.com|www\.messenger\.com)\//.test(c.messenger || '')) {
      brindis(ok ? 'Mensaje copiado. Pégalo en el chat que se abre.' : 'Se abre el chat: escribe qué pieza te interesa.');
      setTimeout(() => window.open(c.messenger, '_blank', 'noopener,noreferrer'), 900);
    } else {
      brindis(ok ? 'Mensaje copiado. Pégalo en el chat donde viste este catálogo.' : 'Escríbenos por el chat donde viste este catálogo.');
    }
  }

  // ---------- Mi lista ----------
  function pintarLista() {
    const items = [...S.lista].map(porId).filter(Boolean);
    const cuerpo = $('lista-cuerpo');
    if (!items.length) {
      return cuerpo.replaceChildren(h('div', { class: 'vacio' }, h('h2', null, 'Tu lista está vacía'),
        h('p', null, 'Abre una pieza y toca “Agregar a mi lista”. Así preguntas por varias en un solo mensaje.')));
    }
    const total = items.reduce((s, p) => s + Number(p.precio), 0);
    cuerpo.replaceChildren(
      h('div', null, items.map(p => h('div', { class: 'renglon' },
        foto(p.miniatura, '', p.categoria),
        h('div', null, h('strong', null, p.nombre), h('span', null, [p.talla && 'Talla ' + p.talla, dinero(p.precio)].filter(Boolean).join(', '))),
        h('button', { class: 'btn btn--chico', type: 'button', on: { click: () => { S.lista.delete(p.id); pintarContadores(); pintarLista(); } } }, 'Quitar')))),
      h('div', { class: 'total' }, h('span', null, 'Total'), h('span', null, dinero(total))),
      h('button', { class: 'btn btn--sticker btn--ancho', type: 'button', on: { click: () => contactar(items) } },
        items.length > 1 ? 'Preguntar por las ' + items.length + ' piezas' : 'Preguntar por esta pieza'));
  }

  // ---------- Eventos ----------
  let tq;
  $('q').addEventListener('input', e => { clearTimeout(tq); tq = setTimeout(() => { S.q = e.target.value; pintarRejilla(); }, 160); });
  $('f-talla').addEventListener('change', e => { S.talla = e.target.value; pintarRejilla(); });
  $('f-marca').addEventListener('change', e => { S.marca = e.target.value; pintarRejilla(); });
  $('f-cond').addEventListener('change', e => { S.cond = e.target.value; pintarRejilla(); });
  $('f-orden').addEventListener('change', e => { S.orden = e.target.value; pintarRejilla(); });
  $('btn-afinar').addEventListener('click', e => {
    const a = $('afinar'); a.hidden = !a.hidden; e.currentTarget.setAttribute('aria-expanded', String(!a.hidden));
  });
  $('btn-favs').addEventListener('click', e => {
    S.soloFavs = !S.soloFavs; e.currentTarget.setAttribute('aria-pressed', String(S.soloFavs)); pintarRejilla();
  });
  $('btn-lista').addEventListener('click', () => { pintarLista(); $('dlg-lista').showModal(); });
  $('btn-compartir').addEventListener('click', async () => {
    const p = porId(S.abierto); if (!p) return;
    const datos = { title: p.nombre, text: p.nombre + ', ' + dinero(p.precio), url: enlace(p) };
    if (navigator.share) { try { await navigator.share(datos); } catch (e) { /* cancelado */ } }
    else brindis((await copiar(datos.url)) ? 'Enlace copiado' : 'No se pudo copiar el enlace');
  });
  document.querySelectorAll('dialog').forEach(dlg => {
    dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-cerrar]')) dlg.close(); });
  });
  $('dlg-pieza').addEventListener('close', () => { S.abierto = null; history.replaceState(null, '', location.pathname + location.search); });

  // Se actualiza solo: si algo se aparta o se vende, se ve sin recargar.
  setInterval(() => { if (!document.hidden && !S.demo) cargar(true); }, 90000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !S.demo) cargar(true); });

  cargar().then(() => {
    const m = /^#p(\d+)$/.exec(location.hash);
    if (m) abrir(Number(m[1]));
  });
})();

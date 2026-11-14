// Panel de administración.
(function () {
  'use strict';
  const { rpc, h, dinero, foto, brindis, copiar, sinAcentos, CONDICION, IMG_OK } = B;
  const $ = id => document.getElementById(id);
  const VISTAS = ['v-entrada', 'v-instalar', 'v-cambio', 'v-panel'];
  const ESTADOS = { disponible: 'Disponible', apartado: 'Apartado', vendido: 'Vendido', oculto: 'Oculto' };
  const INACTIVIDAD = 30 * 60 * 1000;

  const S = { token: null, productos: [], config: {}, q: '', estado: '' };
  const ED = { id: null, fotos: [], fotosCambiadas: false, ocupado: false };

  try { S.token = sessionStorage.getItem('hx_token'); } catch (e) { /* sin almacenamiento */ }

  function ver(id) { VISTAS.forEach(v => { $(v).hidden = v !== id; }); }
  function error(id, msg) { const e = $(id); e.textContent = msg || ''; e.hidden = !msg; }
  function limpiarMsg(e) { return String((e && e.message) || 'Algo falló. Inténtalo de nuevo.'); }

  function setToken(t) {
    S.token = t;
    try { t ? sessionStorage.setItem('hx_token', t) : sessionStorage.removeItem('hx_token'); } catch (e) { /* sin almacenamiento */ }
  }

  // Toda llamada del panel pasa por aquí: si la sesión venció, regresa a la entrada.
  async function admin(fn, args) {
    try { return await rpc(fn, Object.assign({ p_token: S.token }, args)); }
    catch (e) {
      if (e.sesion) { setToken(null); cerrarVentanas(); ver('v-entrada'); error('e-error', 'Tu sesión terminó. Entra de nuevo.'); }
      throw e;
    }
  }
  function cerrarVentanas() { document.querySelectorAll('dialog[open]').forEach(d => d.close()); }

  // ---------- Arranque ----------
  async function iniciar() {
    if (S.token) {
      try { await recargar(); return; } catch (e) { if (e.sesion) return; }
    }
    try { await rpc('hx_catalogo'); ver('v-entrada'); $('e-pass').focus(); }
    catch (e) {
      if (e.sinInstalar) ver('v-instalar');
      else { ver('v-entrada'); error('e-error', limpiarMsg(e)); }
    }
  }

  async function recargar() {
    const d = await admin('hx_admin_listar');
    S.productos = d.productos || []; S.config = d.config || {};
    if (d.debe_cambiar) { ver('v-cambio'); return; }
    ver('v-panel'); pintarInventario(); pintarAjustes();
  }

  // ---------- Entrada ----------
  $('f-entrada').addEventListener('submit', async ev => {
    ev.preventDefault(); error('e-error', '');
    const pass = $('e-pass').value; if (!pass) return;
    $('e-btn').disabled = true;
    try {
      const r = await rpc('hx_login', { p_pass: pass });
      if (!r.ok) {
        error('e-error', r.error === 'bloqueado'
          ? 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.'
          : 'Contraseña incorrecta. Te quedan ' + r.restantes + (r.restantes === 1 ? ' intento.' : ' intentos.'));
        return;
      }
      setToken(r.token); $('e-pass').value = '';
      if (r.debe_cambiar) { $('c-actual').value = pass; ver('v-cambio'); $('c-nueva').focus(); }
      else await recargar();
    } catch (e) { error('e-error', limpiarMsg(e)); }
    finally { $('e-btn').disabled = false; }
  });

  async function cambiarPass(actual, nueva, repite) {
    if (nueva !== repite) return 'Las dos contraseñas nuevas no coinciden.';
    if (nueva.length < 10) return 'La nueva contraseña debe tener al menos 10 caracteres.';
    const r = await admin('hx_admin_password', { p_actual: actual, p_nueva: nueva });
    return r.ok ? '' : r.error;
  }

  $('f-cambio').addEventListener('submit', async ev => {
    ev.preventDefault(); error('c-error', '');
    try {
      const msg = await cambiarPass($('c-actual').value, $('c-nueva').value, $('c-repite').value);
      if (msg) return error('c-error', msg);
      ev.target.reset(); brindis('Contraseña guardada'); await recargar();
    } catch (e) { error('c-error', limpiarMsg(e)); }
  });

  $('f-pass').addEventListener('submit', async ev => {
    ev.preventDefault();
    try {
      const msg = await cambiarPass($('s-actual').value, $('s-nueva').value, $('s-repite').value);
      if (msg) return brindis(msg);
      ev.target.reset(); brindis('Contraseña cambiada');
    } catch (e) { brindis(limpiarMsg(e)); }
  });

  async function salir(aviso) {
    const t = S.token; setToken(null); cerrarVentanas(); ver('v-entrada');
    error('e-error', aviso || '');
    if (t) rpc('hx_logout', { p_token: t }).catch(() => {});
  }
  $('btn-salir').addEventListener('click', () => salir());

  // Cierre por inactividad.
  let ultimo = Date.now();
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { ultimo = Date.now(); }, { passive: true }));
  setInterval(() => { if (S.token && Date.now() - ultimo > INACTIVIDAD) salir('Se cerró la sesión por inactividad.'); }, 30000);

  // ---------- Pestañas ----------
  document.querySelectorAll('[data-pest]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-pest]').forEach(x => {
      const activa = x === b; x.setAttribute('aria-pressed', String(activa));
      $('p-' + x.dataset.pest).hidden = !activa;
    });
  }));

  // ---------- Inventario ----------
  function pintarCifras() {
    const P = S.productos, de = e => P.filter(p => p.estado === e);
    const enVenta = P.filter(p => p.estado === 'disponible' || p.estado === 'apartado');
    const vendidos = de('vendido');
    const conCosto = vendidos.filter(p => p.costo != null);
    const ganancia = conCosto.reduce((s, p) => s + (p.precio - p.costo), 0);
    const cifra = (n, t) => h('div', { class: 'cifra' }, h('b', null, n), h('span', null, t));
    $('cifras').replaceChildren(
      cifra(String(de('disponible').length), 'disponibles, ' + de('apartado').length + ' apartados'),
      cifra(dinero(enVenta.reduce((s, p) => s + Number(p.precio), 0)), 'valor del inventario en venta'),
      cifra(String(vendidos.length), 'vendidos, ' + dinero(vendidos.reduce((s, p) => s + Number(p.precio), 0)) + ' en ventas'),
      cifra(dinero(ganancia), conCosto.length === vendidos.length ? 'ganancia de lo vendido' : 'ganancia (' + conCosto.length + ' de ' + vendidos.length + ' vendidos tienen costo)'));
  }

  function pintarInventario() {
    pintarCifras();
    const q = sinAcentos(S.q.trim());
    const l = S.productos.filter(p => (!S.estado || p.estado === S.estado) &&
      (!q || sinAcentos([p.nombre, p.marca, p.talla, p.categoria, p.notas].join(' ')).includes(q)));
    if (!S.productos.length) {
      return $('inventario').replaceChildren(h('div', { class: 'vacio' }, h('h2', null, 'Todavía no hay productos'),
        h('p', null, 'Agrega el primero con sus fotos, precio y talla. Aparece en el catálogo en cuanto lo guardas.')));
    }
    if (!l.length) return $('inventario').replaceChildren(h('div', { class: 'vacio' }, h('p', null, 'Ningún producto coincide con esa búsqueda.')));
    $('inventario').replaceChildren(...l.map(p => {
      const sel = h('select', { 'aria-label': 'Estado de ' + p.nombre, on: { change: e => cambiarEstado(p, e.target.value) } },
        Object.keys(ESTADOS).map(k => h('option', { value: k, selected: p.estado === k }, ESTADOS[k])));
      const datos = [dinero(p.precio), p.marca, p.talla && 'talla ' + p.talla, p.vistas + (p.vistas === 1 ? ' vista' : ' vistas')].filter(Boolean).join(', ');
      return h('div', { class: 'item' },
        foto(p.miniatura, '', p.categoria),
        h('div', null, h('strong', null, p.nombre),
          h('small', null, h('span', { class: 'estado estado--' + p.estado }, ESTADOS[p.estado]), datos)),
        h('div', { class: 'item__botones' }, sel,
          h('button', { class: 'btn btn--chico', type: 'button', on: { click: () => abrirEditor(p) } }, 'Editar'),
          h('button', { class: 'btn btn--chico', type: 'button', on: { click: () => abrirEditor(p, true) } }, 'Duplicar')));
    }));
    const llenar = (id, campo) => $(id).replaceChildren(...[...new Set(S.productos.map(p => p[campo]).filter(Boolean))].map(v => h('option', { value: v })));
    llenar('lista-cats', 'categoria'); llenar('lista-marcas', 'marca');
    if (!$('lista-cats').children.length) ['Ropa', 'Tenis', 'Accesorios', 'Belleza'].forEach(v => $('lista-cats').append(h('option', { value: v })));
  }

  async function cambiarEstado(p, estado) {
    try { await admin('hx_admin_estado', { p_id: p.id, p_estado: estado }); brindis(p.nombre + ': ' + ESTADOS[estado].toLowerCase()); }
    catch (e) { brindis(limpiarMsg(e)); }
    try { await recargar(); } catch (e) { /* ya se avisó */ }
  }

  let tq;
  $('a-q').addEventListener('input', e => { clearTimeout(tq); tq = setTimeout(() => { S.q = e.target.value; pintarInventario(); }, 160); });
  $('a-estado').addEventListener('change', e => { S.estado = e.target.value; pintarInventario(); });
  $('btn-nuevo').addEventListener('click', () => abrirEditor(null));

  // ---------- Editor ----------
  const CAMPOS = ['nombre', 'precio', 'categoria', 'marca', 'talla', 'condicion', 'descripcion', 'estado', 'costo', 'notas'];

  async function abrirEditor(p, duplicar) {
    ED.id = p && !duplicar ? p.id : null; ED.fotos = []; ED.fotosCambiadas = false;
    error('ed-error', '');
    $('ed-titulo').textContent = !p ? 'Producto nuevo' : duplicar ? 'Duplicar producto' : 'Editar producto';
    const v = p || { condicion: 'seminuevo', estado: 'disponible', categoria: '' };
    CAMPOS.forEach(c => { $('ed-' + c).value = v[c] == null ? '' : v[c]; });
    $('ed-antes').value = v.precio_antes == null ? '' : v.precio_antes;
    $('ed-destacado').checked = !!v.destacado;
    if (duplicar) { $('ed-estado').value = 'disponible'; }
    $('ed-eliminar').hidden = ED.id == null; reiniciarEliminar();
    pintarFotos();
    $('dlg-editor').showModal();
    if (p && Number(p.nfotos) > 0) {
      try {
        const f = await admin('hx_admin_fotos_leer', { p_id: p.id });
        if ($('dlg-editor').open) { ED.fotos = f.filter(x => IMG_OK.test(x)); ED.fotosCambiadas = !!duplicar; pintarFotos(); }
      } catch (e) { error('ed-error', 'No se pudieron cargar las fotos: ' + limpiarMsg(e)); }
    }
  }

  function pintarFotos() {
    const caja = $('ed-fotos');
    const mover = (i, d) => { const j = i + d; if (j < 0 || j >= ED.fotos.length) return; [ED.fotos[i], ED.fotos[j]] = [ED.fotos[j], ED.fotos[i]]; ED.fotosCambiadas = true; pintarFotos(); };
    caja.replaceChildren(...ED.fotos.map((f, i) => h('div', { class: 'fotos__una' },
      foto(f, 'Foto ' + (i + 1)),
      h('div', { class: 'ctrl' },
        h('button', { type: 'button', 'aria-label': 'Mover foto ' + (i + 1) + ' antes', disabled: i === 0, on: { click: () => mover(i, -1) } }, '←'),
        h('button', { type: 'button', 'aria-label': 'Mover foto ' + (i + 1) + ' después', disabled: i === ED.fotos.length - 1, on: { click: () => mover(i, 1) } }, '→'),
        h('button', { type: 'button', 'aria-label': 'Quitar foto ' + (i + 1), on: { click: () => { ED.fotos.splice(i, 1); ED.fotosCambiadas = true; pintarFotos(); } } }, '✕')))));
    if (ED.fotos.length < 8) caja.append(h('button', { class: 'fotos__mas', type: 'button', on: { click: () => $('ed-archivo').click() } }, 'Agregar fotos'));
  }

  // Reduce cada foto antes de subirla (y de paso le quita los datos de ubicación del celular).
  async function reducir(origen, lado, calidad) {
    let img;
    if (typeof origen === 'string') {
      img = new Image(); img.src = origen; await img.decode();
    } else if (window.createImageBitmap) {
      img = await createImageBitmap(origen, { imageOrientation: 'from-image' });
    } else {
      const url = URL.createObjectURL(origen);
      try { img = new Image(); img.src = url; await img.decode(); } finally { URL.revokeObjectURL(url); }
    }
    const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
    const k = Math.min(1, lado / Math.max(w0, h0));
    const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let q = calidad, out = c.toDataURL('image/jpeg', q);
    while (out.length > 600000 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
    return out;
  }

  $('ed-archivo').addEventListener('change', async ev => {
    const archivos = [...ev.target.files]; ev.target.value = '';
    for (const a of archivos) {
      if (ED.fotos.length >= 8) { brindis('Máximo 8 fotos por producto'); break; }
      if (!/^image\/(jpeg|png|webp)$/.test(a.type) || a.size > 25 * 1024 * 1024) { brindis('“' + a.name.slice(0, 30) + '” no es una foto JPG, PNG o WebP'); continue; }
      try { ED.fotos.push(await reducir(a, 1200, 0.8)); ED.fotosCambiadas = true; pintarFotos(); }
      catch (e) { brindis('No se pudo leer una de las fotos'); }
    }
  });

  function leerEditor() {
    const d = {}; CAMPOS.forEach(c => { d[c] = $('ed-' + c).value.trim(); });
    d.precio_antes = $('ed-antes').value.trim(); d.destacado = $('ed-destacado').checked;
    return d;
  }

  $('f-editor').addEventListener('submit', async ev => {
    ev.preventDefault(); if (ED.ocupado) return;
    const d = leerEditor(); error('ed-error', '');
    if (d.nombre.length < 2) return error('ed-error', 'Ponle nombre al producto.');
    if (d.precio === '' || Number(d.precio) < 0) return error('ed-error', 'Escribe el precio.');
    if (!d.categoria) return error('ed-error', 'Elige o escribe una categoría.');
    ED.ocupado = true; $('ed-guardar').disabled = true; $('ed-guardar').textContent = 'Guardando…';
    try {
      const id = await admin('hx_admin_guardar', { p_id: ED.id, p: d });
      ED.id = id;
      if (ED.fotosCambiadas) {
        const mini = ED.fotos.length ? await reducir(ED.fotos[0], 420, 0.68) : '';
        await admin('hx_admin_fotos', { p_id: id, p_fotos: ED.fotos, p_miniatura: mini });
      }
      $('dlg-editor').close(); brindis('Producto guardado'); await recargar();
    } catch (e) { error('ed-error', limpiarMsg(e)); }
    finally { ED.ocupado = false; $('ed-guardar').disabled = false; $('ed-guardar').textContent = 'Guardar producto'; }
  });

  // Eliminar pide dos toques para evitar accidentes.
  let armado = false, tArmado;
  function reiniciarEliminar() { armado = false; clearTimeout(tArmado); $('ed-eliminar').textContent = 'Eliminar'; }
  $('ed-eliminar').addEventListener('click', async () => {
    if (!armado) { armado = true; $('ed-eliminar').textContent = 'Toca otra vez para eliminar'; tArmado = setTimeout(reiniciarEliminar, 4000); return; }
    reiniciarEliminar();
    try { await admin('hx_admin_eliminar', { p_id: ED.id }); $('dlg-editor').close(); brindis('Producto eliminado'); await recargar(); }
    catch (e) { error('ed-error', limpiarMsg(e)); }
  });
  $('ed-cerrar').addEventListener('click', () => $('dlg-editor').close());

  // ---------- Texto para Marketplace ----------
  function etiqueta(s) { return sinAcentos(s).replace(/[^a-z0-9]+/g, ''); }
  $('ed-texto').addEventListener('click', () => {
    const d = leerEditor();
    const tags = [d.marca, d.categoria, d.marca && d.categoria ? d.categoria + d.marca : '', d.condicion === 'nuevo' ? 'nuevo' : 'seminuevo',
      'ropademarca', 'original', 'zapopan', 'guadalajara', 'gdl', 'ofertas'].map(etiqueta).filter(Boolean);
    const lineas = [
      d.nombre + (d.marca && !sinAcentos(d.nombre).includes(sinAcentos(d.marca)) ? ' ' + d.marca : ''),
      '💲 ' + dinero(d.precio) + (d.precio_antes && Number(d.precio_antes) > Number(d.precio) ? ' (antes ' + dinero(d.precio_antes) + ')' : ''),
      [d.talla && 'Talla: ' + d.talla, 'Condición: ' + (CONDICION[d.condicion] || d.condicion)].filter(Boolean).join(' | '),
      d.descripcion, '',
      S.config.entrega ? '📍 ' + S.config.entrega : '',
      'Pieza única, pregunta sin compromiso.', '',
      [...new Set(tags)].map(t => '#' + t).join(' ')
    ].filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0));
    $('tx-area').value = lineas.join('\n');
    $('dlg-texto').showModal();
  });
  $('tx-copiar').addEventListener('click', async () => brindis((await copiar($('tx-area').value)) ? 'Texto copiado' : 'No se pudo copiar'));
  $('tx-cerrar').addEventListener('click', () => $('dlg-texto').close());

  // ---------- Ajustes ----------
  const AJUSTES = ['nombre', 'lema', 'aviso', 'whatsapp', 'messenger', 'entrega', 'pagos'];
  function pintarAjustes() { AJUSTES.forEach(k => { $('j-' + k).value = S.config[k] || ''; }); }
  $('f-ajustes').addEventListener('submit', async ev => {
    ev.preventDefault();
    const p = {}; AJUSTES.forEach(k => { p[k] = $('j-' + k).value.trim(); });
    p.whatsapp = p.whatsapp.replace(/[^0-9]/g, '');
    try { await admin('hx_admin_config', { p: p }); brindis('Ajustes guardados'); await recargar(); }
    catch (e) { brindis(limpiarMsg(e)); }
  });

  // ---------- Respaldo ----------
  $('btn-respaldo').addEventListener('click', () => {
    const limpio = S.productos.map(p => { const c = Object.assign({}, p); delete c.miniatura; return c; });
    const blob = new Blob([JSON.stringify({ fecha: new Date().toISOString(), config: S.config, productos: limpio }, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'respaldo-catalogo-' + new Date().toISOString().slice(0, 10) + '.json' });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  iniciar();
})();

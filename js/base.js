// Utilidades compartidas por el catálogo y el panel.
// Regla de seguridad: nunca se usa innerHTML; todo texto entra con textContent.
(function () {
  'use strict';

  async function rpc(fn, args) {
    let r;
    try {
      r = await fetch(HX.url + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: HX.key, Authorization: 'Bearer ' + HX.key },
        body: JSON.stringify(args || {}),
        cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
      });
    } catch (e) {
      const err = new Error('No hay conexión. Revisa tu internet e inténtalo de nuevo.');
      err.red = true; throw err;
    }
    const txt = await r.text();
    let d = null;
    try { d = txt ? JSON.parse(txt) : null; } catch (e) { /* respuesta sin JSON */ }
    if (!r.ok) {
      const err = new Error((d && d.message) || 'El servidor no respondió bien.');
      err.status = r.status; err.code = d && d.code;
      err.sinInstalar = r.status === 404 || err.code === 'PGRST202';
      err.sesion = /SESION_INVALIDA/.test(err.message);
      throw err;
    }
    return d;
  }

  // Crea elementos sin HTML crudo: h('p', {class:'x'}, 'texto', otroNodo)
  function h(tag, props) {
    const el = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'on') for (const ev in v) el.addEventListener(ev, v[ev]);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(x => x != null && x !== false && el.append(x));
      else el.append(c);
    }
    return el;
  }

  const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  const dinero = n => fmt.format(Number(n) || 0);

  // Solo se aceptan imágenes incrustadas con formato conocido.
  const IMG_OK = /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/]+=*$/;
  function foto(src, alt, letra) {
    const caja = h('div', { class: 'foto' });
    if (src && IMG_OK.test(src)) caja.append(h('img', { src: src, alt: alt || '', loading: 'lazy', decoding: 'async' }));
    else caja.append(h('div', { class: 'foto__vacia', 'aria-hidden': 'true' }, (letra || '?').slice(0, 1).toUpperCase()));
    return caja;
  }

  let brindisT;
  function brindis(msg) {
    let b = document.getElementById('brindis');
    if (!b) { b = h('div', { id: 'brindis', class: 'brindis', role: 'status' }); document.body.append(b); }
    b.textContent = msg; b.hidden = false;
    clearTimeout(brindisT); brindisT = setTimeout(() => { b.hidden = true; }, 3200);
  }

  function guardarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  function leerLocal(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }

  async function copiar(txt) {
    try { await navigator.clipboard.writeText(txt); return true; } catch (e) {
      const t = h('textarea', { class: 'solo-lector' }); t.value = txt; document.body.append(t); t.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* sin permiso */ }
      t.remove(); return ok;
    }
  }

  const sinAcentos = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const CONDICION = { nuevo: 'Nuevo', seminuevo: 'Seminuevo', usado: 'Usado' };

  window.B = { rpc, h, dinero, foto, brindis, guardarLocal, leerLocal, copiar, sinAcentos, CONDICION, IMG_OK };
})();

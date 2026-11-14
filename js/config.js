// Conexión a la base de datos (Supabase). Esta llave es pública a propósito:
// solo permite llamar las funciones hx_*, que validan todo del lado del servidor.
// Si cambias de proyecto, cambia también la dirección en la etiqueta
// Content-Security-Policy de index.html y admin.html.
window.HX = Object.freeze({
  url: 'https://mnieoqxfezvmkvbpaouk.supabase.co',
  key: 'sb_publishable_Tt3CVL8FTfmDPMgCLKL8_Q_0HcHR0Dz'
});

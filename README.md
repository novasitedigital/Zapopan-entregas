# Catálogo Hector

Catálogo en línea con panel de administración.

- `index.html`: catálogo público.
- `admin.html`: panel para agregar, editar y marcar productos.
- Los datos viven en Supabase; todo acceso pasa por funciones `hx_*` que validan en el servidor.
- Sin dependencias externas: no carga scripts ni fuentes de terceros.

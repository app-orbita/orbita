// =====================================================================
// CONFIGURACIÓN — lo único que tenés que completar (ver GUIA.md, paso 4)
// Si dejás supabaseUrl vacío, la app funciona en MODO DEMO
// (datos guardados solo en ese navegador, sin sincronizar).
// =====================================================================
export const CONFIG = {
   supabaseUrl: 'https://inisrnsrloebstglhybf.supabase.co',
   supabaseKey: 'sb_publishable_X4VOeQjmn3zakkAshx1O9g_m44QTPcn',
   // Clave PÚBLICA para las notificaciones (la privada está solo en Supabase, como secreto)
   vapidPublicKey: 'BHELl0BeyUmVG-lBMGWJXtx42s5KrPbU0Pe4iTUKQ1ISm7fa0jrmOc8u0IID_Yjz8JMNp-i7AU77YZ14j8tqGcU',

  // Nombre que se muestra en el saludo según el mail con el que entra cada uno
  nombres: {
    'hazan.uriel@gmail.com': 'Uriel',
    'martuspectorins@gmail.com': 'Martina',
  },
};

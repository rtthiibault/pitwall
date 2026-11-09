/* Configuration du système d'amis (Supabase).
   Laissez vide pour désactiver la fonctionnalité. Voir README > "Activer le système d'amis".
   La clé "anon" (ou "publishable") est publique par conception : la sécurité repose sur les règles RLS de supabase/schema.sql. */
window.PITWALL_CONFIG = {
  supabaseUrl: '',      // ex. 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: '',  // ex. 'eyJhbGciOi...' (Project Settings > API > anon public)
};

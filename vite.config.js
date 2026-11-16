import { defineConfig } from 'vite';
export default defineConfig({
  // Exportações carregam PDF sob demanda dentro de um worker de módulo.
  worker: { format: 'es' },
});

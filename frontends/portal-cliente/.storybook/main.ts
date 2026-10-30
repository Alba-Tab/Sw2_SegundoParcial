import type { StorybookConfig } from '@storybook/react-vite';
import type { PluginOption } from 'vite';

const esPwa = (p: PluginOption) => !!p && typeof p === 'object' && 'name' in p && String(p.name).startsWith('vite-plugin-pwa');

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: { name: '@storybook/react-vite', options: {} },
  // El catálogo no es la PWA: sin service worker (Workbox no debe precachear los archivos de Storybook).
  viteFinal: (vite) => ({ ...vite, plugins: (vite.plugins ?? []).flat(Infinity as 1).filter((p) => !esPwa(p)) }),
};
export default config;

import { defineConfig } from '#q-app/wrappers';

export default defineConfig((/* ctx */) => {
  return {
    boot: ['pinia'],

    css: ['app.sass'],

    extras: ['material-icons', 'roboto-font'],

    build: {
      target: { browser: ['es2022', 'firefox115', 'chrome115', 'safari14'], node: 'node22' },
      vueRouterMode: 'history',
      typescript: {
        strict: true,
        vueShim: true
      },
      alias: {
        '@': new URL('./src', import.meta.url).pathname
      },
      vitePlugins: []
    },

    devServer: {
      port: 9000,
      open: false,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true
        }
      }
    },

    framework: {
      config: {
        brand: {
          primary: '#C8960A',
          secondary: '#2E7D32',
          accent: '#C8960A',
          dark: '#141414',
          'dark-page': '#141414',
          positive: '#2E7D32',
          negative: '#CF6679',
          info: '#8A8A8A',
          warning: '#C8960A'
        },
        dark: true
      },
      iconSet: 'material-icons',
      plugins: ['Notify', 'Dialog', 'BottomSheet']
    },

    animations: [],

    ssr: { pwa: false },

    pwa: false,

    cordova: {},
    capacitor: { hideSplashscreen: true },
    electron: {},

    bex: {}
  };
});

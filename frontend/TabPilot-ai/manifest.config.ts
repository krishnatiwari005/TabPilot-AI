
import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'TabPilot AI',
  version: '0.1.0',
  description: 'AI assistant for webpages and PDFs',

  permissions: [
    'sidePanel',
    'activeTab',
    'scripting',
    'storage',
  ],

  host_permissions: [
    'http://*/*',
    'https://*/*',
  ],

  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },

  action: {
    default_title: 'Open TabPilot AI',
  },

  side_panel: {
    default_path: 'index.html',
  },
})

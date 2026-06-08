import './app.css';
import { initPWA } from './lib/pwa';
import { mountShell } from './shell/shell';
import { startRouter, type Route } from './router';
import { renderBreath } from './modules/breath/breath';
import { renderCandle } from './modules/candle/candle';
import { renderMemento } from './modules/memento/memento';
import { renderMonochord } from './modules/drone/drone';
import { renderRecord } from './modules/record/record';
import { renderDream } from './modules/dream/dream';
import { renderTiming } from './modules/timing/timing';
import { renderHierophant } from './modules/ai/hierophant';

const routes: Route[] = [
  { path: '/breath', label: 'Breath', group: 'Practice', render: renderBreath },
  { path: '/candle', label: 'Candle', group: 'Practice', render: renderCandle },
  { path: '/memento', label: 'Memento', group: 'Practice', render: renderMemento },
  { path: '/monochord', label: 'Monochord', group: 'Practice', render: renderMonochord },
  { path: '/record', label: 'Record', group: 'Journal', render: renderRecord },
  { path: '/dream', label: 'Dreams', group: 'Journal', render: renderDream },
  { path: '/timing', label: 'Timing', group: 'Oracle', render: renderTiming },
  { path: '/hierophant', label: 'Hierophant', group: 'Oracle', render: renderHierophant },
];

const app = document.getElementById('app');
if (!app) throw new Error('#app root not found');

const outlet = mountShell(app, routes);
startRouter({ outlet, routes, fallback: '/breath' });

initPWA();

import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import NotificationsProvider from './features/notifications/NotificationsProvider';
import './styles/app.css';
import './styles/components.css';

// The two interactive routes pull in three.js and the whole renderer, so
// they load on demand: the landing page ships without them.
const WalkthroughRoute = lazy(() => import('./routes/WalkthroughRoute'));
const TextureToolRoute = lazy(() => import('./routes/TextureToolRoute'));

/**
 * Top-level routing.
 *
 * Each interactive route (`/walkthrough`, `/texture-tool`) mounts its own
 * `SceneProvider`, which hydrates the server-backed scene when the route
 * opens and flushes any pending save when it closes. The landing page has
 * nothing to read, so it mounts no provider and skips the fetch.
 * `NotificationsProvider` wraps every route so any of them can show toasts.
 *
 * Every unknown path falls back to the landing: there is no separate
 * 404 screen because the surface area is tiny.
 */
export default function App() {
  return (
    <BrowserRouter>
      <NotificationsProvider>
        <Suspense fallback={<div className="route-fallback">Cargando…</div>}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/walkthrough" element={<WalkthroughRoute />} />
            <Route path="/texture-tool" element={<TextureToolRoute />} />
            <Route path="*" element={<LandingPage />} />
          </Routes>
        </Suspense>
      </NotificationsProvider>
    </BrowserRouter>
  );
}

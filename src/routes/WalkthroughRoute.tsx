import '../features/scene/rendererSetup';
import SceneProvider from '../features/scene/SceneProvider';
import WalkthroughPage from '../pages/WalkthroughPage';

/**
 * `/walkthrough` route element: the page inside its own scene provider.
 *
 * Provider and page share one module so `App` can load both lazily, which
 * keeps three.js out of the landing page's bundle.
 */
export default function WalkthroughRoute() {
  return (
    <SceneProvider>
      <WalkthroughPage />
    </SceneProvider>
  );
}

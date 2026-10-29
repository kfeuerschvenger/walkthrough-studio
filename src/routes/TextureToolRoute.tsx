import '../features/scene/rendererSetup';
import SceneProvider from '../features/scene/SceneProvider';
import TextureToolPage from '../pages/TextureToolPage';

/**
 * `/texture-tool` route element: the editor inside its own scene provider.
 *
 * Provider and page share one module so `App` can load both lazily, which
 * keeps three.js out of the landing page's bundle.
 */
export default function TextureToolRoute() {
  return (
    <SceneProvider>
      <TextureToolPage />
    </SceneProvider>
  );
}

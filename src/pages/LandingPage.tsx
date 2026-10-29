import LogoMark from '../components/atoms/LogoMark';
import ModeCard from '../components/molecules/ModeCard';

/**
 * Landing page: entry point of the app.
 *
 * Renders the studio title and a grid of mode cards that route to the
 * available features (walkthrough, texture tool). Adding a new feature
 * is a one-line append to the grid.
 */
export default function LandingPage() {
  return (
    <div className="landing">
      <div className="landing__scroll">
        <div className="landing__content">
          <header className="landing__header">
            <LogoMark className="landing__logo" />
            <h1 className="landing__title">Walkthrough Studio</h1>
            <p className="landing__tagline">Elegí qué querés hacer</p>
          </header>

          <div className="landing__grid">
            <ModeCard
              to="/walkthrough"
              title="Walkthrough"
              subtitle="Recorrer la casa en primera persona"
              plate="W"
            />
            <ModeCard
              to="/texture-tool"
              title="Scene Editor"
              subtitle="Pintar texturas y editar iluminación"
              plate="S"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

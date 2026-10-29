import { Link } from 'react-router-dom';
import LetterPlate from '../atoms/LetterPlate';

type Props = {
  /** Internal route to navigate to. */
  to: string;
  /** Card title (e.g. the feature name). */
  title: string;
  /** Short description shown under the title. */
  subtitle: string;
  /** Single letter shown on the industrial metal plate. */
  plate: string;
};

/**
 * Landing-page card that links to a top-level feature (walkthrough,
 * texture tool, …). Renders as an industrial panel with a letter plate
 * as iconography.
 */
export default function ModeCard({ to, title, subtitle, plate }: Props) {
  return (
    <Link to={to} className="mode-card">
      <LetterPlate letter={plate} />
      <h2 className="mode-card__title">{title}</h2>
      <p className="mode-card__subtitle">{subtitle}</p>
    </Link>
  );
}

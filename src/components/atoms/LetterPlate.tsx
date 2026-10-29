type Props = {
  /** Single character (or short string) stamped on the metal plate. */
  letter: string;
};

/**
 * Industrial metal-plate atom showing a single uppercase letter with
 * rivets. Used as the iconography of the landing's mode cards.
 *
 * Styled via the `.mode-card__plate` class so the plate stays visually
 * consistent across cards and remains decorative-only (aria-hidden).
 */
export default function LetterPlate({ letter }: Props) {
  return (
    <div className="mode-card__plate" aria-hidden>
      {letter}
    </div>
  );
}

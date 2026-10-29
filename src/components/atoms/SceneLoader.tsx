import { Loader } from '@react-three/drei';

type Props = {
  /**
   * Localized format function that receives load progress in [0, 100] and
   * returns the text to show under the bar. Defaults to a Spanish label
   * since the user-facing strings of the app are Spanish.
   */
  formatProgress?: (percent: number) => string;
};

const ORANGE = '#f99a1c';
const ORANGE_DEEP = '#242424';
const BG_BASE = '#141414';

const dataStyle = {
  color: ORANGE,
  fontFamily: 'ui-monospace, Consolas, monospace',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  fontSize: '13px',
};

/**
 * Industrial-themed wrapper around `drei.Loader` that injects the
 * project palette so the loader matches the rest of the UI without each
 * page repeating the same style object.
 */
export default function SceneLoader({
  formatProgress = (p) => `Cargando casa · ${p.toFixed(0)}%`,
}: Props) {
  return (
    <Loader
      containerStyles={{ background: BG_BASE }}
      dataStyles={dataStyle}
      barStyles={{ background: ORANGE, height: '3px' }}
      innerStyles={{ background: ORANGE_DEEP, width: '240px' }}
      dataInterpolation={formatProgress}
    />
  );
}

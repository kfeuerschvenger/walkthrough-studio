import { useEffect, useRef } from 'react';
import BackLink from '../atoms/BackLink';
import Kbd from '../atoms/Kbd';

type Props = {
  /** True while the browser pointer lock is active; the overlay hides then. */
  locked: boolean;
  /**
   * Called when the user clicks the overlay. The page that owns the canvas
   * decides how to lock the pointer, so this component never has to look
   * the canvas up in the DOM.
   */
  onRequestLock: () => void;
};

/**
 * Pointer-lock invitation overlay shown above the walkthrough canvas
 * before the user enters first-person mode. Clicking the overlay, or
 * pressing Enter or Space while it has focus, asks the page to lock the
 * pointer to its canvas. The overlay takes focus when it appears so the
 * keyboard route works without tabbing to it first.
 */
export default function Instructions({ locked, onRequestLock }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!locked) overlayRef.current?.focus();
  }, [locked]);

  if (locked) return null;

  return (
    <div
      ref={overlayRef}
      className="overlay"
      role="dialog"
      tabIndex={0}
      aria-label="Instrucciones del walkthrough. Presioná Enter o Espacio para empezar."
      onClick={onRequestLock}
      onKeyDown={(event) => {
        // Keys pressed on the back link inside the card keep their own meaning.
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onRequestLock();
        }
      }}
    >
      <div className="card">
        <h1>Walkthrough de la Casa</h1>
        <p>
          <Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> para moverte
        </p>
        <p>
          <Kbd>Mouse</Kbd> para mirar
        </p>
        <p>
          <Kbd>Shift</Kbd> correr · <Kbd>↑</Kbd> subir · <Kbd>↓</Kbd> bajar · <Kbd>Esc</Kbd> salir
        </p>
        <p>
          <Kbd>[</Kbd> <Kbd>]</Kbd> hora del día · <Kbd>G</Kbd> grid · <Kbd>H</Kbd> ejes
        </p>
        <p className="hint">Click en cualquier lado para empezar</p>
        <BackLink to="/" onClick={(event) => event.stopPropagation()}>
          ← Volver al inicio
        </BackLink>
      </div>
    </div>
  );
}

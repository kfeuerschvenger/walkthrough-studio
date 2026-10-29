import Toast from '../atoms/Toast';

type Props = {
  message: string;
  tone: 'error' | 'info';
  /** Called when the user closes the toast. */
  onDismiss: () => void;
};

/** A toast plus its close button. */
export default function ToastItem({ message, tone, onDismiss }: Props) {
  return (
    <Toast tone={tone}>
      <span className="toast__message">{message}</span>
      <button type="button" className="toast__close" onClick={onDismiss} aria-label="Cerrar aviso">
        ×
      </button>
    </Toast>
  );
}

import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Button visual variants.
 *
 * - `default`: neutral steel-on-gray, used for most actions.
 * - `danger`:  red accent, reserved for destructive actions (delete, clear).
 */
export type ButtonVariant = 'default' | 'danger';

/**
 * Props of {@link Button}: every native button attribute except `type`
 * (always `button`), plus the visual variant and required content.
 */
export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  /** Visual style. Defaults to `default`. */
  variant?: ButtonVariant;
  /** Label or content of the button. */
  children: ReactNode;
};

/**
 * Industrial-styled button atom.
 *
 * Always renders `type="button"` to prevent accidental form submissions
 * (the app has no forms, but the default `submit` behavior in React still
 * triggers if a button is ever placed inside one; explicit is safer).
 */
export default function Button({
  variant = 'default',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const variantClass = variant === 'danger' ? 'tt-btn tt-btn--danger' : 'tt-btn';
  return (
    <button type="button" className={`${variantClass} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}

import type { MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  to: string;
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

/**
 * Navigation atom rendered as an industrial-orange uppercase link, used to
 * return from a feature page back to the landing (or any other parent).
 *
 * `onClick` is forwarded so containers can `stopPropagation` when the link
 * sits inside a clickable surface (e.g. the pointer-lock overlay).
 */
export default function BackLink({ to, children, className = 'back-link', onClick }: Props) {
  return (
    <Link to={to} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

import Link, { type LinkProps } from '@mui/material/Link';
import { createLink } from '@tanstack/react-router';
import { forwardRef } from 'react';

const Ancla = forwardRef<HTMLAnchorElement, LinkProps>((props, ref) => <Link ref={ref} {...props} />);
Ancla.displayName = 'Ancla';

/** Enlace de texto de MUI que navega con TanStack Router: un `<a href>` real, con foco y Enter (V3-1). */
export const Enlace = createLink(Ancla);

/** En una fila clicable, el clic que ya cayó en un enlace no navega otra vez. */
export const desdeEnlace = (e: { target: EventTarget }) => e.target instanceof Element && !!e.target.closest('a');

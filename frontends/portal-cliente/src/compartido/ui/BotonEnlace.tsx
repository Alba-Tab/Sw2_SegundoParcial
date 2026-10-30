import Button, { type ButtonProps } from '@mui/material/Button';
import { createLink } from '@tanstack/react-router';
import { forwardRef } from 'react';

const BotonAncla = forwardRef<HTMLAnchorElement, ButtonProps<'a'>>((props, ref) => <Button component="a" ref={ref} {...props} />);
BotonAncla.displayName = 'BotonAncla';

/** Botón de MUI que navega con TanStack Router (rutas con tipos). */
export const BotonEnlace = createLink(BotonAncla);

import TextField, { type TextFieldProps } from '@mui/material/TextField';
import { type Control, Controller, type FieldPath, type FieldValues } from 'react-hook-form';

/** TextField de MUI enlazado a react-hook-form, con el error de zod o del servidor bajo el campo. */
export function CampoTexto<T extends FieldValues, C = unknown, S extends FieldValues = T>({
  control,
  nombre,
  ...props
}: { control: Control<T, C, S>; nombre: FieldPath<T> } & Omit<TextFieldProps, 'name'>) {
  return (
    <Controller
      control={control}
      name={nombre}
      render={({ field, fieldState }) => (
        <TextField
          {...props}
          {...field}
          value={field.value ?? ''}
          error={!!fieldState.error}
          helperText={fieldState.error?.message ?? props.helperText}
        />
      )}
    />
  );
}

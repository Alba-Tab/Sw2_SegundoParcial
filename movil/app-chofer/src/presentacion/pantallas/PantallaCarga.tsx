import { useRef, useState } from 'react';
import { Image, InputAccessoryView, Keyboard, Platform, ScrollView, type TextInput as TextInputNativo, View } from 'react-native';
import { Button, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { casos } from '../../datos/contenedor';
import { esPositivo, normalizarMonto } from '../../dominio/dinero';
import { mensajeDe } from '../errores';
import { useFotos } from '../useFotos';

const numero = (t: string) => Number(t.replace(',', '.'));
const positivo = (t: string) => t.trim() !== '' && numero(t) > 0;
/** iOS: `decimal-pad` y `number-pad` no tienen tecla de retorno; la barra sobre el teclado da «Siguiente» y «Listo». */
const BARRA_TECLADO = 'barra-numerica';

/** Spec 009: carga de diésel con la foto del recibo; va a la cola y a Flota con la señal. */
export function PantallaCarga({ viajeId, alGuardar }: { viajeId: string; alGuardar: () => void }) {
  const tema = useTheme();
  const { fotos, tomar, quitar, error: errorFotos } = useFotos(1);
  const [litros, setLitros] = useState('');
  const [monto, setMonto] = useState('');
  const [kilometraje, setKilometraje] = useState('');
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  // Cerrojo: dos toques rápidos antes del re-render encolarían dos cargas con opId distintos.
  const guardando = useRef(false);
  const campoMonto = useRef<TextInputNativo>(null);
  const campoKm = useRef<TextInputNativo>(null);
  const [enfocado, setEnfocado] = useState<string | null>(null);
  // Kilometraje es el último: ahí solo «Listo».
  const haySiguiente = enfocado === 'litros' || enfocado === 'monto';
  const irSiguiente = () => (enfocado === 'litros' ? campoMonto : campoKm).current?.focus();

  const montoNormal = normalizarMonto(monto);
  const errores = {
    litros: positivo(litros) ? null : 'Escribe los litros cargados',
    // El monto va como texto (000 §3): se valida igual que en el caso de uso, sin pasar por float.
    monto: montoNormal !== null && esPositivo(montoNormal) ? null : 'Escribe el monto en Bs, por ejemplo 675,50',
    kilometraje: positivo(kilometraje) ? null : 'Escribe el kilometraje del tablero',
  };
  const valido = !errores.litros && !errores.monto && !errores.kilometraje;
  const tocar = (campo: string) => setTocados((t) => ({ ...t, [campo]: true }));

  const guardar = () => {
    if (!valido) {
      // El botón no se apaga sin explicar: al tocarlo se muestran todos los errores y se va al primero.
      setTocados({ litros: true, monto: true, kilometraje: true });
      return;
    }
    if (guardando.current) return;
    guardando.current = true;
    setError(null);
    try {
      casos.cargarCombustible(viajeId, {
        litros: numero(litros),
        monto,
        kilometraje: Math.round(numero(kilometraje)),
        foto: fotos[0] ?? null,
      });
      alGuardar();
    } catch (e) {
      setError(mensajeDe(e));
      guardando.current = false;
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
    >
      <View>
        <TextInput
          mode="outlined"
          label="Litros"
          value={litros}
          onChangeText={setLitros}
          onBlur={() => tocar('litros')}
          onFocus={() => setEnfocado('litros')}
          inputAccessoryViewID={BARRA_TECLADO}
          keyboardType="decimal-pad"
          returnKeyType="next"
          onSubmitEditing={() => campoMonto.current?.focus()}
          right={<TextInput.Affix text="L" />}
          error={tocados.litros && !!errores.litros}
        />
        {!!tocados.litros && !!errores.litros && <HelperText type="error">{errores.litros}</HelperText>}
      </View>
      <View>
        <TextInput
          ref={campoMonto}
          mode="outlined"
          label="Monto"
          value={monto}
          onChangeText={setMonto}
          onBlur={() => tocar('monto')}
          onFocus={() => setEnfocado('monto')}
          inputAccessoryViewID={BARRA_TECLADO}
          keyboardType="decimal-pad"
          returnKeyType="next"
          onSubmitEditing={() => campoKm.current?.focus()}
          right={<TextInput.Affix text="Bs" />}
          error={tocados.monto && !!errores.monto}
        />
        {!!tocados.monto && !!errores.monto && <HelperText type="error">{errores.monto}</HelperText>}
      </View>
      <View>
        <TextInput
          ref={campoKm}
          mode="outlined"
          label="Kilometraje del tablero"
          value={kilometraje}
          onChangeText={setKilometraje}
          onBlur={() => tocar('kilometraje')}
          onFocus={() => setEnfocado('kilometraje')}
          inputAccessoryViewID={BARRA_TECLADO}
          keyboardType="number-pad"
          right={<TextInput.Affix text="km" />}
          error={tocados.kilometraje && !!errores.kilometraje}
        />
        {!!tocados.kilometraje && !!errores.kilometraje && <HelperText type="error">{errores.kilometraje}</HelperText>}
      </View>
      <Text variant="titleMedium">Foto del recibo (opcional)</Text>
      {fotos[0] ? (
        <View style={{ alignSelf: 'flex-start', alignItems: 'center', marginVertical: 8 }}>
          <Image source={{ uri: fotos[0] }} style={{ width: 120, height: 160, borderRadius: 8 }} accessibilityLabel="Foto del recibo" />
          <Button icon="close" onPress={() => quitar(fotos[0])} accessibilityLabel="Quitar la foto del recibo">
            Quitar
          </Button>
        </View>
      ) : (
        <Button mode="outlined" icon="camera" onPress={() => void tomar()} style={{ marginVertical: 8 }}>
          Tomar foto del recibo
        </Button>
      )}
      {errorFotos && <HelperText type="error">{errorFotos}</HelperText>}
      {error && <HelperText type="error">{error}</HelperText>}
      <Button mode="contained" onPress={guardar} contentStyle={{ paddingVertical: 8 }} style={{ marginTop: 8 }}>
        Registrar carga
      </Button>
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={BARRA_TECLADO}>
          <View
            style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 4, backgroundColor: tema.colors.surfaceVariant }}
          >
            <Button onPress={irSiguiente} disabled={!haySiguiente}>
              Siguiente
            </Button>
            <Button onPress={() => Keyboard.dismiss()}>Listo</Button>
          </View>
        </InputAccessoryView>
      )}
    </ScrollView>
  );
}

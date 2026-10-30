import { useState } from 'react';
import { Image, ScrollView } from 'react-native';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { casos } from '../../datos/contenedor';
import { useFotos } from '../useFotos';

/** Spec 009: carga de diésel con la foto del recibo; va a la cola y a Flota con la señal. */
export function PantallaCarga({ viajeId, alGuardar }: { viajeId: string; alGuardar: () => void }) {
  const { fotos, tomar } = useFotos(1);
  const [litros, setLitros] = useState('');
  const [monto, setMonto] = useState('');
  const [kilometraje, setKilometraje] = useState('');
  const [error, setError] = useState<string | null>(null);
  const numero = (t: string) => Number(t.replace(',', '.'));

  const guardar = () => {
    try {
      casos.cargarCombustible(viajeId, {
        litros: numero(litros),
        monto: String(numero(monto)),
        kilometraje: Math.round(numero(kilometraje)),
        foto: fotos[0] ?? null,
      });
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <TextInput mode="outlined" label="Litros" value={litros} onChangeText={setLitros} keyboardType="decimal-pad" />
      <TextInput mode="outlined" label="Monto (Bs)" value={monto} onChangeText={setMonto} keyboardType="decimal-pad" />
      <TextInput
        mode="outlined"
        label="Kilometraje del tablero"
        value={kilometraje}
        onChangeText={setKilometraje}
        keyboardType="number-pad"
      />
      {fotos[0] && (
        <Image source={{ uri: fotos[0] }} style={{ width: 120, height: 160, borderRadius: 8 }} accessibilityLabel="Foto del recibo" />
      )}
      <Button mode="outlined" icon="camera" onPress={() => void tomar()}>
        {fotos[0] ? 'Cambiar foto del recibo' : 'Foto del recibo'}
      </Button>
      {error && <HelperText type="error">{error}</HelperText>}
      <Button mode="contained" onPress={guardar}>
        Registrar carga
      </Button>
    </ScrollView>
  );
}

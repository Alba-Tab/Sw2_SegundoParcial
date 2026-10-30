import { useRef, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { Button, HelperText, IconButton, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { casos } from '../../datos/contenedor';
import { Firma, type FirmaRef } from '../Firma';
import { useFotos } from '../useFotos';

/**
 * Spec 006 (entrega) y 007 (rechazo en destino). Todo queda en el celular y la cola lo envía con la señal: primero las
 * fotos y la firma por partes a S3, después la entrega. Viajes decide con la geocerca y la firma si queda ENTREGADO u
 * observada.
 */
export function PantallaEntrega({ viajeId, alGuardar }: { viajeId: string; alGuardar: (mensaje: string) => void }) {
  const [modo, setModo] = useState<'entrega' | 'rechazo'>('entrega');
  const { fotos, tomar, quitar, error: errorFotos } = useFotos(3);
  const firma = useRef<FirmaRef>(null);
  const [receptor, setReceptor] = useState('');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setError(null);
    setGuardando(true);
    try {
      if (modo === 'entrega') {
        const png = await firma.current?.exportar();
        if (png && receptor.trim().length < 3) throw new Error('Escribe el nombre de quien recibe');
        casos.entregar(viajeId, fotos, png ? { archivo: png, nombreReceptor: receptor } : null, texto, null);
        alGuardar('Entrega registrada; se envía con la señal');
      } else {
        casos.rechazar(viajeId, texto, fotos);
        alGuardar('Rechazo registrado; se envía con la señal');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <SegmentedButtons
        value={modo}
        onValueChange={(v) => setModo(v as 'entrega' | 'rechazo')}
        buttons={[
          { value: 'entrega', label: 'Entregar', icon: 'check' },
          { value: 'rechazo', label: 'Rechazo en destino', icon: 'close' },
        ]}
      />
      <Text variant="titleMedium">Fotos ({fotos.length} de 3)</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {fotos.map((f) => (
          <View key={f}>
            <Image source={{ uri: f }} style={{ width: 96, height: 96, borderRadius: 8 }} accessibilityLabel="Foto tomada" />
            <IconButton
              icon="close"
              size={16}
              mode="contained"
              onPress={() => quitar(f)}
              style={{ position: 'absolute', top: -8, right: -8 }}
            />
          </View>
        ))}
      </View>
      {fotos.length < 3 && (
        <Button mode="outlined" icon="camera" onPress={() => void tomar()}>
          Tomar foto
        </Button>
      )}
      {errorFotos && <HelperText type="error">{errorFotos}</HelperText>}
      {modo === 'entrega' ? (
        <>
          <Text variant="titleMedium">Firma de quien recibe</Text>
          <Firma ref={firma} />
          <TextInput mode="outlined" label="Nombre de quien recibe" value={receptor} onChangeText={setReceptor} maxLength={120} />
          <TextInput mode="outlined" label="Observación (opcional)" value={texto} onChangeText={setTexto} multiline maxLength={500} />
          <HelperText type="info">Sin firma, la entrega queda en revisión del despachador.</HelperText>
        </>
      ) : (
        <TextInput mode="outlined" label="Motivo del rechazo" value={texto} onChangeText={setTexto} multiline maxLength={300} />
      )}
      {error && <HelperText type="error">{error}</HelperText>}
      <Button mode="contained" onPress={() => void guardar()} loading={guardando} disabled={fotos.length === 0 || guardando}>
        {modo === 'entrega' ? 'Registrar entrega' : 'Registrar rechazo'}
      </Button>
    </ScrollView>
  );
}

import { useRef, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { Button, Dialog, HelperText, Portal, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { casos } from '../../datos/contenedor';
import { ErrorDeUsuario } from '../../dominio/errores';
import { mensajeDe } from '../errores';
import { Firma, type FirmaRef } from '../Firma';
import { plural } from '../textos';
import { useFotos } from '../useFotos';

/**
 * Spec 006 (entrega) y 007 (rechazo en destino). Todo queda en el celular y la cola lo envía con la señal: primero las
 * fotos y la firma por partes a S3, después la entrega. Viajes decide con la geocerca y la firma si queda ENTREGADO u
 * observada. Registrar no se puede deshacer (el viaje sale de ruta), así que se confirma antes con un resumen.
 */
export function PantallaEntrega({ viajeId, alGuardar }: { viajeId: string; alGuardar: (mensaje: string) => void }) {
  const tema = useTheme();
  const [modo, setModo] = useState<'entrega' | 'rechazo'>('entrega');
  const { fotos, tomar, quitar, error: errorFotos } = useFotos(3);
  const firma = useRef<FirmaRef>(null);
  const [firmando, setFirmando] = useState(false);
  const [receptor, setReceptor] = useState('');
  // Dos campos: la observación de la entrega no debe pasar como motivo del rechazo al cambiar de modo.
  const [observacion, setObservacion] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [conFirma, setConFirma] = useState(false);
  const [faltaFoto, setFaltaFoto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const rechazo = modo === 'rechazo';

  const pedirConfirmacion = () => {
    setError(null);
    // El aviso de la foto va en la sección de fotos, no al pie de la pantalla.
    setFaltaFoto(fotos.length === 0);
    if (fotos.length === 0) return;
    if (rechazo && motivo.trim().length < 3) return setError('Escribe el motivo del rechazo.');
    const firmo = !rechazo && !!firma.current?.firmada();
    if (firmo && receptor.trim().length < 3) return setError('Escribe el nombre de quien firmó.');
    setConFirma(firmo);
    setConfirmar(true);
  };

  const guardar = async () => {
    setConfirmar(false);
    setGuardando(true);
    try {
      if (!rechazo) {
        const png = await firma.current?.exportar();
        if (png && receptor.trim().length < 3) throw new ErrorDeUsuario('Escribe el nombre de quien recibe');
        casos.entregar(viajeId, fotos, png ? { archivo: png, nombreReceptor: receptor } : null, observacion, null);
        alGuardar('Entrega registrada; se envía con la señal');
      } else {
        casos.rechazar(viajeId, motivo, fotos);
        alGuardar('Rechazo registrado; se envía con la señal');
      }
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      scrollEnabled={!firmando}
    >
      <SegmentedButtons
        value={modo}
        onValueChange={(v) => setModo(v as 'entrega' | 'rechazo')}
        buttons={[
          { value: 'entrega', label: 'Entregar', icon: 'check' },
          { value: 'rechazo', label: 'Rechazo en destino', icon: 'close' },
        ]}
      />
      <Text variant="titleMedium">Fotos ({fotos.length} de 3)</Text>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        {fotos.map((f, i) => (
          <View key={f} style={{ alignItems: 'center' }}>
            <Image source={{ uri: f }} style={{ width: 96, height: 96, borderRadius: 8 }} accessibilityLabel={`Foto ${i + 1}`} />
            <Button compact icon="close" onPress={() => quitar(f)} accessibilityLabel={`Quitar la foto ${i + 1}`}>
              Quitar
            </Button>
          </View>
        ))}
      </View>
      {fotos.length < 3 && (
        <Button mode="outlined" icon="camera" onPress={() => void tomar()} contentStyle={{ paddingVertical: 6 }}>
          Tomar foto
        </Button>
      )}
      {errorFotos && <HelperText type="error">{errorFotos}</HelperText>}
      {faltaFoto && fotos.length === 0 && <HelperText type="error">Toma al menos una foto.</HelperText>}
      {!rechazo ? (
        <>
          <Text variant="titleMedium">Firma de quien recibe</Text>
          <Firma ref={firma} alFirmar={setFirmando} />
          <TextInput mode="outlined" label="Nombre de quien recibe" value={receptor} onChangeText={setReceptor} maxLength={120} />
          <TextInput
            mode="outlined"
            label="Observación (opcional)"
            value={observacion}
            onChangeText={setObservacion}
            multiline
            maxLength={500}
          />
          <HelperText type="info">Sin firma, la entrega queda en revisión del despachador.</HelperText>
        </>
      ) : (
        <TextInput mode="outlined" label="Motivo del rechazo" value={motivo} onChangeText={setMotivo} multiline maxLength={300} />
      )}
      {error && <HelperText type="error">{error}</HelperText>}
      <Button
        mode="contained"
        onPress={pedirConfirmacion}
        loading={guardando}
        disabled={guardando}
        buttonColor={rechazo ? tema.colors.error : undefined}
        textColor={rechazo ? tema.colors.onError : undefined}
        contentStyle={{ paddingVertical: 8 }}
      >
        {rechazo ? 'Registrar rechazo' : 'Registrar entrega'}
      </Button>
      <Portal>
        <Dialog visible={confirmar} onDismiss={() => setConfirmar(false)}>
          <Dialog.Title>{rechazo ? '¿Registrar el rechazo?' : '¿Registrar la entrega?'}</Dialog.Title>
          <Dialog.Content style={{ gap: 4 }}>
            <Text variant="bodyLarge">{plural(fotos.length, 'foto', 'fotos')}</Text>
            {rechazo ? (
              <Text variant="bodyLarge">Motivo: {motivo.trim()}</Text>
            ) : (
              <Text variant="bodyLarge">{conFirma ? `Firmó: ${receptor.trim()}` : 'Sin firma (queda en revisión)'}</Text>
            )}
            <Text variant="bodyMedium">El viaje deja de estar en ruta y no se puede deshacer.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmar(false)}>Revisar</Button>
            <Button onPress={() => void guardar()} textColor={rechazo ? tema.colors.error : undefined}>
              {rechazo ? 'Sí, registrar rechazo' : 'Sí, registrar entrega'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

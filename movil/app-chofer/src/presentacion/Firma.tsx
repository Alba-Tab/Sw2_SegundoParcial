import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { Button, useTheme } from 'react-native-paper';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

export interface FirmaRef {
  /** PNG de la firma en un archivo temporal, o null si está en blanco. */
  exportar(): Promise<string | null>;
  /** Si el receptor ya trazó algo. */
  firmada(): boolean;
}

/** Recuadro para que el receptor firme con el dedo (spec 006); se guarda como PNG. */
export const Firma = forwardRef<FirmaRef, { alFirmar?: (firmando: boolean) => void }>(function Firma({ alFirmar }, ref) {
  const tema = useTheme();
  const vista = useRef<View>(null);
  const [trazos, setTrazos] = useState<string[]>([]);
  const actual = useRef('');

  const gestos = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Que la ScrollView de la entrega no se lleve el trazo cuando va en vertical.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderRelease: () => alFirmar?.(false),
      onPanResponderTerminate: () => alFirmar?.(false),
      onPanResponderGrant: (e) => {
        alFirmar?.(true);
        actual.current = `M${e.nativeEvent.locationX.toFixed(1)},${e.nativeEvent.locationY.toFixed(1)}`;
        setTrazos((t) => [...t, actual.current]);
      },
      onPanResponderMove: (e) => {
        actual.current += ` L${e.nativeEvent.locationX.toFixed(1)},${e.nativeEvent.locationY.toFixed(1)}`;
        setTrazos((t) => [...t.slice(0, -1), actual.current]);
      },
    }),
  ).current;

  useImperativeHandle(ref, () => ({
    firmada: () => trazos.length > 0,
    exportar: async () => (trazos.length ? captureRef(vista, { format: 'png', quality: 1, result: 'tmpfile' }) : null),
  }));

  return (
    <View style={{ gap: 4 }}>
      <View
        ref={vista}
        collapsable={false}
        {...gestos.panHandlers}
        accessibilityLabel="Recuadro de firma"
        style={{ height: 180, borderRadius: 12, borderWidth: 1, borderColor: tema.colors.outline, backgroundColor: '#ffffff' }}
      >
        <Svg width="100%" height="100%">
          {trazos.map((d, i) => (
            <Path key={i} d={d} stroke="#111111" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
      </View>
      <Button icon="eraser" onPress={() => setTrazos([])} style={{ alignSelf: 'flex-end' }}>
        Borrar firma
      </Button>
    </View>
  );
});

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { Button, useTheme } from 'react-native-paper';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

export interface FirmaRef {
  /** PNG de la firma en un archivo temporal, o null si está en blanco. */
  exportar(): Promise<string | null>;
}

/** Recuadro para que el receptor firme con el dedo (spec 006); se guarda como PNG. */
export const Firma = forwardRef<FirmaRef>(function Firma(_props, ref) {
  const tema = useTheme();
  const vista = useRef<View>(null);
  const [trazos, setTrazos] = useState<string[]>([]);
  const actual = useRef('');

  const gestos = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
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
      <Button compact onPress={() => setTrazos([])} style={{ alignSelf: 'flex-end' }}>
        Borrar firma
      </Button>
    </View>
  );
});

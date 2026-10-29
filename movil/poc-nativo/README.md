# PoC-4 App del chofer (rama de prueba, no se mergea)

Es una sola app React Native con Expo SDK 57 (57.0.31, RN 0.86.3, nueva arquitectura) que compila para iOS y Android. Una pantalla con React Native Paper corre cada prueba y muestra sus tiempos.

| Prueba | Cómo |
|---|---|
| SQLite | `expo-sqlite`: 500 escrituras en una transacción, en la tabla `cola` |
| Login | `expo-auth-session` con PKCE y `offline_access` contra Keycloak en la Mac (`<mac>.local:8080`; en el emulador, `10.0.2.2:8080`); cliente `app-chofer` y usuario `chofer1` |
| Whisper | `whisper.rn` con `ggml-base-q5_1.bin` (~57 MB, se descarga al primer uso): un WAV de muestra en español y, en iOS, 5 s grabados del micrófono en WAV de 16 kHz |
| TFLite | `react-native-fast-tflite` con el detector de rostro BlazeFace (MediaPipe, 230 KB), en CPU y con CoreML (iOS) o GPU (Android) |
| GPS en segundo plano | `expo-location` + `expo-task-manager`, un punto cada 10 s guardado en SQLite; la tarjeta cuenta cuántos llegaron con la app en segundo plano |
| Push | `getDevicePushTokenAsync` en Android (FCM, D45). Necesita `google-services.json`, que no se versiona |

```bash
# Keycloak con el realm: plataforma/keycloak/README.md
npm install
npx expo prebuild
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" npx expo run:android   # emulador Pixel_10 (Google Play)
LANG=en_US.UTF-8 npx expo run:ios --device                                                     # iPhone con cuenta gratuita
```

`ios/` y `android/` los genera `expo prebuild` y no se versionan. Resultados en `specs/poc-resultados.md`.

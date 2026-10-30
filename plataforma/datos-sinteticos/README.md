# Datos sintéticos (T8.5)

Tres meses de historia para Analítica, generados con semilla fija (`python3 generar.py`, solo biblioteca estándar). Los CSV están versionados: el build de Analítica entrena con ellos (T8.4) y `demo:reiniciar` los carga directo en su base (T8.8), sin eventos.

| Archivo | Qué trae | Para qué |
|---|---|---|
| `viajes.csv` | 640 viajes de las 4 rutas, con horas reales, bloqueos, fallas y etiqueta `retrasado` (D80) | Reportes de rentabilidad y facturación |
| `muestras-retraso.csv` | 4 instantáneas por viaje (avance, horas en ruta, bloqueos ya registrados, minutos detenido en la última hora: D79) | Entrenar la probabilidad de retraso |
| `cargas.csv` | 1 o 2 cargas por viaje en 8 tractos históricos, ~5 % con rendimiento imposible | Entrenar Isolation Forest y el reporte de consumo |
| `facturas.csv`, `pagos.csv` | Una factura por viaje, todas pagadas | Facturación por cliente sin tocar las cuentas por cobrar de la demo |

- **Fechas relativas:** los campos `…DiasDesdeHoy` se resuelven al cargar, con la fecha de `America/La_Paz`.
- **Ids propios** (`01934000-…`) y tractos `61xxHIS`: no chocan con `plataforma/semilla`. Ninguna carga es de `4521KTR`, que en FF2 empieza sin cargas previas.
- **Patrón del simulador:** 1 de cada 16 viajes tiene 2 bloqueos y la última hora detenido a las 6 h de salir (el guion de chofer2, T8.7), etiquetado `retrasado`.

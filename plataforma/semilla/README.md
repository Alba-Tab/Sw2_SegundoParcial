# Semilla de la demo (T4.8, D102)

Datos fijos de los escenarios de la defensa, compartidos por los servicios. Cada servicio dueño carga su parte directo en su base, **sin escribir en el Outbox**: la semilla no dispara correos, avisos push ni líneas de crédito, y Analítica (F8) carga los mismos archivos en la suya.

| Archivo | Quién lo carga | Qué trae |
|---|---|---|
| `clientes.json` | Viajes (clientes), Finanzas (copias y línea de crédito) | Agroexport SRL y Agro Moroso, con cuenta (los `sub` de `plataforma/keycloak/usuarios-semilla.json`); Ferretería Sin Crédito, registrada por comercial1 (límite 5.000) |
| `rutas.json` | Viajes (rutas), Finanzas (copias) | Cochabamba 470 km, La Paz 850, Arica 1.300 y el Aula 120 (D06; coordenadas del Aula por verificar el día de la defensa) |
| `tarifas.json` | Finanzas | La matriz final de D10: base por ruta × factor por carga |
| `facturas.json` | Finanzas | Agro Moroso: 5.000 vencida hace 20 días (mora, D04). Agroexport: 7.600 y 2.800 que vencen en 2 y 5 días (FM4) |
| `unidades.json` | Flota | 5 tractos (`4521KTR` con 184.000 km de odómetro y el mayor km desde mantenimiento, para que D11 lo elija); 3 furgones (uno con 9.950 km, FF3); 2 plataformas; 1 cisterna en `MANTENIMIENTO_PENDIENTE` (FS4) |
| `choferes.json` | Flota | Los 4 choferes de Keycloak con licencia C vigente; chofer1 tiene el `choferId` menor y es el primero que se asigna |

**Fechas relativas.** Los campos que terminan en `DiasDesdeHoy` se resuelven al cargar con la fecha de hoy en `America/La_Paz`: `venceElDiasDesdeHoy: -20` es "venció hace 20 días".

**Ids fijos.** Clientes `0193a000-0000-7000-8000-0000000c000N`, rutas `01933a00-…-00000000000N`, unidades y choferes `01933c00-…`, facturas `01933f00-…` y sus viajes históricos `01933e00-…`.

**Líneas de crédito.** `utilizado` es la suma de los saldos de las facturas del cliente, así que Agro Moroso queda con 25.000 disponibles y Agroexport con 19.600.

## Cargar

```bash
plataforma/semilla/cargar.sh
```

Corre los tres comandos (nunca endpoints): `--semilla.cargar=true` en Viajes, `php artisan semilla:cargar` en Finanzas y `node dist/semilla.js` en Flota. Son idempotentes. Hasta T8.8 la demo se reinicia con `docker compose down -v` y esta carga; `demo:reiniciar` (T8.8) vaciará las tablas y luego llamará a estos mismos cargadores.

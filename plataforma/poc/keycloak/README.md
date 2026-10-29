# PoC-1 Keycloak 26.8.1 (rama de prueba, no se mergea)

```bash
docker run -d --name poc-kc -p 8080:8080 -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:26.8 start-dev
./configurar.sh && ./configurar-fgap.sh
./probar-cadena.sh    # K1: 3 intercambios estándar
./probar-fgap.sh      # K4: viajes escribe clienteId y asigna solo `cliente`
./probar-resto.sh     # agente, K3, device grant, cierre de sesión
```

`config-cli-prueba.json` prueba keycloak-config-cli con `$(env:KC_SECRETO_GATEWAY)`. Resultados en `specs/poc-resultados.md`.

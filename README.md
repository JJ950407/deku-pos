# Deku Ramen POS Beta (LAN)

Sistema POS en red local (LAN) para Deku Ramen con backend Node.js + WebSocket, Kitchen Display y Waiter App PWA.

## Requisitos
- Node.js 18+ (o 16+ con soporte de fetch en el navegador)

## Instalación
```bash
npm install
```

## Arranque
```bash
npm start
```

El servidor se inicia en `http://localhost:3000`.

## Acceso en LAN
1. Obtén la IP local del equipo que corre el servidor:
   - macOS/Linux: `ipconfig getifaddr en0` o `hostname -I`
   - Windows: `ipconfig`
2. En cada dispositivo abre:
   - **Waiter App (tablet/cel):** `http://<IP_LOCAL>:3000/`
   - **Kitchen Display (pantalla cocina):** `http://<IP_LOCAL>:3000/kitchen`

## Dónde colocar las imágenes
Coloca las imágenes del menú en:
```
/waiter-app/assets/menu/
```
Los nombres deben coincidir con los definidos en `menu.json`.

## Cómo editar el menú y precios
Edita el archivo:
```
/backend/data/menu.json
```
El backend siempre usa este archivo como fuente de verdad.

## Ejemplo de uso
1. En la Waiter App selecciona un ramen y completa el flujo guiado (tamaño, picante, extras).
2. Agrega acompañamientos o bebidas con los botones +/-.
3. Presiona **ENVIAR A COCINA**.
4. En Kitchen Display verás la orden en tiempo real y podrás marcarla como **EN PREPARACIÓN** o **LISTO**.

## Estructura
```
/backend
  server.js
  /data
    menu.json
    orders.json
/kitchen-display
  index.html
  styles.css
  kitchen.js
/waiter-app
  index.html
  styles.css
  app.js
  config.js
  manifest.json
  sw.js
  /assets/menu
README.md
```

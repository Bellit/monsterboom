# Boom Monsters

Juego web de batalla con bombas entre monstruos. Diseño completo en [DISENO.md](DISENO.md).

## Arrancar

```
npm install
npm run dev
```

Abre http://localhost:5173. `npm test` pasa los tests de la lógica y `npm run build` genera la versión publicable en `dist/`.

## Estructura

- `src/core/` — lógica del juego (mapa, movimiento, bombas, IA). TypeScript puro, sin Phaser: se reutilizará en el servidor online.
- `src/scenes/` — dibujado con Phaser (de momento formas simples).
- `src/core/maps.ts` — mapas temáticos (también se pueden escribir como texto).
- `src/input/` — teclado y controles táctiles.
- `src/audio/` — motor de audio, efectos y música sintetizados (temas propios en `music.ts`).
- `src/render/monster.ts` — dibujo de los monstruos, compartido por el juego y el menú.
- `src/theme.ts` — plantilla de monstruos (nombre, color, rasgo).
- `src/main.ts` — menús, pausa y flujo de rondas.

## Controles

Flechas o WASD para moverte, Espacio (o X) para poner bomba, Esc o P para pausar. Con el guante, pulsa bomba dos veces seguidas para lanzarla. En el móvil, joystick a la izquierda y botón de bomba a la derecha.

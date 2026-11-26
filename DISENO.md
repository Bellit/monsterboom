# Boom Monsters — Documento de diseño

Juego web de acción en cuadrícula con bombas, protagonizado por monstruos. Personajes, mundos y arte propios.

## Plataforma y controles
- Webapp para **ordenador y móvil**.
- Ordenador: teclado (flechas / WASD + espacio para la bomba). Mando como mejora futura.
- Móvil: controles táctiles en pantalla (cruceta virtual + botón de bomba).
- En el móvil, **solo horizontal** (si se pone en vertical, aviso de "gira el móvil").

## Estilo
- Temática **monstruos** cartoon.
- **Pixel art de 16 bits**, baldosas de 16×16 escaladas.
- Gráficos: se empieza con **formas simples** para probar la jugabilidad; el arte definitivo llega después.
- Sonido: efectos retro generados + música chiptune de licencia libre.

## Personajes
- Todos los monstruos jugables tienen **las mismas capacidades**; solo cambia el aspecto. Las diferencias las dan los power-ups.
- 8 monstruos: Moco (cuernos), Bloop (cíclope), Zarpa (orejas), Mochi (mofletes), Chicle (antenas), Chispa (pelos de punta), Grumo (colmillos) y Pinchi (cresta). El jugador elige el suyo en el menú y los bots toman el resto.

## Movimiento
- **Libre con corrección en las esquinas**: si chocas con una esquina por poco, el personaje se desliza solo hacia el pasillo.
- Las bombas se colocan en la casilla donde está el centro del personaje.

## Bombas y explosiones
- Explosión en cruz con alcance según los power-ups.
- Rompe el primer bloque rompible de cada dirección y se detiene.
- Las explosiones **encadenan** otras bombas.
- Se puede salir de la bomba recién puesta, pero no volver a entrar.

## Power-ups
- **Básicos:** +1 bomba, +alcance, +velocidad.
- **Patear** (empuja bombas al andar contra ellas) y **lanzar** (las lanza por encima de bloques).
- **Escudo:** aguanta una explosión.
- **Maldición:** efecto negativo temporal (lentitud, bombas que se ponen solas, controles invertidos…).

## Modo batalla
- De **2 a 8 jugadores**, configurable. El tamaño del mapa crece con el número de jugadores.
- Partida **por rondas** (al mejor de 3 o 5, configurable). Gana la ronda el último en pie.
- Al acabarse el tiempo de la ronda: **lluvia de bombas** al azar por el mapa.
- IA con **3 niveles de dificultad** (fácil, normal, difícil), elegible por rival.
- **Varios mapas** con elementos especiales a juego con los monstruos (teletransportes, cintas, hielo, lápidas…), además de uno clásico.

## Modo historia
- **4 mundos × 5 niveles** (20 niveles), preparado para **añadir más mundos y niveles** fácilmente (niveles definidos como datos, no como código).
- Para superar un nivel: **matar a todos los enemigos y salir por la puerta** oculta bajo un bloque.
- **Jefe al final de cada mundo** (nivel 5).
- **3 vidas**; al perderlas se repite el mundo actual. Progreso **guardado automáticamente** en el navegador.
- **Tiempo límite** con castigo suave: al acabarse aparecen enemigos rápidos extra que te persiguen.

## Online (fase futura)
- **Salas privadas con código** para jugar con amigos.
- **Sin cuentas**: solo un apodo.
- Servidor con autoridad (Colyseus, Node.js): la lógica del juego se ejecuta en el servidor.

## Objetivo del proyecto
- De momento, personal y para amigos. Si funciona, quizá se monetice más adelante, así que todo el arte, la música y las librerías deben tener licencias que lo permitan.

## Tecnología
- **TypeScript + Vite + Phaser 3.**
- La **lógica del juego** (`src/core`) es TypeScript puro, sin Phaser ni DOM, y avanza a paso fijo. Así se puede mover al servidor sin reescribirla.
- El **dibujado** (`src/scenes`) solo lee el estado de la lógica y lo pinta.
- Las entradas (teclado, táctil, IA y en el futuro la red) se traducen todas a la misma estructura de "intención": dirección + poner bomba.

## Fases
1. **Prototipo de batalla**: mapa, movimiento, bombas, explosiones, bloques, power-ups básicos y rivales con IA. ✅
2. **Batalla completa** ← *en curso*
   - ✅ Power-ups: patear, lanzar (pulsar bomba dos veces), escudo y 5 maldiciones contagiosas (lento, acelerado, controles al revés, bombas sin control, sin bombas)
   - ✅ Mapas: Cripta clásica, Portales, Fábrica (cintas), Lago helado y «al azar»
   - ✅ Cuenta atrás, lluvia de bombas, partículas, textos flotantes
   - ✅ Efectos de sonido sintetizados y botón de silencio
   - ✅ Tests automáticos de la lógica (`npm test`)
   - ✅ Elegir monstruo en el menú (se recuerda entre visitas)
   - ✅ Música chiptune propia generada por código: tema de menú y de batalla (se acelera con la lluvia); botones separados de música y efectos
   - Pendiente: IA que use portales y escudo con cabeza
3. Modo historia.
4. Arte, sonido y pulido.
5. Online con Colyseus.

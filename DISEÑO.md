# Diseño de Calendario Apracom

Aplicación interna para el personal de Apracom. Diseño aprobado: tarjetas blancas, fondo gris azulado suave, radios de 12 px y sombras discretas.

- Azul corporativo del logo para acciones, foco y selección.
- Franjas según la hora de inicio en Ecuador: mañana 08:00–11:30 con fondo amarillo amanecer #F6DFA8; mediodía 11:30–13:00 con fondo azul cielo #B9DDF2; tarde 13:00–17:00 con fondo rosa suave #E8C6D9. Calendario, agenda y tarjetas usan el mismo código, acompañado de texto. Bordes y textos emplean variantes oscuras de cada color para mantener contraste.
- Reservas e Historial: tres tarjetas por fila en escritorio, dos en tablet y una en móvil. Priorizar horario, asunto, fecha, responsable y sala.
- Sin etiquetas de estado redundantes ni administración de salas.
- Navegación móvil en fila propia; controles táctiles de 44 px y campos de 16 px.
- Hover de 160 ms solo con ratón, mediante borde y sombra suave sin desplazar las tarjetas. La agenda conserva el fondo de su franja. Respetar prefers-reduced-motion.
- Textos largos sin desbordamientos, teclado, foco visible y contraste legible.

ENERGY 2 / RHYTHM 2 / MOTION 2. Entrada del acceso con marca en dos tiempos; diálogos con profundidad y cierre simétrico; tarjetas con desfase limitado a 60 ms. Transiciones de 140 a 280 ms sin bloquear acciones, respetando movimiento reducido y ratón. Reglas funcionales e instalación en README.md.

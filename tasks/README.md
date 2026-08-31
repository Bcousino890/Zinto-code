# Tareas de saneamiento — Zinto CRM

Carpeta de seguimiento del trabajo de seguridad, límites de plan y escalabilidad
detectado en la auditoría de código. Se actualiza en cada sesión.

- **PLAN.md** — plan completo por fases, con qué se paraleliza, qué modelo de
  Claude usar y con qué nivel de esfuerzo.
- **TODO.md** — checklist vivo de lo pendiente, agrupado por fase.
- **done/** — una nota por tarea completada: qué se hizo, en qué commit/archivo,
  y cómo se verificó. No se borra nada de aquí; es el historial de auditoría.
- **infra-netcup-scaling.md** — plan de servidores Netcup por nº de clientes.

## Regla de trabajo

1. Antes de tocar código, mover la tarea de `TODO.md` a "en curso".
2. Al terminar: mover de `TODO.md` a una nota nueva en `done/`, con fecha,
   archivo(s) tocado(s) y cómo se comprobó (típecheck, test manual, etc.).
3. Nunca cerrar una tarea de seguridad sin decir explícitamente qué endpoint/
   archivo quedó protegido y con qué guard.

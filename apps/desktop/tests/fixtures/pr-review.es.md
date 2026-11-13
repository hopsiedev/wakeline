Esta PR evita registrar dos pagos cuando llega varias veces el mismo webhook. El cambio añade una consulta por el identificador del evento antes de crear el pago y conserva la referencia a la factura.

### Qué cambia

- En `src/payments/webhook.ts`, se busca primero un evento ya procesado. Si existe, se devuelve su pago.
- Si es un evento nuevo, se crea el pago y se guarda la relación con el identificador del evento.
- En `src/payments/webhook.test.ts`, se añade una prueba para dos entregas repetidas.

| Caso | Comportamiento propuesto |
| --- | --- |
| Evento nuevo | Crear el pago y registrar el evento. |
| Evento ya procesado | Devolver el pago existente. |
| Dos entregas simultáneas | Falta comprobar que solo se cree un pago. |

### Lo que revisaría antes de aprobar

**Posible condición de carrera.** Dos peticiones podrían consultar el mismo evento antes de que ninguna lo registre. Si la consulta, la creación del pago y el registro del evento no están protegidos por una operación atómica, ambas podrían crear un pago.

La prueba añadida cubre la repetición, pero el diff de ejemplo no permite confirmar que cubra entregas concurrentes. Añadiría un caso como este, adaptado a las funciones reales de la suite:

```ts
it("procesa una sola vez dos entregas simultáneas", async () => {
  const [first, second] = await Promise.all([
    record(event),
    record(event),
  ]);

  expect(first.id).toBe(second.id);
  expect(await paymentsForEvent(event.id)).toHaveLength(1);
});
```

**Recomendación:** comprobar la protección atómica y añadir la prueba de concurrencia antes de aprobar. Esta es una revisión de ejemplo del diff; no se han ejecutado los tests ni inspeccionado archivos locales.

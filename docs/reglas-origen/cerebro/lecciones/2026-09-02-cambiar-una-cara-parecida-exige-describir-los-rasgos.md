# cambiar-una-cara-parecida-exige-describir-los-rasgos

**Fecha:** 2026-09-02 · **Ámbito:** GLOBAL
**Qué pasó:** 
**Regla:** Cuando se sustituye a la persona de un frame por otra, decir «the person is the woman in image [2] and only her» NO basta si las dos se parecen (misma edad, mismo tipo de pelo): el modelo da por hecho que ya cumple y devuelve la cara original. Paso el 2026-09-02 con ZielAlarm 4, dos intentos seguidos. Lo que si funciona, al tercero: (1) empezar el prompt POR la persona, no por «keep everything exactly as it is», que pesa mas; y (2) DESCRIBIR LOS RASGOS QUE DIFIEREN uno a uno —tono y largo del pelo, raya, forma de la cara, cejas, ojos, nariz, labios— y prohibir explicitamente que se mezclen los de la imagen original. Si el cambio de persona es drastico (hombre por mujer) con la primera formula basta.

```datos
{
 "checklist_frames": [
  "si se sustituye la persona de un frame, el prompt empieza por ella y describe los rasgos que la diferencian de la original"
 ]
}
```

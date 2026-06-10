# Delta para exportacion-excel

## ADDED Requirements

### Requisito: Props de estilo opcionales en `Celda`

`Celda` DEBE extenderse con `fontWeight?: 'bold'` y `align?: 'left'|'center'|'right'` opcionales. Sin estas props la serialización DEBE ser idéntica a hoy. El value numérico NO SE altera; `parsearMontoCelda` sigue siendo el único boundary `string → Number` con `format '#,##0.00'` (§4.5).

#### Escenario: fontWeight se propaga

- DADO una `CeldaTexto` con `fontWeight: 'bold'`
- CUANDO el builder construye la hoja
- ENTONCES la celda resultante tiene `fontWeight === 'bold'`

#### Escenario: Sin estilo — retrocompatible

- DADO una `CeldaTexto` sin `fontWeight` ni `align`
- CUANDO el builder construye la hoja
- ENTONCES el objeto resultante NO contiene las propiedades `fontWeight` ni `align`

#### Escenario: §4.5 intacto con estilo

- DADO una `CeldaNumero` con `fontWeight: 'bold'` y value `"1250.50"`
- CUANDO el builder construye la hoja
- ENTONCES la celda tiene `value === 1250.50`, `format === '#,##0.00'` y `fontWeight === 'bold'`

---

### Requisito: Alineación derecha por defecto en `CeldaNumero`

El builder DEBE aplicar `align: 'right'` a toda `CeldaNumero` sin `align` explícito. Un override explícito DEBE prevalecer. `CeldaTexto` sin `align` NO recibe default.

#### Escenario: Default right y override

- DADO una `CeldaNumero` sin `align` y otra con `align: 'left'`
- CUANDO el builder construye la hoja
- ENTONCES la primera tiene `align === 'right'` y la segunda `align === 'left'`

#### Escenario: CeldaTexto sin align

- DADO una `CeldaTexto` sin `align`
- CUANDO el builder construye la hoja
- ENTONCES el objeto resultante NO contiene `align`

---

### Requisito: Cabeceras de columna en negrita

En cada uno de los 5 informes, la fila de encabezados de columna DEBE tener `fontWeight: 'bold'` en todas sus celdas.

#### Escenario: Encabezados en negrita

- DADO cualquiera de los 5 informes exportado
- CUANDO se construye la hoja
- ENTONCES cada celda de la fila de encabezados tiene `fontWeight === 'bold'`

---

### Requisito: Filas de totales y subtotales en negrita

Las filas de total general y las filas de subtotal de sección/subsección (Balance, Estado de Resultados) DEBEN tener `fontWeight: 'bold'`. El informe de Comprobantes no tiene fila de totales.

#### Escenario: Total general en negrita

- DADO un informe con fila de total (Libro Diario o Libro Mayor)
- CUANDO se construye la hoja
- ENTONCES las celdas de la fila de total tienen `fontWeight === 'bold'`

#### Escenario: Subtotales jerárquicos en negrita, detalle sin negrita

- DADO un árbol aplanado (Balance o Estado de Resultados)
- CUANDO se construye la hoja
- ENTONCES las filas de subtotal de sección y subsección tienen `fontWeight === 'bold'`; las filas de cuenta de detalle NO tienen `fontWeight`

#### Escenario: Comprobantes — sin fila de totales

- DADO el informe de Comprobantes exportado
- CUANDO se construye la hoja
- ENTONCES no hay fila de totales; la única negrita es la fila de encabezados

---

## MODIFIED Requirements

### Requisito: Bloque de cabecera fiscal

A partir del perfil (`razonSocial`, `nit`, `direccion`, `representanteLegal`, `telefono`, `email`, todos `string | null`), el helper DEBE armar filas de texto. `razonSocial` presente DEBE ser primera fila con `fontWeight: 'bold'` y SIN etiqueta. Los demás presentes DEBEN llevar etiqueta fija: `"NIT: <v>"`, `"Dirección: <v>"`, `"Representante Legal: <v>"`, `"Teléfono: <v>"`, `"Email: <v>"`. Campo `null` DEBE omitirse; NUNCA se imprime `"null"`. Si `razonSocial` es `null`, ninguna fila lleva negrita.
(Previously: una línea por campo presente, sin etiquetas ni negrita.)

#### Escenario: Todos los campos presentes

- DADO un perfil con los 6 campos seteados
- CUANDO se arma la cabecera
- ENTONCES la primera fila tiene `value === razonSocial` con `fontWeight === 'bold'`; las siguientes tienen `"NIT: ..."`, `"Dirección: ..."`, etc., sin `fontWeight`, en orden

#### Escenario: razonSocial null — sin negrita

- DADO un perfil con `razonSocial: null` y `nit` seteado
- CUANDO se arma la cabecera
- ENTONCES la primera fila es `"NIT: <valor>"` sin `fontWeight`

#### Escenario: Campo null omitido

- DADO un perfil con `direccion: null`
- CUANDO se arma la cabecera
- ENTONCES no hay fila de Dirección y ninguna celda contiene la cadena `"null"`

#### Escenario: Todos null — sin error

- DADO un perfil con todos los campos en `null`
- CUANDO se arma la cabecera
- ENTONCES el bloque no tiene líneas y el armado no lanza error

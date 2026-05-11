# Estrategia Integral de Pruebas - ALTESA App

## 1. Objetivo General
Asegurar la calidad, seguridad y fiabilidad de la aplicación ALTESA, enfocándose en la gestión criptográfica "Zero-Backend", la sincronización offline (importación/exportación de archivos JSON/ENC) y el ciclo de vida de enmiendas (Protocol Amendments) y queries. Esta estrategia cubre Pruebas Unitarias, de Integración y End-to-End (E2E).

## 2. Herramientas Recomendadas
- **Unit & Integration Testing:** Jest + React Testing Library (RTL).
- **End-to-End (E2E) Testing:** Playwright o Cypress.
- **Mocks:** Web Crypto API mock (`crypto.subtle`) y mock de `FileReader` / `URL.createObjectURL`.

---

## 3. Suites de Pruebas Unitarias (Unit Testing)
Se enfocan en validar la lógica sin renderizado gráfico, especialmente el manejo criptográfico y transformaciones de datos estructurados.

### Suite: Criptografía y Keys (`src/lib/crypto.test.ts`)
- **Generación de Claves (CRC y Manager):** Verificar que los pares de claves (RSA-OAEP, ECDSA) retornen la estructura requerida (público/privado).
- **Firmas y Validación:** Encriptar un payload de JSON usando clave pública y verificar desencriptación usando llave privada, validando firmas.
- **Manejo de Errores:** Demostrar que un buffer de `ArrayBuffer` ligeramente alterado falla la verificación criptográfica con gracia.

### Suite: Protocol Amendments (Manejo de Estado Estricto)
- **Creación:** Validar la construcción de un nuevo objeto de enmienda (campos requeridos, estado inicial predeterminado a `draft`).
- **Transición de Estado:** Al establecer una enmienda como `active`, verificar que las demás enmiendas marcadas como `active` en la estructura pasen inmediatamente a estado `legacy`.
- **Reglas de Borrado:** Una enmienda en estado `active` o `legacy` no debe poder eliminarse, arrojando excepción.

### Suite: Parsing Seguro de Archivos
- **Importaciones:** Funciones como `JSON.parse` envueltas en bloques de control. Las representaciones JSON incorrectas o esquemas no válidos (ej. array ausente exportando queries) devuelven el array vacío o error limpio.

---

## 4. Pruebas de Integración (Integration Testing)
Evaluará el comportamiento combinado de los manejadores del estado y el DOM, la lectura de `localStorage` y la retroalimentación de la interfaz de usuario.

### Interacción UI y Base de Datos (Local Storage)
- **Persistencia de Enmiendas:** Modificar una enmienda en `<ManagerDashboard />` disparará `setProtocolVersions`. Comprobar con mocks de `localStorage` que `altesa_protocol_versions` fue sobreescrito.
- **Upload de Enmiendas del Coordinador:**
  - *Acción:* Simular evento de carga manual (`onUpload`) del `<input type="file" />` en el componente `<Settings />` (botón *Import Protocol Amendments*).
  - *Comprobación:* Verificar invocación del método de propagación hacia arriba `onImportAmendments(imported)`.
  - *UI State:* El dropdown (Select) en `<AddPatientModal />` refleja los "options" actualizados según el nuevo JSON importado.

---

## 5. Pruebas de Extremo a Extremo E2E (Simulación de Usuario)
Ejecutar el navegador automatizado validando los flujos de "Doble Rol" y sincronización manual.

### Flujo E2E 1: Setup Air-Gapped Inicial
1. **Acto Manager:** Mánager inicializa su Master Config desde una vista local, creando llaves de Manager y exportando Public Key (descarga de `.txt`).
2. **Acto Coordinador:** Coordinador se loguea (PIN) y se dirige a **Settings -> "Import Manager Key"**.
3. **Validación:** Interfaz del Coordinador pasa a permitir la botonera "Download Data Package".

### Flujo E2E 2: Creación, Exportación y Uso de Enmiendas
1. **Acto 1:** El Manager crea Enmienda "V2" y la pasa a Active en la UI de *Protocol Amendments*.
2. **Acto 2:** Manager pulsa "Export", el driver de Playwright captura el fichero JSON descargado.
3. **Acto 3:** Desde la UI del Coordinador (Componente Settings), carga el archivo capturado en el paso anterior y confirma el Toast de "Success".
4. **Validación:** Al abrir la pestaña de Nuevos Pacientes, la enmienda actual es V2, comprobando el éxito de la comunicación air-gapped entre los dashboards.

---

## 6. Casos de Prueba Formales y Criterios de Éxito

| ID del Test | Componente | Descripción de la Acción | Criterio de Éxito Esperado |
|-------------|------------|--------------------------|----------------------------|
| **AMND-01** | `ManagerDashboard` | Crear y activar nueva enmienda de protocolo. | Las modificaciones se listan correctamente, el estado preexistente pasa a "Legacy". |
| **EXP-01** | `Manager/Export` | Hacer click en el botón Export de Amendments. | Se genera un blob BlobType application/json; ventana lanza descarga de `ALTESA_Amendments_*.json`. |
| **IMP-01** | `Settings` | Subir JSON dañado a Import Protocol Amendments. | La lectura del lector asíncrono (`FileReader`) es atrapada en el catch; el toast muestra "Failed to parse file". |
| **SYNC-01** | `App` | Coordinador recibe Queries en paquete `.enc`. | La validación de integridad (`verifyAndDecrypt`) es exitosa; `queries` mapean exactamente con los ID de pacientes en la UI resaltándolos. |
| **TOUR-01** | `TourOverlay` | Moverse del paso 1 al paso 6 en el Manager Dashboard. | Todos los targetIDs (`manager-tour-keys`, `compliance`, etc.) son localizados; no hay *cascading render warnings*. |

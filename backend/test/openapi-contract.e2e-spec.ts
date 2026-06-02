import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { buildOpenApiConfig } from '../src/openapi/build-openapi-config';
import { AppModule } from '../src/app.module';

/**
 * Contrato del artefacto OpenAPI (REQ-OAPI-02): todo *ResponseDto que el
 * frontend consume DEBE aparecer en `components.schemas`. Un DTO convertido a
 * `class` con `@ApiProperty` pero SIN `@ApiOkResponse({ type })` en su controller
 * NO entra al schema — por eso este test valida la presencia efectiva en el
 * documento generado, no solo la decoración.
 */
describe('OpenAPI — contrato de schemas de response', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    document = SwaggerModule.createDocument(app, buildOpenApiConfig());
  });

  afterAll(async () => {
    await app.close();
  });

  const schemasAusentesHistoricos = [
    'CuentaResponseDto',
    'CuentaListResponseDto',
    'CuentaTreeNodeDto',
    'MePermissionsResponseDto',
    'UserResponseDto',
    'ConfiguracionContableResponseDto',
    'LibroDiarioResponseDto',
    'LibroMayorResponseDto',
    'BalanceResponseDto',
    'EstadoResultadosResponseDto',
    'ListarContactosResponseDto',
    'ListarComprobantesResponseDto',
    'ListarDocumentosFisicosResponseDto',
    'ListarLotesResponseDto',
    'ListarTiposDocumentoFisicoResponseDto',
  ];

  it.each(schemasAusentesHistoricos)('expone %s en components.schemas', (nombreSchema) => {
    const schemas = document.components?.schemas ?? {};
    expect(Object.keys(schemas)).toContain(nombreSchema);
  });

  it('mantiene el title y version de la config compartida', () => {
    expect(document.info.title).toBe('Multi-Tenant SaaS API');
    expect(document.info.version).toBe('1.0');
  });
});

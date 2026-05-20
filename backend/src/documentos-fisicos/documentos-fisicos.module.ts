import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { ContactosModule } from '@/contactos/contactos.module';
import { RbacModule } from '@/rbac/rbac.module';
import { TiposDocumentoFisicoModule } from '@/tipos-documento-fisico/tipos-documento-fisico.module';

import { PrismaAsociacionComprobanteRepository } from './adapters/prisma-asociacion-comprobante.repository';
import { PrismaDocumentoFisicoRepository } from './adapters/prisma-documento-fisico.repository';
import { PrismaDocumentosFisicosReaderAdapter } from './adapters/prisma-documentos-fisicos-reader.adapter';
import { DocumentosFisicosController } from './documentos-fisicos.controller';
import { DocumentosFisicosService } from './documentos-fisicos.service';
import { ASOCIACION_COMPROBANTE_REPOSITORY_PORT } from './ports/asociacion-comprobante.repository.port';
import { DOCUMENTO_FISICO_REPOSITORY_PORT } from './ports/documento-fisico.repository.port';
import { DOCUMENTOS_FISICOS_READER_PORT } from './ports/documentos-fisicos-reader.port';

// Módulo del catálogo de documentos físicos que respaldan comprobantes contables.
// Exporta los ports cross-módulo que consume `comprobantes` (asociar, validar,
// desasociar al anular).
@Module({
  imports: [
    RbacModule,
    // Provee TIPOS_DOCUMENTO_FISICO_READER_PORT para que el service valide
    // tipoDocumentoFisicoId al crear/editar (REQ-D-06/07).
    TiposDocumentoFisicoModule,
    // Provee CONTACTOS_READER_PORT para que el service valide contactoId (REQ-D-10).
    ContactosModule,
  ],
  controllers: [DocumentosFisicosController],
  providers: [
    PrismaService,

    DocumentosFisicosService,

    PrismaDocumentoFisicoRepository,
    { provide: DOCUMENTO_FISICO_REPOSITORY_PORT, useExisting: PrismaDocumentoFisicoRepository },

    PrismaAsociacionComprobanteRepository,
    {
      provide: ASOCIACION_COMPROBANTE_REPOSITORY_PORT,
      useExisting: PrismaAsociacionComprobanteRepository,
    },

    PrismaDocumentosFisicosReaderAdapter,
    { provide: DOCUMENTOS_FISICOS_READER_PORT, useExisting: PrismaDocumentosFisicosReaderAdapter },
  ],
  // Exporta SOLO ports cross-módulo. ComprobantesModule consume:
  // - DOCUMENTOS_FISICOS_READER_PORT: para validar al asociar y contabilizar.
  // - ASOCIACION_COMPROBANTE_REPOSITORY_PORT: para asociar, desasociar, refrescar estado.
  exports: [DOCUMENTOS_FISICOS_READER_PORT, ASOCIACION_COMPROBANTE_REPOSITORY_PORT],
})
export class DocumentosFisicosModule {}

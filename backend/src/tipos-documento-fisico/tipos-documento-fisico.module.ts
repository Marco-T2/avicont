import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaTipoDocumentoFisicoRepository } from './adapters/prisma-tipo-documento-fisico.repository';
import { PrismaTiposDocumentoFisicoReaderAdapter } from './adapters/prisma-tipos-documento-fisico-reader.adapter';
import { PrismaTiposDocumentoFisicoSeederAdapter } from './adapters/prisma-tipos-documento-fisico-seeder.adapter';
import { TIPO_DOCUMENTO_FISICO_REPOSITORY_PORT } from './ports/tipo-documento-fisico.repository.port';
import { TIPOS_DOCUMENTO_FISICO_READER_PORT } from './ports/tipos-documento-fisico-reader.port';
import { TIPO_DOCUMENTO_FISICO_SEEDER_PORT } from './ports/tipos-documento-fisico-seeder.port';
import { TiposDocumentoFisicoController } from './tipos-documento-fisico.controller';
import { TiposDocumentoFisicoService } from './tipos-documento-fisico.service';

// Catálogo per-tenant de tipos de documento físico.
// TIPOS_DOCUMENTO_FISICO_READER_PORT se exporta para que documentos-fisicos
// valide tipoDocumentoFisicoId al crear/editar.
// TIPO_DOCUMENTO_FISICO_SEEDER_PORT se exporta para que tenants siembre los
// 8 tipos universales al crear una organización (REQ-SEED-01..03).
@Module({
  imports: [RbacModule],
  controllers: [TiposDocumentoFisicoController],
  providers: [
    PrismaService,
    TiposDocumentoFisicoService,

    PrismaTipoDocumentoFisicoRepository,
    { provide: TIPO_DOCUMENTO_FISICO_REPOSITORY_PORT, useExisting: PrismaTipoDocumentoFisicoRepository },

    PrismaTiposDocumentoFisicoReaderAdapter,
    { provide: TIPOS_DOCUMENTO_FISICO_READER_PORT, useExisting: PrismaTiposDocumentoFisicoReaderAdapter },

    // SeederAdapter depende de TipoDocumentoFisicoRepositoryPort (no de PrismaService
    // directamente); el token se resuelve porque PrismaTipoDocumentoFisicoRepository
    // está listado arriba y bindeado via useExisting.
    PrismaTiposDocumentoFisicoSeederAdapter,
    { provide: TIPO_DOCUMENTO_FISICO_SEEDER_PORT, useExisting: PrismaTiposDocumentoFisicoSeederAdapter },
  ],
  exports: [TIPOS_DOCUMENTO_FISICO_READER_PORT, TIPO_DOCUMENTO_FISICO_SEEDER_PORT],
})
export class TiposDocumentoFisicoModule {}

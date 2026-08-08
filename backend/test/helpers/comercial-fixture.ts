/**
 * Fixture compartido de las suites e2e del módulo comercial (`ventas-piloto`,
 * Fase 7).
 *
 * Vive acá y no dentro de cada suite porque las cuatro necesitan **el mismo**
 * escenario mínimo —org con gestión abierta, las 4 cuentas del circuito,
 * la configuración contable mapeada, un cliente y un ítem— y duplicarlo cuatro
 * veces es Anti-01: el día que cambie un requisito del alta de venta habría que
 * acordarse de tocar los cuatro archivos.
 *
 * Lo que NO hace: crear ventas, cobros ni comprobantes. Cada suite arma los
 * suyos, que es justamente lo que cada test está probando.
 */

import { INestApplication } from '@nestjs/common';
import { ClaseCuenta, NaturalezaCuenta, SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { PrismaService } from '../../src/common/prisma.service';

export const PASSWORD_COMERCIAL = 'password123';

/** Códigos del plan usados por el circuito. El prefijo `1.1.1` NO es decorativo:
 * es una de las dos ramas de la regla de elegibilidad de efectivo (PA-1), así
 * que Caja y Banco son destino válido de cobro y CxC no. */
export const CODIGO_CAJA = '1.1.1.001';
export const CODIGO_BANCO = '1.1.1.002';
export const CODIGO_CXC = '1.1.2.001';
export const CODIGO_VENTAS = '4.1.1.001';

export interface EscenarioComercial {
  token: string;
  orgId: string;
  ownerId: string;
  ownerEmail: string;
  cajaId: string;
  bancoId: string;
  cxcId: string;
  ventasCuentaId: string;
  contactoId: string;
  itemId: string;
}

interface OpcionesSeed {
  /** Distingue org y emails entre suites y entre tests de la misma suite. */
  slug: string;
  /** Año de la gestión. Las suites trabajan sobre 2026 salvo que digan otra cosa. */
  year?: number;
}

async function crearCuenta(
  prisma: PrismaService,
  organizationId: string,
  codigoInterno: string,
  nombre: string,
  claseCuenta: ClaseCuenta,
  naturaleza: NaturalezaCuenta,
  requiereContacto = false,
): Promise<string> {
  const cuenta = await prisma.cuenta.create({
    data: {
      organizationId,
      codigoInterno,
      nombre,
      claseCuenta,
      naturaleza,
      nivel: 4,
      esDetalle: true,
      requiereContacto,
    },
  });
  return cuenta.id;
}

/**
 * Org OWNER con gestión abierta, plan mínimo, configuración contable mapeada,
 * un cliente y un ítem vendible.
 *
 * La gestión se crea **por la API** y no con `prisma.create` a propósito: así
 * los 12 períodos salen de la lógica real del service y no de un fixture que
 * podría divergir de ella.
 */
export async function seedComercial(
  app: INestApplication,
  prisma: PrismaService,
  opts: OpcionesSeed,
): Promise<EscenarioComercial> {
  const { slug } = opts;
  const year = opts.year ?? 2026;
  const email = `owner+${slug}@comercial.bo`;

  const hashedPassword = await bcrypt.hash(PASSWORD_COMERCIAL, 10);
  const owner = await prisma.user.create({
    data: { email, hashedPassword, isEmailVerified: true },
  });
  const org = await prisma.organization.create({
    data: {
      slug,
      name: `Org ${slug}`,
      memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
    },
  });

  const token = await login(app, email);

  const gestRes = await request(app.getHttpServer())
    .post('/api/gestiones')
    .set('Authorization', `Bearer ${token}`)
    .send({ year });
  expect(gestRes.status).toBe(201);

  const [cajaId, bancoId, cxcId, ventasCuentaId] = await Promise.all([
    crearCuenta(
      prisma,
      org.id,
      CODIGO_CAJA,
      'Caja General',
      ClaseCuenta.ACTIVO,
      NaturalezaCuenta.DEUDORA,
    ),
    crearCuenta(
      prisma,
      org.id,
      CODIGO_BANCO,
      'Banco cuenta corriente',
      ClaseCuenta.ACTIVO,
      NaturalezaCuenta.DEUDORA,
    ),
    // `requiereContacto` en CxC es la config realista y además ejercita que la
    // venta propague `contactoId` a la línea: sin eso, contabilizar falla.
    crearCuenta(
      prisma,
      org.id,
      CODIGO_CXC,
      'Cuentas por Cobrar Comerciales',
      ClaseCuenta.ACTIVO,
      NaturalezaCuenta.DEUDORA,
      true,
    ),
    crearCuenta(
      prisma,
      org.id,
      CODIGO_VENTAS,
      'Ventas',
      ClaseCuenta.INGRESO,
      NaturalezaCuenta.ACREEDORA,
    ),
  ]);

  await prisma.orgConfiguracionContable.create({
    data: { organizationId: org.id, ventasId: ventasCuentaId, cuentasPorCobrarId: cxcId },
  });

  const contactoRes = await request(app.getHttpServer())
    .post('/api/contactos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      razonSocial: `Cliente ${slug}`,
      documento: null,
      esCliente: true,
      esProveedor: false,
    });
  expect(contactoRes.status).toBe(201);

  const itemRes = await request(app.getHttpServer())
    .post('/api/items')
    .set('Authorization', `Bearer ${token}`)
    .send({
      nombre: 'Pollo entero',
      tipo: 'PRODUCTO',
      unidadMedida: 'kg',
      precioUnitarioSugerido: '6.305000',
    });
  expect(itemRes.status).toBe(201);

  return {
    token,
    orgId: org.id,
    ownerId: owner.id,
    ownerEmail: email,
    cajaId,
    bancoId,
    cxcId,
    ventasCuentaId,
    contactoId: contactoRes.body.id as string,
    itemId: itemRes.body.id as string,
  };
}

export async function login(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: PASSWORD_COMERCIAL });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

/**
 * Miembro con `CustomRole` de permisos acotados. Sirve para los tests de
 * gating: `CustomRole.permissions` es una lista libre, así que se pueden
 * construir combinaciones que ningún template ofrece.
 */
export async function seedMiembro(
  app: INestApplication,
  prisma: PrismaService,
  orgId: string,
  slug: string,
  permissions: string[],
): Promise<string> {
  const email = `member+${slug}@comercial.bo`;
  const hashedPassword = await bcrypt.hash(PASSWORD_COMERCIAL, 10);
  const user = await prisma.user.create({
    data: { email, hashedPassword, isEmailVerified: true },
  });
  const role = await prisma.customRole.create({
    data: { organizationId: orgId, slug: `rol-${slug}`, name: `Rol ${slug}`, permissions },
  });
  await prisma.membership.create({
    data: { organizationId: orgId, userId: user.id, customRoleId: role.id },
  });
  return login(app, email);
}

/** Cuerpo mínimo de una venta: una línea, cantidad y precio explícitos. */
export function cuerpoVenta(
  e: EscenarioComercial,
  opts: {
    condicionPago: 'CONTADO' | 'CREDITO';
    fechaContable?: string;
    fechaVencimiento?: string;
    cantidad?: string;
    precioUnitario?: string;
    cuentaDestinoId?: string;
    glosa?: string;
  },
): Record<string, unknown> {
  return {
    contactoId: e.contactoId,
    fechaContable: opts.fechaContable ?? '2026-07-15',
    condicionPago: opts.condicionPago,
    ...(opts.fechaVencimiento !== undefined
      ? { fechaVencimiento: opts.fechaVencimiento }
      : opts.condicionPago === 'CREDITO'
        ? { fechaVencimiento: '2026-08-15' }
        : {}),
    glosa: opts.glosa ?? 'Venta de pollo faenado',
    ...(opts.cuentaDestinoId !== undefined
      ? { cuentaDestinoId: opts.cuentaDestinoId }
      : opts.condicionPago === 'CONTADO'
        ? { cuentaDestinoId: e.cajaId }
        : {}),
    lineas: [
      {
        itemId: e.itemId,
        descripcion: 'Pollo entero',
        cantidad: opts.cantidad ?? '100',
        precioUnitario: opts.precioUnitario ?? '10.00',
      },
    ],
  };
}

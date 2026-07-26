import { createServer, type Server, type Socket } from 'node:net';
import { AddressInfo } from 'node:net';

import { ConfigService } from '@nestjs/config';

import { SmtpAdapter } from './smtp.adapter';

/**
 * Integración a nivel de socket del `SmtpAdapter` contra un servidor SMTP falso
 * levantado EN PROCESO (puerto efímero). NO requiere infra externa: ni Postgres,
 * ni DATABASE_URL, ni un mail catcher — corre con `pnpm exec jest src/` a secas.
 *
 * Por qué existe: el adapter es la única superficie del repo que habla con
 * nodemailer, y no tenía ni un test. Un bump de nodemailer (dep de RUNTIME que
 * manda mails) se verificaba a mano una vez y nunca más. Acá el diálogo SMTP
 * real —AUTH, MAIL FROM, RCPT TO, DATA— queda congelado, así que un cambio de
 * comportamiento del cliente se ve en CI y no en producción.
 *
 * Se mockea el servidor, NUNCA nodemailer: mockear la librería que estamos
 * verificando no probaría nada del bump.
 */

interface MensajeCapturado {
  readonly mailFrom: string;
  readonly rcptTo: string[];
  readonly data: string;
}

interface ServidorSmtpFalso {
  readonly puerto: number;
  readonly mensajes: MensajeCapturado[];
  cerrar(): Promise<void>;
}

interface OpcionesServidor {
  /** Responde 550 al RCPT TO para ejercitar el camino de error. */
  readonly rechazarDestinatario?: boolean;
}

function iniciarServidorSmtpFalso(opciones: OpcionesServidor = {}): Promise<ServidorSmtpFalso> {
  const mensajes: MensajeCapturado[] = [];
  const socketsVivos = new Set<Socket>();

  const server: Server = createServer((socket) => {
    socketsVivos.add(socket);
    socket.on('close', () => socketsVivos.delete(socket));
    // Un socket a medio diálogo (el cliente aborta tras un 550) emite ECONNRESET.
    socket.on('error', () => socket.destroy());

    let pendiente = '';
    let enData = false;
    let mailFrom = '';
    let rcptTo: string[] = [];
    let cuerpo: string[] = [];

    const responder = (linea: string) => socket.write(`${linea}\r\n`);

    responder('220 localhost ESMTP servidor-falso');

    socket.on('data', (chunk) => {
      pendiente += chunk.toString('utf8');

      let corte = pendiente.indexOf('\r\n');
      while (corte !== -1) {
        const linea = pendiente.slice(0, corte);
        pendiente = pendiente.slice(corte + 2);

        if (enData) {
          if (linea === '.') {
            enData = false;
            mensajes.push({ mailFrom, rcptTo, data: cuerpo.join('\r\n') });
            mailFrom = '';
            rcptTo = [];
            cuerpo = [];
            responder('250 2.0.0 Ok: queued as FAKE-QUEUE-ID');
          } else {
            cuerpo.push(linea);
          }
          corte = pendiente.indexOf('\r\n');
          continue;
        }

        const comando = linea.toUpperCase();

        if (comando.startsWith('EHLO') || comando.startsWith('HELO')) {
          // Sin PIPELINING ni STARTTLS a propósito: mantiene el diálogo
          // comando-a-comando y en texto plano, que es lo que este test parsea.
          responder('250-localhost');
          responder('250-AUTH PLAIN');
          responder('250 8BITMIME');
        } else if (comando.startsWith('AUTH')) {
          responder('235 2.7.0 Authentication successful');
        } else if (comando.startsWith('MAIL FROM')) {
          mailFrom = linea.slice(linea.indexOf(':') + 1).trim();
          responder('250 2.1.0 Ok');
        } else if (comando.startsWith('RCPT TO')) {
          if (opciones.rechazarDestinatario === true) {
            responder('550 5.1.1 Destinatario rechazado por el servidor');
          } else {
            rcptTo.push(linea.slice(linea.indexOf(':') + 1).trim());
            responder('250 2.1.5 Ok');
          }
        } else if (comando === 'DATA') {
          enData = true;
          responder('354 End data with <CR><LF>.<CR><LF>');
        } else if (comando === 'QUIT') {
          responder('221 2.0.0 Bye');
          socket.end();
        } else if (comando === 'RSET') {
          responder('250 2.0.0 Ok');
        } else {
          responder('502 5.5.2 Comando no implementado');
        }

        corte = pendiente.indexOf('\r\n');
      }
    });
  });

  return new Promise<ServidorSmtpFalso>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        puerto: port,
        mensajes,
        cerrar: () =>
          new Promise<void>((cerrado) => {
            for (const socket of socketsVivos) socket.destroy();
            server.close(() => cerrado());
          }),
      });
    });
  });
}

function configStub(puerto: number): ConfigService {
  const valores: Record<string, unknown> = {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: puerto,
    SMTP_SECURE: false,
    SMTP_USER: 'usuario-smtp',
    SMTP_PASS: 'clave-smtp',
    SMTP_FROM: 'avicont@ejemplo.bo',
  };

  return {
    get: <T>(clave: string, porDefecto?: T): T | undefined =>
      (valores[clave] as T | undefined) ?? porDefecto,
  } as unknown as ConfigService;
}

describe('SmtpAdapter (integración SMTP real)', () => {
  let servidor: ServidorSmtpFalso;

  afterEach(async () => {
    await servidor.cerrar();
  });

  it('envía un email plano y devuelve messageId, accepted y rejected', async () => {
    servidor = await iniciarServidorSmtpFalso();
    const adapter = new SmtpAdapter(configStub(servidor.puerto));

    const resultado = await adapter.sendEmail({
      to: 'contador@ejemplo.bo',
      subject: 'Invitación a la organización',
      text: 'Te invitaron a Avicont.',
    });

    expect(resultado.messageId).toEqual(expect.any(String));
    expect(resultado.messageId.length).toBeGreaterThan(0);
    expect(resultado.accepted).toEqual(['contador@ejemplo.bo']);
    expect(resultado.rejected).toEqual([]);

    expect(servidor.mensajes).toHaveLength(1);
    const mensaje = servidor.mensajes[0]!;
    expect(mensaje.mailFrom).toBe('<avicont@ejemplo.bo>');
    expect(mensaje.rcptTo).toEqual(['<contador@ejemplo.bo>']);
    expect(mensaje.data).toContain('Te invitaron a Avicont.');
  });

  it('usa el SMTP_FROM por defecto y respeta el from explícito', async () => {
    servidor = await iniciarServidorSmtpFalso();
    const adapter = new SmtpAdapter(configStub(servidor.puerto));

    await adapter.sendEmail({
      to: 'contador@ejemplo.bo',
      subject: 'Con remitente propio',
      text: 'cuerpo',
      from: 'otro@ejemplo.bo',
      replyTo: 'responder@ejemplo.bo',
    });

    const mensaje = servidor.mensajes[0]!;
    expect(mensaje.mailFrom).toBe('<otro@ejemplo.bo>');
    expect(mensaje.data).toContain('Reply-To: responder@ejemplo.bo');
  });

  it('expande un array de destinatarios en un RCPT TO por dirección', async () => {
    servidor = await iniciarServidorSmtpFalso();
    const adapter = new SmtpAdapter(configStub(servidor.puerto));

    const resultado = await adapter.sendEmail({
      to: ['uno@ejemplo.bo', 'dos@ejemplo.bo'],
      subject: 'Varios destinatarios',
      text: 'cuerpo',
    });

    expect(servidor.mensajes[0]!.rcptTo).toEqual(['<uno@ejemplo.bo>', '<dos@ejemplo.bo>']);
    expect(resultado.accepted).toEqual(['uno@ejemplo.bo', 'dos@ejemplo.bo']);
  });

  it('adjunta contenido en memoria sin resolver rutas ni URLs remotas', async () => {
    servidor = await iniciarServidorSmtpFalso();
    const adapter = new SmtpAdapter(configStub(servidor.puerto));

    await adapter.sendEmail({
      to: 'contador@ejemplo.bo',
      subject: 'Con adjunto',
      text: 'cuerpo',
      attachments: [
        {
          filename: 'libro-diario.csv',
          content: Buffer.from('fecha,glosa\n2026-07-26,prueba\n', 'utf8'),
          contentType: 'text/csv',
        },
      ],
    });

    const { data } = servidor.mensajes[0]!;
    expect(data).toContain('libro-diario.csv');
    expect(data).toContain('text/csv');
    // El adjunto viaja en base64 dentro del cuerpo: nodemailer NO sale a la red
    // a buscarlo (el port sólo admite Buffer | string, nunca href/path).
    expect(data).toContain(
      Buffer.from('fecha,glosa\n2026-07-26,prueba\n', 'utf8').toString('base64'),
    );
  });

  it('propaga el error cuando el servidor rechaza al destinatario', async () => {
    servidor = await iniciarServidorSmtpFalso({ rechazarDestinatario: true });
    const adapter = new SmtpAdapter(configStub(servidor.puerto));

    await expect(
      adapter.sendEmail({
        to: 'rechazado@ejemplo.bo',
        subject: 'Va a fallar',
        text: 'cuerpo',
      }),
    ).rejects.toThrow();

    expect(servidor.mensajes).toHaveLength(0);
  });
});

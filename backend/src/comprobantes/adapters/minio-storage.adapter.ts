import { Readable } from 'stream';

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { StoragePort } from '../ports/storage.port';

export interface MinioStorageConfig {
  endpoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  bucket: string;
  useSsl: boolean;
}

/**
 * Adapter de StoragePort sobre MinIO usando @aws-sdk/client-s3.
 *
 * Se usa el cliente S3 de AWS apuntado al endpoint de MinIO (no el SDK de MinIO)
 * para facilitar el swap futuro a S3/R2 con solo cambiar la configuración.
 *
 * `ensureBucket` es idempotente: crea el bucket si no existe. Se invoca en
 * `OnModuleInit` para que el bucket esté listo antes del primer request.
 */
@Injectable()
export class MinioStorageAdapter implements StoragePort, OnModuleInit {
  private readonly logger = new Logger(MinioStorageAdapter.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(configOrService?: MinioStorageConfig | ConfigService) {
    // Permitir construcción directa con config (para tests de integración)
    // o via ConfigService (producción).
    if (configOrService instanceof ConfigService) {
      const config = configOrService;
      const endpoint = config.getOrThrow<string>('MINIO_ENDPOINT');
      const port = parseInt(config.getOrThrow<string>('MINIO_PORT'), 10);
      const accessKey = config.getOrThrow<string>('MINIO_ACCESS_KEY');
      const secretKey = config.getOrThrow<string>('MINIO_SECRET_KEY');
      this.bucket = config.getOrThrow<string>('MINIO_BUCKET');
      const useSsl = config.get<string>('MINIO_USE_SSL') === 'true';

      this.client = this.buildClient({ endpoint, port, accessKey, secretKey, useSsl });
    } else if (configOrService) {
      // Direct config object — útil en tests de integración.
      const cfg = configOrService;
      this.bucket = cfg.bucket;
      this.client = this.buildClient(cfg);
    } else {
      throw new Error('MinioStorageAdapter requiere ConfigService o MinioStorageConfig');
    }
  }

  private buildClient(cfg: Omit<MinioStorageConfig, 'bucket'>): S3Client {
    const protocol = cfg.useSsl ? 'https' : 'http';
    const s3Config: S3ClientConfig = {
      endpoint: `${protocol}://${cfg.endpoint}:${cfg.port}`,
      region: 'us-east-1', // MinIO acepta cualquier valor; S3 lo requiere
      credentials: {
        accessKeyId: cfg.accessKey,
        secretAccessKey: cfg.secretKey,
      },
      // Necesario para MinIO: no usa path-style por default en AWS SDK v3.
      forcePathStyle: true,
    };
    return new S3Client(s3Config);
  }

  /**
   * Crea el bucket si no existe. Idempotente.
   * Se invoca automáticamente en OnModuleInit (NestJS lifecycle).
   */
  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
  }

  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket creado: ${this.bucket}`);
    } catch (err) {
      // BucketAlreadyOwnedByYou y BucketAlreadyExists son OK — bucket ya existe.
      const name = (err as { name?: string }).name ?? '';
      if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') {
        this.logger.debug(`Bucket ya existe: ${this.bucket}`);
      } else {
        throw err;
      }
    }
  }

  async put(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ContentLength: buffer.length,
      }),
    );
  }

  async getStream(key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    if (!response.Body) {
      throw new Error(`Storage: objeto sin body para key ${key}`);
    }

    // @aws-sdk/client-s3 devuelve un SdkStream que es compatible con Readable.
    return response.Body as unknown as Readable;
  }

  async delete(key: string): Promise<void> {
    // DeleteObject es idempotente en S3/MinIO — no lanza error si no existe.
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      const name = (err as { name?: string }).name ?? '';
      // NotFound / NoSuchKey = no existe.
      if (name === 'NotFound' || name === 'NoSuchKey' || name === '404') {
        return false;
      }
      throw err;
    }
  }
}

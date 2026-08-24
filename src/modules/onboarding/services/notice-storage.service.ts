import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../../../config/env";

const configured = !!(env.R2_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
const client = configured ? new S3Client({ endpoint: env.R2_ENDPOINT, region: "auto", credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! } }) : undefined;

export function noticeStorageConfigured() {
  return configured;
}

export async function uploadNotice(storageKey: string, file: File) {
  if (!client || !env.R2_BUCKET) throw new Error("Armazenamento de editais indisponível no momento.");
  await client.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey, Body: Buffer.from(await file.arrayBuffer()), ContentType: "application/pdf" }));
}

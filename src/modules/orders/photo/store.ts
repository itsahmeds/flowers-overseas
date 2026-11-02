/**
 * Where a delivery photo is kept: the private bucket, through the storage seam (spec 011 §2 "The
 * delivery photo"; spec 006 §2.6; ADR-0015; AC-30; TASK-215).
 *
 *  - `privatePhotoStoreFrom(env)`: `R2Storage` over `r2EnvironmentFrom()` (the one reader of
 *    `R2_PRIVATE_BUCKET`, `src/lib/storage-r2.ts`), and the private bucket's name. With no
 *    `R2_PRIVATE_BUCKET` it refuses: a photo is never written to the public `R2_BUCKET`, which is
 *    served whole under `R2_PUBLIC_BASE_URL` (and `R2Storage` itself refuses any private kind in
 *    a public bucket).
 *  - `storeDeliveryPhoto(store, assetId, photo)`: one `put` to
 *    `objectKey("delivery_proof", assetId, "original")`, the checksum declared so a corrupted
 *    write is refused by the store.
 *  - `deliveryPhotoSignedUrl(store, location)`: a read URL valid for `signedUrlTtlSeconds`
 *    (300 s at most, `FloristsConfigSchema`). Never logged.
 */
import { floristsConfig } from "@/config/florists";
import { objectKey, type ObjectLocation, type Storage } from "@/lib/storage";
import {
  R2Storage,
  r2EnvironmentFrom,
  StoragePlacementError,
} from "@/lib/storage-r2";

import type { ProcessedPhoto } from "./process";

export interface PrivatePhotoStore {
  readonly storage: Storage;
  /** The private bucket the photo goes to. */
  readonly bucket: string;
}

type EnvSource = Readonly<Record<string, string | undefined>>;

/** The R2 store over the private bucket, or a refusal naming the missing key (never a value). */
export function privatePhotoStoreFrom(
  env: EnvSource = process.env,
): PrivatePhotoStore {
  const r2 = r2EnvironmentFrom(env);
  if (r2.privateBucket === undefined) {
    throw new StoragePlacementError(
      "delivery photos need R2_PRIVATE_BUCKET; refusing to write anywhere else",
    );
  }
  return { storage: new R2Storage(r2.config), bucket: r2.privateBucket };
}

/** The photo's key: `originals/delivery_proof/{assetId}`. */
export function deliveryPhotoKey(assetId: string): string {
  return objectKey("delivery_proof", assetId, "original");
}

/** Writes the processed JPEG and returns where it went. */
export async function storeDeliveryPhoto(
  store: PrivatePhotoStore,
  assetId: string,
  photo: ProcessedPhoto,
): Promise<ObjectLocation> {
  const location = {
    bucket: store.bucket,
    objectKey: deliveryPhotoKey(assetId),
  };
  await store.storage.put({
    ...location,
    body: photo.jpeg,
    mime: "image/jpeg",
    checksumSha256: photo.checksumSha256,
  });
  return location;
}

/** A signed read of the photo, for the florist's own view (at most 300 s). */
export function deliveryPhotoSignedUrl(
  store: Pick<PrivatePhotoStore, "storage">,
  location: ObjectLocation,
  ttlSeconds: number = floristsConfig.photo.signedUrlTtlSeconds,
): Promise<string> {
  return store.storage.getSignedUrl(location, ttlSeconds);
}

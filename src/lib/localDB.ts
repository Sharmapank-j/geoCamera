// src/lib/localDB.ts
import { openDB, IDBPDatabase } from 'idb';

export interface PhotoRecordLocal {
  id: string;
  blob: Blob;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  capturedAt: string; // ISO timestamp
  address?: string;
}

const DB_NAME = 'geoCameraDB';
const STORE_NAME = 'photos';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<any>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        // v1 → v2: lat/lng/accuracy made optional — no structural change needed
      },
    });
  }
  return dbPromise;
}

export async function addPhoto(record: PhotoRecordLocal): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, record);
}

export async function getAllPhotos(): Promise<PhotoRecordLocal[]> {
  const db = await getDB();
  const all: PhotoRecordLocal[] = await db.getAll(STORE_NAME);
  // Sort newest first
  return all.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
}

export async function getPhoto(id: string): Promise<PhotoRecordLocal | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, id);
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export async function clearAll(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

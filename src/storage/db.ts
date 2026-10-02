import { openDB } from 'idb'
import type { AppSettings, PhotoRecord } from '../types'
import { defaultAppSettings } from '../types'

const DB_NAME = 'geotag-camera-db'
const DB_VERSION = 1

const SETTINGS_KEY = 'app-settings'

let dbPromise: ReturnType<typeof openDB> | null = null

export const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const photoStore = db.createObjectStore('photos', { keyPath: 'id' })
        photoStore.createIndex('createdAt', 'createdAt')
        photoStore.createIndex('hasLocation', 'hasLocation')

        db.createObjectStore('settings')
        db.createObjectStore('appState')
      },
    })
  }

  return dbPromise
}

export const initDb = async () => {
  await getDb()
}

export const savePhoto = async (photo: PhotoRecord) => {
  const db = await getDb()
  await db.put('photos', photo)
}

export const getPhotos = async (): Promise<PhotoRecord[]> => {
  const db = await getDb()
  const all = await db.getAll('photos')
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const deletePhoto = async (id: string) => {
  const db = await getDb()
  await db.delete('photos', id)
}

export const clearAllData = async () => {
  const db = await getDb()
  await Promise.all([db.clear('photos'), db.clear('appState')])
}

export const getSettings = async (): Promise<AppSettings> => {
  const db = await getDb()
  const settings = await db.get('settings', SETTINGS_KEY)
  return settings ?? defaultAppSettings
}

export const saveSettings = async (settings: AppSettings) => {
  const db = await getDb()
  await db.put('settings', settings, SETTINGS_KEY)
}

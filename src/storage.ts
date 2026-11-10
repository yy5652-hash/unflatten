import type { Worksheet } from "./parse/types";
import { migrateWorksheet } from "./features/worksheet";
// One open connection, so a write starts at once and survives the page closing straight after.
let connection: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  connection ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("unflatten", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("worksheets", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      connection = undefined;
      reject(r.error);
    };
  });
  return connection;
}
async function operation<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("worksheets", mode),
      request = action(transaction.objectStore("worksheets"));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
export const saveSheet = (sheet: Worksheet) =>
  operation("readwrite", (s) => s.put(sheet));
export const getSheet = (id: string) =>
  operation<Worksheet | undefined>("readonly", (s) => s.get(id)).then((d) => d && migrateWorksheet(d));
export const listSheets = () =>
  operation<Worksheet[]>("readonly", (s) => s.getAll()).then((docs) => docs.map(migrateWorksheet));
export const deleteSheet = (id: string) =>
  operation("readwrite", (s) => s.delete(id));
export const local = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Worksheet persistence uses IndexedDB and reports failures. */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

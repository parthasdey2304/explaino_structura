import type { PdfWindowItem } from "@/components/PdfCanvasWindow";

const DATABASE = "explaino-pdf-windows";
const STORE = "windows";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export const loadPdfWindows = () => run<PdfWindowItem[]>("readonly", (store) => store.getAll());
export const savePdfWindow = (item: PdfWindowItem) => run<IDBValidKey>("readwrite", (store) => store.put(item));
export const deletePdfWindow = (id: string) => run<undefined>("readwrite", (store) => store.delete(id));

import type { OfficeWindowItem } from "./officeFiles";

async function store<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("explaino-office-windows", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("windows", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try { return await new Promise<T>((resolve, reject) => {
    const transaction = db.transaction("windows", mode); const request = action(transaction.objectStore("windows"));
    transaction.oncomplete = () => resolve(request.result); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  }); } finally { db.close(); }
}
export const loadOfficeWindows = () => store<OfficeWindowItem[]>("readonly", (items) => items.getAll());
export const saveOfficeWindow = (item: OfficeWindowItem) => store<IDBValidKey>("readwrite", (items) => items.put(item));
export const deleteOfficeWindow = (id: string) => store<undefined>("readwrite", (items) => items.delete(id));

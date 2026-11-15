import { get, set } from 'idb-keyval';

// 讀書心得：[{ id, bookId, bookTitle, bookAuthor, text, history, createdAt, updatedAt }]
export const loadNotes = () => get('notes').then((v) => v ?? []);
export const saveNotes = (notes) => set('notes', notes);

export async function addNote(note) {
  const list = await loadNotes();
  const now = Date.now();
  const item = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...note };
  await saveNotes([item, ...list]);
  return item;
}

export async function updateNote(id, patch) {
  const list = await loadNotes();
  await saveNotes(list.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)));
}

export async function deleteNote(id) {
  const list = await loadNotes();
  await saveNotes(list.filter((n) => n.id !== id));
}

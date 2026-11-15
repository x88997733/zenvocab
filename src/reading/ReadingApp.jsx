import React, { useCallback, useEffect, useState } from 'react';
import { loadBooks } from './lib/store.js';
import Shelf from './pages/Shelf.jsx';
import Reader from './pages/Reader.jsx';
import Stats from './pages/Stats.jsx';
import Notes from './pages/Notes.jsx';
import NoteFlow from './pages/NoteFlow.jsx';
import './reading.css';

export default function ReadingApp({ addEntries, toast }) {
  const [tab, setTab] = useState('shelf');
  const [books, setBooks] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [noteTarget, setNoteTarget] = useState(null); // { book, existing? }

  const refresh = useCallback(async () => {
    setBooks(await loadBooks());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openBook = books.find((b) => b.id === openId);

  if (noteTarget) {
    return (
      <div className="rd-root">
        <NoteFlow
          book={noteTarget.book}
          existing={noteTarget.existing}
          toast={toast}
          onDone={() => {
            setNoteTarget(null);
            refresh();
          }}
        />
      </div>
    );
  }

  if (openBook && !openBook.physical) {
    return (
      <div className="rd-root">
        <Reader
          book={openBook}
          addEntries={addEntries}
          toast={toast}
          onBack={() => {
            setOpenId(null);
            refresh();
          }}
          onProgress={refresh}
        />
      </div>
    );
  }

  return (
    <div className="rd-root">
      <div className="rd-seg">
        <button className={tab === 'shelf' ? 'active' : ''} onClick={() => setTab('shelf')}>
          書櫃
        </button>
        <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
          讀書心得
        </button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          閱讀統計
        </button>
      </div>
      {tab === 'shelf' && (
        <Shelf
          books={books}
          onOpen={setOpenId}
          onChanged={refresh}
          onWriteNote={(book) => setNoteTarget({ book })}
          toast={toast}
        />
      )}
      {tab === 'notes' && (
        <Notes
          onEdit={(n) =>
            setNoteTarget({ book: { id: n.bookId, title: n.bookTitle, author: n.bookAuthor }, existing: n })
          }
        />
      )}
      {tab === 'stats' && <Stats books={books} />}
    </div>
  );
}

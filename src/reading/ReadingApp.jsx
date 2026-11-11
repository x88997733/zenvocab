import React, { useCallback, useEffect, useState } from 'react';
import { loadBooks } from './lib/store.js';
import Shelf from './pages/Shelf.jsx';
import Reader from './pages/Reader.jsx';
import Stats from './pages/Stats.jsx';
import './reading.css';

export default function ReadingApp({ addEntries, toast }) {
  const [tab, setTab] = useState('shelf');
  const [books, setBooks] = useState([]);
  const [openId, setOpenId] = useState(null);

  const refresh = useCallback(async () => {
    setBooks(await loadBooks());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openBook = books.find((b) => b.id === openId);

  if (openBook) {
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
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          閱讀統計
        </button>
      </div>
      {tab === 'shelf' ? (
        <Shelf books={books} onOpen={setOpenId} onChanged={refresh} />
      ) : (
        <Stats books={books} />
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const KEY = 'wordflip.beautiful.v2';
const OLD_KEY = 'wordflip.beautiful.v1';
const blank = { theme: 'dark', direction: 'frontToBack', activeId: null, collections: [] };
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const today = () => new Date().toISOString().slice(0, 10);
const normalize = (s) => String(s || '').trim().toLowerCase();
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

function load() {
  try {
    return { ...blank, ...(JSON.parse(localStorage.getItem(KEY)) || JSON.parse(localStorage.getItem(OLD_KEY)) || {}) };
  } catch {
    return blank;
  }
}
function save(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
function levelFromXp(xp = 0) { return Math.max(1, Math.floor(xp / 120) + 1); }
function xpFor(right) { return right ? 8 : 2; }
function promptOf(word, direction) { return direction === 'backToFront' ? word.back : word.front; }
function answerOf(word, direction) { return direction === 'backToFront' ? word.front : word.back; }
function directionTitle(direction) { return direction === 'backToFront' ? 'Українська → іноземна' : 'Іноземна → українська'; }
function DirectionSwitch({ direction, setDirection }) {
  return <section className="directionSwitch">
    <p>Напрям навчання</p>
    <div>
      <button className={direction !== 'backToFront' ? 'active' : ''} onClick={() => setDirection('frontToBack')}>Іноземна → укр</button>
      <button className={direction === 'backToFront' ? 'active' : ''} onClick={() => setDirection('backToFront')}>Укр → іноземна</button>
    </div>
  </section>;
}
function collectionStats(collection) {
  const words = collection?.words || [];
  const learned = words.filter(w => (w.box || 0) >= 3).length;
  const hard = words.filter(w => (w.wrong || 0) > (w.right || 0)).length;
  const reviewed = words.reduce((s, w) => s + (w.right || 0) + (w.wrong || 0), 0);
  return { total: words.length, learned, hard, reviewed };
}
function addStats(stats = {}, right) {
  const day = today();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = stats.lastDay === day ? (stats.streak || 1) : stats.lastDay === yesterday ? (stats.streak || 0) + 1 : 1;
  const daily = { ...(stats.daily || {}) };
  daily[day] = (daily[day] || 0) + 1;
  return {
    ...stats,
    xp: (stats.xp || 0) + xpFor(right),
    correct: (stats.correct || 0) + (right ? 1 : 0),
    wrong: (stats.wrong || 0) + (right ? 0 : 1),
    rounds: stats.rounds || 0,
    streak,
    lastDay: day,
    daily
  };
}
function updateWordAfterAnswer(word, right) {
  return {
    ...word,
    box: right ? Math.min((word.box || 0) + 1, 5) : Math.max((word.box || 0) - 1, 0),
    right: (word.right || 0) + (right ? 1 : 0),
    wrong: (word.wrong || 0) + (right ? 0 : 1),
    lastReviewed: Date.now()
  };
}
function parseImport(text) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    let parts = [];
    if (line.includes(';')) parts = line.split(';');
    else if (line.includes('\t')) parts = line.split('\t');
    else if (line.includes(' - ')) parts = line.split(/\s+-\s+/);
    else parts = line.split(',');
    const [front, back, note = '', tag = ''] = parts.map(x => (x || '').trim());
    return front && back ? { id: uid(), front, back, note, tag, box: 0, right: 0, wrong: 0, createdAt: Date.now() } : null;
  }).filter(Boolean);
}

function App() {
  const [data, setData] = useState(load);
  const [screen, setScreen] = useState('home');
  const [toast, setToast] = useState(null);
  const active = data.collections.find(c => c.id === data.activeId) || data.collections[0] || null;

  useEffect(() => save(data), [data]);
  useEffect(() => { document.documentElement.dataset.theme = data.theme; }, [data.theme]);
  useEffect(() => {
    if (!data.activeId && data.collections[0]) setData(d => ({ ...d, activeId: d.collections[0].id }));
  }, [data.activeId, data.collections.length]);

  const notify = (text, type = 'ok') => {
    setToast({ text, type });
    clearTimeout(notify.t);
    notify.t = setTimeout(() => setToast(null), 1600);
  };
  const updateCollection = (id, fn) => setData(d => ({ ...d, collections: d.collections.map(c => c.id === id ? fn(c) : c) }));
  const recordAnswer = (collectionId, wordId, right, updateWord = true) => {
    updateCollection(collectionId, c => ({
      ...c,
      stats: addStats(c.stats, right),
      words: updateWord ? c.words.map(w => w.id === wordId ? updateWordAfterAnswer(w, right) : w) : c.words
    }));
  };
  const finishRound = (collectionId) => updateCollection(collectionId, c => ({ ...c, stats: { ...(c.stats || {}), rounds: (c.stats?.rounds || 0) + 1 } }));

  return <div className="shell">
    {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}
    <Header data={data} setData={setData} />
    <main className="content">
      {screen === 'home' && <Home data={data} setData={setData} active={active} setScreen={setScreen} />}
      {screen === 'library' && <Library data={data} setData={setData} active={active} updateCollection={updateCollection} notify={notify} />}
      {screen === 'cards' && <Cards active={active} direction={data.direction || 'frontToBack'} setDirection={(direction) => setData(d => ({ ...d, direction }))} recordAnswer={recordAnswer} finishRound={finishRound} notify={notify} />}
      {screen === 'games' && <Games active={active} direction={data.direction || 'frontToBack'} setDirection={(direction) => setData(d => ({ ...d, direction }))} recordAnswer={recordAnswer} finishRound={finishRound} notify={notify} />}
      {screen === 'progress' && <Progress data={data} active={active} />}
    </main>
    <BottomNav screen={screen} setScreen={setScreen} />
  </div>;
}

function Header({ data, setData }) {
  return <header className="appHeader">
    <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      <span className="brandIcon">✦</span>
      <span><strong>WordFlip</strong></span>
    </button>
    <button className="roundBtn" onClick={() => setData(d => ({ ...d, theme: d.theme === 'dark' ? 'light' : 'dark' }))}>{data.theme === 'dark' ? '☀️' : '🌙'}</button>
  </header>;
}
function BottomNav({ screen, setScreen }) {
  const items = [['home','⌂','Головна'], ['library','＋','Слова'], ['cards','◫','Картки'], ['games','◆','Ігри'], ['progress','↗','Прогрес']];
  return <nav className="tabbar">{items.map(([id, icon, label]) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => setScreen(id)}><b>{icon}</b><span>{label}</span></button>)}</nav>;
}
function Empty({ title, text, action }) {
  return <section className="empty"><div className="emptyBubble">✦</div><h2>{title}</h2><p>{text}</p>{action}</section>;
}

function Home({ data, setData, active, setScreen }) {
  const [name, setName] = useState('');
  const totals = data.collections.reduce((acc, c) => {
    const s = collectionStats(c);
    acc.words += s.total; acc.learned += s.learned; acc.xp += c.stats?.xp || 0; acc.today += c.stats?.daily?.[today()] || 0; acc.streak = Math.max(acc.streak, c.stats?.streak || 0);
    return acc;
  }, { words: 0, learned: 0, xp: 0, today: 0, streak: 0 });
  const level = levelFromXp(totals.xp);
  const target = 20;
  const targetPct = Math.min(100, Math.round((totals.today / target) * 100));
  const activeStats = collectionStats(active);
  const create = () => {
    const value = name.trim();
    if (!value) return;
    const collection = { id: uid(), name: value, createdAt: Date.now(), stats: {}, words: [] };
    setData(d => ({ ...d, activeId: collection.id, collections: [collection, ...d.collections] }));
    setName(''); setScreen('library');
  };

  return <>
    <section className="dashboardHero">
      <div>
        <p className="label">головний екран</p>
        <h1>Продовжити навчання</h1>
        <p>{active ? `${active.name}: ${activeStats.total} слів, ${activeStats.learned} вивчено` : 'Створи першу колекцію, щоб почати навчання.'}</p>
        <div className="heroActions">
          <button onClick={() => setScreen(active ? 'cards' : 'library')}>{active ? 'Продовжити' : 'Додати слова'}</button>
          <button className="ghost" onClick={() => setScreen('games')}>Ігри</button>
        </div>
      </div>
      <div className="levelBadge"><span>Рівень</span><strong>{level}</strong></div>
    </section>

    <section className="goalCard">
      <div className="goalHeader"><div><p className="label">сьогоднішня ціль</p><h2>{totals.today}/{target} відповідей</h2></div><strong>{targetPct}%</strong></div>
      <div className="progressBar"><i style={{ width: `${targetPct}%` }} /></div>
    </section>

    <section className="quickStats">
      <article><strong>{totals.streak}</strong><span>серія днів</span></article>
      <article><strong>{totals.learned}</strong><span>вивчено</span></article>
      <article><strong>{totals.xp}</strong><span>XP</span></article>
    </section>

    <section className="card block">
      <h2>Нова колекція</h2>
      <div className="inlineForm"><input value={name} onChange={e => setName(e.target.value)} placeholder="Назва колекції" /><button onClick={create}>Створити</button></div>
    </section>

    <section className="collectionGrid">
      {data.collections.map(c => <button className={`collectionCard ${active?.id === c.id ? 'selected' : ''}`} key={c.id} onClick={() => { setData(d => ({ ...d, activeId: c.id })); setScreen('library'); }}>
        <span className="deckIcon">▣</span><span><strong>{c.name}</strong><small>{c.words.length} слів · {c.stats?.xp || 0} XP</small></span>
      </button>)}
    </section>
    {!data.collections.length && <Empty title="Колекцій ще немає" text="Створи колекцію для будь-якої мови та додай власні слова." />}
  </>;
}

function Library({ data, setData, active, updateCollection, notify }) {
  const [word, setWord] = useState({ front: '', back: '', note: '', tag: '' });
  const [bulk, setBulk] = useState('');
  const [q, setQ] = useState('');
  if (!active) return <Empty title="Спочатку створи колекцію" text="Після цього тут зʼявиться додавання слів та імпорт файлів." />;

  const addOne = () => {
    const front = word.front.trim(), back = word.back.trim();
    if (!front || !back) return notify('Заповни слово і переклад', 'bad');
    const item = { id: uid(), front, back, note: word.note.trim(), tag: word.tag.trim(), box: 0, right: 0, wrong: 0, createdAt: Date.now() };
    updateCollection(active.id, c => ({ ...c, words: [item, ...c.words] }));
    setWord({ front: '', back: '', note: '', tag: '' });
    notify('Слово додано');
  };
  const importText = () => {
    const items = parseImport(bulk);
    if (!items.length) return notify('Не знайдено слів для імпорту', 'bad');
    updateCollection(active.id, c => ({ ...c, words: [...items, ...c.words] }));
    setBulk(''); notify(`Імпортовано: ${items.length}`);
  };
  const onFile = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => setBulk(String(ev.target.result || '')); r.readAsText(f);
  };
  const exportWords = () => {
    const text = active.words.map(w => [w.front, w.back, w.note, w.tag].join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `${active.name}.txt`;
    a.click();
  };
  const remove = id => updateCollection(active.id, c => ({ ...c, words: c.words.filter(w => w.id !== id) }));
  const filtered = active.words.filter(w => normalize(`${w.front} ${w.back} ${w.note} ${w.tag}`).includes(normalize(q)));

  return <>
    <section className="pageTitle"><div><p className="label">активна колекція</p><h1>{active.name}</h1></div><button className="danger ghost" onClick={() => { if (confirm('Видалити колекцію?')) setData(d => ({ ...d, activeId: d.collections.find(c => c.id !== active.id)?.id || null, collections: d.collections.filter(c => c.id !== active.id) })); }}>Видалити</button></section>
    <section className="card block"><h2>Додати слово</h2><div className="formGrid"><input value={word.front} onChange={e => setWord({ ...word, front: e.target.value })} placeholder="Слово" /><input value={word.back} onChange={e => setWord({ ...word, back: e.target.value })} placeholder="Переклад" /><input value={word.note} onChange={e => setWord({ ...word, note: e.target.value })} placeholder="Підказка або речення" /><input value={word.tag} onChange={e => setWord({ ...word, tag: e.target.value })} placeholder="Тег" /></div><button className="primaryWide" onClick={addOne}>Додати слово</button></section>
    <section className="card block"><h2>Імпорт слів</h2><textarea value={bulk} onChange={e => setBulk(e.target.value)} placeholder="Встав слова з текстового або CSV-файлу" /><div className="actions"><label className="fileBtn"><input type="file" accept=".txt,.csv" onChange={onFile} />Обрати файл</label><button onClick={importText}>Імпортувати</button><button className="ghost" onClick={exportWords}>Експорт</button></div></section>
    <section className="card block"><div className="searchBox"><span>⌕</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Пошук у колекції" /></div><div className="wordList">{filtered.map(w => <article className="wordRow" key={w.id}><div><strong>{w.front}</strong><span>{w.back}</span>{w.note && <small>{w.note}</small>}</div>{w.tag && <em>{w.tag}</em>}<button onClick={() => remove(w.id)}>×</button></article>)}</div></section>
  </>;
}

function buildRound(words, limit = null) {
  const list = shuffle(words || []);
  return (limit ? list.slice(0, limit) : list).map(w => w.id);
}
function useRound(collection, limit = null) {
  const [queue, setQueue] = useState(() => collection ? buildRound(collection.words, limit) : []);
  const [reviewed, setReviewed] = useState(0);
  const [learned, setLearned] = useState(0);
  useEffect(() => { setQueue(collection ? buildRound(collection.words, limit) : []); setReviewed(0); setLearned(0); }, [collection?.id, collection?.words.length, limit]);
  const current = collection?.words.find(w => w.id === queue[0]);
  const answer = (right) => {
    if (!current) return;
    setQueue(q => {
      const rest = q.slice(1);
      if (right) return rest;
      const place = Math.min(4, rest.length);
      return [...rest.slice(0, place), current.id, ...rest.slice(place)];
    });
    setReviewed(r => r + 1);
    if (right) setLearned(v => v + 1);
  };
  const reset = () => { setQueue(buildRound(collection.words, limit)); setReviewed(0); setLearned(0); };
  return { current, reviewed, learned, total: limit ? Math.min(limit, collection?.words.length || 0) : (collection?.words.length || 0), answer, reset, finished: !current };
}
function FinishScreen({ title = 'Раунд завершено', result, accuracy, learned, onRepeat, onNext, onFinish }) {
  useEffect(() => { onFinish?.(); }, []);
  return <section className="finish">
    <div className="confetti"><span>🎉</span><i /><i /><i /><i /></div>
    <h1>{title}</h1>
    <div className="resultGrid"><article><strong>{result}</strong><span>результат</span></article><article><strong>{accuracy}%</strong><span>точність</span></article><article><strong>{learned}</strong><span>вивчено</span></article></div>
    <div className="finishActions"><button onClick={onRepeat}>Повторити</button>{onNext && <button className="ghost" onClick={onNext}>Наступний раунд</button>}</div>
  </section>;
}

function Cards({ active, direction, setDirection, recordAnswer, finishRound, notify }) {
  const round = useRound(active);
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState(0);
  const [result, setResult] = useState({ right: 0, wrong: 0 });
  const startX = useRef(0);
  useEffect(() => { setFlipped(false); setDrag(0); setResult({ right: 0, wrong: 0 }); }, [active?.id, active?.words.length]);
  if (!active || active.words.length < 1) return <Empty title="Немає слів для карток" text="Додай слова в колекцію, щоб почати свайп-тренування." />;
  const mark = (right) => {
    if (!round.current) return;
    recordAnswer(active.id, round.current.id, right, true);
    setResult(r => ({ right: r.right + (right ? 1 : 0), wrong: r.wrong + (right ? 0 : 1) }));
    notify(right ? 'Знаю — слово прибрано з цього кола' : 'Не знав — слово повернеться ще раз', right ? 'ok' : 'bad');
    setFlipped(false); setDrag(0); round.answer(right);
  };
  if (round.finished) {
    const attempts = result.right + result.wrong;
    return <FinishScreen onFinish={() => finishRound(active.id)} result={`${result.right}/${attempts || round.total}`} accuracy={attempts ? Math.round(result.right / attempts * 100) : 100} learned={result.right} onRepeat={() => { setResult({ right: 0, wrong: 0 }); round.reset(); }} onNext={() => { setResult({ right: 0, wrong: 0 }); round.reset(); }} />;
  }
  const progressPct = Math.min(100, Math.round((round.reviewed / Math.max(round.total, 1)) * 100));
  const difficulty = (round.current.wrong || 0) > (round.current.right || 0) ? 'складне' : (round.current.box || 0) >= 3 ? 'знайоме' : 'нове';
  return <>
    <section className="lessonTop"><div><p className="label">свайп вправо — знаю · вліво — повторити</p><h1>Картки</h1></div><strong>{round.reviewed}/{round.total}</strong></section>
    <DirectionSwitch direction={direction} setDirection={setDirection} />
    <div className="progressBar"><i style={{ width: `${progressPct}%` }} /></div>
    <section className={`swipeCard ${flipped ? 'flip' : ''}`} style={{ transform: `translateX(${drag}px) rotate(${drag / 18}deg)` }} onClick={() => setFlipped(v => !v)} onTouchStart={e => startX.current = e.touches[0].clientX} onTouchMove={e => setDrag(e.touches[0].clientX - startX.current)} onTouchEnd={() => Math.abs(drag) > 90 ? mark(drag > 0) : setDrag(0)}>
      <div className="difficultyBadge">{difficulty}</div>
      {drag < -30 && <div className="swipeHint left">Ще раз</div>}
      {drag > 30 && <div className="swipeHint right">Знаю</div>}
      <div className="cardFace front"><h2>{promptOf(round.current, direction)}</h2><span>торкнись, щоб побачити відповідь</span></div>
      <div className="cardFace back"><h2>{answerOf(round.current, direction)}</h2>{round.current.note && <p>{round.current.note}</p>}</div>
    </section>
    <div className="answerDock"><button className="bad" onClick={() => mark(false)}>Не знав</button><button className="good" onClick={() => mark(true)}>Знав</button></div>
  </>;
}

const modes = [
  { id: 'quiz', icon: '✓', title: 'Quiz', desc: 'Обери правильний переклад із варіантів.' },
  { id: 'write', icon: '✎', title: 'Write', desc: 'Введи переклад самостійно.' },
  { id: 'match', icon: '◇', title: 'Match', desc: 'Знайди пари слово ↔ переклад.' },
  { id: 'sprint', icon: '⚡', title: 'Sprint', desc: '10 швидких питань на реакцію.' }
];
function Games({ active, direction, setDirection, recordAnswer, finishRound, notify }) {
  const [mode, setMode] = useState('quiz');
  if (!active || active.words.length < 2) return <Empty title="Для ігор потрібно мінімум 2 слова" text="Додай ще слова, щоб зʼявилися тести, пари та спринт." />;
  return <div className="gamesWrap">
    <DirectionSwitch direction={direction} setDirection={setDirection} />
    <section className="modeGrid">{modes.map(m => <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id === 'flashcards' ? 'quiz' : m.id)}><b>{m.icon}</b><span><strong>{m.title}</strong><small>{m.desc}</small></span></button>)}</section>
    {mode === 'quiz' && <Quiz active={active} direction={direction} recordAnswer={recordAnswer} finishRound={finishRound} notify={notify} />}
    {mode === 'write' && <WriteGame active={active} direction={direction} recordAnswer={recordAnswer} finishRound={finishRound} notify={notify} />}
    {mode === 'match' && <MatchGame active={active} direction={direction} finishRound={finishRound} notify={notify} />}
    {mode === 'sprint' && <Sprint active={active} direction={direction} recordAnswer={recordAnswer} finishRound={finishRound} notify={notify} />}
  </div>;
}
function Quiz({ active, direction, recordAnswer, finishRound, notify }) {
  const r = useRound(active, Math.min(10, active.words.length));
  const [res, setRes] = useState({ right: 0, wrong: 0 });
  const options = useMemo(() => r.current ? shuffle([answerOf(r.current, direction), ...shuffle(active.words.filter(w => w.id !== r.current.id)).slice(0, 3).map(w => answerOf(w, direction))]) : [], [r.current?.id, active.words, direction]);
  if (r.finished) {
    const attempts = res.right + res.wrong;
    return <FinishScreen onFinish={() => finishRound(active.id)} result={`${res.right}/${attempts}`} accuracy={attempts ? Math.round(res.right / attempts * 100) : 0} learned={res.right} onRepeat={() => { setRes({ right: 0, wrong: 0 }); r.reset(); }} onNext={() => { setRes({ right: 0, wrong: 0 }); r.reset(); }} />;
  }
  const choose = (answer) => { const ok = answer === answerOf(r.current, direction); recordAnswer(active.id, r.current.id, ok, true); setRes(s => ({ right: s.right + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) })); notify(ok ? 'Правильно!' : `Неправильно. Правильно: ${answerOf(r.current, direction)}`, ok ? 'ok' : 'bad'); r.answer(ok); };
  return <section className="gamePanel"><div className="miniProgress">{r.reviewed}/{r.total} · {directionTitle(direction)}</div><h1>{promptOf(r.current, direction)}</h1><div className="answers">{options.map(o => <button key={o} onClick={() => choose(o)}>{o}</button>)}</div></section>;
}
function WriteGame({ active, direction, recordAnswer, finishRound, notify }) {
  const r = useRound(active, Math.min(10, active.words.length));
  const [text, setText] = useState('');
  const [res, setRes] = useState({ right: 0, wrong: 0 });
  if (r.finished) {
    const attempts = res.right + res.wrong;
    return <FinishScreen onFinish={() => finishRound(active.id)} result={`${res.right}/${attempts}`} accuracy={attempts ? Math.round(res.right / attempts * 100) : 0} learned={res.right} onRepeat={() => { setRes({ right: 0, wrong: 0 }); r.reset(); }} onNext={() => { setRes({ right: 0, wrong: 0 }); r.reset(); }} />;
  }
  const check = () => { const ok = normalize(text) === normalize(answerOf(r.current, direction)); recordAnswer(active.id, r.current.id, ok, true); setRes(s => ({ right: s.right + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) })); notify(ok ? 'Правильно!' : `Неправильно. Правильно: ${answerOf(r.current, direction)}`, ok ? 'ok' : 'bad'); setText(''); r.answer(ok); };
  return <section className="gamePanel"><div className="miniProgress">{r.reviewed}/{r.total} · {directionTitle(direction)}</div><h1>{promptOf(r.current, direction)}</h1><input className="bigInput" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && check()} placeholder="Введи відповідь" /><button className="primaryWide" onClick={check}>Перевірити</button></section>;
}
function MatchGame({ active, direction, finishRound, notify }) {
  const ROUND_SIZE = 6;
  const wordsSignature = active.words.map(w => `${w.id}:${w.front}:${w.back}`).join('|');
  const cleanWords = useMemo(() => {
    const seenPairs = new Set();
    const usedFronts = new Set();
    const usedBacks = new Set();
    return active.words.filter(w => {
      const front = String(w.front || '').trim();
      const back = String(w.back || '').trim();
      const pairKey = `${front.toLowerCase()}|${back.toLowerCase()}`;
      const frontKey = front.toLowerCase();
      const backKey = back.toLowerCase();
      if (!front || !back) return false;
      if (seenPairs.has(pairKey) || usedFronts.has(frontKey) || usedBacks.has(backKey)) return false;
      seenPairs.add(pairKey);
      usedFronts.add(frontKey);
      usedBacks.add(backKey);
      return true;
    });
  }, [wordsSignature]);

  const [remainingIds, setRemainingIds] = useState(() => shuffle(cleanWords.map(w => w.id)));
  const [roundIds, setRoundIds] = useState([]);
  const [roundSeed, setRoundSeed] = useState(0);
  const [open, setOpen] = useState([]);
  const [done, setDone] = useState([]);
  const [mistakes, setMistakes] = useState(0);

  const startNewRound = (forceSame = false) => {
    setOpen([]);
    setDone([]);
    setMistakes(0);
    setRoundSeed(s => s + 1);

    if (forceSame && roundIds.length) return;

    const ids = cleanWords.map(w => w.id);
    let pool = remainingIds.filter(id => ids.includes(id));
    const needed = Math.min(ROUND_SIZE, cleanWords.length);

    if (pool.length < needed) {
      const previous = new Set(roundIds);
      const fresh = ids.filter(id => !previous.has(id));
      pool = shuffle(fresh.length >= needed ? fresh : ids);
    }

    const nextIds = pool.slice(0, needed);
    setRoundIds(nextIds);
    setRemainingIds(pool.slice(needed));
  };

  useEffect(() => {
    const ids = shuffle(cleanWords.map(w => w.id));
    const size = Math.min(ROUND_SIZE, cleanWords.length);
    setRoundIds(ids.slice(0, size));
    setRemainingIds(ids.slice(size));
    setOpen([]);
    setDone([]);
    setMistakes(0);
    setRoundSeed(s => s + 1);
  }, [active.id, wordsSignature, cleanWords.length, direction]);

  const cards = useMemo(() => {
    const map = new Map(cleanWords.map(w => [w.id, w]));
    const sample = roundIds.map(id => map.get(id)).filter(Boolean);
    return shuffle(sample.flatMap(w => [
      { id: `${w.id}-prompt-${roundSeed}`, pair: w.id, text: promptOf(w, direction), side: 'prompt' },
      { id: `${w.id}-answer-${roundSeed}`, pair: w.id, text: answerOf(w, direction), side: 'answer' }
    ]));
  }, [cleanWords, roundIds.join('|'), roundSeed, direction]);

  const totalPairs = roundIds.length;
  const complete = done.length === totalPairs && totalPairs > 0;
  if (complete) {
    const accuracy = Math.max(0, Math.round((totalPairs / Math.max(totalPairs + mistakes, 1)) * 100));
    return <FinishScreen
      onFinish={() => finishRound(active.id)}
      result={`${done.length}/${totalPairs}`}
      accuracy={accuracy}
      learned={done.length}
      onRepeat={() => startNewRound(true)}
      onNext={() => startNewRound(false)}
    />;
  }

  const pick = c => {
    if (done.includes(c.pair) || open.find(x => x.id === c.id)) return;
    if (open.length === 1 && open[0].side === c.side) {
      setOpen([c]);
      return;
    }
    const next = [...open, c];
    if (next.length === 2) {
      if (next[0].pair === next[1].pair) {
        setDone(d => [...d, c.pair]);
        setOpen([]);
        notify('Пара знайдена!', 'ok');
      } else {
        setMistakes(m => m + 1);
        notify('Це не пара', 'bad');
        setOpen(next);
        setTimeout(() => setOpen([]), 650);
      }
    } else {
      setOpen(next);
    }
  };

  const isRevealed = c => open.find(x => x.id === c.id) || done.includes(c.pair);
  return <section className="gamePanel matchPanel">
    <div className="miniProgress">Пари: {done.length}/{totalPairs} · {directionTitle(direction)}</div>
    {totalPairs < 2 && <p className="hintText">Для гри потрібно мінімум 2 різні пари слів без однакових перекладів.</p>}
    {totalPairs >= 2 && <p className="hintText">Відкривай по дві плитки. У наступному раунді будуть інші слова, поки не пройде вся колекція.</p>}
    <div className="matchMemoryGrid">
      {cards.map(c => <button key={c.id} className={isRevealed(c) ? `open ${done.includes(c.pair) ? 'done' : ''}` : ''} onClick={() => pick(c)}>
        <span>{isRevealed(c) ? c.text : '✦'}</span>
      </button>)}
    </div>
  </section>;
}
function Sprint({ active, direction, recordAnswer, finishRound, notify }) {
  const order = useMemo(() => shuffle(active.words).slice(0, Math.min(10, active.words.length)), [active.id, active.words.length]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState(0);
  useEffect(() => { setIndex(0); setScore(0); setWrong(0); }, [active.id, active.words.length]);
  const current = order[index];
  const displayed = useMemo(() => {
    if (!current) return '';
    const falseOption = active.words.filter(w => w.id !== current.id).map(w => answerOf(w, direction)).filter(Boolean).sort(() => Math.random() - 0.5)[0] || answerOf(current, direction);
    return Math.random() > .5 ? answerOf(current, direction) : falseOption;
  }, [index, current?.id]);
  if (!current) {
    const attempts = score + wrong;
    return <FinishScreen onFinish={() => finishRound(active.id)} result={`${score}/${attempts}`} accuracy={attempts ? Math.round(score / attempts * 100) : 0} learned={score} onRepeat={() => { setIndex(0); setScore(0); setWrong(0); }} onNext={() => { setIndex(0); setScore(0); setWrong(0); }} />;
  }
  const answer = (yes) => {
    const ok = (displayed === answerOf(current, direction)) === yes;
    recordAnswer(active.id, current.id, ok, true);
    setScore(s => s + (ok ? 1 : 0));
    setWrong(w => w + (ok ? 0 : 1));
    notify(ok ? 'Правильно!' : 'Неправильно', ok ? 'ok' : 'bad');
    setIndex(i => i + 1);
  };
  return <section className="gamePanel"><div className="miniProgress">Питання: {index + 1}/{order.length} · Рахунок: {score}</div><h1>{promptOf(current, direction)}</h1><div className="translationCard">{displayed}</div><p className="hintText">Чи правильний це переклад?</p><div className="answerDock"><button className="bad" onClick={() => answer(false)}>Ні</button><button className="good" onClick={() => answer(true)}>Так</button></div></section>;
}
function Progress({ data, active }) {
  const collections = data.collections;
  const totalWords = collections.reduce((s, c) => s + c.words.length, 0);
  const totalXp = collections.reduce((s, c) => s + (c.stats?.xp || 0), 0);
  const known = collections.reduce((s, c) => s + c.words.filter(w => (w.box || 0) >= 3).length, 0);
  const accuracyTotal = collections.reduce((s, c) => s + (c.stats?.correct || 0) + (c.stats?.wrong || 0), 0);
  const correctTotal = collections.reduce((s, c) => s + (c.stats?.correct || 0), 0);
  return <>
    <section className="pageTitle"><div><p className="label">твій прогрес</p><h1>Статистика</h1></div></section>
    <section className="quickStats big"><article><strong>{totalXp}</strong><span>XP</span></article><article><strong>{known}</strong><span>закріплено</span></article><article><strong>{accuracyTotal ? Math.round(correctTotal / accuracyTotal * 100) : 0}%</strong><span>точність</span></article></section>
    {active && <section className="card block"><h2>{active.name}</h2><div className="mastery">{active.words.map(w => <div key={w.id}><span>{w.front}<small>{(w.right || 0) + (w.wrong || 0)} повторень</small></span><i><b style={{ width: `${Math.min((w.box || 0) * 20, 100)}%` }} /></i></div>)}</div></section>}
    {!totalWords && <Empty title="Прогресу ще немає" text="Додай слова й пройди перший раунд." />}
  </>;
}

createRoot(document.getElementById('root')).render(<App />);

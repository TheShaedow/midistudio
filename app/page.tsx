'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Note = { id: number; pitch: number; start: number; duration: number; velocity: number };
type Sound = 'piano' | 'pad';
type KeyName = 'C' | 'G' | 'D' | 'A' | 'E' | 'F' | 'Bb' | 'Eb';
const PPQ = 96, TOTAL_BEATS = 16;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const KEYS: Record<KeyName, { label: string; fifths: number }> = {
  C: { label: 'C-Dur', fifths: 0 }, G: { label: 'G-Dur', fifths: 1 }, D: { label: 'D-Dur', fifths: 2 },
  A: { label: 'A-Dur', fifths: 3 }, E: { label: 'E-Dur', fifths: 4 }, F: { label: 'F-Dur', fifths: -1 },
  Bb: { label: 'B♭-Dur', fifths: -2 }, Eb: { label: 'E♭-Dur', fifths: -3 },
};
const SHARP_SPELLING = [['C',''],['C','♯'],['D',''],['D','♯'],['E',''],['F',''],['F','♯'],['G',''],['G','♯'],['A',''],['A','♯'],['B','']] as const;
const FLAT_SPELLING = [['C',''],['D','♭'],['D',''],['E','♭'],['E',''],['F',''],['G','♭'],['G',''],['A','♭'],['A',''],['B','♭'],['B','']] as const;
const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const SHARP_ORDER = ['F','C','G','D','A','E','B'], FLAT_ORDER = ['B','E','A','D','G','C','F'];
const initialNotes: Note[] = [
  { id: 1, pitch: 60, start: 0, duration: 1, velocity: 92 }, { id: 2, pitch: 64, start: 1, duration: 1, velocity: 105 },
  { id: 3, pitch: 67, start: 2, duration: 1, velocity: 86 }, { id: 4, pitch: 72, start: 3, duration: 2, velocity: 112 },
  { id: 5, pitch: 55, start: 5, duration: 1, velocity: 78 }, { id: 6, pitch: 59, start: 6, duration: 1, velocity: 96 },
  { id: 7, pitch: 62, start: 7, duration: 1, velocity: 88 }, { id: 8, pitch: 67, start: 8, duration: 2, velocity: 104 },
];
function pitchName(p: number) { return `${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 1}`; }
function spelledNote(p: number, key: KeyName) {
  const fifths = KEYS[key].fifths, [letter, accidental] = (fifths < 0 ? FLAT_SPELLING : SHARP_SPELLING)[p % 12];
  const altered = fifths > 0 ? SHARP_ORDER.slice(0, fifths) : FLAT_ORDER.slice(0, -fifths);
  const expected = altered.includes(letter) ? (fifths > 0 ? '♯' : '♭') : '';
  return { letter, accidental: accidental === expected ? '' : accidental || (expected ? '♮' : '') };
}
function diatonicIndex(p: number, key: KeyName) { return (Math.floor(p / 12) - 1) * 7 + LETTER_INDEX[spelledNote(p, key).letter]; }
function scoreY(p: number, key: KeyName) {
  // Treble: bottom line E4 = 84px. Bass: bottom line G2 = 177px.
  return p >= 60 ? 84 - (diatonicIndex(p, key) - 30) * 6.5 : 177 - (diatonicIndex(p, key) - 18) * 6.5;
}
function ledgerLines(p: number, key: KeyName) {
  const y = scoreY(p, key), lines: number[] = [], top = p >= 60 ? 32 : 125, bottom = p >= 60 ? 84 : 177;
  if (y >= bottom + 10) for (let line = bottom + 13; line <= y + 1; line += 13) lines.push(line);
  if (y <= top - 10) for (let line = top - 13; line >= y - 1; line -= 13) lines.push(line);
  return lines;
}
function quantizeStep(v: string) { return v === '1/4' ? 1 : v === '1/8' ? .5 : v === '1/8T' ? 1 / 3 : v === '1/16' ? .25 : v === '1/16T' ? 1 / 6 : v === '1/32T' ? 1 / 12 : .125; }
function writeVar(value: number) { const bytes = [value & 0x7f]; while ((value >>= 7)) bytes.unshift((value & 0x7f) | 0x80); return bytes; }

export default function Home() {
  const [notes, setNotes] = useState<Note[]>(initialNotes), [bpm, setBpm] = useState(112), [quantize, setQuantize] = useState('1/8');
  const [sound, setSound] = useState<Sound>('piano'), [recording, setRecording] = useState(false), [playing, setPlaying] = useState(false);
  const [keyName, setKeyName] = useState<KeyName>('C');
  const [metronome, setMetronome] = useState(true), [status, setStatus] = useState('MIDI verbinden'), [position, setPosition] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null), timersRef = useRef<number[]>([]);
  const activeRef = useRef(new Map<number, { start: number; velocity: number }>()), recordStartRef = useRef(0), recordingRef = useRef(false), nextId = useRef(20);
  const getAudio = useCallback(() => { if (!audioRef.current) audioRef.current = new AudioContext(); void audioRef.current.resume(); return audioRef.current; }, []);
  const playTone = useCallback((pitch: number, velocity = 96, duration = .5, at?: number) => {
    const ctx = getAudio(), start = at ?? ctx.currentTime, gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = sound === 'piano' ? 4800 : 1350;
    gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime((velocity / 127) * .09, start + (sound === 'piano' ? .008 : .18));
    const release = sound === 'piano' ? 1.6 : 3.5;
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration + release); gain.connect(filter).connect(ctx.destination);
    const fre = 440 * Math.pow(2, (pitch - 69) / 12), waves: [number, OscillatorType][] = sound === 'piano' ? [[1, 'triangle'], [2, 'sine'], [3, 'sine']] : [[1, 'sawtooth'], [1.005, 'sawtooth']];
    waves.forEach(([ratio, type], i) => { const osc = ctx.createOscillator(), local = ctx.createGain(); osc.type = type; osc.frequency.value = fre * ratio; local.gain.value = sound === 'piano' ? 1 / (i + 1.5) : .18; osc.connect(local).connect(gain); osc.start(start); osc.stop(start + duration + release + .2); });
  }, [getAudio, sound]);
  const tick = useCallback((accent = false, at?: number) => { const ctx = getAudio(), start = at ?? ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain(); osc.frequency.value = accent ? 1320 : 920; gain.gain.setValueAtTime(.12, start); gain.gain.exponentialRampToValueAtTime(.0001, start + .04); osc.connect(gain).connect(ctx.destination); osc.start(start); osc.stop(start + .05); }, [getAudio]);
  const stop = useCallback(() => { timersRef.current.forEach(window.clearTimeout); timersRef.current = []; recordingRef.current = false; activeRef.current.clear(); setPlaying(false); setRecording(false); setPosition(0); }, []);
  const startPlayback = useCallback(() => {
    stop(); setPlaying(true); const ctx = getAudio(), beatSeconds = 60 / bpm, origin = ctx.currentTime + .08;
    const playbackBeats = Math.max(TOTAL_BEATS, Math.ceil(Math.max(0, ...notes.map(n => n.start + n.duration)) / 4) * 4);
    notes.forEach(n => playTone(n.pitch, n.velocity, n.duration * beatSeconds, origin + n.start * beatSeconds));
    if (metronome) for (let beat = 0; beat < playbackBeats; beat++) tick(beat % 4 === 0, origin + beat * beatSeconds);
    const started = performance.now() + 80; const update = () => { const beat = (performance.now() - started) / 1000 / beatSeconds; setPosition(Math.min(playbackBeats, Math.max(0, beat))); if (beat < playbackBeats) timersRef.current.push(window.setTimeout(update, 30)); else stop(); }; update();
  }, [bpm, getAudio, metronome, notes, playTone, stop, tick]);
  const startRecording = useCallback(() => { stop(); getAudio(); setStatus('2 Takte Preroll'); const beatMs = 60000 / bpm; for (let i = 0; i < 8; i++) timersRef.current.push(window.setTimeout(() => tick(i % 4 === 0), i * beatMs)); timersRef.current.push(window.setTimeout(() => {
    recordStartRef.current = performance.now(); recordingRef.current = true; activeRef.current.clear(); setPosition(0); setRecording(true); setPlaying(true); setStatus('Aufnahme läuft • Stopp zum Beenden');
    let beat = 0; const recordBeat = () => { if (metronome) tick(beat % 4 === 0); setPosition(beat); beat += 1; timersRef.current.push(window.setTimeout(recordBeat, beatMs)); }; recordBeat();
  }, beatMs * 8)); }, [bpm, getAudio, metronome, stop, tick]);

  useEffect(() => {
    if (!('requestMIDIAccess' in navigator)) { setStatus('Web MIDI nicht verfügbar'); return; }
    navigator.requestMIDIAccess().then(access => { const inputs = Array.from(access.inputs.values()); setStatus(inputs.length ? inputs[0].name || 'MIDI bereit' : 'Kein MIDI-Gerät');
      inputs.forEach(input => input.onmidimessage = event => { if (!event.data) return; const [command, pitch, velocity] = event.data;
        if ((command & 0xf0) === 0x90 && velocity > 0) { playTone(pitch, velocity, .8); if (recordingRef.current) activeRef.current.set(pitch, { start: Math.max(0, (performance.now() - recordStartRef.current) / (60000 / bpm)), velocity }); }
        else if (((command & 0xf0) === 0x80 || ((command & 0xf0) === 0x90 && velocity === 0)) && recordingRef.current) { const active = activeRef.current.get(pitch); if (active) { const rawEnd = Math.max(active.start, (performance.now() - recordStartRef.current) / (60000 / bpm)), step = quantizeStep(quantize), start = Math.round(active.start / step) * step, end = Math.round(rawEnd / step) * step, duration = Math.max(step, end - start); setNotes(old => [...old, { id: nextId.current++, pitch, start: Math.max(0, start), duration, velocity: active.velocity }]); activeRef.current.delete(pitch); } }
      });
    }).catch(() => setStatus('MIDI-Zugriff erlauben'));
  }, [bpm, playTone, quantize]);

  const exportMidi = () => { const events: { tick: number; bytes: number[] }[] = []; notes.forEach(n => { events.push({ tick: Math.round(n.start * PPQ), bytes: [0x90, n.pitch, n.velocity] }, { tick: Math.round((n.start + n.duration) * PPQ), bytes: [0x80, n.pitch, 0] }); }); events.sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0]); const tempo = Math.round(60000000 / bpm), track = [0, 255, 81, 3, tempo >> 16 & 255, tempo >> 8 & 255, tempo & 255]; let last = 0; events.forEach(e => { track.push(...writeVar(e.tick - last), ...e.bytes); last = e.tick; }); track.push(0, 255, 47, 0); const len = track.length, bytes = [77,84,104,100,0,0,0,6,0,0,0,1,0,PPQ,77,84,114,107,(len>>>24)&255,(len>>>16)&255,(len>>>8)&255,len&255,...track], url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'audio/midi' })), a = document.createElement('a'); a.href = url; a.download = 'velvet-sequence.mid'; a.click(); URL.revokeObjectURL(url); };
  const rows = useMemo(() => Array.from({ length: 49 }, (_, i) => 96 - i), []), selectedNote = notes.find(n => n.id === selected);
  const timelineBeats = Math.max(TOTAL_BEATS, Math.ceil(Math.max(position, ...notes.map(n => n.start + n.duration)) / 4) * 4 || TOTAL_BEATS);
  return <main className="studio-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">V</span><div><strong>VELVET</strong><small>MIDI STUDIO</small></div></div><div className="tempo-block"><button onClick={() => setBpm(Math.max(40, bpm - 1))}>−</button><label><input aria-label="Tempo" type="number" min="40" max="240" value={bpm} onChange={e => setBpm(Number(e.target.value))}/><span>BPM</span></label><button onClick={() => setBpm(Math.min(240, bpm + 1))}>+</button></div><div className="transport"><button className="round" onClick={stop} aria-label="Stopp">■</button><button className={`play ${playing ? 'active' : ''}`} onClick={playing ? stop : startPlayback} aria-label="Abspielen">▶</button><button className={`record ${recording ? 'active' : ''}`} onClick={recording ? stop : startRecording} aria-label="Aufnehmen"><span /></button></div><div className="header-actions"><span className="midi-dot" /><span className="midi-state">{status}</span><button className="clear" disabled={!notes.length} onClick={() => { stop(); setNotes([]); setSelected(null); }}>Clear</button><button className="export" onClick={exportMidi}>MIDI exportieren ↗</button></div></header>
    <section className="control-strip"><div className="control-group"><span className="eyebrow">KLANG</span><div className="segmented"><button className={sound === 'piano' ? 'chosen' : ''} onClick={() => setSound('piano')}>Piano</button><button className={sound === 'pad' ? 'chosen' : ''} onClick={() => setSound('pad')}>Warm Pad</button></div></div><div className="control-group"><span className="eyebrow">QUANTISIERUNG</span><select value={quantize} onChange={e => setQuantize(e.target.value)}><option>1/4</option><option>1/8</option><option>1/16</option><option>1/32</option><option value="1/8T">1/8 Triole</option><option value="1/16T">1/16 Triole</option><option value="1/32T">1/32 Triole</option></select></div><div className="control-group"><span className="eyebrow">TONART</span><select aria-label="Tonart" value={keyName} onChange={e => setKeyName(e.target.value as KeyName)}>{Object.entries(KEYS).map(([value, key]) => <option key={value} value={value}>{key.label}</option>)}</select></div><div className="control-group metronome"><span className="eyebrow">KLICK</span><button className={metronome ? 'toggle on' : 'toggle'} onClick={() => setMetronome(!metronome)}><span /></button><strong>{metronome ? 'AN' : 'AUS'}</strong></div><div className="preroll"><span>PREROLL</span><strong>2 TAKTE</strong></div></section>
    <section className="workspace"><div className="score-panel"><div className="panel-head"><div><span className="eyebrow">PARTITUR</span><h1>Neue Idee <span>• {KEYS[keyName].label} • 4/4</span></h1></div><div className="legend"><span><i className="velocity" /> Velocity</span><span><i className="quant" /> quantisiert</span></div></div><div className="score"><div className="clef treble">𝄞</div><div className="clef bass">𝄢</div>{[0,1,2,3,4].map(i => <div key={`t${i}`} className="staff-line" style={{top: 32 + i * 13}} />)}{[0,1,2,3,4].map(i => <div key={`b${i}`} className="staff-line" style={{top: 125 + i * 13}} />)}{Array.from({length: Math.max(0, timelineBeats / 4 - 1)}, (_, i) => (i + 1) * 4).map(beat => <div key={beat} className="barline" style={{left: `${10 + beat / timelineBeats * 88}%`}} />)}{Array.from({length: Math.abs(KEYS[keyName].fifths)}, (_, i) => <span key={`ks-${i}`} className="key-signature-mark" style={{left: `${7.1 + i * .65}%`, top: (KEYS[keyName].fifths > 0 ? [32,51.5,25.5,45,64.5,38.5,58] : [58,38.5,64.5,45,71,51.5,77])[i]}}>{KEYS[keyName].fifths > 0 ? '♯' : '♭'}</span>)}{Array.from({length: Math.abs(KEYS[keyName].fifths)}, (_, i) => <span key={`ksb-${i}`} className="key-signature-mark" style={{left: `${7.1 + i * .65}%`, top: (KEYS[keyName].fifths > 0 ? [138,157.5,131.5,151,170.5,144.5,164] : [164,144.5,170.5,151,177,157.5,183.5])[i]}}>{KEYS[keyName].fifths > 0 ? '♯' : '♭'}</span>)}{notes.flatMap(n => {
      const left = 11 + n.start / timelineBeats * 86, y = scoreY(n.pitch, keyName), accidental = spelledNote(n.pitch, keyName).accidental;
      return [
        ...ledgerLines(n.pitch, keyName).map(line => <span key={`ledger-${n.id}-${line}`} className="ledger-line" style={{left: `${left}%`, top: line}} />),
        ...(accidental ? [<i key={`acc-${n.id}`} className="accidental-mark" style={{left: `calc(${left}% - 18px)`, top: y}}>{accidental}</i>] : []),
        <button key={n.id} aria-label={`${pitchName(n.pitch)}, Velocity ${n.velocity}`} className={`score-note ${selected === n.id ? 'selected' : ''}`} onClick={() => setSelected(n.id)} style={{left: `${left}%`, top: y, opacity: .55 + n.velocity / 280}}><span /></button>
      ];
    })}<div className="playhead" style={{left: `${10 + position / timelineBeats * 88}%`}} /></div></div>
      <div className="editor-panel"><div className="editor-tools"><div><span className="eyebrow">PIANO ROLL</span><strong>{notes.length} Noten • {timelineBeats / 4} Takte</strong></div>{selectedNote && <div className="note-inspector"><span>{pitchName(selectedNote.pitch)}</span><label>Velocity <input type="range" min="1" max="127" value={selectedNote.velocity} onChange={e => setNotes(old => old.map(n => n.id === selected ? {...n, velocity: Number(e.target.value)} : n))}/><b>{selectedNote.velocity}</b></label><button onClick={() => { setNotes(old => old.filter(n => n.id !== selected)); setSelected(null); }}>Löschen</button></div>}<span className="hint">Raster {quantize} • Aufnahme bis Stopp</span></div><div className="roll-wrap"><div className="piano-keys">{rows.map(p => <div key={p} className={NOTE_NAMES[p % 12].includes('#') ? 'key black' : 'key'}><span>{NOTE_NAMES[p % 12] === 'C' ? pitchName(p) : ''}</span></div>)}</div><div className="roll-grid">{rows.map(p => <div key={p} className={`grid-row ${NOTE_NAMES[p % 12].includes('#') ? 'dark' : ''}`} />)}{Array.from({length: Math.floor(timelineBeats / quantizeStep(quantize)) + 1}, (_, i) => i * quantizeStep(quantize)).map(beat => <i key={`grid-${beat}`} className={`time-grid-line ${beat % 4 === 0 ? 'bar' : Number.isInteger(beat) ? 'beat' : ''}`} style={{left: `${beat / timelineBeats * 100}%`}} />)}{notes.map(n => n.pitch >= 48 && n.pitch <= 96 && <button key={n.id} onClick={() => { setSelected(n.id); playTone(n.pitch, n.velocity, .6); }} className={`note-block ${selected === n.id ? 'selected' : ''}`} style={{left: `${n.start / timelineBeats * 100}%`, width: `${Math.max(n.duration / timelineBeats * 100, 1.5)}%`, top: `${(96 - n.pitch) / rows.length * 100}%`, height: `${100 / rows.length}%`, '--vel': n.velocity / 127} as React.CSSProperties}><span>{pitchName(n.pitch)}</span></button>)}</div></div></div>
    </section><footer><span>♪ Web MIDI</span><span>Alle Daten bleiben auf deinem Gerät</span><span>V1.0</span></footer>
  </main>;
}

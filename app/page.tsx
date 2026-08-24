'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Note = { id: number; pitch: number; start: number; duration: number; velocity: number };
type Sound = 'piano' | 'pad';
const PPQ = 96, TOTAL_BEATS = 16;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const initialNotes: Note[] = [
  { id: 1, pitch: 60, start: 0, duration: 1, velocity: 92 }, { id: 2, pitch: 64, start: 1, duration: 1, velocity: 105 },
  { id: 3, pitch: 67, start: 2, duration: 1, velocity: 86 }, { id: 4, pitch: 72, start: 3, duration: 2, velocity: 112 },
  { id: 5, pitch: 55, start: 5, duration: 1, velocity: 78 }, { id: 6, pitch: 59, start: 6, duration: 1, velocity: 96 },
  { id: 7, pitch: 62, start: 7, duration: 1, velocity: 88 }, { id: 8, pitch: 67, start: 8, duration: 2, velocity: 104 },
];
function pitchName(p: number) { return `${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 1}`; }
function quantizeStep(v: string) { return v === '1/4' ? 1 : v === '1/8' ? .5 : v === '1/8T' ? 1 / 3 : v === '1/16T' ? 1 / 6 : .25; }
function writeVar(value: number) { const bytes = [value & 0x7f]; while ((value >>= 7)) bytes.unshift((value & 0x7f) | 0x80); return bytes; }

export default function Home() {
  const [notes, setNotes] = useState<Note[]>(initialNotes), [bpm, setBpm] = useState(112), [quantize, setQuantize] = useState('1/8');
  const [sound, setSound] = useState<Sound>('piano'), [recording, setRecording] = useState(false), [playing, setPlaying] = useState(false);
  const [metronome, setMetronome] = useState(true), [status, setStatus] = useState('MIDI verbinden'), [position, setPosition] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null), timersRef = useRef<number[]>([]);
  const activeRef = useRef(new Map<number, { start: number; velocity: number }>()), recordStartRef = useRef(0), nextId = useRef(20);
  const getAudio = useCallback(() => { if (!audioRef.current) audioRef.current = new AudioContext(); void audioRef.current.resume(); return audioRef.current; }, []);
  const playTone = useCallback((pitch: number, velocity = 96, duration = .5, at?: number) => {
    const ctx = getAudio(), start = at ?? ctx.currentTime, gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = sound === 'piano' ? 4800 : 1350;
    gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime((velocity / 127) * .24, start + (sound === 'piano' ? .008 : .18));
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration + (sound === 'piano' ? .5 : 1.4)); gain.connect(filter).connect(ctx.destination);
    const fre = 440 * Math.pow(2, (pitch - 69) / 12), waves: [number, OscillatorType][] = sound === 'piano' ? [[1, 'triangle'], [2, 'sine'], [3, 'sine']] : [[1, 'sawtooth'], [1.005, 'sawtooth']];
    waves.forEach(([ratio, type], i) => { const osc = ctx.createOscillator(), local = ctx.createGain(); osc.type = type; osc.frequency.value = fre * ratio; local.gain.value = sound === 'piano' ? 1 / (i + 1.5) : .18; osc.connect(local).connect(gain); osc.start(start); osc.stop(start + duration + 1.6); });
  }, [getAudio, sound]);
  const tick = useCallback((accent = false, at?: number) => { const ctx = getAudio(), start = at ?? ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain(); osc.frequency.value = accent ? 1320 : 920; gain.gain.setValueAtTime(.12, start); gain.gain.exponentialRampToValueAtTime(.0001, start + .04); osc.connect(gain).connect(ctx.destination); osc.start(start); osc.stop(start + .05); }, [getAudio]);
  const stop = useCallback(() => { timersRef.current.forEach(window.clearTimeout); timersRef.current = []; setPlaying(false); setRecording(false); setPosition(0); }, []);
  const startPlayback = useCallback(() => {
    stop(); setPlaying(true); const ctx = getAudio(), beatSeconds = 60 / bpm, origin = ctx.currentTime + .08;
    notes.forEach(n => playTone(n.pitch, n.velocity, n.duration * beatSeconds, origin + n.start * beatSeconds));
    if (metronome) for (let beat = 0; beat < TOTAL_BEATS; beat++) tick(beat % 4 === 0, origin + beat * beatSeconds);
    const started = performance.now() + 80; const update = () => { const beat = (performance.now() - started) / 1000 / beatSeconds; setPosition(Math.min(TOTAL_BEATS, Math.max(0, beat))); if (beat < TOTAL_BEATS) timersRef.current.push(window.setTimeout(update, 30)); else stop(); }; update();
  }, [bpm, getAudio, metronome, notes, playTone, stop, tick]);
  const startRecording = useCallback(() => { stop(); getAudio(); setStatus('2 Takte Preroll'); const beatMs = 60000 / bpm; for (let i = 0; i < 8; i++) timersRef.current.push(window.setTimeout(() => tick(i % 4 === 0), i * beatMs)); timersRef.current.push(window.setTimeout(() => { setRecording(true); setPlaying(true); setStatus('Aufnahme läuft'); recordStartRef.current = performance.now(); }, beatMs * 8)); }, [bpm, getAudio, stop, tick]);

  useEffect(() => {
    if (!('requestMIDIAccess' in navigator)) { setStatus('Web MIDI nicht verfügbar'); return; }
    navigator.requestMIDIAccess().then(access => { const inputs = Array.from(access.inputs.values()); setStatus(inputs.length ? inputs[0].name || 'MIDI bereit' : 'Kein MIDI-Gerät');
      inputs.forEach(input => input.onmidimessage = event => { if (!event.data) return; const [command, pitch, velocity] = event.data;
        if ((command & 0xf0) === 0x90 && velocity > 0) { playTone(pitch, velocity, .45); if (recording) activeRef.current.set(pitch, { start: (performance.now() - recordStartRef.current) / (60000 / bpm), velocity }); }
        else if (((command & 0xf0) === 0x80 || ((command & 0xf0) === 0x90 && velocity === 0)) && recording) { const active = activeRef.current.get(pitch); if (active) { const rawEnd = (performance.now() - recordStartRef.current) / (60000 / bpm), step = quantizeStep(quantize), start = Math.round(active.start / step) * step, duration = Math.max(step, Math.round((rawEnd - active.start) / step) * step); setNotes(old => [...old, { id: nextId.current++, pitch, start: Math.min(start, TOTAL_BEATS - step), duration, velocity: active.velocity }]); activeRef.current.delete(pitch); } }
      });
    }).catch(() => setStatus('MIDI-Zugriff erlauben'));
  }, [bpm, playTone, quantize, recording]);

  const exportMidi = () => { const events: { tick: number; bytes: number[] }[] = []; notes.forEach(n => { events.push({ tick: Math.round(n.start * PPQ), bytes: [0x90, n.pitch, n.velocity] }, { tick: Math.round((n.start + n.duration) * PPQ), bytes: [0x80, n.pitch, 0] }); }); events.sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0]); const tempo = Math.round(60000000 / bpm), track = [0, 255, 81, 3, tempo >> 16 & 255, tempo >> 8 & 255, tempo & 255]; let last = 0; events.forEach(e => { track.push(...writeVar(e.tick - last), ...e.bytes); last = e.tick; }); track.push(0, 255, 47, 0); const len = track.length, bytes = [77,84,104,100,0,0,0,6,0,0,0,1,0,PPQ,77,84,114,107,(len>>>24)&255,(len>>>16)&255,(len>>>8)&255,len&255,...track], url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'audio/midi' })), a = document.createElement('a'); a.href = url; a.download = 'velvet-sequence.mid'; a.click(); URL.revokeObjectURL(url); };
  const rows = useMemo(() => Array.from({ length: 25 }, (_, i) => 84 - i), []), selectedNote = notes.find(n => n.id === selected);
  return <main className="studio-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">V</span><div><strong>VELVET</strong><small>MIDI STUDIO</small></div></div><div className="tempo-block"><button onClick={() => setBpm(Math.max(40, bpm - 1))}>−</button><label><input aria-label="Tempo" type="number" min="40" max="240" value={bpm} onChange={e => setBpm(Number(e.target.value))}/><span>BPM</span></label><button onClick={() => setBpm(Math.min(240, bpm + 1))}>+</button></div><div className="transport"><button className="round" onClick={stop} aria-label="Stopp">■</button><button className={`play ${playing ? 'active' : ''}`} onClick={playing ? stop : startPlayback} aria-label="Abspielen">▶</button><button className={`record ${recording ? 'active' : ''}`} onClick={recording ? stop : startRecording} aria-label="Aufnehmen"><span /></button></div><div className="header-actions"><span className="midi-dot" /><span className="midi-state">{status}</span><button className="export" onClick={exportMidi}>MIDI exportieren ↗</button></div></header>
    <section className="control-strip"><div className="control-group"><span className="eyebrow">KLANG</span><div className="segmented"><button className={sound === 'piano' ? 'chosen' : ''} onClick={() => setSound('piano')}>Piano</button><button className={sound === 'pad' ? 'chosen' : ''} onClick={() => setSound('pad')}>Warm Pad</button></div></div><div className="control-group"><span className="eyebrow">QUANTISIERUNG</span><select value={quantize} onChange={e => setQuantize(e.target.value)}><option>1/4</option><option>1/8</option><option>1/16</option><option value="1/8T">1/8 Triole</option><option value="1/16T">1/16 Triole</option></select></div><div className="control-group metronome"><span className="eyebrow">KLICK</span><button className={metronome ? 'toggle on' : 'toggle'} onClick={() => setMetronome(!metronome)}><span /></button><strong>{metronome ? 'AN' : 'AUS'}</strong></div><div className="preroll"><span>PREROLL</span><strong>2 TAKTE</strong></div></section>
    <section className="workspace"><div className="score-panel"><div className="panel-head"><div><span className="eyebrow">PARTITUR</span><h1>Neue Idee <span>• 4/4</span></h1></div><div className="legend"><span><i className="velocity" /> Velocity</span><span><i className="quant" /> quantisiert</span></div></div><div className="score"><div className="clef treble">𝄞</div><div className="clef bass">𝄢</div>{[0,1,2,3,4].map(i => <div key={`t${i}`} className="staff-line" style={{top: 32 + i * 13}} />)}{[0,1,2,3,4].map(i => <div key={`b${i}`} className="staff-line" style={{top: 125 + i * 13}} />)}{[4,8,12].map(beat => <div key={beat} className="barline" style={{left: `${10 + beat / TOTAL_BEATS * 88}%`}} />)}{notes.map(n => <button key={n.id} aria-label={`${pitchName(n.pitch)}, Velocity ${n.velocity}`} className={`score-note ${selected === n.id ? 'selected' : ''}`} onClick={() => setSelected(n.id)} style={{left: `${11 + n.start / TOTAL_BEATS * 86}%`, top: `${100 - (n.pitch - 48) * 2.25}px`, opacity: .55 + n.velocity / 280}}><span /></button>)}<div className="playhead" style={{left: `${10 + position / TOTAL_BEATS * 88}%`}} /></div></div>
      <div className="editor-panel"><div className="editor-tools"><div><span className="eyebrow">PIANO ROLL</span><strong>{notes.length} Noten</strong></div>{selectedNote && <div className="note-inspector"><span>{pitchName(selectedNote.pitch)}</span><label>Velocity <input type="range" min="1" max="127" value={selectedNote.velocity} onChange={e => setNotes(old => old.map(n => n.id === selected ? {...n, velocity: Number(e.target.value)} : n))}/><b>{selectedNote.velocity}</b></label><button onClick={() => { setNotes(old => old.filter(n => n.id !== selected)); setSelected(null); }}>Löschen</button></div>}<span className="hint">Note wählen, Velocity anpassen</span></div><div className="roll-wrap"><div className="piano-keys">{rows.map(p => <div key={p} className={NOTE_NAMES[p % 12].includes('#') ? 'key black' : 'key'}><span>{NOTE_NAMES[p % 12] === 'C' ? pitchName(p) : ''}</span></div>)}</div><div className="roll-grid">{rows.map(p => <div key={p} className={`grid-row ${NOTE_NAMES[p % 12].includes('#') ? 'dark' : ''}`} />)}{notes.map(n => n.pitch >= 60 && n.pitch <= 84 && <button key={n.id} onClick={() => { setSelected(n.id); playTone(n.pitch, n.velocity, .3); }} className={`note-block ${selected === n.id ? 'selected' : ''}`} style={{left: `${n.start / TOTAL_BEATS * 100}%`, width: `${Math.max(n.duration / TOTAL_BEATS * 100, 1.5)}%`, top: `${(84 - n.pitch) / 25 * 100}%`, height: `${100 / 25}%`, '--vel': n.velocity / 127} as React.CSSProperties}><span>{pitchName(n.pitch)}</span></button>)}</div></div></div>
    </section><footer><span>♪ Web MIDI</span><span>Alle Daten bleiben auf deinem Gerät</span><span>V1.0</span></footer>
  </main>;
}

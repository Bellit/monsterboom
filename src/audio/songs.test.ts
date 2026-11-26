import { describe, expect, it } from 'vitest';
import { SONGS, midi, seq } from './songs';

describe('canciones', () => {
  it('lee bien los nombres de nota', () => {
    expect(midi('A4')).toBe(69);
    expect(midi('C4')).toBe(60);
    expect(midi('C#5')).toBe(73);
    expect(midi('Bb3')).toBe(58);
    expect(seq('C4 . | E4')).toEqual([60, null, 64]);
  });

  it.each(Object.entries(SONGS))('%s: pistas completas y notas audibles', (_name, song) => {
    const steps = song.perBeat * 4; // pasos por compás de 4/4
    const lengths = song.tracks.map((t) => t.notes.length);
    // En los temas que se repiten, todas las pistas miden lo mismo y en compases enteros
    // (si no, se desincronizan al repetirse).
    if (song.loop !== false) {
      expect(new Set(lengths).size, `longitudes ${lengths.join(',')}`).toBe(1);
      expect(lengths[0] % steps).toBe(0);
    }
    for (const t of song.tracks) {
      for (const n of t.notes) {
        if (n === null || t.inst === 'kick' || t.inst === 'snare' || t.inst === 'hat') continue;
        expect(n).toBeGreaterThanOrEqual(24); // por debajo no se oye en altavoces normales
        expect(n).toBeLessThanOrEqual(100);
      }
    }
  });
});

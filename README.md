# Velvet MIDI Studio

[![GitHub Pages](https://github.com/OWNER/REPOSITORY/actions/workflows/pages.yml/badge.svg)](https://github.com/OWNER/REPOSITORY/actions/workflows/pages.yml)

Ein browserbasierter MIDI-Sequenzer für schnelle musikalische Ideen – ohne Anmeldung und ohne Cloud-Speicherung.

## Funktionen

- Aufnahme externer MIDI-Keyboards über Web MIDI inklusive Anschlagstärke
- Einstellbare Quantisierung: 1/4, 1/8, 1/16 sowie Achtel- und Sechzehntel-Triolen
- Metronom und automatischer Preroll von zwei Takten
- Tempo von 40 bis 240 BPM
- Umschaltbarer Piano- und Warm-Pad-Klang über die Web Audio API
- Notenansicht mit Violin- und Bassschlüssel
- Piano-Roll mit Notenauswahl, Velocity-Regler und Löschen
- Standard-MIDI-Dateiexport
- Responsive Oberfläche für Desktop und Tablet

## Lokal starten

Voraussetzung: Node.js 22 oder neuer und pnpm.

```bash
pnpm install
pnpm dev
```

Danach im Browser `http://localhost:3000` öffnen. Für Web MIDI wird Chrome oder Edge empfohlen. Beim ersten Besuch den MIDI-Zugriff erlauben.

## Auf GitHub Pages veröffentlichen

1. Auf GitHub ein neues Repository anlegen, zum Beispiel `velvet-midi-studio`.
2. Den vollständigen Inhalt dieses Projektordners in den `main`-Branch hochladen.
3. Im Repository **Settings → Pages** öffnen.
4. Unter **Build and deployment** bei **Source** den Eintrag **GitHub Actions** wählen.
5. Den nächsten Lauf unter **Actions → GitHub Pages** abwarten.

Danach ist die App unter `https://DEIN-NAME.github.io/REPOSITORY/` erreichbar. Bei jedem späteren Push in den `main`-Branch wird sie automatisch neu veröffentlicht.

Die Badge-Links oben können optional von `OWNER/REPOSITORY` auf den tatsächlichen GitHub-Namen geändert werden.

## Bedienung

1. MIDI-Keyboard anschließen und die Seite öffnen.
2. Tempo, Klang und Quantisierung wählen.
3. Den roten Aufnahmebutton drücken. Nach zwei Takten Preroll beginnt die Aufnahme.
4. Noten im Piano Roll anklicken, um Velocity zu ändern oder sie zu löschen.
5. Mit **MIDI exportieren** die Sequenz als `.mid` herunterladen.

## Technik

Next.js-kompatible React-App mit Vinext, Web MIDI API und Web Audio API. Die MIDI-Datei wird vollständig lokal im Browser erzeugt.

## Lizenz

MIT

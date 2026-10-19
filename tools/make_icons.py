"""Generate the PNG app icons for Pixel War using only the standard library."""

import struct
import zlib
from pathlib import Path

# 16x16 pixel-art map: W water, n unclaimed land, b/r/a factions.
ART = [
    'WWWWWWWWWWWWWWWW',
    'WWnnnnnWWWrrrrWW',
    'WnnnnnnnnrrrrrrW',
    'WnnnbbnnnrrrrrrW',
    'WnnbbbbnnnrrrrWW',
    'WnbbbbbbnnnrrnWW',
    'WnbbbbbbbnnnnnnW',
    'WWbbbbbbbbnnnnnW',
    'WWbbbbbbbbaaannW',
    'WnbbbbbbbaaaaanW',
    'WnnbbbbbaaaaaaaW',
    'WnnnbbbaaaaaaaWW',
    'WWnnnnnaaaaaaWWW',
    'WWWnnnnnaaaaWWWW',
    'WWWWWnnnnWWWWWWW',
    'WWWWWWWWWWWWWWWW',
]

COLOURS = {
    'W': (22, 58, 104),
    'n': (196, 190, 168),
    'b': (59, 130, 246),
    'r': (220, 38, 38),
    'a': (234, 150, 12),
}
FACTION = 'bra'


def pixel_colour(x: int, y: int) -> tuple[int, int, int]:
    """Return the colour of one art cell, darkening faction borders."""
    ch = ART[y][x]
    r, g, b = COLOURS[ch]
    if ch in FACTION:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < 16 and 0 <= ny < 16:
                other = ART[ny][nx]
                if other != ch and other != 'W':
                    return int(r * 0.55), int(g * 0.55), int(b * 0.55)
    return r, g, b


def render(size: int, padding: float) -> bytes:
    """Render the art at `size` pixels with a water-coloured margin."""
    inner = size * (1 - 2 * padding)
    origin = (size - inner) / 2
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            ax = int((px - origin) / inner * 16)
            ay = int((py - origin) / inner * 16)
            if 0 <= ax < 16 and 0 <= ay < 16:
                row.extend(pixel_colour(ax, ay))
            else:
                row.extend(COLOURS['W'])
        rows.append(bytes(row))
    return b''.join(rows)


def png(size: int, raw: bytes) -> bytes:
    """Wrap raw RGB scanlines in a minimal PNG container."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    header = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header)
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def main() -> None:
    """Write the three icon files into the icons folder."""
    out = Path(__file__).resolve().parent.parent / 'icons'
    out.mkdir(exist_ok=True)
    (out / 'icon-192.png').write_bytes(png(192, render(192, 0.0)))
    (out / 'icon-512.png').write_bytes(png(512, render(512, 0.0)))
    # Maskable icons must keep their content inside the central 80 %.
    (out / 'maskable-512.png').write_bytes(png(512, render(512, 0.12)))


if __name__ == '__main__':
    main()

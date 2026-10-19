"""Rasterise Natural Earth country outlines into Pixel War map files.

Usage:
    python3 tools/make_maps.py path/to/countries-50m.json

The input is the world-atlas TopoJSON (Natural Earth, public domain), from
https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json
It writes maps/world.js and maps/europe.js. Each file holds a Mercator grid
of country indices, run-length encoded and base64-packed.
"""

import base64
import json
import math
import sys
from pathlib import Path

# name, west, east, south, north (degrees), grid width in cells
REGIONS = [
    ('world', 'World', -180.0, 180.0, -56.0, 75.0, 700),
    ('europe', 'Europe', -25.0, 50.0, 34.0, 71.0, 400),
]


def merc(lat: float) -> float:
    """Return the Mercator y value for a latitude in degrees."""
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def decode_arcs(topo: dict) -> list[list[tuple[float, float]]]:
    """Decode the delta-encoded, quantised TopoJSON arcs into lon/lat lists."""
    sx, sy = topo['transform']['scale']
    tx, ty = topo['transform']['translate']
    arcs = []
    for arc in topo['arcs']:
        x = y = 0
        points = []
        for dx, dy in arc:
            x += dx
            y += dy
            points.append((x * sx + tx, y * sy + ty))
        arcs.append(points)
    return arcs


def ring_points(ring: list[int], arcs: list) -> list[tuple[float, float]]:
    """Stitch a ring of arc indices into one list of points."""
    points: list[tuple[float, float]] = []
    for index in ring:
        arc = arcs[index] if index >= 0 else arcs[~index][::-1]
        points.extend(arc if not points else arc[1:])
    return points


def country_rings(geometry: dict, arcs: list) -> list[list[tuple[float, float]]]:
    """Return every ring (outer boundaries and holes) of a country."""
    if geometry['type'] == 'Polygon':
        polygons = [geometry['arcs']]
    elif geometry['type'] == 'MultiPolygon':
        polygons = geometry['arcs']
    else:
        return []
    return [ring_points(ring, arcs) for polygon in polygons for ring in polygon]


def unwrap(ring: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Make longitudes continuous where a ring jumps across the antimeridian."""
    out = [ring[0]]
    offset = 0.0
    for (lon_prev, _), (lon, lat) in zip(ring, ring[1:]):
        if lon - lon_prev > 180:
            offset -= 360.0
        elif lon - lon_prev < -180:
            offset += 360.0
        out.append((lon + offset, lat))
    return out


def rasterise(rings: list, width: int, height: int, project) -> list[tuple[int, int]]:
    """Return the (x, y) cells whose centres fall inside the rings (even-odd)."""
    edges = []
    for ring in rings:
        ring = unwrap(ring)
        lons = [lon for lon, _ in ring]
        # A ring that crosses the antimeridian is drawn once per side.
        shifts = [0.0]
        if min(lons) < -180:
            shifts.append(360.0)
        if max(lons) > 180:
            shifts.append(-360.0)
        for shift in shifts:
            for (lon1, lat1), (lon2, lat2) in zip(ring, ring[1:] + ring[:1]):
                edges.append((*project(lon1 + shift, lat1), *project(lon2 + shift, lat2)))
    cells = []
    if not edges:
        return cells
    y_min = max(0, int(min(min(e[1], e[3]) for e in edges)))
    y_max = min(height - 1, int(max(max(e[1], e[3]) for e in edges)) + 1)
    for row in range(y_min, y_max + 1):
        yc = row + 0.5
        xs = []
        for x1, y1, x2, y2 in edges:
            if (y1 <= yc) != (y2 <= yc):
                xs.append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            start = max(0, math.ceil(a - 0.5))
            end = min(width - 1, math.floor(b - 0.5))
            cells.extend((col, row) for col in range(start, end + 1))
    return cells


def encode(grid: list[int]) -> str:
    """Run-length encode the grid as (value, varint length) pairs in base64."""
    out = bytearray()
    i = 0
    while i < len(grid):
        value = grid[i]
        run = 1
        while i + run < len(grid) and grid[i + run] == value:
            run += 1
        out.append(value)
        n = run
        while True:
            byte = n & 0x7F
            n >>= 7
            out.append(byte | (0x80 if n else 0))
            if not n:
                break
        i += run
    return base64.b64encode(bytes(out)).decode('ascii')


def build_region(topo: dict, arcs: list, region: tuple) -> dict:
    """Rasterise all countries for one region and return the map record."""
    key, title, west, east, south, north, width = region
    span_x = math.radians(east - west)
    span_y = merc(north) - merc(south)
    height = round(width * span_y / span_x)

    def project(lon: float, lat: float) -> tuple[float, float]:
        lat = max(-85.0, min(85.0, lat))
        x = (lon - west) / (east - west) * width
        y = (merc(north) - merc(lat)) / span_y * height
        return x, y

    grid = [0] * (width * height)
    names: list[str] = []
    for geometry in topo['objects']['countries']['geometries']:
        name = geometry.get('properties', {}).get('name', '')
        if not name or name == 'Antarctica':
            continue
        cells = rasterise(country_rings(geometry, arcs), width, height, project)
        if not cells or len(names) >= 254:
            continue
        names.append(name)
        code = len(names)
        for x, y in cells:
            grid[y * width + x] = code
    # Drop countries that ended up with no cells (overdrawn by neighbours).
    used = sorted(set(grid) - {0})
    remap = {old: new for new, old in enumerate(used, start=1)}
    grid = [remap.get(v, 0) for v in grid]
    names = [names[old - 1] for old in used]
    return {'key': key, 'name': title, 'w': width, 'h': height,
            'countries': names, 'data': encode(grid)}


def main() -> None:
    """Read the TopoJSON given on the command line and write the map files."""
    topo = json.loads(Path(sys.argv[1]).read_text())
    arcs = decode_arcs(topo)
    out_dir = Path(__file__).resolve().parent.parent / 'maps'
    out_dir.mkdir(exist_ok=True)
    for region in REGIONS:
        record = build_region(topo, arcs, region)
        js = ('window.PIXEL_WAR_MAPS = window.PIXEL_WAR_MAPS || {};\n'
              f"window.PIXEL_WAR_MAPS.{record['key']} = {json.dumps(record)};\n")
        (out_dir / f"{record['key']}.js").write_text(js)
        print(f"{record['key']}: {record['w']}x{record['h']}, "
              f"{len(record['countries'])} countries, {len(js) // 1024} KiB")


if __name__ == '__main__':
    main()

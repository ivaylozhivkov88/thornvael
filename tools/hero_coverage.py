"""Exact binary-input reference kernel for offline closed-solid coverage.

No geometric tolerance, welding, ray stepping, or parity at ambiguous contacts.
All public diagnostics are JSON-safe and retain exact fraction strings.
"""
from fractions import Fraction as F
import math
import time


METHOD = 'exact Fraction closed-solid first contiguous union exit; exhaustive triangle events'


class CoverageError(RuntimeError):
    def __init__(self, reason, **details):
        self.details = {'reason': reason, **details}
        super().__init__(str(self.details))


class Budget:
    def __init__(self, seconds=None):
        self.deadline = None if seconds is None else time.monotonic() + seconds

    def check(self, **checkpoint):
        if self.deadline is not None and time.monotonic() >= self.deadline:
            raise CoverageError('RESOURCE_EXHAUSTED', checkpoint=checkpoint)


def rational(x):
    if isinstance(x, F):
        return x
    if not math.isfinite(float(x)):
        raise CoverageError('INVALID_SOLID', issue='nonfinite input')
    return F.from_float(float(x))


def vec(v):
    if len(v) != 3:
        raise CoverageError('INVALID_SOLID', issue='expected Vec3')
    return tuple(map(rational, v))


def sub(a, b):
    return tuple(x-y for x, y in zip(a, b))


def add(a, b):
    return tuple(x+y for x, y in zip(a, b))


def mul(a, t):
    return tuple(x*t for x in a)


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def normal(tri):
    return cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]))


def sides(p, tri):
    n = normal(tri)
    return [dot(cross(sub(tri[(i+1) % 3], tri[i]), sub(p, tri[i])), n) for i in range(3)]


def on_triangle(p, tri):
    return dot(normal(tri), sub(p, tri[0])) == 0 and min(sides(p, tri)) >= 0


def line_triangle(o, d, tri, low, high):
    """Closed intersection parameter interval (singleton for transverse hits)."""
    n = normal(tri)
    denominator = dot(n, d)
    numerator = dot(n, sub(tri[0], o))
    if denominator:
        t = numerator / denominator
        return (t, t) if low <= t <= high and on_triangle(add(o, mul(d, t)), tri) else None
    if numerator:
        return None
    # Coplanar: exact clipping against the three inward half planes.
    for i in range(3):
        edge = sub(tri[(i+1) % 3], tri[i])
        a = dot(cross(edge, sub(o, tri[i])), n)
        b = dot(cross(edge, d), n)
        if not b:
            if a < 0:
                return None
        elif b > 0:
            low = max(low, -a/b)
        else:
            high = min(high, -a/b)
        if low > high:
            return None
    return low, high


def on_segment(p, a, b):
    return cross(sub(p, a), sub(b, a)) == (0, 0, 0) and dot(sub(p, a), sub(p, b)) <= 0


class Solid:
    def __init__(self, object_id, vertices, triangles, polygon_ids=None, budget=None):
        self.id = str(object_id)
        self.budget = budget or Budget()
        self.vertices = [vec(v) for v in vertices]
        self.indices = [tuple(t) for t in triangles]
        self.polygons = list(polygon_ids) if polygon_ids is not None else list(range(len(triangles)))
        self.triangles = []
        self.boxes = []
        self.classifications = {}
        self.validate()

    def fail(self, issue, **details):
        raise CoverageError('INVALID_SOLID', object=self.id, issue=issue, **details)

    def identity(self, i):
        return {'object': self.id, 'polygon': self.polygons[i], 'triangle': i}

    def validate(self):
        if not self.indices or len(self.polygons) != len(self.indices):
            self.fail('empty mesh or polygon identity mismatch')
        edges, links, seen = {}, {}, set()
        for i, face in enumerate(self.indices):
            self.budget.check(object=self.id, stage='topology', triangle=i)
            if len(face) != 3 or len(set(face)) != 3 or any(type(v) is not int or v < 0 or v >= len(self.vertices) for v in face):
                self.fail('invalid triangle indices', face=self.identity(i))
            key = tuple(sorted(face))
            if key in seen:
                self.fail('duplicate face', face=self.identity(i))
            seen.add(key)
            tri = tuple(self.vertices[v] for v in face)
            if normal(tri) == (0, 0, 0):
                self.fail('zero-area face', face=self.identity(i))
            self.triangles.append(tri)
            self.boxes.append(tuple((min(v[k] for v in tri), max(v[k] for v in tri)) for k in range(3)))
            for j, a in enumerate(face):
                b, c = face[(j+1) % 3], face[(j+2) % 3]
                edges.setdefault(tuple(sorted((a, b))), []).append((i, a, b))
                links.setdefault(a, []).append((b, c))
        neighbors = [set() for _ in self.indices]
        for edge, rows in edges.items():
            if len(rows) != 2 or rows[0][1:] != rows[1][1:][::-1]:
                self.fail('edge incidence/orientation', edge=edge, faces=[self.identity(r[0]) for r in rows])
            a, b = rows[0][0], rows[1][0]
            neighbors[a].add(b)
            neighbors[b].add(a)
        def connected(graph):
            pending = [next(iter(graph))]
            reached = set()
            while pending:
                node = pending.pop()
                if node not in reached:
                    reached.add(node)
                    pending.extend(graph[node] - reached)
            return len(reached) == len(graph)
        if not connected(dict(enumerate(neighbors))):
            self.fail('disconnected shells')
        for vertex, pairs in links.items():
            graph = {}
            for a, b in pairs:
                graph.setdefault(a, set()).add(b)
                graph.setdefault(b, set()).add(a)
            if any(len(v) != 2 for v in graph.values()) or not connected(graph):
                self.fail('vertex link is not one cycle', vertex=vertex)
        if len(links) != len(self.vertices):
            self.fail('unused vertices')
        volume6 = sum(dot(t[0], cross(t[1], t[2])) for t in self.triangles)
        if volume6 <= 0:
            self.fail('nonpositive signed volume', volume6=str(volume6))
        # Exact AABB rejection only; no float culling or tolerance.
        for i, a in enumerate(self.triangles):
            for j in range(i):
                self.budget.check(object=self.id, stage='embedding', triangles=[j, i])
                if any(self.boxes[i][k][1] < self.boxes[j][k][0] or self.boxes[j][k][1] < self.boxes[i][k][0] for k in range(3)):
                    continue
                b = self.triangles[j]
                shared = set(self.indices[i]) & set(self.indices[j])
                permitted = [self.vertices[v] for v in sorted(shared)]
                for source, target in ((a, b), (b, a)):
                    for k in range(3):
                        start, end = source[k], source[(k+1) % 3]
                        hit = line_triangle(start, sub(end, start), target, F(0), F(1))
                        if hit:
                            for t in hit:
                                p = add(start, mul(sub(end, start), t))
                                allowed = (len(permitted) == 1 and p == permitted[0]) or (len(permitted) == 2 and on_segment(p, *permitted))
                                if not allowed:
                                    self.fail('self-intersection/contact beyond shared simplex', faces=[self.identity(j), self.identity(i)], point=list(map(str, p)))

    def far(self, origin, direction):
        w = max(abs(v[i]-origin[i]) for v in self.vertices for i in range(3))
        return (w+1) / max(map(abs, direction))

    def classify_point(self, point):
        p = vec(point)
        self.budget.check(object=self.id, stage='classify_point')
        if p in self.classifications:
            return self.classifications[p]
        for tri in self.triangles:
            if on_triangle(p, tri):
                self.classifications[p] = 'BOUNDARY'
                return 'BOUNDARY'
        for k in range(1, 33):
            self.budget.check(object=self.id, stage='classify', direction=k)
            d = (F(1), F(k), F(k*k))
            far = self.far(p, d)
            count, degenerate = 0, False
            for tri in self.triangles:
                hit = line_triangle(p, d, tri, F(0), far)
                if hit:
                    t, end = hit
                    if t != end or dot(normal(tri), d) == 0 or min(sides(add(p, mul(d, t)), tri)) == 0:
                        degenerate = True
                        break
                    count += 1
            if not degenerate:
                result = 'INSIDE' if count % 2 else 'OUTSIDE'
                self.classifications[p] = result
                return result
        raise CoverageError('CLASSIFICATION_AMBIGUOUS', object=self.id, point=list(map(str, p)), directions=32)

    def intervals(self, origin, direction, far, evidence):
        events = {}
        for i, tri in enumerate(self.triangles):
            self.budget.check(object=self.id, stage='events', triangle=i)
            hit = line_triangle(origin, direction, tri, F(0), far)
            if hit:
                lo, hi = hit
                if lo != hi:
                    raise CoverageError('COPLANAR_RAY', face=self.identity(i), overlap=list(map(str, hit)))
                events.setdefault(lo, []).append(self.identity(i))
        evidence['events'] = [{'t': str(t), 'faces': faces} for t, faces in sorted(events.items())]
        cuts = sorted({F(0), far, *events})
        occupied = [(t, t) for t in events]  # closed boundary, including isolated tangent
        states = []
        for a, b in zip(cuts, cuts[1:]):
            state = self.classify_point(add(origin, mul(direction, (a+b)/2)))
            states.append(state)
            if state == 'BOUNDARY':
                raise CoverageError('COPLANAR_RAY', object=self.id, midpoint=str((a+b)/2))
            if state == 'INSIDE':
                occupied.append((a, b))
        if not states or states[-1] != 'OUTSIDE':
            raise CoverageError('CLASSIFICATION_AMBIGUOUS', object=self.id, issue='terminal interval not outside')
        evidence['intervals'] = [[str(a), str(b)] for a, b in sorted(occupied)]
        return occupied


def first_component(intervals):
    """Exact touching connects; every positive gap terminates the component."""
    reach = None
    next_start = None
    for start, end, owner in sorted(intervals):
        if reach is None:
            if start != 0:
                break
            reach = end
        elif start > reach:
            next_start = start
            break
        else:
            reach = max(reach, end)
    return reach, next_start


def coverage_ray(solids, origin, direction):
    evidence = {'method': METHOD, 'objects': [s.id for s in solids], 'solids': []}
    try:
        o, d = vec(origin), vec(direction)
        evidence.update(origin=list(map(str, o)), direction=list(map(str, d)))
        if not solids or not dot(d, d):
            raise CoverageError('CLASSIFICATION_AMBIGUOUS', issue='empty solids or zero direction')
        far = max(s.far(o, d) for s in solids)
        evidence['T'] = str(far)
        states = [s.classify_point(o) for s in solids]
        evidence['originClassifications'] = dict(zip(evidence['objects'], states))
        if 'BOUNDARY' in states:
            raise CoverageError('ORIGIN_BOUNDARY')
        if 'INSIDE' not in states:
            raise CoverageError('ORIGIN_OUTSIDE')
        intervals = []
        for solid in solids:
            row = {'object': solid.id}
            evidence['solids'].append(row)
            intervals.extend((a, b, solid.id) for a, b in solid.intervals(o, d, far, row))
        reach, next_start = first_component(intervals)
        evidence.update(reach=str(reach), nextStart=None if next_start is None else str(next_start))
        if reach is None:
            raise CoverageError('CLASSIFICATION_AMBIGUOUS', issue='no origin component')
        squared = reach*reach*dot(d, d)
        evidence['radiusSquared'] = str(squared)
        evidence['radiusWorld'] = math.sqrt(float(squared))
        if not F(2875, 100000)**2 <= squared <= F(161, 1000)**2:
            raise CoverageError('RADIUS_OUT_OF_RANGE')
        return {**evidence, 'pass': True}
    except CoverageError as error:
        raise CoverageError(error.details['reason'], evidence=evidence, diagnostic=error.details) from error

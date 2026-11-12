"""Exact binary-input reference kernel for offline closed-solid coverage.

No geometric tolerance, welding, ray stepping, or parity at ambiguous contacts.
All public diagnostics are JSON-safe and retain exact fraction strings.
"""
from fractions import Fraction as F
import math
import time


METHOD = 'exact Fraction closed-solid first contiguous union exit; exhaustive triangle events'
_F0 = F(0)
_F1 = F(1)


class CoverageError(RuntimeError):
    def __init__(self, reason, **details):
        self.details = {'reason': reason, **details}
        super().__init__(str(self.details))


class Budget:
    def __init__(self, seconds=None):
        self.deadline = None if seconds is None else time.monotonic() + seconds
        self._ticks = 0

    def check(self, **checkpoint):
        if self.deadline is not None:
            self._ticks += 1
            if (self._ticks & 255) == 1 and time.monotonic() >= self.deadline:
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
    return (rational(v[0]), rational(v[1]), rational(v[2]))


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def mul(a, t):
    return (a[0] * t, a[1] * t, a[2] * t)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def normal(tri):
    t0, t1, t2 = tri
    ax, ay, az = t1[0] - t0[0], t1[1] - t0[1], t1[2] - t0[2]
    bx, by, bz = t2[0] - t0[0], t2[1] - t0[1], t2[2] - t0[2]
    return (ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx)


def sides(p, tri):
    n = normal(tri)
    return [dot(cross(sub(tri[(i+1) % 3], tri[i]), sub(p, tri[i])), n) for i in range(3)]


def on_triangle(p, tri):
    return dot(normal(tri), sub(p, tri[0])) == 0 and min(sides(p, tri)) >= 0


def _line_tri_fast(o, d, tri, n, ce, low, high):
    """Exact precomputed-plane intersection parameter interval."""
    dx, dy, dz = d
    ox, oy, oz = o
    nx, ny, nz = n
    denominator = nx * dx + ny * dy + nz * dz
    v0 = tri[0]
    numerator = nx * (v0[0] - ox) + ny * (v0[1] - oy) + nz * (v0[2] - oz)
    if denominator:
        if denominator > 0:
            if numerator < low * denominator or numerator > high * denominator:
                return None
            for idx in range(3):
                vi, cei = tri[idx], ce[idx]
                if ((denominator * (ox - vi[0]) + numerator * dx) * cei[0] +
                    (denominator * (oy - vi[1]) + numerator * dy) * cei[1] +
                    (denominator * (oz - vi[2]) + numerator * dz) * cei[2]) < 0:
                    return None
        else:
            if numerator > low * denominator or numerator < high * denominator:
                return None
            for idx in range(3):
                vi, cei = tri[idx], ce[idx]
                if ((denominator * (ox - vi[0]) + numerator * dx) * cei[0] +
                    (denominator * (oy - vi[1]) + numerator * dy) * cei[1] +
                    (denominator * (oz - vi[2]) + numerator * dz) * cei[2]) > 0:
                    return None
        t = numerator / denominator
        return (t, t)
    if numerator:
        return None
    for idx in range(3):
        vi, cei = tri[idx], ce[idx]
        a = (ox - vi[0]) * cei[0] + (oy - vi[1]) * cei[1] + (oz - vi[2]) * cei[2]
        b = dx * cei[0] + dy * cei[1] + dz * cei[2]
        if not b:
            if a < 0:
                return None
        elif b > 0:
            low = max(low, -a / b)
        else:
            high = min(high, -a / b)
        if low > high:
            return None
    return low, high


def _ray_tri_int(ox, oy, oz, dx, dy, dz, tri, n, ce, sq, far_num, far_den):
    """Exact integer ray-triangle intersection in [0, far]; falls back to Fraction only on coplanar overlap."""
    nx, ny, nz = n
    denom = nx * dx + ny * dy + nz * dz
    v0 = tri[0]
    num = nx * (sq * v0[0] - ox) + ny * (sq * v0[1] - oy) + nz * (sq * v0[2] - oz)
    if denom:
        if denom > 0:
            if num < 0 or num * far_den > far_num * denom:
                return None
            for idx in range(3):
                vi, cei = tri[idx], ce[idx]
                if ((denom * (ox - sq * vi[0]) + num * dx) * cei[0] +
                    (denom * (oy - sq * vi[1]) + num * dy) * cei[1] +
                    (denom * (oz - sq * vi[2]) + num * dz) * cei[2]) < 0:
                    return None
        else:
            if num > 0 or num * far_den < far_num * denom:
                return None
            for idx in range(3):
                vi, cei = tri[idx], ce[idx]
                if ((denom * (ox - sq * vi[0]) + num * dx) * cei[0] +
                    (denom * (oy - sq * vi[1]) + num * dy) * cei[1] +
                    (denom * (oz - sq * vi[2]) + num * dz) * cei[2]) > 0:
                    return None
        return ('hit', num, denom)
    if num:
        return None
    lo_n, lo_d = 0, 1
    hi_n, hi_d = far_num, far_den
    for idx in range(3):
        vi, cei = tri[idx], ce[idx]
        a = (ox - sq * vi[0]) * cei[0] + (oy - sq * vi[1]) * cei[1] + (oz - sq * vi[2]) * cei[2]
        b = dx * cei[0] + dy * cei[1] + dz * cei[2]
        if not b:
            if a < 0:
                return None
        elif b > 0:
            if -a * lo_d > lo_n * b:
                lo_n, lo_d = -a, b
        else:
            nb = -b
            if a * hi_d < hi_n * nb:
                hi_n, hi_d = a, nb
        if lo_n * hi_d > hi_n * lo_d:
            return None
    return ('span', F(lo_n, lo_d), F(hi_n, hi_d))


def line_triangle(o, d, tri, low, high):
    """Closed intersection parameter interval (singleton for transverse hits)."""
    n = normal(tri)
    ce = tuple(cross(n, sub(tri[(i + 1) % 3], tri[i])) for i in range(3))
    return _line_tri_fast(o, d, tri, n, ce, low, high)


def on_segment(p, a, b):
    return cross(sub(p, a), sub(b, a)) == (0, 0, 0) and dot(sub(p, a), sub(p, b)) <= 0


def _finterval(lo_val, hi_val):
    return (math.nextafter(float(lo_val), -math.inf), math.nextafter(float(hi_val), math.inf))


def _build_bvh(fboxes, ids):
    bx0 = min(fboxes[i][0] for i in ids)
    bx1 = max(fboxes[i][1] for i in ids)
    by0 = min(fboxes[i][2] for i in ids)
    by1 = max(fboxes[i][3] for i in ids)
    bz0 = min(fboxes[i][4] for i in ids)
    bz1 = max(fboxes[i][5] for i in ids)
    box = (bx0, bx1, by0, by1, bz0, bz1)
    if len(ids) <= 8:
        return (True, box, tuple(ids))
    spans = (bx1 - bx0, by1 - by0, bz1 - bz0)
    axis = 0 if spans[0] >= spans[1] and spans[0] >= spans[2] else (1 if spans[1] >= spans[2] else 2)
    ids.sort(key=lambda idx: fboxes[idx][axis * 2] + fboxes[idx][axis * 2 + 1])
    mid = len(ids) >> 1
    return (False, box, _build_bvh(fboxes, ids[:mid]), _build_bvh(fboxes, ids[mid:]))


def _bvh_query(root, rx0, rx1, ry0, ry1, rz0, rz1):
    stack = [root]
    hits = []
    while stack:
        node = stack.pop()
        bx0, bx1, by0, by1, bz0, bz1 = node[1]
        if bx1 < rx0 or bx0 > rx1 or by1 < ry0 or by0 > ry1 or bz1 < rz0 or bz0 > rz1:
            continue
        if node[0]:
            hits.extend(node[2])
        else:
            stack.append(node[2])
            stack.append(node[3])
    return hits


class Solid:
    def __init__(self, object_id, vertices, triangles, polygon_ids=None, budget=None):
        self.id = str(object_id)
        self.budget = budget or Budget()
        self.vertices = [vec(v) for v in vertices]
        self.indices = [tuple(t) for t in triangles]
        self.polygons = list(polygon_ids) if polygon_ids is not None else list(range(len(triangles)))
        self.triangles = []
        self.fboxes = []
        self.fbbox = None
        self.bvh = None
        self._D = 1
        self._iverts = []
        self._itris = []
        self._inorms = []
        self._iedges = []
        self._iboxes = []
        self._vbounds = None
        self.classifications = {}
        self.validate()

    def fail(self, issue, **details):
        raise CoverageError('INVALID_SOLID', object=self.id, issue=issue, **details)

    def identity(self, i):
        return {'object': self.id, 'polygon': self.polygons[i], 'triangle': i}

    def validate(self):
        if not self.indices or len(self.polygons) != len(self.indices):
            self.fail('empty mesh or polygon identity mismatch')
        nverts = len(self.vertices)
        for i, face in enumerate(self.indices):
            if len(face) != 3 or len(set(face)) != 3 or any(type(v) is not int or v < 0 or v >= nverts for v in face):
                self.fail('invalid triangle indices', face=self.identity(i))
        D = math.lcm(*(c.denominator for v in self.vertices for c in v))
        self._D = D
        iverts = [tuple(c.numerator * (D // c.denominator) for c in v) for v in self.vertices]
        self._iverts = iverts
        fverts = [(float(v[0]), float(v[1]), float(v[2])) for v in self.vertices]
        edges, links, seen = {}, {}, set()
        for i, face in enumerate(self.indices):
            self.budget.check(object=self.id, stage='topology', triangle=i)
            key = tuple(sorted(face))
            if key in seen:
                self.fail('duplicate face', face=self.identity(i))
            seen.add(key)
            f0, f1, f2 = face
            tri = (self.vertices[f0], self.vertices[f1], self.vertices[f2])
            itri = (iverts[f0], iverts[f1], iverts[f2])
            n = normal(itri)
            if n == (0, 0, 0):
                self.fail('zero-area face', face=self.identity(i))
            self.triangles.append(tri)
            self._itris.append(itri)
            self._inorms.append(n)
            e0, e1, e2 = sub(itri[1], itri[0]), sub(itri[2], itri[1]), sub(itri[0], itri[2])
            self._iedges.append((cross(n, e0), cross(n, e1), cross(n, e2)))
            p0, p1, p2 = itri
            self._iboxes.append((
                (min(p0[0], p1[0], p2[0]), max(p0[0], p1[0], p2[0])),
                (min(p0[1], p1[1], p2[1]), max(p0[1], p1[1], p2[1])),
                (min(p0[2], p1[2], p2[2]), max(p0[2], p1[2], p2[2])),
            ))
            fv0, fv1, fv2 = fverts[f0], fverts[f1], fverts[f2]
            self.fboxes.append((
                *_finterval(min(fv0[0], fv1[0], fv2[0]), max(fv0[0], fv1[0], fv2[0])),
                *_finterval(min(fv0[1], fv1[1], fv2[1]), max(fv0[1], fv1[1], fv2[1])),
                *_finterval(min(fv0[2], fv1[2], fv2[2]), max(fv0[2], fv1[2], fv2[2])),
            ))
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
        volume6 = sum(dot(t[0], cross(t[1], t[2])) for t in self._itris)
        if volume6 <= 0:
            self.fail('nonpositive signed volume', volume6=str(F(volume6, D * D * D)))
        self._vbounds = (
            (min(v[0] for v in self.vertices), max(v[0] for v in self.vertices)),
            (min(v[1] for v in self.vertices), max(v[1] for v in self.vertices)),
            (min(v[2] for v in self.vertices), max(v[2] for v in self.vertices)),
        )
        self.fbbox = (min(fb[0] for fb in self.fboxes), max(fb[1] for fb in self.fboxes),
                      min(fb[2] for fb in self.fboxes), max(fb[3] for fb in self.fboxes),
                      min(fb[4] for fb in self.fboxes), max(fb[5] for fb in self.fboxes))
        self.bvh = _build_bvh(self.fboxes, list(range(len(self.fboxes))))
        # Conservative float-interval broad-phase + exact AABB sweep-and-prune; exact integer checks below.
        order = sorted(range(len(self._itris)), key=lambda idx: self._iboxes[idx][0][0])
        for pos, i in enumerate(order):
            self.budget.check(object=self.id, stage='embedding', triangle=i)
            bi = self._iboxes[i]
            fbi = self.fboxes[i]
            bx1 = bi[0][1]
            iby0, iby1, ibz0, ibz1 = fbi[2], fbi[3], fbi[4], fbi[5]
            a = self._itris[i]
            na, cea = self._inorms[i], self._iedges[i]
            for pos2 in range(pos + 1, len(order)):
                j = order[pos2]
                fbj = self.fboxes[j]
                if fbj[0] > fbi[1]:
                    if self._iboxes[j][0][0] > bx1:
                        break
                    continue
                if iby1 < fbj[2] or fbj[3] < iby0 or ibz1 < fbj[4] or fbj[5] < ibz0:
                    continue
                bj = self._iboxes[j]
                if bj[0][0] > bx1:
                    break
                if bi[1][1] < bj[1][0] or bj[1][1] < bi[1][0] or bi[2][1] < bj[2][0] or bj[2][1] < bi[2][0]:
                    continue
                b = self._itris[j]
                nb, ceb = self._inorms[j], self._iedges[j]
                ia, jb = self.indices[i], self.indices[j]
                shared = set(ia) & set(jb)
                n_shared = len(shared)
                nb0, nb1, nb2 = nb
                bx0, by0, bz0 = b[0]
                if n_shared == 2:
                    vo = iverts[ia[0] if ia[0] not in shared else (ia[1] if ia[1] not in shared else ia[2])]
                    if nb0 * (vo[0] - bx0) + nb1 * (vo[1] - by0) + nb2 * (vo[2] - bz0) != 0:
                        continue
                elif n_shared == 1:
                    s_id = next(iter(shared))
                    da = [nb0 * (iverts[v][0] - bx0) + nb1 * (iverts[v][1] - by0) + nb2 * (iverts[v][2] - bz0) for v in ia if v != s_id]
                    if (da[0] > 0 and da[1] > 0) or (da[0] < 0 and da[1] < 0):
                        continue
                    na0, na1, na2 = na
                    ax0, ay0, az0 = a[0]
                    db = [na0 * (iverts[v][0] - ax0) + na1 * (iverts[v][1] - ay0) + na2 * (iverts[v][2] - az0) for v in jb if v != s_id]
                    if (db[0] > 0 and db[1] > 0) or (db[0] < 0 and db[1] < 0):
                        continue
                else:
                    da0 = nb0 * (a[0][0] - bx0) + nb1 * (a[0][1] - by0) + nb2 * (a[0][2] - bz0)
                    da1 = nb0 * (a[1][0] - bx0) + nb1 * (a[1][1] - by0) + nb2 * (a[1][2] - bz0)
                    da2 = nb0 * (a[2][0] - bx0) + nb1 * (a[2][1] - by0) + nb2 * (a[2][2] - bz0)
                    if (da0 > 0 and da1 > 0 and da2 > 0) or (da0 < 0 and da1 < 0 and da2 < 0):
                        continue
                    na0, na1, na2 = na
                    ax0, ay0, az0 = a[0]
                    db0 = na0 * (b[0][0] - ax0) + na1 * (b[0][1] - ay0) + na2 * (b[0][2] - az0)
                    db1 = na0 * (b[1][0] - ax0) + na1 * (b[1][1] - ay0) + na2 * (b[1][2] - az0)
                    db2 = na0 * (b[2][0] - ax0) + na1 * (b[2][1] - ay0) + na2 * (b[2][2] - az0)
                    if (db0 > 0 and db1 > 0 and db2 > 0) or (db0 < 0 and db1 < 0 and db2 < 0):
                        continue
                iperm = [iverts[v] for v in sorted(shared)]
                perm_f = [self.vertices[v] for v in sorted(shared)]
                for s_idx, src, tgt, nt, cet in ((i, a, b, nb, ceb), (j, b, a, na, cea)):
                    src_f = self.triangles[s_idx]
                    for k in range(3):
                        start, end = src[k], src[(k+1) % 3]
                        sd = sub(end, start)
                        hit = _ray_tri_int(start[0], start[1], start[2], sd[0], sd[1], sd[2], tgt, nt, cet, 1, 1, 1)
                        if hit:
                            if hit[0] == 'hit':
                                _, num, denom = hit
                                allowed = False
                                if len(iperm) == 1:
                                    p0 = iperm[0]
                                    allowed = (denom*start[0] + num*sd[0] == denom*p0[0] and
                                               denom*start[1] + num*sd[1] == denom*p0[1] and
                                               denom*start[2] + num*sd[2] == denom*p0[2])
                                elif len(iperm) == 2:
                                    pa, pb = iperm
                                    q0 = (denom*start[0] + num*sd[0] - denom*pa[0],
                                          denom*start[1] + num*sd[1] - denom*pa[1],
                                          denom*start[2] + num*sd[2] - denom*pa[2])
                                    q1 = (denom*start[0] + num*sd[0] - denom*pb[0],
                                          denom*start[1] + num*sd[1] - denom*pb[1],
                                          denom*start[2] + num*sd[2] - denom*pb[2])
                                    ab = (pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2])
                                    allowed = (cross(q0, ab) == (0, 0, 0) and dot(q0, q1) <= 0)
                                if not allowed:
                                    sf, ef = src_f[k], src_f[(k+1) % 3]
                                    pf = add(sf, mul(sub(ef, sf), F(num, denom)))
                                    self.fail('self-intersection/contact beyond shared simplex', faces=[self.identity(j), self.identity(i)], point=list(map(str, pf)))
                            else:
                                sf, ef = src_f[k], src_f[(k+1) % 3]
                                sdf = sub(ef, sf)
                                for t in hit[1:]:
                                    pf = add(sf, mul(sdf, t))
                                    allowed = (len(perm_f) == 1 and pf == perm_f[0]) or (len(perm_f) == 2 and on_segment(pf, *perm_f))
                                    if not allowed:
                                        self.fail('self-intersection/contact beyond shared simplex', faces=[self.identity(j), self.identity(i)], point=list(map(str, pf)))

    def far(self, origin, direction):
        w = max(max(abs(lo - o), abs(hi - o)) for (lo, hi), o in zip(self._vbounds, origin))
        return (w+1) / max(map(abs, direction))

    def classify_point(self, point):
        p = vec(point)
        self.budget.check(object=self.id, stage='classify_point')
        if p in self.classifications:
            return self.classifications[p]
        px, py, pz = p
        L = math.lcm(self._D, px.denominator, py.denominator, pz.denominator)
        sq = L // self._D
        qx = px.numerator * (L // px.denominator)
        qy = py.numerator * (L // py.denominator)
        qz = pz.numerator * (L // pz.denominator)
        fx0, fx1 = _finterval(px, px)
        fy0, fy1 = _finterval(py, py)
        fz0, fz1 = _finterval(pz, pz)
        for idx in _bvh_query(self.bvh, fx0, fx1, fy0, fy1, fz0, fz1):
            fb = self.fboxes[idx]
            if fx1 < fb[0] or fx0 > fb[1] or fy1 < fb[2] or fy0 > fb[3] or fz1 < fb[4] or fz0 > fb[5]:
                continue
            b = self._iboxes[idx]
            if qx < sq * b[0][0] or qx > sq * b[0][1] or qy < sq * b[1][0] or qy > sq * b[1][1] or qz < sq * b[2][0] or qz > sq * b[2][1]:
                continue
            tri = self._itris[idx]
            n = self._inorms[idx]
            v0 = tri[0]
            if n[0]*(qx - sq*v0[0]) + n[1]*(qy - sq*v0[1]) + n[2]*(qz - sq*v0[2]) == 0:
                ce = self._iedges[idx]
                if all((qx - sq*tri[k][0])*ce[k][0] + (qy - sq*tri[k][1])*ce[k][1] + (qz - sq*tri[k][2])*ce[k][2] >= 0 for k in range(3)):
                    self.classifications[p] = 'BOUNDARY'
                    return 'BOUNDARY'
        for k in range(1, 33):
            self.budget.check(object=self.id, stage='classify', direction=k)
            dx, dy, dz = 1, k, k*k
            far = self.far(p, (F(1), F(k), F(k*k)))
            end = add(p, (far, far * k, far * (k * k)))
            rmin0, rmax0 = (px, end[0]) if px <= end[0] else (end[0], px)
            rmin1, rmax1 = (py, end[1]) if py <= end[1] else (end[1], py)
            rmin2, rmax2 = (pz, end[2]) if pz <= end[2] else (end[2], pz)
            frx0, frx1 = _finterval(rmin0, rmax0)
            fry0, fry1 = _finterval(rmin1, rmax1)
            frz0, frz1 = _finterval(rmin2, rmax2)
            far_num, far_den = far.numerator * L, far.denominator
            count, degenerate = 0, False
            for idx in _bvh_query(self.bvh, frx0, frx1, fry0, fry1, frz0, frz1):
                fb = self.fboxes[idx]
                if fb[1] < frx0 or fb[0] > frx1 or fb[3] < fry0 or fb[2] > fry1 or fb[5] < frz0 or fb[4] > frz1:
                    continue
                tri = self._itris[idx]
                n = self._inorms[idx]
                ce = self._iedges[idx]
                hit = _ray_tri_int(qx, qy, qz, dx, dy, dz, tri, n, ce, sq, far_num, far_den)
                if hit:
                    if hit[0] != 'hit' or (n[0]*dx + n[1]*dy + n[2]*dz) == 0:
                        degenerate = True
                        break
                    _, num, denom = hit
                    s0 = ((denom*(qx - sq*tri[0][0]) + num*dx)*ce[0][0] +
                          (denom*(qy - sq*tri[0][1]) + num*dy)*ce[0][1] +
                          (denom*(qz - sq*tri[0][2]) + num*dz)*ce[0][2])
                    s1 = ((denom*(qx - sq*tri[1][0]) + num*dx)*ce[1][0] +
                          (denom*(qy - sq*tri[1][1]) + num*dy)*ce[1][1] +
                          (denom*(qz - sq*tri[1][2]) + num*dz)*ce[1][2])
                    s2 = ((denom*(qx - sq*tri[2][0]) + num*dx)*ce[2][0] +
                          (denom*(qy - sq*tri[2][1]) + num*dy)*ce[2][1] +
                          (denom*(qz - sq*tri[2][2]) + num*dz)*ce[2][2])
                    if s0 == 0 or s1 == 0 or s2 == 0:
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
        L = math.lcm(self._D, origin[0].denominator, origin[1].denominator, origin[2].denominator)
        sq = L // self._D
        ox = origin[0].numerator * (L // origin[0].denominator)
        oy = origin[1].numerator * (L // origin[1].denominator)
        oz = origin[2].numerator * (L // origin[2].denominator)
        Dd = math.lcm(direction[0].denominator, direction[1].denominator, direction[2].denominator)
        dx = direction[0].numerator * (Dd // direction[0].denominator)
        dy = direction[1].numerator * (Dd // direction[1].denominator)
        dz = direction[2].numerator * (Dd // direction[2].denominator)
        end = add(origin, mul(direction, far))
        rmin0, rmax0 = (origin[0], end[0]) if origin[0] <= end[0] else (end[0], origin[0])
        rmin1, rmax1 = (origin[1], end[1]) if origin[1] <= end[1] else (end[1], origin[1])
        rmin2, rmax2 = (origin[2], end[2]) if origin[2] <= end[2] else (end[2], origin[2])
        frx0, frx1 = _finterval(rmin0, rmax0)
        fry0, fry1 = _finterval(rmin1, rmax1)
        frz0, frz1 = _finterval(rmin2, rmax2)
        far_num, far_den = far.numerator * L, far.denominator * Dd
        self.budget.check(object=self.id, stage='events', triangle=0)
        for i in _bvh_query(self.bvh, frx0, frx1, fry0, fry1, frz0, frz1):
            fb = self.fboxes[i]
            if fb[1] < frx0 or fb[0] > frx1 or fb[3] < fry0 or fb[2] > fry1 or fb[5] < frz0 or fb[4] > frz1:
                continue
            hit = _ray_tri_int(ox, oy, oz, dx, dy, dz, self._itris[i], self._inorms[i], self._iedges[i], sq, far_num, far_den)
            if hit:
                if hit[0] == 'span':
                    lo, hi = hit[1] * F(Dd, L), hit[2] * F(Dd, L)
                    if lo != hi:
                        raise CoverageError('COPLANAR_RAY', face=self.identity(i), overlap=[str(lo), str(hi)])
                    t = lo
                else:
                    t = F(hit[1] * Dd, hit[2] * L)
                events.setdefault(t, []).append(self.identity(i))
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

"""Compact closed-mesh controls for the exact offline coverage reference."""
import math
import unittest
from fractions import Fraction as F
from hero_coverage import (Budget, CoverageError, Solid, coverage_ray, first_component)


def box(name, lo, hi, **kwargs):
    vertices = [(x, y, z) for z in (lo[2], hi[2]) for y in (lo[1], hi[1]) for x in (lo[0], hi[0])]
    faces = [(0, 2, 3), (0, 3, 1), (4, 5, 7), (4, 7, 6),
             (0, 1, 5), (0, 5, 4), (2, 6, 7), (2, 7, 3),
             (0, 4, 6), (0, 6, 2), (1, 3, 7), (1, 7, 5)]
    return Solid(name, vertices, faces, **kwargs)


def cylinder(name, radius, z0=-.1, z1=.1, transform=lambda p: p):
    vertices = [transform((radius*math.cos(i*math.tau/24), radius*math.sin(i*math.tau/24), z))
                for z in (z0, z1) for i in range(24)]
    faces = []
    for i in range(24):
        j = (i+1) % 24
        faces.extend([(i, j, j+24), (i, j+24, i+24)])
    for i in range(1, 23):
        faces.extend([(0, i+1, i), (24, 24+i, 25+i)])
    return Solid(name, vertices, faces)


class GeometryControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.valid = cylinder('closed .027 model cylinder', .027*1.15)
        cls.small = cylinder('closed .024 model cylinder', .024*1.15)

    def fails(self, reason, callback):
        with self.assertRaises(CoverageError) as caught:
            callback()
        self.assertEqual(reason, caught.exception.details['reason'], caught.exception.details)
        return caught.exception.details

    def test_cylinder_027_pass_24_rays(self):
        for i in range(24):
            self.assertTrue(coverage_ray([self.valid], (0, 0, 0), (math.cos(i*math.tau/24), math.sin(i*math.tau/24), 0))['pass'])

    def test_cylinder_024_fail_vertices_and_faces(self):
        for i in range(48):
            self.fails('RADIUS_OUT_OF_RANGE', lambda: coverage_ray([self.small], (0, 0, 0), (math.cos(i*math.tau/48), math.sin(i*math.tau/48), 0)))

    def test_overlap_33_degrees_internal_caps_positive(self):
        angle = math.radians(33)
        proximal = cylinder('proximal', .045, -.08, .01, lambda p: (p[2], p[0], p[1]))
        distal = cylinder('distal33', .045, -.04, .07,
                           lambda p: (.02+p[2]*math.cos(angle)-p[0]*math.sin(angle), p[2]*math.sin(angle)+p[0]*math.cos(angle), p[1]))
        cuff = cylinder('cuff', .04, -.025, .025, lambda p: (p[2], p[0], p[1]))
        # Explicit positive volume overlap: point strictly inside all three objects.
        for solid in (proximal, distal, cuff):
            self.assertEqual('INSIDE', solid.classify_point((.005, 0, 0)))
        row = coverage_ray([proximal, distal, cuff], (0, 0, 0), (1, 0, 0))
        self.assertGreater(row['radiusWorld'], .025)
        self.assertTrue(row['pass'])

    def test_contained_closed_sphere(self):
        r = .02*1.15
        # Octahedral triangulated sphere; wholly inside the polygonal cylinder.
        vertices = [(r, 0, 0), (-r, 0, 0), (0, r, 0), (0, -r, 0), (0, 0, r), (0, 0, -r)]
        faces = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4),
                 (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
        sphere = Solid('contained sphere', vertices, faces)
        result = coverage_ray([sphere, self.valid], (0, 0, 0), (1, 0, 0))
        self.assertEqual(coverage_ray([self.valid], (0, 0, 0), (1, 0, 0))['reach'], result['reach'])

    def test_open_cap(self):
        self.fails('INVALID_SOLID', lambda: Solid('open', self.valid.vertices, self.valid.indices[:-1]))

    def test_distant_body_cannot_rescue(self):
        first = box('small', (-.02, -.02, -.02), (.02, .02, .02))
        later = box('later', (.03, -.02, -.02), (.08, .02, .02))
        failure = self.fails('RADIUS_OUT_OF_RANGE', lambda: coverage_ray([first, later], (0, 0, 0), (1, 0, 0)))
        self.assertEqual(str(F.from_float(.02)), failure['evidence']['reach'])

    def test_thin_gap_and_exact_touch(self):
        first = box('first', (-.02, -.02, -.02), (.02, .02, .02))
        later = box('positive thin gap', (.02+1e-12, -.02, -.02), (.08, .02, .02))
        self.fails('RADIUS_OUT_OF_RANGE', lambda: coverage_ray([first, later], (0, 0, 0), (1, 0, 0)))
        touching = box('exact touch', (.02, -.02, -.02), (.08, .02, .02))
        self.assertTrue(coverage_ray([first, touching], (0, 0, 0), (1, 0, 0))['pass'])
        self.assertEqual((F(2), F(2)+F(1, 10**12)), first_component([(F(0), F(2), 'a'), (F(2)+F(1, 10**12), F(4), 'b')]))
        self.assertEqual((F(4), None), first_component([(F(0), F(2), 'a'), (F(2), F(4), 'b')]))

    def test_thin_crossing_and_far_beyond_ten(self):
        thin = box('thin crossing', (.05, -.02, -.02), (.05+1e-8, .02, .02))
        distant = box('beyond10', (20, -.02, -.02), (21, .02, .02))
        result = coverage_ray([self.valid, thin, distant], (0, 0, 0), (1, 0, 0))
        self.assertGreater(F(result['T']), 21)
        self.assertEqual(2, len(result['solids'][1]['events']))
        self.assertEqual(2, len(result['solids'][2]['events']))

    def test_real_gap_08_and_elbow_detachment(self):
        for label in ('knee', 'elbow'):
            detached = box(label, (.08*1.15, -.04, -.04), (.15, .04, .04))
            self.fails('ORIGIN_OUTSIDE', lambda: coverage_ray([detached], (0, 0, 0), (1, 0, 0)))

    def test_origin_face_edge_vertex(self):
        solid = box('boundary', (-.04, -.04, -.04), (.04, .04, .04))
        for origin in ((.04, 0, 0), (.04, .04, 0), (.04, .04, .04)):
            self.fails('ORIGIN_BOUNDARY', lambda: coverage_ray([solid], origin, (1, 0, 0)))

    def test_boundary_even_inside_other(self):
        solid = box('boundary', (0, -.01, -.01), (.01, .01, .01))
        self.fails('ORIGIN_BOUNDARY', lambda: coverage_ray([self.valid, solid], (0, 0, 0), (1, 0, 0)))

    def test_primary_coplanar_face_and_edge(self):
        for low in ((.04, 0, -.01), (.04, 0, 0)):
            contact = box('boundary travel', low, (.06, .02, .02))
            self.fails('COPLANAR_RAY', lambda: coverage_ray([self.valid, contact], (0, 0, 0), (1, 0, 0)))

    def test_isolated_tangent_edge_and_vertex(self):
        for high_z in (.01, 0):
            tangent = box('isolated contact', (.04, .02, -.01), (.06, .04, high_z))
            base = box('origin', (-.03, -.03, -.03), (.03, .03, .03))
            result = coverage_ray([base, tangent], (0, 0, 0), (1, 1, 0))
            self.assertEqual([[str(F.from_float(.04)), str(F.from_float(.04))]], result['solids'][1]['intervals'])
            self.assertEqual(str(F.from_float(.03)), result['reach'])

    def test_invalid_winding_zero_duplicate_self_intersection(self):
        solid = box('template', (-1, -1, -1), (1, 1, 1))
        self.fails('INVALID_SOLID', lambda: Solid('reversed', solid.vertices, [tuple(reversed(t)) for t in solid.indices]))
        self.fails('INVALID_SOLID', lambda: Solid('duplicate', solid.vertices, solid.indices+[solid.indices[0]]))
        vertices = solid.vertices[:]
        vertices[1] = vertices[0]
        self.fails('INVALID_SOLID', lambda: Solid('zero', vertices, solid.indices))
        vertices = solid.vertices[:]
        vertices[7] = (F(-2), F(-2), F(-2))
        self.fails('INVALID_SOLID', lambda: Solid('self intersection', vertices, solid.indices))

    def test_bowtie_and_nested_shells(self):
        a = box('a', (0, 0, 0), (1, 1, 1))
        b = box('b', (-1, -1, -1), (0, 0, 0))
        # Edge incidence two on each shell, but one shared vertex has two link cycles.
        vertices = a.vertices+b.vertices[:-1]
        remap = {i: (0 if i == 7 else i+8) for i in range(8)}
        self.fails('INVALID_SOLID', lambda: Solid('bowtie', vertices, a.indices+[tuple(remap[i] for i in t) for t in b.indices]))
        inner = box('inner', (.2, .2, .2), (.8, .8, .8))
        self.fails('INVALID_SOLID', lambda: Solid('nested', a.vertices+inner.vertices, a.indices+[tuple(i+8 for i in t) for t in inner.indices]))

    def test_nonfinite_zero_direction_and_budget(self):
        self.fails('INVALID_SOLID', lambda: Solid('nan', [(math.nan, 0, 0)], [(0, 0, 0)]))
        self.fails('CLASSIFICATION_AMBIGUOUS', lambda: coverage_ray([self.valid], (0, 0, 0), (0, 0, 0)))
        self.fails('RESOURCE_EXHAUSTED', lambda: box('budget', (-1, -1, -1), (1, 1, 1), budget=Budget(0)))

    def test_direction_norm_and_inclusive_exact_limits(self):
        a = coverage_ray([self.valid], (0, 0, 0), (1, 0, 0))
        b = coverage_ray([self.valid], (0, 0, 0), (2, 0, 0))
        self.assertEqual(a['radiusSquared'], b['radiusSquared'])
        self.assertEqual(F(a['reach'])/2, F(b['reach']))
        for radius in (F(2875, 100000), F(161, 1000)):
            solid = box('exact limit', (-radius, -radius, -radius), (radius, radius, radius))
            self.assertTrue(coverage_ray([solid], (0, 0, 0), (1, 0, 0))['pass'])

    def test_nonmanifold_edge_and_orientation_conflict(self):
        a = box('a', (-1, -1, -1), (1, 1, 1))
        faces = a.indices[:]
        faces[0] = tuple(reversed(faces[0]))
        self.fails('INVALID_SOLID', lambda: Solid('orientation conflict', a.vertices, faces))
        self.fails('INVALID_SOLID', lambda: Solid('three incident faces', a.vertices+[(2, 2, 2)], a.indices+[(0, 1, 8)]))

    def test_actual_closed_mesh_classifier_exhaustion(self):
        # Every (1,k,k*k) auxiliary ray hits a front polygon vertex exactly.
        # Convex yz polygon extruded in x; no mocked intersections/parity.
        n = 32
        vertices = [(x, k, k*k) for x in (1, 2) for k in range(1, n+1)]
        faces = []
        for i in range(n):
            j = (i+1) % n
            faces.extend([(i, j, j+n), (i, j+n, i+n)])
        for i in range(1, n-1):
            faces.extend([(0, i+1, i), (n, n+i, n+i+1)])
        solid = Solid('32 exact degenerate directions', vertices, faces)
        failure = self.fails('CLASSIFICATION_AMBIGUOUS', lambda: solid.classify_point((0, 0, 0)))
        self.assertEqual(32, failure['directions'])


if __name__ == '__main__':
    unittest.main(verbosity=2)

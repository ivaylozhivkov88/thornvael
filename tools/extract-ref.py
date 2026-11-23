#!/usr/bin/env python3
"""Read-only reference archive inspector and extractor.

Reads RoM2 (.res), HoMM3 (.lod/.snd/.vid), Diablo II (.mpq), and .zip archives
from installed game folders and writes extracted files ONLY to D:\\ROM 2 clone\\_extract\\.
"""

import argparse
import os
import struct
import sys
import zipfile
import zlib
from collections import Counter

DEFAULT_OUT = r"D:\ROM 2 clone\_extract"


# ---------------------------------------------------------------------------
# 1. Rage of Mages II (.res) — Nival Resource Archive (magic 0x31415926)
# ---------------------------------------------------------------------------
def parse_rom2_res(path: str):
    with open(path, "rb") as f:
        magic, root_offset, root_size, flags, fat_offset, fat_count = struct.unpack("<6I", f.read(24))
        if magic != 0x31415926:
            raise ValueError(f"Not a RoM2 RES archive: {path} (magic={hex(magic)})")
        f.seek(fat_offset)
        fat = f.read(fat_count * 32)

    rec_size = 32
    count = fat_count
    entries = []

    def walk(start_idx: int, num: int, prefix: str):
        for i in range(start_idx, min(start_idx + num, count)):
            off = i * rec_size
            junk, data_off, data_sz, node_type = struct.unpack_from("<4I", fat, off)
            raw_name = fat[off + 16 : off + 32]
            name = raw_name.split(b"\x00", 1)[0].decode("latin-1", errors="replace")
            if node_type == 1:  # directory
                walk(data_off, data_sz, f"{prefix}{name}/" if prefix or name else "")
            else:
                entries.append((f"{prefix}{name}", data_off, data_sz))

    walk(root_offset, root_size, "")
    return entries


def extract_rom2_res(path: str, out_dir: str, limit: int = 0):
    entries = parse_rom2_res(path)
    os.makedirs(out_dir, exist_ok=True)
    with open(path, "rb") as f:
        for idx, (rel, off, sz) in enumerate(entries):
            if limit and idx >= limit:
                break
            dest = os.path.join(out_dir, rel.replace("/", os.sep))
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            f.seek(off)
            with open(dest, "wb") as out:
                out.write(f.read(sz))
    return entries


# ---------------------------------------------------------------------------
# 2. HoMM 3 (.lod, .snd, .vid)
# ---------------------------------------------------------------------------
def parse_homm3_lod(path: str):
    with open(path, "rb") as f:
        hdr = f.read(92)
        if hdr[:4] != b"LOD\x00":
            raise ValueError(f"Not a HoMM3 LOD archive: {path}")
        count = struct.unpack_from("<I", hdr, 8)[0]
        entries = []
        for _ in range(count):
            rec = f.read(32)
            if len(rec) < 32:
                break
            raw_name, off, full_sz, ftype, comp_sz = struct.unpack("<16s4I", rec)
            name = raw_name.split(b"\x00", 1)[0].decode("latin-1", errors="replace")
            entries.append((name, off, full_sz, comp_sz, ftype))
    return entries


def extract_homm3_lod(path: str, out_dir: str, exts=None):
    entries = parse_homm3_lod(path)
    os.makedirs(out_dir, exist_ok=True)
    extracted = 0
    with open(path, "rb") as f:
        for name, off, full_sz, comp_sz, _ftype in entries:
            if exts and not any(name.lower().endswith(e) for e in exts):
                continue
            f.seek(off)
            if comp_sz > 0:
                data = zlib.decompress(f.read(comp_sz))
            else:
                data = f.read(full_sz)
            with open(os.path.join(out_dir, name), "wb") as out:
                out.write(data)
            extracted += 1
    return entries, extracted


def parse_homm3_snd(path: str):
    with open(path, "rb") as f:
        count = struct.unpack("<I", f.read(4))[0]
        entries = []
        for _ in range(count):
            raw_name, off, sz = struct.unpack("<40s2I", f.read(48))
            name = raw_name.split(b"\x00", 1)[0].decode("latin-1", errors="replace")
            entries.append((name, off, sz))
    return entries


def parse_homm3_vid(path: str):
    with open(path, "rb") as f:
        count = struct.unpack("<I", f.read(4))[0]
        entries = []
        for _ in range(count):
            raw_name, off = struct.unpack("<40sI", f.read(44))
            name = raw_name.split(b"\x00", 1)[0].decode("latin-1", errors="replace")
            entries.append((name, off))
    return entries


# ---------------------------------------------------------------------------
# 3. Diablo II (.mpq) — Pure Python MPQ v1 reader
# ---------------------------------------------------------------------------
def _build_crypt_table():
    seed = 0x00100001
    table = [0] * 0x500
    for idx1 in range(0x100):
        idx2 = idx1
        for _ in range(5):
            seed = (seed * 125 + 3) % 0x2AAAAB
            t1 = (seed & 0xFFFF) << 0x10
            seed = (seed * 125 + 3) % 0x2AAAAB
            t2 = seed & 0xFFFF
            table[idx2] = t1 | t2
            idx2 += 0x100
    return table


_CRYPT = _build_crypt_table()


def _mpq_hash(s: str, hash_type: int) -> int:
    s1 = 0x7FED7FED
    s2 = 0xEEEEEEEE
    for ch in s.upper():
        c = ord(ch)
        s1 = _CRYPT[(hash_type << 8) + c] ^ ((s1 + s2) & 0xFFFFFFFF)
        s2 = (c + s1 + s2 + (s2 << 5) + 3) & 0xFFFFFFFF
    return s1


def _mpq_decrypt(data: bytes, key: int) -> bytes:
    out = bytearray(len(data))
    seed = 0xEEEEEEEE
    for i in range(0, len(data) - 3, 4):
        seed = (seed + _CRYPT[0x400 + (key & 0xFF)]) & 0xFFFFFFFF
        val = struct.unpack_from("<I", data, i)[0]
        val ^= (key + seed) & 0xFFFFFFFF
        key = (((~key << 0x15) + 0x11111111) | (key >> 0x0B)) & 0xFFFFFFFF
        seed = (val + seed + (seed << 5) + 3) & 0xFFFFFFFF
        struct.pack_into("<I", out, i, val)
    return bytes(out)


def _pkware_explode(src: bytes) -> bytes:
    """Minimal PKWare DCL explode for MPQ compressed blocks."""
    # Bit reader (LSB first)
    pos = 2
    if len(src) < 4:
        return src
    comp_type = src[0]
    dict_bits = src[1]
    if comp_type not in (0, 1) or dict_bits not in (4, 5, 6):
        raise ValueError(f"Unsupported PKWare DCL header: {comp_type}, {dict_bits}")

    bit_buf = 0
    bit_cnt = 0

    def read_bits(n: int) -> int:
        nonlocal pos, bit_buf, bit_cnt
        while bit_cnt < n:
            if pos >= len(src):
                raise EOFError("Unexpected EOF in PKWare stream")
            bit_buf |= src[pos] << bit_cnt
            pos += 1
            bit_cnt += 8
        val = bit_buf & ((1 << n) - 1)
        bit_buf >>= n
        bit_cnt -= n
        return val

    # Fixed length & distance tables from PKWare DCL
    LEN_BASE = [0,1,2,3,4,5,6,7,8,10,14,22,38,70,134,262]
    LEN_BITS = [0,0,0,0,0,0,0,0,1,2,3,4,5,6,7,8]
    LEN_CODE_BITS = [
        (0b0101,3),(0b11,2),(0b0100,3),(0b0011,3),(0b0110,4),(0b1100,4),(0b1010,4),(0b0010,4),
        (0b1110,4),(0b0001,4),(0b0111,5),(0b1111,5),(0b00001,5),(0b10001,5),(0b00000,6),(0b10000,6)
    ]
    DIST_CODE_BITS = [
        (0b11,2),(0b1011,4),(0b0111,4),(0b0011,4),(0b1101,5),(0b0101,5),(0b1001,5),(0b0001,5),
        (0b11110,6),(0b01110,6),(0b10110,6),(0b00110,6),(0b11010,6),(0b01010,6),(0b10010,6),(0b00010,6),
        (0b11100,6),(0b01100,6),(0b10100,6),(0b00100,6),(0b11000,6),(0b01000,6),(0b10000,7),(0b00000,7),
        (0b111110,7),(0b011110,7),(0b101110,7),(0b001110,7),(0b110110,7),(0b010110,7),(0b100110,7),(0b000110,7),
        (0b111010,7),(0b011010,7),(0b101010,7),(0b001010,7),(0b110010,7),(0b010010,7),(0b100010,7),(0b000010,7),
        (0b111100,7),(0b011100,7),(0b101100,7),(0b001100,7),(0b110100,7),(0b010100,7),(0b100100,7),(0b000100,7),
        (0b111000,8),(0b011000,8),(0b101000,8),(0b001000,8),(0b110000,8),(0b010000,8),(0b100000,8),(0b000000,8),
        (0b111111,8),(0b011111,8),(0b101111,8),(0b001111,8),(0b110111,8),(0b010111,8),(0b100111,8),(0b000111,8)
    ]

    # Build prefix lookup dicts
    def make_tree(spec):
        m = {}
        for idx, (bits_msb, n) in enumerate(spec):
            # Reverse n bits since stream is LSB-first
            rev = 0
            for b in range(n):
                if (bits_msb >> b) & 1:
                    rev |= 1 << (n - 1 - b)
            m[(n, rev)] = idx
        return m

    len_map = make_tree(LEN_CODE_BITS)
    dist_map = make_tree(DIST_CODE_BITS)

    def decode_sym(tmap, max_b):
        code = 0
        for n in range(1, max_b + 1):
            code |= read_bits(1) << (n - 1)
            if (n, code) in tmap:
                return tmap[(n, code)]
        raise ValueError("Invalid Huffman code in PKWare stream")

    out = bytearray()
    while True:
        flag = read_bits(1)
        if flag == 0:
            if comp_type == 0:
                out.append(read_bits(8))
            else:
                raise ValueError("ASCII PKWare mode not implemented")
        else:
            lidx = decode_sym(len_map, 6)
            length = LEN_BASE[lidx] + read_bits(LEN_BITS[lidx]) + 2
            if length == 519:
                break
            d_hi = decode_sym(dist_map, 8)
            if length == 2:
                dist = (d_hi << 2) | read_bits(2)
            else:
                dist = (d_hi << dict_bits) | read_bits(dict_bits)
            dist += 1
            for _ in range(length):
                out.append(out[-dist])
    return bytes(out)


class MpqArchive:
    def __init__(self, path: str):
        self.path = path
        self.f = open(path, "rb")
        data = self.f.read(32)
        magic, hdr_sz, arch_sz, fmt_ver, blk_shift, ht_off, bt_off, ht_cnt, bt_cnt = struct.unpack("<4s2I2H4I", data)
        if magic != b"MPQ\x1a":
            raise ValueError(f"Not an MPQ archive: {path}")
        self.sector_size = 512 << blk_shift
        self.f.seek(ht_off)
        self.hash_table = _mpq_decrypt(self.f.read(ht_cnt * 16), _mpq_hash("(hash table)", 3))
        self.f.seek(bt_off)
        self.block_table = _mpq_decrypt(self.f.read(bt_cnt * 16), _mpq_hash("(block table)", 3))
        self.ht_cnt = ht_cnt
        self.bt_cnt = bt_cnt

    def close(self):
        self.f.close()

    def _find_block(self, filename: str):
        h_idx = _mpq_hash(filename, 0) & (self.ht_cnt - 1)
        h_a = _mpq_hash(filename, 1)
        h_b = _mpq_hash(filename, 2)
        for step in range(self.ht_cnt):
            idx = (h_idx + step) & (self.ht_cnt - 1)
            na, nb, _loc, _plat, blk = struct.unpack_from("<2I2HI", self.hash_table, idx * 16)
            if blk == 0xFFFFFFFF:
                return None
            if blk != 0xFFFFFFFE and na == h_a and nb == h_b:
                return blk
        return None

    def read_file(self, filename: str) -> bytes | None:
        blk = self._find_block(filename)
        if blk is None or blk >= self.bt_cnt:
            return None
        off, csize, fsize, flags = struct.unpack_from("<4I", self.block_table, blk * 16)
        if not (flags & 0x80000000):
            return None
        base_key = _mpq_hash(filename.split("\\")[-1], 3)
        if flags & 0x02000000:
            base_key = ((base_key + off) ^ fsize) & 0xFFFFFFFF

        self.f.seek(off)
        if flags & 0x01000000:  # single unit
            raw = self.f.read(csize)
            if flags & 0x00010000:
                raw = _mpq_decrypt(raw, base_key)
            return self._decompress_unit(raw, fsize, flags)

        n_sectors = (fsize + self.sector_size - 1) // self.sector_size
        if flags & 0x00000300:  # compressed or imploded -> sector offset table
            tbl = self.f.read((n_sectors + 1) * 4)
            if flags & 0x00010000:
                tbl = _mpq_decrypt(tbl, (base_key - 1) & 0xFFFFFFFF)
            offsets = struct.unpack(f"<{n_sectors + 1}I", tbl)
        else:
            offsets = [i * self.sector_size for i in range(n_sectors)] + [fsize]

        out = bytearray()
        for i in range(n_sectors):
            s_off = offsets[i]
            s_len = offsets[i + 1] - s_off
            if s_len <= 0 or s_len > self.sector_size * 2:
                return None
            exp_len = min(self.sector_size, fsize - len(out))
            self.f.seek(off + s_off)
            sec = self.f.read(s_len)
            if flags & 0x00010000:
                sec = _mpq_decrypt(sec, (base_key + i) & 0xFFFFFFFF)
            if s_len < exp_len and (flags & 0x00000300):
                sec = self._decompress_sector(sec, flags)
            out.extend(sec)
        return bytes(out[:fsize])

    def _decompress_sector(self, sec: bytes, flags: int) -> bytes:
        if flags & 0x00000100:  # imploded
            return _pkware_explode(sec)
        if flags & 0x00000200:  # multi-compression
            mask = sec[0]
            payload = sec[1:]
            if mask & 0x02:
                return zlib.decompress(payload)
            if mask & 0x08:
                return _pkware_explode(payload)
            raise ValueError(f"Unsupported MPQ compression mask: {hex(mask)}")
        return sec

    def _decompress_unit(self, raw: bytes, fsize: int, flags: int) -> bytes:
        if len(raw) == fsize:
            return raw
        return self._decompress_sector(raw, flags)

    def list_files(self) -> list[str]:
        data = self.read_file("(listfile)")
        if not data:
            return []
        return [line.strip() for line in data.decode("latin-1", errors="replace").splitlines() if line.strip()]


def summarize_exts(names):
    c = Counter(os.path.splitext(n)[1].lower() or "<none>" for n in names)
    return dict(c.most_common())


def main():
    ap = argparse.ArgumentParser(description="Read-only reference archive inspector/extractor")
    ap.add_argument("action", choices=["inspect", "extract"])
    ap.add_argument("archive", help="Path to .res, .lod, .snd, .vid, .mpq, or .zip")
    ap.add_argument("--out", default=DEFAULT_OUT, help="Destination root under _extract")
    ap.add_argument("--prefix", default="", help="Optional path prefix filter (for MPQ)")
    args = ap.parse_args()

    p = args.archive
    ext = os.path.splitext(p)[1].lower()
    base = os.path.basename(p)

    if ext == ".res":
        entries = parse_rom2_res(p) if args.action == "inspect" else extract_rom2_res(p, os.path.join(args.out, "rom2", base))
        print(f"RES {base}: {len(entries)} files -> {summarize_exts(e[0] for e in entries)}")
    elif ext == ".lod":
        if args.action == "inspect":
            entries = parse_homm3_lod(p)
            print(f"LOD {base}: {len(entries)} files -> {summarize_exts(e[0] for e in entries)}")
        else:
            entries, n = extract_homm3_lod(p, os.path.join(args.out, "homm3", base), exts=[".txt", ".json", ".h3t", ".def"])
            print(f"LOD {base}: extracted {n}/{len(entries)}")
    elif ext == ".snd":
        entries = parse_homm3_snd(p)
        print(f"SND {base}: {len(entries)} files -> {summarize_exts(e[0] for e in entries)}")
    elif ext == ".vid":
        entries = parse_homm3_vid(p)
        print(f"VID {base}: {len(entries)} files -> {summarize_exts(e[0] for e in entries)}")
    elif ext == ".mpq":
        mpq = MpqArchive(p)
        try:
            files = mpq.list_files()
            if args.action == "inspect":
                print(f"MPQ {base}: {len(files)} listed files (blocks={mpq.bt_cnt}) -> {summarize_exts(files)}")
            else:
                out_root = os.path.join(args.out, "d2", base)
                extracted = 0
                for rel in files:
                    if args.prefix and not rel.lower().startswith(args.prefix.lower()):
                        continue
                    data = mpq.read_file(rel)
                    if data is None:
                        continue
                    dest = os.path.join(out_root, rel.replace("\\", os.sep))
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    with open(dest, "wb") as out:
                        out.write(data)
                    extracted += 1
                print(f"MPQ {base}: extracted {extracted} files matching '{args.prefix}'")
        finally:
            mpq.close()
    elif ext == ".zip":
        with zipfile.ZipFile(p) as zf:
            names = zf.namelist()
            if args.action == "inspect":
                print(f"ZIP {base}: {len(names)} files -> {summarize_exts(names)}")
            else:
                dest = os.path.join(args.out, "zip", base)
                zf.extractall(dest)
                print(f"ZIP {base}: extracted {len(names)} files to {dest}")
    else:
        print(f"Unsupported archive: {p}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

# Reference Archive Inventory

All inspection and extraction is performed read-only via `tools/extract-ref.py`, writing raw files strictly outside the repository to `D:\ROM 2 clone\_extract\`.

## 1. Rage of Mages II (`D:\Games\Rage of Mages II`)
- **Format:** Nival `.res` (`0x31415926` little-endian magic, 24-byte header + 32-byte FAT records, recursive directory tree).
- **Extraction Method:** Pure Python (`tools/extract-ref.py`), 100% readable.

| Archive | Size (MB) | Files | File Types |
|---|---:|---:|---|
| `music.res` | 133.6 | 21 | `.wav` (21) |
| `video.res` | 115.7 | 16 | `.reg` (8), `.smk` (8) |
| `speech.res` | 104.8 | 1,133 | `.wav` (1,133) |
| `graphics.res` | 102.0 | 4,049 | `.256` (1,929), `.bmp` (1,325), `.16a` (623), `.pal` (159), `.reg` (5), `.dat` (5), `.16` (3) |
| `sfx.res` | 17.4 | 446 | `.wav` (445), `.reg` (1) |
| `main.res` | 6.3 | 104 | `.txt` (67), `.bmp` (34), `.pat` (1), `.exe` (1), other (1) |
| `scenario.res` | 5.3 | 47 | `.alm` (46), `.reg` (1) |
| `movies.res` | 4.8 | 156 | `.bmp` (156) |
| `world.res` | 0.15 | 5 | `.reg` (2), `.bin` (2), `.pkt` (1) |
| `patch.res` | <0.1 | 1 | `.txt` (1) |

## 2. Diablo II (`D:\Games\Diablo II`)
- **Format:** MoPaQ `.mpq` v1 (`MPQ\x1a` magic, hash table + block table, zlib & PKWare DCL compression).
- **Extraction Method:** Pure Python MPQ v1 reader (`tools/extract-ref.py`). Archives with `(listfile)` list all entries; archives without readable `(listfile)` (`d2exp.mpq`, `patch_d2.mpq`) can still be queried by known `data\global\excel\*.txt` paths.

| Archive | Size (MB) | Listed / Blocks | Key File Types |
|---|---:|---:|---|
| `d2video.mpq` | 421.2 | 0 / 17 blocks | Video streams |
| `d2music.mpq` | 332.3 | 0 / 45 blocks | Music streams |
| `d2data.mpq` | 256.7 | 10,841 / 10,879 | `.dcc` (5,319), `.cof` (2,017), `.ds1` (1,771), `.dc6` (1,287), `.dt1` (206), `.txt` (83), `.dat` (82), `.tbl` (18) |
| `d2char.mpq` | 253.7 | 10,031 / 10,038 | `.dcc` (9,484), `.cof` (525), `.dll` (19) |
| `d2exp.mpq` | 238.6 | 0 / 9,888 blocks | Expansion assets & excel overrides |
| `d2speech.mpq` | 155.5 | 0 / 1,566 blocks | Voice `.wav` |
| `d2xvideo.mpq` | 105.6 | 0 / 6 blocks | Expansion video |
| `d2xtalk.mpq` | 57.5 | 0 / 478 blocks | Expansion voice |
| `d2xmusic.mpq` | 52.2 | 0 / 12 blocks | Expansion music |
| `d2sfx.mpq` | 46.7 | 2,328 / 2,330 | `.wav` (2,328) |
| `patch_d2.mpq` | 5.5 | 0 / 210 blocks | Patch excel/code overrides |

## 3. Diablo II Item Collection (`D:\Games\d2 items`)
- **Format:** Standard `.zip` (`PK\x03\x04`).
- **Archive:** `Diablo-2.net-Item-File-Collection.zip` (0.49 MB) — 1,869 files (`.d2i`: 1,706, `<none>`: 161, `.item`: 2).

## 4. Heroes of Might and Magic III Complete (`D:\HoMM 3 Complete\Data`)
- **Formats:**
  - `.lod` (`LOD\x00` magic, zlib-compressed entries). Note: `HotA.lod` uses custom HotA header/table extensions (`HotA_ext.lod` header variant) so its raw filenames show custom tags.
  - `.snd` (4-byte count + 48-byte records of name/offset/size; raw WAV/PCM entries without extensions).
  - `.vid` (4-byte count + 44-byte records of name/offset; `.smk` and `.bik` videos).

| Archive | Size (MB) | Files | File Types |
|---|---:|---:|---|
| `VIDEO.VID` | 599.8 | 173 | `.smk` (115), `.bik` (58) |
| `HotA.vid` | 114.5 | 57 | `.bik` (57) |
| `HotA.lod` | 104.0 | 5,169 | HotA custom LOD entries |
| `H3bitmap.lod` | 100.8 | 4,908 | `.pcx` (4,809), `.txt` (71), `.h3c` (14), `.fnt` (9), `.pal` (3) |
| `H3sprite.lod` | 62.0 | 4,013 | `.def` (2,565), `.msk` (1,448) |
| `H3ab_bmp.lod` | 42.0 | 2,491 | `.pcx` (2,406), `.txt` (71), `.h3c` (14) |
| `Heroes3.snd` | 41.7 | 1,115 | Sound entries (1,115) |
| `HotA.snd` | 12.1 | 278 | Sound entries (278) |
| `H3ab_spr.lod` | 11.6 | 569 | `.def` (347), `.msk` (222) |
| `HotA_lng.lod` | 8.6 | 224 | `.def` (92), `.txt` (59), `.msk` (40), `.pcx` (22), `.h3c` (11) |
| `H3ab_ahd.snd` | ~3.0 | 117 | Sound entries (117) |
| `H3ab_ahd.vid` | ~5.0 | 7 | `.bik` (6), `.smk` (1) |
| `HotA_lng.snd` | <1.0 | 23 | Sound entries (23) |

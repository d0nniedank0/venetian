"""E2E-1 verification: open the ZIP Python's zipfile and compare byte-for-byte."""
import hashlib
import pathlib
import zipfile

zpath = pathlib.Path(__file__).parent / "zipcheck" / "strips.zip"
with zipfile.ZipFile(zpath) as z:
    names = z.namelist()
    assert names == [f"strips-{i:02d}.png" for i in (1, 2, 3)], names
    for i, name in enumerate(names, 1):
        data = z.read(name)
        assert len(data) == 1000 * i, (name, len(data))
        ref = bytes((j * i) & 0xFF for j in range(1000 * i))
        assert hashlib.sha256(data).hexdigest() == hashlib.sha256(ref).hexdigest(), name
    bad = z.testzip()
    assert bad is None, bad
print("ZIP OK — real extractor reads all entries byte-for-byte")

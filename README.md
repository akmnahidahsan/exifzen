<!--

# ExifZen

A responsive, browser-first image metadata utility built with React and Vite. Existing dark/gold UI and local-file workflow are retained.

## Run locally

```bash
npm install
npm run dev
```

Build with `npm run build`.

## Implemented capabilities

- **Metadata reading:** ExifReader and Exifr attempt to read available EXIF, GPS, IPTC, XMP, ICC and image/container fields. Readers expose only a subset of metadata supported by their parser and file type; absent fields are not inferred.
- **JPEG metadata writing:** user-entered Make, Model, Software, DateTime, DateTimeOriginal, DateTimeDigitized, Artist, Copyright, ImageDescription, UserComment, LensMake, LensModel and GPS latitude/longitude/altitude. GPS coordinates are validated and written as EXIF GPS tags. This uses piexifjs and is not a general-purpose IPTC/XMP writer.
- **Keep vs clear:** when the clear-existing option is selected, existing EXIF IFD fields are cleared before the entered fields are written. Other JPEG metadata blocks (for example XMP/IPTC/comments) may survive; this is not a guaranteed complete scrub.
- **Metadata removal:** JPEG, PNG, WebP and AVIF may be decoded and re-encoded through a browser canvas when the browser supports them. The generated image is re-scanned with the available metadata readers and the app displays a before/after scan summary. Canvas re-encoding generally drops metadata not carried through pixel decode/encode, but this is not a forensic guarantee.
- **Batch + ZIP:** tries each file individually; unsupported files are skipped and their status is shown.
- **JSON report:** downloads the scan result and output status. Session custom values are report annotations only, not embedded metadata.
- **Local processing:** image bytes are handled in the browser; there is no image upload endpoint. The CSS references Google Fonts, which may make a separate font request. Remove its `@import` for no external font request.

## Format support matrix

| Format | View | Write/edit | Removal output |
|---|---|---|---|
| JPEG | Best-effort EXIFReader/Exifr | Selected EXIF fields via piexifjs | Canvas re-encode; pixel quality may change |
| PNG | Best-effort | Not implemented | Canvas re-encode if browser decodes/exports it; transparency usually retained but must be checked |
| WebP | Best-effort | Not implemented | Canvas re-encode if supported; animation may be lost |
| AVIF | Best-effort | Not implemented | Conditional on browser decode/export support |
| HEIC/HEIF | Parser-dependent | Not implemented | Disabled; browser support is inconsistent |
| TIFF | Parser-dependent | Not implemented | Disabled; browser support is inconsistent |

## Verification and limitations

After editing or clean export, ExifZen scans the generated Blob again and compares the metadata exposed by its readers. A field missing from the output scan is reported as not detected, not proof that every metadata block was removed. For sensitive use, verify with an independent metadata utility too. Canvas re-encoding can change image quality, color/ICC profile, dimensions/orientation behavior, animation, transparency, and format. JPEG EXIF editing preserves compressed pixel data but does not guarantee that all non-EXIF metadata blocks are removed. Per-field removal, comprehensive IPTC/XMP writing, GPS-only removal, and HEIC/HEIF/TIFF rewriting are not implemented in this browser-only version.
-->

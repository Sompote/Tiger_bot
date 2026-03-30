---
name: "nano-banana-pro"
description: "Generates images from text prompts, edits existing images, and composes multi-image scenes using Gemini 3 Pro Image. Use when the user asks to create an image, edit a photo, generate a picture, produce AI art, or combine multiple images into one scene."
metadata:
  homepage: "https://ai.google.dev/"
---

# Nano Banana Pro (Gemini 3 Pro Image)

Generates and edits images via the bundled `generate_image.py` script powered by Gemini 3 Pro Image.

## Commands

**Generate an image from a text prompt:**
```bash
uv run {baseDir}/scripts/generate_image.py --prompt "your image description" --filename "output.png" --resolution 1K
```

**Edit an existing image:**
```bash
uv run {baseDir}/scripts/generate_image.py --prompt "edit instructions" --filename "output.png" -i "/path/in.png" --resolution 2K
```

**Compose multiple images (up to 14):**
```bash
uv run {baseDir}/scripts/generate_image.py --prompt "combine these into one scene" --filename "output.png" -i img1.png -i img2.png -i img3.png
```

## Setup

- Set `GEMINI_API_KEY` as an environment variable, or configure `skills."nano-banana-pro".apiKey` in `~/.clawdbot/moltbot.json`.
- Requires `uv` on PATH.

## Verification

After running a command, confirm the output file exists at the reported path before telling the user it succeeded. If the script exits with an error, check that `GEMINI_API_KEY` is set and the input image path (if editing) is valid.

## Notes

- Resolutions: `1K` (default), `2K`, `4K`.
- Use timestamps in filenames: `yyyy-mm-dd-hh-mm-ss-name.png`.
- The script prints a `MEDIA:` line for Moltbot to auto-attach on supported chat providers.
- Do not read the image back; report the saved path only.

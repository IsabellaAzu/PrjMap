#!/usr/bin/env python3
"""Build the offline, single-file application from editable source files."""

from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "src"
OUTPUT = ROOT / "arroundMe.html"


def main() -> None:
    template = (SOURCE / "template.html").read_text(encoding="utf-8")
    css_files = sorted((SOURCE / "css").glob("*.css"))
    if not css_files:
        raise SystemExit("No CSS source files found in src/css")
    css = "\n\n".join(path.read_text(encoding="utf-8").rstrip() for path in css_files)
    js_files = sorted((SOURCE / "js").glob("*.js"))
    if not js_files:
        raise SystemExit("No JavaScript source files found in src/js")

    javascript = "\n\n".join(path.read_text(encoding="utf-8").rstrip() for path in js_files)
    output = template.replace("  <!-- @styles -->", f"  <style>\n{css}\n  </style>")
    output = output.replace("  <!-- @scripts -->", f"  <script>\n{javascript}\n  </script>")
    if "<!-- @styles -->" in output or "<!-- @scripts -->" in output:
        raise SystemExit("Build placeholders were not replaced")

    OUTPUT.write_text(output, encoding="utf-8")
    print(f"Built {OUTPUT.relative_to(ROOT)} ({len(output.splitlines())} lines)")


if __name__ == "__main__":
    main()

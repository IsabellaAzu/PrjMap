# PrjMap / InMyMind

The deliverable is `arroundMe.html`, a standalone offline application. Edit the source under `src/`, then rebuild the HTML with Python 3:

```sh
python3 build.py
```

## Source layout

- `src/template.html`: page markup and build placeholders
- `src/css/`: styles grouped by page area, loaded in filename order
- `src/js/`: application logic grouped by feature, loaded in filename order

The JavaScript files are concatenated into one classic script, so they share the existing application scope and the output still works when opened directly from disk. Keep cross-file definitions in execution order; add a numbered filename when introducing another source file.

Nodes can have multiple tags. The tag editor appears when nodes are selected; the header's `表示タグ` menu hides or shows tagged nodes without changing their data. Untagged nodes stay visible, and a group is shown when any of its tags is enabled.

Edit the source files rather than `arroundMe.html`; rebuilding replaces the generated deliverable. No package manager or external dependency is required.

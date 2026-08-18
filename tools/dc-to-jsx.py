#!/usr/bin/env python3
"""Convert a Claude Design .dc.html prototype body into JSX.

Handles: {{ holes }}, sc-for, sc-if, style="" -> style objects, class -> className,
hyphenated SVG attributes -> camelCase, image-slot -> <ImageSlot/>.
"""
import re, sys, json
from html.parser import HTMLParser

VOID = {"input", "br", "img", "hr", "meta", "link", "source", "circle", "path",
        "line", "rect", "stop", "polyline", "polygon", "ellipse", "use"}

# SVG / HTML attributes React wants camelCased
CAMEL = {
    "stroke-width": "strokeWidth", "stroke-dasharray": "strokeDasharray",
    "stroke-linecap": "strokeLinecap", "stroke-linejoin": "strokeLinejoin",
    "stroke-opacity": "strokeOpacity", "fill-opacity": "fillOpacity",
    "font-size": "fontSize", "font-family": "fontFamily", "font-weight": "fontWeight",
    "text-anchor": "textAnchor", "stop-color": "stopColor", "stop-opacity": "stopOpacity",
    "clip-path": "clipPath", "dominant-baseline": "dominantBaseline",
    "letter-spacing": "letterSpacing", "class": "className", "for": "htmlFor",
    "viewbox": "viewBox", "preserveaspectratio": "preserveAspectRatio",
    "maxlength": "maxLength", "colspan": "colSpan", "rowspan": "rowSpan",
    "tabindex": "tabIndex", "readonly": "readOnly", "autocomplete": "autoComplete",
    "onclick": "onClick", "onchange": "onChange", "oninput": "onInput",
    "onkeydown": "onKeyDown", "onkeyup": "onKeyUp", "onmousemove": "onMouseMove",
    "onmouseleave": "onMouseLeave", "onmouseenter": "onMouseEnter",
    "onfocus": "onFocus", "onblur": "onBlur", "onsubmit": "onSubmit",
}

# HTMLParser lowercases tag names; SVG needs the original casing back
TAG_CASE = {
    "lineargradient": "linearGradient", "radialgradient": "radialGradient",
    "clippath": "clipPath", "textpath": "textPath", "foreignobject": "foreignObject",
    "fegaussianblur": "feGaussianBlur", "femerge": "feMerge",
    "femergenode": "feMergeNode", "feoffset": "feOffset", "feblend": "feBlend",
    "fecolormatrix": "feColorMatrix", "fedropshadow": "feDropShadow",
}

DROP = {"hint-placeholder-val", "hint-placeholder-count", "data-screen-label",
        "style-hover", "style-focus", "xmlns"}

NUMERIC_ATTRS = {"rows", "cols", "size", "span", "start", "maxLength", "colSpan", "rowSpan", "tabIndex"}

HOLE = re.compile(r"\{\{\s*(.*?)\s*\}\}")


def css_prop(p):
    p = p.strip()
    if p.startswith("--"):
        return f'"{p}"'
    parts = p.split("-")
    return parts[0] + "".join(w.capitalize() for w in parts[1:])


def style_to_obj(v):
    """`a:b;c:d` -> `{{ a: 'b', c: 'd' }}`; values may contain {{ holes }}."""
    out = []
    for decl in v.split(";"):
        if not decl.strip():
            continue
        if ":" not in decl:
            continue
        k, _, val = decl.partition(":")
        val = val.strip()
        key = css_prop(k)
        m = HOLE.fullmatch(val)
        if m:
            out.append(f"{key}: {m.group(1)}")
        elif HOLE.search(val):
            # mixed literal + hole -> template literal
            tpl = HOLE.sub(lambda mm: "${" + mm.group(1) + "}", val)
            tpl = tpl.replace("`", "\\`")
            out.append(f"{key}: `{tpl}`")
        else:
            out.append(f"{key}: {json.dumps(val)}")
    return "{{ " + ", ".join(out) + " }}"


def attr_value(name, v):
    if v is None:
        return None
    m = HOLE.fullmatch(v.strip())
    if m:
        return "{" + m.group(1) + "}"
    if HOLE.search(v):
        tpl = HOLE.sub(lambda mm: "${" + mm.group(1) + "}", v).replace("`", "\\`")
        return "{`" + tpl + "`}"
    if name in NUMERIC_ATTRS:
        try:
            return "{" + str(int(v)) + "}"
        except (TypeError, ValueError):
            pass
    # ensure_ascii=False matters: a JSX attribute string is a *raw* string, not a
    # JS string literal — no escape processing happens. json.dumps would turn "•"
    # into the six characters •, which then render literally on the page.
    return json.dumps(v, ensure_ascii=False)


def text_to_jsx(t):
    if not t.strip():
        return t if ("\n" not in t or t.strip()) else ""
    # escape braces that are not holes
    parts = []
    last = 0
    for m in HOLE.finditer(t):
        lit = t[last:m.start()]
        parts.append(lit.replace("{", "&#123;").replace("}", "&#125;"))
        parts.append("{" + m.group(1) + "}")
        last = m.end()
    parts.append(t[last:].replace("{", "&#123;").replace("}", "&#125;"))
    return "".join(parts)


class Conv(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.out = []
        self.stack = []
        self._loop = 0

    def emit(self, s):
        self.out.append(s)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "sc-for":
            lst = HOLE.fullmatch(a.get("list", "").strip())
            var = a.get("as", "item")
            expr = lst.group(1) if lst else a.get("list", "[]")
            self._loop += 1
            ix = f"_i{self._loop}"
            self.emit(f"{{{expr}.map(({var}, {ix}) => (<React.Fragment key={{{ix}}}>")
            self.stack.append("sc-for")
            return
        if tag == "sc-if":
            val = HOLE.fullmatch(a.get("value", "").strip())
            expr = val.group(1) if val else a.get("value", "false")
            self.emit(f"{{({expr}) ? (<>")
            self.stack.append("sc-if")
            return
        if tag == "image-slot":
            self.emit(f'<ImageSlot style={style_to_obj(a.get("style",""))} label={json.dumps(a.get("placeholder",""))} />')
            self.stack.append("image-slot")
            return

        tag = TAG_CASE.get(tag, tag)
        # style-hover / style-focus become small utility classes (see globals.css)
        extra_cls = []
        hv = a.get("style-hover", "")
        fc = a.get("style-focus", "")
        if "background" in hv:
            extra_cls.append("dc-hover-bg")
        if "border-color" in hv:
            extra_cls.append("dc-hover-border")
        if "border-color" in fc:
            extra_cls.append("dc-focus-accent")

        # merge duplicate class attributes (the prototypes sometimes emit two)
        classes, merged = [], []
        for k, v in attrs:
            lk = k.lower()
            if lk in DROP:
                continue
            if lk == "class":
                if v:
                    classes.append(v)
                continue
            merged.append((k, v))
        classes.extend(extra_cls)

        pieces = [f"<{tag}"]
        if classes:
            pieces.append(" className=" + attr_value("className", " ".join(classes)))
        for k, v in merged:
            lk = k.lower()
            if lk == "style":
                pieces.append(f" style={style_to_obj(v or '')}")
                continue
            name = CAMEL.get(lk, k)
            av = attr_value(name, v)
            if av is None:
                pieces.append(f" {name}")
            else:
                pieces.append(f" {name}={av}")
        if tag in VOID:
            pieces.append(" />")
            self.emit("".join(pieces))
        else:
            pieces.append(">")
            self.emit("".join(pieces))
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID and self.stack and self.stack[-1] == tag:
            self.stack.pop()
            self.emit(f"</{tag}>")

    def handle_endtag(self, tag):
        if not self.stack:
            return
        if tag == "sc-for":
            self.stack.pop(); self.emit("</React.Fragment>))}"); return
        if tag == "sc-if":
            self.stack.pop(); self.emit("</>) : null}"); return
        if tag == "image-slot":
            self.stack.pop(); return
        tag = TAG_CASE.get(tag, tag)
        if tag in VOID:
            return
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()
        self.emit(f"</{tag}>")

    def handle_data(self, d):
        self.emit(text_to_jsx(d))

    def handle_entityref(self, name):
        self.emit(f"&{name};")

    def handle_charref(self, name):
        self.emit(f"&#{name};")

    def handle_comment(self, d):
        pass


def convert(path, out):
    s = open(path, encoding="utf-8").read()
    body = re.search(r"<x-dc[^>]*>(.*?)</x-dc>", s, re.S).group(1)
    body = re.sub(r"<helmet>.*?</helmet>", "", body, flags=re.S)
    c = Conv()
    c.feed(body)
    open(out, "w", encoding="utf-8").write("".join(c.out))
    print(f"{path} -> {out}  ({len(''.join(c.out))} chars)")


if __name__ == "__main__":
    convert(sys.argv[1], sys.argv[2])

"""Serve Range Wall Architect full-screen on Streamlit Community Cloud."""

import base64
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

ROOT = Path(__file__).resolve().parent
SCRIPTS = ("generator.js", "draw.js", "sheet.js", "app.js")
LOGO = ROOT / "assets" / "centurion-logo.png"

st.set_page_config(
    page_title="Range Wall Architect — Centurion Invictus",
    page_icon=str(LOGO) if LOGO.exists() else "🎯",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
      html, body, .stApp, [data-testid="stAppViewContainer"],
      [data-testid="stMain"], [data-testid="stMainBlockContainer"] {
        margin: 0 !important;
        padding: 0 !important;
        max-width: 100% !important;
        background: #0c0f12 !important;
        overflow: hidden !important;
      }
      header, footer, #MainMenu, .stDeployButton,
      [data-testid="stHeader"], [data-testid="stToolbar"],
      [data-testid="stDecoration"], [data-testid="stStatusWidget"],
      [data-testid="stBottom"] { display: none !important; }
      .block-container {
        padding: 0 !important;
        max-width: 100% !important;
      }
      iframe {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        width: 100dvw !important;
        height: 100vh !important;
        height: 100dvh !important;
        min-height: 100dvh !important;
        border: 0 !important;
        z-index: 999 !important;
      }
    </style>
    """,
    unsafe_allow_html=True,
)


def build_html() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "css" / "style.css").read_text(encoding="utf-8")
    html = html.replace(
        '<link rel="stylesheet" href="css/style.css" />',
        f"<style>\n{css}\n</style>",
        1,
    )
    if LOGO.exists():
        data_uri = "data:image/png;base64," + base64.b64encode(LOGO.read_bytes()).decode("ascii")
        html = html.replace("assets/centurion-logo.png", data_uri)
    for name in SCRIPTS:
        html = html.replace(f'<script src="js/{name}"></script>\n', "", 1)
    js = "\n".join((ROOT / "js" / name).read_text(encoding="utf-8") for name in SCRIPTS)
    filler = """
<script>
(function () {
  function fillParent() {
    try {
      var frame = window.frameElement;
      if (!frame) return;
      frame.style.position = "fixed";
      frame.style.inset = "0";
      frame.style.width = "100vw";
      frame.style.height = (window.visualViewport && window.visualViewport.height)
        ? (window.visualViewport.height + "px")
        : "100dvh";
      frame.style.border = "0";
      frame.style.zIndex = "999";
    } catch (err) { /* cross-origin: parent CSS still sizes the iframe */ }
  }
  fillParent();
  window.addEventListener("resize", fillParent);
})();
</script>
"""
    html = html.replace("</body>", f"{filler}<script>\n{js}\n</script>\n</body>", 1)
    return html


components.html(build_html(), height=900, scrolling=False)

// The postMessage bridge logic for persisting edits made in the sandboxed
// iframe. `captureDocumentHtml` is injected into the iframe (serialized via
// .toString()), so it must be fully self-contained: no imports, no references
// to anything outside its own body. `buildSrcdoc` wraps a page's HTML with the
// injected agent for rendering.

/**
 * Serialize a document to standalone HTML with current form state baked in.
 *
 * Browsers do not reflect typed `input.value`, `textarea.value`, checked, or
 * selected state into the serialized markup, so this copies live values onto
 * attributes before serializing. It then strips the injected capture agent so
 * saved pages do not accumulate it. Self-contained by design (see file note).
 */
export function captureDocumentHtml(doc: Document): string {
  doc.querySelectorAll("input").forEach((el) => {
    const input = el as HTMLInputElement;
    if (input.type === "checkbox" || input.type === "radio") {
      if (input.checked) input.setAttribute("checked", "");
      else input.removeAttribute("checked");
    } else {
      input.setAttribute("value", input.value);
    }
  });
  doc.querySelectorAll("textarea").forEach((el) => {
    const area = el as HTMLTextAreaElement;
    area.textContent = area.value;
  });
  doc.querySelectorAll("select").forEach((el) => {
    const options = (el as HTMLSelectElement).options;
    for (let i = 0; i < options.length; i += 1) {
      if (options[i].selected) options[i].setAttribute("selected", "");
      else options[i].removeAttribute("selected");
    }
  });
  const root = doc.documentElement.cloneNode(true) as HTMLElement;
  const agent = root.querySelector("#pm-capture-agent");
  if (agent) agent.remove();
  return "<!DOCTYPE html>\n" + root.outerHTML;
}

/**
 * Wrap a page's HTML with the capture agent for rendering in the iframe. The
 * agent listens for a `pm:capture` message and replies with `pm:html`
 * carrying the serialized document. `targetOrigin` is `*` because the sandbox
 * (no allow-same-origin) gives the frame an opaque "null" origin.
 */
export function buildSrcdoc(html: string): string {
  const agent =
    `<script id="pm-capture-agent">(function(){` +
    `var capture=${captureDocumentHtml.toString()};` +
    `window.addEventListener("message",function(e){` +
    `if(e&&e.data&&e.data.type==="pm:capture"){` +
    `(e.source||window.parent).postMessage(` +
    `{type:"pm:html",html:capture(document)},"*");}});})();` +
    `</scr` +
    `ipt>`;
  return html + agent;
}

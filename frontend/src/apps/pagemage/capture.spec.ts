import { describe, it, expect } from "vitest";
import { captureDocumentHtml, buildSrcdoc } from "./capture";

function docFrom(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("captureDocumentHtml", () => {
  it("reflects a typed text input value into the serialized html", () => {
    const doc = docFrom("<body><input id='a'></body>");
    (doc.getElementById("a") as HTMLInputElement).value = "typed";
    const out = captureDocumentHtml(doc);
    expect(out).toContain('value="typed"');
  });

  it("reflects checkbox state", () => {
    const doc = docFrom("<body><input type='checkbox' id='c'></body>");
    (doc.getElementById("c") as HTMLInputElement).checked = true;
    const out = captureDocumentHtml(doc);
    expect(out).toMatch(/<input[^>]*checked/);
  });

  it("reflects textarea content", () => {
    const doc = docFrom("<body><textarea id='t'></textarea></body>");
    (doc.getElementById("t") as HTMLTextAreaElement).value = "hello";
    const out = captureDocumentHtml(doc);
    expect(out).toContain("hello</textarea>");
  });

  it("reflects the selected option", () => {
    const doc = docFrom(
      "<body><select id='s'><option>one</option><option>two</option></select></body>",
    );
    (doc.getElementById("s") as HTMLSelectElement).value = "two";
    const out = captureDocumentHtml(doc);
    expect(out).toMatch(/<option selected[^>]*>two<\/option>/);
  });

  it("strips the injected capture agent from the output", () => {
    const doc = docFrom(
      "<body><script id='pm-capture-agent'>void 0;</script></body>",
    );
    const out = captureDocumentHtml(doc);
    expect(out).not.toContain("pm-capture-agent");
  });

  it("emits a full document starting with a doctype", () => {
    const doc = docFrom("<body><p>x</p></body>");
    expect(captureDocumentHtml(doc).startsWith("<!DOCTYPE html>")).toBe(true);
  });
});

describe("buildSrcdoc", () => {
  it("includes the page html and the capture agent marker", () => {
    const srcdoc = buildSrcdoc("<p>page</p>");
    expect(srcdoc).toContain("<p>page</p>");
    expect(srcdoc).toContain("pm-capture-agent");
    expect(srcdoc).toContain("pm:capture");
  });
});

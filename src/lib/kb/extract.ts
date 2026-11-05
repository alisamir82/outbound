import JSZip from "jszip";
import mammoth from "mammoth";
import { convert } from "html-to-text";
import { PDFParse } from "pdf-parse";

export type KbSourceType = "pdf" | "docx" | "pptx" | "txt" | "md" | "url";

export function detectType(filename: string, mime?: string): KbSourceType | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  if (ext === "txt") return "txt";
  if (ext === "md" || ext === "markdown") return "md";
  return null;
}

/** Extracts plain text from an uploaded file. Throws on unsupported or empty content. */
export async function extractText(type: KbSourceType, data: Buffer): Promise<string> {
  let text = "";
  switch (type) {
    case "pdf": {
      const parser = new PDFParse({ data });
      try {
        const result = await parser.getText();
        text = result.text;
      } finally {
        await parser.destroy();
      }
      break;
    }
    case "docx": {
      const result = await mammoth.extractRawText({ buffer: data });
      text = result.value;
      break;
    }
    case "pptx": {
      const zip = await JSZip.loadAsync(data);
      const slides = Object.keys(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
        .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
      const parts: string[] = [];
      for (const [i, name] of slides.entries()) {
        const xml = await zip.file(name)!.async("string");
        const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1]));
        if (runs.length) parts.push(`Slide ${i + 1}\n${runs.join(" ")}`);
      }
      text = parts.join("\n\n");
      break;
    }
    case "txt":
    case "md":
      text = data.toString("utf8");
      break;
    case "url":
      throw new Error("use fetchUrlText for URLs");
  }
  text = normalise(text);
  if (text.length < 50) throw new Error("No readable text found in the document");
  return text;
}

export async function fetchUrlText(url: string): Promise<{ text: string; title: string }> {
  const res = await fetch(url, { headers: { "User-Agent": "AI-Outbound-KB/1.0" }, redirect: "follow" });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const html = await res.text();
  const title = decodeXml(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? url).trim();
  const text = normalise(
    convert(html, {
      wordwrap: false,
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
        { selector: "nav", format: "skip" },
        { selector: "footer", format: "skip" },
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" },
      ],
    }),
  );
  if (text.length < 50) throw new Error("No readable text found at that URL");
  return { text, title };
}

function decodeXml(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
}

function normalise(s: string) {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

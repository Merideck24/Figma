import { complete, isLiveMode } from "../claudeClient.js";

const SYSTEM_PROMPT = `You are a product marketing strategist who builds clear, persuasive
product presentations. Given a product, its description, the target audience and the
presentation goal, design a slide deck that tells a story: hook, problem, solution, key
features, benefits for this audience, proof/differentiators, pricing or offer (if known)
and a clear call to action.

Rules:
- Write every slide in the requested language.
- Each slide has a short title (max 60 chars), 2-5 concise bullets (max 110 chars each)
  and speaker notes (2-4 sentences the presenter can say out loud).
- Never invent hard facts (prices, metrics, customer names) that were not provided;
  use placeholders like "[precio]" or "[dato de cliente]" instead.
- Respond with ONLY a JSON object, no markdown fences, with this exact shape:
  {"title": string, "subtitle": string, "slides": [{"title": string, "bullets": string[], "speakerNotes": string}]}`;

export interface ProductPresentationRequest {
  product: string;
  description?: string;
  audience: string;
  goal?: string;
  tone?: string;
  language?: string;
  slideCount?: number;
}

export interface Slide {
  title: string;
  bullets: string[];
  speakerNotes: string;
}

export interface PresentationDeck {
  title: string;
  subtitle: string;
  slides: Slide[];
}

const DEFAULT_SLIDE_COUNT = 8;
const MIN_SLIDES = 3;
const MAX_SLIDES = 15;

export async function generateProductPresentation(req: ProductPresentationRequest): Promise<PresentationDeck> {
  const slideCount = clampSlideCount(req.slideCount);
  const language = req.language ?? "español";

  if (!isLiveMode) return mockDeck(req, slideCount);

  const prompt = [
    `Product: ${req.product}`,
    `Description: ${req.description ?? "(not provided)"}`,
    `Target audience: ${req.audience}`,
    `Presentation goal: ${req.goal ?? "present the product and win interest"}`,
    `Tone: ${req.tone ?? "professional and enthusiastic"}`,
    `Language: ${language}`,
    `Number of content slides: ${slideCount}`,
  ].join("\n");

  const raw = await complete(SYSTEM_PROMPT, prompt, 4096);
  const deck = parseDeck(raw);
  if (!deck) throw new Error("Claude returned a presentation that could not be parsed");
  return deck;
}

function clampSlideCount(n: number | undefined): number {
  if (!n || !Number.isFinite(n)) return DEFAULT_SLIDE_COUNT;
  return Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, Math.round(n)));
}

/** Extracts and validates the JSON deck, tolerating stray prose or code fences around it. */
export function parseDeck(raw: string): PresentationDeck | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  const d = data as Partial<PresentationDeck>;
  if (typeof d.title !== "string" || !Array.isArray(d.slides)) return null;

  const slides = d.slides
    .filter((s): s is Slide => typeof s?.title === "string")
    .map((s) => ({
      title: s.title,
      bullets: Array.isArray(s.bullets) ? s.bullets.filter((b) => typeof b === "string") : [],
      speakerNotes: typeof s.speakerNotes === "string" ? s.speakerNotes : "",
    }));
  if (slides.length === 0) return null;

  return { title: d.title, subtitle: typeof d.subtitle === "string" ? d.subtitle : "", slides };
}

/** Deterministic deck used when ANTHROPIC_API_KEY is not set, so the skill stays testable offline. */
function mockDeck(req: ProductPresentationRequest, slideCount: number): PresentationDeck {
  const outline: Slide[] = [
    { title: "El reto", bullets: [`Lo que hoy frena a ${req.audience}`, "[dato que respalde el problema]"], speakerNotes: "Abre con el dolor del cliente." },
    { title: `Presentamos ${req.product}`, bullets: [req.description ?? "[descripción del producto]"], speakerNotes: "Presenta la solución en una frase." },
    { title: "Características clave", bullets: ["[característica 1]", "[característica 2]", "[característica 3]"], speakerNotes: "Muestra qué hace el producto." },
    { title: "Beneficios", bullets: [`Qué gana ${req.audience}`, "[ahorro de tiempo / dinero]"], speakerNotes: "Traduce características en resultados." },
    { title: "Por qué nosotros", bullets: ["[diferenciador]", "[testimonio o caso de éxito]"], speakerNotes: "Da pruebas y diferenciación." },
    { title: "Oferta", bullets: ["[precio]", "[promoción o plan]"], speakerNotes: "Explica cómo empezar." },
    { title: "Siguiente paso", bullets: [req.goal ?? "Agenda una demo hoy"], speakerNotes: "Cierra con una llamada a la acción clara." },
  ];
  const slides = Array.from({ length: slideCount }, (_, i) =>
    i < outline.length ? outline[i] : { title: `Diapositiva ${i + 1}`, bullets: ["[contenido]"], speakerNotes: "" }
  );
  return {
    title: req.product,
    subtitle: `[mock — define ANTHROPIC_API_KEY para contenido real] Para ${req.audience}`,
    slides,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Renders the deck as a self-contained HTML slideshow: arrow keys / click to navigate,
 * "N" toggles speaker notes, and printing produces one slide per page (save as PDF).
 */
export function renderPresentationHtml(deck: PresentationDeck): string {
  const cover = `<section class="slide cover"><h1>${escapeHtml(deck.title)}</h1><p>${escapeHtml(deck.subtitle)}</p></section>`;
  const body = deck.slides
    .map(
      (s, i) => `<section class="slide">
  <span class="num">${i + 1} / ${deck.slides.length}</span>
  <h2>${escapeHtml(s.title)}</h2>
  <ul>${s.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
  <aside class="notes">${escapeHtml(s.speakerNotes)}</aside>
</section>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(deck.title)}</title>
<style>
  :root { --accent: #6d5ef0; --bg: #ffffff; --fg: #1b1b23; --muted: #6b6b7b; }
  @media (prefers-color-scheme: dark) { :root { --bg: #14141b; --fg: #f1f1f5; --muted: #a0a0b0; } }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--fg);
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif; }
  .slide { display: none; position: absolute; inset: 0; padding: 8vh 9vw; flex-direction: column; justify-content: center; }
  .slide.active { display: flex; }
  .cover { background: var(--accent); color: #fff; }
  .cover h1 { font-size: clamp(2rem, 6vw, 4.5rem); margin: 0; letter-spacing: -0.02em; }
  .cover p { font-size: clamp(1rem, 2.2vw, 1.6rem); opacity: 0.85; }
  h2 { font-size: clamp(1.6rem, 4vw, 3rem); margin: 0 0 1.5rem; color: var(--accent); }
  ul { font-size: clamp(1rem, 2.2vw, 1.7rem); line-height: 1.6; padding-left: 1.2em; margin: 0; }
  .num { position: absolute; top: 3vh; right: 4vw; color: var(--muted); font-size: 0.9rem; }
  .notes { display: none; position: absolute; left: 0; right: 0; bottom: 0; padding: 1rem 9vw;
    background: color-mix(in srgb, var(--fg) 8%, var(--bg)); color: var(--muted); font-size: 1rem; }
  body.show-notes .notes:not(:empty) { display: block; }
  .hint { position: fixed; bottom: 1rem; left: 1rem; color: var(--muted); font-size: 0.75rem; }
  @media print {
    .slide { display: flex !important; position: relative; height: 100vh; page-break-after: always; }
    .hint { display: none; }
  }
</style>
</head>
<body>
${cover}
${body}
<div class="hint">← → navegar · N notas · Ctrl+P exportar PDF</div>
<script>
  const slides = [...document.querySelectorAll('.slide')];
  let i = 0;
  const show = (n) => { i = Math.max(0, Math.min(slides.length - 1, n)); slides.forEach((s, k) => s.classList.toggle('active', k === i)); };
  document.addEventListener('keydown', (e) => {
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) show(i + 1);
    if (['ArrowLeft', 'PageUp'].includes(e.key)) show(i - 1);
    if (e.key.toLowerCase() === 'n') document.body.classList.toggle('show-notes');
  });
  document.addEventListener('click', (e) => show(e.clientX > innerWidth / 3 ? i + 1 : i - 1));
  show(0);
</script>
</body>
</html>`;
}

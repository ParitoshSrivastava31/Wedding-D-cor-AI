const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const STYLES = new Set(["Royal Indian", "Modern Luxury", "Floral Garden", "Minimal Elegant"]);
const STYLE_DIRECTION = {
  "Royal Indian": "opulent royal Indian wedding — deep crimson, marigold orange, saffron and antique gold palette; dense marigold and rose garlands, jasmine strings cascading from above, ornate carved mandap or gilded stage, brass urns and diyas, embroidered silk drapes, hundreds of warm candles and fairy lights.",
  "Modern Luxury": "contemporary high-end wedding — ivory, champagne, smoked glass and brushed brass palette; sculptural white orchid and hydrangea installations, mirrored or acrylic surfaces, clean geometric arch, floating tapered candles, linear chandeliers and warm architectural uplighting.",
  "Floral Garden": "romantic English garden wedding — blush, peach, sage and cream palette; lush overflowing arches of garden roses, peonies, ranunculus and eucalyptus, scattered petals, rustic wood and rattan seating, lanterns, and soft dappled light.",
  "Minimal Elegant": "serene minimalist wedding — warm white, oat, stone and soft greige palette; a single sculptural arch of pampas grass and white blooms, linen drapery, simple taper candles, uncluttered symmetry, generous negative space and gentle diffused light."
};

export async function generateDesign(body) {
  if (!process.env.GEMINI_API_KEY) {
    throw Object.assign(new Error("Add your Gemini API key to the environment to generate a design."), { status: 503 });
  }

  const { image, mimeType, style, details = "" } = body || {};
  if (typeof image !== "string" || !image || image.length > MAX_IMAGE_BYTES * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length % 4 !== 0) {
    throw Object.assign(new Error("Choose a venue image under 4 MB."), { status: 400 });
  }
  if (Buffer.from(image, "base64").byteLength > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error("Choose a venue image under 4 MB."), { status: 400 });
  }
  if (!MIME_TYPES.has(mimeType)) {
    throw Object.assign(new Error("Use a JPG, PNG, or WebP image."), { status: 400 });
  }
  if (!STYLES.has(style)) {
    throw Object.assign(new Error("Choose one of the available design styles."), { status: 400 });
  }
  if (typeof details !== "string" || details.length > 400) {
    throw Object.assign(new Error("Keep your style notes under 400 characters."), { status: 400 });
  }

  const prompt = [
    "You are an award-winning luxury wedding designer and architectural photographer. Edit the supplied venue photo into a breathtaking, photorealistic wedding setup.",
    `DESIGN STYLE — ${style}: ${STYLE_DIRECTION[style]}`,
    "PRESERVE: the exact room or landscape — walls, windows, ceiling, floor, trees, architecture, camera angle, lens perspective, and proportions. The result must be clearly the same place, only dressed for a wedding.",
    "ADD: a complete, cohesive scene — a focal ceremony or reception arrangement (arch, mandap, stage, or sweetheart table as fits the space), aisle or guest seating, layered florals in odd-numbered clusters, draped fabric, candles, and a considered lighting design. Scale everything correctly to the room and anchor it to the floor with realistic contact shadows.",
    "PHOTOGRAPHY: editorial wedding-magazine quality, shot on a full-frame camera with a 24mm lens, soft golden-hour or warm ambient light, gentle bokeh on distant lights, rich but natural colour grading, crisp detail in petals, fabric, and glassware, balanced exposure with no blown highlights.",
    "AVOID: people, faces, hands, text, signs, logos, watermarks, cartoonish or CGI look, oversaturated colours, clutter, distorted geometry, floating objects, and changes to the building structure.",
    details.trim() ? `COUPLE'S REQUESTS (honour these within the style above): ${details.trim()}` : ""
  ].filter(Boolean).join("\n\n");

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      model: process.env.GEMINI_MODEL || "gemini-nano-banana-2.1",
      input: [
        { type: "text", text: prompt },
        { type: "image", mime_type: mimeType, data: image }
      ],
      response_format: { type: "image", image_size: "1K" }
    }),
    signal: AbortSignal.timeout(180_000)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Gemini API error:", response.status, result.error?.message || "Unknown error");
    const message = response.status === 401 || response.status === 403
      ? "Gemini could not authenticate this API key. Check GEMINI_API_KEY."
      : response.status === 429
        ? "Gemini is receiving too many requests. Wait a moment and try again."
        : "Gemini could not create the design. Please try again.";
    throw Object.assign(new Error(message), { status: response.status === 429 ? 429 : 502 });
  }

  const generated = result.output_image;
  if (!generated?.data) {
    console.error("Gemini response did not contain an output image.");
    throw Object.assign(new Error("The image model did not return a design. Try again with another venue photo."), { status: 502 });
  }
  const outputMimeType = generated.mime_type || "image/png";
  return { image: `data:${outputMimeType};base64,${generated.data}`, mimeType: outputMimeType };
}

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to generate a design." });
  }

  try {
    const result = await generateDesign(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Something went wrong. Please try again." });
  }
}

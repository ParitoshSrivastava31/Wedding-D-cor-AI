const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 4;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const STYLES = new Set(["Royal Indian", "Modern Luxury", "Floral Garden", "Minimal Elegant"]);
const IMAGE_SIZES = new Set(["1K", "2K", "4K"]);
const THINKING_LEVELS = new Set(["minimal", "medium", "high"]);
const ASPECT_RATIOS = new Set(["auto", "1:1", "4:3", "3:4", "16:9", "9:16", "4:1", "1:4", "8:1", "1:8"]);
const STYLE_DIRECTION = {
  "Royal Indian": "opulent royal Indian wedding — deep crimson, marigold orange, saffron and antique gold palette; dense marigold and rose garlands, jasmine strings cascading from above, ornate carved mandap or gilded stage, brass urns and diyas, embroidered silk drapes, hundreds of warm candles and fairy lights.",
  "Modern Luxury": "contemporary high-end wedding — ivory, champagne, smoked glass and brushed brass palette; sculptural white orchid and hydrangea installations, mirrored or acrylic surfaces, clean geometric arch, floating tapered candles, linear chandeliers and warm architectural uplighting.",
  "Floral Garden": "romantic English garden wedding — blush, peach, sage and cream palette; lush overflowing arches of garden roses, peonies, ranunculus and eucalyptus, scattered petals, rustic wood and rattan seating, lanterns, and soft dappled light.",
  "Minimal Elegant": "serene minimalist wedding — warm white, oat, stone and soft greige palette; a single sculptural arch of pampas grass and white blooms, linen drapery, simple taper candles, uncluttered symmetry, generous negative space and gentle diffused light."
};

function validateBase64Image(image, mimeType, label = "venue image") {
  if (typeof image !== "string" || !image || image.length > MAX_IMAGE_BYTES * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length % 4 !== 0) {
    throw Object.assign(new Error(`Choose a ${label} under 4 MB.`), { status: 400 });
  }
  if (Buffer.from(image, "base64").byteLength > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error(`Choose a ${label} under 4 MB.`), { status: 400 });
  }
  if (!MIME_TYPES.has(mimeType)) {
    throw Object.assign(new Error(`Use a JPG, PNG, or WebP file for the ${label}.`), { status: 400 });
  }
}

function extractGeneratedImage(result) {
  if (!result || typeof result !== "object") return null;

  // 1. Direct convenience property
  if (typeof result.output_image?.data === "string") {
    return {
      data: result.output_image.data,
      mime_type: result.output_image.mime_type || result.output_image.mimeType || "image/png"
    };
  }

  // 2. Interactions API `steps` array (standard raw REST response: steps[].content[])
  if (Array.isArray(result.steps)) {
    for (let i = result.steps.length - 1; i >= 0; i--) {
      const step = result.steps[i];
      const blocks = Array.isArray(step?.content)
        ? step.content
        : Array.isArray(step?.outputs)
          ? step.outputs
          : Array.isArray(step?.parts)
            ? step.parts
            : [step?.delta, step].filter(Boolean);
      for (const block of blocks) {
        if (block?.type === "image" && typeof block.data === "string") {
          return { data: block.data, mime_type: block.mime_type || block.mimeType || "image/png" };
        }
        const inline = block?.inline_data || block?.inlineData;
        if (typeof inline?.data === "string") {
          return { data: inline.data, mime_type: inline.mime_type || inline.mimeType || "image/png" };
        }
      }
    }
  }

  // 3. Interactions API `outputs` array
  if (Array.isArray(result.outputs)) {
    for (let i = result.outputs.length - 1; i >= 0; i--) {
      const out = result.outputs[i];
      if (out?.type === "image" && typeof out.data === "string") {
        return { data: out.data, mime_type: out.mime_type || out.mimeType || "image/png" };
      }
      if (Array.isArray(out?.content)) {
        const imgBlock = out.content.find((b) => b?.type === "image" && typeof b.data === "string");
        if (imgBlock) {
          return { data: imgBlock.data, mime_type: imgBlock.mime_type || imgBlock.mimeType || "image/png" };
        }
      }
    }
  }

  // 4. Standard generateContent `candidates` array fallback
  if (Array.isArray(result.candidates)) {
    for (const candidate of result.candidates) {
      const parts = candidate?.content?.parts || [];
      for (const part of parts) {
        const inline = part?.inlineData || part?.inline_data;
        if (typeof inline?.data === "string") {
          return { data: inline.data, mime_type: inline.mimeType || inline.mime_type || "image/png" };
        }
      }
    }
  }

  // 5. Deep fallback search for any image block in the response tree
  const queue = [result];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    if (current.type === "image" && typeof current.data === "string" && current.data.length > 100) {
      return { data: current.data, mime_type: current.mime_type || current.mimeType || "image/png" };
    }
    const inline = current.inline_data || current.inlineData;
    if (typeof inline?.data === "string" && inline.data.length > 100) {
      return { data: inline.data, mime_type: inline.mime_type || inline.mimeType || "image/png" };
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return null;
}

async function callInteractionsApi(payload) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180_000)
  });
  const result = await response.json().catch(() => ({}));
  return { response, result };
}

export async function generateDesign(body) {
  if (!process.env.GEMINI_API_KEY) {
    throw Object.assign(new Error("Add your Gemini API key to the environment to generate a design."), { status: 503 });
  }

  const {
    image,
    mimeType,
    style,
    details = "",
    imageSize = "1K",
    thinkingLevel = "medium",
    aspectRatio = "auto",
    searchGrounding = false,
    references = [],
    previousInteractionId = null,
    refinement = ""
  } = body || {};

  validateBase64Image(image, mimeType, "venue image");

  if (!STYLES.has(style)) {
    throw Object.assign(new Error("Choose one of the available design styles."), { status: 400 });
  }
  if (typeof details !== "string" || details.length > 400) {
    throw Object.assign(new Error("Keep your style notes under 400 characters."), { status: 400 });
  }
  if (typeof refinement !== "string" || refinement.length > 400) {
    throw Object.assign(new Error("Keep your refinement instructions under 400 characters."), { status: 400 });
  }
  if (!IMAGE_SIZES.has(imageSize)) {
    throw Object.assign(new Error("Choose a valid output resolution (1K, 2K, or 4K)."), { status: 400 });
  }
  if (!THINKING_LEVELS.has(thinkingLevel)) {
    throw Object.assign(new Error("Choose a valid thinking level (minimal, medium, or high)."), { status: 400 });
  }
  if (!ASPECT_RATIOS.has(aspectRatio)) {
    throw Object.assign(new Error("Choose a valid aspect ratio."), { status: 400 });
  }
  if (!Array.isArray(references) || references.length > MAX_REFERENCE_IMAGES) {
    throw Object.assign(new Error(`You can attach up to ${MAX_REFERENCE_IMAGES} reference images.`), { status: 400 });
  }

  const validReferences = references.map((ref, idx) => {
    validateBase64Image(ref?.image, ref?.mimeType, `reference image #${idx + 1}`);
    return { type: "image", mime_type: ref.mimeType, data: ref.image };
  });

  const isRefinement = Boolean(refinement.trim());
  const prompt = isRefinement
    ? [
        "You are an award-winning luxury wedding designer and architectural photographer. Refine the current wedding venue design according to the couple's conversational edit while preserving the exact underlying venue architecture, camera perspective, and unedited decor elements.",
        `DESIGN STYLE — ${style}: ${STYLE_DIRECTION[style]}`,
        `REQUESTED REFINEMENT: ${refinement.trim()}`,
        details.trim() ? `ORIGINAL STYLE NOTES: ${details.trim()}` : "",
        validReferences.length > 0
          ? `REFERENCE IMAGES: Incorporate the floral, lighting, or decor elements shown in the ${validReferences.length} attached reference image(s).`
          : "",
        "AVOID: people, faces, hands, text, signs, logos, watermarks, cartoonish or CGI look, distorted geometry, or changes to the building structure."
      ].filter(Boolean).join("\n\n")
    : [
        "You are an award-winning luxury wedding designer and architectural photographer. Edit the supplied venue photo into a breathtaking, photorealistic wedding setup.",
        `DESIGN STYLE — ${style}: ${STYLE_DIRECTION[style]}`,
        "PRESERVE: the exact room or landscape — walls, windows, ceiling, floor, trees, architecture, camera angle, lens perspective, and proportions. The result must be clearly the same place, only dressed for a wedding.",
        "ADD: a complete, cohesive scene — a focal ceremony or reception arrangement (arch, mandap, stage, or sweetheart table as fits the space), aisle or guest seating, layered florals in odd-numbered clusters, draped fabric, candles, and a considered lighting design. Scale everything correctly to the room and anchor it to the floor with realistic contact shadows.",
        validReferences.length > 0
          ? `MULTI-IMAGE FUSION (${validReferences.length} reference image${validReferences.length > 1 ? "s" : ""} attached): The first image is the target venue space to preserve. The remaining ${validReferences.length} image(s) are inspiration references for florals, mandap/arch structure, color palette, or lighting — fuse their design elements seamlessly into the venue.`
          : "",
        "PHOTOGRAPHY: editorial wedding-magazine quality, shot on a full-frame camera with a 24mm lens, soft golden-hour or warm ambient light, gentle bokeh on distant lights, rich but natural colour grading, crisp detail in petals, fabric, and glassware, balanced exposure with no blown highlights.",
        "AVOID: people, faces, hands, text, signs, logos, watermarks, cartoonish or CGI look, oversaturated colours, clutter, distorted geometry, floating objects, and changes to the building structure.",
        details.trim() ? `COUPLE'S REQUESTS (honour these within the style above): ${details.trim()}` : ""
      ].filter(Boolean).join("\n\n");

  const imageConfig = { image_size: imageSize };
  if (aspectRatio && aspectRatio !== "auto") {
    imageConfig.aspect_ratio = aspectRatio;
  }

  const basePayload = {
    model: process.env.GEMINI_MODEL || "gemini-nano-banana-2.1",
    response_modalities: ["image"],
    generation_config: {
      thinking_level: thinkingLevel,
      image_config: imageConfig
    }
  };

  if (searchGrounding) {
    basePayload.tools = [{ type: "google_search" }];
  }

  const fullInput = [
    { type: "text", text: prompt },
    { type: "image", mime_type: mimeType, data: image },
    ...validReferences
  ];

  let response;
  let result;

  if (isRefinement && typeof previousInteractionId === "string" && previousInteractionId.trim()) {
    ({ response, result } = await callInteractionsApi({
      ...basePayload,
      previous_interaction_id: previousInteractionId.trim(),
      input: [
        { type: "text", text: prompt },
        ...validReferences
      ]
    }));
    // Fallback to direct image-to-image if previous_interaction_id expired or is unsupported
    if (!response.ok) {
      ({ response, result } = await callInteractionsApi({
        ...basePayload,
        input: fullInput
      }));
    }
  } else {
    ({ response, result } = await callInteractionsApi({
      ...basePayload,
      input: fullInput
    }));
  }

  if (!response.ok) {
    const rawMessage = result.error?.message || "Unknown error";
    const isFreeTierZeroQuota = response.status === 429 && (/limit:\s*0\b/i.test(rawMessage) || /free tier/i.test(rawMessage));
    const message = response.status === 401 || response.status === 403
      ? "Gemini could not authenticate this API key. Check GEMINI_API_KEY."
      : isFreeTierZeroQuota
        ? "Gemini image generation has a 0-token quota on the Free Tier. Enable billing (Tier 1) on your Google AI Studio project at https://ai.dev/rate-limit."
        : response.status === 429
          ? "Gemini is receiving too many requests. Wait a moment and try again."
          : rawMessage !== "Unknown error"
            ? rawMessage
            : "Gemini could not create the design. Please try again.";
    throw Object.assign(new Error(message), { status: response.status === 429 ? 429 : 502 });
  }

  const generated = extractGeneratedImage(result);
  if (!generated?.data) {
    throw Object.assign(new Error("The image model did not return a design. Try again with another venue photo."), { status: 502 });
  }
  const outputMimeType = generated.mime_type || "image/png";
  return {
    image: `data:${outputMimeType};base64,${generated.data}`,
    mimeType: outputMimeType,
    interactionId: result.id || null,
    imageSize,
    thinkingLevel
  };
}

export const config = { api: { bodyParser: { sizeLimit: "16mb" } } };

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

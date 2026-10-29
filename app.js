const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_GENERATION_BYTES = 3.2 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1536;
const MAX_REF_SIDE = 1024;
const MAX_REFERENCES = 4;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

const samplePhotos = {
  hall: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1400&q=88",
  garden: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1400&q=88",
  terrace: "/assets/image.png"
};

const $ = (selector) => document.querySelector(selector);
const fileInput = $("#venue-file");
const uploadZone = $("#upload-zone");
const uploadContent = $("#upload-content");
const uploadPreview = $("#upload-preview");
const replacePhoto = $("#replace-photo");
const fileError = $("#file-error");
const generateButton = $("#generate-button");
const generateLabel = $("#generate-label");
const styleNotes = $("#style-notes");
const charCount = $("#char-count");
const refFileInput = $("#ref-file");
const refGrid = $("#ref-grid");
const refAdd = $("#ref-add");
const refCount = $("#ref-count");
const aspectRatioSelect = $("#aspect-ratio");
const searchGroundingInput = $("#search-grounding");
const emptyState = $("#empty-state");
const resultState = $("#result-state");
const loadingState = $("#loading-state");
const loadingBg = $("#loading-bg");
const loadingMessage = $("#loading-message");
const resultImage = $("#result-image");
const resultOriginal = $("#result-original");
const resultTitle = $("#result-title");
const resultKicker = $("#result-kicker");
const downloadButton = $("#download-button");
const regenerateButton = $("#regenerate-button");
const undoButton = $("#undo-button");
const refineInput = $("#refine-input");
const refineButton = $("#refine-button");
const compareRange = $("#compare-range");
const compareBefore = $("#compare-before");
const compareHandle = $("#compare-handle");

let venueBlob = null;
let venuePreviewUrl = null;
let referenceItems = []; // [{ id, blob, url }]
let selectedStyle = "Royal Indian";
let selectedImageSize = "1K";
let selectedThinkingLevel = "medium";
let lastInteractionId = null;
let currentResultDataUrl = null;
let currentResultMimeType = "image/png";
let editHistory = []; // [{ image, mimeType, interactionId, label }]
let loadingTimer = null;
let busy = false;

const IDLE_LABEL = "Create my wedding vision";

function refreshButton() {
  generateButton.disabled = busy || !venueBlob;
  generateLabel.textContent = busy ? "Creating your vision…" : venueBlob ? IDLE_LABEL : "Upload a photo to begin";
  if (refineButton) refineButton.disabled = busy || !currentResultDataUrl;
  if (undoButton) undoButton.classList.toggle("hidden", editHistory.length === 0 || busy);
}

function setVenue(blob, name = "Your venue") {
  venueBlob = blob;
  if (venuePreviewUrl) URL.revokeObjectURL(venuePreviewUrl);
  venuePreviewUrl = URL.createObjectURL(blob);
  uploadPreview.src = venuePreviewUrl;
  uploadPreview.alt = name;
  uploadPreview.classList.remove("hidden");
  uploadContent.classList.add("hidden");
  replacePhoto.classList.remove("hidden");
  fileError.textContent = "";
  lastInteractionId = null;
  currentResultDataUrl = null;
  editHistory = [];
  resultState.classList.add("hidden");
  emptyState.classList.remove("hidden");
  refreshButton();
}

function acceptFile(file) {
  if (!file) return;
  if (!ACCEPTED.includes(file.type)) {
    fileError.textContent = "Please choose a JPG, PNG or WebP image.";
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    fileError.textContent = "That photo is over 15 MB. Choose a smaller image.";
    return;
  }
  setVenue(file, file.name || "Selected venue photo");
}

function renderReferences() {
  refGrid.querySelectorAll(".ref-thumb").forEach((el) => el.remove());
  referenceItems.forEach((item, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "ref-thumb";
    const img = document.createElement("img");
    img.src = item.url;
    img.alt = `Reference ${index + 1}`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ref-remove";
    removeBtn.setAttribute("aria-label", `Remove reference ${index + 1}`);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      URL.revokeObjectURL(item.url);
      referenceItems = referenceItems.filter((r) => r.id !== item.id);
      renderReferences();
    });
    wrapper.append(img, removeBtn);
    refGrid.insertBefore(wrapper, refAdd);
  });
  refCount.textContent = `${referenceItems.length}/${MAX_REFERENCES}`;
  refAdd.classList.toggle("hidden", referenceItems.length >= MAX_REFERENCES);
}

function acceptReferenceFiles(fileList) {
  if (!fileList?.length) return;
  fileError.textContent = "";
  for (const file of fileList) {
    if (referenceItems.length >= MAX_REFERENCES) {
      fileError.textContent = `Up to ${MAX_REFERENCES} reference photos can be attached.`;
      break;
    }
    if (!ACCEPTED.includes(file.type)) {
      fileError.textContent = "Reference photos must be JPG, PNG, or WebP.";
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      fileError.textContent = "Reference photos must be under 15 MB each.";
      continue;
    }
    referenceItems.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      blob: file,
      url: URL.createObjectURL(file)
    });
  }
  renderReferences();
}

// Native <label for> opens the file picker; we only reset the value so the same file can be re-picked.
fileInput.addEventListener("click", () => { fileInput.value = ""; });
fileInput.addEventListener("change", () => acceptFile(fileInput.files?.[0]));
const cameraInput = $("#camera-file");
cameraInput.addEventListener("click", () => { cameraInput.value = ""; });
cameraInput.addEventListener("change", () => acceptFile(cameraInput.files?.[0]));
uploadZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
});

refFileInput.addEventListener("click", () => { refFileInput.value = ""; });
refFileInput.addEventListener("change", () => acceptReferenceFiles(refFileInput.files));
refAdd.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); refFileInput.click(); }
});

// Drag & drop (also stop the browser from navigating to a dropped file outside the zone)
["dragover", "drop"].forEach((type) => window.addEventListener(type, (event) => event.preventDefault()));
uploadZone.addEventListener("dragover", () => uploadZone.classList.add("dragging"));
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragging"));
uploadZone.addEventListener("drop", (event) => {
  uploadZone.classList.remove("dragging");
  acceptFile(event.dataTransfer.files?.[0]);
});

// Paste an image from the clipboard
window.addEventListener("paste", (event) => {
  if (document.activeElement === refineInput || document.activeElement === styleNotes) return;
  const file = [...(event.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
  if (file) acceptFile(file);
});

document.querySelectorAll(".sample-card").forEach((button) => {
  button.addEventListener("click", async () => {
    button.disabled = true;
    fileError.textContent = "";
    try {
      const response = await fetch(samplePhotos[button.dataset.sample]);
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error();
      setVenue(blob, `${button.dataset.sample} wedding venue sample`);
    } catch {
      fileError.textContent = "Could not load that sample. Please upload a venue photo instead.";
    } finally {
      button.disabled = false;
    }
  });
});

document.querySelectorAll(".style-option").forEach((button) => {
  button.addEventListener("click", () => {
    selectedStyle = button.dataset.style;
    document.querySelectorAll(".style-option").forEach((option) => {
      const selected = option === button;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
  });
});

document.querySelectorAll("[data-size]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedImageSize = button.dataset.size;
    document.querySelectorAll("[data-size]").forEach((option) => {
      const selected = option === button;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
  });
});

document.querySelectorAll("[data-thinking]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedThinkingLevel = button.dataset.thinking;
    document.querySelectorAll("[data-thinking]").forEach((option) => {
      const selected = option === button;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
  });
});

styleNotes.addEventListener("input", () => { charCount.textContent = styleNotes.value.length; });

compareRange.addEventListener("input", () => {
  const value = compareRange.value;
  compareBefore.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
  compareHandle.style.left = `${value}%`;
});

async function compressImage(blob, maxSide = MAX_IMAGE_SIDE) {
  const image = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const compressed = await new Promise((resolve, reject) => canvas.toBlob((file) => file ? resolve(file) : reject(new Error("Could not prepare this photo.")), "image/jpeg", 0.86));
  if (compressed.size > MAX_GENERATION_BYTES) throw new Error("This photo is still too large to send. Try a smaller image.");
  return compressed;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read this photo."));
    reader.readAsDataURL(blob);
  });
}

function startLoading(isRefining = false) {
  const messages = isRefining
    ? ["Applying your refinement…", "Keeping the venue architecture intact…", "Polishing lighting & floral details…"]
    : ["Finding the feeling…", "Gathering a few beautiful details…", "Setting the scene…", "Adding the final touches…"];
  let index = 0;
  loadingMessage.textContent = messages[0];
  loadingTimer = setInterval(() => { index = (index + 1) % messages.length; loadingMessage.textContent = messages[index]; }, 3500);
  loadingBg.src = isRefining && currentResultDataUrl ? currentResultDataUrl : venuePreviewUrl;
  emptyState.classList.add("hidden");
  resultState.classList.add("hidden");
  loadingState.classList.remove("hidden");
  busy = true;
  refreshButton();
}

function stopLoading() {
  clearInterval(loadingTimer);
  loadingState.classList.add("hidden");
  busy = false;
  refreshButton();
}

function applyResultToView({ image, mimeType, interactionId, imageSize, thinkingLevel, isRefinement }) {
  currentResultDataUrl = image;
  currentResultMimeType = mimeType || "image/png";
  lastInteractionId = interactionId || null;
  resultOriginal.src = venuePreviewUrl;
  resultImage.src = image;
  resultTitle.textContent = selectedStyle;
  const metaParts = [imageSize || selectedImageSize, `${thinkingLevel || selectedThinkingLevel} thinking`];
  if (referenceItems.length > 0) metaParts.push(`${referenceItems.length} ref${referenceItems.length > 1 ? "s" : ""}`);
  if (isRefinement) metaParts.push("refined");
  resultKicker.textContent = `Your design · ${metaParts.join(" · ")}`;
  downloadButton.href = image;
  const extension = currentResultMimeType === "image/jpeg" ? "jpg" : currentResultMimeType === "image/webp" ? "webp" : "png";
  downloadButton.download = `wedding-decor-ai-${selectedStyle.toLowerCase().replaceAll(" ", "-")}-${(imageSize || selectedImageSize).toLowerCase()}.${extension}`;
  compareRange.value = 50;
  compareRange.dispatchEvent(new Event("input"));
  resultState.classList.remove("hidden");
  refreshButton();
}

async function runGeneration({ refinement = "" } = {}) {
  if (!venueBlob || busy) return;
  const isRefinement = Boolean(refinement.trim());
  fileError.textContent = "";
  startLoading(isRefinement);
  try {
    let base64;
    let mimeType;
    if (isRefinement && currentResultDataUrl) {
      const [header, data] = currentResultDataUrl.split(",", 2);
      base64 = data;
      mimeType = header.match(/data:(image\/[a-zA-Z0-9.+-]+);base64/)?.[1] || currentResultMimeType || "image/png";
    } else {
      const image = await compressImage(venueBlob, MAX_IMAGE_SIDE);
      base64 = await blobToBase64(image);
      mimeType = image.type;
    }

    const references = await Promise.all(
      referenceItems.map(async (item) => {
        const compressedRef = await compressImage(item.blob, MAX_REF_SIDE);
        return {
          image: await blobToBase64(compressedRef),
          mimeType: compressedRef.type
        };
      })
    );

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        image: base64,
        mimeType,
        style: selectedStyle,
        details: styleNotes.value.trim(),
        imageSize: selectedImageSize,
        thinkingLevel: selectedThinkingLevel,
        aspectRatio: aspectRatioSelect?.value || "auto",
        searchGrounding: Boolean(searchGroundingInput?.checked),
        references,
        previousInteractionId: isRefinement ? lastInteractionId : null,
        refinement: refinement.trim()
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "We couldn't make that design just yet.");
    if (!payload.image?.startsWith("data:image/")) throw new Error("The image model returned an unexpected result. Please try again.");

    if (isRefinement && currentResultDataUrl) {
      editHistory.push({
        image: currentResultDataUrl,
        mimeType: currentResultMimeType,
        interactionId: lastInteractionId
      });
      refineInput.value = "";
    } else {
      editHistory = [];
    }

    applyResultToView({
      image: payload.image,
      mimeType: payload.mimeType,
      interactionId: payload.interactionId,
      imageSize: payload.imageSize || selectedImageSize,
      thinkingLevel: payload.thinkingLevel || selectedThinkingLevel,
      isRefinement: isRefinement || editHistory.length > 0
    });
    if (matchMedia("(max-width: 960px)").matches) resultState.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    fileError.textContent = error.message || "We couldn't make that design just yet.";
    if (currentResultDataUrl) {
      resultState.classList.remove("hidden");
    } else {
      emptyState.classList.remove("hidden");
    }
  } finally {
    stopLoading();
  }
}

generateButton.addEventListener("click", () => runGeneration());
regenerateButton.addEventListener("click", () => runGeneration());

refineButton?.addEventListener("click", () => {
  const prompt = refineInput.value.trim();
  if (!prompt) {
    refineInput.focus();
    return;
  }
  runGeneration({ refinement: prompt });
});

refineInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    refineButton.click();
  }
});

document.querySelectorAll(".refine-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    if (busy || !currentResultDataUrl) return;
    refineInput.value = chip.dataset.prompt || "";
    runGeneration({ refinement: refineInput.value });
  });
});

undoButton?.addEventListener("click", () => {
  if (busy || editHistory.length === 0) return;
  const previous = editHistory.pop();
  applyResultToView({
    image: previous.image,
    mimeType: previous.mimeType,
    interactionId: previous.interactionId,
    imageSize: selectedImageSize,
    thinkingLevel: selectedThinkingLevel,
    isRefinement: editHistory.length > 0
  });
});

refreshButton();

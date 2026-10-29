const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_GENERATION_BYTES = 3.2 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1536;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

const samplePhotos = {
  hall: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1400&q=88",
  garden: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1400&q=88",
  terrace: "https://images.unsplash.com/photo-1519225421980-888cb9e06b6d?auto=format&fit=crop&w=1400&q=88"
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
const emptyState = $("#empty-state");
const resultState = $("#result-state");
const loadingState = $("#loading-state");
const loadingBg = $("#loading-bg");
const loadingMessage = $("#loading-message");
const resultImage = $("#result-image");
const resultOriginal = $("#result-original");
const resultTitle = $("#result-title");
const downloadButton = $("#download-button");
const regenerateButton = $("#regenerate-button");
const compareRange = $("#compare-range");
const compareBefore = $("#compare-before");
const compareHandle = $("#compare-handle");

let venueBlob = null;
let venuePreviewUrl = null;
let selectedStyle = "Royal Indian";
let loadingTimer = null;
let busy = false;

const IDLE_LABEL = "Create my wedding vision";

function refreshButton() {
  generateButton.disabled = busy || !venueBlob;
  generateLabel.textContent = busy ? "Creating your vision…" : venueBlob ? IDLE_LABEL : "Upload a photo to begin";
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

// Native <label for> opens the file picker; we only reset the value so the same file can be re-picked.
fileInput.addEventListener("click", () => { fileInput.value = ""; });
fileInput.addEventListener("change", () => acceptFile(fileInput.files?.[0]));
const cameraInput = $("#camera-file");
cameraInput.addEventListener("click", () => { cameraInput.value = ""; });
cameraInput.addEventListener("change", () => acceptFile(cameraInput.files?.[0]));
uploadZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
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

styleNotes.addEventListener("input", () => { charCount.textContent = styleNotes.value.length; });

compareRange.addEventListener("input", () => {
  const value = compareRange.value;
  compareBefore.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
  compareHandle.style.left = `${value}%`;
});

async function compressImage(blob) {
  const image = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const compressed = await new Promise((resolve, reject) => canvas.toBlob((file) => file ? resolve(file) : reject(new Error("Could not prepare this photo.")), "image/jpeg", 0.86));
  if (compressed.size > MAX_GENERATION_BYTES) throw new Error("This photo is still too large to send. Try a smaller image.");
  return compressed;
}

function startLoading() {
  const messages = ["Finding the feeling…", "Gathering a few beautiful details…", "Setting the scene…", "Adding the final touches…"];
  let index = 0;
  loadingMessage.textContent = messages[0];
  loadingTimer = setInterval(() => { index = (index + 1) % messages.length; loadingMessage.textContent = messages[index]; }, 3500);
  loadingBg.src = venuePreviewUrl;
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

async function generate() {
  if (!venueBlob || busy) return;
  fileError.textContent = "";
  startLoading();
  try {
    const image = await compressImage(venueBlob);
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Could not read this photo."));
      reader.readAsDataURL(image);
    });
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: base64, mimeType: image.type, style: selectedStyle, details: styleNotes.value.trim() })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "We couldn't make that design just yet.");
    if (!payload.image?.startsWith("data:image/")) throw new Error("The image model returned an unexpected result. Please try again.");
    resultOriginal.src = venuePreviewUrl;
    resultImage.src = payload.image;
    resultTitle.textContent = selectedStyle;
    downloadButton.href = payload.image;
    const extension = payload.mimeType === "image/jpeg" ? "jpg" : payload.mimeType === "image/webp" ? "webp" : "png";
    downloadButton.download = `wedding-decor-ai-${selectedStyle.toLowerCase().replaceAll(" ", "-")}.${extension}`;
    compareRange.value = 50;
    compareRange.dispatchEvent(new Event("input"));
    resultState.classList.remove("hidden");
    if (matchMedia("(max-width: 960px)").matches) resultState.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    fileError.textContent = error.message || "We couldn't make that design just yet.";
    emptyState.classList.remove("hidden");
  } finally {
    stopLoading();
  }
}

generateButton.addEventListener("click", generate);
regenerateButton.addEventListener("click", generate);
refreshButton();

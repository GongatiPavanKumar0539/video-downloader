
const API = "https://youtube-video-downloader-backend-api.onrender.com";

const form = document.getElementById("videoForm");
const urlInput = document.getElementById("videoUrl");
const statusText = document.getElementById("status");
const qualitySelect = document.getElementById("videoQuality");
const preview = document.getElementById("preview");
const previewBtn = document.getElementById("previewBtn");
const downloadBtn = document.getElementById("downloadBtn");

const progressBox = document.getElementById("downloadProgress");
const progressBar = document.getElementById("progressBar");
const progressTime = document.getElementById("progressTime");
const progressMessage = document.getElementById("progressMessage");

let currentUrl = "";

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    currentUrl = "";
    preview.hidden = true;
    previewBtn.disabled = true;
    statusText.textContent = "Loading video details...";

    try {
        const response = await fetch(`${API}/api/info`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: urlInput.value.trim()
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Could not load video.");
        }
        
const availableQualities = data.availableQualities || [];
const qualityOptions = Array.from(qualitySelect.options);

qualityOptions.forEach((option) => {
    if (option.value === "best") {
        option.disabled = false;
        return;
    }

    option.disabled = !availableQualities.includes(
        Number(option.value)
    );
});

const availableOption = qualityOptions.find(
    option => option.value !== "best" && !option.disabled
);

qualitySelect.value = availableOption
    ? availableOption.value
    : "best";

        document.getElementById("videoTitle").textContent = data.title;

        const thumbnail = document.getElementById("thumbnail");
        thumbnail.hidden = !data.thumbnail;

        if (data.thumbnail) {
            thumbnail.src = data.thumbnail;
        }

        document.getElementById("duration").textContent =
            data.duration != null
                ? `Duration: ${Math.floor(data.duration / 60)} min`
                : "";

        currentUrl = urlInput.value.trim();
        preview.hidden = false;
        progressBox.hidden = true;
        statusText.textContent = "Video details loaded.";

    } catch (error) {
        statusText.textContent =
            error.message + " Check that the Python backend is running.";
    } finally {
        previewBtn.disabled = false;
    }
});

downloadBtn.addEventListener("click", async () => {
    if (!currentUrl) return;

    downloadBtn.disabled = true;
    statusText.textContent = "Preparing video download...";

    progressBox.hidden = false;
    progressBar.style.width = "0%";
    progressTime.textContent = "10s";
    progressMessage.textContent = "Preparing download...";

    let seconds = 10;

    const progressTimer = setInterval(() => {
        seconds--;

        progressBar.style.width = `${(10 - seconds) * 10}%`;
        progressTime.textContent = `${seconds}s`;

        if (seconds <= 0) {
            clearInterval(progressTimer);
            progressMessage.textContent = "Processing video...";
        }
    }, 1000);

    try {
        const response = await fetch(`${API}/api/download`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: currentUrl,
                quality: qualitySelect.value
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Download failed.");
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = objectUrl;
        
        const videoTitle = document.getElementById("videoTitle").textContent;
        const selectedQuality = qualitySelect.value;
        const qualityLabel = selectedQuality === "best"
            ? "Best"
            : `${selectedQuality}p`;

        const safeTitle = videoTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");

        link.download = `${safeTitle}_${qualityLabel}_YouTube Video Downloader.mp4`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

        statusText.textContent = "Download started.";
        progressMessage.textContent = "Download ready!";
        progressBar.style.width = "100%";
        progressTime.textContent = "Done";

    } catch (error) {
        statusText.textContent = error.message;
        progressMessage.textContent = "Download failed.";

    } finally {
        clearInterval(progressTimer);
        downloadBtn.disabled = false;
    }
});

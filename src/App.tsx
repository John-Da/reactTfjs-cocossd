import { useRef, useEffect, useState } from "react";
import "./App.css";

type Mode = "idle" | "video" | "image";

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [confidence, setConfidence] = useState(0.2);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState("Loading model...");
  const [model, setModel] = useState<any>(null); // dynamic import
  const [isDetecting, setIsDetecting] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  };

  const isMobile = () => /Mobi|Android/i.test(navigator.userAgent);

  // Load model dynamically
  const loadModel = async () => {
    setLoadingText("Loading model...");
    setLoading(true);

    const tf = await import("@tensorflow/tfjs");
    await tf.setBackend("webgl");
    await tf.ready();

    const cocoSsd = await import("@tensorflow-models/coco-ssd");
    const m = await cocoSsd.load();
    setModel(m);
    setLoading(false);
    console.log("Model loaded");
  };

  useEffect(() => {
    loadModel();
  }, []);

  // Video detection loop
  
  useEffect(() => {
    if (!isDetecting || mode !== "video" || !model || !videoRef.current || !canvasRef.current)
      return;

    let animationId: number;
    let detecting = false; // ⚠️ Add this

    const detectFrame = async () => {
      if (!isDetecting) return;
      if (detecting) {
        animationId = requestAnimationFrame(detectFrame);
        return;
      }

      detecting = true;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Downscale for detection to improve FPS
      const DETECT_WIDTH = 320;
      const DETECT_HEIGHT = (video.videoHeight / video.videoWidth) * DETECT_WIDTH;

      const offCanvas = document.createElement("canvas");
      offCanvas.width = DETECT_WIDTH;
      offCanvas.height = DETECT_HEIGHT;
      const offCtx = offCanvas.getContext("2d")!;
      offCtx.drawImage(video, 0, 0, DETECT_WIDTH, DETECT_HEIGHT);

      try {
        const predictions = await model.detect(offCanvas);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        predictions.forEach((pred: any) => {
          if (pred.score < confidence) return;

          const scaleX = canvas.width / DETECT_WIDTH;
          const scaleY = canvas.height / DETECT_HEIGHT;
          const [x, y, width, height] = pred.bbox;

          const mirroredX =
            facingMode === "user" ? canvas.width - x * scaleX - width * scaleX : x * scaleX;

          ctx.strokeStyle = "#00FFFF";
          ctx.lineWidth = 2;
          ctx.strokeRect(mirroredX, y * scaleY, width * scaleX, height * scaleY);

          ctx.font = "16px Poppins";
          ctx.fillStyle = "#00FFFF";
          ctx.fillText(
            `${pred.class} (${(pred.score * 100).toFixed(1)}%)`,
            mirroredX,
            y * scaleY > 10 ? y * scaleY - 5 : 15
          );
        });
      } catch (err) {
        console.error(err);
      } finally {
        detecting = false;
        animationId = requestAnimationFrame(detectFrame);
      }
    };

    detectFrame();
    return () => cancelAnimationFrame(animationId);
  }, [isDetecting, mode, model, confidence, facingMode]);


  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  };

  const handleStartVideo = async () => {
    if (!model) {
      alert("Model not loaded yet.");
      return;
    }

    if (mode === "video") {
      setIsDetecting(false);
      stopCamera();
      clearCanvas();
      setMode("idle");
      return;
    }

    setMode("video");
    setLoadingText("Starting video...");
    setLoading(true);
    clearCanvas();

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
      });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;

      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play();
        if (canvasRef.current && videoRef.current) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
        }
        setIsDetecting(true);
        setLoading(false);
      };
    } catch (err) {
      console.error("Error starting video:", err);
      setMode("idle");
      setLoading(false);
    }
  };

  const handleSwitchCamera = () => {
    if (!isMobile()) return;
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
    handleStartVideo();
  };

  const handleSelectImage = () => {
    if (mode === "video") {
      setIsDetecting(false);
      stopCamera();
    }
    clearCanvas();
    setMode("image");
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !model) {
      setMode("idle");
      return;
    }

    setMode("image");
    setLoadingText("Detecting image...");
    setLoading(true);

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;
    img.onload = async () => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      canvasRef.current.width = img.width;
      canvasRef.current.height = img.height;
      ctx.drawImage(img, 0, 0, img.width, img.height);

      try {
        const predictions = await model.detect(img);
        predictions.forEach((pred: any) => {
          if (pred.score < confidence) return;
          const [x, y, width, height] = pred.bbox;
          ctx.strokeStyle = "#00FFFF";
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, width, height);
          ctx.font = "16px Poppins";
          ctx.fillStyle = "#00FFFF";
          ctx.fillText(
            `${pred.class} (${(pred.score * 100).toFixed(1)}%)`,
            x,
            y > 10 ? y - 5 : 15
          );
        });
      } catch (err) {
        console.error("Image detection error:", err);
      } finally {
        URL.revokeObjectURL(url);
        setLoading(false);
      }
    };

    e.currentTarget.value = "";
  };

  const handleClear = () => {
    setIsDetecting(false);
    setMode("idle");
    stopCamera();
    clearCanvas();
  };

  return (
    <div className="app-container">
      <h1>🎯 COCO-SSD Object Detection</h1>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <p>{loadingText}</p>
        </div>
      )}

      <div className="detect-area">
        <div className="video-container">
          <video ref={videoRef} autoPlay muted playsInline />
          <canvas ref={canvasRef} />

          <div className="slider-box">
            <div className="slider-value">{(confidence * 100).toFixed(0)}%</div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              className="vertical-slider"
            />
          </div>
        </div>

        <div className="button-group">
          <button onClick={handleStartVideo}>
            {mode === "video" ? "Stop Video" : "Start Video"}
          </button>
          {isMobile() && mode === "video" && (
            <button onClick={handleSwitchCamera}>Switch Camera</button>
          )}
          <button onClick={handleSelectImage}>Select Image</button>
          <button onClick={handleClear}>Clear</button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleImageUpload}
        />
      </div>
    </div>
  );
}

export default App;

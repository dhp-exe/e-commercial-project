import { useEffect, useRef, useState } from 'react';
import './LoadingScreen.css';

/**
 * Eagerly fetch the loading video at *module evaluation time* so it's fully
 * cached in memory before any component mounts.  We convert it to a blob URL
 * which the <video> element can play instantly — zero network delay.
 */
const videoBlobPromise = fetch('/loading-screen.webm')
  .then((res) => res.blob())
  .then((blob) => URL.createObjectURL(blob))
  .catch(() => '/loading-screen.webm'); // fallback to network URL

/**
 * Full-screen loading overlay that plays loading-screen.webm at 2× speed.
 */
export default function LoadingScreen() {
  const videoRef = useRef(null);
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    videoBlobPromise.then(setBlobUrl);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = 2;
    }
  }, [blobUrl]);

  return (
    <div className="loading-screen">
      <div className="loading-screen__content">
        {blobUrl && (
          <video
            ref={videoRef}
            className="loading-screen__video"
            src={blobUrl}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
          />
        )}
        <span className="loading-screen__text">Loading...</span>
      </div>
    </div>
  );
}
